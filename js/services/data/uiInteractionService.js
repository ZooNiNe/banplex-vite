/* global Chart */
import { emit, on } from "../../state/eventBus.js";
import { appState } from "../../state/appState.js";
import { localDB } from "../localDbService.js";
import { getJSDate } from "../../utils/helpers.js";
import { toast } from "../../ui/components/toast.js";
import { fmtIDR, parseFormattedNumber } from "../../utils/formatters.js";
import { _createBillDetailContentHTML, _createSalaryBillDetailContentHTML, _createDetailContentHTML } from "../../ui/components/cards.js";
import { _getSkeletonLoaderHTML } from "../../ui/components/skeleton.js";
import { getEmptyStateHTML } from "../../ui/components/emptyState.js";
import { createModal, showDetailPane, closeModal, closeDetailPaneImmediate, hideMobileDetailPage, showMobileDetailPage, handleDetailPaneBack } from "../../ui/components/modal.js";
import { fetchAndCacheData } from "./fetch.js";
import { db, billsCol, fundingCreditorsCol, opCatsCol, otherCatsCol, suppliersCol, projectsCol, workersCol, materialsCol, expensesCol } from "../../config/firebase.js";
import { getDocs, query, collection, orderBy, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { TEAM_ID } from "../../config/constants.js";
import { attachClientValidation } from '../../utils/validation.js';
import { createTabsHTML } from '../../ui/components/tabs.js';
import {
    getFormFakturMaterialHTML,
    getFormPengeluaranHTML,
    initCustomSelects,
    formatNumberInput,
    attachPengeluaranFormListeners,
    updateCustomSelectOptions
} from '../../ui/components/forms/index.js';
import { attachPemasukanFormListeners } from "../../ui/pages/pemasukan_form_listeners.js";

function createIcon(iconName, size = 18, classes = '') {
    const icons = {
        error: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle ${classes}"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
        save: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-save ${classes}"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
        'check-circle': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle ${classes}"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>`,
        'task-alt': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle-2 ${classes}"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
        x: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x ${classes}"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
        list: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-list ${classes}"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>`,
        'share-2': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-share-2 ${classes}"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>`,
        printer: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-printer ${classes}"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>`,
        'arrow-left': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left ${classes}"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>`,
        'plus-circle': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus-circle ${classes}"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>`,
        'sticky-note': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sticky-note ${classes}"><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v6h6"/></svg>`
    };
    return icons[iconName] || '';
}

async function fetchBillPaymentsById(billId) {
    if (!billId) return [];
    const pendingPaymentsTable = localDB.pending_payments;
    const pending = pendingPaymentsTable
        ? await pendingPaymentsTable.where({ billId }).toArray().catch(() => [])
        : [];
    let serverPayments = [];
    try {
        const billRef = doc(db, 'teams', TEAM_ID, 'bills', billId);
        const paymentQuery = query(collection(billRef, 'payments'), orderBy('date', 'desc'));
        const snap = await getDocs(paymentQuery);
        serverPayments = snap.docs.map(d => ({
            id: d.id,
            billId,
            ...d.data(),
            _source: 'server'
        }));
    } catch (error) {
        console.warn("[fetchBillPaymentsById] Gagal mengambil pembayaran server:", error);
    }
    const normalizedPending = pending.map(p => ({
        ...p,
        billId: p.billId || billId,
        id: p.paymentId || p.id,
        _source: 'pending'
    }));
    const combined = [...serverPayments, ...normalizedPending];
    combined.sort((a, b) => getJSDate(b.date || b.createdAt) - getJSDate(a.date || a.createdAt));
    return combined;
}

export async function handleOpenBillDetail(context) {
    const { itemId, expenseId } = context || {};
    let billId = itemId;
    const parseIdList = (value) => {
        if (!value) return [];
        if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
        if (typeof value === 'string') return value.split(',').map(part => part.trim()).filter(Boolean);
        return [];
    };
    const aggregatedBillIds = parseIdList(context?.billIds || context?.['bill-ids']);
    const workerIdFromContext = context?.workerId || context?.['worker-id'] || '';
    const aggregateIdFromContext = context?.aggregateId || context?.['aggregate-id'] || '';
    const primaryBillIdFromContext = context?.primaryBillId || context?.['primary-bill-id'] || '';
    const isMobile = window.matchMedia('(max-width: 599px)').matches;
    const loaderContent = `<div class="skeleton-wrapper" style="padding: 1.5rem; display: flex; flex-direction: column; height: 100%;">${_getSkeletonLoaderHTML('detail-tagihan')}</div>`;
    const titleText = 'Memuat Detail Tagihan...';
    let targetEl = null;

    if (isMobile) {
        targetEl = showMobileDetailPage({ title: titleText, content: loaderContent });
    } else {
        targetEl = showDetailPane({
            title: titleText,
            content: loaderContent,
            footer: '',
            headerActions: ''
        });
    }
    if (!targetEl) return;


    try {
        await Promise.all([
            fetchAndCacheData('operationalCategories', opCatsCol, 'categoryName'),
            fetchAndCacheData('otherCategories', otherCatsCol, 'categoryName'),
            fetchAndCacheData('projects', projectsCol, 'projectName'),
            fetchAndCacheData('suppliers', suppliersCol, 'supplierName'),
            fetchAndCacheData('workers', workersCol, 'workerName')
        ]);

        const searchBillIds = [];
        if (billId) searchBillIds.push(billId);
        aggregatedBillIds.forEach(id => {
            if (!searchBillIds.includes(id)) searchBillIds.push(id);
        });

        let bill = null;
        if (searchBillIds.length > 0) {
            for (const candidateId of searchBillIds) {
                bill = appState.bills?.find(b => b.id === candidateId) || await localDB.bills.get(candidateId);
                if (bill) {
                    billId = candidateId;
                    break;
                }
            }
        }
        if (!bill && billId) {
            bill = appState.bills?.find(b => b.id === billId) || await localDB.bills.get(billId);
        }
        if (!bill && expenseId) {
            bill = appState.bills?.find(b => b.expenseId === expenseId) || await localDB.bills.where({ expenseId: expenseId }).first();
        }

        let targetExpenseId = expenseId || bill?.expenseId;
        let expenseData = null;
        if (targetExpenseId && (!bill || (bill && bill.type !== 'gaji'))) {
            expenseData = appState.expenses?.find(e => e.id === targetExpenseId) || await localDB.expenses.get(targetExpenseId);
             if (!expenseData && navigator.onLine) {
                  try {
                      const expenseDocRef = doc(expensesCol, targetExpenseId);
                      const expenseSnap = await getDoc(expenseDocRef);
                      if (expenseSnap.exists()) {
                          expenseData = { id: expenseSnap.id, ...expenseSnap.data() };
                          await localDB.expenses.put(expenseData);
                      }
                  } catch (fetchError) {

                  }
             }
        }

        if (!bill && !expenseData) {
            throw new Error('Data detail tidak dapat ditemukan.');
        }
        if (bill && bill.type !== 'gaji' && !expenseData) {
             throw new Error('Data pengeluaran terkait tidak ditemukan.');
        }

        let content, title;
        if (bill && bill.type === 'gaji') {
            let payments = [];
            const targetPaymentIds = searchBillIds.length ? searchBillIds : [bill.id];
            try {
                const paymentResults = await Promise.all(
                    targetPaymentIds.map(id => fetchBillPaymentsById(id))
                );
                payments = paymentResults.flat();
            } catch (paymentError) {
                console.warn("[handleOpenBillDetail] Gagal mengambil riwayat pembayaran gaji:", paymentError);
            }
            const detailOptions = {
                billIds: searchBillIds,
                workerId: workerIdFromContext,
                aggregateId: aggregateIdFromContext,
                primaryBillId: primaryBillIdFromContext || bill?.primaryBillId || '',
            };
            content = _createSalaryBillDetailContentHTML(bill, payments, detailOptions);
            
            try {
                const workerName = bill.workerDetails && bill.workerDetails.length === 1
                    ? bill.workerDetails[0].name
                    : (bill.workerDetails ? `${bill.workerDetails.length} Pekerja` : 'Pekerja');
                title = `Rekap Gaji: ${workerName}`;
            } catch (e) {
                title = `Rekap Tagihan Gaji`; // Fallback akhir
            }

        } else {
            content = await _createBillDetailContentHTML(bill, expenseData);
            title = `Detail: ${expenseData?.description || bill?.description || 'Item'}`;
        }

        const titleEl = targetEl.querySelector('.modal-header h4, h4, .breadcrumb-nav strong');
        const bodyEl = targetEl.querySelector('.modal-body, .detail-pane-body, .mobile-detail-content');
        if (titleEl) titleEl.innerHTML = title;
        if (bodyEl) bodyEl.innerHTML = content;

    } catch (error) {

        toast('error', error.message);
        const errorContent = getEmptyStateHTML({ icon: 'error', title: 'Gagal Memuat', desc: error.message });
        const bodyEl = targetEl.querySelector('.modal-body, .detail-pane-body, .mobile-detail-content');
        if (bodyEl) bodyEl.innerHTML = errorContent;
    }
}

export async function handleOpenPemasukanDetail(context) {
    const { itemId, id: contextId, type } = context || {};
    const id = itemId || contextId;
    if (!id || !type) {

        return;
    }

    const isMobile = window.matchMedia('(max-width: 599px)').matches;
    const loaderContent = `<div class="skeleton-wrapper" style="padding: 1.5rem; display: flex; flex-direction: column; height: 100%;">${_getSkeletonLoaderHTML('detail-pemasukan')}</div>`;
    let initialTitle = (type === 'termin') ? 'Detail Termin Proyek' : 'Detail Pinjaman';
    let targetEl = null;

    if (isMobile) {
        targetEl = showMobileDetailPage({ title: `Memuat ${initialTitle}...`, content: loaderContent });
    } else {
        targetEl = showDetailPane({ title: `Memuat ${initialTitle}...`, content: loaderContent });
    }
    if (!targetEl) return;


    try {
        await fetchAndCacheData('fundingCreditors', fundingCreditorsCol, 'creditorName');
        await fetchAndCacheData('projects', projectsCol, 'projectName');

        let item = null;
        let tableName = '';
        let appStateKey = '';

        if (type === 'termin') {
            tableName = 'incomes';
            appStateKey = 'incomes';
        } else if (type === 'pinjaman') {
            tableName = 'funding_sources';
            appStateKey = 'fundingSources';
        } else {
            throw new Error(`Tipe data tidak dikenal: ${type}`);
        }

        item = await localDB[tableName]?.get(id);

        if (!item) {

            item = appState[appStateKey]?.find(i => i.id === id);
        }

        if (!item) {
            throw new Error('Data pemasukan tidak dapat ditemukan.');
        }

        const content = _createDetailContentHTML(item, type);
        let title = (type === 'termin') ? 'Detail Termin Proyek' : 'Detail Pinjaman';
        if(item.description) title = item.description;

        const titleEl = targetEl.querySelector('.modal-header h4, h4, .breadcrumb-nav strong');
        const bodyContainer = targetEl.querySelector('.modal-body, .detail-pane-body, .mobile-detail-content');
        if(titleEl) titleEl.textContent = title;
        if(bodyContainer) bodyContainer.innerHTML = content;


    } catch (error) {

        toast('error', error.message);
        const bodyContainer = targetEl.querySelector('.modal-body, .detail-pane-body, .mobile-detail-content');
        if(bodyContainer) {
            bodyContainer.innerHTML = getEmptyStateHTML({ icon: 'error', title: 'Gagal Memuat', desc: error.message });
        }
    }
}


export async function handleOpenEditItem(id, type) {
    try {
        let originalType = type;
        let itemToEdit = null;
        let itemExpenseType = null;
        let targetId = id;
        let expenseDataForForm = null;

        if (type === 'bill') {
            const bill = appState.bills.find(b => b.id === id) || await localDB.bills.get(id);
            if (!bill) { throw new Error('Tagihan tidak ditemukan untuk diedit.'); }
            if (bill.type === 'gaji') {
                toast('info', 'Tagihan gaji tidak dapat diedit langsung. Edit melalui absensi atau rekap.');
                return;
            }
            if (!bill.expenseId) {
                toast('error', 'Tagihan ini tidak terkait dengan data pengeluaran.');
                return;
            }
            targetId = bill.expenseId;
            expenseDataForForm = appState.expenses.find(e => e.id === targetId) || await localDB.expenses.get(targetId);
             if (!expenseDataForForm && navigator.onLine) {
                  try {
                      const expenseDocRef = doc(expensesCol, targetId);
                      const expenseSnap = await getDoc(expenseDocRef);
                      if (expenseSnap.exists()) {
                          expenseDataForForm = { id: expenseSnap.id, ...expenseSnap.data() };
                          await localDB.expenses.put(expenseDataForForm);
                      }
                  } catch (fetchError) {

                  }
             }
            if (!expenseDataForForm) {
                 toast('error', 'Data pengeluaran terkait tidak ditemukan untuk diedit.');
                 return;
            }
            itemToEdit = expenseDataForForm;
            originalType = 'expense';
            itemExpenseType = itemToEdit.type;

        } else if (type === 'termin') {
            itemToEdit = appState.incomes.find(i => i.id === id) || await localDB.incomes.get(id);
            originalType = 'termin';
        } else if (type === 'pinjaman' || type === 'loan') {
            itemToEdit = appState.fundingSources.find(f => f.id === id) || await localDB.funding_sources.get(id);
            originalType = 'pinjaman';
        } else if (type === 'expense') {
            itemToEdit = appState.expenses.find(e => e.id === id) || await localDB.expenses.get(id);
             if (!itemToEdit && navigator.onLine) {
                  try {
                      const expenseDocRef = doc(expensesCol, id);
                      const expenseSnap = await getDoc(expenseDocRef);
                      if (expenseSnap.exists()) {
                          itemToEdit = { id: expenseSnap.id, ...expenseSnap.data() };
                          await localDB.expenses.put(itemToEdit);
                      }
                  } catch (fetchError) {

                  }
             }
            expenseDataForForm = itemToEdit;
            originalType = 'expense';
            itemExpenseType = itemToEdit?.type;
        } else {
             toast('error', `Tipe data "${type}" tidak didukung untuk diedit.`);
             return;
        }

        if (!itemToEdit) { throw new Error('Data tidak ditemukan untuk diedit.'); }

        await Promise.all([
            fetchAndCacheData('projects', projectsCol, 'projectName'),
            fetchAndCacheData('suppliers', suppliersCol, 'supplierName'),
            fetchAndCacheData('operationalCategories', opCatsCol, 'categoryName'),
            fetchAndCacheData('otherCategories', otherCatsCol, 'categoryName'),
            fetchAndCacheData('fundingCreditors', fundingCreditorsCol, 'creditorName'),
            fetchAndCacheData('materials', materialsCol, 'materialName')
        ]);

        let formHTML = '<p>Form tidak tersedia.</p>';
        const getSafeOptions = (data, valueField, textField) => {
            return (Array.isArray(data) ? data : [])
                .filter(i => !i.isDeleted)
                .map(i => ({ value: i[valueField], text: i[textField] }));
        };

        if (originalType === 'termin' || originalType === 'pinjaman') {
            const { getFormPemasukanHTML } = await import('../../ui/components/forms/htmlGenerators.js');
            formHTML = getFormPemasukanHTML(originalType, itemToEdit);

        } else if (originalType === 'expense') {
            const expenseTypeForForm = itemExpenseType || 'lainnya';
            const isOperasional = expenseTypeForForm === 'operasional';
            const categoryOptions = getSafeOptions(
                isOperasional ? appState.operationalCategories : appState.otherCategories,
                'id',
                'categoryName'
            );
            const masterType = isOperasional ? 'op-cats' : 'other-cats';
            const categoryLabel = isOperasional ? 'Kategori Operasional' : 'Kategori Lainnya';
            const supplierOptions = getSafeOptions(appState.suppliers, 'id', 'supplierName');
            const projectOptions = getSafeOptions(appState.projects, 'id', 'projectName');

            if (expenseTypeForForm === 'material') {
                formHTML = getFormFakturMaterialHTML(itemToEdit);
            } else {
                formHTML = getFormPengeluaranHTML(expenseTypeForForm, categoryOptions, masterType, categoryLabel, supplierOptions, projectOptions, itemToEdit);
            }
        }

        const footerHTML = `<button type="submit" form="edit-item-form" class="btn btn-primary">${createIcon('save')} Simpan Perubahan</button>`;
        const contentHTML =`<div class="scrollable-content">${formHTML}</div>` 
        
        const detailPane = showDetailPane({ 
            title: `Edit: ${itemToEdit.description || 'Item'}`, 
            content: contentHTML, 
            footer: footerHTML, 
            paneType: `edit-${originalType}` 
        });

        if (!detailPane || !detailPane.__controller) {
            console.error("Gagal membuat detail pane atau controller tidak ditemukan.");
            return; 
        }

        const form = detailPane.querySelector('#edit-item-form');
        const signal = detailPane.__controller.signal; // Dapatkan signal dari controller panel

        if (!form) {
            console.error("Form #edit-item-form tidak ditemukan di dalam detail pane.");
            return;
        }

        on('masterData.updated', (updateData) => {
            if (!updateData || !updateData.type) return;
            
            console.log(`[Edit Panel] Master data '${updateData.type}' diperbarui. Memperbarui dropdown...`);
            updateCustomSelectOptions(form, updateData.type);
            
        }, { signal }); // <--- Penting: Ikat ke signal panel
        initCustomSelects(detailPane);
        detailPane.querySelectorAll('input[inputmode="numeric"]').forEach(inp => inp.addEventListener('input', formatNumberInput));
        attachClientValidation(form);

        if (originalType === 'expense') {
            attachPengeluaranFormListeners(itemExpenseType || 'lainnya', detailPane);
        } else if (originalType === 'termin' || originalType === 'pinjaman') {
            const { attachPemasukanFormListeners: attachPemasukanEditListeners } = await import('./transactions/pemasukanService.js');
            attachPemasukanEditListeners(detailPane);
        }
    } catch (e) {
        console.error("[handleOpenEditItem] Error:", e); // [PERBAIKAN] Tambahkan console.error
        toast('error', `Gagal membuka form edit: ${e.message || e}`);
    }
}

export function showSuccessPreviewPanel(itemData, type) {
    const isPengeluaran = ['pengeluaran', 'operasional', 'material', 'lainnya', 'expense', 'bill'].includes(type);
    const title = `Berhasil Disimpan!`;


    let previewContent = '<p>Gagal memuat pratinjau.</p>';
    let item, expense, bill;
    let isPemasukan = false;

    if (type === 'termin' || type === 'pinjaman'){
        item = itemData;
        isPemasukan = true;

    } else if (isPengeluaran && itemData?.expense) {
        expense = itemData.expense;
        bill = itemData.bill;
        item = bill || expense;

    } else {
        item = itemData;
        expense = (isPengeluaran && item?.expenseId) ? appState.expenses?.find(e => e.id === item.expenseId) : (isPengeluaran ? item : null);
        bill = (isPengeluaran && type === 'bill') ? item : (isPengeluaran && expense ? appState.bills?.find(b => b.expenseId === expense.id) : null) ;

    }


    if (item) {
        const heroVariant = isPemasukan ? 'success-hero--income' : (isPengeluaran ? 'success-hero--expense' : '');
        const details = [];
        const project = appState.projects?.find(p => p.id === (item?.projectId || expense?.projectId));
        const supplier = expense ? appState.suppliers?.find(s => s.id === expense.supplierId) : null;
        const creditor = type === 'pinjaman' ? appState.fundingCreditors?.find(c => c.id === item?.creditorId) : null;
        const description = item?.description || 'Data Tersimpan';
        const amount = item?.amount || item?.totalAmount || 0;
        const date = getJSDate(item?.date || item?.dueDate || expense?.date);

        details.push({ label: 'Deskripsi', value: description });
        details.push({ label: 'Jumlah', value: fmtIDR(amount) });
        details.push({ label: 'Tanggal', value: date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) });
        if(project) details.push({ label: 'Proyek', value: project.projectName });
        if(supplier) details.push({ label: 'Supplier', value: supplier.supplierName });
        if(creditor) details.push({ label: 'Kreditur', value: creditor.creditorName });

        let statusLabel = '', statusClass = '';
        let isTagihan = false;

        if(isPengeluaran) {
            const displayStatus = bill?.status || expense?.status;
            if (displayStatus === 'delivery_order') {
                statusLabel = 'Surat Jalan'; statusClass = 'info';
            } else if (displayStatus === 'paid') {
                statusLabel = 'Lunas'; statusClass = 'positive';
            } else {
                statusLabel = 'Tagihan'; statusClass = 'warn'; isTagihan = true;
            }
            details.push({ label: 'Status', value: `<span class="status-badge status-badge--${statusClass}">${statusLabel}</span>` });
        } else if (type === 'pinjaman'){
             statusLabel = item.status === 'paid' ? 'Lunas' : 'Belum Lunas';
             statusClass = item.status === 'paid' ? 'positive' : 'warn';
             details.push({ label: 'Status', value: `<span class="status-badge status-badge--${statusClass}">${statusLabel}</span>` });
        }


        previewContent = `
            <div class="success-preview-card" id="success-preview-card">
                <div class="success-hero ${heroVariant}">
                    <svg class="success-hero-art" width="120" height="88" viewBox="0 0 120 88" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <defs>
                            <linearGradient id="hs1" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.18" />
                                <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.05" />
                            </linearGradient>
                        </defs>
                        <rect x="8" y="12" width="84" height="52" rx="10" fill="url(#hs1)" stroke="var(--line)"/>
                        <rect x="20" y="26" width="36" height="8" rx="4" fill="var(--primary)" opacity="0.25" />
                        <rect x="20" y="40" width="28" height="8" rx="4" fill="var(--primary)" opacity="0.15" />
                    </svg>
                    <div class="success-preview-icon">${createIcon('task-alt', 36)}</div>
                </div>
                <h4 class="success-preview-title">Data Berhasil Disimpan</h4>
                <dl class="detail-list">
                    ${details.map(d => `<div><dt>${d.label}</dt><dd>${d.value}</dd></div>`).join('')}
                </dl>
                <p class="success-preview-notice">
                    ${isTagihan
                        ? 'Pengeluaran ini telah dibuat sebagai <strong>Tagihan</strong>. Anda dapat melihatnya di halaman Tagihan untuk proses pembayaran.'
                        : (statusLabel === 'Surat Jalan'
                            ? 'Pengeluaran ini telah disimpan sebagai <strong>Surat Jalan</strong>. Anda dapat melihatnya di halaman Tagihan.'
                            : 'Data Anda telah berhasil disimpan di perangkat dan akan segera disinkronkan ke server.'
                          )
                    }
                </p>
                <p class="copyright-footer">&copy; ${new Date().getFullYear()} BanPlex. All rights reserved.</p>
            </div>
        `;
    }

    const navTargetPage = (isPengeluaran || type === 'bill') ? 'tagihan' : 'pemasukan';
    const navTargetFull = `${navTargetPage}`;

    let firstButtonHTML = '';
    const originalFormPage = isPemasukan ? 'pemasukan_form' : 'pengeluaran';

    firstButtonHTML = `
        <button class="btn btn-secondary" data-action="detail-pane-back" data-original-page="${originalFormPage}">
            ${createIcon('arrow-left')}
            <span>Input Lagi</span>
        </button>
    `;

    const footerHTML = `
        ${firstButtonHTML}
        <button class="btn btn-primary" data-action="navigate" data-nav="${navTargetFull}">
            ${createIcon('list')}
            <span>Lihat Daftar</span>
        </button>
    `;

    const fabHTML = `<button class="fab" data-action="share-preview" title="Bagikan">${createIcon('share-2')}</button>`;

    const detailPaneOptions = {
        title: title,
        content: previewContent,
        footer: footerHTML,
        fabHTML: fabHTML,
        isSuccessPanel: true,
        paneType: `success-${type}`
    };

    showDetailPane(detailPaneOptions);

    toast('success', 'Data berhasil disimpan!');
}


export async function showPaymentSuccessPreviewPanel(data, navTarget = 'dashboard') {
    const {
        title = 'Pembayaran Berhasil!',
        description,
        amount = 0,
        date = new Date(),
        recipient,
        isLunas = false,
        billId
    } = data;

    const details = [
        { label: 'Tanggal Bayar', value: getJSDate(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) },
        { label: 'Penerima', value: recipient },
        { label: 'Status Transaksi', value: `<span class="status-badge status-badge--${isLunas ? 'positive' : 'warn'}">${isLunas ? 'LUNAS' : 'Cicilan'}</span>` },
    ];

    const previewContent = `
        <div class="success-preview-card payment-success-card" id="success-preview-card">
            <div class="success-hero success-hero--payment">
                <svg class="success-hero-art" width="120" height="88" viewBox="0 0 120 88" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <defs>
                        <linearGradient id="hp1" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.18" />
                            <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.05" />
                        </linearGradient>
                    </defs>
                    <rect x="8" y="12" width="84" height="52" rx="10" fill="url(#hp1)" stroke="var(--line)"/>
                    <rect x="20" y="26" width="36" height="8" rx="4" fill="var(--primary)" opacity="0.25" />
                    <rect x="20" y="40" width="28" height="8" rx="4" fill="var(--primary)" opacity="0.15" />
                    <g transform="translate(78, 42)">
                        <circle cx="18" cy="18" r="14" fill="var(--bg)" stroke="var(--primary)" opacity="0.6"/>
                        <path d="M10 18l6 6 10-10" stroke="var(--primary)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                    </g>
                </svg>
                <div class="success-preview-icon">${createIcon('check-circle', 36)}</div>
            </div>
            <h4 class="success-preview-title">${title}</h4>
            <p class="success-preview-description">${description}</p>
            <div class="payment-amount-display">
                <span>Jumlah Dibayar</span>
                <strong>${fmtIDR(amount)}</strong>
            </div>
            <dl class="detail-list">
                ${details.map(d => `<div style=\"padding: 0.6rem 0;\"><dt>${d.label}</dt><dd>${d.value}</dd></div>`).join('')}
            </dl>
            <p class="success-preview-notice">Kwitansi pembayaran dapat diunduh kapan saja dari riwayat pembayaran.</p>
            <p class="copyright-footer">&copy; ${new Date().getFullYear()} BanPlex. All rights reserved.</p>
        </div>
    `;

    const kwitansiData = {
        nomor: `PAY-${billId?.substring(0, 8) || Date.now()}`,
        tanggal: getJSDate(date).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}),
        namaPenerima: recipient,
        jumlah: amount,
        deskripsi: description,
        isLunas: isLunas,
        date: date instanceof Date ? date.toISOString() : date,
        recipient: recipient,
        amount: amount,
    };

    const footerHTML = `
        <button class="btn btn-secondary" data-action="close-detail-pane-and-navigate" data-nav="${navTarget}">
            ${createIcon('x')}
            <span>Tutup Panel</span>
        </button>
        <button class="btn btn-primary" data-action="cetak-kwitansi-universal" data-kwitansi='${JSON.stringify(kwitansiData)}'>
            ${createIcon('printer')}
            <span>Cetak Kwitansi</span>
        </button>
    `;

    const fabHTML = `<button class="fab" data-action="share-preview" title="Bagikan">${createIcon('share-2')}</button>`;

    const detailPaneOptions = {
        title: 'Konfirmasi Pembayaran',
        content: previewContent,
        footer: footerHTML,
        fabHTML: fabHTML,
        isSuccessPanel: true
    };

    showDetailPane(detailPaneOptions);

    toast('success', 'Pembayaran berhasil diproses!');
}
