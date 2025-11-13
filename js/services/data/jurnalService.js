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
// --- PERUBAHAN: Menambahkan impor $ (utility DOM) ---
import { $ } from "../../utils/dom.js";

function createIcon(iconName, size = 18, classes = '') {
    // ... (fungsi createIcon tetap ada jika diperlukan, misal untuk handleDeleteSalaryBill) ...
    const icons = {
        save: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-save ${classes}"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
    };
    return icons[iconName] || '';
}

// --- FUNGSI LAMA DIHAPUS ---
// (Fungsi-fungsi lama yang tidak relevan telah dihapus)

async function _executeGenerateBillForWorker(worker, recordsToPay, grandTotal) {
    if (!worker || !recordsToPay || recordsToPay.length === 0 || grandTotal <= 0) {
        toast('error', 'Data tidak valid untuk membuat tagihan.');
        return;
    }

    const dates = recordsToPay.map(rec => getJSDate(rec.date).getTime());
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));

    const allRecordIds = recordsToPay.map(rec => rec.id);
    
    // --- PERUBAHAN: Deskripsi tagihan menyertakan rentang tanggal ---
    const description = `Gaji: ${worker.workerName} (${minDate.toLocaleDateString('id-ID')} - ${maxDate.toLocaleDateString('id-ID')})`;
    
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
            startDate: minDate, // --- PERUBAHAN: Simpan sebagai objek Date ---
            endDate: maxDate,   // --- PERUBAHAN: Simpan sebagai objek Date ---
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
    
    // --- PERUBAHAN: Ambil rentang tanggal dari UI ---
    // Asumsi ID elemen di halaman Jurnal adalah #jurnal-start-date dan #jurnal-end-date
    const startDateStr = $('#jurnal-start-date')?.value;
    const endDateStr = $('#jurnal-end-date')?.value;

    if (!startDateStr || !endDateStr) {
        toast('error', 'Silakan tentukan rentang tanggal di bagian atas halaman Jurnal.');
        return;
    }
    
    const startDate = parseLocalDate(startDateStr);
    startDate.setHours(0, 0, 0, 0);
    const endDate = parseLocalDate(endDateStr);
    endDate.setHours(23, 59, 59, 999);
    // --- AKHIR PERUBAHAN ---
    
    // --- PERUBAHAN: Modifikasi kueri untuk menyertakan filter tanggal ---
    const recordsToPay = await localDB.attendance_records
        .where('workerId').equals(workerId)
        .and(rec => 
            rec.isDeleted === 0 && 
            (rec.isPaid === 0 || rec.isPaid === false) &&
            (rec.totalPay || 0) > 0
        )
        .filter(rec => { // Terapkan filter tanggal secara manual
            const recDate = getJSDate(rec.date);
            return recDate >= startDate && recDate <= endDate;
        })
        .toArray();
    // --- AKHIR PERUBAHAN ---

    if (recordsToPay.length === 0) {
        toast('info', `Tidak ada upah yang belum dibayar untuk ${worker.workerName} pada rentang tanggal ini.`);
        return;
    }

    const grandTotal = recordsToPay.reduce((sum, rec) => sum + (rec.totalPay || 0), 0);
    const formattedDateRange = `${startDate.toLocaleDateString('id-ID')} s/d ${endDate.toLocaleDateString('id-ID')}`;

    // --- MODAL KONFIRMASI (Req 1) ---
    emit('ui.modal.create', 'confirmGenerateBill', {
        // --- PERUBAHAN: Pesan konfirmasi menyertakan rentang tanggal ---
        message: `Anda akan membuat 1 tagihan gaji untuk <strong>${worker.workerName}</strong> sebesar <strong>${fmtIDR(grandTotal)}</strong> (dari ${recordsToPay.length} absensi antara ${formattedDateRange}). Lanjutkan?`,
        onConfirm: () => { 
            // Panggil fungsi eksekusi internal
            _executeGenerateBillForWorker(worker, recordsToPay, grandTotal);
        }
    });
}

/**
 * @deprecated Fungsi ini mungkin duplikat dari openGenerateBillConfirmModal. 
 * Disarankan untuk menggunakan openGenerateBillConfirmModal.
 * Saya tetap memperbaruinya agar konsisten.
 */
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
    
    // --- PERUBAHAN: Ambil rentang tanggal dari UI ---
    const startDateStr = $('#jurnal-start-date')?.value;
    const endDateStr = $('#jurnal-end-date')?.value;

    if (!startDateStr || !endDateStr) {
        toast('error', 'Silakan tentukan rentang tanggal di bagian atas halaman Jurnal.');
        return;
    }
    
    const startDate = parseLocalDate(startDateStr);
    startDate.setHours(0, 0, 0, 0);
    const endDate = parseLocalDate(endDateStr);
    endDate.setHours(23, 59, 59, 999);
    // --- AKHIR PERUBAHAN ---

    // --- PERUBAHAN: Modifikasi kueri untuk menyertakan filter tanggal ---
    const recordsToPay = await localDB.attendance_records
        .where({ workerId: workerId, isPaid: false, isDeleted: 0 })
        .filter(rec => 
            (rec.totalPay || 0) > 0 &&
            getJSDate(rec.date) >= startDate && 
            getJSDate(rec.date) <= endDate
        )
        .toArray();
    // --- AKHIR PERUBAHAN ---

    if (recordsToPay.length === 0) {
        toast('info', `Tidak ada upah yang belum dibayar untuk ${worker.workerName} pada rentang tanggal ini.`);
        return;
    }

    // 2. Hitung total
    const grandTotal = recordsToPay.reduce((sum, rec) => sum + (rec.totalPay || 0), 0);
    const allRecordIds = recordsToPay.map(rec => rec.id);
    const minDate = new Date(Math.min(...recordsToPay.map(r => getJSDate(r.date).getTime())));
    const maxDate = new Date(Math.max(...recordsToPay.map(r => getJSDate(r.date).getTime())));
    
    // --- PERUBAHAN: Deskripsi tagihan menyertakan rentang tanggal ---
    const description = `Gaji: ${worker.workerName} (${minDate.toLocaleDateString('id-ID')} - ${maxDate.toLocaleDateString('id-ID')})`;
    const formattedDateRange = `${startDate.toLocaleDateString('id-ID')} s/d ${endDate.toLocaleDateString('id-ID')}`;

    // 3. Tampilkan konfirmasi
    emit('ui.modal.create', 'confirmGenerateBill', {
        // --- PERUBAHAN: Pesan konfirmasi menyertakan rentang tanggal ---
        message: `Anda akan membuat 1 tagihan gaji untuk <strong>${worker.workerName}</strong> sebesar <strong>${fmtIDR(grandTotal)}</strong> (dari ${recordsToPay.length} absensi antara ${formattedDateRange}). Lanjutkan?`,
        onConfirm: async () => { 
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
                    startDate: minDate, // --- PERUBAHAN: Simpan sebagai objek Date ---
                    endDate: maxDate,   // --- PERUBAHAN: Simpan sebagai objek Date ---
                    createdAt: new Date(),
                    isDeleted: 0,
                    syncState: 'pending_create'
                };

                // 4. Simpan ke DB Lokal dan Outbox via Transaksi
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
                emit('ui.page.render'); 

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
    const projectIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-building2-icon lucide-building-2"><path d="M10 12h4"/><path d="M10 8h4"/><path d="M14 21v-3a2 2 0 0 0-4 0v3"/><path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"/><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/></svg>`;
    const content = `<div class="picker-container">
        <div class="helper-text">Pilih proyek yang ingin Anda edit absensinya untuk tanggal ${parseLocalDate(dateStr).toLocaleDateString('id-ID')}:
            </div>
                <div class="picker-grid">
                    ${projects.map(p => `
                        <button class="project-picker-item btn btn-ghost" data-action="select-project-for-edit" data-project-id="${p.id}" data-date-str="${dateStr}">${projectIconSvg}
                        <span class="picker-item-label">${p.projectName}</span>
                        </button>
                    `).join('')}
                    </div>
                </div>`;
                const isMobile = window.matchMedia('(max-width: 599px)').matches;
                const modal = createModal('dataDetail', { 
           title: 'Pilih Proyek untuk Diedit', 
           content,
           isUtility: true
       });
   
       if (isMobile) {
           modal.classList.add('is-bottom-sheet');
       }
   
       modal.addEventListener('click', (e) => {
           const btn = e.target.closest('[data-action="select-project-for-edit"]');
           if (btn) {
               e.stopPropagation(); 
               const { projectId, dateStr } = btn.dataset;
               closeModal(modal);
               emit('ui.jurnal.openDailyEditorPanel', { dateStr, projectId });
           }
       });
   }