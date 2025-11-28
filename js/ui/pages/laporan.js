import { appState } from '../../state/appState.js';
import { $, $$ } from '../../utils/dom.js';
import { createPageToolbarHTML } from '../components/toolbar.js';
import { getEmptyStateHTML } from '../components/emptyState.js';
import { emit, on } from '../../state/eventBus.js';
import { fmtIDR } from '../../utils/formatters.js';
import { _renderFinancialSummaryChart, _renderInteractiveBarChart, _renderCashflowPeriodChart } from '../components/charts.js';
import { handleDownloadReport } from '../../services/reportService.js';
import { getJSDate } from '../../utils/helpers.js';
import { fetchAndCacheData } from '../../services/data/fetch.js';
import { projectsCol, suppliersCol, workersCol, staffCol, incomesCol, expensesCol, billsCol, fundingSourcesCol, materialsCol, stockTransactionsCol, attendanceRecordsCol } from '../../config/firebase.js';
import { ensureMasterDataFresh } from '../../services/data/ensureMasters.js';
import { _getSkeletonLoaderHTML } from '../components/skeleton.js';
import { showDetailPane, createModal } from '../components/modal.js';

let teardownProjectDropdown = null;

async function renderLaporanContent() {
    const container = $('#sub-page-content');
    if (!container) return;

    try {
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const ymd = d => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);

        const projectOptions = [
            { value: 'all', label: 'Semua Proyek' },
            ...((appState.projects || [])
                .filter(p => !p.isDeleted)
                .map(p => ({ value: p.id, label: p.projectName })))
        ];
        const defaultProjectId = projectOptions[0]?.value || 'all';
        const initialFilterNote = formatFilterRangeNote(ymd(firstDay), ymd(today), defaultProjectId);

        const isAccounting = !!appState.reportAccountingMode;
        const headerHTML = '';

        const filterHTML = `
            <section class="panel panel-pad report-filter-card" id="report-filter-card">
                <div class="report-filter" role="group" aria-label="Filter Laporan">
                    <div class="report-filter__primary">
                        <div class="filter-field filter-field--dates">
                            <label for="laporan-start-date">Rentang</label>
                            <div class="date-range-group" role="group" aria-label="Rentang Tanggal">
                                <input type="date" id="laporan-start-date" value="${ymd(firstDay)}" />
                                <span class="range-sep" aria-hidden="true">s/d</span>
                                <input type="date" id="laporan-end-date" value="${ymd(today)}" />
                            </div>
                        </div>
                        <div class="filter-field filter-field--project">
                            <label for="laporan-project-trigger">Proyek</label>
                            <div class="custom-select" data-dropdown="laporan-project">
                                <button class="custom-select__trigger" type="button" id="laporan-project-trigger" aria-haspopup="listbox" aria-expanded="false">
                                    <span id="laporan-project-label">${projectOptions[0]?.label || 'Semua Proyek'}</span>
                                    ${createIcon('chevron-down', 16)}
                                </button>
                                <ul class="custom-select__list" id="laporan-project-options" role="listbox">
                                    ${projectOptions.map(opt => `<li role="option" data-value="${opt.value}" class="${opt.value === defaultProjectId ? 'selected' : ''}">${opt.label}</li>`).join('')}
                                </ul>
                            </div>
                            <input type="hidden" id="laporan-project-id" value="${defaultProjectId}" />
                        </div>
                    </div>
                    <div class="report-filter__quick" role="group" aria-label="Rentang cepat">
                        <span class="filter-label">Rentang Cepat</span>
                        <div class="quick-chip-group">
                            <button class="chip-button" id="btn-quick-7" type="button">7 Hari</button>
                            <button class="chip-button" id="btn-quick-30" type="button">30 Hari</button>
                            <button class="chip-button ghost" id="btn-reset-range" type="button">Reset</button>
                        </div>
                    </div>
                    <div class="report-filter__actions">
                        <button class="btn btn-primary btn-full" id="btn-apply-report-filter" data-tooltip="Terapkan Filter">
                            ${createIcon('check', 18)}<span>Terapkan Filter</span>
                        </button>
                        <p class="filter-hint">Unduh laporan dari toolbar kapan saja.</p>
                    </div>
                    <p class="filter-range-note" id="report-filter-note" role="status" aria-live="polite">${initialFilterNote}</p>
                </div>
            </section>`;

        const summaryHeaderHTML = `
            <section class="panel panel-pad report-kpi-card" id="report-summary-card">
                <div class="report-kpi-tray report-summary-header" id="report-summary-header">
                    <article class="kpi-pill">
                        <span class="kpi-label">Masuk</span>
                        <strong class="kpi-value" id="kpi-income">-</strong>
                    </article>
                    <article class="kpi-pill">
                        <span class="kpi-label">Keluar</span>
                        <strong class="kpi-value" id="kpi-expense">-</strong>
                    </article>
                    <article class="kpi-pill kpi-pill--ghost">
                        <span class="kpi-label">Bunga Pinjaman</span>
                        <strong class="kpi-value" id="kpi-interest">-</strong>
                    </article>
                    <article class="kpi-pill accent">
                        <span class="kpi-label">Net</span>
                        <strong class="kpi-value" id="kpi-net">-</strong>
                    </article>
                </div>
            </section>`;

        function aggregateExpenseCategoriesByType({ start, end, projectId }) {
            const byProject = pid => (projectId && projectId !== 'all') ? (pid === projectId) : true;
            const inR = (d) => inRange(d, start, end);
            const expenses = (appState.expenses || []).filter(x => !x.isDeleted && byProject(x.projectId) && inR(x.date));
            const totals = { material: 0, operasional: 0, lainnya: 0 };
            expenses.forEach(e => { const t = e.type || 'lainnya'; if (totals[t] == null) totals[t] = 0; totals[t] += (e.amount || 0); });
            return totals;
        }

        function computeAccountingStatements(filter) {
            const base = aggregateReportData(filter);
            const expCat = aggregateExpenseCategoriesByType(filter);
            const revenue = base.totals.totalIncome;
            const cogs = expCat.material || 0;
            const grossProfit = revenue - cogs;
            const wages = (base.totals.totalWagesPaid || 0);
            const opex = (expCat.operasional || 0) + (expCat.lainnya || 0) + wages;
            const netProfit = grossProfit - opex;
            const cashOperatingIn = revenue;
            const cashOperatingOut = (expCat.material || 0) + (expCat.operasional || 0) + (expCat.lainnya || 0) + wages;
            const cashOperatingNet = cashOperatingIn - cashOperatingOut;
            const cashFinancingIn = base.totals.totalFunding || 0;
            const cashNetChange = cashOperatingNet + cashFinancingIn;
            const balanceSheet = {
                assets: { kas: cashNetChange },
                liabilities: { utangUsaha: base.totals.unpaidBillsAmount || 0, pinjaman: base.totals.unpaidLoansAmount || 0 }
            };
            const expenseAnalysis = [
                { label: 'Material (HPP)', value: expCat.material || 0 },
                { label: 'Operasional', value: expCat.operasional || 0 },
                { label: 'Lainnya', value: expCat.lainnya || 0 },
                { label: 'Gaji/Fee (Lunas)', value: wages }
            ];
            return { base, revenue, cogs, grossProfit, wages, opex, netProfit, cashOperatingIn, cashOperatingOut, cashOperatingNet, cashFinancingIn, cashNetChange, balanceSheet, expenseAnalysis };
        }

        const contentHTML = `
            <div class="insight-stack" id="report-summary-grid">
                <section class="panel panel-pad insight-card accent-overview" data-sticker="coins" data-animal="cat">
                    <header class="insight-header">
                        <div>
                            <p class="insight-eyebrow">Snapshot</p>
                            <h3 class="card-title">Ringkasan Keuangan</h3>
                            <p class="insight-subtext">Statistik periode terpilih dalam satu layar.</p>
                        </div>
                        <span class="insight-tag">Realtime</span>
                    </header>
                    <div class="insight-body">
                        <div class="insight-metric-grid">
                            <div class="summary-stat-card"><span class="label">Pemasukan</span><span class="value" id="sum-income">-</span></div>
                            <div class="summary-stat-card"><span class="label">Pengeluaran</span><span class="value value--expense" id="sum-expense">-</span></div>
                            <div class="summary-stat-card"><span class="label">Pendanaan</span><span class="value" id="sum-funding">-</span></div>
                            <div class="summary-stat-card accent"><span class="label">Laba/Rugi</span><span class="value" id="sum-net">-</span></div>
                        </div>
                        <div class="insight-split">
                            <div class="report-card-chart mellow"><canvas id="financial-summary-chart"></canvas></div>
                            <div class="insight-list">
                                <div class="summary-stat-card subtle"><span class="label">Tagihan Belum Lunas (Jumlah)</span><span class="value" id="sum-unpaid-bills-count">-</span></div>
                                <div class="summary-stat-card subtle"><span class="label">Tagihan Belum Lunas (Nilai)</span><span class="value" id="sum-unpaid-bills-amount">-</span></div>
                                <div class="summary-stat-card subtle"><span class="label">Pinjaman Belum Lunas (Nilai)</span><span class="value" id="sum-unpaid-loans-amount">-</span></div>
                                <div class="summary-stat-card subtle"><span class="label">Upah Dibayar / Belum</span><span class="value" id="sum-wages">-</span></div>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="panel panel-pad insight-card" data-sticker="bars">
                    <header class="insight-header">
                        <div>
                            <p class="insight-eyebrow">Aktivitas Terbaru</p>
                            <h3 class="card-title">Tren 7 Hari</h3>
                            <p class="insight-subtext">Bandingkan pemasukan vs pengeluaran harian.</p>
                        </div>
                    </header>
                    <div class="insight-body card-body-chart">
                        <canvas id="interactive-bar-chart"></canvas>
                    </div>
                </section>

                <section class="panel panel-pad insight-card" data-sticker="line" data-animal="bird">
                    <header class="insight-header">
                        <div>
                            <p class="insight-eyebrow">Arus Kas</p>
                            <h3 class="card-title">Arus Kas per Periode</h3>
                            <p class="insight-subtext">Ubah mode mingguan/bulanan untuk melihat tren.</p>
                        </div>
                        <div class="insight-actions">
                            <div class="chip-toggle" role="group" aria-label="Mode arus kas">
                                <button class="chip-button" id="btn-cf-weekly" type="button">7H</button>
                                <button class="chip-button" id="btn-cf-monthly" type="button">30H</button>
                            </div>
                            <button class="icon-button" id="btn-cf-csv" data-tooltip="Unduh CSV" type="button">${createIcon('download',16)}</button>
                            <button class="icon-button" data-action="open-report-detail" data-target="cashflow-period-table" data-tooltip="Lihat detail" type="button">${createIcon('file',16)}</button>
                        </div>
                    </header>
                    <div class="insight-body">
                        <div class="report-card-chart full"><canvas id="cashflow-period-chart"></canvas></div>
                        <div id="cashflow-period-table" class="table-like"></div>
                    </div>
                </section>

                <section class="panel panel-pad insight-card" data-sticker="calendar">
                    <header class="insight-header">
                        <div>
                            <p class="insight-eyebrow">Tagihan</p>
                            <h3 class="card-title">Aging Tagihan Belum Lunas</h3>
                            <p class="insight-subtext">Kelompokkan jatuh tempo untuk prioritas penagihan.</p>
                        </div>
                        <div class="insight-actions">
                            <button class="icon-button" data-action="open-report-detail" data-target="aging-table" data-tooltip="Lihat detail" type="button">${createIcon('file',16)}</button>
                        </div>
                    </header>
                    <div class="insight-body">
                        <div id="aging-table" class="table-like"></div>
                    </div>
                </section>

                <section class="panel panel-pad insight-card" data-sticker="pie">
                    <header class="insight-header">
                        <div>
                            <p class="insight-eyebrow">Pengeluaran</p>
                            <h3 class="card-title">Rincian per Kategori</h3>
                            <p class="insight-subtext">Lihat kategori biaya terbesar secara instan.</p>
                        </div>
                        <div class="insight-actions">
                            <button class="icon-button" data-action="open-report-detail" data-target="expense-category-table" data-tooltip="Lihat detail" type="button">${createIcon('file',16)}</button>
                        </div>
                    </header>
                    <div class="insight-body">
                        <div id="expense-category-table" class="table-like"></div>
                    </div>
                </section>

                <section class="panel panel-pad insight-card" data-sticker="grid">
                    <header class="insight-header">
                        <div>
                            <p class="insight-eyebrow">Supplier</p>
                            <h3 class="card-title">Belanja per Supplier (Top 5)</h3>
                            <p class="insight-subtext">Pantau pemasok yang paling aktif.</p>
                        </div>
                        <div class="insight-actions">
                            <button class="icon-button" data-action="open-report-detail" data-target="supplier-spend-table" data-tooltip="Lihat detail" type="button">${createIcon('file',16)}</button>
                        </div>
                    </header>
                    <div class="insight-body">
                        <div id="supplier-spend-table" class="table-like"></div>
                    </div>
                </section>

                <section class="panel panel-pad insight-card" data-sticker="grid">
                    <header class="insight-header">
                        <div>
                            <p class="insight-eyebrow">Material</p>
                            <h3 class="card-title">Pemakaian Material Teratas</h3>
                            <p class="insight-subtext">Bantu tim gudang fokus pada material tinggi.</p>
                        </div>
                        <div class="insight-actions">
                            <button class="icon-button" data-action="open-report-detail" data-target="material-usage-table" data-tooltip="Lihat detail" type="button">${createIcon('file',16)}</button>
                        </div>
                    </header>
                    <div class="insight-body">
                        <div id="material-usage-table" class="table-like"></div>
                    </div>
                </section>

                <section class="panel panel-pad insight-card" data-sticker="nodes">
                    <header class="insight-header">
                        <div>
                            <p class="insight-eyebrow">Proyek</p>
                            <h3 class="card-title">Ringkasan per Proyek</h3>
                            <p class="insight-subtext">Bandingkan tiap proyek tanpa membuka tabel besar.</p>
                        </div>
                        <div class="insight-actions">
                            <button class="icon-button" data-action="open-report-detail" data-target="project-summary-table" data-tooltip="Lihat detail" type="button">${createIcon('file',16)}</button>
                        </div>
                    </header>
                    <div class="insight-body">
                        <div id="project-summary-table" class="table-like"></div>
                    </div>
                </section>

                <section class="panel panel-pad insight-card" data-sticker="shield">
                    <header class="insight-header">
                        <div>
                            <p class="insight-eyebrow">Kesehatan Proyek</p>
                            <h3 class="card-title">Anggaran vs Realisasi</h3>
                            <p class="insight-subtext">Soroti proyek berisiko dan segera tindak lanjuti.</p>
                        </div>
                        <div class="insight-actions">
                            <label class="health-toggle" title="Tampilkan hanya proyek berisiko">
                                <input type="checkbox" id="toggle-health-risk-only" />
                                <span>Risiko</span>
                            </label>
                            <button class="icon-button" id="btn-health-csv" data-tooltip="Unduh CSV" type="button">${createIcon('download',16)}</button>
                            <button class="icon-button" data-action="open-report-detail" data-target="project-health-table" data-tooltip="Lihat detail" type="button">${createIcon('file',16)}</button>
                        </div>
                    </header>
                    <div class="insight-body">
                        <div id="project-health-table" class="table-like"></div>
                    </div>
                </section>
            </div>
            <div id="report-daily-details"></div>
        `;

        const accountingHTML = `
            <div class="insight-stack" id="accounting-grid">
                <section class="panel panel-pad insight-card" data-sticker="ledger">
                    <header class="insight-header">
                        <div>
                            <p class="insight-eyebrow">Performa</p>
                            <h3 class="card-title">Laporan Laba Rugi</h3>
                            <p class="insight-subtext">Ringkasan P&amp;L versi mobile.</p>
                        </div>
                    </header>
                    <div class="insight-body">
                        <div class="insight-table">
                            <div class="insight-row"><span class="label">Pendapatan</span><span class="value" id="pl-revenue">-</span></div>
                            <div class="insight-row"><span class="label">HPP (Material)</span><span class="value" id="pl-cogs">-</span></div>
                            <div class="insight-row highlight"><span class="label">Laba Kotor</span><span class="value" id="pl-gross">-</span></div>
                            <div class="insight-row"><span class="label">Beban Operasional + Lainnya + Upah</span><span class="value" id="pl-opex">-</span></div>
                            <div class="insight-row highlight"><span class="label">Laba/Rugi Bersih</span><span class="value" id="pl-net">-</span></div>
                        </div>
                    </div>
                </section>

                <section class="panel panel-pad insight-card" data-sticker="line">
                    <header class="insight-header">
                        <div>
                            <p class="insight-eyebrow">Arus Kas</p>
                            <h3 class="card-title">Arus Kas per Periode</h3>
                            <p class="insight-subtext">Gunakan chip untuk beralih mingguan/bulanan.</p>
                        </div>
                        <div class="insight-actions">
                            <div class="chip-toggle" role="group" aria-label="Mode arus kas">
                                <button class="chip-button" id="btn-cf-weekly" type="button">7H</button>
                                <button class="chip-button" id="btn-cf-monthly" type="button">30H</button>
                            </div>
                            <button class="icon-button" id="btn-cf-csv" data-tooltip="Unduh CSV" type="button">${createIcon('download',16)}</button>
                            <button class="icon-button" data-action="open-report-detail" data-target="cashflow-period-table" data-tooltip="Lihat detail" type="button">${createIcon('file',16)}</button>
                        </div>
                    </header>
                    <div class="insight-body">
                        <div class="report-card-chart full"><canvas id="cashflow-period-chart"></canvas></div>
                        <div id="cashflow-period-table" class="table-like"></div>
                    </div>
                </section>

                <section class="panel panel-pad insight-card" data-sticker="pie">
                    <header class="insight-header">
                        <div>
                            <p class="insight-eyebrow">Analisis</p>
                            <h3 class="card-title">Analisis Beban</h3>
                            <p class="insight-subtext">Filter kategori untuk mengontrol pengeluaran.</p>
                        </div>
                        <div class="insight-actions">
                            <button class="icon-button" data-action="open-report-detail" data-target="expense-analysis-accounting" data-tooltip="Lihat detail" type="button">${createIcon('file',16)}</button>
                        </div>
                    </header>
                    <div class="insight-body">
                        <div id="expense-analysis-accounting" class="table-like"></div>
                    </div>
                </section>

                <section class="panel panel-pad insight-card" data-sticker="scale">
                    <header class="insight-header">
                        <div>
                            <p class="insight-eyebrow">Posisi</p>
                            <h3 class="card-title">Neraca (Ringkas)</h3>
                            <p class="insight-subtext">Tampilkan aset vs kewajiban secara manis.</p>
                        </div>
                    </header>
                    <div class="insight-body">
                        <div class="insight-table">
                            <div class="insight-row section-label"><span class="label">Aset</span></div>
                            <div class="insight-row"><span class="label">Kas (Perubahan Bersih Periode)</span><span class="value" id="bs-cash">-</span></div>
                            <div class="insight-row section-label"><span class="label">Kewajiban</span></div>
                            <div class="insight-row"><span class="label">Utang Usaha (Tagihan Belum Lunas)</span><span class="value" id="bs-ap">-</span></div>
                            <div class="insight-row"><span class="label">Pinjaman Belum Lunas</span><span class="value" id="bs-loans">-</span></div>
                        </div>
                    </div>
                </section>
            </div>
            <div id="report-daily-details"></div>
        `;

        const finalHTML = filterHTML + summaryHeaderHTML + (isAccounting ? accountingHTML : contentHTML);
        container.innerHTML = finalHTML;
        setupProjectDropdown();
        updateReportFilterNote();

        // Compact behaviors: Apply button and detail handlers
        $('#btn-apply-report-filter')?.addEventListener('click', () => applyReportFilters());

        document.querySelectorAll('[data-action="open-report-detail"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-target');
                const isMobile = window.matchMedia('(max-width: 599px)').matches;
                const card = btn.closest('.panel');
                const title = card?.querySelector('.card-title')?.textContent || 'Detail';

                const wrapBottomSheetContent = (tableEl, extra = '') => {
                    if (!tableEl) return '';
                    const clone = tableEl.cloneNode(true);
                    clone.removeAttribute('id');
                    clone.classList.add('table-like--drawer');
                    return `
                        <div class="report-bottom-sheet scrollable-content has-padding">
                            ${extra}
                            ${clone.outerHTML}
                        </div>`;
                };

                if (isMobile) {
                    // Build bottom sheet content
                    if (target === 'cashflow-period-table') {
                        const mode = appState.reportCashflowMode || 'weekly';
                        const start = $('#laporan-start-date')?.value || '';
                        const end = $('#laporan-end-date')?.value || '';
                        const projectId = $('#laporan-project-id')?.value || 'all';
                        const { labels, inflows, outflows } = aggregateCashflowByPeriod({ start, end, projectId }, mode);
                        const tableEl = document.getElementById(target);
                        if (!tableEl) return;
                        const chartBlock = `
                            <div class="report-bottom-sheet__chart">
                                <canvas id="cf-detail-chart"></canvas>
                            </div>`;
                        const mergedContent = wrapBottomSheetContent(tableEl, chartBlock);
                        if (!mergedContent) return;
                        const modal = createModal('actionsPopup', { title, content: mergedContent, layoutClass: 'is-bottom-sheet' });
                        // Defer chart render
                        setTimeout(() => {
                            try { _renderCashflowPeriodChart({ canvasId: 'cf-detail-chart', labels, inflows, outflows }); } catch(_) {}
                        }, 0);
                    } else {
                        const table = target ? document.getElementById(target) : null;
                        if (!table) return;
                        const mergedContent = wrapBottomSheetContent(table);
                        if (!mergedContent) return;
                        createModal('actionsPopup', { title, content: mergedContent, layoutClass: 'is-bottom-sheet' });
                    }
                } else {
                    // Desktop: show detail pane (if used), otherwise no-op since content already visible
                    const body = card?.querySelector('.card-body');
                    const content = body ? body.innerHTML : (target ? document.getElementById(target)?.outerHTML : '');
                    if (content) showDetailPane({ title, content });
                }
            });
        });

        $('#btn-quick-7')?.addEventListener('click', () => quickRange(7));
        $('#btn-quick-30')?.addEventListener('click', () => quickRange(30));
        $('#btn-reset-range')?.addEventListener('click', () => resetRange());
        $('#btn-cf-weekly')?.addEventListener('click', () => renderCashflowCard('weekly'));
        $('#btn-cf-monthly')?.addEventListener('click', () => renderCashflowCard('monthly'));
        $('#btn-cf-csv')?.addEventListener('click', exportCashflowCsv);
        const riskStored = localStorage.getItem('banplex.report.health.riskOnly');
        const riskOnly = riskStored == null ? false : riskStored === '1';
        const riskToggle = $('#toggle-health-risk-only');
        if (riskToggle) { riskToggle.checked = riskOnly; }
        riskToggle?.addEventListener('change', () => {
            localStorage.setItem('banplex.report.health.riskOnly', riskToggle.checked ? '1' : '0');
            const health = computeProjectHealth();
            renderProjectHealthTable(health);
        });
        $('#btn-health-csv')?.addEventListener('click', exportProjectHealthCsv);

        applyReportFilters();

        const autoApply = () => applyReportFilters();
        $('#laporan-start-date')?.addEventListener('change', autoApply);
        $('#laporan-end-date')?.addEventListener('change', autoApply);
        $('#laporan-project-id')?.addEventListener('change', autoApply);

    } catch (error) {
        container.innerHTML = getEmptyStateHTML({ icon: 'error', title: 'Gagal Memuat Laporan', desc: 'Terjadi kesalahan saat menampilkan data laporan.' });
    }
}

function createIcon(name, size = 18, classes = '') {
    const icons = {
        check: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check ${classes}"><path d="M20 6 9 17l-5-5"/></svg>`,
        'chevron-down': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down ${classes}"><path d="m6 9 6 6 6-6"/></svg>`,
        rotate_ccw: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-rotate-ccw ${classes}"><path d="M3 2v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L3 8"/></svg>`,
        scale: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-scale ${classes}"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2"/><path d="M19 7h2"/></svg>`,
        wallet: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-wallet ${classes}"><path d="M21 12V7H5a2 2 0 0 1 0-4h14a2 2 0 0 1 2 2v4Z"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2Z"/></svg>`,
        package: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-package ${classes}"><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" x2="12" y1="22" y2="12"/></svg>`,
        landmark: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-landmark ${classes}"><line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>`,
        download: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download ${classes}"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
        error: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle ${classes}"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
        receipt: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-receipt ${classes}"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1V2H4Z"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/></svg>`,
        pie: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pie-chart ${classes}"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>`,
        bar: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bar-chart-3 ${classes}"><path d="M3 3v18h18"/><rect x="7" y="8" width="3" height="7"/><rect x="12" y="6" width="3" height="9"/><rect x="17" y="4" width="3" height="11"/></svg>`,
        truck: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-truck ${classes}"><path d="M10 17h4V5H2v12h2"/><path d="M14 17h2l3-5h3"/><circle cx="5.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>`,
        briefcase: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-briefcase ${classes}"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>`,
        file: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-text ${classes}"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>`,
        boxes: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-boxes ${classes}"><path d="M15.5 4.5 12 2 8.5 4.5 12 7z"/><path d="M12 7v6.5L8.5 11"/><path d="M12 13.5 15.5 11"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
        calendar: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar ${classes}"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`
    };
    return icons[name] || '';
}

function inRange(date, start, end) {
    const d = getJSDate(date);
    if (!d || isNaN(d)) return true;
    if (start && d < new Date(start + 'T00:00:00')) return false;
    if (end && d > new Date(end + 'T23:59:59')) return false;
    return true;
}

function aggregateReportData({ start, end, projectId }) {
    const byProject = pid => (projectId && projectId !== 'all') ? (pid === projectId) : true;

    const incomes = (appState.incomes || []).filter(x => !x.isDeleted && byProject(x.projectId) && inRange(x.date, start, end));
    const expenses = (appState.expenses || []).filter(x => !x.isDeleted && byProject(x.projectId) && inRange(x.date, start, end));
    const bills = (appState.bills || []).filter(b => !b.isDeleted && byProject(b.projectId) && inRange(b.createdAt || b.dueDate || b.date, start, end));
    const unpaidBills = bills.filter(b => b.status === 'unpaid');
    const unpaidBillsAmount = unpaidBills.reduce((s, b) => s + Math.max(0, (b.amount || 0) - (b.paidAmount || 0)), 0);

    const refDate = end ? new Date(end + 'T23:59:59') : new Date();
    const buckets = {
        notDue: { label: 'Belum Jatuh Tempo', count: 0, amount: 0 },
        d1_7: { label: 'Terlambat 1-7 hari', count: 0, amount: 0 },
        d8_30: { label: 'Terlambat 8-30 hari', count: 0, amount: 0 },
        d31_60: { label: 'Terlambat 31-60 hari', count: 0, amount: 0 },
        d61_plus: { label: 'Terlambat > 60 hari', count: 0, amount: 0 },
        unknown: { label: 'Tanpa Tanggal Jatuh Tempo', count: 0, amount: 0 },
    };
    unpaidBills.forEach(b => {
        const due = b.dueDate ? getJSDate(b.dueDate) : null;
        const outstanding = Math.max(0, (b.amount || 0) - (b.paidAmount || 0));
        if (!outstanding) return;

        if (!due) {
            buckets.unknown.count += 1; buckets.unknown.amount += outstanding; return;
        }

        const days = Math.floor((refDate - due) / (1000 * 60 * 60 * 24));

        if (days <= 0) {
            buckets.notDue.count += 1; buckets.notDue.amount += outstanding;
        } else if (days <= 7) {
            buckets.d1_7.count += 1; buckets.d1_7.amount += outstanding;
        } else if (days <= 30) {
            buckets.d8_30.count += 1; buckets.d8_30.amount += outstanding;
        } else if (days <= 60) {
            buckets.d31_60.count += 1; buckets.d31_60.amount += outstanding;
        } else {
            buckets.d61_plus.count += 1; buckets.d61_plus.amount += outstanding;
        }
    });

    const funding = (appState.fundingSources || []).filter(f => !f.isDeleted && inRange(f.createdAt || f.date, start, end));
    const totalLoanInterest = funding
        .filter(f => f.interestType === 'interest')
        .reduce((s, f) => s + Math.max(0, (f.totalRepaymentAmount || 0) - (f.totalAmount || 0)), 0);

    const totalIncome = incomes.reduce((s, i) => s + (i.amount || 0), 0);
    const totalExpense = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const totalFunding = funding.reduce((s, f) => s + (f.totalAmount || 0), 0);

    const wageBills = bills.filter(b => b.type === 'gaji' || b.type === 'fee');
    const totalWagesPaid = wageBills.filter(b => b.status === 'paid').reduce((s, b) => s + (b.amount || 0), 0);
    const totalWagesUnpaid = wageBills.filter(b => b.status === 'unpaid').reduce((s, b) => s + Math.max(0, (b.amount || 0) - (b.paidAmount || 0)), 0);

    const unpaidLoansAmount = (appState.fundingSources || [])
        .filter(l => !l.isDeleted && l.status === 'unpaid' && inRange(l.createdAt || l.date, start, end))
        .reduce((s, l) => s + Math.max(0, (l.totalAmount || 0) - (l.paidAmount || 0)), 0);

    const categoryTotals = {};
    expenses.forEach(e => {
        const key = e.type || 'lainnya';
        if (!categoryTotals[key]) categoryTotals[key] = 0;
        categoryTotals[key] += (e.amount || 0);
    });
    if (!categoryTotals['gaji']) categoryTotals['gaji'] = 0;
    categoryTotals['gaji'] += totalWagesPaid;

    const expenseWithSupplier = expenses.filter(e => e.supplierId);
    const supplierMap = new Map();
    const suppliersIndex = new Map((appState.suppliers || []).filter(s=>!s.isDeleted).map(s => [s.id, s]));

    expenseWithSupplier.forEach(e => {
        const key = e.supplierId;
        const rec = supplierMap.get(key) || { name: (suppliersIndex.get(key)?.supplierName || 'Tanpa Supplier'), total: 0, count: 0 };
        rec.total += (e.amount || 0);
        rec.count += 1;
        supplierMap.set(key, rec);
    });
    const supplierBreakdown = Array.from(supplierMap.entries()).map(([id, r]) => ({ id, ...r })).sort((a,b)=>b.total-a.total);

    const stock = (appState.stockTransactions || []).filter(t => !t.isDeleted && t.type === 'out' && inRange(t.date, start, end) && byProject((t.projectId || t.project_id)));
    const matIndex = new Map((appState.materials || []).filter(m=>!m.isDeleted).map(m => [m.id, m]));
    const materialUsageMap = new Map();

    stock.forEach(t => {
        const mid = t.materialId;
        if (!mid) return;
        const curr = materialUsageMap.get(mid) || { materialName: (matIndex.get(mid)?.materialName || 'Material?'), unit: (matIndex.get(mid)?.unit || '-'), quantity: 0 };
        const qty = Number(t.quantity || 0) || 0;
        curr.quantity += qty;
        materialUsageMap.set(mid, curr);
    });
    const materialUsage = Array.from(materialUsageMap.entries()).map(([id, r]) => ({ id, ...r })).sort((a,b)=> (b.quantity||0) - (a.quantity||0));

    const projects = (appState.projects || []).filter(p => !p.isDeleted);
    const perProject = projects
        .filter(p => projectId === 'all' || projectId === undefined || p.id === projectId)
        .map(p => {
            const inc = incomes.filter(i => i.projectId === p.id).reduce((s, i) => s + (i.amount || 0), 0);
            const exp = expenses.filter(e => e.projectId === p.id).reduce((s, e) => s + (e.amount || 0), 0)
                + bills.filter(b => b.projectId === p.id && (b.type === 'gaji' || b.type === 'fee') && b.status === 'paid').reduce((s, b) => s + (b.amount || 0), 0);
            return { id: p.id, name: p.projectName, income: inc, expense: exp, net: inc - exp };
        })
        .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

    let totalWorkerDays = 0;
    (appState.attendanceRecords || []).forEach(rec => {
        if (rec?.isDeleted) return;
        if (!byProject(rec.projectId)) return;
        if (!inRange(rec.date || rec.createdAt, start, end)) return;

        if (rec.attendanceStatus === 'full_day') totalWorkerDays += 1;
        else if (rec.attendanceStatus === 'half_day') totalWorkerDays += 0.5;
    });

    return {
        totals: {
            totalIncome,
            totalExpense,
            totalFunding,
            net: totalIncome - totalExpense,
            unpaidBillsCount: unpaidBills.length,
            unpaidBillsAmount,
            unpaidLoansAmount,
            totalWagesPaid,
            totalWagesUnpaid,
            totalWorkerDays,
            totalLoanInterest,
        },
        categoryTotals,
        agingBuckets: buckets,
        supplierBreakdown,
        materialUsage,
        perProject,
    };
}

function renderSummaryAndCharts(data) {
    const totalOutflow = data.totals.totalExpense + data.totals.totalWagesPaid;
    const netProfit = data.totals.totalIncome - totalOutflow;

    const kpiIncomeEl = $('#kpi-income');
    if (kpiIncomeEl) kpiIncomeEl.textContent = fmtIDR(data.totals.totalIncome);
    const kpiExpenseEl = $('#kpi-expense');
    if (kpiExpenseEl) kpiExpenseEl.textContent = fmtIDR(totalOutflow);
    const kpiInterestEl = $('#kpi-interest');
    if (kpiInterestEl) kpiInterestEl.textContent = fmtIDR(data.totals.totalLoanInterest || 0);
    const kpiNetEl = $('#kpi-net');
    if (kpiNetEl) kpiNetEl.textContent = fmtIDR(netProfit);

    const sumIncomeEl = $('#sum-income');
    if (sumIncomeEl) sumIncomeEl.textContent = fmtIDR(data.totals.totalIncome);
    const sumExpenseEl = $('#sum-expense');
    if (sumExpenseEl) sumExpenseEl.textContent = fmtIDR(totalOutflow);
    const sumFundingEl = $('#sum-funding');
    if (sumFundingEl) sumFundingEl.textContent = fmtIDR(data.totals.totalFunding);
    const sumInterestEl = $('#sum-loan-interest');
    if (sumInterestEl) sumInterestEl.textContent = fmtIDR(data.totals.totalLoanInterest || 0);
    const sumNetEl = $('#sum-net');
    if (sumNetEl) sumNetEl.textContent = fmtIDR(netProfit);
    const sumUnpaidCountEl = $('#sum-unpaid-bills-count');
    if (sumUnpaidCountEl) sumUnpaidCountEl.textContent = String(data.totals.unpaidBillsCount);
    const sumUnpaidAmtEl = $('#sum-unpaid-bills-amount');
    if (sumUnpaidAmtEl) sumUnpaidAmtEl.textContent = fmtIDR(data.totals.unpaidBillsAmount);
    const sumUnpaidLoansEl = $('#sum-unpaid-loans-amount');
    if (sumUnpaidLoansEl) sumUnpaidLoansEl.textContent = fmtIDR(data.totals.unpaidLoansAmount);
    const sumWagesEl = $('#sum-wages');
    if (sumWagesEl) sumWagesEl.textContent = `${fmtIDR(data.totals.totalWagesPaid)} / ${fmtIDR(data.totals.totalWagesUnpaid)}`;

    const summaryChartData = {
        summary: {
            totalIncome: data.totals.totalIncome,
            totalExpense: totalOutflow,
            totalFunding: data.totals.totalFunding,
            loanInterest: data.totals.totalLoanInterest || 0,
        }
    };
    const originalDashboardData = appState.dashboardData;
    appState.dashboardData = summaryChartData;
    _renderFinancialSummaryChart();
    appState.dashboardData = originalDashboardData;

    _renderInteractiveBarChart();
}

function renderCategoryTable(categoryTotals) {
    const labels = {
        material: 'Material', operasional: 'Operasional', lainnya: 'Lainnya', gaji: 'Gaji/Fee (Lunas)',
    };
    const container = $('#expense-category-table');
    if (!container) return;

    const entries = Object.entries(categoryTotals || {})
        .filter(([key, value]) => value > 0)
        .sort((a,b)=> b[1]-a[1]);

    if (entries.length === 0) {
        container.innerHTML = '<div class="empty-muted">Tidak ada data pada rentang ini.</div>';
        return;
    }

    container.innerHTML = `
        <div class="report-table-wrapper">
        <div class="list report-table-grid-2" style="display:grid; grid-template-columns: 1fr auto; gap:.5rem;">
            <div class="text-dim">Kategori</div>
            <div class="text-dim" style="text-align:right;">Total</div>
            ${entries.map(([k,v]) => `
                <div style="display:flex; align-items:center; gap:.5rem;">
                    <span class="badge">${labels[k] || k}</span>
                </div>
                <div style="text-align:right; font-weight:600;">${fmtIDR(v)}</div>
            `).join('')}
        </div>
        </div>`;
}

function renderAgingTable(aging) {
    const container = $('#aging-table');
    if (!container) return;

    const order = ['notDue','d1_7','d8_30','d31_60','d61_plus','unknown'];
    const rows = order
        .filter(key => aging[key] && (aging[key].count > 0 || aging[key].amount > 0))
        .map(key => aging[key]);

    if (!rows.length) {
        container.innerHTML = '<div class="empty-muted">Tidak ada tagihan belum jatuh tempo/terlambat pada rentang ini.</div>';
        return;
    }

    container.innerHTML = `
        <div class="report-table-wrapper">
        <div class="list report-table-grid-3" style="display:grid; grid-template-columns: 1.5fr .6fr 1fr; gap:.5rem;">
            <div class="text-dim">Bucket</div>
            <div class="text-dim" style="text-align:right;">Jumlah</div>
            <div class="text-dim" style="text-align:right;">Outstanding</div>
            ${rows.map(r => `
                <div>${r.label}</div>
                <div style="text-align:right;">${r.count}</div>
                <div style="text-align:right; font-weight:600;">${fmtIDR(r.amount)}</div>
            `).join('')}
        </div>
        </div>`;
}

function renderSupplierTable(rows) {
    const container = $('#supplier-spend-table');
    if (!container) return;
    if (!rows || rows.length === 0) {
        container.innerHTML = '<div class="empty-muted">Tidak ada transaksi supplier pada rentang ini.</div>';
        return;
    }

    const top = rows.slice(0, 5);
    const othersTotal = rows.slice(5).reduce((s, r) => s + (r.total || 0), 0);
    const total = rows.reduce((s, r) => s + (r.total || 0), 0);
    const pct = v => total > 0 ? Math.round((v / total) * 100) : 0;

    container.innerHTML = `
        <div class="report-table-wrapper">
        <div class="list report-table-grid-3" style="display:grid; grid-template-columns: 1fr .7fr .7fr; gap:.5rem;">
            <div class="text-dim">Supplier</div>
            <div class="text-dim" style="text-align:right;">Total</div>
            <div class="text-dim" style="text-align:right;">Kontribusi</div>
            ${top.map(r => `
                <div>${r.name}</div>
                <div style="text-align:right; font-weight:600;">${fmtIDR(r.total)}</div>
                <div style="text-align:right;">${pct(r.total)}%</div>
            `).join('')}
            ${othersTotal > 0 ? `
                <div>Lainnya (${rows.length - 5})</div>
                <div style="text-align:right; font-weight:600;">${fmtIDR(othersTotal)}</div>
                <div style="text-align:right;">${pct(othersTotal)}%</div>
            ` : ''}
        </div>
        </div>`;
}

function renderMaterialUsageTable(rows) {
    const container = $('#material-usage-table');
    if (!container) return;
    if (!rows || rows.length === 0) {
        container.innerHTML = '<div class="empty-muted">Tidak ada pemakaian material pada rentang ini.</div>';
        return;
    }
    const top = rows.slice(0, 10);
    container.innerHTML = `
        <div class="report-table-wrapper">
        <div class="list report-table-grid-3" style="display:grid; grid-template-columns: 1.2fr .6fr .6fr; gap:.5rem;">
            <div class="text-dim">Material</div>
            <div class="text-dim" style="text-align:right;">Satuan</div>
            <div class="text-dim" style="text-align:right;">Total Pakai</div>
            ${top.map(r => `
                <div>${r.materialName}</div>
                <div style="text-align:right;">${r.unit || '-'}</div>
                <div style="text-align:right; font-weight:600;">${(r.quantity || 0).toLocaleString('id-ID')}</div>
            `).join('')}
        </div>
        </div>`;
}

function renderProjectTable(perProject) {
    const container = $('#project-summary-table');
    if (!container) return;
    if (!perProject || perProject.length === 0) {
        container.innerHTML = '<div class="empty-muted">Tidak ada data proyek pada rentang ini.</div>';
        return;
    }
    container.innerHTML = `
        <div class="report-table-wrapper">
        <div class="list report-table-grid-4" style="display:grid; grid-template-columns: 1.4fr .9fr .9fr .9fr; gap:.5rem;">
            <div class="text-dim">Proyek</div>
            <div class="text-dim" style="text-align:right;">Pemasukan</div>
            <div class="text-dim" style="text-align:right;">Pengeluaran</div>
            <div class="text-dim" style="text-align:right;">Laba/Rugi</div>
            ${perProject.map(p => `
                <div>${p.name}</div>
                <div style="text-align:right;">${fmtIDR(p.income)}</div>
                <div style="text-align:right;">${fmtIDR(p.expense)}</div>
                <div style="text-align:right; color:${p.net>=0?'var(--success)':'var(--danger)'}">${fmtIDR(p.net)}</div>
            `).join('')}
        </div>
        </div>`;
}

function computeProjectHealth() {
    const projects = (appState.projects || []).filter(p => !p.isDeleted && p.budget && p.budget > 0);
    const expensesAll = (appState.expenses || []).filter(e => !e.isDeleted);
    const allBills = (appState.bills || []).filter(b => !b.isDeleted);
    const wageBillsAll = allBills.filter(b => (b.type === 'gaji' || b.type === 'fee'));
    const incomesAll = (appState.incomes || []).filter(i => !i.isDeleted);
    const now = new Date();
    const last30Start = new Date(now); last30Start.setDate(now.getDate() - 30);
    const prev30Start = new Date(now); prev30Start.setDate(now.getDate() - 60);

    function inWindow(d, s, e) { const dt = getJSDate(d); return dt >= s && dt <= e; }

    return projects.map(p => {
        const used = expensesAll.filter(e => e.projectId === p.id).reduce((s,e)=>s+(e.amount||0),0)
            + wageBillsAll.filter(b => b.projectId === p.id).reduce((s,b)=>s+(b.amount||0),0);
        const pct = p.budget > 0 ? (used / p.budget) * 100 : 0;
        const income = incomesAll.filter(i => i.projectId === p.id).reduce((s,i)=>s+(i.amount||0),0);
        const margin = income - used;
        const variance = used - p.budget;
        const variancePct = p.budget > 0 ? (variance / p.budget) * 100 : 0;
        const incomeVsBudgetPct = p.budget > 0 ? (income / p.budget) * 100 : 0;
        const state = (used > p.budget || margin < 0) ? 'over' : (pct >= 80 ? 'near' : 'ok');

        const last30 = expensesAll.filter(e => e.projectId===p.id && inWindow(e.date, last30Start, now)).reduce((s,e)=>s+(e.amount||0),0)
            + wageBillsAll.filter(b => b.projectId===p.id && inWindow(b.createdAt || b.dueDate || b.date, last30Start, now)).reduce((s,b)=>s+(b.amount||0),0);
        const prev30 = expensesAll.filter(e => e.projectId===p.id && inWindow(e.date, prev30Start, last30Start)).reduce((s,e)=>s+(e.amount||0),0)
            + wageBillsAll.filter(b => b.projectId===p.id && inWindow(b.createdAt || b.dueDate || b.date, prev30Start, last30Start)).reduce((s,b)=>s+(b.amount||0),0);
        let trend = 'flat', trendPct = 0;
        if (prev30 === 0 && last30 > 0) {
            trend = 'up'; trendPct = 100;
        } else if (prev30 > 0) {
            const delta = ((last30 - prev30) / prev30) * 100;
            trendPct = Math.round(delta);
            trend = delta > 5 ? 'up' : (delta < -5 ? 'down' : 'flat');
        }

        const unpaidBills = allBills.filter(b => b.projectId === p.id && b.status === 'unpaid');
        const openBillsCount = unpaidBills.length;
        const openBillsAmount = unpaidBills.reduce((s,b)=> s + Math.max(0, (b.amount||0) - (b.paidAmount||0)), 0);

        return { id: p.id, name: p.projectName, budget: p.budget, used, pct, state, trend, trendPct, income, margin, variance, variancePct, incomeVsBudgetPct, openBillsCount, openBillsAmount };
    }).sort((a,b)=> b.pct - a.pct);
}

function renderProjectHealthTable(rows) {
    const container = $('#project-health-table');
    if (!container) return;
    if (!rows || rows.length === 0) {
        container.innerHTML = '<div class="empty-muted">Tidak ada proyek dengan anggaran.</div>';
        return;
    }

    const riskOnly = $('#toggle-health-risk-only')?.checked;
    const filtered = riskOnly ? rows.filter(r => r.state !== 'ok') : rows;
    const top = filtered.slice(0, 10);
    const arrow = (t) => t === 'up' ? '▲' : (t === 'down' ? '▼' : '—');

    container.innerHTML = `
        <div class="report-table-wrapper">
        <div class="list report-table-grid-5" style="display:grid; grid-template-columns: 1.1fr 2fr 1fr 1fr .8fr; gap:.5rem; align-items:center;">
            <div class="text-dim">Proyek</div>
            <div class="text-dim">Anggaran Terpakai</div>
            <div class="text-dim" style="text-align:right;">% Pakai</div>
            <div class="text-dim" style="text-align:right;">Margin (vs Rencana)</div>
            <div class="text-dim" style="text-align:right;">Tren</div>
            ${top.map(r => {
                const pctClamped = Math.max(0, Math.min(120, Math.round(r.pct)));
                const cls = r.used > r.budget ? 'over-budget' : (r.pct >= 80 ? 'near-limit' : '');
                const marginColor = r.margin >= 0 ? 'var(--success)' : 'var(--danger)';
                return `
                    <div>
                        ${r.name}
                        <div class="meta-badge" style="margin-top:.15rem;">
                            <span class="badge">BL: ${r.openBillsCount}</span>
                            <span class="badge">${fmtIDR(r.openBillsAmount)}</span>
                        </div>
                    </div>
                    <div>
                        <div class="budget-bar"><div class="budget-bar-used ${cls}" style="width:${pctClamped}%"></div></div>
                        <div class="text-dim" style="font-size:.75rem;">${fmtIDR(r.used)} / ${fmtIDR(r.budget)} â€¢ Pemasukan: ${fmtIDR(r.income)}</div>
                    </div>
                    <div style="text-align:right; font-weight:600; color:${r.used>r.budget?'var(--danger)':(r.pct>=80?'var(--warn)':'var(--success)')}">${Math.round(r.pct)}%</div>
                    <div style="text-align:right; font-weight:600; color:${marginColor}">${fmtIDR(r.margin)} (${Math.round(r.variancePct)}%)</div>
                    <div style="text-align:right; color:${r.trend==='up'?'var(--danger)':(r.trend==='down'?'var(--success)':'var(--text-dim)')}">${arrow(r.trend)} ${r.trendPct}%</div>
                `;
            }).join('')}
        </div>
        </div>`;
}

function exportProjectHealthCsv() {
    try {
        const health = computeProjectHealth();
        const riskOnly = $('#toggle-health-risk-only')?.checked;
        const rows = (riskOnly ? health.filter(r => r.state !== 'ok') : health).map(r => ({
            Proyek: r.name,
            Anggaran: r.budget,
            Terpakai: r.used,
            PctPakai: Math.round(r.pct),
            Pemasukan: r.income,
            Margin: r.margin,
            VariancePct: Math.round(r.variancePct),
            Tren: r.trend,
            TrenPct: r.trendPct,
        }));
        let csv = 'Proyek,Anggaran,Terpakai,PctPakai,Pemasukan,Margin,VariancePct,Tren,TrenPct\n';
        csv += rows.map(r => [r.Proyek, r.Anggaran, r.Terpakai, r.PctPakai, r.Pemasukan, r.Margin, r.VariancePct, r.Tren, r.TrenPct]
            .map(v => typeof v === 'string' ? '"'+v.replace(/"/g,'""')+'"' : String(v)).join(',')).join('\n');
        const blob = new Blob(['\ufeff'+csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Project-Health-${(new Date()).toISOString().slice(0,10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch(_) {}
}

function applyReportFilters() {
    const start = $('#laporan-start-date')?.value || '';
    const end = $('#laporan-end-date')?.value || '';
    const projectId = $('#laporan-project-id')?.value || 'all';
    appState.reportFilter = { start, end, projectId };
    updateReportFilterNote();

    const data = aggregateReportData({ start, end, projectId });

    renderSummaryAndCharts(data);
    renderCategoryTable(data.categoryTotals);
    renderAgingTable(data.agingBuckets);
    renderSupplierTable(data.supplierBreakdown);
    renderMaterialUsageTable(data.materialUsage);
    renderProjectTable(data.perProject);
    const mode = (appState.reportCashflowMode) || ((new Date(end) - new Date(start)) / (1000*3600*24) > 45 ? 'monthly' : 'weekly');
    renderCashflowCard(mode);

    const health = computeProjectHealth();
    renderProjectHealthTable(health);

    if (appState.reportAccountingMode) {
        try {
            const st = computeAccountingStatements({ start, end, projectId });
            if (st) {
                const setText = (sel, v) => { const el = document.querySelector(sel); if (el) el.textContent = fmtIDR(v); };
                setText('#pl-revenue', st.revenue);
                setText('#pl-cogs', st.cogs);
                setText('#pl-gross', st.grossProfit);
                setText('#pl-opex', st.opex);
                setText('#pl-net', st.netProfit);
                setText('#bs-cash', st.cashNetChange);
                setText('#bs-ap', st.balanceSheet.liabilities.utangUsaha);
                setText('#bs-loans', st.balanceSheet.liabilities.pinjaman);

                const expTbl = document.getElementById('expense-analysis-accounting');
                if (expTbl) {
                    expTbl.innerHTML = `
                        <div class="list" style="display:grid; grid-template-columns: 1fr auto; gap:.5rem;">
                            <div class="text-dim">Kategori</div><div class="text-dim" style="text-align:right;">Total</div>
                            ${st.expenseAnalysis.filter(r => r.value > 0).map(r => `
                                <div>${r.label}</div>
                                <div style="text-align:right; font-weight:600;">${fmtIDR(r.value)}</div>
                            `).join('')}
                        </div>`;
                }
            }
        } catch (_) { console.error("Error computing/rendering accounting statements"); }
    }
}

function setupProjectDropdown() {
    if (typeof teardownProjectDropdown === 'function') {
        teardownProjectDropdown();
        teardownProjectDropdown = null;
    }
    const trigger = $('#laporan-project-trigger');
    const list = $('#laporan-project-options');
    const hiddenInput = $('#laporan-project-id');
    const labelEl = $('#laporan-project-label');
    const root = trigger?.closest('.custom-select');
    if (!trigger || !list || !hiddenInput || !labelEl || !root) return;

    const toggle = (state) => {
        const shouldOpen = typeof state === 'boolean' ? state : !root.classList.contains('open');
        root.classList.toggle('open', shouldOpen);
        trigger.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    };

    const onTriggerClick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggle();
    };

    const onOptionClick = (event) => {
        const option = event.target.closest('[data-value]');
        if (!option) return;
        const value = option.getAttribute('data-value') || 'all';
        hiddenInput.value = value;
        labelEl.textContent = option.textContent.trim();
        list.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
        option.classList.add('selected');
        toggle(false);
        hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const onOutsideClick = (event) => {
        if (!root.contains(event.target)) {
            toggle(false);
        }
    };

    trigger.addEventListener('click', onTriggerClick);
    list.addEventListener('click', onOptionClick);
    document.addEventListener('click', onOutsideClick);

    teardownProjectDropdown = () => {
        trigger.removeEventListener('click', onTriggerClick);
        list.removeEventListener('click', onOptionClick);
        document.removeEventListener('click', onOutsideClick);
    };
}

function getProjectLabel(projectId) {
    if (!projectId || projectId === 'all') return 'Semua Proyek';
    const project = (appState.projects || []).find(p => p.id === projectId);
    return project?.projectName || 'Proyek Terpilih';
}

function formatFilterDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatFilterRangeNote(start, end, projectId) {
    const startLabel = formatFilterDate(start);
    const endLabel = formatFilterDate(end);
    const hasRange = startLabel && endLabel;
    const projectLabel = getProjectLabel(projectId);
    if (hasRange) {
        return `Menampilkan data ${startLabel} – ${endLabel} untuk ${projectLabel}.`;
    }
    return `Menampilkan semua data untuk ${projectLabel}.`;
}

function updateReportFilterNote() {
    const noteEl = $('#report-filter-note');
    if (!noteEl) return;
    const start = $('#laporan-start-date')?.value || '';
    const end = $('#laporan-end-date')?.value || '';
    const projectId = $('#laporan-project-id')?.value || 'all';
    noteEl.textContent = formatFilterRangeNote(start, end, projectId);
}

// Mengelompokkan arus kas per periode (mingguan/bulanan)
function aggregateCashflowByPeriod({ start, end, projectId }, mode = 'weekly') {
    try {
        const byProject = pid => (projectId && projectId !== 'all') ? (pid === projectId) : true;

        const startDate = start ? new Date(start + 'T00:00:00') : null;
        const endDate = end ? new Date(end + 'T23:59:59') : null;

        const clampInRange = (d) => {
            const dt = getJSDate(d);
            if (!dt || isNaN(dt)) return false;
            if (startDate && dt < startDate) return false;
            if (endDate && dt > endDate) return false;
            return true;
        };

        // Helper pembentukan kunci periode
        const toWeekKey = (d) => {
            const date = new Date(d);
            const day = date.getDay(); // 0..6 (Min..Sab)
            const diff = (day === 0 ? -6 : 1) - day; // mundur ke Senin
            const monday = new Date(date);
            monday.setDate(date.getDate() + diff);
            monday.setHours(0,0,0,0);
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            const label = `${monday.toLocaleDateString('id-ID', { day:'2-digit', month:'short' })} â€“ ${sunday.toLocaleDateString('id-ID', { day:'2-digit', month:'short' })}`;
            const key = `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`;
            return { key, label, start: monday, end: sunday };
        };

        const toMonthKey = (d) => {
            const date = new Date(d);
            const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
            const label = date.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
            const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
            const endOfMonth = new Date(date.getFullYear(), date.getMonth()+1, 0, 23,59,59,999);
            return { key, label, start: startOfMonth, end: endOfMonth };
        };

        // Bentuk daftar periode dari rentang tanggal
        const periods = [];
        if (startDate && endDate) {
            let cursor = new Date(startDate);
            while (cursor <= endDate) {
                const { key, label, end: periodEnd } = (mode === 'monthly') ? toMonthKey(cursor) : toWeekKey(cursor);
                if (!periods.find(p => p.key === key)) {
                    periods.push({ key, label });
                }
                // lompat ke periode berikutnya
                if (mode === 'monthly') {
                    cursor = new Date(cursor.getFullYear(), cursor.getMonth()+1, 1);
                } else {
                    cursor = new Date(periodEnd);
                    cursor.setDate(cursor.getDate() + 1);
                }
            }
        } else {
            // fallback: jika tidak ada rentang, pakai 4 periode terakhir
            let cursor = new Date();
            for (let i = 0; i < 4; i++) {
                const t = (mode === 'monthly') ? toMonthKey(cursor) : toWeekKey(cursor);
                if (!periods.find(p => p.key === t.key)) periods.unshift({ key: t.key, label: t.label });
                if (mode === 'monthly') {
                    cursor = new Date(cursor.getFullYear(), cursor.getMonth()-1, 1);
                } else {
                    cursor.setDate(cursor.getDate() - 7);
                }
            }
        }

        // Inisialisasi agregat
        const inflowMap = new Map(periods.map(p => [p.key, 0]));
        const outflowMap = new Map(periods.map(p => [p.key, 0]));

        const pickKey = (d) => ((mode === 'monthly') ? toMonthKey(d).key : toWeekKey(d).key);

        // Inflows: pemasukan
        (appState.incomes || []).filter(x => !x.isDeleted && byProject(x.projectId) && clampInRange(x.date)).forEach(i => {
            const key = pickKey(i.date);
            if (inflowMap.has(key)) inflowMap.set(key, (inflowMap.get(key) || 0) + (i.amount || 0));
        });

        // Outflows: pengeluaran + gaji/fee yang LUNAS (bills)
        (appState.expenses || []).filter(x => !x.isDeleted && byProject(x.projectId) && clampInRange(x.date)).forEach(e => {
            const key = pickKey(e.date);
            if (outflowMap.has(key)) outflowMap.set(key, (outflowMap.get(key) || 0) + (e.amount || 0));
        });
        (appState.bills || []).filter(b => !b.isDeleted && byProject(b.projectId) && (b.type === 'gaji' || b.type === 'fee') && b.status === 'paid' && clampInRange(b.createdAt || b.dueDate || b.date)).forEach(b => {
            const key = pickKey(b.createdAt || b.dueDate || b.date);
            if (outflowMap.has(key)) outflowMap.set(key, (outflowMap.get(key) || 0) + (b.amount || 0));
        });

        // Susun hasil sesuai urutan periode
        const labels = periods.map(p => p.label);
        const inflows = periods.map(p => inflowMap.get(p.key) || 0);
        const outflows = periods.map(p => outflowMap.get(p.key) || 0);

        return { labels, inflows, outflows };
    } catch (e) {
        console.warn('aggregateCashflowByPeriod error:', e);
        return { labels: [], inflows: [], outflows: [] };
    }
}

function renderCashflowCard(mode) {
    appState.reportCashflowMode = mode;
    const start = $('#laporan-start-date')?.value || '';
    const end = $('#laporan-end-date')?.value || '';
    const projectId = $('#laporan-project-id')?.value || 'all';

    const { labels, inflows, outflows } = aggregateCashflowByPeriod({ start, end, projectId }, mode);

    _renderCashflowPeriodChart({ canvasId: 'cashflow-period-chart', labels, inflows, outflows });

    const container = $('#cashflow-period-table');
    if (container) {
        const rows = labels.map((lbl, i) => ({ label: lbl, in: inflows[i] || 0, out: outflows[i] || 0, net: (inflows[i]||0) - (outflows[i]||0) }));
        const totalIn = rows.reduce((s,r)=>s+r.in,0);
        const totalOut = rows.reduce((s,r)=>s+r.out,0);
        const totalNet = totalIn - totalOut;

        // PERBAIKAN BUG: Gunakan fmtIDR yang diimpor
        // const fmtIDR = fmtIDRFormat; // Hapus baris ini

        container.innerHTML = `
            <div class="report-table-wrapper">
            <div class="list report-table-grid-4" style="display:grid; grid-template-columns: 1fr .8fr .8fr .8fr; gap:.5rem;">
                <div class="text-dim">Periode</div>
                <div class="text-dim" style="text-align:right;">Masuk</div>
                <div class="text-dim" style="text-align:right;">Keluar</div>
                <div class="text-dim" style="text-align:right;">Net</div>
                ${rows.map(r => `
                    <div>${r.label}</div>
                    <div style="text-align:right;">${fmtIDR(r.in)}</div>
                    <div style="text-align:right;">${fmtIDR(r.out)}</div>
                    <div style="text-align:right; color:${r.net>=0?'var(--success)':'var(--danger)'}">${fmtIDR(r.net)}</div>
                `).join('')}
                <div class="text-dim">Total</div>
                <div style="text-align:right; font-weight:700;">${fmtIDR(totalIn)}</div>
                <div style="text-align:right; font-weight:700;">${fmtIDR(totalOut)}</div>
                <div style="text-align:right; font-weight:700; color:${totalNet>=0?'var(--success)':'var(--danger)'}">${fmtIDR(totalNet)}</div>
            </div>
            </div>`;
    }

    const w = $('#btn-cf-weekly');
    const m = $('#btn-cf-monthly');
    if (w && m) {
        w.classList.toggle('btn-primary', mode === 'weekly');
        m.classList.toggle('btn-primary', mode === 'monthly');
        w.classList.toggle('btn-light', mode !== 'weekly');
        m.classList.toggle('btn-light', mode !== 'monthly');
    }
}

function quickRange(days) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    $('#laporan-start-date').value = start.toISOString().slice(0,10);
    $('#laporan-end-date').value = end.toISOString().slice(0,10);
    applyReportFilters();
}

function resetRange() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    $('#laporan-start-date').value = firstDay.toISOString().slice(0,10);
    $('#laporan-end-date').value = today.toISOString().slice(0,10);
    $('#laporan-project-id').value = 'all';
    applyReportFilters();
}

async function initLaporanPage() {
    const container = $('.page-container');
    try { container?.classList?.add('page--laporan'); } catch(_) {}
    // Ensure laporan page uses panel layout for unified look
    try { container?.classList?.add('page-container--has-panel'); } catch(_) {}
    try { if (typeof appState.reportAccountingMode === 'undefined') { appState.reportAccountingMode = (localStorage.getItem('banplex.report.accountingMode') === '1'); } } catch(_) {}

    const actions = [
        { id: 'toggle-accounting-mode', action: 'toggle-accounting-mode', icon: 'landmark', label: 'Mode' },
        { id: 'open-report-generator-btn', action: 'open-report-generator', icon: 'download', label: 'Buat/Unduh Laporan' },
        { id: 'open-simulasi-btn', action: 'navigate', nav: 'simulasi', icon: 'payments', label: 'Simulasi' }
    ];
    const toolbarTitle = appState.reportAccountingMode ? 'Laporan' : 'Laporan';

    // Use sticky toolbar inside panel-header for consistency across pages
    const pageToolbarHTML = createPageToolbarHTML({ title: toolbarTitle, actions });

    // Reports hero moved into panel-header for a unified page header
    // Wrap content with content-panel structure to blend backgrounds consistently
    container.innerHTML = `
        <div class="content-panel">
            <div class="panel-header">
                ${pageToolbarHTML}
            </div>
            <div id="sub-page-content" class="panel-body scrollable-content has-padding">
                ${_getSkeletonLoaderHTML('laporan')}
            </div>
        </div>
    `;
    try {
        const pref = localStorage.getItem('ui.layout.reports') || 'grid';
        document.body.classList.toggle('laporan-layout-grid', pref === 'grid');
        document.body.classList.toggle('laporan-layout-cards', pref === 'cards');
    } catch(_) {}

    const btn = document.getElementById('toggle-accounting-mode');
    if (btn) {
        btn.classList.add('report-mode-toggle');
        const isOn = !!appState.reportAccountingMode;
        btn.classList.toggle('active', isOn);
        btn.setAttribute('aria-pressed', isOn ? 'true' : 'false');
        btn.title = isOn ? 'Mode Pro' : 'Mode Basic';
        btn.innerHTML = `
            <span class="toggle-dot" aria-hidden="true"></span>
            <span class="toggle-label">${isOn ? 'Pro' : 'Basic'}</span>
        `;
    }

    ensureReportDataFresh().then(() => {
        emit('ui.laporan.renderContent');
    });

    try {
        if (initLaporanPage._live) { initLaporanPage._live.unsubscribe?.(); initLaporanPage._live = null; }
        // Re-render reports when any key dataset changes
        initLaporanPage._live = liveQueryMulti(
            ['incomes','expenses','bills','fundingSources','projects','workers','materials','stockTransactions','attendanceRecords','suppliers'],
            () => {
                clearTimeout(initLaporanPage._deb);
                initLaporanPage._deb = setTimeout(() => emit('ui.laporan.renderContent'), 250);
            }
        );
    } catch (_) {}
}

on('ui.laporan.renderContent', renderLaporanContent);
on('app.unload.laporan', () => { try { if (initLaporanPage._live) { initLaporanPage._live.unsubscribe?.(); initLaporanPage._live = null; } } catch(_) {} });

on('laporan.showDailyTransactionDetails', (date) => {
    try {
        const container = $('#report-daily-details');
        if (!container) return;

        const ymd = date.toISOString().slice(0,10);
        const { projectId } = appState.reportFilter || { projectId: 'all' };
        const byProject = pid => (projectId && projectId !== 'all') ? (pid === projectId) : true;

        const incomes = (appState.incomes || []).filter(i => !i.isDeleted && byProject(i.projectId) && getJSDate(i.date).toISOString().slice(0,10) === ymd);
        const expenses = (appState.expenses || []).filter(e => !e.isDeleted && byProject(e.projectId) && getJSDate(e.date).toISOString().slice(0,10) === ymd);

        const items = [
            ...incomes.map(i => ({ type: 'Pemasukan', desc: i.description || 'Pemasukan', amt: i.amount })),
            ...expenses.map(e => ({ type: 'Pengeluaran', desc: e.description || 'Pengeluaran', amt: -Math.abs(e.amount || 0) }))
        ];

        if (items.length === 0) {
            container.innerHTML = `<section class="panel panel-pad" style="margin-top:1rem;">Tidak ada transaksi pada ${date.toLocaleDateString('id-ID')}.</section>`;
            return;
        }

        const total = items.reduce((s, x) => s + x.amt, 0);

        container.innerHTML = `
            <section class="panel panel-pad" style="margin-top:1rem;">
                <div class="card-header" style="margin-bottom:.5rem;">
                    <div class="card-icon">ðŸ“…</div>
                    <span class="card-title">Detail Transaksi ${date.toLocaleDateString('id-ID')}</span>
                </div>
                <div class="report-table-wrapper">
                <div class="list report-table-grid-2" style="display:grid; grid-template-columns: 1fr auto; gap:.5rem;">
                    ${items.map(it => `
                        <div><span class="badge ${it.amt>=0?'success':'danger'}">${it.type}</span> ${it.desc}</div>
                        <div style="text-align:right; font-weight:600;">${fmtIDR(it.amt)}</div>
                    `).join('')}
                    <div class="text-dim">Total</div>
                    <div style="text-align:right; font-weight:700;">${fmtIDR(total)}</div>
                </div>
                </div>
            </section>`;
        try { const iconEl = container.querySelector('.card-header .card-icon'); if (iconEl) iconEl.innerHTML = createIcon('calendar'); } catch(_) {}
    } catch(_) {}
});

async function ensureReportDataFresh() {
    try {
        const tasks = [
            ['projects', projectsCol, 'projectName'],
            ['suppliers', suppliersCol, 'supplierName'],
            ['workers', workersCol, 'workerName'],
            ['staff', staffCol, 'staffName'],
            ['incomes', incomesCol, 'date'],
            ['expenses', expensesCol, 'date'],
            ['bills', billsCol, 'createdAt'],
            ['fundingSources', fundingSourcesCol, 'createdAt'],
            ['materials', materialsCol, 'materialName'],
            ['stockTransactions', stockTransactionsCol, 'date'],
            ['attendanceRecords', attendanceRecordsCol, 'date'],
        ];
        await Promise.all(tasks.map(([k, col, order]) => fetchAndCacheData(k, col, order)));
    } catch (_) {}
}

// Ekspor CSV untuk kartu arus kas per periode
function exportCashflowCsv() {
    try {
        const start = $('#laporan-start-date')?.value || '';
        const end = $('#laporan-end-date')?.value || '';
        const projectId = $('#laporan-project-id')?.value || 'all';
        const mode = appState.reportCashflowMode || 'weekly';

        const { labels, inflows, outflows } = aggregateCashflowByPeriod({ start, end, projectId }, mode);
        const rows = labels.map((lbl, i) => ({
            Periode: lbl,
            Masuk: inflows[i] || 0,
            Keluar: outflows[i] || 0,
            Net: (inflows[i] || 0) - (outflows[i] || 0)
        }));

        let csv = 'Periode,Masuk,Keluar,Net\n';
        csv += rows.map(r => [r.Periode, r.Masuk, r.Keluar, r.Net]
            .map(v => typeof v === 'string' ? '"'+v.replace(/"/g,'""')+'"' : String(v)).join(',')).join('\n');

        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Cashflow-${mode}-${(new Date()).toISOString().slice(0,10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        console.warn('exportCashflowCsv error:', e);
    }
}

function computeAccountingStatements(filter) {
    const base = aggregateReportData(filter);
    const expCat = aggregateExpenseCategoriesByType(filter);
    const revenue = base.totals.totalIncome;
    const cogs = expCat.material || 0;
    const grossProfit = revenue - cogs;
    const wages = (base.totals.totalWagesPaid || 0);
    const opex = (expCat.operasional || 0) + (expCat.lainnya || 0) + wages;
    const netProfit = grossProfit - opex;
    const cashOperatingIn = revenue;
    const cashOperatingOut = (expCat.material || 0) + (expCat.operasional || 0) + (expCat.lainnya || 0) + wages;
    const cashOperatingNet = cashOperatingIn - cashOperatingOut;
    const cashFinancingIn = base.totals.totalFunding || 0;
    const cashNetChange = cashOperatingNet + cashFinancingIn;
    const balanceSheet = {
        assets: { kas: cashNetChange },
        liabilities: { utangUsaha: base.totals.unpaidBillsAmount || 0, pinjaman: base.totals.unpaidLoansAmount || 0 }
    };
    const expenseAnalysis = [
        { label: 'Material (HPP)', value: expCat.material || 0 },
        { label: 'Operasional', value: expCat.operasional || 0 },
        { label: 'Lainnya', value: expCat.lainnya || 0 },
        { label: 'Gaji/Fee (Lunas)', value: wages }
    ];
    return { base, revenue, cogs, grossProfit, wages, opex, netProfit, cashOperatingIn, cashOperatingOut, cashOperatingNet, cashFinancingIn, cashNetChange, balanceSheet, expenseAnalysis };
}

function aggregateExpenseCategoriesByType({ start, end, projectId }) {
    const byProject = pid => (projectId && projectId !== 'all') ? (pid === projectId) : true;
    const inR = (d) => inRange(d, start, end);
    const expenses = (appState.expenses || []).filter(x => !x.isDeleted && byProject(x.projectId) && inR(x.date));
    const totals = { material: 0, operasional: 0, lainnya: 0 };
    expenses.forEach(e => { const t = e.type || 'lainnya'; if (totals[t] == null) totals[t] = 0; totals[t] += (e.amount || 0); });
    return totals;
}


export { initLaporanPage };



