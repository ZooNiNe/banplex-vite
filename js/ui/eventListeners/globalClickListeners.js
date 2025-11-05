import { appState } from "../../state/appState.js";
import { emit, on } from "../../state/eventBus.js";
import { createModal, closeModal, closeModalImmediate, closeDetailPaneImmediate, closeDetailPane, handleDetailPaneBack, hideMobileDetailPage, closeAllModals } from "../components/modal.js";
import { masterDataConfig } from "../../config/constants.js";
import { getHeaderOverflowActions, getItemActions, displayActions, displayBottomSheetActions, resolveActionContext } from "../actionMenuUtils.js";
import { handleAttachmentAction } from "./attachmentListeners.js";
import { clickActions } from "../actionHandlers.js";

let pointerDownTarget = null;
let pointerStartX = 0;
let pointerStartY = 0;
let _suppressClickUntil = 0;
let isLongPress = false;
let longPressTimer = null;


export function initializeGlobalClickListeners() {


    document.body.addEventListener('contextmenu', (e) => {
        const isDesktop = window.matchMedia('(min-width: 600px)').matches;
        if (!isDesktop) return;

        const cardWrapper = e.target?.closest('.wa-card-v2-wrapper');
        if (!cardWrapper || appState.selectionMode.active) return;

        const context = resolveActionContext(cardWrapper);
        if (!context || !context.itemId) return;

        e.preventDefault();

        const actions = getItemActions(context);
        displayActions(actions, cardWrapper, { x: e.clientX, y: e.clientY });
    });

    document.body.addEventListener('click', (e) => {
        // Allow the global search overlay to handle its own clicks without interference
        if (e.target && e.target.closest && e.target.closest('#global-search-page')) {
            return;
        }
        if (isLongPress || Date.now() < _suppressClickUntil) {
            isLongPress = false;
            _suppressClickUntil = 0;
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return;
        }

        const target = e.target;
        const resolvedContext = resolveActionContext(target);
        const actionTarget = resolvedContext?.target;

        const isIgnoredButton = target.closest('.custom-select-trigger');
        const isInDetailPaneFormSubmit = target.closest('#detail-pane form button[type="submit"], #detail-pane .form-footer-actions button[type="submit"]');

        if (isIgnoredButton || isInDetailPaneFormSubmit) {

            return;
        }


        const openMenu = document.querySelector('.actions-menu.show');
        if (openMenu && !openMenu.contains(target) && actionTarget !== openMenu.originElement) {
            if (window.closeContextMenu) {
                window.closeContextMenu(e);
            } else if (openMenu.parentNode) {
                openMenu.classList.remove('show');
                openMenu.addEventListener('transitionend', () => openMenu.remove(), { once: true });
                setTimeout(() => { if (openMenu.parentNode) openMenu.remove(); }, 200);
            }
        }


        let pageContextForSelection = appState.activePage === 'recycle_bin' ? 'recycleBin' : appState.activePage;
        const detailPane = document.getElementById('detail-pane');
        const isDetailPaneOpen = detailPane && (detailPane.classList.contains('detail-pane-open') || document.body.classList.contains('detail-view-active'));
        const paneType = detailPane?.dataset?.paneType || '';

        if (isDetailPaneOpen) {
            if (paneType === 'user-management') pageContextForSelection = 'manajemen_user';
            else if (paneType.startsWith('master-data-')) pageContextForSelection = 'master';
            else if (paneType === 'recycleBin') pageContextForSelection = 'recycleBin';
        }

        const selectionContextTap = appState.selectionMode.pageContext;
        const isSelectionActiveOnPageTap = appState.selectionMode.active && selectionContextTap === pageContextForSelection;
        const cardWrapper = target.closest('.wa-card-v2-wrapper');
        const itemId = cardWrapper?.dataset.itemId;


        if (isSelectionActiveOnPageTap && cardWrapper && itemId) {
            const clickedInteractiveElement = target.closest('button[data-action]:not(.selection-checkmark), a[data-action], .custom-select-trigger, input, textarea, select');

            if (!clickedInteractiveElement) {
                 e.preventDefault();
                 e.stopPropagation();
                 e.stopImmediatePropagation();
                 emit('ui.selection.handleAction', 'toggle-selection', { itemId: itemId, cardWrapper: cardWrapper }, e);
                 return;
            }
        }

        if (!actionTarget) {
            return;
        }

        const insideModalContent = target.closest('.modal-content, .composer-wrapper, .chat-item-context-header');
        if (insideModalContent && !target.closest('[data-action="close-modal"], .modal-close-btn')) {
            return;
        }

        const insideBottomSheetActions = target.closest('.actions-modal-list');
        if (insideBottomSheetActions) {
            return; 
        }
        
        const action = actionTarget.dataset.action;        
        const actionContext = resolvedContext || {};

        const actionsThatOpenMenus = new Set([
            'open-item-actions-modal', 'open-page-overflow'
        ]);

        const eventBusActions = new Set([
            'open-bill-detail', 'pay-bill', 'open-payment-history-modal',
            'open-comments-view', 'open-attachments', 'view-invoice-items',
            'open-edit-expense', 'edit-master-item', 'delete-master-item',
            'delete-item', 'restore-item', 'delete-permanent-item',
            'activate-selection-mode', 'open-filter-modal', 'open-sort-modal',
            'pay-loan', 'open-loan-payment-history', 'edit-item',
            'convert-surat-jalan', 'edit-surat-jalan', 'user-action',
            'stok-in', 'stok-out', 'edit-stock', 'delete-stock',
            'delete-salary-bill', 'open-pemasukan-detail',
            'close-selection-mode', 'toggle-selection', 'select-all-items',
            'delete-selected-items', 'restore-selected', 'delete-permanent-selected',
            'open-selection-summary', 'forward-to-comments',
            'open-item-actions-modal',
            'view-jurnal-harian', 'view-worker-recap',
            'view-log-detail',
            'manage-master',
            'open-pemasukan-form',
            'cetak-kwitansi-pembayaran', 'cetak-kwitansi-universal',
            'cetak-kwitansi', 'cetak-kwitansi-individu', 'cetak-kwitansi-kolektif',
            'pay-individual-salary', 'remove-worker-from-recap',
            'open-simulasi-actions',
            'view-attachment', 'view-payment-attachment',
            'download-attachment-confirm',
            'add-invoice-item-btn', 'remove-item-btn',
            'add-worker-wage', 'edit-worker-wage', 'remove-worker-wage',
            'add-role-wage-row', 'remove-role-wage-row',
            'upload-attachment', 'trigger-single-upload', 'trigger-payment-upload',
            'replace-attachment', 'delete-temp-attachment', 'remove-payment-attachment',
            'delete-attachment',
            'open-manual-attendance-control',
            'save-all-pending-attendance',
            'open-mass-attendance-modal',
            'open-manual-attendance-modal',
            'set-attendance-shortcut',
            'open-attendance-settings',
            'delete-attendance',
            'kwitansi-download-pdf',
            'kwitansi-download-image',
            'open-salary-recap-generator',
            'evict-storage',
            'export-backup',
            'import-backup',
            'open-project-role-editor',
            'open-worker-defaults-modal',
            'edit-attendance-day',
            'open-salary-payment-panel'
        ]);


        const directClickActions = new Set([
            ...Object.keys(clickActions).filter(key => !eventBusActions.has(key)),
            'toggle-sidebar',
            'history-back'
        ]);


        if (directClickActions.has(action)) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            if (typeof clickActions[action] === 'function') {
                clickActions[action](actionContext, e);
            } else {
            }
            return;
        }

        if (eventBusActions.has(action)) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            const eventName = ['activate-selection-mode', 'close-selection-mode', 'toggle-selection', 'select-all-items', 'delete-selected-items', 'restore-selected', 'delete-permanent-selected', 'open-selection-summary', 'forward-to-comments'].includes(action)
                 ? 'ui.selection.handleAction'
                 : `ui.action.${action}`;

             let args;
             if (eventName === 'ui.selection.handleAction') {
                 args = [action, actionContext, e];
             } else {
                 args = [actionContext, e];
             }

             const isMenuOpeningAction = actionsThatOpenMenus.has(action);

             if (!isMenuOpeningAction) {
                document.querySelectorAll('.actions-menu.show, #actionsPopup-modal.modal-bg.is-bottom-sheet.show').forEach(el => {
                    if(el.id === 'actionsPopup-modal'){
                        closeModalImmediate(el);
                    } else if (el.parentNode) {
                        el.remove();
                    }
                });
             }

             if (isMenuOpeningAction) {
                requestAnimationFrame(() => {
                    emit(eventName, ...args);
                });
             } else {
                 emit(eventName, ...args);
             }
             return;
        }
        const isAttachmentOverlayBg = actionTarget.matches('.attachment-manager-overlay');
        const isOverlayButton = actionTarget.matches('.attachment-manager-overlay button[data-action]');
        if (isAttachmentOverlayBg && !isOverlayButton) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
        }

    }, true);
}