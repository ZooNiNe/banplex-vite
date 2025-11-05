// PERBAIKAN: Impor closeModalImmediate
import { createModal, closeModal, closeModalImmediate, showDetailPane } from "../../../ui/components/modal.js";
import { createMasterDataSelect, initCustomSelects } from "../../../ui/components/forms/index.js";
import { fetchAndCacheData } from "../../../services/data/fetch.js";
import { projectsCol, suppliersCol } from "../../../config/firebase.js";
import { appState } from "../../../state/appState.js";
import { handleDownloadReport } from "../../../services/reportService.js";

function createIcon(iconName, size = 18, classes = '') {
    const icons = {
        download: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download ${classes}"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
    };
    return icons[iconName] || '';
}

async function handleGenerateReportModal() {
  const reportTypeOptions = [
    { value: 'accounting_statements', text: 'Laporan Akuntansi Proyek (PDF)' },
    { value: 'charts_presentation', text: 'Laporan Presentasi Grafik (PDF)' },
    { value: 'analisis_beban', text: 'Analisis Beban (PDF)' },
    { value: 'upah_pekerja', text: 'Laporan Rinci Upah Pekerja (PDF)' },
    { value: 'material_supplier', text: 'Laporan Rinci Material (PDF)' },
    { value: 'material_usage_per_project', text: 'Pemakaian Material per Proyek (PDF)' },
    { value: 'rekapan', text: 'Laporan Rekapan Transaksi (PDF)' }
  ];
  const validReportTypes = new Set(reportTypeOptions.map(o => o.value));

  const optionsHTML = reportTypeOptions.map((opt) => {
    return (
      `<div class="detail-list-item interactive">` +
      `<div class="item-main"><span class="item-title">${opt.text}</span></div>` +
      `<div class="item-secondary"><button type="button" class="btn btn-secondary" data-action="select-report-type" data-type="${opt.value}">Pilih</button></div>` +
      `</div>`
    );
  }).join('');

  const content = `
    <form id="report-generator-form" style="margin:0;">
      <div class="dense-list-container" id="report-type-actions">${optionsHTML}</div>
      <div id="report-dynamic-filters"></div>
    </form>
  `;

  const footer = `
    <button id="download-report-btn" class="btn btn-primary" disabled>
      ${createIcon('download')}
      <span>Unduh</span>
    </button>`;

  const isMobile = window.matchMedia('(max-width: 599px)').matches;
  let rootEl;
  if (isMobile) {
    // PERBAIKAN: Tambahkan isUtility: true
    rootEl = createModal('actionsPopup', { title: 'Buat Laporan Rinci', content, footer, isUtility: true });
  } else {
    // Desktop: open in detail pane
    rootEl = showDetailPane({ title: 'Buat Laporan Rinci', content: content + (footer ? `<div class=\"detail-pane-footer\">${footer}</div>` : '') });
  }
  if (!rootEl) return;

  initCustomSelects(rootEl);

  const submitButton = rootEl.querySelector('#download-report-btn');
  const filtersContainer = rootEl.querySelector('#report-dynamic-filters');
  let selectedType = '';

  const renderDynamicFilters = async (reportType) => {
    if (!filtersContainer) return;
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const todayStr = today.toISOString().slice(0, 10);
    let filtersHTML = '';

    if (reportType && reportType !== 'analisis_beban') {
      filtersHTML += `
        <div class="rekap-filters" style="padding:0; margin-top:1rem;">
          <div class="form-group"><label>Dari Tanggal</label><input type="date" id="report-start-date" value="${firstDayOfMonth}"></div>
          <div class="form-group"><label>Sampai Tanggal</label><input type="date" id="report-end-date" value="${todayStr}"></div>
        </div>`;
    }

    if (reportType === 'rekapan') {
      await fetchAndCacheData('projects', projectsCol, 'projectName');
      const projectOptions = [{ value: 'all', text: 'Semua Proyek' }, ...appState.projects.map(p => ({ value: p.id, text: p.projectName }))];
      filtersHTML += createMasterDataSelect('report-project-id', 'Filter Proyek', projectOptions, 'all');
    } else if (reportType === 'material_supplier') {
      await fetchAndCacheData('suppliers', suppliersCol, 'supplierName');
      const supplierOptions = [{ value: 'all', text: 'Semua Supplier' }, ...appState.suppliers.filter(s => s.category === 'Material').map(s => ({ value: s.id, text: s.supplierName }))];
      filtersHTML += createMasterDataSelect('report-supplier-id', 'Filter Supplier', supplierOptions, 'all');
    } else if (reportType === 'material_usage_per_project') {
      await fetchAndCacheData('projects', projectsCol, 'projectName');
      const projectOptions = [{ value: '', text: '-- Pilih Proyek --' }, ...appState.projects.map(p => ({ value: p.id, text: p.projectName }))];
      filtersHTML += createMasterDataSelect('report-project-id', 'Pilih Proyek', projectOptions, '');
    }

    filtersContainer.innerHTML = filtersHTML;
    // PERBAIKAN: Gunakan rootEl sebagai konteks initCustomSelects
    initCustomSelects(rootEl);
  };

  const handleTypeChange = async (val) => {
    if (!validReportTypes.has(val)) {
      if (filtersContainer) filtersContainer.innerHTML = '';
      if (submitButton) submitButton.disabled = true;
      return;
    }
    await renderDynamicFilters(val);
    if (submitButton) submitButton.disabled = (val === '');
  };

  rootEl.querySelector('#report-type-actions')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="select-report-type"]');
    if (!btn) return;
    selectedType = btn.dataset.type || '';
    rootEl.querySelectorAll('#report-type-actions .detail-list-item').forEach(it => it.classList.remove('active'));
    btn.closest('.detail-list-item')?.classList.add('active');
    handleTypeChange(selectedType);
  });

  submitButton?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!selectedType) return;
    await handleDownloadReport('pdf', selectedType);
    // PERBAIKAN: Gunakan closeModalImmediate
    try { closeModalImmediate(rootEl); } catch(_) {}
  });
}

export { handleGenerateReportModal };
