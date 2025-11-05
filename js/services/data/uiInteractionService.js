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
    getFormPemasukanHTML,
    getFormFakturMaterialHTML,
    getFormPengeluaranHTML,
    initCustomSelects,
    formatNumberInput,
    attachPengeluaranFormListeners,
    updateCustomSelectOptions
} from '../../ui/components/forms/index.js';


export function attachPemasukanFormListeners(context) {
    if (!context) return;

    const form = context.querySelector('#pemasukan-form, #edit-item-form');
    if (!form) {

        return;
    }

    const formType = form.dataset.type || 'termin';


    attachClientValidation(form);

    initCustomSelects(context);

    const numericInputs = form.querySelectorAll('input[inputmode="numeric"], input[name="rate"], input[name="tenor"]');
    numericInputs.forEach(input => {
        input.removeEventListener('input', formatNumberInput);
        input.addEventListener('input', formatNumberInput);
    });


    if (formType === 'pinjaman' || formType === 'loan') {
        const interestTypeSelect = form.querySelector('input[name="loan-interest-type"]');
        const loanDetailsDiv = form.querySelector('.loan-details');
        const rateInput = form.querySelector('input[name="rate"]');
        const tenorInput = form.querySelector('input[name="tenor"]');
        const amountInput = form.querySelector('input[name="totalAmount"], input[name="pemasukan-jumlah"]');
        const calculationResultDiv = form.querySelector('#loan-calculation-result');



        const updateLoanDetailsVisibility = () => {

            const isInterest = interestTypeSelect?.value === 'interest';


            if (loanDetailsDiv) {
                loanDetailsDiv.classList.toggle('hidden', !isInterest);

            }
            if (rateInput) {
                if (isInterest) {
                    rateInput.setAttribute('required', 'required');
                } else {
                    rateInput.removeAttribute('required');
                    clearInvalid(rateInput);
                }
            }
            if (tenorInput) {
                 if (isInterest) {
                    tenorInput.setAttribute('required', 'required');
                } else {
                    tenorInput.removeAttribute('required');
                    clearInvalid(tenorInput);
                }
            }
            updateLoanCalculation();
        };

        const updateLoanCalculation = () => {

            if (!calculationResultDiv || interestTypeSelect?.value !== 'interest') {
                 if(calculationResultDiv) calculationResultDiv.innerHTML = '';

                 return;
            }

            const amount = parseFormattedNumber(amountInput?.value || '0');
            const rate = parseFloat(rateInput?.value || '0');
            const tenor = parseInt(tenorInput?.value || '0', 10);


            if (amount > 0 && rate > 0 && tenor > 0) {
                const monthlyInterestRate = rate / 100;
                const totalInterest = amount * monthlyInterestRate * tenor;
                const totalRepayment = amount + totalInterest;
                const monthlyPayment = totalRepayment / tenor;

                calculationResultDiv.innerHTML = `
                    <div class="card card-pad calculation-card">
                         <h5 class="calculation-title">Estimasi Pinjaman</h5>
                         <div class="calculation-grid">
                            <div><span class="label">Total Pengembalian</span><strong class="value">${fmtIDR(totalRepayment)}</strong></div>
                            <div><span class="label">Cicilan / Bulan</span><strong class="value">${fmtIDR(monthlyPayment)}</strong></div>
                         </div>
                    </div>
                `;

            } else {
                calculationResultDiv.innerHTML = '';

            }
        };

        if (interestTypeSelect) {
            interestTypeSelect.removeEventListener('change', updateLoanDetailsVisibility);
            interestTypeSelect.addEventListener('change', updateLoanDetailsVisibility);
        }
        if (amountInput) {
            amountInput.removeEventListener('input', updateLoanCalculation);
            amountInput.addEventListener('input', updateLoanCalculation);
        }
        if (rateInput) {
            rateInput.removeEventListener('input', updateLoanCalculation);
            rateInput.addEventListener('input', updateLoanCalculation);
        }
        if (tenorInput) {
            tenorInput.removeEventListener('input', updateLoanCalculation);
            tenorInput.addEventListener('input', updateLoanCalculation);
        }

        updateLoanDetailsVisibility();

    }

    if (formType === 'termin') {
        const amountInput = form.querySelector('input[name="amount"], input[name="pemasukan-jumlah"]');
        const feeContainer = form.querySelector('#fee-allocation-container');


        const calculateFees = () => {

            if (!feeContainer) return;
            const amount = parseFormattedNumber(amountInput?.value || '0');


            if (amount <= 0) {
                feeContainer.innerHTML = '';

                return;
            }

            const staffWithFees = (appState.staff || [])
                .filter(s => !s.isDeleted && (s.paymentType === 'per_termin' || s.paymentType === 'fixed_per_termin'));


            if (staffWithFees.length === 0) {
                feeContainer.innerHTML = '';

                return;
            }

            let feeHTML = '<h5 class="invoice-section-title full-width" style="margin-top: 1rem;">Alokasi Fee Staf (Otomatis)</h5><dl class="detail-list">';
            staffWithFees.forEach(staff => {
                let feeAmount = 0;
                if (staff.paymentType === 'per_termin' && staff.feePercentage > 0) {
                    feeAmount = amount * (staff.feePercentage / 100);
                } else if (staff.paymentType === 'fixed_per_termin' && staff.feeAmount > 0) {
                    feeAmount = staff.feeAmount;
                }
                if (feeAmount > 0) {
                     feeHTML += `<div><dt>${staff.staffName}</dt><dd>${fmtIDR(feeAmount)}</dd></div>`;

                }
            });
            feeHTML += '</dl>';
            feeContainer.innerHTML = feeHTML;
        };

        if(amountInput) {
            amountInput.removeEventListener('input', calculateFees);
            amountInput.addEventListener('input', calculateFees);
        }
        calculateFees();

    }
}

function clearInvalid(field) {
    if (!field) return;
    const group = field.closest('.form-group');
    if (!group) return;

    const visualElement = field.type === 'hidden'
        ? field.closest('.custom-select-wrapper')?.querySelector('.custom-select-trigger')
        : field;

    const elementToClear = visualElement || field;
    elementToClear.classList.remove('is-invalid');

    const errorEl = group.querySelector('.input-error-text');
    if (errorEl) errorEl.remove();
}


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

export async function handleOpenBillDetail(context) {
    const { itemId, expenseId } = context || {};
    const billId = itemId;
    const isMobile = window.matchMedia('(max-width: 599px)').matches;
    const loaderContent = _getSkeletonLoaderHTML('laporan');
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

        let bill = null;
        if (billId) {
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
            try {
                 const billRef = doc(billsCol, bill.id);
                 const paymentsSnap = await getDocs(query(collection(billRef, 'payments'), orderBy('date', 'desc')));
                 payments = paymentsSnap.docs.map(d => ({id: d.id, ...d.data()}));
            } catch (paymentError) {

            }
            content = _createSalaryBillDetailContentHTML(bill, payments);
            title = `Detail Tagihan Gaji`;
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
    const loaderContent = _getSkeletonLoaderHTML('laporan');
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
            attachPemasukanFormListeners(detailPane);
        }
        emit('ui.forms.init', detailPane);

    } catch (e) {
        console.error("[handleOpenEditItem] Error:", e); // [PERBAIKAN] Tambahkan console.error
        toast('error', `Gagal membuka form edit: ${e.message || e}`);
    }
}

export async function handleOpenPemasukanForm(options = {}) {
    const { type: requestedType = 'pinjaman', itemData = null } = options;
    const type = (requestedType === 'pinjaman' || requestedType === 'loan') ? 'pinjaman' : 'termin';
    const isEdit = !!itemData;
    const title = isEdit ? `Edit ${type === 'termin' ? 'Termin' : 'Pinjaman'}` : `Input ${type === 'termin' ? 'Termin' : 'Pinjaman'} Baru`;



     try {

         await Promise.all([
             fetchAndCacheData('projects', projectsCol, 'projectName'),
             fetchAndCacheData('fundingCreditors', fundingCreditorsCol, 'creditorName')
         ]);



         const formHTML = getFormPemasukanHTML(type, itemData);
         const formId = isEdit ? 'edit-item-form' : 'pemasukan-form';
         const submitButtonText = isEdit ? 'Simpan Perubahan' : 'Simpan';
         const footerHTML = `<button type="submit" form="${formId}" class="btn btn-primary">${createIcon('save')} ${submitButtonText}</button>`;

         let tabsHTML = '';
         if (!isEdit) {
             const tabsData = [
                 { id: 'termin', label: 'Termin Proyek' },
                 { id: 'pinjaman', label: 'Pinjaman' },
             ];
             tabsHTML = createTabsHTML({ id: 'pemasukan-form-tabs', tabs: tabsData, activeTab: type, customClasses: 'tabs-underline two-tabs' });
         }

         const contentHTML = `
             ${tabsHTML}
             <div id="pemasukan-form-content" class="scrollable-content">
                ${formHTML}
             </div>
         `;


         const detailPane = showDetailPane({
             title: title,
             content: contentHTML,
             footer: footerHTML,
             paneType: `${isEdit ? 'edit' : 'input'}-${type}`
         });

         if (detailPane) {


             const formContentContainer = detailPane.querySelector('#pemasukan-form-content');
             const formElement = formContentContainer.querySelector('form');

             const renderFormForTab = async (newType) => {

                 formContentContainer.innerHTML = _getSkeletonLoaderHTML('form');

                 await Promise.all([
                     fetchAndCacheData('projects', projectsCol, 'projectName'),
                     fetchAndCacheData('fundingCreditors', fundingCreditorsCol, 'creditorName')
                 ]);

                 formContentContainer.innerHTML = getFormPemasukanHTML(newType, null);
                 const newForm = formContentContainer.querySelector('form');

                 attachPemasukanFormListeners(detailPane);
                 newForm?.querySelectorAll('input[inputmode="numeric"]').forEach(inp => inp.addEventListener('input', formatNumberInput));
                 emit('ui.forms.init', detailPane);

             };

             attachPemasukanFormListeners(detailPane);
             formElement?.querySelectorAll('input[inputmode="numeric"]').forEach(inp => inp.addEventListener('input', formatNumberInput));
             emit('ui.forms.init', detailPane);


             if (!isEdit) {
                 const tabsContainer = detailPane.querySelector('#pemasukan-form-tabs');
                 if (tabsContainer) {

                     tabsContainer.addEventListener('click', (e) => {
                         const tabButton = e.target.closest('.sub-nav-item');
                         if (tabButton && !tabButton.classList.contains('active')) {


                             const currentActive = tabsContainer.querySelector('.sub-nav-item.active');
                             if(currentActive) currentActive.classList.remove('active');
                             tabButton.classList.add('active');
                             const newType = tabButton.dataset.tab;


                             const paneTitle = detailPane.querySelector('.detail-pane-header h4, .mobile-detail-header strong');
                             if (paneTitle) paneTitle.textContent = `Input ${newType === 'termin' ? 'Termin' : 'Pinjaman'} Baru`;

                             renderFormForTab(newType);
                         }
                     });
                 }
             }

         } else {

         }

     } catch (e) {

         toast('error', 'Gagal membuka form pemasukan.');
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
    const navTargetSubPage = (isPemasukan) ? `&subpage=${type}` : '';
    const navTargetFull = `${navTargetPage}${navTargetSubPage}`;

    let firstButtonHTML = '';
    const originalFormPage = isPemasukan ? 'pemasukan' : 'pengeluaran';

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