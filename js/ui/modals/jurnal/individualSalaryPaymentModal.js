/* === File Baru: js/ui/modals/jurnal/individualSalaryPaymentModal.js === */
import { appState } from "../../../state/appState.js";
import { $ } from "../../../utils/dom.js";
import { fmtIDR, parseFormattedNumber } from "../../../utils/formatters.js";
import { createModal, closeModal, showDetailPane, closeDetailPane } from "../../components/modal.js";
import { emit } from "../../../state/eventBus.js";
import { _createAttachmentManagerHTML, _attachSingleFileUploadListener } from "../../components/forms/index.js";
import { animateNumber } from "../../../utils/dom.js";

// Helper Ikon
function createIcon(iconName, size = 18, classes = '') {
    const icons = {
        payment: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-credit-card ${classes}"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
    };
    return icons[iconName] || '';
}

/**
 * Membuka modal kecil untuk pembayaran individual.
 */
export function openIndividualSalaryPaymentModal(dataset) {
    const { billId, workerId, workerName, amount } = dataset;
    const remainingAmount = parseFloat(amount);
    
    const amountFormatted = new Intl.NumberFormat('id-ID').format(remainingAmount);
    const todayString = new Date().toISOString().slice(0, 10);

    const attachmentHTML = _createAttachmentManagerHTML({}, {
        singleOptional: true,
        inputName: 'paymentAttachment',
        containerId: 'new-payment-attachment-container'
    });

    const content = `
        <div class="card card-pad">
            <div class="success-hero success-hero--payment" style="margin-bottom:.75rem;">
                <svg class="success-hero-art" width="120" height="88" viewBox="0 0 120 88" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                     <defs>
                        <linearGradient id="gsp_ind" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.18" />
                            <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.05" />
                        </linearGradient>
                    </defs>
                    <rect x="8" y="12" width="84" height="52" rx="10" fill="url(#gsp_ind)" stroke="var(--line)"/>
                    <rect x="20" y="26" width="40" height="8" rx="4" fill="var(--primary)" opacity="0.25" />
                </svg>
                <div class="success-preview-icon">${createIcon('payment', 28)}</div>
            </div>
            
            <div class="payment-modal-header" style="margin: 0;">
                <span class="label" id="payment-remaining-label">Sisa Gaji ${workerName}</span>
                <strong class="payment-main-amount" id="payment-remaining-amount" data-raw-amount="${remainingAmount}">${fmtIDR(remainingAmount)}</strong>
            </div>

             <div class="quick-pay-actions" style="grid-template-columns: 1fr 1fr;">
                <button type="button" class="btn btn-secondary" data-action="set-payment-half">Bayar Setengah</button>
                <button type="button" class="btn btn-secondary" data-action="set-payment-full">Bayar Lunas</button>
            </div>

            <form id="payment-form" data-type="individual-salary" data-bill-id="${billId}" data-worker-id="${workerId}">
                <div class="payment-form-body">
                    <div class="form-group">
                        <label>Jumlah Pembayaran</label>
                        <input type="text" name="amount" id="payment-input-amount" inputmode="numeric" required value="${amountFormatted}">
                    </div>
                    <div class="form-group">
                        <label>Tanggal Pembayaran</label>
                        <input type="date" name="date" value="${todayString}" required>
                    </div>
                    <h5 class="invoice-section-title full-width">Lampiran (Opsional)</h5>
                    <div class="form-group full-width">
                        ${attachmentHTML}
                    </div>
                </div>
            </form>
        </div>`;

    const footer = `
        <div class="form-footer-actions">
            <button type="submit" class="btn btn-primary" form="payment-form">
                ${createIcon('payment')} Konfirmasi Pembayaran
            </button>
        </div>`;

    // Buka sebagai panel detail baru di atas panel sebelumnya
    const paymentPane = showDetailPane({ 
        title: `Bayar Gaji: ${workerName}`, 
        content: content, 
        footer: footer,
        paneType: 'salary-payment-individual'
    });

    if (paymentPane) {
        const controller = paymentPane.__controller;
        if (!controller) {
            console.warn('Pane controller not found for individualSalaryPaymentModal');
            return;
        }
        const { signal } = controller;

        emit('ui.detailPane.formReady', { context: paymentPane });
        _attachSingleFileUploadListener(paymentPane, 'paymentAttachment', '#new-payment-attachment-container');
        
        const amountInput = paymentPane.querySelector('#payment-input-amount');
        const remainingAmountEl = paymentPane.querySelector('#payment-remaining-amount');
        const remainingLabelEl = paymentPane.querySelector('#payment-remaining-label');
        const originalRemaining = parseFloat(remainingAmountEl.dataset.rawAmount);

        if (amountInput && remainingAmountEl && remainingLabelEl) {
            amountInput.addEventListener('input', () => {
                const amountToPay = parseFormattedNumber(amountInput.value);
                const newRemaining = originalRemaining - amountToPay;
                animateNumber(remainingAmountEl, newRemaining);
                remainingLabelEl.textContent = "Sisa Setelah Bayar";
            }, { signal });
        }
        emit('ui.forms.init', paymentPane);
    }
}