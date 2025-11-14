import { appState } from "../state/appState.js";
import { db, projectsCol, suppliersCol, workersCol, materialsCol, staffCol, professionsCol, opCatsCol, matCatsCol, otherCatsCol, fundingCreditorsCol, expensesCol, billsCol, incomesCol, fundingSourcesCol, attendanceRecordsCol, stockTransactionsCol, commentsCol, logsCol } from "../config/firebase.js";
import { query, getDocs, where, writeBatch, doc, runTransaction, serverTimestamp, onSnapshot, Timestamp, getDoc, collection, setDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { localDB } from "./localDbService.js";
import { _uploadFileToCloudinary } from "./fileService.js";
import { AUTO_REBASE_TABLES, TEAM_ID } from "../config/constants.js";
import { getJSDate } from "../utils/helpers.js";
import { emit, on } from "../state/eventBus.js";
import { toast } from "../ui/components/toast.js";
import { handleOpenConflictsPanel } from "../utils/sync.js";
import { queueOutbox, takeOutboxBatch, markOutboxDone, markOutboxFailed } from "./outboxService.js";
import { createPendingQuotaLog } from "./logService.js";
import { addItemToListWithAnimation, removeItemFromListWithAnimation, updateItemInListWithAnimation } from "../utils/dom.js";
import { _getBillsListHTML, _getSinglePemasukanHTML } from "../ui/components/cards.js";
import { notify } from '../state/liveQuery.js'; // Import notify

let listenerUnsubscribers = [];
let currentSyncController = null; // Controller untuk operasi sync

async function retryDexieOperation(operation, maxRetries = 1, delay = 100) {
    let retries = 0;
    while (retries <= maxRetries) {
        try {
            return await operation();
        } catch (e) {
            if (e.name === 'DatabaseClosedError' || (e.inner && e.inner.name === 'InvalidStateError')) {

                await new Promise(resolve => setTimeout(resolve, delay));
                try {
                    if (!localDB.isOpen()) {
                        await localDB.open();

                    } else {

                    }
                } catch (openError) {

                    throw openError;
                }
                retries++;
                 if (retries > maxRetries) throw e;
            } else {
                throw e;
            }
        }
    }
}

const WIB_OFFSET_MINUTES = 420; // UTC+7
const QUOTA_RETRY_STORAGE_KEY = 'quotaRetry.lastAttempt';

function isQuotaError(error) {
    if (!error) return false;
    if (error.code === 'resource-exhausted') return true;
    const message = (error.message || error.toString() || '').toLowerCase();
    return message.includes('quota') || message.includes('resource exhausted');
}

function getCurrentWIBDate() {
    const now = new Date();
    const wibMillis = now.getTime() + (now.getTimezoneOffset() + WIB_OFFSET_MINUTES) * 60000;
    return new Date(wibMillis);
}

function attemptQuotaRetryIfEligible() {
    try {
        if (!_isQuotaExceeded()) return false;
        const nowWIB = getCurrentWIBDate();
        if (nowWIB.getHours() < 15) return false;
        const wibDayMarker = new Date(nowWIB.getFullYear(), nowWIB.getMonth(), nowWIB.getDate()).getTime();
        const lastAttempt = parseInt(localStorage.getItem(QUOTA_RETRY_STORAGE_KEY) || '0', 10);
        if (lastAttempt >= wibDayMarker) return false;
        localStorage.setItem(QUOTA_RETRY_STORAGE_KEY, String(wibDayMarker));
        toast('info', 'Mencoba sinkronisasi ulang setelah kuota tersedia kembali.');
        _setQuotaExceededFlag(false);
        requestSync({ silent: true, forceQuotaRetry: true });
        return true;
    } catch (err) {
        console.error('Gagal memeriksa jadwal retry kuota:', err);
        return false;
    }
}

async function handleQuotaExceededForJob(job, error) {
    _setQuotaExceededFlag(true);
    try {
        const existingJob = await localDB.outbox.get(job.id);
        let quotaLogId = existingJob?.quotaLogId || null;
        if (!quotaLogId && job.table !== 'logs') {
            try {
                const logEntry = await createPendingQuotaLog({
                    dataType: job.table,
                    dataId: job.docId,
                    dataPayload: {
                        op: job.op,
                        payload: job.payload
                    }
                });
                quotaLogId = logEntry?.id || null;
            } catch (logErr) {
                console.error('Gagal membuat log pending kuota:', logErr);
            }
        }
        await localDB.outbox.update(job.id, {
            status: 'pending',
            quotaBlocked: 1,
            lastError: error?.message || 'quota_exceeded',
            lastTriedAt: Date.now(),
            ...(quotaLogId ? { quotaLogId } : {})
        });
    } catch (updateErr) {
        console.error('Gagal memperbarui status job setelah quota:', updateErr);
    }
}

async function syncFromServer(options = {}) {
    const { silent = false, signal } = options;
    if (!navigator.onLine) return; // Silent when offline

    if (appState.isSyncing || signal?.aborted) {
        console.log("Sync aborted (already syncing or signal aborted).");
        return;
    }
    appState.isSyncing = true;
    // PERBAIKAN 2: Set silent flag
    if (silent) appState.isSilentSync = true;
    emit('ui.sync.updateIndicator');

    currentSyncController = new AbortController();
    const operationSignal = currentSyncController.signal;

    signal?.addEventListener('abort', () => {
        currentSyncController?.abort();
    });


    const lastSync = getLastSyncTimestamp();


    try {
        const collectionsToSync = {
            projects: projectsCol, suppliers: suppliersCol, workers: workersCol, materials: materialsCol, staff: staffCol,
            professions: professionsCol, operational_categories: opCatsCol, material_categories: matCatsCol, other_categories: otherCatsCol,
            funding_creditors: fundingCreditorsCol, expenses: expensesCol, bills: billsCol, incomes: incomesCol,
            funding_sources: fundingSourcesCol, attendance_records: attendanceRecordsCol, stock_transactions: stockTransactionsCol, comments: commentsCol
        };
        let needsUiRefresh = false;
        try {
            const keys = Object.keys(collectionsToSync);
            appState.syncProgress.active = true; appState.syncProgress.total = keys.length;
            appState.syncProgress.completed = 0; appState.syncProgress.percentage = 0;
            emit('ui.sync.updateIndicator');
        } catch (_) {}
        for (const [tableName, collectionRef] of Object.entries(collectionsToSync)) {

            if (operationSignal.aborted) throw new DOMException('Sync aborted', 'AbortError');


            const q = query(collectionRef, where("updatedAt", ">", lastSync));
            const snapshot = await getDocs(q);


            if (operationSignal.aborted) throw new DOMException('Sync aborted', 'AbortError');


            if (!snapshot.empty) {

                const changes = snapshot.docs.map(doc => ({ type: doc.data().isDeleted === 1 ? 'removed' : 'modified', doc: { id: doc.id, ...doc.data() } }));
                await retryDexieOperation(async () => { await _applyChangesToStateAndUI(changes, tableName, operationSignal); }); // Pass signal
                const transactionalCollections = ['incomes', 'expenses', 'bills', 'attendance_records', 'funding_sources'];
                if (transactionalCollections.includes(tableName)) needsUiRefresh = true;
            }
            try { appState.syncProgress.completed += 1; appState.syncProgress.percentage = Math.round((appState.syncProgress.completed / Math.max(1, appState.syncProgress.total)) * 100); emit('ui.sync.updateIndicator'); } catch(_) {}
        }
        if (needsUiRefresh) {
            emit('ui.page.recalcDashboardTotals');
            const pagesToRefresh = ['dashboard', 'laporan', 'tagihan', 'pemasukan'];
            if (pagesToRefresh.includes(appState.activePage)) {

                emit('ui.page.render');
            }
        }
        setLastSyncTimestamp(); emit('ui.sync.updateIndicator');
        try { appState.syncProgress.active = false; appState.syncProgress.percentage = 100; emit('ui.sync.updateIndicator'); } catch(_) {}
    } catch (e) {

        if (e.name === 'AbortError') {
            console.log('Sync operation cancelled.');
             if (!silent) toast('info', 'Sinkronisasi dibatalkan.');
        }

        else if (e.name === 'DatabaseClosedError') emit('ui.toast', { args: ['error', 'Database lokal error saat sinkronisasi.'] });
        else {
            console.error("Sync from server failed:", e);
             if (!silent) toast('error', 'Gagal sinkronisasi dari server.');
        }
    } finally {

        appState.isSyncing = false;
        currentSyncController = null; // Reset controller
        appState.isSilentSync = false; // PERBAIKAN 2: Reset silent flag
        emit('ui.sync.updateIndicator');

    }
}

async function _applyChangesToStateAndUI(changes, collectionName, signal) {
    const stateKeyMap = { 
        'funding_creditors': 'fundingCreditors', 
        'operational_categories': 'operationalCategories', 
        'material_categories': 'materialCategories', 
        'other_categories': 'otherCategories', 
        'funding_sources': 'fundingSources', 
        'attendance_records': 'attendanceRecords', 
        'stock_transactions': 'stockTransactions' 
    };
    
    const stateKey = stateKeyMap[collectionName] || collectionName;

    if (!appState[stateKey]) {
        console.warn(`[SyncService] stateKey tidak ditemukan di appState: ${stateKey} (dari collection: ${collectionName})`);
        return;
    }

     const operation = async () => {
        let stateChanged = false; 
        const localTable = localDB[collectionName];
        if (!localTable) {
            console.warn(`[SyncService] Tabel Dexie tidak ditemukan: ${collectionName}`);
            return;
        }

        await localDB.transaction('rw', localTable, async () => {
            for (const change of changes) {
                if (signal?.aborted) throw new DOMException('Operation aborted', 'AbortError');

                const incomingData = change.doc; 
                if (!incomingData?.id) continue; 

                const incomingServerRev = (incomingData.rev || incomingData.serverRev) || 0;
                const isMarkedAsDeleted = incomingData.isDeleted === 1;


                if (isMarkedAsDeleted || change.type === "removed") {
                    
                    const index = appState[stateKey].findIndex(item => item.id === incomingData.id);
                    if (index > -1) {
                        appState[stateKey].splice(index, 1);
                        stateChanged = true;
                    }

                    if (isMarkedAsDeleted) {
                        const existingLocal = await localTable.get(incomingData.id); 
                        await localTable.put({ ...(existingLocal || {}), ...incomingData, serverRev: incomingServerRev, syncState: 'synced' });
                    } else {
                        await localTable.delete(incomingData.id); 
                    }
                
                } else {
                    
                    const existingItemInDB = await localTable.get(incomingData.id);

                    if (existingItemInDB?.syncState?.startsWith('pending_')) {
                        const localBaseRev = existingItemInDB.serverRev || 0;
                        if (incomingServerRev > localBaseRev) {
                            console.warn(`[SyncService] KONFLIK terdeteksi untuk ${collectionName}:${incomingData.id}. Perubahan lokal 'pending' (base rev ${localBaseRev}) bertentangan dengan server rev ${incomingServerRev}.`);
                            const conflictData = {
                                ...existingItemInDB,
                                serverConflictData: incomingData,
                                syncState: 'conflict'
                            };
                            await localTable.put(conflictData);

                            try {
                                await localDB.pending_conflicts.put({
                                    table: collectionName,
                                    docId: incomingData.id,
                                    detectedAt: new Date()
                                });
                                emit('ui.conflict.detected', { table: collectionName, docId: incomingData.id });
                            } catch (e) {
                                console.error('Gagal mencatat konflik:', e);
                            }

                            stateChanged = true;
                            continue; 
                        
                        } else {
                            console.log(`[SyncService] Menerima data server (rev ${incomingServerRev}) tapi data lokal 'pending' (base rev ${localBaseRev}). 'syncToServer' akan menangani.`);
                            continue;
                        }
                    }

                    const mergedData = { ...(existingItemInDB || {}), ...incomingData, serverRev: incomingServerRev, syncState: 'synced' };

                    if (collectionName === 'comments') {
                        try {
                            const idxById = appState.comments.findIndex(c => c.id === mergedData.id);
                            if (idxById > -1) {
                                await localTable.put(mergedData);
                                appState.comments[idxById] = { ...appState.comments[idxById], ...mergedData };
                                stateChanged = true;
                                try { emit('ui.comment.upsert', { commentData: mergedData, changeType: 'modified' }); } catch(_) {}
                                continue; 
                            }
                            if (mergedData.clientMsgId) {
                                const idxByClient = appState.comments.findIndex(c => c.clientMsgId === mergedData.clientMsgId);
                                if (idxByClient > -1) {
                                    await localTable.put(mergedData);
                                    appState.comments[idxByClient] = { ...appState.comments[idxByClient], ...mergedData };
                                    stateChanged = true;
                                    try { emit('ui.comment.upsert', { commentData: mergedData, changeType: 'modified' }); } catch(_) {}
                                    continue; 
                                }
                            }
                        } catch (_) {}
                    }
                    
                    await localTable.put(mergedData);
                    
                    const index = appState[stateKey].findIndex(item => item.id === incomingData.id);
                    if (index > -1) {
                        appState[stateKey][index] = mergedData; 
                    } else {
                        appState[stateKey].unshift(mergedData); 
                    }
                    stateChanged = true;
                    if (collectionName === 'comments') { 
                        try { emit('ui.comment.upsert', { commentData: mergedData, changeType: change.type || 'modified' }); } catch(_) {} 
                    }
                }
            }
        });

        if (stateChanged) {
            console.log(`[SyncService] State changed for key '${stateKey}', notifying liveQuery.`);
            notify(stateKey);
        } else {
            console.log(`[SyncService] No state change detected for key '${stateKey}', skipping notify.`);
        }
     }; 
     
     await retryDexieOperation(operation);
}

function currentPageMatchesContext(currentPage, collectionName, data) {
    if (currentPage === 'tagihan') { const activeTab = appState.activeSubPage.get('tagihan') || 'tagihan'; if (collectionName === 'bills') { const billStatus = data.status || 'unpaid'; if (activeTab === 'tagihan' && billStatus === 'unpaid') return true; if (activeTab === 'lunas' && billStatus === 'paid') return true; } if (collectionName === 'expenses' && activeTab === 'surat_jalan' && data.status === 'delivery_order') return true; }
    if (currentPage === 'pemasukan') { const activeTab = appState.activeSubPage.get('pemasukan') || 'termin'; if (collectionName === 'incomes' && activeTab === 'termin') return true; if (collectionName === 'funding_sources' && activeTab === 'pinjaman') return true; }
    if (currentPage === 'recycle_bin') return data.isDeleted === 1;
    return false;
}

async function syncToServer(options = {}) {
    const { silent = false, signal, forceQuotaRetry = false } = options;
    if (!navigator.onLine) { _scheduleSyncOnReconnect(); return; }
    if (appState.isSyncing) {
        console.log('Sync already in progress.');
        return;
    }
    if (!forceQuotaRetry && _isQuotaExceeded()) {
        console.error('Kuota server habis. Sinkronisasi ditunda.');
        if (!silent) toast('info', 'Sinkronisasi ditunda sampai kuota server tersedia.');
        return;
    }
     if (signal?.aborted) {
        console.log('SyncToServer aborted before starting.');
        return;
    }

    appState.isSyncing = true;
    // PERBAIKAN 2: Set silent flag
    if (silent) appState.isSilentSync = true;
    emit('ui.sync.updateIndicator');
    _lastSyncAt = Date.now();
    const progress = appState.syncProgress;
    progress.completed = 0;
    progress.total = 0;
    progress.currentAction = 'Menghitung item lokal...';
    emit('ui.sync.updateIndicator');


    const localController = new AbortController();
    const operationSignal = localController.signal;
    signal?.addEventListener('abort', () => localController.abort());



    try {
        const outboxCount = await localDB.outbox.count();
        const pendingPaymentCount = await localDB.pending_payments.count();
        progress.total = outboxCount + pendingPaymentCount;

        if (progress.total === 0) { throw new DOMException('No data to sync', 'NoDataError'); }
        progress.active = true;
        emit('ui.sync.updateIndicator');

        const pendingPayments = await localDB.pending_payments.toArray();
        if (pendingPayments.length > 0) {
            progress.currentAction = `Sinkron ${pendingPayments.length} pembayaran...`;
            emit('ui.sync.updateIndicator');
            for (const payment of pendingPayments) {
                if (operationSignal.aborted) throw new DOMException('Sync aborted', 'AbortError');
                try {
                    const targetRef = payment.paymentType === 'loan' ? doc(fundingSourcesCol, payment.billId) : doc(billsCol, payment.billId); // Adjust based on payment type
                    const paymentRef = payment.paymentId
                        ? doc(collection(targetRef, 'payments'), payment.paymentId)
                        : doc(collection(targetRef, 'payments'));
                    let attachmentUrl = null;
                    if (payment.localAttachmentId) {
                        const fileRecord = await localDB.files.get(payment.localAttachmentId);
                        if (fileRecord?.file) {
                            attachmentUrl = await _uploadFileToCloudinary(fileRecord.file, { signal: operationSignal });
                            if (attachmentUrl) await localDB.files.delete(payment.localAttachmentId);
                            else throw new Error('Attachment upload failed or aborted');
                        }
                    }
                     if (operationSignal.aborted) throw new DOMException('Sync aborted', 'AbortError');
                    const paymentData = {
                        amount: payment.amount,
                        date: Timestamp.fromDate(payment.date),
                        createdAt: Timestamp.fromDate(payment.createdAt),
                        ...(payment.workerId && { workerId: payment.workerId }),
                        ...(payment.workerName && { workerName: payment.workerName }),
                        ...(attachmentUrl && { attachmentUrl: attachmentUrl }),
                    };
                    await setDoc(paymentRef, paymentData); // Consider using transaction if needed with targetRef update
                    await localDB.pending_payments.delete(payment.id);
                    progress.completed++;
                    emit('ui.sync.updateIndicator');
                } catch (e) {
                    if (e.name === 'AbortError') throw e; // Propagate abort
                    console.error(`Gagal mengirim pembayaran tertunda (ID: ${payment.id}):`, e);
                     if (e.message.includes('Attachment upload failed')) {
                     }
                }
            }
        }


        let batch;
        while ((batch = await takeOutboxBatch(50)).length > 0) {
             if (operationSignal.aborted) throw new DOMException('Sync aborted', 'AbortError');
             progress.currentAction = `Sinkron ${batch.length} item data...`;
             emit('ui.sync.updateIndicator');

            const latestByKey = new Map();
            for (const item of batch) { latestByKey.set(`${item.table}:${item.docId}`, item); }

            for (const [, job] of latestByKey) {
                 if (operationSignal.aborted) throw new DOMException('Sync aborted', 'AbortError');
                try {
                    const mapRef = { comments: commentsCol, expenses: expensesCol, bills: billsCol, attendance_records: attendanceRecordsCol, incomes: incomesCol, funding_sources: fundingSourcesCol, projects: projectsCol, suppliers: suppliersCol, workers: workersCol, materials: materialsCol, staff: staffCol, professions: professionsCol, operational_categories: opCatsCol, material_categories: matCatsCol, other_categories: otherCatsCol, funding_creditors: fundingCreditorsCol, logs: logsCol };
                    const targetCol = mapRef[job.table];
                    if (!targetCol) { await markOutboxFailed(job.id); continue; }
                    const ref = doc(targetCol, job.docId);

                    if (job.payload && Array.isArray(job.payload.attachmentsLocalIds) && job.payload.attachmentsLocalIds.length > 0) {
                        const toUpload = [...job.payload.attachmentsLocalIds];
                        const uploadedUrls = [];
                        for (const localId of toUpload) {
                             if (operationSignal.aborted) throw new DOMException('Sync aborted', 'AbortError');
                            const fileRecord = await localDB.files.get(localId);
                            if (!fileRecord?.file) continue;
                            const url = await _uploadFileToCloudinary(fileRecord.file, { signal: operationSignal });
                            if (url) {
                                uploadedUrls.push({ url, name: fileRecord.file.name || 'Lampiran', size: fileRecord.file.size || 0 });
                                await localDB.files.delete(localId);
                            } else {
                                throw new Error('Attachment upload failed or aborted during outbox sync');
                            }
                        }
                        const existingServerUrls = Array.isArray(job.payload.attachments) ? job.payload.attachments : [];
                        job.payload.attachments = [...existingServerUrls, ...uploadedUrls]; // Combine existing and new
                        delete job.payload.attachmentsLocalIds; // Remove local IDs from payload
                    }


                    if (job.op === 'delete') {
                        const fbBatch = writeBatch(db); fbBatch.delete(ref); await fbBatch.commit();
                        try { await localDB[job.table]?.delete(job.docId); } catch (_) {}
                    } else { // upsert
                        await runTransaction(db, async (tx) => {
                             if (operationSignal.aborted) throw new DOMException('Sync aborted', 'AbortError');
                            const snap = await tx.get(ref);
                            const serverRev = snap.exists() ? (snap.data().rev || 0) : 0;
                            const nextRev = serverRev + 1;
                            const payload = { ...job.payload };
                            for (const k in payload) if (payload[k] === undefined || payload[k] === null) delete payload[k]; // Firestore doesn't like undefined
                            if (payload.createdAt instanceof Date) payload.createdAt = Timestamp.fromDate(payload.createdAt);
                            if (payload.updatedAt instanceof Date) payload.updatedAt = Timestamp.fromDate(payload.updatedAt);
                            if (payload.date instanceof Date) payload.date = Timestamp.fromDate(payload.date);
                            if (payload.dueDate instanceof Date) payload.dueDate = Timestamp.fromDate(payload.dueDate);
                            if (payload.paidAt instanceof Date) payload.paidAt = Timestamp.fromDate(payload.paidAt);

                            delete payload.syncState; // Remove Dexie-specific field
                            delete payload.serverRev; // Remove Dexie-specific field

                            tx.set(ref, { ...payload, rev: nextRev, updatedAt: serverTimestamp() }, { merge: true });

                             await retryDexieOperation(async () => {
                                 try { await localDB[job.table]?.update(job.docId, { syncState: 'synced', serverRev: nextRev, updatedAt: new Date() }); } catch (_) {}
                             });
                        });
                    }
                    await markOutboxDone(job.id);
                    progress.completed++;
                    emit('ui.sync.updateIndicator');
                } catch (e) {
                    if (e.name === 'AbortError') throw e; // Propagate abort
                    if (isQuotaError(e)) {
                        await handleQuotaExceededForJob(job, e);
                        e.__quotaExceeded = true;
                        throw e;
                    }
                    console.error('Outbox job failed:', job, e);
                    await markOutboxFailed(job.id);
                    if (e.code === 'aborted' || (e.message && e.message.toLowerCase().includes('contention'))) {
                        console.warn(`Transaction contention for ${job.table}:${job.docId}. Will likely retry.`);
                    } else if ((e.message || '').includes('Attachment upload failed')) {
                        console.warn(`Attachment upload failed for outbox job ${job.id}. Will retry later.`);
                        await markOutboxFailed(job.id);
                    }
                }
            }
        }
        _setQuotaExceededFlag(false); // Reset quota flag on successful sync
         if (!silent) toast('success', 'Sinkronisasi selesai.');

    } catch (error) {
        if (error.name === 'AbortError') {
             console.log('Sync to server operation cancelled.');
             if (!silent) toast('info', 'Sinkronisasi dibatalkan.');
        } else if (error.name === 'NoDataError') {
        } else {
            console.error('Error during sync to server:', error);
            if (error.code === 'resource-exhausted' || error.__quotaExceeded || isQuotaError(error)) {
                 _setQuotaExceededFlag(true);
                  if (!silent) toast('error', 'Kuota server habis. Sinkronisasi ditunda.');
            } else if (error.name === 'DatabaseClosedError') {
                 if (!silent) emit('ui.toast', { args: ['error', 'Database lokal error saat sinkronisasi.'] });
            } else {
                 if (!silent) { /* reduce snackbar noise for background sync */ }
            }
        }
    } finally {
        appState.isSyncing = false;
        appState.isSilentSync = false; // PERBAIKAN 2: Reset silent flag
        appState.syncProgress.active = false;
        appState.syncProgress.currentAction = '';
        emit('ui.sync.updateIndicator');
        if (_syncAgain) {
            _syncAgain = false;
            setTimeout(() => requestSync({ silent: true }), MIN_SYNC_INTERVAL);
        }

    }
}


async function updateSyncIndicator() { emit('ui.sync.updateIndicator'); }

function cleanupListeners() {
    listenerUnsubscribers.forEach(unsub => { try { unsub(); } catch(_) {} });
    listenerUnsubscribers = [];
}

function subscribeToAllRealtimeData() {

    cleanupListeners(); // Hapus listener lama sebelum membuat yang baru

    const collectionsToListen = {
        projects: projectsCol, suppliers: suppliersCol, workers: workersCol, materials: materialsCol, staff: staffCol,
        professions: professionsCol, operational_categories: opCatsCol, material_categories: matCatsCol, other_categories: otherCatsCol,
        funding_creditors: fundingCreditorsCol, expenses: expensesCol, bills: billsCol, incomes: incomesCol,
        funding_sources: fundingSourcesCol, attendance_records: attendanceRecordsCol, stock_transactions: stockTransactionsCol, comments: commentsCol
    };
    for (const [key, collectionRef] of Object.entries(collectionsToListen)) {
        let q; if (key === 'comments' && appState._commentsScope?.parentId) q = query(collectionRef, where('parentId', '==', appState._commentsScope.parentId)); else q = query(collectionRef);
        const unsubscribe = onSnapshot(q, async (snapshot) => {
            if (snapshot.metadata.hasPendingWrites) return; const changes = snapshot.docChanges(); if (changes.length > 0) await _processRealtimeChanges(changes, key);
        }, (error) => {
            console.error(`Gagal mendengarkan koleksi '${key}':`, error);
            if (error.code === 'permission-denied' && key !== 'members') console.warn(`Permission denied for ${key}. Listener dinonaktifkan.`);
            else if (error.code === 'unauthenticated' || error.code === 'permission-denied') console.error("Autentikasi gagal atau izin ditolak.");
        });
        listenerUnsubscribers.push(unsubscribe); // Simpan fungsi unsubscribe
        appState.activeListeners.set(key, unsubscribe);
    }
}

async function _processRealtimeChanges(changes, tableName) {
    try { const mapped = changes.map(ch => ({ type: ch.type === 'removed' ? 'removed' : 'modified', doc: { id: ch.doc.id, ...ch.doc.data() } })); await retryDexieOperation(async () => { await _applyChangesToStateAndUI(mapped, tableName); }); emit('ui.sync.updateIndicator'); }
    catch (e) { console.error('Gagal memproses perubahan realtime:', e); if (e.name === 'DatabaseClosedError') emit('ui.toast', { args: ['error', 'Database lokal error saat menerima update.'] }); }
}

function getLastSyncTimestamp() { const stored = localStorage.getItem('lastSyncTimestamp'); return stored ? new Date(parseInt(stored)) : new Date(0); }
function setLastSyncTimestamp() { localStorage.setItem('lastSyncTimestamp', Date.now().toString()); }
function _isQuotaExceeded() { try { return localStorage.getItem('firestoreQuotaExceeded') === 'true'; } catch (e) { return false; } }
function _setQuotaExceededFlag(isExceeded) { try { if (isExceeded) { console.warn("KUOTA FIRESTORE HABIS."); localStorage.setItem('firestoreQuotaExceeded', 'true'); } else { console.log("Mereset flag kuota."); localStorage.removeItem('firestoreQuotaExceeded'); } } catch (e) { console.error("Gagal set flag kuota.", e); } }

function _initQuotaResetScheduler() {
    const CHECK_INTERVAL = 30 * 60 * 1000;
    const runCheck = () => { attemptQuotaRetryIfEligible(); };
    runCheck();
    setInterval(runCheck, CHECK_INTERVAL);
}

async function _forceRefreshDataFromServer() { if (!navigator.onLine) { toast('info', 'Anda offline.'); return; } try { await syncFromServer({ silent: true }); subscribeToAllRealtimeData(); } catch(err) { toast('error', 'Gagal memuat ulang data.'); console.error("Force refresh failed:", err); } }

function _setActiveListeners(pageSpecificListeners = []) {
    const collectionRefs = { 'bills': billsCol, 'expenses': expensesCol, 'incomes': incomesCol, 'attendance_records': attendanceRecordsCol, 'comments': commentsCol };
    const globalListeners = new Set(['comments']); const required = new Set([...globalListeners, ...pageSpecificListeners]); const currentActive = new Set(appState.activeListeners.keys());
    currentActive.forEach(name => { if (!required.has(name)) { const unsub = appState.activeListeners.get(name); if (typeof unsub === 'function') { try { unsub(); } catch (_) {} } appState.activeListeners.delete(name); console.log(`- Listener '${name}' dinonaktifkan.`); } });
    required.forEach(name => { if (!currentActive.has(name)) { const colRef = collectionRefs[name]; if (colRef) { let q; if (name === 'comments' && appState._commentsScope?.parentId) q = query(colRef, where('parentId', '==', appState._commentsScope.parentId)); else q = query(colRef); const unsub = onSnapshot(q, (snap) => { if (snap.empty && snap.metadata.fromCache) return; _processRealtimeChanges(snap.docChanges(), name); }, (err) => { console.error(`Gagal ${name}:`, err); if (err.code === 'permission-denied' && name !== 'members') { console.warn(`Denied ${name}. Off.`); const u = appState.activeListeners.get(name); if (u) u(); appState.activeListeners.delete(name); } else if (err.code === 'unauthenticated' || err.code === 'permission-denied') console.error("Auth gagal."); }); appState.activeListeners.set(name, unsub); listenerUnsubscribers.push(unsub); console.log(`+ Listener '${name}' diaktifkan.`); } } });
}

export { syncFromServer, syncToServer, updateSyncIndicator, subscribeToAllRealtimeData, _applyChangesToStateAndUI, getLastSyncTimestamp, setLastSyncTimestamp, _isQuotaExceeded, _setQuotaExceededFlag, _initQuotaResetScheduler, _forceRefreshDataFromServer, _setActiveListeners, requestSync };

async function _autoRebaseOnConflict(tableName, docRef, localData) {
    return await runTransaction(db, async (tx) => {
        const snap = await tx.get(docRef); const server = snap.exists() ? snap.data() : {}; const currentRev = server.rev || 0; const nextRev = currentRev + 1; const merged = { ...server, ...localData };
        if (tableName === 'bills') { if (typeof server.paidAmount === 'number') merged.paidAmount = server.paidAmount; if (server.status === 'paid') merged.status = 'paid'; }
        if (tableName === 'incomes' || tableName === 'funding_sources') { if (typeof server.paidAmount === 'number') merged.paidAmount = server.paidAmount; }
        if (tableName === 'expenses') { if (server.isDeleted === 1) merged.isDeleted = 1; }
        delete merged.syncState; delete merged.localAttachmentId; delete merged.attachmentNeedsSync;
        tx.set(docRef, { ...merged, rev: nextRev, updatedAt: serverTimestamp() }, { merge: true });
        try { await retryDexieOperation(async () => { const table = localDB[tableName]; if (table) await table.update(localData.id, { syncState: 'synced', serverRev: nextRev, updatedAt: new Date() }); }); } catch (_) {}
        return true;
    });
}

let _syncScheduled = false; let _syncAgain = false; let _lastSyncAt = 0; const MIN_SYNC_INTERVAL = 1000; let _reconnectScheduled = false;
async function requestSync(options = {}) {
    // PERBAIKAN 2: Set silent flag di appState
    if (options.silent) appState.isSilentSync = true;
    
    if (!navigator.onLine) { _scheduleSyncOnReconnect(); return; }
    if (appState.isSyncing) { _syncAgain = true; return; } const elapsed = Date.now() - _lastSyncAt;
    if (elapsed < MIN_SYNC_INTERVAL) { if (!_syncScheduled) { _syncScheduled = true; setTimeout(async () => { _syncScheduled = false; await syncToServer({ ...options, silent: true }); }, MIN_SYNC_INTERVAL - elapsed); } return; }

    return syncToServer({ ...options, signal: options.signal, forceQuotaRetry: options.forceQuotaRetry === true });

}

function _scheduleSyncOnReconnect() {
    if (_reconnectScheduled) return;
    _reconnectScheduled = true;
    const onOnline = async () => {
        try { await syncToServer({ silent: true }); } finally {
            _reconnectScheduled = false;
            window.removeEventListener('online', onOnline);
        }
    };
    window.addEventListener('online', onOnline, { once: true });
}

export function setCommentsScope(parentId, parentType = null) {
    try {
        appState._commentsScope = parentId ? { parentId, parentType } : null;
        const old = appState.activeListeners.get('comments'); if (old && typeof old === 'function') { try { old(); } catch (_) {} }
        let q; if (appState._commentsScope?.parentId) q = query(commentsCol, where('parentId', '==', appState._commentsScope.parentId)); else q = query(commentsCol);
        const unsubscribe = onSnapshot(q, (snap) => { if (snap.empty && snap.metadata.fromCache) return; _processRealtimeChanges(snap.docChanges(), 'comments'); }, (err) => console.error('Gagal comments (scoped):', err));
        appState.activeListeners.set('comments', unsubscribe); listenerUnsubscribers.push(unsubscribe);
    } catch (e) { console.error('setCommentsScope error:', e); }
}

try {
    on('sync.forceRefresh', () => { try { _forceRefreshDataFromServer(); } catch (_) {} });
    on('sync.setActiveListeners', ({ pageSpecificListeners } = {}) => { try { _setActiveListeners(pageSpecificListeners || []); } catch (_) {} });
    on('app.unload', cleanupListeners);
} catch (_) {}
