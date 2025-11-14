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
import { toast } from '../components/toast.js';
// --- PERUBAHAN: Menambahkan parseLocalDate ---
import { getJSDate, parseLocalDate } from '../../utils/helpers.js';
import { localDB } from '../../services/localDbService.js';
import { openDailyProjectPickerForEdit } from '../../services/data/jurnalService.js';
import { openDailyAttendanceEditorPanel } from '../../services/data/attendanceService.js';
import { liveQueryMulti } from '../../state/liveQuery.js';
import { getPendingQuotaMaps } from '../../services/pendingQuotaService.js';

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

function updateJurnalSortControl() {
    if (typeof document === 'undefined') return;
    const sortBar = document.getElementById('jurnal-sort-bar');
    const select = document.getElementById('jurnal-sort-select');
    if (!sortBar || !select) return;
    const activeTab = appState.activeSubPage.get('jurnal') || 'harian';
    const options = JURNAL_SORT_OPTIONS[activeTab];
    if (!options) {
        sortBar.style.display = 'none';
        return;
    }
    sortBar.style.display = '';
    select.innerHTML = options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');
    select.value = getJurnalSortValue(activeTab);
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

function groupItemsByProfession(items) {
    const grouped = {};
    const professionMap = new Map((appState.professions || []).map(p => [p.id, p.professionName]));

    items.forEach(item => {
        const professionId = item.professionId || 'unknown';
        const groupLabel = professionMap.get(professionId) || 'Tanpa Profesi';
        
        if (!grouped[groupLabel]) {
            grouped[groupLabel] = { label: groupLabel, items: [] };
        }
        grouped[groupLabel].items.push(item);
    });
    return grouped;
}

function _renderGroupedListItems(groupedData, type, options = {}) {
    let html = '';
    
    let sortedGroupKeys;
    if (type === 'per_pekerja') {
        sortedGroupKeys = Object.keys(groupedData).sort((a, b) => a.localeCompare(b));
    } else {
        sortedGroupKeys = Object.keys(groupedData).sort().reverse();
    }

    sortedGroupKeys.forEach(key => {
        const group = groupedData[key];
        html += `<div class="month-group-header date-group-header">${group.label}</div>`; // Nama kelas 'month-group-header' kita biarkan
        
        let sortedItemsInGroup;
        if (type === 'per_pekerja') {
            sortedItemsInGroup = group.items.sort((a, b) => (a.workerName || '').localeCompare(b.workerName || ''));
        } else {
            sortedItemsInGroup = group.items.sort((a, b) => getJSDate(b.date || b.createdAt) - getJSDate(a.date || a.createdAt));
        }

        let groupHTML = '';
        if (type === 'harian') {
            groupHTML = _getJurnalHarianListHTML(sortedItemsInGroup);
        } else if (type === 'riwayat_rekap') { // Nama tab baru
            groupHTML = _getRekapGajiListHTML(sortedItemsInGroup, options.rekapPendingOptions || {});
        } else if (type === 'per_pekerja') {
            groupHTML = _getJurnalPerPekerjaListHTML(sortedItemsInGroup);
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

    let groupedData;
    if (activeTab === 'per_pekerja') {
        groupedData = groupItemsByProfession(itemsToDisplay);
    } else {
        const dateField = (activeTab === 'harian') ? 'date' : 'createdAt';
        groupedData = groupItemsByMonth(itemsToDisplay, dateField);
    }
    const listHTML = _renderGroupedListItems(groupedData, activeTab, { rekapPendingOptions });
    
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
        const titleSuffix = (activeTab === 'harian') ? '(Semua Waktu)' : '(Filter)';
        const slides = [
            {
                title: `Total Hari Kerja ${titleSuffix}`,
                tone: 'success',
                lines: [
                    `${totalDays.toLocaleString('id-ID')} Hari Kerja`,
                    `${workers.size} Pekerja Aktif`,
                ]
            },
            {
                title: `Ringkasan Upah ${titleSuffix}`,
                tone: 'warning',
                lines: [
                    `Dibayar: ${fmtIDR(totalWagesPaid)}`,
                    `Belum Lunas: ${fmtIDR(totalWagesUnpaid)}`,
                ]
            },
            {
                title: `Upah Belum Direkap ${titleSuffix}`,
                tone: 'danger',
                lines: [
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
                        <h1>${s.title}</h1>
                        <p>${s.lines.join(' · ')}</p>
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
        title: 'Jurnal'
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
        <div id="jurnal-hero-carousel" class="dashboard-hero-carousel hero-journal" style="position:relative;">
        </div>`;

    // --- PERUBAHAN: Filter Tanggal (Labels Dihapus) ---
    const { startDate: initialStartDate, endDate: initialEndDate } = getAppliedJurnalFilterStrings();

    const dateFilterHTML = `
        <div class="jurnal-date-filter-bar rekap-filters" id="jurnal-date-filters">
            <div class="form-group">
                <input type="date" id="jurnal-start-date" value="${initialStartDate}">
            </div>
            <div class="form-group">
                <input type="date" id="jurnal-end-date" value="${initialEndDate}">
            </div>
            <div class="jurnal-filter-actions">
                <button type="button" class="btn btn-secondary" id="jurnal-filter-reset">Reset</button>
                <button type="button" class="btn btn-primary" id="jurnal-filter-apply">Terapkan</button>
            </div>
        </div>
    `;

    const sortBarHTML = `
        <div class="jurnal-sort-bar" id="jurnal-sort-bar">
            <label for="jurnal-sort-select">Urutkan</label>
            <select id="jurnal-sort-select"></select>
        </div>
    `;
    // --- AKHIR PERUBAHAN ---

    container.innerHTML = `
        <div class="content-panel">
            <div class="panel-header">
                ${pageToolbarHTML}
                ${heroHTML}
                <div id="jurnal-filter-container">
                    ${dateFilterHTML}
                </div>
                ${sortBarHTML}
                ${tabsHTML}
            </div>
            <div id="sub-page-content" class="panel-body scrollable-content"></div>
        </div>
    `;

    // --- PERUBAHAN: Kontrol visibilitas filter ---
    const filterContainer = container.querySelector('#jurnal-filter-container');

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
                
                // --- Logika Show/Hide ---
                if (newView === 'harian') {
                    filterContainer.style.display = 'none';
                } else {
                    filterContainer.style.display = 'block';
                }
                // --- Akhir Logika ---
                
                renderJurnalContent(false); // Muat ulang konten (yang kini punya logika filter)
                initJurnalHeroCarousel(); // Muat ulang hero (yang kini punya logika filter)
                updateJurnalSortControl();
            }
        }, { signal: listenerSignal });
    }
    
    // --- Set Visibilitas Awal ---
    if (initialActiveTab === 'harian') {
        filterContainer.style.display = 'none';
    }
    // --- AKHIR PERUBAHAN ---


    setupJurnalFilterControls(listenerSignal);
    setupJurnalSortControl(listenerSignal);
    updateJurnalSortControl();

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

function setupJurnalFilterControls(listenerSignal) {
    const startInput = document.getElementById('jurnal-start-date');
    const endInput = document.getElementById('jurnal-end-date');
    const applyBtn = document.getElementById('jurnal-filter-apply');
    const resetBtn = document.getElementById('jurnal-filter-reset');
    if (!startInput || !endInput) return;

    applyBtn?.addEventListener('click', () => {
        const startVal = startInput.value;
        const endVal = endInput.value;
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
    }, { signal: listenerSignal });

    resetBtn?.addEventListener('click', () => {
        const defaults = getDefaultJurnalFilterStrings();
        startInput.value = defaults.startDate;
        endInput.value = defaults.endDate;
        persistJurnalFilters(defaults.startDate, defaults.endDate);
        renderJurnalContent(false);
        initJurnalHeroCarousel();
    }, { signal: listenerSignal });
}

function setupJurnalSortControl(listenerSignal) {
    const select = document.getElementById('jurnal-sort-select');
    if (!select) return;
    select.addEventListener('change', (e) => {
        const activeTab = appState.activeSubPage.get('jurnal') || 'harian';
        setJurnalSortValue(activeTab, e.target.value);
        renderJurnalContent(false);
    }, { signal: listenerSignal });
}
