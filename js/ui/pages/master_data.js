import { appState } from '../../state/appState.js';
import { $, $$ } from '../../utils/dom.js';
import { createPageToolbarHTML } from '../components/toolbar.js';
import { createTabsHTML } from '../components/tabs.js';
import { emit, on, off } from '../../state/eventBus.js';
import { liveQueryMulti } from '../../state/liveQuery.js';
import { fetchAndCacheData } from '../../services/data/fetch.js';
import { localDB } from '../../services/localDbService.js';
import { 
    getMasterDataFormHTML, 
    initCustomSelects, 
    formatNumberInput, 
    updateCustomSelectOptions,
    attachStaffFormListeners 
} from '../components/forms/index.js';
import { _getMasterDataListHTML } from '../components/cards.js';
import { 
    createMasterDataFormSkeletonHTML, 
    createMasterDataListSkeletonHTML, 
    _getSkeletonLoaderHTML 
} from '../components/skeleton.js';
import { getEmptyStateHTML } from '../components/emptyState.js';
import { isViewer } from '../../utils/helpers.js';
import { masterDataConfig, TEAM_ID } from '../../config/constants.js';
import { db, projectsCol, suppliersCol, workersCol, materialsCol, staffCol, professionsCol, opCatsCol, matCatsCol, otherCatsCol, fundingCreditorsCol } from '../../config/firebase.js';
import { checkFormDirty, resetFormDirty } from '../components/modal.js';

// Map untuk koleksi Firestore (disalin dari masterDataService)
const COLLECTIONS = {
    'projects': projectsCol,
    'creditors': fundingCreditorsCol,
    'op-cats': opCatsCol,
    'other-cats': otherCatsCol,
    'suppliers': suppliersCol,
    'professions': professionsCol,
    'workers': workersCol,
    'staff': staffCol,
    'materials': materialsCol,
};

let pageAbortController = null;
let pageEventListenerController = null;
let unsubscribeLiveQuery = null;

// State khusus untuk halaman ini
let pageState = {
    type: null,
    config: null,
    activeTab: 'list',
    currentItemId: null,
    isFormDirty: false,
    formUpdateListener: null
};

/**
 * Helper untuk mendapatkan tipe master data yang tersedia untuk pengguna saat ini
 */
function getAvailableMasterTypes() {
    const allowedForEditor = new Set(['materials', 'suppliers', 'professions', 'workers', 'op-cats', 'other-cats', 'creditors']);
    // [PERBAIKAN] Pastikan urutan konsisten
    const allTypeKeys = [
        'projects', 'suppliers', 'workers', 'professions', 
        'materials', 'staff', 'op-cats', 'other-cats', 'creditors'
    ];

    let availableKeys = [];

    if (appState.userRole === 'Owner') {
        availableKeys = allTypeKeys;
    } else if (appState.userRole === 'Editor') {
        availableKeys = allTypeKeys.filter(key => allowedForEditor.has(key));
    }
    
    return availableKeys
        .filter(key => masterDataConfig[key]) // Pastikan config ada
        .map(key => ({ id: key, label: masterDataConfig[key].title }));
}


/**
 * Merender konten untuk tab yang aktif (Daftar atau Form)
 */
async function renderTabContent(tabId) {
    const contentContainer = $('#sub-page-content');
    if (!contentContainer || !pageState.config) return;

    pageState.activeTab = tabId;

    // Hapus listener update form sebelumnya jika ada
    if (pageState.formUpdateListener) {
        off('masterData.updated', pageState.formUpdateListener);
        pageState.formUpdateListener = null;
    }

    contentContainer.classList.toggle('has-sticky-footer', tabId === 'form');
    const { config, type, currentItemId } = pageState;

    // Cek hak akses untuk Editor
    // [PERBAIKAN] Editor tidak bisa menambah/edit 'projects' atau 'staff'
    const editorRestricted = (appState.userRole === 'Editor' && (type === 'projects' || type === 'staff'));

    if (tabId === 'form' && editorRestricted) {
        contentContainer.innerHTML = getEmptyStateHTML({
            icon: 'lock',
            title: 'Akses Dibatasi',
            desc: 'Hanya Owner yang dapat menambah atau mengedit data master ini.'
        });
         // Sembunyikan tombol form
        const formTab = document.querySelector('#master-data-tabs [data-tab="form"]');
        if (formTab) formTab.style.display = 'none';
        return;
    } else {
        // Tampilkan kembali jika pindah ke tipe yang diizinkan
        const formTab = document.querySelector('#master-data-tabs [data-tab="form"]');
        if (formTab) formTab.style.display = '';
    }

    if (tabId === 'list') {
        contentContainer.innerHTML = createMasterDataListSkeletonHTML();
        await fetchAndCacheData(config.stateKey, COLLECTIONS[type], config.nameField, pageAbortController?.signal);
        const items = (appState[config.stateKey] || []);

        if (items.filter(item => !item.isDeleted).length > 0) {
             contentContainer.innerHTML = `<div class="wa-card-list-wrapper master-data-list">${_getMasterDataListHTML(type, items, config)}</div>`;
        } else {
             contentContainer.innerHTML = getEmptyStateHTML({
                icon: 'database',
                title: `Data ${config.title} Kosong`,
                desc: `Anda bisa menambahkan data baru melalui tab 'Input Baru'.`
             });
        }
    } else { // tabId === 'form'
        contentContainer.innerHTML = createMasterDataFormSkeletonHTML();
        let itemData = null;

        // Pastikan data master yang relevan (misal: profesi untuk pekerja) sudah dimuat
        if (type === 'workers') {
            await fetchAndCacheData('professions', professionsCol, 'professionName', pageAbortController?.signal);
            await fetchAndCacheData('projects', projectsCol, 'projectName', pageAbortController?.signal);
        }
        // [PERBAIKAN] Pastikan data proyek dimuat saat mengedit staf
        if (type === 'staff') {
             await fetchAndCacheData('projects', projectsCol, 'projectName', pageAbortController?.signal);
        }

        if (currentItemId) {
            await fetchAndCacheData(config.stateKey, COLLECTIONS[type], config.nameField, pageAbortController?.signal);
            itemData = (appState[config.stateKey] || []).find(i => i.id === currentItemId);
        }
        
        // Cek sinyal abort sebelum render HTML besar
        if (pageAbortController?.signal?.aborted) return;

        contentContainer.innerHTML = await getMasterDataFormHTML(type, itemData);

        initCustomSelects(contentContainer);
        contentContainer.querySelectorAll('input[inputmode="numeric"]').forEach(input => {
            input.addEventListener('input', formatNumberInput);
        });

        const form = contentContainer.querySelector('#master-data-form');
        if (form) {
            resetFormDirty();
            const dirtyListener = () => emit('ui.form.markDirty', true);
            form.addEventListener('input', dirtyListener);
            form.addEventListener('change', dirtyListener);
        }

        if(type === 'staff') {
            attachStaffFormListeners(contentContainer);
        }

        emit('ui.forms.init', contentContainer);

        // Pasang listener untuk update dropdown jika ada master data lain yang diupdate
        if (pageEventListenerController?.signal) {
            pageState.formUpdateListener = (updateData) => {
                if (!updateData || !updateData.type) return;
                console.log(`[Master Page] Master data '${updateData.type}' diperbarui. Memperbarui dropdown...`);
                updateCustomSelectOptions(contentContainer, updateData.type);
            };
            on('masterData.updated', pageState.formUpdateListener, { signal: pageEventListenerController.signal });
        }
    }
}

/**
 * Menginisialisasi listener untuk halaman master data
 */
function initMasterDataListeners() {
    if (pageEventListenerController) pageEventListenerController.abort();
    pageEventListenerController = new AbortController();
    const { signal } = pageEventListenerController;

    const container = $('.page-container');
    const typeTabsContainer = container?.querySelector('#master-data-type-tabs'); // Tab Tipe (Proyek, Supplier, dll)
    const formTabsContainer = container?.querySelector('#master-data-tabs'); // Tab Aksi (Daftar, Input)
    const contentContainer = container?.querySelector('#sub-page-content');

    // --- BARU: Listener untuk Tab Tipe Master Data ---
    typeTabsContainer?.addEventListener('click', (e) => {
        const tabButton = e.target.closest('.sub-nav-item');
        if (tabButton && !tabButton.classList.contains('active')) {
            const newType = tabButton.dataset.tab;
            const newConfig = masterDataConfig[newType];

            if (!newConfig) {
                console.error(`[MasterDataPage] Config tidak ditemukan untuk tipe baru: ${newType}`);
                return;
            }

            const proceed = () => {
                // Update kelas aktif di tab tipe
                typeTabsContainer.querySelector('.active')?.classList.remove('active');
                tabButton.classList.add('active');

                // Reset state halaman untuk tipe baru
                pageState.type = newType;
                pageState.config = newConfig;
                pageState.currentItemId = null;
                pageState.activeTab = 'list';
                
                // Reset tab Aksi (Daftar/Input) ke "Daftar"
                const formTab = formTabsContainer?.querySelector('[data-tab="form"]');
                if (formTab) formTab.textContent = 'Input Baru';
                formTabsContainer?.querySelector('.active')?.classList.remove('active');
                formTabsContainer?.querySelector('[data-tab="list"]')?.classList.add('active');
                
                resetFormDirty();
                renderTabContent('list'); // Render ulang konten untuk tipe baru
            };

            // Cek form dirty sebelum pindah tab tipe
            if (pageState.activeTab === 'form' && checkFormDirty()) {
                emit('ui.modal.create', 'confirmUserAction', {
                    title: 'Batalkan Perubahan?',
                    message: 'Perubahan yang belum disimpan akan hilang. Anda yakin ingin pindah data?',
                    onConfirm: proceed,
                    isUtility: true
                });
            } else {
                proceed();
            }
        }
    }, { signal });
    // --- AKHIR BLOK BARU ---

    // Listener untuk Tab Aksi (List/Form)
    formTabsContainer?.addEventListener('click', (e) => {
        const tabButton = e.target.closest('.sub-nav-item');
        if (tabButton && !tabButton.classList.contains('active')) {
            const newTabId = tabButton.dataset.tab; // 'list' or 'form'
            const currentTabId = formTabsContainer.querySelector('.active')?.dataset.tab;

            const proceed = () => {
                formTabsContainer.querySelector('.active')?.classList.remove('active');
                tabButton.classList.add('active');
                const formTab = formTabsContainer.querySelector('[data-tab="form"]');
                if (formTab) formTab.textContent = 'Input Baru';

                if (newTabId === 'list') {
                     pageState.currentItemId = null;
                }
                
                resetFormDirty();
                renderTabContent(newTabId);
            };

            if (currentTabId === 'form' && checkFormDirty()) {
                emit('ui.modal.create', 'confirmUserAction', {
                    title: 'Batalkan Perubahan?',
                    message: 'Perubahan yang belum disimpan akan hilang. Anda yakin ingin kembali ke daftar?',
                    onConfirm: proceed,
                    isUtility: true
                });
            } else {
                proceed();
            }
        }
    }, { signal });

    // Listener untuk Aksi di dalam Konten (klik item list, dll.)
    contentContainer?.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        
        const action = target.dataset.action;
        const itemWrapper = target.closest('.wa-card-v2-wrapper');
        const itemId = itemWrapper?.dataset.itemId;

        if (action === 'edit-master-item' && itemId) {
            // Klik "Edit" dari daftar
            pageState.currentItemId = itemId;
            
            const formTab = formTabsContainer?.querySelector('[data-tab="form"]');
            if (formTab) {
                formTab.textContent = 'Edit Data';
                formTab.click(); // Pindah ke tab form
            }
        }
        else if (action === 'delete-master-item' && itemId) {
            // Klik "Hapus" dari daftar
            emit('ui.action.delete-master-item', { itemId, type: pageState.type });
        }
    }, { signal });
    
    // Listener global untuk event bus
    on('ui.form.markDirty', (isDirty) => {
        pageState.isFormDirty = isDirty;
    }, { signal });

    // Hapus listener saat halaman ditutup
    on('app.unload.master_data', () => {
        if (pageAbortController) pageAbortController.abort();
        if (pageEventListenerController) pageEventListenerController.abort();
        if (unsubscribeLiveQuery) unsubscribeLiveQuery.unsubscribe();
        if (pageState.formUpdateListener) off('masterData.updated', pageState.formUpdateListener);
        
        pageAbortController = null;
        pageEventListenerController = null;
        unsubscribeLiveQuery = null;
        pageState.formUpdateListener = null;

        // Reset tipe pageState saat unload
        pageState.type = null; 
        
        off('app.unload.master_data');
    }, { signal });
}

/**
 * Inisialisasi Halaman Master Data
 */
export async function initMasterDataPage() {
    // 1. Ambil data request dari appState
    const request = appState.masterDataOpenRequest || {};
    appState.masterDataOpenRequest = null; // Hapus request setelah dibaca

    // --- LOGIKA BARU UNTUK MENENTUKAN TIPE ---
    const availableTypes = getAvailableMasterTypes();
    const defaultType = availableTypes.length > 0 ? availableTypes[0].id : '';

    // Prioritas: Request -> State Halaman Saat Ini -> Default ('projects')
    const type = request.type || pageState.type || defaultType;
    const itemId = (request.type === type) ? request.itemId : null; // Hanya pakai itemId jika tipe-nya cocok
    const activeFormTab = itemId ? 'form' : 'list'; // Tab 'Daftar' or 'Form'

    const config = masterDataConfig[type];
    // --- AKHIR LOGIKA BARU ---

    // --- FIX [START] --- (Ini adalah fix dari langkah sebelumnya, kita pertahankan)
    if (!config) {
        console.error(`[MasterDataPage] Konfigurasi tidak valid untuk tipe: ${type}. Ini bisa terjadi jika halaman di-refresh atau diakses langsung. Mengalihkan ke 'pengaturan'.`);
        
        const container = $('.page-container');
        if (container) {
            // Tampilkan pesan error sementara
            container.innerHTML = `
                <div class="content-panel">
                    <div class="panel-header">
                        ${createPageToolbarHTML({ title: 'Error Navigasi', showNavBack: true, navBackTarget: 'pengaturan' })}
                    </div>
                    <div id="sub-page-content" class="panel-body scrollable-content" style="padding: 1.5rem;">
                        ${getEmptyStateHTML({ icon: 'error', title: 'Error Navigasi', desc: 'Tipe master data tidak dikenali. Mengalihkan ke halaman Pengaturan.' })}
                    </div>
                </div>
            `;
        }
        // Alihkan pengguna kembali ke halaman 'pengaturan'
        setTimeout(() => {
            emit('ui.navigate', 'pengaturan');
        }, 1500); // Beri waktu 1.5 detik untuk membaca pesan
        return; // Hentikan eksekusi lebih lanjut
    }
    // --- FIX [END] ---

    // 2. Setup state halaman
    pageState.type = type;
    pageState.config = config;
    pageState.currentItemId = itemId || null;
    pageState.activeTab = activeFormTab;
    pageState.isFormDirty = false;

    // 3. Render Shell Halaman
    const container = $('.page-container');
    const title = `Kelola Master Data`; // Judul generik

    // --- BARU: Navigasi Tipe Master Data ---
    const masterTypeNavHTML = createTabsHTML({
        id: 'master-data-type-tabs', // ID baru untuk sub-nav
        tabs: availableTypes,
        activeTab: type, // Tab aktif adalah tipe data (e.g., 'projects')
        customClasses: 'category-sub-nav' // Gunakan style yang bisa di-scroll
    });
    // --- AKHIR BARU ---

    // Tab Aksi (Daftar / Input)
    const tabs = [
        { id: 'list', label: 'Daftar Data' },
        { id: 'form', label: itemId ? 'Edit Data' : 'Input Baru' }
    ];
    
    container.innerHTML = `
        <div class="content-panel">
            <div class="panel-header">
                ${createPageToolbarHTML({ title, showNavBack: true })}
                ${masterTypeNavHTML} 
                ${createTabsHTML({ id: 'master-data-tabs', tabs, activeTab: pageState.activeTab, customClasses: 'tabs-underline two-tabs' })}
            </div>
            <div id="sub-page-content" class="panel-body scrollable-content">
                ${_getSkeletonLoaderHTML('page')}
            </div>
        </div>
    `;

    // --- BARU: Auto-scroll sub-nav ke tab aktif ---
    try {
        const typeTabsContainer = container.querySelector('#master-data-type-tabs');
        const activeTypeTab = typeTabsContainer?.querySelector('.sub-nav-item.active');
        if (activeTypeTab) {
            // Gunakan 'nearest' untuk inline (horizontal) dan block (vertikal)
            // agar hanya scroll jika di luar layar, dan 'auto' untuk instan.
            activeTypeTab.scrollIntoView({ 
                behavior: 'auto', 
                block: 'nearest', 
                inline: 'nearest' 
            });
        }
    } catch (scrollError) {
        console.warn("Gagal auto-scroll sub-nav:", scrollError);
    }
    // --- AKHIR BARU ---

    // 4. Inisialisasi listener
    initMasterDataListeners();

    // 5. Render konten tab awal
    await renderTabContent(pageState.activeTab);

    // 6. Setup LiveQuery
    if (unsubscribeLiveQuery) unsubscribeLiveQuery.unsubscribe();
    // [PERBAIKAN] Dengarkan semua kunci master data yang mungkin
    const allStateKeys = availableTypes.map(t => masterDataConfig[t.id].stateKey);
    unsubscribeLiveQuery = liveQueryMulti(allStateKeys, (changedKeys) => {
        if (appState.activePage === 'master_data' && pageState.activeTab === 'list') {
            // Cek apakah yang berubah adalah yang sedang ditampilkan
            if (changedKeys.includes(pageState.config.stateKey)) {
                console.log(`[LiveQuery master_data] Data ${changedKeys[0]} berubah, merender ulang daftar...`);
                renderTabContent('list');
            }
        }
    });
}