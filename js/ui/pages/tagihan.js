import { appState } from '../../state/appState.js';
import { $ } from '../../utils/dom.js';
import { createPageToolbarHTML } from '../components/toolbar.js';
import { createTabsHTML } from '../components/tabs.js';
import { emit, on, off } from '../../state/eventBus.js';
import { _getBillsListHTML, aggregateSalaryBillWorkers } from '../components/cards.js';
import { getEmptyStateHTML, getEndOfListPlaceholderHTML } from '../components/emptyState.js';
import { getJSDate } from '../../utils/helpers.js';
import { formatDate } from '../../utils/formatters.js';
import { initInfiniteScroll, cleanupInfiniteScroll } from '../components/infiniteScroll.js';
import { createListSkeletonHTML } from '../components/skeleton.js';
import { 
    billsCol, 
    expensesCol, 
    auth 
} from '../../config/firebase.js';
import { ensureMasterDataFresh } from '../../services/data/ensureMasters.js';
import { initPullToRefresh, destroyPullToRefresh } from "../components/pullToRefresh.js";
import { showLoadingModal, hideLoadingModal } from "../components/modal.js";
import { getPendingQuotaMaps } from '../../services/pendingQuotaService.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
const ITEMS_PER_PAGE = 15;
let pageEventListenerController = null;
let pageObserverInstance = null;
let currentTagihanSentinel = null;
let hasMoreBills = true;

let currentTab = 'tagihan'; 
let currentPage = 0;
let isRendering = false;
let visibleItems = [];

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

function appendBillGroups(wrapper, groups, pendingOptions = {}, renderOptions = {}) {
    const inserted = [];
    groups.forEach(group => {
        const section = wrapper.querySelector(`.date-group[data-group-key="${group.key}"]`);
        const groupHTML = _getBillsListHTML(group.items, { ...pendingOptions, ...renderOptions });
        if (!groupHTML) return;
        if (section) {
            const body = section.querySelector('.date-group-body');
            if (!body) return;
            const temp = document.createElement('div');
            temp.innerHTML = groupHTML;
            Array.from(temp.children).forEach(node => {
                body.appendChild(node);
                if (node.classList?.contains('wa-card-v2-wrapper')) inserted.push(node);
            });
        } else {
            const sectionEl = document.createElement('section');
            sectionEl.className = 'date-group';
            sectionEl.dataset.groupKey = group.key;
            sectionEl.innerHTML = `<div class="date-group-header">${group.label}</div><div class="date-group-body">${groupHTML}</div>`;
            wrapper.appendChild(sectionEl);
            sectionEl.querySelectorAll('.wa-card-v2-wrapper')?.forEach(node => inserted.push(node));
        }
    });
    return inserted;
}

function isItemDeleted(item) {
    return !!item && (item.isDeleted === true || item.isDeleted === 1);
}

function resolveExpenseMap() {
    return new Map((appState.expenses || []).filter(exp => !!exp?.id).map(exp => [exp.id, exp]));
}

function getRelatedExpense(item, expenseMap) {
    if (!item) return null;
    if (item.expenseId && expenseMap.has(item.expenseId)) {
        return expenseMap.get(item.expenseId);
    }
    return null;
}

function buildTagihanItems() {
    const expenseMap = resolveExpenseMap();
    const baseExpenses = (appState.expenses || []).filter(exp => !isItemDeleted(exp));
    const baseBills = (appState.bills || []).filter(bill => !isItemDeleted(bill));
    let items = [];
    if (currentTab === 'surat_jalan') {
        items = baseExpenses.filter(exp => (exp.status || '').toLowerCase() === 'delivery_order');
    } else {
        const statusTarget = currentTab === 'tagihan' ? 'unpaid' : 'paid';
        items = baseBills.filter(bill => ((bill.status || '').toLowerCase()) === statusTarget);
    }

    const filters = appState.billsFilter || {};
    const lowerSearch = (filters.searchTerm || '').trim().toLowerCase();
    const hasSearch = lowerSearch.length > 0;
    const categoryFilter = (filters.category || 'all').toLowerCase();
    const statusFilter = (filters.status || 'all').toLowerCase();
    const supplierFilter = filters.supplierId || 'all';
    const projectFilter = filters.projectId || 'all';
    const workerFilter = filters.workerId || 'all';
    const startDate = filters.dateStart ? new Date(filters.dateStart) : null;
    const endDate = filters.dateEnd ? new Date(filters.dateEnd) : null;
    if (endDate) endDate.setHours(23, 59, 59, 999);

    const filtered = items.filter(item => {
        const type = (item.type || '').toLowerCase();
        if (categoryFilter !== 'all' && type !== categoryFilter) {
            return false;
        }
        if (statusFilter !== 'all') {
            const candidateStatus = (item.status || '').toLowerCase();
            if (candidateStatus !== statusFilter) {
                return false;
            }
        }
        const relatedExpense = getRelatedExpense(item, expenseMap);
        if (supplierFilter !== 'all') {
            const supplierId = relatedExpense?.supplierId || item.supplierId || '';
            if (supplierId !== supplierFilter) {
                return false;
            }
        }
        if (projectFilter !== 'all') {
            const projectId = item.projectId || relatedExpense?.projectId || '';
            if (projectId !== projectFilter) {
                return false;
            }
        }
        if (workerFilter !== 'all') {
            const workerIds = new Set();
            if (Array.isArray(item.workerDetails)) {
                item.workerDetails.forEach(detail => {
                    if (detail.workerId) workerIds.add(detail.workerId);
                    if (detail.id) workerIds.add(detail.id);
                });
            }
            if (item.workerId) workerIds.add(item.workerId);
            if (!workerIds.has(workerFilter)) return false;
        }
        if (startDate || endDate) {
            const candidateDate = getJSDate(item.dueDate || item.date);
            if (!candidateDate) return false;
            if (startDate && candidateDate < startDate) return false;
            if (endDate && candidateDate > endDate) return false;
        }
        if (hasSearch) {
            const comparisons = [];
            comparisons.push((item.description || '').toLowerCase());
            comparisons.push((item.workerName || '').toLowerCase());
            if (relatedExpense && relatedExpense.supplierId) {
                const supplier = appState.suppliers?.find(s => s.id === relatedExpense.supplierId);
                if (supplier) comparisons.push(supplier.supplierName.toLowerCase());
            }
            const matched = comparisons.some(text => text && text.includes(lowerSearch));
            if (!matched) return false;
        }
        return true;
    });

    if (currentTab === 'tagihan' || currentTab === 'lunas') {
        const salaryItems = filtered.filter(item => (item.type || '').toLowerCase() === 'gaji');
        const otherItems = filtered.filter(item => (item.type || '').toLowerCase() !== 'gaji');
        let aggregatedSalary = [];
        if (salaryItems.length > 0) {
            const workerSummaries = aggregateSalaryBillWorkers(salaryItems);
            aggregatedSalary = workerSummaries.map(w => {
                const repBill = (w.summaries || []).reduce((prev, curr) => {
                    const dPrev = getJSDate(prev.dueDate || prev.date);
                    const dCurr = getJSDate(curr.dueDate || curr.date);
                return dCurr > dPrev ? curr : prev;
            }, w.summaries[0] || {});
            const outstanding = Math.max(0, (Number(w.amount || 0) - Number(w.paidAmount || 0)));
            return {
                ...w,
                type: 'gaji',
                date: repBill.date,
                dueDate: repBill.dueDate,
                createdAt: repBill.createdAt,
                projectId: repBill.projectId,
                status: currentTab === 'tagihan' ? 'unpaid' : 'paid',
                isWorkerAggregate: true,
                totalUnpaid: outstanding
            };
        });
        }
        items = [...aggregatedSalary, ...otherItems];
    } else {
        items = filtered;
    }

    return items.sort((a, b) => {
        const dateA = getJSDate(a.dueDate || a.date);
        const dateB = getJSDate(b.dueDate || b.date);
        return dateB - dateA;
    });
}

async function renderTagihanContent(append = false) {
    if (isRendering) return;
    isRendering = true;

    const container = $('#sub-page-content');
    if (!container) {
        isRendering = false;
        return;
    }

    cleanupCurrentSentinel();

    if (!append) {
        visibleItems = [];
        currentPage = 0;
        hasMoreBills = true;
        container.innerHTML = createListSkeletonHTML(5);
        await ensureMasterDataFresh(['suppliers', 'projects', 'workers'], { ttlMs: 10 * 60 * 1000 });
    }

    try {
        const allItems = buildTagihanItems();
        const totalCount = allItems.length;
        if (!append && totalCount === 0) {
            let title = `Tidak Ada ${currentTab === 'tagihan' ? 'Tagihan' : (currentTab === 'lunas' ? 'Tagihan Lunas' : 'Surat Jalan')}`;
            let desc = 'Tidak ada data ditemukan.';
            container.innerHTML = getEmptyStateHTML({ icon: 'receipt_long', title, desc });
            hasMoreBills = false;
            return;
        }

        const totalPages = totalCount ? Math.ceil(totalCount / ITEMS_PER_PAGE) : 0;

        if (!append) {
            currentPage = totalPages > 0 ? 1 : 0;
        } else {
            if (currentPage >= totalPages) {
                hasMoreBills = false;
                container.querySelector('#list-skeleton')?.remove();
                return;
            }
            currentPage += 1;
        }

        const visibleCount = Math.min(currentPage * ITEMS_PER_PAGE, totalCount);
        const previousCount = append ? Math.min(visibleItems.length, totalCount) : 0;
        const newBatch = allItems.slice(previousCount, visibleCount);
        visibleItems = allItems.slice(0, visibleCount);
        hasMoreBills = visibleCount < totalCount;

        if (appState.tagihan) appState.tagihan.currentList = [...visibleItems];

        const pendingMaps = await getPendingQuotaMaps(['bills', 'expenses']);
        const pendingOptions = {
            pendingBills: pendingMaps.get('bills') || new Map(),
            pendingExpenses: pendingMaps.get('expenses') || new Map()
        };
        const renderOptions = { aggregateSalary: false, hidePayrollMetaBadges: true };
        const dateField = (currentTab === 'surat_jalan') ? 'date' : 'dueDate';

        let billsGroupedWrapper = container.querySelector('#bills-grouped-wrapper');
        let newlyAddedElements = [];

        if (!append || !billsGroupedWrapper) {
            const groupedData = groupItemsByDate(visibleItems, dateField);
            container.innerHTML = renderGroupedList(groupedData, pendingOptions, renderOptions);
            billsGroupedWrapper = container.querySelector('#bills-grouped-wrapper');
            if (!append) container.scrollTop = 0;
            if (billsGroupedWrapper) newlyAddedElements = Array.from(billsGroupedWrapper.querySelectorAll('.wa-card-v2-wrapper'));
        } else if (newBatch.length > 0) {
            const groupedData = groupItemsByDate(newBatch, dateField);
            newlyAddedElements = appendBillGroups(billsGroupedWrapper, groupedData, pendingOptions, renderOptions);
        }

        newlyAddedElements.forEach((el, idx) => {
            if (!el.hasAttribute('data-animated')) {
                el.style.animationDelay = `${Math.min(idx, 20) * 22}ms`;
                el.classList.add('item-entering');
                el.setAttribute('data-animated', 'true');
                el.addEventListener('animationend', () => el.classList.remove('item-entering'), { once: true });
            }
        });

        container.querySelector('#list-skeleton')?.remove();
        attachTagihanSentinel(container);

        container.querySelector('.end-of-list-placeholder')?.remove();
        if (!hasMoreBills && visibleItems.length > 0) {
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
        if (!append) container.innerHTML = getEmptyStateHTML({ icon:'error', title:'Error', desc:'Gagal menampilkan data.'});
    } finally {
        isRendering = false;
    }
}

function loadMoreTagihan() {
    if (appState.activePage !== 'tagihan' || isRendering || !hasMoreBills) return;
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
    destroyPullToRefresh();
    
    const container = $('.page-container');
    container.classList.add('page-container--has-panel');

    if (!appState.tagihan) appState.tagihan = {};
    if (!appState.activeSubPage) appState.activeSubPage = new Map();
    if (!appState.billsFilter) {
        appState.billsFilter = {
            searchTerm: '',
            projectId: 'all',
            supplierId: 'all',
            workerId: 'all',
            sortBy: 'dueDate',
            sortDirection: 'desc',
            category: 'all',
            status: 'all',
            dateStart: '',
            dateEnd: ''
        };
    }

    currentTab = appState.activeSubPage.get('tagihan') || 'tagihan';
    visibleItems = [];
    currentPage = 0;
    hasMoreBills = true;

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
            visibleItems = [];
            currentPage = 0;
            hasMoreBills = true;
            await renderTagihanContent(false);
            hideLoadingModal();
        }
    });

    pageObserverInstance = initInfiniteScroll('#sub-page-content');
    on('request-more-data', loadMoreTagihan, { signal: listenerSignal });

    on('data.transaction.success', () => {
        if(appState.activePage === 'tagihan') {
            visibleItems = [];
            currentPage = 0;
            hasMoreBills = true;
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
                 
                visibleItems = [];
                currentPage = 0;
                hasMoreBills = true;

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
                
                visibleItems = [];
                currentPage = 0;
                hasMoreBills = true;
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
            if (user && visibleItems.length === 0) startLoad();
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
