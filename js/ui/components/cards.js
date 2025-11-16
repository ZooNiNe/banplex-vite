import { appState } from "../../state/appState.js";
import { fmtIDR, formatDate } from "../../utils/formatters.js";
import { getJSDate, getUnreadCommentCount } from "../../utils/helpers.js";
import { on } from "../../state/eventBus.js";
import { buildPendingQuotaBanner } from "./pendingQuotaBanner.js";
import { encodePayloadForDataset } from "../../services/pendingQuotaService.js";

function createIcon(iconName, size = 16, classes = '') {
    const icons = {
        storefront: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-store ${classes}"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2V7"/><path d="M6 12v-3a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v3"/></svg>`,
        label: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-tag ${classes}"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.432 0l6.568-6.568a2.426 2.426 0 0 0 0-3.432l-8.704-8.704Z"/><path d="M6 9h.01"/></svg>`,
        wallet: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-wallet ${classes}"><path d="M21 12V7H5a2 2 0 0 1 0-4h14a2 2 0 0 1 2 2v4Z"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2Z"/></svg>`,
        home: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-home ${classes}"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
        'check-circle-2': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle-2 ${classes}"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
        'x-circle': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-circle ${classes}"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`,
        coins: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-coins ${classes}"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82-.71-.71A6 6 0 0 1 16.71 13.88Z"/></svg>`,
        hard_hat: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-hard-hat-icon lucide-hard-hat"><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M14 6a6 6 0 0 1 6 6v3"/><path d="M4 15v-3a6 6 0 0 1 6-6"/><rect x="2" y="15" width="20" height="4" rx="1"/></svg>`,
        briefcase: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-briefcase ${classes}"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
        badge: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-badge ${classes}"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/></svg>`,
        'more-vertical': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-more-vertical ${classes}"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>`,
        check: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check ${classes}"><path d="M20 6 9 17l-5-5"/></svg>`,
        'calendar-x-2': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar-x-2 ${classes}"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m14.5 14.5-5 5"/><path d="m9.5 14.5 5 5"/></svg>`,
        pencil: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pencil ${classes}"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
        'trash-2': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2 ${classes}"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
        'circle-plus': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-plus ${classes}"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>`,
        info: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info ${classes}"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
        percent: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-percent ${classes}"><line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>`,
        printer: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-printer ${classes}"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>`,
        'sticky-note': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sticky-note ${classes}"><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v6h6"/></svg>`,
        hammer: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-hammer ${classes}"><path d="m15 12-9.373 9.373a1 1 0 0 1-3.001-3L12 9"/><path d="m18 15 4-4"/><path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5"/></svg>`,
        pickaxe: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pickaxe ${classes}"><path d="m14 13-8.381 8.38a1 1 0 0 1-3.001-3L11 9.999"/><path d="M15.973 4.027A13 13 0 0 0 5.902 2.373c-1.398.342-1.092 2.158.277 2.601a19.9 19.9 0 0 1 5.822 3.024"/><path d="M16.001 11.999a19.9 19.9 0 0 1 3.024 5.824c.444 1.369 2.26 1.676 2.603.278A13 13 0 0 0 20 8.069"/><path d="M18.352 3.352a1.205 1.205 0 0 0-1.704 0l-5.296 5.296a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l5.296-5.296a1.205 1.205 0 0 0 0-1.704z"/></svg>`,
    };
    return icons[iconName] || '';
}


export function createUnifiedCard({
    id,
    title = '',
    headerMeta = '',
    metaBadges = [],
    mainContentHTML = '',
    amount = '',
    amountLabel = '',
    amountColorClass = '',
    dataset = {},
    customClasses = '',
    actions = [],
    moreAction = true,
    selectionEnabled = false,
    isSelected = false,
    unreadCount = 0,
    cardAction = ''
}) {

    const allDataAttributes = Object.entries(dataset)
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

    const itemId = dataset.itemId || dataset['item-id'] || dataset.id || id;
    const itemType = dataset.type || '';
    const pageContext = dataset.pageContext || appState.activePage; 
    const expenseId = dataset.expenseId || dataset['expense-id'] || (itemType === 'expense' ? itemId : null);

    let localMetaBadges = [...metaBadges];

    if ((itemType === 'bill' || itemType === 'expense') && expenseId) {
        const expense = appState.expenses?.find(e => e.id === expenseId);
        if (expense?.supplierId) {
            const supplier = appState.suppliers?.find(s => s.id === expense.supplierId);
            if (supplier && !localMetaBadges.some(b => b.text === supplier.supplierName)) {
                localMetaBadges.unshift({ icon: 'storefront', text: supplier.supplierName });
            }
        }
    }

    if (itemType === 'user' && dataset.role && !localMetaBadges.some(b => b.text === dataset.role)) {
         localMetaBadges.push({ icon: 'badge', text: dataset.role });
    }
    if (dataset.table === 'members' && dataset.role && !localMetaBadges.some(b => b.text === dataset.role)) {
         localMetaBadges.push({ text: dataset.role, icon: 'badge' });
    }

    let badgesHTML = '';
    badgesHTML = localMetaBadges.length > 0 ?
    localMetaBadges.map(badge => {
        if (!badge || !badge.text) return '';
        const tooltipAttr = badge.tooltip ? `data-tooltip="${badge.tooltip}"` : '';
        return `
            <div class="meta-badge" ${tooltipAttr}>
                ${badge.icon ? createIcon(badge.icon) : ''}
                <span>${badge.text}</span>
            </div>
        `;
    }).join('')
: '';

    const mainBodyContent = mainContentHTML || badgesHTML ? `
        <div class="wa-card-v2__body">
            ${mainContentHTML || badgesHTML}
        </div>
    ` : '';


    const amountLabelHTML = amountLabel ?
        `<span class="wa-card-v2__amount-label">${amountLabel}</span>` :
        '';

    const modifierAmountColor = amountColorClass ? `wa-card-v2__amount--${amountColorClass}` : '';

    let actionsDisplayHTML = '';
    
    const badgeHTML = (unreadCount > 0)
        ? `<span class="notification-badge">${unreadCount > 9 ? '9+' : unreadCount}</span>`
        : '';

    if (moreAction) {
        let actionName = 'open-item-actions-modal'; // Aksi default

        if (pageContext === 'stok') {
            if (itemType === 'materials') {
                actionName = 'open-stock-usage-modal';
            } else if (itemType === 'expense') {
                actionName = 'view-invoice-items';
            }
        } else if (pageContext === 'absensi' && itemType === 'worker') {
            actionName = 'open-project-role-editor';
        } else if (pageContext === 'attendance-settings' && itemType === 'worker-setting') {
            actionName = 'open-worker-defaults-modal';
        } 
        
        actionsDisplayHTML = `
            <div class="wa-card-v2__actions">
                <button class="btn-icon card-more-action" data-action="${actionName}" title="Opsi Lainnya" data-item-id="${itemId}" data-unread-count="${unreadCount}" ${allDataAttributes}>
                    ${createIcon('more-vertical', 20)}
                    ${badgeHTML} 
                </button>
            </div>`;
    }
    const selectionCheckmarkHTML = selectionEnabled ? `
        <div class="selection-checkmark ${isSelected ? 'checked' : ''}" data-action="toggle-selection" data-item-id="${itemId}">
            ${createIcon('check', 18)}
        </div>` : '';

    const isJournalCard = pageContext === 'jurnal';
    const headerClasses = ['wa-card-v2__header'];
    if (isJournalCard) headerClasses.push('wa-card-v2__header--stacked');
    const headerMetaHTML = headerMeta
        ? `<span class="wa-card-v2__header-meta${isJournalCard ? ' meta-below-title' : ''}">${headerMeta}</span>`
        : '';
    const headerMetaAfterTitle = isJournalCard ? headerMetaHTML : '';
    const headerMetaInline = isJournalCard ? '' : headerMetaHTML;

    const cardActionAttr = cardAction ? `data-action="${cardAction}"` : '';

    return `
        <div class="wa-card-v2-wrapper ${customClasses} ${isSelected ? 'selected' : ''}" data-id="${id}" data-item-id="${itemId}" ${allDataAttributes}>
            ${selectionCheckmarkHTML} ${''}
            <div class="wa-card-v2" ${cardActionAttr}>
                <div class="wa-card-v2__main">
                    <div class="${headerClasses.join(' ')}">
                        <span class="wa-card-v2__title">${title}</span>
                        ${headerMetaInline}
                    </div>
                    ${headerMetaAfterTitle}
                    ${mainBodyContent}
                </div>
                <div class="wa-card-v2__meta">
                    <span class="wa-card-v2__amount ${modifierAmountColor}">${amount}</span>
                    ${amountLabelHTML}
                </div>
                ${actionsDisplayHTML} ${''}
            </div>
        </div>
    `;
}

export function createGenericCard(contentHTML, customClasses = '') {
    return `
        <div class="card card-pad ${customClasses}">
            ${contentHTML}
        </div>
    `;
}

export function _getMasterDataListHTML(type, items, config, options = {}) {
    if (!config || !Array.isArray(items)) return '<p>Konfigurasi atau data tidak valid.</p>';
    const selectionActive = appState.selectionMode.active && (appState.selectionMode.pageContext === 'master' || appState.selectionMode.pageContext === type);
    const sortedItems = items
        .filter(item => !item.isDeleted)
        .sort((a, b) => getJSDate(b.updatedAt || b.createdAt) - getJSDate(a.updatedAt || a.createdAt));

    const pendingMap = options.pendingMap || new Map();

    return sortedItems.map(item => {
        const itemId = item.id;
        const isSelected = selectionActive && appState.selectionMode.selectedIds.has(itemId);
        const title = item[config.nameField];
        let badges = [];
        let mainContent = `<div class="wa-card-v2__description">${item.notes || 'Tidak ada catatan'}</div>`;

        if (type === 'suppliers') {
            badges.push({ text: item.category, icon: 'label' });
            mainContent = `<div class="wa-card-v2__description">Kategori: ${item.category || '-'}</div>`;
        }
        if (type === 'projects') {
             const typeText = item.projectType === 'main_income' ? 'Utama' : 'Internal';
             badges.push({ text: typeText, icon: item.projectType === 'main_income' ? 'wallet' : 'home' });
             mainContent = `<div class="wa-card-v2__description">Tipe: ${typeText} | Anggaran: ${item.budget ? fmtIDR(item.budget) : 'N/A'}</div>`;
        }
        if (type === 'workers') {
            badges.push({ text: item.status || 'Aktif', icon: item.status === 'active' ? 'check-circle-2' : 'x-circle' });
             const profession = appState.professions?.find(p => p.id === item.professionId)?.professionName || 'Profesi?';
            mainContent = `<div class="wa-card-v2__description">Profesi: ${profession} | Status: ${item.status || 'Aktif'}</div>`;
        }
        if (type === 'staff') {
             let paymentText = 'Tipe pembayaran?';
             if (item.paymentType === 'fixed_monthly') paymentText = `Gaji Bulanan: ${fmtIDR(item.salary)}`;
             else if (item.paymentType === 'per_termin') paymentText = `Fee per Termin: ${item.feePercentage}%`;
             else if (item.paymentType === 'fixed_per_termin') paymentText = `Fee Tetap: ${fmtIDR(item.feeAmount)}`;
             badges.push({ text: paymentText.split(':')[0], icon:'coins'});
             mainContent = `<div class="wa-card-v2__description">${paymentText}</div>`;
        }

        const dataset = { 
            'item-id': itemId, 
            type: type, 
            table: config.dbTable || type,
            pageContext: 'master_data', // <-- Ini sudah benar untuk actionMenuUtils
            title: title
        };

        const pendingLog = pendingMap.get(itemId);
        const warningHTML = pendingLog ? buildPendingQuotaBanner(pendingLog) : '';

        const cardHTML = createUnifiedCard({
            id: `master-${itemId}`,
            title: title,
            headerMeta: '',
            metaBadges: badges,
            mainContentHTML: mainContent,
            dataset: dataset, 
            moreAction: true, // <-- Ini sudah benar, memicu menu "..."
            actions: [], // <-- Ini sudah benar, membiarkan actionMenuUtils.js mengisi menu
            selectionEnabled: selectionActive,
            isSelected: isSelected
        });

        return `${warningHTML}${cardHTML}`;
    }).join('');
}

export function _getUserManagementListHTML(items) {
    if (!Array.isArray(items)) return '';
    const selectionActive = false;

    return items.map(user => {
        const itemId = user.id;
        const isSelected = false;
        const title = user.name;
        const statusText = user.status === 'pending' ? 'Pending' : 'Aktif';
        const headerMeta = `<span class="user-badge status-${user.status}">${statusText}</span>`;
        const mainContent = `<div class="wa-card-v2__description">${user.email}</div>`;
        const badges = [{ text: user.role, icon: 'badge' }];

        const dataset = { 'item-id': itemId, type: 'user', table: 'members', role: user.role, status: user.status, name: user.name };

        const showMore = appState.userRole === 'Owner' && user.role !== 'Owner';

        return createUnifiedCard({
            id: `user-${itemId}`,
            title: title,
            headerMeta: headerMeta,
            metaBadges: badges,
            mainContentHTML: mainContent,
            dataset: dataset,
            moreAction: showMore,
            actions: [],
            selectionEnabled: selectionActive,
            isSelected: isSelected
        });
    }).join('');
}


export async function _createBillDetailContentHTML(bill, expenseData) {
        const total = bill?.amount || expenseData?.amount || 0;
        const paid = bill?.paidAmount || 0;
        const remaining = Math.max(0, total - paid);
        const status = bill?.status || expenseData?.status || 'unpaid';
    
        const project = appState.projects?.find(p => p.id === (expenseData?.projectId || bill?.projectId));
        const supplier = appState.suppliers?.find(s => s.id === expenseData?.supplierId);
        let category = null;
        let categoryTypeText = '';
    
        if(expenseData?.type === 'material') {
            categoryTypeText = 'Material';
        } else if (expenseData?.type === 'operasional') {
            categoryTypeText = 'Operasional';
            category = appState.operationalCategories?.find(c => c.id === expenseData?.categoryId);
        } else if (expenseData?.type === 'lainnya') {
            categoryTypeText = 'Lainnya';
            category = appState.otherCategories?.find(c => c.id === expenseData?.categoryId);
        } else if (bill?.type === 'gaji') {
             categoryTypeText = 'Gaji';
        } else if (bill?.type === 'fee') {
             categoryTypeText = 'Fee Staf';
        }
    
        const createdDate = getJSDate(bill?.createdAt || expenseData?.createdAt);
        const createdBy = bill?.createdByName || expenseData?.createdByName || 'Sistem';
    
        const categoryValue = category?.categoryName || categoryTypeText || 'Tidak Ada';
    
        let recipientLabel = 'Supplier/Penerima';
        let recipientValue = supplier?.supplierName || 'Tidak Diketahui';
    
        if (bill?.type === 'gaji') {
            recipientLabel = 'Pekerja';
            const workerName = bill.workerDetails && bill.workerDetails.length === 1 ? bill.workerDetails[0].name : (bill.workerDetails ? `${bill.workerDetails.length} Pekerja` : '');
            recipientValue = workerName || 'Tidak Diketahui';
        } else if (bill?.type === 'fee') {
            recipientLabel = 'Staf';
            const staff = appState.staff?.find(s => s.id === bill.staffId);
            recipientValue = staff?.staffName || 'Tidak Diketahui';
        }
    
        const summaryHTML = `<div class="detail-summary-grid"><div class="summary-item"><span class="label">Total Tagihan</span><strong class="value">${fmtIDR(total)}</strong></div><div class="summary-item"><span class="label">Sudah Dibayar</span><strong class="value positive">${fmtIDR(paid)}</strong></div><div class="summary-item"><span class="label">Sisa Tagihan</span><strong class="value ${remaining > 0 ? 'negative' : ''}">${fmtIDR(remaining)}</strong></div><div class="summary-item"><span class="label">Status</span><strong class="value"><span class="status-badge status-badge--${status === 'paid' ? 'positive' : (status === 'delivery_order' ? 'info' : 'warn')}">${status === 'paid' ? 'Lunas' : (status === 'delivery_order' ? 'Surat Jalan' : 'Belum Lunas')}</span></strong></div></div>`;
    
        const details = [
            { label: recipientLabel, value: recipientValue },
            { label: 'Jenis', value: categoryValue },
            { label: 'Tanggal Tagihan', value: formatDate(bill?.dueDate || expenseData?.date) },
            { label: 'Dibuat Pada', value: createdDate.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' }) },
            { label: 'Dibuat Oleh', value: createdBy },
        ];
    
        const detailsHTML = `<h5 class="detail-section-title">Informasi Tagihan</h5><dl class="detail-list">${details.map(d => `<div><dt>${d.label}</dt><dd>${d.value}</dd></div>`).join('')}</dl>`;
    
        const notes = bill?.notes || expenseData?.notes;
        const notesHTML = notes ? `<div class="card card-pad notes-card"><h5 class="detail-section-title notes-title">${createIcon('sticky-note', 16)} <span>Catatan</span></h5><p class="notes-text">${notes}</p></div>` : '';
    
        return `<div class="card card-pad">${summaryHTML}<div class="detail-section">${detailsHTML}</div></div>${notesHTML}`;
    }

export function _createSalaryBillDetailContentHTML(bill, payments) {
    const total = bill?.amount || 0;
    const paid = bill?.paidAmount || 0;
    const remaining = Math.max(0, total - paid);
    const status = bill?.status || 'unpaid';
    const createdDate = getJSDate(bill?.createdAt);
    const createdBy = bill?.createdByName || 'Sistem';

    const summaryHTML = `
        <div class="detail-summary-grid">
            <div class="summary-item">
                <span class="label">Total Gaji</span>
                <strong class="value">${fmtIDR(total)}</strong>
            </div>
             <div class="summary-item">
                <span class="label">Sisa Tagihan</span>
                <strong class="value ${remaining > 0 ? 'negative' : ''}">${fmtIDR(remaining)}</strong>
            </div>
            <div class="summary-item">
                <span class="label">Status</span>
                <strong class="value"><span class="status-badge status-badge--${status === 'paid' ? 'positive' : 'warn'}">${status === 'paid' ? 'Lunas' : 'Belum Lunas'}</span></strong>
            </div>
        </div>`;

    const detailsHTML = `
         <dl class="detail-list">
            <div><dt>Dibuat Pada</dt><dd>${createdDate.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}</dd></div>
            <div><dt>Dibuat Oleh</dt><dd>${createdBy}</dd></div>
        </dl>
    `;

    const workersHTML = `
        <h5 class="detail-section-title">Rincian Gaji Pekerja</h5>
        <div class="detail-list-container">
            ${(bill.workerDetails || []).map(w => {
                const workerId = w.id || w.workerId;
                
                const totalPaidForWorker = (payments || [])
                    .filter(p => p.workerId === workerId)
                    .reduce((sum, p) => sum + (p.amount || 0), 0);
                const remainingForWorker = Math.max(0, (w.amount || 0) - totalPaidForWorker);
                const isWorkerPaid = remainingForWorker === 0;

                const statusBadge = isWorkerPaid
                    ? `<span class="status-badge status-badge--positive">Lunas</span>`
                    : `<span class="status-badge status-badge--warn">Belum Lunas</span>`;

                return `
                    <div class="detail-list-item-card" style="display: flex; justify-content: space-between; align-items: center; gap: 0.75rem;">
                        <div class="item-main" style="flex: 1; min-width: 0;">
                            <strong class="item-title" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${w.name || 'Pekerja Dihapus'}</strong>
                        </div>
                        <div class="item-secondary" style="flex-shrink: 0; display: flex; align-items: center; gap: 0.75rem;">
                            ${statusBadge}
                            <strong class="item-amount">${fmtIDR(w.amount)}</strong>
                        </div>
                    </div>`;
            }).join('')}
        </div>
    </div>
    `;

    const notes = bill?.notes;
    const notesHTML = notes ? `
        <div class="card card-pad" style="margin-top: 1rem;">
            <h5 class="detail-section-title" style="margin-top: 0;">${createIcon('sticky-note', 16)} Catatan</h5>
            <p style="white-space: pre-wrap; line-height: 1.6; color: var(--text-dim);">${notes}</p>
        </div>
    ` : '';

    return `<div class="card card-pad">${summaryHTML}<div class="detail-section">${detailsHTML}</div></div><div class="card card-pad" style="margin-top:1rem;">${workersHTML}</div>${notesHTML}`;
}

export function _createDetailContentHTML(item, type) {
    let details = [];
    if (type === 'termin') {
        const project = appState.projects?.find(p => p.id === item.projectId);
        details = [
            { label: 'Jumlah', value: fmtIDR(item.amount) },
            { label: 'Tanggal', value: getJSDate(item.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) },
            { label: 'Proyek', value: project?.projectName || 'Tidak Diketahui' }
        ];
    } else if (type === 'pinjaman') {
        const creditor = appState.fundingCreditors?.find(c => c.id === item.creditorId);
        const total = item.totalRepaymentAmount || item.totalAmount || 0;
        const paid = item.paidAmount || 0;
        const remaining = Math.max(0, total - paid);
        details = [
            { label: 'Kreditur', value: creditor?.creditorName || 'Tidak Diketahui' },
            { label: 'Total Pinjaman', value: fmtIDR(item.totalAmount || 0) },
            ...(item.interestType === 'interest' ? [
                 { label: 'Bunga', value: `${item.rate || 0}% selama ${item.tenor || 0} bln` },
                 { label: 'Total Pengembalian', value: fmtIDR(item.totalRepaymentAmount || 0) },
            ] : []),
            { label: 'Sudah Dibayar', value: fmtIDR(paid) },
            { label: 'Sisa Tagihan', value: fmtIDR(remaining) },
            { label: 'Tanggal', value: getJSDate(item.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) },
            { label: 'Status', value: `<span class="status-badge status-badge--${item.status === 'paid' ? 'positive' : 'warn'}">${item.status === 'paid' ? 'Lunas' : 'Belum Lunas'}</span>` },
        ];
    } else {
        return '<div class="card card-pad"><p>Detail tidak tersedia.</p></div>';
    }

    const detailsHTML = `<dl class="detail-list">${details.map(d => `<div><dt>${d.label}</dt><dd>${d.value}</dd></div>`).join('')}</dl>`;

    const notes = item?.notes;
    const notesHTML = notes ? `
        <div class="card card-pad" style="margin-top: 1rem;">
            <h5 class="detail-section-title" style="margin-top: 0;">${createIcon('sticky-note', 16)} Catatan</h5>
            <p style="white-space: pre-wrap; line-height: 1.6; color: var(--text-dim);">${notes}</p>
        </div>
    ` : '';

    return `<div class="card card-pad">${detailsHTML}</div>${notesHTML}`;
}


export function _getBillsListHTML(items, options = {}) {
    if (!Array.isArray(items)) return '';

    const pendingBills = options.pendingBills || new Map();
    const pendingExpenses = options.pendingExpenses || new Map();

    const allComments = appState.comments || [];

    return items.map(item => {
        const isBill = 'dueDate' in item && item.status !== 'delivery_order';
        const isDeliveryOrder = item.status === 'delivery_order';
        let expenseData = null;
        let localMetaBadges = [];

        if (isBill) {
            expenseData = appState.expenses?.find(e => e.id === item.expenseId);
        } else if (isDeliveryOrder) {
            expenseData = item;
        }

        if (expenseData) {
            const sup = appState.suppliers?.find(s => s.id === expenseData.supplierId);
            if (sup) {
                localMetaBadges.push({ icon: 'storefront', text: sup.supplierName });
            }
        }
        else if (item.type === 'gaji' && isBill) {
            const workerName = item.workerDetails && item.workerDetails.length === 1 
                ? item.workerDetails[0].name 
                : (item.workerDetails ? `${item.workerDetails.length} Pekerja` : '');
            
            if (workerName) {
                 localMetaBadges.push({ icon: 'hard_hat', text: workerName });
            } else if (item.workerId) {
                const worker = appState.workers.find(w => w.id === item.workerId);
                if (worker) {
                    localMetaBadges.push({ icon: 'hard_hat', text: worker.workerName });
                }
            }
        } else if (expenseData) {
            const sup = appState.suppliers?.find(s => s.id === expenseData.supplierId);
            if (sup) {
                localMetaBadges.push({ icon: 'storefront', text: sup.supplierName });
            }
        }
        let title = item.description;
        
        if (item.type === 'gaji' && isBill) {
            try {
                const formatRingkas = (d) => {
                    if (!d) return '??/??';
                    const date = getJSDate(d);
                    const day = String(date.getDate()).padStart(2, '0');
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    return `${day}/${month}`;
                };
                
                if (item.startDate && item.endDate) {
                    const start = formatRingkas(item.startDate);
                    const end = formatRingkas(item.endDate);
                    title = `Gaji (${start} - ${end})`; 
                } else if (item.description) {
                    title = item.description.replace('Tagihan Gaji - ', 'Gaji: ');
                } else {
                    title = 'Tagihan Gaji';
                }
            } catch (e) {
                title = item.description ? item.description.replace('Tagihan Gaji - ', 'Gaji: ') : 'Tagihan Gaji';
            }
        }
        const parentId = (isBill && item.type === 'gaji') ? item.id : (expenseData?.id || (isBill ? item.expenseId : null));
        const parentType = (isBill && item.type === 'gaji') ? 'bill' : 'expense';
        const unreadCount = (parentId && parentType) ? getUnreadCommentCount(parentId, allComments.filter(c => c.parentType === parentType && c.parentId === parentId)) : 0;
        const isPaid = item.status === 'paid';
        const displayAmount = isDeliveryOrder ? '-' : (isPaid ? (item.amount || 0) : Math.max(0, (item.amount || 0) - (item.paidAmount || 0)));
        const amountLabelText = isDeliveryOrder ? 'Surat Jalan' : (isPaid ? 'Lunas' : (isBill && item.paidAmount > 0 ? 'Sisa Tagihan' : ''));
        const amountColor = isDeliveryOrder ? '' : (isPaid ? 'positive' : (displayAmount > 0 ? 'warn' : ''));

        const tooltipText = `${item.description} | Supplier: ${expenseData?.supplierId ? (appState.suppliers?.find(s=>s.id === expenseData.supplierId)?.supplierName || '-') : '-'} | Total: ${fmtIDR(item.amount || 0)}`;

        const uniqueDomId = isDeliveryOrder ? `expense-${item.id}` : `bill-${item.id}`;
        const itemIdForDataset = item.id;

        const dataset = {
            'item-id': itemIdForDataset,
            type: isDeliveryOrder ? 'expense' : 'bill',
            'expense-id': expenseData?.id || '',
            amount: item.amount,
            tooltip: tooltipText.replace(/"/g, '&quot;'),
            title: title,
            description: title,
            'parent-id': parentId || '',
            'parent-type': parentType || ''
        };

        const selectionActive = appState.selectionMode.active && appState.selectionMode.pageContext === 'tagihan';
        const isSelected = selectionActive && appState.selectionMode.selectedIds.has(itemIdForDataset);

        const showMoreIcon = true;

        const pendingLog = isBill ? pendingBills.get(item.id) : pendingExpenses.get(item.id);
        const warningHTML = pendingLog ? buildPendingQuotaBanner(pendingLog) : '';

        const cardHTML = createUnifiedCard({
            id: uniqueDomId,
            title: title,
            headerMeta: formatDate(item.dueDate || item.date),
            metaBadges: localMetaBadges,
            amount: displayAmount === '-' ? '-' : fmtIDR(displayAmount),
            amountLabel: amountLabelText,
            amountColorClass: amountColor,
            dataset: dataset,
            moreAction: showMoreIcon,
            actions: [],
            selectionEnabled: selectionActive,
            isSelected: isSelected,
            unreadCount: unreadCount
        });

        return `${warningHTML}${cardHTML}`;
    }).join('');
}

export function _getSinglePemasukanHTML(item, type, options = {}) {
    if (!item) return '';
    const allComments = appState.comments || [];
    const isTermin = type === 'termin';
    let localMetaBadges = [];
    let title = ''; 
    let project = null;
    let creditor = null;
    const principalAmount = Number(item.totalAmount ?? item.amount ?? 0);
    const totalPayable = isTermin
        ? Number(item.amount ?? 0)
        : Number(item.totalRepaymentAmount ?? principalAmount);
    const displayAmount = Number.isFinite(totalPayable) ? totalPayable : 0;
    const interestPortion = !isTermin
        ? Math.max(0, totalPayable - principalAmount)
        : 0;
    const interestBreakdownHTML = (!isTermin && item.interestType === 'interest' && interestPortion > 0)
        ? `<div class="wa-card-v2__description sub">Termasuk bunga ${fmtIDR(interestPortion)}</div>`
        : '';

    if (isTermin) {
        project = appState.projects?.find(p => p.id === item.projectId);
        title = project?.projectName || 'Proyek Tidak Diketahui'; 
        
    } else { 
        creditor = appState.fundingCreditors?.find(c => c.id === item.creditorId);
        title = creditor?.creditorName || 'Kreditur Tidak Diketahui'; 
        
        const loanTypeText = item.interestType === 'interest' ? 'Berbunga' : 'Tanpa Bunga';
        localMetaBadges.push({ icon: 'percent', text: loanTypeText });
        if (item.interestType === 'interest' && item.rate && item.tenor) {
             localMetaBadges.push({ icon: 'info', text: `${item.rate}% (${item.tenor} bln)` });
        }
    }
    
    const parentId = item.id;
    const parentType = isTermin ? 'income' : 'loan';
    const isValidCommentType = parentType === 'loan';
    const unreadCount = (isValidCommentType && parentId && parentType) ? getUnreadCommentCount(parentId, allComments.filter(c => c.parentType === parentType && c.parentId === parentId)) : 0;

    const domId = `${type}-${item.id}`;
    const itemIdForDataset = item.id;

    const selectionActive = appState.selectionMode.active && appState.selectionMode.pageContext === 'pemasukan';
    const isSelected = selectionActive && appState.selectionMode.selectedIds.has(itemIdForDataset);

    const showMoreIcon = true;
    const dataset = {
        'item-id': itemIdForDataset,
        type: isTermin ? 'termin' : 'pinjaman',
        amount: displayAmount,
        title: title, 
        description: item.description,
        'parent-id': parentId || '',     // PERUBAHAN: Tambahkan parent-id
        'parent-type': parentType || '' // PERUBAHAN: Tambahkan parent-type
    };

    const pendingLog = options.pendingLog;
    const warningHTML = pendingLog ? buildPendingQuotaBanner(pendingLog) : '';

    const cardHTML = createUnifiedCard({
        id: domId,
        title: title, 
        headerMeta: formatDate(item.date),
        metaBadges: localMetaBadges, 
        amount: fmtIDR(displayAmount),
        amountLabel: !isTermin ? (item.status === 'paid' ? 'Lunas' : 'Belum Lunas') : '',
        amountColorClass: isTermin ? 'positive' : (item.status === 'paid' ? 'positive' : 'warn'),
        dataset: dataset,
        moreAction: showMoreIcon,
        mainContentHTML: interestBreakdownHTML,
        actions: [],
        selectionEnabled: selectionActive,
        isSelected: isSelected,
        unreadCount: unreadCount // PERUBAHAN: Kirim unreadCount
    });

    return `${warningHTML}${cardHTML}`;
}

export function _getJurnalHarianListHTML(items) {
    return items.map(item => {
        const itemId = item.date;
        const title = formatDate(item.date, { weekday: 'long', day: 'numeric', month: 'long' });
        const dataset = { itemId: item.date, date: item.date, title: title, description: title, pageContext: 'jurnal' };
        const showMoreIcon = true;
        const statusCounts = item.statusCounts || {};
        const baseWorkerCount = typeof item.workerCount === 'number'
            ? item.workerCount
            : (item.workerCount instanceof Set ? item.workerCount.size : 0);
        const workerCount = baseWorkerCount || (statusCounts.full_day || 0) + (statusCounts.half_day || 0);
        const headerMeta = workerCount > 0
            ? `${workerCount} Pekerja Terabsen`
            : 'Belum Ada Absensi';

        return createUnifiedCard({
            id: `jurnal-${itemId}`,
            title: title,
            headerMeta,
            amount: fmtIDR(item.totalPay),
            amountLabel: 'Total Upah',
            amountColorClass: 'negative',
            dataset: { ...dataset },
            moreAction: showMoreIcon,
            actions: []
        });
    }).join('');
}

export function _getJurnalPerPekerjaListHTML(items) {
    return items.map(item => {
        const itemId = item.workerId;
        const title = item.workerName;
        const dataset = { 
            itemId: item.workerId, 
            workerId: item.workerId, 
            title: title, 
            description: title,
            totalUnpaid: item.totalUnpaid
        };

        const showMoreIcon = true; // Aktifkan tombol 'more'
        const profession = appState.professions?.find(p => p.id === item.professionId);
        const metaBadges = profession ? [{ icon: 'hammer', text: profession.professionName }] : [];

        return createUnifiedCard({
            id: `jurnal-worker-${itemId}`,
            title: title,
            headerMeta: `${item.totalDays || 0} Hari Kerja`,
            metaBadges: metaBadges,
            amount: fmtIDR(item.totalUnpaid),
            amountLabel: 'Total Belum Direkap',
            amountColorClass: item.totalUnpaid > 0 ? 'warn' : 'positive',
            dataset: { ...dataset },
            moreAction: showMoreIcon, // 'true' akan menampilkan tombol
            actions: [],
            pageContext: 'jurnal'
        });
    }).join('');
}

export function _getRekapGajiListHTML(items, options = {}) {
    const pendingBills = options.pendingBills || new Map();
    return items.map(item => {
        const itemId = item.id;
        const title = item.description;
        const dataset = { itemId: itemId, type: 'bill', title: title, description: title, pageContext: 'jurnal' };
        const showMoreIcon = true;

        const pendingLog = pendingBills.get(itemId);
        const warningHTML = pendingLog ? buildPendingQuotaBanner(pendingLog) : '';

        const cardHTML = createUnifiedCard({
            id: `bill-${itemId}`,
            title: title,
            headerMeta: formatDate(item.createdAt),
            amount: fmtIDR(item.amount),
            amountLabel: item.status === 'paid' ? 'Lunas' : 'Belum Lunas',
            amountColorClass: item.status === 'paid' ? 'positive' : 'warn',
            dataset: { action: 'open-bill-detail', ...dataset },
            moreAction: showMoreIcon,
            actions: []
        });

        return `${warningHTML}${cardHTML}`;
    }).join('');
}

on('ui.comments.threadViewed', ({ parentId }) => {
    if (!parentId) return;
    const buttons = document.querySelectorAll(`.card-more-action[data-parent-id="${parentId}"]`);
    buttons.forEach(btn => {
        btn.dataset.unreadCount = '0';
        btn.querySelector('.notification-badge')?.remove();
    });
});

export function _getLogAktivitasListHTML(items) {
     const getIconForAction = (action) => {
        const type = action ? action.toLowerCase() : '';
        if (type.includes('create') || type.includes('add') || type.includes('menambah')) return 'circle-plus';
        if (type.includes('update') || type.includes('edit') || type.includes('memperbarui')) return 'pencil';
        if (type.includes('delete') || type.includes('menghapus')) return 'trash-2';
        return 'info';
    };

    return items.map(log => {
        const itemId = log.id || `log-${(log.createdAt?.seconds || 0)}-${Math.random()}`;
        const dataset = {
            'target-id': log.details?.docId || '',
            'target-type': log.details?.type || ''
        };
        const canOpenDetail = dataset['target-id'] && (dataset['target-type'] === 'bill' || dataset['target-type'] === 'expense');
        const timestamp = getJSDate(log.createdAt);
        const headerMeta = timestamp.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const userBadge = `<span class="user-badge">${log.userName || 'Sistem'}</span>`;
        const isPendingQuota = (log.status || log.details?.status) === 'pending_quota';
        const payloadAttr = log.dataPayload ? encodePayloadForDataset(log.dataPayload) : '';
        const pendingActions = isPendingQuota ? `
            <div class="pending-warning-actions">
                <button type="button" class="btn btn-secondary" data-action="view-pending-data" data-log-id="${itemId}" data-datatype="${log.dataType || ''}" data-dataid="${log.dataId || ''}" ${payloadAttr ? `data-payload="${payloadAttr}"` : ''}>Lihat Data</button>
            </div>
        ` : '';
        const pendingText = isPendingQuota ? `<div class="wa-card-v2__description">${userBadge}<br><small>Perubahan menunggu kuota server.</small></div>${pendingActions}` : `<div class="wa-card-v2__description">${userBadge}</div>`;
        const iconName = getIconForAction(log.actionType || log.action || '');

        return createUnifiedCard({
            id: itemId,
            title: log.action,
            headerMeta: headerMeta,
            mainContentHTML: pendingText,
            amount: createIcon(iconName, 18),
            amountLabel: '',
            amountColorClass: '',
            dataset: { action: canOpenDetail ? 'view-log-detail' : '', ...dataset },
            moreAction: false,
            actions: [],
            customClasses: isPendingQuota ? 'log-item-warning' : ''
        });
    }).join('');
}
