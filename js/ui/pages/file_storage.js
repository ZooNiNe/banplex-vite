import { appState } from '../../state/appState.js';
import { $ } from '../../utils/dom.js';
import { createPageToolbarHTML } from '../components/toolbar.js';
import { deleteBeneficiary } from '../../services/data/adminService.js';
import { getEmptyStateHTML } from '../components/emptyState.js';
import { toast } from '../components/toast.js';
import { startGlobalLoading } from '../components/modal.js';
import { emit, on, off } from '../../state/eventBus.js';
import { createMasterDataSelect, initCustomSelects } from '../components/forms/index.js';
import { formatDate } from '../../utils/formatters.js';
import { handleNavigation } from '../mainUI.js';
import { FIELD_KEYS } from './fileStorageFieldMap.js';
import { normalizeDistanceToMeters } from '../../utils/helpers.js';
import * as XLSX from 'xlsx';
import { createPdfDoc } from '../../services/reportService.js';
import { initInfiniteScroll, cleanupInfiniteScroll } from '../components/infiniteScroll.js';
import { db, auth } from '../../config/firebase.js';
import { collection, query, where, orderBy, limit, startAfter, getDocs } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js';

const TABLE_COLUMNS = [
    { key: 'select', label: '', className: 'col-select' },
    { key: 'actions', label: 'AKSI', className: 'col-actions' },
    { key: 'rowNumber', label: 'NO', className: 'col-number' },
    { key: 'namaPenerima', label: 'NAMA PENERIMA', className: 'col-name' },
    { key: 'nik', label: 'NIK', className: 'col-nik' },
    { key: 'jenisKelamin', label: 'JENIS KELAMIN', className: 'col-gender' },
    { key: 'jenjang', label: 'JENJANG', className: 'col-jenjang' },
    { key: 'namaInstansi', label: 'NAMA INSTANSI', className: 'col-instansi' },
    { key: 'npsnNspp', label: 'NPSN/NSPP', className: 'col-npsn' },
    { key: 'jarak', label: 'JARAK (M)', className: 'col-jarak' },
    { key: 'tempatLahir', label: 'TEMPAT LAHIR', className: 'col-birth' },
    { key: 'tanggalLahir', label: 'TANGGAL LAHIR', className: 'col-birthdate' },
    { key: 'alamatLengkap', label: 'ALAMAT', className: 'col-address' },
    { key: 'dataStatus', label: 'STATUS', className: 'col-status' },
];
const DOWNLOADABLE_COLUMNS = TABLE_COLUMNS.filter(col => !['select', 'rowNumber', 'actions'].includes(col.key));
const FILE_STORAGE_COLUMN_WIDTH_HINTS = {
    namaPenerima: 50,
    nik: 42,
    jenisKelamin: 28,
    jenjang: 32,
    namaInstansi: 50,
    npsnNspp: 30,
    jarak: 28,
    tempatLahir: 30,
    tanggalLahir: 32,
    alamatLengkap: 90,
    dataStatus: 32,
};

const GENDER_FILTER_OPTIONS = [
    { value: 'all', text: 'Semua Jenis Kelamin' },
    { value: 'Laki-Laki', text: 'Laki-Laki' },
    { value: 'Perempuan', text: 'Perempuan' },
];

const JENJANG_FILTER_OPTIONS = [
    { value: 'all', text: 'Semua Jenjang' },
    { value: 'BALITA', text: 'BALITA' },
    { value: 'SD/MI', text: 'SD/MI' },
    { value: 'SMP/MTS', text: 'SMP/MTS' },
    { value: 'SMA/SMK/MA', text: 'SMA/SMK/MA' },
    { value: 'TK/PAUD', text: 'TK/PAUD' },
    { value: 'DTA/RA/SEKOLAH KEAGAMAAN', text: 'DTA/RA/SEKOLAH KEAGAMAAN' },
    { value: 'IBU HAMIL', text: 'IBU HAMIL' },
    { value: 'IBU MENYUSUI', text: 'IBU MENYUSUI' },
];

const STATUS_CLASS_MAP = {
    valid: 'status-badge positive',
    invalid: 'status-badge negative',
    residue: 'status-badge warn',
    'requires verification': 'status-badge info',
};
const PER_PAGE_OPTIONS = [20, 50, 100];
const FILE_STORAGE_PER_PAGE_KEY = 'fileStorage.perPage';
const SELECT_FILTER_KEYS = new Set(['gender', 'jenjang', 'agency']);

const FILE_STORAGE_FETCH_LIMIT = 15;
const BENEFICIARY_COLLECTION_NAME = 'penerimaManfaat';
const FILE_STORAGE_SCROLL_CONTAINER = '.file-storage-panel .panel-content';

let accumulatedItems = [];
let lastVisibleDoc = null;
let hasMoreItems = true;
let isFetchingFromServer = false;
let lastFetchError = null;
let fileStorageObserverInstance = null;
let fileStorageSentinel = null;
let isFileStoragePageActive = false;
let authStateUnsub = null;
let infiniteScrollHandler = null;

function createIcon(iconName, size = 16, classes = '') {
    const icons = {
        edit: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pencil ${classes}"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
        trash: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2 ${classes}"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
        checkSquare: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-square ${classes}"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h11"/></svg>`,
        refresh: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-rotate-cw ${classes}"><path d="M21 2v6h-6"/><path d="M21 13a9 9 0 1 1-3-7.7L21 8"/></svg>`,
        x: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x ${classes}"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    };
    return icons[iconName] || '';
}

let searchDebounceTimer = null;
let cleanupFns = [];
let unloadHandler = null;
let requestToken = 0;
let lastRenderedItems = [];
let isDeletingRecords = false;
let lastFilterCount = 0;
let agencyFilterCleanup = null;

function ensureFileStorageState() {
    if (!appState.fileStorage) {
        appState.fileStorage = {
            list: [],
            filters: {
                search: '',
                gender: 'all',
                jenjang: 'all',
                agency: 'all',
            },
            isLoading: false,
            view: {
                perPage: 20,
                currentPage: 1,
            },
            selection: {
                ids: new Set(),
            },
            editingRecord: null,
        };
        return;
    }
    if (!Array.isArray(appState.fileStorage.list)) {
        appState.fileStorage.list = [];
    }
    appState.fileStorage.filters = {
        search: '',
        gender: 'all',
        jenjang: 'all',
        agency: 'all',
        ...(appState.fileStorage.filters || {}),
    };
    if (typeof appState.fileStorage.isLoading !== 'boolean') {
        appState.fileStorage.isLoading = false;
    }
    const storedPerPage = getStoredPerPage();
    if (!appState.fileStorage.view) {
        appState.fileStorage.view = { perPage: storedPerPage || 20, currentPage: 1 };
    } else {
        const perPage = Number(appState.fileStorage.view.perPage) || storedPerPage || 20;
        const currentPage = Number(appState.fileStorage.view.currentPage) || 1;
        appState.fileStorage.view = {
            perPage: PER_PAGE_OPTIONS.includes(perPage) ? perPage : (storedPerPage || 20),
            currentPage: currentPage > 0 ? currentPage : 1,
        };
    }
    const selection = appState.fileStorage.selection || { ids: new Set() };
    if (!(selection.ids instanceof Set)) {
        selection.ids = new Set(Array.isArray(selection.ids) ? selection.ids : []);
    }
    appState.fileStorage.selection = selection;
    if (appState.fileStorage.editingRecord && typeof appState.fileStorage.editingRecord !== 'object') {
        appState.fileStorage.editingRecord = null;
    }
}

function initFileStoragePage() {
    ensureFileStorageState();
    resetFileStorageStreamState();
    isFileStoragePageActive = true;
    renderPageShell();
    attachEventListeners();
    setupFileStorageInfiniteScroll();

    const refreshHandler = () => refreshFileStorageData(true);
    on('data.fileStorage.refresh', refreshHandler);
    cleanupFns.push(() => off('data.fileStorage.refresh', refreshHandler));

    infiniteScrollHandler = () => loadMoreFileStorage();
    on('request-more-data', infiniteScrollHandler);
    cleanupFns.push(() => off('request-more-data', infiniteScrollHandler));

    const startLoad = () => {
        refreshFileStorageData(true);
    };

    if (auth.currentUser) {
        startLoad();
    } else {
        appState.fileStorage.isLoading = true;
        showLoadingState();
        authStateUnsub = onAuthStateChanged(auth, (user) => {
            if (user) {
                startLoad();
                if (authStateUnsub) {
                    authStateUnsub();
                    authStateUnsub = null;
                }
            }
        });
    }

    registerUnloadHandler();
}

function renderPageShell() {
    const container = $('.page-container');
    if (!container) return;

    const { filters, list = [] } = appState.fileStorage;
    const searchValue = filters.search || '';
    const genderValue = filters.gender || 'all';
    const jenjangValue = filters.jenjang || 'all';
    const agencyValue = filters.agency || 'all';

    container.innerHTML = `
        <div class="content-panel file-storage-panel">
            <div class="panel-header">
                ${createPageToolbarHTML({ title: 'Database File Storage' })}
            </div>
            <div class="panel-content scrollable-content has-padding">
                <div class="form-card accent-purple file-storage-summary">
                    <button type="button" class="summary-refresh-btn" id="file-storage-refresh-btn" title="Segarkan data" aria-label="Segarkan data">
                        ${createIcon('refresh', 18)}
                    </button>
                    <div class="summary-copy">
                        <p class="summary-label">Total Data Tersimpan</p>
                        <div class="summary-value" id="file-storage-total-count">${list.length}</div>
                        <p class="helper-text">Calon Penerima Manfaat Makan Bergizi Gratis (MBG) YAYASAN AL FALAH JAMPANGTENGAH Cijiwa - Nangerang - Jampang Tengah</p>
                    </div>
                    <div class="summary-actions">
                        <div class="template-downloads">
                            <button type="button" class="btn btn-ghost" data-action="fs-export-data" data-format="xlsx">Ekspor XLSX</button>
                            <button type="button" class="btn btn-ghost" data-action="fs-export-data" data-format="csv">Ekspor CSV</button>
                            <button type="button" class="btn btn-secondary" data-action="fs-export-pdf">Unduh PDF</button>
                        </div>
                        <button type="button" class="btn btn-primary" id="file-storage-create-btn">Input Data</button>
                    </div>
                </div>
                <div class="file-storage-filters card card-pad">
                    <div class="form-group">
                        <label for="file-storage-search">Pencarian</label>
                        <input
                            type="search"
                            id="file-storage-search"
                            placeholder="Cari nama penerima, NIK, atau instansi"
                            value="${escapeHtml(searchValue)}"
                            autocomplete="off"
                        >
                    </div>
                    ${createMasterDataSelect('file-storage-gender-filter', 'Jenis Kelamin', GENDER_FILTER_OPTIONS, genderValue, null, false, false)}
                    ${createMasterDataSelect('file-storage-jenjang-filter', 'Jenjang', JENJANG_FILTER_OPTIONS, jenjangValue, null, false, false)}
                    <div id="file-storage-agency-filter-wrapper"></div>
                    <div class="filter-stats">
                        <span class="filter-count-label">Menampilkan</span>
                        <span class="filter-count-value" id="file-storage-visible-count">0</span>
                        <span class="filter-count-label">baris</span>
                    </div>
                </div>
                <div id="file-storage-table" class="card table-card file-storage-table-wrapper">
                    ${getTableSkeletonHTML()}
                </div>
            </div>
        </div>
    `;

    renderAgencyFilterControl(agencyValue, { skipInit: true });
    try {
        initCustomSelects(container);
    } catch (_) {}
}

function getAgencyFilterOptions() {
    const sourceList = Array.isArray(accumulatedItems) ? accumulatedItems : [];
    const unique = new Set();
    sourceList.forEach(item => {
        const name = getSafeString(pickValue(item, 'namaInstansi'));
        if (name) {
            unique.add(name);
        }
    });
    const sorted = Array.from(unique).sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }));
    return [
        { value: 'all', text: 'Semua Instansi' },
        ...sorted.map(name => ({ value: name, text: name }))
    ];
}

function renderAgencyFilterControl(selectedValue = 'all', options = {}) {
    const wrapper = $('#file-storage-agency-filter-wrapper');
    if (!wrapper) return;
    if (agencyFilterCleanup) {
        agencyFilterCleanup();
        agencyFilterCleanup = null;
    }
    const agencyOptions = getAgencyFilterOptions();
    const availableValues = new Set(agencyOptions.map(opt => opt.value));
    const normalizedValue = availableValues.has(selectedValue) ? selectedValue : 'all';
    wrapper.innerHTML = createMasterDataSelect(
        'file-storage-agency-filter',
        'Instansi',
        agencyOptions,
        normalizedValue,
        null,
        false,
        false
    );
    const agencyInput = wrapper.querySelector('#file-storage-agency-filter');
    if (agencyInput) {
        const handler = (event) => handleFilterChange('agency', event.target.value);
        agencyInput.addEventListener('change', handler);
        agencyFilterCleanup = () => {
            agencyInput.removeEventListener('change', handler);
        };
    }
    if (!options.skipInit) {
        try {
            initCustomSelects(wrapper);
        } catch (_) {}
    }
}

function attachEventListeners() {
    cleanupFns.forEach(fn => fn?.());
    cleanupFns = [];
    const container = $('.page-container');

    const searchInput = $('#file-storage-search');
    if (searchInput) {
        const handler = handleSearchInput;
        searchInput.addEventListener('input', handler);
        cleanupFns.push(() => searchInput.removeEventListener('input', handler));
    }

    const genderSelect = $('#file-storage-gender-filter');
    if (genderSelect) {
        const handler = (event) => handleFilterChange('gender', event.target.value);
        genderSelect.addEventListener('change', handler);
        cleanupFns.push(() => genderSelect.removeEventListener('change', handler));
    }

    const jenjangSelect = $('#file-storage-jenjang-filter');
    if (jenjangSelect) {
        const handler = (event) => handleFilterChange('jenjang', event.target.value);
        jenjangSelect.addEventListener('change', handler);
        cleanupFns.push(() => jenjangSelect.removeEventListener('change', handler));
    }

    const refreshBtn = $('#file-storage-refresh-btn');
    if (refreshBtn) {
        const handler = () => refreshFileStorageData(true);
        refreshBtn.addEventListener('click', handler);
        cleanupFns.push(() => refreshBtn.removeEventListener('click', handler));
    }

    const createBtn = $('#file-storage-create-btn');
    if (createBtn) {
        const handler = () => {
            ensureFileStorageState();
            appState.fileStorage.editingRecord = null;
            handleNavigation('file_storage_form');
        };
        createBtn.addEventListener('click', handler);
        cleanupFns.push(() => createBtn.removeEventListener('click', handler));
    }

    const exportButtons = container?.querySelectorAll?.('[data-action="fs-export-data"]') || [];
    exportButtons.forEach(button => {
        const handler = () => exportFileStorageData(button.dataset.format || 'xlsx');
        button.addEventListener('click', handler);
        cleanupFns.push(() => button.removeEventListener('click', handler));
    });

    const pdfButton = container?.querySelector?.('[data-action="fs-export-pdf"]');
    if (pdfButton) {
        const handler = () => handleFileStoragePdfExport();
        pdfButton.addEventListener('click', handler);
        cleanupFns.push(() => pdfButton.removeEventListener('click', handler));
    }

    const tableContainer = $('#file-storage-table');
    if (tableContainer) {
        const changeHandler = (event) => handleTableChange(event);
        const clickHandler = (event) => handleTableClick(event);
        tableContainer.addEventListener('change', changeHandler);
        tableContainer.addEventListener('click', clickHandler);
        cleanupFns.push(() => {
            tableContainer.removeEventListener('change', changeHandler);
            tableContainer.removeEventListener('click', clickHandler);
        });
    }
}

function handleSearchInput(event) {
    const value = event.target.value || '';
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        setFilter('search', value);
        clearSelection();
        renderFileStorageTable();
    }, 250);
}

function handleFilterChange(key, value) {
    setFilter(key, value);
    clearSelection();
    refreshFileStorageData(true);
}

function setFilter(key, value) {
    ensureFileStorageState();
    const normalizedValue = (value || '').toString().trim();
    const shouldUseAll = SELECT_FILTER_KEYS.has(key);
    appState.fileStorage.filters[key] = normalizedValue === '' ? (shouldUseAll ? 'all' : '') : normalizedValue;
    if (appState.fileStorage.view) {
        appState.fileStorage.view.currentPage = 1;
    }
}

function getFilters() {
    ensureFileStorageState();
    return appState.fileStorage.filters;
}

function getViewState() {
    ensureFileStorageState();
    return appState.fileStorage.view;
}

function resetFileStorageStreamState() {
    accumulatedItems = [];
    lastVisibleDoc = null;
    hasMoreItems = true;
    appState.fileStorage.list = accumulatedItems;
    lastFetchError = null;
}

async function refreshFileStorageData(force = false) {
    if (isFetchingFromServer && !force) return;
    clearSelection();
    resetFileStorageStreamState();
    const viewState = getViewState();
    viewState.currentPage = 1;
    await fetchFileStorageFromServer(false);
    renderFileStorageTable();
}

function setupFileStorageInfiniteScroll() {
    fileStorageObserverInstance = initInfiniteScroll(FILE_STORAGE_SCROLL_CONTAINER);
}

async function fetchFileStorageFromServer(isLoadMore = false) {
    ensureFileStorageState();
    if (isFetchingFromServer) return false;
    if (isLoadMore && !hasMoreItems) return false;

    isFetchingFromServer = true;
    const currentToken = ++requestToken;
    lastFetchError = null;
    if (!isLoadMore) {
        appState.fileStorage.isLoading = true;
        showLoadingState();
    }

    const filters = getFilters();
    const collectionRef = collection(db, BENEFICIARY_COLLECTION_NAME);
    const queryConstraints = [];
    if (filters.gender && filters.gender !== 'all') {
        queryConstraints.push(where('jenisKelamin', '==', filters.gender));
    }
    if (filters.jenjang && filters.jenjang !== 'all') {
        queryConstraints.push(where('jenjang', '==', filters.jenjang));
    }
    if (filters.agency && filters.agency !== 'all') {
        queryConstraints.push(where('namaInstansi', '==', filters.agency));
    }
    queryConstraints.push(orderBy('createdAt', 'desc'));
    if (isLoadMore && lastVisibleDoc) {
        queryConstraints.push(startAfter(lastVisibleDoc));
    }
    queryConstraints.push(limit(FILE_STORAGE_FETCH_LIMIT));

    try {
        const queryTarget = queryConstraints.length > 0 ? query(collectionRef, ...queryConstraints) : collectionRef;
        const snapshot = await getDocs(queryTarget);
        if (currentToken !== requestToken) return false;
        const fetchedItems = [];
        snapshot.forEach(docSnap => {
            fetchedItems.push({ id: docSnap.id, ...docSnap.data() });
        });

        if (isLoadMore) {
            accumulatedItems = [...accumulatedItems, ...fetchedItems];
        } else {
            accumulatedItems = fetchedItems;
        }
        appState.fileStorage.list = accumulatedItems;

        if (snapshot.docs.length > 0) {
            lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
        } else if (!isLoadMore) {
            lastVisibleDoc = null;
        }

        hasMoreItems = snapshot.size === FILE_STORAGE_FETCH_LIMIT;
        renderAgencyFilterControl(getFilters().agency || 'all');
        return true;
    } catch (error) {
        if (currentToken !== requestToken) return false;
        lastFetchError = error;
        console.error('[FileStorage] Gagal memuat data:', error);
        toast('error', 'Gagal memuat data File Storage.');
        return false;
    } finally {
        isFetchingFromServer = false;
        appState.fileStorage.isLoading = false;
    }
}

async function loadMoreFileStorage() {
    if (!isFileStoragePageActive) return;
    if (isFetchingFromServer || !hasMoreItems) return;
    await fetchFileStorageFromServer(true);
    renderFileStorageTable(true);
}

function showLoadingState() {
    const tableWrapper = $('#file-storage-table');
    if (tableWrapper) {
        lastRenderedItems = [];
        tableWrapper.innerHTML = getTableSkeletonHTML();
    }
}

function renderFileStorageTable(isLoadMore = false) {
    const tableWrapper = $('#file-storage-table');
    if (!tableWrapper) return;

    if (appState.fileStorage.isLoading) {
        showLoadingState();
        return;
    }

    const filtered = getFilteredList();
    lastFilterCount = filtered.length;
    updateSummaryCounters(filtered.length);

    if (lastFetchError && filtered.length === 0) {
        lastRenderedItems = [];
        tableWrapper.innerHTML = `${renderBulkActionsBar(getSelectedCount())}${getEmptyStateHTML({
            icon: 'error',
            title: 'Gagal Memuat Data',
            desc: lastFetchError?.message || 'Periksa koneksi Anda, lalu coba segarkan kembali.',
        })}`;
        attachInfiniteScrollSentinel(tableWrapper, false);
        return;
    }
    if (lastFetchError) {
        lastFetchError = null;
    }

    if (filtered.length === 0) {
        lastRenderedItems = [];
        tableWrapper.innerHTML = `${renderBulkActionsBar(getSelectedCount())}${getEmptyStateHTML({
            icon: 'database',
            title: 'Belum Ada Data',
            desc: 'Gunakan tombol "Input Data" untuk menambahkan penerima baru sesuai format Excel.',
        })}`;
        attachInfiniteScrollSentinel(tableWrapper, false);
        return;
    }

    const viewState = getViewState();
    const perPage = viewState.perPage;
    let totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
    if (viewState.currentPage > totalPages) {
        viewState.currentPage = totalPages;
    }
    if (isLoadMore) {
        totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
        viewState.currentPage = totalPages;
    }
    const startIndex = (viewState.currentPage - 1) * perPage;
    const visibleItems = filtered.slice(startIndex, startIndex + perPage);
    lastRenderedItems = visibleItems.slice();
    const allVisibleSelected = visibleItems.length > 0 && visibleItems.every(item => isRowSelected(item.id));
    const hasPartialSelection = visibleItems.some(item => isRowSelected(item.id));
    const selectedCount = getSelectedCount();
    const paginationHTML = renderPaginationControls({
        perPage,
        currentPage: viewState.currentPage,
        totalPages,
        totalItems: filtered.length,
        startIndex,
        visibleCount: visibleItems.length,
    });

    const headerRow = TABLE_COLUMNS.map(col => `<th class="${col.className || ''}">${formatHeaderCell(col, allVisibleSelected)}</th>`).join('');
    const bodyRows = visibleItems.map((item, index) => `
        <tr>
            ${TABLE_COLUMNS.map(col => `<td class="${col.className || ''}">${formatCellValue(col, item, index)}</td>`).join('')}
        </tr>
    `).join('');

    tableWrapper.innerHTML = `
        ${renderBulkActionsBar(selectedCount)}
        <div class="table-scroll">
            <table class="recap-table file-storage-table">
                <thead><tr>${headerRow}</tr></thead>
                <tbody>${bodyRows}</tbody>
            </table>
        </div>
        ${paginationHTML}
    `;

    const selectAllCheckbox = tableWrapper.querySelector('.fs-select-all-checkbox');
    if (selectAllCheckbox) {
        selectAllCheckbox.indeterminate = hasPartialSelection && !allVisibleSelected;
    }

    const shouldAttachSentinel = hasMoreItems && viewState.currentPage >= totalPages;
    attachInfiniteScrollSentinel(tableWrapper, shouldAttachSentinel);
}

function attachInfiniteScrollSentinel(container, shouldAttach) {
    if (!container) return;
    const existing = container.querySelector('#infinite-scroll-sentinel');
    if (existing) {
        if (fileStorageObserverInstance && fileStorageSentinel) {
            fileStorageObserverInstance.unobserve(fileStorageSentinel);
        }
        existing.remove();
    }
    fileStorageSentinel = null;
    if (!shouldAttach || !fileStorageObserverInstance) return;
    container.insertAdjacentHTML('beforeend', `<div id="infinite-scroll-sentinel" style="height: 1px; width: 100%;"></div>`);
    fileStorageSentinel = container.querySelector('#infinite-scroll-sentinel');
    if (fileStorageSentinel) {
        fileStorageObserverInstance.observe(fileStorageSentinel);
    }
}

function getVisibleItemsSnapshot() {
    const filtered = getFilteredList();
    const viewState = getViewState();
    const startIndex = (viewState.currentPage - 1) * viewState.perPage;
    return filtered.slice(startIndex, startIndex + viewState.perPage);
}

function getFilteredList() {
    const sourceList = Array.isArray(accumulatedItems) ? accumulatedItems : [];
    const { search = '', gender = 'all', jenjang = 'all', agency = 'all' } = getFilters();
    const searchTerm = search.trim().toLowerCase();
    const genderFilter = gender.toLowerCase();
    const jenjangFilter = jenjang.toLowerCase();
    const agencyFilter = agency.toLowerCase();

    return sourceList.filter(item => {
        if (item?.isDeleted === true) return false;
        if (genderFilter !== 'all') {
            const genderValue = getSafeString(pickValue(item, 'jenisKelamin')).toLowerCase();
            if (genderValue !== genderFilter) return false;
        }
        if (jenjangFilter !== 'all') {
            const jenjangValue = getSafeString(pickValue(item, 'jenjang')).toLowerCase();
            if (jenjangValue !== jenjangFilter) return false;
        }
        if (agencyFilter !== 'all') {
            const agencyValue = getSafeString(pickValue(item, 'namaInstansi')).toLowerCase();
            if (agencyValue !== agencyFilter) return false;
        }
        if (!searchTerm) return true;
        const haystack = [
            pickValue(item, 'namaPenerima'),
            pickValue(item, 'nik'),
            pickValue(item, 'namaInstansi'),
            pickValue(item, 'dataStatus'),
            pickValue(item, 'tempatLahir'),
            pickValue(item, 'district'),
            pickValue(item, 'subDistrict'),
            pickValue(item, 'village'),
            pickValue(item, 'alamatLengkap'),
        ].map(getSafeString).join(' ').toLowerCase();
        return haystack.includes(searchTerm);
    });
}

function pickValue(item, key) {
    if (!item) return '';
    if (key === 'rowNumber') return '';
    const candidates = FIELD_KEYS[key] || [key];
    for (const candidate of candidates) {
        if (Object.prototype.hasOwnProperty.call(item, candidate)) {
            const value = item[candidate];
            if (value !== undefined && value !== null && String(value).trim() !== '') {
                return value;
            }
        }
    }
    return '';
}

function formatCellValue(column, item, index) {
    if (column.key === 'select') {
        const hasId = !!item?.id;
        return `
            <label class="fs-checkbox" aria-label="Pilih baris">
                <input type="checkbox" class="fs-row-checkbox" data-id="${hasId ? item.id : ''}" ${hasId && isRowSelected(item.id) ? 'checked' : ''} ${hasId ? '' : 'disabled'}>
                <span class="fs-checkbox-visual"></span>
            </label>
        `;
    }
    if (column.key === 'rowNumber') {
        return `<span class="badge badge-soft">${index + 1}</span>`;
    }
    if (column.key === 'actions') {
        const disabledAttr = item?.id ? '' : 'disabled';
        return `
            <div class="fs-row-actions">
                <button type="button" class="btn-icon btn-ghost" data-action="fs-edit-record" data-id="${item?.id || ''}" title="Edit data penerima" ${disabledAttr}>
                    ${createIcon('edit', 16)}
                </button>
                <button type="button" class="btn-icon btn-ghost btn-icon--danger" data-action="fs-delete-record" data-id="${item?.id || ''}" title="Hapus data penerima" ${disabledAttr}>
                    ${createIcon('trash', 16)}
                </button>
            </div>
        `;
    }
    const value = getSafeString(pickValue(item, column.key));
    if (!value) {
        return `<span class="muted-cell">-</span>`;
    }
    if (column.key === 'nik') {
        return `<span class="monospace-cell">${escapeHtml(value)}</span>`;
    }
    if (column.key === 'dataStatus') {
        const statusKey = value.toLowerCase();
        const badgeClass = STATUS_CLASS_MAP[statusKey] || 'status-badge info';
        return `<span class="${badgeClass}">${escapeHtml(value)}</span>`;
    }
    if (column.key === 'jarak') {
        return formatDistanceCell(value);
    }
    if (column.key === 'tanggalLahir') {
        return `<span>${formatBirthDate(value)}</span>`;
    }
    if (column.key === 'alamatLengkap') {
        return formatAddressCell(item);
    }
    return escapeHtml(value);
}

function formatHeaderCell(column, isAllSelected) {
    if (column.key === 'select') {
        return `
            <label class="fs-checkbox fs-checkbox--header" aria-label="Pilih semua baris">
                <input type="checkbox" class="fs-select-all-checkbox" ${isAllSelected ? 'checked' : ''}>
                <span class="fs-checkbox-visual"></span>
            </label>
        `;
    }
    return column.label || '';
}

function updateSummaryCounters(visibleCount) {
    const totalEl = $('#file-storage-total-count');
    if (totalEl) {
        totalEl.textContent = Array.isArray(accumulatedItems) ? accumulatedItems.length : 0;
    }
    const visibleEl = $('#file-storage-visible-count');
    if (visibleEl) {
        visibleEl.textContent = visibleCount;
    }
}

function getTableSkeletonHTML(rows = 6) {
    const rowPlaceholder = Array.from({ length: rows }).map(() => `
        <div class="data-table-skeleton__row">
            <span class="skeleton data-table-skeleton__chip"></span>
            <span class="skeleton skeleton-text" style="width: 90%;"></span>
            <span class="skeleton skeleton-text" style="width: 75%;"></span>
            <span class="skeleton skeleton-text" style="width: 60%;"></span>
            <span class="skeleton data-table-skeleton__chip" style="width: 70px;"></span>
        </div>
    `).join('');
    return `
        <div class="data-table-skeleton">
            <div class="data-table-skeleton__toolbar">
                <span class="skeleton skeleton-text" style="width: 180px; height: 14px;"></span>
                <span class="skeleton data-table-skeleton__chip" style="width: 80px;"></span>
            </div>
            ${rowPlaceholder}
        </div>
    `;
}

function registerUnloadHandler() {
    if (unloadHandler) return;
    unloadHandler = () => cleanupFileStoragePage();
    on('app.unload.file_storage', unloadHandler);
}

function cleanupFileStoragePage() {
    if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = null;
    }
    if (agencyFilterCleanup) {
        agencyFilterCleanup();
        agencyFilterCleanup = null;
    }
    cleanupFns.forEach(fn => fn?.());
    cleanupFns = [];
    if (unloadHandler) {
        off('app.unload.file_storage', unloadHandler);
        unloadHandler = null;
    }
    if (authStateUnsub) {
        authStateUnsub();
        authStateUnsub = null;
    }
    cleanupInfiniteScroll();
    fileStorageObserverInstance = null;
    fileStorageSentinel = null;
    infiniteScrollHandler = null;
    isFileStoragePageActive = false;
}

function getSafeString(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

function escapeHtml(value) {
    return getSafeString(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatBirthDate(value) {
    const safeValue = getSafeString(value);
    if (!safeValue) return '<span class="muted-cell">-</span>';
    try {
        return formatDate(safeValue, { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
        return escapeHtml(safeValue);
    }
}

function formatAddressCell(item) {
    const fullAddress = escapeHtml(getSafeString(pickValue(item, 'alamatLengkap')));
    const locationParts = [
        getSafeString(pickValue(item, 'village')),
        getSafeString(pickValue(item, 'hamlet')),
        getSafeString(pickValue(item, 'subDistrict')),
        getSafeString(pickValue(item, 'district')),
    ].filter(Boolean).map(escapeHtml);
    const rt = getSafeString(pickValue(item, 'rt'));
    const rw = getSafeString(pickValue(item, 'rw'));
    const rtRw = [rt ? `RT ${rt}` : '', rw ? `RW ${rw}` : ''].filter(Boolean).join(' / ');

    const lines = [];
    if (fullAddress) lines.push(fullAddress);
    if (rtRw) lines.push(escapeHtml(rtRw));
    if (locationParts.length) lines.push(locationParts.join(', '));

    if (lines.length === 0) return '<span class="muted-cell">-</span>';
    return lines.map(line => `<div>${line}</div>`).join('');
}

function formatDistanceCell(rawValue) {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
        return '<span class="muted-cell">-</span>';
    }
    const meters = normalizeDistanceToMeters(rawValue, { allowZero: true });
    if (meters === null) {
        return escapeHtml(String(rawValue));
    }
    return `<span>${formatMeters(meters)}</span>`;
}

function formatMeters(value) {
    try {
        const formatted = new Intl.NumberFormat('id-ID').format(value);
        return `${formatted} m`;
    } catch (_) {
        return `${value} m`;
    }
}

function getSelectionState() {
    ensureFileStorageState();
    return appState.fileStorage.selection;
}

function getSelectedCount() {
    const selection = getSelectionState();
    return selection.ids.size;
}

function isRowSelected(id) {
    if (!id) return false;
    const selection = getSelectionState();
    return selection.ids.has(id);
}

function clearSelection() {
    const selection = getSelectionState();
    if (selection.ids.size > 0) {
        selection.ids.clear();
    }
}

function getStoredPerPage() {
    try {
        const storedValue = Number(localStorage.getItem(FILE_STORAGE_PER_PAGE_KEY));
        return PER_PAGE_OPTIONS.includes(storedValue) ? storedValue : null;
    } catch (_) {
        return null;
    }
}

function persistPerPage(value) {
    try {
        localStorage.setItem(FILE_STORAGE_PER_PAGE_KEY, String(value));
    } catch (_) {}
}

function toggleRowSelection(id, shouldSelect) {
    if (!id) return;
    const selection = getSelectionState();
    if (shouldSelect) {
        selection.ids.add(id);
    } else {
        selection.ids.delete(id);
    }
}

function toggleSelectAll(visibleItems = [], shouldSelect) {
    const selection = getSelectionState();
    visibleItems.forEach(item => {
        if (!item?.id) return;
        if (shouldSelect) {
            selection.ids.add(item.id);
        } else {
            selection.ids.delete(item.id);
        }
    });
}

function handlePerPageChange(value) {
    if (!PER_PAGE_OPTIONS.includes(value)) return;
    const view = getViewState();
    if (view.perPage === value) return;
    view.perPage = value;
    view.currentPage = 1;
    persistPerPage(value);
    renderFileStorageTable();
}

function changePage(delta) {
    if (typeof delta !== 'number' || Number.isNaN(delta)) return;
    const view = getViewState();
    const totalPages = Math.max(1, Math.ceil(lastFilterCount / view.perPage));
    const nextPage = Math.min(Math.max(view.currentPage + delta, 1), totalPages);
    if (nextPage === view.currentPage) return;
    view.currentPage = nextPage;
    renderFileStorageTable();
}

function renderBulkActionsBar(selectedCount) {
    const isVisible = selectedCount > 0 ? 'is-visible' : '';
    return `
        <div class="file-storage-bulk-actions ${isVisible}">
            <div class="bulk-summary" role="status" aria-live="polite">
                ${createIcon('checkSquare', 18)}
                <span><strong>${selectedCount}</strong> data dipilih</span>
            </div>
            <div class="bulk-actions">
                <button type="button" class="btn btn-danger btn-ghost btn-icon-only" data-action="fs-delete-selected" title="Hapus Terpilih" aria-label="Hapus Terpilih" ${selectedCount === 0 ? 'disabled' : ''}>
                    ${createIcon('trash', 16)}
                </button>
                <button type="button" class="btn btn-ghost btn-icon-only" data-action="fs-clear-selection" title="Batalkan pilihan" aria-label="Batalkan pilihan">
                    ${createIcon('x', 16)}
                </button>
            </div>
        </div>
    `;
}

function renderPaginationControls({ perPage, currentPage, totalPages, totalItems, startIndex, visibleCount }) {
    if (!Number.isFinite(totalItems) || totalItems === 0) {
        return `
            <div class="file-storage-pagination">
                <div class="pagination-info">Tidak ada data yang ditampilkan.</div>
            </div>
        `;
    }
    const safeVisible = Math.max(visibleCount, 0);
    const from = safeVisible > 0 ? startIndex + 1 : 0;
    const to = safeVisible > 0 ? startIndex + safeVisible : startIndex;
    const perPageOptions = PER_PAGE_OPTIONS.map(option => `
        <button type="button" class="per-page-option ${option === perPage ? 'is-active' : ''}" data-action="fs-set-per-page" data-value="${option}">
            ${option} baris
        </button>
    `).join('');

    return `
        <div class="file-storage-pagination">
            <div class="pagination-info">
                Menampilkan <strong>${from}-${to}</strong> dari <strong>${totalItems}</strong> data
            </div>
            <div class="pagination-controls">
                <div class="pagination-size">
                    <span class="per-page-label">Baris per halaman</span>
                    <details class="per-page-select">
                        <summary>
                            <span class="per-page-value">${perPage}</span>
                            <span class="per-page-unit">baris</span>
                        </summary>
                        <div class="per-page-options">
                            ${perPageOptions}
                        </div>
                    </details>
                </div>
                <div class="pagination-buttons">
                    <button type="button" class="btn btn-ghost" data-action="fs-page-prev" ${currentPage <= 1 ? 'disabled' : ''}>Sebelumnya</button>
                    <span class="pagination-page-indicator">Halaman ${currentPage} / ${totalPages}</span>
                    <button type="button" class="btn btn-ghost" data-action="fs-page-next" ${currentPage >= totalPages ? 'disabled' : ''}>Berikutnya</button>
                </div>
            </div>
        </div>
    `;
}

function exportFileStorageData(format = 'xlsx') {
    const { headers, rows, total } = collectFileStorageExportData();
    if (total === 0) {
        toast('info', 'Tidak ada data yang cocok dengan filter saat ini.');
        return;
    }
    const normalizedFormat = format === 'csv' ? 'csv' : 'xlsx';
    if (normalizedFormat === 'csv') {
        const csvRows = [headers.join(',')].concat(
            rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
        );
        const blob = new Blob([`\uFEFF${csvRows.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
        downloadBlob(blob, `file_storage_export_${new Date().toISOString().slice(0,10)}.csv`);
        toast('success', 'CSV berhasil diunduh.');
        return;
    }
    try {
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
        XLSX.writeFile(workbook, `file_storage_export_${new Date().toISOString().slice(0,10)}.xlsx`);
        toast('success', 'XLSX berhasil diunduh.');
    } catch (error) {
        console.error('[FileStorage] Gagal mengekspor XLSX:', error);
        toast('error', 'Gagal membuat file XLSX.');
    }
}

async function handleFileStoragePdfExport() {
    const filtered = getFilteredList();
    if (filtered.length === 0) {
        toast('info', 'Tidak ada data yang cocok dengan filter saat ini.');
        return;
    }
    const filterSummary = getFileStorageFilterSummary();
    const columnGroups = buildFileStoragePdfColumnGroups();
    const generatedAt = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    try {
        const pdf = await createPdfDoc({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        columnGroups.forEach((group, index) => {
            if (index > 0) pdf.addPage();
            renderFileStoragePdfPage(pdf, filtered, group, {
                pageIndex: index,
                totalParts: columnGroups.length,
                filterSummary,
                generatedAt
            });
        });
        pdf.save(`file_storage_${new Date().toISOString().slice(0,10)}.pdf`);
        toast('success', 'PDF berhasil dibuat.');
    } catch (error) {
        console.error('[FileStorage] Gagal membuat PDF:', error);
        toast('error', 'Gagal membuat PDF.');
    }
}

function collectFileStorageExportData() {
    const filtered = getFilteredList();
    const headers = DOWNLOADABLE_COLUMNS.map(col => col.label);
    const rows = filtered.map(item => DOWNLOADABLE_COLUMNS.map(col => formatExportValue(col.key, item)));
    return { headers, rows, total: rows.length };
}

function formatExportValue(key, item) {
    const raw = pickValue(item, key);
    if (!raw) return '';
    if (key === 'tanggalLahir') {
        try {
            return formatDate(raw, { day: '2-digit', month: '2-digit', year: 'numeric' });
        } catch {
            return getSafeString(raw);
        }
    }
    if (key === 'jarak') {
        const meters = normalizeDistanceToMeters(raw, { allowZero: true });
        return meters === null ? getSafeString(raw) : meters.toString();
    }
    return getSafeString(raw);
}

function getFileStorageFilterSummary() {
    const { gender = 'all', jenjang = 'all', agency = 'all' } = getFilters();
    const genderLabel = gender === 'all' ? 'Semua Jenis Kelamin' : gender;
    const jenjangLabel = jenjang === 'all' ? 'Semua Jenjang' : jenjang;
    const agencyLabel = agency === 'all' ? 'Semua Instansi' : agency;
    return `${genderLabel} | ${jenjangLabel} | ${agencyLabel}`;
}

function buildFileStoragePdfColumnGroups(maxWidth = 230) {
    const groups = [];
    let current = [];
    let widthSum = 0;
    DOWNLOADABLE_COLUMNS.forEach(col => {
        const estimatedWidth = FILE_STORAGE_COLUMN_WIDTH_HINTS[col.key] || 32;
        if (current.length && widthSum + estimatedWidth > maxWidth) {
            groups.push(current);
            current = [];
            widthSum = 0;
        }
        current.push(col);
        widthSum += estimatedWidth;
    });
    if (current.length) groups.push(current);
    return groups.length ? groups : [DOWNLOADABLE_COLUMNS];
}

function renderFileStoragePdfPage(pdf, dataRows, columns, meta = {}) {
    const margin = 14;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const head = [columns.map(col => col.label)];
    const body = dataRows.map(item => columns.map(col => formatExportValue(col.key, item)));
    const columnStyles = buildFileStorageColumnStyles(columns);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(44, 62, 80);
    pdf.text('Rekap Database File Storage', margin, 18);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    if (meta.filterSummary) {
        pdf.text(`Filter: ${meta.filterSummary} • Total: ${dataRows.length} data`, margin, 26);
    } else {
        pdf.text(`Total: ${dataRows.length} data`, margin, 26);
    }
    const partLabel = `Bagian ${meta.pageIndex + 1} dari ${meta.totalParts}`;
    pdf.text(partLabel, pageWidth - margin, 18, { align: 'right' });
    pdf.setFontSize(8);
    pdf.text(`Kolom: ${columns.map(col => col.label).join(', ')}`, pageWidth - margin, 26, { align: 'right' });

    const didDrawPage = (data) => {
        pdf.setFontSize(8);
        pdf.setTextColor(120, 130, 140);
        pdf.text(`Halaman ${data.pageNumber}`, margin, pdf.internal.pageSize.height - 8);
        if (meta.generatedAt) {
            pdf.text(`Dicetak: ${meta.generatedAt}`, pageWidth - margin, pdf.internal.pageSize.height - 8, { align: 'right' });
        }
    };

    pdf.autoTable({
        head,
        body,
        startY: 32,
        margin: { left: margin, right: margin, top: 32 },
        styles: {
            fontSize: 8,
            cellPadding: 2,
            overflow: 'linebreak',
            valign: 'middle'
        },
        columnStyles,
        headStyles: {
            fillColor: [38, 166, 154],
            textColor: 255,
            fontStyle: 'bold'
        },
        alternateRowStyles: {
            fillColor: [247, 248, 248]
        },
        theme: 'grid',
        didDrawPage
    });
}

function buildFileStorageColumnStyles(columns) {
    const styles = {};
    columns.forEach((col, index) => {
        const baseWidth = FILE_STORAGE_COLUMN_WIDTH_HINTS[col.key];
        styles[index] = {
            cellWidth: baseWidth || 'auto',
            halign: ['jarak'].includes(col.key) ? 'right' : (col.key === 'tanggalLahir' ? 'center' : 'left')
        };
    });
    return styles;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
}

function handleTableChange(event) {
    const target = event.target;
    if (!target) return;
    if (target.classList.contains('fs-row-checkbox')) {
        const id = target.dataset.id;
        toggleRowSelection(id, target.checked);
        renderFileStorageTable();
        return;
    }
    if (target.classList.contains('fs-select-all-checkbox')) {
        const visibleItems = getVisibleItemsSnapshot();
        toggleSelectAll(visibleItems, target.checked);
        renderFileStorageTable();
    }
}

function handleTableClick(event) {
    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget) return;
    const action = actionTarget.dataset.action;
    if (!action || !action.startsWith('fs-')) return;
    event.preventDefault();
    const recordId = actionTarget.dataset.id;
    if (action === 'fs-edit-record') {
        startEditRecord(recordId);
        return;
    }
    if (action === 'fs-delete-record') {
        confirmDeleteRecords(recordId ? [recordId] : []);
        return;
    }
    if (action === 'fs-delete-selected') {
        confirmDeleteRecords(Array.from(getSelectionState().ids));
        return;
    }
    if (action === 'fs-set-per-page') {
        handlePerPageChange(Number(actionTarget.dataset.value));
        return;
    }
    if (action === 'fs-page-prev') {
        changePage(-1);
        return;
    }
    if (action === 'fs-page-next') {
        changePage(1);
        return;
    }
    if (action === 'fs-clear-selection') {
        clearSelection();
        renderFileStorageTable();
    }
}

function startEditRecord(recordId) {
    if (!recordId) return;
    const record = getRecordById(recordId);
    if (!record) {
        toast('error', 'Data tidak ditemukan atau sudah dihapus.');
        return;
    }
    ensureFileStorageState();
    appState.fileStorage.editingRecord = { ...record };
    handleNavigation('file_storage_form');
}

function getRecordById(recordId) {
    if (!recordId) return null;
    const sourceList = Array.isArray(accumulatedItems) ? accumulatedItems : [];
    return sourceList.find(item => item.id === recordId) || null;
}

function confirmDeleteRecords(ids = []) {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) return;
    const isBulk = uniqueIds.length > 1;
    emit('ui.modal.create', 'confirmUserAction', {
        title: isBulk ? `Hapus ${uniqueIds.length} Data?` : 'Hapus Data',
        message: isBulk
            ? 'Data yang dihapus tidak dapat dikembalikan. Yakin ingin melanjutkan?'
            : 'Data penerima akan dihapus permanen. Lanjutkan?',
        confirmLabel: 'Hapus',
        confirmClass: 'btn-danger',
        cancelLabel: 'Batal',
        onConfirm: () => performDeleteRecords(uniqueIds),
        onCancel: () => {},
    });
}

async function performDeleteRecords(ids = []) {
    if (!Array.isArray(ids) || ids.length === 0) return;
    if (isDeletingRecords) return;
    isDeletingRecords = true;
    const loader = startGlobalLoading(ids.length > 1 ? 'Menghapus data terpilih...' : 'Menghapus data...');
    try {
        const results = await Promise.allSettled(ids.map(id => deleteBeneficiary(id)));
        const failed = [];
        const succeeded = [];
        results.forEach((result, index) => {
            const targetId = ids[index];
            if (result.status === 'fulfilled') {
                succeeded.push(targetId);
            } else {
                failed.push(targetId);
                console.error('[FileStorage] Gagal menghapus data', targetId, result.reason);
            }
        });
        if (succeeded.length > 0) {
            removeRecordsFromState(succeeded);
            toast('success', `${succeeded.length} data berhasil dihapus.`);
        }
        if (failed.length > 0) {
            toast('error', `${failed.length} data gagal dihapus. Coba lagi.`);
        }
    } catch (error) {
        console.error('[FileStorage] Gagal menghapus data:', error);
        toast('error', 'Terjadi kesalahan saat menghapus data.');
    } finally {
        loader.close();
        isDeletingRecords = false;
        renderFileStorageTable();
    }
}

function removeRecordsFromState(ids = []) {
    if (!Array.isArray(ids) || ids.length === 0) return;
    ensureFileStorageState();
    const selection = getSelectionState();
    const idSet = new Set(ids);
    accumulatedItems = (Array.isArray(accumulatedItems) ? accumulatedItems : []).filter(item => !idSet.has(item.id));
    appState.fileStorage.list = accumulatedItems;
    ids.forEach(id => selection.ids.delete(id));
    renderAgencyFilterControl(getFilters().agency || 'all');
}

export { initFileStoragePage };
