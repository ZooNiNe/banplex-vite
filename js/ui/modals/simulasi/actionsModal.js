import { appState } from "../../../state/appState.js";
import { $, $$ } from "../../../utils/dom.js";
import { fmtIDR, parseFormattedNumber } from "../../../utils/formatters.js";
import { createModal, closeModal, resetFormDirty } from "../../components/modal.js";
import { toast } from "../../components/toast.js";
import { _createFormGroupHTML } from "../../components/forms/index.js";
import { emit } from "../../../state/eventBus.js"; // Import emit

function createIcon(iconName, size = 18, classes = '') {
    const icons = {
        'x-circle': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-circle ${classes}"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`, // Used for cancel
        'check-circle-2': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle-2 ${classes}"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>`, // Used for check_circle
        'pie-chart': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pie-chart ${classes}"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>`,
    };
    return icons[iconName] || '';
}

function _openSimulasiItemActionsModal(dataset) {
  const { id, title, description, fullAmount, partialAllowed } = dataset;
  const isSelected = appState.simulasiState.selectedPayments.has(id);

  const actions = [];

  if (isSelected) {
    actions.push({ label: 'Batalkan Pilihan', action: 'cancel', icon: 'x-circle' }); 
  } else {
    actions.push({ label: 'Pilih & Bayar Penuh', action: 'pay_full', icon: 'check-circle-2' }); 
    if (partialAllowed === 'true') {
      actions.push({ label: 'Bayar Sebagian', action: 'pay_partial', icon: 'pie-chart' });
    }
  }

  const content = `
        <div class="dense-list-container">
            ${actions.map(a => `
                <button class="dense-list-item btn btn-ghost" data-action="${a.action}">
                    <div class="item-main-content">
                        <div class="action-item-primary">
                            ${createIcon(a.icon, 20)}
                            <strong class="item-title">${a.label}</strong>
                        </div>
                    </div>
                </button>
            `).join('')}
        </div>`;

  const isMobile = window.matchMedia && window.matchMedia('(max-width: 599px)').matches;
  const modal = createModal('actionsPopup', {
    title: `${title}: ${description}`,
    content,
    layoutClass: isMobile ? 'is-bottom-sheet' : 'is-actions-menu'
  });

  if (modal) {
    modal.querySelectorAll('.btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = $(`.simulasi-item[data-id="${id}"]`);
        if (!card) return;

        const action = btn.dataset.action;
        const parentModal = btn.closest('.modal-bg');

        if (action === 'pay_partial') {
          if (parentModal) closeModal(parentModal);
          setTimeout(() => {
            _openSimulasiPartialPaymentModal(dataset);
          }, 300);
          return;
        }

        if (action === 'pay_full') {
          appState.simulasiState.selectedPayments.set(id, parseFormattedNumber(fullAmount));
          card.classList.add('selected');
        } else if (action === 'cancel') {
          appState.simulasiState.selectedPayments.delete(id);
          card.classList.remove('selected');
        }

        if (parentModal) closeModal(parentModal);

        setTimeout(() => {
          emit('ui.simulasi.recalcTotals');
        }, 300);
      });
    });
  }
}

function _openSimulasiPartialPaymentModal(dataset) {
  const { id, title, fullAmount } = dataset;
  const fullAmountNum = parseFormattedNumber(fullAmount);

  const formId = `partial-payment-form-${id}`;

  const content = `
        <form id="${formId}">
            <div class="simulasi-actions-modal-header">
                <h5>${title}</h5>
                <p>Total tagihan penuh: <strong>${fmtIDR(fullAmountNum)}</strong></p>
            </div>
            ${_createFormGroupHTML(
              'partial-payment-amount',
              'Jumlah Pembayaran Parsial',
              '<input type="text" name="amount" inputmode="numeric" required placeholder="mis. 500.000">'
            )}

            <div class="form-footer-actions">
                <button type="submit" class="btn btn-primary">Simpan</button>
            </div>
        </form>
    `;

  const isMobile = window.matchMedia && window.matchMedia('(max-width: 599px)').matches;
  const modal = createModal('actionsPopup', {
    title: 'Pembayaran Parsial',
    content: content,
    layoutClass: isMobile ? 'is-bottom-sheet' : 'is-simple-dialog'
  });

  const context = modal;

  if (context) {
    const form = $(`#${formId}`, context);
    const amountInput = form.querySelector('input[name="amount"]');

    amountInput.addEventListener('input', (e) => {
      const input = e.target;
      let selectionStart = input.selectionStart;
      const originalLength = input.value.length;
      const rawValue = parseFormattedNumber(input.value);

      if (isNaN(rawValue)) {
        input.value = '';
        return;
      }

      const formattedValue = new Intl.NumberFormat('id-ID').format(rawValue);

      if (input.value !== formattedValue) {
        input.value = formattedValue;
        const newLength = formattedValue.length;
        const diff = newLength - originalLength;
        if (selectionStart !== null) {
          input.setSelectionRange(selectionStart + diff, selectionStart + diff);
        }
      }
    });

    const closeCurrentView = () => {
      resetFormDirty();
      closeModal(modal);
    };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const amountToPay = parseFormattedNumber(amountInput.value);
      if (amountToPay <= 0) {
        toast('error', 'Jumlah harus lebih besar dari nol.');
        return;
      }
      if (amountToPay > fullAmountNum) {
        toast('error', `Jumlah tidak boleh melebihi total tagihan ${fmtIDR(fullAmountNum)}.`);
        return;
      }
      const card = $(`.simulasi-item[data-id="${id}"]`);
      if (card) {
        appState.simulasiState.selectedPayments.set(id, amountToPay);
        card.classList.add('selected');
      }
      closeCurrentView();
      setTimeout(() => {
        emit('ui.simulasi.recalcTotals');
      }, 300);
    });
  }
}

export { _openSimulasiItemActionsModal, _openSimulasiPartialPaymentModal };
