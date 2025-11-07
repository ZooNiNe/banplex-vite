import { appState } from "../state/appState.js";
import { emit, on } from "../state/eventBus.js";
import { createModal, closeModal, closeModalImmediate, closeDetailPaneImmediate, closeDetailPane, handleDetailPaneBack, hideMobileDetailPage, closeAllModals } from "./components/modal.js";
import { handleOpenBillDetail, handleOpenPemasukanDetail, handleOpenEditItem } from "../services/data/uiInteractionService.js";
import { signInWithGoogle, handleLogout } from "../services/authService.js";
import { toggleTheme } from "../utils/theme.js";
import { syncToServer, requestSync } from "../services/syncService.js";
import { openBillPaymentModal } from "./modals/tagihan/itemActionsModal.js";
import { masterDataConfig } from "../config/constants.js";
import { handleManageUsers, handleUserAction } from "../services/data/userService.js";
import { handleDeleteMasterItem, handleManageMasterData, openMasterDataGrid } from "../services/data/masterDataService.js";
import { handleCheckIn, handleCheckOut, handleDeleteSingleAttendance, handleOpenAttendanceSettings, openManualAbsenceStatusPanel, handleSaveAllPendingAttendance } from "../services/data/attendanceService.js";
import { handlePaySingleWorkerFromRecap, handleRemoveWorkerFromRecap, handleDeleteSalaryBill, openSalaryRecapPanel, generateSalaryRecap } from "../services/data/jurnalService.js";
import { handleFixStuckAttendanceModal } from "../services/modals/jurnal/fixStuckAttendanceModal.js";
import { _handleRestoreItems, _handleDeletePermanentItems, handleDeleteItem, _handleEmptyRecycleBin } from "../services/data/recycleBinService.js";
import { handleServerCleanUp, resolveConflict, handleRecalculateUsageCount, handleRestoreOrphanLoans, openToolsGrid, handleDevResetAllData } from "../services/data/adminService.js";
import { handleDeleteStockTransaction } from "../services/data/stockService.js";
import { handlePostComment, handleDeleteComment } from "../services/data/commentService.js";
import { handleGenerateReportModal } from "../services/modals/reports/generateReportModal.js";
import { downloadAttachment } from "../services/fileService.js";
import { handleOpenConflictsPanel, handleOpenStorageStats } from "../utils/sync.js";
import { isViewer } from "../utils/helpers.js";
import { toast } from "./components/toast.js";
import { handleNavigation, renderSidebar } from "./mainUI.js";
import { getRecycleBinHeaderOverflowActions } from './pages/recycleBin.js';
import { getHeaderOverflowActions, getItemActions, displayActions, displayBottomSheetActions } from "./actionMenuUtils.js";
import { attachBottomSheetActionListeners } from "./eventListeners/dynamicElementListeners.js";

export const clickActions = {
    'navigate': (ctx) => { handleNavigation(ctx.nav); },
    'close-modal-and-navigate': (ctx) => {
        closeAllModals();
        handleNavigation(ctx.nav);
    },
    'continue-edit-attendance': () => {
        emit('ui.modal.closeAll');
        try {
            const d = new Date(appState.defaultAttendanceDate + 'T00:00:00');
            d.setUTCDate(d.getUTCDate() + 1);
            const nextYMD = d.toISOString().slice(0,10);
            appState.defaultAttendanceDate = nextYMD;
            try { localStorage.setItem('attendance.defaultDate', nextYMD); } catch(_) {}
        } catch(_) {}
        emit('ui.absensi.renderManualForm');
    },
    'close-detail-pane-and-navigate': (ctx) => {
        closeDetailPaneImmediate();
        hideMobileDetailPage();
        appState.detailPaneHistory = [];
        handleNavigation(ctx.nav);
    },
    'download-attachment-confirm': (ctx) => {
        createModal('confirmUserAction', {
            title: 'Unduh Lampiran?',
            message: `Anda akan mengunduh file: <strong>${ctx.filename}</strong>. Lanjutkan?`,
            onConfirm: () => downloadAttachment(ctx.url, ctx.filename)
        });
    },
    'auth-action': () => { appState.currentUser ? createModal('confirmLogout', { onConfirm: handleLogout }) : signInWithGoogle(); },
    'toggle-theme': () => { toggleTheme(); },
    'manage-master': (ctx) => { handleManageMasterData(ctx.type, { sourceForm: ctx.target?.closest('form') }); },
    'open-master-data-grid': () => { openMasterDataGrid(); },
    'open-tools-grid': () => { openToolsGrid(); },
    'open-report-generator': () => { handleGenerateReportModal(); },
    'empty-recycle-bin': () => { _handleEmptyRecycleBin(); },
    'open-global-search': (ctx) => { emit('ui.search.open', { target: ctx.target }); },
    'open-comments-search': () => { emit('ui.comments.openSearch'); },
    'open-new-comment-modal': () => { emit('ui.comments.openNewCommentModal'); },
    'open-filter-modal': () => { emit('ui.modal.showBillsFilter', () => emit('ui.tagihan.renderContent')); },
    'open-sort-modal': () => { emit('ui.modal.showBillsSort', () => emit('ui.tagihan.renderContent')); },
    'open-sort-modal-pemasukan': () => { emit('ui.modal.showPemasukanSort', () => emit('ui.pemasukan.renderContent')); },    'open-attendance-filter-modal': () => { emit('ui.modal.showAttendanceFilter', () => emit('ui.absensi.renderContent')); },
    'open-stock-sort-modal': () => { emit('ui.modal.showStockSort', () => emit('ui.stok.renderContent')); },
    'open-attendance-sort-modal': () => { emit('ui.modal.showAttendanceSort', () => emit('ui.absensi.renderContent')); },
    'open-pemasukan-detail': (ctx) => { handleOpenPemasukanDetail({ dataset: { id: ctx.itemId, type: ctx.type } }); },
    'pay-loan': (ctx) => { emit('ui.modal.openPayment', {id: ctx.itemId, type: 'pinjaman'}); },
    'open-loan-payment-history': (ctx) => { emit('ui.modal.openLoanPaymentHistory', { id: ctx.itemId }); },
    'manage-master-global': () => { emit('ui.modal.openMasterGlobal'); },
    'cetak-kwitansi-universal': (ctx) => { emit('ui.modal.showKwitansiPayment', JSON.parse(ctx.kwitansi)); },
    'reset-local-data': () => { emit('ui.modal.confirmResetLocalData'); },
    'open-payment-history-modal': (ctx) => { emit('ui.modal.openPaymentHistory', { ...ctx, id: ctx.itemId }); },
    'sync-all-pending': () => { syncToServer(); },
    'manage-users': () => { handleManageUsers(); },
    'restore-orphan-loans': () => { handleRestoreOrphanLoans(); },
    'server-cleanup': () => { handleServerCleanUp(); },
    'recalculate-usage': () => { handleRecalculateUsageCount(); },
    'open-conflicts': () => { handleOpenConflictsPanel(); },
    'open-storage-stats': () => { handleOpenStorageStats(); },
    'toggle-payment-history': (ctx) => { ctx.target?.closest('.payment-history-section')?.classList.toggle('open'); },
    'apply-conflict': (ctx) => { resolveConflict(ctx.conflictId, true); },
    'discard-conflict': (ctx) => { resolveConflict(ctx.conflictId, false); },
    'detail-pane-back': () => { handleDetailPaneBack(); },
    'close-detail-pane': () => {
            const isMobile = window.matchMedia('(max-width: 599px)').matches;
            if (isMobile) {
                emit('ui.modal.hideMobileDetail');
            } else {
                emit('ui.modal.closeDetailPane');
            }
        },
    'add-worker-wage': (ctx) => { emit('ui.form.openWorkerWageDetail', { target: ctx.target }); },
    'edit-worker-wage': (ctx) => { emit('ui.form.openWorkerWageDetail', { target: ctx.target }); },
    'add-role-wage-row': (ctx) => { emit('ui.form.addRoleWageRow', { target: ctx.target }); },
    'remove-role-wage-row': (ctx) => { emit('ui.form.removeRoleWageRow', { target: ctx.target }); },
    'remove-worker-wage': (ctx) => {
        const itemEl = ctx.target?.closest('.worker-wage-summary-item');
        if (!itemEl) return;
        const list = itemEl.parentElement;
        itemEl.remove();
        if (list && !list.querySelector('.worker-wage-summary-item')) {
            list.innerHTML = '<p class="empty-state-small empty-state-small--left">Belum ada pengaturan upah.</p>';
        }
         emit('ui.form.markDirty', true);
    },
    'open-pemasukan-form': (ctx) => {
        appState.pemasukanFormType = ctx.type || 'termin';
        emit('ui.navigate', 'pemasukan_form');
    },
    'open-comments-view': (ctx) => {
        const { parentId, parentType, prefilledText } = ctx;
        emit('ui.modal.openComments', { parentId, parentType, prefilledText });
    },
    'copy-comment': (ctx) => {
        try {
            const msgId = ctx.msgId || ctx.itemId;
            const el = document.querySelector(`.msg-group[data-msg-id="${msgId}"] .content`);
            const text = el?.textContent || '';
            if (text) navigator.clipboard?.writeText(text);
        } catch(_) {}
    },
    'lihat-tagihan-induk': (ctx) => { emit('ui.navigate.toParent', ctx); },
    'cetak-kwitansi-pembayaran': (ctx) => { emit('ui.modal.showKwitansiPayment', JSON.parse(ctx.kwitansi)); },
    'toggle-emoji-picker': (ctx) => { emit('ui.comment.toggleEmojiPicker', { target: ctx.target }); },
    'insert-emoji': (ctx) => { emit('ui.comment.insertEmoji', { char: ctx.char, row: ctx.target?.closest('.comment-input-row') }); },
    'back-to-detail': (ctx) => { emit('ui.navigate.backToDetail', ctx); },
    'edit-item': (ctx) => { handleOpenEditItem(ctx.itemId, ctx.type); },
    'pay-bill': (ctx) => { emit('ui.modal.openPayment', {id: ctx.itemId, type: 'bill'}); },
    'open-bill-detail': (ctx) => { handleOpenBillDetail(ctx); },
    'open-edit-expense': (ctx) => {
        const expenseIdToEdit = ctx.expenseId || ctx.itemId;
        emit('ui.modal.openEditExpense', { ...ctx, id: expenseIdToEdit });
    },
    'show-report-detail': (ctx) => { emit('ui.modal.showChartDrilldown', {type: ctx.type, category: ctx.category, title: ctx.title || 'Detail'}); },
    'edit-surat-jalan': (ctx) => { emit('ui.modal.editSuratJalan', ctx.itemId); },
    'convert-surat-jalan': (ctx) => { emit('ui.modal.openEditExpense', { ...ctx, id: ctx.itemId, convert: true }); },
    'view-attachment': (ctx) => {
        emit('ui.modal.create', 'imageView', { src: ctx.src });
    },
    'view-payment-attachment': (ctx) => { emit('ui.attachments.viewPayment', ctx); },
    'post-comment': (ctx) => { handlePostComment(ctx); },
    'delete-comment': (ctx) => { handleDeleteComment({ ...ctx, id: ctx.itemId }); },
    'check-in': (ctx) => { handleCheckIn(ctx.id); },
    'check-out': (ctx) => { handleCheckOut(ctx.id); },
    'edit-attendance': (ctx) => { emit('ui.modal.editAttendance', ctx.id || ctx.recordId || ctx.itemId); },
    'delete-attendance': (ctx) => { handleDeleteSingleAttendance(ctx.id || ctx.recordId || ctx.itemId); },
    'pay-single-worker': (ctx) => {
        const row = ctx.target.closest('tr');
        const { workerId, workerName, totalPay, recordIds } = row.dataset;
        const recordsArray = recordIds.split(',');
        
        const startDate = new Date(document.getElementById('recap-start-date').value);
        const endDate = new Date(document.getElementById('recap-end-date').value);
    
        const singleWorkerData = {
            workerId,
            workerName,
            totalPay: parseFloat(totalPay),
            recordIds: recordsArray
        };
    
        emit('ui.modal.create', 'confirmUserAction', {
            message: `Buat tagihan individual untuk <strong>${workerName}</strong> sebesar <strong>${fmtIDR(singleWorkerData.totalPay)}</strong>?`,
            onConfirm: async () => {
                await handleGenerateBulkSalaryBill({ 
                    all: false, 
                    selectedWorkers: [singleWorkerData],
                    startDate,
                    endDate
                });
                
                row.style.transition = 'opacity 0.3s, transform 0.3s';
                row.style.opacity = '0';
                row.style.transform = 'translateX(-20px)';
                setTimeout(() => row.remove(), 300);
            }
        });
    },
    'edit-recap-amount': (ctx) => { emit('ui.modal.editRecapAmount', ctx.target); },
    'generate-all-salary-bill': () => {
        const container = document.getElementById('rekap-gaji-results');
        if (!container) return;
        const rows = Array.from(container.querySelectorAll('tr[data-worker-id]'));
        const selectedWorkers = rows.map(row => ({
            workerId: row.dataset.workerId,
            workerName: row.dataset.workerName,
            totalPay: parseFloat(row.dataset.totalPay),
            recordIds: row.dataset.recordIds.split(',')
        }));
        const startDate = new Date(document.getElementById('recap-start-date').value);
        const endDate = new Date(document.getElementById('recap-end-date').value);
        handleGenerateBulkSalaryBill({ all: true, selectedWorkers, startDate, endDate });
    },
    'generate-selected-salary-bill': () => {
        const container = document.getElementById('rekap-gaji-results');
        if (!container) return;
        const rows = Array.from(container.querySelectorAll('tr[data-selected="true"]'));
        const selectedWorkers = rows.map(row => ({
            workerId: row.dataset.workerId,
            workerName: row.dataset.workerName,
            totalPay: parseFloat(row.dataset.totalPay),
            recordIds: row.dataset.recordIds.split(',')
        }));
        const startDate = new Date(document.getElementById('recap-start-date').value);
        const endDate = new Date(document.getElementById('recap-end-date').value);
        handleGenerateBulkSalaryBill({ all: false, selectedWorkers, startDate, endDate });
    },
    'set-payment-full': () => { emit('ui.form.setPaymentAmount', 'full'); },
    'set-payment-half': () => { emit('ui.form.setPaymentAmount', 'half'); },
    'fix-stuck-attendance': () => { handleFixStuckAttendanceModal(); },
    'cetak-kwitansi': async (ctx) => { const { handleCetakKwitansi } = await import('../services/receiptService.js'); handleCetakKwitansi(ctx.itemId); },
    'cetak-kwitansi-individu': async (ctx) => { const { handleCetakKwitansiIndividu } = await import('../services/receiptService.js'); handleCetakKwitansiIndividu(ctx); },
    'cetak-kwitansi-kolektif': async (ctx) => { const { handleCetakKwitansiKolektif } = await import('../services/receiptService.js'); handleCetakKwitansiKolektif(ctx); },
    'pay-individual-salary': (ctx) => { emit('ui.modal.payIndividualSalary', ctx); },
    'stok-in': (ctx) => { emit('ui.modal.stokIn', ctx.itemId); },
    'stok-out': (ctx) => { emit('ui.modal.stokOut', ctx.itemId); },
    'open-stock-usage-modal': (ctx) => { emit('ui.modal.openStockUsage', ctx); },
    'edit-stock': (ctx) => { emit('ui.modal.editStock', ctx); },
    'delete-stock': (ctx) => { handleDeleteStockTransaction(ctx); },
    'add-new-material-header': () => { handleManageMasterData('materials'); },
    'add-new-material': (ctx) => { emit('ui.modal.addNewMaterial', ctx.target?.closest('.invoice-item-row')); },
    'toggle-more-actions': () => { document.getElementById('quick-actions-grid')?.classList.toggle('actions-collapsed'); },
    'force-full-sync': () => { emit('ui.modal.confirmForceSync'); },
    'remove-worker-from-recap': (ctx) => {
        if (isViewer()) return;
        handleRemoveWorkerFromRecap(ctx.billId, ctx.workerId);
    },
    'login-different-account': () => {
        localStorage.removeItem('lastActiveUser');
        signInWithGoogle();
    },
    'share-preview': async () => {
        const { openShareModal } = await import('../services/receiptService.js');
        openShareModal('#success-preview-card', { title: 'Data Tersimpan', text: 'Berikut adalah rincian data yang baru saja disimpan.' });
    },
    'open-page-overflow': (ctx, event) => {
        if (!event) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const actions = getHeaderOverflowActions();
        const button = ctx.target?.closest('button');
        if (actions.length > 0 && button) {
            displayActions(actions, button);
        }
    },
     'toggle-accordion': (ctx) => {
        const section = ctx.target?.closest('.simulasi-section, .simulasi-subsection, .worker-settings-item');
        if (section) section.classList.toggle('open');
    },
     'open-simulasi-actions': (ctx) => { emit('ui.action.open-simulasi-actions', ctx); },
     'view-jurnal-harian': (ctx) => { emit('ui.modal.viewJurnalHarian', ctx.date); },
     'view-worker-recap': (ctx) => { emit('ui.modal.viewWorkerRecap', ctx.workerId); },
     'delete-item': (ctx) => { emit('data.deleteItem', { id: ctx.itemId, type: ctx.type }); },
     'delete-master-item': (ctx) => { handleDeleteMasterItem(ctx.itemId, ctx.type); },
     'edit-master-item': (ctx) => { handleManageMasterData(ctx.type, { itemId: ctx.itemId, activeTab: 'form' }); },
     'user-action': (ctx) => { handleUserAction(ctx); },
     'restore-item': (ctx) => { _handleRestoreItems([{ id: ctx.itemId, table: ctx.table }]); },
     'delete-permanent-item': (ctx) => { _handleDeletePermanentItems([{ id: ctx.itemId, table: ctx.table }]); },
     'delete-salary-bill': (ctx) => { handleDeleteSalaryBill(ctx.id); },
     'open-item-actions-modal': (ctx, event) => {
        const { itemId, target: actionTarget } = ctx;
        if (!event) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        
        if (appState.selectionMode.active && appState.selectionMode.pageContext === 'absensi') {
        }

        if (itemId && actionTarget && !appState.selectionMode.active) {
            const actions = getItemActions(ctx);
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
            pageContext = ctx.pageContext || pageContext;

            const pagesUsingBottomSheet = new Set(['tagihan', 'pemasukan', 'jurnal', 'absensi', 'stok']);
            const useBottomSheet = isMobile && pagesUsingBottomSheet.has(pageContext) && !isInDetailPane;

            if (useBottomSheet) {
                displayBottomSheetActions(actions, ctx, actionTarget);
            } else {
                displayActions(actions, actionTarget);
            }
        }
    },
    'open-attachments': (ctx) => {
        emit('ui.modal.openAttachmentsList', ctx);
    },
    'edit-attendance-day': (ctx) => {
               emit('ui.jurnal.openDailyProjectPicker', { date: ctx.date });
            },
           'goto-manual-add': (ctx) => {
               appState.defaultAttendanceDate = ctx.date;
               localStorage.setItem('attendance.defaultDate', ctx.date);
               appState.manualAttendanceSelectedProjectId = ctx.projectId;
               localStorage.setItem('attendance.manualSelectedProjectId', ctx.projectId);
               
               closeDetailPaneImmediate();
               emit('ui.modal.closeAll');
               
               emit('ui.navigate', 'absensi&subpage=manual');
           },

        'toggle-layout': () => {
        const page = (window.appState && window.appState.activePage) || '';
        if (!page) return;
        const key = page === 'dashboard' ? 'ui.layout.dashboard' : (page === 'laporan' ? 'ui.layout.reports' : null);
        if (!key) return;
        let next;
        try {
            const current = localStorage.getItem(key) || 'grid';
            next = current === 'grid' ? 'cards' : 'grid';
            localStorage.setItem(key, next);
        } catch(_) { next = 'grid'; }
        try {
            document.body.classList.toggle(`${page}-layout-grid`, next === 'grid');
            document.body.classList.toggle(`${page}-layout-cards`, next === 'cards');
        } catch(_) {}
    },
    'close-hero': (ctx) => {
        try {
            const heroId = ctx.heroId || ctx.target?.dataset?.heroId;
            const el = ctx.target?.closest('.dashboard-hero, .dashboard-hero-carousel, .list-hero, .quote-hero');
            if (el) {
                el.style.display = 'none';
            }
            if (heroId) {
                try { localStorage.setItem(`ui.hideHero.${heroId}`, '1'); } catch(_) {}
            }
        } catch (_) {}
    },
    'open-absence-status-panel': async () => {
        const selectedIds = Array.from(appState.selectionMode.selectedIds || []);
        if (selectedIds.length === 0) {
            toast('info', 'Pilih minimal satu pekerja terlebih dahulu.');
            return;
        }
        const mod = await import('../services/data/attendanceService.js');
        if (typeof mod.openManualAbsenceStatusPanel === 'function') {
            mod.openManualAbsenceStatusPanel(selectedIds);
        }
    },
    'save-all-pending-attendance': () => {
        handleSaveAllPendingAttendance();
    },
    'open-mass-attendance-modal': () => {
        emit('ui.modal.openMassAttendanceModal');
    },
    'open-manual-attendance-modal': (ctx) => {
        emit('ui.modal.openManualAttendanceModal', ctx);
    },
    'open-attendance-settings': () => { handleOpenAttendanceSettings(); },
    'set-attendance-shortcut': (ctx) => {
        const { workerId, status, role, pay, projectId } = ctx;
        if (!workerId || !status || !projectId) {
            toast('error', 'Konteks untuk pintasan absensi tidak lengkap.');
            return;
        }

        if (!appState.pendingAttendance) {
            appState.pendingAttendance = new Map();
        }

        const worker = appState.workers.find(w => w.id === workerId);
        if (!worker) {
             toast('error', 'Data pekerja tidak ditemukan.');
             return;
        }
        
        let entry;
        if (status === 'absent') {
            entry = { 
                status: 'absent',
                pay: 0,
                role: '',
                projectId: projectId // Tetap simpan projectId untuk referensi
            };
            toast('info', `${worker.workerName} ditandai Absen.`);
        } else {
             const finalPay = parseFloat(pay) || 0;
             if (finalPay === 0) {
                 toast('error', `Tidak ada tarif upah untuk peran default "${role}" di proyek ini.`);
                 return;
             }
             entry = {
                status: status, // 'full_day'
                role: role,
                pay: finalPay,
                projectId: projectId
             };
             toast('success', `${worker.workerName} ditandai Hadir.`);
        }

        appState.pendingAttendance.set(workerId, entry);
        
        emit('ui.absensi.renderManualForm');
        emit('ui.absensi.updateFooter');
    },
    'toggle-sidebar': () => {
        const isMobile = window.matchMedia('(max-width: 599px)').matches;
        if (isMobile) {
            const body = document.body;
            const isOpen = body.classList.contains('mobile-sidebar-open');

            const ensureOverlay = () => {
                let overlay = document.getElementById('mobile-sidebar-overlay');
                if (!overlay) {
                    overlay = document.createElement('div');
                    overlay.id = 'mobile-sidebar-overlay';
                    overlay.style.position = 'fixed';
                    overlay.style.inset = '0';
                    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
                    overlay.style.zIndex = '2050';
                    overlay.style.opacity = '0';
                    overlay.style.transition = 'opacity 0.25s ease';
                    document.body.appendChild(overlay);
                    requestAnimationFrame(() => overlay.style.opacity = '1');
                }
                return overlay;
            };

            const closeMobileSidebar = () => {
                body.classList.remove('mobile-sidebar-open');
                const overlay = document.getElementById('mobile-sidebar-overlay');
                if (overlay) {
                    overlay.style.opacity = '0';
                    overlay.removeEventListener('click', closeMobileSidebar);
                     overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
                     setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 300);
                }
            };

            if (!isOpen) {
                const overlay = ensureOverlay();
                body.classList.add('mobile-sidebar-open');
                overlay.addEventListener('click', closeMobileSidebar, { once: true });
            } else {
                closeMobileSidebar();
            }
            return;
        }

        const nowCollapsed = !document.body.classList.contains('sidebar-collapsed');
        document.body.classList.toggle('sidebar-collapsed', nowCollapsed);
        try { localStorage.setItem('sidebarCollapsed', nowCollapsed ? '1' : '0'); } catch (_) {}
        renderSidebar();
    },
    'history-back': () => {
        history.back();
    },
    'toggle-accounting-mode': () => {
        try {
            const key = 'banplex.report.accountingMode';
            const current = appState.reportAccountingMode || (localStorage.getItem(key) === '1');
            const next = !current;
            appState.reportAccountingMode = next;
            try { localStorage.setItem(key, next ? '1' : '0'); } catch (_) {}
            const btn = document.getElementById('toggle-accounting-mode');
            if (btn) {
                btn.classList.toggle('active', next);
                btn.setAttribute('aria-pressed', next ? 'true' : 'false');
                btn.title = next ? 'Mode Pro' : 'Mode Basic';
                btn.innerHTML = `
                    <span class="toggle-dot" aria-hidden="true"></span>
                    <span class="toggle-label">${next ? 'Pro' : 'Basic'}</span>
                `;
            }
            if (appState.activePage === 'laporan') {
                setTimeout(() => { emit('ui.laporan.renderContent'); }, 0);
            }
        } catch (_) {}
    },
    'refresh-dashboard-card': (ctx) => {
        emit('ui.dashboard.refreshCardData', ctx.cardType);
    },
    'open-salary-recap-panel': () => {
        openSalaryRecapPanel();
    },
    'open-salary-payment-panel': (ctx) => {
        emit('ui.jurnal.openSalaryPaymentPanel', ctx.itemId);
    },
    'generate-salary-recap': () => {
        const container = document.getElementById('rekap-gaji-form');
        if (!container) return;
        const startDate = container.querySelector('#recap-start-date').value;
        const endDate = container.querySelector('#recap-end-date').value;
        if (!startDate || !endDate) {
            toast('error', 'Silakan pilih rentang tanggal.');
            return;
        }
        generateSalaryRecap(new Date(startDate), new Date(endDate));
    },
    'change-worker-role': (ctx) => {
        emit('ui.modal.openChangeRole', ctx);
    },
    'recalculate-wages': async () => {
        const { handleRecalculateWages } = await import('../services/data/jurnalService.js');
        handleRecalculateWages();
    },
    'dev-reset-all-data': () => { 
        handleDevResetAllData(); 
    }
};


