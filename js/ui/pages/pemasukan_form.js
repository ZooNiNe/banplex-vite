// js/ui/pages/pemasukan_form.js

import { appState } from '../../state/appState.js';
import { $ } from '../../utils/dom.js';
import { createPageToolbarHTML } from '../components/toolbar.js';
import { createTabsHTML } from '../components/tabs.js';
import { getFormPemasukanHTML, initCustomSelects, formatNumberInput } from '../components/forms/index.js';
import { emit, on, off } from '../../state/eventBus.js';
import { liveQueryMulti } from '../../state/liveQuery.js';
import { fetchAndCacheData } from '../../services/data/fetch.js';
import { projectsCol, fundingCreditorsCol } from '../../config/firebase.js';
import { fmtIDR, parseFormattedNumber } from '../../utils/formatters.js';

let pageEventListenerController = null;
let unsubscribeLiveQuery = null;

/**
 * Membersihkan field yang tidak valid
 * (DIPINDAHKAN DARI uiInteractionService.js)
 */
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

/**
 * Memasang listener khusus untuk form pemasukan
 * (DIPINDAHKAN DARI uiInteractionService.js)
 */
function attachPemasukanFormListeners(context) {
    if (!context) return;

    const form = context.querySelector('#pemasukan-form, #edit-item-form');
    if (!form) {
        return;
    }

    const formType = form.dataset.type || 'termin';

    // (Validasi klien sudah ditangani oleh listener global)
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

async function renderPemasukanFormContent(container, activeTab) {
    await Promise.all([
        fetchAndCacheData('projects', projectsCol, 'projectName'),
        fetchAndCacheData('fundingCreditors', fundingCreditorsCol, 'creditorName')
    ]);
    
    // Dapatkan HTML form
    const formHTML = getFormPemasukanHTML(activeTab, null); // null = data item (karena ini form baru)
    container.innerHTML = formHTML;

    // Pasang listener ke form baru
    attachPemasukanFormListeners(container);
    emit('ui.forms.init', container);
}

/**
 * Inisialisasi Halaman Form Pemasukan
 */
export async function initPemasukanFormPage() {
    if (pageEventListenerController) pageEventListenerController.abort();
    pageEventListenerController = new AbortController();
    const { signal: listenerSignal } = pageEventListenerController;

    if (unsubscribeLiveQuery) unsubscribeLiveQuery.unsubscribe();
    unsubscribeLiveQuery = null;

    const container = $('.page-container');
    
    // Baca tab yang diminta dari appState (diatur oleh actionHandlers)
    const activeTab = appState.activeSubPage.get('pemasukan_form') || appState.pemasukanFormType || 'termin';
    appState.pemasukanFormType = null; // Hapus state sementara
    appState.activeSubPage.set('pemasukan_form', activeTab);

    const tabsData = [
        { id: 'termin', label: 'Termin Proyek' },
        { id: 'pinjaman', label: 'Pinjaman' },
    ];
    const tabsHTML = createTabsHTML({
        id: 'pemasukan-form-tabs',
        tabs: tabsData,
        activeTab: activeTab,
        customClasses: 'tabs-underline two-tabs'
    });

    container.innerHTML = `
        <div class="content-panel">
            <div class="panel-header">
                ${createPageToolbarHTML({ title: 'Input Pemasukan', showNavBack: true })}
                ${tabsHTML}
            </div>
            <div id="sub-page-content" class="panel-body scrollable-content">
            </div>
        </div>
    `;

    const tabsContainer = container.querySelector('#pemasukan-form-tabs');
    const contentContainer = container.querySelector('#sub-page-content');

    // Listener untuk ganti tab form (Termin/Pinjaman)
    if (tabsContainer) {
        tabsContainer.addEventListener('click', (e) => {
            const tabButton = e.target.closest('.sub-nav-item');
            if (tabButton && !tabButton.classList.contains('active')) {
                const currentActive = tabsContainer.querySelector('.sub-nav-item.active');
                if(currentActive) currentActive.classList.remove('active');
                tabButton.classList.add('active');
                const newTab = tabButton.dataset.tab;
                appState.activeSubPage.set('pemasukan_form', newTab);
                renderPemasukanFormContent(contentContainer, newTab);
            }
        }, { signal: listenerSignal });
    }
    
    // Listener untuk update dropdown jika master data berubah
    if (unsubscribeLiveQuery) unsubscribeLiveQuery.unsubscribe();
    unsubscribeLiveQuery = liveQueryMulti(
        ['projects', 'fundingCreditors'], 
        (changedKeys) => {
            if (appState.activePage === 'pemasukan_form') {
                const form = contentContainer.querySelector('form');
                if (form) {
                    const currentTab = appState.activeSubPage.get('pemasukan_form') || 'termin';
                    // Cukup update dropdown-nya saja
                    if (changedKeys.includes('projects') && currentTab === 'termin') {
                         emit('ui.form.updateCustomSelect', { context: form, type: 'projects' });
                    }
                    if (changedKeys.includes('fundingCreditors') && currentTab === 'pinjaman') {
                         emit('ui.form.updateCustomSelect', { context: form, type: 'creditors' });
                    }
                }
            }
        }
    );

    // Render konten form awal
    await renderPemasukanFormContent(contentContainer, activeTab);

    // Listener Unload
    const cleanup = () => {
        if (pageEventListenerController) pageEventListenerController.abort();
        if (unsubscribeLiveQuery) unsubscribeLiveQuery.unsubscribe();
        pageEventListenerController = null;
        unsubscribeLiveQuery = null;
        off('app.unload.pemasukan_form', cleanup);
    };
    off('app.unload.pemasukan_form', cleanup);
    on('app.unload.pemasukan_form', cleanup);
}