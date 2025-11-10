import { appState } from '../../state/appState.js';
import { $ } from '../../utils/dom.js';
import { createPageToolbarHTML } from '../components/toolbar.js';
import { createTabsHTML } from '../components/tabs.js';
import { emit, on, off } from '../../state/eventBus.js';
import { _getBillsListHTML } from '../components/cards.js';
import { getEmptyStateHTML, getEndOfListPlaceholderHTML, getDetailPlaceholderHTML } from '../components/emptyState.js';
import { getJSDate } from '../../utils/helpers.js';
import { parseFormattedNumber, formatDate, fmtIDR } from '../../utils/formatters.js';
import { initInfiniteScroll, cleanupInfiniteScroll } from '../components/infiniteScroll.js';
import { createListSkeletonHTML } from '../components/skeleton.js';
import { fetchAndCacheData } from '../../services/data/fetch.js';
import { projectsCol, suppliersCol } from '../../config/firebase.js';
import { ensureMasterDataFresh } from '../../services/data/ensureMasters.js';
import { loadDataForPage } from '../../services/localDbService.js';
import { liveQueryMulti } from '../../state/liveQuery.js';
import { initPullToRefresh, destroyPullToRefresh } from "../components/pullToRefresh.js";
import { showLoadingModal, hideLoadingModal } from "../components/modal.js";

const ITEMS_PER_PAGE = 15;
const INITIAL_LOAD_THRESHOLD = 20;
let unsubscribeLiveQuery = null;
let pageAbortController = null;
let pageEventListenerController = null;
let renderDebounceTimer = null;
let pageObserverInstance = null;

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
function groupItemsByDate(items, dateField = 'dueDate') {
    const grouped = {};
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    items.forEach(item => {
        let sortDateValue, displayDateValue;
        try {
            sortDateValue = getJSDate(item.createdAt || item[dateField] || item.date);
            displayDateValue = getJSDate(item[dateField] || item.date);
            if (isNaN(sortDateValue.getTime()) || isNaN(displayDateValue.getTime())) {
                throw new Error("Invalid date");
            }
        } catch (e) {
            sortDateValue = new Date();
            displayDateValue = new Date();
        }

        const displayDateKey = displayDateValue.toISOString().slice(0, 10);

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
        grouped[label].sort((a, b) => {
             let dateA, dateB;
             try { dateA = getJSDate(a.createdAt || a.dueDate || a.date); if(isNaN(dateA.getTime())) throw Error();} catch(e){ dateA = new Date(0);}
             try { dateB = getJSDate(b.createdAt || b.dueDate || b.date); if(isNaN(dateB.getTime())) throw Error();} catch(e){ dateB = new Date(0);}
             return dateB - dateA;
        });
    }

    return grouped;
}

function renderGroupedList(groupedData, dateField = 'dueDate') {
    let html = '';
    const sortedGroupLabels = Object.keys(groupedData).sort((a, b) => {
        if (a === "Hari Ini") return -1;
        if (b === "Hari Ini") return 1;
        if (a === "Kemarin") return -1;
        if (b === "Kemarin") return 1;
        const firstItemA = groupedData[a]?.[0];
        const firstItemB = groupedData[b]?.[0];
        if (!firstItemA || !firstItemB) return 0;
        let dateA, dateB;
        try { dateA = getJSDate(firstItemA[dateField] || firstItemA.date); if(isNaN(dateA.getTime())) throw Error();} catch(e){ dateA = new Date(0);}
        try { dateB = getJSDate(firstItemB[dateField] || firstItemB.date); if(isNaN(dateB.getTime())) throw Error();} catch(e){ dateB = new Date(0);}
        return dateB - dateA;
    });

    sortedGroupLabels.forEach(label => {
        html += `<div class="date-group-header">${label}</div>`;
        html += `<div class="date-group-body">${_getBillsListHTML(groupedData[label])}</div>`;
    });
    return `<div class="wa-card-list-wrapper grouped" id="bills-grouped-wrapper">${html}</div>`;
}


async function renderTagihanContent(append = false) {
    if (!append && pageAbortController) {
        pageAbortController.abort();
    }
    if (!append) {
        pageAbortController = new AbortController();
    }
    const signal = pageAbortController?.signal;

    const container = $('#sub-page-content');
    if (!container) {
        return;
    }

    if (!append && container.innerHTML.trim() === '') {
        container.innerHTML = createListSkeletonHTML(5);
    }

    try {
        if (!append) {
            await ensureMasterDataFresh(['suppliers', 'projects'], { ttlMs: 5 * 60 * 1000, signal });
            if (signal?.aborted) throw new DOMException('Operation aborted after master data fetch', 'AbortError');
            if (!appState.bills || !appState.expenses) {
                await loadDataForPage('tagihan');
                if (signal?.aborted) throw new DOMException('Operation aborted after page data load', 'AbortError');
            }
        } else {
        }

        const activeTab = appState.activeSubPage.get('tagihan') || 'tagihan';
        const dateField = (activeTab === 'surat_jalan') ? 'date' : 'dueDate';
        const { searchTerm, category, status, supplierId, dateStart, dateEnd, sortBy, sortDirection } = appState.billsFilter || {};
        const lowerSearchTerm = (searchTerm || '').toLowerCase();

        const categoryNav = document.getElementById('category-sub-nav-container');
        if (categoryNav) {
            categoryNav.style.display = activeTab === 'surat_jalan' ? 'none' : 'flex';
        }

        let items = [];
        const allBills = appState.bills || [];
        const allExpenses = appState.expenses || [];
        const allSuppliers = appState.suppliers || [];

        if (activeTab === 'tagihan') {
            items = allBills.filter(b => b.status === 'unpaid' && !b.isDeleted);
        } else if (activeTab === 'lunas') {
            items = allBills.filter(b => b.status === 'paid' && !b.isDeleted);
        } else {
            items = allExpenses.filter(e => e.status === 'delivery_order' && !e.isDeleted);
        }

        if (category && category !== 'all') {
            items = items.filter(item => {
                const expense = activeTab === 'surat_jalan' ? item : allExpenses.find(e => e.id === item.expenseId);
                const type = item.type || expense?.type;
                return type === category;
            });
        }

        if ((activeTab === 'tagihan' || activeTab === 'lunas') && status && status !== 'all') {
            items = items.filter(item => item.status === status);
        }

         if (supplierId && supplierId !== 'all') {
            items = items.filter(item => {
                const expense = activeTab === 'surat_jalan' ? item : allExpenses.find(e => e.id === item.expenseId);
                return expense && expense.supplierId === supplierId;
            });
        }

        if (dateStart) {
            const startDate = new Date(dateStart + 'T00:00:00');
            items = items.filter(item => getJSDate(item[dateField] || item.date) >= startDate);
        }
        if (dateEnd) {
            const endDate = new Date(dateEnd + 'T23:59:59');
            items = items.filter(item => getJSDate(item[dateField] || item.date) <= endDate);
        }

        if (lowerSearchTerm) {
            items = items.filter(item => {
                const descriptionMatch = item.description && item.description.toLowerCase().includes(lowerSearchTerm);
                let supplierNameMatch = false;
                const expense = activeTab === 'surat_jalan' ? item : allExpenses.find(e => e.id === item.expenseId);
                if (expense?.supplierId) {
                    const supplier = allSuppliers.find(s => s.id === expense.supplierId);
                    supplierNameMatch = supplier?.supplierName.toLowerCase().includes(lowerSearchTerm);
                }
                let workerNameMatch = false;
                if (item.type === 'gaji' && Array.isArray(item.workerDetails)) {
                    workerNameMatch = item.workerDetails.some(w => w.name && w.name.toLowerCase().includes(lowerSearchTerm));
                }
                let materialMatch = false;
                if (expense && Array.isArray(expense.items)) {
                     materialMatch = expense.items.some(it => it.name && it.name.toLowerCase().includes(lowerSearchTerm));
                }

                return descriptionMatch || supplierNameMatch || workerNameMatch || materialMatch;
            });
        }

        items.sort((a, b) => {
            let comparison = 0;
             let dateA, dateB, createdAtA, createdAtB;
             try { dateA = getJSDate(a[dateField] || a.date); if(isNaN(dateA.getTime())) throw Error();} catch(e){ dateA = new Date(0); }
             try { dateB = getJSDate(b[dateField] || b.date); if(isNaN(dateB.getTime())) throw Error();} catch(e){ dateB = new Date(0); }
             try { createdAtA = getJSDate(a.createdAt); if(isNaN(createdAtA.getTime())) throw Error();} catch(e){ createdAtA = new Date(0); }
             try { createdAtB = getJSDate(b.createdAt); if(isNaN(createdAtB.getTime())) throw Error();} catch(e){ createdAtB = new Date(0); }

            if (sortBy === 'amount') {
                const amountA = a.amount || 0;
                const amountB = b.amount || 0;
                comparison = amountA - amountB;
            } else {
                comparison = dateA - dateB;
            }

            if (comparison === 0) {
                comparison = createdAtB - createdAtA;
            }

            return sortDirection === 'desc' ? -comparison : comparison;
        });

        appState.tagihan.currentList = items;

        const paginationKey = `bills_${activeTab}`;
        if (!appState.pagination[paginationKey]) {
           appState.pagination[paginationKey] = { isLoading: false, hasMore: true, page: -1 };
        }
        const paginationState = appState.pagination[paginationKey];

        let itemsToDisplay = [];
        let nextPage = 0;

        if (!append) {
            paginationState.page = -1;
            paginationState.isLoading = false;
            nextPage = 0;
            if (items.length <= INITIAL_LOAD_THRESHOLD) {
                itemsToDisplay = items;
                paginationState.page = 0;
                paginationState.hasMore = false;
            } else {
                itemsToDisplay = items.slice(0, ITEMS_PER_PAGE);
                paginationState.page = 0;
                paginationState.hasMore = items.length > ITEMS_PER_PAGE;
            }
        } else {
            nextPage = paginationState.page + 1;
            const startIndex = nextPage * ITEMS_PER_PAGE;
            const endIndex = startIndex + ITEMS_PER_PAGE;
            itemsToDisplay = items.slice(startIndex, endIndex);
            if (itemsToDisplay.length > 0) {
                paginationState.page = nextPage;
            }
            paginationState.hasMore = endIndex < items.length;
        }

        paginationState.isLoading = false;

        const existingSkeleton = container.querySelector('#list-skeleton');
        if (existingSkeleton) existingSkeleton.remove();
        const existingSentinel = container.querySelector('#infinite-scroll-sentinel');
        if (existingSentinel) {
             if (pageObserverInstance) pageObserverInstance.unobserve(existingSentinel);
             existingSentinel.remove();
        }

        if (signal?.aborted) throw new DOMException('Operation aborted before rendering list', 'AbortError');

        if (!append && items.length === 0) {
            let title = `Tidak Ada ${activeTab === 'tagihan' ? 'Tagihan' : (activeTab === 'lunas' ? 'Tagihan Lunas' : 'Surat Jalan')}`;
            let desc = 'Tidak ada data untuk filter yang dipilih atau halaman ini.';
            container.innerHTML = getEmptyStateHTML({ icon: 'receipt_long', title, desc });
            return;
        }
        if (append && itemsToDisplay.length === 0) {
             container.querySelector('#list-skeleton')?.remove();
             return;
        }

        const groupedData = groupItemsByDate(itemsToDisplay, dateField);
        let newlyAddedElements = []; 

        let billsGroupedWrapper = container.querySelector('#bills-grouped-wrapper');

        if (append) {
            if (!billsGroupedWrapper) {
                container.innerHTML = renderGroupedList(groupedData, dateField);
                billsGroupedWrapper = container.querySelector('#bills-grouped-wrapper');
                if (billsGroupedWrapper) {
                     newlyAddedElements = Array.from(billsGroupedWrapper.querySelectorAll('.wa-card-v2-wrapper'));
                }
            } else {
                const tempDiv = document.createElement('div');
                const newItemsHtml = _getBillsListHTML(itemsToDisplay);
                tempDiv.innerHTML = newItemsHtml; 
                newlyAddedElements = Array.from(tempDiv.children); 

                const firstNewItemDateLabel = Object.keys(groupedData)[0]; 
                const lastExistingHeader = [...billsGroupedWrapper.querySelectorAll('.date-group-header')].pop();
                let targetBody;

                if (lastExistingHeader && lastExistingHeader.textContent === firstNewItemDateLabel) {
                    targetBody = lastExistingHeader.nextElementSibling;
                } else {
                    const newHeader = document.createElement('div');
                    newHeader.className = 'date-group-header';
                    newHeader.textContent = firstNewItemDateLabel;
                    billsGroupedWrapper.appendChild(newHeader);
                    targetBody = document.createElement('div');
                    targetBody.className = 'date-group-body';
                    billsGroupedWrapper.appendChild(targetBody);
                }

                if (targetBody) {
                    newlyAddedElements.forEach(el => targetBody.appendChild(el)); 
                } else {
                }
            }
        } else {
            container.innerHTML = renderGroupedList(groupedData, dateField);
            billsGroupedWrapper = container.querySelector('#bills-grouped-wrapper');
            container.scrollTop = 0;
            if (billsGroupedWrapper) {
                 newlyAddedElements = Array.from(billsGroupedWrapper.querySelectorAll('.wa-card-v2-wrapper'));
            }
        }

        newlyAddedElements.forEach((el, idx) => {
             el.style.animationDelay = `${Math.min(idx, 20) * 22}ms`;
             el.classList.add('item-entering');
             el.setAttribute('data-animated', 'true'); 
             el.addEventListener('animationend', () => el.classList.remove('item-entering'), { once: true });
        });

        const existingEolPlaceholder = container.querySelector('.end-of-list-placeholder');
        if (existingEolPlaceholder) {
            existingEolPlaceholder.remove();
        }

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
        } else if (items.length > 0) {
            if (getEndOfListPlaceholderHTML) {
                container.insertAdjacentHTML('beforeend', getEndOfListPlaceholderHTML());
            }
        }

        if (billsGroupedWrapper && !billsGroupedWrapper.__collapseBound) {
            billsGroupedWrapper.addEventListener('click', (e) => {
                const header = e.target.closest('.date-group-header');
                if (!header) return;
                const body = header.nextElementSibling;
                if (body?.classList.contains('date-group-body')) {
                    header.classList.toggle('collapsed');
                    body.classList.toggle('collapsed');
                }
            });
            billsGroupedWrapper.__collapseBound = true;
        }

    } catch (e) {
        if (e.name === 'AbortError') {
        } else {
            container.innerHTML = getEmptyStateHTML({ icon: 'error', title: 'Gagal Memuat', desc: 'Terjadi kesalahan saat memuat data tagihan.' });
        }
        container.querySelector('#infinite-scroll-sentinel')?.remove();
    } finally {
        if (!append && signal === pageAbortController?.signal) {
             pageAbortController = null;
        }
        const activeTab = appState.activeSubPage.get('tagihan') || 'tagihan';
        const paginationKey = `bills_${activeTab}`;
        if (appState.pagination[paginationKey] && typeof e === 'undefined') {
            appState.pagination[paginationKey].isLoading = false;
        } else if (appState.pagination[paginationKey] && e?.name !== 'AbortError') {
            appState.pagination[paginationKey].isLoading = false;
        }
    }
}


function loadMoreTagihan() {
    if (appState.activePage !== 'tagihan') return;

    const activeTab = appState.activeSubPage.get('tagihan') || 'tagihan';
    const paginationKey = `bills_${activeTab}`;
    let paginationState = appState.pagination[paginationKey];
    if (!paginationState) {
        appState.pagination[paginationKey] = { isLoading: false, hasMore: true, page: -1 };
        paginationState = appState.pagination[paginationKey];
    }
    if (paginationState.isLoading || !paginationState.hasMore) {
        if(!paginationState.hasMore || paginationState.isLoading) {
             $('#sub-page-content')?.querySelector('#list-skeleton')?.remove();
        }
        return;
    }
    paginationState.isLoading = true;
    const container = $('#sub-page-content');
    if (container && !container.querySelector('#list-skeleton')) {
         container.insertAdjacentHTML('beforeend', `<div id="list-skeleton" class="skeleton-wrapper">${createListSkeletonHTML(3)}</div>`);
    }
    renderTagihanContent(true);
}


function initTagihanPage() {
    if (pageEventListenerController) pageEventListenerController.abort();
    pageEventListenerController = new AbortController();
    const listenerSignal = pageEventListenerController.signal;
    if (pageAbortController) pageAbortController.abort();
    pageAbortController = null;
    pageObserverInstance = null;
    destroyPullToRefresh();
    const container = $('.page-container');
    container.classList.add('page-container--has-panel');

    if (!appState.billsFilter) {
        appState.billsFilter = { searchTerm: '', projectId: 'all', supplierId: 'all', sortBy: 'dueDate', sortDirection: 'desc', category: 'all', status: 'all', dateStart: '', dateEnd: '' };
    } else {
        appState.billsFilter.sortBy = appState.billsFilter.sortBy || 'dueDate';
        appState.billsFilter.sortDirection = appState.billsFilter.sortDirection || 'desc';
    }

    appState.pagination.bills_tagihan = { isLoading: false, hasMore: true, page: -1 };
    appState.pagination.bills_lunas = { isLoading: false, hasMore: true, page: -1 };
    appState.pagination.bills_surat_jalan = { isLoading: false, hasMore: true, page: -1 };

    const pageToolbarHTML = createPageToolbarHTML({ title: 'Tagihan' });
    const mainTabsData = [ { id: 'tagihan', label: 'Belum Lunas' }, { id: 'lunas', label: 'Lunas' }, { id: 'surat_jalan', label: 'Surat Jalan' } ];
    const initialActiveTab = appState.activeSubPage.get('tagihan') || 'tagihan';
    appState.activeSubPage.set('tagihan', initialActiveTab);
    const mainTabsHTML = createTabsHTML({ id: 'tagihan-tabs', tabs: mainTabsData, activeTab: initialActiveTab, customClasses: 'tabs-underline three-tabs' });
    const categoryFiltersData = [ { id: 'all', label: 'Semua' }, { id: 'gaji', label: 'Gaji' }, { id: 'material', label: 'Material' }, { id: 'operasional', label: 'Operasional' }, { id: 'lainnya', label: 'Lainnya' } ];
    const categoryFiltersHTML = createTabsHTML({ id: 'category-sub-nav-container', tabs: categoryFiltersData, activeTab: appState.billsFilter.category || 'all', customClasses: 'category-sub-nav' });
    const hideBillsHero = localStorage.getItem('ui.hideHero.bills') === '1';
    const heroHTML = hideBillsHero ? '' : `<div id="bills-hero-carousel" class="dashboard-hero-carousel hero-billing"></div>`;
    container.innerHTML = `
        <div class="content-panel">
            <div class="panel-header">
                ${pageToolbarHTML}
                ${heroHTML}
                ${mainTabsHTML}
                ${categoryFiltersHTML}
            </div>
            <div id="sub-page-content" class="panel-body scrollable-content"></div>
        </div>
        <div id="detail-panel" class="detail-panel">
            ${getDetailPlaceholderHTML('tagihan')}
        </div>
    `;

    pageObserverInstance = initInfiniteScroll('#sub-page-content');

    initPullToRefresh({
        triggerElement: '.panel-header', // Area statis di atas
        scrollElement: '#sub-page-content',  // Konten yang di-scroll
        indicatorContainer: '#ptr-indicator-container', // Target dari index.html
        
        onRefresh: async () => {
            showLoadingModal('Memperbarui tagihan...');
            try {
                const activeTab = appState.activeSubPage.get('tagihan') || 'tagihan';
                const paginationKey = `bills_${activeTab}`;

                appState.pagination[paginationKey] = { isLoading: false, hasMore: true, page: -1 };

                await renderTagihanContent(false);

            } catch (err) {
                console.error("PTR Error (Tagihan):", err);
                emit('ui.toast', { message: 'Gagal memperbarui tagihan', type: 'error' });
            } finally {
                hideLoadingModal();
            }
        }
    });

    if (unsubscribeLiveQuery && typeof unsubscribeLiveQuery.unsubscribe === 'function') {
        unsubscribeLiveQuery.unsubscribe();
        unsubscribeLiveQuery = null;
    }

    unsubscribeLiveQuery = liveQueryMulti(['bills', 'expenses', 'suppliers', 'projects'], (changedKeys) => {
        if (appState.activePage === 'tagihan') {
            renderTagihanContent(false);
        }
    });
    const cleanupTagihan = () => {
        if (pageAbortController) {
            pageAbortController.abort();
            pageAbortController = null;
        }
        if (pageEventListenerController) {
            pageEventListenerController.abort();
            pageEventListenerController = null;
        }
        if (unsubscribeLiveQuery && typeof unsubscribeLiveQuery.unsubscribe === 'function') {
            unsubscribeLiveQuery.unsubscribe();
            unsubscribeLiveQuery = null;
        }
        if (pageObserverInstance) {
            pageObserverInstance.disconnect();
            pageObserverInstance = null;
        }
        cleanupInfiniteScroll(); 
        off('app.unload.tagihan', cleanupTagihan);
    };
    off('app.unload.tagihan', cleanupTagihan);
    on('app.unload.tagihan', cleanupTagihan);

    renderTagihanContent(false);
    if (!hideBillsHero) initBillsHeroCarousel();
    const mainTabsContainer = container.querySelector('#tagihan-tabs');
    if (mainTabsContainer) {
        mainTabsContainer.addEventListener('click', (e) => {
             const tabButton = e.target.closest('.sub-nav-item');
             if (tabButton && !tabButton.classList.contains('active')) {
                 mainTabsContainer.querySelector('.active')?.classList.remove('active');
                 tabButton.classList.add('active');
                 const newTab = tabButton.dataset.tab;
                 appState.activeSubPage.set('tagihan', newTab);
                 appState.billsFilter.category = 'all';
                 const paginationKey = `bills_${newTab}`;
                 appState.pagination[paginationKey] = { isLoading: false, hasMore: true, page: -1 };
                 const categoryNav = document.getElementById('category-sub-nav-container');
                 if (categoryNav) {
                    categoryNav.querySelector('.sub-nav-item.active')?.classList.remove('active');
                    categoryNav.querySelector('.sub-nav-item[data-tab="all"]')?.classList.add('active');
                    categoryNav.style.display = newTab === 'surat_jalan' ? 'none' : 'flex';
                 }
                 renderTagihanContent(false);
             }
        }, { signal: listenerSignal });
    }
    const categoryTabsContainer = container.querySelector('#category-sub-nav-container');
    if (categoryTabsContainer) {
         categoryTabsContainer.addEventListener('click', (e) => {
             const tabButton = e.target.closest('.sub-nav-item');
             if (tabButton && !tabButton.classList.contains('active')) {
                 categoryTabsContainer.querySelector('.active')?.classList.remove('active');
                 tabButton.classList.add('active');
                 appState.billsFilter = appState.billsFilter || {};
                 appState.billsFilter.category = tabButton.dataset.tab;
                 const activeTab = appState.activeSubPage.get('tagihan') || 'tagihan';
                 const paginationKey = `bills_${activeTab}`;
                 appState.pagination[paginationKey] = { isLoading: false, hasMore: true, page: -1 };
                 renderTagihanContent(false);
             }
         }, { signal: listenerSignal });
    }
    
    on('request-more-data', loadMoreTagihan, { signal: listenerSignal });
}


on('ui.tagihan.renderContent', () => renderTagihanContent(false));

export { initTagihanPage };

function initBillsHeroCarousel() {
    const wrap = document.getElementById('bills-hero-carousel');
    if (!wrap) return;
    if (wrap.dataset.initialized === '1') return; wrap.dataset.initialized = '1';

    const toIDR = (n) => { try { return fmtIDR(n || 0); } catch(_) { return (n||0).toLocaleString('id-ID'); } };

    const today = new Date();
    const toISO = (d) => new Date(d).toISOString().slice(0,10);
    const itemsAll = (appState.bills || []).filter(b => !b.isDeleted);
    const unpaid = itemsAll.filter(b => b.status === 'unpaid');
    const paid = itemsAll.filter(b => b.status === 'paid');
    const overdue = unpaid.filter(b => {
        const due = new Date(b.dueDate || b.date || today);
        return due < new Date(toISO(today));
    });
    const dueSoon = unpaid.filter(b => {
        const due = new Date(b.dueDate || b.date || today);
        const diff = (due - today) / (1000*60*60*24);
        return diff >= 0 && diff <= 7;
    });
    const totalOutstanding = unpaid.reduce((s,b) => s + Math.max(0, (b.amount||0) - (b.paidAmount||0)), 0);
    const totalPaidAmt = paid.reduce((s,b) => s + (b.paidAmount || b.amount || 0), 0);

    const slides = [
        { title: 'Ringkasan Tagihan', tone: 'warning',
          lines: [
            `Belum Lunas: ${unpaid.length}/${itemsAll.length}`,
            `Outstanding: ${toIDR(totalOutstanding)}`
          ] },
        { title: 'Jatuh Tempo', tone: 'danger',
          lines: [
            `Terlambat: ${overdue.length}`,
            `Jatuh Tempo ≤7 hari: ${dueSoon.length}`
          ] },
        { title: 'Pembayaran', tone: 'success',
          lines: [
            `Sudah Lunas: ${paid.length}`,
            `Total Dibayar: ${toIDR(totalPaidAmt)}`
          ] },
    ];

    slides.sort(() => Math.random() - 0.5);

    wrap.innerHTML = [
        ...slides.map((s, idx) => `
            <div class="dashboard-hero hero-slide${idx===0?' active':''}" data-index="${idx}" data-tone="${s.tone}">
                <div class="hero-content">
                    <h1>${s.title}</h1>
                    <p>${s.lines.join(' · ')}</p>
                </div>
                <div class="hero-illustration" aria-hidden="true">
                    <svg viewBox="0 0 200 100" preserveAspectRatio="xMidYMid meet">
                        <defs>
                            <linearGradient id="billHero1" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" style="stop-color:var(--hero-rose);stop-opacity:0.18" />
                                <stop offset="100%" style="stop-color:var(--hero-sun);stop-opacity:0.3" />
                            </linearGradient>
                            <linearGradient id="billHero2" x1="100%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" style="stop-color:var(--hero-indigo);stop-opacity:0.12" />
                                <stop offset="100%" style="stop-color:var(--hero-emerald);stop-opacity:0.22" />
                            </linearGradient>
                        </defs>
                        <circle cx="48" cy="52" r="42" fill="url(#billHero1)" class="hero-circle1" />
                        <circle cx="146" cy="60" r="34" fill="url(#billHero2)" class="hero-circle2" />
                        <path d="M 18 78 Q 50 50 96 58 T 182 68" stroke="var(--hero-indigo)" stroke-width="3" fill="none" stroke-linecap="round" class="hero-line" opacity="0.25"/>
                    </svg>
                </div>
            </div>
        `),
        `<div class="hero-indicators">${slides.map((_,i)=>`<span class="dot${i===0?' active':''}" data-idx="${i}"></span>`).join('')}</div>`
    ].join('');

    let index = 0; const total = slides.length;
    const setIndex = (i) => {
        index = (i + total) % total;
        wrap.querySelectorAll('.hero-slide').forEach((el, idx) => el.classList.toggle('active', idx===index));
        wrap.querySelectorAll('.hero-indicators .dot').forEach((d, idx) => d.classList.toggle('active', idx===index));
    };

    if (wrap._timer) clearInterval(wrap._timer);
    wrap._timer = setInterval(()=>setIndex(index+1), 7000);

    wrap.querySelectorAll('.hero-indicators .dot').forEach(dot => {
        dot.addEventListener('click', () => {
            const idx = parseInt(dot.getAttribute('data-idx')) || 0; setIndex(idx);
            if (wrap._timer) { clearInterval(wrap._timer); wrap._timer = setInterval(()=>setIndex(index+1), 7000); }
        });
    });

    let startX=0, curX=0, drag=false;
    wrap.addEventListener('touchstart', e => { startX=e.touches[0].clientX; curX=startX; drag=true; }, { passive: true });
    wrap.addEventListener('touchmove', e => { if(!drag) return; curX=e.touches[0].clientX; }, { passive: true });
    wrap.addEventListener('touchend', ()=>{ if(!drag) return; const dx=curX-startX; drag=false; if(Math.abs(dx)>40){ setIndex(index+(dx<0?1:-1)); if (wrap._timer) { clearInterval(wrap._timer); wrap._timer = setInterval(()=>setIndex(index+1), 7000);} } });
}