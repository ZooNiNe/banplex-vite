import { appState } from '../../state/appState.js';
import { $ } from '../../utils/dom.js';
import { createPageToolbarHTML } from '../components/toolbar.js';
import { createUnifiedCard } from '../components/cards.js';
import { getEmptyStateHTML, getEndOfListPlaceholderHTML } from '../components/emptyState.js';
import { formatDate } from '../../utils/formatters.js';
import { emit, on, off } from '../../state/eventBus.js';
import { initInfiniteScroll, cleanupInfiniteScroll } from '../components/infiniteScroll.js';
import { createListSkeletonHTML } from '../components/skeleton.js';
import { localDB } from '../../services/localDbService.js';
import { masterDataConfig } from '../../config/constants.js';
import { getJSDate } from '../../utils/helpers.js';
import { createTabsHTML } from '../components/tabs.js';

function createIcon(iconName, size = 18, classes = '') {
    const icons = {
        label: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-tag ${classes}"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.432 0l6.568-6.568a2.426 2.426 0 0 0 0-3.432l-8.704-8.704Z"/><path d="M6 9h.01"/></svg>`,
        'calendar-x-2': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar-x-2 ${classes}"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m14.5 14.5-5 5"/><path d="m9.5 14.5 5 5"/></svg>`,
        recycling: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-recycle ${classes}"><path d="M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5"/><path d="m11 19 3.143-3.143a3 3 0 0 0 .88-2.121V6.5"/><path d="m11 6.5 4.414-4.414A1.999 1.999 0 0 1 17.586 1H20"/><path d="M11 6.5a6 6 0 0 0-4.47 1.78L3.24 11.5"/><path d="M15.47 14.22 17 10.5h3l-1.6 2.77a3 3 0 0 1-4.39 1.25L13 14"/><path d="m17 10.5 4.815a1.83 1.83 0 0 1 1.57.881 1.785 1.785 0 0 1 .004 1.784L19.4 18"/></svg>`,
        'list-checks': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-list-checks ${classes}"><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg>`,
        trash: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash ${classes}"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
    };
    return icons[iconName] || '';
}

function getMainCategory(tableName) {
    const masterTables = Object.values(masterDataConfig).map(config => config.dbTable);
    const transactionTables = ['expenses', 'bills', 'incomes', 'funding_sources', 'attendance_records', 'stock_transactions', 'comments'];

    if (masterTables.includes(tableName)) {
        return 'master';
    } else if (transactionTables.includes(tableName)) {
        return 'transaksi';
    }
    return 'lainnya';
}

function cleanupTrashSentinel() {
    if (currentTrashSentinel && trashObserverInstance) {
        trashObserverInstance.unobserve(currentTrashSentinel);
    }
    if (currentTrashSentinel) {
        currentTrashSentinel.remove();
    }
    currentTrashSentinel = null;
}

function attachTrashSentinel(container) {
    if (!container) return;
    const sentinel = document.createElement('div');
    sentinel.id = 'infinite-scroll-sentinel';
    sentinel.style.height = '10px';
    container.appendChild(sentinel);
    currentTrashSentinel = sentinel;
    if (trashObserverInstance) {
        trashObserverInstance.observe(sentinel);
    }
}

function removeTrashEndPlaceholder(container) {
    container.querySelector('.end-of-list-placeholder')?.remove();
}

const ITEMS_PER_PAGE_TRASH = 30;
let trashObserverInstance = null;
let pageAbortController = null;
let pageEventListenerController = null;
let currentTrashSentinel = null;

async function renderRecycleBinContent(append = false) {
    if (!append && pageAbortController) pageAbortController.abort();
    if (!append) pageAbortController = new AbortController();
    const signal = pageAbortController.signal;

    const container = $('#sub-page-content');
    if (!container) return;

    if (!append) {
        container.innerHTML = createListSkeletonHTML(5);
        appState.recycledItemsCache = null;
    }

    try {
        if (!appState.recycledItemsCache) {
            const deletedItems = [];
            const masterTables = Object.values(masterDataConfig).map(config => config.dbTable);
            const availableCategories = new Set(['all']);

            // --- PERBAIKAN: Logika "Kopi dan Gula" Dimulai ---
            const processedExpenseIds = new Set(); // Gula (Expenses) yang sudah terikat ke Kopi (Bills)
            const allTableNames = new Set(['bills', 'expenses', 'incomes', 'funding_sources', 'attendance_records', 'stock_transactions', 'comments', ...masterTables]);

            // Helper untuk mendapatkan metadata (disalin dari loop lama)
            const getItemMetadata = (item, tableName) => {
                const config = Object.values(masterDataConfig).find(c => c.dbTable === tableName);
                let typeName = 'Data';
                if (config) {
                    typeName = config.title;
                } else {
                    const nameMap = {
                        expenses: 'Pengeluaran', bills: 'Tagihan', incomes: 'Pemasukan',
                        funding_sources: 'Pinjaman', attendance_records: 'Absensi',
                        stock_transactions: 'Stok Opname', comments: 'Komentar'
                    };
                    typeName = nameMap[tableName] || tableName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                }
                const mainCat = getMainCategory(tableName);
                return { type: typeName, mainCategory: mainCat };
            };

            // 1. Pindai Bills (Kopi) terlebih dahulu
            if (allTableNames.has('bills')) {
                try {
                    const table = localDB['bills'];
                    const deletedBills = await table.where('isDeleted').equals(1).toArray();
                    
                    for (const item of deletedBills) {
                        const { type, mainCategory } = getItemMetadata(item, 'bills');
                        if (mainCategory) availableCategories.add(mainCategory);
                        
                        deletedItems.push({ ...item, table: 'bills', type, mainCategory });
                        
                        // Jika ini bill non-gaji/fee, catat 'gula' (expenseId) nya
                        if (item.expenseId && item.type !== 'gaji' && item.type !== 'fee') {
                            processedExpenseIds.add(item.expenseId);
                        }
                    }
                } catch(e) { console.warn(`[RecycleBin] Gagal memindai tabel bills:`, e); }
                allTableNames.delete('bills'); // Hapus dari daftar pindaian
            }

            // 2. Pindai Expenses (Gula)
            if (allTableNames.has('expenses')) {
                try {
                    const table = localDB['expenses'];
                    const deletedExpenses = await table.where('isDeleted').equals(1).toArray();
                    
                    for (const item of deletedExpenses) {
                        // HANYA tambahkan expense JIKA ID-nya BELUM diproses (bukan Gula dari Kopi)
                        if (!processedExpenseIds.has(item.id)) {
                            const { type, mainCategory } = getItemMetadata(item, 'expenses');
                            if (mainCategory) availableCategories.add(mainCategory);
                            
                            deletedItems.push({ ...item, table: 'expenses', type, mainCategory });
                        }
                        // Jika sudah diproses, kita abaikan (karena sudah menempel pada 'Kopi'/Bill)
                    }
                } catch(e) { console.warn(`[RecycleBin] Gagal memindai tabel expenses:`, e); }
                allTableNames.delete('expenses'); // Hapus dari daftar pindaian
            }

            // 3. Pindai semua tabel sisanya (Incomes, Workers, dll)
            for (const tableName of allTableNames) {
                if (signal?.aborted) throw new DOMException('Operation aborted', 'AbortError');
                try {
                    const table = localDB[tableName];
                    if (!table) continue;

                    const deleted = await table.where('isDeleted').equals(1).toArray();
                    if (deleted.length === 0) continue;

                    // Asumsi semua item di tabel ini punya metadata yang sama
                    const { type, mainCategory } = getItemMetadata(deleted[0], tableName);
                    if (mainCategory) availableCategories.add(mainCategory);

                    deleted.forEach(item => deletedItems.push({
                        ...item,
                        table: tableName,
                        type: type,
                        mainCategory: mainCategory
                    }));
                } catch (e) {
                    console.warn(`[RecycleBin] Gagal memindai tabel ${tableName}:`, e);
                }
            }
            // --- AKHIR PERBAIKAN ---

            if (signal?.aborted) throw new DOMException('Operation aborted', 'AbortError');
            appState.recycledItemsCache = deletedItems.sort((a,b) => getJSDate(b.updatedAt || b.createdAt).getTime() - getJSDate(a.updatedAt || b.createdAt).getTime());
            appState.availableRecycleCategories = Array.from(availableCategories);
        }

        const activeFilter = appState.recycleBinFilter?.category || 'all';
        const filteredItems = activeFilter === 'all'
            ? appState.recycledItemsCache
            : appState.recycledItemsCache.filter(item => item.mainCategory === activeFilter);

        const categoryContainer = $('#recycle-bin-category-filters');
        if (categoryContainer && appState.availableRecycleCategories) {
            const categoryFiltersData = [{ id: 'all', label: 'Semua' }];
            if (appState.availableRecycleCategories.includes('transaksi')) categoryFiltersData.push({ id: 'transaksi', label: 'Transaksi' });
            if (appState.availableRecycleCategories.includes('master')) categoryFiltersData.push({ id: 'master', label: 'Master Data' });
            if (appState.availableRecycleCategories.includes('lainnya')) {
                categoryFiltersData.push({ id: 'lainnya', label: 'Lainnya' });
            }

            categoryContainer.innerHTML = createTabsHTML({
                id: 'recycle-bin-category-nav',
                tabs: categoryFiltersData,
                activeTab: activeFilter,
                customClasses: 'category-sub-nav'
            });
             const navPills = categoryContainer.querySelector('#recycle-bin-category-nav');
             if (navPills && !navPills.dataset.listenerAttached) {
                 navPills.addEventListener('click', (e) => {
                     const tabButton = e.target.closest('.sub-nav-item');
                     if (tabButton && !tabButton.classList.contains('active')) {
                         appState.recycleBinFilter = { category: tabButton.dataset.tab };
                         renderRecycleBinContent(false);
                     }
                 });
                 navPills.dataset.listenerAttached = 'true';
             }
        }

        const selectionActive = appState.selectionMode.active && appState.selectionMode.pageContext === 'recycleBin';

        if (filteredItems.length === 0) {
             let emptyTitle = 'Keranjang Sampah Kosong';
             let emptyDesc = 'Tidak ada item yang dihapus sementara.';
             if (activeFilter !== 'all') {
                 emptyTitle = `Tidak Ada Sampah ${activeFilter === 'transaksi' ? 'Transaksi' : 'Master Data'}`;
                 emptyDesc = `Tidak ada item ${activeFilter === 'transaksi' ? 'transaksi' : 'master data'} yang dihapus dalam kategori ini.`;
             }
            container.innerHTML = getEmptyStateHTML({ icon: 'recycling', title: emptyTitle, desc: emptyDesc });
            return;
        }

        const paginationKey = `recycle_${activeFilter}`;
        if (!appState.pagination[paginationKey] || !append) {
            appState.pagination[paginationKey] = { isLoading: false, hasMore: true, page: 0 };
        }
        const paginationState = appState.pagination[paginationKey];
        
        const startIndex = append ? (paginationState.page + 1) * ITEMS_PER_PAGE_TRASH : 0;
        const endIndex = startIndex + ITEMS_PER_PAGE_TRASH;
        const itemsToRender = filteredItems.slice(startIndex, endIndex);

        if (append || startIndex === 0) {
            paginationState.page = Math.floor(startIndex / ITEMS_PER_PAGE_TRASH);
        }
        paginationState.hasMore = endIndex < filteredItems.length;
        paginationState.isLoading = false;

        if (append && itemsToRender.length === 0) {
            container.querySelector('#list-skeleton')?.remove();
            return;
        }

        const itemHtml = itemsToRender.map(item => {
            const config = Object.values(masterDataConfig).find(c => c.dbTable === item.table);
            const title = item.description || item[config?.nameField] || item.name || 'Item Dihapus';
            const metaBadges = [
                { icon: 'label', text: item.type || 'Data' },
                { icon: 'calendar-x-2', text: `Dihapus: ${formatDate(item.updatedAt || item.createdAt)}` } 
            ];
            const showMoreIcon = !selectionActive;
            const itemId = item.id;
            const uniqueDomId = `trash-${itemId}`;
            const isSelected = selectionActive && appState.selectionMode.selectedIds.has(itemId);
            
            // PERBAIKAN: Kirim 'type' yang benar untuk logic pemulihan
            // (Misal: 'bill', 'expense', 'worker', dll.)
            const dataset = { 
                itemId: itemId, 
                table: item.table, 
                title: title, 
                type: item.table // 'type' di sini merujuk ke nama tabel
            };

            return createUnifiedCard({
                id: uniqueDomId,
                title,
                metaBadges,
                dataset: dataset,
                moreAction: showMoreIcon,
                actions: [],
                selectionEnabled: selectionActive,
                isSelected: isSelected
            });
        }).join('');

        let newlyAddedElements = [];
        let listWrapper = container.querySelector('.wa-card-list-wrapper');

        if (append && listWrapper) {
            listWrapper.insertAdjacentHTML('beforeend', itemHtml);
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = itemHtml;
            newlyAddedElements = Array.from(tempDiv.children);
        } else {
            container.innerHTML = `<div class="wa-card-list-wrapper">${itemHtml}</div>`;
            listWrapper = container.querySelector('.wa-card-list-wrapper');
            if (listWrapper) {
                newlyAddedElements = Array.from(listWrapper.querySelectorAll('.wa-card-v2-wrapper'));
            }
        }
        
        newlyAddedElements.forEach((el, idx) => {
            if (!el.hasAttribute('data-animated')) {
                el.style.animationDelay = `${Math.min(idx, 20) * 22}ms`;
                el.classList.add('item-entering');
                el.setAttribute('data-animated', 'true');
            }
        });
        
        container.querySelector('#list-skeleton')?.remove();
        cleanupTrashSentinel();
        removeTrashEndPlaceholder(container);

        if (paginationState.hasMore) {
            container.insertAdjacentHTML('beforeend', `<div id="list-skeleton" class="skeleton-wrapper">${createListSkeletonHTML(3)}</div>`);
            attachTrashSentinel(container);
        } else {
            container.insertAdjacentHTML('beforeend', getEndOfListPlaceholderHTML());
        }
    } catch(e) {
        if (e.name !== 'AbortError') {
             container.innerHTML = getEmptyStateHTML({ icon: 'error', title: 'Gagal Memuat', desc: 'Terjadi kesalahan saat memuat keranjang sampah.' });
        }
    } finally {
        if (!append && signal === pageAbortController?.signal) {
             pageAbortController = null;
        }
        const activeFilter = appState.recycleBinFilter?.category || 'all';
        const paginationKey = `recycle_${activeFilter}`;
        if (appState.pagination[paginationKey]) {
            appState.pagination[paginationKey].isLoading = false;
        }
    }
}

function loadMoreRecycleBin() {
    if (appState.activePage !== 'recycle_bin') return;
    
    const activeFilter = appState.recycleBinFilter?.category || 'all';
    const paginationKey = `recycle_${activeFilter}`;
    const state = appState.pagination[paginationKey];
    if (!state || state.isLoading || !state.hasMore) return;
    
    state.isLoading = true;
    const container = $('#sub-page-content');
    if (container && !container.querySelector('#list-skeleton')) {
        container.insertAdjacentHTML('beforeend', `<div id="list-skeleton" class="skeleton-wrapper">${createListSkeletonHTML(3)}</div>`);
    }
    
    setTimeout(() => {
        renderRecycleBinContent(true);
    }, 300);
}

function initRecycleBinPage() {
    if (pageAbortController) pageAbortController.abort();
    if (pageEventListenerController) pageEventListenerController.abort();
    pageAbortController = new AbortController();
    pageEventListenerController = new AbortController();
    const { signal: listenerSignal } = pageEventListenerController;
    
    trashObserverInstance = null;
    appState.recycledItemsCache = null;
    appState.availableRecycleCategories = null;
    appState.selectionMode.active = false;
    appState.selectionMode.selectedIds.clear();
    appState.recycleBinFilter = { category: 'all' };

    const container = $('.page-container');

    const pageToolbarHTML = createPageToolbarHTML({
        title: 'Keranjang Sampah',
        actions: [],
    });

    const categoryFiltersHTMLContainer = `<div id="recycle-bin-category-filters"></div>`;

    const heroHTML = `
        <div class="list-hero list-hero--recycle">
            <div class="list-hero__content">
                <div class="list-hero__title">Keranjang Sampah</div>
                <div class="list-hero__subtitle">Pulihkan atau kosongkan item yang dihapus.</div>
            </div>
            <div class="list-hero__art" aria-hidden="true">
                <svg width="88" height="72" viewBox="0 0 88 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <linearGradient id="gRecycle" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.18" />
                            <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.05" />
                        </linearGradient>
                    </defs>
                    <rect x="8" y="14" width="56" height="36" rx="8" fill="url(#gRecycle)" stroke="var(--line)"/>
                    <path d="M20 34c4-10 16-10 20 0" stroke="var(--primary)" stroke-width="3" opacity="0.4"/>
                    <path d="M16 30l4-6 4 6" stroke="var(--primary)" stroke-width="3" opacity="0.5"/>
                    <path d="M36 30l4-6 4 6" stroke="var(--primary)" stroke-width="3" opacity="0.5"/>
                </svg>
            </div>
        </div>`;

    container.innerHTML = `
        <div class="content-panel">
            <div class="panel-header">
                ${pageToolbarHTML}
                ${heroHTML}
                ${categoryFiltersHTMLContainer}
            </div>
            <div id="sub-page-content" class="panel-body scrollable-content"></div>
        </div>
    `;

    trashObserverInstance = initInfiniteScroll('#sub-page-content');

    const cleanupRecycleBin = () => {
        cleanupTrashSentinel();
        try { cleanupInfiniteScroll(); } catch(_) {}
        if (pageAbortController) pageAbortController.abort();
        if (pageEventListenerController) pageEventListenerController.abort();
        
        trashObserverInstance = null;
        pageAbortController = null;
        pageEventListenerController = null;
        appState.recycledItemsCache = null;
        
        off('app.unload.recycle_bin', cleanupRecycleBin);
    };

    off('app.unload.recycle_bin', cleanupRecycleBin);
    on('app.unload.recycle_bin', cleanupRecycleBin);
    on('ui.recycleBin.renderContent', () => renderRecycleBinContent(false), { signal: listenerSignal });
    on('request-more-data', loadMoreRecycleBin, { signal: listenerSignal });
    emit('ui.recycleBin.renderContent');
}

function getRecycleBinHeaderOverflowActions() {
    return [
        { icon: 'list-checks', label: 'Pilih Banyak', action: 'activate-selection-mode', pageContext: 'recycleBin' }, 
        { icon: 'trash', label: 'Kosongkan Sampah', action: 'empty-recycle-bin' }, 
    ];
}

export { initRecycleBinPage, getRecycleBinHeaderOverflowActions };
