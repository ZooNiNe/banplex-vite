// js/ui/pages/pemasukan_form_listeners.js
// (File ini berisi fungsi yang dipindahkan dari uiInteractionService.js)

import { appState } from '../../state/appState.js';
import { fmtIDR, parseFormattedNumber } from '../../utils/formatters.js';
import { attachClientValidation } from '../../utils/validation.js';
import { initCustomSelects, formatNumberInput } from '../components/forms/index.js';

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