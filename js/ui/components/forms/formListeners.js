import { emit, on } from "../../../state/eventBus.js";
import { attachClientValidation, validateForm } from '../../../utils/validation.js';
import { toProperCase } from "../../../utils/helpers.js";
// PERBAIKAN: Impor 'serializeForm' dari 'formPersistence'
import { submitFormAsync, fallbackLocalFormHandler, serializeForm } from "../../../utils/formPersistence.js";
import { handleAddMasterItem, handleUpdateMasterItem } from "../../../services/data/masterDataService.js";
// PERBAIKAN: Impor 'createModal'
import { createModal, closeModal, resetFormDirty, markFormDirty, closeDetailPane, closeDetailPaneImmediate, hideMobileDetailPage, hideMobileDetailPageImmediate } from "../modal.js";
import { handleUpdatePemasukan, handleAddPemasukan } from "../../../services/data/transactions/pemasukanService.js";
import { handleUpdatePengeluaran, handleAddPengeluaran } from "../../../services/data/transactions/pengeluaranService.js";
import { handleDeleteAttachment, handleReplaceAttachment } from "../../../services/data/transactions/attachmentService.js";
import { toast } from "../toast.js";
import { appState } from "../../../state/appState.js";
import { openWorkerWageDetailModal, formatNumberInput, addInvoiceItemRow, handleInvoiceItemChange, initCustomSelects } from "./index.js";
import { parseFormattedNumber, parseLocaleNumber } from "../../../utils/formatters.js";
import { handleAttachmentUpload } from './attachmentManager.js';

function createIcon(iconName, size = 18, classes = '') {
    const icons = {
        edit: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pencil ${classes}"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
        'trash-2': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2 ${classes}"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
        save: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-save ${classes}"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
    };
    return icons[iconName] || '';
}


export function attachStaffFormListeners(context = document) {

    const paymentTypeSelect = context.querySelector('input[name="paymentType"]');
    if (paymentTypeSelect) {
        const updateVisibility = () => {
            const type = paymentTypeSelect.value;
            const salaryGroup = context.querySelector('.staff-salary-group');
            const feeGroup = context.querySelector('.staff-fee-group');
            const feeAmountGroup = context.querySelector('.staff-fee-amount-group');

            if (salaryGroup) salaryGroup.style.display = type === 'fixed_monthly' ? '' : 'none';
            if (feeGroup) feeGroup.style.display = type === 'per_termin' ? '' : 'none';
            if (feeAmountGroup) feeAmountGroup.style.display = type === 'fixed_per_termin' ? '' : 'none';
        };
        updateVisibility();
        paymentTypeSelect.addEventListener('change', updateVisibility);
    }
}


function initializeFormSpecificListeners() {

    emit('ui.forms.init', document);

    document.body.addEventListener('blur', (e) => {
        if (e.target.matches('input[data-proper-case="true"], textarea[data-proper-case="true"]')) {
            e.target.value = toProperCase(e.target.value);
        }
    }, true);


    document.addEventListener('submit', async (e) => {

        const form = e.target;
        if (!(form instanceof HTMLFormElement)) {

            return;
        }

        if (form.id === 'master-data-form') {
            e.preventDefault();
            e.stopImmediatePropagation();


            if (!validateForm(form)) {

                 return;
            }

            const action = form.dataset.action;
            if (action === 'addMasterItem') {

                await handleAddMasterItem(form);
            } else if (action === 'updateMasterItem') {

                await handleUpdateMasterItem(form);
            }
            resetFormDirty();
            return;
        }

        if (form.id === 'edit-item-form') {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            if (!validateForm(form)) return;

            const formType = form.dataset.type;
            let updateFunction;
            let isConversion = false;

            if (formType === 'expense') {
                updateFunction = handleUpdatePengeluaran;
                const expense = appState.expenses.find(exp => exp.id === form.dataset.id);
                isConversion = expense && expense.status === 'delivery_order';
            } else if (formType === 'termin' || formType === 'pinjaman' || formType === 'loan') {
                updateFunction = handleUpdatePemasukan;
            } else {
                 toast('error', 'Tipe form edit tidak dikenal.');
                 return;
            }

            createModal('confirmEdit', {
                message: isConversion ? 'Anda yakin ingin mengubah Surat Jalan ini menjadi Tagihan?' : 'Anda yakin ingin menyimpan perubahan?',
                onConfirm: async () => {
                    const panel = form.closest('#detail-pane');
                    const isMobile = window.matchMedia('(max-width: 599px)').matches;

                    const savingToast = toast('syncing', 'Menyimpan...');
                    const result = await updateFunction(form);
                    if (savingToast && typeof savingToast.close === 'function') savingToast.close();

                    if (result.success) {
                        toast('success', isConversion ? 'Surat Jalan berhasil diubah menjadi Tagihan!' : 'Perubahan berhasil disimpan!');
                        resetFormDirty();

                        if (isMobile) {
                            hideMobileDetailPageImmediate();
                        } else if (panel) {
                            closeDetailPaneImmediate();
                        }

                        const navTarget = (result.itemType === 'termin' || result.itemType === 'pinjaman') ? 'pemasukan' : 'tagihan';
                        
                        // --- PERBAIKAN BUG 1 ---
                        // Cek apakah kita sudah di halaman target.
                        if (appState.activePage === navTarget) {
                            // Jika ya, panggil 'ui.page.render' untuk me-refresh list.
                            emit('ui.page.render'); 
                        } else {
                            // Fallback: navigasi ke halaman yang benar
                            emit('ui.navigate', navTarget);
                        }
                        // --- AKHIR PERBAIKAN BUG 1 ---

                    } else {
                        toast('error', 'Gagal menyimpan. Coba lagi.');
                    }
                    return result.success;
                }
            });
            return;
        }

        const isExpenseForm = form.id === 'pengeluaran-form' || form.id === 'material-invoice-form';
        if (isExpenseForm) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            if (!validateForm(form)) {
                 return;
            }

            if (!appState.currentUser || !appState.currentUser.uid) {
                toast('error', 'Sesi pengguna tidak valid. Silakan logout dan login kembali.');
                return;
            }


            const type = form.dataset.type || appState.activeSubPage.get('pengeluaran') || 'operasional';
            const description = form.elements['pengeluaran-deskripsi']?.value || form.elements['description']?.value || 'Pengeluaran Baru';
            const formType = form.elements['formType']?.value;

            let message, contextType;

            if (formType === 'surat_jalan') {
                message = `Anda akan menyimpan <strong>Surat Jalan</strong>: <strong>${description}</strong>. Lanjutkan?`;
                contextType = 'expense-submit';
            } else if (type === 'material' && formType === 'faktur') {
                message = `Anda yakin ingin menyimpan <strong>Faktur Material</strong>: <strong>${description}</strong>? Pilih status pembayaran.`;
                contextType = 'expense-submit';
            } else {
                 message = `Anda yakin ingin menyimpan pengeluaran: <strong>${description}</strong>? Pilih status pembayaran.`;
                 contextType = 'expense-submit';
            }

            createModal('confirmUserAction', {
                title: 'Konfirmasi Simpan Pengeluaran',
                message: message,
                contextType: contextType,
                formType: formType,
                onConfirm: async (statusOverride) => {
                    const loadingBtn = form.querySelector('[type="submit"], .btn-primary');
                    if (loadingBtn) loadingBtn.disabled = true;
                    let success = false;
                    try {
                        await handleAddPengeluaran(form, type, statusOverride);
                        success = true;
                        resetFormDirty();
                        if (form._clearDraft) form._clearDraft();
                    } catch (err) {

                        toast('error', err.message || 'Gagal menyimpan, coba lagi.');
                    } finally {
                        if (loadingBtn) loadingBtn.disabled = false;
                    }
                    return success;
                }
            });
            return;
        }

        if (form.id === 'pemasukan-form') {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

             if (!validateForm(form)) return;

             if (!appState.currentUser || !appState.currentUser.uid) {
                 toast('error', 'Sesi pengguna tidak valid atau belum siap. Coba lagi sebentar.');

                 return;
             }

             const type = form.dataset.type || 'termin';
             let description = '';
             let safeToProceed = false;

             const formDataObject = serializeForm(form);


             try {
                 let selectedName = 'Item ?';
                 let inputName = '';
                 let selectedId = null;
                 let selectedItem = null;

                 if (type === 'termin') {
                    inputName = 'pemasukan-proyek';
                 } else if (type === 'pinjaman') {
                    inputName = 'pemasukan-kreditur';
                 } else {

                      throw new Error(`Tipe pemasukan tidak valid: ${type}`);
                 }


                 const formElement = form.elements[inputName];
                 if (!formElement) {

                     throw new Error(`Elemen form '${inputName}' tidak ditemukan.`);
                 }


                 if (!formDataObject.hasOwnProperty(inputName)) {

                     throw new Error(`Data '${inputName}' tidak ditemukan setelah serialisasi.`);
                 }
                 selectedId = formDataObject[inputName];


                 if (selectedId) {
                    if (type === 'termin') {

                        if (!Array.isArray(appState.projects)) {

                            throw new Error("Data proyek belum siap.");
                        }
                        selectedItem = appState.projects.find(p => p.id === selectedId);

                    } else {

                        if (!Array.isArray(appState.fundingCreditors)) {

                            throw new Error("Data kreditur belum siap.");
                        }
                        selectedItem = appState.fundingCreditors.find(c => c.id === selectedId);

                    }

                    if (selectedItem) {

                        const potentialName = selectedItem.projectName || selectedItem.creditorName;
                        if (typeof potentialName === 'string' && potentialName.trim() !== '') {
                            selectedName = potentialName;

                        } else {


                        }
                    } else {


                    }
                 } else {


                 }


                 if (typeof selectedName === 'undefined') {

                    selectedName = 'Item (Error)';
                 }



                 if (type === 'termin') {
                     description = `Termin ${selectedName}`;
                 } else {
                     description = `Pinjaman ${selectedName}`;
                 }


                 if (selectedName === 'Item ?' || selectedName === 'Item (Error)') {


                 }

                 safeToProceed = true;
             } catch (error) {

                 toast('error', error.message || 'Gagal memproses pilihan Proyek/Kreditur.');
                 safeToProceed = false;
                 return;
             }

             if (!safeToProceed) {

                 return;
             }


            // PERBAIKAN 1.1: Simpan referensi modal
            const confirmModal = createModal('confirmUserAction', {
                 title: `Konfirmasi Simpan ${type === 'termin' ? 'Termin' : 'Pinjaman'}`,
                 message: `Anda yakin ingin menyimpan data ${type === 'termin' ? 'Termin' : 'Pinjaman'}: <strong>${description || '(Deskripsi Gagal Dibuat)'}</strong>?`,
                 onConfirm: async () => {
                    // PERBAIKAN 1.1: Tutup modal konfirmasi ini
                    if (confirmModal) {
                        closeModal(confirmModal);
                    }
                     const loadingBtn = form.querySelector('[type="submit"], .btn-primary');
                     if (loadingBtn) loadingBtn.disabled = true;
                     let success = false;
                     try {

                         await handleAddPemasukan(formDataObject, type);
                         success = true;
                         resetFormDirty();
                         try {
                             form.reset();
                             if (form._clearDraft) form._clearDraft();
                         } catch (resetErr) {

                         }
                     } catch (err) {

                         toast('error', err instanceof Error ? err.message : 'Gagal menyimpan, coba lagi.');
                     } finally {
                         if (loadingBtn) loadingBtn.disabled = false;
                     }

                     return success;
                 }
             });
            return;
        }

        if (form.id === 'manual-attendance-form') {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            if (!validateForm(form)) {
                toast('error', 'Pastikan semua peran pekerja sudah dipilih.');
                return;
            }
            return;
        }

        const isAsync = form.matches('form[data-async]');
        const knownAppFormIds = new Set([
            'stok-in-form', 'stok-out-form',
            'payment-form', 'edit-attendance-form',
        ]);

        if (!isAsync && !knownAppFormIds.has(form.id)) {

            return;
        }


        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();


         if (!validateForm(form)) return;

        const loadingBtn = form.querySelector('[type="submit"], .btn-primary');
        if (loadingBtn) loadingBtn.disabled = true;

        try {
            if (knownAppFormIds.has(form.id)) {
                 const eventName = `form.submit.${form.id.replace(/-/g, '')}`;

                 emit(eventName, e);
            } else {

                try {
                    await submitFormAsync(form);
                } catch (_) {
                    await fallbackLocalFormHandler(form);
                }
                const successMsg = form.dataset.successMsg || 'Berhasil disimpan.';
                if (!successMsg.toLowerCase().includes('diperbarui')) {
                    toast('success', successMsg);
                }
                 resetFormDirty();

                if (form._clearDraft) form._clearDraft();
                const modal = form.closest('.modal-bg, .detail-pane');

                emit('ui.page.render');

                if (modal && modal.classList.contains('modal-bg')) {
                     closeModal(modal);
                } else if (modal && modal.id === 'detail-pane') {
                     closeDetailPane();
                }
                emit('ui.sync.updateIndicator');
            }
        } catch (err) {

            toast('error', err.message || 'Gagal menyimpan, coba lagi.');
        } finally {
            if (loadingBtn) loadingBtn.disabled = false;
        }

    }, { capture: true });
}


export function initializeFormListeners() {

    initializeFormSpecificListeners();

    on('ui.form.openWorkerWageDetail', ({ target } = {}) => {
        try {
            const form = (target && target.closest && target.closest('form#master-data-form[data-type="workers"]')) || null;
            if (!form) return;
            const list = form.querySelector('#worker-wages-summary-list');
            if (!list) return;

            const existingWages = {};
            list.querySelectorAll('.worker-wage-summary-item').forEach(it => {
                const pid = it.dataset.projectId;
                try { existingWages[pid] = JSON.parse(it.dataset.wages || '{}'); } catch { existingWages[pid] = {}; }
            });

            const editingItem = target && target.closest ? target.closest('.worker-wage-summary-item') : null;
            const editProjectId = editingItem ? editingItem.dataset.projectId : null;

            const onSave = ({ projectId, roles }) => {
                const project = (window.appState || appState).projects.find(p => p.id === projectId);
                const rolesHTML = Object.entries(roles).map(([name, wage]) => `<span class="badge">${name}: ${new Intl.NumberFormat('id-ID').format(wage)}</span>`).join(' ');
                const markup = `
                    <div class="worker-wage-summary-item" data-project-id="${projectId}" data-wages='${JSON.stringify(roles)}'>
                      <div class="dense-list-item">
                        <div class="item-main-content">
                            <strong class="item-title">${project?.projectName || 'Proyek'}</strong>
                            <div class="item-sub-content role-summary">${rolesHTML}</div>
                        </div>
                        <div class="item-actions">
                          <button type="button" class="btn-icon" title="Edit" data-action="edit-worker-wage">${createIcon('edit')}</button>
                          <button type="button" class="btn-icon btn-icon-danger" title="Hapus" data-action="remove-worker-wage">${createIcon('trash-2')}</button>
                        </div>
                      </div>
                    </div>`;

                const existingEl = list.querySelector(`.worker-wage-summary-item[data-project-id="${projectId}"]`);
                if (existingEl) existingEl.outerHTML = markup;
                else list.insertAdjacentHTML('beforeend', markup);

                const empty = list.querySelector('.empty-state-small');
                if (empty) empty.remove();
                markFormDirty(true);
            };

            openWorkerWageDetailModal({ projectId: editProjectId, existingWages, onSave });
        } catch (e) { console.error(e); }
    });

    on('ui.form.addRoleWageRow', ({ target } = {}) => {
        try {
            const context = (target && target.closest && target.closest('.modal-bg, .detail-pane')) || document;
            const listContainer = target && target.closest ? (target.closest('.role-wage-list') || (context.querySelector('.role-wage-list'))) : context.querySelector('.role-wage-list');
            if (!listContainer) return;
            const row = document.createElement('div');
            row.className = 'role-wage-row';
            row.innerHTML = `
                <input type="text" name="role_name" placeholder="Nama Peran (mis. Tukang)" required data-proper-case="true">
                <input type="text" name="role_wage" inputmode="numeric" placeholder="Nominal Upah" required>
                <button type="button" class="btn-icon btn-icon-danger" data-action="remove-role-wage-row">${createIcon('trash-2')}</button>`;
            listContainer.appendChild(row);
            const wageInput = row.querySelector('input[name="role_wage"]');
            if (wageInput) wageInput.addEventListener('input', formatNumberInput);
            markFormDirty(true);
        } catch (e) { console.error(e); }
    });

    on('ui.form.removeRoleWageRow', ({ target } = {}) => {
        try {
            const row = target && target.closest ? target.closest('.role-wage-row') : null;
            if (row) {
                 row.remove();
                 markFormDirty(true);
            }
        } catch (e) { console.error(e); }
    });

    on('ui.form.setPaymentAmount', (mode) => {
        try {
            const modal = document.querySelector('#modal-container .modal-bg.show:last-of-type, #detail-pane') || document;
            const amountEl = modal.querySelector('#payment-remaining-amount');
            const input = modal.querySelector('#payment-input-amount');
            if (!amountEl || !input) return;
            const remaining = Number(amountEl.dataset.rawAmount || 0);
            const value = mode === 'half' ? Math.ceil(remaining / 2) : remaining;
            input.value = new Intl.NumberFormat('id-ID').format(value);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            markFormDirty(true);
        } catch (_) {}
    });
     on('ui.form.addInvoiceItemRow', () => {
         const context = document.querySelector('#material-invoice-form, #edit-item-form');
         if(context) {
             addInvoiceItemRow(context);
             markFormDirty(true);
         }
     });

     on('ui.forms.init', (context) => {
         attachStaffFormListeners(context);
     });
}

function _switchMaterialFormMode(form, newType) {
    const isSuratJalan = newType === 'surat_jalan';
    const totalWrapper = form.querySelector('#total-faktur-wrapper');
    const paymentWrapper = form.querySelector('#payment-status-wrapper');

    form.querySelectorAll('.item-price').forEach(input => {
        const group = input.closest('.form-group');
        const label = group?.querySelector('label');
        if (isSuratJalan) {
            input.value = '0';
            input.setAttribute('readonly', 'readonly');
            input.removeAttribute('required');
            if (label) label.textContent = 'Harga Satuan (Rp 0)';
        } else {
            input.removeAttribute('readonly');
            input.setAttribute('required', 'required');
             if (label) label.textContent = 'Harga Satuan';
        }
    });

    if (totalWrapper) totalWrapper.classList.toggle('hidden', isSuratJalan);
    if (paymentWrapper) paymentWrapper.classList.toggle('hidden', isSuratJalan);

    handleInvoiceItemChange(form);
}


export function attachPengeluaranFormListeners(type, context = document) {
    initCustomSelects(context);
    const form = (type === 'material')
        ? context.querySelector('#material-invoice-form, #edit-item-form')
        : context.querySelector('#pengeluaran-form, #edit-item-form');
    if (!form) return;

    attachClientValidation(form);

    const attachmentContainer = form.querySelector('#new-attachment-container');
    const fileInput = form.querySelector('input[name="attachment"]');

    if (attachmentContainer && fileInput) {
        attachmentContainer.addEventListener('click', (e) => {
            const placeholder = e.target.closest('.placeholder[data-action="upload-attachment"]');
            if (placeholder) {
                if (window.matchMedia('(max-width: 599px)').matches) {
                    e.preventDefault();
                    emit('ui.modal.create', 'uploadSource', {
                        onSelect: (source) => {
                            fileInput.removeAttribute('capture');
                            if (source === 'camera') {
                                fileInput.setAttribute('capture', 'environment');
                            }
                            setTimeout(() => fileInput.click(), 50);
                        }
                    });
                } else {
                    fileInput.click();
                }
            }

            const deleteBtn = e.target.closest('[data-action="delete-temp-attachment"]');
            if (deleteBtn) {
                const itemPreview = deleteBtn.closest('.attachment-manager-item');
                const urlToDelete = itemPreview?.dataset.url;
                const syncedUrlsInput = form.querySelector('input[name="syncedAttachmentUrls"]');

                if (itemPreview && urlToDelete && syncedUrlsInput) {
                    let currentUrls = syncedUrlsInput.value ? JSON.parse(syncedUrlsInput.value) : [];
                    currentUrls = currentUrls.filter(att => att.url !== urlToDelete);
                    syncedUrlsInput.value = JSON.stringify(currentUrls);
                    itemPreview.remove();
                    toast('info', 'Lampiran dibatalkan.');
                }
            }

             const deleteExistingBtn = e.target.closest('[data-action="delete-attachment"]');
             if (deleteExistingBtn) {
                 const expenseId = deleteExistingBtn.dataset.expenseId;
                 const urlToDelete = deleteExistingBtn.dataset.url;
                 if (expenseId && urlToDelete) {
                     emit('data.deleteAttachment', { expenseId, url: urlToDelete });
                     const itemPreview = deleteExistingBtn.closest('.attachment-manager-item');
                     if (itemPreview) itemPreview.remove();
                 }
             }

        });

        fileInput.addEventListener('change', async (e) => {
            const files = e.target.files;
            if (!files || files.length === 0) return;


            for (const file of files) {
                await handleAttachmentUpload(file, form, 'attachment', false);
            }
            fileInput.value = '';
        });
    }


    form.querySelectorAll('.segmented-control input[name="status"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
        });
    });

    if (type === 'material') {
        const addInvoiceItemBtn = form.querySelector('[data-action="add-invoice-item-btn"]');
        if (addInvoiceItemBtn) {
            addInvoiceItemBtn.addEventListener('click', (e) => {
                e.preventDefault();
                addInvoiceItemRow(form);
            });
        }

        const itemsContainer = form.querySelector('#invoice-items-container');

        itemsContainer.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.remove-item-btn');
            if (removeBtn) {
                e.preventDefault();
                const row = removeBtn.closest('.multi-item-row');
                if (row) {
                    row.remove();
                    handleInvoiceItemChange(form);
                }
            }
        });

        if (itemsContainer) {
            handleInvoiceItemChange(form);
            itemsContainer.addEventListener('input', (e) => {
                if(e.target.classList.contains('item-qty') || e.target.classList.contains('item-price')) {
                    handleInvoiceItemChange(form);
                }
            });
            itemsContainer.addEventListener('change', (e) => {
                 if(e.target.type === 'hidden' && e.target.id.startsWith('materialId_')) {
                    handleInvoiceItemChange(form);
                 }
            });

        }

        const typeSelector = form.querySelector('#form-type-selector');
        if (typeSelector) {
            const formTypeHidden = form.querySelector('input[name="formType"]');
            typeSelector.querySelectorAll('input[name="_formTypeRadio"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    const newType = e.target.value;
                    formTypeHidden.value = newType;
                    _switchMaterialFormMode(form, newType);
                });
            });
        }

        const initialFormType = form.querySelector('input[name="formType"]')?.value || 'faktur';
        _switchMaterialFormMode(form, initialFormType);
    } else {
        const amountInput = form.querySelector('#pengeluaran-jumlah');
        if(amountInput) amountInput.addEventListener('input', formatNumberInput);
    }
}