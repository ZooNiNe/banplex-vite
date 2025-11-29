import { on, off, emit } from "../../state/eventBus.js";
import { handleDeleteMultipleItems } from "../../services/data/recycleBinService.js";
import { removeItemFromListWithAnimation, $ } from "../../utils/dom.js";
import { attachClientValidation } from '../../utils/validation.js';
import { toProperCase } from "../../utils/helpers.js";
import { handleDeleteItem } from "../../services/data/recycleBinService.js";
import { handleOpenBillDetail, handleOpenEditItem, handleOpenPemasukanDetail } from "../../services/data/uiInteractionService.js";
 
import { toast } from "../components/toast.js";
import { createModal, closeModal, closeModalImmediate, closeDetailPane } from "../components/modal.js";
import { appState } from "../../state/appState.js";
import { localDB } from "../../services/localDbService.js";
import { getEmptyStateHTML } from "../components/emptyState.js";
import { _activateSelectionMode, handleOpenSelectionSummaryModal } from '../components/selection.js';
import { handleManageMasterData, handleDeleteMasterItem } from '../../services/data/masterDataService.js';
import { _handleRestoreItems, _handleDeletePermanentItems } from '../../services/data/recycleBinService.js';
import { addInvoiceItemRow, handleInvoiceItemChange, createMasterDataSelect, initCustomSelects } from "../components/forms/index.js";
import { getItemActions, displayActions, displayBottomSheetActions } from '../actionMenuUtils.js';
import { handleProcessBillPayment, handleProcessPayment, handleDeleteBillPayment, handleDeleteLoanPayment } from "../../services/data/transactions/paymentService.js";
import { handleAttachmentAction } from "./attachmentListeners.js";
import { handleDeleteAttachment, handleReplaceAttachment } from "../../services/data/transactions/attachmentService.js";
import { handlePostComment, handleDeleteComment } from "../../services/data/commentService.js";
import { downloadUniversalKwitansiAsImage, downloadUniversalKwitansiAsPDF } from '../../services/receiptService.js';
import { 
    handleSaveAllPendingAttendance, 
    handleOpenAttendanceSettings,
    handleDeleteSingleAttendance,
    openManualAbsenceStatusPanel,
    handleOpenProjectRoleModal
} from "../../services/data/attendanceService.js";
import { clickActions } from "../actionHandlers.js";
import { handleNavigation } from "../mainUI.js";

function createIcon(iconName, size = 20, classes = '') {
    const icons = {
        add_photo_alternate: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image-plus ${classes}"><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"/><line x1="16" x2="22" y1="5" y2="5"/><line x1="19" x2="19" y1="2" y2="8"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
    };
    return icons[iconName] || '';
}

function handleDownloadConfirmation(downloader, data, actionType, sourceButton) {
    const modal = sourceButton ? sourceButton.closest('.modal-bg') : null;
    createModal('confirmUserAction', {
        title: 'Konfirmasi Unduh',
        message: `Anda akan mengunduh kwitansi sebagai ${actionType === 'kwitansi-download-image' ? 'gambar (JPG)' : 'dokumen (PDF)'}. Lanjutkan?`,
        onConfirm: async () => {
            await downloader(data);
            if (modal) {
                closeModalImmediate(modal); 
            }
            return true; 
        }
    });
}


export function initializeEventBusListeners() {
    on('ui.navigate', (targetPage, options = {}) => {
        try {
            handleNavigation(targetPage, options);
        } catch (e) {
            console.error(`[EventBus] Gagal menangani navigasi ke ${targetPage}:`, e);
        }
    });
    on('data.deleteMultipleItems', (items) => handleDeleteMultipleItems(items));

    // ... (Kode penghapusan dan animasi tetap sama) ...
    on('ui.animate.removeItem', (domId) => {
        const target = document.querySelector(`[data-id="${domId}"], [data-item-id="${domId}"]`);
        if (target) {
            removeItemFromListWithAnimation(target.dataset.id || domId)
                .then(() => {
                    if (domId.startsWith('trash-')) {
                        // Logic sampah...
                        const itemId = domId.substring(6);
                        if (appState.recycledItemsCache) {
                             const index = appState.recycledItemsCache.findIndex(item => item.id === itemId);
                             if (index > -1) appState.recycledItemsCache.splice(index, 1);
                        }
                         const container = $('#sub-page-content');
                         const listWrapper = container?.querySelector('.wa-card-list-wrapper');
                         if (container && listWrapper && listWrapper.children.length === 0) {
                             container.innerHTML = getEmptyStateHTML({ icon: 'recycling', title: 'Keranjang Sampah Kosong', desc: 'Tidak ada item.' });
                         }
                    }
                })
                .catch(error => {
                    console.error("Animation or removal failed for", domId, error);
                    target.remove();
                });
        }
    });

    on('ui.forms.init', (container) => {
        if (!container) return;
        container.querySelectorAll('form').forEach(form => {
            attachClientValidation(form);
            form.querySelectorAll('input[data-proper-case="true"], textarea[data-proper-case="true"]').forEach(input => {
                input.addEventListener('blur', (e) => {
                    e.target.value = toProperCase(e.target.value);
                });
            });
             import("../components/modal.js").then(({ resetFormDirty, markFormDirty }) => {
                resetFormDirty();
                const dirtyListener = () => markFormDirty(true);
                form.addEventListener('input', dirtyListener);
                form.addEventListener('change', dirtyListener, { capture: true });
             });
        });
    });

     on('ui.form.markDirty', (isDirty) => {
          import("../components/modal.js").then(({ markFormDirty }) => {
             markFormDirty(isDirty);
          });
     });


    on('data.deleteItem', ({ id, type }) => {
        handleDeleteItem(id, type);
    });

    on('ui.action.open-bill-detail', (dataset) => handleOpenBillDetail(dataset));
    on('ui.action.open-pemasukan-detail', (dataset) => handleOpenPemasukanDetail(dataset));
    on('ui.action.pay-bill', async (dataset) => { const { openBillPaymentModal } = await import('../modals/tagihan/itemActionsModal.js'); openBillPaymentModal(dataset.itemId); });
    
    // === REVISI LISTENER PAYMENT HISTORY ===
    
    // Listener untuk membuka modal secara langsung
    on('ui.modal.openPaymentHistory', async (dataset) => {
        console.warn('[EventBus] ui.modal.openPaymentHistory triggered. Dataset:', dataset); // DEBUG LOG
        try {
             const { handleOpenPaymentHistoryModal } = await import('../modals/tagihan/paymentHistoryModal.js');
             handleOpenPaymentHistoryModal(dataset);
        } catch (e) {
             console.error('[EventBus] Gagal memuat paymentHistoryModal:', e);
             toast('error', 'Gagal memuat modul riwayat pembayaran.');
        }
    });

    // Listener untuk aksi dari tombol/menu
    on('ui.action.open-payment-history-modal', (dataset) => {
        console.warn('[EventBus] ui.action.open-payment-history-modal triggered'); // DEBUG LOG
        emit('ui.modal.openPaymentHistory', { ...dataset, id: dataset.itemId });
    });

    on('ui.action.open-salary-payment-history', (dataset) => {
        console.warn('[EventBus] ui.action.open-salary-payment-history triggered'); // DEBUG LOG
        const billIds = dataset.billIds || dataset['bill-ids'];
        emit('ui.modal.openPaymentHistory', {
            ...dataset,
            id: dataset.itemId || dataset.billId,
            billIds,
            workerId: dataset.workerId,
            isSalary: true
        });
    });
    // ========================================

    on('ui.action.open-comments-view', (dataset) => emit('ui.modal.openComments', dataset));
    on('ui.action.open-attachments', (dataset) => emit('ui.modal.openAttachmentsList', { ...dataset, id: dataset.itemId || dataset.id, expenseId: dataset.expenseId }));
    on('ui.action.open-edit-expense', async (dataset) => {
        const { openEditExpenseModal } = await import('../modals/tagihan/itemActionsModal.js');
        const expenseIdToEdit = dataset.itemId || dataset.expenseId || dataset.id;
        const exp = appState.expenses.find(e => e.id === expenseIdToEdit);
        if(exp) {
            openEditExpenseModal(exp, dataset);
        } else {
             localDB.expenses.get(expenseIdToEdit).then(localExp => {
                 if (localExp) {
                    openEditExpenseModal(localExp, dataset);
                 } else {
                    toast('error', 'Data pengeluaran tidak ditemukan untuk diedit.');
                 }
             }).catch(() => {
                 toast('error', 'Gagal mencari data pengeluaran untuk diedit.');
             });
        }
    });
    
    // ... (Sisa listener lainnya tetap sama seperti file asli) ...
    on('ui.action.edit-master-item', (dataset) => {
        if (appState.activePage === 'master_data') return;
        handleManageMasterData(dataset.type, { itemId: dataset.itemId, activeTab: 'form' });
    });
    on('ui.action.delete-master-item', (dataset) => handleDeleteMasterItem(dataset.itemId, dataset.type));
    on('ui.action.delete-item', (dataset) => handleDeleteItem(dataset.itemId, dataset.type));
    on('ui.action.restore-item', (dataset) => _handleRestoreItems([{ id: dataset.itemId, table: dataset.table }]));
    on('ui.action.delete-permanent-item', (dataset) => _handleDeletePermanentItems([{ id: dataset.itemId, table: dataset.table }]));
    on('ui.action.activate-selection-mode', (dataset) => _activateSelectionMode(dataset.pageContext || appState.activePage));
    on('ui.action.open-filter-modal', () => emit('ui.modal.showBillsFilter', () => emit('ui.tagihan.renderContent')));
    on('ui.action.open-sort-modal', () => emit('ui.modal.showBillsSort', () => emit('ui.tagihan.renderContent')));
    on('ui.action.edit-item', (dataset) => handleOpenEditItem(dataset.itemId, dataset.type));
    on('ui.action.pay-loan', (dataset) => emit('ui.modal.openPayment', {id: dataset.itemId, type: 'pinjaman'}));
    on('ui.action.open-loan-payment-history', (dataset) => emit('ui.modal.openLoanPaymentHistory', { id: dataset.itemId }));
    on('ui.action.convert-surat-jalan', (dataset) => emit('ui.modal.openEditExpense', { ...dataset, id: dataset.itemId, convert: true }));
    on('ui.action.edit-surat-jalan', (dataset) => emit('ui.modal.openEditExpense', { ...dataset, id: dataset.itemId, convert: false }));
    on('ui.action.user-action', async (dataset) => {
         const { handleUserAction } = await import('../../services/data/userService.js');
         handleUserAction(dataset);
    });
    on('ui.action.delete-salary-bill', async (dataset) => {
         const { handleDeleteSalaryBill } = await import('../../services/data/jurnalService.js');
         handleDeleteSalaryBill(dataset.id);
    });
    on('ui.action.delete-salary-summary', async (dataset) => {
         const { handleDeleteSalaryBill } = await import('../../services/data/jurnalService.js');
         handleDeleteSalaryBill(dataset.billId || dataset.id);
    });
    on('ui.action.stok-in', (dataset) => emit('ui.modal.stokIn', dataset.itemId));
    on('ui.action.stok-out', (dataset) => emit('ui.modal.stokOut', dataset.itemId));
    on('ui.action.open-stock-history-modal', (dataset) => emit('ui.modal.openStockHistoryDetail', dataset));
    on('ui.action.edit-stock', (dataset) => emit('ui.modal.editStock', dataset));
    on('ui.action.delete-stock', async (dataset) => {
         const { handleDeleteStockTransaction } = await import('../../services/data/stockService.js');
         handleDeleteStockTransaction(dataset);
    });
    on('ui.action.copy-comment', (dataset = {}) => {
        try {
            const msgId = dataset.msgId || dataset.itemId;
            const el = document.querySelector(`.msg-group[data-msg-id="${msgId}"] .content`);
            const text = el?.textContent || '';
            if (text) navigator.clipboard?.writeText(text);
        } catch(_) {}
    });
    on('ui.action.post-comment', (dataset) => { 
        handlePostComment(dataset).catch(err => {
            try {
                const sendButton = document.querySelector('.composer-wrapper .chat-send-btn');
                if (sendButton) sendButton.disabled = false;
            } catch (e) {}
        }); 
    });
    on('ui.action.delete-comment', (dataset = {}) => {
        if (dataset.itemId) handleDeleteComment({ id: dataset.itemId });
    });
    on('ui.action.delete-selected-items', (dataset) => {
         const selectedIds = Array.from(appState.selectionMode.selectedIds);
         if (selectedIds.length === 0) {
             toast('info', 'Tidak ada item yang dipilih.');
             return;
         }
         let itemType = 'bill';
         if (appState.selectionMode.pageContext === 'pemasukan') {
              itemType = appState.activeSubPage.get('pemasukan') === 'termin' ? 'termin' : 'pinjaman';
         } else if (appState.selectionMode.pageContext === 'tagihan') {
              itemType = 'bill';
         }
         const itemsToDelete = selectedIds.map(itemId => ({ id: itemId, type: itemType }));
         handleDeleteMultipleItems(itemsToDelete);
     });
     on('ui.action.restore-selected', (dataset) => {
         const selectedIds = Array.from(appState.selectionMode.selectedIds);
         if (selectedIds.length === 0) {
             toast('info', 'Tidak ada item yang dipilih untuk dipulihkan.');
             return;
         }
         const itemsToRestore = selectedIds.map(itemId => {
             const item = Array.isArray(appState.recycledItemsCache) ? appState.recycledItemsCache.find(i => i.id === itemId) : null;
             return item ? { id: item.id, table: item.table } : null;
         }).filter(Boolean);
         if (itemsToRestore.length > 0) _handleRestoreItems(itemsToRestore);
         else toast('error', 'Gagal mendapatkan detail item dari cache untuk dipulihkan.');
     });
     on('ui.action.delete-permanent-selected', (dataset) => {
         const selectedIds = Array.from(appState.selectionMode.selectedIds);
         if (selectedIds.length === 0) {
              toast('info', 'Tidak ada item yang dipilih untuk dihapus.');
              return;
          }
         const itemsToDelete = selectedIds.map(itemId => {
             const item = Array.isArray(appState.recycledItemsCache) ? appState.recycledItemsCache.find(i => i.id === itemId) : null;
             return item ? { id: item.id, table: item.table } : null;
         }).filter(Boolean);
          if (itemsToDelete.length > 0) {
              _handleDeletePermanentItems(itemsToDelete);
          } else toast('error', 'Gagal mendapatkan detail item dari cache untuk dihapus.');
     });
     on('ui.action.open-generate-worker-bill-confirm', async (dataset) => {
        try {
            const { openGenerateBillConfirmModal } = await import('../../services/data/jurnalService.js');
            openGenerateBillConfirmModal(dataset);
        } catch(e) {
            console.error("Gagal memuat/menjalankan openGenerateBillConfirmModal:", e);
            toast('error', 'Gagal memproses tagihan pekerja.');
        }
    });
    on('ui.action.open-selection-summary', (dataset) => handleOpenSelectionSummaryModal());
    on('ui.action.forward-to-comments', (dataset) => emit('ui.selection.handleAction', 'forward-to-comments', dataset));
    on('ui.action.view-jurnal-harian', (dataset) => emit('ui.modal.viewJurnalHarian', dataset.date));
    on('ui.action.view-worker-recap', (dataset) => emit('ui.modal.viewWorkerRecap', dataset.workerId));
    on('ui.action.open-salary-payment-panel', (context) => {
        try {
            const rawBillIds = context.billIds || context['bill-ids'];
            const billIds = Array.isArray(rawBillIds)
                ? rawBillIds
                : (typeof rawBillIds === 'string' ? rawBillIds.split(',').filter(Boolean) : []);
            const billId = context.billId || billIds[0] || context.itemId;

            if (!billId) {
                toast('error', 'Tagihan gaji tidak ditemukan.');
                return;
            }
            emit('ui.modal.openPayment', { id: billId, type: 'bill', workerId: context.workerId });
        } catch (e) {
            console.error("Gagal membuka panel pembayaran gaji:", e);
            toast('error', 'Gagal membuka panel pembayaran gaji.');
        }
    });
    on('ui.action.edit-attendance-day', (context) => {
        emit('ui.jurnal.openDailyProjectPicker', { date: context.date });
    });
    on('ui.action.view-log-detail', (dataset) => {
        if(dataset.targetType === 'bill' || dataset.targetType === 'expense') {
            handleOpenBillDetail({
                itemId: dataset.targetType === 'bill' ? dataset.targetId : null,
                expenseId: dataset.targetType === 'expense' ? dataset.targetId : null
            });
        }
    });
    // ... (Sisa file dipertahankan apa adanya untuk fitur lain) ...
    on('ui.modal.openMassAttendanceModal', async () => {
        try {
          const { handleOpenMassAttendanceModal } = await import('../modals/absensi/setMassAttendanceModal.js');
          handleOpenMassAttendanceModal();
        } catch(e) {
          console.error("Gagal membuka modal absensi massal:", e);
          toast('error', 'Gagal membuka modal.');
        }
    });
    on('ui.modal.openManualAttendanceModal', async (dataset) => {
        try {
          const { handleOpenManualAttendanceModal } = await import('../modals/absensi/editManualAttendanceModal.js');
          handleOpenManualAttendanceModal(dataset);
        } catch(e) {
          console.error("Gagal membuka modal edit manual:", e);
          toast('error', 'Gagal membuka modal edit.');
        }
    });
    on('ui.modal.openAttendanceSettings', async () => { 
        try { 
            const { handleOpenAttendanceSettings } = await import('../../services/data/attendanceService.js'); 
            handleOpenAttendanceSettings(); 
        } catch(_) {} 
    });
    on('ui.action.save-all-pending-attendance', () => {
        try {
          handleSaveAllPendingAttendance();
        } catch(e) {
          console.error("Error di 'ui.action.save-all-pending-attendance':", e);
          toast('error', 'Gagal memproses simpan massal.');
        }
    });
    on('ui.action.open-project-role-modal', async (dataset, event) => {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        }
        try {
            const { handleOpenProjectRoleModal } = await import('../../services/data/attendanceService.js');
            handleOpenProjectRoleModal(dataset);
        } catch(e) {
            console.error("Gagal membuka modal edit proyek/peran:", e);
            toast('error', 'Gagal membuka modal edit.');
        }
    });
    on('ui.action.open-absence-status-panel', () => {
        const selectedIds = Array.from(appState.selectionMode.selectedIds || []);
        if (selectedIds.length === 0) {
            toast('info', 'Pilih minimal satu pekerja terlebih dahulu.');
            return;
        }
        openManualAbsenceStatusPanel(selectedIds);
    });
    on('ui.action.open-manual-attendance-modal', (dataset) => {
        emit('ui.modal.openManualAttendanceModal', dataset);
    });
    on('ui.action.set-attendance-shortcut', (context) => {
        if (typeof clickActions['set-attendance-shortcut'] === 'function') {
            clickActions['set-attendance-shortcut'](context);
        }
    });
    on('ui.action.delete-attendance', (context) => {
        const recordId = context.id || context.recordId || context.itemId;
        if (recordId) {
          handleDeleteSingleAttendance(recordId);
        } else {
          toast('error', 'Tidak dapat menemukan ID record untuk dihapus.');
        }
    });
    on('ui.action.open-attendance-settings', () => {
        emit('ui.modal.openAttendanceSettings');
    });          
    on('ui.action.manage-master', (dataset) => handleManageMasterData(dataset.type, dataset));
    on('ui.action.open-pemasukan-form', (dataset) => {
        appState.pemasukanFormType = dataset?.type || 'pinjaman';
        emit('ui.navigate', 'pemasukan_form');
    });
    on('ui.action.cetak-kwitansi-pembayaran', (context) => {
        if (typeof context.kwitansi === 'string' && context.kwitansi.trim() !== '') {
            try {
                emit('ui.modal.showKwitansiPayment', JSON.parse(context.kwitansi));
            } catch(e) {
                console.error("Failed to parse cetak-kwitansi-pembayaran data:", e, context.kwitansi);
                toast('error', 'Gagal memuat data kwitansi pembayaran.');
            }
        } else {
             console.error("Missing or invalid kwitansi data for cetak-kwitansi-pembayaran:", context);
             toast('error', 'Data kwitansi pembayaran tidak tersedia.');
        }
    });
     on('ui.action.cetak-kwitansi-universal', (context) => {
        if (typeof context.kwitansi === 'string' && context.kwitansi.trim() !== '') {
            try {
                emit('ui.modal.showKwitansiPayment', JSON.parse(context.kwitansi));
            } catch(e) {
                console.error("Failed to parse cetak-kwitansi-universal data:", e, context.kwitansi);
                toast('error', 'Gagal memuat data kwitansi universal.');
            }
        } else {
             console.error("Missing or invalid kwitansi data for cetak-kwitansi-universal:", context);
             toast('error', 'Data kwitansi universal tidak tersedia.');
        }
    });
     on('ui.action.cetak-kwitansi', async (dataset) => {
        const { handleCetakKwitansi } = await import('../../services/receiptService.js');
        handleCetakKwitansi(dataset.itemId);
    });
    on('ui.action.print-bill', async (dataset) => {
        const billId = dataset.billId || dataset.id || dataset.itemId;
        if (!billId) {
            toast('error', 'ID tagihan tidak ditemukan untuk dicetak.');
            return;
        }
        const { handleCetakKwitansi } = await import('../../services/receiptService.js');
        handleCetakKwitansi(billId);
    });
    on('ui.action.cetak-kwitansi-individu', async (dataset) => {
        const { handleCetakKwitansiIndividu } = await import('../../services/receiptService.js');
        handleCetakKwitansiIndividu(dataset);
    });
     on('ui.action.cetak-kwitansi-kolektif', async (dataset) => {
        const { handleCetakKwitansiKolektif } = await import('../../services/receiptService.js');
        handleCetakKwitansiKolektif(dataset);
    });
     on('ui.action.open-simulasi-actions', async (dataset) => {
        const { _openSimulasiItemActionsModal } = await import('../modals/simulasi/actionsModal.js');
        _openSimulasiItemActionsModal(dataset);
     });
     on('ui.action.add-invoice-item-btn', (context) => {
         const form = context.target?.closest('form');
         if (form) addInvoiceItemRow(form);
     });
     on('ui.action.remove-item-btn', (context) => {
         const row = context.target?.closest('.multi-item-row');
         const form = context.target?.closest('form');
         if (row && form) {
             row.remove();
             handleInvoiceItemChange(form);
         }
     });
     on('ui.action.add-worker-wage', (context) => emit('ui.form.openWorkerWageDetail', { target: context.target }));
     on('ui.action.edit-worker-wage', (context) => emit('ui.form.openWorkerWageDetail', { target: context.target }));
     on('ui.action.remove-worker-wage', (context) => emit('ui.form.removeWorkerWage', { target: context.target }));
     on('ui.action.add-role-wage-row', (context) => emit('ui.form.addRoleWageRow', { target: context.target }));
     on('ui.action.remove-role-wage-row', (context) => emit('ui.form.removeRoleWageRow', { target: context.target }));
     on('ui.action.download-attachment-confirm', (context) => {
         const url = context?.url;
         if (!url) return;
         emit('ui.modal.create', 'confirmUserAction', {
             title: 'Konfirmasi Unduh',
             message: `Unduh lampiran <strong>${context.filename || 'lampiran'}</strong>?`,
             onConfirm: () => emit('data.downloadAttachment', context)
         });
     });
     on('ui.action.view-attachment', (context) => emit('ui.modal.create', 'imageView', { src: context.src }));
    on('ui.action.view-payment-attachment', (context) => emit('ui.attachments.viewPayment', context));
    on('ui.action.delete-payment', (dataset) => handleDeleteBillPayment(dataset));
    on('ui.action.delete-loan-payment', (dataset) => handleDeleteLoanPayment(dataset));
    on('ui.action.set-worker-role', (dataset) => {
        try {
            const workerId = dataset.workerId;
            const role = dataset.role || '';
            if (!appState.manualRoleSelectionByWorker) appState.manualRoleSelectionByWorker = {};
            if (role) {
                appState.manualRoleSelectionByWorker[workerId] = role;
            } else {
                delete appState.manualRoleSelectionByWorker[workerId];
            }
            emit('ui.absensi.renderManualForm');
        } catch (_) {}
    });
    on('ui.action.open-manual-attendance-control', () => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const selectedDate = appState.manualAttendanceDate || today;
            const projectOptions = (appState.projects || [])
                .filter(p => p.isWageAssignable && !p.isDeleted)
                .map(p => ({ value: p.id, text: p.projectName }));
            const defaultProjectId = appState.manualAttendanceProjectId
                || appState.defaultAttendanceProjectId
                || (projectOptions[0]?.value || '');

            const projectSelectHTML = createMasterDataSelect('manual-control-project', 'Pilih Proyek', projectOptions, defaultProjectId, null, true);
            const content = `
                <form id="manual-attendance-control-form">
                    <div class="form-group">
                        <label for="manual-control-date">Tanggal Absensi</label>
                        <input type="date" id="manual-control-date" name="manualDate" class="form-control" value="${selectedDate}">
                    </div>
                    ${projectSelectHTML}
                </form>
            `;
            const footer = `<div class="form-footer-actions"><button type="submit" form="manual-attendance-control-form" class="btn btn-primary">Terapkan</button></div>`;
            const modalEl = createModal('formView', { title: 'Pengaturan Input Manual', content, footer, isUtility: true });
            initCustomSelects(modalEl);

            const form = modalEl.querySelector('#manual-attendance-control-form');
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                appState.manualAttendanceDate = form.querySelector('#manual-control-date')?.value || today;
                appState.manualAttendanceProjectId = form.querySelector('#manual-control-project')?.value || defaultProjectId;
                toast('success', 'Pengaturan diperbarui.');
                emit('ui.absensi.renderManualForm');
                const top = document.querySelector('#modal-container .modal-bg.show:last-of-type');
                if (top) closeModalImmediate(top);
            });
        } catch (e) { console.error(e); }
    });
    on('ui.action.open-item-actions-modal', (context, event) => {
        const { itemId, target: actionTarget } = context;
        if (!event) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (itemId && actionTarget && !appState.selectionMode.active) {
            const actions = getItemActions(context);
            if (!actions || actions.length === 0) {
                return;
            }
            const isMobile = window.matchMedia('(max-width: 599px)').matches;
            let pageContext = appState.activePage;
            const detailPane = document.getElementById('detail-pane');
            const isDetailPaneOpen = detailPane && (detailPane.classList.contains('detail-pane-open') || document.body.classList.contains('detail-view-active'));
            const paneType = detailPane?.dataset?.paneType || '';
            const isInDetailPane = actionTarget.closest('#detail-pane') !== null;
            if (isDetailPaneOpen) {
                if (paneType === 'user-management') pageContext = 'manajemen_user';
                else if (paneType.startsWith('master-data-')) pageContext = 'master';
                else if (paneType === 'recycleBin') pageContext = 'recycleBin';
            } else if (appState.activePage === 'recycle_bin') {
                 pageContext = 'recycleBin';
            }
            pageContext = context.pageContext || pageContext;
            const pagesUsingBottomSheet = new Set(['tagihan', 'pemasukan', 'jurnal', 'stok']);
            const useBottomSheet = isMobile && pagesUsingBottomSheet.has(pageContext) && !isInDetailPane;
            if (useBottomSheet) {
                displayBottomSheetActions(actions, context, actionTarget);
            } else {
                 displayActions(actions, actionTarget);
            }
        }
    });
    on('ui.action.open-project-role-editor', async (dataset, event) => {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        }
        try {
            const { handleOpenProjectRoleModal } = await import('../../services/data/attendanceService.js');
            handleOpenProjectRoleModal(dataset);
        } catch(e) {
            console.error("Gagal membuka modal edit proyek/peran:", e);
            toast('error', 'Gagal membuka modal edit.');
        }
    });
    on('ui.attachBottomSheetListeners', (modalElement) => {
         import('../eventListeners/dynamicElementListeners.js').then(({ attachBottomSheetActionListeners }) => {
             attachBottomSheetActionListeners(modalElement);
         }).catch(err => console.error("Failed to load dynamic listeners:", err));
    });
    on('form.submit.paymentform', (e) => {
        const form = e.target;
        const type = form.dataset.type;
        let handler;
        if (type === 'bill') handler = handleProcessBillPayment;
        else if (type === 'pinjaman' || type === 'loan') handler = handleProcessPayment;
        if (handler) {
            handler(form).catch(err => console.error(`Error in ${handler.name}:`, err));
        } else {
             console.error(`No payment handler found for type: ${type}`);
        }
    });

    on('ui.action.upload-attachment', (context, event) => {
        handleAttachmentAction(context, context.target, event);
    });
    on('ui.action.trigger-single-upload', (context, event) => {
        handleAttachmentAction(context, context.target, event);
    });
    on('ui.action.trigger-payment-upload', (context, event) => {
        handleAttachmentAction(context, context.target, event);
    });
    on('ui.action.replace-attachment', (context, event) => {
        handleReplaceAttachment(context.expenseId, context.oldUrl);
    });
    on('ui.action.delete-temp-attachment', (context) => {
        const item = context.target?.closest('.attachment-manager-item');
        const currentForm = context.target?.closest('form');
        if (item && currentForm) {
            const urlToDelete = item.dataset.url;
            const syncedUrlsInput = currentForm.querySelector('input[name="syncedAttachmentUrls"]');
            if (syncedUrlsInput && urlToDelete) {
                let currentUrls = syncedUrlsInput.value ? JSON.parse(syncedUrlsInput.value) : [];
                currentUrls = currentUrls.filter(att => att.url !== urlToDelete);
                syncedUrlsInput.value = JSON.stringify(currentUrls);
            }
            item.remove();
            emit('ui.form.markDirty', true);
        }
    });
    on('ui.action.remove-payment-attachment', (context) => {
        const currentForm = context.target?.closest('form, .detail-pane');
        if (!currentForm) return;
        const fileInputEl = currentForm.querySelector('input[name="paymentAttachment"]');
        const attachmentContainer = currentForm.querySelector('#new-payment-attachment-container');
        const urlInput = currentForm.querySelector('input[name="paymentAttachment_url"]');

        if(fileInputEl) fileInputEl.value = '';
        if(urlInput) urlInput.value = '';
        if(attachmentContainer) {
             let placeholder = attachmentContainer.querySelector('.placeholder[data-action="trigger-single-upload"]');
             if (!placeholder) {
                 placeholder = document.createElement('div');
                 placeholder.className = 'attachment-manager-item placeholder';
                 placeholder.dataset.action = 'trigger-single-upload';
                 placeholder.dataset.target = 'paymentAttachment';
                 placeholder.innerHTML = `...`; // Ikon disederhanakan untuk ringkas
             }
             attachmentContainer.innerHTML = '';
             attachmentContainer.appendChild(placeholder);
            emit('ui.form.markDirty', true);
        }
    });
    on('ui.action.delete-attachment', (context) => {
        handleDeleteAttachment(context.expenseId, context.url);
    });

    on('ui.action.kwitansi-download-pdf', async (context, event) => {
        if (typeof context.kwitansi === 'string' && context.kwitansi.trim() !== '') {
            try {
                const kwitansiData = JSON.parse(context.kwitansi);
                handleDownloadConfirmation(downloadUniversalKwitansiAsPDF, kwitansiData, 'kwitansi-download-pdf', context.target);
            } catch(e) {
                console.error("Failed to parse data:", e, context.kwitansi);
                toast('error', 'Gagal memproses data kwitansi PDF.');
            }
        } else {
             console.error("Missing kwitansi data for PDF download:", context);
             toast('error', 'Data kwitansi PDF tidak tersedia.');
        }
    });
    on('ui.action.kwitansi-download-image', async (context, event) => {
        if (typeof context.kwitansi === 'string' && context.kwitansi.trim() !== '') {
            try {
                const kwitansiData = JSON.parse(context.kwitansi);
                handleDownloadConfirmation(downloadUniversalKwitansiAsImage, kwitansiData, 'kwitansi-download-image', context.target);
            } catch(e) {
                console.error("Failed to parse data:", e, context.kwitansi);
                toast('error', 'Gagal memproses data kwitansi Gambar.');
            }
        } else {
             console.error("Missing kwitansi data for Image download:", context);
             toast('error', 'Data kwitansi Gambar tidak tersedia.');
        }
    });
    on('ui.action.open-worker-defaults-modal', async (dataset) => {
        try {
            const { _openWorkerDefaultsModal } = await import('../../services/data/attendanceService.js');
            _openWorkerDefaultsModal(dataset.workerId, dataset.workerName);
        } catch(e) {
            console.error("Gagal membuka modal default pekerja:", e);
            toast('error', 'Gagal membuka modal.');
        }
    });
    on('ui.action.continue-edit-attendance', () => {
        emit('ui.modal.closeAll');
        try {
            const d = new Date(appState.defaultAttendanceDate + 'T00:00:00');
            d.setUTCDate(d.getUTCDate() + 1);
            const nextYMD = d.toISOString().slice(0,10);
            appState.defaultAttendanceDate = nextYMD;
            try { localStorage.setItem('attendance.defaultDate', nextYMD); } catch(_) {}
        } catch(_) {}
        emit('ui.absensi.renderManualForm');
    });

    on('ui.comments.openNewCommentModal', async () => {
        const { openNewCommentSelector } = await import('../pages/chat.js');
        openNewCommentSelector();
    });
    on('ui.comments.openSearch', async () => {
        const { openCommentsSearch } = await import('../pages/chat.js');
        openCommentsSearch();
    });

}
