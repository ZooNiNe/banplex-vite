import { appState } from "../../../state/appState.js";
import { $ } from "../../../utils/dom.js";
import { fmtIDR } from "../../../utils/formatters.js";
// PERBAIKAN: Impor closeModalImmediate
import { createModal, closeModal, closeModalImmediate } from "../../components/modal.js";
import { createMasterDataSelect, initCustomSelects } from "../../components/forms/index.js";
import { emit } from "../../../state/eventBus.js";
import { toast } from "../../components/toast.js";

function createIcon(iconName, size = 18, classes = '') {
  const icons = {
    save: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-save ${classes}"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
    'list-checks': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-list-checks ${classes}"><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg>`,
  };
  return icons[iconName] || '';
}

function handleOpenMassAttendanceModal() {
    const selectedIds = Array.from(appState.selectionMode.selectedIds);
    if (selectedIds.length === 0) {
        toast('info', 'Pilih minimal satu pekerja terlebih dahulu.');
        return;
    }

    const statusOptions = [
        { value: 'full_day', text: 'Hadir (1.0 Hari)' },
        { value: 'half_day', text: '1/2 Hari (0.5 Hari)' },
        { value: 'absent', text: 'Absen (0.0 Hari)' }
    ];

    const content = `
        <form id="mass-attendance-form">
            <p class="confirm-modal-text">
                Terapkan status absensi berikut untuk <strong>${selectedIds.length} pekerja</strong> terpilih?
            </p>
            <p class="form-notice">
                Status akan diterapkan menggunakan <strong>proyek & peran default</strong> masing-masing pekerja. Pekerja tanpa pengaturan default yang valid akan dilewati.
            </p>
            
            ${createMasterDataSelect('mass-attendance-status', 'Status Kehadiran', statusOptions, 'full_day', null, true)}
        </form>
    `;

    const footer = `
        <button type="button" class="btn btn-ghost" data-action="history-back">Batal</button>
        <button type="submit" class="btn btn-primary" form="mass-attendance-form">
            ${createIcon('list-checks')} Terapkan
        </button>
    `;

    const modal = createModal('formView', {
        title: 'Set Absensi Massal',
        content,
        footer,
        isUtility: true // PERBAIKAN: Tandai sebagai modal utilitas
    });

    if (modal) {
        initCustomSelects(modal);
        
        const form = modal.querySelector('#mass-attendance-form');
        const statusSelect = modal.querySelector('#mass-attendance-status');

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const status = form.elements['mass-attendance-status'].value;
            
            if (!appState.pendingAttendance) {
                appState.pendingAttendance = new Map();
            }

            let appliedCount = 0;
            let skippedCount = 0;
            const skippedNames = [];

            selectedIds.forEach(workerId => {
                const existingPending = appState.pendingAttendance.get(workerId);
                if (Array.isArray(existingPending) && existingPending.length > 1) {
                    skippedCount++;
                    skippedNames.push(appState.workers.find(w => w.id === workerId)?.workerName || 'Pekerja');
                    return;
                }

                const worker = appState.workers.find(w => w.id === workerId);
                if (!worker) {
                    skippedCount++;
                    skippedNames.push(`ID:${workerId}`);
                    return;
                }

                const defaultProjectId = worker.defaultProjectId || appState.manualAttendanceSelectedProjectId || appState.defaultAttendanceProjectId;
                if (status !== 'absent' && !defaultProjectId) {
                    skippedCount++;
                    skippedNames.push(worker?.workerName || 'Pekerja');
                    return;
                }
                
                const wages = (worker.projectWages || {})[defaultProjectId] || {};
                const role = (worker.defaultRole && wages[worker.defaultRole]) ? worker.defaultRole : (Object.keys(wages)[0] || '');
                
                let pay = 0;
                if (status !== 'absent') {
                    if (!role) {
                        skippedCount++;
                        skippedNames.push(worker?.workerName || 'Pekerja');
                        return;
                    }
                    const baseWage = wages[role] || 0;
                    if (baseWage <= 0) {
                        skippedCount++;
                        skippedNames.push(worker?.workerName || 'Pekerja');
                        return;
                    }
                    pay = (status === 'full_day') ? baseWage : (baseWage / 2);
                }
                
                const entry = {
                    projectId: defaultProjectId,
                    role: role,
                    status: status,
                    pay: pay,
                    customWage: null
                };
                appState.pendingAttendance.set(workerId, entry);
                appliedCount++;
            });
            
            toast('success', `${appliedCount} absensi pekerja diatur & siap disimpan.`);
            if (skippedCount > 0) {
                toast('info', `${skippedCount} pekerja (${skippedNames.join(', ')}) dilewati karena tidak memiliki tarif atau default proyek/peran.`);
            }
            
            appState.selectionMode.selectedIds.clear();

            emit('ui.absensi.renderManualForm');
            emit('ui.absensi.updateFooter');
            
            // PERBAIKAN: Gunakan closeModalImmediate
            closeModalImmediate(modal);
        });
    }
}

export { handleOpenMassAttendanceModal };
