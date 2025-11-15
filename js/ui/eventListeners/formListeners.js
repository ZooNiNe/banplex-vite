import { emit, on } from "../../state/eventBus.js";
import { toProperCase } from "../../utils/helpers.js";
import { submitFormAsync, fallbackLocalFormHandler, serializeForm } from "../../utils/formPersistence.js"; // Impor serializeForm
import { handleAddMasterItem, handleUpdateMasterItem } from "../../services/data/masterDataService.js";
import { createModal, closeModal, resetFormDirty, markFormDirty, closeDetailPane, closeDetailPaneImmediate, hideMobileDetailPage, hideMobileDetailPageImmediate, startGlobalLoading } from "../components/modal.js";
import { handleUpdatePemasukan, handleAddPemasukan } from "../../services/data/transactions/pemasukanService.js";
import { handleUpdatePengeluaran, handleAddPengeluaran } from "../../services/data/transactions/pengeluaranService.js";
import { toast } from "../components/toast.js";
import { appState } from "../../state/appState.js";

let formSubmitController = null;

function initializeFormSpecificListeners() {
    emit('ui.forms.init', document);

    const blurController = new AbortController();
    document.body.addEventListener('blur', (e) => {
        if (e.target.matches('input[data-proper-case="true"], textarea[data-proper-case="true"]')) {
            e.target.value = toProperCase(e.target.value);
        }
    }, { capture: true, signal: blurController.signal });

    if (formSubmitController) {
        formSubmitController.abort();
    }
    formSubmitController = new AbortController();
    const { signal } = formSubmitController;

    document.addEventListener('submit', async (e) => {
        const form = e.target;
        if (!(form instanceof HTMLFormElement)) return;

        if (form.id === 'master-data-form') {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (!validateForm(form)) return;
            const action = form.dataset.action;
            const panel = form.closest('#detail-pane');
            if (panel) {
                closeDetailPaneImmediate(); 
            }
            resetFormDirty();
            if (action === 'addMasterItem') await handleAddMasterItem(form);
            else if (action === 'updateMasterItem') await handleUpdateMasterItem(form);
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
            } else if (['termin', 'pinjaman', 'loan'].includes(formType)) {
                updateFunction = handleUpdatePemasukan;
            } else { toast('error', 'Tipe form edit tidak dikenal.'); return; }
            createModal('confirmEdit', {
                message: isConversion ? 'Ubah Surat Jalan menjadi Tagihan?' : 'Simpan perubahan?',
                onConfirm: async () => {
                    const panel = form.closest('#detail-pane');
                    const isMobile = window.matchMedia('(max-width: 599px)').matches;
                    if (isMobile) {
                        hideMobileDetailPageImmediate();
                    } else if (panel) {
                        closeDetailPaneImmediate();
                    }
                    resetFormDirty(); 

                    const loader = startGlobalLoading('Menyimpan...');
                    let result;
                    try {
                        result = await updateFunction(form);
                    } finally {
                        loader.close();
                    }

                    if (result.success) {
                        toast('success', isConversion ? 'Surat Jalan berhasil diubah menjadi Tagihan!' : 'Perubahan berhasil disimpan!');

                        const navTarget = (result.itemType === 'termin' || result.itemType === 'pinjaman') ? 'pemasukan' : 'tagihan';
                        if (isMobile) {
                            // Di mobile, kita perlu sedikit delay agar panel sempat tertutup
                            setTimeout(() => {
                                emit('ui.navigate', navTarget);
                            }, 50);
                        } else {
                            emit('ui.navigate', navTarget);
                        }

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
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            if (!validateForm(form)) return;
            if (!appState.currentUser?.uid) { toast('error', 'Sesi tidak valid.'); return; }
            const type = form.dataset.type || appState.activeSubPage.get('pengeluaran') || 'operasional';
            const description = form.elements['pengeluaran-deskripsi']?.value || form.elements['description']?.value || 'Pengeluaran Baru';
            const formType = form.elements['formType']?.value;
            let message, contextType;
            if (formType === 'surat_jalan') { message = `Simpan <strong>Surat Jalan</strong>: <strong>${description}</strong>?`; contextType = 'expense-submit'; }
            else if (type === 'material' && formType === 'faktur') { message = `Simpan <strong>Faktur Material</strong>: <strong>${description}</strong>? Pilih status.`; contextType = 'expense-submit'; }
            else { message = `Simpan pengeluaran: <strong>${description}</strong>? Pilih status.`; contextType = 'expense-submit'; }
            createModal('confirmUserAction', {
                title: 'Konfirmasi Simpan', message, contextType, formType,
                onConfirm: async (statusOverride) => {
                    const panel = form.closest('#detail-pane');
                    if (panel) {
                        closeDetailPaneImmediate();
                    }
                    const isMobile = window.matchMedia('(max-width: 599px)').matches;
                    if(isMobile) {
                        hideMobileDetailPage(); // Gunakan hideMobileDetailPage() yang normal di sini
                    }
                    resetFormDirty();
                    if (form._clearDraft) form._clearDraft();
                    const loadingBtn = form.querySelector('[type="submit"], .btn-primary');
                    if (loadingBtn) loadingBtn.disabled = true;
                    let success = false;
                    try { await handleAddPengeluaran(form, type, statusOverride); success = true;

                    } catch (err) { toast('error', err.message || 'Gagal menyimpan.'); }
                    finally { if (loadingBtn) loadingBtn.disabled = false; }
                    return success;
                }
            });
            return;
        }

        if (form.id === 'pemasukan-form') {
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            if (!validateForm(form)) return;
            if (!appState.currentUser?.uid) { toast('error', 'Sesi tidak valid.'); return; }
            const type = form.dataset.type || 'termin';
            let description = ''; let safeToProceed = false; const formDataObject = serializeForm(form);
            try {
                let selectedName = 'Item ?'; let inputName = ''; let selectedId = null; let selectedItem = null;
                if (type === 'termin') inputName = 'pemasukan-proyek';
                else if (type === 'pinjaman') inputName = 'pemasukan-kreditur';
                else throw new Error(`Tipe tidak valid: ${type}`);
                const formElement = form.elements[inputName];
                if (!formElement) throw new Error(`Elemen '${inputName}' tidak ditemukan.`);
                if (!formDataObject.hasOwnProperty(inputName)) throw new Error(`Data '${inputName}' tidak ada.`);
                selectedId = formDataObject[inputName];
                if (selectedId) {
                    if (type === 'termin') { if (!Array.isArray(appState.projects)) throw new Error("Data proyek belum siap."); selectedItem = appState.projects.find(p => p.id === selectedId); }
                    else { if (!Array.isArray(appState.fundingCreditors)) throw new Error("Data kreditur belum siap."); selectedItem = appState.fundingCreditors.find(c => c.id === selectedId); }
                    if (selectedItem) { const name = selectedItem.projectName || selectedItem.creditorName; if (typeof name === 'string' && name.trim() !== '') selectedName = name; }
                }
                if (typeof selectedName === 'undefined') selectedName = 'Item (Error)';
                if (type === 'termin') description = `Termin ${selectedName}`; else description = `Pinjaman ${selectedName}`;
                safeToProceed = true;
            } catch (error) { toast('error', error.message || 'Gagal proses pilihan.'); safeToProceed = false; return; }
            if (!safeToProceed) return;
            
            // PERBAIKAN: Simpan referensi modal untuk ditutup
            const confirmModal = createModal('confirmUserAction', {
                title: `Konfirmasi Simpan ${type === 'termin' ? 'Termin' : 'Pinjaman'}`, message: `Simpan data: <strong>${description || '(Error Deskripsi)'}</strong>?`,
                onConfirm: async () => {
                    // PERBAIKAN: Tutup modal konfirmasi
                    if (confirmModal) closeModal(confirmModal);

                    const panel = form.closest('#detail-pane');
                    if (panel) {
                        closeDetailPaneImmediate();
                    }
                    const isMobile = window.matchMedia('(max-width: 599px)').matches;
                    if(isMobile) {
                        hideMobileDetailPage(); // Gunakan hideMobileDetailPage() yang normal di sini
                    }
                    resetFormDirty();
                    try {
                        form.reset();
                        if (form._clearDraft) form._clearDraft();
                    } catch (resetErr) {

                    }
                    const loadingBtn = form.querySelector('[type="submit"], .btn-primary');
                    if (loadingBtn) loadingBtn.disabled = true; let success = false;
                    try { await handleAddPemasukan(formDataObject, type); success = true; }
                    catch (err) { toast('error', err instanceof Error ? err.message : 'Gagal menyimpan.'); }
                    finally { if (loadingBtn) loadingBtn.disabled = false; }
                    return success;
                }
            });
            return;
        }
        const isAsync = form.matches('form[data-async]');
        const knownAppFormIds = new Set(['manual-attendance-form', 'stok-in-form', 'stok-out-form', 'payment-form', 'edit-attendance-form']);
        if (!isAsync && !knownAppFormIds.has(form.id)) return;
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        if (!validateForm(form)) return;
        const loadingBtn = form.querySelector('[type="submit"], .btn-primary');
        if (loadingBtn) loadingBtn.disabled = true;
        try {
            if (knownAppFormIds.has(form.id)) { const eventName = `form.submit.${form.id.replace(/-/g, '')}`; emit(eventName, e); }
            else {
                const modal = form.closest('.modal-bg, .detail-pane');
                resetFormDirty();
                if (form._clearDraft) form._clearDraft();

                if (modal && modal.classList.contains('modal-bg')) {
                     closeModal(modal);
                } else if (modal && modal.id === 'detail-pane') {
                     closeDetailPane();
                }
                try { await submitFormAsync(form); } catch (_) { await fallbackLocalFormHandler(form); }
                const successMsg = form.dataset.successMsg || 'Berhasil disimpan.';
                if (!successMsg.toLowerCase().includes('diperbarui'))     
                toast('success', successMsg);
                }
                emit('ui.page.render');
                emit('ui.sync.updateIndicator');

        } catch (err) { 
            toast('error', err.message || 'Gagal menyimpan.'); }
        finally {     
        if (loadingBtn) loadingBtn.disabled = false; }
    }, { capture: true, signal });

     on('app.unload', () => {
        if (formSubmitController) formSubmitController.abort();
        blurController.abort();
    });
}
