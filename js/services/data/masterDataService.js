import { emit, on, off } from "../../state/eventBus.js";
import { appState } from "../../state/appState.js";
import { localDB } from "../localDbService.js";
import { db, materialsCol, professionsCol, projectsCol, staffCol, suppliersCol, workersCol, fundingCreditorsCol, opCatsCol, otherCatsCol } from "../../config/firebase.js";
import { queueOutbox } from "../outboxService.js";
import { doc, runTransaction, getDocs, setDoc, deleteDoc, addDoc, query, where, serverTimestamp, collection, updateDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { toast } from "../../ui/components/toast.js";
import { _logActivity } from "../logService.js";
import { masterDataConfig } from "../../config/constants.js";
import { isViewer, getJSDate } from "../../utils/helpers.js";
import { _safeFirestoreWrite } from "./adminService.js";
import { fetchAndCacheData } from "./fetch.js";
import { parseFormattedNumber } from "../../utils/formatters.js";
import { showDetailPane, closeDetailPaneImmediate } from "../../ui/components/modal.js";
import { createTabsHTML } from "../../ui/components/tabs.js";
import { getEmptyStateHTML } from "../../ui/components/emptyState.js";
import { _getMasterDataListHTML } from "../../ui/components/cards.js";
import { getMasterDataFormHTML, openWorkerWageDetailModal, initCustomSelects, formatNumberInput, updateCustomSelectOptions } from "../../ui/components/forms/index.js"; // [PERBAIKAN] Impor updateCustomSelectOptions
import { createMasterDataFormSkeletonHTML, createMasterDataListSkeletonHTML } from "../../ui/components/skeleton.js";
import { attachStaffFormListeners } from "../../ui/components/forms/index.js";
import { removeItemFromListWithAnimation } from "../../utils/dom.js";
import { validateForm } from "../../utils/validation.js";

function createIcon(iconName, size = 18, classes = '') {
    const icons = {
        database: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-database ${classes}"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`,
        building: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-building ${classes}"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/></svg>`,
        badge: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-badge ${classes}"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/></svg>`,
        blocks: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-blocks ${classes}"><rect width="7" height="7" x="14" y="14" rx="1"/><path d="M10.4 10.4 14 14"/><rect width="7" height="7" x="3" y="14" rx="1"/><path d="M10.4 3.6 14 7"/><rect width="7" height="7" x="14" y="3" rx="1"/><path d="M3.6 10.4 7 14"/><rect width="7" height="7" x="3" y="3" rx="1"/></svg>`,
        store: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-store ${classes}"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2V7"/><path d="M6 12v-3a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v3"/></svg>`,
        hammer: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-hammer-icon lucide-hammer"><path d="m15 12-9.373 9.373a1 1 0 0 1-3.001-3L12 9"/><path d="m18 15 4-4"/><path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5"/></svg>`,
        hard_hat: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-hard-hat-icon lucide-hard-hat"><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M14 6a6 6 0 0 1 6 6v3"/><path d="M4 15v-3a6 6 0 0 1 6-6"/><rect x="2" y="15" width="20" height="4" rx="1"/></svg>`,
        'receipt-text': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-receipt-text ${classes}"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1Z"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/></svg>`,
        boxes: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-boxes ${classes}"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/><path d="M14 15.46 21 11.73"/><path d="M3 11.73 10 15.46"/></svg>`,
        landmark: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-landmark ${classes}"><line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>`,
        lock: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-lock ${classes}"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
        pencil: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pencil ${classes}"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
        'trash-2': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2 ${classes}"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
    };
    return icons[iconName] || '';
}


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

export function openMasterDataGrid() {
    const allowedForEditor = new Set(['materials', 'suppliers', 'professions', 'workers', 'op-cats', 'other-cats', 'creditors']);
    const allowed = [ 'projects', 'staff', 'materials', 'suppliers', 'professions', 'workers', 'op-cats', 'other-cats', 'creditors' ];

    const items = allowed
        .filter(key => {
            const config = masterDataConfig[key];
            if (!config) return false;
            if (appState.userRole === 'Owner') return true;
            if (appState.userRole === 'Editor' && allowedForEditor.has(key)) return true;
            return false;
        })
        .map(key => ({
            key,
            title: masterDataConfig[key].title,
            icon: {
                projects: 'building', staff: 'badge', materials: 'blocks',
                suppliers: 'store', professions: 'hammer', workers: 'hard_hat',
                'op-cats': 'receipt-text', 'other-cats': 'boxes', creditors: 'landmark'
            }[key] || 'database'
        }));

    const gridHTML = `
        <div class="master-data-grid">
            ${items.map(it => `
                <button class="master-data-grid-item" data-action="manage-master" data-type="${it.key}">
                    <div class="icon-wrapper">${createIcon(it.icon, 24)}</div>
                    <span class="label">${it.title}</span>
                </button>
            `).join('')}
        </div>
    `;

    showDetailPane({
        title: 'Kelola Master Data',
        content: gridHTML,
        isMasterDataGrid: true
    });
}


export async function handleManageMasterData(type, options = {}) {

    const config = masterDataConfig[type];
    if (!config) return;

    const { itemId = null, fromList = false, justSaved = false } = options;
    let { activeTab = 'list' } = options;

    if (itemId) activeTab = 'form';

    const title = `Kelola ${config.title}`;
    const tabs = [
        { id: 'list', label: 'Daftar Data' },
        { id: 'form', label: itemId ? 'Edit Data' : 'Input Baru' }
    ];

    const content = `
        ${createTabsHTML({ id: 'master-data-tabs', tabs, activeTab, customClasses: 'tabs-underline two-tabs' })}
        <div id="master-data-content" class="scrollable-content">
        </div>
    `;

    // --- PERBAIKAN 1: Dihapus ---
    // Baris ini salah dan menghapus riwayat panel induk
    // if (activeTab === 'list' && justSaved) {
    //     appState.detailPaneHistory = [];
    // }
    // --- AKHIR PERBAIKAN 1 ---

    showDetailPane({
        title,
        content,
        footer: '',
        paneType: `master-data-${type}`
    });

    const detailPane = document.getElementById('detail-pane');
    const contentContainer = detailPane.querySelector('#master-data-content');
    const tabsContainer = detailPane.querySelector('#master-data-tabs');
    let isFormDirty = false;
    let currentItemId = itemId;


    let formUpdateListener = null;

    const renderTabContent = async (tabId, currentItemIdForRender) => {

        if (formUpdateListener) {
             off('masterData.updated', formUpdateListener);
             formUpdateListener = null;
        }

        contentContainer.classList.toggle('has-sticky-footer', tabId === 'form');

        const editorRestricted = (appState.userRole === 'Editor' && !['materials', 'suppliers', 'professions', 'workers', 'op-cats', 'other-cats', 'creditors'].includes(type));

        if (tabId === 'form' && editorRestricted) {
            contentContainer.innerHTML = getEmptyStateHTML({
                icon: 'lock',
                title: 'Akses Dibatasi',
                desc: 'Hanya Owner yang dapat menambah atau mengedit data master ini.'
            });
            return;
        }

        if (tabId === 'list') {
            contentContainer.innerHTML = createMasterDataListSkeletonHTML();
            await fetchAndCacheData(config.stateKey, COLLECTIONS[type], config.nameField);
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
        } else {
            contentContainer.innerHTML = createMasterDataFormSkeletonHTML();
            let itemData = null;

            if (type === 'workers') {
                await fetchAndCacheData('professions', professionsCol, 'professionName');
                await fetchAndCacheData('projects', projectsCol, 'projectName');
            }

            if (currentItemIdForRender) {
                await fetchAndCacheData(config.stateKey, COLLECTIONS[type], config.nameField);
                itemData = (appState[config.stateKey] || []).find(i => i.id === currentItemIdForRender);
            }
            contentContainer.innerHTML = await getMasterDataFormHTML(type, itemData);

            initCustomSelects(contentContainer);


            contentContainer.querySelectorAll('input[inputmode="numeric"]').forEach(input => {
                input.addEventListener('input', formatNumberInput);
            });

            const form = contentContainer.querySelector('#master-data-form');
            if (form) {
                isFormDirty = false;
                const dirtyListener = () => { isFormDirty = true; };
                form.addEventListener('input', dirtyListener);
                form.addEventListener('change', dirtyListener);
            }

            if(type === 'staff') {
                attachStaffFormListeners(contentContainer);
            }

            emit('ui.forms.init', contentContainer);

            // [PERBAIKAN] Pasang listener untuk update dropdown
            if (detailPane.__controller && detailPane.__controller.signal) {
                on('masterData.updated', (updateData) => {
                    if (!updateData || !updateData.type) return;
                    // Panggil helper update dropdown yang baru
                    console.log(`[Master Panel] Master data '${updateData.type}' diperbarui. Memperbarui dropdown...`);
                    updateCustomSelectOptions(contentContainer, updateData.type);
                }, { signal: detailPane.__controller.signal });
            }
        }
    };

    contentContainer.addEventListener('click', e => {
        const target = e.target.closest('[data-action]');
        if(!target) return;
        const action = target.dataset.action;

        if(action === 'add-worker-wage' || action === 'edit-worker-wage') {
            const form = target.closest('form');
            if (!form) return;
            const list = form.querySelector('#worker-wages-summary-list');
            if (!list) return;

            const existingWages = {};
            list.querySelectorAll('.worker-wage-summary-item').forEach(it => {
                const pid = it.dataset.projectId;
                try { existingWages[pid] = JSON.parse(it.dataset.wages || '{}'); } catch { existingWages[pid] = {}; }
            });

            const editingItem = action === 'edit-worker-wage' ? target.closest('.worker-wage-summary-item') : null;
            const editProjectId = editingItem ? editingItem.dataset.projectId : null;

            const onSave = ({ projectId, roles }) => {
                const project = appState.projects.find(p => p.id === projectId);
                const rolesHTML = Object.entries(roles).map(([name, wage]) => `<span class="badge">${name}: ${new Intl.NumberFormat('id-ID').format(wage)}</span>`).join(' ');
                const markup = `
                    <div class="worker-wage-summary-item" data-project-id="${projectId}" data-wages='${JSON.stringify(roles)}'>
                      <div class="dense-list-item">
                        <div class="item-main-content">
                            <strong class="item-title">${project?.projectName || 'Proyek'}</strong>
                            <div class="item-sub-content role-summary">${rolesHTML}</div>
                        </div>
                        <div class="item-actions">
                          <button type="button" class="btn-icon" title="Edit" data-action="edit-worker-wage">${createIcon('pencil')}</button>
                          <button type="button" class="btn-icon btn-icon-danger" title="Hapus" data-action="remove-worker-wage">${createIcon('trash-2')}</button>
                        </div>
                      </div>
                    </div>`;

                const existingEl = list.querySelector(`.worker-wage-summary-item[data-project-id="${projectId}"]`);
                if (existingEl) existingEl.outerHTML = markup;
                else list.insertAdjacentHTML('beforeend', markup);

                const empty = list.querySelector('.empty-state-small');
                if (empty) empty.remove();
                isFormDirty = true;
            };

            openWorkerWageDetailModal({ projectId: editProjectId, existingWages, onSave });
        }
        else if (action === 'edit-master-item' || action === 'delete-master-item') {
             const itemWrapper = target.closest('.wa-card-v2-wrapper');
             if (itemWrapper) {
                 const idFromWrapper = itemWrapper.dataset.itemId;
                 const typeFromWrapper = itemWrapper.dataset.type;
                 if (idFromWrapper && typeFromWrapper) {
                     if (action === 'edit-master-item') {
                         handleEditMasterItem(idFromWrapper, typeFromWrapper);
                     } else {
                         handleDeleteMasterItem(idFromWrapper, typeFromWrapper);
                     }
                 }
             }
        }
    });

    tabsContainer.addEventListener('click', (e) => {
        const tabButton = e.target.closest('.sub-nav-item');
        if (tabButton && !tabButton.classList.contains('active')) {
            const newTabId = tabButton.dataset.tab;
            const currentTabId = tabsContainer.querySelector('.active')?.dataset.tab;

            const proceed = () => {
                tabsContainer.querySelector('.active')?.classList.remove('active');
                tabButton.classList.add('active');
                const formTab = tabsContainer.querySelector('[data-tab="form"]');
                if (formTab) formTab.textContent = 'Input Baru';

                if (newTabId === 'list') {
                     currentItemId = null;
                     // --- PERBAIKAN 2: Dihapus ---
                     // Baris ini salah dan menghapus riwayat panel induk
                     // appState.detailPaneHistory = [];
                     // --- AKHIR PERBAIKAN 2 ---
                }

                renderTabContent(newTabId, currentItemId);
            };

            if (currentTabId === 'form' && isFormDirty) {
                emit('ui.modal.create', 'confirmUserAction', {
                    title: 'Batalkan Perubahan?',
                    message: 'Perubahan yang belum disimpan akan hilang. Anda yakin ingin kembali ke daftar?',
                    onConfirm: proceed,
                });
            } else {
                proceed();
            }
        }
    });

    await renderTabContent(activeTab, currentItemId);

     const originalCloseHandler = detailPane.dataset.closeHandlerAttached;
     if (originalCloseHandler) {

         off('detailPane.closing', originalCloseHandler);
     }
     const newCloseHandler = () => {
        if (formUpdateListener) {
            off('masterData.updated', formUpdateListener);
            formUpdateListener = null;
        }
     };
     detailPane.dataset.closeHandlerAttached = newCloseHandler;
     on('detailPane.closing', newCloseHandler);
}



export async function handleAddMasterItem(form) {

    if (!validateForm(form)) {

        toast('error', 'Harap periksa kembali isian Anda, semua field wajib diisi.');
        return false;
    }
    const type = form.dataset.type;
    const config = masterDataConfig[type];
    const itemName = form.elements.itemName.value.trim();
    if (!config || !itemName) {

        return false;
    }


    emit('ui.modal.create', 'confirmUserAction', {
        title: `Simpan ${config.title} Baru?`,
        message: `Anda akan menyimpan data baru: <strong>${itemName}</strong>. Lanjutkan?`,
        onConfirm: async () => {

            const loadingToast = toast('syncing', `Menyimpan ${config.title}...`, 0, { forceSnackbar: true });

            const dataToAdd = {
                [config.nameField]: itemName,
                notes: form.elements.notes.value.trim(),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                isDeleted: 0
            };

            if (type === 'staff') {
                dataToAdd.paymentType = form.elements.paymentType.value;
                dataToAdd.salary = parseFormattedNumber(form.elements.salary.value) || 0;
                dataToAdd.feePercentage = Number(form.elements.feePercentage.value) || 0;
                dataToAdd.feeAmount = parseFormattedNumber(form.elements.feeAmount.value) || 0;
            }
            if (type === 'suppliers') { dataToAdd.category = form.elements.itemCategory.value; }
            if (type === 'projects') {
                dataToAdd.projectType = form.elements.projectType.value;
                dataToAdd.budget = parseFormattedNumber(form.elements.budget.value);
                dataToAdd.isWageAssignable = form.elements.isWageAssignable.checked;
            }
            if (type === 'materials') {
                dataToAdd.unit = form.elements.itemUnit.value.trim();
                const reorderPoint = Number(form.elements.reorderPoint.value);
                if(reorderPoint < 0) {
                    toast('error', 'Jumlah pembelian minimal tidak boleh negatif.');
                    if (loadingToast && typeof loadingToast.close === 'function') loadingToast.close();
                    return;
                }
                dataToAdd.reorderPoint = reorderPoint;
            }
            if (type === 'workers') {
                dataToAdd.professionId = form.elements.professionId.value;
                dataToAdd.status = form.elements.workerStatus.value;
                const projectWages = {};
                form.querySelectorAll('.worker-wage-summary-item').forEach(itemEl => {
                    const projectId = itemEl.dataset.projectId;
                    try {
                        const wages = JSON.parse(itemEl.dataset.wages);
                        if (projectId && wages) {
                            projectWages[projectId] = wages;
                        }
                    } catch(e) { console.error('Gagal parsing data upah');}
                });
                dataToAdd.projectWages = projectWages;
            }

            const collectionRef = COLLECTIONS[type];
            const newDocRef = doc(collection(db, collectionRef.path));
            dataToAdd.id = newDocRef.id;


            const writeOperation = async () => {
                 await setDoc(newDocRef, dataToAdd);
            };

            const success = await _safeFirestoreWrite(
                writeOperation,
                '',
                `Gagal menambah ${config.title}.`
            );

            if (loadingToast && typeof loadingToast.close === 'function') {
                loadingToast.close();
            }

            if (success) {
                await localDB[config.dbTable].put({ ...dataToAdd, createdAt: new Date(), updatedAt: new Date(), syncState: 'synced' });
                _logActivity(`Menambah Master Data: ${config.title}`, { name: itemName });
                emit('masterData.updated', { type });
                handleManageMasterData(type, { activeTab: 'list', justSaved: true });
                toast('success', `${config.title} baru berhasil ditambahkan.`);
            } else {
                // Offline fallback: store locally and queue for sync
                const localDoc = { ...dataToAdd, createdAt: new Date(), updatedAt: new Date(), syncState: 'pending_create' };
                await localDB[config.dbTable].put(localDoc);
                try { await queueOutbox({ table: config.dbTable, docId: dataToAdd.id, op: 'upsert', payload: localDoc, priority: 6 }); } catch(_) {}
                emit('masterData.updated', { type });
                handleManageMasterData(type, { activeTab: 'list', justSaved: true });
                toast('info', `${config.title} disimpan offline dan akan disinkronkan.`);
            }
        }
    });
}

export async function handleDeleteMasterItem(id, type) {
    const config = masterDataConfig[type];
    if (!config) return;

    await fetchAndCacheData(config.stateKey, COLLECTIONS[type], config.nameField);
    const item = (appState[config.stateKey] || []).find(i => i.id === id);

    if (!item) {
        toast('error', 'Item tidak ditemukan.');
        return;
    }

    emit('ui.modal.create', 'confirmDelete', {
        message: `Anda yakin ingin memindahkan ${config.title} "<strong>${item[config.nameField]}</strong>" ke Sampah? Data ini dapat dipulihkan nanti.`,
        onConfirm: async () => {
            const itemElement = document.querySelector(`.wa-card-v2-wrapper[data-item-id='${id}']`);
            const loadingToast = toast('syncing', 'Memindahkan ke Sampah...', 0);

            const writeOperation = () => updateDoc(doc(COLLECTIONS[type], id), {
                isDeleted: 1,
                updatedAt: serverTimestamp()
            });

            const success = await _safeFirestoreWrite(writeOperation, '', `Gagal menghapus ${config.title}.`);

            if (loadingToast && typeof loadingToast.close === 'function') await loadingToast.close();

            if (success) {
                const originalItem = await localDB[config.dbTable].get(id);
                await localDB[config.dbTable].update(id, { isDeleted: 1, syncState: 'synced' });
                _logActivity(`Memindahkan Master Data ke Sampah: ${config.title}`, { docId: id, name: item[config.nameField] });

                if (itemElement) removeItemFromListWithAnimation(itemElement.dataset.id);
                emit('masterData.updated', { type });

                toast('info', `${config.title} dipindahkan ke Sampah.`, 6000, {
                    actionText: 'Urungkan',
                    onAction: async () => {
                        const undoToast = toast('syncing', 'Mengembalikan...');
                        try {
                            if (originalItem) await localDB[config.dbTable].put(originalItem);
                            await _safeFirestoreWrite(() => updateDoc(doc(COLLECTIONS[type], id), { isDeleted: 0, updatedAt: serverTimestamp() }), '', 'Gagal mengurungkan.');
                            if(undoToast.close) undoToast.close();
                            emit('masterData.updated', { type });
                            handleManageMasterData(type, { activeTab: 'list' });
                            toast('success', 'Aksi dibatalkan.');
                        } catch (e) {
                            if(undoToast.close) undoToast.close();
                            toast('error', 'Gagal mengurungkan aksi.');
                        }
                    }
                });
                setTimeout(() => {
                    const itemIndex = (appState[config.stateKey] || []).findIndex(i => i.id === id);
                    if (itemIndex > -1) appState[config.stateKey].splice(itemIndex, 1);
                    const listContainer = document.querySelector('.wa-card-list-wrapper.master-data-list');
                    if (listContainer && listContainer.children.length === 0) {
                        listContainer.innerHTML = getEmptyStateHTML({
                            icon: 'database',
                            title: `Data ${config.title} Kosong`,
                            desc: `Anda bisa menambahkan data baru melalui tab 'Input Baru'.`
                        });
                    }
                }, 500);
            } else {
                // Offline fallback: soft-delete locally and queue
                const originalItem = await localDB[config.dbTable].get(id);
                await localDB[config.dbTable].update(id, { isDeleted: 1, syncState: 'pending_update', updatedAt: new Date() });
                try { await queueOutbox({ table: config.dbTable, docId: id, op: 'upsert', payload: { id, isDeleted: 1, updatedAt: new Date() }, priority: 5 }); } catch(_) {}
                emit('masterData.updated', { type });
                handleManageMasterData(type, { activeTab: 'list' });
                toast('info', `${config.title} ditandai terhapus (offline). Akan disinkronkan.`);
            }
        }
    });
}


export async function handleEditMasterItem(id, type) {
    handleManageMasterData(type, { itemId: id, activeTab: 'form' });
}

export async function handleUpdateMasterItem(form) {

    if (!validateForm(form)) {

        toast('error', 'Harap periksa kembali isian Anda, semua field wajib diisi.');
        return false;
    }
    const { id, type } = form.dataset;
    const config = masterDataConfig[type];
    if (!config) {

        return false;
    }

    const newName = form.elements.itemName.value.trim();
    if (!newName) {

        return false;
    }


    emit('ui.modal.create', 'confirmEdit', {
        message: `Anda yakin ingin menyimpan perubahan pada <strong>${newName}</strong>?`,
        onConfirm: async () => {

            const loadingToast = toast('syncing', 'Memperbarui...', 0, { forceSnackbar: true });

            let dataToUpdate = {
                [config.nameField]: newName,
                notes: form.elements.notes.value.trim()
            };

            if (type === 'staff') {
                dataToUpdate.paymentType = form.elements.paymentType.value;
                dataToUpdate.salary = parseFormattedNumber(form.elements.salary.value) || 0;
                dataToUpdate.feePercentage = Number(form.elements.feePercentage.value) || 0;
                dataToUpdate.feeAmount = parseFormattedNumber(form.elements.feeAmount.value) || 0;
            }
            if (type === 'suppliers') { dataToUpdate.category = form.elements.itemCategory.value; }
            if (type === 'projects') {
                dataToUpdate.projectType = form.elements.projectType.value;
                dataToUpdate.budget = parseFormattedNumber(form.elements.budget.value);
                dataToUpdate.isWageAssignable = form.elements.isWageAssignable.checked;
            }
            if (type === 'materials') {
                dataToUpdate.unit = form.elements.itemUnit.value.trim();
                const reorderPoint = Number(form.elements.reorderPoint.value);
                if(reorderPoint < 0) {
                    toast('error', 'Jumlah pembelian minimal tidak boleh negatif.');
                    if (loadingToast && typeof loadingToast.close === 'function') loadingToast.close();
                    return;
                }
                dataToUpdate.reorderPoint = reorderPoint;
            }
            if (type === 'workers') {
                dataToUpdate.professionId = form.elements.professionId.value;
                dataToUpdate.status = form.elements.workerStatus.value;
                const projectWages = {};
                form.querySelectorAll('.worker-wage-summary-item').forEach(itemEl => {
                    const projectId = itemEl.dataset.projectId;
                     try {
                        const wages = JSON.parse(itemEl.dataset.wages);
                        if (projectId && wages) {
                            projectWages[projectId] = wages;
                        }
                    } catch(e) { console.error('Gagal parsing data upah');}
                });
                dataToUpdate.projectWages = projectWages;
            }


            const collectionRef = COLLECTIONS[type];
            const writeOperation = async () => {
                await runTransaction(db, async (transaction) => {
                    const docRef = doc(collectionRef, id);
                    const serverSnap = await transaction.get(docRef);
                    if (!serverSnap.exists()) throw new Error("Data tidak ditemukan di server.");
                    const serverData = serverSnap.data();
                    transaction.update(docRef, { ...dataToUpdate, rev: (serverData.rev || 0) + 1, updatedAt: serverTimestamp() });
                });
            };

            const success = await _safeFirestoreWrite(
                writeOperation,
                '',
                `Gagal memperbarui ${config.title}.`
            );

            if (loadingToast && typeof loadingToast.close === 'function') {
                loadingToast.close();
            }

            if (success) {
                await fetchAndCacheData(config.stateKey, collectionRef, config.nameField);
                _logActivity(`Memperbarui Master: ${config.title}`, { docId: id });
                emit('masterData.updated', { type });
                handleManageMasterData(type, { activeTab: 'list', justSaved: true });
                toast('success', `Data ${config.title} berhasil diperbarui.`);
            } else {
                // Offline fallback: update locally and queue
                const localUpdate = { ...dataToUpdate, updatedAt: new Date(), syncState: 'pending_update' };
                await localDB[config.dbTable].update(id, localUpdate);
                try { await queueOutbox({ table: config.dbTable, docId: id, op: 'upsert', payload: { id, ...localUpdate }, priority: 6 }); } catch(_) {}
                emit('masterData.updated', { type });
                handleManageMasterData(type, { activeTab: 'list', justSaved: true });
                toast('info', `${config.title} diperbarui offline. Akan disinkronkan.`);
            }
        }
    });
}

export async function _saveNewMasterMaterial(data) {
    try {
        const collectionRef = collection(db, 'teams', TEAM_ID, 'materials');
        const docRef = doc(collectionRef);
        const newMaterialData = {
            id: docRef.id,
            materialName: data.name,
            unit: data.unit,
            currentStock: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            isDeleted: 0,
            usageCount: 0,
            reorderPoint: 0
        };

        await setDoc(docRef, newMaterialData);

        return {
            id: newMaterialData.id,
            materialName: newMaterialData.materialName,
            unit: newMaterialData.unit
        };
    } catch (error) {

        toast('error', 'Gagal menyimpan data baru.');
        return null;
    }
}