import { appState } from "../../../state/appState.js";
import { fmtIDR, parseLocaleNumber, parseFormattedNumber } from "../../../utils/formatters.js";
import { initCustomSelects, createMasterDataSelect } from "./customSelect.js";
import { formatNumberInput } from "./inputFormatters.js";

function createIcon(iconName, size = 18, classes = '') {
    const icons = {
        database: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-database ${classes}"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`,
        'trash-2': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2 ${classes}"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`, // Used for delete
    };
    return icons[iconName] || '';
}

export function addInvoiceItemRow(context, materialData = {}) {
    const isSuratJalan = context.querySelector('input[name="formType"]')?.value === 'surat_jalan';
    const itemsContainer = context.querySelector('#invoice-items-container');
    if (!itemsContainer) return;
    const index = itemsContainer.querySelectorAll('.multi-item-row').length;

    const materialOptions = (appState.materials || []).filter(m => !m.isDeleted).map(m => ({ value: m.id, text: m.materialName }));

    const materialDropdownHTML = createMasterDataSelect(`materialId_${index}`, '', materialOptions, materialData.id || '', 'materials', true)
        .replace('<div class="form-group">', '').replace('</div>', '')
        .replace(`<button type="button" class="btn-icon master-data-trigger" data-action="manage-master" data-type="materials">${createIcon('database')}</button>`, ''); 

    const newRowHTML = `
        <div class="multi-item-row" data-index="${index}">
            <div class="multi-item-main-line">
                <div class="item-name-wrapper">${materialDropdownHTML}</div>
                <button type="button" class="btn-icon btn-icon-danger remove-item-btn" data-action="remove-item-btn">${createIcon('trash-2')}</button> 
            </div>
            <div class="multi-item-details-line">
                <div class="form-group">
                    <label>Qty</label>
                    <input type="text" inputmode="decimal" pattern="[0-9]+([\\.,][0-9]+)?" name="itemQty" placeholder="Qty" class="item-qty" value="${materialData.qty || '1'}" required>
                </div>
                <div class="form-group">
                    <label>Harga Satuan</label>
                    <input type="text" inputmode="numeric" name="itemPrice" placeholder="Harga" class="item-price" value="${materialData.price ? new Intl.NumberFormat('id-ID').format(materialData.price) : (isSuratJalan ? fmtIDR(0).replace('Rp', '').trim() : '')}" ${isSuratJalan ? 'readonly' : 'required'}>
                </div>
            </div>
        </div>
    `;

    itemsContainer.insertAdjacentHTML('beforeend', newRowHTML);
    const newRowEl = itemsContainer.lastElementChild;
    initCustomSelects(newRowEl);

    const priceGroup = newRowEl.querySelector('.form-group:has(.item-price)');
    const priceInput = newRowEl.querySelector('.item-price');
    if (priceGroup && priceInput) {
        if (isSuratJalan) {
            priceInput.value = fmtIDR(0).replace('Rp', '').trim();
            priceInput.setAttribute('readonly', 'readonly');
            priceInput.closest('.form-group').querySelector('label').textContent = 'Harga Satuan (Rp 0)';
        } else {
            priceInput.removeAttribute('readonly');
            priceInput.closest('.form-group').querySelector('label').textContent = 'Harga Satuan';
        }
    }


    const qtyInput = newRowEl.querySelector('.item-qty');
    const priceInputListener = newRowEl.querySelector('.item-price');
    const form = context;

    if (qtyInput) qtyInput.addEventListener('input', () => handleInvoiceItemChange(form));
    if (priceInputListener) priceInputListener.addEventListener('input', (e) => {
        formatNumberInput(e);
        handleInvoiceItemChange(form);
    });

    const newSelectWrapper = newRowEl.querySelector('.custom-select-wrapper');
    if (newSelectWrapper) {
        const hiddenInput = newSelectWrapper.querySelector('input[type="hidden"]');
        hiddenInput.addEventListener('change', () => {
             handleInvoiceItemChange(form);
        });
    }
     import('../modal.js').then(({ markFormDirty }) => markFormDirty(true)); // Fix: Corrected path
}


export function handleInvoiceItemChange(formOrEvent) {
    const form = (formOrEvent.target && formOrEvent.target.closest) ? formOrEvent.target.closest('form') : formOrEvent;

    if (!form) {
        return;
    }

    if (form.elements['formType']?.value === 'surat_jalan') {
        const totalEl = form.querySelector('#invoice-total-amount');
        if (totalEl) totalEl.textContent = fmtIDR(0);
        return;
    }

    const itemsContainer = form.querySelector('#invoice-items-container');
    if (!itemsContainer) return;

    let total = 0;
    itemsContainer.querySelectorAll('.multi-item-row, .invoice-item-row').forEach(row => {
        const qEl = row.querySelector('.item-qty');
        const pEl = row.querySelector('.item-price');

        if (!qEl || !pEl || pEl.hasAttribute('readonly')) return;

        const qty = parseLocaleNumber(qEl.value || '0');
        const price = parseFormattedNumber(pEl.value || '0');

        if (formOrEvent.target === qEl) {
            let normalizedQty = qEl.value.replace(',', '.');
            normalizedQty = normalizedQty.replace(/[^0-9.]/g, '');
            const parts = normalizedQty.split('.');
            if (parts.length > 2) {
                normalizedQty = parts[0] + '.' + parts.slice(1).join('');
            }
            qEl.value = normalizedQty;
        }


        total += (qty || 0) * (price || 0);
    });

    const totalEl = form.querySelector('#invoice-total-amount');
    if (totalEl) totalEl.textContent = fmtIDR(total);
     import('../modal.js').then(({ markFormDirty }) => markFormDirty(true)); // Fix: Corrected path
}

