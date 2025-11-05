import { appState } from '../../state/appState.js';
import { $ } from '../../utils/dom.js';
import { createPageToolbarHTML } from '../components/toolbar.js';
import { createTabsHTML } from '../components/tabs.js';
import { createUnifiedCard, _getJurnalHarianListHTML, _getRekapGajiListHTML, _getJurnalPerPekerjaListHTML } from '../components/cards.js';
import { getEmptyStateHTML, getEndOfListPlaceholderHTML } from '../components/emptyState.js';
import { formatDate, fmtIDR } from '../../utils/formatters.js';
import { emit, on, off } from '../../state/eventBus.js';
import { initInfiniteScroll, cleanupInfiniteScroll } from '../components/infiniteScroll.js';
import { createListSkeletonHTML } from '../components/skeleton.js';
import { getJSDate } from '../../utils/helpers.js';
import { localDB } from '../../services/localDbService.js';
import { openSalaryRecapPanel } from '../../services/data/jurnalService.js';
import { openDailyProjectPickerForEdit } from '../../services/data/jurnalService.js';
import { openDailyAttendanceEditorPanel } from '../../services/data/attendanceService.js';
import { liveQueryMulti } from '../../state/liveQuery.js';

const ITEMS_PER_PAGE = 20;

let pageAbortController = null;
let pageEventListenerController = null;
let journalObserverInstance = null;
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
        settings: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings ${classes}"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2l-.15.1a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1 0-2l.15-.1a2 2 0 0 0 .73 2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
    };
    return icons[iconName] || '';
}


function groupItemsByMonth(items, dateField = 'date') {
    const grouped = {};
    items.forEach(item => {
        const date = getJSDate(item[dateField]);
        const monthYearKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        const monthYearLabel = date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

        if (!grouped[monthYearKey]) {
            grouped[monthYearKey] = { label: monthYearLabel, items: [] };
        }
        grouped[monthYearKey].items.push(item);
    });
    return grouped;
}

function _renderGroupedListItems(groupedData, type) {
    let html = '';
    const sortedMonthKeys = Object.keys(groupedData).sort().reverse();

    sortedMonthKeys.forEach(key => {
        const group = groupedData[key];
        html += `<div class="month-group-header date-group-header">${group.label}</div>`;
        
        let sortedItemsInMonth;
        if (type === 'per_pekerja') {
            sortedItemsInMonth = group.items.sort((a, b) => (a.workerName || '').localeCompare(b.workerName || ''));
        } else {
            sortedItemsInMonth = group.items.sort((a, b) => getJSDate(b.date || b.createdAt) - getJSDate(a.date || a.createdAt));
        }

        let groupHTML = '';
        if (type === 'harian') {
            groupHTML = _getJurnalHarianListHTML(sortedItemsInMonth);
        } else if (type === 'rekap_gaji') {
            groupHTML = _getRekapGajiListHTML(sortedItemsInMonth);
        } else if (type === 'per_pekerja') {
            groupHTML = _getJurnalPerPekerjaListHTML(sortedItemsInMonth);
        }
        html += `<div class="date-group-body">${groupHTML}</div>`;
    });
    return html;
}


async function renderJurnalContent(append = false) {
    if (!append && pageAbortController) pageAbortController.abort();
    if (!append) pageAbortController = new AbortController();
    const signal = pageAbortController.signal;

    const container = $('#sub-page-content');
    if (!container) return;

    if (!append) {
        container.innerHTML = createListSkeletonHTML(5);
    }

    const activeTab = appState.activeSubPage.get('jurnal') || 'harian';
    let sourceItems = [];

    if (activeTab === 'harian') {
        const groupedByDate = (appState.attendanceRecords || []).reduce((acc, record) => {
            if (record.isDeleted) return acc;
            const recDate = getJSDate(record.date);
            const y = recDate.getFullYear();
            const m = String(recDate.getMonth() + 1).padStart(2, '0');
            const d = String(recDate.getDate()).padStart(2, '0');
            const date = `${y}-${m}-${d}`;

            if (!acc[date]) acc[date] = { date, totalPay: 0, workerCount: new Set() };
            acc[date].totalPay += record.totalPay || 0;
            acc[date].workerCount.add(record.workerId);
            return acc;
        }, {});
        sourceItems = Object.values(groupedByDate).sort((a, b) => getJSDate(b.date) - getJSDate(a.date));
    } else {
        const attendance = (appState.attendanceRecords || []).filter(r => !r.isDeleted);
        const workersMap = new Map();

        (appState.workers || []).filter(w => !w.isDeleted).forEach(w => {
            workersMap.set(w.id, {
                workerId: w.id,
                workerName: w.workerName,
                professionId: w.professionId,
                totalDays: 0,
                totalUnpaid: 0,
                lastActivity: 0
            });
        });

        attendance.forEach(rec => {
            if (workersMap.has(rec.workerId)) {
                const workerData = workersMap.get(rec.workerId);
                const recDate = getJSDate(rec.date).getTime();
                if (recDate > workerData.lastActivity) workerData.lastActivity = recDate;
                if (rec.attendanceStatus === 'full_day') workerData.totalDays += 1;
                else if (rec.attendanceStatus === 'half_day') workerData.totalDays += 0.5;
                if (!rec.isPaid) workerData.totalUnpaid += (rec.totalPay || 0);
            }
        });
        
        sourceItems = Array.from(workersMap.values())
            .filter(w => w.totalDays > 0)
            .sort((a, b) => b.lastActivity - a.lastActivity);
    }

    if (signal?.aborted) throw new DOMException('Operation aborted', 'AbortError');

    const paginationKey = `jurnal_${activeTab}`;
    if (!appState.pagination[paginationKey] || !append) {
        appState.pagination[paginationKey] = { isLoading: false, hasMore: true, page: 0 };
    }
    const paginationState = appState.pagination[paginationKey];

    const startIndex = append ? (paginationState.page + 1) * ITEMS_PER_PAGE : 0;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const itemsToDisplay = sourceItems.slice(startIndex, endIndex);

    if (append || startIndex === 0) {
        paginationState.page = Math.floor(startIndex / ITEMS_PER_PAGE);
    }
    paginationState.hasMore = endIndex < sourceItems.length;
    paginationState.isLoading = false;

    if (!append && sourceItems.length === 0) {
        const emptyConfig = activeTab === 'harian'
            ? { icon: 'event_note', title: 'Jurnal Kosong', desc: 'Belum ada absensi harian yang tercatat.' }
            : { icon: 'request_quote', title: 'Belum Ada Data Pekerja', desc: 'Belum ada absensi pekerja yang tercatat.' };
        container.innerHTML = getEmptyStateHTML(emptyConfig);
        return;
    }

    if (append && itemsToDisplay.length === 0) {
        container.querySelector('#list-skeleton')?.remove();
        return;
    }

    const groupedData = groupItemsByMonth(itemsToDisplay, activeTab === 'harian' ? 'date' : 'lastActivity');
    const listHTML = _renderGroupedListItems(groupedData, activeTab);
    
    let listWrapper = container.querySelector('#journal-grouped-wrapper');
    let newlyAddedElements = [];

    if (append) {
        if (!listWrapper) {
            container.innerHTML = `<div class="wa-card-list-wrapper grouped" id="journal-grouped-wrapper">${listHTML}</div>`;
            listWrapper = container.querySelector('#journal-grouped-wrapper');
        } else {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = listHTML;
            newlyAddedElements = Array.from(tempDiv.children);
            newlyAddedElements.forEach(el => listWrapper.appendChild(el));
        }
    } else {
        container.innerHTML = `<div class="wa-card-list-wrapper grouped" id="journal-grouped-wrapper">${listHTML}</div>`;
        listWrapper = container.querySelector('#journal-grouped-wrapper');
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
            el.addEventListener('animationend', () => el.classList.remove('item-entering'), { once: true });
        }
    });

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

    container.querySelector('#list-skeleton')?.remove();
    const oldSentinel = container.querySelector('#infinite-scroll-sentinel');
    if (oldSentinel) {
        if (journalObserverInstance) journalObserverInstance.unobserve(oldSentinel);
        oldSentinel.remove();
    }

    if (paginationState.hasMore) {
        container.insertAdjacentHTML('beforeend', `<div id="list-skeleton" class="skeleton-wrapper">${createListSkeletonHTML(3)}</div>`);
        const sentinel = document.createElement('div');
        sentinel.id = 'infinite-scroll-sentinel';
        sentinel.style.height = '10px';
        container.appendChild(sentinel);

        if (journalObserverInstance) {
            journalObserverInstance.observe(sentinel);
        } else {
            journalObserverInstance = initInfiniteScroll('#sub-page-content');
            if (journalObserverInstance) journalObserverInstance.observe(sentinel);
        }
    } else if (sourceItems.length > 0) {
        container.insertAdjacentHTML('beforeend', getEndOfListPlaceholderHTML());
    }
}

function loadMoreJurnal() {
    if (appState.activePage !== 'jurnal') return;
    
    const activeTab = appState.activeSubPage.get('jurnal') || 'harian';
    const paginationKey = `jurnal_${activeTab}`;
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
    if (container && !container.querySelector('#list-skeleton')) {
         container.insertAdjacentHTML('beforeend', `<div id="list-skeleton" class="skeleton-wrapper">${createListSkeletonHTML(3)}</div>`);
    }
    
    renderJurnalContent(true);
}


function initJurnalHeroCarousel() {
    const container = document.getElementById('jurnal-hero-carousel');
    if (!container) return;

    if (container.dataset.initialized === '1') return;
    container.dataset.initialized = '1';

    const buildSlides = async () => {
        const attendance = (appState.attendanceRecords || []).filter(r => !r.isDeleted);
        const salaryBills = (appState.bills || []).filter(b => b.type === 'gaji' && !b.isDeleted);
        const workers = new Set(attendance.map(r => r.workerId));

        let totalDays = 0;
        attendance.forEach(rec => {
            if (rec.attendanceStatus === 'full_day') totalDays += 1;
            else if (rec.attendanceStatus === 'half_day') totalDays += 0.5;
        });

        const totalWagesPaid = salaryBills.filter(b => b.status === 'paid').reduce((sum, b) => sum + (b.amount || 0), 0);
        const totalWagesUnpaid = salaryBills.filter(b => b.status === 'unpaid').reduce((sum, b) => sum + Math.max(0, (b.amount || 0) - (b.paidAmount || 0)), 0);

        const slides = [
            {
                title: 'Total Hari Kerja Tercatat',
                tone: 'success',
                lines: [
                    `${totalDays.toLocaleString('id-ID')} Hari Kerja`,
                    `${workers.size} Pekerja Aktif`,
                ]
            },
            {
                title: 'Ringkasan Upah',
                tone: 'warning',
                lines: [
                    `Dibayar: ${fmtIDR(totalWagesPaid)}`,
                    `Belum Lunas: ${fmtIDR(totalWagesUnpaid)}`,
                ]
            },
        ];

        container.innerHTML = [
            ...slides.map((s, idx) => `
                <div class="dashboard-hero hero-slide${idx === 0 ? ' active' : ''}" data-index="${idx}" data-tone="${s.tone}">
                    <div class="hero-content">
                        <h1>${s.title}</h1>
                        <p>${s.lines.join(' · ')}</p>
                    </div>
                </div>
            `),
            `<div class="hero-indicators">${slides.map((_, i) => `<span class="dot${i===0?' active':''}" data-idx="${i}"></span>`).join('')}</div>`
        ].join('');

        initCarouselBehavior(container, slides.length);
    };

    const initCarouselBehavior = (wrap, total) => {
        let index = 0;
        const setIndex = (i) => {
            index = (i + total) % total;
            wrap.querySelectorAll('.hero-slide').forEach((el, idx) => {
                el.classList.toggle('active', idx === index);
            });
            wrap.querySelectorAll('.hero-indicators .dot').forEach((d, idx) => {
                d.classList.toggle('active', idx === index);
            });
        };

        if (wrap._timer) clearInterval(wrap._timer);
        wrap._timer = setInterval(() => setIndex(index + 1), 7000);

        wrap.querySelectorAll('.hero-indicators .dot').forEach(dot => {
            dot.addEventListener('click', () => {
                const idx = parseInt(dot.getAttribute('data-idx')) || 0;
                setIndex(idx);
                if (wrap._timer) { clearInterval(wrap._timer); wrap._timer = setInterval(() => setIndex(index + 1), 7000); }
            });
        });

        let startX = 0, currentX = 0, isDragging = false;
        wrap.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX; isDragging = true; currentX = startX;
        }, { passive: true });
        wrap.addEventListener('touchmove', (e) => {
            if (!isDragging) return; currentX = e.touches[0].clientX;
        }, { passive: true });
        wrap.addEventListener('touchend', () => {
            if (!isDragging) return; const dx = currentX - startX; isDragging = false;
            if (Math.abs(dx) > 40) {
                setIndex(index + (dx < 0 ? 1 : -1));
                if (wrap._timer) { clearInterval(wrap._timer); wrap._timer = setInterval(() => setIndex(index + 1), 7000); }
            }
        });

        window.addEventListener('hashchange', () => { if (wrap._timer) clearInterval(wrap._timer); }, { once: true });
    };

    buildSlides();
}


function initJurnalPage() {
    if (pageAbortController) pageAbortController.abort();
    if (pageEventListenerController) pageEventListenerController.abort();
    pageAbortController = new AbortController();
    pageEventListenerController = new AbortController();
    const { signal: listenerSignal } = pageEventListenerController;
    journalObserverInstance = null;
    if (unsubscribeLiveQuery) unsubscribeLiveQuery.unsubscribe();
    unsubscribeLiveQuery = null;

    appState.pagination.jurnal_harian = { isLoading: false, hasMore: true, page: 0 };
    appState.pagination.jurnal_per_pekerja = { isLoading: false, hasMore: true, page: 0 };

    const container = $('.page-container');
    const pageToolbarHTML = createPageToolbarHTML({ 
        title: 'Jurnal',
        actions: [
             { icon: 'settings', label: 'Rekap Gaji', action: 'open-salary-recap-panel' }
        ]
    });

    const tabsData = [
        { id: 'harian', label: 'Harian' },
        { id: 'per_pekerja', label: 'Per Pekerja' },
    ];
    const initialActiveTab = appState.activeSubPage.get('jurnal') || 'harian';
    const tabsHTML = createTabsHTML({ id: 'jurnal-tabs', tabs: tabsData, activeTab: initialActiveTab, customClasses: 'tabs-underline two-tabs' });

    const heroHTML = `
        <div id="jurnal-hero-carousel" class="dashboard-hero-carousel hero-journal" style="position:relative;">
        </div>`;

    container.innerHTML = `
        <div class="content-panel">
            <div class="panel-header">
                ${pageToolbarHTML}
                ${heroHTML}
                ${tabsHTML}
            </div>
            <div id="sub-page-content" class="panel-body scrollable-content"></div>
        </div>
    `;

    const tabsContainer = container.querySelector('#jurnal-tabs');
    if (tabsContainer) {
        tabsContainer.addEventListener('click', (e) => {
            const tabButton = e.target.closest('.sub-nav-item');
            if (tabButton && !tabButton.classList.contains('active')) {
                const currentActive = tabsContainer.querySelector('.sub-nav-item.active');
                if(currentActive) currentActive.classList.remove('active');
                tabButton.classList.add('active');
                appState.activeSubPage.set('jurnal', tabButton.dataset.tab);
                renderJurnalContent();
            }
        }, { signal: listenerSignal });
    }

    journalObserverInstance = initInfiniteScroll('#sub-page-content');
    
    if (unsubscribeLiveQuery) unsubscribeLiveQuery.unsubscribe();
    
    unsubscribeLiveQuery = liveQueryMulti(
        ['attendanceRecords', 'workers', 'bills'],
        (changedKeys) => {
            if (appState.activePage === 'jurnal') {
                renderJurnalContent(false);
            }
        }
    );

    emit('ui.jurnal.renderContent');
    initJurnalHeroCarousel();

    on('ui.jurnal.openDailyProjectPicker', ({ date }) => openDailyProjectPickerForEdit(date), { signal: listenerSignal });
    on('ui.jurnal.openDailyEditorPanel', ({ dateStr, projectId }) => openDailyAttendanceEditorPanel(dateStr, projectId), { signal: listenerSignal });
    on('ui.jurnal.renderContent', renderJurnalContent, { signal: listenerSignal });
    on('jurnal.generateDailyBill', handleGenerateDailyBill, { signal: listenerSignal });
    on('request-more-data', loadMoreJurnal, { signal: listenerSignal });
    
    const cleanupJurnal = () => {
        if (pageAbortController) pageAbortController.abort();
        if (pageEventListenerController) pageEventListenerController.abort();
        pageAbortController = null;
        pageEventListenerController = null;
        
        if (unsubscribeLiveQuery) unsubscribeLiveQuery.unsubscribe();
        unsubscribeLiveQuery = null;

        if (journalObserverInstance) {
            journalObserverInstance.disconnect();
            journalObserverInstance = null;
        }
        cleanupInfiniteScroll();
        
        off('app.unload.jurnal', cleanupJurnal);
    };
    
    off('app.unload.jurnal', cleanupJurnal);
    on('app.unload.jurnal', cleanupJurnal);
}

export { initJurnalPage };