import { appState } from "../../../state/appState.js";
import { createModal, closeModal, closeModalImmediate, showDetailPane } from "../../components/modal.js";
import { fmtIDR, parseFormattedNumber } from "../../../utils/formatters.js";
import { emit, on, off } from "../../../state/eventBus.js";
import { getFormPengeluaranHTML, getFormFakturMaterialHTML, attachPengeluaranFormListeners, _createAttachmentManagerHTML, _attachSingleFileUploadListener } from "../../components/forms/index.js";
import { animateNumber } from "../../../utils/dom.js";
import { aggregateSalaryBillWorkers, getSalarySummaryStats } from "../../components/cards.js";

function createIcon(iconName, size = 18, classes = '') {
    const icons = {
        payment: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-credit-card ${classes}"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
        save: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-save ${classes}"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
        visibility: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye ${classes}"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
        history: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-history ${classes}"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>`,
        forum: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-square ${classes}"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
        attachment: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-paperclip ${classes}"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
        list: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-list ${classes}"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>`,
        delete: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2 ${classes}"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
        edit: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pencil ${classes}"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
        receipt_long: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-receipt-text ${classes}"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1Z"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/></svg>`,
        printer: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-printer ${classes}"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>`,
        coins: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-coins ${classes}"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>`,
        sticky_note: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sticky-note ${classes}"><path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v6h6"/></svg>`,
        calendar_x: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar-x-2 ${classes}"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m10 16 4 4"/><path d="m14 16-4 4"/></svg>`
    };
    return icons[iconName.replace(/-/g, '_')] || icons[iconName] || '';
}

function _openPaymentBillModal(bill, options = {}) {
    const parseIdList = (value) => {
        if (!value) return [];
        if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
        if (typeof value === 'string') return value.split(',').map(part => part.trim()).filter(Boolean);
        return [];
    };

    const isSalaryBill = bill?.type === 'gaji';
    const rawBillIds = parseIdList(options.billIds || options['bill-ids']);
    const targetBillIds = isSalaryBill && rawBillIds.length ? rawBillIds : (bill?.id ? [bill.id] : []);
    const workerIdHint = options.workerId
        || options['worker-id']
        || bill?.workerId
        || bill?.workerDetails?.[0]?.workerId
        || bill?.workerDetails?.[0]?.id
        || '';

    const sourceBills = targetBillIds
        .map(id => (bill && bill.id === id ? bill : (appState.bills?.find(b => b.id === id) || null)))
        .filter(Boolean);

    let workerSummary = null;
    if (isSalaryBill && typeof aggregateSalaryBillWorkers === 'function' && sourceBills.length) {
        const aggregates = aggregateSalaryBillWorkers(sourceBills, { allSalaryBills: sourceBills, sourceItems: sourceBills });
        if (workerIdHint) {
            workerSummary = aggregates.find(entry => entry.workerId === workerIdHint);
        }
        if (!workerSummary && aggregates.length === 1) {
            workerSummary = aggregates[0];
        }
    }

    let totalAmount = 0;
    let paidAmount = 0;

    if (sourceBills.length > 0) {
        totalAmount = sourceBills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
        paidAmount = sourceBills.reduce((sum, b) => sum + (Number(b.paidAmount) || 0), 0);
    } else {
        totalAmount = Number(bill.amount || 0);
        paidAmount = Number(bill.paidAmount || 0);
    }

    const remaining = Math.max(0, totalAmount - paidAmount);
    const amountFormatted = new Intl.NumberFormat('id-ID').format(remaining);
    const todayString = new Date().toISOString().slice(0, 10);

    const workerName = workerSummary?.workerName || (bill?.workerDetails?.length === 1 ? bill.workerDetails[0].name : bill?.description) || 'Pekerja';
    const summaryCount = sourceBills.length;

    const attachmentHTML = _createAttachmentManagerHTML({}, {
        singleOptional: true,
        inputName: 'paymentAttachment',
        containerId: 'new-payment-attachment-container'
    });

    const remainingLabelText = isSalaryBill ? 'Sisa Gaji' : 'Sisa Tagihan';

    const content = `
      <div class="payment-panel card card-pad">
          
          <div class="payment-panel__hero payment-panel__hero--salary">
              ${isSalaryBill ? `
              <div class="payment-panel__hero-card">
                  <span class="payment-panel__hero-label">Pekerja</span>
                  <strong>${workerName}</strong>
                  <span class="payment-panel__hero-note">${summaryCount > 1 ? `${summaryCount} rekapan` : '1 rekapan'}</span>
              </div>` : ''}
  
              <div class="payment-panel__hero-card payment-panel__hero-card--accent">
                  <span class="payment-panel__hero-label" id="payment-remaining-label">${remainingLabelText}</span>
                  <strong class="payment-panel__hero-primary-amount" id="payment-remaining-amount" data-raw-amount="${remaining}">${fmtIDR(remaining)}</strong>
              </div>
  
              <div class="payment-panel__hero-card">
                  <span class="payment-panel__hero-label">Sudah Terbayar</span>
                  <strong>${fmtIDR(paidAmount)}</strong>
              </div>
          </div>
  
          <div class="payment-panel__quick">
              <button type="button" class="btn btn-secondary" data-action="set-payment-full">Bayar Lunas</button>
              <button type="button" class="btn btn-secondary" data-action="set-payment-half">Bayar Setengah</button>
          </div>
  
          <form id="payment-form" data-id="${bill.id}" data-type="bill">
              <div class="payment-panel__form">
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
                      <input type="file" name="paymentAttachment" accept="image/*" class="hidden-file-input" style="display:none;">
                  </div>
              </div>
          </form>
      </div>`;

    // REVISI: Pusatkan tombol bayar
    const footer = `
          <div class="form-footer-actions" style="justify-content: center; width: 100%;">
              <button type="submit" class="btn btn-primary" form="payment-form" style="min-width: 200px; justify-content: center;">
                  ${createIcon('payment')} <span style="margin-left:8px;">Konfirmasi Pembayaran</span>
              </button>
          </div>`;

    const detailPane = showDetailPane({ title: 'Pembayaran Tagihan', content, footer });
    if (!detailPane) return;

    emit('ui.detailPane.formReady', { context: detailPane });

    _attachSingleFileUploadListener(detailPane, 'paymentAttachment', '#new-payment-attachment-container');

    const amountInput = detailPane.querySelector('#payment-input-amount');
    const remainingAmountEl = detailPane.querySelector('#payment-remaining-amount');
    const remainingLabelEl = detailPane.querySelector('#payment-remaining-label');
    const originalRemaining = parseFloat(remainingAmountEl.dataset.rawAmount);

    if (amountInput && remainingAmountEl && remainingLabelEl) {
        amountInput.addEventListener('input', () => {
            const amountToPay = parseFormattedNumber(amountInput.value);
            const newRemaining = originalRemaining - amountToPay;
            animateNumber(remainingAmountEl, newRemaining);
            remainingLabelEl.textContent = "Sisa Setelah Bayar";
        });
    }
    emit('ui.forms.init', detailPane);
}

export function openBillPaymentModal(billId, options = {}) {
    const bill = (appState.bills || []).find(b => b.id === billId);
    if (!bill) {
        emit('ui.toast', { args: ['error', 'Tagihan tidak ditemukan'] });
        return;
    }
    _openPaymentBillModal(bill, options);
}

export function handleOpenItemActionsModal({ id, type, expenseId }, targetRect = null) {
    const effectiveId = id.startsWith('expense-') ? id.substring(8) : id;
    const effectiveExpenseId = expenseId || (type === 'expense' ? effectiveId : null);

    if (effectiveExpenseId) {
        const expense = appState.expenses.find(e => e.id === effectiveExpenseId);
        if (expense && expense.status === 'delivery_order') {
            return handleOpenSuratJalanActionsModal({ id: expense.id, type: 'expense', expenseId: expense.id }, targetRect);
        }
    }

    const bill = appState.bills.find(b => b.id === effectiveId || b.expenseId === effectiveExpenseId);

    if (!bill) {
        emit('ui.toast', { args: ['error', 'Data tagihan tidak dapat ditemukan.'] });
        return;
    }

    const finalId = bill.id;
    const finalExpenseId = bill.expenseId;

    const actions = [];
    const exp = finalExpenseId ? appState.expenses.find(e => e.id === finalExpenseId) : null;

    actions.push({ label: 'Lihat Detail', action: 'open-bill-detail', icon: 'visibility', id: finalId, type: 'bill', expenseId: finalExpenseId });

    if ((bill.status || 'unpaid') !== 'paid') {
        actions.push({ label: 'Bayar Tagihan', action: 'pay-bill', icon: 'payment', id: finalId, type: 'bill', expenseId: finalExpenseId });
    }

    if (bill.paidAmount > 0) {
        actions.push({ label: 'Riwayat Pembayaran', action: 'open-payment-history-modal', icon: 'history', id: finalId });
    }

    const parentId = (bill.type === 'gaji') ? finalId : finalExpenseId;
    const parentType = (bill.type === 'gaji') ? 'bill' : 'expense';
    if (parentId) actions.push({ label: 'Komentar', action: 'open-comments-view', icon: 'forum', parentId, parentType });

    if (exp && ((Array.isArray(exp.attachments) && exp.attachments.length > 0) || exp.attachmentUrl)) {
        const count = (exp.attachments && exp.attachments.length) ? exp.attachments.length : (exp.attachmentUrl ? 1 : 0);
        actions.push({ label: `Lampiran (${count})`, action: 'open-attachments', icon: 'attachment', id: exp.id, expenseId: exp.id });
    }

    if ((exp && Array.isArray(exp.items) && exp.items.length > 0) || finalExpenseId) {
        actions.push({ label: 'Detail Faktur Material', action: 'viewInvoiceItems', icon: 'list', id: finalId, expenseId: finalExpenseId });
    }

    actions.push({ label: 'Hapus', action: 'delete-item', icon: 'delete', id: finalId, type: 'bill', isDanger: true });
    if (exp && (exp.type === 'material' || exp.type === 'operasional' || exp.type === 'lainnya')) {
        actions.push({ label: 'Edit', action: 'open-edit-expense', icon: 'edit', id: exp.id, expenseId: exp.id, table: 'expenses' });
    }


    const isDesktop = window.matchMedia('(min-width: 600px)').matches;
    let modalEl;

    if (isDesktop && targetRect) {
        document.querySelectorAll('.actions-menu.detail-pane-actions-menu').forEach(m => m.remove());
        const menu = document.createElement('div');
        menu.className = 'actions-menu detail-pane-actions-menu';
        menu.style.top = `${targetRect.bottom + 4}px`;
        menu.style.right = `${window.innerWidth - targetRect.right}px`;
        const menuHTML = actions.map(a => `<button class="actions-menu-item ${a.isDanger ? 'danger' : ''}" data-action="${a.action}"
             ${a.id ? `data-id="${a.id}" data-item-id="${a.id}"` : ''}
             ${a.type ? `data-type="${a.type}"` : ''}
             ${a.expenseId ? `data-expense-id="${a.expenseId}"` : ''}
             ${a.billId ? `data-bill-id="${a.billId}"` : ''}
             ${a.parentId ? `data-parent-id="${a.parentId}"` : ''}
             ${a.parentType ? `data-parent-type="${a.parentType}"` : ''}
          >${createIcon(a.icon, 20)}<span>${a.label}</span></button>`).join('');
        menu.innerHTML = menuHTML;
        document.body.appendChild(menu);
        const closeMenu = (ev) => {
            const triggerButton = ev.target.closest('[data-action="open-item-actions-modal"]');
            if (!menu.contains(ev.target) && triggerButton !== targetRect.target) {
                menu.remove();
                document.removeEventListener('click', closeMenu, true);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu, true), 0);
        modalEl = menu;
    } else {
        const content = `
            <div class="actions-modal-list">
            ${actions.map(a => `<button class="actions-menu-item ${a.isDanger ? 'danger' : ''}" data-action="${a.action}"
                ${a.id ? `data-id="${a.id}" data-item-id="${a.id}"` : ''}
                ${a.type ? `data-type="${a.type}"` : ''}
                ${a.expenseId ? `data-expense-id="${a.expenseId}"` : ''}
                ${a.billId ? `data-bill-id="${a.billId}"` : ''}
                ${a.parentId ? `data-parent-id="${a.parentId}"` : ''}
                ${a.parentType ? `data-parent-type="${a.parentType}"` : ''}
                >${createIcon(a.icon, 20)}<span>${a.label}</span></button>`).join('')}
            </div>`;
        modalEl = createModal('actionsPopup', { title: bill.description || 'Pilih Aksi', content });
    }

    if (modalEl) {
        modalEl.addEventListener('click', (e) => {
            const button = e.target.closest('.actions-menu-item');
            if (!button) return;
            e.stopPropagation();
            const action = button.dataset.action;
            const dataset = { ...button.dataset, itemId: button.dataset.id };
            emit(`ui.action.${action}`, dataset);
            if (!isDesktop || !targetRect) {
                setTimeout(() => {
                    closeModalImmediate(modalEl);
                }, 50);
            } else {
                if (modalEl.parentNode) modalEl.remove();
            }
        });
    }
}

export function handleOpenSuratJalanActionsModal({ id, type, expenseId }, targetRect = null) {
    if (type !== 'expense') return;
    const expense = appState.expenses.find(e => e.id === id);

    if (!expense) {
        emit('ui.toast', { args: ['error', 'Data Surat Jalan tidak ditemukan.'] });
        return;
    }
    if (expense.status !== 'delivery_order') {
        emit('ui.toast', { args: ['error', `Status item salah: ${expense.status}`] });
        return;
    }

    const actions = [
        { label: 'Lihat Rincian Barang', action: 'viewInvoiceItems', icon: 'list', id: expense.id, expenseId: expense.id },
        { label: 'Jadikan Tagihan', action: 'convert-surat-jalan', icon: 'receipt_long', id: expense.id, expenseId: expense.id },
        { label: 'Edit Surat Jalan', action: 'edit-surat-jalan', icon: 'edit', id: expense.id, expenseId: expense.id },
        { label: 'Hapus', action: 'delete-item', icon: 'delete', id: expense.id, expenseId: expense.id, type: 'expense', isDanger: true }
    ];

    if ((Array.isArray(expense.attachments) && expense.attachments.length > 0) || expense.attachmentUrl) {
        const count = (expense.attachments && expense.attachments.length) ? expense.attachments.length : (expense.attachmentUrl ? 1 : 0);
        actions.push({ label: `Lampiran (${count})`, action: 'open-attachments', icon: 'attachment', id: expense.id, expenseId: expense.id });
    }

    const content = `
        <div class="actions-modal-list">
        ${actions.map(a => `<button class="actions-menu-item ${a.isDanger ? 'danger' : ''}" data-action="${a.action}" data-id="${a.id}" data-item-id="${a.id}" data-type="${a.type || 'expense'}" ${a.expenseId ? `data-expense-id="${a.expenseId}"` : ''}>
            ${createIcon(a.icon, 20)}<span>${a.label}</span>
        </button>`).join('')}
        </div>`;
    const modalEl = createModal('actionsPopup', { title: expense.description || 'Aksi Surat Jalan', content });

    if (modalEl) {
        modalEl.addEventListener('click', (e) => {
            const button = e.target.closest('.actions-menu-item');
            if (!button) return;
            const action = button.dataset.action;
            const dataset = { ...button.dataset, itemId: button.dataset.id };
            emit(`ui.action.${action}`, dataset);
            setTimeout(() => {
                closeModalImmediate(modalEl);
            }, 50);
        });
    }
}

export function openEditExpenseModal(expense, options = {}) {
    try {
        const { convert = false } = options;
        const isSuratJalan = expense.status === 'delivery_order';
        const isSuratJalanConversion = isSuratJalan && convert;

        const title = isSuratJalanConversion ? `Konversi: ${expense.description}` : `Edit: ${expense.description}`;

        let content = '';
        const mapToOpts = (arr, key) => (arr || []).filter(x => x && !x.isDeleted).map(x => ({ value: x.id, text: x[key] }));
        const allProjectOptions = mapToOpts(appState.projects, 'projectName');
        const allSupplierOptions = mapToOpts(appState.suppliers, 'supplierName');

        if (expense.type === 'material') {
            content = getFormFakturMaterialHTML(expense, { convertToInvoice: isSuratJalanConversion });
        } else {
            let categoryOptions = [];
            let masterType = '';
            let categoryLabel = 'Kategori';
            let supplierCategoryFilter = '';

            if (expense.type === 'operasional') {
                categoryOptions = mapToOpts(appState.operationalCategories, 'categoryName');
                masterType = 'op-cats';
                categoryLabel = 'Kategori Operasional';
                supplierCategoryFilter = 'Operasional';
            } else if (expense.type === 'lainnya') {
                categoryOptions = mapToOpts(appState.otherCategories, 'categoryName');
                masterType = 'other-cats';
                categoryLabel = 'Kategori Lainnya';
                supplierCategoryFilter = 'Lainnya';
            }

            const filteredSupplierOptions = supplierCategoryFilter
                ? allSupplierOptions.filter(opt => {
                    const supplier = appState.suppliers.find(s => s.id === opt.value);
                    return supplier && supplier.category === supplierCategoryFilter;
                })
                : allSupplierOptions;

            content = getFormPengeluaranHTML(expense.type, categoryOptions, masterType, categoryLabel, filteredSupplierOptions, allProjectOptions, expense);
        }

        const footer = `<div class="form-footer-actions"><button type="submit" class="btn btn-primary" form="edit-item-form">${createIcon('save', 18)}<span>Simpan</span></button></div>`;

        showDetailPane({ title, content, footer });

        const detailPaneContext = document.getElementById('detail-pane');
        if (detailPaneContext) {
            emit('ui.detailPane.formReady', { context: detailPaneContext });
            if (expense.type === 'material' || expense.type === 'operasional' || expense.type === 'lainnya') {
                attachPengeluaranFormListeners(expense.type, detailPaneContext);
            }
            emit('ui.forms.init', detailPaneContext);
        }
    } catch (e) {
        console.error("Failed to open edit expense modal:", e);
        // emit('ui.toast', {args: ['error', 'Gagal membuka form edit.']}); // Use emit instead of toast() which is undefined
    }
}