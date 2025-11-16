import { appState } from '../../state/appState.js';
import { $ } from '../../utils/dom.js';
import { createPageToolbarHTML } from '../components/toolbar.js';
import { createTabsHTML } from '../components/tabs.js';
import { createUnifiedCard } from '../components/cards.js';
import { buildPendingQuotaBanner } from '../components/pendingQuotaBanner.js';
import { getEmptyStateHTML, getEndOfListPlaceholderHTML } from '../components/emptyState.js';
import { formatDate } from '../../utils/formatters.js';
import { emit, on, off } from '../../state/eventBus.js';
import { liveQueryMulti } from '../../state/liveQuery.js';
import { initInfiniteScroll, cleanupInfiniteScroll } from '../components/infiniteScroll.js';
import { createListSkeletonHTML } from '../components/skeleton.js';
import { getJSDate } from '../../utils/helpers.js';
import { getPendingQuotaMaps } from '../../services/pendingQuotaService.js';

const ITEMS_PER_PAGE_STOCK = 30;
let stockObserverInstance = null;
let pageAbortController = null;
let pageEventListenerController = null;
let unsubscribeLiveQuery = null;
let renderDebounceTimer = null;

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
        archive: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-archive ${classes}"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>`,
        history: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-history ${classes}"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>`,
        'list-checks': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-list-checks ${classes}"><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg>`,
        'more-vertical': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-more-vertical ${classes}"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>`,
    };
    return icons[iconName] || '';
}

function _getMaterialsListHTML(materialsParam = null) {
    const materials = (materialsParam ?? (appState.materials || [])).filter(m => !m.isDeleted);
    if (materials.length === 0) {
        return `<div class="card card-pad">${getEmptyStateHTML({ icon:'inventory_2', title:'Belum Ada Data Material', desc:'Tambahkan master material terlebih dahulu.' })}</div>`;
    }
    return `<div class="wa-card-list-wrapper">${materials.map(mat => {
        const title = mat.materialName || 'Tanpa Nama';
        const unitText = mat.unit ? mat.unit : '';
        const headerMeta = `<span class="header-meta-unit">${unitText}</span>`;
        const currentStock = Number(mat.currentStock || 0);
        
        const mainContentHTML = `
            <div class="wa-card-v2__description">Stok Saat Ini: <strong>${currentStock}</strong> ${mat.unit || ''}</div>
        `;

        const dataset = { 'item-id': mat.id, pageContext: 'stok', type: 'materials' };
        return createUnifiedCard({ 
            id: `material-${mat.id}`, 
            title, 
            headerMeta,
            metaBadges: [], 
            mainContentHTML,
            dataset, 
            moreAction: true, 
            amount: '', 
            amountLabel: '' 
        });
    }).join('')}</div>`;
}

function _getMaterialExpensesListHTML(expensesParam = null) {
    const expenses = (expensesParam ?? (appState.expenses || [])).filter(e => !e.isDeleted && e.type === 'material' && Array.isArray(e.items) && e.items.length > 0);
    if (expenses.length === 0) {
        return `<div class="card card-pad">${getEmptyStateHTML({ icon:'receipt_long', title:'Belum Ada Riwayat Material', desc:'Input material via faktur/surat jalan akan tampil di sini.' })}</div>`;
    }
    const sorted = expenses.sort((a,b) => getJSDate(b.date) - getJSDate(a.date));
    return `<div class="wa-card-list-wrapper">${sorted.map(exp => {
        const supplier = (appState.suppliers || []).find(s => s.id === exp.supplierId);
        const project = (appState.projects || []).find(p => p.id === exp.projectId);
        const title = exp.description || (supplier?.supplierName ? `Pembelian - ${supplier.supplierName}` : 'Pembelian Material');
        const headerMeta = formatDate(getJSDate(exp.date));
        
        const mainContentHTML = `
            <div class="wa-card-v2__description sub">${supplier?.supplierName || "Supplier -" } ${project ? ("| " + project.projectName) : ""}</div>
        `;

        const dataset = { 'item-id': exp.id, pageContext: 'stok', type: 'expense', expenseId: exp.id };
        return createUnifiedCard({ id: `exp-${exp.id}`, title, headerMeta, metaBadges: [], mainContentHTML, dataset, moreAction: true, amount: '', amountLabel: '' });
    }).join('')}</div>`;
}

async function renderStokContent(append = false) {
    if (!append && pageAbortController) pageAbortController.abort();
    if (!append) pageAbortController = new AbortController();
    const signal = pageAbortController.signal;
    
    const container = $('#sub-page-content');
    if (!container) return;

    if (!append) {
        container.innerHTML = createListSkeletonHTML(5);
    }

    try {
        const activeTab = appState.activeSubPage.get('stok') || 'daftar';
        const pendingTargets = activeTab === 'daftar' ? ['materials'] : ['expenses','stock_transactions'];
        const pendingMaps = await getPendingQuotaMaps(pendingTargets);
        const pendingMaterials = pendingMaps.get('materials') || new Map();
        const pendingExpenses = pendingMaps.get('expenses') || new Map();
        const pendingStockTx = pendingMaps.get('stock_transactions') || new Map();
        
        let sourceItems = [];
        if (activeTab === 'daftar') {
            sourceItems = (appState.materials || []).filter(m => !m.isDeleted);
            const sortMode = (() => { try { return localStorage.getItem('stok.sortMode') || 'name'; } catch(_) { return 'name'; } })();
            const stats = _computeMaterialStats();
            const byName = (a,b) => (a.materialName || '').localeCompare(b.materialName || '');
            const sorters = {
                name: (a,b) => byName(a,b),
                most_used: (a,b) => (stats[b.id]?.usageCount || 0) - (stats[a.id]?.usageCount || 0) || byName(a,b),
                incoming: (a,b) => (stats[b.id]?.incoming || 0) - (stats[a.id]?.incoming || 0) || byName(a,b),
                outgoing: (a,b) => (stats[b.id]?.outgoing || 0) - (stats[a.id]?.outgoing || 0) || byName(a,b),
                invoice_incoming: (a,b) => (stats[b.id]?.invoiceInCount || 0) - (stats[a.id]?.invoiceInCount || 0) || byName(a,b),
            };
            try { sourceItems.sort(sorters[sortMode] || sorters.name); } catch(_) {}
        } else {
            const toSafeDate = (value) => {
                const parsed = getJSDate(value);
                return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date(0);
            };
            const purchaseEntries = (appState.expenses || [])
                .filter(e => !e.isDeleted && e.type === 'material' && Array.isArray(e.items) && e.items.length > 0)
                .map(exp => ({
                    kind: 'expense',
                    sortDate: toSafeDate(exp.date),
                    data: exp
                }));
            const usageEntries = (appState.stockTransactions || [])
                .filter(tx => !tx.isDeleted && tx.type === 'out')
                .map(tx => ({
                    kind: 'stock_out',
                    sortDate: toSafeDate(tx.date || tx.createdAt),
                    data: tx
                }));
            sourceItems = [...purchaseEntries, ...usageEntries]
                .sort((a, b) => b.sortDate - a.sortDate);
        }

        if (!append) {
            _updateStockHeroCarousel();
        }

        if (signal?.aborted) throw new DOMException('Operation aborted', 'AbortError');

        const paginationKey = `stok_${activeTab}`;
        if (!appState.pagination[paginationKey] || !append) {
            appState.pagination[paginationKey] = { isLoading: false, hasMore: true, page: 0 };
        }
        const state = appState.pagination[paginationKey];
        const startIndex = append ? (state.page + 1) * ITEMS_PER_PAGE_STOCK : 0;
        const endIndex = startIndex + ITEMS_PER_PAGE_STOCK;
        
        const itemsToDisplay = sourceItems.slice(startIndex, endIndex);
        const visibleItems = append ? sourceItems.slice(0, endIndex) : itemsToDisplay;
        
        state.hasMore = endIndex < sourceItems.length;
        if (append || startIndex === 0) {
            state.page = Math.floor(startIndex / ITEMS_PER_PAGE_STOCK);
        }
        
        if (!append && visibleItems.length === 0) {
            const emptyHTML = (activeTab === 'daftar')
                ? `<div class="card card-pad">${getEmptyStateHTML({ icon:'inventory_2', title:'Belum Ada Data Material', desc:'Tambahkan master material terlebih dahulu.' })}</div>`
                : `<div class="card card-pad">${getEmptyStateHTML({ icon:'history', title:'Belum Ada Riwayat Stok', desc:'Catatan pembelian atau penyaluran material akan tampil di sini.' })}</div>`;
            container.innerHTML = emptyHTML;
            return;
        }

        if (append && itemsToDisplay.length === 0) {
            container.querySelector('#list-skeleton')?.remove();
            return;
        }

        let itemsHTML;
        if (activeTab === 'daftar') {
            itemsHTML = itemsToDisplay.map(mat => {
                const title = mat.materialName || 'Tanpa Nama';
                const unitText = mat.unit ? mat.unit : '';
                const headerMeta = `<span class="header-meta-unit">${unitText}</span>`;
                const currentStock = Number(mat.currentStock || 0);
                const mainContentHTML = `<div class="wa-card-v2__description">Stok Saat Ini: <strong>${currentStock}</strong> ${mat.unit || ''}</div>`;
                const dataset = { 'item-id': mat.id, pageContext: 'stok', type: 'materials' };
                const cardHTML = createUnifiedCard({
                    id: `material-${mat.id}`,
                    title,
                    headerMeta,
                    metaBadges: [],
                    mainContentHTML,
                    dataset,
                    moreAction: false,
                    amount: '',
                    amountLabel: '',
                    cardAction: 'open-stock-usage-modal'
                });
                const pendingLog = pendingMaterials.get(mat.id);
                return pendingLog ? `${buildPendingQuotaBanner(pendingLog)}${cardHTML}` : cardHTML;
            }).join('');
        } else {
            itemsHTML = itemsToDisplay.map(entry => {
                if (entry.kind === 'expense') {
                    const exp = entry.data;
                    const supplier = (appState.suppliers || []).find(s => s.id === exp.supplierId);
                    const project = (appState.projects || []).find(p => p.id === exp.projectId);
                    const title = exp.description || (supplier?.supplierName ? `Pembelian - ${supplier.supplierName}` : 'Pembelian Material');
                    const headerMeta = formatDate(entry.sortDate || getJSDate(exp.date));
                    const mainContentHTML = `<div class="wa-card-v2__description sub">${supplier?.supplierName || "Supplier -" } ${project ? ("| " + project.projectName) : ""}</div>`;
                    const dataset = { 'item-id': exp.id, pageContext: 'stok', type: 'expense', expenseId: exp.id };
                    const cardHTML = createUnifiedCard({
                        id: `exp-${exp.id}`,
                        title,
                        headerMeta,
                        metaBadges: [],
                        mainContentHTML,
                        dataset,
                        moreAction: false,
                        amount: '',
                        amountLabel: '',
                        cardAction: 'view-invoice-items'
                    });
                    const pendingLog = pendingExpenses.get(exp.id);
                    return pendingLog ? `${buildPendingQuotaBanner(pendingLog)}${cardHTML}` : cardHTML;
                }

                const tx = entry.data;
                const material = (appState.materials || []).find(m => m.id === tx.materialId);
                const project = tx.projectId ? (appState.projects || []).find(p => p.id === tx.projectId) : null;
                const kindLabel = 'Stok Keluar';
                const title = material ? `${kindLabel} - ${material.materialName}` : kindLabel;
                const headerMeta = formatDate(entry.sortDate || getJSDate(tx.date || tx.createdAt));
                const quantity = Number(tx.quantity || 0);
                const quantityText = quantity ? quantity.toLocaleString('id-ID') : '0';
                const unitText = material?.unit ? ` ${material.unit}` : '';
                const usageInfo = project ? `<div class="wa-card-v2__description sub">Dialokasikan ke: ${project.projectName}</div>` : '';
                const mainContentHTML = usageInfo;
                const dataset = {
                    'item-id': tx.id,
                    pageContext: 'stok',
                    type: 'stock-transaction',
                    transactionId: tx.id,
                    materialId: tx.materialId,
                    stockType: tx.type,
                    projectId: tx.projectId || '',
                    quantity: quantity,
                    unit: material?.unit || '',
                    recordedAt: tx.createdAt || tx.date || ''
                };
                const cardHTML = createUnifiedCard({
                    id: `stock-${tx.id}`,
                    title,
                    headerMeta,
                    metaBadges: [{ icon: 'history', text: kindLabel }],
                    mainContentHTML,
                    dataset,
                    moreAction: false,
                    amount: quantityText,
                    amountLabel: unitText.trim(),
                    cardAction: 'open-stock-history-modal'
                });
                const pendingLog = pendingStockTx.get(tx.id);
                return pendingLog ? `${buildPendingQuotaBanner(pendingLog)}${cardHTML}` : cardHTML;
            }).join('');
        }

        if (signal?.aborted) throw new DOMException('Operation aborted', 'AbortError');

        const listWrapper = container.querySelector('.wa-card-list-wrapper');
        if (append && listWrapper) {
            listWrapper.insertAdjacentHTML('beforeend', itemsHTML);
        } else {
            container.innerHTML = `<div class="wa-card-list-wrapper">${itemsHTML}</div>`;
        }

        const wrappers = container.querySelectorAll('.wa-card-v2-wrapper:not([data-animated])');
        wrappers.forEach((el, idx) => {
            el.style.animationDelay = `${Math.min(idx, 20) * 22}ms`;
            el.classList.add('item-entering');
            el.setAttribute('data-animated', 'true');
        });

        container.querySelector('#list-skeleton')?.remove();
        const oldSentinel = container.querySelector('#infinite-scroll-sentinel');
        if (oldSentinel) {
            if (stockObserverInstance) stockObserverInstance.unobserve(oldSentinel);
            oldSentinel.remove();
        }

        if (state.hasMore) {
            container.insertAdjacentHTML('beforeend', `<div id="list-skeleton" class="skeleton-wrapper">${createListSkeletonHTML(3)}</div>`);
            const sentinel = document.createElement('div');
            sentinel.id = 'infinite-scroll-sentinel';
            sentinel.style.height = '10px';
            container.appendChild(sentinel);
            if (stockObserverInstance) {
                stockObserverInstance.observe(sentinel);
            } else {
                stockObserverInstance = initInfiniteScroll('#sub-page-content');
                if (stockObserverInstance) stockObserverInstance.observe(sentinel);
            }
        } else if (sourceItems.length > 0) {
            container.insertAdjacentHTML('beforeend', getEndOfListPlaceholderHTML());
        }

    } catch (e) {
        if (e.name !== 'AbortError') {
            container.innerHTML = `<div class="card card-pad">${getEmptyStateHTML({ icon:'error_outline', title:'Gagal Memuat', desc:'Terjadi kesalahan saat memuat data stok.' })}</div>`;
        }
    } finally {
        if (!append && signal === pageAbortController?.signal) {
             pageAbortController = null;
        }
        const activeTab = appState.activeSubPage.get('stok') || 'daftar';
        const paginationKey = `stok_${activeTab}`;
        if (appState.pagination[paginationKey]) {
            appState.pagination[paginationKey].isLoading = false;
        }
    }
}

function loadMoreStok() {
    if (appState.activePage !== 'stok') return;
    
    const activeTab = appState.activeSubPage.get('stok') || 'daftar';
    const key = `stok_${activeTab}`;
    const state = appState.pagination[key];
    if (!state || state.isLoading || !state.hasMore) return;
    
    state.isLoading = true;
    const container = $('#sub-page-content');
    if (container && !container.querySelector('#list-skeleton')) {
        container.insertAdjacentHTML('beforeend', `<div id="list-skeleton" class="skeleton-wrapper">${createListSkeletonHTML(3)}</div>`);
    }
    
    setTimeout(() => {
        renderStokContent(true);
    }, 300);
}

function initStokPage() {
    if (pageAbortController) pageAbortController.abort();
    if (pageEventListenerController) pageEventListenerController.abort();
    pageAbortController = new AbortController();
    pageEventListenerController = new AbortController();
    const { signal: listenerSignal } = pageEventListenerController;
    
    if (unsubscribeLiveQuery) unsubscribeLiveQuery.unsubscribe();
    unsubscribeLiveQuery = null;
    if (renderDebounceTimer) clearTimeout(renderDebounceTimer);
    renderDebounceTimer = null;
    stockObserverInstance = null;
    
    appState.pagination.stok_daftar = { isLoading: false, hasMore: true, page: 0 };
    appState.pagination.stok_riwayat = { isLoading: false, hasMore: true, page: 0 };

    const container = $('.page-container');
    const pageToolbarHTML = createPageToolbarHTML({
        title: 'Manajemen Stok',
        actions: [
            { icon: 'sort', label: 'Urutkan', action: 'open-stock-sort-modal' }
        ],
    });

    const tabsData = [
        { id: 'daftar', label: 'Daftar Stok' },
        { id: 'riwayat', label: 'Riwayat Transaksi' },
    ];
    const savedTab = appState.activeSubPage.get('stok') || 'daftar';
    const tabsHTML = createTabsHTML({ id: 'stok-tabs', tabs: tabsData, activeTab: savedTab, customClasses: 'tabs-underline two-tabs' });

    const heroSection = `<div id="stock-hero-carousel" class="dashboard-hero-carousel hero-stock"></div>`;
    container.innerHTML = `
        <div class="content-panel">
            <div class="panel-header">
                ${pageToolbarHTML}
                ${heroSection}
                ${tabsHTML}
            </div>
            <div id="sub-page-content" class="panel-body scrollable-content"></div>
        </div>
    `;

    const scrollableBody = container.querySelector('#sub-page-content');
    if (scrollableBody) {
        const handleScrollFallback = () => {
            if (appState.activePage !== 'stok') return;
            const activeTab = appState.activeSubPage.get('stok') || 'daftar';
            const paginationKey = `stok_${activeTab}`;
            const state = appState.pagination[paginationKey];
            if (!state || state.isLoading || !state.hasMore) return;
            const distanceFromBottom = scrollableBody.scrollHeight - (scrollableBody.scrollTop + scrollableBody.clientHeight);
            if (distanceFromBottom < 200) {
                loadMoreStok();
            }
        };
        scrollableBody.addEventListener('scroll', handleScrollFallback, { passive: true, signal: listenerSignal });
    }

    const tabsContainer = container.querySelector('#stok-tabs');
    if (tabsContainer) {
        tabsContainer.addEventListener('click', (e) => {
            const tabButton = e.target.closest('.sub-nav-item');
            if (tabButton && !tabButton.classList.contains('active')) {
                const currentActive = tabsContainer.querySelector('.sub-nav-item.active');
                if(currentActive) currentActive.classList.remove('active');
                tabButton.classList.add('active');
                appState.activeSubPage.set('stok', tabButton.dataset.tab);
                renderStokContent(false);
            }
        }, { signal: listenerSignal });
    }
    
    stockObserverInstance = initInfiniteScroll('#sub-page-content');
    renderStokContent(false);

    try {
        if (unsubscribeLiveQuery) unsubscribeLiveQuery.unsubscribe();
        
        unsubscribeLiveQuery = liveQueryMulti(['materials','stockTransactions','expenses','suppliers','projects'], () => {
            if (appState.activePage === 'stok') {
                renderStokContent(false);
            }
        });

    } catch (_) {}
    
    const cleanupStok = () => {
        off('app.unload.stok', cleanupStok);
        if (pageAbortController) {
            pageAbortController.abort();
            pageAbortController = null;
        }
        if (pageEventListenerController) {
            pageEventListenerController.abort();
            pageEventListenerController = null;
        }
        cleanupInfiniteScroll();
        stockObserverInstance = null;
    };

    off('app.unload.stok', cleanupStok);
    on('app.unload.stok', cleanupStok);
    on('request-more-data', loadMoreStok, { signal: listenerSignal });
    on('ui.stok.renderContent', () => renderStokContent(false), { signal: listenerSignal });
}

export { initStokPage };

function _computeMaterialStats() {
    const stats = Object.create(null);
    const ensure = (id) => (stats[id] || (stats[id] = { usageCount: 0, incoming: 0, outgoing: 0, invoiceInCount: 0 }));

    const txs = Array.isArray(appState.stockTransactions) ? appState.stockTransactions : [];
    txs.forEach(tx => {
        if (!tx || tx.isDeleted) return;
        const s = ensure(tx.materialId);
        const qty = Number(tx.quantity || 0);
        if (tx.type === 'in') s.incoming += qty;
        else if (tx.type === 'out') s.outgoing += qty;
    });

    const exps = Array.isArray(appState.expenses) ? appState.expenses : [];
    exps.forEach(exp => {
        if (!exp || exp.isDeleted || exp.type !== 'material' || !Array.isArray(exp.items)) return;
        exp.items.forEach(it => {
            const matId = it.materialId || it.id || it.itemId;
            if (!matId) return;
            const s = ensure(matId);
            s.usageCount += 1;
            s.invoiceInCount += 1;
        });
    });
    return stats;
}

function _updateStockHeroCarousel() {
    const wrap = document.getElementById('stock-hero-carousel');
    if (!wrap) return;

    const materials = (appState.materials || []).filter(m => !m.isDeleted);
    const stats = _computeMaterialStats();
    const totalStock = materials.reduce((sum, mat) => sum + (Number(mat.currentStock) || 0), 0);
    const totals = Object.values(stats).reduce((acc, item) => {
        acc.incoming += item.incoming || 0;
        acc.outgoing += item.outgoing || 0;
        return acc;
    }, { incoming: 0, outgoing: 0 });

    const transactions = (appState.stockTransactions || []).filter(tx => !tx.isDeleted);
    const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const recentTx = transactions.filter(tx => {
        const d = getJSDate(tx.date || tx.createdAt);
        return d && !Number.isNaN(d.getTime()) && d.getTime() >= cutoff;
    });
    const recentOut = recentTx.filter(tx => tx.type === 'out');
    const recentIn = recentTx.filter(tx => tx.type === 'in');
    const recentOutQty = recentOut.reduce((sum, tx) => sum + (Number(tx.quantity) || 0), 0);
    const recentInQty = recentIn.reduce((sum, tx) => sum + (Number(tx.quantity) || 0), 0);

    const formatNumber = (value, options = {}) => {
        const number = Number(value) || 0;
        const formatter = new Intl.NumberFormat('id-ID', options);
        return formatter.format(number);
    };

    const slides = [
        {
            title: 'Ringkasan Inventaris',
            tone: 'success',
            lines: [
                `Material aktif: ${formatNumber(materials.length)} jenis`,
                `Stok tersedia: ${formatNumber(totalStock)} unit`
            ]
        },
        {
            title: 'Mutasi 30 Hari',
            tone: 'warning',
            lines: [
                `Keluar: ${formatNumber(recentOut.length)} trx (${formatNumber(recentOutQty)} unit)`,
                `Masuk: ${formatNumber(recentIn.length)} trx (${formatNumber(recentInQty)} unit)`
            ]
        },
        {
            title: 'Akumulasi Pencatatan',
            tone: 'danger',
            lines: [
                `Total masuk: ${formatNumber(totals.incoming)} unit`,
                `Total keluar: ${formatNumber(totals.outgoing)} unit`
            ]
        }
    ];

    wrap.innerHTML = [
        ...slides.map((slide, idx) => `
            <div class="dashboard-hero hero-slide${idx === 0 ? ' active' : ''}" data-index="${idx}" data-tone="${slide.tone}">
                <div class="hero-content">
                    <h1>${slide.title}</h1>
                    <p>${slide.lines.join(' · ')}</p>
                </div>
                <div class="hero-illustration" aria-hidden="true">
                    <svg viewBox="0 0 200 100" preserveAspectRatio="xMidYMid meet">
                        <defs>
                            <linearGradient id="stockHero1-${idx}" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" style="stop-color:var(--hero-emerald);stop-opacity:0.18" />
                                <stop offset="100%" style="stop-color:var(--hero-indigo);stop-opacity:0.25" />
                            </linearGradient>
                            <linearGradient id="stockHero2-${idx}" x1="100%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" style="stop-color:var(--hero-sun);stop-opacity:0.18" />
                                <stop offset="100%" style="stop-color:var(--hero-rose);stop-opacity:0.25" />
                            </linearGradient>
                        </defs>
                        <circle cx="48" cy="52" r="40" fill="url(#stockHero1-${idx})" class="hero-circle1" />
                        <circle cx="140" cy="60" r="32" fill="url(#stockHero2-${idx})" class="hero-circle2" />
                        <path d="M 18 78 Q 50 48 96 56 T 180 70" stroke="var(--hero-indigo)" stroke-width="3" fill="none" stroke-linecap="round" class="hero-line" opacity="0.25" />
                    </svg>
                </div>
            </div>
        `),
        `<div class="hero-indicators">${slides.map((_, i) => `<span class="dot${i === 0 ? ' active' : ''}" data-idx="${i}"></span>`).join('')}</div>`
    ].join('');

    _initStockHeroCarouselBehavior(wrap, slides.length);
}

function _initStockHeroCarouselBehavior(wrap, totalSlides) {
    if (!wrap) return;
    let index = 0;
    const setIndex = (next) => {
        index = (next + totalSlides) % totalSlides;
        wrap.querySelectorAll('.hero-slide').forEach((el, idx) => {
            el.classList.toggle('active', idx === index);
        });
        wrap.querySelectorAll('.hero-indicators .dot').forEach((dot, idx) => {
            dot.classList.toggle('active', idx === index);
        });
    };

    if (wrap._timer) clearInterval(wrap._timer);
    wrap._timer = setInterval(() => setIndex(index + 1), 7000);

    wrap.querySelectorAll('.hero-indicators .dot').forEach(dot => {
        dot.addEventListener('click', () => {
            const idx = parseInt(dot.getAttribute('data-idx')) || 0;
            setIndex(idx);
            if (wrap._timer) {
                clearInterval(wrap._timer);
                wrap._timer = setInterval(() => setIndex(index + 1), 7000);
            }
        });
    });

    let startX = 0;
    let currentX = 0;
    let isDragging = false;
    wrap.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        currentX = startX;
        isDragging = true;
    }, { passive: true });
    wrap.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        currentX = e.touches[0].clientX;
    }, { passive: true });
    wrap.addEventListener('touchend', () => {
        if (!isDragging) return;
        const dx = currentX - startX;
        isDragging = false;
        if (Math.abs(dx) > 40) {
            setIndex(index + (dx < 0 ? 1 : -1));
            if (wrap._timer) {
                clearInterval(wrap._timer);
                wrap._timer = setInterval(() => setIndex(index + 1), 7000);
            }
        }
    });
}
