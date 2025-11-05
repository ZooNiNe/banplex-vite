import { appState } from '../../state/appState.js';
import { $, $$ } from '../../utils/dom.js';
import { createPageToolbarHTML } from '../components/toolbar.js';
import { getEmptyStateHTML, getEndOfListPlaceholderHTML } from '../components/emptyState.js';
import { _getLogAktivitasListHTML } from '../components/cards.js';
import { initInfiniteScroll, cleanupInfiniteScroll } from '../components/infiniteScroll.js';
import { createListSkeletonHTML } from '../components/skeleton.js';
import { fmtIDR } from '../../utils/formatters.js';
import { getJSDate } from '../../utils/helpers.js';
import { emit, on } from '../../state/eventBus.js';
import { createTabsHTML } from '../components/tabs.js';
import { liveQueryMulti } from '../../state/liveQuery.js';
import { localDB } from '../../services/localDbService.js';
import { TEAM_ID } from '../../config/constants.js';
import { db, billsCol, logsCol } from '../../config/firebase.js';
import { getDocs, collection, doc, query, orderBy, startAfter, limit, onSnapshot, where } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';
import { showPaymentSuccessPreviewPanel } from '../../services/data/uiInteractionService.js';

function createIcon(iconName, size = 16, classes = '') {
    const icons = {
        add_circle: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus-circle ${classes}"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>`,
        edit_circle: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pencil ${classes}"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
        delete: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2 ${classes}"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
        info: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info ${classes}"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
    };
    return icons[iconName] || icons['info'];
}

const getIconForAction = (action) => {
    const type = action ? action.toLowerCase() : '';
    if (type.includes('create') || type.includes('add') || type.includes('menambah')) return 'add_circle';
    if (type.includes('update') || type.includes('edit') || type.includes('memperbarui')) return 'edit_circle';
    if (type.includes('delete') || type.includes('menghapus')) return 'delete';
    return 'info';
};

const ITEMS_PER_PAGE = 20;
let logsPagination = { isLoading: false, hasMore: true, page: -1, lastDoc: null };
let loadedLogs = [];
let activityAbortController = null;
let logsRealtimeUnsub = null;
let paymentsLiveSub = null;
let activityObserverInstance = null;
let pageEventListenerController = null;

function groupLogsByDate(items) {
    const grouped = {};
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    items.forEach(item => {
        let d;
        try { d = getJSDate(item.createdAt || item.date); } catch(_) { d = new Date(); }
        const dKey = d.toISOString().slice(0,10);
        let label;
        if (dKey === today) label = 'Hari Ini';
        else if (dKey === yesterday) label = 'Kemarin';
        else label = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        if (!grouped[label]) grouped[label] = [];
        grouped[label].push(item);
    });
    for (const label in grouped) {
        grouped[label].sort((a,b) => getJSDate(b.createdAt) - getJSDate(a.createdAt));
    }
    return grouped;
}

function renderGroupedLogs(grouped) {
    let html = '';
    const order = Object.keys(grouped).sort((a,b) => {
        const fa = grouped[a]?.[0], fb = grouped[b]?.[0];
        if (a === 'Hari Ini') return -1; if (b === 'Hari Ini') return 1;
        if (a === 'Kemarin') return -1; if (b === 'Kemarin') return 1;
        if (!fa || !fb) return 0;
        return getJSDate(fb.createdAt) - getJSDate(fa.createdAt);
    });
    order.forEach(label => {
        html += `<div class="date-group-header">${label}</div>`;
        html += `<div class="date-group-body">${_getLogAktivitasListHTML(grouped[label])}</div>`;
    });
    return `<div class="wa-card-list-wrapper grouped" id="activity-grouped-wrapper">${html}</div>`;
}

async function fetchLogsPage() {
    const results = [];
    const constraints = [orderBy('createdAt', 'desc'), limit(ITEMS_PER_PAGE)];
    if (logsPagination.lastDoc) constraints.splice(1, 0, startAfter(logsPagination.lastDoc));
    try {
        const q = query(logsCol, ...constraints);
        const snap = await getDocs(q);
        const docs = snap.docs;
        if (docs.length === 0) {
            logsPagination.hasMore = false;
        } else {
            logsPagination.lastDoc = docs[docs.length - 1];
            for (const d of docs) {
                const data = d.data();
                results.push({ id: d.id, ...data });
            }
        }
    } catch (e) {
        console.warn('Gagal mengambil logs server:', e);
        logsPagination.hasMore = false;
    }

    // Tambahkan pending logs lokal di awal page pertama
    if (logsPagination.page < 0) {
        try {
            const pending = await localDB.pending_logs.toArray();
            pending.sort((a,b) => getJSDate(b.createdAt) - getJSDate(a.createdAt));
            const normalized = pending.map(p => ({ id: `pending-${p.createdAt?.getTime?.() || Math.random()}`, ...p }));
            // pending muncul di paling atas (terbaru)
            return [...normalized, ...results];
        } catch(_) {}
    }
    return results;
}

async function renderActivityTab(append = false) {
    if (activityAbortController) { try { activityAbortController.abort(); } catch(_) {} }
    activityAbortController = new AbortController();
    const signal = activityAbortController.signal;
    const container = $('#sub-page-content');
    if (!container) return;

    if (logsPagination.isLoading) return;
    logsPagination.isLoading = true;
    if (!append) {
        logsPagination = { isLoading: true, hasMore: true, page: -1, lastDoc: null };
        loadedLogs = [];
        container.innerHTML = createListSkeletonHTML(5);
    } else {
        container.insertAdjacentHTML('beforeend', `<div id="list-skeleton" class="skeleton-wrapper">${createListSkeletonHTML(3)}</div>`);
    }

    try {
        logsPagination.page += 1;
        const pageItems = await fetchLogsPage();
        if (signal.aborted) return;
        loadedLogs.push(...pageItems);
        const grouped = groupLogsByDate(loadedLogs);

        const existingWrapper = container.querySelector('#activity-grouped-wrapper');
        if (!existingWrapper) {
            container.innerHTML = renderGroupedLogs(grouped);
        } else {
            existingWrapper.outerHTML = renderGroupedLogs(grouped);
        }

        container.querySelector('#list-skeleton')?.remove();
        const oldSentinel = container.querySelector('#infinite-scroll-sentinel');
        if (oldSentinel) {
            if (activityObserverInstance) activityObserverInstance.unobserve(oldSentinel);
            oldSentinel.remove();
        }

        if (logsPagination.hasMore) {
            container.insertAdjacentHTML('beforeend', `<div id="list-skeleton" class="skeleton-wrapper">${createListSkeletonHTML(3)}</div>`);
            
            const sentinel = document.createElement('div');
            sentinel.id = 'infinite-scroll-sentinel';
            sentinel.style.height = '10px';
            container.appendChild(sentinel);

            if (activityObserverInstance) {
                activityObserverInstance.observe(sentinel);
            } else {
                activityObserverInstance = initInfiniteScroll('#sub-page-content');
                if (activityObserverInstance) activityObserverInstance.observe(sentinel);
            }
        } else if (loadedLogs.length > 0) {
            container.insertAdjacentHTML('beforeend', getEndOfListPlaceholderHTML ? getEndOfListPlaceholderHTML() : '');
        }
        const wrapper = container.querySelector('#activity-grouped-wrapper');
        if (wrapper && !wrapper.__collapseBound) {
            wrapper.addEventListener('click', (e) => {
                const header = e.target.closest('.date-group-header');
                if (!header) return;
                const body = header.nextElementSibling;
                if (!body) return;
                body.style.display = body.style.display === 'none' ? '' : 'none';
            });
            wrapper.__collapseBound = true;
        }
    } finally {
        logsPagination.isLoading = false;
        container.querySelector('#list-skeleton')?.remove();
    }
}

async function fetchAllPaymentEntries() {
    const entries = [];
    const bills = Array.isArray(appState.bills) ? appState.bills : [];

    // Local pending payments first
    try {
        const pending = await localDB.pending_payments.toArray();
        for (const p of pending) {
            const bill = bills.find(b => b.id === p.billId) || await localDB.bills.get(p.billId);
            const isSalary = bill?.type === 'gaji';
            let recipientName = 'Penerima';
            let description = bill?.description || 'Tagihan';
            if (isSalary) {
                recipientName = p.workerName || 'Pekerja';
                description = `Pembayaran Gaji${p.workerName ? `: ${p.workerName}` : ''}`;
            } else if (bill?.expenseId) {
                const exp = appState.expenses?.find(e => e.id === bill.expenseId) || await localDB.expenses.get(bill.expenseId);
                const supplier = exp ? appState.suppliers?.find(s => s.id === exp.supplierId) || await localDB.suppliers.get(exp.supplierId) : null;
                recipientName = supplier?.supplierName || 'Penerima';
                description = bill?.description || 'Tagihan';
            }
            entries.push({
                id: `pending-${p.billId}-${p.createdAt?.getTime?.() || Date.now()}`,
                billId: p.billId,
                amount: p.amount || 0,
                date: getJSDate(p.date || p.createdAt || new Date()),
                recipient: recipientName,
                description,
                isLunas: bill?.status === 'paid',
                source: 'pending'
            });
        }
    } catch (_) {}

    // Server payments if online
    if (navigator.onLine) {
        for (const bill of bills) {
            try {
                const billRef = doc(billsCol, bill.id);
                const q = query(collection(billRef, 'payments'), orderBy('date', 'desc'));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    const isSalary = bill?.type === 'gaji';
                    let defaultRecipient = 'Penerima';
                    if (isSalary) {
                        if (Array.isArray(bill.workerDetails) && bill.workerDetails.length === 1) defaultRecipient = bill.workerDetails[0].name;
                        else if (Array.isArray(bill.workerDetails) && bill.workerDetails.length > 1) defaultRecipient = 'Beberapa Pekerja';
                        else {
                            const w = appState.workers?.find(wk => wk.id === bill.workerId);
                            defaultRecipient = w?.workerName || 'Pekerja';
                        }
                    } else if (bill?.expenseId) {
                        const exp = appState.expenses?.find(e => e.id === bill.expenseId) || await localDB.expenses.get(bill.expenseId);
                        const supplier = exp ? appState.suppliers?.find(s => s.id === exp.supplierId) || await localDB.suppliers.get(exp.supplierId) : null;
                        defaultRecipient = supplier?.supplierName || 'Penerima';
                    }

                    snap.docs.forEach(d => {
                        const pd = d.data();
                        const date = getJSDate(pd.date);
                        let recipientName = defaultRecipient;
                        let description = bill?.description || (isSalary ? 'Pembayaran Gaji' : 'Pembayaran Tagihan');
                        if (isSalary && pd.workerId && pd.workerName) {
                            recipientName = pd.workerName;
                            description = `Pembayaran Gaji: ${pd.workerName}`;
                        }
                        entries.push({
                            id: d.id,
                            billId: bill.id,
                            amount: pd.amount || 0,
                            date,
                            recipient: recipientName,
                            description,
                            isLunas: bill?.status === 'paid',
                            source: 'server'
                        });
                    });
                }
            } catch (_) {}
        }
    }

    // Sort by date desc
    entries.sort((a, b) => b.date - a.date);
    return entries;
}

function createPaymentCardHTML(item) {
    const dateStr = item.date?.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const subtitle = item.source === 'pending' ? 'Lokal • Menunggu sinkronisasi' : 'Tersimpan di server';
    return `
        <div class="wa-card-v2-wrapper payment-history-card" data-bill-id="${item.billId}" data-amount="${item.amount}" data-date="${item.date?.toISOString?.() || ''}" data-recipient="${item.recipient}" data-description="${item.description}" data-is-lunas="${item.isLunas ? '1' : '0'}">
            <div class="wa-card-v2">
                <div class="wa-card-v2__main">
                    <div class="wa-card-v2__header">
                        <div class="wa-card-v2__title">${item.recipient}</div>
                        <div class="wa-card-v2__header-meta">${dateStr}</div>
                    </div>
                    <div class="wa-card-v2__body">
                        <div class="wa-card-v2__description">${item.description}</div>
                    </div>
                </div>
                <div class="wa-card-v2__actions">
                    <div class="wa-card-v2__amount wa-card-v2__amount--positive">${fmtIDR(item.amount || 0)}</div>
                </div>
            </div>
        </div>
    `;
}

async function renderPaymentHistoryTab() {
    const container = $('#sub-page-content');
    if (!container) return;
    container.innerHTML = `<div class="wa-card-list-wrapper payment-history-list"></div>`;
    const listEl = container.querySelector('.payment-history-list');

    const items = await fetchAllPaymentEntries();
    if (!items || items.length === 0) {
        listEl.innerHTML = getEmptyStateHTML({ icon: 'history', title: 'Belum Ada Pembayaran', desc: 'Belum ada riwayat pembayaran yang bisa ditampilkan.' });
        return;
    }
    listEl.innerHTML = items.map(createPaymentCardHTML).join('');

    // Click listener: open payment success panel
    listEl.addEventListener('click', (e) => {
        const card = e.target.closest('.wa-card-v2-wrapper.payment-history-card');
        if (!card) return;
        const amount = Number(card.dataset.amount || 0);
        const dateStr = card.dataset.date;
        const date = dateStr ? new Date(dateStr) : new Date();
        const recipient = card.dataset.recipient || 'Penerima';
        const description = card.dataset.description || 'Pembayaran';
        const isLunas = card.dataset.isLunas === '1';
        const billId = card.dataset.billId;

        showPaymentSuccessPreviewPanel({
            title: 'Pembayaran Berhasil!',
            description,
            amount,
            date,
            recipient,
            isLunas,
            billId
        }, 'log_aktivitas');
    });
}

function initLogAktivitasPage() {
    const container = $('.page-container');
    const pageToolbarHTML = createPageToolbarHTML({ title: 'Log Aktivitas' });
    const heroHTML = `
        <div class="list-hero list-hero--journal">
            <div class="list-hero__content">
                <div class="list-hero__title">Riwayat Perubahan</div>
                <div class="list-hero__subtitle">Pantau aktivitas tambah, ubah, dan hapus.</div>
            </div>
            <div class="list-hero__art" aria-hidden="true">
                <svg width="88" height="72" viewBox="0 0 88 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <linearGradient id="gLogs" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.18" />
                            <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.05" />
                        </linearGradient>
                    </defs>
                    <rect x="10" y="12" width="60" height="40" rx="8" fill="url(#gLogs)" stroke="var(--line)"/>
                    <rect x="16" y="22" width="24" height="6" rx="3" fill="var(--primary)" opacity="0.22" />
                    <rect x="16" y="34" width="32" height="6" rx="3" fill="var(--primary)" opacity="0.14" />
                </svg>
            </div>
        </div>`;

    if (activityAbortController) { try { activityAbortController.abort(); } catch(_) {} }
        activityAbortController = null;
        
    if (pageEventListenerController) pageEventListenerController.abort();
        pageEventListenerController = new AbortController();
    const { signal: listenerSignal } = pageEventListenerController;
    container.innerHTML = `
        <div class="content-panel">
            <div class="panel-header">
                ${pageToolbarHTML}
                ${heroHTML}
                ${createTabsHTML({ id: 'log-tabs', activeTab: 'activity', customClasses: 'tabs-underline', tabs: [
                    { id: 'activity', label: 'Aktivitas' },
                    { id: 'payments', label: 'Riwayat Pembayaran' }
                ]})}
            </div>
            <div id="sub-page-content" class="panel-body scrollable-content"></div>
        </div>
    `;
    try { localStorage.setItem('logs.lastSeenAt', new Date().toISOString()); } catch(_) {}
    renderActivityTab(false);
    try {
        const qLive = query(logsCol, where('createdAt', '>', new Date()), orderBy('createdAt','desc'));
        if (logsRealtimeUnsub) { try { logsRealtimeUnsub(); } catch(_) {} }
        logsRealtimeUnsub = onSnapshot(qLive, (snapshot) => {
            let hasNew = false;
            snapshot.docChanges().forEach((ch) => { if (ch.type === 'added') hasNew = true; });
            if (hasNew) {
                renderActivityTab(false);
            }
        });
    } catch(_) {}

    const tabsEl = $('#log-tabs');
    tabsEl?.addEventListener('click', (e) => {
        const btn = e.target.closest('.sub-nav-item');
        if (!btn) return;
        const tab = btn.dataset.tab;
        $$('#log-tabs .sub-nav-item').forEach(b => b.classList.toggle('active', b === btn));
        if (tab === 'payments') {
            renderPaymentHistoryTab();
        } else {
            renderActivityTab(false);
        }
    });

    activityObserverInstance = initInfiniteScroll('#sub-page-content');
    
    const onMore = () => {
        if (appState.activePage !== 'log_aktivitas') return;
        if (logsPagination.isLoading || !logsPagination.hasMore) return; // <--- PERBAIKAN: Tambahkan cek isLoading
        renderActivityTab(true);
    };
    
    on('request-more-data', onMore, { signal: listenerSignal });

    try {
        if (paymentsLiveSub) { paymentsLiveSub.unsubscribe?.(); paymentsLiveSub = null; }
        paymentsLiveSub = liveQueryMulti ? liveQueryMulti(['bills','expenses','workers','suppliers'], () => {
            const activeBtn = document.querySelector('#log-tabs .sub-nav-item.active');
            if (activeBtn && activeBtn.dataset.tab === 'payments') {
                renderPaymentHistoryTab();
            }
        }) : null;
    } catch(_) {}
}

on('app.unload.log_aktivitas', () => {
    try { if (logsRealtimeUnsub) { logsRealtimeUnsub(); logsRealtimeUnsub = null; } } catch(_) {}
    try { if (paymentsLiveSub) { paymentsLiveSub.unsubscribe?.(); paymentsLiveSub = null; } } catch(_) {}
    try { if (activityAbortController) { activityAbortController.abort(); } } catch(_) {}
    try { if (pageEventListenerController) { pageEventListenerController.abort(); } } catch(_) {}
    pageEventListenerController = null;

    try { cleanupInfiniteScroll(); } catch(_) {}
    activityObserverInstance = null;
});
function renderLogContent() { try { renderActivityTab(false); } catch(_) {} }
on('ui.log.renderContent', renderLogContent);
export { initLogAktivitasPage };
