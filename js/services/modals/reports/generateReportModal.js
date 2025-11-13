import { createModal, closeModal, closeModalImmediate, showDetailPane } from "../../../ui/components/modal.js";
import { createMasterDataSelect, initCustomSelects } from "../../../ui/components/forms/index.js";
import { fetchAndCacheData } from "../../../services/data/fetch.js";
// --- PERUBAHAN: Menambahkan 'workersCol' ---
import { projectsCol, suppliersCol, workersCol } from "../../../config/firebase.js";
import { appState } from "../../../state/appState.js";
import { handleDownloadReport } from "../../../services/reportService.js";
import { $ } from "../../../utils/dom.js";
import { toast } from "../../../ui/components/toast.js";
import { ensureMasterDataFresh } from "../../data/ensureMasters.js";

function createIcon(iconName, size = 24, classes = '') {
    const icons = {
        download: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download ${classes}"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
        fileText: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-text ${classes}"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>`,
        filePieChart: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-pie-chart ${classes}"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13.01H8"/><path d="M8 17a4 4 0 1 0 8 0"/><path d="M8 17a4 4 0 0 0 4 4 4 4 0 0 0 4-4"/></svg>`,
        users: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-users ${classes}"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
        clipboardList: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-clipboard-list ${classes}"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>`,
        hardHat: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-hard-hat ${classes}"><path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M4 15.5V12a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v3.5"/><path d="M12 11v-1a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v1"/><path d="m12 11 1.06.39a1 1 0 0 1 .88 1.3L12.8 15.5"/><path d="m12 11-1.06.39a1 1 0 0 0-.88 1.3L11.2 15.5"/></svg>`,
        package: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-package ${classes}"><path d="M16.5 9.4 7.5 4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 8 12 12.5 20.71 8"/><line x1="12" x2="12" y1="22.09" y2="12.5"/></svg>`,
    };
    return icons[iconName] || icons.fileText;
}


async function handleGenerateReportModal() {
  const reportTypeOptions = [
    { value: 'accounting_statements', text: 'Laporan Akuntansi Proyek', icon: 'fileText' },
    { value: 'charts_presentation', text: 'Laporan Presentasi Grafik', icon: 'filePieChart' },
    { value: 'analisis_beban', text: 'Analisis Beban', icon: 'hardHat' },
    { value: 'upah_pekerja', text: 'Laporan Rinci Upah Pekerja', icon: 'users' },
    { value: 'material_supplier', text: 'Laporan Rinci Material', icon: 'clipboardList' },
    { value: 'material_usage_per_project', text: 'Pemakaian Material per Proyek', icon: 'package' },
    { value: 'rekapan', text: 'Laporan Rekapan Transaksi', icon: 'fileText' }
  ];
  const validReportTypes = new Set(reportTypeOptions.map(o => o.value));

  const optionsHTML = reportTypeOptions.map((opt) => {
    return (
      `<button type="button" class="project-picker-item btn btn-ghost" data-action="select-report-type" data-type="${opt.value}">
          ${createIcon(opt.icon, 30)}
          <span class="picker-item-label">${opt.text}</span>
      </button>`
    );
  }).join('');

  const content = `
    <form id="report-generator-form">
      <div class="picker-grid" id="report-type-actions">${optionsHTML}</div>
      <div id="report-dynamic-filters"></div>
    </form>
  `;

  const footer = `
    <button id="download-report-btn" class="btn btn-primary" disabled>
      <span>Unduh</span>
    </button>`;

  const isMobile = window.matchMedia('(max-width: 599px)').matches;
  const title = 'Pilih Jenis Laporan';
  
  let rootEl = isMobile
    ? createModal('actionsPopup', { title, content, footer, layoutClass: 'is-bottom-sheet' })
    : createModal('dataDetail', { title, content: `<div class="scrollable-content">${content}</div>`, footer });

  if (!rootEl) {
    console.error("Gagal membuat modal atau detail pane.");
    return;
  }
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

    // Filter tanggal (umum untuk hampir semua laporan)
    if (reportType && reportType !== 'analisis_beban') {
      filtersHTML += `
        <div class="rekap-filters" style="padding:0; margin-top:1rem;">
          <div class="form-group"><label>Dari Tanggal</label><input type="date" id="report-start-date" value="${firstDayOfMonth}"></div>
          <div class="form-group"><label>Sampai Tanggal</label><input type="date" id="report-end-date" value="${todayStr}"></div>
        </div>`;
    }

    // Filter spesifik per laporan
    if (reportType === 'rekapan') {
      await ensureMasterDataFresh(['projects']);
      const projectOptions = [{ value: 'all', text: 'Semua Proyek' }, ...appState.projects.map(p => ({ value: p.id, text: p.projectName }))];
      filtersHTML += createMasterDataSelect('report-project-id', 'Filter Proyek', projectOptions, 'all');
    
    // --- AWAL PERUBAHAN ---
    } else if (reportType === 'upah_pekerja') {
      // Menambahkan filter pekerja untuk laporan upah
      await ensureMasterDataFresh(['workers']);
      const workerOptions = [
          { value: 'all', text: 'Semua Pekerja' }, 
          // Filter pekerja yang aktif atau pernah aktif (tidak terhapus)
          ...appState.workers.filter(w => !w.isDeleted).map(w => ({ value: w.id, text: w.workerName }))
      ];
      filtersHTML += createMasterDataSelect('report-worker-id', 'Filter Pekerja', workerOptions, 'all');
    // --- AKHIR PERUBAHAN ---

    } else if (reportType === 'material_supplier') {
      await ensureMasterDataFresh(['suppliers']);
      const supplierOptions = [{ value: 'all', text: 'Semua Supplier' }, ...appState.suppliers.filter(s => s.category === 'Material').map(s => ({ value: s.id, text: s.supplierName }))];
      filtersHTML += createMasterDataSelect('report-supplier-id', 'Filter Supplier', supplierOptions, 'all');
    
    } else if (reportType === 'material_usage_per_project') {
      await ensureMasterDataFresh(['projects']);
      const projectOptions = [{ value: '', text: '-- Pilih Proyek --' }, ...appState.projects.map(p => ({ value: p.id, text: p.projectName }))];
      filtersHTML += createMasterDataSelect('report-project-id', 'Pilih Proyek', projectOptions, '');
    }

    filtersContainer.innerHTML = filtersHTML;
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
    rootEl.querySelectorAll('#report-type-actions .project-picker-item').forEach(it => it.classList.remove('active'));
    btn.classList.add('active');
    handleTypeChange(selectedType);
  });

  submitButton?.addEventListener('click', async (e) => {
    e.preventDefault();

    if (!selectedType) return;

    // --- AWAL PERUBAHAN ---
    // Menambahkan 'workerId' ke objek 'filters'
    const filters = {
        start: rootEl.querySelector('#report-start-date')?.value,
        end: rootEl.querySelector('#report-end-date')?.value,
        projectId: rootEl.querySelector('#report-project-id')?.value || 'all',
        supplierId: rootEl.querySelector('#report-supplier-id')?.value || 'all',
        workerId: rootEl.querySelector('#report-worker-id')?.value || 'all', // Ditambahkan
    };
    // --- AKHIR PERUBAHAN ---
    
    if (selectedType === 'material_usage_per_project' && !filters.projectId) {
        toast('error', 'Silakan pilih proyek terlebih dahulu.');
        return;
    }
    if (selectedType !== 'analisis_beban' && (!filters.start || !filters.end)) {
        toast('error', 'Silakan tentukan rentang tanggal.');
        return;
    }

    // Objek 'filters' sekarang akan diteruskan, meskipun reportService
    // mungkin masih membaca langsung dari DOM (kedua metode akan berfungsi)
    await handleDownloadReport('pdf', selectedType, filters);
    
    let modalIdToClose = isMobile ? 'actionsPopup' : 'dataDetail';
    try { closeModalImmediate(modalIdToClose); } catch(_) {}
  });
}

export { handleGenerateReportModal };