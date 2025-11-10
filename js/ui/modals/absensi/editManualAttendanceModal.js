import { appState } from "../../../state/appState.js";
import { $, $$ } from "../../../utils/dom.js";
import { fmtIDR, parseFormattedNumber } from "../../../utils/formatters.js";
import { createModal, closeModal, showDetailPane, closeModalImmediate } from "../../components/modal.js";
import { createMasterDataSelect, initCustomSelects, formatNumberInput } from "../../components/forms/index.js";
import { emit } from "../../../state/eventBus.js";
import { toast } from "../../components/toast.js";
import { getJSDate, getLocalDayBounds, parseLocalDate } from "../../../utils/helpers.js";

// ... (State lokal dan fungsi createIcon tidak berubah) ...
// State lokal khusus untuk modal ini
let modalState = {
    workerId: null,
    workerName: '',
    date: '',
    entries: [], // Bisa berisi > 1 entri untuk multi-proyek
    projects: [],
    professions: []
};

/**
 * Membuat ikon Lucide
 */
function createIcon(iconName, size = 18, classes = '') {
  const icons = {
      save: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-save ${classes}"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
      'trash-2': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2 ${classes}"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
      'plus-circle': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus-circle ${classes}"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>`,
      'sticky-note': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sticky-note ${classes}"><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v6h6"/></svg>`,
      'hard-hat': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-hard-hat ${classes}"><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M14 6a6 6 0 0 1 6 6v3"/><path d="M4 15v-3a6 6 0 0 1 6-6"/><rect x="2" y="15" width="20" height="4" rx="1"/></svg>`,
  };
  return icons[iconName] || '';
}

/**
 * Menyiapkan state modal berdasarkan data pekerja dan absensi yang ada.
 * @param {object} context - Dataset dari tombol "More Vert" (...).
 * @returns {boolean} True jika setup berhasil.
 */
function setupModalState(context) {
    const { workerId } = context;
    const dateStr = appState.defaultAttendanceDate;
    const worker = appState.workers.find(w => w.id === workerId);
    if (!worker) {
        toast('error', 'Data pekerja tidak ditemukan.');
        return false;
    }

    modalState = {
        workerId: workerId,
        workerName: worker.workerName,
        date: dateStr,
        entries: [],
        projects: appState.projects.filter(p => p.isWageAssignable && !p.isDeleted && worker.projectWages && worker.projectWages[p.id]),
        professions: appState.professions.filter(p => !p.isDeleted)
    };
    
    const pendingData = appState.pendingAttendance?.get(workerId);
    
    if (pendingData) {
        const entries = Array.isArray(pendingData) ? pendingData : [pendingData];
        modalState.entries = JSON.parse(JSON.stringify(entries));
    } else {
        const { startOfDay, endOfDay } = getLocalDayBounds(dateStr);
        const existingRecords = (appState.attendanceRecords || [])
            .filter(rec => {
                const recDate = getJSDate(rec.date);
                return rec.workerId === workerId && recDate >= startOfDay && recDate <= endOfDay && rec.isDeleted !== 1;
            });

        if (existingRecords.length > 0) {
            modalState.entries = existingRecords.map(rec => ({
                id: rec.id,
                projectId: rec.projectId,
                role: rec.jobRole,
                status: rec.attendanceStatus,
                pay: rec.totalPay,
                customWage: rec.customWage || null,
                notes: rec.notes || ''
            }));
        }
    }

    // 3. Jika masih kosong (Belum Absen), tambahkan satu baris default
    if (modalState.entries.length === 0) {
        const defaultProjectId = appState.manualAttendanceSelectedProjectId || modalState.projects[0]?.id || '';
        if (defaultProjectId) {
            addEntryRow(null, defaultProjectId); // Tambah satu baris default
        }
    }
    
    return true;
}

/**
 * Merender HTML untuk satu baris entri absensi.
 * @param {object} entry - Objek entri absensi.
 * @returns {string} HTML string untuk baris.
 */
function renderEntryRow(entry) {
    const entryId = entry.id || `local_${Math.random().toString(36).substring(2, 9)}`;
    entry.id = entryId; // Pastikan entri memiliki ID

    const projectOptions = modalState.projects.map(p => ({ 
        value: p.id, 
        text: p.projectName 
    }));
    
    const worker = appState.workers.find(w => w.id === modalState.workerId);
    const wageOptions = (entry.projectId && worker?.projectWages?.[entry.projectId]) || {};
    const roleOptions = Object.keys(wageOptions).map(role => ({
        value: role,
        text: `${role} (${fmtIDR(wageOptions[role])})`
    }));
    
    // Set peran default jika entri baru
    if (!entry.role && roleOptions.length > 0) {
        entry.role = worker.defaultRole || roleOptions[0].value;
    }

    const statusOptions = [
        { value: 'full_day', text: 'Hadir (1.0)' },
        { value: 'half_day', text: '1/2 Hari (0.5)' },
        { value: 'absent', text: 'Absen (0.0)' }
    ];
    
    // Atur status default jika entri baru
    if (!entry.status) {
        entry.status = 'full_day';
    }

    const pay = entry.pay || 0;
    const customWage = entry.customWage || null;
    
    // Hitung ulang upah saat render (penting untuk entri baru)
    if (entry.pay === 0 && entry.status !== 'absent') {
        const baseWage = wageOptions[entry.role] || 0;
        const wageToUse = customWage > 0 ? customWage : baseWage;
        entry.pay = (entry.status === 'full_day') ? wageToUse : (wageToUse / 2);
    }

    const isAbsent = entry.status === 'absent';

    return `
        <div class="multi-item-row" data-entry-id="${entryId}">
            <div class="multi-item-main-line">
                <div class="item-name-wrapper">
                    ${createMasterDataSelect(`project_${entryId}`, 'Proyek', projectOptions, entry.projectId || '', null, true, false)}
                </div>
                <button type="button" class="btn-icon btn-icon-danger remove-item-btn" data-action="remove-entry">${createIcon('trash-2')}</button>
            </div>
            <div class="multi-item-details-line" ${isAbsent ? 'style="display: none;"' : ''}>
                <div class="form-group role-selector">
                    ${createMasterDataSelect(`role_${entryId}`, 'Peran', roleOptions, entry.role || '', null, !isAbsent, false)}
                </div>
                <div class="form-group">
                    ${createMasterDataSelect(`status_${entryId}`, 'Status', statusOptions, entry.status || 'full_day', null, true, false)}
                </div>
            </div>
            <div class="multi-item-details-line" style="grid-template-columns: 1fr 1fr; ${isAbsent ? 'display: none;' : ''}">
                <div class="form-group">
                    <label>Upah Kustom (Opsional)</label>
                    <input type="text" name="customWage_${entryId}" inputmode="numeric" placeholder="Timpa upah..." class="item-custom-wage" value="${customWage ? new Intl.NumberFormat('id-ID').format(customWage) : ''}">
                </div>
                 <div class="form-group">
                    <label>Total Upah</label>
                    <input type="text" name="pay_${entryId}" inputmode="numeric" class="item-pay" value="${new Intl.NumberFormat('id-ID').format(entry.pay)}" readonly style="background-color: var(--surface-muted); border-color: var(--line);">
                </div>
            </div>
        </div>
    `;
}

/**
 * Menambah baris entri baru ke state dan UI.
 */
function addEntryRow(container, defaultProjectId = null) {
    // ... (fungsi tidak berubah) ...
    const newEntry = {
        id: `local_${Math.random().toString(36).substring(2, 9)}`,
        projectId: defaultProjectId || modalState.projects[0]?.id || '',
        role: '',
        status: 'full_day',
        pay: 0,
        customWage: null
    };
    modalState.entries.push(newEntry);

    const rowHTML = renderEntryRow(newEntry); // Render HTML
    if (container) {
        container.insertAdjacentHTML('beforeend', rowHTML); // Tambah ke DOM
    }
    
    return rowHTML; // Kembalikan HTML (jika dipanggil oleh render awal)
}

/**
 * Mengupdate upah untuk satu baris entri.
 */
function updatePay(rowElement) {
    // ... (fungsi tidak berubah) ...
    if (!rowElement) return;
    const entryId = rowElement.dataset.entryId;
    const entry = modalState.entries.find(e => e.id === entryId);
    if (!entry) return;

    const worker = appState.workers.find(w => w.id === modalState.workerId);
    const customWageVal = parseFormattedNumber(rowElement.querySelector(`[name="customWage_${entryId}"]`)?.value || '0');
    const baseWage = (worker?.projectWages?.[entry.projectId] || {})[entry.role] || 0;
    const wageToUse = customWageVal > 0 ? customWageVal : baseWage;

    let pay = 0;
    if (entry.status === 'full_day') {
        pay = wageToUse;
    } else if (entry.status === 'half_day') {
        pay = wageToUse / 2;
    }
    
    entry.pay = pay;
    entry.customWage = customWageVal > 0 ? customWageVal : null;
    
    const payInput = rowElement.querySelector(`input[name="pay_${entryId}"]`);
    if (payInput) {
        payInput.value = new Intl.NumberFormat('id-ID').format(pay);
    }
    
    updateTotalPay();
}

/**
 * Menghitung total upah dari semua entri dan menampilkannya.
 */
function updateTotalPay() {
    // ... (fungsi tidak berubah) ...
    const total = modalState.entries.reduce((sum, entry) => {
        // Hanya hitung jika status bukan 'absen'
        return entry.status !== 'absent' ? (sum + (entry.pay || 0)) : sum;
    }, 0);
    
    const totalEl = document.querySelector('#manual-attendance-total');
    if (totalEl) {
        totalEl.textContent = fmtIDR(total);
    }
}

/**
 * Memasang listener ke semua input di dalam modal.
 */
function attachEntryListeners(modal) {
    // ... (fungsi tidak berubah) ...
    const container = modal.querySelector('#manual-entry-container');
    if (!container) return;

    container.addEventListener('change', (e) => {
        const target = e.target;
        const row = target.closest('.multi-item-row');
        if (!row) return;

        const entryId = row.dataset.entryId;
        const entry = modalState.entries.find(e => e.id === entryId);
        if (!entry) return;

        if (target.name.startsWith('project_')) {
            entry.projectId = target.value;
            entry.role = '';
            entry.pay = 0;
            
            const worker = appState.workers.find(w => w.id === modalState.workerId);
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
                
                const newRoleSelect = roleContainer.querySelector(`[name="role_${entryId}"]`);
                if (newRoleSelect) {
                    newRoleSelect.addEventListener('change', (ev) => {
                        entry.role = ev.target.value;
                        updatePay(row);
                    });
                }
            }
            updatePay(row);
            
        } else if (target.name.startsWith('role_')) {
            entry.role = target.value;
            updatePay(row);
            
        } else if (target.name.startsWith('status_')) {
            entry.status = target.value;
            
            // Sembunyikan/tampilkan input lain jika 'absen'
            const details1 = row.querySelector('.multi-item-details-line:nth-of-type(1)');
            const details2 = row.querySelector('.multi-item-details-line:nth-of-type(2)');
            const isAbsent = entry.status === 'absent';
            
            if(details1) details1.style.display = isAbsent ? 'none' : '';
            if(details2) details2.style.display = isAbsent ? 'none' : '';
            
            // Set required HANYA jika tidak absen
            const roleInput = row.querySelector(`input[name="role_${entryId}"]`);
            if(roleInput) {
                if (isAbsent) roleInput.removeAttribute('required');
                else roleInput.setAttribute('required', 'true');
            }
            
            updatePay(row);
        }
    });

    // Listener untuk Upah Kustom
    container.addEventListener('input', (e) => {
        const target = e.target;
        const row = target.closest('.multi-item-row');
        if (!row) return;
        
        if (target.name.startsWith('customWage_')) {
            formatNumberInput(e); // Format angka
            updatePay(row); // Hitung ulang
        }
    });
    
    // Listener untuk tombol Hapus Entri
    container.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('[data-action="remove-entry"]');
        if (removeBtn) {
            const row = removeBtn.closest('.multi-item-row');
            if (row) {
                const entryId = row.dataset.entryId;
                modalState.entries = modalState.entries.filter(e => e.id !== entryId);
                row.remove();
                updateTotalPay();
            }
        }
    });
    
    // Listener untuk tombol Tambah Entri
    modal.querySelector('[data-action="add-entry"]')?.addEventListener('click', () => {
        const rowHTML = addEntryRow(container);
        const newRowEl = container.lastElementChild;
        initCustomSelects(newRowEl);
        // Pasang listener spesifik ke input customWage baru
        newRowEl.querySelector('.item-custom-wage')?.addEventListener('input', (e) => {
             formatNumberInput(e);
             updatePay(newRowEl);
        });
        updatePay(newRowEl); // Hitung upah default untuk baris baru
    });
    
    updateTotalPay();
}

export function handleOpenManualAttendanceModal(context) {
    // ... (fungsi tidak berubah) ...
    if (!setupModalState(context)) return; // Setup state

    const date = parseLocalDate(modalState.date);
    const formattedDate = date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    
    const entriesHTML = modalState.entries.map(renderEntryRow).join('');

    const content = `
        <form id="edit-manual-attendance-form" data-worker-id="${modalState.workerId}">
            <div class="card card-pad">
                <div class="success-hero success-hero--attendance" style="margin-bottom:.75rem;">
                    <svg class="success-hero-art" width="120" height="88" viewBox="0 0 120 88" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="ha_edit" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="var(--primary)" stop-opacity="0.18" /><stop offset="100%" stop-color="var(--primary)" stop-opacity="0.05" /></linearGradient></defs><rect x="8" y="12" width="84" height="52" rx="10" fill="url(#ha_edit)" stroke="var(--line)"/><rect x="20" y="26" width="40" height="8" rx="4" fill="var(--primary)" opacity="0.25" /><rect x="20" y="40" width="30" height="8" rx="4" fill="var(--primary)" opacity="0.15" /></svg>
                    <div class="success-preview-icon">${createIcon('hard-hat', 28)}</div>
                </div>
                
                <h5 class="detail-section-title" style="margin-top:0;">Edit Absensi: ${modalState.workerName}</h5>
                <dl class="detail-list">
                    <div><dt>Tanggal</dt><dd>${formattedDate}</dd></div>
                </dl>

                <div id="manual-entry-container" style="margin-top: 1rem;">
                    ${entriesHTML}
                </div>
                
                <button type="button" class="btn btn-secondary" data-action="add-entry" style="margin-top: 1rem;">
                    ${createIcon('plus-circle')} Tambah Proyek Lain
                </button>
            </div>
            
            <div class="card card-pad" style="margin-top: 1rem;">
                <div class="invoice-total attendance-manual-summary" id="attendance-manual-summary">
                    <span>Total Estimasi Upah</span>
                    <strong id="manual-attendance-total">Rp 0</strong>
                </div>
            </div>
        </form>
    `;
    
    const footer = `
        <button type="button" class="btn btn-ghost" data-action="close-detail-pane">Batal</button>
        <button type="button" id="save-manual-attendance-btn" class="btn btn-primary">
            ${createIcon('save')} Terapkan Perubahan
        </button>
    `;

    const modal = showDetailPane({
        title: `Edit Absensi`,
        content: `<div class="scrollable-content">${content}</div>`,
        footer,
        paneType: 'attendance-manual-edit'
    });

    if (modal) {
        initCustomSelects(modal); // Inisialisasi dropdown
        attachEntryListeners(modal); // Pasang semua listener input
        
        // Pasang listener ke tombol Simpan
        modal.querySelector('#save-manual-attendance-btn')?.addEventListener('click', () => {
            // ... (logika simpan tidak berubah) ...
            // 1. Validasi: Kumpulkan semua entri yang valid
            const finalEntries = modalState.entries.filter(e => {
                if (e.status === 'absent') return true; // Absen selalu valid
                return e.projectId && e.role; // Hadir/Setengah harus punya proyek & peran
            });

            if (modalState.entries.length > 0 && finalEntries.length < modalState.entries.length) {
                 toast('error', 'Peran harus dipilih untuk setiap entri yang Hadir/1/2 Hari.');
                 return;
            }

            if (!appState.pendingAttendance) {
                appState.pendingAttendance = new Map();
            }

            // 2. Tentukan data yang akan disimpan ke pendingAttendance
            if (finalEntries.length === 0) {
                // Jika semua baris dihapus, set status jadi 'absen' (sesuai diskusi Absen Implisit, tapi ini Aksi Eksplisit)
                appState.pendingAttendance.set(modalState.workerId, { status: 'absent', pay: 0, role: '', projectId: '' });
            
            } else if (finalEntries.length === 1 && finalEntries[0].status === 'absent') {
                // Jika satu-satunya entri adalah 'absen'
                appState.pendingAttendance.set(modalState.workerId, finalEntries[0]);
            
            } else {
                // Jika 1 atau lebih entri Hadir/Setengah Hari (termasuk multi-proyek)
                appState.pendingAttendance.set(modalState.workerId, finalEntries.filter(e => e.status !== 'absent'));
            }
            
            // 3. Emit event untuk update UI utama
            emit('ui.absensi.renderManualForm'); // Render ulang list
            emit('ui.absensi.updateFooter'); // Update hitungan [Simpan Semua]
            
            toast('success', `Perubahan untuk ${modalState.workerName} siap disimpan.`);
            emit('ui.modal.closeDetailPane'); // Tutup modal/sheet
        });
    }
}

export async function _showAttendanceFilterModal(onApply) {
    // ... (fungsi tidak berubah) ...
    const { professions = [] } = appState;
    const { professionId = 'all' } = appState.attendanceFilter || {};

    const professionOptions = [
        { value: 'all', text: 'Semua Profesi' },
        ...professions.filter(p => !p.isDeleted).map(p => ({ value: p.id, text: p.professionName }))
    ];

    const content = `
        <form id="attendance-filter-form">
            ${createMasterDataSelect('filter-profession-id', 'Filter Berdasarkan Profesi', professionOptions, professionId, 'professions')}
        </form>
    `;

    const footer = `
        <button type="button" id="reset-filter-btn" class="btn btn-secondary">Reset</button>
        <button type="submit" class="btn btn-primary" form="attendance-filter-form">Terapkan</button>
    `;

    const isMobile = window.matchMedia('(max-width: 599px)').matches;
    const modalEl = createModal('formView', { 
        title: 'Filter Pekerja', 
        content, 
        footer, 
        isUtility: true,
        layoutClass: isMobile ? 'is-bottom-sheet' : 'is-simple-dialog' // Responsif
    });
    if (!modalEl) return;

    initCustomSelects(modalEl);

    modalEl.querySelector('#attendance-filter-form').addEventListener('submit', (e) => {
        e.preventDefault();
        appState.attendanceFilter = appState.attendanceFilter || {};
        appState.attendanceFilter.professionId = modalEl.querySelector('#filter-profession-id').value;
        if (typeof onApply === 'function') onApply();
        closeModalImmediate(modalEl);
    });

    modalEl.querySelector('#reset-filter-btn').addEventListener('click', () => {
        appState.attendanceFilter = appState.attendanceFilter || {};
        appState.attendanceFilter.professionId = 'all';
        if (typeof onApply === 'function') onApply();
        closeModalImmediate(modalEl);
    });
}

export function _showAttendanceSortModal(onApply) {
    // ... (fungsi tidak berubah) ...
    const { sortBy = 'status', sortDirection = 'desc' } = appState.attendanceFilter || {};

    const content = `
        <form id="attendance-sort-form">
            <div class="form-group">
                <label>Urutkan Berdasarkan</label>
                <div class="segmented-control">
                    <input type="radio" id="sort-status" name="sortBy" value="status" ${sortBy === 'status' ? 'checked' : ''}>
                    <label for="sort-status">Status</label>
                    <input type="radio" id="sort-name" name="sortBy" value="name" ${sortBy === 'name' ? 'checked' : ''}>
                    <label for="sort-name">Nama</label>
                </div>
            </div>
            <div class="form-group">
                <label>Arah Pengurutan</label>
                <div class="segmented-control" id="sort-direction-control">
                    <input type="radio" id="sort-desc" name="sortDir" value="desc" ${sortDirection === 'desc' ? 'checked' : ''}>
                    <label for="sort-desc">${createIcon('arrow-down', 16)} Sesuai Status</label>
                    <input type="radio" id="sort-asc" name="sortDir" value="asc" ${sortDirection === 'asc' ? 'checked' : ''}>
                    <label for="sort-asc">${createIcon('arrow-up', 16)} Alfabetis (A-Z)</label>
                </div>
            </div>
        </form>
    `;

    const footer = `<button type="submit" class="btn btn-primary" form="attendance-sort-form">Terapkan</button>`;

    const isMobile = window.matchMedia('(max-width: 599px)').matches;
    const modalEl = createModal('formView', {
        title: 'Urutkan Daftar Pekerja',
        content,
        footer,
        isUtility: true,
        layoutClass: isMobile ? 'is-bottom-sheet' : 'is-simple-dialog' // Responsif
    });
    if (!modalEl) return;

    const form = modalEl.querySelector('#attendance-sort-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        appState.attendanceFilter = appState.attendanceFilter || {};
        appState.attendanceFilter.sortBy = form.querySelector('input[name="sortBy"]:checked').value;
        appState.attendanceFilter.sortDirection = form.querySelector('input[name="sortDir"]:checked').value;
        if (typeof onApply === 'function') onApply();
        closeModalImmediate(modalEl);
    });
}