// [GANTI TOTAL] file js/ui/components/forms/workerWage.js

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
        'trash-2': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2 ${classes}"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
        'plus': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus ${classes}"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`
    };
    return icons[iconName] || '';
}

function createRoleRowHTML(name = '', wage = '') {
    const wageFormatted = wage ? new Intl.NumberFormat('id-ID').format(wage) : '';
    return `
        <input type="text" name="role_name" placeholder="Nama Peran (mis. Tukang)" value="${toProperCase(name)}" required data-proper-case="true">
        <input type="text" name="role_wage" inputmode="numeric" placeholder="Nominal Upah" value="${wageFormatted}" required>
        <button type="button" class="btn-icon btn-icon-danger" data-action="remove-role-wage-row">${createIcon('trash-2')}</button>`;
}

export function openWorkerWageDetailModal({ projectId, existingWages, onSave }) {
    const isMobile = window.matchMedia('(max-width: 599px)').matches;

    // --- PERBAIKAN: Buat ID UNIK untuk FORM dan SELECT ---
    const uniqueId = Date.now();
    const uniqueFormId = `worker-wage-form-${uniqueId}`;
    const uniqueSelectId = `wage-project-id-${uniqueId}`;
    // --- AKHIR PERBAIKAN ---

    const projectOptions = (appState.projects || [])
        .filter(p => p.isWageAssignable && !p.isDeleted)
        .map(p => ({
            value: p.id,
            text: p.projectName,
            disabled: (p.id !== projectId) && !!existingWages[p.id]
        }));

    const rolesToEdit = (projectId && existingWages[projectId]) ? existingWages[projectId] : {};
    
    const content = `
        <form id="${uniqueFormId}"> 
            ${createMasterDataSelect(
                uniqueSelectId, // Gunakan ID unik
                'Proyek', 
                projectOptions, 
                projectId || '', 
                null, 
                true, 
                false
            )}
            <div class="role-wage-list">
                ${Object.keys(rolesToEdit).length > 0
                    ? Object.entries(rolesToEdit).map(([name, wage]) => `
                        <div class="role-wage-row">${createRoleRowHTML(name, wage)}</div>
                      `).join('')
                    : `<div class="role-wage-row">${createRoleRowHTML()}</div>`
                }
            </div>
        </form>
    `;
    
    const footer = `
        <button type="button" class="btn btn-secondary" data-action="add-role-wage-row" style="margin-right: auto;">
            ${createIcon('plus', 18)}
            <span class="btn-text">Tambah Peran</span>
        </button>
        <button type="submit" form="${uniqueFormId}" class="btn btn-primary">Simpan</button>
    `;

    const modal = createModal('dataDetail', {
        title: projectId ? 'Edit Upah Proyek' : 'Tambah Upah Proyek',
        content,
        footer,
        layoutClass: isMobile ? 'is-bottom-sheet' : 'is-simple-dialog'
    });

    // --- PERBAIKAN: Cari form dengan ID unik ---
    const form = modal.querySelector(`#${uniqueFormId}`);
    // --- AKHIR PERBAIKAN ---

    const roleList = modal.querySelector('.role-wage-list');

    // Jika form tidak ditemukan, hentikan eksekusi untuk mencegah error
    if (!form) {
        console.error("KRITIS: Form upah pekerja tidak dapat ditemukan di DOM modal.");
        toast('error', 'Gagal memuat form. Silakan coba muat ulang halaman.');
        return;
    }

    roleList.querySelectorAll('.role-wage-row').forEach(row => {
         row.querySelector('input[name="role_wage"]').addEventListener('input', formatNumberInput);
         row.querySelector('input[name="role_name"]').addEventListener('blur', (e) => {
             e.target.value = toProperCase(e.target.value);
        });
    });

    initCustomSelects(modal);
    
    // --- PERBAIKAN: Gunakan .onsubmit untuk MENGGANTI listener ---
    // Ini mencegah penumpukan listener dari modal yang dibuka sebelumnya.
    form.onsubmit = (e) => {
        e.preventDefault();

        const selectElement = modal.querySelector(`#${uniqueSelectId}`);
        const selectedProjectId = selectElement ? selectElement.value : null;

        if (!selectedProjectId) {
            toast('error', 'Silakan pilih proyek.');
            return;
        }

        const roles = {}; 
        let isValid = true;
        let hasDuplicate = false;
        
        roleList.querySelectorAll('.role-wage-row').forEach(row => {
            const nameInput = row.querySelector('[name="role_name"]');
            const wageInput = row.querySelector('[name="role_wage"]');
            
            const name = nameInput.value.trim();
            const wage = parseFormattedNumber(wageInput.value);
            
            // PERBAIKAN VALIDASI: Abaikan baris yang benar-benar kosong
            if (!name && (wage === 0 || isNaN(wage))) {
                return; // 1. Abaikan baris kosong
            }

            if (name && wage > 0) {
                const properName = toProperCase(name);
                if (roles[properName]) { 
                    hasDuplicate = true;
                }
                roles[properName] = wage;
            } else {
                isValid = false; // 2. Baris diisi sebagian (tidak valid)
            }
        });
        
        if (hasDuplicate) {
            toast('error', 'Nama peran dalam satu proyek tidak boleh sama.');
            return;
        }

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
        
        form.onsubmit = null; // Hapus handler setelah selesai
    };
}