import { on, emit } from "../../state/eventBus.js";
import { toast } from "../components/toast.js";
import {
  createModal,
  closeModal,
  showDetailPane,
  showMobileDetailPage,
  closeAllModals,
  closeModalImmediate,
  hideMobileDetailPage,
  closeDetailPane,
  handleDetailPaneBack,
} from "../components/modal.js";
import { handleOpenBillDetail, handleOpenPemasukanDetail, showPaymentSuccessPreviewPanel, showSuccessPreviewPanel } from "../../services/data/uiInteractionService.js";
import { handleNavigation } from "../mainUI.js";
import { renderPageContent } from "../pages/pageManager.js";
import { calculateAndCacheDashboardTotals } from "../../services/data/calculationService.js";
import { appState } from "../../state/appState.js";
import { localDB } from "../../services/localDbService.js";
import { handleViewJurnalHarianModal } from "../modals/jurnal/viewJurnalHarianModal.js";
import { handleViewWorkerRecapModal } from "../modals/jurnal/viewWorkerRecapModal.js";
import { openSalaryPaymentPanel } from "../modals/jurnal/salaryPaymentPanel.js";
import { openIndividualSalaryPaymentModal } from "../modals/jurnal/individualSalaryPaymentModal.js";
import { handleOpenMassAttendanceModal } from "../modals/absensi/setMassAttendanceModal.js";
import { handleOpenManualAttendanceModal } from "../modals/absensi/editManualAttendanceModal.js";
import { handleOpenStockUsageModal } from "../modals/stok/stockUsageModal.js";
import { downloadUniversalKwitansiAsImage, downloadUniversalKwitansiAsPDF } from '../../services/receiptService.js';
import { downloadAttachment } from '../../services/fileService.js';

function createIcon(iconName, size = 18, classes = '') {
    const icons = {
        image: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image ${classes}"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
        picture_as_pdf: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-type-pdf ${classes}"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M10 12h1v4h-1"/><path d="M13 16h-1.5a1.5 1.5 0 0 1 0-3H13v3Z"/><path d="M17 16h-1.5a1.5 1.5 0 0 1 0-3H17v3Z"/><path d="M9.5 10.5A1.5 1.5 0 0 1 11 12v1a1.5 1.5 0 0 1-3 0v-1a1.5 1.5 0 0 1 1.5-1.5Z"/></svg>`,
    };
    return icons[iconName] || '';
}


export function initServiceUIBridge() {
  on('ui.toast', (p = {}) => {
    try { toast(...(Array.isArray(p.args) ? p.args : [])); } catch (_) {}
  });

  on('ui.modal.create', (type, data = {}) => {
    try { return createModal(type, data); } catch (_) {}
  });
  on('ui.modal.close', (modalEl) => {
    try {
      if (modalEl) return closeModal(modalEl);
      const container = document.getElementById('modal-container');
      const top = container ? Array.from(container.querySelectorAll('.modal-bg.show')).pop() : null;
      if (top) closeModal(top);
    } catch (_) {}
  });
  on('ui.modal.closeAll', () => { try { closeAllModals(); } catch (_) {} });
  on('ui.modal.closeImmediate', (modalEl) => { try { closeModalImmediate(modalEl); } catch (_) {} });

  on('ui.modal.showDetail', (...args) => { try { return showDetailPane(...args); } catch (_) {} });
  on('ui.modal.showMobileDetail', (...args) => { try { return showMobileDetailPage(...args); } catch (_) {} });
  on('ui.modal.hideMobileDetail', () => { try { hideMobileDetailPage(); } catch (_) {} });
  on('ui.modal.closeDetailPane', () => { try { closeDetailPane(); } catch (_) {} });
  
  // --- PERBAIKAN: Mengubah 'ui.modal.detailPaneBack' menjadi 'ui.action.detail-pane-back' ---
  // Listener 'detail-pane-back' dipicu oleh globalClickListeners sebagai 'ui.action.detail-pane-back'
  on('ui.action.detail-pane-back', () => { 
      try { 
          console.log("[Service Bridge] Menerima event 'ui.action.detail-pane-back'. Memanggil handleDetailPaneBack...");
          handleDetailPaneBack(); 
      } catch (_) {} 
  });
  // --- AKHIR PERBAIKAN ---

  on('ui.modal.openBill', (id, expenseId) => { try { handleOpenBillDetail(id, expenseId); } catch (_) {} });
  on('ui.modal.openPemasukan', (...args) => { try { handleOpenPemasukanDetail(...args); } catch (_) {} });
  
  // --- PERUBAHAN LOGIKA BUKA KOMENTAR ---
  on('ui.modal.openComments', async (dataset = {}) => {
    try {
      const isMobile = window.matchMedia('(max-width: 599px)').matches;
      if (isMobile) {
        // Mobile: Buka sebagai Bottom Sheet Modal
        const { openCommentsBottomSheet } = await import('../pages/chat.js');
        await openCommentsBottomSheet(dataset);
      } else {
        // Desktop/Tablet: Buka sebagai halaman penuh (logic lama)
        appState.chatOpenRequest = { 
          parentId: dataset.parentId, 
          parentType: dataset.parentType, 
          prefilledText: dataset.prefilledText 
        };
        handleNavigation('chat');
      }
    } catch(e) {
        console.error("Gagal membuka Komentar:", e);
        toast('error', 'Gagal membuka tampilan Komentar.');
    }
  });
  // --- AKHIR PERUBAHAN ---

  on('ui.modal.manageMaster', async (data = {}) => {
    try { const { handleManageMasterData } = await import('../../services/data/masterDataService.js'); handleManageMasterData(data.type, data.options); } catch(_) {}
  });
  on('ui.modal.openReportGenerator', async () => {
    try { const { handleGenerateReportModal } = await import('../../services/modals/reports/generateReportModal.js'); handleGenerateReportModal(); } catch(_) {}
  });
  on('ui.modal.showStockSort', async (onApply) => {
    try { const { showStockSortModal } = await import('../modals/stok/sortModal.js'); showStockSortModal(onApply); } catch(_) {}
  });
  on('ui.modal.stokIn', async (materialId) => {
    try { const { openAdjustStockModal } = await import('../modals/stok/adjustStockModal.js'); openAdjustStockModal(materialId, 'in'); } catch(_) {}
  });
  on('ui.modal.stokOut', async (materialId) => {
    try { const { openAdjustStockModal } = await import('../modals/stok/adjustStockModal.js'); openAdjustStockModal(materialId, 'out'); } catch(_) {}
  });
  on('ui.modal.openStockUsage', async (context) => {
    try {
        handleOpenStockUsageModal(context);
    } catch(e) {
        console.error("Gagal membuka modal penyaluran stok:", e);
        toast('error', 'Gagal membuka modal penyaluran stok.');
    }
  });
  on('data.stock.batchOut', async (materialId, transactions, dateStr) => {
      try {
          await processBatchStockOut(materialId, transactions, dateStr);
      } catch(e) {
          console.error("Gagal memproses batch stok keluar:", e);
      }
  });
  on('ui.modal.fixStuckAttendance', async () => {
    try { const { handleFixStuckAttendanceModal } = await import('../../services/modals/jurnal/fixStuckAttendanceModal.js'); handleFixStuckAttendanceModal(); } catch(_) {}
  });
  on('ui.modal.openMasterGlobal', async () => {
    try { const { openMasterGlobalModal } = await import('../modals/pengaturan/masterGlobalModal.js'); openMasterGlobalModal(); } catch(_) {}
  });
  on('ui.modal.editAttendance', async (id) => {
    try { const { handleOpenEditManualAttendanceModal } = await import('../modals/absensi/editManualAttendanceModal.js'); handleOpenEditManualAttendanceModal(id); } catch(_) {}
  });
  on('ui.modal.addNewMaterial', async (target) => {
    try { const { handleAddNewMaterialModal } = await import('../modals/pengeluaran/addNewMaterialModal.js'); handleAddNewMaterialModal(target); } catch(_) {}
  });
  on('ui.modal.openPayment', async (data = {}) => {
      if (data.type === 'pinjaman' || data.type === 'loan') {
          const { handlePaymentModal } = await import('../modals/pemasukan/paymentModal.js');
          handlePaymentModal(data.id, 'pinjaman');
      } else if (data.type === 'bill') {
          const { openBillPaymentModal } = await import('../modals/tagihan/itemActionsModal.js');
          openBillPaymentModal(data.id);
      }
  });
  on('ui.modal.openPaymentHistory', async (data = {}) => {
    try { const { handleOpenPaymentHistoryModal } = await import('../modals/tagihan/paymentHistoryModal.js'); handleOpenPaymentHistoryModal(data); } catch(_) {}
  });
  on('ui.modal.openLoanPaymentHistory', async (data = {}) => {
    try { const { handleOpenLoanPaymentHistoryModal } = await import('../modals/pemasukan/loanPaymentHistoryModal.js'); handleOpenLoanPaymentHistoryModal(data); } catch(_) {}
  });
  on('ui.modal.showBillsFilter', async (onApply) => {
    try { const { _showBillsFilterModal } = await import('../modals/tagihan/filterModal.js'); _showBillsFilterModal(onApply); } catch(_) {}
  });
  on('ui.modal.showBillsSort', async (onApply) => {
    try { const { _showBillsSortModal } = await import('../modals/tagihan/filterModal.js'); _showBillsSortModal(onApply); } catch(_) {}
  });
  on('ui.modal.showAttendanceFilter', async (onApply) => {
    try { const { _showAttendanceFilterModal } = await import('../modals/absensi/editManualAttendanceModal.js'); _showAttendanceFilterModal(onApply); } catch(_) {}
  });
  on('ui.modal.showAttendanceSort', async (onApply) => {
    try { const { _showAttendanceSortModal } = await import('../modals/absensi/editManualAttendanceModal.js'); _showAttendanceSortModal(onApply); } catch(_) {}
  });
  on('ui.modal.openAttachmentsList', async (dataset) => {
    try {
      const { handleOpenAttachmentsListModal } = await import('../modals/pengeluaran/attachmentsModal.js');
      handleOpenAttachmentsListModal(dataset);
    } catch (_) {}
  });

  on('ui.modal.viewJurnalHarian', (dateStr) => {
    try {
      handleViewJurnalHarianModal(dateStr);
    } catch (e) {
      console.error("Gagal membuka detail Jurnal Harian:", e);
      toast('error', 'Gagal membuka detail Jurnal Harian.');
    }
  });

  on('ui.modal.viewWorkerRecap', (workerId) => {
    try {
      handleViewWorkerRecapModal(workerId);
    } catch (e) {
      console.error("Gagal membuka rekap Pekerja:", e);
      toast('error', 'Gagal membuka rekap Pekerja.');
    }
  });
  on('ui.jurnal.openSalaryPaymentPanel', async (billId) => {
    try {
        openSalaryPaymentPanel(billId);
    } catch(e) {
        console.error("Gagal membuka panel pembayaran gaji:", e);
        toast('error', 'Gagal membuka panel pembayaran.');
    }
  });
  on('ui.modal.payIndividualSalary', async (dataset) => {
      try {
          openIndividualSalaryPaymentModal(dataset);
      } catch(e) {
          console.error("Gagal membuka modal pembayaran gaji individual:", e);
          toast('error', 'Gagal membuka modal pembayaran.');
      }
  });
  on('ui.modal.openMassAttendanceModal', async () => {
    try {
      handleOpenMassAttendanceModal();
    } catch(e) {
      console.error("Gagal membuka modal absensi massal:", e);
      toast('error', 'Gagal membuka modal.');
    }
  });

  on('ui.modal.openManualAttendanceModal', async (dataset) => {
    try {
      handleOpenManualAttendanceModal(dataset);
    } catch(e) {
      console.error("Gagal membuka modal edit manual:", e);
      toast('error', 'Gagal membuka modal edit.');
    }
  });

  on('ui.action.view-invoice-items', async (data = {}) => {
    console.warn('[ServiceUIBridge] Handling ui.action.view-invoice-items with data:', data);
    try {
      const { createModal } = await import('../components/modal.js');
      let expenseId = data.expenseId || data['expense-id'] || '';
      let billId = data.id || data.billId || data.itemId || '';

      console.warn(`[viewInvoiceItems] Initial IDs - expenseId: ${expenseId}, billId: ${billId}`);

      if (!expenseId && billId) {
        console.warn(`[viewInvoiceItems] expenseId missing, trying to find from billId: ${billId}`);
        const bill = (appState.bills || []).find(b => b.id === billId) || await localDB.bills.get(billId);
        if (bill && bill.expenseId) {
            expenseId = bill.expenseId;
            console.warn(`[viewInvoiceItems] Found expenseId from bill: ${expenseId}`);
        } else {
            console.warn(`[viewInvoiceItems] Bill found but no expenseId, or bill not found for billId: ${billId}`);
        }
      }

      if (!expenseId) {
        console.error('[viewInvoiceItems] Critical: Missing expenseId; unable to open items modal.', data);
        toast('error', 'Gagal membuka detail item: ID Pengeluaran tidak ditemukan.');
        return;
      }

      console.warn(`[viewInvoiceItems] Fetching expense data for expenseId: ${expenseId}`);
      const { ensureMasterDataFresh } = await import('../../services/data/ensureMasters.js');
      await ensureMasterDataFresh(['materials']);
      const exp = (appState.expenses || []).find(e => e.id === expenseId) || await localDB.expenses.get(expenseId);

      if (!exp) {
        console.error(`[viewInvoiceItems] Expense data not found locally for ID: ${expenseId}.`, data);
          toast('error', 'Gagal membuka detail item: Data pengeluaran tidak ditemukan.');
          return;
      }

      console.warn(`[viewInvoiceItems] Expense data found:`, exp);
      const { openInvoiceItemsDetailModal } = await import('../modals/tagihan/invoiceItemsDetailModal.js');
      openInvoiceItemsDetailModal(exp);

    } catch (e) {
      console.error('[viewInvoiceItems] Unexpected error:', e, data);
      toast('error', `Gagal membuka detail item: ${e.message}`);
    }
  });
  on('ui.modal.openSuratJalanActions', async (dataset) => { try { const { handleOpenSuratJalanActionsModal } = await import('../modals/tagihan/itemActionsModal.js'); handleOpenSuratJalanActionsModal(dataset); } catch(_) {} });
  on('ui.modal.openAttendanceSettings', async () => { try { const { handleOpenAttendanceSettings } = await import('../../services/data/attendanceService.js'); handleOpenAttendanceSettings(); } catch(_) {} });

  on('ui.modal.openEditExpense', async (dataset) => {
    try {
      const { openEditExpenseModal } = await import('../modals/tagihan/itemActionsModal.js');
      const expenseIdToEdit = dataset.id || dataset.itemId || dataset.expenseId;
       if (!expenseIdToEdit) {
           console.error("[openEditExpense] Missing ID in dataset:", dataset);
           toast('error', 'Gagal membuka form edit: ID tidak ditemukan.');
           return;
       }
       console.warn(`[openEditExpense] Attempting to edit expense with ID: ${expenseIdToEdit}`);
      const exp = appState.expenses.find(e => e.id === expenseIdToEdit) || await localDB.expenses.get(expenseIdToEdit);
      if(exp) {
          console.warn("[openEditExpense] Found expense data, opening modal:", exp);
          openEditExpenseModal(exp, dataset);
      } else {
           console.error(`[openEditExpense] Expense data not found for ID: ${expenseIdToEdit}`);
           toast('error', 'Gagal membuka form edit: Data pengeluaran tidak ditemukan.');
      }
    } catch(e) {
         console.error("[openEditExpense] Error:", e, dataset);
         toast('error', `Gagal membuka form edit: ${e.message}`);
    }
  });

  on('uiInteraction.showPaymentSuccessPreviewPanel', (data, navTarget) => {
    try { showPaymentSuccessPreviewPanel(data, navTarget); } catch (_) {}
  });

  on('uiInteraction.showSuccessPreviewPanel', (itemData, type) => {
    try { showSuccessPreviewPanel(itemData, type); } catch (_) {}
  });

  on('ui.modal.showKwitansiPayment', async (kwitansiData = {}) => {
    try {
      const { getKwitansiUniversalHTML, downloadUniversalKwitansiAsImage, downloadUniversalKwitansiAsPDF } = await import('../../services/receiptService.js');
      const { handleDownloadConfirmation } = await import('../../services/receiptService.js');


      const kwitansiDataString = JSON.stringify(kwitansiData).replace(/"/g, '&quot;');

      const content = `
        <div id="kwitansi-printable-area" style="position: relative;">
          ${await getKwitansiUniversalHTML(kwitansiData)}
          <div class="kwitansi-actions" aria-label="Kwitansi Actions">
            <button class="btn-icon" data-action="kwitansi-download-image" data-kwitansi="${kwitansiDataString}" title="Unduh Gambar">${createIcon('image')}</button>
            <button class="btn-icon" data-action="kwitansi-download-pdf" data-kwitansi="${kwitansiDataString}" title="Unduh PDF">${createIcon('picture_as_pdf')}</button>
          </div>
        </div>`;
      const modal = createModal('dataDetail', { title: 'Pratinjau Kwitansi', content, replace: true });

      const existingListener = modal.__kwitansiClickListener;
      if (existingListener) {
          modal.removeEventListener('click', existingListener);
      }

      const onClick = (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;

        const currentKwitansiDataString = btn.dataset.kwitansi;

        if (typeof currentKwitansiDataString === 'string' && currentKwitansiDataString.trim() !== '') {
            try {
                const currentKwitansiData = JSON.parse(currentKwitansiDataString.replace(/&quot;/g, '"'));

                if (action === 'kwitansi-download-image') {
                    handleDownloadConfirmation(downloadUniversalKwitansiAsImage, currentKwitansiData, action, modal);
                }
                if (action === 'kwitansi-download-pdf') {
                    handleDownloadConfirmation(downloadUniversalKwitansiAsPDF, currentKwitansiData, action, modal);
                }
            } catch (parseError) {
                 console.error("Gagal parse data kwitansi dari tombol:", parseError, currentKwitansiDataString);
                 toast('error', 'Gagal memproses data kwitansi dari tombol.');
            }
        } else {
             console.error("Data kwitansi tidak ditemukan pada tombol:", btn);
             toast('error', 'Data kwitansi tidak ditemukan pada tombol.');
        }
      };

      modal.addEventListener('click', onClick);
      modal.__kwitansiClickListener = onClick;

    } catch (err) {
        console.error("Gagal menampilkan modal kwitansi:", err);
        toast('error', 'Gagal menampilkan pratinjau kwitansi.');
    }
  });

  on('ui.page.render', (...args) => { try { return renderPageContent(...args); } catch (_) {} });
  on('ui.page.recalcDashboardTotals', (...args) => { try { return calculateAndCacheDashboardTotals(...args); } catch (_) {} });

  on('data.downloadAttachment', ({ url, filename } = {}) => {
    try {
      if (!url) return;
      downloadAttachment(url, filename);
    } catch (e) {
      console.error("Gagal memicu downloadAttachment dari bridge:", e);
      toast('error', 'Gagal memulai unduhan.');
    }
  });

  on('ui.action.manage-master', async (context, event) => {
      try {
          const { handleManageMasterData } = await import('../../services/data/masterDataService.js');
          handleManageMasterData(context.type, { sourceForm: context.target?.closest('form') });
      } catch(e) {
          toast('error', 'Gagal membuka panel master data.');
      }
  });
}