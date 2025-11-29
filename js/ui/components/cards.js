import { appState } from "../../state/appState.js";
import { fmtIDR, formatDate } from "../../utils/formatters.js";
import { getJSDate, getUnreadCommentCount } from "../../utils/helpers.js";
import { on } from "../../state/eventBus.js";
import { buildPendingQuotaBanner } from "./pendingQuotaBanner.js";
import { encodePayloadForDataset } from "../../services/pendingQuotaService.js";
import { isViewer } from "../../utils/helpers.js";

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
        let actionName = 'open-item-actions-modal'; 

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

// ... _getMasterDataListHTML & _getUserManagementListHTML omitted for brevity (same as previous) ...
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
            pageContext: 'master_data', 
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
            moreAction: true, 
            actions: [], 
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
    
    // ... (rest of bill detail logic same as before, skipping for brevity) ...
    // Note: Assuming standard bills don't need changes, focusing on salary details
    // But adhering to request to replace full content, so including logic.
    
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

export function _createSalaryBillDetailContentHTML(bill, payments = [], options = {}) {
    const normalizeIds = (value) => {
        if (!value) return [];
        if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
        if (typeof value === 'string') return value.split(',').map(part => part.trim()).filter(Boolean);
        return [];
    };

    const normalizedPayments = Array.isArray(payments) ? [...payments] : [];
    if (bill && bill.status === 'paid' && (!normalizedPayments.length) && bill.amount) {
        normalizedPayments.push({
            id: `initial-${bill.id}`,
            billId: bill.id,
            amount: bill.amount,
            date: bill.paidAt || bill.createdAt || bill.date,
            _source: 'initial'
        });
    }

    const paidFromPayments = normalizedPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const workerIdHint = options.workerId
        || options['worker-id']
        || bill?.workerId
        || bill?.workerDetails?.[0]?.workerId
        || bill?.workerDetails?.[0]?.id
        || '';

    const collectedIds = new Set([
        ...normalizeIds(options.billIds),
        ...normalizeIds(options['bill-ids']),
        ...(Array.isArray(bill?.billIds) ? bill.billIds.map(String) : [])
    ]);
    if (bill?.id) collectedIds.add(bill.id);

    const candidateBills = (bill?.type === 'gaji')
        ? (collectedIds.size
            ? Array.from(collectedIds)
                .map(id => (bill && bill.id === id ? bill : (appState.bills?.find(b => b.id === id) || null)))
                .filter(Boolean)
            : (bill ? [bill] : []))
        : [];

    const aggregates = (bill?.type === 'gaji' && candidateBills.length)
        ? aggregateSalaryBillWorkers(candidateBills)
        : [];

    let workerSummary = null;
    if (aggregates.length) {
        if (workerIdHint) {
            workerSummary = aggregates.find(entry => entry.workerId === workerIdHint) || null;
        }
        if (!workerSummary && aggregates.length === 1) {
            workerSummary = aggregates[0];
        }
    }

    const status = workerSummary?.status || bill?.status || 'unpaid';
    const createdDate = getJSDate(bill?.createdAt);
    const createdBy = bill?.createdByName || 'Sistem';
    const workerName = workerSummary?.workerName
        || (bill?.workerDetails?.length === 1 ? (bill.workerDetails[0].name || bill.description) : bill?.description)
        || 'Rekap Gaji';

    const fallbackAttendanceSummary = () => {
        const attendanceMap = new Map((appState.attendanceRecords || []).map(rec => [rec.id, rec]));
        let allRecordIds = (bill?.workerDetails || []).flatMap(w => w.recordIds || []);
        if (!allRecordIds.length && Array.isArray(bill?.recordIds)) {
            allRecordIds = bill.recordIds;
        }
        const attendanceSummary = { full: 0, half: 0, absent: 0 };
        let rangeStart = bill?.startDate ? getJSDate(bill.startDate) : null;
        let rangeEnd = bill?.endDate ? getJSDate(bill.endDate) : null;
        allRecordIds.forEach(id => {
            const rec = attendanceMap.get(id);
            if (!rec) return;
            const recDate = getJSDate(rec.date);
            if (recDate && !Number.isNaN(recDate.getTime())) {
                if (!rangeStart || recDate < rangeStart) rangeStart = recDate;
                if (!rangeEnd || recDate > rangeEnd) rangeEnd = recDate;
            }
            if (rec.attendanceStatus === 'half_day') attendanceSummary.half += 1;
            else if (rec.attendanceStatus === 'absent') attendanceSummary.absent += 1;
            else attendanceSummary.full += 1;
        });
        return {
            attendanceSummary,
            rangeStart,
            rangeEnd,
            rangeLabel: formatRangeLabel(rangeStart, rangeEnd)
        };
    };

    const summaryLines = (() => {
        if (workerSummary?.summaries?.length) return workerSummary.summaries.slice();
        if (bill) {
            const fallback = fallbackAttendanceSummary();
            return [{
                billId: bill.id,
                amount: bill.amount,
                uniqueAmount: bill.amount,
                startDate: fallback.rangeStart,
                endDate: fallback.rangeEnd,
                attendanceSummary: fallback.attendanceSummary,
                rangeLabel: fallback.rangeLabel,
                status: bill.status || 'unpaid'
            }];
        }
        return [];
    })();

    const summaryStats = getSalarySummaryStats(summaryLines);
    const summaryBillIds = Array.from(collectedIds).filter(Boolean);
    const summaryLineTotal = summaryLines.length ? summaryStats.totalAmount : null;
    const fallbackBillAmount = Number(bill?.amount) || 0;
    const total = summaryLineTotal !== null ? summaryLineTotal : fallbackBillAmount;

    const fallbackPaid = workerSummary ? Number(workerSummary.paidAmount || 0) : Number(bill?.paidAmount || 0);
    const paid = paidFromPayments > 0 ? paidFromPayments : fallbackPaid;
    const remaining = Math.max(0, total - paid);
    const primaryBillIdForPayment = summaryBillIds[0] || bill?.id || '';
    const workerIdForPayment = workerSummary?.workerId || bill?.workerId || '';
    const safeBillIdsAttr = summaryBillIds.join(',').replace(/"/g, '&quot;');
    const showPaymentAction = !isViewer() && remaining > 0 && summaryBillIds.length > 0 && primaryBillIdForPayment;

    const summaryListHTML = summaryLines.length
        ? summaryLines
            .slice()
            .sort((a, b) => getJSDate(b.startDate || b.endDate) - getJSDate(a.startDate || a.endDate))
            .map((sum, index) => {
                const rangeLabel = sum.rangeLabel || formatRangeLabel(sum.startDate, sum.endDate);
                const statuses = sum.attendanceSummary || {};
                const statusParts = [];
                if (statuses.full) statusParts.push(`${statuses.full} Hadir`);
                if (statuses.half) statusParts.push(`${statuses.half} 1/2 Hari`);
                if (statuses.absent) statusParts.push(`${statuses.absent} Absen`);
                const attendanceText = statusParts.join(' • ') || 'Tanpa data absensi';
                const baseAmount = Number(sum.amount || 0);
                const amountValue = summaryStats.useUniqueAmount ? Number(sum.uniqueAmount ?? baseAmount) : baseAmount;
                const badgeState = (sum.status || status) === 'paid' ? 'positive' : 'warn';
                
                // === ACTION BUTTONS PER ITEM ===
                const isPaid = badgeState === 'positive';
                
                const printButtonHTML = `
                    <button class="btn btn-sm btn-ghost recap-print-btn" style="gap:4px; padding: 4px 10px;" title="Cetak Kwitansi" data-action="print-bill" data-id="${sum.billId}" data-bill-id="${sum.billId}">
                        ${createIcon('printer', 14)} <span>Cetak</span>
                    </button>
                `;

                const deletePaidSummaryButtonHTML = `
                    <button class="btn btn-sm btn-danger recap-delete-btn" style="gap:4px; padding: 4px 10px;" title="Hapus Rekap Ini" data-action="delete-salary-summary" data-id="${sum.billId}" data-bill-id="${sum.billId}" data-worker-id="${workerSummary?.workerId}">
                        ${createIcon('trash-2', 14)} <span>Hapus</span>
                    </button>
                `;

                const unpaidActionsHTML = `
                    <button class="btn btn-sm btn-primary" style="gap:4px; padding: 4px 8px;" title="Bayar Tagihan Ini" data-action="open-salary-payment-panel" data-item-id="${sum.billId}" data-bill-id="${sum.billId}" data-worker-id="${workerSummary?.workerId}">
                        ${createIcon('coins', 14)} <span>Bayar</span>
                    </button>
                    <button class="btn-icon danger" title="Hapus Rekap Ini" data-action="delete-salary-bill" data-id="${sum.billId}" data-worker-id="${workerSummary?.workerId}">
                        ${createIcon('trash-2', 16)}
                    </button>
                `;

                const actionsHTML = isPaid
                    ? `${printButtonHTML}${deletePaidSummaryButtonHTML}`
                    : unpaidActionsHTML;

                return `
                    <div class="sub-recap-item">
                        <div class="recap-header">
                           <div class="recap-info">
                                <span class="recap-label">Rekap #${summaryLines.length - index}</span>
                                <span class="recap-date-range">${rangeLabel}</span>
                           </div>
                           <span class="status-badge ${badgeState === 'positive' ? 'status-badge--positive' : 'status-badge--warn'}">${isPaid ? 'Lunas' : 'Belum'}</span>
                        </div>
                        
                        <div class="recap-body">
                            <div class="recap-meta">
                                ${createIcon('calendar-x-2', 14)} ${attendanceText}
                            </div>
                            <div class="recap-amount">
                               ${fmtIDR(amountValue || 0)}
                           </div>
                        </div>

                        <div class="recap-actions-bar">
                            ${actionsHTML}
                        </div>
                    </div>
                `;
            }).join('')
        : `<div class="salary-summary-list__empty">Belum ada rangkuman gaji.</div>`;

    // === AGGREGATE HEADER ===
    const summaryAggregateHTML = `
        <div class="salary-aggregate-summary">
            <div class="summary-row main">
                <span class="summary-label">Total Tagihan (${summaryLines.length} Rekap)</span>
                <strong class="summary-value big">${fmtIDR(total)}</strong>
            </div>
            <div class="summary-row">
                <span class="summary-label">Sudah Dibayar</span>
                <strong class="summary-value text-positive">${fmtIDR(paid)}</strong>
            </div>
            <div class="summary-row">
                <span class="summary-label">Sisa Pembayaran</span>
                <strong class="summary-value ${remaining > 0 ? 'text-warn' : 'text-positive'}">${fmtIDR(remaining)}</strong>
            </div>
        </div>
    `;

    const metaDetailsHTML = `
        <dl class="detail-list compact">
            <div><dt>Pekerja</dt><dd>${workerName}</dd></div>
            <div><dt>Dibuat Pada</dt><dd>${createdDate.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}</dd></div>
            <div><dt>Dibuat Oleh</dt><dd>${createdBy}</dd></div>
        </dl>
    `;

    const notes = bill?.notes;
    const notesHTML = notes ? `
        <div class="salary-notes" style="margin-top:16px;">
            <h5 class="detail-section-title" style="font-size:0.9rem; margin-bottom:8px;">${createIcon('sticky-note', 14)} Catatan</h5>
            <p style="background:var(--surface-sunken); padding:10px; border-radius:8px; font-size:0.9rem;">${notes}</p>
        </div>
    ` : '';

    return `
        <div class="salary-detail-wrapper">
            ${summaryAggregateHTML}
            <div class="worker-recap-summary-list">
                ${summaryListHTML}
            </div>
        </div>
        
        <div class="card card-pad salary-detail-meta" style="margin-top:20px; border-top:1px solid var(--line);">
            <h5 class="detail-section-title" style="margin-top:0; margin-bottom:12px;">Informasi Tambahan</h5>
            ${metaDetailsHTML}
            ${notesHTML}
        </div>
    `;
}

export function _createDetailContentHTML(item, type) {
    // ... (Keep existing implementation logic)
    // For brevity, using placeholder as logic is same as before
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
    const notesHTML = item?.notes ? `<div class="card card-pad" style="margin-top:1rem;"><h5 class="detail-section-title">${createIcon('sticky-note', 16)} Catatan</h5><p class="notes-text">${item.notes}</p></div>` : '';
    return `<div class="card card-pad">${detailsHTML}</div>${notesHTML}`;
}

// ... (formatRangeLabel, getSalarySummaryStats, aggregateSalaryBillWorkers logic same as previous) ...
function formatRangeLabel(start, end) {
    const startDate = start ? getJSDate(start) : null;
    const endDate = end ? getJSDate(end) : null;
    if (startDate && endDate) {
        const sameDay = startDate.toISOString().slice(0, 10) === endDate.toISOString().slice(0, 10);
        if (sameDay) return formatDate(startDate, { day: 'numeric', month: 'short' });
        return `${formatDate(startDate, { day: 'numeric', month: 'short' })} - ${formatDate(endDate, { day: 'numeric', month: 'short' })}`;
    }
    if (startDate) return formatDate(startDate, { day: 'numeric', month: 'short' });
    if (endDate) return formatDate(endDate, { day: 'numeric', month: 'short' });
    return 'Rentang tidak tersedia';
}

export function getSalarySummaryStats(summaries = []) {
    const sanitized = Array.isArray(summaries) ? summaries.filter(Boolean) : [];
    if (!sanitized.length) return { totalAmount: 0, overwrittenCount: 0, useUniqueAmount: true };
    let overwrittenCount = 0;
    sanitized.forEach(sum => {
        const baseAmount = Number(sum?.amount || 0);
        const uniqueAmount = Number(sum?.uniqueAmount ?? baseAmount);
        if (baseAmount > 0 && uniqueAmount <= 0) overwrittenCount += 1;
    });
    const useUniqueAmount = overwrittenCount <= 1;
    const totalAmount = sanitized.reduce((acc, sum) => {
        const baseAmount = Number(sum?.amount || 0);
        const uniqueAmount = Number(sum?.uniqueAmount ?? baseAmount);
        const amountToUse = useUniqueAmount ? uniqueAmount : baseAmount;
        return acc + (Number.isFinite(amountToUse) ? amountToUse : 0);
    }, 0);
    return { totalAmount, overwrittenCount, useUniqueAmount };
}

export function aggregateSalaryBillWorkers(items = []) {
    const attendanceRecords = appState.attendanceRecords || [];
    const attendanceMap = new Map(attendanceRecords.map(rec => [rec.id, rec]));
    const projectMap = new Map((appState.projects || []).map(project => [project.id, project.projectName]));
    const workerLookup = new Map((appState.workers || []).map(worker => [worker.id, worker.workerName]));
    const grouped = new Map();

    const resolveComparableTime = (bill = {}) => {
        const sourceDate = bill.updatedAt || bill.createdAt || bill.endDate || bill.dueDate || bill.date;
        const parsed = getJSDate(sourceDate);
        return (parsed instanceof Date && !Number.isNaN(parsed.getTime())) ? parsed.getTime() : 0;
    };

    const salaryItems = (Array.isArray(items) ? items : [])
        .filter(item => item && item.type === 'gaji')
        .sort((a, b) => resolveComparableTime(b) - resolveComparableTime(a));

    salaryItems.forEach(item => {
        const billTotal = Number(item.amount) || 0;
        const billPaid = Number(item.paidAmount) || 0;
        const paidRatio = billTotal > 0 ? Math.min(1, Math.max(0, billPaid / billTotal)) : 0;
        const detailWorkers = Array.isArray(item.workerDetails) && item.workerDetails.length > 0
            ? item.workerDetails
            : (item.workerId ? [{ workerId: item.workerId, name: workerLookup.get(item.workerId) || 'Pekerja', amount: item.amount, recordIds: item.recordIds || [] }] : []);
        const fallbackAmount = Number(item.amount) || 0;
        const billStart = item.startDate ? getJSDate(item.startDate) : null;
        const billEnd = item.endDate ? getJSDate(item.endDate) : null;

        detailWorkers.forEach(detail => {
            const workerId = detail.workerId || detail.id || detail.name;
            if (!workerId) return;
            const detailAmount = Number(detail.amount ?? fallbackAmount) || (fallbackAmount > 0 ? fallbackAmount / detailWorkers.length : 0);
            if (!grouped.has(workerId)) {
                grouped.set(workerId, {
                    workerId,
                    workerName: detail.name || workerLookup.get(workerId) || 'Pekerja',
                    totalAmount: 0,
                    totalPaid: 0,
                    statusSet: new Set(),
                    billIds: new Set(),
                    projectNames: new Set(),
                    recordIds: new Set(),
                    dueDate: null,
                    summaries: [],
                    seenRecords: new Set(),
                    overallRangeStart: null,
                    overallRangeEnd: null
                });
            }
            const summary = grouped.get(workerId);
            const recordIds = Array.isArray(detail.recordIds) && detail.recordIds.length > 0
                ? detail.recordIds
                : (item.recordIds || []);
            const normalizedRecordIds = recordIds.filter(Boolean);
            const uniqueRecordIds = normalizedRecordIds.filter(id => !summary.seenRecords.has(id));
            const ratio = normalizedRecordIds.length ? (uniqueRecordIds.length / normalizedRecordIds.length) : 1;
            const appliedAmount = Number.isFinite(ratio) ? detailAmount * ratio : detailAmount;

            summary.totalAmount += appliedAmount;
            summary.totalPaid += appliedAmount * paidRatio;
            summary.statusSet.add(item.status || 'unpaid');
            if (item.id) summary.billIds.add(item.id);
            const candidateDate = item.dueDate || item.date;
            if (candidateDate) {
                const parsed = getJSDate(candidateDate);
                if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) {
                    if (!summary.dueDate || parsed < summary.dueDate) {
                        summary.dueDate = parsed;
                    }
                }
            }
            const attendanceSummary = { full: 0, half: 0, absent: 0 };
            let rangeStart = billStart;
            let rangeEnd = billEnd;

            normalizedRecordIds.forEach(recId => {
                const record = attendanceMap.get(recId);
                if (record?.projectId) {
                    const projName = projectMap.get(record.projectId) || record.projectId;
                    summary.projectNames.add(projName);
                }
                const recordDate = record ? getJSDate(record.date) : null;
                if (recordDate && !Number.isNaN(recordDate.getTime())) {
                    if (!rangeStart || recordDate < rangeStart) rangeStart = recordDate;
                    if (!rangeEnd || recordDate > rangeEnd) rangeEnd = recordDate;
                }
                if (record) {
                    if (record.attendanceStatus === 'half_day') attendanceSummary.half += 1;
                    else if (record.attendanceStatus === 'absent') attendanceSummary.absent += 1;
                    else attendanceSummary.full += 1;
                }
            });

            uniqueRecordIds.forEach(recId => summary.seenRecords.add(recId));
            normalizedRecordIds.forEach(recId => summary.recordIds.add(recId));

            const summaryEntry = {
                billId: item.id,
                amount: detailAmount,
                uniqueAmount: appliedAmount,
                startDate: rangeStart,
                endDate: rangeEnd,
                recordCount: normalizedRecordIds.length,
                attendanceSummary,
                rangeLabel: formatRangeLabel(rangeStart, rangeEnd),
                status: item.status || 'unpaid'
            };

            summary.summaries.push(summaryEntry);

            if (rangeStart && (!summary.overallRangeStart || rangeStart < summary.overallRangeStart)) {
                summary.overallRangeStart = rangeStart;
            }
            if (rangeEnd && (!summary.overallRangeEnd || rangeEnd > summary.overallRangeEnd)) {
                summary.overallRangeEnd = rangeEnd;
            }
        });
    });

    return Array.from(grouped.values()).map(summary => {
        const status = (summary.totalAmount > 0 && summary.totalPaid >= summary.totalAmount)
            ? 'paid'
            : 'unpaid';
        const overallStart = summary.overallRangeStart;
        const overallEnd = summary.overallRangeEnd;
        const summaryRangeLabel = formatRangeLabel(overallStart, overallEnd);
        return {
            id: `worker-${summary.workerId}`,
            type: 'gaji',
            workerId: summary.workerId,
            description: summary.workerName,
            amount: summary.totalAmount,
            paidAmount: summary.totalPaid,
            status,
            dueDate: summary.dueDate,
            startDate: overallStart,
            endDate: overallEnd,
            summaryRangeLabel,
            primaryBillId: Array.from(summary.billIds)[0] || null,
            workerDetails: [{
            workerId: summary.workerId,
            id: summary.workerId,
            name: summary.workerName,
            amount: summary.totalAmount,
            recordIds: Array.from(summary.recordIds)
        }],
            projectNames: Array.from(summary.projectNames),
            billIds: Array.from(summary.billIds),
            summaries: summary.summaries,
            summaryCount: summary.summaries.length
        };
    });
}

export function _getBillsListHTML(items, options = {}) {
    if (!Array.isArray(items)) return '';

    const pendingBills = options.pendingBills || new Map();
    const pendingExpenses = options.pendingExpenses || new Map();
    const aggregateSalary = options.aggregateSalary !== false;
    const hidePayrollMetaBadges = Boolean(options.hidePayrollMetaBadges);

    const allComments = appState.comments || [];
    const salaryAggregates = aggregateSalary ? aggregateSalaryBillWorkers(items) : [];
    const nonSalaryItems = aggregateSalary ? items.filter(item => !(item && item.type === 'gaji')) : items;
    const normalizedItems = aggregateSalary ? [...salaryAggregates, ...nonSalaryItems] : nonSalaryItems;
    items = normalizedItems;

    return items.map(item => {
        const isBill = 'dueDate' in item && item.status !== 'delivery_order';
        const isDeliveryOrder = item.status === 'delivery_order';
        
        const isSalaryBill = item.type === 'gaji';
        const isSalaryAggregate = isSalaryBill && item.id && item.id.startsWith('worker-');
        
        const salaryBillIds = isSalaryBill
            ? (Array.isArray(item.billIds) && item.billIds.length ? item.billIds : (item.id ? [item.id] : []))
            : [];
        const primaryBillId = isSalaryBill ? (item.primaryBillId || salaryBillIds[0] || item.id) : null;
        
        const workerIdForDataset = isSalaryBill
            ? (item.workerId || item.workerDetails?.[0]?.workerId || item.workerDetails?.[0]?.id || '')
            : '';

        let expenseData = null;
        let localMetaBadges = [];
        let mainContentHTML = ''; // Kita kosongkan ini agar kembali ke default layout
        
        const salaryTotalAmount = isSalaryBill ? Number(item.amount || 0) : 0;
        const salaryPaidAmount = isSalaryBill ? Number(item.paidAmount || 0) : 0;
        const salaryOutstandingAmount = isSalaryBill ? Math.max(0, salaryTotalAmount - salaryPaidAmount) : 0;

        if (isBill) {
            expenseData = appState.expenses?.find(e => e.id === item.expenseId);
        } else if (isDeliveryOrder) {
            expenseData = item;
        }

        // ... (Logic Supplier/Worker sama) ...
        if (expenseData) {
            const sup = appState.suppliers?.find(s => s.id === expenseData.supplierId);
            if (sup) localMetaBadges.push({ icon: 'storefront', text: sup.supplierName });
        }
        else if (item.type === 'gaji' && isBill && !hidePayrollMetaBadges) {
            const workerName = item.workerDetails && item.workerDetails.length === 1 
                ? item.workerDetails[0].name 
                : (item.workerDetails ? `${item.workerDetails.length} Pekerja` : '');
            
            if (workerName) localMetaBadges.push({ icon: 'hard_hat', text: workerName });
            else if (item.workerId) {
                const worker = (appState.workers || []).find(w => w.id === item.workerId);
                if (worker) localMetaBadges.push({ icon: 'hard_hat', text: worker.workerName });
            }
        }
        // ...

        let title = item.description;
        
        if (item.type === 'gaji' && isBill) {
            if (isSalaryAggregate) {
                title = item.description || item.workerName || 'Pekerja';
                const count = item.summaryCount
                    || (Array.isArray(item.summaries) ? item.summaries.length : 0)
                    || (Array.isArray(item.billIds) ? item.billIds.length : 0);
                
                // Pindahkan info rekap ke Badge agar bersih
                if (count) {
                    localMetaBadges.push({ icon: 'list', text: `${count} Rekap` });
                }

                // Tidak perlu custom mainContentHTML yang rumit
                mainContentHTML = ''; 

            } else {
                title = item.description ? item.description.replace('Tagihan Gaji - ', 'Gaji: ') : 'Tagihan Gaji';
            }
        }
        
        if (isSalaryAggregate) {
            const aggregateRangeLabel = item.summaryRangeLabel || formatRangeLabel(item.startDate, item.endDate);
            if (!hidePayrollMetaBadges && aggregateRangeLabel && aggregateRangeLabel !== 'Rentang tidak tersedia') {
                localMetaBadges.push({ icon: 'calendar-x-2', text: aggregateRangeLabel });
            }
        }

        const parentId = (isBill && isSalaryBill) ? (primaryBillId || item.id) : (expenseData?.id || (isBill ? item.expenseId : null));
        const parentType = (isBill && item.type === 'gaji') ? 'bill' : 'expense';
        const unreadCount = (parentId && parentType) ? getUnreadCommentCount(parentId, allComments.filter(c => c.parentType === parentType && c.parentId === parentId)) : 0;
        const isPaid = item.status === 'paid';

        // LOGIKA AMOUNT YANG KONSISTEN
        let displayAmount = 0;
        let amountLabelText = '';
        let amountColor = '';

        if (isSalaryAggregate) {
            // Jika Agregat Gaji:
            if (salaryOutstandingAmount > 0) {
                // Belum Lunas: Tampilkan Sisa
                displayAmount = salaryOutstandingAmount;
                amountLabelText = 'Sisa Gaji';
                amountColor = 'warn';
            } else {
                // Lunas: Tampilkan Total
                displayAmount = salaryTotalAmount;
                amountLabelText = 'Lunas';
                amountColor = 'positive';
            }
        } else if (isDeliveryOrder) {
            displayAmount = '-';
            amountLabelText = 'Surat Jalan';
            amountColor = '';
        } else {
            // Tagihan Biasa (Supplier/Lainnya)
            if (isPaid) {
                displayAmount = item.amount || 0;
                amountLabelText = 'Lunas';
                amountColor = 'positive';
            } else {
                displayAmount = Math.max(0, (item.amount || 0) - (item.paidAmount || 0));
                amountLabelText = 'Sisa Tagihan';
                amountColor = 'warn';
            }
        }

        const tooltipText = `${item.description} | Total: ${fmtIDR(item.amount || 0)}`;
        const uniqueDomId = isDeliveryOrder ? `expense-${item.id}` : `bill-${item.id}`;
        const datasetItemId = isSalaryBill ? (primaryBillId || item.id) : item.id;
        const itemIdForDataset = datasetItemId;

        const dataset = {
            'item-id': datasetItemId,
            type: isSalaryAggregate ? 'worker-payroll' : (isDeliveryOrder ? 'expense' : 'bill'),
            'expense-id': expenseData?.id || '',
            amount: item.amount,
            tooltip: tooltipText.replace(/"/g, '&quot;'),
            title: title,
            description: title,
            'parent-id': parentId || '',
            'parent-type': parentType || '',
            'worker-id': workerIdForDataset,
            workerId: workerIdForDataset,
            'bill-ids': salaryBillIds.join(','),
            billIds: salaryBillIds.join(','),
            'primary-bill-id': primaryBillId || '',
            primaryBillId: primaryBillId || '',
            itemType: item.type || '',
            'aggregate-id': isSalaryAggregate ? item.id : '',
            'summary-count': isSalaryAggregate ? (item.summaryCount || 0) : '',
            'summary-range': isSalaryAggregate ? (item.summaryRangeLabel || formatRangeLabel(item.startDate, item.endDate)) : '',
            totalUnpaid: salaryOutstandingAmount
        };

        const selectionActive = appState.selectionMode.active && appState.selectionMode.pageContext === 'tagihan';
        const isSelected = selectionActive && appState.selectionMode.selectedIds.has(itemIdForDataset);

        const pendingLog = isBill
            ? (pendingBills.get(datasetItemId) || pendingBills.get(item.id))
            : pendingExpenses.get(item.id);
        const warningHTML = pendingLog ? buildPendingQuotaBanner(pendingLog) : '';

        const cardHTML = createUnifiedCard({
            id: uniqueDomId,
            title: title,
            headerMeta: formatDate(item.dueDate || item.date),
            metaBadges: localMetaBadges,
            mainContentHTML: mainContentHTML,
            amount: displayAmount === '-' ? '-' : fmtIDR(displayAmount),
            amountLabel: amountLabelText,
            amountColorClass: amountColor,
            dataset: dataset,
            moreAction: true,
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
