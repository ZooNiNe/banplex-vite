import Dexie from "https://unpkg.com/dexie@3/dist/dexie.mjs";
import { appState } from "../state/appState.js";
import { fundingCreditorsCol } from "../config/firebase.js";
import { getDoc, doc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { emit } from "../state/eventBus.js";
import { toast } from "../ui/components/toast.js";

export const localDB = new Dexie('BanPlexDevLocalDB');

export async function setupLocalDatabase() {
    localDB.version(21).stores({
        expenses: '&id, projectId, date, type, status, isDeleted, attachmentNeedsSync, syncState, category',
        bills: '&id, expenseId, status, dueDate, type, isDeleted, syncState',
        incomes: '&id, projectId, date, isDeleted, syncState',
        funding_sources: '&id, creditorId, status, isDeleted, syncState',
        attendance_records: '&id, [workerId+isDeleted], workerId, date, isPaid, isDeleted, syncState, [workerId+isPaid+isDeleted]',
        stock_transactions: '&id, materialId, date, type, isDeleted, syncState',
        comments: '&id, parentId, parentType, createdAt, isDeleted, syncState, [parentId+parentType]',
        files: 'id',
        projects: '&id, projectName, isDeleted',
        suppliers: '&id, supplierName, isDeleted',
        workers: '&id, workerName, isDeleted',
        materials: '&id, materialName, isDeleted',
        staff: '&id, staffName, isDeleted',
        professions: '&id, professionName, isDeleted',
        operational_categories: '&id, categoryName, isDeleted',
        material_categories: '&id, categoryName, isDeleted',
        other_categories: '&id, categoryName, isDeleted',
        funding_creditors: '&id, creditorId, isDeleted',
        pending_payments: '++id, billId, workerId, date, [billId+workerId]',
        pending_logs: '++id, action, createdAt',
        pending_conflicts: '++id, table, docId',
        logs: '&id, status, createdAt',
        outbox: '++id, table, docId, op, status, createdAt, priority'
    }).upgrade(async tx => {
        try {
            await tx.table('expenses').toCollection().modify(expense => {
                if (expense.category === undefined) expense.category = 'lainnya';
            });
        } catch(_) {}

        try {
            const expTable = tx.table('expenses');
            await expTable.toCollection().modify(exp => {
                if (!Array.isArray(exp.attachments)) exp.attachments = [];
                if (!Array.isArray(exp.attachmentsLocalIds)) exp.attachmentsLocalIds = [];
                if (exp.attachmentUrl && !exp.attachments.some(a => a && a.url === exp.attachmentUrl)) {
                    exp.attachments.push({ url: exp.attachmentUrl, name: exp.attachmentName || 'Lampiran' });
                    exp.attachmentUrl = '';
                }
                if (exp.localAttachmentId && !exp.attachmentsLocalIds.includes(exp.localAttachmentId)) {
                    exp.attachmentsLocalIds.push(exp.localAttachmentId);
                    exp.localAttachmentId = null;
                }
                if (exp.attachmentNeedsSync) {
                    delete exp.attachmentNeedsSync;
                }
            });
        } catch (e) { console.warn('Migration to multi-attachments failed partially:', e); }

        const masterTables = ['projects', 'suppliers', 'workers', 'materials', 'staff', 'professions', 'operational_categories', 'material_categories', 'other_categories', 'funding_creditors'];
        for (const tableName of masterTables) {
            try {
                const table = tx.table(tableName);
                await table.toCollection().modify(item => {
                    if (item.isDeleted === undefined) item.isDeleted = 0;
                });
            } catch (e) {
                console.warn(`Failed adding isDeleted index/field to ${tableName}:`, e);
            }
        }
    });

    try {
        if (!localDB.isOpen()) {
            await localDB.open();
        }
    } catch (e) {
        console.error("Gagal membuka database Dexie:", e);
        if (e.name === 'QuotaExceededError') {
             emit('ui.toast', { args: ['error', 'Storage perangkat penuh. Hapus beberapa data atau file.'] });
        } else {
             emit('ui.toast', { args: ['error', 'Database lokal bermasalah. Coba muat ulang aplikasi.'] });
        }
        throw e;
    }
}

async function retryDexieOperation(operation, maxRetries = 1, delay = 100) {
    let retries = 0;
    while (retries <= maxRetries) {
        try {
            return await operation();
        } catch (e) {
            if (e.name === 'DatabaseClosedError' || (e.inner && e.inner.name === 'InvalidStateError')) {
                console.warn(`Dexie error (${e.name}), attempt ${retries + 1}. Mencoba membuka kembali DB...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                try {
                    if (!localDB.isOpen()) {
                        await localDB.open();
                        console.log("DB berhasil dibuka kembali.");
                    } else {
                         console.log("DB sudah terbuka, mencoba lagi operasi.");
                    }
                } catch (openError) {
                    console.error("Gagal membuka kembali DB setelah error:", openError);
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


export async function loadAllLocalDataToState() {
    console.log("Memuat data dari database lokal ke state...");
    try {
        const operation = async () => {
            const data = await localDB.transaction('r', localDB.tables, async () => {
                const results = {};
                const masterTables = {
                    projects: localDB.projects,
                    suppliers: localDB.suppliers,
                    workers: localDB.workers,
                    materials: localDB.materials,
                    staff: localDB.staff,
                    professions: localDB.professions,
                    operational_categories: localDB.operational_categories,
                    material_categories: localDB.material_categories,
                    other_categories: localDB.other_categories,
                    fundingCreditors: localDB.funding_creditors
                };

                for (const [key, tableObject] of Object.entries(masterTables)) {
                     if (tableObject) {
                         results[key] = await tableObject.where('isDeleted').notEqual(1).toArray();
                     } else {
                         results[key] = [];
                     }
                }

                results.incomes = await localDB.incomes.where('isDeleted').notEqual(1).toArray();
                results.fundingSources = await localDB.funding_sources.where('isDeleted').notEqual(1).toArray();
                results.expenses = await localDB.expenses.where('isDeleted').notEqual(1).toArray().then(arr => arr.filter(item => !!item.date));
                results.bills = await localDB.bills.where('isDeleted').notEqual(1).toArray().then(arr => arr.filter(item => !!item.dueDate));
                results.attendanceRecords = await localDB.attendance_records.where('isDeleted').notEqual(1).toArray().then(arr => arr.filter(item => !!item.date));
                results.stockTransactions = await localDB.stock_transactions.where('isDeleted').notEqual(1).toArray().then(arr => arr.filter(item => !!item.date));
                results.comments = await localDB.comments.where('isDeleted').notEqual(1).toArray();
                
                return results;
            });
             Object.assign(appState, data);
             console.log("Data lokal berhasil dimuat.");
        };
        await retryDexieOperation(operation);
    } catch (error) {
        console.error("Gagal memuat data lokal:", error);
        emit('ui.toast', { args: ['error', `Gagal memuat data lokal: ${error.message}`] });
    }
}

export async function loadDataForPage(pageId) {
    try {
        const operation = async () => {
            const results = {};
            const notDeletedMaster = (t) => t.where('isDeleted').notEqual(1);
            const notDeletedTransaction = (t) => t.where('isDeleted').notEqual(1).and(item => item.syncState !== 'pending_delete');
            const keepValidDate = (arr, field) => Array.isArray(arr) ? arr.filter(item => !!item[field]) : [];

            const ensureFileStorageSetup = () => {
                if (!appState.fileStorage) {
                    appState.fileStorage = {
                        list: [],
                        filters: {
                            search: '',
                            gender: 'all',
                            jenjang: 'all',
                        },
                        isLoading: false,
                    };
                } else {
                    if (!Array.isArray(appState.fileStorage.list)) {
                        appState.fileStorage.list = [];
                    }
                    appState.fileStorage.filters = {
                        search: '',
                        gender: 'all',
                        jenjang: 'all',
                        ...(appState.fileStorage.filters || {}),
                    };
                    if (typeof appState.fileStorage.isLoading !== 'boolean') {
                        appState.fileStorage.isLoading = false;
                    }
                }
                results.fileStorage = appState.fileStorage;
            };
            const ensureHrdApplicantsSetup = () => {
                if (!appState.hrdApplicants) {
                    appState.hrdApplicants = {
                        list: [],
                        filters: {
                            search: '',
                            gender: 'all',
                        },
                        isLoading: false,
                        view: {
                            perPage: 20,
                            currentPage: 1,
                        },
                        selection: {
                            ids: new Set(),
                        },
                        editingRecord: null,
                    };
                } else {
                    if (!Array.isArray(appState.hrdApplicants.list)) {
                        appState.hrdApplicants.list = [];
                    }
                    appState.hrdApplicants.filters = {
                        search: '',
                        gender: 'all',
                        ...(appState.hrdApplicants.filters || {}),
                    };
                    if (typeof appState.hrdApplicants.isLoading !== 'boolean') {
                        appState.hrdApplicants.isLoading = false;
                    }
                    const allowedPerPage = [20, 50, 100];
                    if (!appState.hrdApplicants.view) {
                        appState.hrdApplicants.view = { perPage: 20, currentPage: 1 };
                    } else {
                        const perPage = Number(appState.hrdApplicants.view.perPage) || 20;
                        const currentPage = Number(appState.hrdApplicants.view.currentPage) || 1;
                        appState.hrdApplicants.view = {
                            perPage: allowedPerPage.includes(perPage) ? perPage : 20,
                            currentPage: currentPage > 0 ? currentPage : 1,
                        };
                    }
                    const selection = appState.hrdApplicants.selection || { ids: new Set() };
                    if (!(selection.ids instanceof Set)) {
                        selection.ids = new Set(Array.isArray(selection.ids) ? selection.ids : []);
                    }
                    appState.hrdApplicants.selection = selection;
                    if (appState.hrdApplicants.editingRecord && typeof appState.hrdApplicants.editingRecord !== 'object') {
                        appState.hrdApplicants.editingRecord = null;
                    }
                }
                results.hrdApplicants = appState.hrdApplicants;
            };

            const need = {
                dashboard: async () => {
                    results.projects = await notDeletedMaster(localDB.projects).toArray();
                    results.incomes = await notDeletedTransaction(localDB.incomes).toArray();
                    results.expenses = keepValidDate(await notDeletedTransaction(localDB.expenses).toArray(), 'date');
                    results.bills = keepValidDate(await notDeletedTransaction(localDB.bills).toArray(), 'dueDate');
                    results.attendanceRecords = keepValidDate(await notDeletedTransaction(localDB.attendance_records).toArray(), 'date');
                    results.fundingSources = await notDeletedTransaction(localDB.funding_sources).toArray();
                },
                pemasukan: async () => {
                    results.projects = await notDeletedMaster(localDB.projects).toArray();
                    results.fundingCreditors = await notDeletedMaster(localDB.funding_creditors).toArray();
                    results.incomes = await notDeletedTransaction(localDB.incomes).toArray();
                    results.fundingSources = await notDeletedTransaction(localDB.funding_sources).toArray();
                },
                pengeluaran: async () => {
                    results.projects = await notDeletedMaster(localDB.projects).toArray();
                    results.materials = await notDeletedMaster(localDB.materials).toArray();
                    results.suppliers = await notDeletedMaster(localDB.suppliers).toArray();
                    results.operational_categories = await notDeletedMaster(localDB.operational_categories).toArray();
                    results.material_categories = await notDeletedMaster(localDB.material_categories).toArray();
                    results.other_categories = await notDeletedMaster(localDB.other_categories).toArray();
                    results.expenses = keepValidDate(await notDeletedTransaction(localDB.expenses).toArray(), 'date');
                    results.bills = keepValidDate(await notDeletedTransaction(localDB.bills).toArray(), 'dueDate');
                },
                tagihan: async () => {
                    results.bills = keepValidDate(await notDeletedTransaction(localDB.bills).toArray(), 'dueDate');
                    results.expenses = keepValidDate(await notDeletedTransaction(localDB.expenses).toArray(), 'date');
                    results.suppliers = await notDeletedMaster(localDB.suppliers).toArray();
                    results.projects = await notDeletedMaster(localDB.projects).toArray();
                },
                jurnal: async () => {
                    results.attendanceRecords = keepValidDate(await notDeletedTransaction(localDB.attendance_records).toArray(), 'date');
                    results.bills = keepValidDate(await notDeletedTransaction(localDB.bills).toArray(), 'dueDate');
                    results.workers = await notDeletedMaster(localDB.workers).toArray();
                    results.projects = await notDeletedMaster(localDB.projects).toArray();
                },
                absensi: async () => {
                    results.projects = await notDeletedMaster(localDB.projects).toArray();
                    results.workers = await notDeletedMaster(localDB.workers).toArray();
                    results.attendanceRecords = keepValidDate(await notDeletedTransaction(localDB.attendance_records).toArray(), 'date');
                    results.professions = await notDeletedMaster(localDB.professions).toArray();
                },
                stok: async () => {
                    results.stockTransactions = keepValidDate(await notDeletedTransaction(localDB.stock_transactions).toArray(), 'date');
                    results.materials = await notDeletedMaster(localDB.materials).toArray();
                },
                laporan: async () => {
                    results.projects = await notDeletedMaster(localDB.projects).toArray();
                    results.incomes = await notDeletedTransaction(localDB.incomes).toArray();
                    results.expenses = keepValidDate(await notDeletedTransaction(localDB.expenses).toArray(), 'date');
                    results.fundingSources = await notDeletedTransaction(localDB.funding_sources).toArray();
                    results.bills = keepValidDate(await notDeletedTransaction(localDB.bills).toArray(), 'dueDate');
                    results.attendanceRecords = keepValidDate(await notDeletedTransaction(localDB.attendance_records).toArray(), 'date');
                    results.comments = await notDeletedTransaction(localDB.comments).toArray();
                },
                Komentar: async () => {
                    results.comments = await notDeletedTransaction(localDB.comments).toArray();
                    results.bills = await keepValidDate(await notDeletedTransaction(localDB.bills).toArray(), 'dueDate');
                    results.expenses = keepValidDate(await notDeletedTransaction(localDB.expenses).toArray(), 'date');
                    results.incomes = await notDeletedTransaction(localDB.incomes).toArray();
                    results.fundingSources = await notDeletedTransaction(localDB.funding_sources).toArray();
                },
                pengaturan: async () => {
                    results.projects = await notDeletedMaster(localDB.projects).toArray();
                    results.suppliers = await notDeletedMaster(localDB.suppliers).toArray();
                    results.workers = await notDeletedMaster(localDB.workers).toArray();
                    results.materials = await notDeletedMaster(localDB.materials).toArray();
                    results.staff = await notDeletedMaster(localDB.staff).toArray();
                    results.professions = await notDeletedMaster(localDB.professions).toArray();
                    results.operational_categories = await notDeletedMaster(localDB.operational_categories).toArray();
                    results.material_categories = await notDeletedMaster(localDB.material_categories).toArray();
                    results.other_categories = await notDeletedMaster(localDB.other_categories).toArray();
                    results.funding_creditors = await notDeletedMaster(localDB.funding_creditors).toArray();
                },
                recycle_bin: async () => {},
                log_aktivitas: async () => {},
                simulasi: async () => {
                      results.bills = await keepValidDate(await notDeletedTransaction(localDB.bills).toArray(), 'dueDate');
                      results.expenses = keepValidDate(await notDeletedTransaction(localDB.expenses).toArray(), 'date');
                      results.fundingSources = await notDeletedTransaction(localDB.funding_sources).toArray();
                      results.suppliers = await notDeletedMaster(localDB.suppliers).toArray();
                      results.fundingCreditors = await notDeletedMaster(localDB.funding_creditors).toArray();
                },
                file_storage: async () => {
                    ensureFileStorageSetup();
                },
                file_storage_form: async () => {
                    ensureFileStorageSetup();
                },
                hrd_applicants: async () => {
                    ensureHrdApplicantsSetup();
                },
                hrd_applicants_form: async () => {
                    ensureHrdApplicantsSetup();
                },
            };

            const fn = need[pageId] || need.dashboard;
            await fn();
            Object.assign(appState, results);
        };
        await retryDexieOperation(operation);
    } catch (e) {
        console.warn(`[loadDataForPage] Gagal memuat data untuk ${pageId}:`, e?.message || e);
        emit('ui.toast', { args: ['error', `Sebagian data gagal dimuat (${pageId}). Coba refresh.`] });
    }
}

export async function _verifyDataIntegrity() {
    console.log("Memeriksa integritas data lokal...");
    let itemsFixed = 0;

    try {
        const operation = async () => {
            await localDB.transaction('rw', localDB.tables, async () => {
                 let localFixCount = 0;
                 const allExpenseIds = new Set((await localDB.expenses.where('isDeleted').notEqual(1).toArray()).map(e => e.id));
                 const orphanedBills = await localDB.bills.filter(bill => {
                     return bill.isDeleted !== 1 && bill.expenseId && !allExpenseIds.has(bill.expenseId) && bill.type !== 'gaji';
                 }).toArray();

                 if (orphanedBills.length > 0) {
                     console.error(`DETEKSI KORUPSI LOKAL: Ditemukan ${orphanedBills.length} tagihan 'yatim'. Menandai sebagai terhapus...`);
                     const idsToSoftDelete = orphanedBills.map(b => b.id).filter(Boolean);
                     if (idsToSoftDelete.length > 0) {
                         await localDB.bills.where('id').anyOf(idsToSoftDelete).modify({
                             isDeleted: 1,
                             syncState: 'pending_update',
                             updatedAt: new Date()
                         });
                         localFixCount += idsToSoftDelete.length;
                     }
                 }

                 console.log("Memeriksa absensi 'yatim'...");
                 const allValidBillIds = new Set((await localDB.bills.where('isDeleted').notEqual(1).toArray()).map(b => b.id));
                 const allAttendanceRecords = await localDB.attendance_records.toArray();
                 const orphanedAttendance = allAttendanceRecords.filter(record =>
                     record.isPaid === true && record.billId && !allValidBillIds.has(record.billId)
                 );

                 if (orphanedAttendance.length > 0) {
                     console.error(`DETEKSI KORUPSI LOKAL: Ditemukan ${orphanedAttendance.length} absensi 'lunas' tanpa tagihan. Mereset status...`);
                     const idsToReset = orphanedAttendance.map(rec => rec.id).filter(Boolean);
                     if(idsToReset.length > 0){
                         await localDB.attendance_records.where('id').anyOf(idsToReset).modify({
                             isPaid: false,
                             billId: null,
                             syncState: 'pending_update'
                         });
                         localFixCount += idsToReset.length;
                     }
                 }
                  itemsFixed = localFixCount;
            });
        };
        await retryDexieOperation(operation);

        if (itemsFixed > 0) {
            toast('info', `${itemsFixed} data lokal bermasalah diperbaiki.`);
            await loadAllLocalDataToState();
            emit('ui.page.recalcDashboardTotals');
        } else {
            console.log("Pemeriksaan integritas data lokal selesai. Tidak ada masalah ditemukan.");
        }

    } catch (e) {
        toast('error', 'Gagal memeriksa integritas data lokal.');
        console.error("Pemeriksaan integritas data lokal GAGAL:", e);
    }
}

export async function _runDeepCleanV4() {
    console.log("Memulai Pembersihan V4 (Metode Brute Force)...");
    toast('syncing', 'Membaca seluruh data tanpa indeks...');

    try {
        let fixedBills = 0;
        let fixedRecords = 0;

        await localDB.transaction('rw', localDB.expenses, localDB.bills, localDB.attendance_records, async () => {

            console.log("Membaca seluruh tabel tagihan (bills)...");
            const allBills = await localDB.bills.toArray();
            const billsToDelete = [];

            const validExpenseIds = new Set(
                (await localDB.expenses.toArray()).filter(e => e.isDeleted !== 1).map(e => e.id)
            );

            for (const bill of allBills) {
                if (bill.isDeleted !== 1 && bill.expenseId && bill.type !== 'gaji' && bill.type !== 'fee') {
                    if (!validExpenseIds.has(bill.expenseId)) {
                        billsToDelete.push(bill.id);
                    }
                }
            }

            if (billsToDelete.length > 0) {
                console.log(`Menemukan ${billsToDelete.length} tagihan yatim untuk dihapus:`, billsToDelete);
                await localDB.bills.bulkDelete(billsToDelete);
                fixedBills = billsToDelete.length;
            }

            console.log("Membaca seluruh tabel absensi (attendance_records)...");
            const allRecords = await localDB.attendance_records.toArray();
            const recordsToReset = [];

            const currentValidBillIds = new Set(
                (await localDB.bills.toArray()).filter(b => b.isDeleted !== 1 && b.type === 'gaji').map(b => b.id)
            );

            for (const record of allRecords) {
                if (record.isPaid === true && record.billId) {
                    if (!currentValidBillIds.has(record.billId)) {
                        if (record.id) recordsToReset.push(record.id);
                    }
                }
            }

            if (recordsToReset.length > 0) {
                console.log(`Menemukan ${recordsToReset.length} record absensi untuk direset statusnya.`);
                await localDB.attendance_records.where('id').anyOf(recordsToReset).modify({
                    isPaid: false,
                    billId: null,
                    syncState: 'pending_update'
                });
                fixedRecords = recordsToReset.length;
            }
        });

        const totalFixed = fixedBills + fixedRecords;
        if (totalFixed > 0) {
            toast('success', `Pembersihan selesai! ${totalFixed} data diperbaiki.`);
        } else {
            toast('info', 'Tidak ada data tersangkut yang ditemukan.');
        }

        await loadAllLocalDataToState();
        emit('ui.page.recalcDashboardTotals');
        emit('ui.page.render');

        alert("Pembersihan brute-force selesai. Halaman akan dimuat ulang dengan data yang bersih.");

    } catch (error) {
        console.error('Proses pembersihan V4 gagal:', error);
        toast('error', 'Gagal membersihkan data.');
        alert('Proses pembersihan gagal. Error: ' + error.message);
    }
}
