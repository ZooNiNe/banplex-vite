/*
 * File: js/ui/pages/hrd_applicants.js
 * REVISI: Tabel dan template dirombak untuk mendukung model data pelamar baru.
 */

import { appState } from '../../state/appState.js';
import { $ } from '../../utils/dom.js';
import { createPageToolbarHTML } from '../components/toolbar.js';
import { getApplicants, deleteApplicant } from '../../services/data/hrdApplicantService.js';
import { getEmptyStateHTML } from '../components/emptyState.js';
import { toast } from '../components/toast.js';
import { emit, on, off } from '../../state/eventBus.js';
import { createMasterDataSelect, initCustomSelects } from '../components/forms/index.js';
import { formatDate } from '../../utils/formatters.js';
import { handleNavigation } from '../mainUI.js';
import { APPLICANT_FIELD_KEYS as FIELD_KEYS } from './jobApplicantFieldMap.js';
import * as XLSX from 'xlsx';

const TABLE_COLUMNS = [
    { key: 'select', label: '', className: 'col-select' },
    { key: 'actions', label: 'AKSI', className: 'col-actions' },
    { key: 'rowNumber', label: 'NO', className: 'col-number' },
    { key: 'namaLengkap', label: 'NAMA PELAMAR', className: 'col-name' },
    { key: 'kontak', label: 'KONTAK', className: 'col-kontak' },
    { key: 'posisiDilamar', label: 'POSISI DILAMAR', className: 'col-posisi' },
    { key: 'pendidikanTerakhir', label: 'PENDIDIKAN', className: 'col-pendidikan' },
    { key: 'statusAplikasi', label: 'STATUS', className: 'col-status' },
];

const DOWNLOADABLE_COLUMNS = [
    { key: 'namaLengkap', label: 'Nama Lengkap' },
    { key: 'email', label: 'Email' },
    { key: 'noTelepon', label: 'No. Telepon' },
    { key: 'jenisKelamin', label: 'Jenis Kelamin' },
    { key: 'nik', label: 'NIK' },
    { key: 'noKk', label: 'No. KK' },
    { key: 'tempatLahir', label: 'Tempat Lahir' },
    { key: 'tanggalLahir', label: 'Tanggal Lahir (YYYY-MM-DD)' },
    { key: 'pendidikanTerakhir', label: 'Pendidikan Terakhir' },
    { key: 'namaInstitusiPendidikan', label: 'Nama Institusi Pendidikan' },
    { key: 'jurusan', label: 'Jurusan' },
    { key: 'posisiDilamar', label: 'Posisi Dilamar' },
    { key: 'sumberLowongan', label: 'Sumber Lowongan' },
    { key: 'statusAplikasi', label: 'Status Aplikasi' },
    { key: 'alamatLengkap', label: 'Alamat Lengkap' },
    { key: 'alamatDomisili', label: 'Alamat Domisili' },
    { key: 'district', label: 'Kabupaten/Kota' },
    { key: 'subDistrict', label: 'Kecamatan' },
    { key: 'village', label: 'Kelurahan/Desa' },
    { key: 'hamlet', label: 'Dusun/Kampung' },
    { key: 'rt', label: 'RT' },
    { key: 'rw', label: 'RW' },
    { key: 'pengalamanKerja', label: 'Ringkasan Pengalaman' },
    { key: 'skills', label: 'Keahlian' },
    { key: 'catatanHrd', label: 'Catatan HRD' },
];

// Opsi filter (tetap ada)
const GENDER_FILTER_OPTIONS = [
    { value: 'all', text: 'Semua Jenis Kelamin' },
    { value: 'Laki-Laki', text: 'Laki-Laki' },
    { value: 'Perempuan', text: 'Perempuan' },
];

// --- Filter Status Baru ---
const STATUS_APLIKASI_OPTIONS = [
    'Lamaran Diterima',
    'Screening',
    'Interview HR',
    'Interview User',
    'Psikotes',
    'Offering',
    'Diterima',
    'Ditolak',
    'Daftar Hitam',
];
const STATUS_FILTER_OPTIONS = [
    { value: 'all', text: 'Semua Status Aplikasi' },
    ...STATUS_APLIKASI_OPTIONS.map(opt => ({ value: opt, text: opt }))
];

// --- Pemetaan Status Baru ---
const STATUS_CLASS_MAP = {
    'lamaran diterima': 'status-badge info',
    'screening': 'status-badge info',
    'interview hr': 'status-badge warn',
    'interview user': 'status-badge warn',
    'psikotes': 'status-badge warn',
    'offering': 'status-badge positive',
    'diterima': 'status-badge positive',
    'ditolak': 'status-badge negative',
    'daftar hitam': 'status-badge negative',
};

const PER_PAGE_OPTIONS = [20, 50, 100];
const HRD_APPLICANTS_PER_PAGE_KEY = 'hrdApplicants.perPage';

function createIcon(iconName, size = 16, classes = '') {
    // (Fungsi createIcon tidak berubah)
    const icons = {
        edit: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pencil ${classes}"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
        trash: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2 ${classes}"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
        checkSquare: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-square ${classes}"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h11"/></svg>`,
        refresh: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-rotate-cw ${classes}"><path d="M21 2v6h-6"/><path d="M21 13a9 9 0 1 1-3-7.7L21 8"/></svg>`,
        x: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x ${classes}"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
        download: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download ${classes}"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
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

function ensureHrdApplicantsState() {
    if (!appState.hrdApplicants) {
        appState.hrdApplicants = {
            list: [],
            filters: {
                search: '',
                gender: 'all',
                statusAplikasi: 'all', // --- BARU ---
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
    if (!Array.isArray(appState.hrdApplicants.list)) {
        appState.hrdApplicants.list = [];
    }
    appState.hrdApplicants.filters = {
        search: '',
        gender: 'all',
        statusAplikasi: 'all', // --- BARU ---
        ...(appState.hrdApplicants.filters || {}),
    };
    // ... (Sisa fungsi tidak berubah)
    if (typeof appState.hrdApplicants.isLoading !== 'boolean') {
        appState.hrdApplicants.isLoading = false;
    }
    const storedPerPage = getStoredPerPage();
    if (!appState.hrdApplicants.view) {
        appState.hrdApplicants.view = { perPage: storedPerPage || 20, currentPage: 1 };
    } else {
        const perPage = Number(appState.hrdApplicants.view.perPage) || storedPerPage || 20;
        const currentPage = Number(appState.hrdApplicants.view.currentPage) || 1;
        appState.hrdApplicants.view = {
            perPage: PER_PAGE_OPTIONS.includes(perPage) ? perPage : (storedPerPage || 20),
            currentPage: currentPage > 0 ? currentPage : 1,
        };
    }
    const selection = appState.hrdApplicants.selection || { ids: new Set() };
    if (!(selection.ids instanceof Set)) {
        selection.ids = new Set(Array.isArray(selection.ids) ? selection.ids : []);
    }
    appState.hrdApplicants.selection = selection;
    if (appState.hrdApplicants.editingRecord && typeof appState.hrdApplicants.editingRecord !== 'object') {
        appState.hrdApplicants.editingRecord = null;
    }
}

function initHrdApplicantsPage() {
    ensureHrdApplicantsState();
    renderPageShell();
    attachEventListeners();
    const refreshHandler = () => fetchHrdApplicantsList(true);
    on('data.hrdApplicants.refresh', refreshHandler);
    cleanupFns.push(() => off('data.hrdApplicants.refresh', refreshHandler));
    renderHrdApplicantsTable();
    fetchHrdApplicantsList();
    registerUnloadHandler();
}

function renderPageShell() {
    const container = $('.page-container');
    if (!container) return;

    const { filters, list = [] } = appState.hrdApplicants;
    const searchValue = filters.search || '';
    const genderValue = filters.gender || 'all';
    const statusValue = filters.statusAplikasi || 'all'; // --- BARU ---

    container.innerHTML = `
        <div class="content-panel file-storage-panel hrd-applicants-panel">
            <div class="panel-header">
                ${createPageToolbarHTML({ title: 'Database Pelamar HRD' })}
            </div>
            <div class="panel-content scrollable-content has-padding">
                <div class="form-card accent-purple file-storage-summary">
                    <button type="button" class="summary-refresh-btn" id="hrd-applicants-refresh-btn" title="Segarkan data pelamar" aria-label="Segarkan data pelamar">
                        ${createIcon('refresh', 18)}
                    </button>
                    <div class="summary-copy">
                        <p class="summary-label">Total Pelamar Terdata</p>
                        <div class="summary-value" id="hrd-applicants-total-count">${list.length}</div>
                        <p class="helper-text">Kelola data pelamar. Gunakan tombol "Input Pelamar" untuk data baru atau "Template" untuk impor massal.</p>
                    </div>
                    <div class="summary-actions">
                        <div class="template-downloads">
                            <button type="button" class="btn btn-ghost" data-action="fs-download-template" data-format="xlsx">Template XLSX</button>
                            <button type="button" class="btn btn-ghost" data-action="fs-download-template" data-format="csv">Template CSV</button>
                        </div>
                        <button type="button" class="btn btn-primary" id="hrd-applicants-create-btn">Input Pelamar</button>
                    </div>
                </div>
                <div class="file-storage-filters card card-pad">
                    <div class="form-group">
                        <label for="hrd-applicants-search">Pencarian</label>
                        <input
                            type="search"
                            id="hrd-applicants-search"
                            placeholder="Cari nama, email, telepon, atau posisi"
                            value="${escapeHtml(searchValue)}"
                            autocomplete="off"
                        >
                    </div>
                    ${createMasterDataSelect('hrd-applicants-gender-filter', 'Jenis Kelamin', GENDER_FILTER_OPTIONS, genderValue, null, false, false)}
                    ${createMasterDataSelect('hrd-applicants-status-filter', 'Status Aplikasi', STATUS_FILTER_OPTIONS, statusValue, null, false, false)}
                    <div class="filter-stats">
                        <span class="filter-count-label">Menampilkan</span>
                        <span class="filter-count-value" id="hrd-applicants-visible-count">0</span>
                        <span class="filter-count-label">baris</span>
                    </div>
                </div>
                <div id="hrd-applicants-table" class="card table-card file-storage-table-wrapper">
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

    const searchInput = $('#hrd-applicants-search');
    if (searchInput) {
        const handler = handleSearchInput;
        searchInput.addEventListener('input', handler);
        cleanupFns.push(() => searchInput.removeEventListener('input', handler));
    }

    const genderSelect = $('#hrd-applicants-gender-filter');
    if (genderSelect) {
        const handler = (event) => handleFilterChange('gender', event.target.value);
        genderSelect.addEventListener('change', handler);
        cleanupFns.push(() => genderSelect.removeEventListener('change', handler));
    }
    
    // --- Listener Filter Status Baru ---
    const statusSelect = $('#hrd-applicants-status-filter');
    if (statusSelect) {
        const handler = (event) => handleFilterChange('statusAplikasi', event.target.value);
        statusSelect.addEventListener('change', handler);
        cleanupFns.push(() => statusSelect.removeEventListener('change', handler));
    }

    const refreshBtn = $('#hrd-applicants-refresh-btn');
    if (refreshBtn) {
        const handler = () => fetchHrdApplicantsList(true);
        refreshBtn.addEventListener('click', handler);
        cleanupFns.push(() => refreshBtn.removeEventListener('click', handler));
    }

    const createBtn = $('#hrd-applicants-create-btn');
    if (createBtn) {
        const handler = () => {
            ensureHrdApplicantsState();
            appState.hrdApplicants.editingRecord = null;
            handleNavigation('hrd_applicants_form');
        };
        createBtn.addEventListener('click', handler);
        cleanupFns.push(() => createBtn.removeEventListener('click', handler));
    }

    const templateButtons = container?.querySelectorAll?.('[data-action="fs-download-template"]') || [];
    templateButtons.forEach(button => {
        const handler = () => handleTemplateDownload(button.dataset.format || 'xlsx');
        button.addEventListener('click', handler);
        cleanupFns.push(() => button.removeEventListener('click', handler));
    });

    const tableContainer = $('#hrd-applicants-table');
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
        renderHrdApplicantsTable();
    }, 250);
}

function handleFilterChange(key, value) {
    setFilter(key, value);
    clearSelection();
    renderHrdApplicantsTable();
}

function setFilter(key, value) {
    ensureHrdApplicantsState();
    const normalizedValue = (value || '').toString().trim();
    appState.hrdApplicants.filters[key] = (normalizedValue === '' || normalizedValue === 'all') ? 'all' : normalizedValue;
    if (appState.hrdApplicants.view) {
        appState.hrdApplicants.view.currentPage = 1;
    }
}

function getFilters() {
    ensureHrdApplicantsState();
    return appState.hrdApplicants.filters;
}

function getViewState() {
    ensureHrdApplicantsState();
    return appState.hrdApplicants.view;
}

function fetchHrdApplicantsList(force = false) {
    ensureHrdApplicantsState();
    if (appState.hrdApplicants.isLoading && !force) return;

    const currentToken = ++requestToken;
    appState.hrdApplicants.isLoading = true;
    showLoadingState();

    getApplicants()
        .then(items => {
            if (currentToken !== requestToken) return;
            const normalized = Array.isArray(items) ? items.slice() : [];
            // --- Mengurutkan berdasarkan namaLengkap ---
            normalized.sort((a, b) => {
                const nameA = getSafeString(pickValue(a, 'namaLengkap')).toLocaleLowerCase('id');
                const nameB = getSafeString(pickValue(b, 'namaLengkap')).toLocaleLowerCase('id');
                if (nameA && nameB) return nameA.localeCompare(nameB, 'id');
                if (nameA) return -1;
                if (nameB) return 1;
                return 0;
            });
            appState.hrdApplicants.list = normalized;
            clearSelection();
            appState.hrdApplicants.isLoading = false;
            renderHrdApplicantsTable();
        })
        .catch(error => {
            if (currentToken !== requestToken) return;
            console.error('[HrdApplicants] Gagal memuat data:', error);
            const tableWrapper = $('#hrd-applicants-table');
            if (tableWrapper) {
                tableWrapper.innerHTML = getEmptyStateHTML({
                    icon: 'error',
                    title: 'Gagal Memuat Data Pelamar',
                    desc: error?.message || 'Periksa koneksi Anda, lalu coba segarkan kembali.',
                });
            }
            toast('error', 'Gagal memuat data pelamar.');
            appState.hrdApplicants.isLoading = false;
        })
        .finally(() => {
            if (currentToken !== requestToken) return;
            appState.hrdApplicants.isLoading = false;
        });
}

function showLoadingState() {
    const tableWrapper = $('#hrd-applicants-table');
    if (tableWrapper) {
        lastRenderedItems = [];
        tableWrapper.innerHTML = getTableSkeletonHTML();
    }
}

function renderHrdApplicantsTable() {
    const tableWrapper = $('#hrd-applicants-table');
    if (!tableWrapper) return;

    if (appState.hrdApplicants.isLoading) {
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
            title: 'Belum Ada Data Pelamar',
            desc: 'Gunakan tombol "Input Pelamar" untuk menambahkan data baru.',
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
            ${TABLE_COLUMNS.map(col => `<td class="${col.className || ''}">${formatCellValue(col, item, startIndex + index)}</td>`).join('')}
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
    const { list = [] } = appState.hrdApplicants || {};
    const { search = '', gender = 'all', statusAplikasi = 'all' } = getFilters();
    const searchTerm = search.trim().toLowerCase();
    const genderFilter = gender.toLowerCase();
    const statusFilter = statusAplikasi.toLowerCase(); // --- BARU ---

    return list.filter(item => {
        if (genderFilter !== 'all') {
            const genderValue = getSafeString(pickValue(item, 'jenisKelamin')).toLowerCase();
            if (genderValue !== genderFilter) return false;
        }
        // --- Filter Status Baru ---
        if (statusFilter !== 'all') {
            const statusValue = getSafeString(pickValue(item, 'statusAplikasi')).toLowerCase();
            if (statusValue !== statusFilter) return false;
        }
        if (!searchTerm) return true;
        
        // --- Haystack Pencarian Baru ---
        const haystack = [
            pickValue(item, 'namaLengkap'), // (was 'namaPenerima')
            pickValue(item, 'nik'),
            pickValue(item, 'email'),
            pickValue(item, 'noTelepon'),
            pickValue(item, 'posisiDilamar'),
            pickValue(item, 'alamatLengkap'),
            pickValue(item, 'skills'),
        ].map(getSafeString).join(' ').toLowerCase();
        return haystack.includes(searchTerm);
    });
}

// Fungsi pickValue SANGAT PENTING dan sudah fleksibel
function pickValue(item, key) {
    if (!item) return '';
    if (key === 'rowNumber') return '';
    
    // Menggunakan FIELD_KEYS (diimpor dari jobApplicantFieldMap.js)
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

// --- formatCellValue Dirombak Total ---
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
                <button type="button" class="btn-icon btn-ghost" data-action="fs-edit-record" data-id="${item?.id || ''}" title="Edit data pelamar" ${disabledAttr}>
                    ${createIcon('edit', 16)}
                </button>
                <button type="button" class="btn-icon btn-ghost btn-icon--danger" data-action="fs-delete-record" data-id="${item?.id || ''}" title="Hapus data pelamar" ${disabledAttr}>
                    ${createIcon('trash', 16)}
                </button>
            </div>
        `;
    }

    // --- Logika Sel Baru ---
    
    if (column.key === 'namaLengkap') {
        const value = getSafeString(pickValue(item, 'namaLengkap'));
        return `<strong>${escapeHtml(value) || '-'}</strong>`;
    }
    
    if (column.key === 'kontak') {
        const email = getSafeString(pickValue(item, 'email'));
        const phone = getSafeString(pickValue(item, 'noTelepon'));
        const lines = [];
        if (email) lines.push(`<div>${escapeHtml(email)}</div>`);
        if (phone) lines.push(`<div class="monospace-cell">${escapeHtml(phone)}</div>`);
        if (lines.length === 0) return `<span class="muted-cell">-</span>`;
        return lines.join('');
    }
    
    if (column.key === 'posisiDilamar') {
        const value = getSafeString(pickValue(item, 'posisiDilamar'));
        return `<span>${escapeHtml(value) || '-'}</span>`;
    }
    
    if (column.key === 'pendidikanTerakhir') {
        const pendidikan = getSafeString(pickValue(item, 'pendidikanTerakhir'));
        const jurusan = getSafeString(pickValue(item, 'jurusan'));
        const lines = [];
        if (pendidikan) lines.push(`<div><strong>${escapeHtml(pendidikan)}</strong></div>`);
        if (jurusan) lines.push(`<div>${escapeHtml(jurusan)}</div>`);
        if (lines.length === 0) return `<span class="muted-cell">-</span>`;
        return lines.join('');
    }

    if (column.key === 'statusAplikasi') {
        const value = getSafeString(pickValue(item, 'statusAplikasi'));
        if (!value) return `<span class="muted-cell">-</span>`;
        const statusKey = value.toLowerCase();
        const badgeClass = STATUS_CLASS_MAP[statusKey] || 'status-badge info';
        return `<span class="${badgeClass}">${escapeHtml(value)}</span>`;
    }

    // Fallback untuk kolom lain (jika ada)
    const value = getSafeString(pickValue(item, column.key));
    if (!value) {
        return `<span class="muted-cell">-</span>`;
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
    const totalEl = $('#hrd-applicants-total-count');
    if (totalEl) {
        totalEl.textContent = appState.hrdApplicants?.list?.length || 0;
    }
    const visibleEl = $('#hrd-applicants-visible-count');
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
    unloadHandler = () => cleanupHrdApplicantsPage();
    on('app.unload.hrd_applicants', unloadHandler);
}

function cleanupHrdApplicantsPage() {
    if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = null;
    }
    cleanupFns.forEach(fn => fn?.());
    cleanupFns = [];
    if (unloadHandler) {
        off('app.unload.hrd_applicants', unloadHandler);
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

// (Fungsi-fungsi helper di bawah ini (getSelectionState, getSelectedCount, isRowSelected, clearSelection, getStoredPerPage, persistPerPage, toggleRowSelection, toggleSelectAll, handlePerPageChange, changePage, renderBulkActionsBar, renderPaginationControls) TIDAK BERUBAH. Saya akan sertakan yang penting saja.)

// ... (getSelectionState, getSelectedCount, isRowSelected, clearSelection ...)

function getSelectionState() {
    ensureHrdApplicantsState();
    return appState.hrdApplicants.selection;
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
        const storedValue = Number(localStorage.getItem(HRD_APPLICANTS_PER_PAGE_KEY));
        return PER_PAGE_OPTIONS.includes(storedValue) ? storedValue : null;
    } catch (_) {
        return null;
    }
}

function persistPerPage(value) {
    try {
        localStorage.setItem(HRD_APPLICANTS_PER_PAGE_KEY, String(value));
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
    renderHrdApplicantsTable();
}

function changePage(delta) {
    if (typeof delta !== 'number' || Number.isNaN(delta)) return;
    const view = getViewState();
    const totalPages = Math.max(1, Math.ceil(lastFilterCount / view.perPage));
    const nextPage = Math.min(Math.max(view.currentPage + delta, 1), totalPages);
    if (nextPage === view.currentPage) return;
    view.currentPage = nextPage;
    renderHrdApplicantsTable();
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

// --- handleTemplateDownload Dirombak ---
function handleTemplateDownload(format = 'xlsx') {
    const normalizedFormat = format === 'csv' ? 'csv' : 'xlsx';
    
    // Menggunakan DOWNLOADABLE_COLUMNS baru
    const headers = DOWNLOADABLE_COLUMNS.map(col => col.label);
    
    if (normalizedFormat === 'csv') {
        const csvContent = `${headers.join(',')}\n`;
        const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
        downloadBlob(blob, 'hrd_applicants_template.csv');
        toast('success', 'Template CSV berhasil dibuat.');
        return;
    }
    try {
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet([headers]);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
        XLSX.writeFile(workbook, 'hrd_applicants_template.xlsx');
        toast('success', 'Template XLSX berhasil dibuat.');
    } catch (error) {
        console.error('[HrdApplicants] Gagal membuat template XLSX:', error);
        toast('error', 'Gagal membuat template XLSX.');
    }
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

// (Fungsi handleTableChange, handleTableClick, startEditRecord, getRecordById, confirmDeleteRecords, performDeleteRecords, removeRecordsFromState tidak berubah)

function handleTableChange(event) {
    const target = event.target;
    if (!target) return;
    if (target.classList.contains('fs-row-checkbox')) {
        const id = target.dataset.id;
        toggleRowSelection(id, target.checked);
        renderHrdApplicantsTable();
        return;
    }
    if (target.classList.contains('fs-select-all-checkbox')) {
        const visibleItems = getVisibleItemsSnapshot();
        toggleSelectAll(visibleItems, target.checked);
        renderHrdApplicantsTable();
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
        renderHrdApplicantsTable();
    }
}

function startEditRecord(recordId) {
    if (!recordId) return;
    const record = getRecordById(recordId);
    if (!record) {
        toast('error', 'Data tidak ditemukan atau sudah dihapus.');
        return;
    }
    ensureHrdApplicantsState();
    appState.hrdApplicants.editingRecord = { ...record };
    handleNavigation('hrd_applicants_form');
}

function getRecordById(recordId) {
    if (!recordId) return null;
    const { list = [] } = appState.hrdApplicants || {};
    return list.find(item => item.id === recordId) || null;
}

function confirmDeleteRecords(ids = []) {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) return;
    const isBulk = uniqueIds.length > 1;
    emit('ui.modal.create', 'confirmUserAction', {
        title: isBulk ? `Hapus ${uniqueIds.length} Data?` : 'Hapus Data',
        message: isBulk
            ? 'Data pelamar yang dihapus tidak dapat dikembalikan. Yakin ingin melanjutkan?'
            : 'Data pelamar akan dihapus permanen. Lanjutkan?',
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
    let loadingToast = null;
    try {
        loadingToast = toast('syncing', ids.length > 1 ? 'Menghapus data terpilih...' : 'Menghapus data...', 0);
    } catch (_) {}
    try {
        const results = await Promise.allSettled(ids.map(id => deleteApplicant(id))); // --- Gunakan deleteApplicant ---
        const failed = [];
        const succeeded = [];
        results.forEach((result, index) => {
            const targetId = ids[index];
            if (result.status === 'fulfilled') {
                succeeded.push(targetId);
            } else {
                failed.push(targetId);
                console.error('[HrdApplicants] Gagal menghapus data', targetId, result.reason);
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
        console.error('[HrdApplicants] Gagal menghapus data:', error);
        toast('error', 'Terjadi kesalahan saat menghapus data.');
    } finally {
        if (loadingToast?.close) {
            loadingToast.close().catch(() => {});
        }
        isDeletingRecords = false;
        renderHrdApplicantsTable();
    }
}

function removeRecordsFromState(ids = []) {
    if (!Array.isArray(ids) || ids.length === 0) return;
    ensureHrdApplicantsState();
    const selection = getSelectionState();
    const idSet = new Set(ids);
    appState.hrdApplicants.list = (appState.hrdApplicants.list || []).filter(item => !idSet.has(item.id));
    ids.forEach(id => selection.ids.delete(id));
}

export { initHrdApplicantsPage };