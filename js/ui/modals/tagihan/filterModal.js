import { appState } from "../../../state/appState.js";
import { createModal, closeModalImmediate } from "../../components/modal.js";
import { createModalSelectField, initModalSelects } from "../../components/forms/index.js";

function createIcon(iconName, size = 18, classes = '') {
  const icons = {
      database: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-database ${classes}"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`,
      'chevron-down': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down ${classes}"><path d="m6 9 6 6 6-6"/></svg>`, // Used for arrow_drop_down
      'arrow-down': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-down ${classes}"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>`, // Used for arrow_downward
      'arrow-up': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-up ${classes}"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>`, // Used for arrow_upward
  };
  return icons[iconName] || '';
}


function buildFilterOptions() {
  const activeTab = appState.activeSubPage.get('tagihan') || 'tagihan';
  const bills = Array.isArray(appState.bills) ? appState.bills : [];
  const expenses = Array.isArray(appState.expenses) ? appState.expenses : [];
  const suppliers = Array.isArray(appState.suppliers) ? appState.suppliers : [];
  const projects = Array.isArray(appState.projects) ? appState.projects : [];

  const expenseMap = new Map(expenses.map(exp => [exp.id, exp]));
  let relevantItems = [];
  if (activeTab === 'surat_jalan') {
      relevantItems = expenses.filter(exp => exp.status === 'delivery_order' && !exp.isDeleted);
  } else if (activeTab === 'lunas') {
      relevantItems = bills.filter(bill => bill.status === 'paid' && !bill.isDeleted);
  } else {
      relevantItems = bills.filter(bill => bill.status === 'unpaid' && !bill.isDeleted);
  }

  const supplierIds = new Set();
  const projectIds = new Set();
  const categoryIds = new Set();

  relevantItems.forEach(item => {
      const sourceExpense = activeTab === 'surat_jalan' ? item : expenseMap.get(item.expenseId);
      const supplierId = sourceExpense?.supplierId;
      const projectId = sourceExpense?.projectId || item.projectId;
      const category = (item.type || sourceExpense?.type || '').toLowerCase();
      if (supplierId) supplierIds.add(supplierId);
      if (projectId) projectIds.add(projectId);
      if (category) categoryIds.add(category);
  });

  const supplierOptions = [
      { value: 'all', text: 'Semua Supplier' },
      ...suppliers.filter(s => supplierIds.has(s.id)).map(s => ({ value: s.id, text: s.supplierName }))
  ];

  const projectOptions = [
      { value: 'all', text: 'Semua Proyek' },
      ...projects.filter(p => projectIds.has(p.id)).map(p => ({ value: p.id, text: p.projectName }))
  ];

  const categoryBase = [
      { value: 'all', text: 'Semua Kategori' },
      { value: 'gaji', text: 'Gaji' },
      { value: 'material', text: 'Material' },
      { value: 'operasional', text: 'Operasional' },
      { value: 'lainnya', text: 'Lainnya' }
  ];
  const categoryOptions = categoryBase.filter(opt => opt.value === 'all' || categoryIds.has(opt.value));

  return { supplierOptions, projectOptions, categoryOptions };
}

async function _showBillsFilterModal(onApply) {
  const { supplierOptions, projectOptions, categoryOptions } = buildFilterOptions();
  const selectProject = createModalSelectField({
    id: 'filter-project-id',
    label: 'Filter Proyek',
    options: projectOptions.map(opt => ({ value: opt.value, label: opt.text })),
    value: appState.billsFilter.projectId || 'all',
    placeholder: 'Semua proyek'
  });
  const selectSupplier = createModalSelectField({
    id: 'filter-supplier-id',
    label: 'Filter Supplier',
    options: supplierOptions.map(opt => ({ value: opt.value, label: opt.text })),
    value: appState.billsFilter.supplierId || 'all',
    placeholder: 'Semua supplier'
  });
  const selectCategory = createModalSelectField({
    id: 'filter-category',
    label: 'Kategori',
    options: categoryOptions.map(opt => ({ value: opt.value, label: opt.text })),
    value: appState.billsFilter.category || 'all',
    placeholder: 'Semua kategori'
  });

  const content = `
        <form id="bills-filter-form">
            ${selectProject}
            ${selectSupplier}
            ${selectCategory}
        </form>
    `;

  const footer = `
        <button type="button" id="reset-filter-btn" class="btn btn-secondary">Reset</button>
        <button type="submit" class="btn btn-primary" form="bills-filter-form">Terapkan</button>
    `;

  const isMobile = window.matchMedia('(max-width: 599px)').matches;
  const modalEl = createModal(isMobile ? 'actionsPopup' : 'formView', {
    title: 'Filter Tagihan',
    content,
    footer,
    isUtility: true,
    allowContentOverflow: true,
    layoutClass: isMobile ? 'is-bottom-sheet' : ''
  });
  if (!modalEl) return;

  initModalSelects(modalEl);

  const form = modalEl.querySelector('#bills-filter-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const nextFilters = {
      projectId: form.querySelector('#filter-project-id')?.value || 'all',
      supplierId: form.querySelector('#filter-supplier-id')?.value || 'all',
      category: form.querySelector('#filter-category')?.value || 'all'
    };
    appState.billsFilter = {
      ...appState.billsFilter,
      projectId: nextFilters.projectId,
      supplierId: nextFilters.supplierId,
      category: nextFilters.category,
      searchTerm: '',
      status: 'all',
      dateStart: '',
      dateEnd: ''
    };
    if (typeof onApply === 'function') onApply();
    closeModalImmediate(modalEl);
  });

  modalEl.querySelector('#reset-filter-btn').addEventListener('click', () => {
    appState.billsFilter = {
      ...appState.billsFilter,
      projectId: 'all',
      supplierId: 'all',
      category: 'all',
      searchTerm: '',
      status: 'all',
      dateStart: '',
      dateEnd: ''
    };
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
  const isMobile = window.matchMedia('(max-width: 599px)').matches;
  const modalEl = createModal(isMobile ? 'actionsPopup' : 'formView', {
    title: 'Urutkan Tagihan',
    content,
    footer,
    isUtility: true,
    layoutClass: isMobile ? 'is-bottom-sheet' : ''
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
