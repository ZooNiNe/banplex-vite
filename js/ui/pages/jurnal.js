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
import { createModalSelectField, initModalSelects } from '../components/forms/index.js';
import { toast } from '../components/toast.js';
// --- PERUBAHAN: Menambahkan parseLocalDate ---
import { getJSDate, parseLocalDate } from '../../utils/helpers.js';
import { localDB } from '../../services/localDbService.js';
import { openDailyProjectPickerForEdit } from '../../services/data/jurnalService.js';
import { openDailyAttendanceEditorPanel } from '../../services/data/attendanceService.js';
import { liveQueryMulti } from '../../state/liveQuery.js';
import { getPendingQuotaMaps } from '../../services/pendingQuotaService.js';
import { createModal, closeModal, resetFormDirty } from '../components/modal.js';

const ITEMS_PER_PAGE = 20;

let pageAbortController = null;
let pageEventListenerController = null;
let journalObserverInstance = null;
let unsubscribeLiveQuery = null;
let renderDebounceTimer = null;
// --- TAMBAHAN: Timer untuk Hero Carousel ---
let heroCarouselTimer = null;

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
        settings: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings ${classes}"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2l-.15.1a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l-.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1 0-2l.15-.1a2 2 0 0 0 .73 2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
    };
    return icons[iconName] || '';
}

const JURNAL_SORT_OPTIONS = {
    harian: [
        { value: 'date_desc', label: 'Tanggal Terbaru' },
        { value: 'workers_desc', label: 'Paling Banyak Pekerja' },
        { value: 'wage_desc', label: 'Total Upah Tertinggi' }
    ],
    riwayat_rekap: [
        { value: 'date_desc', label: 'Tanggal Terbaru' },
        { value: 'amount_desc', label: 'Nominal Tertinggi' },
        { value: 'workers_desc', label: 'Paling Banyak Pekerja' }
    ]
};

function getDefaultJurnalFilterStrings() {
    const today = new Date();
    return {
        startDate: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10),
        endDate: today.toISOString().slice(0, 10)
    };
}

function getAppliedJurnalFilterStrings() {
    const stored = appState.jurnalFilters || {};
    const defaults = getDefaultJurnalFilterStrings();
    return {
        startDate: stored.startDate || defaults.startDate,
        endDate: stored.endDate || defaults.endDate
    };
}

function persistJurnalFilters(startDate, endDate) {
    appState.jurnalFilters = { startDate, endDate };
    try { localStorage.setItem('jurnal.filters', JSON.stringify(appState.jurnalFilters)); } catch (_) {}
}

function getAppliedJurnalDateRange() {
    const { startDate, endDate } = getAppliedJurnalFilterStrings();
    const startDateObj = parseLocalDate(startDate);
    startDateObj.setHours(0, 0, 0, 0);
    const endDateObj = parseLocalDate(endDate);
    endDateObj.setHours(23, 59, 59, 999);
    return { startDate, endDate, startDateObj, endDateObj };
}

function getJurnalSortValue(tab) {
    const options = JURNAL_SORT_OPTIONS[tab];
    const defaultValue = options ? options[0].value : '';
    appState.jurnalSort = appState.jurnalSort || {};
    return appState.jurnalSort[tab] || defaultValue;
}

function setJurnalSortValue(tab, value) {
    appState.jurnalSort = appState.jurnalSort || {};
    appState.jurnalSort[tab] = value;
    try { localStorage.setItem('jurnal.sort', JSON.stringify(appState.jurnalSort)); } catch (_) {}
}

function updateJurnalSortControl(listenerSignal) {
    if (typeof document === 'undefined') return;
    const sortBar = document.getElementById('jurnal-sort-bar');
    const control = document.getElementById('jurnal-sort-control');
    if (!sortBar || !control) return;
    const activeTab = appState.activeSubPage.get('jurnal') || 'harian';
    const options = JURNAL_SORT_OPTIONS[activeTab];
    if (!options) {
        sortBar.style.display = 'none';
        control.innerHTML = '';
        return;
    }
    sortBar.style.display = '';
    const selectHTML = createModalSelectField({
        id: 'jurnal-sort-select',
        label: '',
        options: options.map(opt => ({ value: opt.value, label: opt.label })),
        value: getJurnalSortValue(activeTab)
    });
    control.innerHTML = `
        <div class="jurnal-sort-inline">
            <span class="sort-inline-label">Urutkan</span>
            ${selectHTML}
        </div>
    `;
    initModalSelects(control);
    const hiddenInput = control.querySelector('#jurnal-sort-select');
    if (hiddenInput) {
        hiddenInput.onchange = (e) => {
            const tab = appState.activeSubPage.get('jurnal') || 'harian';
            setJurnalSortValue(tab, e.target.value);
            renderJurnalContent(false);
        };
        listenerSignal?.addEventListener('abort', () => {
            if (hiddenInput) hiddenInput.onchange = null;
        }, { once: true });
    }
}

function sortJurnalItems(activeTab, items) {
    const sortValue = getJurnalSortValue(activeTab);
    const sorted = [...items];
    if (activeTab === 'harian') {
        if (sortValue === 'workers_desc') {
            return sorted.sort((a, b) => {
                const diff = (b.workerCount || 0) - (a.workerCount || 0);
                if (diff !== 0) return diff;
                return getJSDate(b.date) - getJSDate(a.date);
            });
        }
        if (sortValue === 'wage_desc') {
            return sorted.sort((a, b) => {
                const diff = (b.totalPay || 0) - (a.totalPay || 0);
                if (diff !== 0) return diff;
                return getJSDate(b.date) - getJSDate(a.date);
            });
        }
        return sorted.sort((a, b) => getJSDate(b.date) - getJSDate(a.date));
    }
    if (activeTab === 'riwayat_rekap') {
        const getWorkerCount = (item) => Array.isArray(item.workerDetails) ? item.workerDetails.length : (item.workerCount || 0);
        if (sortValue === 'amount_desc') {
            return sorted.sort((a, b) => {
                const diff = (b.amount || 0) - (a.amount || 0);
                if (diff !== 0) return diff;
                return getJSDate(b.createdAt || b.date) - getJSDate(a.createdAt || a.date);
            });
        }
        if (sortValue === 'workers_desc') {
            return sorted.sort((a, b) => {
                const diff = getWorkerCount(b) - getWorkerCount(a);
                if (diff !== 0) return diff;
                return getJSDate(b.createdAt || b.date) - getJSDate(a.createdAt || a.date);
            });
        }
        return sorted.sort((a, b) => getJSDate(b.createdAt || b.date) - getJSDate(a.createdAt || a.date));
    }
    return items;
}


function groupItemsByMonth(items, dateField = 'date') {
    const groups = new Map();
    items.forEach(item => {
        const date = getJSDate(item[dateField]);
        if (isNaN(date.getTime())) return;
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const label = date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
        if (!groups.has(key)) {
            groups.set(key, { key, label, sortDate: new Date(date.getFullYear(), date.getMonth(), 1), items: [] });
        }
        groups.get(key).items.push(item);
    });
    return Array.from(groups.values()).sort((a, b) => b.sortDate - a.sortDate);
}

function groupItemsByProfession(items) {
    const professionMap = new Map((appState.professions || []).map(p => [p.id, p.professionName]));
    const groups = new Map();
    items.forEach(item => {
        const professionId = item.professionId || 'unknown';
        const groupLabel = professionMap.get(professionId) || 'Tanpa Profesi';
        const groupKey = `profession-${professionId}`;
        if (!groups.has(groupKey)) {
            groups.set(groupKey, { key: groupKey, label: groupLabel, items: [] });
        }
        groups.get(groupKey).items.push(item);
    });
    return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function renderJurnalGroupBody(items, type, options = {}) {
    const sortedItems = [...items];
    if (type === 'per_pekerja') {
        sortedItems.sort((a, b) => (a.workerName || '').localeCompare(b.workerName || ''));
    } else {
        sortedItems.sort((a, b) => getJSDate(b.date || b.createdAt) - getJSDate(a.date || a.createdAt));
    }
    if (type === 'harian') {
        return _getJurnalHarianListHTML(sortedItems);
    }
    if (type === 'riwayat_rekap') {
        return _getRekapGajiListHTML(sortedItems, options.rekapPendingOptions || {});
    }
    return _getJurnalPerPekerjaListHTML(sortedItems);
}

function _renderGroupedListItems(groupedData, type, options = {}) {
    return groupedData.map(group => {
        const bodyHTML = renderJurnalGroupBody(group.items, type, options);
        const headerClass = type === 'per_pekerja' ? 'date-group-header' : 'month-group-header date-group-header';
        return `
            <section class="date-group" data-group-key="${group.key}">
                <div class="${headerClass}">${group.label}</div>
                <div class="date-group-body">${bodyHTML}</div>
            </section>
        `;
    }).join('');
}

function appendJurnalGroups(wrapper, groups, type, options = {}) {
    const insertedElements = [];
    const headerClass = type === 'per_pekerja' ? 'date-group-header' : 'month-group-header date-group-header';
    groups.forEach(group => {
        const bodyHTML = renderJurnalGroupBody(group.items, type, options);
        const section = wrapper.querySelector(`.date-group[data-group-key="${group.key}"]`);
        if (section) {
            const body = section.querySelector('.date-group-body');
            if (!body) return;
            const temp = document.createElement('div');
            temp.innerHTML = bodyHTML;
            Array.from(temp.children).forEach(node => {
                body.appendChild(node);
                if (node.classList?.contains('wa-card-v2-wrapper')) insertedElements.push(node);
            });
        } else {
            const sectionEl = document.createElement('section');
            sectionEl.className = 'date-group';
            sectionEl.dataset.groupKey = group.key;
            sectionEl.innerHTML = `<div class="${headerClass}">${group.label}</div><div class="date-group-body">${bodyHTML}</div>`;
            wrapper.appendChild(sectionEl);
            sectionEl.querySelectorAll('.wa-card-v2-wrapper')?.forEach(node => insertedElements.push(node));
        }
    });
    return insertedElements;
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
    let startDate;
    let endDate;
    if (activeTab === 'per_pekerja' || activeTab === 'riwayat_rekap') {
        const { startDateObj, endDateObj } = getAppliedJurnalDateRange();
        startDate = startDateObj;
        endDate = endDateObj;
    } else {
        startDate = new Date('2000-01-01');
        endDate = new Date('2100-01-01');
    }

    let sourceItems = [];
    let rekapPendingOptions = null;

    if (activeTab === 'harian') {
        const allowedStatuses = new Set(['full_day', 'half_day', 'absent']);
        const groupedByDate = (appState.attendanceRecords || []).reduce((acc, record) => {
            if (record.isDeleted) return acc;
            const recDate = getJSDate(record.date);
            if (recDate < startDate || recDate > endDate) return acc;

            const y = recDate.getFullYear();
            const m = String(recDate.getMonth() + 1).padStart(2, '0');
            const d = String(recDate.getDate()).padStart(2, '0');
            const date = `${y}-${m}-${d}`;

            if (!acc[date]) {
                acc[date] = { date, totalPay: 0, workerIds: new Set() };
            }
            acc[date].totalPay += record.totalPay || 0;
            if (allowedStatuses.has(record.attendanceStatus)) {
                acc[date].workerIds.add(record.workerId);
            }
            return acc;
        }, {});
        sourceItems = Object.values(groupedByDate).map(item => ({
            date: item.date,
            totalPay: item.totalPay,
            workerCount: item.workerIds.size
        }));

    } else if (activeTab === 'per_pekerja') {
        // Filter absensi berdasarkan rentang tanggal
        const attendance = (appState.attendanceRecords || []).filter(r => {
            if (r.isDeleted) return false;
            const recDate = getJSDate(r.date);
            // Terapkan filter tanggal
            return recDate >= startDate && recDate <= endDate;
        });

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
            
    } else if (activeTab === 'riwayat_rekap') {
        // Filter riwayat tagihan berdasarkan rentang tanggal
        sourceItems = (appState.bills || [])
            .filter(b => {
                if (b.type !== 'gaji' || b.isDeleted) return false;
                const billDate = getJSDate(b.createdAt); 
                return billDate >= startDate && billDate <= endDate;
            })
            .map(item => ({
                ...item,
                date: item.createdAt,
                workerCount: Array.isArray(item.workerDetails) ? item.workerDetails.length : 0
            }));
        const pendingMaps = await getPendingQuotaMaps(['bills']);
        rekapPendingOptions = {
            pendingBills: pendingMaps.get('bills') || new Map()
        };
    }

    sourceItems = sortJurnalItems(activeTab, sourceItems);

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
        let emptyConfig = {};
        if (activeTab === 'harian') {
            emptyConfig = { icon: 'event_note', title: 'Jurnal Kosong', desc: 'Belum ada absensi harian yang tercatat.' };
        } else if (activeTab === 'per_pekerja') {
            emptyConfig = { icon: 'request_quote', title: 'Belum Ada Data Pekerja', desc: 'Tidak ada absensi pekerja untuk rentang tanggal ini.' };
        } else {
            emptyConfig = { icon: 'history', title: 'Riwayat Kosong', desc: 'Tidak ada tagihan gaji untuk rentang tanggal ini.' };
        }
        container.innerHTML = getEmptyStateHTML(emptyConfig);
        return;
    }

    if (append && itemsToDisplay.length === 0) {
        container.querySelector('#list-skeleton')?.remove();
        return;
    }

    const groupedData = (activeTab === 'per_pekerja')
        ? groupItemsByProfession(itemsToDisplay)
        : groupItemsByMonth(itemsToDisplay, activeTab === 'harian' ? 'date' : 'createdAt');
    let listWrapper = container.querySelector('#journal-grouped-wrapper');
    let newlyAddedElements = [];

    if (!append || !listWrapper) {
        const listHTML = _renderGroupedListItems(groupedData, activeTab, { rekapPendingOptions });
        container.innerHTML = `<div class="wa-card-list-wrapper grouped" id="journal-grouped-wrapper">${listHTML}</div>`;
        listWrapper = container.querySelector('#journal-grouped-wrapper');
        if (!append) {
            container.scrollTop = 0;
        }
        if (listWrapper) {
            newlyAddedElements = Array.from(listWrapper.querySelectorAll('.wa-card-v2-wrapper'));
        }
    } else {
        newlyAddedElements = appendJurnalGroups(listWrapper, groupedData, activeTab, { rekapPendingOptions });
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

    // --- PERUBAHAN: Fungsi helper untuk (re)start timer ---
    const startTimer = () => {
        if (heroCarouselTimer) clearInterval(heroCarouselTimer);
        heroCarouselTimer = setInterval(() => {
            const currentIndex = parseInt(container.dataset.carouselIndex || '0');
            setIndex(currentIndex + 1);
        }, 7000);
    };

    // --- PERUBAHAN: Fungsi helper untuk set index ---
    const setIndex = (idx) => {
        const total = parseInt(container.dataset.carouselTotal || '1');
        if (total === 0) return; // Hindari modulo by zero
        const index = (idx + total) % total;
        container.dataset.carouselIndex = index;
        
        container.querySelectorAll('.hero-slide').forEach((el, i) => {
            el.classList.toggle('active', i === index);
        });
        container.querySelectorAll('.hero-indicators .dot').forEach((d, i) => {
            d.classList.toggle('active', i === index);
        });
    };

    // --- PERUBAHAN: Pisahkan buildSlides agar bisa dipanggil ulang ---
    const buildSlides = async () => {
        const activeTab = appState.activeSubPage.get('jurnal') || 'harian';
        let startDate;
        let endDate;
        if (activeTab === 'per_pekerja' || activeTab === 'riwayat_rekap') {
            const { startDateObj, endDateObj } = getAppliedJurnalDateRange();
            startDate = startDateObj;
            endDate = endDateObj;
        } else {
            startDate = new Date('2000-01-01');
            endDate = new Date('2100-01-01');
        }
        const { startDate: filterStart, endDate: filterEnd } = getAppliedJurnalFilterStrings();
        const rangeLabelStart = formatDateLabel(filterStart);
        const rangeLabelEnd = formatDateLabel(filterEnd);
        const filterNote = activeTab === 'harian'
            ? 'Filter ini berlaku pada tab Pekerja & Riwayat.'
            : 'Gunakan ikon pengaturan di toolbar untuk mengubah.';

        // --- PERUBAHAN: Filter data berdasarkan rentang tanggal ---
        const attendance = (appState.attendanceRecords || []).filter(r => {
            if (r.isDeleted) return false;
            const recDate = getJSDate(r.date);
            return recDate >= startDate && recDate <= endDate;
        });
        const salaryBills = (appState.bills || []).filter(b => {
            if (b.type !== 'gaji' || b.isDeleted) return false;
            const billDate = getJSDate(b.createdAt);
            return billDate >= startDate && billDate <= endDate;
        });
        // --- AKHIR PERUBAHAN ---

        const workers = new Set(attendance.map(r => r.workerId));

        let totalDays = 0;
        attendance.forEach(rec => {
            if (rec.attendanceStatus === 'full_day') totalDays += 1;
            else if (rec.attendanceStatus === 'half_day') totalDays += 0.5;
        });

        const totalWagesPaid = salaryBills.filter(b => b.status === 'paid').reduce((sum, b) => sum + (b.amount || 0), 0);
        const totalWagesUnpaid = salaryBills.filter(b => b.status === 'unpaid').reduce((sum, b) => sum + Math.max(0, (b.amount || 0) - (b.paidAmount || 0)), 0);
        const totalUnrecapped = attendance.reduce((sum, rec) => {
            const isPaid = rec.isPaid === true || rec.isPaid === 1;
            if (!isPaid) {
                return sum + (rec.totalPay || 0);
            }
            return sum;
        }, 0);

        // --- PERUBAHAN: Judul slide diubah untuk menandakan data difilter/all-time ---
        const titleSuffix = (activeTab === 'harian') ? 'Semua Waktu' : 'Filter Aktif';
        const slides = [
            {
                kicker: 'Filter Aktif',
                title: 'Rentang Data',
                subtitle: `${rangeLabelStart} — ${rangeLabelEnd}`,
                tone: 'warning',
                metrics: [
                    filterNote
                ]
            },
            {
                kicker: 'Produktivitas',
                title: 'Total Hari Kerja',
                subtitle: titleSuffix,
                tone: 'success',
                metrics: [
                    `${totalDays.toLocaleString('id-ID')} hari kerja`,
                    `${workers.size} pekerja aktif`,
                ]
            },
            {
                kicker: 'Upah',
                title: 'Ringkasan Pembayaran',
                subtitle: titleSuffix,
                tone: 'warning',
                metrics: [
                    `Dibayar · ${fmtIDR(totalWagesPaid)}`,
                    `Belum Lunas · ${fmtIDR(totalWagesUnpaid)}`,
                ]
            },
            {
                kicker: 'Tindakan',
                title: 'Upah Belum Direkap',
                subtitle: titleSuffix,
                tone: 'danger',
                metrics: [
                    `${fmtIDR(totalUnrecapped)} belum dibayar`,
                    `${attendance.filter(rec => !(rec.isPaid === true || rec.isPaid === 1)).length} catatan`
                ]
            }
        ];
        // --- AKHIR PERUBAHAN ---

        container.innerHTML = [
            ...slides.map((s, idx) => `
                <div class="dashboard-hero hero-slide${idx === 0 ? ' active' : ''}" data-index="${idx}" data-tone="${s.tone}">
                    <div class="hero-content">
                        ${s.kicker ? `<p class="hero-kicker">${s.kicker}</p>` : ''}
                        <h1>${s.title}</h1>
                        ${s.subtitle ? `<p class="hero-subtitle">${s.subtitle}</p>` : ''}
                        <div class="hero-metrics">
                            ${s.metrics.map(line => `<span>${line}</span>`).join('')}
                        </div>
                    </div>
                    <div class="hero-illustration" aria-hidden="true">
                        <svg viewBox="0 0 200 100" preserveAspectRatio="xMidYMid meet">
                            <defs>
                                <linearGradient id="jurnalHeroGrad-${idx}" x1="${Math.random()*100}%" y1="${Math.random()*100}%" x2="${Math.random()*100}%" y2="${Math.random()*100}%">
                                    <stop offset="0%" style="stop-color:var(--hero-${s.tone === 'danger' ? 'rose' : (s.tone === 'success' ? 'emerald' : 'indigo')});stop-opacity:0.25" />
                                    <stop offset="100%" style="stop-color:var(--hero-${s.tone === 'danger' ? 'sun' : (s.tone === 'success' ? 'indigo' : 'emerald')});stop-opacity:0.4" />
                                </linearGradient>
                                <linearGradient id="jurnalHeroGrad2-${idx}" x1="${Math.random()*100}%" y1="${Math.random()*100}%" x2="${Math.random()*100}%" y2="${Math.random()*100}%">
                                     <stop offset="0%" style="stop-color:var(--hero-${s.tone === 'danger' ? 'indigo' : (s.tone === 'success' ? 'sun' : 'rose')});stop-opacity:0.12" />
                                    <stop offset="100%" style="stop-color:var(--hero-${s.tone === 'danger' ? 'emerald' : (s.tone === 'success' ? 'rose' : 'sun')});stop-opacity:0.25" />
                                </linearGradient>
                            </defs>
                            <circle cx="${40 + Math.random()*20}" cy="${40 + Math.random()*20}" r="${35 + Math.random()*10}" fill="url(#jurnalHeroGrad-${idx})" class="hero-circle1" />
                            <circle cx="${140 + Math.random()*20}" cy="${50 + Math.random()*20}" r="${25 + Math.random()*10}" fill="url(#jurnalHeroGrad2-${idx})" class="hero-circle2" />
                            <path d="M ${10+Math.random()*20} ${70+Math.random()*10} Q ${40+Math.random()*20} ${40+Math.random()*20} ${90+Math.random()*20} ${50+Math.random()*20} T ${170+Math.random()*20} ${60+Math.random()*10}" stroke="var(--hero-${s.tone === 'danger' ? 'rose' : (s.tone === 'success' ? 'emerald' : 'indigo')})" stroke-width="3" fill="none" stroke-linecap="round" class="hero-line" opacity="0.25"/>
                        </svg>
                    </div>
                </div>
            `),
            `<div class="hero-indicators">${slides.map((_, i) => `<span class="dot${i===0?' active':''}" data-idx="${i}"></span>`).join('')}</div>`
        ].join('');

        // --- PERUBAHAN: Update state di container ---
        container.dataset.carouselTotal = slides.length;
        container.dataset.carouselIndex = 0;

        // --- PERUBAHAN: Pasang ulang listener untuk dot ---
        container.querySelectorAll('.hero-indicators .dot').forEach(dot => {
            dot.addEventListener('click', () => {
                const idx = parseInt(dot.getAttribute('data-idx')) || 0;
                setIndex(idx);
                startTimer(); // Mulai ulang timer
            });
        });
        
        startTimer(); // Mulai timer
    };

    // --- PERUBAHAN: Logika setup satu kali ---
    if (container.dataset.initialized !== '1') {
        container.dataset.initialized = '1';

        let startX = 0, currentX = 0, isDragging = false;
        container.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX; isDragging = true; currentX = startX;
            if (heroCarouselTimer) clearInterval(heroCarouselTimer); // Jeda timer
        }, { passive: true });
        
        container.addEventListener('touchmove', (e) => {
            if (!isDragging) return; currentX = e.touches[0].clientX;
        }, { passive: true });
        
        container.addEventListener('touchend', () => {
            if (!isDragging) return; 
            const dx = currentX - startX; 
            isDragging = false;
            if (Math.abs(dx) > 40) {
                const currentIndex = parseInt(container.dataset.carouselIndex || '0');
                setIndex(currentIndex + (dx < 0 ? 1 : -1));
            }
            startTimer(); // Lanjutkan timer
        });

        window.addEventListener('hashchange', () => { if (heroCarouselTimer) clearInterval(heroCarouselTimer); }, { once: true });
    }

    buildSlides(); // Selalu panggil buildSlides saat inisialisasi
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
    // --- PERUBAHAN: Hapus timer lama saat init ---
    if (heroCarouselTimer) clearInterval(heroCarouselTimer);
    heroCarouselTimer = null;

    appState.pagination.jurnal_harian = { isLoading: false, hasMore: true, page: 0 };
    appState.pagination.jurnal_per_pekerja = { isLoading: false, hasMore: true, page: 0 };
    appState.pagination.jurnal_riwayat_rekap = { isLoading: false, hasMore: true, page: 0 };

    const container = $('.page-container');
    
    const pageToolbarHTML = createPageToolbarHTML({ 
        title: 'Jurnal',
        actions: [
            { icon: 'settings', label: 'Rentang & Filter Jurnal', action: 'open-jurnal-filter-modal' },
            { icon: 'download', label: 'Unduh Laporan Pekerja', action: 'open-worker-report-modal' }
        ]
    });

    const tabsData = [
        { id: 'harian', label: 'Harian' },
        { id: 'per_pekerja', label: 'Pekerja' },
        { id: 'riwayat_rekap', label: 'Riwayat' },
    ];
    const initialActiveTab = appState.activeSubPage.get('jurnal') || 'harian';
    const tabsHTML = createTabsHTML({ 
        id: 'jurnal-tabs', 
        tabs: tabsData, 
        activeTab: initialActiveTab, 
        customClasses: 'tabs-underline three-tabs' 
    });

    const heroHTML = `
        <div id="jurnal-hero-carousel" class="dashboard-hero-carousel hero-journal" style="position:relative; margin-top:0.5rem;">
        </div>`;

    const sortBarHTML = `
        <div class="jurnal-sort-bar" id="jurnal-sort-bar">
            <div id="jurnal-sort-control"></div>
        </div>
    `;
    // --- AKHIR PERUBAHAN ---

    container.innerHTML = `
        <div class="content-panel">
            <div class="panel-header">
                ${pageToolbarHTML}
                ${heroHTML}
                ${sortBarHTML}
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
                const newView = tabButton.dataset.tab;
                appState.activeSubPage.set('jurnal', newView);
                
                renderJurnalContent(false); // Muat ulang konten (yang kini punya logika filter)
                initJurnalHeroCarousel(); // Muat ulang hero (yang kini punya logika filter)
                updateJurnalSortControl(listenerSignal);
            }
        }, { signal: listenerSignal });
    }


    updateJurnalSortControl(listenerSignal);

    journalObserverInstance = initInfiniteScroll('#sub-page-content');
    
    if (unsubscribeLiveQuery) unsubscribeLiveQuery.unsubscribe();
    
    // --- PERUBAHAN: Pastikan liveQuery juga me-render ulang hero ---
    unsubscribeLiveQuery = liveQueryMulti(
        ['attendanceRecords', 'workers', 'bills'],
        (changedKeys) => {
            if (appState.activePage === 'jurnal') {
                renderJurnalContent(false);
                initJurnalHeroCarousel(); // <-- Pastikan ini dipanggil
            }
        }
    );
    // --- AKHIR PERUBAHAN ---

    emit('ui.jurnal.renderContent');
    initJurnalHeroCarousel();

    on('ui.jurnal.openDailyProjectPicker', ({ date }) => openDailyProjectPickerForEdit(date), { signal: listenerSignal });
    on('ui.jurnal.openDailyEditorPanel', ({ dateStr, projectId }) => openDailyAttendanceEditorPanel(dateStr, projectId), { signal: listenerSignal });
    on('ui.jurnal.openFilterModal', openJurnalFilterModal, { signal: listenerSignal });
    on('ui.jurnal.renderContent', renderJurnalContent, { signal: listenerSignal });
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
        
        // --- TAMBAHAN: Hapus timer carousel ---
        if (heroCarouselTimer) clearInterval(heroCarouselTimer);
        heroCarouselTimer = null;
        
        off('app.unload.jurnal', cleanupJurnal);
    };
    
    off('app.unload.jurnal', cleanupJurnal);
    on('app.unload.jurnal', cleanupJurnal);
}

export { initJurnalPage };

function formatDateLabel(value) {
    if (!value) return '-';
    try {
        return parseLocalDate(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
        return value;
    }
}

function openJurnalFilterModal() {
    const { startDate, endDate } = getAppliedJurnalFilterStrings();
    const isMobile = window.matchMedia('(max-width: 599px)').matches;
    const abortController = new AbortController();
    const { signal } = abortController;
    const modalRoot = document.getElementById('modal-container');
    let removalObserver = null;
    const cleanup = () => {
        if (!abortController.signal.aborted) {
            abortController.abort();
        }
        if (removalObserver) {
            removalObserver.disconnect();
            removalObserver = null;
        }
    };
    const subtitleHTML = `
        <p class="modal-subtitle">
            Rentang ini membatasi kartu pada tab "Pekerja" dan "Riwayat Rekap".
            Tab Harian selalu menampilkan data berdasarkan tanggal yang sedang aktif.
        </p>
    `;
    const content = `
        ${subtitleHTML}
        <form id="jurnal-filter-form" class="stacked-form">
            <div class="form-group">
                <label for="modal-jurnal-start">Tanggal Mulai</label>
                <input type="date" id="modal-jurnal-start" name="startDate" value="${startDate}" required>
            </div>
            <div class="form-group">
                <label for="modal-jurnal-end">Tanggal Akhir</label>
                <input type="date" id="modal-jurnal-end" name="endDate" value="${endDate}" required>
            </div>
        </form>
    `;
    const footer = `
        <button type="button" class="btn btn-ghost" id="jurnal-filter-reset-modal">Reset</button>
        <button type="button" class="btn btn-primary" id="jurnal-filter-apply-modal">Terapkan</button>
    `;
    const modal = createModal(isMobile ? 'actionsPopup' : 'dataDetail', {
        title: 'Atur Rentang Jurnal',
        content,
        footer,
        layoutClass: isMobile ? 'is-bottom-sheet journal-filter-sheet' : ''
    });
    if (!modal) return;
    if (modalRoot) {
        removalObserver = new MutationObserver(() => {
            if (!modalRoot.contains(modal)) {
                cleanup();
            }
        });
        removalObserver.observe(modalRoot, { childList: true });
    }

    const form = modal.querySelector('#jurnal-filter-form');
    const startInput = form?.querySelector('#modal-jurnal-start');
    const endInput = form?.querySelector('#modal-jurnal-end');

    const handleApplyClick = () => {
        const startVal = startInput?.value;
        const endVal = endInput?.value;
        if (!startVal || !endVal) {
            toast('error', 'Rentang tanggal harus diisi.');
            return;
        }
        if (new Date(startVal) > new Date(endVal)) {
            toast('error', 'Tanggal mulai tidak boleh melebihi tanggal akhir.');
            return;
        }
        persistJurnalFilters(startVal, endVal);
        renderJurnalContent(false);
        initJurnalHeroCarousel();
        resetFormDirty();
        toast('success', 'Filter jurnal diperbarui.');
        closeModal(modal);
        cleanup();
    };

    modal.querySelector('#jurnal-filter-apply-modal')?.addEventListener('click', handleApplyClick, { signal });
    modal.querySelector('#jurnal-filter-reset-modal')?.addEventListener('click', () => {
        const defaults = getDefaultJurnalFilterStrings();
        if (startInput) startInput.value = defaults.startDate;
        if (endInput) endInput.value = defaults.endDate;
    }, { signal });
}
