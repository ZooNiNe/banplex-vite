import { emit } from "../../state/eventBus.js";
import { appState } from "../../state/appState.js";
import { localDB, loadAllLocalDataToState } from "../localDbService.js";
import { db, billsCol } from "../../config/firebase.js";
import { doc, writeBatch, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { toast } from "../../ui/components/toast.js";
import { syncToServer, requestSync } from "../syncService.js"; // Import requestSync
import { TEAM_ID, masterDataConfig } from "../../config/constants.js";
import { _logActivity } from "../logService.js";
import { deactivateSelectionMode } from "../../ui/components/selection.js";
import { _safeFirestoreWrite } from "./adminService.js";
import { _performSoftDelete } from "./utils/deleteUtils.js";

export async function _handleEmptyRecycleBin() {
    try {
        const deletedItems = [];
        const masterTables = Object.values(masterDataConfig).map(config => config.dbTable);
        const tablesToScan = ['expenses', 'bills', 'incomes', 'funding_sources', 'attendance_records', 'stock_transactions', 'comments', ...masterTables];
        const uniqueTables = [...new Set(tablesToScan)];

        for (const tableName of uniqueTables) {
            try {
                const table = localDB[tableName];
                if (!table) continue;
                const deleted = await table.where('isDeleted').equals(1).toArray();
                deleted.forEach(item => deletedItems.push({ id: item.id, table: tableName }));
            } catch (e) {
                console.warn(`Error scanning table ${tableName} for emptying recycle bin`, e);
            }
        }

        if (deletedItems.length === 0) {
            toast('info', 'Sampah sudah kosong.');
            return;
        }

        emit('ui.modal.create', 'confirmUserAction', {
            title: 'Konfirmasi Kosongkan Sampah',
            message: `Anda akan MENGHAPUS PERMANEN ${deletedItems.length} item di Sampah. Tindakan ini tidak dapat dibatalkan. Lanjutkan?`,
            onConfirm: () => _handleDeletePermanentItems(deletedItems, true)
        });
    } catch (e) {
        console.error('Gagal memproses kosongkan sampah:', e);
        toast('error', 'Gagal mengosongkan Sampah.');
    }
}


export async function _handleRestoreItems(items) {
    if (!items || items.length === 0) return;
    const count = items.length;
    const loadingToast = toast('syncing', `Memulihkan ${count} item...`);
    let successCount = 0;
    const failedItems = [];
    const originalItemsData = []; // Store original data for undo
    const processedDomIds = [];

    try {
        const itemsToProcess = [...items]; // Copy to avoid mutation issues if needed

        for (const item of itemsToProcess) {
             const originalItem = await localDB[item.table]?.get(item.id);
             if(originalItem) originalItemsData.push({ table: item.table, item: originalItem });

            const { success } = await _performSoftDelete(item.id, item.table, false); // false = restore
            if (success) {
                successCount++;
                 const domId = `trash-${item.id}`; // Correct prefix
                 emit('ui.animate.removeItem', domId);
                 processedDomIds.push(domId);
            } else {
                failedItems.push(item.id);
            }
        }
        // Request sync after all local operations are done
        if (successCount > 0) requestSync({ silent: true });

        if(loadingToast && typeof loadingToast.close === 'function') loadingToast.close();

        if (successCount > 0) {
            const message = count === 1 ? 'Item dipulihkan.' : `${successCount} item dipulihkan.`;
            toast('info', message, 6000, {
                actionText: 'Urungkan',
                onAction: async () => {
                    const undoToast = toast('syncing', 'Mengembalikan ke Sampah...');
                    let undoSuccessCount = 0;
                    try {
                        for(const { table, item: original } of originalItemsData) {
                            // Re-apply the soft delete locally
                            const { success: undoSuccess } = await _performSoftDelete(original.id, table, true); // true = soft delete again
                            if (undoSuccess) undoSuccessCount++;
                        }
                        if (undoSuccessCount > 0) requestSync({ silent: true }); // Sync after undo

                        if(undoToast.close) undoToast.close();
                        await loadAllLocalDataToState(); // Reload state
                        appState.recycledItemsCache = null; // Clear cache
                        emit('ui.recycleBin.renderContent'); // Re-render recycle bin
                        toast('success', `${undoSuccessCount} item dikembalikan ke Sampah.`);
                    } catch (e) {
                         if(undoToast.close) undoToast.close();
                         toast('error', 'Gagal mengurungkan aksi.');
                    }
                }
            });
             // Delay state update slightly AFTER animation starts emitting
             setTimeout(async () => {
                 // Filter cache based on the original item ID, not the DOM ID
                 appState.recycledItemsCache = appState.recycledItemsCache?.filter(cachedItem => !processedDomIds.includes(`trash-${cachedItem.id}`)) || null;
                 if(appState.activePage === 'recycle_bin') emit('ui.recycleBin.renderContent');
                 await loadAllLocalDataToState(); // Refresh main state too
            }, 500); // Adjust delay if needed

        }
        if (failedItems.length > 0) {
            toast('error', `Gagal memulihkan ${failedItems.length} item.`);
        }
        if (successCount > 0 && appState.selectionMode.active && appState.selectionMode.pageContext === 'recycleBin') {
            deactivateSelectionMode();
        }

    } catch (e) {
        if(loadingToast && typeof loadingToast.close === 'function') loadingToast.close();
        toast('error', 'Gagal memulihkan item.');
        console.error(e);
    }
}

export async function _handleDeletePermanentItems(items, fromEmptyBin = false) {
    if (!items || items.length === 0) return;
    const count = items.length;

    if (!fromEmptyBin) {
        emit('ui.modal.create', 'confirmUserAction', {
            title: 'Konfirmasi Hapus Permanen',
            message: `Anda akan menghapus ${count} item secara PERMANEN. Aksi ini tidak dapat dibatalkan. Yakin ingin melanjutkan?`,
            onConfirm: async () => await executePermanentDeletion(items)
        });
    } else {
        await executePermanentDeletion(items);
    }
}

async function executePermanentDeletion(items) {
    const count = items.length;
    const loadingToast = toast('syncing', `Menghapus ${count} item secara permanen...`);
    let successCount = 0;
    const failedItems = [];
    const processedItemIds = []; 
    const localDeletions = new Map(); 

    try {
        const tablesToModify = [...new Set(items.map(item => item.table))];
        
        if (tablesToModify.includes('bills') && !tablesToModify.includes('expenses')) {
            tablesToModify.push('expenses');
        }
        if (tablesToModify.includes('expenses') && !tablesToModify.includes('bills')) {
            tablesToModify.push('bills');
        }
        const dexieTables = tablesToModify.map(name => localDB[name]).filter(Boolean);

        await localDB.transaction('rw', dexieTables, async () => {
            for (const item of items) {
                const { id, table } = item;
                if (!table || !id) continue;
                const dexieTable = localDB[table];
                if (dexieTable) {
                    try {
                        
                        if (table === 'bills') {
                            const bill = await localDB.bills.get(id);
                            if (bill && bill.expenseId && bill.type !== 'gaji' && bill.type !== 'fee') {
                                await localDB.expenses.delete(bill.expenseId);
                                if (!localDeletions.has('expenses')) localDeletions.set('expenses', []);
                                localDeletions.get('expenses').push(bill.expenseId);
                            }
                        } else if (table === 'expenses') {
                            const bill = await localDB.bills.where('expenseId').equals(id).first();
                            if (bill) {
                                await localDB.bills.delete(bill.id);
                                if (!localDeletions.has('bills')) localDeletions.set('bills', []);
                                localDeletions.get('bills').push(bill.id);
                            }
                        }
                        await dexieTable.delete(id);
                        if (!localDeletions.has(table)) {
                            localDeletions.set(table, []);
                        }
                        localDeletions.get(table).push(id);
                        successCount++;
                         const domId = `trash-${id}`; 
                        emit('ui.animate.removeItem', domId);
                        processedItemIds.push(id); 
                    } catch (localError) {
                        console.error(`Gagal menghapus lokal item ${id} dari tabel ${table}:`, localError);
                        failedItems.push(id);
                    }
                } else {
                    console.warn(`Tabel Dexie tidak ditemukan untuk: ${table}. Item ID: ${id}`);
                    failedItems.push(id);
                }
            }
        });

        if (successCount > 0) {
            const deleteBatch = writeBatch(db);
            let firestoreOpsCount = 0;
            for (const [tableName, idsToDelete] of localDeletions.entries()) {
                const config = Object.values(masterDataConfig).find(c => c.dbTable === tableName);
                let collectionPath = config ? config.collection : null;
                if (!collectionPath) {
                    const collectionMap = {
                        expenses: 'expenses', bills: 'bills', incomes: 'incomes',
                        funding_sources: 'funding_sources', attendance_records: 'attendance_records',
                        stock_transactions: 'stock_transactions', comments: 'comments'
                    };
                    collectionPath = collectionMap[tableName];
                }

                if (collectionPath) {
                    idsToDelete.forEach(id => {
                        const docRef = doc(db, 'teams', TEAM_ID, collectionPath, id);
                        deleteBatch.delete(docRef);
                        firestoreOpsCount++;
                    });
                } else {
                    console.warn(`Path koleksi Firestore tidak ditemukan untuk tabel: ${tableName}. Melewati penghapusan Firestore.`);
                }
            }
            if (firestoreOpsCount > 0) {
                 await _safeFirestoreWrite(() => deleteBatch.commit(), '', 'Sebagian item gagal dihapus dari server.');
            }
        }

        if (loadingToast && typeof loadingToast.close === 'function') loadingToast.close();

        if (successCount > 0) {
            appState.recycledItemsCache = appState.recycledItemsCache?.filter(cachedItem => !processedItemIds.includes(cachedItem.id)) || null;
            await loadAllLocalDataToState(); 
            emit('ui.page.recalcDashboardTotals');
            
            toast('success', `${successCount} item berhasil dihapus permanen.`);

            setTimeout(() => {
                 if(appState.activePage === 'recycle_bin') emit('ui.recycleBin.renderContent');
            }, 500);        
        }
        if (failedItems.length > 0) {
            toast('error', `Gagal memproses penghapusan ${failedItems.length} item.`);
        }
        if (successCount > 0 && appState.selectionMode.active && appState.selectionMode.pageContext === 'recycleBin') {
             deactivateSelectionMode();
        }

    } catch (e) {
        if (loadingToast && typeof loadingToast.close === 'function') loadingToast.close();
        toast('error', 'Gagal menghapus item secara permanen.');
        console.error('Permanent delete error:', e);
    }
}


export async function handleDeleteItem(id, type) {
    let normalizedType = type;
    if (type === 'bill') normalizedType = 'bills';
    else if (type === 'expense') normalizedType = 'expenses';
    else if (type === 'termin') normalizedType = 'incomes';
    else if (type === 'pinjaman' || type === 'loan') normalizedType = 'funding_sources';

    const masterConfig = Object.values(masterDataConfig).find(c => c.dbTable === normalizedType || c.stateKey === normalizedType);
    const itemMap = {
        bills: { name: 'Tagihan', list: appState.bills, table: 'bills' },
        expenses: { name: 'Pengeluaran', list: appState.expenses, table: 'expenses' },
        incomes: { name: 'Pemasukan', list: appState.incomes, table: 'incomes' },
        funding_sources: { name: 'Pinjaman', list: appState.fundingSources, table: 'funding_sources' },
        attendance_records: { name: 'Absensi', list: appState.attendanceRecords, table: 'attendance_records' },
        stock_transactions: { name: 'Transaksi Stok', list: appState.stockTransactions, table: 'stock_transactions' },
        comments: { name: 'Komentar', list: appState.comments, table: 'comments' },
         ...(masterConfig && { [masterConfig.dbTable]: { name: masterConfig.title, list: appState[masterConfig.stateKey], table: masterConfig.dbTable, nameField: masterConfig.nameField } })
    };

     const tableName = masterConfig?.dbTable || normalizedType; // Use normalizedType
     const config = itemMap[tableName];

    if (!config) {
        console.error("Tipe tidak dikenal untuk dihapus:", type, `(Normalized: ${normalizedType}, TableName: ${tableName})`);
        toast('error', 'Tipe data tidak dikenal.');
        return;
    }


    let item = null;
    let itemIndex = -1;
     if(config.list){
        itemIndex = (config.list || []).findIndex(i => i.id === id);
        if (itemIndex > -1) {
            item = config.list[itemIndex];
        }
     }
     if (!item) {
         item = await localDB[config.table]?.get(id);
     }

     if (!item) {
         toast('error', 'Item tidak ditemukan.');
         return;
     }

    const itemName = item?.description || item?.workerName || item[config.nameField] || config.name;


    emit('ui.modal.create', 'confirmDelete', {
        message: `Anda yakin ingin memindahkan "${itemName}" ke Sampah?`,
        onConfirm: async () => {
            const { success, undoAction } = await _performSoftDelete(id, config.table, true);
        
            if (!success) {
                toast('error', `Gagal memindahkan ${config.name} ke Sampah.`);
                return;
            }
        
            const domId = document.querySelector(`[data-item-id="${id}"]`)?.dataset.id || id;
            emit('ui.animate.removeItem', domId);
            requestSync({ silent: true });
            await loadAllLocalDataToState(); 
        
            appState.recycledItemsCache = null; 
            _logActivity(`Memindahkan ke Sampah: ${itemName}`, { docId: id });
            emit('ui.page.recalcDashboardTotals');
            if (appState.activePage === 'recycle_bin') {
                emit('ui.recycleBin.renderContent');
            }
            const deleteMsg = 'Item dipindahkan ke Sampah.';
            toast('info', deleteMsg, 6000, {
                actionText: 'Urungkan',
                onAction: async () => {                    const loadingToast = toast('syncing', 'Mengembalikan...');
                    const { success: undoSuccess } = await _performSoftDelete(id, config.table, false); // false = restore
                    if (undoSuccess) {
                        requestSync({ silent: true }); 
                        await loadAllLocalDataToState(); 
                        if(loadingToast && typeof loadingToast.close === 'function') loadingToast.close();
                        emit('ui.page.render');
                        toast('success', 'Aksi dibatalkan.');
                    } else {
                         if(loadingToast && typeof loadingToast.close === 'function') loadingToast.close();
                         toast('error', 'Gagal mengurungkan aksi.');
                    }
                }
            });
        }
    });
}


export async function handleDeleteMultipleItems(items) {
    if (!items || items.length === 0) return;

    const message = `Anda akan memindahkan ${items.length} item terpilih ke Sampah. Lanjutkan?`;

    emit('ui.modal.create', 'confirmDelete', {
        message: message,
        onConfirm: async () => {
            const loadingToast = toast('syncing', `Memindahkan ${items.length} item...`);

            let successCount = 0;
            const failedItems = [];
            const itemsToUndo = []; // Store info needed for undo
            const processedDomIds = [];

            for (const item of items) {
                const { id, type } = item;
                 // Normalize type here as well
                 let normalizedType = type;
                 if (type === 'bill') normalizedType = 'bills';
                 else if (type === 'expense') normalizedType = 'expenses';
                 else if (type === 'termin') normalizedType = 'incomes';
                 else if (type === 'pinjaman' || type === 'loan') normalizedType = 'funding_sources';

                 const masterConfig = Object.values(masterDataConfig).find(c => c.stateKey === normalizedType || c.dbTable === normalizedType);
                 const tableName = masterConfig?.dbTable || normalizedType;

                if (!tableName || !localDB[tableName]) { // Check if table exists in Dexie
                    console.error("Tipe tabel tidak valid atau tidak ditemukan di DB lokal:", item, `(Normalized: ${normalizedType}, TableName: ${tableName})`);
                    failedItems.push(id);
                    continue;
                }

                const { success } = await _performSoftDelete(id, tableName, true); // true = soft delete
                if (success) {
                    successCount++;
                    itemsToUndo.push({ id, table: tableName }); // Store for undo
                    const domId = document.querySelector(`[data-item-id="${id}"]`)?.dataset.id || id;
                    // Emit animation immediately after successful local update
                    emit('ui.animate.removeItem', domId);
                    processedDomIds.push(domId);
                } else {
                    failedItems.push(id);
                }
            }
             // Request sync after all local operations are done
            if (successCount > 0) requestSync({ silent: true });


            if (loadingToast && typeof loadingToast.close === 'function') loadingToast.close();

            if (successCount > 0) {
                 // Deactivate selection and update UI after a delay
                 setTimeout(async () => {
                    deactivateSelectionMode();
                    appState.recycledItemsCache = null; // Invalidate cache
                    emit('ui.page.recalcDashboardTotals');

                    _logActivity(`Memindahkan ${successCount} item ke Sampah (Massal)`);

                    toast('info', `${successCount} item dipindahkan ke Sampah.`, 6000, {
                        actionText: 'Urungkan',
                        onAction: async () => {
                            const undoToast = toast('syncing', 'Mengembalikan semua item...');
                             let undoSuccessCount = 0;
                            try {
                                for (const itemToRestore of itemsToUndo) {
                                    const { success: undoSuccess } = await _performSoftDelete(itemToRestore.id, itemToRestore.table, false); // false = restore
                                    if(undoSuccess) undoSuccessCount++;
                                }
                                if (undoSuccessCount > 0) requestSync({ silent: true }); // Sync after undo

                                if(undoToast.close) undoToast.close();
                                await loadAllLocalDataToState(); // Reload state
                                emit('ui.page.render'); // Re-render current page
                                toast('success', `${undoSuccessCount} item berhasil dikembalikan.`);
                            } catch (e) {
                                if(undoToast.close) undoToast.close();
                                toast('error', 'Gagal mengurungkan aksi.');
                            }
                        }
                    });
                     // Re-render current page after potential state changes
                     emit('ui.page.render');
                 }, 400); // Small delay before UI update

            } else {
                 toast('error', 'Gagal memindahkan item.');
            }
             if (failedItems.length > 0) {
                 toast('error', `Gagal memindahkan ${failedItems.length} item.`);
            }
        }
    });
}
