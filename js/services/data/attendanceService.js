import { emit, on } from "../../state/eventBus.js";
import { appState } from "../../state/appState.js";
import { localDB, loadAllLocalDataToState } from "../localDbService.js";
import { db, attendanceRecordsCol, workersCol, projectsCol, billsCol } from "../../config/firebase.js";
import { doc, runTransaction, Timestamp, writeBatch, getDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { generateUUID, getJSDate, isViewer, parseLocalDate, getLocalDayBounds } from "../../utils/helpers.js";
import { requestSync } from "../syncService.js";
import { queueOutbox } from "../outboxService.js";
import { toast } from "../../ui/components/toast.js";
import { _logActivity } from "../logService.js";
import { parseFormattedNumber, fmtIDR } from "../../utils/formatters.js";
import { showDetailPane, createModal, closeModal, closeDetailPane, closeDetailPaneImmediate, hideMobileDetailPage, resetFormDirty } from "../../ui/components/modal.js";
import { createMasterDataSelect, initCustomSelects, formatNumberInput } from "../../ui/components/forms/index.js";
import { fetchAndCacheData } from "./fetch.js";
import { createUnifiedCard } from "../../ui/components/cards.js";

function createIcon(iconName, size = 18, classes = '') {
    const icons = {
        save: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-save ${classes}"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
        edit: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pencil ${classes}"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
        'hard-hat': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-hard-hat ${classes}"><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M14 6a6 6 0 0 1 6 6v3"/><path d="M4 15v-3a6 6 0 0 1 6-6"/><rect x="2" y="15" width="20" height="4" rx="1"/></svg>`,
        settings: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings ${classes}"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2l-.15.1a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1 0-2l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
        'chevron-down': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down ${classes}"><path d="m6 9 6 6 6-6"/></svg>`,
        'receipt-text': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-receipt-text ${classes}"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1Z"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/></svg>`,
        'book-text': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-book-text ${classes}"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M8 7h6"/><path d="M8 11h8"/></svg>`,
    };
    return icons[iconName] || '';
}

export async function handleCheckIn(workerId) {
    const projectId = document.getElementById('attendance-project-id')?.value;
    if (!projectId) {
        toast('error', 'Silakan pilih proyek terlebih dahulu.');
        return;
    }

    toast('syncing', 'Mencatat jam masuk lokal...');
    try {
        const worker = appState.workers.find(w => w.id === workerId);
        if (!worker) throw new Error('Pekerja tidak ditemukan');

        const { startOfDay, endOfDay } = getLocalDayBounds(now.toISOString().slice(0, 10));

        const existingRecord = await localDB.attendance_records
            .where('workerId').equals(workerId)
            .and(record => {
                const recDate = getJSDate(record.date);
                return recDate >= startOfDay && recDate <= endOfDay && record.isDeleted !== 1;
            })
            .first();

        if (existingRecord) {
            toast('error', `${worker.workerName} sudah tercatat absensinya hari ini.`);
            return;
        }


        const dailyWage = worker.projectWages?.[projectId] || 0;
        const hourlyWage = dailyWage / 8;
        const attendanceData = {
            workerId,
            projectId,
            workerName: worker.workerName,
            hourlyWage,
            date: now,
            checkIn: now,
            status: 'checked_in',
            type: 'timestamp',
            syncState: 'pending_create',
            isPaid: false,
            isDeleted: 0,
            id: generateUUID(),
        };

        await localDB.attendance_records.add(attendanceData);
        await queueOutbox({ table: 'attendance_records', docId: attendanceData.id, op: 'upsert', payload: attendanceData, priority: 6 });

        _logActivity(`Check-in Pekerja (Lokal): ${worker.workerName}`, {
            workerId,
            projectId
        });
        toast('success', `${worker.workerName} berhasil check in.`);

        await loadAllLocalDataToState();
        emit('ui.absensi.renderContent');

        requestSync({ silent: true });
    } catch (error) {
        toast('error', 'Gagal melakukan check in.');
        console.error(error);
    }
}

export async function handleCheckOut(recordId) {
    toast('syncing', 'Mencatat jam keluar lokal...');
    try {
        const record = appState.attendanceRecords.find(r => r.id === recordId);
        if (!record) throw new Error('Data absensi tidak ditemukan di state');

        const now = new Date();
        const checkOutTime = now;
        const checkInTime = getJSDate(record.checkIn);

        const hours = (checkOutTime - checkInTime) / 3600000;
        const normalHours = Math.min(hours, 8);
        const overtimeHours = Math.max(0, hours - 8);

        const hourlyWage = record.hourlyWage || 0;
        const normalPay = normalHours * hourlyWage;
        const overtimePay = overtimeHours * hourlyWage * 1.5;
        const totalPay = normalPay + overtimePay;

        const dataToUpdate = {
            checkOut: checkOutTime,
            status: 'completed',
            workHours: hours,
            normalHours,
            overtimeHours,
            totalPay,
            syncState: 'pending_update'
        };

        await localDB.attendance_records.update(record.id, dataToUpdate);
        await queueOutbox({ table: 'attendance_records', docId: record.id, op: 'upsert', payload: { id: record.id, ...dataToUpdate }, priority: 6 });

        _logActivity(`Check-out Pekerja (Lokal): ${record.workerName}`, {
            recordId: record.id,
            totalPay
        });
        toast('success', `${record.workerName} berhasil check out.`);

        await loadAllLocalDataToState();
        emit('ui.absensi.renderContent');

        requestSync({ silent: true });
    } catch (error) {
        toast('error', 'Gagal melakukan check out.');
        console.error(error);
    }
}

export async function handleUpdateAttendance(form) {
    const recordId = form.dataset.id;
    const recordType = form.dataset.type;
    const record = appState.attendanceRecords.find(r => r.id === recordId);
    if (!record) {
        toast('error', 'Data absensi asli tidak ditemukan.');
        return;
    }

    const attendanceDate = getJSDate(record.date);
    if (isNaN(attendanceDate.getTime())) {
        toast('error', 'Tanggal absensi tidak valid.');
        return;
    }
    const { startOfDay, endOfDay } = getLocalDayBounds(attendanceDate.toISOString().slice(0, 10));

    const existingOtherRecord = await localDB.attendance_records
        .where('workerId').equals(record.workerId)
        .and(r => r.id !== recordId && r.date >= startOfDay && r.date <= endOfDay && r.isDeleted !== 1)
        .first();

    if (existingOtherRecord) {
        toast('error', `${record.workerName} sudah memiliki absensi lain pada tanggal ${attendanceDate.toLocaleDateString('id-ID')}.`);
        return;
    }

    let bill = null;
    let paymentForWorker = null;
    if (record.billId) {
        bill = appState.bills.find(b => b.id === record.billId) || await localDB.bills.get(record.billId);
        if (bill?.status === 'paid') {
            toast('error', 'Tidak dapat mengedit absensi. Rekap gaji terkait sudah lunas.');
            return;
        }
        if (bill) {
            paymentForWorker = await localDB.pending_payments
                .where({ billId: record.billId, workerId: record.workerId })
                .first();
            if (paymentForWorker) {
                toast('error', 'Tidak dapat mengedit absensi. Sudah ada pembayaran individual untuk pekerja ini di rekap terkait.');
                return;
            }
        }
    }

    toast('syncing', 'Memperbarui absensi...');
    try {
        const dataToUpdate = {};
        let newTotalPay = record.totalPay;
        if (recordType === 'manual') {
            const newStatus = form.elements.status.value;
            const newProjectId = form.elements['edit-attendance-project'].value;
            const newJobRole = form.elements['edit-attendance-role'].value;
            const customWage = parseFormattedNumber(form.elements.customWage.value);
            let baseWage = 0;
            if (customWage > 0) {
                baseWage = customWage;
            } else if (newProjectId && newJobRole) {
                const worker = appState.workers.find(w => w.id === record.workerId);
                baseWage = worker?.projectWages?.[newProjectId]?.[newJobRole] || 0;
            }
            if (newStatus === 'full_day') newTotalPay = baseWage;
            else if (newStatus === 'half_day') newTotalPay = baseWage / 2;
            else newTotalPay = 0;
            dataToUpdate.attendanceStatus = newStatus;
            dataToUpdate.totalPay = newTotalPay;
            dataToUpdate.projectId = newProjectId;
            dataToUpdate.jobRole = newJobRole;
            dataToUpdate.customWage = customWage > 0 ? customWage : null;
            dataToUpdate.dailyWage = customWage > 0 ? 0 : baseWage;
        } else {
            const date = getJSDate(record.date);
            const [inH, inM] = form.elements.checkIn.value.split(':');
            const newCheckIn = new Date(date);
            newCheckIn.setHours(inH, inM);
            dataToUpdate.checkIn = Timestamp.fromDate(newCheckIn);
            if (form.elements.checkOut.value) {
                const [outH, outM] = form.elements.checkOut.value.split(':');
                const newCheckOut = new Date(date);
                newCheckOut.setHours(outH, outM);
                if (newCheckOut < newCheckIn) {
                    toast('error', 'Jam keluar tidak boleh lebih awal dari jam masuk.');
                    return;
                }
                const hours = (newCheckOut - newCheckIn) / 3600000;
                const normalHours = Math.min(hours, 8);
                const overtimeHours = Math.max(0, hours - 8);
                const hourlyWage = record.hourlyWage || 0;
                const normalPay = normalHours * hourlyWage;
                const overtimePay = overtimeHours * hourlyWage * 1.5;
                newTotalPay = normalPay + overtimePay;
                dataToUpdate.checkOut = Timestamp.fromDate(newCheckOut);
                dataToUpdate.workHours = hours;
                dataToUpdate.normalHours = normalHours;
                dataToUpdate.overtimeHours = overtimeHours;
                dataToUpdate.totalPay = newTotalPay;
                dataToUpdate.status = 'completed';
            } else {
                newTotalPay = 0;
                dataToUpdate.checkOut = null;
                dataToUpdate.workHours = 0;
                dataToUpdate.totalPay = newTotalPay;
                dataToUpdate.status = 'checked_in';
            }
        }

        const deltaPay = newTotalPay - (record.totalPay || 0);

        if (bill && deltaPay !== 0) {
            await localDB.transaction('rw', localDB.attendance_records, localDB.bills, localDB.outbox, async () => {
                await localDB.attendance_records.update(recordId, { ...dataToUpdate, syncState: 'pending_update', updatedAt: new Date() });
                await queueOutbox({ table: 'attendance_records', docId: recordId, op: 'upsert', payload: { id: recordId, ...dataToUpdate }, priority: 6 });
                
                const newBillAmount = (bill.amount || 0) + deltaPay;
                const workerDetails = bill.workerDetails.map(w => {
                    if (w.id === record.workerId || w.workerId === record.workerId) {
                        return { ...w, amount: (w.amount || 0) + deltaPay };
                    }
                    return w;
                });
                const billUpdate = { amount: newBillAmount, workerDetails, syncState: 'pending_update', updatedAt: new Date() };
                await localDB.bills.update(bill.id, billUpdate);
                await queueOutbox({ table: 'bills', docId: bill.id, op: 'upsert', payload: { id: bill.id, ...billUpdate }, priority: 6 });
            });
        } else {
            await localDB.attendance_records.update(recordId, { ...dataToUpdate, syncState: 'pending_update', updatedAt: new Date() });
            await queueOutbox({ table: 'attendance_records', docId: recordId, op: 'upsert', payload: { id: recordId, ...dataToUpdate }, priority: 6 });
        }

        await _logActivity('Mengedit Absensi', { recordId, ...dataToUpdate });
        await toast('success', 'Absensi berhasil diperbarui.');

        emit('ui.modal.closeAll');

        await loadAllLocalDataToState();

        const detailJurnalTerbuka = appState.detailPaneHistory.some(h => h.title?.includes('Jurnal Harian'));
        if (detailJurnalTerbuka) {
            appState.detailPaneHistory = [];
            emit('jurnal.viewHarian', getJSDate(record.date).toISOString().slice(0, 10));
        } else {
            emit('ui.page.render');
        }

        requestSync({ silent: true });

    } catch (error) {
        toast('error', 'Gagal memperbarui absensi.');
        console.error(error);
    }
}


function _showPostSaveAttendanceDialog(summary) {
    const { totalPay, workerCount, dateStr, productiveEntries } = summary;
    
    if (workerCount === 0 && totalPay === 0) {
        toast('info', 'Absensi disimpan. Tidak ada pekerja hadir yang memiliki upah untuk ditagih.');
        return;
    }

    const formattedDate = parseLocalDate(dateStr).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    
    const modalContent = `
        <div class="success-preview-card" id="success-preview-card" style="padding: 0; background: transparent; border: none; box-shadow: none;">
            
            <div class="success-hero success-hero--attendance">
                 <svg class="success-hero-art" width="120" height="88" viewBox="0 0 120 88" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="ha1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="var(--primary)" stop-opacity="0.18" /><stop offset="100%" stop-color="var(--primary)" stop-opacity="0.05" /></linearGradient></defs><rect x="8" y="12" width="84" height="52" rx="10" fill="url(#ha1)" stroke="var(--line)"/><rect x="20" y="26" width="40" height="8" rx="4" fill="var(--primary)" opacity="0.25" /><rect x="20" y="40" width="30" height="8" rx="4" fill="var(--primary)" opacity="0.15" /></svg>
                 <div class="success-preview-icon">${createIcon('hard-hat', 28)}</div>
            </div>

            <h4 class="success-preview-title" style="margin-top: 1rem; font-size: 1.2rem;">Absensi Harian Telah Disimpan!</h4>
            
            <p class="success-preview-description" style="font-size: 0.9rem; text-align: left; max-width: 400px; margin: 0 auto 1.5rem auto;">
                Data absensi telah disimpan. Untuk melihat rekapitulasi upah per pekerja dan membuat tagihan gaji, silakan buka halaman <b>Jurnal</b> dan pilih tab <b>Per Pekerja</b>.
            </p>

            <dl class="detail-list" style="margin-top: 1rem; background-color: var(--surface-muted); border: 1px solid var(--line); border-radius: var(--radius); padding: 0.25rem 1rem;">
                <div><dt>Tanggal</dt><dd>${formattedDate}</dd></div>
                <div><dt>Pekerja Hadir</dt><dd>${workerCount} Orang</dd></div>
                <div><dt>Total Upah Hari Ini</dt><dd><strong>${fmtIDR(totalPay)}</strong></dd></div>
            </dl>
        </div>
    `;

    const footer = `
        <button type="button" class="btn btn-primary" data-action="close-modal-and-navigate" data-nav="jurnal">
            Lihat di Jurnal
        </button>
    `;

    const modal = createModal('formView', { 
        title: 'Absensi Tersimpan', 
        content: modalContent, 
        footer: footer, 
        isUtility: true // Mencegah konfirmasi "tutup" jika form-dirty
    });

    const navigateBtn = modal.querySelector('[data-action="close-modal-and-navigate"]');

    if (navigateBtn) {
        navigateBtn.addEventListener('click', () => {
            closeModal(modal); // Tutup modal ini
            emit('ui.navigate', 'jurnal'); // Navigasi ke jurnal
        });
    }

}

async function _confirmAndSaveAttendance(attendanceData) {
    const previewModal = document.getElementById('attendancePreview-modal');
    if (previewModal) closeModal(previewModal);

    const loadingToast = toast('syncing', 'Menyimpan absensi...');
    try {
        const { success, skipped, summary } = await handleSaveManualAttendance(attendanceData);
        
        if(loadingToast?.close) loadingToast.close();

        if (success) {
            appState.pendingAttendance.clear();
            _showPostSaveAttendanceDialog(summary);
            
            appState.absensi.manualListNeedsUpdate = true;
            emit('ui.absensi.renderManualForm');
            emit('ui.absensi.updateFooter');
        } else {
             if (skipped > 0) toast('warn', `Sebagian absensi disimpan. ${skipped} pekerja dilewati.`);
             else toast('error', 'Gagal menyimpan absensi.');
        }
    } catch (error) {
         if(loadingToast?.close) loadingToast.close();
         toast('error', `Terjadi kesalahan: ${error.message}`);
    }
}

export async function handleSaveAllPendingAttendance() {
    const pending = appState.pendingAttendance;
    if (!pending || pending.size === 0) {
        toast('info', 'Tidak ada data absensi untuk disimpan.');
        return;
    }

    const dateStr = appState.defaultAttendanceDate;
    const dateObj = parseLocalDate(dateStr);
    const { startOfDay, endOfDay } = getLocalDayBounds(dateStr);
    
    let totalPay = 0;
    let totalHadir = 0;
    let firstProjectId = null;
    let multipleProjects = false;

    pending.forEach(data => {
        const entries = Array.isArray(data) ? data : [data];
        entries.forEach(entry => {
            if (entry.status !== 'absent') {
                totalPay += entry.pay || 0;
                totalHadir++;
                if (firstProjectId === null) firstProjectId = entry.projectId;
                else if (firstProjectId !== entry.projectId) multipleProjects = true;
            }
        });
    });

    const projectName = multipleProjects ? 'Multi-Proyek' : (appState.projects.find(p => p.id === firstProjectId)?.projectName || 'Proyek');
    const formattedDate = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    emit('ui.modal.create', 'confirmUserAction', {
        title: 'Konfirmasi Simpan Absensi',
        message: `Anda akan menyimpan absensi untuk <strong>${totalHadir} pekerja hadir/khusus</strong> (Total Upah <strong>${fmtIDR(totalPay)}</strong>) dan menandai <strong>semua pekerja lain</strong> sebagai <strong>Absen</strong> pada tanggal <strong>${formattedDate}</strong>. Lanjutkan?`,
        onConfirm: async () => {
            const loadingToast = toast('syncing', 'Menyimpan absensi...');
            try {
                const { success, skipped, saved, summary } = await _executeSaveAttendance(dateStr);
                
                if(loadingToast?.close) loadingToast.close();

                if (success) {
                    appState.pendingAttendance.clear();
                    _showPostSaveAttendanceDialog(summary);
                    
                    appState.absensi.manualListNeedsUpdate = true;
                    emit('ui.absensi.renderManualForm');
                    emit('ui.absensi.updateFooter');
                } else {
                    if (skipped > 0) toast('warn', `Sebagian absensi disimpan. ${skipped} pekerja dilewati.`);
                    else toast('error', 'Gagal menyimpan absensi.');
                }
            } catch (error) {
                if(loadingToast?.close) loadingToast.close();
                toast('error', `Terjadi kesalahan: ${error.message}`);
            }
        }
    });
}

async function _executeSaveAttendance(dateStr) {
    const pending = appState.pendingAttendance;
    const dateObj = parseLocalDate(dateStr);
    const { startOfDay, endOfDay } = getLocalDayBounds(dateStr);
    
    const allWorkers = (appState.workers || []).filter(w => w.status === 'active' && !w.isDeleted);
    const pendingWorkerIds = new Set(pending.keys());
    const selectedWorkerIds = new Set(appState.selectionMode.selectedIds);
    
    const recordsToSave = [];
    const dbIdsToSoftDelete = new Set();
    let skippedCount = 0;

    try {
        const existingRecords = await localDB.attendance_records
            .where('date').between(startOfDay, endOfDay)
            .and(r => r.isDeleted !== 1)
            .toArray();
            
        const existingRecordsByWorker = new Map();
        existingRecords.forEach(r => {
            const list = existingRecordsByWorker.get(r.workerId) || [];
            list.push(r);
            existingRecordsByWorker.set(r.workerId, list);
        });

        for (const [workerId, data] of pending.entries()) {
            const worker = allWorkers.find(w => w.id === workerId);
            if (!worker) {
                skippedCount++;
                continue;
            }
            
            const entries = Array.isArray(data) ? data : [data];
            
            const oldRecords = existingRecordsByWorker.get(workerId) || [];
            oldRecords.forEach(r => dbIdsToSoftDelete.add(r.id));
            
            for (const entry of entries) {
                const isAbsent = entry.status === 'absent';
                recordsToSave.push({
                    id: generateUUID(),
                    workerId,
                    workerName: worker.workerName,
                    projectId: isAbsent ? null : entry.projectId,
                    jobRole: isAbsent ? null : entry.role,
                    date: dateObj,
                    attendanceStatus: entry.status,
                    totalPay: isAbsent ? 0 : (entry.pay || 0),
                    customWage: isAbsent ? null : (entry.customWage || null),
                    isPaid: false,
                    type: 'manual',
                    status: 'completed',
                    createdAt: new Date(),
                    isDeleted: 0,
                    syncState: 'pending_create'
                });
            }
        }

        const projectId = appState.manualAttendanceSelectedProjectId;
        if (projectId) {
            for (const workerId of selectedWorkerIds) {
                if (pendingWorkerIds.has(workerId)) continue; 

                const worker = allWorkers.find(w => w.id === workerId);
                if (!worker) {
                    skippedCount++;
                    continue;
                }

                const wages = (worker.projectWages || {})[projectId] || {};
                const role = worker.defaultRole || Object.keys(wages)[0] || '';
                const pay = wages[role] || 0;

                if (!role || pay <= 0) {
                    skippedCount++;
                    continue; 
                }

                const oldRecords = existingRecordsByWorker.get(workerId) || [];
                oldRecords.forEach(r => dbIdsToSoftDelete.add(r.id));

                recordsToSave.push({
                    id: generateUUID(),
                    workerId,
                    workerName: worker.workerName,
                    projectId: projectId,
                    jobRole: role,
                    date: dateObj,
                    attendanceStatus: 'full_day',
                    totalPay: pay,
                    customWage: null,
                    isPaid: false,
                    type: 'manual',
                    status: 'completed',
                    createdAt: new Date(),
                    isDeleted: 0,
                    syncState: 'pending_create'
                });
            }
        }

        for (const worker of allWorkers) {
            if (pendingWorkerIds.has(worker.id)) continue;
            if (selectedWorkerIds.has(worker.id)) continue;
            
            const oldRecords = existingRecordsByWorker.get(worker.id) || [];
            oldRecords.forEach(r => dbIdsToSoftDelete.add(r.id));
            
            recordsToSave.push({
                id: generateUUID(),
                workerId: worker.id,
                workerName: worker.workerName,
                projectId: null,
                jobRole: null,
                date: dateObj,
                attendanceStatus: 'absent',
                totalPay: 0,
                customWage: null,
                isPaid: false,
                type: 'manual',
                status: 'completed',
                createdAt: new Date(),
                isDeleted: 0,
                syncState: 'pending_create'
            });
        }
        
        await localDB.transaction('rw', localDB.attendance_records, localDB.outbox, async () => {
            if (dbIdsToSoftDelete.size > 0) {
                const ids = Array.from(dbIdsToSoftDelete);
                const deleteUpdate = { isDeleted: 1, syncState: 'pending_update', updatedAt: new Date() };
                await localDB.attendance_records.where('id').anyOf(ids).modify(deleteUpdate);
                for (const id of ids) {
                await queueOutbox({ table: 'attendance_records', docId: id, op: 'upsert', payload: { id, isDeleted: 1 }, priority: 5 });
                }
            }
            
            if (recordsToSave.length > 0) {
                await localDB.attendance_records.bulkAdd(recordsToSave);
                for (const record of recordsToSave) {
                    await queueOutbox({ table: 'attendance_records', docId: record.id, op: 'upsert', payload: record, priority: 6 });
                }
            }
        });

        _logActivity(`Menyimpan Absensi Manual (Lokal)`, { date: dateStr, count: recordsToSave.length, skipped: skippedCount });
        await loadAllLocalDataToState(); 
        requestSync({ silent: true }); 
        
        const productiveEntries = recordsToSave.filter(r => r.attendanceStatus !== 'absent');
        const totalPay = productiveEntries.reduce((sum, r) => sum + (r.totalPay || 0), 0);
        const workerCount = new Set(productiveEntries.map(r => r.workerId)).size;
        const allProjectIds = new Set(productiveEntries.map(r => r.projectId));
        const singleProjectId = allProjectIds.size === 1 ? [...allProjectIds][0] : null;

        return { 
            success: true, 
            skipped: skippedCount, 
            saved: recordsToSave.length,
            summary: {
                totalPay,
                workerCount,
                singleProjectId,
                dateStr,
                productiveEntries
            }
        };

    } catch (error) {
        console.error("Gagal menyimpan absensi manual (v3):", error);
        toast('error', `Gagal menyimpan absensi: ${error.message}`);
        return { success: false, skipped: entries ? entries.length : 0, summary: null }; // <--- Pastikan summary: null ada di sini
    }
}

export async function handleDeleteSingleAttendance(recordId) {
    const record = appState.attendanceRecords.find(r => r.id === recordId);
    if (!record) return;
    const worker = appState.workers.find(w => w.id === record.workerId);
    const message = worker ?
        `Hapus absensi untuk <strong>${worker.workerName}</strong> pada tanggal ${getJSDate(record.date).toLocaleDateString('id-ID')}?` :
        'Hapus data absensi ini?';

    emit('ui.modal.create', 'confirmDelete', {
        message,
        onConfirm: async () => {
            let bill = null;
            let paymentForWorker = null;
            if (record.billId) {
                bill = appState.bills.find(b => b.id === record.billId) || await localDB.bills.get(record.billId);
                if (bill?.status === 'paid') {
                    toast('error', 'Tidak dapat menghapus absensi. Rekap gaji terkait sudah lunas.');
                    return;
                }
                if (bill) {
                    paymentForWorker = await localDB.pending_payments
                        .where({ billId: record.billId, workerId: record.workerId })
                        .first();
                    if (paymentForWorker) {
                        toast('error', 'Tidak dapat menghapus absensi. Sudah ada pembayaran individual untuk pekerja ini di rekap terkait.');
                        return;
                    }
                }
            }

            try {
                if (bill) {
                    const deltaPay = -(record.totalPay || 0);
                    await localDB.transaction('rw', localDB.attendance_records, localDB.bills, localDB.outbox, async () => {
                    await localDB.attendance_records.update(recordId, { isDeleted: 1, syncState: 'pending_update', updatedAt: new Date() });
                    await queueOutbox({ table: 'attendance_records', docId: recordId, op: 'upsert', payload: { id: recordId, isDeleted: 1 }, priority: 5 });

                        const newBillAmount = (bill.amount || 0) + deltaPay;
                        const workerDetails = bill.workerDetails.map(w => {
                            if (w.id === record.workerId || w.workerId === record.workerId) {
                                const newWorkerAmount = (w.amount || 0) + deltaPay;
                                const newRecordIds = (w.recordIds || []).filter(id => id !== recordId);
                                return { ...w, amount: newWorkerAmount, recordIds: newRecordIds };
                            }
                            return w;
                        }).filter(w => (w.amount > 0 || w.recordIds.length > 0) || (w.id !== record.workerId && w.workerId !== record.workerId));

                        const newBillRecordIds = (bill.recordIds || []).filter(id => id !== recordId);

                        const billUpdate = { amount: newBillAmount, workerDetails, recordIds: newBillRecordIds, syncState: 'pending_update', updatedAt: new Date() };
                        await localDB.bills.update(bill.id, billUpdate);
                        await queueOutbox({ table: 'bills', docId: bill.id, op: 'upsert', payload: { id: bill.id, ...billUpdate }, priority: 5 });
                    });
                } else {
                    await localDB.attendance_records.update(recordId, { isDeleted: 1, syncState: 'pending_update', updatedAt: new Date() });
                    await queueOutbox({ table: 'attendance_records', docId: recordId, op: 'upsert', payload: { id: recordId, isDeleted: 1 }, priority: 5 });
                }


                emit('ui.animate.removeItem', `att-${record.workerId}`);
                await loadAllLocalDataToState();
                emit('ui.page.recalcDashboardTotals');

                const detailPane = document.querySelector('#detail-pane.detail-view-active, #detail-pane.detail-pane-open');
                if (detailPane) {
                    const recordsOnDate = (appState.attendanceRecords || []).filter(rec => getJSDate(rec.date).toISOString().slice(0, 10) === getJSDate(record.date).toISOString().slice(0, 10) && !rec.isDeleted);
                    const totalUpah = recordsOnDate.reduce((sum, rec) => sum + (rec.totalPay || 0), 0);
                    const workerCount = new Set(recordsOnDate.map(r => r.workerId)).size;

                    const workerCountEl = detailPane.querySelector('.summary-item:nth-child(1) .value');
                    const totalUpahEl = detailPane.querySelector('.summary-item:nth-child(2) .value');

                    if (workerCountEl) workerCountEl.textContent = `${workerCount} Orang`;
                    if (totalUpahEl) totalUpahEl.textContent = fmtIDR(totalUpah);

                    if (recordsOnDate.length === 0) {
                        const projectSections = detailPane.querySelectorAll('.detail-section');
                        projectSections.forEach((section, index) => {
                            if (index > 0) section.remove();
                        });
                        emit('ui.showEmptyState', { container: detailPane.querySelector('.detail-pane-body, .mobile-detail-content'), icon: 'event_busy', title: 'Tidak Ada Absensi Tersisa' });
                    }
                }

                toast('success', 'Absensi berhasil dipindahkan ke Sampah.');
                _logActivity('Memindahkan Absensi ke Sampah', { recordId, workerName: worker?.workerName });
                requestSync({ silent: true });

            } catch (error) {
                toast('error', 'Gagal menghapus absensi.');
                console.error(error);
            }
        }
    });
}

export async function openDailyAttendanceEditorPanel(dateStr, projectId) {
    try {
        const project = (appState.projects || []).find(p => p.id === projectId);
        if (!project) {
            toast('error', 'Proyek tidak ditemukan.');
            return;
        }

        const date = parseLocalDate(dateStr);
        const { startOfDay, endOfDay } = getLocalDayBounds(dateStr);

        const workers = (appState.workers || []).filter(w => w.status === 'active' && !w.isDeleted && w.projectWages && w.projectWages[projectId]);

        const existingRecordsOnDate = (appState.attendanceRecords || [])
            .filter(rec => {
                const recDate = getJSDate(rec.date);
                return recDate >= startOfDay && recDate <= endOfDay && rec.projectId === projectId && rec.isDeleted !== 1;
            });
        const existingRecordMap = new Map(existingRecordsOnDate.map(rec => [rec.workerId, rec]));

        const rowsHTML = workers.map(w => {
            const existingRecord = existingRecordMap.get(w.id);
            const currentRole = existingRecord?.jobRole || w.defaultRole || Object.keys(w.projectWages?.[projectId] || {})[0] || '';
            const wage = (w.projectWages?.[projectId] || {})[currentRole] || 0;
            
            const customWage = existingRecord?.customWage || 0;
            let displayWage = wage;
            let displayRole = currentRole;
            if (customWage > 0) {
                displayWage = customWage;
                displayRole = `${currentRole} (Kustom)`;
            }

            const currentStatus = existingRecord?.attendanceStatus || 'absent'; 

            return `
                <div class="manual-assign-row" data-worker-id="${w.id}" data-base-wage="${wage}" data-role="${currentRole}" data-custom-wage="${customWage}">
                    <div class="manual-assign-row__head">
                        <div class="worker-info">
                            <strong class="worker-name">${w.workerName}</strong>
                            <span class="meta-badge worker-wage" data-pay="0">${displayRole ? `${displayRole} · ${fmtIDR(displayWage)}` : 'Peran?'}</span>
                        </div>
                        <div class="attendance-status-radios" data-worker-id="${w.id}">
                            <label class="custom-checkbox-label">
                                <input type="radio" name="status_${w.id}" value="full_day" ${currentStatus === 'full_day' ? 'checked' : ''}>
                                <span class="custom-checkbox-visual"></span>
                            </label>
                            <label class="custom-checkbox-label">
                                <input type="radio" name="status_${w.id}" value="half_day" ${currentStatus === 'half_day' ? 'checked' : ''}>
                                <span class="custom-checkbox-visual"></span>
                            </label>
                            <label class="custom-checkbox-label">
                                <input type="radio" name="status_${w.id}" value="absent" ${currentStatus === 'absent' ? 'checked' : ''}>
                                <span class="custom-checkbox-visual"></span>
                            </label>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        const headerControlsHTML = `
        <div class="attendance-manual-header-controls">
            <div class="helper-text">
                Tanggal: <strong>${date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</strong><br>
                Proyek: <strong>${project.projectName}</strong>
            </div>
             <div class="check-all-controls">
                    <span>Tandai Semua:</span>
                    <div class="attendance-status-radios" id="check-all-radios">
                        <label class="custom-checkbox-label"><input type="radio" name="check-all-group" data-check-all="full_day"><span class="custom-checkbox-visual"></span></label>
                        <label class="custom-checkbox-label"><input type="radio" name="check-all-group" data-check-all="half_day"><span class="custom-checkbox-visual"></span></label>
                        <label class="custom-checkbox-label"><input type="radio" name="check-all-group" data-check-all="absent"><span class="custom-checkbox-visual"></span></label>
                    </div>
                </div>
                <div class="attendance-status-header">
                    <span class="header-label-placeholder"></span>
                    <div class="header-labels">
                        <span>Hadir</span>
                        <span>1/2 Hari</span>
                        <span>Absen</span>
                    </div>
                </div>
            </div>`;

        const bodyHTML = `
            <div class="scrollable-content" style="max-height: 60vh;"> ${rowsHTML.length > 0 ? rowsHTML : getEmptyStateHTML({icon: 'engineering', title: 'Tidak Ada Pekerja', desc: 'Tidak ada pekerja aktif untuk proyek ini.'})}</div>
        `;

         const summaryHTML = `
            <div class="invoice-total attendance-manual-summary" id="attendance-manual-summary">
                <span>Total Estimasi Upah</span>
                <strong id="manual-attendance-total">Rp 0</strong>
            </div>`;

        const headerActions = `<button class="btn btn-secondary" data-action="goto-manual-add" data-project-id="${projectId}" data-date="${dateStr}" style="font-size: 0.8rem; padding: 0.4rem 0.8rem;">${createIcon('edit', 16)} Tambah/Ubah</button>`;
        
        const footer = `<div class="form-footer-actions"><button class="btn btn-primary" id="save-absence-status">${createIcon('save', 18)} Simpan Perubahan</button></div>`;

        showDetailPane({
            title: 'Edit Absensi Harian',
            content: `<div class="card card-pad">${headerControlsHTML} ${bodyHTML} ${summaryHTML}</div>`,
            headerActions,
            footer,
            paneType: 'attendance-daily-editor'
        });

        const context = document.getElementById('detail-pane');
        if (!context) return;

        const updateTotal = () => {
            let totalPay = 0;
            context.querySelectorAll('.manual-assign-row').forEach(row => {
                const workerId = row.dataset.workerId;
                const status = context.querySelector(`input[name="status_${workerId}"]:checked`)?.value || 'absent';
                const baseWage = parseFloat(row.dataset.baseWage || '0');
                const customWage = parseFloat(row.dataset.customWage || '0');
                const wageToUse = customWage > 0 ? customWage : baseWage;
                
                let pay = 0;
                if (status === 'full_day') pay = wageToUse;
                else if (status === 'half_day') pay = wageToUse / 2;
                totalPay += pay;
                const wageEl = row.querySelector('.worker-wage');
                if (wageEl) wageEl.dataset.pay = pay;
            });
            const totalEl = context.querySelector('#manual-attendance-total');
            if (totalEl) totalEl.textContent = fmtIDR(totalPay);
        };

        context.querySelectorAll('.attendance-status-radios input').forEach(radio => {
            radio.addEventListener('change', updateTotal);
        });
        context.querySelectorAll('.check-all-controls input[type="radio"]').forEach(radio => {
            radio.addEventListener('change', () => {
                const statusToSet = radio.dataset.checkAll;
                context.querySelectorAll('.manual-assign-row').forEach(row => {
                    const workerId = row.dataset.workerId;
                    const radioToCheck = context.querySelector(`input[name="status_${workerId}"][value="${statusToSet}"]`);
                    if (radioToCheck) radioToCheck.checked = true;
                });
                updateTotal();
                setTimeout(() => { radio.checked = false; }, 100);
            });
        });

        updateTotal();

        context.querySelector('#save-absence-status')?.addEventListener('click', async () => {
            const entries = [];
            workers.forEach(w => {
                const statusEl = context.querySelector(`input[name="status_${w.id}"]:checked`);
                const status = statusEl?.value || 'absent';
                
                const row = context.querySelector(`.manual-assign-row[data-worker-id="${w.id}"]`);
                const role = row?.dataset.role || '';
                const baseWage = parseFloat(row?.dataset.baseWage || '0');
                const customWage = parseFloat(row?.dataset.customWage || '0');
                const wageToUse = customWage > 0 ? customWage : baseWage;
                
                const pay = status === 'full_day' ? wageToUse : (status === 'half_day' ? wageToUse / 2 : 0);
                
                entries.push({ 
                    workerId: w.id, 
                    workerName: w.workerName, 
                    status: status === 'full_day' ? 'Hadir' : (status === 'half_day' ? '1/2 Hari' : 'Absen'),
                    role: role, 
                    pay: pay 
                });
            });

            emit('ui.modal.create', 'confirmUserAction', {
                title: 'Konfirmasi Simpan Absensi',
                message: `Anda akan menyimpan perubahan absensi untuk ${workers.length} pekerja pada ${date.toLocaleDateString('id-ID')}. Lanjutkan?`,
                onConfirm: async () => {
                    try {
                        await handleSaveManualAttendance({ date: dateStr, projectId, entries });
                        await loadAllLocalDataToState();
                        closeDetailPaneImmediate();
                        emit('ui.page.render');
                        toast('success', 'Perubahan absensi disimpan.');
                    } catch (e) {
                        toast('error', `Gagal menyimpan: ${e.message}`);
                    }
                    return false; 
                }
            });
        });

    } catch (e) {
        console.error("Error opening daily attendance editor:", e);
        toast('error', 'Gagal membuka panel editor absensi.');
    }
}

export async function handleSaveManualAttendance(attendanceData) {
    const { date, entries } = attendanceData;
    const dateObj = parseLocalDate(date);
    const { startOfDay, endOfDay } = getLocalDayBounds(date);
    let skippedWorkers = new Set();
    let success = false;

    try {
        await localDB.transaction('rw', localDB.attendance_records, localDB.outbox, async () => {
            
            const existingRecordsOnDate = await localDB.attendance_records
                .where('date').between(startOfDay, endOfDay)
                .and(rec => rec.isDeleted !== 1)
                .toArray();
            const existingRecordMap = new Map(existingRecordsOnDate.map(rec => [rec.id, rec]));
            
            const workerIdsInPending = new Set(entries.flat().map(e => e.workerId));
            
            const processedDbIds = new Set(); 

            for (const entryOrArray of entries) {
                const workerEntries = Array.isArray(entryOrArray) ? entryOrArray : [entryOrArray];
                if (workerEntries.length === 0) continue;
                
                const workerId = workerEntries[0].workerId;

                const existingRecordElsewhere = existingRecordsOnDate.find(
                    r => r.workerId === workerId && 
                         (r.attendanceStatus === 'full_day' || r.attendanceStatus === 'half_day') &&
                         !workerEntries.some(e => e.projectId === r.projectId)
                );
                
                const isTryingToSaveProductive = workerEntries.some(e => e.status !== 'absent');

                if (existingRecordElsewhere && isTryingToSaveProductive) {
                    skippedWorkers.add(workerEntries[0].workerName);
                    continue;
                }
                
                for (const entry of workerEntries) {
                    const { workerId, workerName, status, role, pay, projectId, id: entryId } = entry;
                    
                    const attendanceStatus = (status === 'Hadir' || status === 'full_day') ? 'full_day' 
                                           : (status === '1/2 Hari' || status === 'half_day') ? 'half_day' 
                                           : 'absent';
                    
                    let recordToUpdate = null;
                    if (entryId && !String(entryId).startsWith('local_')) {
                        recordToUpdate = existingRecordMap.get(entryId);
                    }

                    if (recordToUpdate) {
                        const isDelete = (attendanceStatus === 'absent');
                        
                        const updateData = {
                            attendanceStatus: attendanceStatus,
                            totalPay: isDelete ? 0 : pay,
                            jobRole: isDelete ? null : role,
                            projectId: projectId,
                            isDeleted: isDelete ? 1 : 0,
                            syncState: 'pending_update',
                            updatedAt: new Date(),
                            type: 'manual',
                            status: 'completed'
                        };
                        await localDB.attendance_records.update(recordToUpdate.id, updateData);
                        await queueOutbox({ table: 'attendance_records', docId: recordToUpdate.id, op: 'upsert', payload: { id: recordToUpdate.id, ...updateData }, priority: 6 });
                        processedDbIds.add(recordToUpdate.id);

                    } else if (attendanceStatus !== 'absent') {
                        const existingRecForProject = existingRecordsOnDate.find(
                            r => r.workerId === workerId && r.projectId === projectId
                        );

                        if (existingRecForProject) {
                            const updateData = {
                                attendanceStatus: attendanceStatus,
                                totalPay: pay,
                                jobRole: role,
                                isDeleted: 0,
                                syncState: 'pending_update',
                                updatedAt: new Date(),
                                type: 'manual',
                                status: 'completed'
                            };
                            await localDB.attendance_records.update(existingRecForProject.id, updateData);
                            await queueOutbox({ table: 'attendance_records', docId: existingRecForProject.id, op: 'upsert', payload: { id: existingRecForProject.id, ...updateData }, priority: 6 });
                            processedDbIds.add(existingRecForProject.id);
                        } else {
                            const newRecord = {
                                id: generateUUID(),
                                workerId,
                                workerName,
                                projectId: projectId,
                                date: dateObj,
                                attendanceStatus: attendanceStatus,
                                totalPay: pay,
                                jobRole: role,
                                isPaid: false,
                                type: 'manual',
                                status: 'completed',
                                createdAt: new Date(),
                                isDeleted: 0,
                                syncState: 'pending_create'
                            };
                            await localDB.attendance_records.add(newRecord);
                            await queueOutbox({ table: 'attendance_records', docId: newRecord.id, op: 'upsert', payload: newRecord, priority: 6 });
                        }
                    }
                }
            }
            
            for (const workerId of workerIdsInPending) {
                const pendingEntries = entries.flat().filter(e => e.workerId === workerId);
                const pendingDbIds = new Set(
                    pendingEntries
                        .map(e => e.id)
                        .filter(id => id && !String(id).startsWith('local_'))
                );

                const recordsInDbForWorker = existingRecordsOnDate.filter(r => r.workerId === workerId);

                for (const dbRecord of recordsInDbForWorker) {
                    if (!pendingDbIds.has(dbRecord.id) && !processedDbIds.has(dbRecord.id)) {
                        
                        if (dbRecord.projectId !== appState.manualAttendanceSelectedProjectId && 
                            !pendingEntries.some(e => e.projectId === dbRecord.projectId)) {
                             continue;
                        }

                        const updateData = {
                            isDeleted: 1,
                            syncState: 'pending_update',
                            updatedAt: new Date()
                        };
                        await localDB.attendance_records.update(dbRecord.id, updateData);
                        await queueOutbox({ table: 'attendance_records', docId: dbRecord.id, op: 'upsert', payload: { id: dbRecord.id, ...updateData }, priority: 5 });
                        processedDbIds.add(dbRecord.id);
                    }
                }
            }
        });

        _logActivity(`Menyimpan Absensi Manual (Lokal)`, { date, count: entries.length });
        await loadAllLocalDataToState();

        if (navigator.onLine) {
            requestSync({ silent: true });
        }

        if (skippedWorkers.size > 0) {
             toast('warn', `Absensi untuk ${Array.from(skippedWorkers).join(', ')} dilewati karena sudah ada data di proyek lain.`);
        }
        
        success = true;

    } catch (error) {
        console.error("Gagal menyimpan absensi manual (v3):", error);
        toast('error', `Gagal menyimpan absensi: ${error.message}`);
        return { success: false, skipped: entries ? entries.length : 0 };
    }

    return { success: success, skipped: skippedWorkers.size };
}

export async function openManualAbsenceStatusPanel(selectedWorkerIds = []) {
    try {
        if (selectedWorkerIds.length === 0) {
            toast('info', 'Tidak ada pekerja yang dipilih.');
            return;
        }
        
        const dateStr = appState.defaultAttendanceDate || new Date().toISOString().slice(0,10);
        const date = parseLocalDate(dateStr);
        
        let defaultStatus = 'full_day';
        const firstWorkerId = selectedWorkerIds[0];
        const pendingData = appState.pendingAttendance.get(firstWorkerId);
        if (pendingData) {
            const firstEntry = Array.isArray(pendingData) ? pendingData[0] : pendingData;
            defaultStatus = firstEntry.status || 'full_day';
        }
        
        const pendingCount = appState.pendingAttendance?.size || 0;
        const saveAllDisabled = pendingCount === 0 ? 'disabled' : '';
        
        const content = `
            <form id="absence-status-form">
                <p class="confirm-modal-text" style="text-align: left; margin-bottom: 1rem;">
                    Terapkan status absensi untuk <strong>${selectedWorkerIds.length} pekerja</strong> terpilih pada ${date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}?
                </p>
                <div class="form-group">
                    <label>Status Kehadiran</label>
                    <div class="segmented-control" id="status-selector-group">
                        <input type="radio" id="status-full_day" name="status-group" value="full_day" ${defaultStatus === 'full_day' ? 'checked' : ''}>
                        <label for="status-full_day">Hadir (1.0)</label>
                        <input type="radio" id="status-half_day" name="status-group" value="half_day" ${defaultStatus === 'half_day' ? 'checked' : ''}>
                        <label for="status-half_day">1/2 Hari (0.5)</label>
                        <input type="radio" id="status-absent" name="status-group" value="absent" ${defaultStatus === 'absent' ? 'checked' : ''}>
                        <label for="status-absent">Absen (0.0)</label>
                    </div>
                </div>
            </form>
        `;
        const footer = `
        <button type="button" class="btn btn-ghost" data-action="history-back">Batal</button>
        <button type="button" id="save-absence-status-btn" class="btn btn-primary">
            Terapkan
        </button>
    `;

    const isMobile = window.matchMedia('(max-width: 599px)').matches;
    
    const modalInstance = createModal('actionsPopup', {
        title: 'Set Status Absensi Massal',
        content: content,
        footer: footer, 
        layoutClass: isMobile ? 'is-bottom-sheet' : 'is-simple-dialog'
    });

        if (modalInstance) {
            modalInstance.querySelector('#save-absence-status-btn')?.addEventListener('click', () => {
                const newStatus = modalInstance.querySelector('input[name="status-group"]:checked')?.value;
                if (!newStatus) return;

                if (!appState.pendingAttendance) {
                    appState.pendingAttendance = new Map();
                }

                let appliedCount = 0;
                let skippedCount = 0;
                const skippedNames = [];

                for (const workerId of selectedWorkerIds) {
                    const worker = appState.workers.find(w => w.id === workerId);
                    if (!worker) {
                        skippedCount++;
                        skippedNames.push('Pekerja Asing');
                        continue;
                    }

                    const existingPending = appState.pendingAttendance.get(workerId);
                    
                    if (newStatus === 'absent') {
                        appState.pendingAttendance.set(workerId, { status: 'absent', pay: 0, role: '', projectId: '' });
                        appliedCount++;
                    } else {
                        let entries = Array.isArray(existingPending) ? existingPending : (existingPending ? [existingPending] : []);
                        entries = entries.filter(e => e.status !== 'absent');
                        
                        if (entries.length === 0) {
                            
                            const defaultProjectId = worker.defaultProjectId || appState.manualAttendanceSelectedProjectId || appState.defaultAttendanceProjectId;
                            const wages = (worker.projectWages || {})[defaultProjectId] || {};
                            const role = worker.defaultRole || Object.keys(wages)[0] || '';
                            
                            
                            if (!defaultProjectId || !role) {
                                 skippedCount++;
                                 skippedNames.push(worker.workerName);
                                 continue;
                            }
                            
                            const pay = (wages[role] || 0) * (newStatus === 'full_day' ? 1 : 0.5);
                            
                            if (pay <= 0 && newStatus !== 'absent') {
                                skippedCount++;
                                skippedNames.push(worker.workerName);
                                continue;
                            }
                            
                            appState.pendingAttendance.set(workerId, {
                                status: newStatus,
                                pay: pay,
                                role: role,
                                projectId: defaultProjectId,
                                customWage: null
                            });
                            appliedCount++;
                        } else {
                            const updatedEntries = entries.map(entry => {
                                const baseWage = (worker.projectWages?.[entry.projectId] || {})[entry.role] || 0;
                                const wageToUse = entry.customWage > 0 ? entry.customWage : baseWage;
                                const newPay = (newStatus === 'full_day') ? wageToUse : (wageToUse / 2);
                                return { ...entry, status: newStatus, pay: newPay };
                            });
                            appState.pendingAttendance.set(workerId, updatedEntries.length > 1 ? updatedEntries : updatedEntries[0]);
                            appliedCount++;
                        }
                    }
                }
                
                if (appliedCount > 0) {
                    toast('success', `${appliedCount} status pekerja diatur & siap disimpan.`);
                }
                if (skippedCount > 0) {
                    toast('info', `${skippedCount} pekerja dilewati (tidak ada tarif/proyek default): ${skippedNames.join(', ')}.`);
                }
                
                resetFormDirty();
                emit('ui.absensi.renderManualForm'); 
                emit('ui.absensi.updateFooter'); 
                closeModal(modalInstance); 
            });
        }
    } catch (e) {
        console.error("Error opening manual absence panel:", e);
        toast('error', 'Gagal membuka panel input status.');
    }
}
export async function handleOpenAttendanceSettings() {
    if (isViewer()) {
        toast('info', 'Anda tidak memiliki izin untuk mengubah pengaturan.');
        return;
    }
    await Promise.all([
        fetchAndCacheData('workers', workersCol, 'workerName'),
        fetchAndCacheData('projects', projectsCol, 'projectName')
    ]);

    const activeWorkers = (appState.workers || []).filter(w => !w.isDeleted);
    const activeProjects = (appState.projects || []).filter(p => p.isWageAssignable && !p.isDeleted);
    const projectOptions = activeProjects.map(p => ({ value: p.id, text: p.projectName }));

    const currentDefaultProjectId = appState.defaultAttendanceProjectId || '';
    const currentDefaultDate = appState.defaultAttendanceDate || parseLocalDate(new Date().toISOString().slice(0, 10)).toISOString().slice(0, 10);
    
    const globalSettingsHTML = `
        <div class="card card-pad" id="global-attendance-settings-card">
            <h5 class="detail-section-title">Pengaturan Default Absensi</h5>
            <p class="helper-text">Atur proyek dan tanggal default untuk input absensi manual.</p>
            ${createMasterDataSelect('global_default_project', 'Pilih Proyek Default', projectOptions, currentDefaultProjectId, null, false, false)}
            <div class="form-group">
                <label for="global_default_date">Tanggal Absensi (Default)</label>
                <input type="date" id="global_default_date" name="global_default_date" value="${currentDefaultDate}">
            </div>
        </div>
    `;

    let settingsHTML = activeWorkers.map(worker => {
        return createUnifiedCard({
            id: `worker-setting-${worker.id}`,
            title: worker.workerName,
            mainContentHTML: '',
            dataset: { 
                type: 'worker-setting', 
                itemId: worker.id, 
                workerId: worker.id,
                workerName: worker.workerName,
                pageContext: 'attendance-settings'
            },
            moreAction: true, 
            selectionEnabled: false, 
            customClasses: 'worker-setting-card'
        });
    }).join('');

    settingsHTML = `<h5 class="detail-section-title">Pengaturan per Pekerja</h5><div class="wa-card-list-wrapper">${settingsHTML}</div>`;

    const footerHTML = `<div class="form-footer-actions"><button type="submit" form="attendance-settings-form" class="btn btn-primary">${createIcon('save')} Simpan Pengaturan</button></div>`;

    showDetailPane({
        title: 'Pengaturan Absensi',
        content: `<form id="attendance-settings-form"><div class="scrollable-content has-form-padding">${globalSettingsHTML}${settingsHTML}</div></form>`,
        footer: footerHTML,
        paneType: 'attendance-settings' 
    });

    const context = document.getElementById('detail-pane');
    if (context) {
        initCustomSelects(context);
        
        const form = context.querySelector('#attendance-settings-form');
        form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            emit('ui.modal.create', 'confirmUserAction', {
                title: 'Simpan Pengaturan?',
                message: 'Anda yakin ingin menyimpan perubahan pengaturan absensi ini?',
                onConfirm: async () => {
                    try {
                        const globalSelect = form.querySelector('#global_default_project');
                        const newDefaultId = globalSelect?.value || '';
                        try { localStorage.setItem('attendance.defaultProjectId', newDefaultId); } catch(_) {}
                        appState.defaultAttendanceProjectId = newDefaultId;
                        
                        const globalDateEl = form.querySelector('#global_default_date');
                        const newDefaultDate = globalDateEl?.value || '';
                        try { localStorage.setItem('attendance.defaultDate', newDefaultDate); } catch(_) {}
                        appState.defaultAttendanceDate = newDefaultDate || appState.defaultAttendanceDate;
                        if (window.matchMedia('(max-width: 599px)').matches) {
                            hideMobileDetailPage();
                        } else {
                            closeDetailPaneImmediate();
                        }
                        
                        toast('success', 'Pengaturan absensi disimpan.');
                        
                        if (appState.activePage === 'absensi') {
                            appState.absensi.manualListNeedsUpdate = true;
                            emit('ui.absensi.renderManualForm');
                        }

                    } catch (err) {
                        console.error('Gagal menyimpan pengaturan absensi:', err);
                        toast('error', 'Gagal menyimpan pengaturan.');
                    }
                }
            });
        });
    }
}

export async function _openWorkerDefaultsModal(workerId, workerName) {
    const worker = appState.workers.find(w => w.id === workerId);
    if (!worker) {
        toast('error', 'Data pekerja tidak ditemukan.');
        return;
    }
    const isMobile = window.matchMedia('(max-width: 599px)').matches;
    const currentProjectId = worker.defaultProjectId || appState.defaultAttendanceProjectId || '';
    const projectOptions = appState.projects
        .filter(p => p.isWageAssignable && !p.isDeleted && worker.projectWages && worker.projectWages[p.id])
        .map(p => ({ value: p.id, text: p.projectName }));

    const wageOptions = (currentProjectId && worker.projectWages?.[currentProjectId]) || {};
    const roleOptions = Object.keys(wageOptions).map(role => ({
        value: role,
        text: `${role} (${fmtIDR(wageOptions[role])})`
    }));
    const currentRole = worker.defaultRole || '';
    const isActive = worker.status === 'active';

    const content = `
        <form id="worker-defaults-form">
            <p class="helper-text" style="text-align: center; margin-bottom: 1rem;">
                Atur proyek dan peran yang akan otomatis terisi saat memilih <strong>${workerName}</strong> di absensi manual.
            </p>
            ${createMasterDataSelect('worker-default-project', 'Proyek Default', projectOptions, currentProjectId, null, false, false)}
            <div class="form-group" id="worker-default-role-container">
                ${createMasterDataSelect('worker-default-role', 'Peran Default', roleOptions, currentRole, null, false, false)}
            </div>

            <div class="form-group" style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--line);">
                <label class="custom-checkbox-label" title="Aktif di Halaman Absensi">
                    <input type="checkbox" name="worker-status-active" ${isActive ? 'checked' : ''}>
                    <span class="custom-checkbox-visual"></span>
                    <span>Aktif di Halaman Absensi</span>
                </label>
            </div>
        </form>
    `;
    const footer = `<button type="submit" form="worker-defaults-form" class="btn btn-primary">${createIcon('save')} Simpan</button>`;

    const modal = createModal('actionsPopup', { 
        title: `Default: ${workerName}`,
        content,
        footer,
        layoutClass: isMobile ? 'is-bottom-sheet' : 'is-simple-dialog' 
    });

    if (modal) {
        initCustomSelects(modal);
        
        const projectSelect = modal.querySelector('input[name="worker-default-project"]');
        const roleContainer = modal.querySelector('#worker-default-role-container');

        projectSelect?.addEventListener('change', () => {
            const newProjectId = projectSelect.value;
            const newWages = (newProjectId && worker.projectWages?.[newProjectId]) || {};
            const newRoleOptions = Object.keys(newWages).map(role => ({
                value: role,
                text: `${role} (${fmtIDR(newWages[role])})`
            }));
            const newDefaultRole = ''; 

            if (roleContainer) {
                roleContainer.innerHTML = createMasterDataSelect('worker-default-role', 'Peran Default', newRoleOptions, newDefaultRole, null, false, false);
                initCustomSelects(roleContainer);
            }
        });
        const form = modal.querySelector('#worker-defaults-form');
        form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const projectId = modal.querySelector('input[name="worker-default-project"]')?.value || '';
            const role = modal.querySelector('input[name="worker-default-role"]')?.value || '';
            const newStatus = modal.querySelector('input[name="worker-status-active"]')?.checked ? 'active' : 'inactive';

            const payload = { 
                defaultProjectId: projectId, 
                defaultRole: role, 
                status: newStatus, 
                syncState: 'pending_update', 
                updatedAt: new Date() 
            };

            try {
                await localDB.transaction('rw', localDB.workers, localDB.outbox, async () => {
                    await localDB.workers.update(workerId, payload);
                    await queueOutbox({ 
                        table: 'workers', 
                        docId: workerId, 
                        op: 'upsert', 
                        payload: { id: workerId, defaultProjectId: projectId, defaultRole: role, status: newStatus }, 
                        priority: 4 
                    });
                });

                const workerInState = appState.workers.find(w => w.id === workerId);
                if (workerInState) {
                    workerInState.defaultProjectId = projectId;
                    workerInState.defaultRole = role;
                    workerInState.status = newStatus;
                }

                toast('success', `Pengaturan untuk ${workerName} disimpan.`);
                closeModal(modal);
                requestSync({ silent: true });
                
                if (appState.activePage === 'absensi') {
                    appState.absensi.manualListNeedsUpdate = true;
                    handleOpenAttendanceSettings(); 
                    emit('ui.absensi.renderManualForm'); 
                }
                
            } catch (err) {
                console.error('Gagal menyimpan default pekerja:', err);
                toast('error', 'Gagal menyimpan pengaturan.');
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
});

const modalProjectRoleState = {
    workerId: null,
    workerName: '',
    date: '',
    entries: [], 
    projects: [],
};

function renderProjectRoleRow(entry) {
    const entryId = entry.id || `local_${Math.random().toString(36).substring(2, 9)}`;
    entry.id = entryId; 
    
    const projectOptions = modalProjectRoleState.projects.map(p => ({ 
       value: p.id, 
       text: p.projectName 
    }));
    
    const worker = appState.workers.find(w => w.id === modalProjectRoleState.workerId);
    const wageOptions = (entry.projectId && worker?.projectWages?.[entry.projectId]) || {};
    const roleOptions = Object.keys(wageOptions).map(role => ({
       value: role,
       text: `${role} (${fmtIDR(wageOptions[role])})`
    }));
    
    if (!entry.role && roleOptions.length > 0) {
       entry.role = worker.defaultRole && wageOptions[worker.defaultRole] ? worker.defaultRole : (roleOptions[0]?.value || '');
    }
    
    if (!entry.customWage) {
        const baseWage = wageOptions[entry.role] || 0;
        entry.pay = (entry.status === 'full_day') ? baseWage : (baseWage / 2);
    }

    return `
    <div class="project-role-card" data-entry-id="${entryId}">
         <button type="button" class="btn-icon btn-icon-danger remove-item-btn" data-action="remove-project-role-entry" style="position: absolute; top: 8px; right: 8px; z-index: 2;">
         </button>
           ${createMasterDataSelect(`project_${entryId}`, 'Proyek', projectOptions, entry.projectId || '', null, true, false)}
           <div class="form-group role-selector" style="margin-bottom: 0;">
               ${createMasterDataSelect(`role_${entryId}`, 'Peran', roleOptions, entry.role || '', null, true, false)}
           </div>
           <input type="hidden" name="status_${entryId}" value="${entry.status || 'full_day'}">
           <input type="hidden" name="customWage_${entryId}" value="${entry.customWage || ''}">
       </div>
    `;
}

function attachProjectRoleListeners(modal) {
    const container = modal.querySelector('#project-role-entry-container');
    if (!container) return;

    const updateEntry = (rowElement, entryId) => {
        const entry = modalProjectRoleState.entries.find(e => e.id === entryId);
        if (!entry) return;

        const worker = appState.workers.find(w => w.id === modalProjectRoleState.workerId);
        const customWage = parseFloat(rowElement.querySelector(`input[name="customWage_${entryId}"]`)?.value || '0');
        const baseWage = (worker?.projectWages?.[entry.projectId] || {})[entry.role] || 0;
        const wageToUse = customWage > 0 ? customWage : baseWage;

        entry.pay = (entry.status === 'full_day') ? wageToUse : (wageToUse / 2);
        entry.customWage = customWage > 0 ? customWage : null;
    };

    container.addEventListener('change', (e) => {
        const target = e.target;
        const row = target.closest('.multi-item-row');
        if (!row) return;
        const entryId = row.dataset.entryId;
        const entry = modalProjectRoleState.entries.find(e => e.id === entryId);
        if (!entry) return;

        if (target.name.startsWith('project_')) {
            entry.projectId = target.value;
            entry.role = '';
            
            const worker = appState.workers.find(w => w.id === modalProjectRoleState.workerId);
            const wageOptions = (entry.projectId && worker?.projectWages?.[entry.projectId]) || {};
            const roleOptions = Object.keys(wageOptions).map(role => ({
                value: role,
                text: `${role} (${fmtIDR(wageOptions[role])})`
            }));
            entry.role = worker.defaultRole && wageOptions[worker.defaultRole] ? worker.defaultRole : (roleOptions[0]?.value || '');
            
            const roleContainer = row.querySelector('.role-selector');
            if (roleContainer) {
                roleContainer.innerHTML = createMasterDataSelect(`role_${entryId}`, 'Peran', roleOptions, entry.role || '', null, true, false);
                initCustomSelects(roleContainer);
                roleContainer.querySelector(`input[name="role_${entryId}"]`)?.addEventListener('change', (ev) => {
                    entry.role = ev.target.value;
                    updateEntry(row, entryId);
                });
            }
            updateEntry(row, entryId);
        } else if (target.name.startsWith('role_')) {
            entry.role = target.value;
            updateEntry(row, entryId);
        }
    });
    
    container.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('[data-action="remove-project-role-entry"]');
        if (removeBtn) {
            const row = removeBtn.closest('.multi-item-row');
            if (row && modalProjectRoleState.entries.length > 1) { 
                const entryId = row.dataset.entryId;
                modalProjectRoleState.entries = modalProjectRoleState.entries.filter(e => e.id !== entryId);
                row.remove();
            } else if (row) {
                toast('info', 'Setidaknya harus ada satu entri proyek/peran.');
            }
        }
    });

    modal.querySelector('[data-action="add-project-role-entry"]')?.addEventListener('click', () => {
         const newEntry = {
            id: `local_${Math.random().toString(36).substring(2, 9)}`,
            projectId: modalProjectRoleState.projects[0]?.id || '',
            role: '',
            status: 'full_day',
            pay: 0,
            customWage: null
        };
        modalProjectRoleState.entries.push(newEntry);
        const rowHTML = renderProjectRoleRow(newEntry);
        container.insertAdjacentHTML('beforeend', rowHTML);
        const newRowEl = container.lastElementChild;
        initCustomSelects(newRowEl);
        updateEntry(newRowEl, newEntry.id);
    });
    
    modal.querySelector('#save-project-role-btn')?.addEventListener('click', () => {
        const validEntries = modalProjectRoleState.entries.filter(e => e.projectId && e.role);
        
        if (validEntries.length < modalProjectRoleState.entries.length) {
            toast('error', 'Semua entri harus memiliki Proyek dan Peran.');
            return;
        }
        
        if (!appState.pendingAttendance) {
            appState.pendingAttendance = new Map();
        }

        if (validEntries.length === 1) {
             appState.pendingAttendance.set(modalProjectRoleState.workerId, validEntries[0]);
        } else {
             appState.pendingAttendance.set(modalProjectRoleState.workerId, validEntries);
        }
        
        toast('success', `Perubahan untuk ${modalProjectRoleState.workerName} siap disimpan.`);
        emit('ui.absensi.renderManualForm');
        emit('ui.absensi.updateFooter');
        emit('ui.modal.closeDetailPane');
    });
}

export async function handleOpenProjectRoleModal(context) {
    const { workerId } = context;
    const dateStr = appState.defaultAttendanceDate;
    const worker = appState.workers.find(w => w.id === workerId);
    if (!worker) {
        toast('error', 'Data pekerja tidak ditemukan.');
        return;
    }

    let currentProjectId = '';
    let currentRole = '';
    let currentStatus = 'full_day'; 
    let customWage = null;
    let pay = 0;

    const { startOfDay, endOfDay } = getLocalDayBounds(dateStr);
    const pendingData = appState.pendingAttendance.get(workerId);
    const existingRecords = (appState.attendanceRecords || [])
        .filter(rec => {
            const recDate = getJSDate(rec.date);
            return rec.workerId === workerId && recDate >= startOfDay && recDate <= endOfDay && rec.isDeleted !== 1;
        });
    
    let entryToEdit = null;
    if (pendingData) {
        entryToEdit = Array.isArray(pendingData) ? pendingData[0] : pendingData;
    } else if (existingRecords.length > 0) {
        entryToEdit = existingRecords[0]; 
    }

    if (entryToEdit && entryToEdit.status !== 'absent') {
        currentProjectId = entryToEdit.projectId;
        currentRole = entryToEdit.role || entryToEdit.jobRole;
        currentStatus = entryToEdit.status;
        customWage = entryToEdit.customWage || null;
    } else {
        currentProjectId = worker.defaultProjectId || appState.manualAttendanceSelectedProjectId || appState.defaultAttendanceProjectId;
        const wages = (worker.projectWages || {})[currentProjectId] || {};
        currentRole = worker.defaultRole || Object.keys(wages)[0] || '';
    }
    
    const projectOptions = appState.projects
        .filter(p => p.isWageAssignable && !p.isDeleted && worker.projectWages && worker.projectWages[p.id])
        .map(p => ({ value: p.id, text: p.projectName }));

    const wageOptions = (currentProjectId && worker.projectWages?.[currentProjectId]) || {};
    const roleOptions = Object.keys(wageOptions).map(role => ({
        value: role,
        text: `${role} (${fmtIDR(wageOptions[role])})`
    }));

    const content = `
    <form id="edit-project-role-form" data-worker-id="${workerId}">
        <p class="confirm-modal-text" style="text-align: left; margin-bottom: 1rem;">
            Atur proyek dan peran untuk <strong>${worker.workerName}</strong> pada ${parseLocalDate(dateStr).toLocaleDateString('id-ID')}.
        </p>
        
        ${createMasterDataSelect(`project_edit`, 'Proyek', projectOptions, currentProjectId, null, true, false)}
        
        <div class="form-group role-selector" style="margin-bottom: 0;">
            ${createMasterDataSelect(`role_edit`, 'Peran', roleOptions, currentRole, null, true, false)}
        </div>
        
        <input type="hidden" name="status_edit" value="${currentStatus}">
        <input type="hidden" name="customWage_edit" value="${customWage || ''}">
    </form>
`;
    const footer = `
        <button type="button" class="btn btn-ghost" data-action="history-back">Batal</button>
        <button type="button" id="save-project-role-btn" class="btn btn-primary">
            ${createIcon('save')} Terapkan
        </button>
    `;

    const isMobile = window.matchMedia('(max-width: 599px)').matches;
    let modalInstance;
    const modalTitle = `Edit Proyek: ${worker.workerName}`;

    if (isMobile) {
        modalInstance = createModal('actionsPopup', {
            title: modalTitle,
            content: content,
            footer: footer,
            layoutClass: 'is-bottom-sheet'
        });
    } else {
        modalInstance = showDetailPane({
            title: modalTitle,
            content: content, // Langsung teruskan 'content'
            footer: footer,
            paneType: 'attendance-project-role-edit'
        });
    }

    if (modalInstance) {
        initCustomSelects(modalInstance);
        
        const form = modalInstance.querySelector('#edit-project-role-form');
        const projectSelect = modalInstance.querySelector('input[name="project_edit"]');
        const roleContainer = modalInstance.querySelector('.role-selector');
        
        projectSelect?.addEventListener('change', () => {
            const newProjectId = projectSelect.value;
            const newWages = (newProjectId && worker.projectWages?.[newProjectId]) || {};
            const newRoleOptions = Object.keys(newWages).map(role => ({
                value: role,
                text: `${role} (${fmtIDR(newWages[role])})`
            }));
            const newDefaultRole = worker.defaultRole && newWages[worker.defaultRole] ? worker.defaultRole : (newRoleOptions[0]?.value || '');

            if (roleContainer) {
                roleContainer.innerHTML = createMasterDataSelect(`role_edit`, 'Peran', newRoleOptions, newDefaultRole, null, true, false);
                initCustomSelects(roleContainer);
            }
        });        
        modalInstance.querySelector('#save-project-role-btn')?.addEventListener('click', () => {
            const projectId = modalInstance.querySelector('input[name="project_edit"]')?.value;
            const role = modalInstance.querySelector('input[name="role_edit"]')?.value;
            const status = modalInstance.querySelector('input[name="status_edit"]')?.value || 'full_day';
            const customWage = parseFloat(modalInstance.querySelector('input[name="customWage_edit"]')?.value || '0');

            if (!projectId || !role) {
                toast('error', 'Proyek dan Peran harus dipilih.');
                return;
            }

            const baseWage = (worker.projectWages?.[projectId] || {})[role] || 0;
            const wageToUse = customWage > 0 ? customWage : baseWage;
            const pay = (status === 'full_day') ? wageToUse : (wageToUse / 2);

            const pendingEntry = {
                status: status,
                pay: pay,
                role: role,
                projectId: projectId,
                customWage: customWage > 0 ? customWage : null
            };

            if (!appState.pendingAttendance) {
                appState.pendingAttendance = new Map();
            }
            appState.pendingAttendance.set(workerId, pendingEntry);
            
            toast('success', `Perubahan untuk ${worker.workerName} siap disimpan.`);
            emit('ui.absensi.renderManualForm');
            emit('ui.absensi.updateFooter');
            
            resetFormDirty();
            if (isMobile) {
                closeModal(modalInstance);
            } else {
                closeDetailPane();
            }
        });
    }
}

