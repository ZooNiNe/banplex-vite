// PERUBAHAN: Impor getUnreadCommentCount dan appState
import { getUnreadCommentCount } from "../utils/helpers.js";
import { appState } from "../state/appState.js";
import { masterDataConfig } from "../config/constants.js";
import { isViewer, getLocalDayBounds, parseLocalDate } from "../utils/helpers.js";
import { getRecycleBinHeaderOverflowActions } from "./pages/recycleBin.js";
import { attachMenuActionListeners, attachBottomSheetActionListeners } from "./eventListeners/dynamicElementListeners.js";
import { createModal, closeModalImmediate } from "./components/modal.js";
import { fmtIDR } from "../utils/formatters.js";

function createIcon(iconName, size = 20, classes = '') {
    const icons = {
        more_vert: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-more-vertical ${classes}"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>`,
        close: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x ${classes}"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
        arrow_back: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left ${classes}"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>`,
        chevron_right: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right ${classes}"><path d="m9 18 6-6-6-6"/></svg>`,
        visibility: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye ${classes}"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
        info: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info ${classes}"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
        edit: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pencil ${classes}"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
        delete: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2 ${classes}"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
        trash: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2 ${classes}"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
        payments: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-credit-card ${classes}"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
        history: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-history ${classes}"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>`,
        forum: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-square ${classes}"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
        attachment: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-paperclip ${classes}"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
        search: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search ${classes}"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
        copy: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy ${classes}"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
        reply: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-corner-down-left ${classes}"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>`,
        'check-square': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-square ${classes}"><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
        list: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-list ${classes}"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>`,
        receipt_long: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-receipt-text ${classes}"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1Z"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/></svg>`,
        checklist: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-list-checks ${classes}"><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg>`,
        filter_list: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-filter ${classes}"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
        sort: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-up-down ${classes}"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg>`,
        restore_from_trash: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-rotate-ccw ${classes}"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>`,
        delete_forever: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2 ${classes}"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
        input: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-log-in ${classes}"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/></svg>`,
        output: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-log-out ${classes}"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`,
        add_shopping_cart: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shopping-cart ${classes}"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>`,
        check_circle_green: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle-2 ${classes}" style="color: var(--success);"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
        cancel_red: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-circle ${classes}" style="color: var(--danger);"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`,
        manage_accounts: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-cog ${classes}"><circle cx="18" cy="15" r="3"/><circle cx="9" cy="7" r="4"/><path d="M10 15H6a4 4 0 0 0-4 4v2"/><path d="m21.7 16.4-.9-.3"/><path d="m15.2 13.9-.9-.3"/><path d="m16.6 18.7.3-.9"/><path d="m13.7 15.2.3-.9"/><path d="m19.5 17.3.9.3"/><path d="m12.3 14.8.9.3"/><path d="m17.3 12.5-.3.9"/><path d="m14.8 19.7-.3.9"/></svg>`,
        settings: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings ${classes}"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2l-.15.1a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l-.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1 0 2l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
        coins: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-coins ${classes}"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82-.71-.71A6 6 0 0 1 16.71 13.88Z"/></svg>`,
    };
    return icons[iconName] || '';
}

export function getHeaderOverflowActions() {
    const page = appState.activePage;
    let actions = [];
    try {
        if (typeof document !== 'undefined' && document.body.classList.contains('comments-view-active')) {
            actions = [
                { icon: 'checklist', label: 'Pilih Banyak', action: 'activate-selection-mode', pageContext: 'Komentar' }
            ];
            return actions;
        }
    } catch (_) {}
    if (page === 'tagihan') {
        actions = [
            { icon: 'checklist', label: 'Pilih Banyak', action: 'activate-selection-mode', pageContext: 'tagihan' },
            { icon: 'filter_list', label: 'Filter', action: 'open-filter-modal' },
            { icon: 'sort', label: 'Urutkan', action: 'open-sort-modal' }
        ];
    } else if (page === 'recycle_bin') {
        actions = getRecycleBinHeaderOverflowActions();
    } else if (page === 'pemasukan') {
         actions = [
            { icon: 'checklist', label: 'Pilih Banyak', action: 'activate-selection-mode', pageContext: 'pemasukan' },
            { icon: 'sort', label: 'Urutkan', action: 'open-sort-modal-pemasukan' }
         ];
    } else if (page === 'stok') {
         const activeTab = appState.activeSubPage.get('stok') || 'daftar';
        if (activeTab === 'daftar') {
            actions.push({ icon: 'add_shopping_cart', label: 'Tambah Master Material', action: 'manage-master', type: 'materials' });
            actions.push({ icon: 'sort', label: 'Urutkan', action: 'open-stock-sort-modal' });
        }
    } else if (page === 'Komentar') {
        actions = [
            { icon: 'checklist', label: 'Pilih Banyak', action: 'activate-selection-mode', pageContext: 'Komentar' }
        ];
    }
    return actions;
}

export function getItemActions(context) {
    if (!context || !context.itemId) {
        return [];
    }
    const { itemId, type, table, expenseId: contextExpenseId } = context;
    let baseActions = [];

    let page = context.pageContext || appState.activePage;
    const detailPane = document.getElementById('detail-pane');
    const isDetailPaneOpen = detailPane && (detailPane.classList.contains('detail-pane-open') || document.body.classList.contains('detail-view-active'));
    const paneType = detailPane?.dataset?.paneType || '';
    const isInDetailPane = context.target?.closest('#detail-pane') !== null;


    if (isDetailPaneOpen) {
        if (paneType === 'user-management') page = 'manajemen_user';
        else if (paneType.startsWith('master-data-')) page = 'master';
        else if (paneType === 'recycleBin') page = 'recycleBin';
        else if (page === 'master_data') {
            page = 'master';
        }
    } else if (appState.activePage === 'recycle_bin') {
        page = 'recycleBin';
    } else if (appState.activePage === 'pengaturan') {
        if (table === 'members') page = 'manajemen_user';
        else if (Object.values(masterDataConfig).some(cfg => cfg.dbTable === table)) page = 'master';
    } else if (page === 'master_data') {
        page = 'master';
    }

     if (page === 'tagihan') {
        const isExpense = type === 'expense';
        const isBill = type === 'bill';
        const item = isBill
            ? appState.bills.find(b => b.id === itemId)
            : appState.expenses.find(e => e.id === itemId);

        const effectiveExpenseId = isBill ? item?.expenseId : contextExpenseId || itemId;
        const expenseRelated = effectiveExpenseId ? appState.expenses.find(e => e.id === effectiveExpenseId) : null;
        const isMaterialRelated = expenseRelated?.type === 'material';

        if (isExpense && item?.status === 'delivery_order') {
            baseActions = [
                { label: 'Lihat Rincian Barang', action: 'view-invoice-items', icon: 'list' },
                { label: 'Jadikan Tagihan', action: 'convert-surat-jalan', icon: 'receipt_long' },
            ];
             if (!isViewer()) {
                baseActions.push({ label: 'Edit Surat Jalan', action: 'edit-surat-jalan', icon: 'edit' });
                baseActions.push({ label: 'Hapus', action: 'delete-item', icon: 'delete', type: 'expense', isDanger: true });
             }
             if (item && ((Array.isArray(item.attachments) && item.attachments.length > 0) || item.attachmentUrl)) {
                 baseActions.push({ label: `Lampiran (${(item.attachments?.length || (item.attachmentUrl ? 1 : 0))})`, action: 'open-attachments', icon: 'attachment' });
             }
            } else if (isBill && item) {
                if (item.type === 'gaji') {
                    baseActions.push({ label: 'Lihat Detail', action: 'open-bill-detail', icon: 'visibility' });
                    
                    if (!isViewer()) {
                        baseActions.push({ label: 'Kelola Pembayaran', action: 'open-salary-payment-panel', icon: 'coins' });
                    }
                    
                    baseActions.push({ label: 'Riwayat Pembayaran', action: 'open-payment-history-modal', icon: 'history' });
                    
                    // PERUBAHAN: Logika Komentar Gaji
                    const parentId = (item.type === 'gaji') ? itemId : item.expenseId;
                    const parentType = (item.type === 'gaji') ? 'bill' : 'expense';
                    if (parentId) {
                        const allComments = appState.comments || [];
                        const unreadCount = getUnreadCommentCount(parentId, allComments.filter(c => c.parentType === parentType && c.parentId === parentId));
                        baseActions.push({ label: 'Komentar', action: 'open-comments-view', icon: 'forum', parentId: parentId, parentType: parentType, unreadCount });
                    }
                    // ---
                    
                    if (!isViewer()) {
                        baseActions.push({ label: 'Hapus', action: 'delete-item', icon: 'delete', type: 'bill', isDanger: true });
                    }
                } else {
                    baseActions.push({ label: 'Lihat Detail', action: 'open-bill-detail', icon: 'visibility' });
                    if ((item.status || 'unpaid') !== 'paid' && !isViewer()) {
                        baseActions.push({ label: 'Bayar Tagihan', action: 'pay-bill', icon: 'payments' });
                    }
                    if (item.paidAmount > 0) {
                        baseActions.push({ label: 'Riwayat Pembayaran', action: 'open-payment-history-modal', icon: 'history' });
                    }
            
            // PERUBAHAN: Logika Komentar Tagihan/Expense
            const parentId = (item.type === 'gaji') ? itemId : item.expenseId;
            const parentType = (item.type === 'gaji') ? 'bill' : 'expense';
            if (parentId) {
                const allComments = appState.comments || [];
                const unreadCount = getUnreadCommentCount(parentId, allComments.filter(c => c.parentType === parentType && c.parentId === parentId));
                const label = (unreadCount > 0) ? `Komentar (${unreadCount})` : 'Komentar';
                baseActions.push({ label: label, action: 'open-comments-view', icon: 'forum', parentId: parentId, parentType: parentType, unreadCount: unreadCount });
            }
            // ---

            const expForBill = expenseRelated;
            if (expForBill && ((Array.isArray(expForBill.attachments) && expForBill.attachments.length > 0) || expForBill.attachmentUrl)) {
                baseActions.push({ label: `Lampiran (${(expForBill.attachments?.length || (expForBill.attachmentUrl ? 1 : 0))})`, action: 'open-attachments', icon: 'attachment', expenseId: expForBill.id });
            }

            if (isMaterialRelated && ((expForBill && Array.isArray(expForBill.items) && expForBill.items.length > 0) || (item.expenseId))) {
                baseActions.push({ label: 'Detail Faktur Material', action: 'view-invoice-items', icon: 'list', expenseId: item.expenseId || '' });
            }
             if (!isViewer()) {
                baseActions.push({ label: 'Hapus', action: 'delete-item', icon: 'delete', type: 'bill', isDanger: true });
                if (expForBill && ['material', 'operasional', 'lainnya'].includes(expForBill.type)) {
                     baseActions.push({ label: 'Edit', action: 'edit-item', icon: 'edit', type:'bill', itemId: itemId });
                }
             }
        }
    }
    } else if (page === 'pemasukan') {
         const item = (type === 'termin' ? appState.incomes : appState.fundingSources).find(i => i.id === itemId);
         if (item) {
             baseActions.push({ icon: 'info', label: 'Detail', action: 'open-pemasukan-detail' });
             if (!isViewer()) {
                baseActions.push({ icon: 'edit', label: 'Edit', action: 'edit-item' });
                baseActions.push({ icon: 'delete', label: 'Hapus', action: 'delete-item', isDanger: true });
                if (type === 'pinjaman') {
                    if(item.status !== 'paid') baseActions.unshift({ icon: 'payments', label: 'Bayar', action: 'pay-loan' });
                }
             }
             if (type === 'pinjaman') {
                baseActions.push({ icon: 'history', label: 'Riwayat Pembayaran', action: 'open-loan-payment-history' });
                
                // PERUBAHAN: Tambahkan aksi Komentar untuk Pinjaman
                const parentId = itemId;
                const parentType = 'loan';
                const allComments = appState.comments || [];
                const unreadCount = getUnreadCommentCount(parentId, allComments.filter(c => c.parentType === parentType && c.parentId === parentId));
                const label = (unreadCount > 0) ? `Komentar (${unreadCount})` : 'Komentar';
                
                baseActions.push({ 
                    label: label, 
                    action: 'open-comments-view', 
                    icon: 'forum', 
                    parentId: parentId, 
                    parentType: parentType,
                    unreadCount: unreadCount 
                });
                // ---
             }
         }
    } else if (page === 'jurnal') {
        const jurnalTab = appState.activeSubPage.get('jurnal') || 'harian';
        if (jurnalTab === 'harian') {
            baseActions.push({ label: 'Lihat Detail Hari Ini', action: 'view-jurnal-harian', icon: 'visibility', date: context.date });
            if (!isViewer()) {
                baseActions.push({ label: 'Edit Absensi Harian', action: 'handleOpenAttendanceEditor', icon: 'edit', date: context.date });
            }
        } else if (jurnalTab === 'per_pekerja') {
            baseActions.push({ label: 'Lihat Detail Pekerja', action: 'view-worker-recap', icon: 'visibility', workerId: context.workerId });
            
            const totalUnpaid = parseFloat(context.totalUnpaid || '0');
            
            if (totalUnpaid > 0 && !isViewer()) {
                baseActions.push({ 
                    label: `Buat Tagihan Gaji`, // Label generik tanpa nominal
                    action: 'open-generate-worker-bill-confirm', // Aksi BARU untuk membuka modal
                    icon: 'receipt_long',
                    workerId: context.workerId
                });
            }
        } else if (jurnalTab === 'riwayat_rekap') { // Nama tab baru
             baseActions.push({ label: 'Lihat Detail Rekap', action: 'open-bill-detail', icon: 'visibility', type: 'bill' });
             const bill = appState.bills.find(b => b.id === itemId);
             if (bill && bill.status !== 'paid' && !isViewer()) {
                 baseActions.push({ label: 'Hapus Rekap', action: 'delete-salary-bill', icon: 'delete', isDanger: true });
             }
        }
    
    } else if (page === 'recycleBin') {
        baseActions = [
            { icon: 'restore_from_trash', label: 'Pulihkan', action: 'restore-item', table: table },
            { icon: 'delete_forever', label: 'Hapus Permanen', action: 'delete-permanent-item', table: table, isDanger: true }
        ];
    } else if (page === 'master' || page === 'master_data') {
        const itemType = context.type || context.table;
        const itemId = context.itemId || context['item-id'];
        const editorRestricted = (appState.userRole === 'Editor' && (itemType === 'projects' || itemType === 'staff'));
        const configExists = itemType && typeof itemType === 'string' && masterDataConfig.hasOwnProperty(itemType);

        if (configExists) {
            if (!isViewer() && !editorRestricted) {
                baseActions = [
                    { icon: 'edit', label: 'Edit', action: 'edit-master-item', type: itemType, itemId },
                    { icon: 'delete', label: 'Hapus', action: 'delete-master-item', type: itemType, itemId, isDanger: true }
                ];
            } else { 
                 baseActions.push({ icon: 'visibility', label: 'Lihat Detail', action: 'edit-master-item', type: itemType, itemId });
            }
        } else {
             console.warn(`[getItemActions] Konfigurasi master data tidak ditemukan untuk tipe: ${itemType}`);
        }
    
    } else if (page === 'attendance-settings' && type === 'worker-setting') {
        baseActions = [
            { icon: 'edit', label: 'Edit Default Proyek/Peran', action: 'open-worker-defaults-modal' }
        ];
    } else if (page === 'absensi') {
    const activeTab = appState.activeSubPage.get('absensi') || 'manual';

    if (context.workerId && !isViewer()) {
        baseActions.push({ icon: 'edit', label: 'Edit Proyek & Peran', action: 'open-project-role-modal' });
    }

    if (activeTab === 'harian') {
        const attendance = appState.attendanceRecords.find(r => r.id === itemId);
        if (attendance) {
             if (!attendance.isPaid && !isViewer()) {
                baseActions.push({ icon: 'edit', label: 'Edit Waktu/Status', action: 'edit-attendance' });
                baseActions.push({ icon: 'delete', label: 'Hapus Absensi', action: 'delete-attendance', isDanger: true });
            } else {
                baseActions.push({ icon: 'visibility', label: 'Lihat Detail Waktu', action: 'edit-attendance' });
            }
        }
    }
    } else if (page === 'stok') {
        const stokTab = appState.activeSubPage.get('stok') || 'daftar';
        if (stokTab === 'daftar') {
            baseActions = [
                { icon: 'input', label: 'Stok Masuk', action: 'stok-in' },
                { icon: 'output', label: 'Penyaluran Stok (Multi-Proyek)', action: 'open-stock-usage-modal' },
                 !isViewer() ? { icon: 'edit', label: 'Edit Master', action: 'edit-master-item', type: 'materials' } : null,
            ].filter(Boolean);
        } else {
             baseActions = [
                 { icon: 'visibility', label: 'Lihat Item Faktur', action: 'view-invoice-items' },
            ].filter(Boolean);
        }
    } else if (page === 'manajemen_user' ) {
         const user = appState.users.find(u => u.id === itemId);
         if (user && appState.userRole === 'Owner' && user.role !== 'Owner') {
             if (user.status === 'pending') {
                 baseActions = [
                     { action: 'user-action', type: 'approve', icon: 'check_circle_green', label: 'Setujui' },
                     { action: 'user-action', type: 'delete', icon: 'cancel_red', label: 'Tolak/Hapus', isDanger: true }
                 ];
             } else if (user.status === 'active') {
                 const roleAction = user.role === 'Viewer' ? 'make-editor' : 'make-viewer';
                 const roleLabel = user.role === 'Viewer' ? 'Jadikan Editor' : 'Jadikan Viewer';
                 baseActions.push({ action: 'user-action', type: roleAction, icon: 'manage_accounts', label: roleLabel });
                 baseActions.push({ action: 'user-action', type: 'delete', icon: 'delete', label: 'Hapus', isDanger: true });
             }
         }
    } else if (page === 'absensi') {
         const attendance = appState.attendanceRecords.find(r => r.id === itemId || r.id === context.id);
         if (attendance && !attendance.isPaid && !isViewer()) {
             baseActions.push({ icon: 'edit', label: 'Edit Absensi', action: 'edit-attendance' });
             baseActions.push({ icon: 'delete', label: 'Hapus Absensi', action: 'delete-attendance', isDanger: true });
         } else if (attendance) {
             baseActions.push({ icon: 'visibility', label: 'Lihat Detail', action: 'edit-attendance' });
         }
    } else if (page === 'jurnal') {
        if (context.date) {
            baseActions.push({ icon: 'visibility', label: 'Lihat Detail', action: 'view-jurnal-harian', date: context.date });
            baseActions.push({ icon: 'edit', label: 'Edit Absensi', action: 'edit-attendance-day', date: context.date });
        }
    }

    const finalActions = baseActions.map(baseAction => ({
        ...context,
        ...baseAction,
        itemId: itemId
    }));

    return finalActions;
}


function _createDataAttributes(dataObject) {
    return Object.entries(dataObject)
        .filter(([key, value]) =>
            key !== 'target' &&
            value !== undefined &&
            value !== null &&
            key !== 'icon' &&
            key !== 'label' &&
            key !== 'isDanger' &&
            key !== 'action'
            && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
        )
        .map(([key, value]) => `data-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}="${String(value ?? '').replace(/"/g, '&quot;')}"`)
        .join(' ');
}


export function displayActions(actions, targetElement, clickCoords = null) {
    if (!actions || actions.length === 0) return;

    const menuItemsHTML = actions.map(a => {
        const unreadCount = Number(a.unreadCount ?? a['unread-count'] ?? 0);
        const badgeHTML = unreadCount > 0
            ? `<span class="notification-badge">${unreadCount > 99 ? '99+' : unreadCount}</span>`
            : '';
        return `
        <button class="actions-menu-item ${a.isDanger ? 'danger' : ''}" data-action="${a.action}" ${_createDataAttributes(a)}>
            <span class="actions-menu-item-main">
                ${a.icon ? createIcon(a.icon, 20) : ''}
                <span>${a.label}</span>
            </span>
            ${badgeHTML}
        </button>`;
    }).join('');

    document.querySelectorAll('.actions-menu').forEach(m => m.remove());
    const menu = document.createElement('div');
    menu.className = 'actions-menu';
    menu.dataset.originActionTarget = targetElement.dataset.action;
    menu.originElement = targetElement;

    menu.style.position = 'fixed';
    menu.style.zIndex = '2101';
    menu.style.opacity = '0';
    menu.style.display = 'flex';
    menu.style.flexDirection = 'column';
    menu.style.pointerEvents = 'none';
    document.body.appendChild(menu);
    menu.innerHTML = menuItemsHTML;

    const rect = targetElement.getBoundingClientRect();
    let top = clickCoords ? clickCoords.y : rect.bottom + 4;
    let left = clickCoords ? clickCoords.x : rect.left;
    const menuRect = menu.getBoundingClientRect();
    const menuWidth = menuRect.width;
    const menuHeight = menuRect.height;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (clickCoords) {
        if (top + menuHeight > viewportHeight - 8) { top = clickCoords.y - menuHeight - 4; }
        if (left + menuWidth > viewportWidth - 8) { left = clickCoords.x - menuWidth; }
        left = Math.max(8, left); top = Math.max(8, top);
    } else {
        if (top + menuHeight > viewportHeight - 8) { top = rect.top - menuHeight - 4; }
        if (left + menuWidth > viewportWidth - 8) { left = viewportWidth - menuWidth - 8; }
        left = Math.max(8, left); top = Math.max(8, top);
    }
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;

    requestAnimationFrame(() => {
        menu.classList.add('show');
        menu.style.opacity = '';
        menu.style.pointerEvents = 'auto';
    });

    setTimeout(() => {
        attachMenuActionListeners(menu);
    }, 0);

    const closeMenuHandler = (ev) => {
        const clickedActionTarget = ev.target?.closest('[data-action]');
        if ((!menu.contains(ev.target) && ev.target !== targetElement) || (menu.contains(ev.target) && clickedActionTarget && clickedActionTarget.classList.contains('actions-menu-item'))) {
            if (menu.parentNode) {
                menu.classList.remove('show');
                menu.addEventListener('transitionend', () => menu.remove(), { once: true });
                setTimeout(() => { if (menu.parentNode) menu.remove(); }, 200);
            }
            document.removeEventListener('click', closeMenuHandler, true);
            window.closeContextMenu = null;
        }
    };
    window.closeContextMenu = closeMenuHandler;
    setTimeout(() => document.addEventListener('click', closeMenuHandler, true), 50);
}


export function displayBottomSheetActions(actions, context = {}, targetElement) {
    if (!actions || actions.length === 0) return;

    const itemsHTML = actions.map(a => {
        const unreadCount = Number(a.unreadCount ?? a['unread-count'] ?? 0);
        const badgeHTML = unreadCount > 0
            ? `<span class="notification-badge">${unreadCount > 99 ? '99+' : unreadCount}</span>`
            : '';
        return `
        <button class="actions-menu-item ${a.isDanger ? 'danger' : ''}" data-action="${a.action}" ${_createDataAttributes(a)}>
            <span class="actions-menu-item-main">
                ${a.icon ? createIcon(a.icon, 20) : ''}
                <span>${a.label}</span>
            </span>
            ${badgeHTML}
        </button>`;
    }).join('');

    const bottomSheetContent = `<div class="actions-modal-list">${itemsHTML}</div>`;

    const modal = createModal('actionsPopup', {
        title: context.title || context.description || context.name || 'Pilih Aksi',
        content: bottomSheetContent,
        layoutClass: 'is-bottom-sheet'
    });

    if (modal) {
        setTimeout(() => {
            attachBottomSheetActionListeners(modal);
        }, 0);
        const cancelButton = modal.querySelector('[data-role="action-sheet-cancel"]');
        if (cancelButton) {
            cancelButton.addEventListener('click', (event) => {
                event.preventDefault();
                closeModalImmediate(modal);
            }, { once: true });
        }
    }
}

export function resolveActionContext(clickedElement) {
    let actionTarget = null;
    const overlayButton = clickedElement?.closest('.attachment-manager-overlay button[data-action]');
    if (overlayButton) {
        actionTarget = overlayButton;
    } else if (clickedElement?.matches('[data-action]')) {
        actionTarget = clickedElement;
    } else {
        actionTarget = clickedElement?.closest('[data-action]');
    }

    if (!actionTarget) {
        return null;
    }

    const cardWrapper = clickedElement.closest('.wa-card-v2-wrapper');
    const modalContent = clickedElement.closest('.modal-content, .actions-modal-list');
    const detailPane = clickedElement.closest('#detail-pane');
    const actionsMenu = clickedElement.closest('.actions-menu');
    const fabContainer = clickedElement.closest('#fab-container');
    const attachmentItem = clickedElement.closest('.attachment-manager-item');
    const metaBadge = clickedElement.closest('.meta-badge[data-action]');

    const attendanceCardWrapper = clickedElement.closest('.wa-card-v2-wrapper[data-type="worker"]');

    const closestContextElement = attachmentItem || cardWrapper || modalContent || detailPane || actionsMenu || fabContainer || metaBadge || actionTarget || clickedElement || attendanceCardWrapper;

    const combinedDataset = {
        ...(cardWrapper?.dataset || {}),
        ...(closestContextElement?.dataset || {}),
        ...(actionTarget.dataset || {})
    };

    const itemId = combinedDataset.itemId || combinedDataset['item-id'] || combinedDataset.id;
    const finalAction = actionTarget.dataset.action;

    const finalDataset = {
        id: itemId,
        domId: combinedDataset.id || itemId,
        itemId: itemId,
        ...combinedDataset,
        action: finalAction
    };
    delete finalDataset['item-id'];

    const contextResult = {
        ...finalDataset,
        target: actionTarget,
        isMoreAction: actionTarget.classList.contains('card-more-action') || actionTarget.classList.contains('header-overflow-trigger')
    };

    return contextResult;
}
