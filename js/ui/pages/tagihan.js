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
import { fetchAndCacheData } from '../../services/data/fetch.js';
import { projectsCol, suppliersCol } from '../../config/firebase.js';
import { ensureMasterDataFresh } from '../../services/data/ensureMasters.js';
import { loadDataForPage } from '../../services/localDbService.js';
import { liveQueryMulti } from '../../state/liveQuery.js';
import { initPullToRefresh, destroyPullToRefresh } from "../components/pullToRefresh.js";
import { showLoadingModal, hideLoadingModal } from "../components/modal.js";
import { getPendingQuotaMaps } from '../../services/pendingQuotaService.js';

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

    groups.forEach(group => {
        group.items.sort((a, b) => {
            const dateA = getJSDate(a.createdAt || a[dateField] || a.date);
            const dateB = getJSDate(b.createdAt || b[dateField] || b.date);
            return dateB - dateA;
        });
    });

    return Array.from(groups.values()).sort((a, b) => b.sortDate - a.sortDate);
}

function renderGroupedList(groupedData, pendingOptions = {}, renderOptions = {}) {
    const html = groupedData.map(group => {
        const bodyHTML = _getBillsListHTML(group.items, { ...pendingOptions, ...renderOptions });
        if (!bodyHTML) return ''; // Skip empty groups
        return `
            <section class="date-group" data-group-key="${group.key}">
                <div class="date-group-header">${group.label}</div>
                <div class="date-group-body">${bodyHTML}</div>
            </section>
        `;
    }).join('');
    return `<div class="wa-card-list-wrapper grouped" id="bills-grouped-wrapper">${html}</div>`;
}

function appendGroupedSections(wrapper, groups, pendingOptions = {}, renderOptions = {}) {
    const insertedNodes = [];
    groups.forEach(group => {
        const existingSection = wrapper.querySelector(`.date-group[data-group-key="${group.key}"]`);
        const bodyHTML = _getBillsListHTML(group.items, { ...pendingOptions, ...renderOptions });
        if (!bodyHTML) return;

        if (existingSection) {
            const body = existingSection.querySelector('.date-group-body');
            if (!body) return;
            const temp = document.createElement('div');
            temp.innerHTML = bodyHTML;
            Array.from(temp.children).forEach(node => {
                body.appendChild(node);
                if (node.classList?.contains('wa-card-v2-wrapper')) insertedNodes.push(node);
            });
        } else {
            const section = document.createElement('section');
            section.className = 'date-group';
            section.dataset.groupKey = group.key;
            section.innerHTML = `<div class="date-group-header">${group.label}</div><div class="date-group-body">${bodyHTML}</div>`;
            wrapper.appendChild(section);
            section.querySelectorAll('.wa-card-v2-wrapper')?.forEach(node => insertedNodes.push(node));
        }
    });
    return insertedNodes;
}

// ... buildWorkerPayrollSummary, renderWorkerPayrollSummaryList helpers ...
// (Helper ini tidak digunakan di renderTagihanContent tapi tetap dipertahankan)
function buildWorkerPayrollSummary(items, sortBy = 'dueDate', sortDirection = 'desc') {
    const aggregates = aggregateSalaryBillWorkers(items);
    const direction = (sortDirection === 'asc' ? 1 : -1);
    const normalized = aggregates.map(summary => {
        const totalAmount = Number(summary.amount || 0);
        const totalPaid = Number(summary.paidAmount || 0);
        return {
            workerId: summary.workerId,
            workerName: summary.workerName,
            totalAmount,
            totalPaid,
            remaining: Math.max(0, totalAmount - totalPaid),
            billCount: summary.summaryCount || (summary.billIds ? summary.billIds.length : 0),
            billIds: summary.billIds || [],
            projectCount: (summary.projectNames || []).length,
            projectNames: summary.projectNames || [],
            summaries: summary.summaries || []
        };
    });

    normalized.sort((a, b) => {
        if (sortBy === 'amount') {
            return (a.remaining - b.remaining) * direction;
        }
        return a.workerName.localeCompare(b.workerName) * direction;
    });

    return normalized;
}

function renderWorkerPayrollSummaryList(summaries) {
    if (!Array.isArray(summaries) || summaries.length === 0) return '';
    // ... logic sama seperti file asli ...
    const listHTML = summaries.map(summary => {
        const amountValue = summary.remaining > 0 ? summary.remaining : summary.totalAmount;
        const amountLabel = summary.remaining > 0 ? 'Sisa Gaji' : 'Total Gaji';
        const amountColor = summary.remaining > 0 ? 'warn' : 'positive';
        const projectsDisplay = summary.projectNames.length ? summary.projectNames.join(', ') : 'Tanpa Proyek';
        const paidPercent = summary.totalAmount > 0 ? Math.min(100, Math.round((summary.totalPaid / summary.totalAmount) * 100)) : 0;
        const miniProgress = `
            <div class="payroll-progress" style="margin: 6px 0 4px; background: var(--line, #ececec); height: 6px; border-radius: 999px;">
                <div style="width:${paidPercent}%; height:100%; background: var(--primary, #0b6bcb); border-radius: 999px; transition: width 0.3s ease;"></div>
            </div>
        `;
        const allRanges = (summary.summaries || [])
            .map(s => s.rangeLabel || formatDate(getJSDate(s.startDate || s.endDate), { day: 'numeric', month: 'short' }))
            .filter(Boolean);
        const rangeChips = allRanges.length
            ? allRanges.map(r => `<span class="payroll-chip" style="display:inline-block; padding:2px 8px; border-radius:999px; background:var(--surface-muted, #f5f5f5); font-size:0.8rem; color:var(--text-dim, #555); margin:2px 4px;">${r}</span>`).join('')
            : `<span class="wa-card-v2__description sub">Belum ada rentang absensi</span>`;
        const mainContentHTML = `
            <div class="payroll-simple" style="display:flex; flex-direction:column; gap:6px;">
                <div class="wa-card-v2__description" style="margin:0;">${projectsDisplay}</div>
                <div class="payroll-simple__row" style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">
                    <span class="payroll-chip" style="display:inline-block; padding:2px 8px; border-radius:999px; background:var(--surface-muted, #f5f5f5); font-size:0.8rem; color:var(--text-dim, #555);">
                        ${summary.billCount} rekap
                    </span>
                    ${paidPercent ? `
                    <span class="payroll-chip" style="display:inline-block; padding:2px 8px; border-radius:999px; background:var(--surface-muted, #f5f5f5); font-size:0.8rem; color:var(--text-dim, #555);">
                        ${paidPercent}% terbayar
                    </span>` : ''}
                </div>
                ${miniProgress}
                <div class="payroll-chip-row" style="margin-top:2px; display:flex; flex-wrap:wrap; justify-content:flex-start;">${rangeChips}</div>
            </div>
        `;
        return createUnifiedCard({
            id: `worker-payroll-${summary.workerId}`,
            title: summary.workerName,
            headerMeta: '',
            metaBadges: [],
            mainContentHTML,
            amount: fmtIDR(amountValue),
            amountLabel,
            amountColorClass: amountColor,
            dataset: { 
                'item-id': `worker-${summary.workerId}`,
                itemId: `worker-${summary.workerId}`,
                type: 'worker-payroll',
                workerId: summary.workerId,
                'bill-ids': (summary.billIds || []).join(','),
                totalUnpaid: summary.remaining,
                totalAmount: summary.totalAmount,
                billCount: summary.billCount,
                pageContext: 'tagihan'
            },
            moreAction: true,
            customClasses: 'payroll-summary-card'
        });
    }).join('');
    return `<div class="wa-card-list-wrapper payroll-summary-list">${listHTML}</div>`;
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
        
        // Safety initialization
        if (!appState.activeSubPage) appState.activeSubPage = new Map();
        if (!appState.tagihan) appState.tagihan = {};

        const activeTab = appState.activeSubPage.get('tagihan') || 'tagihan';
        const dateField = (activeTab === 'surat_jalan') ? 'date' : 'dueDate';
        const { searchTerm, category, status, supplierId, projectId, workerId, dateStart, dateEnd, sortBy, sortDirection } = appState.billsFilter || {};
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
            items = allBills.filter(b => !b.isDeleted && ((b.status || 'unpaid') === 'unpaid'));
        } else if (activeTab === 'lunas') {
            items = allBills.filter(b => !b.isDeleted && ((b.status || 'unpaid') === 'paid'));
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
            items = items.filter(item => (item.status || 'unpaid') === status);
        }

         if (supplierId && supplierId !== 'all') {
            items = items.filter(item => {
                const expense = activeTab === 'surat_jalan' ? item : allExpenses.find(e => e.id === item.expenseId);
                return expense && expense.supplierId === supplierId;
            });
        }

        if (projectId && projectId !== 'all') {
            items = items.filter(item => {
                const expense = activeTab === 'surat_jalan' ? item : allExpenses.find(e => e.id === item.expenseId);
                const sourceProjectId = expense?.projectId || item.projectId;
                return sourceProjectId === projectId;
            });
        }

        if (workerId && workerId !== 'all') {
            items = items.filter(item => {
                if (item.type !== 'gaji') return true;
                if (item.workerId === workerId) return true;
                if (Array.isArray(item.workerDetails)) {
                    return item.workerDetails.some(detail => detail.id === workerId || detail.workerId === workerId);
                }
                return false;
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

        // --- PRE-AGGREGATION STEP (NEW) ---
        // Jika kita berada di tab "tagihan" atau "lunas", kita ingin menyatukan semua tagihan gaji
        // satu pekerja menjadi satu item, agar tidak terpecah berdasarkan tanggal saat grouping.
        if (activeTab === 'tagihan' || activeTab === 'lunas') {
            const salaryItems = items.filter(i => i.type === 'gaji');
            const nonSalaryItems = items.filter(i => i.type !== 'gaji');
            const allSalaryBills = allBills.filter(b => b && b.type === 'gaji' && !b.isDeleted);
            const aggregatedSalaryItems = aggregateSalaryBillWorkers(allSalaryBills, { allSalaryBills, sourceItems: allSalaryBills });
            const salaryAggregatesForTab = aggregatedSalaryItems.filter(entry => {
                if (activeTab === 'lunas') {
                    return entry.status === 'paid';
                }
                return entry.status !== 'paid';
            });

            items = [...salaryAggregatesForTab, ...nonSalaryItems];
        }
        // ----------------------------------

        items.sort((a, b) => {
            const safeDate = (value) => {
                const date = getJSDate(value);
                return date && !Number.isNaN(date.getTime()) ? date : new Date(0);
            };
            const dateA = safeDate(a[dateField] || a.date);
            const dateB = safeDate(b[dateField] || b.date);
            const createdAtA = safeDate(a.createdAt || a.date);
            const createdAtB = safeDate(b.createdAt || b.date);
            const amountA = Number(a.amount) || 0;
            const amountB = Number(b.amount) || 0;
            const direction = sortDirection === 'asc' ? 1 : -1;

            let comparison = 0;
            if (sortBy === 'amount') {
                comparison = amountA - amountB;
            } else {
                comparison = dateA - dateB;
            }

            if (comparison === 0) {
                comparison = createdAtA - createdAtB;
            }

            return comparison * direction;
        });

        // FIX: Ensure appState.tagihan exists before assignment
        if (appState.tagihan) {
            appState.tagihan.currentList = items;
        }

        const pendingMaps = await getPendingQuotaMaps(['bills', 'expenses']);
        const pendingOptions = {
            pendingBills: pendingMaps.get('bills') || new Map(),
            pendingExpenses: pendingMaps.get('expenses') || new Map()
        };
        
        // Pass aggregateSalary: false because we already aggregated them above!
        const renderOptions = { aggregateSalary: false };

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

        if (!append || !billsGroupedWrapper) {
            container.innerHTML = renderGroupedList(groupedData, pendingOptions, renderOptions);
            billsGroupedWrapper = container.querySelector('#bills-grouped-wrapper');
            if (!append) {
                container.scrollTop = 0;
            }
            if (billsGroupedWrapper) {
                newlyAddedElements = Array.from(billsGroupedWrapper.querySelectorAll('.wa-card-v2-wrapper'));
            }
        } else {
            newlyAddedElements = appendGroupedSections(billsGroupedWrapper, groupedData, pendingOptions, renderOptions);
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
        // FIX: Ignore AbortError silently
        if (e.name === 'AbortError' || e.message?.includes('aborted')) return;
        
        console.error("Error rendering Tagihan:", e);
        container.innerHTML = getEmptyStateHTML({
            icon: 'error',
            title: 'Gagal Memuat',
            desc: 'Terjadi kesalahan saat memuat data tagihan.'
        });
        container.querySelector('#infinite-scroll-sentinel')?.remove();
    } finally {
        if (!append && signal === pageAbortController?.signal) {
            pageAbortController = null;
        }
        const activeTab = appState.activeSubPage?.get('tagihan') || 'tagihan'; // Safe access
        const paginationKey = `bills_${activeTab}`;
        if (appState.pagination[paginationKey]) {
            appState.pagination[paginationKey].isLoading = false;
        }
    }
}


function loadMoreTagihan() {
    if (appState.activePage !== 'tagihan') return;

    // Safe Check
    if (!appState.activeSubPage) appState.activeSubPage = new Map();
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

    // FIX: Initialize appState.tagihan explicitly
    if (!appState.tagihan) appState.tagihan = {};
    if (!appState.activeSubPage) appState.activeSubPage = new Map();

    if (!appState.billsFilter) {
        appState.billsFilter = { searchTerm: '', projectId: 'all', supplierId: 'all', workerId: 'all', sortBy: 'dueDate', sortDirection: 'desc', category: 'all', status: 'all', dateStart: '', dateEnd: '' };
    } else {
        appState.billsFilter.sortBy = appState.billsFilter.sortBy || 'dueDate';
        appState.billsFilter.sortDirection = appState.billsFilter.sortDirection || 'desc';
        appState.billsFilter.workerId = appState.billsFilter.workerId || 'all';
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

