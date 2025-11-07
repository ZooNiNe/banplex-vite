// js/ui/pages/pemasukan.js

import { appState } from '../../state/appState.js';
import { $ } from '../../utils/dom.js';
import { createPageToolbarHTML } from '../components/toolbar.js';
import { createTabsHTML } from '../components/tabs.js';
import { emit, on, off } from '../../state/eventBus.js';
import { liveQueryMulti } from '../../state/liveQuery.js';
import { _getSinglePemasukanHTML } from '../components/cards.js';
import { getEmptyStateHTML, getEndOfListPlaceholderHTML } from '../components/emptyState.js';
import { getJSDate } from '../../utils/helpers.js';
import { formatDate, fmtIDR } from '../../utils/formatters.js';
import { initInfiniteScroll, cleanupInfiniteScroll } from '../components/infiniteScroll.js';
import { createListSkeletonHTML } from '../components/skeleton.js';
import { createModal, closeModal } from '../components/modal.js';
import { ensureMasterDataFresh } from '../../services/data/ensureMasters.js';

const ITEMS_PER_PAGE = 15;
const INITIAL_LOAD_THRESHOLD = 20;
let pageObserverInstance = null;
let renderDebounceTimer = null;
let pageAbortController = null;
let pageEventListenerController = null;
let unsubscribeLiveQuery = null;

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function createIcon(iconName, size = 18, classes = '') {
    const icons = {
        'arrow-down': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-down ${classes}"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>`,
        'arrow-up': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-up ${classes}"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>`,
        sort: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-up-down ${classes}"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg>`,
    };
    return icons[iconName] || '';
}
function groupItemsByDate(items, dateField = 'date') {
    const grouped = {};
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    items.forEach(item => {
        const sortDate = getJSDate(item.createdAt || item[dateField]);
        const displayDateKey = getJSDate(item[dateField]).toISOString().slice(0, 10);

        let groupLabel;
        if (displayDateKey === today) {
            groupLabel = "Hari Ini";
        } else if (displayDateKey === yesterday) {
            groupLabel = "Kemarin";
        } else {
            groupLabel = formatDate(displayDateKey, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        }
        if (!grouped[groupLabel]) {
            grouped[groupLabel] = [];
        }
        grouped[groupLabel].push(item);
    });

    for (const label in grouped) {
        grouped[label].sort((a, b) => getJSDate(b.createdAt || b.date) - getJSDate(a.createdAt || a.date));
    }

    return grouped;
}

function renderGroupedList(groupedData, type) {
    let html = '';
    const sortedGroupLabels = Object.keys(groupedData).sort((a, b) => {
        if (a === "Hari Ini") return -1;
        if (b === "Hari Ini") return 1;
        if (a === "Kemarin") return -1;
        if (b === "Kemarin") return 1;
        const firstItemA = groupedData[a]?.[0];
        const firstItemB = groupedData[b]?.[0];
        if (!firstItemA || !firstItemB) return 0;
        const dateA = getJSDate(firstItemA.date);
        const dateB = getJSDate(firstItemB.date);
        return dateB - dateA;
    });

    sortedGroupLabels.forEach(label => {
        html += `<div class="date-group-header">${label}</div>`;
        html += `<div class="date-group-body">${groupedData[label].map(item => _getSinglePemasukanHTML(item, type)).join('')}</div>`;
    });
    
    // --- PERBAIKAN DI SINI ---
    // Hapus wrapper div dari return statement ini
    return html;
    // --- AKHIR PERBAIKAN ---
}


async function renderPemasukanContent(append = false) {
    if (!append && pageAbortController) {
        pageAbortController.abort();
    }
    if (!append) {
        pageAbortController = new AbortController();
    }
    const signal = pageAbortController?.signal;
    
    const container = $('#sub-page-content');
    if (!container) return;

    if (!append) {
        container.innerHTML = createListSkeletonHTML(5);
    }

    try {
        await ensureMasterDataFresh(['projects', 'fundingCreditors'], { signal });
        if (signal?.aborted) return;

        const activeTab = appState.activeSubPage.get('pemasukan') || 'pinjaman';
        let itemsSource = [];
        if (activeTab === 'termin') {
            itemsSource = (appState.incomes || []).filter(item => !item.isDeleted);
        } else {
            itemsSource = (appState.fundingSources || []).filter(item => !item.isDeleted);
            const statusFilter = appState.pemasukanFilter?.status || 'all';
            if (statusFilter !== 'all') {
                itemsSource = itemsSource.filter(item => item.status === statusFilter);
            }
        }

        const { sortBy = 'date', sortDirection = 'desc' } = appState.pemasukanFilter || {};
        itemsSource.sort((a, b) => {
            let comparison = 0;
            if (sortBy === 'amount') {
                const amountA = a.totalAmount ?? a.amount ?? 0;
                const amountB = b.totalAmount ?? b.amount ?? 0;
                comparison = amountA - amountB;
            } else {
                const dateA = getJSDate(a.date);
                const dateB = getJSDate(b.date);
                comparison = dateA - dateB;
            }

            if (comparison === 0) {
                const createdAtA = getJSDate(a.createdAt || a.date);
                const createdAtB = getJSDate(b.createdAt || b.date);
                 comparison = createdAtB - createdAtA;
                 if (sortDirection === 'asc') comparison = -comparison;
            }

            return sortDirection === 'desc' ? -comparison : comparison;
        });

        appState.pemasukan.currentList = itemsSource;

        const paginationKey = `pemasukan_${activeTab}`;
         if (!appState.pagination[paginationKey] || !append) {
            appState.pagination[paginationKey] = { isLoading: false, hasMore: true, page: 0 };
        }
        const paginationState = appState.pagination[paginationKey];

        const startIndex = append ? (paginationState.page + 1) * ITEMS_PER_PAGE : 0;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        
        let itemsToDisplay;
        if (!append && itemsSource.length <= INITIAL_LOAD_THRESHOLD) {
            itemsToDisplay = itemsSource;
            paginationState.page = 0;
            paginationState.hasMore = false;
        } else {
            itemsToDisplay = itemsSource.slice(startIndex, endIndex);
            paginationState.hasMore = endIndex < itemsSource.length;
            if (append || startIndex === 0) {
                paginationState.page = Math.floor(startIndex / ITEMS_PER_PAGE);
            }
        }
        
        paginationState.isLoading = false;

        const existingLoader = container.querySelector('.loading-indicator');
        if (existingLoader) existingLoader.remove();

        if (!append && itemsSource.length === 0) {
            let title = `Tidak Ada ${activeTab === 'termin' ? 'Termin' : 'Pinjaman'}`;
            let desc = `Belum ada data ${activeTab} yang tercatat.`;
            if (activeTab === 'pinjaman' && (appState.pemasukanFilter?.status !== 'all')) {
                desc = `Tidak ada pinjaman dengan status "${appState.pemasukanFilter.status === 'paid' ? 'Lunas' : 'Belum Lunas'}" yang tercatat.`;
            }
            container.innerHTML = getEmptyStateHTML({ icon: 'account_balance_wallet', title, desc });
            return;
        }
        
        if (append && itemsToDisplay.length === 0) {
            container.querySelector('#list-skeleton')?.remove();
            return;
        }

        // listHTML sekarang HANYA berisi grup-grup
        const groupedData = groupItemsByDate(itemsToDisplay, 'date');
        const listHTML = renderGroupedList(groupedData, activeTab);
        
        if (signal?.aborted) return; 

        let newlyAddedElements = [];
        let listWrapper = container.querySelector('#income-grouped-wrapper');

        if (append) {
            if (!listWrapper) {
                // --- PERBAIKAN: Tambahkan wrapper di sini ---
                container.innerHTML = `<div class="wa-card-list-wrapper grouped" id="income-grouped-wrapper">${listHTML}</div>`;
                listWrapper = container.querySelector('#income-grouped-wrapper');
            } else {
                // --- PERBAIKAN: Logika ini sekarang sudah benar ---
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = listHTML; // listHTML HANYA berisi grup
                newlyAddedElements = Array.from(tempDiv.children); // elemen adalah grup
                newlyAddedElements.forEach(el => listWrapper.appendChild(el)); // Menambahkan grup ke wrapper
            }
        } else {
            // --- PERBAIKAN: Tambahkan wrapper di sini ---
            container.innerHTML = `<div class="wa-card-list-wrapper grouped" id="income-grouped-wrapper">${listHTML}</div>`;
            listWrapper = container.querySelector('#income-grouped-wrapper');
            container.scrollTop = 0;
        }
        
        if (listWrapper && !append) {
            newlyAddedElements = Array.from(listWrapper.querySelectorAll('.wa-card-v2-wrapper'));
        }

        newlyAddedElements.forEach((el, idx) => {
            if (!el.hasAttribute('data-animated')) {
                el.style.animationDelay = `${Math.min(idx, 20) * 22}ms`;
                el.classList.add('item-entering');
                el.setAttribute('data-animated', 'true');
            }
        });

        container.querySelector('#list-skeleton')?.remove();
        const oldSentinel = container.querySelector('#infinite-scroll-sentinel');
        if (oldSentinel) {
            if (pageObserverInstance) pageObserverInstance.unobserve(oldSentinel);
            oldSentinel.remove();
        }
    
        if (paginationState.hasMore) {
            container.insertAdjacentHTML('beforeend', `<div id="list-skeleton" class="skeleton-wrapper">${createListSkeletonHTML(3)}</div>`);
            const sentinel = document.createElement('div');
            sentinel.id = 'infinite-scroll-sentinel';
            sentinel.style.height = '10px';
            container.appendChild(sentinel);
    
            if (pageObserverInstance) {
                pageObserverInstance.observe(sentinel);
            } else {
                pageObserverInstance = initInfiniteScroll('#sub-page-content');
                if (pageObserverInstance) pageObserverInstance.observe(sentinel);
            }
        } else if (itemsSource.length > 0) {
            container.insertAdjacentHTML('beforeend', getEndOfListPlaceholderHTML());
        }

        if (listWrapper && !listWrapper.__collapseBound) {
            listWrapper.addEventListener('click', (e) => {
                const header = e.target.closest('.date-group-header');
                if (!header) return;
                const body = header.nextElementSibling;
                if (body && body.classList.contains('date-group-body')) {
                    header.classList.toggle('collapsed');
                    body.classList.toggle('collapsed');
                }
            });
            listWrapper.__collapseBound = true;
        }
    } catch(e) {
        if (e.name !== 'AbortError') {
            container.innerHTML = getEmptyStateHTML({ icon: 'error', title: 'Gagal Memuat', desc: 'Terjadi kesalahan saat memuat data pemasukan.' });
        }
    } finally {
        if (!append && signal === pageAbortController?.signal) {
             pageAbortController = null;
        }
        const activeTab = appState.activeSubPage.get('pemasukan') || 'pinjaman';
        const paginationKey = `pemasukan_${activeTab}`;
        if (appState.pagination[paginationKey]) {
            appState.pagination[paginationKey].isLoading = false;
        }
    }
}

// ... (sisa file: loadMorePemasukan, _showPemasukanSortModal, initPemasukanPage, export) ...
function loadMorePemasukan() {
    if (appState.activePage !== 'pemasukan') return;

    const activeTab = appState.activeSubPage.get('pemasukan') || 'termin';
    const paginationKey = `pemasukan_${activeTab}`;
    let paginationState = appState.pagination[paginationKey];

    if (!paginationState) {
        appState.pagination[paginationKey] = { isLoading: false, hasMore: true, page: 0 };
        paginationState = appState.pagination[paginationKey];
    }
    
    if (paginationState.isLoading || !paginationState.hasMore) {
        return;
    }

    paginationState.isLoading = true;
    const container = $('#sub-page-content');
    const skeleton = container?.querySelector('#list-skeleton');
    if (!skeleton) {
        container?.insertAdjacentHTML('beforeend', `<div id="list-skeleton" class="skeleton-wrapper">${createListSkeletonHTML(3)}</div>`);
    }

    setTimeout(() => {
        renderPemasukanContent(true);
    }, 500);
}
function _showPemasukanSortModal(onApply) {
    const { sortBy = 'date', sortDirection = 'desc' } = appState.pemasukanFilter || {};
    const content = `
        <form id="pemasukan-sort-form">
            <div class="form-group">
                <label>Urutkan Berdasarkan</label>
                <div class="segmented-control">
                    <input type="radio" id="sort-pemasukan-date" name="sortBy" value="date" ${sortBy === 'date' ? 'checked' : ''}>
                    <label for="sort-pemasukan-date">Tanggal</label>
                    <input type="radio" id="sort-pemasukan-amount" name="sortBy" value="amount" ${sortBy === 'amount' ? 'checked' : ''}>
                    <label for="sort-pemasukan-amount">Jumlah</label>
                </div>
            </div>
            <div class="form-group">
                <label>Arah Pengurutan</label>
                <div class="segmented-control" id="sort-direction-control">
                    <input type="radio" id="sort-pemasukan-desc" name="sortDir" value="desc" ${sortDirection === 'desc' ? 'checked' : ''}>
                    <label for="sort-pemasukan-desc">${createIcon('arrow-down', 16)} Terbaru/Terbesar</label>
                    <input type="radio" id="sort-pemasukan-asc" name="sortDir" value="asc" ${sortDirection === 'asc' ? 'checked' : ''}>
                    <label for="sort-pemasukan-asc">${createIcon('arrow-up', 16)} Terlama/Terkecil</label>
                </div>
            </div>
        </form>
    `;

    const footer = `<button type="submit" class="btn btn-primary" form="pemasukan-sort-form">Terapkan</button>`;

    const modalEl = createModal('formView', {
      title: 'Urutkan Pemasukan',
      content,
      footer,
      isUtility: true
    });
    if (!modalEl) return;

    const form = modalEl.querySelector('#pemasukan-sort-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      appState.pemasukanFilter = appState.pemasukanFilter || {};
      appState.pemasukanFilter.sortBy = form.querySelector('input[name="sortBy"]:checked').value;
      appState.pemasukanFilter.sortDirection = form.querySelector('input[name="sortDir"]:checked').value;
      if (typeof onApply === 'function') onApply();
      closeModal(modalEl);
    });
}

function initPemasukanPage() {
    if (pageAbortController) pageAbortController.abort();
    pageAbortController = null;
    if (pageEventListenerController) pageEventListenerController.abort();
    pageEventListenerController = new AbortController();
    const { signal: listenerSignal } = pageEventListenerController;
    
    if (unsubscribeLiveQuery) unsubscribeLiveQuery.unsubscribe();
    unsubscribeLiveQuery = null;
    
    pageObserverInstance = null;
    
    const container = $('.page-container');
    container.classList.add('page-container--has-panel');

    if (!appState.pemasukanFilter) {
        appState.pemasukanFilter = { status: 'all', sortBy: 'date', sortDirection: 'desc' };
    } else {
        appState.pemasukanFilter.sortBy = appState.pemasukanFilter.sortBy || 'date';
        appState.pemasukanFilter.sortDirection = appState.pemasukanFilter.sortDirection || 'desc';
    }
    appState.pagination.pemasukan_termin = { isLoading: false, hasMore: true, page: 0 };
    appState.pagination.pemasukan_pinjaman = { isLoading: false, hasMore: true, page: 0 };

    const pageToolbarHTML = createPageToolbarHTML({
        title: 'Pemasukan'
    });

    const mainTabsData = [
        { id: 'termin', label: 'Termin Proyek' },
        { id: 'pinjaman', label: 'Pinjaman' },
    ];
    const initialActiveTab = appState.activeSubPage.get('pemasukan') || 'pinjaman';
    appState.activeSubPage.set('pemasukan', initialActiveTab);
    const mainTabsHTML = createTabsHTML({ id: 'pemasukan-tabs', tabs: mainTabsData, activeTab: initialActiveTab, customClasses: 'tabs-underline two-tabs' });

    const statusFiltersData = [
        { id: 'all', label: 'Semua' },
        { id: 'unpaid', label: 'Belum Lunas' },
        { id: 'paid', label: 'Lunas' },
    ];
    const initialStatusFilter = appState.pemasukanFilter.status || 'all';
    const statusFiltersHTML = createTabsHTML({
        id: 'pinjaman-status-filters',
        tabs: statusFiltersData,
        activeTab: initialStatusFilter,
        customClasses: 'category-sub-nav'
    });


    const heroHTML = `
        <div class="list-hero list-hero--income">
            <div class="list-hero__content">
                <div class="list-hero__title">Semua Pemasukan Dalam Satu Tampilan</div>
                <div class="list-hero__subtitle">Termin proyek dan pinjaman dengan UI lebih halus.</div>
            </div>
            <div class="list-hero__art" aria-hidden="true">
                <svg width="88" height="72" viewBox="0 0 88 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <linearGradient id="gIncome" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.18" />
                            <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.05" />
                        </linearGradient>
                    </defs>
                    <rect x="8" y="14" width="56" height="36" rx="8" fill="url(#gIncome)" stroke="var(--line)"/>
                    <rect x="16" y="24" width="20" height="6" rx="3" fill="var(--primary)" opacity="0.25" />
                    <rect x="16" y="34" width="28" height="6" rx="3" fill="var(--primary)" opacity="0.15" />
                    <g transform="translate(58, 38)">
                        <circle cx="16" cy="16" r="12" fill="var(--bg)" stroke="var(--primary)" opacity="0.6"/>
                        <path d="M10 16l4 4 8-8" stroke="var(--primary)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                    </g>
                </svg>
            </div>
        </div>`;

    container.innerHTML = `
        <div class="content-panel">
            <div class="panel-header">
                ${pageToolbarHTML}
                ${heroHTML}
                ${mainTabsHTML}
                <div id="status-filters-container">${statusFiltersHTML}</div>
            </div>
            <div id="sub-page-content" class="panel-body scrollable-content" data-infinite-scroll="true"></div>
        </div>
    `;

    const mainTabsContainer = container.querySelector('#pemasukan-tabs');
    const statusFiltersContainer = container.querySelector('#pinjaman-status-filters');
    const statusFiltersWrapper = container.querySelector('#status-filters-container');

    const updateStatusFilterVisibility = () => {
        const currentMainTab = appState.activeSubPage.get('pemasukan') || 'pinjaman';
        if (statusFiltersWrapper) {
             statusFiltersWrapper.style.display = currentMainTab === 'pinjaman' ? 'block' : 'none';
             if (currentMainTab !== 'pinjaman') {
                 appState.pemasukanFilter.status = 'all';
                 const activeStatusFilter = statusFiltersContainer?.querySelector('.sub-nav-item.active');
                 if (activeStatusFilter) activeStatusFilter.classList.remove('active');
                 const allStatusFilter = statusFiltersContainer?.querySelector('.sub-nav-item[data-tab="all"]');
                 if (allStatusFilter) allStatusFilter.classList.add('active');
             }
        }
    };

    if (mainTabsContainer) {
        mainTabsContainer.addEventListener('click', (e) => {
            const tabButton = e.target.closest('.sub-nav-item');
            if (tabButton && !tabButton.classList.contains('active')) {
                const currentActive = mainTabsContainer.querySelector('.sub-nav-item.active');
                if(currentActive) currentActive.classList.remove('active');
                tabButton.classList.add('active');
                appState.activeSubPage.set('pemasukan', tabButton.dataset.tab);
                updateStatusFilterVisibility();
                renderPemasukanContent(false);
            }
        }, { signal: listenerSignal });
    }

    if (statusFiltersContainer) {
        statusFiltersContainer.addEventListener('click', (e) => {
            const filterButton = e.target.closest('.sub-nav-item');
            if (filterButton && !filterButton.classList.contains('active')) {
                const currentActive = statusFiltersContainer.querySelector('.sub-nav-item.active');
                if(currentActive) currentActive.classList.remove('active');
                filterButton.classList.add('active');
                appState.pemasukanFilter.status = filterButton.dataset.tab;
                renderPemasukanContent(false);
            }
        }, { signal: listenerSignal });
    }


    pageObserverInstance = initInfiniteScroll('#sub-page-content');
    updateStatusFilterVisibility();
    emit('ui.pemasukan.renderContent');

    try {
        if (unsubscribeLiveQuery) unsubscribeLiveQuery.unsubscribe();
        
        unsubscribeLiveQuery = liveQueryMulti(
            ['incomes', 'fundingSources', 'projects', 'fundingCreditors'], 
            (changedKeys) => {
                if (appState.activePage === 'pemasukan') {
                    renderPemasukanContent(false);
                }
            }
        );

    } catch (e) {
    }

    const cleanupPemasukan = () => {
        try { cleanupInfiniteScroll(); } catch(_) {}
        if (pageAbortController) pageAbortController.abort();
        if (pageEventListenerController) pageEventListenerController.abort();
        if (unsubscribeLiveQuery) unsubscribeLiveQuery.unsubscribe();
        
        pageAbortController = null;
        pageEventListenerController = null;
        unsubscribeLiveQuery = null;
        pageObserverInstance = null;
        
        off('app.unload.pemasukan', cleanupPemasukan);
    };

    off('app.unload.pemasukan', cleanupPemasukan);
    on('app.unload.pemasukan', cleanupPemasukan);
    
    on('ui.pemasukan.renderContent', () => renderPemasukanContent(false), { signal: listenerSignal });
    on('request-more-data', loadMorePemasukan, { signal: listenerSignal });
    on('ui.modal.showPemasukanSort', (onApply) => _showPemasukanSortModal(onApply), { signal: listenerSignal });
}

export { initPemasukanPage };