import { appState } from '../../state/appState.js';
import { $ } from '../../utils/dom.js';
import { createPageToolbarHTML } from '../components/toolbar.js';
import { createTabsHTML } from '../components/tabs.js';
import { emit, on, off } from '../../state/eventBus.js';
import { _getBillsListHTML, createUnifiedCard, aggregateSalaryBillWorkers } from '../components/cards.js';
import { getEmptyStateHTML, getEndOfListPlaceholderHTML } from '../components/emptyState.js';
import { getJSDate } from '../../utils/helpers.js';
import { parseFormattedNumber, formatDate, fmtIDR } from '../../utils/formatters.js';
import { initInfiniteScroll, cleanupInfiniteScroll } from '../components/infiniteScroll.js';
import { createListSkeletonHTML } from '../components/skeleton.js';
import { 
    billsCol, 
    expensesCol, 
    auth 
} from '../../config/firebase.js';
import { ensureMasterDataFresh } from '../../services/data/ensureMasters.js';
import { loadDataForPage } from '../../services/localDbService.js';
import { initPullToRefresh, destroyPullToRefresh } from "../components/pullToRefresh.js";
import { showLoadingModal, hideLoadingModal } from "../components/modal.js";
import { getPendingQuotaMaps } from '../../services/pendingQuotaService.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { 
    collection, query, where, orderBy, limit, startAfter, getDocs 
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const ITEMS_PER_PAGE = 15;
let pageAbortController = null;
let pageEventListenerController = null;
let pageObserverInstance = null;
let currentTagihanSentinel = null;
let hasMoreBills = true;

// --- STATE LOKAL ---
let lastVisibleDoc = null;
let isFetching = false;
let accumulatedItems = [];
let currentTab = 'tagihan'; 

function cleanupCurrentSentinel() {
    if (currentTagihanSentinel && pageObserverInstance) {
        pageObserverInstance.unobserve(currentTagihanSentinel);
    }
    if (currentTagihanSentinel) {
        currentTagihanSentinel.remove();
    }
    currentTagihanSentinel = null;
}

function attachTagihanSentinel(container) {
    if (!hasMoreBills || !container) return;
    container.insertAdjacentHTML('beforeend', `<div id="infinite-scroll-sentinel" style="height: 20px; width: 100%;"></div>`);
    const sentinel = container.querySelector('#infinite-scroll-sentinel');
    if (sentinel) {
        currentTagihanSentinel = sentinel;
        if (pageObserverInstance) {
            pageObserverInstance.observe(sentinel);
        }
    }
}

function groupItemsByDate(items, dateField = 'dueDate') {
    const todayKey = new Date().toISOString().slice(0, 10);
    const yesterdayKey = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const groups = new Map();

    items.forEach(item => {
        let primaryDate;
        try {
            primaryDate = getJSDate(item[dateField] || item.date || item.createdAt);
            if (isNaN(primaryDate.getTime())) throw new Error('invalid date');
        } catch (_) {
            primaryDate = new Date();
        }
        const normalized = new Date(primaryDate);
        normalized.setHours(0, 0, 0, 0);
        const groupKey = normalized.toISOString().slice(0, 10);
        let groupLabel;
        if (groupKey === todayKey) groupLabel = "Hari Ini";
        else if (groupKey === yesterdayKey) groupLabel = "Kemarin";
        else groupLabel = formatDate(normalized, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

        if (!groups.has(groupKey)) {
            groups.set(groupKey, { key: groupKey, label: groupLabel, sortDate: primaryDate, items: [] });
        }
        groups.get(groupKey).items.push(item);
    });

    return Array.from(groups.values()).sort((a, b) => b.sortDate - a.sortDate);
}

function renderGroupedList(groupedData, pendingOptions = {}, renderOptions = {}) {
    const html = groupedData.map(group => {
        const bodyHTML = _getBillsListHTML(group.items, { ...pendingOptions, ...renderOptions });
        if (!bodyHTML) return ''; 
        return `
            <section class="date-group" data-group-key="${group.key}">
                <div class="date-group-header">${group.label}</div>
                <div class="date-group-body">${bodyHTML}</div>
            </section>
        `;
    }).join('');
    return `<div class="wa-card-list-wrapper grouped" id="bills-grouped-wrapper">${html}</div>`;
}

// --- FUNGSI FETCH ---
async function fetchBillsFromServer(isLoadMore = false) {
    if (isFetching) return false;
    isFetching = true;

    try {
        const activeTab = currentTab;
        const collRef = activeTab === 'surat_jalan' ? expensesCol : billsCol;
        let qConstraints = [];

        // 1. FILTER STATUS
        if (activeTab === 'surat_jalan') {
            qConstraints.push(where('status', '==', 'delivery_order'));
        } else {
            const statusTarget = activeTab === 'tagihan' ? 'unpaid' : 'paid';
            qConstraints.push(where('status', '==', statusTarget));
        }

        // 2. FILTER KATEGORI (Server Side)
        const category = appState.billsFilter?.category || 'all';
        if (category && category !== 'all') {
            qConstraints.push(where('type', '==', category));
        }

        // 3. SORTING
        const dateField = activeTab === 'surat_jalan' ? 'date' : 'dueDate';
        const { sortDirection } = appState.billsFilter || { sortDirection: 'desc' };
        qConstraints.push(orderBy(dateField, sortDirection || 'desc'));

        // 4. PAGINATION
        qConstraints.push(limit(ITEMS_PER_PAGE));
        if (isLoadMore && lastVisibleDoc) {
            qConstraints.push(startAfter(lastVisibleDoc));
        }

        const q = query(collRef, ...qConstraints);
        const snapshot = await getDocs(q);

        const fetchedDocs = snapshot.docs;
        if (fetchedDocs.length) {
            lastVisibleDoc = fetchedDocs[fetchedDocs.length - 1];
        }
        hasMoreBills = fetchedDocs.length === ITEMS_PER_PAGE;

        const newItems = fetchedDocs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        if (isLoadMore) {
            accumulatedItems = [...accumulatedItems, ...newItems];
        } else {
            accumulatedItems = newItems;
        }

        return newItems.length > 0;

    } catch (error) {
        console.error("[Tagihan] Error fetching data:", error);
        if (error.code === 'permission-denied') {
             if(!auth.currentUser) console.warn("User belum login");
             emit('ui.toast', { message: 'Akses Ditolak. Relogin.', type: 'error' });
        } else if (error.message && error.message.includes("requires an index")) {
             emit('ui.toast', { message: 'Perlu Index Baru (Cek Console)', type: 'error' });
        }
        return false;
    } finally {
        isFetching = false;
    }
}

async function renderTagihanContent(append = false) {
    if (!append) pageAbortController?.abort();
    if (!append) pageAbortController = new AbortController();
    const signal = pageAbortController?.signal;

    const container = $('#sub-page-content');
    if (!container) return;

    cleanupCurrentSentinel();

    if (!append) {
        lastVisibleDoc = null;
        accumulatedItems = [];
        hasMoreBills = true;
        container.innerHTML = createListSkeletonHTML(5);
        await ensureMasterDataFresh(['suppliers', 'projects', 'workers'], { ttlMs: 10 * 60 * 1000, signal });
    }

    try {
        await fetchBillsFromServer(append);
        if (signal?.aborted) return;
        
        let items = [...accumulatedItems];
        
        // 1. FILTER LOKAL
        items = items.filter(item => item.isDeleted !== true);
        const { searchTerm } = appState.billsFilter || {};
        const lowerSearchTerm = (searchTerm || '').toLowerCase();
        if (lowerSearchTerm) {
            items = items.filter(item => {
                const desc = (item.description || '').toLowerCase();
                const worker = (item.workerName || '').toLowerCase();
                return desc.includes(lowerSearchTerm) || worker.includes(lowerSearchTerm);
            });
        }

        // 2. LOGIKA AGREGASI GAJI
        if (currentTab === 'tagihan' || currentTab === 'lunas') {
            const salaryItems = items.filter(i => i.type === 'gaji');
            const otherItems = items.filter(i => i.type !== 'gaji');

            let aggregatedSalary = [];
            if (salaryItems.length > 0) {
                const workerSummaries = aggregateSalaryBillWorkers(salaryItems);
                
                aggregatedSalary = workerSummaries.map(w => {
                    const repBill = (w.summaries || []).reduce((prev, curr) => {
                        const dPrev = getJSDate(prev.dueDate || prev.date);
                        const dCurr = getJSDate(curr.dueDate || curr.date);
                        return dCurr > dPrev ? curr : prev;
                    }, w.summaries[0] || {});

                    return {
                        ...w, 
                        type: 'gaji', 
                        date: repBill.date,
                        dueDate: repBill.dueDate,
                        createdAt: repBill.createdAt,
                        projectId: repBill.projectId,
                        status: currentTab === 'tagihan' ? 'unpaid' : 'paid',
                        isWorkerAggregate: true,
                        totalUnpaid: w.remaining || 0
                    };
                });
            }
            items = [...aggregatedSalary, ...otherItems];
            
            items.sort((a, b) => {
               const dateA = getJSDate(a.dueDate || a.date);
               const dateB = getJSDate(b.dueDate || b.date);
               return dateB - dateA;
            });
        }

        if (appState.tagihan) appState.tagihan.currentList = items;

        const pendingMaps = await getPendingQuotaMaps(['bills', 'expenses']);
        const pendingOptions = {
            pendingBills: pendingMaps.get('bills') || new Map(),
            pendingExpenses: pendingMaps.get('expenses') || new Map()
        };
        const renderOptions = { aggregateSalary: false, hidePayrollMetaBadges: true };

        if (!append && items.length === 0) {
            let title = `Tidak Ada ${currentTab === 'tagihan' ? 'Tagihan' : (currentTab === 'lunas' ? 'Tagihan Lunas' : 'Surat Jalan')}`;
            let desc = 'Tidak ada data ditemukan.';
            container.innerHTML = getEmptyStateHTML({ icon: 'receipt_long', title, desc });
            return;
        }

        const dateField = (currentTab === 'surat_jalan') ? 'date' : 'dueDate';
        const groupedData = groupItemsByDate(items, dateField);
        
        container.innerHTML = renderGroupedList(groupedData, pendingOptions, renderOptions);
        
        let billsGroupedWrapper = container.querySelector('#bills-grouped-wrapper');
        if (!append) container.scrollTop = 0;

        container.querySelector('#list-skeleton')?.remove();
        attachTagihanSentinel(container);
        if (!hasMoreBills) {
            container.insertAdjacentHTML('beforeend', getEndOfListPlaceholderHTML());
        }

        if (billsGroupedWrapper) {
            billsGroupedWrapper.onclick = (e) => {
                const header = e.target.closest('.date-group-header');
                if (header && header.nextElementSibling?.classList.contains('date-group-body')) {
                    header.classList.toggle('collapsed');
                    header.nextElementSibling.classList.toggle('collapsed');
                }
            };
        }

    } catch (e) {
        console.error("Render Error:", e);
        if(!append) container.innerHTML = getEmptyStateHTML({ icon:'error', title:'Error', desc:'Gagal menampilkan data.'});
    }
}

function loadMoreTagihan() {
    if (appState.activePage !== 'tagihan' || isFetching || !hasMoreBills) return;
    const container = $('#sub-page-content');
    if (container && !container.querySelector('#list-skeleton')) {
         container.insertAdjacentHTML('beforeend', `<div id="list-skeleton" class="skeleton-wrapper">${createListSkeletonHTML(2)}</div>`);
    }
    renderTagihanContent(true);
}

function initTagihanPage() {
    if (pageEventListenerController) pageEventListenerController.abort();
    pageEventListenerController = new AbortController();
    const listenerSignal = pageEventListenerController.signal;
    if (pageAbortController) pageAbortController.abort();
    pageAbortController = null;
    destroyPullToRefresh();
    
    const container = $('.page-container');
    container.classList.add('page-container--has-panel');

    if (!appState.tagihan) appState.tagihan = {};
    if (!appState.activeSubPage) appState.activeSubPage = new Map();
    if (!appState.billsFilter) {
        appState.billsFilter = { searchTerm: '', sortBy: 'dueDate', sortDirection: 'desc', category: 'all' };
    }

    currentTab = appState.activeSubPage.get('tagihan') || 'tagihan';
    lastVisibleDoc = null;
    accumulatedItems = [];

    const pageToolbarHTML = createPageToolbarHTML({ title: 'Tagihan' });
    const mainTabsData = [ { id: 'tagihan', label: 'Belum Lunas' }, { id: 'lunas', label: 'Lunas' }, { id: 'surat_jalan', label: 'Surat Jalan' } ];
    const categoryFiltersData = [ { id: 'all', label: 'Semua' }, { id: 'gaji', label: 'Gaji' }, { id: 'material', label: 'Material' }, { id: 'operasional', label: 'Operasional' }, { id: 'lainnya', label: 'Lainnya' } ];
    
    const mainTabsHTML = createTabsHTML({ id: 'tagihan-tabs', tabs: mainTabsData, activeTab: currentTab, customClasses: 'tabs-underline three-tabs' });
    const categoryFiltersHTML = createTabsHTML({ id: 'category-sub-nav-container', tabs: categoryFiltersData, activeTab: appState.billsFilter.category || 'all', customClasses: 'category-sub-nav' });

    container.innerHTML = `
        <div class="content-panel">
            <div class="panel-header">
                ${pageToolbarHTML}
                ${mainTabsHTML}
                ${categoryFiltersHTML}
            </div>
            <div id="sub-page-content" class="panel-body scrollable-content"></div>
        </div>
    `;

    initPullToRefresh({
        triggerElement: '.panel-header', 
        scrollElement: '#sub-page-content', 
        indicatorContainer: '#ptr-indicator-container', 
        onRefresh: async () => {
            showLoadingModal('Memperbarui...');
            lastVisibleDoc = null;
            accumulatedItems = [];
            await renderTagihanContent(false);
            hideLoadingModal();
        }
    });

    pageObserverInstance = initInfiniteScroll('#sub-page-content');
    on('request-more-data', loadMoreTagihan, { signal: listenerSignal });

    on('data.transaction.success', () => {
        if(appState.activePage === 'tagihan') {
            lastVisibleDoc = null; 
            accumulatedItems = []; 
            renderTagihanContent(false);
        }
    }, { signal: listenerSignal });

    // TABS LISTENER
    const mainTabsContainer = container.querySelector('#tagihan-tabs');
    if (mainTabsContainer) {
        mainTabsContainer.addEventListener('click', (e) => {
             const tabButton = e.target.closest('.sub-nav-item');
             if (tabButton && !tabButton.classList.contains('active')) {
                 mainTabsContainer.querySelector('.active')?.classList.remove('active');
                 tabButton.classList.add('active');
                 
                 currentTab = tabButton.dataset.tab;
                 appState.activeSubPage.set('tagihan', currentTab);
                 
                 lastVisibleDoc = null;
                 accumulatedItems = [];

                 const catNav = document.getElementById('category-sub-nav-container');
                 if (catNav) {
                     catNav.style.display = currentTab === 'surat_jalan' ? 'none' : 'flex';
                     appState.billsFilter.category = 'all';
                     catNav.querySelector('.active')?.classList.remove('active');
                     catNav.querySelector('[data-tab="all"]')?.classList.add('active');
                 }
                 
                 renderTagihanContent(false);
             }
        }, { signal: listenerSignal });
    }

    const catTabs = container.querySelector('#category-sub-nav-container');
    if(catTabs) {
        catTabs.addEventListener('click', (e) => {
            const btn = e.target.closest('.sub-nav-item');
            if(btn && !btn.classList.contains('active')) {
                catTabs.querySelector('.active')?.classList.remove('active');
                btn.classList.add('active');
                appState.billsFilter.category = btn.dataset.tab;
                
                lastVisibleDoc = null;
                accumulatedItems = [];
                renderTagihanContent(false);
            }
        });
    }

    let authUnsub = null;
    const startLoad = () => {
        renderTagihanContent(false);
    };

    if (auth.currentUser) {
        startLoad();
    } else {
        $('#sub-page-content').innerHTML = createListSkeletonHTML(5);
        authUnsub = onAuthStateChanged(auth, (user) => {
            if (user && accumulatedItems.length === 0) startLoad();
        });
    }

    const cleanupTagihan = () => {
        cleanupCurrentSentinel();
        cleanupInfiniteScroll();
        pageObserverInstance = null;
        if (pageEventListenerController) {
            pageEventListenerController.abort();
            pageEventListenerController = null;
        }
        if (authUnsub) authUnsub();
        destroyPullToRefresh();
        off('app.unload.tagihan', cleanupTagihan);
    };
    off('app.unload.tagihan', cleanupTagihan);
    on('app.unload.tagihan', cleanupTagihan);
}

on('ui.tagihan.renderContent', () => renderTagihanContent(false));

export { initTagihanPage };
