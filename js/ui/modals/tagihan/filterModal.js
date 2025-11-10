import { appState } from "../../../state/appState.js";
import { localDB } from "../../../services/localDbService.js";
// PERBAIKAN: Impor closeModalImmediate
import { createModal, closeModal, closeModalImmediate, handleDetailPaneBack } from "../../components/modal.js";
import { createMasterDataSelect, initCustomSelects } from "../../components/forms/index.js";

function createIcon(iconName, size = 18, classes = '') {
  const icons = {
      database: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-database ${classes}"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`,
      'chevron-down': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down ${classes}"><path d="m6 9 6 6 6-6"/></svg>`, // Used for arrow_drop_down
      'arrow-down': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-down ${classes}"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>`, // Used for arrow_downward
      'arrow-up': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-up ${classes}"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>`, // Used for arrow_upward
  };
  return icons[iconName] || '';
}


async function _showBillsFilterModal(onApply, options = {}) {
  const { useBottomSheet = false } = options;
  const allBillsEver = await localDB.bills.toArray();
  const allExpenses = await localDB.expenses.where('isDeleted').notEqual(1).toArray();
  const allSuppliers = await localDB.suppliers.toArray();

  const expenseMap = new Map(allExpenses.map(e => [e.id, e]));

  const relevantSupplierIds = new Set();
  allBillsEver.forEach(bill => {
    const expense = expenseMap.get(bill.expenseId);
    if (expense && expense.supplierId) {
      relevantSupplierIds.add(expense.supplierId);
    }
  });

  const projectOptions = [{ value: 'all', text: 'Semua Proyek' }, ...appState.projects.map(p => ({ value: p.id, text: p.projectName }))];

  const supplierOptions = [{ value: 'all', text: 'Semua Supplier' },
    ...allSuppliers
      .filter(s => relevantSupplierIds.has(s.id))
      .map(s => ({ value: s.id, text: s.supplierName }))
  ];
  const statusOptions = [
    { value: 'all', text: 'Semua Status' },
    { value: 'unpaid', text: 'Belum Lunas' },
    { value: 'paid', text: 'Lunas' },
    { value: 'delivery_order', text: 'Delivery Order' },
  ];

  const content = `
        <form id="bills-filter-form">
            ${createMasterDataSelect('filter-supplier-id', 'Filter Berdasarkan Supplier', supplierOptions, appState.billsFilter.supplierId, null, false)}
            ${createMasterDataSelect('filter-project-id', 'Filter Berdasarkan Proyek', projectOptions, appState.billsFilter.projectId, null, false)}
            <div class="form-group">
                 <label for="filter-expense-category">Kategori Pengeluaran</label>
                 <select id="filter-expense-category" name="expenseCategory">
                     <option value="all">Semua Kategori</option>
                     <option value="operasional" ${appState.billsFilter.expenseCategory === 'operasional' ? 'selected' : ''}>Operasional</option>
                     <option value="material" ${appState.billsFilter.expenseCategory === 'material' ? 'selected' : ''}>Material</option>
                     <option value="lainnya" ${appState.billsFilter.expenseCategory === 'lainnya' ? 'selected' : ''}>Lainnya</option>
                 </select>
             </div>
             <div class="rekap-filters date-grid-single">
                <div class="form-group"><label>Dari Tanggal</label><input type="date" id="search-start-date" value="${appState.billsFilter.dateStart || ''}"></div>
                <div class="form-group"><label>Sampai Tanggal</label><input type="date" id="search-end-date" value="${appState.billsFilter.dateEnd || ''}"></div>
            </div>
        </form>
    `;

  const footer = `
        <button type="button" id="reset-filter-btn" class="btn btn-secondary">Reset</button>
        <button type="submit" class="btn btn-primary" form="bills-filter-form">Terapkan Filter</button>
    `;

  const modalEl = createModal('formView', {
      title: 'Filter Tagihan',
      content,
      footer,
      isBottomSheet: useBottomSheet
  });
  if (!modalEl) return;

  initCustomSelects(modalEl);

  modalEl.querySelector('#bills-filter-form').addEventListener('submit', (e) => {
    e.preventDefault();
    appState.billsFilter.projectId = modalEl.querySelector('#filter-project-id').value;
    appState.billsFilter.supplierId = modalEl.querySelector('#filter-supplier-id').value;
    appState.billsFilter.expenseCategory = modalEl.querySelector('#filter-expense-category').value;
    appState.billsFilter.dateStart = modalEl.querySelector('#search-start-date').value || '';
    appState.billsFilter.dateEnd = modalEl.querySelector('#search-end-date').value || '';
    if (typeof onApply === 'function') onApply();
    closeModalImmediate(modalEl);
  });

  modalEl.querySelector('.modal-footer #reset-filter-btn').addEventListener('click', () => {
    appState.billsFilter.projectId = 'all';
    appState.billsFilter.supplierId = 'all';
    appState.billsFilter.expenseCategory = 'all';
    appState.billsFilter.dateStart = '';
    appState.billsFilter.dateEnd = '';
    if (typeof onApply === 'function') onApply();
    closeModalImmediate(modalEl);
  });
}

function _showBillsSortModal(onApply) {
  const { sortBy, sortDirection } = appState.billsFilter;
  const content = `
      <form id="bills-sort-form">
          <div class="form-group">
              <label>Urutkan Berdasarkan</label>
              <div class="segmented-control">
                  <input type="radio" id="sort-due-date" name="sortBy" value="dueDate" ${sortBy === 'dueDate' ? 'checked' : ''}>
                  <label for="sort-due-date">Tanggal</label>
                  <input type="radio" id="sort-amount" name="sortBy" value="amount" ${sortBy === 'amount' ? 'checked' : ''}>
                  <label for="sort-amount">Jumlah</label>
              </div>
          </div>
          <div class="form-group">
              <label>Arah Pengurutan</label>
              <div class="segmented-control" id="sort-direction-control">
                  <input type="radio" id="sort-desc" name="sortDir" value="desc" ${sortDirection === 'desc' ? 'checked' : ''}>
                  <label for="sort-desc">${createIcon('arrow-down', 16)} Terbaru/Tertinggi</label>
                  <input type="radio" id="sort-asc" name="sortDir" value="asc" ${sortDirection === 'asc' ? 'checked' : ''}>
                  <label for="sort-asc">${createIcon('arrow-up', 16)} Terlama/Terendah</label>
              </div>
          </div>
      </form>
  `;

  const footer = `<button type="submit" class="btn btn-primary" form="bills-sort-form">Terapkan</button>`;

  // PERBAIKAN: Tambahkan isUtility: true
  const modalEl = createModal('formView', {
    title: 'Urutkan Tagihan',
    content,
    footer,
    isUtility: true
  });
  if (!modalEl) return;

  const form = modalEl.querySelector('#bills-sort-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    appState.billsFilter.sortBy = form.querySelector('input[name="sortBy"]:checked').value;
    appState.billsFilter.sortDirection = form.querySelector('input[name="sortDir"]:checked').value;
    if (typeof onApply === 'function') onApply();
    // PERBAIKAN: Gunakan closeModalImmediate
    closeModalImmediate(modalEl);
  });
}

export { _showBillsFilterModal, _showBillsSortModal };
