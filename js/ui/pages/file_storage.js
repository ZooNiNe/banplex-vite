import { appState } from '../../state/appState.js';
import { $ } from '../../utils/dom.js';
import { createPageToolbarHTML } from '../components/toolbar.js';
import { getBeneficiaries, deleteBeneficiary } from '../../services/data/adminService.js';
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

function ensureFileStorageState() {
    if (!appState.fileStorage) {
        appState.fileStorage = {
            list: [],
            filters: {
                search: '',
                gender: 'all',
                jenjang: 'all',
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
    renderPageShell();
    attachEventListeners();
    const refreshHandler = () => fetchFileStorageList(true);
    on('data.fileStorage.refresh', refreshHandler);
    cleanupFns.push(() => off('data.fileStorage.refresh', refreshHandler));
    renderFileStorageTable();
    fetchFileStorageList();
    registerUnloadHandler();
}

function renderPageShell() {
    const container = $('.page-container');
    if (!container) return;

    const { filters, list = [] } = appState.fileStorage;
    const searchValue = filters.search || '';
    const genderValue = filters.gender || 'all';
    const jenjangValue = filters.jenjang || 'all';

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
                        <p class="helper-text">Struktur mengikuti format file Excel "FORMAT PENERIMA MANFAAT_DSN JABAR 2025_NAMA YAYASAN_KECAMATAN".</p>
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

    try {
        initCustomSelects(container);
    } catch (_) {}
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
        const handler = () => fetchFileStorageList(true);
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
    renderFileStorageTable();
}

function setFilter(key, value) {
    ensureFileStorageState();
    const normalizedValue = (value || '').toString().trim();
    appState.fileStorage.filters[key] = normalizedValue === '' ? (key === 'gender' || key === 'jenjang' ? 'all' : '') : normalizedValue;
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

function fetchFileStorageList(force = false) {
    ensureFileStorageState();
    if (appState.fileStorage.isLoading && !force) return;

    const currentToken = ++requestToken;
    appState.fileStorage.isLoading = true;
    showLoadingState();

    getBeneficiaries()
        .then(items => {
            if (currentToken !== requestToken) return;
            const normalized = Array.isArray(items) ? items.slice() : [];
            normalized.sort((a, b) => {
                const nameA = getSafeString(pickValue(a, 'namaPenerima')).toLocaleLowerCase('id');
                const nameB = getSafeString(pickValue(b, 'namaPenerima')).toLocaleLowerCase('id');
                if (nameA && nameB) return nameA.localeCompare(nameB, 'id');
                if (nameA) return -1;
                if (nameB) return 1;
                return 0;
            });
            appState.fileStorage.list = normalized;
            clearSelection();
            appState.fileStorage.isLoading = false;
            renderFileStorageTable();
        })
        .catch(error => {
            if (currentToken !== requestToken) return;
            console.error('[FileStorage] Gagal memuat data:', error);
            const tableWrapper = $('#file-storage-table');
            if (tableWrapper) {
                tableWrapper.innerHTML = getEmptyStateHTML({
                    icon: 'error',
                    title: 'Gagal Memuat Data',
                    desc: error?.message || 'Periksa koneksi Anda, lalu coba segarkan kembali.',
                });
            }
            toast('error', 'Gagal memuat data File Storage.');
            appState.fileStorage.isLoading = false;
        })
        .finally(() => {
            if (currentToken !== requestToken) return;
            appState.fileStorage.isLoading = false;
        });
}

function showLoadingState() {
    const tableWrapper = $('#file-storage-table');
    if (tableWrapper) {
        lastRenderedItems = [];
        tableWrapper.innerHTML = getTableSkeletonHTML();
    }
}

function renderFileStorageTable() {
    const tableWrapper = $('#file-storage-table');
    if (!tableWrapper) return;

    if (appState.fileStorage.isLoading) {
        showLoadingState();
        return;
    }

    const filtered = getFilteredList();
    lastFilterCount = filtered.length;
    updateSummaryCounters(filtered.length);

    if (filtered.length === 0) {
        lastRenderedItems = [];
        tableWrapper.innerHTML = `${renderBulkActionsBar(getSelectedCount())}${getEmptyStateHTML({
            icon: 'database',
            title: 'Belum Ada Data',
            desc: 'Gunakan tombol "Input Data" untuk menambahkan penerima baru sesuai format Excel.',
        })}`;
        return;
    }

    const viewState = getViewState();
    const perPage = viewState.perPage;
    const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
    if (viewState.currentPage > totalPages) {
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
}

function getVisibleItemsSnapshot() {
    const filtered = getFilteredList();
    const viewState = getViewState();
    const startIndex = (viewState.currentPage - 1) * viewState.perPage;
    return filtered.slice(startIndex, startIndex + viewState.perPage);
}

function getFilteredList() {
    const { list = [] } = appState.fileStorage || {};
    const { search = '', gender = 'all', jenjang = 'all' } = getFilters();
    const searchTerm = search.trim().toLowerCase();
    const genderFilter = gender.toLowerCase();
    const jenjangFilter = jenjang.toLowerCase();

    return list.filter(item => {
        if (genderFilter !== 'all') {
            const genderValue = getSafeString(pickValue(item, 'jenisKelamin')).toLowerCase();
            if (genderValue !== genderFilter) return false;
        }
        if (jenjangFilter !== 'all') {
            const jenjangValue = getSafeString(pickValue(item, 'jenjang')).toLowerCase();
            if (jenjangValue !== jenjangFilter) return false;
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
        totalEl.textContent = appState.fileStorage?.list?.length || 0;
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
    cleanupFns.forEach(fn => fn?.());
    cleanupFns = [];
    if (unloadHandler) {
        off('app.unload.file_storage', unloadHandler);
        unloadHandler = null;
    }
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
                <button type="button" class="btn btn-danger btn-ghost" data-action="fs-delete-selected" ${selectedCount === 0 ? 'disabled' : ''}>Hapus Terpilih</button>
                <button type="button" class="btn btn-ghost" data-action="fs-clear-selection">
                    ${createIcon('x', 16)}
                    Batalkan
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
    const { gender = 'all', jenjang = 'all' } = getFilters();
    const genderLabel = gender === 'all' ? 'Semua Jenis Kelamin' : gender;
    const jenjangLabel = jenjang === 'all' ? 'Semua Jenjang' : jenjang;
    return `${genderLabel} | ${jenjangLabel}`;
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
    const { list = [] } = appState.fileStorage || {};
    return list.find(item => item.id === recordId) || null;
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
    appState.fileStorage.list = (appState.fileStorage.list || []).filter(item => !idSet.has(item.id));
    ids.forEach(id => selection.ids.delete(id));
}

export { initFileStoragePage };
