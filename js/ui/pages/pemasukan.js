import { appState } from '../../state/appState.js';
import { $ } from '../../utils/dom.js';
import { createPageToolbarHTML } from '../components/toolbar.js';
import { createTabsHTML } from '../components/tabs.js';
import { emit, on, off } from '../../state/eventBus.js';
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
import { 
    incomesCol, 
    fundingSourcesCol, 
    fundingCreditorsCol,
    auth 
} from '../../config/firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { 
    query, where, orderBy, limit, startAfter, getDocs 
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { showLoadingModal, hideLoadingModal } from "../components/modal.js";
import { initPullToRefresh, destroyPullToRefresh } from "../components/pullToRefresh.js";
import { showPaymentSuccessPreviewPanel } from '../../services/data/uiInteractionService.js';

const ITEMS_PER_PAGE = 15;
let pageAbortController = null;
let pageObserverInstance = null;
let containerClickHandler = null;

// --- STATE LOKAL ---
let lastVisibleDoc = null;
let isFetching = false;
let accumulatedItems = [];
let currentTab = 'pinjaman'; // 'termin' | 'pinjaman'

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

    return Array.from(groups.values()).sort((a, b) => b.sortDate - a.sortDate);
}

function renderGroupedList(groupedData, type, pendingMaps = {}) {
    // Pass selection mode state to card generator
    const isSelectionMode = appState.selectionMode?.active;
    
    return groupedData.map(group => {
        const body = group.items.map(item => {
            const pendingLog = type === 'termin'
                ? pendingMaps.incomes?.get(item.id)
                : pendingMaps.funding?.get(item.id);
            return _getSinglePemasukanHTML(item, type, { pendingLog, isSelectionMode });
        }).join('');
        return `
            <section class="date-group" data-group-key="${group.key}">
                <div class="date-group-header">${group.label}</div>
                <div class="date-group-body">${body}</div>
            </section>
        `;
    }).join('');
}

function appendPemasukanGroups(wrapper, groups, type, pendingMaps = {}) {
    const inserted = [];
    const isSelectionMode = appState.selectionMode?.active;

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
                return _getSinglePemasukanHTML(item, type, { pendingLog, isSelectionMode });
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
                return _getSinglePemasukanHTML(item, type, { pendingLog, isSelectionMode });
            }).join('');
            sectionEl.innerHTML = `<div class="date-group-header">${group.label}</div><div class="date-group-body">${entries}</div>`;
            wrapper.appendChild(sectionEl);
            sectionEl.querySelectorAll('.wa-card-v2-wrapper')?.forEach(node => inserted.push(node));
        }
    });
    return inserted;
}

async function fetchPemasukanFromServer(isLoadMore = false) {
    if (isFetching) return false;
    isFetching = true;

    try {
        const activeTab = currentTab;
        const collRef = activeTab === 'termin' ? incomesCol : fundingSourcesCol;
        let qConstraints = [];

        if (activeTab === 'pinjaman') {
            const statusFilter = appState.pemasukanFilter?.status || 'all';
            if (statusFilter !== 'all') {
                qConstraints.push(where('status', '==', statusFilter));
            }
        }
        
        const { sortBy = 'date', sortDirection = 'desc' } = appState.pemasukanFilter || {};
        qConstraints.push(orderBy(sortBy, sortDirection));

        qConstraints.push(limit(ITEMS_PER_PAGE));
        if (isLoadMore && lastVisibleDoc) {
            qConstraints.push(startAfter(lastVisibleDoc));
        }

        const q = query(collRef, ...qConstraints);
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
        } else {
             if (isLoadMore) {
                const sent = document.querySelector('#infinite-scroll-sentinel');
                if (sent && pageObserverInstance) pageObserverInstance.unobserve(sent);
                sent?.remove();
             }
        }

        const newItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        if (isLoadMore) {
            accumulatedItems = [...accumulatedItems, ...newItems];
        } else {
            accumulatedItems = newItems;
        }

        return newItems.length > 0;

    } catch (error) {
        console.error("[Pemasukan] Error fetching:", error);
        if (error.code === 'permission-denied') {
             if(!auth.currentUser) console.warn("User belum login");
             emit('ui.toast', { message: 'Akses Ditolak. Relogin.', type: 'error' });
        } 
        return false;
    } finally {
        isFetching = false;
    }
}

async function renderPemasukanContent(append = false) {
    if (!append) pageAbortController?.abort();
    if (!append) pageAbortController = new AbortController();
    const signal = pageAbortController?.signal;
    
    const container = $('#sub-page-content');
    if (!container) return;

    if (!append) {
        if (!accumulatedItems.length || !appState.selectionMode?.active) {
             lastVisibleDoc = null;
             accumulatedItems = [];
             container.innerHTML = createListSkeletonHTML(5);
             await ensureMasterDataFresh(['projects', 'fundingCreditors'], { signal });
        } else {
             container.innerHTML = '';
        }
    }

    try {
        if (accumulatedItems.length === 0 || append) {
             await fetchPemasukanFromServer(append);
        }
        
        if (signal?.aborted) return;

        let items = [...accumulatedItems];
        items = items.filter(item => item.isDeleted !== true);

        if (appState.pemasukan) appState.pemasukan.currentList = items;

        const pendingMaps = await getPendingQuotaMaps(['incomes', 'funding_sources']);
        const pendingOptions = {
            incomes: pendingMaps.get('incomes') || new Map(),
            funding: pendingMaps.get('funding_sources') || new Map()
        };

        if (!append && items.length === 0) {
            let title = `Tidak Ada ${currentTab === 'termin' ? 'Termin' : 'Pinjaman'}`;
            let desc = `Belum ada data ${currentTab} yang tercatat.`;
            if (currentTab === 'pinjaman' && appState.pemasukanFilter?.status !== 'all') {
                desc = `Tidak ada data dengan status tersebut.`;
            }
            container.innerHTML = getEmptyStateHTML({ icon: 'account_balance_wallet', title, desc });
            return;
        }

        const groupedData = groupItemsByDate(items, 'date');
        let listWrapper = container.querySelector('#income-grouped-wrapper');
        let newlyAddedElements = [];

        if (!append || !listWrapper) {
            container.innerHTML = `<div class="wa-card-list-wrapper grouped" id="income-grouped-wrapper">${renderGroupedList(groupedData, currentTab, pendingOptions)}</div>`;
            listWrapper = container.querySelector('#income-grouped-wrapper');
            if (!append) container.scrollTop = 0;
            if (listWrapper) newlyAddedElements = Array.from(listWrapper.querySelectorAll('.wa-card-v2-wrapper'));
        } else {
            newlyAddedElements = appendPemasukanGroups(listWrapper, groupedData, currentTab, pendingOptions);
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
        container.querySelector('#infinite-scroll-sentinel')?.remove();
        
        container.insertAdjacentHTML('beforeend', `<div id="infinite-scroll-sentinel" style="height: 20px;"></div>`);
        const sentinel = container.querySelector('#infinite-scroll-sentinel');

        if (pageObserverInstance) pageObserverInstance.disconnect();
        pageObserverInstance = initInfiniteScroll('#sub-page-content', () => loadMorePemasukan());
        if(sentinel) pageObserverInstance.observe(sentinel);

    } catch(e) {
        if (e.name !== 'AbortError') {
            console.error("Render Error:", e);
            if(!append) container.innerHTML = getEmptyStateHTML({ icon: 'error', title: 'Gagal Memuat', desc: 'Terjadi kesalahan saat memuat data.' });
        }
    }
}

function loadMorePemasukan() {
    if (appState.activePage !== 'pemasukan' || isFetching) return;
    const container = $('#sub-page-content');
    if (container && !container.querySelector('#list-skeleton')) {
        container.insertAdjacentHTML('beforeend', `<div id="list-skeleton" class="skeleton-wrapper">${createListSkeletonHTML(2)}</div>`);
    }
    renderPemasukanContent(true);
}

// --- REPORT LOGIC ---
async function _handleDownloadLoanReport(creditorId = 'all') {
    toast('info', 'Sedang menyiapkan laporan...');
    try {
        let qConstraints = [where('isDeleted', '==', false)];
        if (creditorId !== 'all') {
            qConstraints.push(where('creditorId', '==', creditorId));
        }
        
        const qLoans = query(fundingSourcesCol, ...qConstraints);
        const loanSnaps = await getDocs(qLoans);
        const loans = loanSnaps.docs.map(d => d.data());

        if (loans.length === 0) {
            toast('info', 'Tidak ada data pinjaman untuk laporan ini.');
            return false;
        }

        await ensureMasterDataFresh(['fundingCreditors']);
        const creditorMap = new Map((appState.fundingCreditors || []).map(c => [c.id, c]));
        const creditorName = creditorId === 'all' ? 'Semua Kreditur' : (creditorMap.get(creditorId)?.creditorName || 'Kreditur');

        const summary = loans.reduce((acc, loan) => {
            const principal = Number(loan.totalAmount ?? 0);
            const repayable = Number(loan.totalRepaymentAmount ?? principal);
            const paid = Number(loan.paidAmount ?? 0);
            acc.principal += principal;
            acc.repayable += repayable;
            acc.paid += paid;
            acc.remaining += Math.max(0, repayable - paid);
            return acc;
        }, { principal: 0, repayable: 0, paid: 0, remaining: 0 });

        const detailRows = loans.sort((a, b) => getJSDate(b.date) - getJSDate(a.date)).map(loan => {
            const principal = Number(loan.totalAmount ?? 0);
            const repayable = Number(loan.totalRepaymentAmount ?? principal);
            const paid = Number(loan.paidAmount ?? 0);
            const remaining = Math.max(0, repayable - paid);
            const cName = creditorMap.get(loan.creditorId)?.creditorName || '-';
            return [
                formatDate(loan.date),
                cName,
                loan.description || 'Pinjaman',
                fmtIDR(principal),
                fmtIDR(repayable),
                fmtIDR(paid),
                fmtIDR(remaining),
                loan.status === 'paid' ? 'Lunas' : 'Belum'
            ];
        });

        const reportConfig = {
            title: 'Laporan Pinjaman',
            subtitle: `Filter: ${creditorName}`,
            filename: `Laporan_Pinjaman_${new Date().toISOString().slice(0,10)}.pdf`,
            sections: [
                {
                    sectionTitle: 'Ringkasan',
                    headers: ['Keterangan', { content: 'Total', styles: { halign: 'right' } }],
                    body: [
                        ['Total Pokok', { content: fmtIDR(summary.principal), styles: { halign: 'right' } }],
                        ['Total Kembali', { content: fmtIDR(summary.repayable), styles: { halign: 'right' } }],
                        ['Sudah Dibayar', { content: fmtIDR(summary.paid), styles: { halign: 'right' } }],
                        ['Sisa Hutang', { content: fmtIDR(summary.remaining), styles: { halign: 'right' } }],
                    ]
                },
                {
                    sectionTitle: 'Rincian',
                    headers: ['Tanggal', 'Kreditur', 'Ket', 'Pokok', 'Total', 'Bayar', 'Sisa', 'Status'],
                    body: detailRows
                }
            ]
        };

        await downloadCustomTablePdf(reportConfig);
        return true;

    } catch (e) {
        console.error(e);
        toast('error', 'Gagal membuat laporan.');
        return false;
    }
}

async function _openLoanReportModal() {
    await ensureMasterDataFresh(['fundingCreditors']);
    const creditors = (appState.fundingCreditors || []).filter(c => !c.isDeleted);
    const options = [{ value: 'all', label: 'Semua Kreditur' }, ...creditors.map(c => ({ value: c.id, label: c.creditorName }))];
    
    const content = `
        <form id="loan-report-form">
            ${createModalSelectField({ id: 'loan-report-creditor', label: 'Filter Kreditur', options, value: 'all' })}
            <p class="helper-text">Data akan diambil langsung dari server.</p>
        </form>
    `;
    
    const modalEl = createModal('formView', {
        title: 'Unduh Laporan',
        content,
        footer: `<button type="submit" class="btn btn-primary" form="loan-report-form">Unduh PDF</button>`,
        isUtility: true
    });
    
    initModalSelects(modalEl);
    
    modalEl.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const credId = modalEl.querySelector('#loan-report-creditor').value;
        const success = await _handleDownloadLoanReport(credId);
        if(success) closeModal(modalEl);
    });
}

function _showPemasukanSortModal(onApply) {
    const { sortBy = 'date', sortDirection = 'desc' } = appState.pemasukanFilter || {};
    const content = `
        <form id="sort-form">
            <div class="form-group"><label>Urutkan</label>
                <div class="segmented-control">
                    <input type="radio" id="sort-date" name="sortBy" value="date" ${sortBy === 'date' ? 'checked' : ''}>
                    <label for="sort-date">Tanggal</label>
                    <input type="radio" id="sort-amount" name="sortBy" value="amount" ${sortBy === 'amount' ? 'checked' : ''}>
                    <label for="sort-amount">Jumlah</label>
                </div>
            </div>
            <div class="form-group"><label>Arah</label>
                <div class="segmented-control">
                    <input type="radio" id="sort-desc" name="sortDir" value="desc" ${sortDirection === 'desc' ? 'checked' : ''}>
                    <label for="sort-desc">Terbaru/Terbesar</label>
                    <input type="radio" id="sort-asc" name="sortDir" value="asc" ${sortDirection === 'asc' ? 'checked' : ''}>
                    <label for="sort-asc">Terlama/Terkecil</label>
                </div>
            </div>
        </form>`;
        
    const modal = createModal('actionsPopup', { title: 'Urutkan', content, footer: '<button class="btn btn-primary" id="apply-sort">Terapkan</button>', isUtility: true });
    
    modal.querySelector('#apply-sort').onclick = () => {
        const form = modal.querySelector('form');
        appState.pemasukanFilter.sortBy = form.querySelector('input[name="sortBy"]:checked').value;
        appState.pemasukanFilter.sortDirection = form.querySelector('input[name="sortDir"]:checked').value;
        
        lastVisibleDoc = null;
        accumulatedItems = [];
        renderPemasukanContent(false);
        closeModal(modal);
    };
}

// --- INIT PAGE ---

function initPemasukanPage() {
    if (pageAbortController) pageAbortController.abort();
    pageAbortController = null;
    destroyPullToRefresh();
    
    const container = $('.page-container');
    container.classList.add('page-container--has-panel');

    if (!appState.pemasukanFilter) {
        appState.pemasukanFilter = { status: 'all', sortBy: 'date', sortDirection: 'desc' };
    }
    if (!appState.activeSubPage) appState.activeSubPage = new Map();
    if (!appState.pemasukan) appState.pemasukan = {};

    currentTab = appState.activeSubPage.get('pemasukan') || 'pinjaman';
    lastVisibleDoc = null;
    accumulatedItems = [];

    const pageToolbarHTML = createPageToolbarHTML({
        title: 'Pemasukan',
        actions: [
            { action: 'open-pemasukan-creditor-report', icon: 'download', label: 'Unduh Laporan' },
            { action: 'open-sort', icon: 'sort', label: 'Urutkan' },
            { action: 'toggle-selection-mode', icon: 'check-square', label: 'Pilih Banyak' }
        ]
    });

    const mainTabsData = [
        { id: 'pinjaman', label: 'Pinjaman' },
        { id: 'termin', label: 'Termin Proyek' },
    ];
    const mainTabsHTML = createTabsHTML({ id: 'pemasukan-tabs', tabs: mainTabsData, activeTab: currentTab, customClasses: 'tabs-underline two-tabs' });

    const statusFiltersData = [
        { id: 'all', label: 'Semua' },
        { id: 'unpaid', label: 'Belum Lunas' },
        { id: 'paid', label: 'Lunas' },
    ];
    const statusFiltersHTML = createTabsHTML({
        id: 'pinjaman-status-filters',
        tabs: statusFiltersData,
        activeTab: appState.pemasukanFilter.status || 'all',
        customClasses: 'category-sub-nav'
    });

    container.innerHTML = `
        <div class="content-panel">
            <div class="panel-header">
                ${pageToolbarHTML}
                ${mainTabsHTML}
                <div id="status-filters-container">${statusFiltersHTML}</div>
            </div>
            <div id="sub-page-content" class="panel-body scrollable-content"></div>
        </div>
    `;

    // --- FIX: SELECTION LOGIC & EVENT DELEGATION ---
    containerClickHandler = (e) => {
        const actionTarget = e.target.closest('[data-action]');
        const card = e.target.closest('.wa-card-v2-wrapper');
        const isSelectionActive = appState.selectionMode?.active && appState.selectionMode.pageContext === 'pemasukan';

        if (!actionTarget && isSelectionActive && card) {
            e.preventDefault();
            e.stopPropagation();
            const itemId = card.dataset.itemId || card.dataset.id || card.querySelector('[data-item-id]')?.dataset.itemId || '';
            if (itemId) {
                emit('ui.selection.handleAction', 'toggle-selection', { itemId, cardWrapper: card }, e);
            }
            return;
        }

        if (!actionTarget) {
            const header = e.target.closest('.date-group-header');
            if (header && header.nextElementSibling?.classList.contains('date-group-body')) {
                header.classList.toggle('collapsed');
                header.nextElementSibling.classList.toggle('collapsed');
            }
            return;
        }

        e.stopPropagation();
        const action = actionTarget.dataset.action;

        if (action === 'open-sort') {
            _showPemasukanSortModal();
            return;
        }
        if (action === 'open-pemasukan-creditor-report') {
            _openLoanReportModal();
            return;
        }
        if (action === 'toggle-selection-mode') {
            if (appState.selectionMode?.active) {
                emit('ui.selection.deactivate');
            } else {
                emit('ui.selection.activate', {
                    pageContext: 'pemasukan',
                    supportedActions: [
                        { action: 'delete-selected-items', icon: 'trash-2', label: 'Hapus', danger: true },
                        { action: 'open-selection-summary', icon: 'list', label: 'Rincian' }
                    ]
                });
            }
            return;
        }
    };
    container.addEventListener('click', containerClickHandler);

    // --- RE-RENDER ON SELECTION MODE CHANGES ---
    const selectionRenderHandler = () => renderPemasukanContent(false);
    on('ui.pemasukan.renderContent', selectionRenderHandler);

    initPullToRefresh({
        triggerElement: '.panel-header', 
        scrollElement: '#sub-page-content', 
        indicatorContainer: '#ptr-indicator-container',
        onRefresh: async () => {
            showLoadingModal('Memperbarui...');
            lastVisibleDoc = null;
            accumulatedItems = [];
            await renderPemasukanContent(false);
            hideLoadingModal();
        }
    });

    initPullToRefresh({
        triggerElement: '.panel-header', 
        scrollElement: '#sub-page-content', 
        indicatorContainer: '#ptr-indicator-container',
        onRefresh: async () => {
            showLoadingModal('Memperbarui...');
            lastVisibleDoc = null;
            accumulatedItems = [];
            await renderPemasukanContent(false);
            hideLoadingModal();
        }
    });

    const refreshTransactions = () => {
        if(appState.activePage === 'pemasukan') {
            lastVisibleDoc = null;
            accumulatedItems = [];
            renderPemasukanContent(false);
        }
    };
    on('data.transaction.success', refreshTransactions);

    // Tab Listeners
    const mainTabsContainer = container.querySelector('#pemasukan-tabs');
    const statusFiltersWrapper = container.querySelector('#status-filters-container');
    const updateStatusVisibility = () => {
        if(statusFiltersWrapper) statusFiltersWrapper.style.display = currentTab === 'pinjaman' ? 'block' : 'none';
    };
    updateStatusVisibility();

    if (mainTabsContainer) {
        mainTabsContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.sub-nav-item');
            if (btn && !btn.classList.contains('active')) {
                mainTabsContainer.querySelector('.active')?.classList.remove('active');
                btn.classList.add('active');
                
                currentTab = btn.dataset.tab;
                appState.activeSubPage.set('pemasukan', currentTab);
                
                lastVisibleDoc = null;
                accumulatedItems = [];
                updateStatusVisibility();
                renderPemasukanContent(false);
            }
        }, { passive: true });
    }

    const statusFiltersContainer = container.querySelector('#pinjaman-status-filters');
    if (statusFiltersContainer) {
        statusFiltersContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.sub-nav-item');
            if (btn && !btn.classList.contains('active')) {
                statusFiltersContainer.querySelector('.active')?.classList.remove('active');
                btn.classList.add('active');
                appState.pemasukanFilter.status = btn.dataset.tab;
                
                lastVisibleDoc = null;
                accumulatedItems = [];
                renderPemasukanContent(false);
            }
        }, { passive: true });
    }

    let authUnsub = null;
    if (auth.currentUser) {
        renderPemasukanContent(false);
    } else {
        $('#sub-page-content').innerHTML = createListSkeletonHTML(5);
        authUnsub = onAuthStateChanged(auth, (user) => {
            if (user && accumulatedItems.length === 0) renderPemasukanContent(false);
        });
    }

    const cleanupPemasukan = () => {
        if(pageObserverInstance) pageObserverInstance.disconnect();
        if(authUnsub) authUnsub();
        destroyPullToRefresh();
        const containerEl = $('.page-container');
        if (containerEl && containerClickHandler) {
            containerEl.removeEventListener('click', containerClickHandler);
            containerClickHandler = null;
        }
        off('ui.pemasukan.renderContent', selectionRenderHandler);
        off('data.transaction.success', refreshTransactions);
        off('app.unload.pemasukan', cleanupPemasukan);
    };
    off('app.unload.pemasukan', cleanupPemasukan);
    on('app.unload.pemasukan', cleanupPemasukan);
}

export { initPemasukanPage };
