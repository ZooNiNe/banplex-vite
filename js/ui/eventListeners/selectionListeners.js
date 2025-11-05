import { emit, on } from "../../state/eventBus.js";
import { appState } from "../../state/appState.js";
import { toast } from "../components/toast.js";
import { handleDeleteItem, _handleRestoreItems, _handleDeletePermanentItems, handleDeleteMultipleItems } from "../../services/data/recycleBinService.js";
import { deactivateSelectionMode, handleSelectAll, handleOpenSelectionSummaryModal, _activateSelectionMode, _toggleCardSelection, _updateSelectionCount } from "../components/selection.js";

function createIcon(iconName, size = 20, classes = '') {
    const icons = {
        'check-check': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-check ${classes}"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg>`,
        'trash-2': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2 ${classes}"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
        list: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-list ${classes}"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>`,
        'message-square': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-square ${classes}"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
        'rotate-ccw': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-rotate-ccw ${classes}"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`,
        x: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x ${classes}"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
        filter: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-filter ${classes}"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
        sort: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-up-down ${classes}"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg>`,
    };
    return icons[iconName] || '';
}

function createSelectionActionButton(icon, action, title, context = {}) {
    const contextAttributes = Object.entries(context)
        .map(([key, value]) => `data-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}="${String(value ?? '').replace(/"/g, '&quot;')}"`)
        .join(' ');
    return `
        <button class="btn-icon" data-action="${action}" title="${title}" ${contextAttributes}>
            ${createIcon(icon)}
        </button>
    `;
}

function updateGlobalSelectionActions(pageContext) {
    const actionsContainer = document.getElementById('global-selection-actions');
    if (!actionsContainer) return;

    let buttonsHTML = '';

    buttonsHTML += createSelectionActionButton('check-check', 'select-all-items', 'Pilih Semua / Batal Pilih');

    if (pageContext === 'tagihan' || pageContext === 'pemasukan') {
        buttonsHTML += createSelectionActionButton('trash-2', 'delete-selected-items', 'Hapus Item Terpilih');
        buttonsHTML += createSelectionActionButton('list', 'open-selection-summary', 'Lihat Ringkasan');
         if (pageContext === 'tagihan') {
             buttonsHTML += createSelectionActionButton('message-square', 'forward-to-comments', 'Komentarkan Item Terpilih');
         }
    } else if (pageContext === 'recycleBin') {
        buttonsHTML += createSelectionActionButton('rotate-ccw', 'restore-selected', 'Pulihkan Item Terpilih');
        buttonsHTML += createSelectionActionButton('trash-2', 'delete-permanent-selected', 'Hapus Permanen');
        buttonsHTML += createSelectionActionButton('list', 'open-selection-summary', 'Lihat Ringkasan');
    }

    actionsContainer.innerHTML = buttonsHTML;

    const selectionBar = document.getElementById('selection-bar');
    if (selectionBar) {
        let closeBtn = selectionBar.querySelector('[data-action="close-selection-mode"]');
        if (!closeBtn) {
            const selectionInfo = selectionBar.querySelector('.selection-info');
            if(selectionInfo){
                closeBtn = document.createElement('button');
                closeBtn.className = 'btn-icon close-selection-btn';
                closeBtn.dataset.action = 'close-selection-mode';
                closeBtn.title = 'Tutup Mode Seleksi';
                closeBtn.innerHTML = createIcon('x', 24);
                selectionInfo.prepend(closeBtn);
            }
        }
    }
}


export function initializeSelectionListeners() {
    on('ui.selection.handleAction', (action, context, event) => {
        if (event && ['toggle-selection', 'select-all-items', 'delete-selected-items', 'restore-selected', 'delete-permanent-selected', 'activate-selection-mode', 'close-selection-mode'].includes(action)) {
            event.stopPropagation();
            event.preventDefault();
        }

        switch(action) {
            case 'activate-selection-mode':
                _activateSelectionMode(context.pageContext || (appState.activePage === 'recycle_bin' ? 'recycleBin' : appState.activePage));
                updateGlobalSelectionActions(appState.selectionMode.pageContext);
                break;
            case 'close-selection-mode':
                deactivateSelectionMode();
                break;
            case 'toggle-selection':
                _toggleCardSelection(context);
                break;
            case 'select-all-items':
                handleSelectAll();
                break;
            case 'delete-selected-items':
                {
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
                    const itemsToDelete = selectedIds.map(id => ({ id, type: itemType }));
                    handleDeleteMultipleItems(itemsToDelete);
                }
                break;
            case 'restore-selected':
                {
                    const selectedIds = Array.from(appState.selectionMode.selectedIds);
                    if (selectedIds.length === 0) {
                        toast('info', 'Tidak ada item yang dipilih untuk dipulihkan.');
                        return;
                    }
                    const itemsToRestore = selectedIds.map(id => {
                        const item = Array.isArray(appState.recycledItemsCache) ? appState.recycledItemsCache.find(i => i.id === id) : null;
                        return item ? { id: item.id, table: item.table } : null;
                    }).filter(Boolean);
                    if (itemsToRestore.length > 0) {
                        _handleRestoreItems(itemsToRestore);
                    } else toast('error', 'Gagal mendapatkan detail item dari cache untuk dipulihkan.');
                }
                break;
            case 'delete-permanent-selected':
                {
                    const selectedIds = Array.from(appState.selectionMode.selectedIds);
                    if (selectedIds.length === 0) {
                         toast('info', 'Tidak ada item yang dipilih untuk dihapus.');
                         return;
                     }
                    const itemsToDelete = selectedIds.map(id => {
                        const item = Array.isArray(appState.recycledItemsCache) ? appState.recycledItemsCache.find(i => i.id === id) : null;
                        return item ? { id: item.id, table: item.table } : null;
                    }).filter(Boolean);
                     if (itemsToDelete.length > 0) {
                         _handleDeletePermanentItems(itemsToDelete);
                     } else toast('error', 'Gagal mendapatkan detail item dari cache untuk dihapus.');
                }
                break;
            case 'open-selection-summary':
                handleOpenSelectionSummaryModal();
                break;
            case 'open-absence-status-panel':
                {
                    const selectedIds = Array.from(appState.selectionMode.selectedIds);
                    if (selectedIds.length === 0) {
                        toast('info', 'Pilih minimal satu pekerja.');
                        return;
                    }
                    (async () => {
                        const mod = await import('../../services/data/attendanceService.js');
                        if (typeof mod.openManualAbsenceStatusPanel === 'function') {
                            mod.openManualAbsenceStatusPanel(selectedIds);
                        }
                    })();
                }
                break;
            case 'forward-to-comments':
                {
                     const selectedIds = Array.from(appState.selectionMode.selectedIds);
                     if (selectedIds.length === 0) {
                         toast('info', 'Pilih minimal satu item untuk diKomentarkan.');
                         return;
                     }
                     const firstItem = (appState.tagihan?.currentList || appState.pemasukan?.currentList || []).find(item => selectedIds.includes(item.id));

                     if(!firstItem) return;

                     let parentId = firstItem.id;
                     let parentType = 'bill';

                     if (appState.selectionMode.pageContext === 'tagihan') {
                         const bill = appState.bills.find(b => b.id === firstItem.id);
                         if (bill) {
                             parentId = bill.expenseId || bill.id;
                             parentType = bill.expenseId ? 'expense' : 'bill';
                         }
                     } else if (appState.selectionMode.pageContext === 'pemasukan') {
                         parentId = firstItem.id;
                         parentType = appState.activeSubPage.get('pemasukan') === 'termin' ? 'income' : 'funding_source';
                     }


                     const prefilledText = `Membahas item terpilih:\n${selectedIds.map(itemId => {
                         const item = (appState.tagihan?.currentList || appState.pemasukan?.currentList || []).find(i => i.id === itemId);
                         return `- ${item?.description || 'Item'}`;
                     }).join('\n')}`;

                     emit('ui.modal.openComments', { parentId, parentType, prefilledText });
                     deactivateSelectionMode();
                }
                break;
             default:
                 console.log(`[Selection Listener] Unhandled selection action: ${action}`);
        }
    });

    on('ui.selection.activated', (context) => {
        let selectionBar = document.getElementById('selection-bar');
        if (!selectionBar) {
             console.error("Selection bar element not found!");
             return;
        }
        selectionBar.classList.add('show');
        _updateSelectionCount();
        updateGlobalSelectionActions(context);
    });
    on('ui.selection.deactivate', () => deactivateSelectionMode());
    on('ui.selection.updateCount', () => _updateSelectionCount());
}

