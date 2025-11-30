import { appState } from '../../state/appState.js';
import { $ } from '../../utils/dom.js';
import { createPageToolbarHTML } from '../components/toolbar.js';
import { getEndOfListPlaceholderHTML } from '../components/emptyState.js';
import { _getLogAktivitasListHTML } from '../components/cards.js';
import { initInfiniteScroll, cleanupInfiniteScroll } from '../components/infiniteScroll.js';
import { createListSkeletonHTML } from '../components/skeleton.js';
import { getJSDate } from '../../utils/helpers.js';
import { on } from '../../state/eventBus.js';
import { localDB } from '../../services/localDbService.js';
import { logsCol } from '../../config/firebase.js';
import { getDocs, query, orderBy, startAfter, limit, onSnapshot, where } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';

const ITEMS_PER_PAGE = 20;
let logsPagination = { isLoading: false, hasMore: true, page: -1, lastDoc: null };
let loadedLogs = [];
let activityAbortController = null;
let logsRealtimeUnsub = null;
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

    if (logsPagination.page < 0) {
        const localEntries = [];
        try {
            const localQuota = await localDB.logs.where('status').equals('pending_quota').toArray();
            localQuota.sort((a,b) => getJSDate(b.createdAt) - getJSDate(a.createdAt));
            localEntries.push(...localQuota.map(log => ({ id: log.id || `local-log-${log.createdAt?.getTime?.() || Math.random()}`, ...log })));
        } catch(_) {}

        try {
            const pending = await localDB.pending_logs.toArray();
            pending.sort((a,b) => getJSDate(b.createdAt) - getJSDate(a.createdAt));
            localEntries.push(...pending.map(p => ({ id: `pending-${p.createdAt?.getTime?.() || Math.random()}`, ...p })));
        } catch(_) {}

        if (localEntries.length > 0) {
            const seen = new Set(results.map(item => item.id));
            const filteredLocal = localEntries.filter(entry => {
                if (!entry.id || seen.has(entry.id)) return false;
                seen.add(entry.id);
                return true;
            });
            return [...filteredLocal, ...results];
        }
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
                activityObserverInstance = initInfiniteScroll('#sub-page-content', () => renderActivityTab(true));
                if (activityObserverInstance) activityObserverInstance.observe(sentinel);
            }
        } else if (loadedLogs.length > 0) {
            container.insertAdjacentHTML('beforeend', getEndOfListPlaceholderHTML ? getEndOfListPlaceholderHTML() : '');
        }
        
        // Setup collapse listener
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

    // HAPUS TABS: Langsung render kontainer utama
    container.innerHTML = `
        <div class="content-panel">
            <div class="panel-header">
                ${pageToolbarHTML}
                ${heroHTML}
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

    activityObserverInstance = initInfiniteScroll('#sub-page-content');

    const onMore = () => {
        if (appState.activePage !== 'log_aktivitas') return;
        if (logsPagination.isLoading || !logsPagination.hasMore) return;
        renderActivityTab(true);
    };

    on('request-more-data', onMore, { signal: listenerSignal });
}

on('app.unload.log_aktivitas', () => {
    try { if (logsRealtimeUnsub) { logsRealtimeUnsub(); logsRealtimeUnsub = null; } } catch(_) {}
    try { if (activityAbortController) { activityAbortController.abort(); } } catch(_) {}
    try { if (pageEventListenerController) { pageEventListenerController.abort(); } } catch(_) {}
    pageEventListenerController = null;

    try { cleanupInfiniteScroll(); } catch(_) {}
    activityObserverInstance = null;
});

function renderLogContent() { try { renderActivityTab(false); } catch(_) {} }
on('ui.log.renderContent', renderLogContent);

export { initLogAktivitasPage };