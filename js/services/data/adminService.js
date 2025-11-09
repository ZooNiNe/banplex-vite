import { emit } from "../../state/eventBus.js";
import { appState } from "../../state/appState.js";
import { db, expensesCol, billsCol, incomesCol, fundingSourcesCol, attendanceRecordsCol, stockTransactionsCol, materialsCol, logsCol, membersCol, projectsCol, suppliersCol, workersCol, staffCol, professionsCol, opCatsCol, matCatsCol, otherCatsCol, fundingCreditorsCol, commentsCol, settingsDocRef } from "../../config/firebase.js";
import { doc, runTransaction, writeBatch, getDocs, getDoc, setDoc, updateDoc, deleteDoc, addDoc, query, where, orderBy, serverTimestamp, increment, collection, Timestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { toast } from "../../ui/components/toast.js";
import { _isQuotaExceeded, _setQuotaExceededFlag, syncFromServer } from "../syncService.js";
import { localDB, loadAllLocalDataToState } from "../localDbService.js";
import { fetchAndCacheData } from "./fetch.js";
import { showDetailPane } from "../../ui/components/modal.js";

function createIcon(iconName, size = 18, classes = '') {
    const icons = {
        storage: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-database ${classes}"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`,
        healing: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-heart-pulse ${classes}"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.7-1.44.7 2.88.7-1.44H16"/></svg>`,
        functions: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sigma ${classes}"><path d="M18 7V4H6l6 8-6 8h12v-3"/></svg>`,
        'spray-can': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-spray-can ${classes}"><path d="M15.228 17.02c.797-.832 1.34-1.93 1.39-3.155.07-.97.19-2.083.47-3.266C17.68 7.9 18.73 6.18 19 5a2.5 2.5 0 0 0-2.5-2.5c-1.18 0-2.9 1.05-5.606 1.68-.088.016-.176.03-.265.044-.954.127-2.15.267-3.324.47-1.186.204-2.227.76-3.024 1.558C3.47 7.03 3 8.13 3 9.255c-.048 1.225.494 2.322 1.29 3.154.912.956 2.062 1.59 3.322 1.766 1.173.18 2.348.3 3.394.444.09.016.18.028.27.042 2.705.63 4.425 1.68 5.605 1.68A2.5 2.5 0 0 0 21 19c-.27-1.18-1.32-2.9-1.92-5.605a22.5 22.5 0 0 0-.47-3.266"/><path d="m14 6 1-1"/><path d="M8.5 2.76a10.4 10.4 0 0 1 2.91 1.74 5.7 5.7 0 0 1 1.74 2.91"/></svg>`,
        'alert-octagon': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-octagon ${classes}"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`,
    };
    return icons[iconName] || '';
}

export async function _safeFirestoreWrite(writeFunction, successMessage, failureMessage = 'Operasi gagal.', loadingMessage = null) {
    if (_isQuotaExceeded()) {
        toast('error', 'Kuota server habis. Operasi ditunda.');
        return false;
    }

    let loadingToast = null;
    if (loadingMessage) {
        loadingToast = toast('syncing', loadingMessage, 0);
    }

    try {
        await writeFunction();
        _setQuotaExceededFlag(false);
        if (loadingToast && typeof loadingToast.close === 'function') {
            loadingToast.close();
        }
        if (successMessage) {
            toast('success', successMessage);
        }
        return true;
    } catch (error) {
        if (loadingToast && typeof loadingToast.close === 'function') {
            loadingToast.close();
        }
        if (error.code === 'resource-exhausted') {
            _setQuotaExceededFlag(true);
            toast('error', 'Kuota server habis. Operasi ditunda.');
        } else {
            console.error("Firestore Write Error:", error);
            toast('error', failureMessage);
        }
        return false;
    }
}

export function openToolsGrid() {
    const tools = [
        { label: 'Statistik & Backup', action: 'open-storage-stats', icon: 'storage', role: ['Owner', 'Editor'] },
        { label: 'Perbaiki Absensi Ganda', action: 'fix-stuck-attendance', icon: 'healing', role: ['Owner'] },
        { label: 'Hitung Ulang Penggunaan Material', action: 'recalculate-usage', icon: 'functions', role: ['Owner'] },
        { label: 'Bersihkan Data Server', action: 'server-cleanup', icon: 'spray-can', role: ['Owner'] },
        { label: 'Reset Data Server (Dev)', action: 'dev-reset-all-data', icon: 'alert-octagon', role: ['Owner'] }
    ];

    const gridHTML = `
        <div class="master-data-grid">
            ${tools
                .filter(tool => tool.role.includes(appState.userRole))
                .map(tool => `
                <button class="master-data-grid-item" data-action="${tool.action}">
                    <div class="icon-wrapper">${createIcon(tool.icon, 24)}</div>
                    <span class="label">${tool.label}</span>
                </button>
            `).join('')}
        </div>
    `;

    showDetailPane({
        title: 'Tools Aplikasi',
        content: gridHTML,
    });
}


export async function handleRestoreOrphanLoans() {
    toast('syncing', 'Memindai dan memulihkan pinjaman...');
    try {
        const creditors = await localDB.funding_creditors.toArray();
        const validCreditorIds = new Set(creditors.map(c => c.id));
        const softDeletedLoans = await localDB.funding_sources.where('isDeleted').equals(1).toArray();
        let toRestore = softDeletedLoans.filter(l => l.creditorId && validCreditorIds.has(l.creditorId));

        if (navigator.onLine) {
            for (const loan of softDeletedLoans) {
                if (loan.creditorId && !validCreditorIds.has(loan.creditorId)) {
                    try {
                        const snap = await getDoc(doc(fundingCreditorsCol, loan.creditorId));
                        if (snap.exists()) {
                            toRestore.push(loan);
                        }
                    } catch (_) {}
                }
            }
        }

        const map = new Map();
        toRestore.forEach(l => map.set(l.id, l));
        toRestore = Array.from(map.values());

        if (toRestore.length === 0) {
            toast('info', 'Tidak ada pinjaman yang perlu dipulihkan.');
            return;
        }

        const ids = toRestore.map(l => l.id);
        await localDB.funding_sources.where('id').anyOf(ids).modify({
            isDeleted: 0,
            syncState: 'pending_update',
            updatedAt: new Date()
        });

        await loadAllLocalDataToState();
        emit('ui.page.recalcDashboardTotals');
        if (appState.activePage === 'pemasukan') {
            try { await emit('ui.page.render'); } catch (_) {}
        }

        await toast('success', `${toRestore.length} pinjaman berhasil dipulihkan.`);

        if (navigator.onLine) {
            await syncToServer({ silent: true });
        }
    } catch (error) {
        console.error('Gagal memulihkan pinjaman yatim:', error);
        toast('error', 'Gagal memulihkan pinjaman.');
    }
}

async function _runServerDataIntegrityCheck() {
    toast('syncing', 'Memindai data server...');
    console.log("Memulai pemindaian integritas data server...");

    let billsDeletedCount = 0;
    let recordsResetCount = 0;

    try {
        const expenseSnaps = await getDocs(expensesCol);
        const validExpenseIds = new Set(expenseSnaps.docs.map(d => d.id));

        const billSnaps = await getDocs(billsCol);
        const billsData = billSnaps.docs.map(d => ({ id: d.id, ...d.data() }));
        const validBillIds = new Set(billsData.map(b => b.id));
        console.log(`Ditemukan ${validExpenseIds.size} expenses dan ${validBillIds.size} bills yang valid.`);

        const billsToDeleteRefs = [];
        billsData.forEach(bill => {
            const isOrphan = bill.expenseId && !['gaji', 'fee'].includes(bill.type) && !validExpenseIds.has(bill.expenseId);
            if (isOrphan) {
                billsToDeleteRefs.push(doc(billsCol, bill.id));
            }
        });

        if (billsToDeleteRefs.length > 0) {
            console.warn(`Ditemukan ${billsToDeleteRefs.length} Tagihan Yatim untuk dihapus.`);
        }

        const recordsToUpdateRefs = [];
        const paidAttendanceQuery = query(attendanceRecordsCol, where('isPaid', '==', true));
        const paidAttendanceSnaps = await getDocs(paidAttendanceQuery);

        paidAttendanceSnaps.forEach(docSnap => {
            const record = docSnap.data();
            const isOrphan = record.billId && !validBillIds.has(record.billId);
            if (isOrphan) {
                recordsToUpdateRefs.push(docSnap.ref);
            }
        });

        if (recordsToUpdateRefs.length > 0) {
            console.warn(`Ditemukan ${recordsToUpdateRefs.length} Absensi Lunas Yatim untuk direset.`);
        }

        const totalOperations = billsToDeleteRefs.length + recordsToUpdateRefs.length;

        if (totalOperations === 0) {
            toast('success', 'Data server bersih, tidak ada masalah ditemukan.');
            console.log("Pemeriksaan selesai. Tidak ada inkonsistensi data di server.");
            return;
        }

        toast('syncing', `Memperbaiki ${totalOperations} item data...`);

        const allWritePromises = [];
        const BATCH_SIZE = 400;

        for (let i = 0; i < billsToDeleteRefs.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            const chunk = billsToDeleteRefs.slice(i, i + BATCH_SIZE);
            chunk.forEach(ref => batch.delete(ref));
            allWritePromises.push(batch.commit());
            billsDeletedCount += chunk.length;
        }

        for (let i = 0; i < recordsToUpdateRefs.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            const chunk = recordsToUpdateRefs.slice(i, i + BATCH_SIZE);
            chunk.forEach(ref => batch.update(ref, { isPaid: false, billId: null }));
            allWritePromises.push(batch.commit());
            recordsResetCount += chunk.length;
        }

        await Promise.all(allWritePromises);

        await toast('success', `Pembersihan server selesai! ${billsDeletedCount} tagihan dihapus & ${recordsResetCount} absensi direset.`);
        console.log(`Pembersihan server berhasil: ${billsDeletedCount} tagihan dihapus, ${recordsResetCount} absensi direset.`);

        localStorage.removeItem('lastSyncTimestamp');
        await syncFromServer();
        await emit('ui.page.render');

    } catch (error) {
        console.error("Gagal menjalankan pembersihan data server:", error);
        toast('error', 'Gagal membersihkan data server. Cek console untuk detail.');
    }
}

export function handleServerCleanUp() {
    emit('ui.modal.create', 'confirmUserAction', {
        message: 'PERINGATAN: Aksi ini akan memindai data di server dan secara PERMANEN menghapus Tagihan Yatim serta mereset status Absensi Lunas yang tidak memiliki tagihan. Aksi ini tidak dapat dibatalkan. Lanjutkan?',
        onConfirm: () => _runServerDataIntegrityCheck()
    });
}

export async function resolveConflict(conflictId, useLocal) {
      try {
          const c = await localDB.pending_conflicts.get(Number(conflictId));
          if (!c) return;
          const colMap = {
              expenses: expensesCol,
              bills: billsCol,
              incomes: incomesCol,
              funding_sources: fundingSourcesCol,
              attendance_records: attendanceRecordsCol,
              stock_transactions: stockTransactionsCol,
          };
          const dexieTable = localDB[c.table];
          const col = colMap[c.table];
          const ref = doc(col, c.docId);
          if (useLocal) {
              await runTransaction(db, async (transaction) => {
                  const snap = await transaction.get(ref);
                  const nextRev = (snap.exists()?(snap.data().rev || 0) : 0) + 1;
                  const data = { ...(c.payload || {}),
                      id: c.docId,
                      rev: nextRev,
                      updatedAt: serverTimestamp()
                  };
                  if (snap.exists()) transaction.update(ref, data);
                  else transaction.set(ref, data);
              });
              try {
                  if (dexieTable) {
                      await dexieTable.update(c.docId, { serverRev: nextRev, syncState: 'synced', updatedAt: new Date() });
                  }
              } catch {}
              if (dexieTable && c.localId != null) await dexieTable.update(c.localId, { needsSync: 0 });
          } else {
              const snap = await getDoc(ref);
              if (snap.exists()) {
                  try {
                      if (dexieTable) {
                          await dexieTable.update(c.docId, { ...snap.data(), serverRev: (snap.data().rev || 0), syncState: 'synced', updatedAt: new Date() });
                      }
                  } catch {}
              }
          }
          await localDB.pending_conflicts.delete(c.id);
          toast('success', 'Konflik berhasil diproses.');
          emit('ui.modal.close', document.getElementById('dataDetail-modal'));
      } catch (e) {
          console.error('Gagal memproses konflik:', e);
          toast('error', 'Gagal memproses konflik.');
      }
}

export async function handleRecalculateUsageCount() {
      emit('ui.modal.create', 'confirmUserAction', {
          message: 'Aksi ini akan membaca semua histori faktur material dan menghitung ulang frekuensi penggunaan untuk semua master data. Proses ini hanya perlu dilakukan sekali. Lanjutkan?',
          onConfirm: () => _recalculateAndApplyUsageCounts()
      });
}

async function _recalculateAndApplyUsageCounts() {
      toast('syncing', 'Membaca semua faktur material...');
      console.log('Memulai perhitungan ulang frekuensi penggunaan material...');
      try {
          await fetchAndCacheData('materials', materialsCol);
          const q = query(expensesCol, where("type", "==", "material"));
          const expenseSnap = await getDocs(q);
          const materialExpenses = expenseSnap.docs.map(d => d.data());
          console.log(`Ditemukan ${materialExpenses.length} faktur material untuk dianalisis.`);
          const usageMap = new Map();
          materialExpenses.forEach(expense => {
              if (expense.items && Array.isArray(expense.items)) {
                  expense.items.forEach(item => {
                      if (item.materialId) {
                          const currentCount = usageMap.get(item.materialId) || 0;
                          usageMap.set(item.materialId, currentCount + 1);
                      }
                  });
              }
          });
          console.log('Peta penggunaan selesai dihitung:', usageMap);
          if (appState.materials.length === 0) {
              toast('info', 'Tidak ada data master material untuk diperbarui.');
              return;
          }
          toast('syncing', `Menghitung dan memperbarui ${appState.materials.length} material...`);
          const batch = writeBatch(db);
          appState.materials.forEach(material => {
              const materialRef = doc(materialsCol, material.id);
              const newCount = usageMap.get(material.id) || 0;
              if (material.usageCount !== newCount) {
                  batch.update(materialRef, {
                      usageCount: newCount
                  });
              }
          });
          console.log('Menerapkan pembaruan batch ke Firestore...');
          await batch.commit();
          console.log('Pembaruan batch berhasil.');
          toast('success', 'Perhitungan ulang selesai! Semua data material telah diperbarui.');
          const recalcButton = document.querySelector(`[data-action="recalculate-usage"]`);
          if (recalcButton) recalcButton.style.display = 'none';
      } catch (error) {
          console.error("Gagal menghitung ulang:", error);
          toast('error', 'Terjadi kesalahan saat perhitungan ulang.');
      }
}

export async function handleDevResetAllData() {
    if (appState.userRole !== 'Owner') {
        toast('error', 'Hanya Owner yang dapat melakukan aksi ini.');
        return;
    }

    const title = 'Peringatan: Reset Data Server';
    const content = `
        <div class="card card-pad" style="background-color: var(--surface-danger-dim);">
            <h5 class="detail-section-title" style="color: var(--danger);">Aksi Sangat Berbahaya</h5>
            <p class="helper-text" style="color: var(--text);">
                Ini adalah tool pengembangan untuk menghapus <strong>SEMUA</strong> data koleksi di server Firestore.
            </p>
            <p class="helper-text" style="color: var(--text); margin-top: 1rem;">
                Menghapus dari sisi klien (seperti ini) sangat lambat, mahal, dan tidak direkomendasikan.
            </p>
        </div>
        <div class="card card-pad" style="margin-top: 1.5rem;">
            <h5 class="detail-section-title">Cara yang Benar (Via CLI)</h5>
            <p class="helper-text" style="margin-bottom: 1rem;">
                Untuk mereset data pengembangan, cara terbaik adalah menggunakan <strong>Firebase CLI</strong> di komputer Anda. Pastikan Anda sudah login ke akun Firebase yang benar.
            </p>
            <pre class="code-block"><code>firebase firestore:delete --all-collections --project NAMA_PROJECT_ANDA -y</code></pre>
            <p class="helper-text" style="margin-top: 1rem; color: var(--danger-strong);">
                <strong>PERINGATAN:</strong> Perintah ini tidak dapat dibatalkan dan akan menghapus semua data (termasuk data 'members' dan 'settings').
            </p>
        </div>
    `;
    
    const footer = `<button type="button" class="btn btn-secondary" data-action="history-back">Saya Mengerti</button>`;

    emit('ui.modal.create', 'dataDetail', { title, content, footer });
}

const BENEFICIARY_COLLECTION = 'penerimaManfaat';
const CHUNK_SIZE = 400;

function buildBeneficiaryQuery(filters = {}) {
    const collectionRef = collection(db, BENEFICIARY_COLLECTION);
    const constraints = [];
    Object.entries(filters || {}).forEach(([field, value]) => {
        if (value === undefined || value === null) return;
        const normalizedValue = typeof value === 'string' ? value.trim() : value;
        if (normalizedValue !== '') {
            constraints.push(where(field, '==', normalizedValue));
        }
    });
    return constraints.length > 0 ? query(collectionRef, ...constraints) : collectionRef;
}

function prepareBeneficiaryPayload(data = {}, includeCreatedAt = false) {
    const payload = {};
    Object.entries(data || {}).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        const normalizedKey = typeof key === 'string' ? key.trim() : key;
        if (!normalizedKey) return;
        if (typeof value === 'string') {
            const trimmedValue = value.trim();
            if (trimmedValue === '') return;
            payload[normalizedKey] = trimmedValue;
        } else {
            payload[normalizedKey] = value;
        }
    });
    payload.updatedAt = serverTimestamp();
    if (includeCreatedAt) {
        payload.createdAt = serverTimestamp();
    }
    return payload;
}

export async function getBeneficiaries(filters = {}) {
    try {
        const queryTarget = buildBeneficiaryQuery(filters);
        const snapshot = await getDocs(queryTarget);
        const items = [];
        snapshot.forEach((docSnap) => {
            items.push({ id: docSnap.id, ...docSnap.data() });
        });
        return items;
    } catch (error) {
        if (error?.code === 'failed-precondition') {
            console.error('[AdminService] Composite index missing for provided filters.', error);
            throw new Error("Filter requires a composite index. Check browser console for link.");
        }
        throw error;
    }
}

export async function batchImportBeneficiaries(dataArray = []) {
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
        throw new Error('Tidak ada data yang dapat diimpor.');
    }
    const rows = dataArray.filter(row => row && Object.keys(row).length > 0);
    if (rows.length === 0) {
        throw new Error('Format data tidak valid.');
    }
    try {
        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
            const batch = writeBatch(db);
            const chunk = rows.slice(i, i + CHUNK_SIZE);
            chunk.forEach((entry) => {
                const docRef = doc(collection(db, BENEFICIARY_COLLECTION));
                batch.set(docRef, prepareBeneficiaryPayload(entry, true));
            });
            await batch.commit();
        }
    } catch (error) {
        console.error('[AdminService] Batch import failed.', error);
        throw error;
    }
}

export async function addBeneficiary(data = {}) {
    const docRef = await addDoc(collection(db, BENEFICIARY_COLLECTION), prepareBeneficiaryPayload(data, true));
    return docRef.id;
}

export async function updateBeneficiary(docId, dataToUpdate = {}) {
    if (!docId) {
        throw new Error('ID dokumen wajib diisi untuk memperbarui data.');
    }
    const docRef = doc(db, BENEFICIARY_COLLECTION, docId);
    await updateDoc(docRef, prepareBeneficiaryPayload(dataToUpdate, false));
}

export async function deleteBeneficiary(docId) {
    if (!docId) {
        throw new Error('ID dokumen wajib diisi untuk menghapus data.');
    }
    await deleteDoc(doc(db, BENEFICIARY_COLLECTION, docId));
}

export const adminPanelService = {
    getBeneficiaries,
    batchImportBeneficiaries,
    addBeneficiary,
    updateBeneficiary,
    deleteBeneficiary,
};

if (typeof window !== 'undefined') {
    window.adminService = Object.assign({}, window.adminService || {}, adminPanelService);
}

