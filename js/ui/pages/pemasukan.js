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
import { getPendingQuotaMaps } from '../../services/pendingQuotaService.js';
import { downloadCustomTablePdf } from '../../services/reportService.js';
import { toast } from '../components/toast.js';
import { createModalSelectField, initModalSelects } from '../components/forms/index.js';

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
    const todayKey = new Date().toISOString().slice(0, 10);
    const yesterdayKey = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const groups = new Map();

    items.forEach(item => {
        let primaryDate;
        try {
            primaryDate = getJSDate(item[dateField] || item.createdAt);
            if (isNaN(primaryDate.getTime())) throw new Error('invalid');
        } catch (_) {
            primaryDate = new Date();
        }
        const normalized = new Date(primaryDate);
        normalized.setHours(0, 0, 0, 0);
        const groupKey = normalized.toISOString().slice(0, 10);
        let label;
        if (groupKey === todayKey) label = "Hari Ini";
        else if (groupKey === yesterdayKey) label = "Kemarin";
        else label = formatDate(normalized, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

        if (!groups.has(groupKey)) {
            groups.set(groupKey, { key: groupKey, label, sortDate: primaryDate, items: [] });
        }
        groups.get(groupKey).items.push(item);
    });

    groups.forEach(group => {
        group.items.sort((a, b) => getJSDate(b.createdAt || b[dateField]) - getJSDate(a.createdAt || a[dateField]));
    });

    return Array.from(groups.values()).sort((a, b) => b.sortDate - a.sortDate);
}

function renderGroupedList(groupedData, type, pendingMaps = {}) {
    return groupedData.map(group => {
        const body = group.items.map(item => {
            const pendingLog = type === 'termin'
                ? pendingMaps.incomes?.get(item.id)
                : pendingMaps.funding?.get(item.id);
            return _getSinglePemasukanHTML(item, type, { pendingLog });
        }).join('');
        return `
            <section class="date-group" data-group-key="${group.key}">
                <div class="date-group-header">${group.label}</div>
                <div class="date-group-body">${body}</div>
            </section>
        `;
    }).join('');
}

function appendIncomeGroups(wrapper, groups, type, pendingMaps = {}) {
    const inserted = [];
    groups.forEach(group => {
        const section = wrapper.querySelector(`.date-group[data-group-key="${group.key}"]`);
        if (section) {
            const body = section.querySelector('.date-group-body');
            if (!body) return;
            const temp = document.createElement('div');
            temp.innerHTML = group.items.map(item => {
                const pendingLog = type === 'termin'
                    ? pendingMaps.incomes?.get(item.id)
                    : pendingMaps.funding?.get(item.id);
                return _getSinglePemasukanHTML(item, type, { pendingLog });
            }).join('');
            Array.from(temp.children).forEach(node => {
                body.appendChild(node);
                if (node.classList?.contains('wa-card-v2-wrapper')) inserted.push(node);
            });
        } else {
            const sectionEl = document.createElement('section');
            sectionEl.className = 'date-group';
            sectionEl.dataset.groupKey = group.key;
            const entries = group.items.map(item => {
                const pendingLog = type === 'termin'
                    ? pendingMaps.incomes?.get(item.id)
                    : pendingMaps.funding?.get(item.id);
                return _getSinglePemasukanHTML(item, type, { pendingLog });
            }).join('');
            sectionEl.innerHTML = `<div class="date-group-header">${group.label}</div><div class="date-group-body">${entries}</div>`;
            wrapper.appendChild(sectionEl);
            sectionEl.querySelectorAll('.wa-card-v2-wrapper')?.forEach(node => inserted.push(node));
        }
    });
    return inserted;
}

function _safeDate(value) {
    const parsed = getJSDate(value);
    return (parsed instanceof Date && !Number.isNaN(parsed.getTime())) ? parsed : new Date(0);
}

function _prepareLoanReportConfig(creditorId = 'all') {
    const loans = (appState.fundingSources || []).filter(item => !item.isDeleted);
    const filteredLoans = creditorId === 'all' ? loans : loans.filter(item => item.creditorId === creditorId);

    if (!filteredLoans.length) {
        toast('info', 'Tidak ada pinjaman untuk filter kreditur tersebut.');
        return null;
    }

    const creditorMap = new Map((appState.fundingCreditors || []).filter(c => !c.isDeleted).map(c => [c.id, c]));
    const creditorName = creditorId === 'all' ? 'Semua Kreditur' : (creditorMap.get(creditorId)?.creditorName || 'Kreditur Tidak Diketahui');
    const summary = filteredLoans.reduce((acc, loan) => {
        const principal = Number(loan.totalAmount ?? 0);
        const repayable = Number(loan.totalRepaymentAmount ?? principal);
        const paid = Number(loan.paidAmount ?? 0);
        acc.principal += principal;
        acc.repayable += repayable;
        acc.paid += paid;
        acc.remaining += Math.max(0, repayable - paid);
        return acc;
    }, { principal: 0, repayable: 0, paid: 0, remaining: 0 });

    const detailRows = filteredLoans
        .slice()
        .sort((a, b) => _safeDate(b.date) - _safeDate(a.date))
        .map(loan => {
            const principal = Number(loan.totalAmount ?? 0);
            const repayable = Number(loan.totalRepaymentAmount ?? principal);
            const paid = Number(loan.paidAmount ?? 0);
            const remaining = Math.max(0, repayable - paid);
            const creditorLabel = creditorMap.get(loan.creditorId)?.creditorName || 'Kreditur Tidak Diketahui';
            const dateObj = getJSDate(loan.date);
            const hasValidDate = (dateObj instanceof Date) && !Number.isNaN(dateObj.getTime());
            const dateLabel = hasValidDate ? dateObj.toLocaleDateString('id-ID') : '-';
            const statusLabel = loan.status === 'paid' ? 'Lunas' : 'Belum Lunas';
            return [
                dateLabel,
                creditorLabel,
                loan.description || 'Pinjaman',
                fmtIDR(principal),
                fmtIDR(repayable),
                fmtIDR(paid),
                fmtIDR(remaining),
                statusLabel
            ];
        });

    const filenameCreditor = creditorName.replace(/[\s/]+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '');
    const today = new Date().toISOString().slice(0, 10);

    return {
        title: 'Laporan Pinjaman per Kreditur',
        subtitle: `Kreditur: ${creditorName}`,
        filename: `Laporan-Pinjaman-${filenameCreditor || 'Kreditur'}-${today}.pdf`,
        sections: [
            {
                sectionTitle: 'Ringkasan Pinjaman',
                headers: ['Deskripsi', { content: 'Jumlah', styles: { halign: 'right' } }],
                body: [
                    ['Total Pokok Pinjaman', { content: fmtIDR(summary.principal), styles: { halign: 'right' } }],
                    ['Total Pengembalian', { content: fmtIDR(summary.repayable), styles: { halign: 'right' } }],
                    ['Sudah Dibayar', { content: fmtIDR(summary.paid), styles: { halign: 'right' } }],
                    ['Sisa Tagihan', { content: fmtIDR(summary.remaining), styles: { halign: 'right' } }],
                ],
            },
            {
                sectionTitle: 'Rincian Pinjaman',
                headers: ['Tanggal', 'Kreditur', 'Deskripsi', 'Pokok', 'Total Bayar', 'Sudah Dibayar', 'Sisa', 'Status'],
                body: detailRows,
            },
        ],
    };
}

async function _handleDownloadLoanReport(creditorId = 'all') {
    const reportConfig = _prepareLoanReportConfig(creditorId);
    if (!reportConfig) return false;
    await downloadCustomTablePdf(reportConfig);
    return true;
}

async function _openLoanReportModal() {
    try {
        await ensureMasterDataFresh(['fundingCreditors']);
    } catch (_) {}

    const creditors = (appState.fundingCreditors || []).filter(c => !c.isDeleted);
    const options = [{ value: 'all', label: 'Semua Kreditur' }, ...creditors.map(c => ({ value: c.id, label: c.creditorName || 'Kreditur Tanpa Nama' }))];
    const dropdownHTML = createModalSelectField({
        id: 'loan-report-creditor',
        label: 'Filter Kreditur',
        options,
        value: 'all',
        placeholder: 'Pilih kreditur'
    });
    const content = `
        <form id="loan-report-form">
            ${dropdownHTML}
            <p class="helper-text" style="margin-top: 0;">Pilih "Semua Kreditur" untuk merangkum seluruh pinjaman.</p>
        </form>
    `;
    const isMobile = window.matchMedia('(max-width: 599px)').matches;
    const modalEl = createModal(isMobile ? 'actionsPopup' : 'formView', {
        title: 'Unduh Laporan Pinjaman',
        content,
        footer: `<button type="submit" class="btn btn-primary" form="loan-report-form">Unduh PDF</button>`,
        isUtility: true,
        layoutClass: isMobile ? 'is-bottom-sheet' : ''
    });

    initModalSelects(modalEl);

    const form = modalEl?.querySelector('#loan-report-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const selectedCreditor = form.querySelector('#loan-report-creditor')?.value || 'all';
        const success = await _handleDownloadLoanReport(selectedCreditor);
        if (success) closeModal(modalEl);
    });
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
        const direction = sortDirection === 'asc' ? 1 : -1;
        const getSortableAmount = (entry) => Number(entry.totalRepaymentAmount ?? entry.totalAmount ?? entry.amount ?? 0);
        itemsSource.sort((a, b) => {
            const safeDate = (value) => {
                const date = getJSDate(value);
                return date && !Number.isNaN(date.getTime()) ? date : new Date(0);
            };
            const amountA = getSortableAmount(a);
            const amountB = getSortableAmount(b);
            const dateA = safeDate(a.date);
            const dateB = safeDate(b.date);
            const createdAtA = safeDate(a.createdAt || a.date);
            const createdAtB = safeDate(b.createdAt || b.date);

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

        const pendingMaps = await getPendingQuotaMaps(['incomes', 'funding_sources']);
        const pendingOptions = {
            incomes: pendingMaps.get('incomes') || new Map(),
            funding: pendingMaps.get('funding_sources') || new Map()
        };

        // listHTML sekarang HANYA berisi grup-grup
        const groupedData = groupItemsByDate(itemsToDisplay, 'date');
        if (signal?.aborted) return; 

        let newlyAddedElements = [];
        let listWrapper = container.querySelector('#income-grouped-wrapper');

        if (!append || !listWrapper) {
            const listHTML = renderGroupedList(groupedData, activeTab, pendingOptions);
            container.innerHTML = `<div class="wa-card-list-wrapper grouped" id="income-grouped-wrapper">${listHTML}</div>`;
            listWrapper = container.querySelector('#income-grouped-wrapper');
            if (!append) {
                container.scrollTop = 0;
            }
            if (listWrapper) {
                newlyAddedElements = Array.from(listWrapper.querySelectorAll('.wa-card-v2-wrapper'));
            }
        } else {
            newlyAddedElements = appendIncomeGroups(listWrapper, groupedData, activeTab, pendingOptions);
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

    const isMobile = window.matchMedia('(max-width: 599px)').matches;
    const modalEl = createModal(isMobile ? 'actionsPopup' : 'formView', {
      title: 'Urutkan Pemasukan',
      content,
      footer,
      isUtility: true,
      layoutClass: isMobile ? 'is-bottom-sheet' : ''
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
        title: 'Pemasukan',
        actions: [
            { action: 'open-pemasukan-creditor-report', icon: 'download', label: 'Unduh Laporan Pinjaman' }
        ]
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
    on('ui.pemasukan.openLoanReport', () => _openLoanReportModal(), { signal: listenerSignal });
}

export { initPemasukanPage };
