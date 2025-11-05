import { appState } from "../../../state/appState.js";
import { fmtIDR, parseFormattedNumber } from "../../../utils/formatters.js";
import { emit } from "../../../state/eventBus.js";
import { toast } from "../toast.js";
import { createMasterDataSelect, initCustomSelects } from "./customSelect.js";
import { formatNumberInput } from "./inputFormatters.js";
import { createModal, resetFormDirty } from "../modal.js";
import { toProperCase } from "../../../utils/helpers.js";

function createIcon(iconName, size = 18, classes = '') {
    const icons = {
        'trash-2': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2 ${classes}"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`, // Used for delete
    };
    return icons[iconName] || '';
}

export function openWorkerWageDetailModal({ projectId, existingWages, onSave }) {
    const isMobile = window.matchMedia('(max-width: 599px)').matches;

    const projectOptions = (appState.projects || [])
        .filter(p => p.isWageAssignable && !p.isDeleted)
        .map(p => ({
            value: p.id,
            text: p.projectName,
            disabled: !!existingWages[p.id] && p.id !== projectId
        }));

    const content = `
        <form id="worker-wage-form">
            ${createMasterDataSelect('wage-project-id', 'Proyek', projectOptions, projectId || '', null, true)}
            <div class="role-wage-list"></div>
            <button type="button" class="btn btn-secondary" data-action="add-role-wage-row">Tambah Peran & Upah</button>
        </form>
    `;
    const footer = `<button type="submit" form="worker-wage-form" class="btn btn-primary">Simpan</button>`;

    // PERBAIKAN 3: Gunakan layoutClass untuk membuatnya responsif
    const modal = createModal('dataDetail', {
        title: projectId ? 'Edit Upah Proyek' : 'Tambah Upah Proyek',
        content,
        footer,
        layoutClass: isMobile ? 'is-bottom-sheet' : 'is-simple-dialog'
    });

    const form = modal.querySelector('#worker-wage-form');
    const roleList = modal.querySelector('.role-wage-list');

    const addRow = (name = '', wage = '') => {
        const row = document.createElement('div');
        row.className = 'role-wage-row';
        row.innerHTML = `
            <input type="text" name="role_name" placeholder="Nama Peran (mis. Tukang)" value="${name}" required data-proper-case="true">
            <input type="text" name="role_wage" inputmode="numeric" placeholder="Nominal Upah" value="${wage}" required>
            <button type="button" class="btn-icon btn-icon-danger" data-action="remove-role-wage-row">${createIcon('trash-2')}</button>`;
        roleList.appendChild(row);
        row.querySelector('input[name="role_wage"]').addEventListener('input', formatNumberInput);
        row.querySelector('input[name="role_name"]').addEventListener('blur', (e) => {
             e.target.value = toProperCase(e.target.value);
        });
    };

    if (projectId) {
        const roles = existingWages[projectId] || {};
        Object.entries(roles).forEach(([name, wage]) => {
            addRow(name, new Intl.NumberFormat('id-ID').format(wage));
        });
    }

    if (roleList.children.length === 0) {
        addRow();
    }

    initCustomSelects(modal);

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const selectedProjectId = form.elements['wage-project-id'].value;
        if (!selectedProjectId) {
            toast('error', 'Silakan pilih proyek.');
            return;
        }

        const roles = {};
        let isValid = true;
        roleList.querySelectorAll('.role-wage-row').forEach(row => {
            const name = row.querySelector('[name="role_name"]').value.trim();
            const wage = parseFormattedNumber(row.querySelector('[name="role_wage"]').value);
            if (name && wage > 0) {
                roles[name] = wage;
            } else {
                isValid = false;
            }
        });

        if (!isValid || Object.keys(roles).length === 0) {
            toast('error', 'Pastikan semua peran memiliki nama dan upah yang valid (lebih dari 0).');
            return;
        }

        if (typeof onSave === 'function') {
            onSave({ projectId: selectedProjectId, roles });
        }
        try { toast('success', 'Upah disimpan.'); } catch(_) {}
        
        resetFormDirty();
        
        emit('ui.modal.close', modal);
    });
}