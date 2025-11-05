import { appState } from "../../../state/appState.js";
// PERBAIKAN: Impor closeModalImmediate
import { createModal, closeModal, closeModalImmediate } from "../../components/modal.js";
import { createMasterDataSelect, initCustomSelects } from "../../components/forms/index.js";

function _showBillsSearchModal(onApply) {
  const typeOptions = [
    { value: 'all', text: 'Semua Tipe' },
    { value: 'material', text: 'Material' },
    { value: 'operasional', text: 'Operasional' },
    { value: 'gaji', text: 'Gaji' },
    { value: 'fee', text: 'Fee' },
    { value: 'lainnya', text: 'Lainnya' }
  ];
  const statusOptions = [
    { value: 'all', text: 'Semua Status' },
    { value: 'unpaid', text: 'Belum Lunas' },
    { value: 'paid', text: 'Lunas' },
    { value: 'delivery_order', text: 'Delivery Order' },
  ];
  const supplierOptions = [{ value: 'all', text: 'Semua Supplier' }, ...appState.suppliers.map(s => ({ value: s.id, text: s.supplierName }))];

  const content = `
    <form id="bills-search-form">
      <div class="form-group">
        <label>Cari</label>
        <input type="search" id="search-term" placeholder="Ketik kata kunci..." value="${appState.billsFilter.searchTerm || ''}" autocomplete="off">
      </div>
      ${createMasterDataSelect('search-type', 'Tipe Tagihan', typeOptions, appState.billsFilter.category || 'all')}
      ${createMasterDataSelect('search-status', 'Status', statusOptions, appState.billsFilter.status || 'all')}
      ${createMasterDataSelect('search-supplier', 'Supplier', supplierOptions, appState.billsFilter.supplierId || 'all', 'suppliers')}
      <div class="rekap-filters" style="padding:0; margin-top:1rem;">
        <div class="form-group"><label>Dari Tanggal</label><input type="date" id="search-start-date" value="${appState.billsFilter.dateStart || ''}"></div>
        <div class="form-group"><label>Sampai Tanggal</label><input type="date" id="search-end-date" value="${appState.billsFilter.dateEnd || ''}"></div>
      </div>
    </form>`;

  const footer = `
    <button type="button" id="reset-search-btn" class="btn btn-secondary">Reset</button>
    <button type="submit" class="btn btn-primary" form="bills-search-form">Terapkan</button>
    `;

  // PERBAIKAN: Tambahkan isUtility: true
  const modalEl = createModal('formView', { title: 'Cari Tagihan', content, footer, isUtility: true });
  if (!modalEl) return;
  initCustomSelects(modalEl);

  const form = modalEl.querySelector('#bills-search-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    appState.billsFilter.searchTerm = modalEl.querySelector('#search-term').value.trim();
    appState.billsFilter.category = modalEl.querySelector('#search-type').value || 'all';
    appState.billsFilter.status = modalEl.querySelector('#search-status').value || 'all';
    appState.billsFilter.supplierId = modalEl.querySelector('#search-supplier').value || 'all';
    appState.billsFilter.dateStart = modalEl.querySelector('#search-start-date').value || '';
    appState.billsFilter.dateEnd = modalEl.querySelector('#search-end-date').value || '';
    if (typeof onApply === 'function') onApply();
    // PERBAIKAN: Gunakan closeModalImmediate
    closeModalImmediate(modalEl);
  });

  modalEl.querySelector('.modal-footer #reset-search-btn').addEventListener('click', () => {
    appState.billsFilter.searchTerm = '';
    appState.billsFilter.category = 'all';
    appState.billsFilter.status = 'all';
    appState.billsFilter.supplierId = 'all';
    appState.billsFilter.dateStart = '';
    appState.billsFilter.dateEnd = '';
    if (typeof onApply === 'function') onApply();
    // PERBAIKAN: Gunakan closeModalImmediate
    closeModalImmediate(modalEl);
  });
}

export { _showBillsSearchModal };
