// js/services/data/jurnalService.js

import { emit, on } from "../../state/eventBus.js";
import { appState } from "../../state/appState.js";
import { localDB, loadAllLocalDataToState } from "../localDbService.js";
import { db, billsCol, attendanceRecordsCol, workersCol, professionsCol } from "../../config/firebase.js";
import { getDocs, query, where, writeBatch, doc, collection, serverTimestamp, increment, getDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { generateUUID, getJSDate, parseLocalDate, getLocalDayBounds } from "../../utils/helpers.js";
import { requestSync } from "../syncService.js";
import { toast } from "../../ui/components/toast.js";
import { _logActivity } from "../logService.js";
import { fmtIDR, parseFormattedNumber } from "../../utils/formatters.js";
import { createTabsHTML } from "../../ui/components/tabs.js";
import { getEmptyStateHTML } from "../../ui/components/emptyState.js";
import { _getRekapGajiListHTML } from "../../ui/components/cards.js";
import { createListSkeletonHTML } from "../../ui/components/skeleton.js";
import { showDetailPane, createModal, closeModal } from "../../ui/components/modal.js";
import { validateForm } from "../../utils/validation.js";
import { queueOutbox } from "../outboxService.js";

function createIcon(iconName, size = 18, classes = '') {
    // ... (fungsi createIcon tetap ada jika diperlukan, misal untuk handleDeleteSalaryBill) ...
    const icons = {
        save: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-save ${classes}"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
    };
    return icons[iconName] || '';
}

// --- FUNGSI LAMA DIHAPUS ---
// openSalaryRecapPanel() -> Dihapus
// _renderRekapGajiForm() -> Dihapus
// _renderRekapGajiHistory() -> Dihapus
// generateSalaryRecap() -> Dihapus
// handleGenerateBulkSalaryBill() -> Dihapus
// handlePaySingleWorkerFromRecap() -> Dihapus
// handleRecalculateWages() -> Dihapus
// handleGenerateDailyBill() -> Dihapus (dari langkah kita sebelumnya)

async function _executeGenerateBillForWorker(worker, recordsToPay, grandTotal) {
    if (!worker || !recordsToPay || recordsToPay.length === 0 || grandTotal <= 0) {
        toast('error', 'Data tidak valid untuk membuat tagihan.');
        return;
    }

    const dates = recordsToPay.map(rec => getJSDate(rec.date).getTime());
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));

    const allRecordIds = recordsToPay.map(rec => rec.id);
    
    const description = `Gaji: ${worker.workerName}`;
    
    toast('syncing', 'Membuat tagihan gaji...');
    try {
        const billId = generateUUID();
        const newBillData = {
            id: billId,
            description,
            amount: grandTotal,
            paidAmount: 0,
            dueDate: new Date(),
            status: 'unpaid',
            type: 'gaji',
            workerId: worker.id,
            workerDetails: [{ 
                id: worker.id, 
                name: worker.workerName, 
                amount: grandTotal, 
                recordIds: allRecordIds 
            }], 
            recordIds: allRecordIds,
            startDate: minDate.toISOString(),
            endDate: maxDate.toISOString(),
            createdAt: new Date(),
            isDeleted: 0,
            syncState: 'pending_create'
        };

        await localDB.transaction('rw', localDB.bills, localDB.attendance_records, localDB.outbox, async () => {
            await localDB.bills.add(newBillData);
            await queueOutbox({ table: 'bills', docId: billId, op: 'upsert', payload: newBillData, priority: 7 });
            
            const attendanceUpdate = { isPaid: true, billId: billId, syncState: 'pending_update', updatedAt: new Date() };
            await localDB.attendance_records.where('id').anyOf(allRecordIds).modify(attendanceUpdate);
            
            for (const recordId of allRecordIds) {
                await queueOutbox({ 
                    table: 'attendance_records', 
                    docId: recordId, 
                    op: 'upsert', 
                    payload: { id: recordId, isPaid: true, billId: billId, syncState: 'pending_update', updatedAt: new Date() }, 
                    priority: 6 
                });
            }
        });
        
        _logActivity(`Membuat Tagihan Gaji: ${worker.workerName}`, { billId, amount: grandTotal });
        toast('success', 'Tagihan gaji berhasil dibuat.');
        
        requestSync({ silent: true });
        await loadAllLocalDataToState();
        emit('ui.page.render'); // Render ulang halaman Jurnal

    } catch (error) {
        toast('error', 'Gagal membuat tagihan gaji.');
        console.error('Error generating worker salary bill:', error);
    }
}

export async function openGenerateBillConfirmModal(dataset) {
    const { workerId } = dataset;
    if (!workerId) {
        toast('error', 'ID Pekerja tidak ditemukan.');
        return;
    }

    const worker = appState.workers.find(w => w.id === workerId);
    if (!worker) {
        toast('error', 'Data pekerja tidak ditemukan.');
        return;
    }
    
    const recordsToPay = await localDB.attendance_records
        .where('workerId').equals(workerId)
        .and(rec => rec.isDeleted === 0 && (rec.isPaid === 0 || rec.isPaid === false))
        .filter(rec => (rec.totalPay || 0) > 0)
        .toArray();

    if (recordsToPay.length === 0) {
        toast('info', `Tidak ada upah yang belum dibayar untuk ${worker.workerName}.`);
        return;
    }

    const grandTotal = recordsToPay.reduce((sum, rec) => sum + (rec.totalPay || 0), 0);

    // --- MODAL KONFIRMASI (Req 1) ---
    emit('ui.modal.create', 'confirmGenerateBill', {
        message: `Anda akan membuat 1 tagihan gaji untuk <strong>${worker.workerName}</strong> sebesar <strong>${fmtIDR(grandTotal)}</strong> (dari ${recordsToPay.length} absensi). Lanjutkan?`,
        onConfirm: () => { 
            // Panggil fungsi eksekusi internal
            _executeGenerateBillForWorker(worker, recordsToPay, grandTotal);
        }
    });
}

export async function handleGenerateBillForWorker(dataset) {
    const { workerId } = dataset;
    if (!workerId) {
        toast('error', 'ID Pekerja tidak ditemukan.');
        return;
    }

    const worker = appState.workers.find(w => w.id === workerId);
    if (!worker) {
        toast('error', 'Data pekerja tidak ditemukan.');
        return;
    }
    
    // 1. Cari semua absensi yang belum dibayar untuk pekerja ini
    const recordsToPay = await localDB.attendance_records
        .where({ workerId: workerId, isPaid: false, isDeleted: 0 })
        .filter(rec => (rec.totalPay || 0) > 0)
        .toArray();

    if (recordsToPay.length === 0) {
        toast('info', `Tidak ada upah yang belum dibayar untuk ${worker.workerName}.`);
        return;
    }

    // 2. Hitung total
    const grandTotal = recordsToPay.reduce((sum, rec) => sum + (rec.totalPay || 0), 0);
    const allRecordIds = recordsToPay.map(rec => rec.id);
    const description = `Tagihan Gaji - ${worker.workerName}`;

    // 3. Tampilkan konfirmasi
    emit('ui.modal.create', 'confirmGenerateBill', {
        message: `Anda akan membuat 1 tagihan gaji untuk <strong>${worker.workerName}</strong> sebesar <strong>${fmtIDR(grandTotal)}</strong> (dari ${recordsToPay.length} absensi). Lanjutkan?`,
        onConfirm: async () => { 
            toast('syncing', 'Membuat tagihan gaji...');
            try {
                const billId = generateUUID();
                const newBillData = {
                    id: billId,
                    description,
                    amount: grandTotal,
                    paidAmount: 0,
                    dueDate: new Date(), // Tagihan dibuat hari ini
                    status: 'unpaid',
                    type: 'gaji',
                    workerId: worker.id, // Simpan ID pekerja
                    // workerDetails penting untuk ditampilkan di list tagihan
                    workerDetails: [{ 
                        id: worker.id, 
                        name: worker.workerName, 
                        amount: grandTotal, 
                        recordIds: allRecordIds 
                    }], 
                    recordIds: allRecordIds,
                    createdAt: new Date(),
                    isDeleted: 0,
                    syncState: 'pending_create'
                };

                // 4. Simpan ke DB Lokal dan Outbox via Transaksi
                await localDB.transaction('rw', localDB.bills, localDB.attendance_records, localDB.outbox, async () => {
                    // Simpan tagihan baru
                    await localDB.bills.add(newBillData);
                    await queueOutbox({ table: 'bills', docId: billId, op: 'upsert', payload: newBillData, priority: 7 });
                    
                    // Update absensi yang terkait
                    const attendanceUpdate = { isPaid: true, billId: billId, syncState: 'pending_update', updatedAt: new Date() };
                    await localDB.attendance_records.where('id').anyOf(allRecordIds).modify(attendanceUpdate);
                    
                    // Antrikan update absensi
                    for (const recordId of allRecordIds) {
                        await queueOutbox({ 
                            table: 'attendance_records', 
                            docId: recordId, 
                            op: 'upsert', 
                            payload: { id: recordId, isPaid: true, billId: billId, syncState: 'pending_update', updatedAt: new Date() }, 
                            priority: 6 
                        });
                    }
                });
                
                _logActivity(`Membuat Tagihan Gaji: ${worker.workerName}`, { billId, amount: grandTotal });
                toast('success', 'Tagihan gaji berhasil dibuat.');
                
                requestSync({ silent: true });
                await loadAllLocalDataToState(); // Muat ulang state
                emit('ui.page.render'); // Render ulang halaman Jurnal

            } catch (error) {
                toast('error', 'Gagal membuat tagihan gaji.');
                console.error('Error generating worker salary bill:', error);
            }
        }
    });
}

// --- FUNGSI LAMA YANG MASIH RELEVAN ---

/**
 * (Tetap Dipertahankan)
 * Menghapus tagihan gaji dan mengembalikan status absensi terkait.
 */
export async function handleDeleteSalaryBill(billId) {
    // ... (Logika fungsi ini tetap sama seperti di file js/services/data/jurnalService.js) ...
    // [Anda bisa salin-tempel kode lengkapnya dari file yang diunggah]
    emit('ui.modal.create', 'confirmDelete', {
        message: 'Membatalkan rekap akan menghapus tagihan ini dan mengembalikan status absensi terkait menjadi "belum dibayar". Lanjutkan?',
        onConfirm: async () => {
            toast('syncing', 'Membatalkan rekap...');
            try {
                const bill = await localDB.bills.get(billId);
                if (!bill) throw new Error('Tagihan tidak ditemukan');
                
                const hasPayments = await localDB.pending_payments.where({billId}).count() > 0;
                if(hasPayments){
                     throw new Error(`Tagihan ini tidak bisa dibatalkan karena sudah memiliki riwayat pembayaran.`);
                }
                
                const recordIds = bill.recordIds || [];
                
                await localDB.transaction('rw', localDB.bills, localDB.attendance_records, localDB.outbox, async () => {
                    const billUpdate = { isDeleted: 1, syncState: 'pending_update', updatedAt: new Date() };
                    await localDB.bills.update(billId, billUpdate);
                    await queueOutbox({ table: 'bills', docId: billId, op: 'upsert', payload: { id: billId, ...billUpdate }, priority: 5 });

                    if (recordIds.length > 0) {
                        const attUpdate = { isPaid: false, billId: null, syncState: 'pending_update', updatedAt: new Date() };
                        await localDB.attendance_records.where('id').anyOf(recordIds).modify(attUpdate);
                        for (const recordId of recordIds) {
                            await queueOutbox({ table: 'attendance_records', docId: recordId, op: 'upsert', payload: { id: recordId, ...attUpdate }, priority: 5 });
                        }
                    }
                });
                
                _logActivity(`Membatalkan Rekap Gaji (Lokal)`, { billId });
                requestSync({ silent: true });
                toast('success', 'Rekap gaji berhasil dibatalkan.');
                
                await loadAllLocalDataToState();
                emit('ui.animate.removeItem', `bill-${billId}`);

            } catch (error) {
                console.error('Error deleting salary bill:', error);
                toast('error', error.message || 'Gagal membatalkan rekap.');
            }
        }
    });
}

export async function openDailyProjectPickerForEdit(dateStr) {
    const { startOfDay, endOfDay } = getLocalDayBounds(dateStr);
    const records = (appState.attendanceRecords || []).filter(rec => {
        const recDate = getJSDate(rec.date);
        return recDate >= startOfDay && recDate <= endOfDay && !rec.isDeleted && rec.projectId;
    });
    const projectIds = [...new Set(records.map(r => r.projectId))];
    const projects = (appState.projects || []).filter(p => projectIds.includes(p.id));

    if (projects.length === 0) {
        toast('info', 'Tidak ada absensi berproyek untuk diedit pada hari ini.');
        return;
    }

    if (projects.length === 1) {
        emit('ui.jurnal.openDailyEditorPanel', { dateStr, projectId: projects[0].id });
        return;
    }

    const content = `
        <div class="dense-list-container">
            <p class="helper-text" style="text-align: center; margin-bottom: 1rem;">Pilih proyek yang ingin Anda edit absensinya untuk tanggal ${parseLocalDate(dateStr).toLocaleDateString('id-ID')}:</p>
            ${projects.map(p => `
                <button class="dense-list-item btn btn-ghost" data-action="select-project-for-edit" data-project-id="${p.id}" data-date-str="${dateStr}">
                    <div class="item-main-content">
                        <strong class="item-title">${p.projectName}</strong>
                    </div>
                </button>
            `).join('')}
        </div>`;
    
    const isMobile = window.matchMedia('(max-width: 599px)').matches;
    const modal = createModal('dataDetail', { 
        title: 'Pilih Proyek untuk Diedit', 
        content 
    });

    if (isMobile) {
        modal.classList.add('is-bottom-sheet');
    }

    // Ambil controller yang sudah dibuat oleh createModal
    const controller = modal.__controller;
    if (!controller) {
        console.warn('Modal controller not found for openDailyProjectPickerForEdit');
        return;
    }
    const { signal } = controller;

    modal.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="select-project-for-edit"]');
        if (btn) {
            e.stopPropagation(); 
            const { projectId, dateStr } = btn.dataset;
            // Tidak perlu panggil controller.abort() secara manual di sini,
            // karena closeModal(modal) akan menanganinya.
            closeModal(modal);
            emit('ui.jurnal.openDailyEditorPanel', { dateStr, projectId });
        }
    }, { signal });
}