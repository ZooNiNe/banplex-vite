import { appState } from '../../state/appState.js';
import { $, $$ } from '../../utils/dom.js';
import { createPageToolbarHTML } from '../components/toolbar.js';
import { getEmptyStateHTML } from '../components/emptyState.js';
import { fmtIDR } from '../../utils/formatters.js';
import { emit, on } from '../../state/eventBus.js';
import { ALL_NAV_LINKS } from '../../config/constants.js';
import { _renderFinancialSummaryChart, _renderIncomeExpenseBarChart } from '../components/charts.js';
import { calculateAndCacheDashboardTotals } from '../../services/data/calculationService.js';
import { logsCol } from '../../config/firebase.js';
import { getDocs, query, orderBy, limit, onSnapshot, where } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';
import { localDB, loadDataForPage } from '../../services/localDbService.js';
import { getJSDate } from '../../utils/helpers.js';
import { ensureMasterDataFresh } from '../../services/data/ensureMasters.js';
import { liveQueryMulti } from '../../state/liveQuery.js';
import { initPullToRefresh, destroyPullToRefresh } from "../components/pullToRefresh.js";
import { showLoadingModal, hideLoadingModal } from "../components/modal.js";

function createIcon(iconName, size = 18, classes = '') {
    const icons = {
        trending_up: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trending-up ${classes}"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
        trending_down: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trending-down ${classes}"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>`,
        scale: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-scale ${classes}"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2"/><path d="M19 7h2"/></svg>`,
        arrow_right: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right ${classes}"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`,
        engineering: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-hard-hat-icon lucide-hard-hat"><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M14 6a6 6 0 0 1 6 6v3"/><path d="M4 15v-3a6 6 0 0 1 6-6"/><rect x="2" y="15" width="20" height="4" rx="1"/></svg>`,
        list_refresh: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-list-restart-icon lucide-list-restart"><path d="M21 5H3"/><path d="M7 12H3"/><path d="M7 19H3"/><path d="M12 18a5 5 0 0 0 9-3 4.5 4.5 0 0 0-4.5-4.5c-1.33 0-2.54.54-3.41 1.41L11 14"/><path d="M11 10v4h4"/></svg>`,
        receipt: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-receipt ${classes}"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1V2H4Z"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/></svg>`,
        landmark: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-landmark ${classes}"><line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>`,
        package: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-package ${classes}"><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" x2="12" y1="22" y2="12"/></svg>`,
        wallet: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-wallet ${classes}"><path d="M21 12V7H5a2 2 0 0 1 0-4h14a2 2 0 0 1 2 2v4Z"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2Z"/></svg>`,
        users: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-users ${classes}"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
        calendar_days: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar-days ${classes}"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>`,
        eye_off: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye-off-icon lucide-eye-off"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>`,
        eye: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye-icon lucide-eye"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>`,
        refresh_cw: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-refresh-cw-icon lucide-refresh-cw"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
        'book-open': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-book-open ${classes}"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
    }; 
    return icons[iconName] || '';
}

async function renderBudgetSection() {
    let projects = appState.projects || [];
    if (!projects || projects.length === 0) {
        try {
            projects = await localDB.projects.where('isDeleted').notEqual(1).toArray();
            appState.projects = projects;
        } catch (e) {
            console.warn("Gagal mengambil data proyek dari Dexie:", e);
            projects = [];
        }
    }
    const budgets = appState.dashboardData?.budgets || [];
    if (budgets.length === 0) {
        return getEmptyStateHTML({
            icon: 'package',
            title: 'Belum Ada Anggaran Proyek',
            desc: 'Tambahkan anggaran saat membuat atau mengedit Proyek di Pengaturan untuk melihat ringkasan di sini.',
            isSmall: true
        });
    }
    const budgetItemsHTML = budgets.slice(0, 5).map(item => {
        const percentage = Math.round(item.percentage);
        let barClass = 'budget-bar-used';
        let statusText = `${percentage}% terpakai`;
        if (item.isOverBudget) {
            barClass += ' over-budget';
            statusText = `Over Budget! (${percentage}%)`;
        } else if (item.percentage >= 80) {
            barClass += ' near-limit';
            statusText = `Hampir Habis (${percentage}%)`;
        }
        return `
            <div class="budget-item">
                <div class="budget-item-header">
                    <span class="budget-item-name">${item.name}</span>
                    <span class="budget-item-percent ${item.isOverBudget ? 'over-budget-text' : (item.percentage >= 80 ? 'near-limit-text' : '')}">${statusText}</span>
                </div>
                <div class="progress-bar-container budget-bar">
                    <div class="${barClass}" style="width: ${Math.min(100, item.percentage)}%;"></div>
                </div>
                <div class="budget-item-footer">
                    <span>Terpakai: ${fmtIDR(item.used)}</span>
                    <span>Anggaran: ${fmtIDR(item.budget)}</span>
                </div>
            </div>
        `;
    }).join('');
    return `<div class="budget-list">${budgetItemsHTML}</div>`;
}

async function renderCardContent(cardType) {
    const cardElement = $(`#dashboard-card-${cardType}`);
    const statItemEl = document.querySelector(`.dashboard-stats-grid .stat-item[data-stat-type="${cardType}"], .dashboard-worker-stats-grid .stat-item[data-stat-type="${cardType}"]`);
    if (!cardElement && !statItemEl) return;

    const elementForSpinner = cardElement || statItemEl;
    const refreshBtn = elementForSpinner?.querySelector(`.refresh-btn[data-card-type="${cardType}"] .lucide-list-restart-icon`);
    if (refreshBtn) refreshBtn.classList.add('spin');

    await calculateAndCacheDashboardTotals();
    const { summary, budgets } = appState.dashboardData || { summary: {}, budgets: [] };

    let content = '';
    let renderChartFunc = null;

    try {
        if (['income', 'expense', 'bills', 'loans', 'active_workers', 'worker_days', 'paid_wages', 'unpaid_wages'].includes(cardType)) {
            const statItem = statItemEl;
            if (statItem) {
                const valueEl = statItem.querySelector('.stat-value');
                const labelEl = statItem.querySelector('.stat-label');
                if (valueEl && labelEl) {
                    if (cardType === 'income') valueEl.textContent = fmtIDR(summary?.totalIncome || 0);
                    else if (cardType === 'expense') valueEl.textContent = fmtIDR(summary?.totalExpense || 0);
                    else if (cardType === 'bills') valueEl.textContent = `${summary?.unpaidBillsCount || 0} / ${summary?.totalBillsCount || 0}`;
                    else if (cardType === 'loans') valueEl.textContent = `${summary?.unpaidLoansCount || 0} / ${summary?.totalLoansCount || 0}`;
                    else if (cardType === 'active_workers') valueEl.textContent = `${summary?.activeWorkerCount || 0} Aktif`;
                    else if (cardType === 'worker_days') valueEl.textContent = `${(summary?.totalWorkerDays || 0).toLocaleString('id-ID')} Hari`;
                    else if (cardType === 'paid_wages') valueEl.textContent = fmtIDR(summary?.totalWagesPaid || 0);
                    else if (cardType === 'unpaid_wages') valueEl.textContent = fmtIDR(summary?.totalWagesUnpaid || 0);
                }
            }
        } else if (cardType === 'income_vs_expense') {
            content = `<div class="chart-container"><canvas id="income-expense-chart"></canvas><div class="chart-placeholder">Belum ada data</div></div>`;
            renderChartFunc = () => _renderIncomeExpenseBarChart();
        } else if (cardType === 'budgets') {
            content = await renderBudgetSection();
            renderChartFunc = null;
        } else if (cardType === 'summary') {
            content = `<div class="chart-container"><canvas id="financial-summary-chart"></canvas><div class="chart-placeholder">Belum ada data</div></div>`;
            renderChartFunc = _renderFinancialSummaryChart;
        } else {
             content = '<p class="error-text">Konten tidak tersedia.</p>';
        }

        const bodyElement = cardElement?.querySelector('.card-body');
        if (bodyElement && !['income', 'expense', 'bills', 'loans', 'active_workers', 'worker_days', 'paid_wages', 'unpaid_wages'].includes(cardType)) {
            bodyElement.innerHTML = content;
        }

        if (renderChartFunc) {
            setTimeout(async () => {
                try {
                    await renderChartFunc();
                    const ph = cardElement?.querySelector('.chart-placeholder');
                    if (ph) {
                        const hasData = (() => {
                            if (cardType === 'income_vs_expense') {
                                return ((appState.incomes || []).length > 0 || (appState.expenses || []).length > 0);
                            }
                            if (cardType === 'summary') {
                                const { summary } = appState.dashboardData || { summary: {} };
                                return ((summary?.totalIncome || 0) + (summary?.totalExpense || 0) + (summary?.totalFunding || 0)) > 0;
                            }
                            return true;
                        })();
                        if (hasData) ph.style.display = 'none';
                    }
                } catch (err) {
                    console.error(`Gagal merender chart ${cardType}:`, err);
                    const chartContainer = bodyElement?.querySelector('.chart-container');
                    if (chartContainer) chartContainer.innerHTML = '<p class="error-text">Gagal memuat grafik.</p>';
                } finally {
                    if (refreshBtn) refreshBtn.classList.remove('spin');
                }
            }, 50);
        } else {
            if (refreshBtn) refreshBtn.classList.remove('spin');
        }
    } catch (e) {
         console.error(`Error rendering card content for ${cardType}:`, e);
         const bodyElement = cardElement?.querySelector('.card-body');
         if (bodyElement) bodyElement.innerHTML = '<p class="error-text">Gagal memuat data.</p>';
         if (refreshBtn) refreshBtn.classList.remove('spin');
    }
}

async function renderDashboardContent() {
    if (renderDashboardContent._ctrl) {
        try { renderDashboardContent._ctrl.abort(); } catch(_) {}
    }
    renderDashboardContent._ctrl = new AbortController();
    const signal = renderDashboardContent._ctrl.signal;
    const container = $('#sub-page-content');
    if (!container) return;

    try { await ensureMasterDataFresh(['projects', 'workers', 'attendanceRecords']); } catch(_) {}
    if (signal.aborted) return;
    await calculateAndCacheDashboardTotals();
    if (signal.aborted) return;
    const { summary, budgets } = appState.dashboardData || { summary: {}, budgets: [] };
    const userName = appState.currentUser?.displayName?.split(' ')[0] || 'Pengguna';

    const hideDashHero = (function(){ try { return localStorage.getItem('ui.hideHero.dashboard') === '1'; } catch(_) { return false; } })();
    const heroHTML = hideDashHero ? '' : `<div id="dashboard-hero-carousel" class="dashboard-hero-carousel">
            <button class="hero-close-btn" data-action="close-hero" data-hero-id="dashboard" data-tooltip="Sembunyikan">${createIcon('eye_off', 14)}</button>
        </div>`;

    const statsGridHTML = `
        <div class="dashboard-stats-grid" id="dashboard-stats-grid">
            <div class="stat-item" data-stat-type="income">
                 <div class="stat-header">
                     <div class="card-icon income">${createIcon('trending_up')}</div>
                     <span class="card-title">Pemasukan</span>
                     <button class="btn-icon refresh-btn" data-action="refresh-dashboard-card" data-card-type="income" data-tooltip="Refresh Pemasukan">${createIcon('list_refresh', 14)}</button>
                 </div>
                 <strong class="stat-value">${fmtIDR(summary?.totalIncome || 0)}</strong>
                 <span class="stat-label">Total semua waktu</span>
                 <div class="stat-footer">
                     <span class="action-hint">Lihat Detail</span>
                     <button class="btn-icon btn-sm" data-action="navigate" data-nav="pemasukan" data-tooltip="Lihat Detail Pemasukan">${createIcon('arrow_right', 14)}</button>
                 </div>
            </div>
             <div class="stat-item" data-stat-type="expense">
                 <div class="stat-header">
                     <div class="card-icon expense">${createIcon('trending_down')}</div>
                     <span class="card-title">Pengeluaran</span>
                     <button class="btn-icon refresh-btn" data-action="refresh-dashboard-card" data-card-type="expense" data-tooltip="Refresh Pengeluaran">${createIcon('list_refresh', 14)}</button>
                 </div>
                 <strong class="stat-value">${fmtIDR(summary?.totalExpense || 0)}</strong>
                 <span class="stat-label">Total semua waktu</span>
                 <div class="stat-footer">
                    <span class="action-hint">Lihat Detail</span>
                    <button class="btn-icon btn-sm" data-action="navigate" data-nav="pengeluaran" data-tooltip="Lihat Detail Pengeluaran">${createIcon('arrow_right', 14)}</button>
                 </div>
            </div>
            <div class="stat-item" data-stat-type="bills">
                 <div class="stat-header">
                     <div class="card-icon bills">${createIcon('receipt')}</div>
                     <span class="card-title">Tagihan</span>
                     <button class="btn-icon refresh-btn" data-action="refresh-dashboard-card" data-card-type="bills" data-tooltip="Refresh Tagihan">${createIcon('list_refresh', 14)}</button>
                 </div>
                 <strong class="stat-value">${summary?.unpaidBillsCount || 0} / ${summary?.totalBillsCount || 0}</strong>
                  <span class="stat-label">Belum Lunas</span>
                 <div class="stat-footer">
                     <span class="action-hint">Kelola</span>
                     <button class="btn-icon btn-sm" data-action="navigate" data-nav="tagihan" data-tooltip="Kelola Tagihan">${createIcon('arrow_right', 14)}</button>
                 </div>
            </div>
             <div class="stat-item" data-stat-type="loans">
                 <div class="stat-header">
                     <div class="card-icon loans">${createIcon('landmark')}</div>
                     <span class="card-title">Pinjaman</span>
                     <button class="btn-icon refresh-btn" data-action="refresh-dashboard-card" data-card-type="loans" data-tooltip="Refresh Pinjaman">${createIcon('list_refresh', 14)}</button>
                 </div>
                 <strong class="stat-value">${summary?.unpaidLoansCount || 0} / ${summary?.totalLoansCount || 0}</strong>
                 <span class="stat-label">Belum Lunas</span>
                 <div class="stat-footer">
                    <span class="action-hint">Lihat</span>
                    <button class="btn-icon btn-sm" data-action="navigate" data-nav="pemasukan" data-tooltip="Lihat Pinjaman">${createIcon('arrow_right', 14)}</button>
                 </div>
            </div>
        </div>
    `;

    const hideQuoteHero = (function(){ try { return localStorage.getItem('ui.hideHero.dashboardQuote') === '1'; } catch(_) { return false; } })();
    const quotesHeroHTML = hideQuoteHero ? '' : `
        <div class="dashboard-hero quote-hero" id="dashboard-quote-hero" aria-live="polite">
                                        <label class="quote-auto" title="Aktifkan/nonaktifkan muat otomatis">
                        <input type="checkbox" id="toggle-quote-autorefresh" />
                        <span>Auto</span>
                    </label>
            <button class="hero-close-btn" data-action="close-hero" data-hero-id="dashboardQuote" data-tooltip="Sembunyikan">${createIcon('eye_off', 14)}</button>
            <div class="quote-illustration" aria-hidden="true">
                <svg viewBox="0 0 240 120" preserveAspectRatio="xMidYMid meet">
                    <defs>
                        <linearGradient id="q-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" style="stop-color:var(--hero-indigo);stop-opacity:0.15" />
                            <stop offset="100%" style="stop-color:var(--hero-emerald);stop-opacity:0.25" />
                        </linearGradient>
                        <linearGradient id="q-grad-2" x1="100%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" style="stop-color:var(--hero-sun);stop-opacity:0.12" />
                            <stop offset="100%" style="stop-color:var(--hero-rose);stop-opacity:0.2" />
                        </linearGradient>
                    </defs>
                    <circle cx="40" cy="30" r="28" fill="url(#q-grad-1)" class="q-orb q-orb-1" />
                    <circle cx="210" cy="60" r="20" fill="url(#q-grad-2)" class="q-orb q-orb-2" />
                    <circle cx="120" cy="15" r="8" fill="var(--hero-indigo)" class="q-dot q-dot-1" />
                    <circle cx="90" cy="95" r="6" fill="var(--hero-emerald)" class="q-dot q-dot-2" />
                    <path d="M10 100 Q 70 40 130 70 T 230 60" stroke="var(--hero-sun)" stroke-width="2" fill="none" class="q-line" />
                </svg>
            </div>
            <div class="quote-content">
                <div class="quote-header">
                    <span class="quote-mark" aria-hidden="true">“</span>
                    <span class="quote-title">Quotes</span>
                </div>
                <blockquote class="quote-text" id="quote-text">Memuat kutipan...</blockquote>
                <div class="quote-meta">
                    <span class="quote-author" id="quote-author">—</span>
                </div>
            </div>
        <button class="btn-icon refresh-quote" id="btn-refresh-quote" data-tooltip="Muat Kutipan Baru" title="Muat Kutipan Baru">${createIcon('refresh_cw', 12)}</button>
        </div>
    `;

    const budgetCardHTML = `
        <div class="dashboard-card card-full-width" id="dashboard-card-budgets">
             <div class="card-header">
                <div class="card-icon budget">${createIcon('package')}</div>
                <span class="card-title">Ringkasan Anggaran Proyek</span>
                <button class="btn-icon refresh-btn" data-action="refresh-dashboard-card" data-card-type="budgets" data-tooltip="Refresh Anggaran">${createIcon('list_refresh', 16)}</button>
                 <button class="btn-icon btn-sm" data-action="navigate" data-nav="laporan" style="margin-left: auto;" data-tooltip="Lihat Laporan Proyek">${createIcon('arrow_right', 16)}</button>
            </div>
             <div class="card-body"></div>
             <div class="card-footer"><span class="chart-hint">Tinjau penggunaan anggaran vs batas</span></div>
        </div>
    `;

    const workerStatsGridHTML = `
        <div class="dashboard-worker-stats-grid" id="dashboard-worker-stats-grid">
             <div class="stat-item" data-stat-type="active_workers">
                 <div class="stat-header">
                     <div class="card-icon workers">${createIcon('users')}</div>
                     <span class="card-title">Pekerja</span>
                     <button class="btn-icon refresh-btn" data-action="refresh-dashboard-card" data-card-type="active_workers" data-tooltip="Refresh Pekerja">${createIcon('list_refresh', 14)}</button>
                 </div>
                 <strong class="stat-value">${summary?.activeWorkerCount || 0} Aktif</strong>
                 <span class="stat-label">Total pekerja</span>
                 <div class="stat-footer">
                     <span class="action-hint">Absensi</span>
                     <button class="btn-icon btn-sm" data-action="navigate" data-nav="absensi" data-tooltip="Buka Halaman Absensi">${createIcon('arrow_right', 14)}</button>
                 </div>
            </div>
             <div class="stat-item" data-stat-type="worker_days">
                 <div class="stat-header">
                     <div class="card-icon worker-days">${createIcon('calendar_days')}</div>
                     <span class="card-title">Hari Kerja</span>
                     <button class="btn-icon refresh-btn" data-action="refresh-dashboard-card" data-card-type="worker_days" data-tooltip="Refresh Hari Kerja">${createIcon('list_refresh', 14)}</button>
                 </div>
                 <strong class="stat-value">${(summary?.totalWorkerDays || 0).toLocaleString('id-ID')} Hari</strong>
                 <span class="stat-label">Total tercatat</span>
                 <div class="stat-footer">
                    <span class="action-hint">Jurnal</span>
                    <button class="btn-icon btn-sm" data-action="navigate" data-nav="jurnal" data-tooltip="Buka Jurnal Harian">${createIcon('arrow_right', 14)}</button>
                 </div>
            </div>
            <div class="stat-item" data-stat-type="paid_wages">
                 <div class="stat-header">
                     <div class="card-icon paid-wages">${createIcon('wallet')}</div>
                     <span class="card-title">Upah Dibayar</span>
                     <button class="btn-icon refresh-btn" data-action="refresh-dashboard-card" data-card-type="paid_wages" data-tooltip="Refresh Upah Dibayar">${createIcon('list_refresh', 14)}</button>
                 </div>
                 <strong class="stat-value">${fmtIDR(summary?.totalWagesPaid || 0)}</strong>
                 <span class="stat-label">Total sudah lunas</span>
                 <div class="stat-footer">
                     <span class="action-hint">Rekap</span>
                     <button class="btn-icon btn-sm" data-action="navigate" data-nav="jurnal&subpage=rekap_gaji" data-tooltip="Buka Rekap Gaji">${createIcon('arrow_right', 14)}</button>
                 </div>
            </div>
             <div class="stat-item" data-stat-type="unpaid_wages">
                 <div class="stat-header">
                     <div class="card-icon unpaid-wages">${createIcon('receipt')}</div>
                     <span class="card-title">Upah Terutang</span>
                     <button class="btn-icon refresh-btn" data-action="refresh-dashboard-card" data-card-type="unpaid_wages" data-tooltip="Refresh Upah Terutang">${createIcon('list_refresh', 14)}</button>
                 </div>
                 <strong class="stat-value">${fmtIDR(summary?.totalWagesUnpaid || 0)}</strong>
                 <span class="stat-label">Total belum lunas</span>
                 <div class="stat-footer">
                    <span class="action-hint">Rekap</span>
                    <button class="btn-icon btn-sm" data-action="navigate" data-nav="jurnal&subpage=rekap_gaji" data-tooltip="Buka Rekap Gaji">${createIcon('arrow_right', 14)}</button>
                 </div>
            </div>
        </div>
    `;

    const infoQuotes = [
        { title: "Kutipan Akuntansi", quote: "Akuntansi adalah bahasa bisnis. Semakin baik Anda memahaminya, semakin baik Anda mengelola keuangan.", icon: "book-open" },
        { title: "Persamaan Dasar", quote: "Aset = Kewajiban + Ekuitas. Menjaga keseimbangan ini adalah kunci kesehatan finansial.", icon: "scale" },
        { title: "Tips Keuangan", quote: "Ukur apa yang penting. Apa yang diukur adalah apa yang dikelola.", icon: "engineering" }
    ];
    const randomQuote = infoQuotes[Math.floor(Math.random() * infoQuotes.length)];
    
    const infoHeroHTML = `
        <div class="info-hero-card" id="info-hero-card">
            <div class="icon-wrapper">
                ${createIcon(randomQuote.icon, 24)}
            </div>
            <div class="info-content">
                <h5 class="info-title">${randomQuote.title}</h5>
                <p class="info-quote">${randomQuote.quote}</p>
            </div>
        </div>
    `;

    const otherChartsHTML = `
        <div class="dashboard-grid-layout">
            <div class="dashboard-card card-full-width" id="dashboard-card-income_vs_expense">
                <div class="card-header">
                    <div class="card-icon income-expense">${createIcon('wallet')}</div>
                    <span class="card-title">Uang Masuk vs Keluar 7H</span>
                     <button class="btn-icon refresh-btn" data-action="refresh-dashboard-card" data-card-type="income_vs_expense" data-tooltip="Refresh Perbandingan">${createIcon('list_refresh', 16)}</button>
                      <button class="btn-icon btn-sm" data-action="navigate" data-nav="laporan" style="margin-left: auto;" data-tooltip="Lihat Laporan Lengkap">${createIcon('arrow_right', 16)}</button>
                </div>
                <div class="card-body card-body-chart"></div>
                <div class="card-footer"><span class="chart-hint">Tren 7 hari terakhir</span></div>
            </div>

            <div class="dashboard-card card-full-width" id="dashboard-card-summary">
                <div class="card-header">
                    <div class="card-icon balance">${createIcon('scale')}</div>
                    <span class="card-title">Ringkasan Keuangan Total</span>
                     <button class="btn-icon refresh-btn" data-action="refresh-dashboard-card" data-card-type="summary" data-tooltip="Refresh Ringkasan">${createIcon('list_refresh', 16)}</button>
                </div>
                <div class="card-body card-body-chart"></div>
                <div class="card-footer"><span class="chart-hint">Arahkan kursor/ketuk untuk nilai</span></div>
            </div>
        </div>
    `;

    container.innerHTML = heroHTML + statsGridHTML + quotesHeroHTML + budgetCardHTML + workerStatsGridHTML + infoHeroHTML + otherChartsHTML;

    const renderInitialCards = async () => {
        const cardTypes = ['income_vs_expense', 'budgets', 'summary'];
        for (const type of cardTypes) {
            await renderCardContent(type);
        }
        const statTypes = ['income', 'expense', 'bills', 'loans', 'active_workers', 'worker_days', 'paid_wages', 'unpaid_wages'];
        for (const type of statTypes) {
             await renderCardContent(type);
        }
    };

    renderInitialCards();
    initHeroCarousel(container);
    initQuoteHero(container);
}

function initDashboardPage() {
    destroyPullToRefresh();
    const container = $('.page-container');
    
    if (!container) return; 

    container.innerHTML = `
        ${createPageToolbarHTML({
            title: 'Dashboard',
            isTransparent: true,
            actions: [
                { icon: 'bell', label: 'Aktivitas', action: 'navigate', nav: 'log_aktivitas', id: 'open-activity-log' }
            ]
        })}
        <div id="sub-page-content" class="scrollable-content has-padding"></div>
    `;

    const dashboardContent = $('#sub-page-content');
    if (!dashboardContent) {
        console.error("Dashboard content container '#sub-page-content' not found!");
        return; 
    }

    initPullToRefresh({
        triggerElement: '.toolbar',
        scrollElement: dashboardContent,   // 2. Cek scroll di konten
        indicatorContainer: '#ptr-indicator-container', // 3. Indikator di luar
        pushDownElement: '#page-container', // 4. Dorong seluruh halaman
        onRefresh: async () => {
            showLoadingModal('Memperbarui data...');
            try {
                appState.dashboardData = null; 
                await loadDataForPage('Dashboard', true);
                emit('ui.dashboard.renderContent'); 
            } catch (err) {
                console.error("PTR Error:", err);
                emit('ui.toast', { message: 'Gagal memperbarui', type: 'error' });
            } finally {
                hideLoadingModal();
            }
        }
    });

    setTimeout(() => { try { updateActivityLogBadge(); startActivityLogRealtimeBadge(); renderCommentsBadge(); } catch(_) {} }, 0);
    
    try {
        const pref = localStorage.getItem('ui.layout.dashboard') || 'grid';
        document.body.classList.toggle('dashboard-layout-grid', pref === 'grid');
        document.body.classList.toggle('dashboard-layout-cards', pref === 'cards');
    } catch(_) {}

    try {
        if (initDashboardPage._live) { initDashboardPage._live.unsubscribe?.(); initDashboardPage._live = null; }
        initDashboardPage._live = liveQueryMulti(['bills','expenses','incomes','attendance_records','funding_sources'], () => {
            clearTimeout(initDashboardPage._deb);
            initDashboardPage._deb = setTimeout(() => emit('ui.dashboard.renderContent'), 250);
        });
    } catch(_) {}
}

  async function updateActivityLogBadge() {
    const btn = document.getElementById('open-activity-log');
    if (!btn) return;
    btn.querySelector('.notification-badge')?.remove();
    let lastSeen = 0;
    try {
        const s = localStorage.getItem('logs.lastSeenAt');
        if (s) lastSeen = new Date(s).getTime();
    } catch(_) {}
    let count = 0;
    try {
        const q = query(logsCol, orderBy('createdAt','desc'), limit(15));
        const snap = await getDocs(q);
        const docs = snap.docs || [];
        for (const d of docs) {
            const dt = d.data().createdAt?.toDate?.() || new Date();
            if (dt.getTime() > lastSeen) count++;
  }

  function renderCommentsBadge() {
      const btn = document.getElementById('open-comments');
      if (!btn) return;
      btn.querySelector('.notification-badge')?.remove();
      let unread = 0;
      try {
          const byParent = new Map();
          (appState.comments || []).forEach(c => {
              const arr = byParent.get(c.parentId) || [];
              arr.push(c);
              byParent.set(c.parentId, arr);
          });
          byParent.forEach((list, pid) => {
              // compute last viewed from localStorage keys comment_view_ts_<pid>
              const key = `comment_view_ts_${pid}`;
              const lastViewed = parseInt(localStorage.getItem(key) || '0', 10);
              const count = list.filter(x => (new Date(x.createdAt?.seconds ? x.createdAt.seconds*1000 : x.createdAt || Date.now()).getTime()) > lastViewed).length;
              unread += count;
          });
      } catch(_) {}
      if (unread > 0) {
          const span = document.createElement('span');
          span.className = 'notification-badge';
          span.textContent = String(unread);
          btn.appendChild(span);
      }
  }

  on('ui.dashboard.updateCommentsBadge', renderCommentsBadge);
    } catch(_) {}
    try {
        const pend = await localDB.pending_logs.toArray();
        count += pend.filter(p => (p.createdAt?.getTime?.() || 0) > lastSeen).length;
    } catch(_) {}

    __activityBadgeCount = count;
    renderActivityLogBadge();
}

let __activityLogUnsub = null;
let __activityBadgeCount = 0;

function renderActivityLogBadge() {
    const btn = document.getElementById('open-activity-log');
    if (!btn) return;
    btn.querySelector('.notification-badge')?.remove();
    if (__activityBadgeCount > 0) {
        const badge = document.createElement('span');
        badge.className = 'notification-badge';
        badge.textContent = __activityBadgeCount > 9 ? '9+' : String(__activityBadgeCount);
        btn.appendChild(badge);
    }
}

function startActivityLogRealtimeBadge() {
    try { if (__activityLogUnsub) { __activityLogUnsub(); __activityLogUnsub = null; } } catch(_) {}
    let lastSeen = 0;
    try {
        const s = localStorage.getItem('logs.lastSeenAt');
        if (s) lastSeen = new Date(s).getTime();
    } catch(_) {}
    const nowRef = new Date();
    try {
        const qLive = query(logsCol, where('createdAt', '>', nowRef), orderBy('createdAt', 'desc'));
        __activityLogUnsub = onSnapshot(qLive, (snapshot) => {
            let inc = 0;
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const createdAt = change.doc.data()?.createdAt?.toDate?.();
                    if (!createdAt) return;
                    // New logs after listener attach are inherently > lastSeen
                    inc += 1;
                }
            });
            if (inc > 0) {
                __activityBadgeCount += inc;
                renderActivityLogBadge();
            }
        }, (error) => {
            console.error('[Dashboard] Realtime logs listener error:', error);
        });
    } catch (e) {
        console.warn('[Dashboard] Failed to start realtime badge listener:', e);
    }
}

// Unsubscribe listener when leaving dashboard
on('app.unload.dashboard', () => {
    try { if (__activityLogUnsub) { __activityLogUnsub(); __activityLogUnsub = null; } } catch(_) {}
    try { if (initDashboardPage._live) { initDashboardPage._live.unsubscribe?.(); initDashboardPage._live = null; } } catch(_) {}
    try { if (renderDashboardContent._ctrl) { renderDashboardContent._ctrl.abort(); } } catch(_) {}
});

on('ui.dashboard.renderContent', renderDashboardContent);
on('ui.dashboard.refreshCardData', async (cardType) => {
    await renderCardContent(cardType);
});

export function initHeroCarousel(context = document) {
    const container = context.querySelector('#dashboard-hero-carousel');
    if (!container) return;

    if (container.dataset.initialized === '1') return;
    container.dataset.initialized = '1';

    const buildSlides = async () => {
        try { await calculateAndCacheDashboardTotals(); } catch (_) {}
        const sum = (appState.dashboardData && appState.dashboardData.summary) || {};

        const toIDR = (n) => {
            try { return fmtIDR(n || 0); } catch (_) { return (n || 0).toLocaleString('id-ID'); }
        };

        const diff = (sum.totalPureIncome || 0) - (sum.totalAllExpenses || 0);
        const diffLabel = diff >= 0 ? 'Surplus' : 'Defisit';

        const slides = [
            {
                title: 'Ringkasan Keuangan',
                tone: 'warning',
                lines: [
                    `Pemasukan Murni: ${toIDR(sum.totalPureIncome)}`,
                    `Pengeluaran Total: ${toIDR(sum.totalAllExpenses)}`,
                    `${diffLabel}: ${toIDR(Math.abs(diff))}`,
                ]
            },
            {
                title: 'Kewajiban Aktif',
                tone: 'danger',
                lines: [
                    `Tagihan belum lunas: ${sum.unpaidBillsCount || 0}/${sum.totalBillsCount || 0} (${toIDR(sum.totalUtang)})`,
                    `Pinjaman belum lunas: ${sum.unpaidLoansCount || 0}/${sum.totalLoansCount || 0} (${toIDR(sum.totalPiutang)})`,
                ]
            },
            {
                title: 'Pendanaan & Arus',
                tone: 'success',
                lines: [
                    `Total Pendanaan: ${toIDR(sum.totalFunding)}`,
                    `Total Pemasukan: ${toIDR(sum.totalIncome)}`,
                ]
            },
        ];

        slides.sort(() => Math.random() - 0.5);

        container.innerHTML = [
            ...slides.map((s, idx) => `
                <div class="dashboard-hero hero-slide${idx === 0 ? ' active' : ''}" data-index="${idx}" data-tone="${s.tone}">
                    <div class="hero-content">
                        <h1>${s.title}</h1>
                        <p>${s.lines.join(' · ')}</p>
                    </div>
                    <div class="hero-illustration" aria-hidden="true">
                        <svg viewBox="0 0 200 100" preserveAspectRatio="xMidYMid meet">
                            <defs>
                                <linearGradient id="heroGrad-${idx}" x1="${Math.random()*100}%" y1="${Math.random()*100}%" x2="${Math.random()*100}%" y2="${Math.random()*100}%">
                                    <stop offset="0%" style="stop-color:var(--hero-${s.tone === 'danger' ? 'rose' : (s.tone === 'success' ? 'emerald' : 'indigo')});stop-opacity:0.25" />
                                    <stop offset="100%" style="stop-color:var(--hero-${s.tone === 'danger' ? 'sun' : (s.tone === 'success' ? 'indigo' : 'emerald')});stop-opacity:0.4" />
                                </linearGradient>
                                <linearGradient id="heroGrad2-${idx}" x1="${Math.random()*100}%" y1="${Math.random()*100}%" x2="${Math.random()*100}%" y2="${Math.random()*100}%">
                                     <stop offset="0%" style="stop-color:var(--hero-${s.tone === 'danger' ? 'indigo' : (s.tone === 'success' ? 'sun' : 'rose')});stop-opacity:0.12" />
                                    <stop offset="100%" style="stop-color:var(--hero-${s.tone === 'danger' ? 'emerald' : (s.tone === 'success' ? 'rose' : 'sun')});stop-opacity:0.25" />
                                </linearGradient>
                            </defs>
                            <circle cx="${40 + Math.random()*20}" cy="${40 + Math.random()*20}" r="${35 + Math.random()*10}" fill="url(#heroGrad-${idx})" class="hero-circle1" />
                            <circle cx="${140 + Math.random()*20}" cy="${50 + Math.random()*20}" r="${25 + Math.random()*10}" fill="url(#heroGrad2-${idx})" class="hero-circle2" />
                            <path d="M ${10+Math.random()*20} ${70+Math.random()*10} Q ${40+Math.random()*20} ${40+Math.random()*20} ${90+Math.random()*20} ${50+Math.random()*20} T ${170+Math.random()*20} ${60+Math.random()*10}" stroke="var(--hero-${s.tone === 'danger' ? 'rose' : (s.tone === 'success' ? 'emerald' : 'indigo')})" stroke-width="3" fill="none" stroke-linecap="round" class="hero-line" opacity="0.25"/>
                        </svg>
                    </div>
                </div>
            `),
            `<div class="hero-indicators">${slides.map((_, i) => `<span class="dot${i===0?' active':''}" data-idx="${i}"></span>`).join('')}</div>`
        ].join('');

        initCarouselBehavior(container, slides.length);
    };

    const initCarouselBehavior = (wrap, total) => {
        let index = 0;
        const setIndex = (i) => {
            index = (i + total) % total;
            wrap.querySelectorAll('.hero-slide').forEach((el, idx) => {
                el.classList.toggle('active', idx === index);
            });
            wrap.querySelectorAll('.hero-indicators .dot').forEach((d, idx) => {
                d.classList.toggle('active', idx === index);
            });
        };

        if (wrap._timer) clearInterval(wrap._timer);
        wrap._timer = setInterval(() => setIndex(index + 1), 7000);

        wrap.querySelectorAll('.hero-indicators .dot').forEach(dot => {
            dot.addEventListener('click', () => {
                const idx = parseInt(dot.getAttribute('data-idx')) || 0;
                setIndex(idx);
                if (wrap._timer) { clearInterval(wrap._timer); wrap._timer = setInterval(() => setIndex(index + 1), 7000); }
            });
        });

        let startX = 0, currentX = 0, isDragging = false;
        wrap.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX; isDragging = true; currentX = startX;
        }, { passive: true });
        wrap.addEventListener('touchmove', (e) => {
            if (!isDragging) return; currentX = e.touches[0].clientX;
        }, { passive: true });
        wrap.addEventListener('touchend', () => {
            if (!isDragging) return; const dx = currentX - startX; isDragging = false;
            if (Math.abs(dx) > 40) {
                setIndex(index + (dx < 0 ? 1 : -1));
                if (wrap._timer) { clearInterval(wrap._timer); wrap._timer = setInterval(() => setIndex(index + 1), 7000); }
            }
        });

        window.addEventListener('hashchange', () => { if (wrap._timer) clearInterval(wrap._timer); }, { once: true });
    };

    buildSlides();
}

async function initQuoteHero(context = document) {
    const wrap = context.querySelector('#dashboard-quote-hero');
    if (!wrap) return;
    if (wrap.dataset.initialized === '1') return;
    wrap.dataset.initialized = '1';

    const textEl = wrap.querySelector('#quote-text');
    const authorEl = wrap.querySelector('#quote-author');
    const btn = wrap.querySelector('#btn-refresh-quote');
    const toggle = wrap.querySelector('#toggle-quote-autorefresh');

    const localFallbacks = [
        { content: 'Anggaran yang baik adalah peta, bukan penjara.', author: 'Anonim' },
        { content: 'Setiap rupiah harus bekerja untuk Anda.', author: 'Manajemen Keuangan' },
        { content: 'Disiplin finansial mengalahkan tebakan nasib.', author: 'Prinsip Akuntansi' }
    ];

    const setQuote = (q) => {
        textEl.textContent = q.content;
        authorEl.textContent = q.author ? `— ${q.author}` : '— Tidak diketahui';
        textEl.classList.remove('q-fade');
        void textEl.offsetWidth;
        textEl.classList.add('q-fade');
    };

    const fetchQuote = async () => {
        if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
            setQuote(localFallbacks[Math.floor(Math.random() * localFallbacks.length)]);
            return;
        }

        const fetchWithTimeout = (url, ms = 8000) => new Promise((resolve, reject) => {
            const ctrl = new AbortController();
            const id = setTimeout(() => { ctrl.abort(); reject(new Error('timeout')); }, ms);
            fetch(url, { cache: 'no-store', signal: ctrl.signal })
                .then(r => { clearTimeout(id); resolve(r); })
                .catch(err => { clearTimeout(id); reject(err); });
        });

        try {
            const resQuotable = await fetchWithTimeout('https://api.quotable.io/random');
            if (resQuotable.ok) {
                const dataQuotable = await resQuotable.json();
                if (dataQuotable?.content) {
                    setQuote({ content: dataQuotable.content, author: dataQuotable.author || 'Tidak diketahui' });
                    return;
                }
            }
        } catch (_) { }


        setQuote(localFallbacks[Math.floor(Math.random() * localFallbacks.length)]);
    };

    btn?.addEventListener('click', () => {
        btn.classList.add('spinning');
        fetchQuote().finally(() => setTimeout(() => btn.classList.remove('spinning'), 500));
    });

    let timer = null;
    const start = () => {
        if (timer) clearInterval(timer);
        timer = setInterval(fetchQuote, 30000);
    };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stop();
        } else if (toggle?.checked) {
            start();
        }
    });

    const stored = localStorage.getItem('banplex.quote.auto');
    const shouldAuto = stored == null ? true : stored !== '0';
    if (toggle) toggle.checked = shouldAuto;

    toggle?.addEventListener('change', () => {
        localStorage.setItem('banplex.quote.auto', toggle.checked ? '1' : '0');
        if (toggle.checked) start(); else stop();
    });

    await fetchQuote();
    if (shouldAuto) start();
}

export { initDashboardPage };
