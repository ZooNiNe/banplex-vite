import { appState } from '../../state/appState.js';
import { $, $$ } from '../../utils/dom.js';
import { getEmptyStateHTML } from '../components/emptyState.js';
import { emit, on } from '../../state/eventBus.js';
import { fmtIDR } from '../../utils/formatters.js';
import { _renderFinancialSummaryChart, _renderInteractiveBarChart, _renderCashflowPeriodChart } from '../components/charts.js';
import { getJSDate } from '../../utils/helpers.js';
import { fetchAndCacheData } from '../../services/data/fetch.js';
import { projectsCol, suppliersCol, workersCol, staffCol, incomesCol, expensesCol, billsCol, fundingSourcesCol, materialsCol, stockTransactionsCol, attendanceRecordsCol } from '../../config/firebase.js';
import { ensureMasterDataFresh } from '../../services/data/ensureMasters.js';
import { _getSkeletonLoaderHTML } from '../components/skeleton.js';
import { initCustomSelects } from '../components/forms/index.js';
import { createPageToolbarHTML } from '../components/toolbar.js';

// Helper Icon Creator
function createIcon(name, size = 18, classes = '') {
    const icons = {
        check: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check ${classes}"><path d="M20 6 9 17l-5-5"/></svg>`,
        'chevron-down': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down ${classes}"><path d="m6 9 6 6 6-6"/></svg>`,
        download: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download ${classes}"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
        // Menggunakan SVG Kalkulator spesifik dari user
        calculator: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calculator-icon lucide-calculator ${classes}"><rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg>`,
        file: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-text ${classes}"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>`,
    };
    return icons[name] || '';
}

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

        // --- 1. FILTER SECTION ---
        const filterHTML = `
            <section class="report-filter-card" id="report-filter-card">
                <div class="report-filter">
                    <div class="report-filter__primary">
                        <div class="filter-field">
                            <label>Rentang Tanggal</label>
                            <div class="date-range-group">
                                <input type="date" id="laporan-start-date" value="${ymd(firstDay)}" />
                                <span class="range-sep">s/d</span>
                                <input type="date" id="laporan-end-date" value="${ymd(today)}" />
                            </div>
                        </div>
                        <div class="filter-field">
                            <label>Proyek</label>
                            <div class="custom-select-wrapper" data-master-type="projects">
                                <input type="hidden" id="laporan-project-id" value="${defaultProjectId}" />
                                <button class="custom-select-trigger" type="button" id="laporan-project-trigger">
                                    <span id="laporan-project-label">${projectOptions[0]?.label || 'Semua Proyek'}</span>
                                    ${createIcon('chevron-down', 16)}
                                </button>
                                <div class="custom-select-options">
                                    <div class="custom-select-options-list">
                                        ${projectOptions.map(opt => `<div class="custom-select-option ${opt.value === defaultProjectId ? 'selected' : ''}" data-value="${opt.value}">${opt.label}</div>`).join('')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="report-filter__bottom">
                        <div class="quick-chip-group">
                            <button class="chip-button" id="btn-quick-7" type="button">7 Hari</button>
                            <button class="chip-button" id="btn-quick-30" type="button">30 Hari</button>
                            <button class="chip-button" id="btn-reset-range" type="button">Reset</button>
                        </div>
                        <div class="report-filter__actions">
                            <button class="btn btn-primary btn-full" id="btn-apply-report-filter">
                                ${createIcon('check', 16)} Terapkan
                            </button>
                        </div>
                    </div>
                    <p class="filter-range-note" id="report-filter-note">${initialFilterNote}</p>
                </div>
            </section>`;

        // --- 2. KPI HEADER (Nominal Fleksibel) ---
        const summaryHeaderHTML = `
            <div class="report-summary-header" id="report-summary-header">
                <article class="kpi-pill">
                    <span class="kpi-label">Pemasukan</span>
                    <strong class="kpi-value value--income" id="kpi-income">-</strong>
                </article>
                <article class="kpi-pill">
                    <span class="kpi-label">Pengeluaran (Cash+Tagihan)</span>
                    <strong class="kpi-value value--expense" id="kpi-total-cost">-</strong>
                </article>
                <article class="kpi-pill kpi-pill--ghost">
                    <span class="kpi-label">Laba Kotor</span>
                    <strong class="kpi-value" id="kpi-gross-profit">-</strong>
                </article>
                <article class="kpi-pill accent">
                    <span class="kpi-label">Laba Bersih</span>
                    <strong class="kpi-value value--balance" id="kpi-net-profit">-</strong>
                </article>
            </div>`;

        // --- 3. INSIGHT STACK ---
        const contentHTML = `
            <div class="insight-stack" id="report-summary-grid">
                
                <section class="insight-card">
                    <header class="insight-header">
                        <div>
                            <p class="insight-eyebrow">Ringkasan</p>
                            <h3 class="card-title">Arus Keuangan</h3>
                        </div>
                        <span class="insight-tag">Realtime</span>
                    </header>
                    <div class="insight-body">
                        <div class="card-body-chart">
                            <canvas id="financial-summary-chart"></canvas>
                        </div>
                    </div>
                </section>

                <section class="insight-card">
                    <header class="insight-header">
                        <div>
                            <p class="insight-eyebrow">Analisis</p>
                            <h3 class="card-title">Laporan Laba Rugi</h3>
                        </div>
                    </header>
                    <div class="insight-body">
                        <div class="insight-table">
                            <div class="report-table-grid-2">
                                <span class="label">Pendapatan</span>
                                <span class="value value--income responsive-val" id="pl-revenue">-</span>
                            </div>
                            <div class="report-table-grid-2">
                                <span class="label">HPP (Material)</span>
                                <span class="value text-dim responsive-val" id="pl-cogs">-</span>
                            </div>
                            <div class="report-table-grid-2 highlight" style="background:var(--surface-muted);">
                                <span class="label">Laba Kotor</span>
                                <span class="value responsive-val" id="pl-gross">-</span>
                            </div>
                            <div class="report-table-grid-2">
                                <span class="label">Beban Operasional</span>
                                <span class="value text-dim responsive-val" id="pl-opex">-</span>
                            </div>
                            <div class="report-table-grid-2">
                                <span class="label">Beban Gaji (Total)</span>
                                <span class="value text-dim responsive-val" id="pl-wages">-</span>
                            </div>
                            <div class="report-table-grid-2">
                                <span class="label">Beban Lainnya</span>
                                <span class="value text-dim responsive-val" id="pl-others">-</span>
                            </div>
                            <div class="report-table-grid-2 highlight" style="border-top:2px solid var(--line);">
                                <span class="label">Laba Bersih</span>
                                <span class="value value--balance responsive-val" id="pl-net">-</span>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="insight-card" style="position:relative;">
                    <header class="insight-header" style="padding-right:90px;">
                        <div>
                            <p class="insight-eyebrow">Arus Kas</p>
                            <h3 class="card-title" id="cf-card-title">Tren Mingguan</h3>
                        </div>
                        <div class="insight-actions absolute-top-right">
                            <div class="round-toggle-group">
                                <button class="round-toggle-btn active" id="btn-cf-weekly">7D</button>
                                <button class="round-toggle-btn" id="btn-cf-monthly">30D</button>
                            </div>
                        </div>
                    </header>
                    <div class="insight-body">
                        <div class="card-body-chart">
                            <canvas id="cashflow-period-chart"></canvas>
                        </div>
                        <div id="cashflow-period-table" class="table-like" style="margin-top:12px;"></div>
                    </div>
                </section>

                <section class="insight-card">
                    <header class="insight-header">
                        <div>
                            <p class="insight-eyebrow">Detail</p>
                            <h3 class="card-title">Rincian Penggunaan Anggaran</h3>
                        </div>
                    </header>
                    <div class="insight-body">
                        <p class="insight-subtext" style="margin-bottom:12px;">Akumulasi pengeluaran tunai & tagihan.</p>
                        <div class="insight-table">
                            <div class="report-table-grid-2">
                                <span class="label">Material</span>
                                <span class="value responsive-val" id="exp-material">-</span>
                            </div>
                            <div class="report-table-grid-2">
                                <span class="label">Operasional</span>
                                <span class="value responsive-val" id="exp-ops">-</span>
                            </div>
                            <div class="report-table-grid-2">
                                <span class="label">Gaji & Upah</span>
                                <span class="value responsive-val" id="exp-wages">-</span>
                            </div>
                            <div class="report-table-grid-2">
                                <span class="label">Lain-lain</span>
                                <span class="value responsive-val" id="exp-others">-</span>
                            </div>
                            <div class="report-table-grid-2 highlight">
                                <span class="label">Total Terpakai</span>
                                <span class="value responsive-val" id="exp-total">-</span>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="insight-card">
                    <header class="insight-header">
                        <div>
                            <p class="insight-eyebrow">Posisi</p>
                            <h3 class="card-title">Neraca Ringkas</h3>
                        </div>
                    </header>
                    <div class="insight-body">
                        <div class="insight-table">
                            <div class="report-table-grid-2 section-head"><span class="label strong">Kewajiban</span></div>
                            <div class="report-table-grid-2">
                                <span class="label">Utang Tagihan</span>
                                <span class="value value--expense responsive-val" id="bs-unpaid-bills">-</span>
                            </div>
                            <div class="report-table-grid-2">
                                <span class="label">Sisa Pinjaman</span>
                                <span class="value value--expense responsive-val" id="bs-unpaid-loans">-</span>
                            </div>
                            <div class="report-table-grid-2 section-head" style="margin-top:8px;"><span class="label strong">Aset (Estimasi)</span></div>
                            <div class="report-table-grid-2">
                                <span class="label">Kas Masuk (Net)</span>
                                <span class="value value--income responsive-val" id="bs-cash-in">-</span>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="insight-card" style="position:relative;">
                    <header class="insight-header" style="padding-right: 12px;">
                        <div>
                            <p class="insight-eyebrow">Proyek</p>
                            <h3 class="card-title">Kesehatan Proyek</h3>
                        </div>
                        <div class="insight-actions absolute-top-right">
                             <label class="custom-checkbox-label" title="Tampilkan hanya proyek berisiko">
                                <input type="checkbox" id="toggle-health-risk-only">
                                <span class="custom-checkbox-visual"></span>
                                <span class="checkbox-text">Risiko</span>
                             </label>
                             <button class="icon-button" id="btn-health-csv" title="Unduh CSV">${createIcon('download')}</button>
                        </div>
                    </header>
                    <div class="insight-body">
                        <div id="project-health-table" class="table-like"></div>
                    </div>
                </section>

            </div>
            <div id="report-daily-details"></div>
        `;

        container.innerHTML = filterHTML + summaryHeaderHTML + contentHTML;
        
        initCustomSelects(container);
        updateReportFilterNote();
        
        // --- Event Listeners ---
        $('#btn-apply-report-filter')?.addEventListener('click', () => applyReportFilters());
        $('#btn-quick-7')?.addEventListener('click', () => quickRange(7));
        $('#btn-quick-30')?.addEventListener('click', () => quickRange(30));
        $('#btn-reset-range')?.addEventListener('click', () => resetRange());
        $('#btn-health-csv')?.addEventListener('click', exportProjectHealthCsv);
        
        // Listeners for Round Toggle Buttons (Cashflow)
        $('#btn-cf-weekly')?.addEventListener('click', () => renderCashflowCard('weekly'));
        $('#btn-cf-monthly')?.addEventListener('click', () => renderCashflowCard('monthly'));

        const riskToggle = $('#toggle-health-risk-only');
        if(riskToggle) {
            const riskStored = localStorage.getItem('banplex.report.health.riskOnly');
            riskToggle.checked = riskStored === '1';
            riskToggle.addEventListener('change', () => {
                localStorage.setItem('banplex.report.health.riskOnly', riskToggle.checked ? '1' : '0');
                const data = aggregateReportData({ 
                    start: $('#laporan-start-date').value, 
                    end: $('#laporan-end-date').value, 
                    projectId: $('#laporan-project-id').value 
                });
                renderProjectHealthTable(data.projectHealth); 
            });
        }

        applyReportFilters();

        const autoApply = () => applyReportFilters();
        $('#laporan-start-date')?.addEventListener('change', autoApply);
        $('#laporan-end-date')?.addEventListener('change', autoApply);
        $('#laporan-project-id')?.addEventListener('change', autoApply);

        // --- Manual Icon Injection untuk Tombol Simulasi ---
        setTimeout(() => {
            const simBtn = document.getElementById('open-simulasi-btn');
            if(simBtn) {
                // Hapus label teks, ganti dengan hanya ikon
                simBtn.innerHTML = createIcon('calculator', 20); 
                simBtn.setAttribute('title', 'Simulasi Anggaran'); // Tooltip native
            }
        }, 100);

    } catch (error) {
        console.error(error);
        container.innerHTML = getEmptyStateHTML({ icon: 'error', title: 'Error', desc: 'Gagal memuat laporan.' });
    }
}

// ... (Sisa fungsi helper: inRange, getProjectLabel, aggregateReportData dll tetap sama) ...
// Pastikan fungsi helper di bawah ini tetap ada di dalam file Anda.

function inRange(date, start, end) {
    const d = getJSDate(date);
    if (!d || isNaN(d)) return true;
    if (start && d < new Date(start + 'T00:00:00')) return false;
    if (end && d > new Date(end + 'T23:59:59')) return false;
    return true;
}

function getProjectLabel(projectId) {
    if (!projectId || projectId === 'all') return 'Semua Proyek';
    const project = (appState.projects || []).find(p => p.id === projectId);
    return project?.projectName || 'Proyek Terpilih';
}

function formatFilterRangeNote(start, end, projectId) {
    const d1 = new Date(start);
    const d2 = new Date(end);
    const label = (isNaN(d1) || isNaN(d2)) ? '' : `${d1.toLocaleDateString('id-ID', {day:'numeric', month:'short'})} - ${d2.toLocaleDateString('id-ID', {day:'numeric', month:'short', year:'numeric'})}`;
    const pLabel = getProjectLabel(projectId);
    return `${label} • ${pLabel}`;
}

function updateReportFilterNote() {
    const noteEl = $('#report-filter-note');
    if (!noteEl) return;
    const start = $('#laporan-start-date')?.value || '';
    const end = $('#laporan-end-date')?.value || '';
    const projectId = $('#laporan-project-id')?.value || 'all';
    noteEl.textContent = formatFilterRangeNote(start, end, projectId);
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

function aggregateReportData({ start, end, projectId }) {
    const byProject = pid => (projectId && projectId !== 'all') ? (pid === projectId) : true;

    const incomes = (appState.incomes || []).filter(x => !x.isDeleted && byProject(x.projectId) && inRange(x.date, start, end));
    const expenses = (appState.expenses || []).filter(x => !x.isDeleted && byProject(x.projectId) && inRange(x.date, start, end));
    const bills = (appState.bills || []).filter(b => !b.isDeleted && byProject(b.projectId) && inRange(b.date || b.createdAt, start, end));
    const funding = (appState.fundingSources || []).filter(f => !f.isDeleted && inRange(f.createdAt || f.date, start, end));

    const totalIncome = incomes.reduce((s, i) => s + (i.amount || 0), 0);
    
    const expenseMaterial = expenses.filter(e => e.type === 'material').reduce((s, e) => s + (e.amount || 0), 0);
    const expenseOps = expenses.filter(e => e.type === 'operasional').reduce((s, e) => s + (e.amount || 0), 0);
    const expenseOther = expenses.filter(e => !['material', 'operasional'].includes(e.type)).reduce((s, e) => s + (e.amount || 0), 0);

    const wageBills = bills.filter(b => b.type === 'gaji' || b.type === 'fee');
    const totalWageBillAmount = wageBills.reduce((s, b) => s + (b.amount || 0), 0);

    const unpaidBills = bills.filter(b => b.status === 'unpaid');
    const unpaidBillsAmount = unpaidBills.reduce((s, b) => s + Math.max(0, (b.amount || 0) - (b.paidAmount || 0)), 0);
    
    const unpaidLoansAmount = (appState.fundingSources || [])
        .filter(l => !l.isDeleted && l.status === 'unpaid')
        .reduce((s, l) => s + Math.max(0, (l.totalRepaymentAmount || l.totalAmount || 0) - (l.paidAmount || 0)), 0);

    const revenue = totalIncome;
    const cogs = expenseMaterial; 
    const grossProfit = revenue - cogs;
    
    const totalCost = expenseMaterial + expenseOps + expenseOther + totalWageBillAmount;
    const opex = expenseOps;
    const netProfit = revenue - totalCost;

    const projects = (appState.projects || []).filter(p => !p.isDeleted && p.budget > 0);
    const projectHealth = projects.map(p => {
        const projExpenses = (appState.expenses || []).filter(e => !e.isDeleted && e.projectId === p.id).reduce((s,e)=>s+(e.amount||0),0);
        const projBills = (appState.bills || []).filter(b => !b.isDeleted && b.projectId === p.id && (b.type==='gaji'||b.type==='fee')).reduce((s,b)=>s+(b.amount||0),0);
        const used = projExpenses + projBills;
        const pct = (used / p.budget) * 100;
        const income = (appState.incomes || []).filter(i => !i.isDeleted && i.projectId === p.id).reduce((s,i)=>s+(i.amount||0),0);
        const margin = income - used;
        const state = (used > p.budget || margin < 0) ? 'risk' : 'ok';
        return { name: p.projectName, budget: p.budget, used, pct, margin, state };
    }).sort((a,b) => b.pct - a.pct);

    return {
        financials: {
            revenue, cogs, grossProfit, opex, wages: totalWageBillAmount, others: expenseOther,
            totalCost, netProfit, unpaidBillsAmount, unpaidLoansAmount,
            totalFunding: funding.reduce((s,f)=>s+(f.totalAmount||0),0)
        },
        projectHealth
    };
}

// Cashflow by Period Logic
function aggregateCashflowByPeriod({ start, end, projectId }, mode = 'weekly') {
    const byProject = pid => (projectId && projectId !== 'all') ? (pid === projectId) : true;
    const sDate = start ? new Date(start) : null;
    const eDate = end ? new Date(end) : null;
    
    const clamp = d => {
        const dt = getJSDate(d);
        if(!dt) return false;
        if(sDate && dt < sDate) return false;
        if(eDate && dt > eDate) return false;
        return true;
    };

    const getKey = (d) => {
        const date = getJSDate(d);
        if(mode === 'monthly') return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
        // Weekly
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1); 
        const monday = new Date(date.setDate(diff));
        return `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`;
    };

    const periods = new Map();
    const add = (d, type, amt) => {
        if(!clamp(d)) return;
        const k = getKey(d);
        if(!periods.has(k)) periods.set(k, { in:0, out:0, label: k });
        const rec = periods.get(k);
        if(type==='in') rec.in += amt; else rec.out += amt;
    };

    (appState.incomes||[]).filter(x=>!x.isDeleted && byProject(x.projectId)).forEach(i => add(i.date, 'in', i.amount||0));
    (appState.expenses||[]).filter(x=>!x.isDeleted && byProject(x.projectId)).forEach(e => add(e.date, 'out', e.amount||0));
    (appState.bills||[]).filter(b=>!b.isDeleted && byProject(b.projectId) && (b.type==='gaji'||b.type==='fee')).forEach(b => add(b.date||b.createdAt, 'out', b.amount||0));

    const sortedKeys = Array.from(periods.keys()).sort();
    return {
        labels: sortedKeys,
        inflows: sortedKeys.map(k => periods.get(k).in),
        outflows: sortedKeys.map(k => periods.get(k).out)
    };
}

function renderCashflowCard(mode) {
    appState.reportCashflowMode = mode;
    const start = $('#laporan-start-date')?.value;
    const end = $('#laporan-end-date')?.value;
    const projectId = $('#laporan-project-id')?.value;

    const data = aggregateCashflowByPeriod({ start, end, projectId }, mode);
    _renderCashflowPeriodChart({ canvasId: 'cashflow-period-chart', labels: data.labels, inflows: data.inflows, outflows: data.outflows });

    // REVISI: Update Judul Kartu
    const titleEl = $('#cf-card-title');
    if(titleEl) titleEl.textContent = mode === 'weekly' ? 'Tren Mingguan' : 'Tren Bulanan';

    // Update Round Button State
    $$('.round-toggle-btn').forEach(b => b.classList.remove('active'));
    $(`#btn-cf-${mode}`)?.classList.add('active');

    const table = $('#cashflow-period-table');
    if(table) {
        table.innerHTML = `
            <div class="report-table-wrapper">
                <div class="report-table-grid-5" style="min-width:500px; font-weight:600; background:var(--surface-muted);">
                    <div>Periode</div><div>Masuk</div><div>Keluar</div><div>Net</div>
                </div>
                ${data.labels.map((lbl, i) => {
                    const net = data.inflows[i] - data.outflows[i];
                    return `
                    <div class="report-table-grid-5" style="min-width:500px;">
                        <div>${lbl}</div>
                        <div class="value--income">${fmtIDR(data.inflows[i])}</div>
                        <div class="value--expense">${fmtIDR(data.outflows[i])}</div>
                        <div style="font-weight:600; color:${net>=0?'var(--success)':'var(--danger)'}">${fmtIDR(net)}</div>
                    </div>`;
                }).join('')}
            </div>
        `;
    }
}

function renderSummaryAndCharts(data) {
    const f = data.financials;
    const setText = (id, val, isCurrency=true) => { const el = $(`#${id}`); if(el) el.textContent = isCurrency ? fmtIDR(val) : val; };

    setText('kpi-income', f.revenue);
    setText('kpi-total-cost', f.totalCost);
    setText('kpi-gross-profit', f.grossProfit);
    setText('kpi-net-profit', f.netProfit);

    setText('pl-revenue', f.revenue);
    setText('pl-cogs', f.cogs);
    setText('pl-gross', f.grossProfit);
    setText('pl-opex', f.opex);
    setText('pl-wages', f.wages);
    setText('pl-others', f.others);
    setText('pl-net', f.netProfit);

    setText('exp-material', f.cogs);
    setText('exp-ops', f.opex);
    setText('exp-wages', f.wages);
    setText('exp-others', f.others);
    setText('exp-total', f.totalCost);

    setText('bs-unpaid-bills', f.unpaidBillsAmount);
    setText('bs-unpaid-loans', f.unpaidLoansAmount);
    setText('bs-cash-in', f.revenue + f.totalFunding); 

    const summaryChartData = {
        summary: {
            totalIncome: f.revenue,
            totalExpense: f.totalCost, 
            totalFunding: f.totalFunding,
            loanInterest: 0 
        }
    };
    
    const originalDashboardData = appState.dashboardData;
    appState.dashboardData = summaryChartData;
    _renderFinancialSummaryChart();
    appState.dashboardData = originalDashboardData;

    renderCashflowCard(appState.reportCashflowMode || 'weekly');
}

function renderProjectHealthTable(rows) {
    const container = $('#project-health-table');
    if (!container) return;
    if (!rows.length) { container.innerHTML = '<div class="empty-muted" style="padding:12px;text-align:center;">Tidak ada proyek dengan anggaran.</div>'; return; }

    const riskOnly = $('#toggle-health-risk-only')?.checked;
    const filtered = riskOnly ? rows.filter(r => r.state !== 'ok') : rows;
    const top = filtered.slice(0, 10);

    container.innerHTML = `
        <div class="report-table-wrapper">
            <div class="report-table-grid-5 text-dim" style="background:var(--surface-muted); font-weight:600; min-width:600px;">
                <div>Proyek</div><div>Terpakai</div><div style="text-align:right;">%</div><div style="text-align:right;">Margin</div><div>Status</div>
            </div>
            ${top.map(r => `
                <div class="report-table-grid-5" style="min-width:600px;">
                    <div>${r.name}</div>
                    <div><span class="responsive-val">${fmtIDR(r.used)}</span> <span style="color:var(--text-dim);font-size:0.75rem;">/ ${fmtIDR(r.budget)}</span></div>
                    <div style="text-align:right; font-weight:600; color:${r.pct>100?'var(--danger)':'var(--success)'}">${Math.round(r.pct)}%</div>
                    <div style="text-align:right; font-weight:600; color:${r.margin<0?'var(--danger)':'var(--success)'}"><span class="responsive-val">${fmtIDR(r.margin)}</span></div>
                    <div><span class="insight-tag" style="color:${r.state==='risk'?'var(--danger)':'var(--success)'}">${r.state==='risk'?'Risk':'OK'}</span></div>
                </div>
            `).join('')}
        </div>`;
}

function exportProjectHealthCsv() {
    const start = $('#laporan-start-date').value;
    const end = $('#laporan-end-date').value;
    const projectId = $('#laporan-project-id').value;
    const data = aggregateReportData({ start, end, projectId });
    
    try {
        let csv = 'Proyek,Anggaran,Terpakai,Persen,Margin,Status\n';
        csv += data.projectHealth.map(r => `"${r.name}",${r.budget},${r.used},${Math.round(r.pct)}%,${r.margin},${r.state}`).join('\n');
        const blob = new Blob(['\ufeff'+csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'Project-Health.csv'; a.click();
    } catch(_){}
}

function applyReportFilters() {
    const start = $('#laporan-start-date')?.value || '';
    const end = $('#laporan-end-date')?.value || '';
    const projectId = $('#laporan-project-id')?.value || 'all';
    appState.reportFilter = { start, end, projectId };
    updateReportFilterNote();

    const data = aggregateReportData({ start, end, projectId });
    renderSummaryAndCharts(data);
    renderProjectHealthTable(data.projectHealth);
}

async function initLaporanPage() {
    const container = $('.page-container');
    try { container?.classList?.add('page--laporan', 'page-container--has-panel'); } catch(_) {}
    
    // REVISI: Tombol Simulasi tanpa label teks
    const actions = [
        { id: 'open-report-generator-btn', action: 'open-report-generator', icon: 'download', label: 'Unduh PDF' },
        { id: 'open-simulasi-btn', action: 'navigate', nav: 'simulasi', icon: 'calculator', label: '' } 
    ];
    const pageToolbarHTML = createPageToolbarHTML({ title: 'Laporan', actions });

    container.innerHTML = `
        <div class="content-panel">
            <div class="panel-header">${pageToolbarHTML}</div>
            <div id="sub-page-content" class="panel-body scrollable-content has-padding">
                ${_getSkeletonLoaderHTML('laporan')}
            </div>
        </div>`;

    ensureMasterDataFresh().then(() => {
        emit('ui.laporan.renderContent');
    });
}

on('ui.laporan.renderContent', renderLaporanContent);

export { initLaporanPage };