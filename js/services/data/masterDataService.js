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
import { showDetailPane, closeDetailPaneImmediate, closeModalImmediate, startGlobalLoading } from "../../ui/components/modal.js";
import { createTabsHTML } from "../../ui/components/tabs.js";
import { getEmptyStateHTML } from "../../ui/components/emptyState.js";
import { _getMasterDataListHTML } from "../../ui/components/cards.js";
import { getMasterDataFormHTML, openWorkerWageDetailModal, initCustomSelects, formatNumberInput, updateCustomSelectOptions } from "../../ui/components/forms/index.js";
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
    if (!type || !masterDataConfig[type]) {
        console.error(`[handleManageMasterData] Tipe master data tidak valid: ${type}`);
        toast('error', 'Tipe master data tidak dikenal.');
        return;
    }

    const { itemId = null, activeTab = 'list' } = options;

    appState.masterDataOpenRequest = {
        type: type,
        itemId: itemId,
        activeTab: itemId ? 'form' : activeTab,
    };

    const currentModal = document.querySelector('.modal-bg.show');
    if (currentModal) {
        emit('ui.modal.closeImmediate', currentModal);
    }

    // [PERBAIKAN] Tambahkan pengecekan dan penutupan untuk Detail Pane
    // Kita panggil 'closeAllModals' agar mencakup panel mobile dan desktop
    const detailPane = document.getElementById('detail-pane');
    const isMobileDetailOpen = document.body.classList.contains('detail-view-active');
    if (detailPane && (detailPane.classList.contains('detail-pane-open') || isMobileDetailOpen)) {
        emit('ui.modal.closeAll');
    }
    // [AKHIR PERBAIKAN]
    
    setTimeout(() => {
        emit('ui.navigate', 'master_data');
    }, 50);
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
            const loader = startGlobalLoading(`Menyimpan ${config.title}...`);
            try {
                const dataToAdd = {
                    [config.nameField]: itemName,
                    notes: form.elements.notes.value.trim(),
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    isDeleted: 0
                };

                // Type-specific logic
                if (type === 'staff') {
                    dataToAdd.paymentType = form.elements.paymentType.value;
                    dataToAdd.salary = parseFormattedNumber(form.elements.salary.value) || 0;
                    dataToAdd.feePercentage = Number(form.elements.feePercentage.value) || 0;
                    dataToAdd.feeAmount = parseFormattedNumber(form.elements.feeAmount.value) || 0;
                }
                if (type === 'suppliers') {
                    dataToAdd.category = form.elements.itemCategory.value;
                }
                if (type === 'projects') {
                    dataToAdd.projectType = form.elements.projectType.value;
                    dataToAdd.budget = parseFormattedNumber(form.elements.budget.value);
                    dataToAdd.isWageAssignable = form.elements.isWageAssignable.checked;
                }
                if (type === 'materials') {
                    dataToAdd.unit = form.elements.itemUnit.value.trim();
                    const reorderPoint = Number(form.elements.reorderPoint.value);
                    if (reorderPoint < 0) {
                        toast('error', 'Jumlah pembelian minimal tidak boleh negatif.');
                        return; // Stops onConfirm execution
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
                                if (projectWages[projectId]) {
                                    projectWages[projectId] = { ...projectWages[projectId], ...wages };
                                } else {
                                    projectWages[projectId] = wages;
                                }
                            }
                        } catch (e) { console.error('Gagal parsing data upah', e); }
                    });

                    if (Object.keys(projectWages).length === 0) {
                        toast('error', 'minimal simpan satu pengaturan upah');
                        return; // Stops onConfirm execution
                    }

                    dataToAdd.projectWages = projectWages;
                    
                    // Set default project/role
                    const firstProjectIdWithWage = Object.keys(projectWages)[0];
                    if (firstProjectIdWithWage) {
                        dataToAdd.defaultProjectId = firstProjectIdWithWage;
                        const firstRole = Object.keys(projectWages[firstProjectIdWithWage])[0];
                        if (firstRole) {
                            dataToAdd.defaultRole = firstRole;
                        }
                    }
                }

                const collectionRef = COLLECTIONS[type];
                // Firestore v9: doc(collection(db, path)) creates a ref with a new ID
                const newDocRef = doc(collection(db, collectionRef.path));
                dataToAdd.id = newDocRef.id; // Add the new ID to the data object

                const writeOperation = async () => {
                    await setDoc(newDocRef, dataToAdd);
                };

                const success = await _safeFirestoreWrite(
                    writeOperation,
                    '',
                    `Gagal menambah ${config.title}.`
                );

                if (success) {
                    await localDB[config.dbTable].put({ ...dataToAdd, createdAt: new Date(), updatedAt: new Date(), syncState: 'synced' });
                    _logActivity(`Menambah Master Data: ${config.title}`, { name: itemName });

                    emit('masterData.updated', { type });
                    emit('ui.form.markDirty', false);

                    // Navigate
                    if (appState.activePage === 'master_data') {
                        const tabsContainer = document.querySelector('#master-data-tabs');
                        const listTab = tabsContainer?.querySelector('[data-tab="list"]');
                        if (listTab) listTab.click();
                    } else {
                        emit('ui.navigate', 'pengaturan');
                    }

                    toast('success', `${config.title} baru berhasil ditambahkan.`);
                } else {
                    // Offline handling
                    const localDoc = { ...dataToAdd, createdAt: new Date(), updatedAt: new Date(), syncState: 'pending_create' };
                    await localDB[config.dbTable].put(localDoc);
                    try { await queueOutbox({ table: config.dbTable, docId: dataToAdd.id, op: 'upsert', payload: localDoc, priority: 6 }); } catch (_) {}

                    emit('masterData.updated', { type });
                    emit('ui.form.markDirty', false);

                    // Navigate
                    if (appState.activePage === 'master_data') {
                        const tabsContainer = document.querySelector('#master-data-tabs');
                        const listTab = tabsContainer?.querySelector('[data-tab="list"]');
                        if (listTab) listTab.click();
                    } else {
                        emit('ui.navigate', 'pengaturan');
                    }

                    toast('info', `${config.title} disimpan offline dan akan disinkronkan.`);
                }
            } finally {
                loader.close();
            }
        }
    });
    
    return true;
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
            const loader = startGlobalLoading('Memindahkan ke Sampah...');

            try {
                const writeOperation = () => updateDoc(doc(COLLECTIONS[type], id), {
                    isDeleted: 1,
                    updatedAt: serverTimestamp()
                });

                const success = await _safeFirestoreWrite(writeOperation, '', `Gagal menghapus ${config.title}.`);

                if (success) {
                    const originalItem = await localDB[config.dbTable].get(id);
                    await localDB[config.dbTable].update(id, { isDeleted: 1, syncState: 'synced' });
                    _logActivity(`Memindahkan Master Data ke Sampah: ${config.title}`, { docId: id, name: item[config.nameField] });

                    if (itemElement) removeItemFromListWithAnimation(itemElement.dataset.id);
                    emit('masterData.updated', { type });

                    toast('info', `${config.title} dipindahkan ke Sampah.`, 6000, {
                        actionText: 'Urungkan',
                        onAction: async () => {
                            const undoLoader = startGlobalLoading('Mengembalikan...');
                            try {
                                if (originalItem) await localDB[config.dbTable].put(originalItem);
                                await _safeFirestoreWrite(() => updateDoc(doc(COLLECTIONS[type], id), { isDeleted: 0, updatedAt: serverTimestamp() }), '', 'Gagal mengurungkan.');
                                emit('masterData.updated', { type });
                                toast('success', 'Aksi dibatalkan.');
                            } catch (e) {
                                toast('error', 'Gagal mengurungkan aksi.');
                            } finally {
                                undoLoader.close();
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
                    // Offline handling
                    const originalItem = await localDB[config.dbTable].get(id);
                    await localDB[config.dbTable].update(id, { isDeleted: 1, syncState: 'pending_update', updatedAt: new Date() });
                    try { await queueOutbox({ table: config.dbTable, docId: id, op: 'upsert', payload: { id, isDeleted: 1, updatedAt: new Date() }, priority: 5 }); } catch(_) {}
                    emit('masterData.updated', { type });
                    toast('info', `${config.title} ditandai terhapus (offline). Akan disinkronkan.`);
                }
            } finally {
                loader.close();
            }
        }
    });
}

export async function handleEditMasterItem(id, type) {
    appState.masterDataOpenRequest = { type, itemId: id, activeTab: 'form' };
    emit('ui.navigate', 'master_data');
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
        return false; // Or show specific toast
    }

    emit('ui.modal.create', 'confirmEdit', {
        message: `Anda yakin ingin menyimpan perubahan pada <strong>${newName}</strong>?`,
        onConfirm: async () => {
            const loader = startGlobalLoading('Memperbarui...');
            try {
                let dataToUpdate = {
                    [config.nameField]: newName,
                    notes: form.elements.notes.value.trim()
                };

                // Type-specific logic
                if (type === 'staff') {
                    dataToUpdate.paymentType = form.elements.paymentType.value;
                    dataToUpdate.salary = parseFormattedNumber(form.elements.salary.value) || 0;
                    dataToUpdate.feePercentage = Number(form.elements.feePercentage.value) || 0;
                    dataToUpdate.feeAmount = parseFormattedNumber(form.elements.feeAmount.value) || 0;
                }
                if (type === 'suppliers') { 
                    dataToUpdate.category = form.elements.itemCategory.value; 
                }
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
                        return; // Stop execution
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
                                if (projectWages[projectId]) {
                                    projectWages[projectId] = { ...projectWages[projectId], ...wages };
                                } else {
                                    projectWages[projectId] = wages;
                                }
                            }
                        } catch(e) { console.error('Gagal parsing data upah', e);}
                    });
                    
                    if (Object.keys(projectWages).length === 0) {
                        toast('error','minimal simpan satu pengaturan upah');
                        return; // Stop execution
                    }
                    dataToUpdate.projectWages = projectWages;
                }

                // Firestore Transaction
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

                if (success) {
                    await fetchAndCacheData(config.stateKey, collectionRef, config.nameField);
                    _logActivity(`Memperbarui Master: ${config.title}`, { docId: id });
                    emit('masterData.updated', { type });
                    emit('ui.form.markDirty', false); 

                    // Navigate
                    if (appState.activePage === 'master_data') {
                        const tabsContainer = document.querySelector('#master-data-tabs');
                        const listTab = tabsContainer?.querySelector('[data-tab="list"]');
                        if (listTab) listTab.click();
                    } else {
                        emit('ui.navigate', 'pengaturan');
                    }
                    
                    toast('success', `Data ${config.title} berhasil diperbarui.`);

                } else {
                    // Offline handling
                    const localUpdate = { ...dataToUpdate, updatedAt: new Date(), syncState: 'pending_update' };
                    await localDB[config.dbTable].update(id, localUpdate);
                    try { await queueOutbox({ table: config.dbTable, docId: id, op: 'upsert', payload: { id, ...localUpdate }, priority: 6 }); } catch(_) {}
                    
                    emit('masterData.updated', { type });
                    emit('ui.form.markDirty', false); 
                    
                    // Navigate
                    if (appState.activePage === 'master_data') {
                        const tabsContainer = document.querySelector('#master-data-tabs');
                        const listTab = tabsContainer?.querySelector('[data-tab="list"]');
                        if (listTab) listTab.click();
                    } else {
                        emit('ui.navigate', 'pengaturan');
                    }
                    
                    toast('info', `${config.title} diperbarui offline. Akan disinkronkan.`);
                }
            } finally {
                loader.close();
            }
        }
    });
    
    return true; 
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
