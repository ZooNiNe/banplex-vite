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
    attachStaffFormListeners,
    _createWorkerWageSummaryItemHTML,
    openWorkerWageDetailModal
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
import { getPendingQuotaMaps } from '../../services/pendingQuotaService.js';

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
        const pendingMaps = await getPendingQuotaMaps([config.dbTable || config.stateKey || type]);
        const pendingMap = pendingMaps.get(config.dbTable || config.stateKey || type) || new Map();

        if (items.filter(item => !item.isDeleted).length > 0) {
             contentContainer.innerHTML = `<div class="wa-card-list-wrapper master-data-list">${_getMasterDataListHTML(type, items, config, { pendingMap })}</div>`;
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

        if (pageEventListenerController?.signal) {
            pageState.formUpdateListener = (updateData) => {
                if (!updateData || !updateData.type) return;
                
                if (updateData.type === pageState.type && pageState.activeTab === 'form') {
                    console.log(`[Master Page] Form data '${updateData.type}' telah disimpan. Mereset form dirty state.`);
                    resetFormDirty();
                }

                console.log(`[Master Page] Master data '${updateData.type}' diperbarui. Memperbarui dropdown...`);
                updateCustomSelectOptions(contentContainer, updateData.type);
            };
            on('masterData.updated', pageState.formUpdateListener, { signal: pageEventListenerController.signal });
        }
    }
}

function initMasterDataListeners() {
    if (pageEventListenerController) pageEventListenerController.abort();
    pageEventListenerController = new AbortController();
    const { signal } = pageEventListenerController;

    const container = $('.page-container'); 
    const typeTabsContainer = container?.querySelector('#master-data-type-tabs'); 
    const formTabsContainer = container?.querySelector('#master-data-tabs'); 

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
                typeTabsContainer.querySelector('.active')?.classList.remove('active');
                tabButton.classList.add('active');
                pageState.type = newType;
                pageState.config = newConfig;
                pageState.currentItemId = null;
                pageState.activeTab = 'list';
                const formTab = formTabsContainer?.querySelector('[data-tab="form"]');
                if (formTab) formTab.textContent = 'Input Baru';
                formTabsContainer?.querySelector('.active')?.classList.remove('active');
                formTabsContainer?.querySelector('[data-tab="list"]')?.classList.add('active');
                resetFormDirty();
                renderTabContent('list');
            };

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

    formTabsContainer?.addEventListener('click', (e) => {
        const tabButton = e.target.closest('.sub-nav-item');
        if (tabButton && !tabButton.classList.contains('active')) {
            const newTabId = tabButton.dataset.tab; 
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
    on('ui.action.edit-master-item', (context) => {
        if (appState.activePage !== 'master_data' || !context.itemId || context.type !== pageState.type) {
            return;
        }

        const { itemId } = context;
        pageState.currentItemId = itemId;
        
        const formTab = formTabsContainer?.querySelector('[data-tab="form"]');
        if (formTab) {
            formTab.textContent = 'Edit Data';
            if (!formTab.classList.contains('active')) {
                formTabsContainer?.querySelector('[data-tab="list"]')?.classList.remove('active');
                formTab.classList.add('active');
                renderTabContent('form'); 
            } else {
                renderTabContent('form');
            }
        }

    }, { signal });
    on('ui.form.markDirty', (isDirty) => {
        pageState.isDirty = isDirty; // <-- Ganti nama state ini jika perlu
    }, { signal });

    on('app.unload.master_data', () => {
        if (pageAbortController) pageAbortController.abort();
        if (pageEventListenerController) pageEventListenerController.abort();
        if (unsubscribeLiveQuery) unsubscribeLiveQuery.unsubscribe();
        if (pageState.formUpdateListener) off('masterData.updated', pageState.formUpdateListener);
        
        pageAbortController = null;
        pageEventListenerController = null;
        unsubscribeLiveQuery = null;
        pageState.formUpdateListener = null;

        pageState.type = null; 
        
        off('app.unload.master_data');
    }, { signal });
}

export async function initMasterDataPage() {
    const request = appState.masterDataOpenRequest || {};
    appState.masterDataOpenRequest = null; // Hapus request setelah dibaca

    const availableTypes = getAvailableMasterTypes();
    const defaultType = availableTypes.length > 0 ? availableTypes[0].id : '';


        let type, itemId, activeFormTab, config;
    
        if (request.type) {
            type = request.type;
            itemId = request.itemId || null;
            activeFormTab = request.activeTab || (itemId ? 'form' : 'list'); // <--- INI FIX-NYA
        } else {
            type = pageState.type || defaultType; // Gunakan state terakhir atau default
            itemId = null; // Selalu reset item ID
            activeFormTab = 'list'; // Selalu default ke 'list'
        }
    
        config = masterDataConfig[type];
        
        if (!config) {
            console.error(`[MasterDataPage] Konfigurasi tidak valid untuk tipe: ${type}. Mengalihkan ke 'pengaturan'.`);
             
             const container = $('.page-container');
             if (container) {          
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
    pageState.type = type;
    pageState.config = config;
    pageState.currentItemId = itemId;
    pageState.activeTab = activeFormTab;
    pageState.isFormDirty = false;

    const container = $('.page-container');
    const title = `Kelola Master Data`; // Judul generik

    const masterTypeNavHTML = createTabsHTML({
        id: 'master-data-type-tabs', // ID baru untuk sub-nav
        tabs: availableTypes,
        activeTab: type, // Tab aktif adalah tipe data (e.g., 'projects')
        customClasses: 'category-sub-nav' // Gunakan style yang bisa di-scroll
    });
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
