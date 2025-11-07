import { appState } from '../../state/appState.js';
import { $ } from '../../utils/dom.js';
import { createPageToolbarHTML } from '../components/toolbar.js';
import { createTabsHTML } from '../components/tabs.js';
import { getFormPengeluaranHTML, getFormFakturMaterialHTML, attachPengeluaranFormListeners, initCustomSelects } from '../components/forms/index.js'; // Import initCustomSelects
import { emit, on, off } from '../../state/eventBus.js';
import { liveQueryMulti } from '../../state/liveQuery.js';
import { fetchAndCacheData } from '../../services/data/fetch.js';
import { projectsCol, suppliersCol, opCatsCol, otherCatsCol, materialsCol } from '../../config/firebase.js';
import { initPullToRefresh, destroyPullToRefresh } from "../components/pullToRefresh.js";
import { showLoadingModal, hideLoadingModal } from "../components/modal.js";

function updateFormDropdowns(form, activeTab) {
    console.log(`[Pengeluaran] Memperbarui dropdown untuk form tab: ${activeTab}`);
    
    const getSafeOptions = (data, valueField, textField) => {
        const list = (data || []).filter(item => !item.isDeleted).map(item => ({ value: item[valueField], text: item[textField] }));
        return list;
    };

    /**
     * Menemukan wrapper <custom-select> berdasarkan master-type
     * dan membangun ulang HANYA daftar opsinya.
     */
    const updateSelect = (masterType, options) => {
        const wrappers = form.querySelectorAll(`.custom-select-wrapper[data-master-type="${masterType}"]`);
        wrappers.forEach(wrapper => {
            const list = wrapper.querySelector('.custom-select-options-list');
            const currentVal = wrapper.querySelector('input[type="hidden"]')?.value;
            const currentText = wrapper.querySelector('.custom-select-trigger span')?.textContent || 'Pilih...';
            
            if (list) {
                // Bangun ulang daftar opsi
                list.innerHTML = options.map(opt => 
                    `<div class="custom-select-option ${opt.value === currentVal ? 'selected' : ''}" data-value="${opt.value}" ${opt.disabled ? 'disabled' : ''}>${opt.text}</div>`
                ).join('');
            }

            // [PENTING] Jika item yang baru ditambahkan adalah yang sedang dipilih,
            // perbarui teks trigger secara manual.
            if (currentVal && !options.some(opt => opt.value === currentVal)) {
                // Item yang dipilih mungkin telah dihapus, reset
                wrapper.querySelector('input[type="hidden"]').value = '';
                wrapper.querySelector('.custom-select-trigger span').textContent = 'Pilih...';
            } else if (currentVal) {
                // Perbarui teks jika berubah
                const selectedOpt = options.find(opt => opt.value === currentVal);
                if (selectedOpt && wrapper.querySelector('.custom-select-trigger span').textContent !== selectedOpt.text) {
                     wrapper.querySelector('.custom-select-trigger span').textContent = selectedOpt.text;
                }
            }
        });
    };

    // Selalu update proyek
    const projectOptions = getSafeOptions(appState.projects, 'id', 'projectName');
    updateSelect('projects', projectOptions);

    if (activeTab === 'material') {
        // Update material & supplier material
        const materialOptions = getSafeOptions(appState.materials, 'id', 'materialName');
        updateSelect('materials', materialOptions);
        
        const supplierOptions = getSafeOptions((appState.suppliers || []).filter(s => s.category === 'Material'), 'id', 'supplierName');
        updateSelect('suppliers', supplierOptions);

    } else {
        // Update operasional atau lainnya
        const isOperasional = activeTab === 'operasional';
        const categories = isOperasional ? appState.operationalCategories : appState.otherCategories;
        const supplierCategory = isOperasional ? 'Operasional' : 'Lainnya';
        const masterType = isOperasional ? 'op-cats' : 'other-cats';

        const categoryOptions = getSafeOptions(categories, 'id', 'categoryName');
        const supplierOptions = getSafeOptions((appState.suppliers || []).filter(s => s.category === supplierCategory), 'id', 'supplierName');
        
        updateSelect(masterType, categoryOptions);
        updateSelect('suppliers', supplierOptions);
    }
}


async function renderPengeluaranContent() {
    const container = $('#sub-page-content');
    if (!container) return;

    const activeTab = appState.activeSubPage.get('pengeluaran') || 'operasional';
    
    // --- [PERBAIKAN] Cek apakah form sudah ada ---
    const existingForm = container.querySelector('#pengeluaran-form, #material-invoice-form');
    
    // Selalu fetch data master terbaru
    await Promise.all([
        fetchAndCacheData('projects', projectsCol, 'projectName'),
        fetchAndCacheData('suppliers', suppliersCol, 'supplierName'),
        fetchAndCacheData('operationalCategories', opCatsCol, 'categoryName'),
        fetchAndCacheData('otherCategories', otherCatsCol, 'categoryName'),
        fetchAndCacheData('materials', materialsCol, 'materialName'),
    ]);

    // Jika form sudah ada DAN tab-nya sama, jangan render ulang. Cukup update dropdown.
    if (existingForm && existingForm.dataset.type === activeTab) {
        console.log("[Pengeluaran] Form sudah ada, hanya memperbarui dropdown.");
        updateFormDropdowns(existingForm, activeTab);
        return; // Hentikan eksekusi agar form tidak di-reset
    }
    
    // --- [AKHIR PERBAIKAN] ---
    
    // Jika form belum ada atau tab berubah, render ulang seluruh konten
    console.log("[Pengeluaran] Merender ulang konten form penuh.");
    let formHTML = '';

    const getSafeOptions = (data, valueField, textField) => {
        const list = (data || []).filter(item => !item.isDeleted).map(item => ({ value: item[valueField], text: item[textField] }));
        return list;
    };

    if (activeTab === 'material') {
        formHTML = getFormFakturMaterialHTML();
    } else {
        const isOperasional = activeTab === 'operasional';

        const categories = isOperasional ? appState.operationalCategories : appState.otherCategories;
        const supplierCategory = activeTab === 'operasional' ? 'Operasional' : 'Lainnya';
        const suppliers = appState.suppliers || []; // Pastikan suppliers adalah array
        const projects = appState.projects || []; // Pastikan projects adalah array

        const categoryLabel = isOperasional ? 'Kategori Operasional' : 'Kategori Lainnya';
        const masterType = isOperasional ? 'op-cats' : 'other-cats';

        const categoryOptions = getSafeOptions(categories, 'id', 'categoryName');
        const supplierOptions = getSafeOptions(suppliers.filter(s => s.category === supplierCategory), 'id', 'supplierName');
        const projectOptions = getSafeOptions(projects, 'id', 'projectName');

        formHTML = getFormPengeluaranHTML(activeTab, categoryOptions, masterType, categoryLabel, supplierOptions, projectOptions);
    }

    container.innerHTML = formHTML;

    if (activeTab === 'material') {
        attachPengeluaranFormListeners('material', container);
    } else {
        attachPengeluaranFormListeners(activeTab, container);
    }

    emit('ui.forms.init', container);
}

function initPengeluaranPage() {
    destroyPullToRefresh();
    const container = $('.page-container');

    const tabsData = [
        { id: 'operasional', label: 'Operasional' },
        { id: 'material', label: 'Faktur Material' },
        { id: 'lainnya', label: 'Lainnya' },
    ];
    const activeTab = appState.activeSubPage.get('pengeluaran') || 'operasional';
    appState.activeSubPage.set('pengeluaran', activeTab);

    const tabsHTML = createTabsHTML({
        id: 'pengeluaran-tabs',
        tabs: tabsData,
        activeTab: activeTab,
        customClasses: 'tabs-underline three-tabs'
    });

    container.innerHTML = `
        <div class="content-panel">
            <div class="panel-header">
                ${createPageToolbarHTML({ title: 'Input Pengeluaran' })}
                ${tabsHTML}
            </div>
            <div id="sub-page-content" class="panel-body scrollable-content"></div>
        </div>
    `;

    const tabsContainer = container.querySelector('#pengeluaran-tabs');
    if (tabsContainer) {
        tabsContainer.addEventListener('click', (e) => {
            const tabButton = e.target.closest('.sub-nav-item');
            if (tabButton && !tabButton.classList.contains('active')) {
                const currentActive = tabsContainer.querySelector('.sub-nav-item.active');
                if(currentActive) currentActive.classList.remove('active');
                tabButton.classList.add('active');
                appState.activeSubPage.set('pengeluaran', tabButton.dataset.tab);
                renderPengeluaranContent();
            }
        });
    }
    initPullToRefresh({
        triggerElement: '.panel-header', // Area statis di atas
        scrollElement: '#sub-page-content',  // Konten yang di-scroll
        indicatorContainer: '#ptr-indicator-container', // Target dari index.html
        
        onRefresh: async () => {
            showLoadingModal('Memperbarui pengeluaran...');
            try {
                await renderPengeluaranContent();

            } catch (err) {
                console.error("PTR Error (Pengeluaran):", err);
                emit('ui.toast', { message: 'Gagal memperbarui pengeluaran', type: 'error' });
            } finally {
                hideLoadingModal();
            }
        }
    });
    renderPengeluaranContent();

    // Listener ini sekarang aman karena renderPengeluaranContent tidak merusak form
    on('masterData.updated', renderPengeluaranContent);

    try {
        if (initPengeluaranPage._live) { initPengeluaranPage._live.unsubscribe?.(); initPengeluaranPage._live = null; }
        
        initPengeluaranPage._live = liveQueryMulti(['expenses','projects','suppliers','materials','operationalCategories','otherCategories'], (changedKeys) => {
            // Hanya trigger jika key yang relevan berubah
            const relevantKeys = ['projects', 'suppliers', 'materials', 'operationalCategories', 'otherCategories'];
            if (appState.activePage === 'pengeluaran' && changedKeys.some(k => relevantKeys.includes(k))) {
                renderPengeluaranContent();
            }
        });
    } catch (_) {}
}
on('app.unload.pengeluaran', () => { 
    // [PERBAIKAN] Hapus juga listener 'masterData.updated' saat unload
    off('masterData.updated', renderPengeluaranContent);
    try { 
        if (initPengeluaranPage._live) { 
            initPengeluaranPage._live.unsubscribe?.(); 
            initPengeluaranPage._live = null; 
        } 
    } catch(_) {} 
});

export { initPengeluaranPage };