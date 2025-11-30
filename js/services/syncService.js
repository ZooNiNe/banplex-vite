import { appState } from "../state/appState.js";
import { 
    db, projectsCol, suppliersCol, workersCol, materialsCol, staffCol, 
    professionsCol, opCatsCol, matCatsCol, otherCatsCol, fundingCreditorsCol, 
    expensesCol, billsCol, incomesCol, fundingSourcesCol, attendanceRecordsCol, 
    stockTransactionsCol, commentsCol, logsCol 
} from "../config/firebase.js";
import { 
    query, getDocs, where, writeBatch, doc, runTransaction, 
    serverTimestamp, onSnapshot, Timestamp, collection, setDoc 
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { localDB } from "./localDbService.js";
import { _uploadFileToCloudinary } from "./fileService.js";
import { toast } from "../ui/components/toast.js";
import { queueOutbox, takeOutboxBatch, markOutboxDone, markOutboxFailed } from "./outboxService.js";
import { createPendingQuotaLog } from "./logService.js";
import { emit, on } from "../state/eventBus.js";
import { notify } from '../state/liveQuery.js'; 

let listenerUnsubscribers = [];
let currentSyncController = null; 

const WIB_OFFSET_MINUTES = 420; // UTC+7
const QUOTA_RETRY_STORAGE_KEY = 'quotaRetry.lastAttempt';
const QUEUE_MODAL_COOLDOWN = 10000;
const MIN_SYNC_INTERVAL = 1000;
const PENDING_TABLES = ['expenses', 'bills', 'incomes', 'funding_sources', 'attendance_records', 'stock_transactions', 'comments'];

let quotaNotified = false;
let _lastQueueModalAt = 0;
let _syncScheduled = false; 
let _syncAgain = false; 
let _lastSyncAt = 0; 
let _reconnectScheduled = false;

// --- UTILITIES ---

async function retryDexieOperation(operation, maxRetries = 1, delay = 100) {
    let retries = 0;
    while (retries <= maxRetries) {
        try {
            return await operation();
        } catch (e) {
            if (e.name === 'DatabaseClosedError' || (e.inner && e.inner.name === 'InvalidStateError')) {
                await new Promise(resolve => setTimeout(resolve, delay));
                try {
                    if (!localDB.isOpen()) await localDB.open();
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

function _formatCount(n = 0) {
    try {
        return Number(n || 0).toLocaleString('id-ID');
    } catch (_) {
        return String(n || 0);
    }
}

function getLastSyncTimestamp() { 
    const stored = localStorage.getItem('lastSyncTimestamp'); 
    return stored ? new Date(parseInt(stored)) : new Date(0); 
}

function setLastSyncTimestamp() { 
    localStorage.setItem('lastSyncTimestamp', Date.now().toString()); 
}

function _isQuotaExceeded() { 
    try { return localStorage.getItem('firestoreQuotaExceeded') === 'true'; } catch (e) { return false; } 
}

function _setQuotaExceededFlag(isExceeded) { 
    try { 
        if (isExceeded) { 
            console.warn("KUOTA FIRESTORE HABIS."); 
            localStorage.setItem('firestoreQuotaExceeded', 'true'); 
        } else { 
            // console.log("Mereset flag kuota."); 
            localStorage.removeItem('firestoreQuotaExceeded'); 
        } 
    } catch (e) { console.error("Gagal set flag kuota.", e); } 
}

// --- QUOTA MANAGEMENT ---

function attemptQuotaRetryIfEligible() {
    try {
        if (!_isQuotaExceeded()) return false;
        const nowWIB = getCurrentWIBDate();
        // Reset kuota Firestore biasanya jam 15:00 WIB (Midnight Pacific Time)
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

function _initQuotaResetScheduler() {
    const CHECK_INTERVAL = 30 * 60 * 1000; // 30 Menit
    const runCheck = () => { attemptQuotaRetryIfEligible(); };
    runCheck();
    setInterval(runCheck, CHECK_INTERVAL);
}

// --- SYNC FROM SERVER (INBOX) ---

async function syncFromServer(options = {}) {
    const { silent = false, signal } = options;
    if (!navigator.onLine) return; 

    if (appState.isSyncing || signal?.aborted) {
        console.log("Sync aborted (already syncing or signal aborted).");
        return;
    }

    appState.isSyncing = true;
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
            projects: projectsCol, suppliers: suppliersCol, workers: workersCol, materials: materialsCol, 
            staff: staffCol, professions: professionsCol, operational_categories: opCatsCol, 
            material_categories: matCatsCol, other_categories: otherCatsCol, funding_creditors: fundingCreditorsCol, 
            expenses: expensesCol, bills: billsCol, incomes: incomesCol, funding_sources: fundingSourcesCol, 
            attendance_records: attendanceRecordsCol, stock_transactions: stockTransactionsCol, comments: commentsCol
        };

        let needsUiRefresh = false;
        
        try {
            const keys = Object.keys(collectionsToSync);
            appState.syncProgress.active = true; 
            appState.syncProgress.total = keys.length;
            appState.syncProgress.completed = 0; 
            appState.syncProgress.percentage = 0;
            emit('ui.sync.updateIndicator');
        } catch (_) {}

        for (const [tableName, collectionRef] of Object.entries(collectionsToSync)) {
            if (operationSignal.aborted) throw new DOMException('Sync aborted', 'AbortError');

            // Delta Sync: Hanya ambil data yang berubah sejak lastSync
            const q = query(collectionRef, where("updatedAt", ">", lastSync));
            const snapshot = await getDocs(q);

            if (operationSignal.aborted) throw new DOMException('Sync aborted', 'AbortError');

            if (!snapshot.empty) {
                const changes = snapshot.docs.map(doc => ({ 
                    type: doc.data().isDeleted === 1 ? 'removed' : 'modified', 
                    doc: { id: doc.id, ...doc.data() } 
                }));
                
                await retryDexieOperation(async () => { 
                    await _applyChangesToStateAndUI(changes, tableName, operationSignal); 
                });

                const transactionalCollections = ['incomes', 'expenses', 'bills', 'attendance_records', 'funding_sources'];
                if (transactionalCollections.includes(tableName)) needsUiRefresh = true;
            }

            try { 
                appState.syncProgress.completed += 1; 
                appState.syncProgress.percentage = Math.round((appState.syncProgress.completed / Math.max(1, appState.syncProgress.total)) * 100); 
                emit('ui.sync.updateIndicator'); 
            } catch(_) {}
        }

        if (needsUiRefresh) {
            emit('ui.page.recalcDashboardTotals');
            const pagesToRefresh = ['dashboard', 'laporan', 'tagihan', 'pemasukan'];
            if (pagesToRefresh.includes(appState.activePage)) {
                emit('ui.page.render');
            }
        }

        setLastSyncTimestamp(); // Update waktu sync hanya jika sukses
        emit('ui.sync.updateIndicator');
        
        try { 
            appState.syncProgress.active = false; 
            appState.syncProgress.percentage = 100; 
            emit('ui.sync.updateIndicator'); 
        } catch(_) {}

    } catch (e) {
        if (e.name === 'AbortError') {
            console.log('Sync operation cancelled.');
            if (!silent) toast('info', 'Sinkronisasi dibatalkan.');
        } else if (e.name === 'DatabaseClosedError') {
            emit('ui.toast', { args: ['error', 'Database lokal error saat sinkronisasi.'] });
        } else {
            console.error("Sync from server failed:", e);
            if (!silent) toast('error', 'Gagal sinkronisasi dari server.');
        }
    } finally {
        appState.isSyncing = false;
        currentSyncController = null;
        appState.isSilentSync = false;
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
        // console.warn(`[SyncService] stateKey tidak ditemukan di appState: ${stateKey}`);
        return;
    }

    const operation = async () => {
        let stateChanged = false; 
        const localTable = localDB[collectionName];
        if (!localTable) return;

        await localDB.transaction('rw', localTable, async () => {
            for (const change of changes) {
                if (signal?.aborted) throw new DOMException('Operation aborted', 'AbortError');

                const incomingData = change.doc; 
                if (!incomingData?.id) continue; 

                const incomingServerRev = (incomingData.rev || incomingData.serverRev) || 0;
                const isMarkedAsDeleted = incomingData.isDeleted === 1;

                if (isMarkedAsDeleted || change.type === "removed") {
                    // Update State In-Memory
                    const index = appState[stateKey].findIndex(item => item.id === incomingData.id);
                    if (index > -1) {
                        appState[stateKey].splice(index, 1);
                        stateChanged = true;
                    }

                    // Update IndexedDB
                    if (isMarkedAsDeleted) {
                        const existingLocal = await localTable.get(incomingData.id); 
                        await localTable.put({ ...(existingLocal || {}), ...incomingData, serverRev: incomingServerRev, syncState: 'synced' });
                    } else {
                        await localTable.delete(incomingData.id); 
                    }
                
                } else {
                    // CONFLICT HANDLING
                    const existingItemInDB = await localTable.get(incomingData.id);

                    if (existingItemInDB?.syncState?.startsWith('pending_')) {
                        const localBaseRev = existingItemInDB.serverRev || 0;
                        if (incomingServerRev > localBaseRev) {
                            console.warn(`[SyncService] KONFLIK: ${collectionName}:${incomingData.id}. Server Rev ${incomingServerRev} > Local Base ${localBaseRev}.`);
                            
                            // Simpan data server sebagai konflik, jangan overwrite pending change user
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
                            } catch (e) { console.error('Gagal mencatat konflik:', e); }

                            stateChanged = true;
                            continue; // Skip merging
                        } else {
                            // Local change lebih baru (secara logic user), biarkan 'syncToServer' menanganinya
                            continue;
                        }
                    }

                    // MERGE & UPDATE
                    const mergedData = { ...(existingItemInDB || {}), ...incomingData, serverRev: incomingServerRev, syncState: 'synced' };

                    // Khusus Comments (Nested structure sometimes)
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
                        } catch (_) {}
                    }
                    
                    await localTable.put(mergedData);
                    
                    // Update State In-Memory
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
            notify(stateKey); // Trigger LiveQuery Updates
        }
    }; 
     
    await retryDexieOperation(operation);
}

// --- SYNC TO SERVER (OUTBOX) ---

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
    
    if (signal?.aborted) return;

    appState.isSyncing = true;
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

        // 1. Process Pending Payments (Prioritas)
        const pendingPayments = await localDB.pending_payments.toArray();
        if (pendingPayments.length > 0) {
            progress.currentAction = `Sinkron ${pendingPayments.length} pembayaran...`;
            emit('ui.sync.updateIndicator');
            
            for (const payment of pendingPayments) {
                if (operationSignal.aborted) throw new DOMException('Sync aborted', 'AbortError');
                try {
                    const targetRef = payment.paymentType === 'loan' ? doc(fundingSourcesCol, payment.billId) : doc(billsCol, payment.billId);
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
                        ...(payment.recipientName && { recipientName: payment.recipientName }), // Penting untuk Mutasi
                        ...(payment.creditorName && { creditorName: payment.creditorName }), // Penting untuk Mutasi
                        ...(payment.description && { description: payment.description }), 
                        ...(attachmentUrl && { attachmentUrl: attachmentUrl }),
                    };
                    
                    await setDoc(paymentRef, paymentData); 
                    await localDB.pending_payments.delete(payment.id);
                    progress.completed++;
                    emit('ui.sync.updateIndicator');
                } catch (e) {
                    if (e.name === 'AbortError') throw e; 
                    console.error(`Gagal mengirim pembayaran tertunda (ID: ${payment.id}):`, e);
                }
            }
        }

        // 2. Process General Outbox
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

                    // Handle Attachment Uploads First
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
                        job.payload.attachments = [...existingServerUrls, ...uploadedUrls];
                        delete job.payload.attachmentsLocalIds; 
                    }

                    // Perform Firestore Write
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
                            
                            // Cleanup Payload
                            for (const k in payload) if (payload[k] === undefined || payload[k] === null) delete payload[k];
                            if (payload.createdAt instanceof Date) payload.createdAt = Timestamp.fromDate(payload.createdAt);
                            if (payload.updatedAt instanceof Date) payload.updatedAt = Timestamp.fromDate(payload.updatedAt);
                            if (payload.date instanceof Date) payload.date = Timestamp.fromDate(payload.date);
                            if (payload.dueDate instanceof Date) payload.dueDate = Timestamp.fromDate(payload.dueDate);
                            if (payload.paidAt instanceof Date) payload.paidAt = Timestamp.fromDate(payload.paidAt);

                            delete payload.syncState;
                            delete payload.serverRev;

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
                    if (e.name === 'AbortError') throw e;
                    
                    if (isQuotaError(e)) {
                        await handleQuotaExceededForJob(job, e);
                        e.__quotaExceeded = true;
                        throw e;
                    }
                    
                    console.error('Outbox job failed:', job, e);
                    await markOutboxFailed(job.id);
                    
                    if ((e.message || '').includes('Attachment upload failed')) {
                        console.warn(`Attachment upload failed for outbox job ${job.id}. Will retry later.`);
                    }
                }
            }
        }
        
        _setQuotaExceededFlag(false); // Reset jika sukses
        quotaNotified = false;
        if (!silent) toast('success', 'Sinkronisasi selesai.');

    } catch (error) {
        if (error.name === 'AbortError') {
             console.log('Sync to server operation cancelled.');
             if (!silent) toast('info', 'Sinkronisasi dibatalkan.');
        } else if (error.name === 'NoDataError') {
             // Normal, do nothing
        } else {
            console.error('Error during sync to server:', error);
            if (error.code === 'resource-exhausted' || error.__quotaExceeded || isQuotaError(error)) {
                 _setQuotaExceededFlag(true);
                 if (!silent && !quotaNotified) {
                    toast('info', 'Kuota server habis. Data tetap tersimpan di perangkat dan akan dikirim otomatis saat kuota tersedia.');
                    quotaNotified = true;
                 }
                 _notifyPendingQueue('quota');
            } else if (error.name === 'DatabaseClosedError') {
                 if (!silent) emit('ui.toast', { args: ['error', 'Database lokal error saat sinkronisasi.'] });
            }
        }
    } finally {
        appState.isSyncing = false;
        appState.isSilentSync = false;
        appState.syncProgress.active = false;
        appState.syncProgress.currentAction = '';
        emit('ui.sync.updateIndicator');
        
        if (_syncAgain) {
            _syncAgain = false;
            setTimeout(() => requestSync({ silent: true }), MIN_SYNC_INTERVAL);
        }
    }
}

// --- QUEUE MANAGEMENT & UTILS ---

async function getQueuedDataSnapshot() {
    const breakdown = {};
    let pendingLocal = 0;
    for (const tableName of PENDING_TABLES) {
        let count = 0;
        try {
            count = await localDB[tableName].where('syncState').anyOf('pending_create', 'pending_update', 'pending_delete').count();
        } catch (_) {}
        breakdown[tableName] = count;
        pendingLocal += count;
    }

    let outboxCount = 0;
    let pendingPayments = 0;
    try { outboxCount = await localDB.outbox.count(); } catch (_) {}
    try { pendingPayments = await localDB.pending_payments.count(); } catch (_) {}

    const total = outboxCount + pendingPayments + pendingLocal;
    return { outboxCount, pendingPayments, pendingLocal, total, breakdown };
}

function _buildQueueModalContent(snapshot = {}, reason = 'quota') {
    const reasonText = reason === 'offline'
        ? 'Perangkat sedang offline. Data akan dikirim otomatis saat koneksi kembali.'
        : 'Kuota server hari ini habis. Data tetap aman di perangkat dan akan dikirim otomatis saat kuota tersedia.';

    return `
        <div class="card card-pad">
            <p>${reasonText}</p>
            <div class="dense-list">
                <div class="dense-list-item">
                    <div><strong>Outbox</strong><div class="text-subtle">Job yang menunggu dikirim</div></div>
                    <span class="pill pill-neutral">${_formatCount(snapshot.outboxCount)} item</span>
                </div>
                <div class="dense-list-item">
                    <div><strong>Perubahan Lokal</strong><div class="text-subtle">Data dengan status pending</div></div>
                    <span class="pill pill-neutral">${_formatCount(snapshot.pendingLocal)} item</span>
                </div>
                <div class="dense-list-item">
                    <div><strong>Pembayaran Tertunda</strong><div class="text-subtle">Transaksi offline</div></div>
                    <span class="pill pill-neutral">${_formatCount(snapshot.pendingPayments)} item</span>
                </div>
            </div>
            <p class="text-subtle" style="margin-top:0.75rem;">Total antrian: <strong>${_formatCount(snapshot.total)}</strong></p>
        </div>
    `;
}

function _showQueueNotificationModal(snapshot, reason) {
    const now = Date.now();
    if (now - _lastQueueModalAt < QUEUE_MODAL_COOLDOWN) return;
    _lastQueueModalAt = now;

    const content = _buildQueueModalContent(snapshot, reason);
    const footer = `
        <button type="button" class="btn btn-ghost" data-action="close-modal">Tutup</button>
        <button type="button" class="btn btn-primary" data-action="queue-sync-now">Kirim Sekarang</button>
    `;
    const modal = emit('ui.modal.create', 'dataDetail', {
        title: 'Sinkronisasi Ditunda',
        content,
        footer,
        isUtility: true
    });

    if (modal) {
        const triggerBtn = modal.querySelector('[data-action="queue-sync-now"]');
        if (triggerBtn && !triggerBtn.__queueListenerAttached) {
            triggerBtn.addEventListener('click', () => {
                try {
                    requestSync({ silent: false, forceQuotaRetry: true });
                } catch (err) {
                    console.error('Gagal memulai sinkronisasi manual:', err);
                    toast('error', 'Gagal memulai sinkronisasi.');
                } finally {
                    emit('ui.modal.close', modal);
                }
            });
            triggerBtn.__queueListenerAttached = true;
        }
    }
}

async function _notifyPendingQueue(reason = 'quota') {
    try {
        const snapshot = await getQueuedDataSnapshot();
        if (!snapshot || snapshot.total === 0) return;
        _showQueueNotificationModal(snapshot, reason);
    } catch (err) { console.error('Gagal menyiapkan notifikasi antrian:', err); }
}

async function checkAndPushQueuedData(options = {}) {
    const { showModalOnBlock = true, notifyWhenEmpty = false, silent = true, forceQuotaRetry = false } = options;

    const snapshot = await getQueuedDataSnapshot();
    if (!snapshot || snapshot.total === 0) {
        if (notifyWhenEmpty) toast('info', 'Tidak ada data antrean untuk dikirim.');
        return { hasQueue: false };
    }

    if (appState.isSyncing) {
        return { skipped: true, reason: 'syncing', snapshot };
    }

    const offline = !navigator.onLine;
    const quotaBlocked = _isQuotaExceeded() && !forceQuotaRetry;

    if (!offline && !quotaBlocked) {
        requestSync({ silent, forceQuotaRetry });
        return { triggered: true, snapshot };
    }

    if (showModalOnBlock) {
        _showQueueNotificationModal(snapshot, offline ? 'offline' : 'quota');
    }

    requestSync({ silent: true, forceQuotaRetry: forceQuotaRetry || quotaBlocked });
    return { blocked: true, reason: offline ? 'offline' : 'quota', snapshot };
}

async function updateSyncIndicator() { emit('ui.sync.updateIndicator'); }

function cleanupListeners() {
    listenerUnsubscribers.forEach(unsub => { try { unsub(); } catch(_) {} });
    listenerUnsubscribers = [];
}

// --- REALTIME LISTENER ---

function subscribeToAllRealtimeData() {
    cleanupListeners(); 

    const collectionsToListen = {
        projects: projectsCol, suppliers: suppliersCol, workers: workersCol, materials: materialsCol, staff: staffCol,
        professions: professionsCol, operational_categories: opCatsCol, material_categories: matCatsCol, other_categories: otherCatsCol,
        funding_creditors: fundingCreditorsCol, expenses: expensesCol, bills: billsCol, incomes: incomesCol,
        funding_sources: fundingSourcesCol, attendance_records: attendanceRecordsCol, stock_transactions: stockTransactionsCol, comments: commentsCol
    };
    
    for (const [key, collectionRef] of Object.entries(collectionsToListen)) {
        let q; 
        if (key === 'comments' && appState._commentsScope?.parentId) q = query(collectionRef, where('parentId', '==', appState._commentsScope.parentId)); 
        else q = query(collectionRef);
        
        const unsubscribe = onSnapshot(q, async (snapshot) => {
            if (snapshot.metadata.hasPendingWrites) return; 
            const changes = snapshot.docChanges(); 
            if (changes.length > 0) await _processRealtimeChanges(changes, key);
        }, (error) => {
            console.error(`Gagal mendengarkan koleksi '${key}':`, error);
            if (error.code === 'permission-denied' && key !== 'members') console.warn(`Permission denied for ${key}. Listener dinonaktifkan.`);
        });
        
        listenerUnsubscribers.push(unsubscribe); 
        appState.activeListeners.set(key, unsubscribe);
    }
}

async function _processRealtimeChanges(changes, tableName) {
    try { 
        const mapped = changes.map(ch => ({ type: ch.type === 'removed' ? 'removed' : 'modified', doc: { id: ch.doc.id, ...ch.doc.data() } })); 
        await retryDexieOperation(async () => { await _applyChangesToStateAndUI(mapped, tableName); }); 
        emit('ui.sync.updateIndicator'); 
    } catch (e) { 
        console.error('Gagal memproses perubahan realtime:', e); 
        if (e.name === 'DatabaseClosedError') emit('ui.toast', { args: ['error', 'Database lokal error saat menerima update.'] }); 
    }
}

async function _forceRefreshDataFromServer() { 
    if (!navigator.onLine) { toast('info', 'Anda offline.'); return; } 
    try { 
        await syncFromServer({ silent: true }); 
        subscribeToAllRealtimeData(); 
    } catch(err) { 
        toast('error', 'Gagal memuat ulang data.'); 
        console.error("Force refresh failed:", err); 
    } 
}

function _setActiveListeners(pageSpecificListeners = []) {
    const collectionRefs = { 'bills': billsCol, 'expenses': expensesCol, 'incomes': incomesCol, 'attendance_records': attendanceRecordsCol, 'comments': commentsCol };
    const globalListeners = new Set(['comments']); 
    const required = new Set([...globalListeners, ...pageSpecificListeners]); 
    const currentActive = new Set(appState.activeListeners.keys());
    
    currentActive.forEach(name => { 
        if (!required.has(name)) { 
            const unsub = appState.activeListeners.get(name); 
            if (typeof unsub === 'function') { try { unsub(); } catch (_) {} } 
            appState.activeListeners.delete(name); 
            console.log(`- Listener '${name}' dinonaktifkan.`); 
        } 
    });
    
    required.forEach(name => { 
        if (!currentActive.has(name)) { 
            const colRef = collectionRefs[name]; 
            if (colRef) { 
                let q; 
                if (name === 'comments' && appState._commentsScope?.parentId) q = query(colRef, where('parentId', '==', appState._commentsScope.parentId)); 
                else q = query(colRef); 
                
                const unsub = onSnapshot(q, (snap) => { 
                    if (snap.empty && snap.metadata.fromCache) return; 
                    _processRealtimeChanges(snap.docChanges(), name); 
                }, (err) => { 
                    console.error(`Gagal ${name}:`, err); 
                }); 
                
                appState.activeListeners.set(name, unsub); 
                listenerUnsubscribers.push(unsub); 
                console.log(`+ Listener '${name}' diaktifkan.`); 
            } 
        } 
    });
}

// --- REQUEST REQUEST ---

async function requestSync(options = {}) {
    if (options.silent) appState.isSilentSync = true;
    
    if (!navigator.onLine) { _scheduleSyncOnReconnect(); return; }
    
    if (!options.forceQuotaRetry && _isQuotaExceeded()) {
        console.warn('Sync skipped: firestore quota flag is active. Will retry after quota reset or manual force.');
        return;
    }
    
    if (appState.isSyncing) { _syncAgain = true; return; } 
    
    const elapsed = Date.now() - _lastSyncAt;
    if (elapsed < MIN_SYNC_INTERVAL) { 
        if (!_syncScheduled) { 
            _syncScheduled = true; 
            setTimeout(async () => { 
                _syncScheduled = false; 
                await syncToServer({ ...options, silent: true }); 
            }, MIN_SYNC_INTERVAL - elapsed); 
        } 
        return; 
    }

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
        const old = appState.activeListeners.get('comments'); 
        if (old && typeof old === 'function') { try { old(); } catch (_) {} }
        
        let q; 
        if (appState._commentsScope?.parentId) q = query(commentsCol, where('parentId', '==', appState._commentsScope.parentId)); 
        else q = query(commentsCol);
        
        const unsubscribe = onSnapshot(q, (snap) => { 
            if (snap.empty && snap.metadata.fromCache) return; 
            _processRealtimeChanges(snap.docChanges(), 'comments'); 
        }, (err) => console.error('Gagal comments (scoped):', err));
        
        appState.activeListeners.set('comments', unsubscribe); 
        listenerUnsubscribers.push(unsubscribe);
    } catch (e) { console.error('setCommentsScope error:', e); }
}

export { 
    syncFromServer, syncToServer, updateSyncIndicator, subscribeToAllRealtimeData, 
    _applyChangesToStateAndUI, getLastSyncTimestamp, setLastSyncTimestamp, 
    _isQuotaExceeded, _setQuotaExceededFlag, _initQuotaResetScheduler, 
    _forceRefreshDataFromServer, _setActiveListeners, requestSync, 
    getQueuedDataSnapshot, checkAndPushQueuedData 
};

// Event Listeners
try {
    on('sync.forceRefresh', () => { try { _forceRefreshDataFromServer(); } catch (_) {} });
    on('sync.setActiveListeners', ({ pageSpecificListeners } = {}) => { try { _setActiveListeners(pageSpecificListeners || []); } catch (_) {} });
    on('app.unload', cleanupListeners);
} catch (_) {}