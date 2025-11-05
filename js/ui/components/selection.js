import { appState } from "../../state/appState.js";
import { $ } from "../../utils/dom.js";
import { fmtIDR } from "../../utils/formatters.js";
import { emit, on } from "../../state/eventBus.js";
import { masterDataConfig } from "../../config/constants.js";

// Helper function to create Lucide SVG Icon
function createIcon(iconName, size = 20, classes = '') {
    const icons = {
        check: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check ${classes}"><path d="M20 6 9 17l-5-5"/></svg>`,
        close: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x ${classes}"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
        select_all: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-check ${classes}"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg>`, // Using CheckCheck
        delete: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2 ${classes}"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
        summarize: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-list ${classes}"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>`, // Using List
        forum: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-square ${classes}"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
        restore_from_trash: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-rotate-ccw ${classes}"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`,
        delete_forever: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2 ${classes}"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
    };
    return icons[iconName] || '';
}

function getSelectionSummaryCardHTML() {
    const { selectionMode } = appState;
    if (!selectionMode.active || selectionMode.selectedIds.size === 0) return '';

    let total = 0;
    let items = [];
    let listSource = [];
    let currentListPageItems = [];

    const listContainer = document.querySelector('#sub-page-content');
    if (listContainer) {
        currentListPageItems = Array.from(listContainer.querySelectorAll('.wa-card-v2-wrapper'));
    }

    switch (selectionMode.pageContext) {
        case 'tagihan':
            listSource = appState.tagihan?.currentList || [];
            break;
        case 'pemasukan':
            listSource = appState.pemasukan?.currentList || [];
            break;
        case 'recycleBin':
            listSource = appState.recycledItemsCache || [];
            break;
         default:
             listSource = [];
    }

    selectionMode.selectedIds.forEach(id => {
        const item = listSource.find(i => i.id === id);
        if (item) {
            let amount = 0;
            let description = 'Item';
            if (selectionMode.pageContext === 'recycleBin') {
                const config = Object.values(masterDataConfig).find(c => c.dbTable === item.table);
                description = item.description || item[config?.nameField] || item.name || 'Item Dihapus';
                amount = item.amount || item.totalAmount || 0;
            } else if (selectionMode.pageContext === 'tagihan') {
                description = item.description || item.projectName || 'Item';
                if (item.status === 'delivery_order') {
                    amount = 0;
                    description += ' (Surat Jalan)';
                } else if (item.status === 'unpaid') {
                    amount = Math.max(0, (item.amount || 0) - (item.paidAmount || 0));
                } else {
                    amount = item.amount || 0;
                }
            } else if (selectionMode.pageContext === 'pemasukan'){
                 description = item.description || item.projectName || 'Item';
                 amount = item.amount || item.totalAmount || 0;
            }
            total += amount;
            items.push({ description, amount });
        }
    });

    if (items.length === 0) return '';

    return `
        <div class="card card-pad" id="selection-summary-card">
            <h5 class="invoice-section-title">Ringkasan Item Terpilih (${items.length})</h5>
            <div class="detail-list">
                ${items.map(item => `
                    <div>
                        <dt>${item.description}</dt>
                        <dd>${fmtIDR(item.amount)}</dd>
                    </div>
                `).join('')}
            </div>
            <div class="invoice-total">
                <span>Total Terpilih</span>
                <strong>${fmtIDR(total)}</strong>
            </div>
        </div>
    `;
}

export function handleOpenSelectionSummaryModal() {
    const content = getSelectionSummaryCardHTML();
    if (content) {
        emit('ui.modal.create', 'dataDetail', {
            title: 'Ringkasan Item Terpilih',
            content: content
        });
    }
}


export function _activateSelectionMode(pageContext) {
    if (appState.selectionMode.active && appState.selectionMode.pageContext === pageContext) return;
    appState.selectionMode.active = true;
    appState.selectionMode.selectedIds.clear();
    appState.selectionMode.pageContext = pageContext;
    appState.selectionMode.lastSelectedId = null;
    document.body.classList.add('selection-active');
    emit('ui.selection.activated', pageContext);
    if (pageContext !== 'absensi') {
        const globalSelectionBar = document.getElementById('selection-bar');
        if (globalSelectionBar) {
            globalSelectionBar.classList.add('show');
            globalSelectionBar.style.display = '';
             _updateSelectionCount();
        }
    } else {
        const globalSelectionBar = document.getElementById('selection-bar');
        if (globalSelectionBar) {
            globalSelectionBar.classList.remove('show');
            globalSelectionBar.style.display = 'none';
        }
         emit('ui.selection.updateCount');
    }
    let renderEvent = '';
    if (pageContext === 'tagihan') renderEvent = 'ui.tagihan.renderContent';
    else if (pageContext === 'pemasukan') renderEvent = 'ui.pemasukan.renderContent';
    else if (pageContext === 'recycleBin') renderEvent = 'ui.recycleBin.renderContent';
    else if (pageContext === 'Komentar') renderEvent = 'ui.komentar.renderContent';
    if (renderEvent) emit(renderEvent);
    else if (pageContext === 'absensi') emit('ui.absensi.renderManualForm');
    emit('ui.fab.render', { isVisible: false });
}


export function deactivateSelectionMode(force = false) {
    if (!force && appState.activePage === 'absensi' && appState.selectionMode.pageContext === 'absensi') {
        console.log("Selection mode kept active for 'absensi' page.");
        if (appState.selectionMode.selectedIds.size === 0) {
            emit('ui.fab.render', { isVisible: false });
        }
        return;
    }

    if (!appState.selectionMode.active) return;
    const deactivatedContext = appState.selectionMode.pageContext;
    appState.selectionMode.active = false;
    appState.selectionMode.selectedIds.clear();
    appState.selectionMode.pageContext = '';
    appState.selectionMode.lastSelectedId = null;

    document.body.classList.remove('selection-active');

    const globalSelectionBar = document.getElementById('selection-bar');
    if (globalSelectionBar) {
        globalSelectionBar.classList.remove('show');
        globalSelectionBar.style.display = '';
        const countText = document.getElementById('selection-count-text');
        if (countText) countText.textContent = '0';
        const actionsContainer = document.getElementById('global-selection-actions');
         if (actionsContainer) actionsContainer.innerHTML = '';
    }

    let renderEvent = '';
    if (appState.activePage === 'tagihan' && deactivatedContext === 'tagihan') {
        renderEvent = 'ui.tagihan.renderContent';
    } else if (appState.activePage === 'recycle_bin' && deactivatedContext === 'recycleBin') {
        renderEvent = 'ui.recycleBin.renderContent';
    } else if (appState.activePage === 'pemasukan' && deactivatedContext === 'pemasukan') {
        renderEvent = 'ui.pemasukan.renderContent';
    }

    if (renderEvent) {
        setTimeout(() => {
            emit(renderEvent);
        }, 50);
    }
    emit('ui.fab.render', { isVisible: false });
}


export function _updateSelectionCount() {
    const count = appState.selectionMode.selectedIds.size;
    const globalCountText = document.getElementById('selection-count-text');
    const attendanceCountText = document.getElementById('attendance-selection-count-text');
    const setStatusButton = document.getElementById('set-status-button'); // Ambil tombol baru

    if (globalCountText) {
        globalCountText.textContent = count;
    }
    if (attendanceCountText && appState.selectionMode.pageContext === 'absensi') {
        attendanceCountText.textContent = count;
    }

    if (setStatusButton && appState.selectionMode.pageContext === 'absensi') {
        setStatusButton.disabled = count === 0;
    }
}

export function _toggleCardSelection(context) {
    const { cardWrapper, itemId } = context || {};

    if (!cardWrapper || !itemId) {
        console.warn('[Selection Listener] Missing cardWrapper or itemId for toggle-selection', context);
        return;
    }

    const checkmark = cardWrapper.querySelector('.selection-checkmark');
    if (!checkmark) return;

    if (appState.selectionMode.selectedIds.has(itemId)) {
        appState.selectionMode.selectedIds.delete(itemId);
        cardWrapper.classList.remove('selected');
        checkmark.classList.remove('checked');
    } else {
        appState.selectionMode.selectedIds.add(itemId);
        cardWrapper.classList.add('selected');
        checkmark.classList.add('checked');
    }
    appState.selectionMode.lastSelectedId = itemId;
    _updateSelectionCount(); // This will now also trigger FAB visibility update
}


export function handleSelectAll() {
    const listContainer = document.querySelector('#sub-page-content');
    if (!listContainer || !appState.selectionMode.active) return;

    const allVisibleItems = Array.from(listContainer.querySelectorAll('.wa-card-v2-wrapper:not(.item-exiting)'));
    const allVisibleItemIds = allVisibleItems.map(item => item.dataset.itemId).filter(Boolean);

    if (allVisibleItemIds.length === 0) return;

    const allCurrentlyVisibleSelected = allVisibleItems.every(item => appState.selectionMode.selectedIds.has(item.dataset.itemId));

    allVisibleItems.forEach(item => {
        const itemId = item.dataset.itemId;
        if (!itemId) return;
        const checkmark = item.querySelector('.selection-checkmark');

        if (allCurrentlyVisibleSelected) {
            appState.selectionMode.selectedIds.delete(itemId);
            item.classList.remove('selected');
            if(checkmark) checkmark.classList.remove('checked');
        } else {
            appState.selectionMode.selectedIds.add(itemId);
            item.classList.add('selected');
            if(checkmark) checkmark.classList.add('checked');
        }
    });

    _updateSelectionCount(); // This will now also trigger FAB visibility update
}

on('ui.selection.activate', (context) => _activateSelectionMode(context));
on('ui.selection.deactivate', () => deactivateSelectionMode());
on('ui.selection.updateCount', () => _updateSelectionCount());
