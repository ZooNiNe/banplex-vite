import { appState } from '../../state/appState.js';
import { $ } from '../../utils/dom.js';
import { createPageToolbarHTML } from '../components/toolbar.js';
import { fmtIDR, parseFormattedNumber } from '../../utils/formatters.js';
import { emit, on } from '../../state/eventBus.js';
import { liveQueryMulti } from '../../state/liveQuery.js';
import { createSimulasiPDF } from '../../services/reportService.js';

function createIcon(iconName, size = 20, classes = '') {
    const icons = {
        download: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download ${classes}"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
        rotate_ccw: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-rotate-ccw ${classes}"><path d="M3 2v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L3 8"/></svg>`
    };
    return icons[iconName] || '';
}

function formatThousandsID(n) {
    const num = typeof n === 'number' ? n : parseFormattedNumber(n);
    return new Intl.NumberFormat('id-ID').format(num || 0);
}

function animateCount(el, fromVal, toVal, duration = 400) {
    if (!el) return;
    const start = performance.now();
    const from = Number(fromVal || 0);
    const to = Number(toVal || 0);
    const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t; // easeInOut
        const cur = Math.round(from + (to - from) * eased);
        el.textContent = fmtIDR(cur);
        if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

function groupBy(arr, keyFn) { const m = new Map(); for (const x of arr) { const k = keyFn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; }

function buildSimulasiListHTML() {
    const bills = (appState.bills || []).filter(b => !b.isDeleted && (b.status === 'unpaid'));
    const loans = (appState.fundingSources || []).filter(l => !l.isDeleted && (l.status === 'unpaid'));

    const getRemain = (amt, paid) => Math.max(0, (amt || 0) - (paid || 0));

    const catLabel = {
        gaji: 'Gaji Pekerja', fee: 'Fee Staf', material: 'Tagihan Material', operasional: 'Tagihan Operasional', lainnya: 'Tagihan Lainnya', pinjaman: 'Cicilan Pinjaman'
    };

    const byCategory = groupBy(bills, b => b.type || 'lainnya');
    const sectionHTML = [];

    for (const [cat, list] of byCategory.entries()) {
        const byProject = groupBy(list, b => (appState.expenses?.find(e => e.id === b.expenseId)?.projectId) || b.projectId || '');
        let sectionTotal = 0;
        const subsections = [];
        for (const [projectId, items] of byProject.entries()) {
            const project = (appState.projects || []).find(p => p.id === projectId);
            const projectName = project?.projectName || 'Tanpa Proyek';
            let subTotal = 0;
            const itemsHTML = items.map(b => {
                const remain = getRemain(b.amount, b.paidAmount);
                subTotal += remain; sectionTotal += remain;
                const title = b.description || 'Tagihan';
                const selected = appState.simulasiState.selectedPayments.has(`bill-${b.id}`);
                return `
                    <div class="simulasi-item ${selected ? 'selected' : ''}" data-action="open-simulasi-actions" data-id="bill-${b.id}" data-title="${projectName}" data-description="${title}" data-full-amount="${fmtIDR(remain)}" data-partial-allowed="true">
                        <div class="simulasi-info">
                            <div class="simulasi-title">${title}</div>
                            <small class="cicilan-label">${projectName}</small>
                        </div>
                        <div class="simulasi-amount">${fmtIDR(remain)}</div>
                    </div>`;
            }).join('');
            subsections.push(`
                <div class="simulasi-subsection">
                    <button class="simulasi-subsection-header" data-action="toggle-accordion">
                        <span class="header-title">${projectName}</span>
                        <span class="header-total">${fmtIDR(subTotal)}</span>
                        <span class="header-icon">▾</span>
                    </button>
                    <div class="simulasi-subsection-content">
                        ${itemsHTML || '<div class="empty">Tidak ada data.</div>'}
                    </div>
                </div>`);
        }
        sectionHTML.push(`
            <section class="simulasi-section">
                <button class="simulasi-section-header" data-action="toggle-accordion">
                    <div class="header-info">
                        <span class="header-title">${catLabel[cat] || cat.toUpperCase()}</span>
                        <span class="header-total">Total: ${fmtIDR(sectionTotal)}</span>
                    </div>
                    <span class="header-icon">▾</span>
                </button>
                <div class="simulasi-section-content">
                    ${subsections.join('')}
                </div>
            </section>`);
    }

    if (loans.length > 0) {
        const byCreditor = groupBy(loans, l => l.creditorId || '');
        let sectionTotal = 0;
        const subsections = [];
        for (const [credId, items] of byCreditor.entries()) {
            const creditor = (appState.fundingCreditors || []).find(c => c.id === credId);
            const credName = creditor?.creditorName || 'Kreditur';
            let subTotal = 0;
            const itemsHTML = items.map(l => {
                const totalPayable = Number(l.totalRepaymentAmount ?? l.totalAmount ?? l.amount ?? 0);
                const principal = Number(l.totalAmount ?? l.amount ?? 0);
                const interestPortion = l.interestType === 'interest'
                    ? Math.max(0, totalPayable - principal)
                    : 0;
                const remain = getRemain(totalPayable, l.paidAmount);
                subTotal += remain; sectionTotal += remain;
                const selected = appState.simulasiState.selectedPayments.has(`loan-${l.id}`);
                const interestDetails = interestPortion > 0
                    ? `<small class="cicilan-label">Bunga ${l.rate || 0}% selama ${l.tenor || 0} bln (${fmtIDR(interestPortion)})</small>`
                    : '';
                const description = interestPortion > 0
                    ? `Cicilan Pinjaman (Termasuk bunga ${fmtIDR(interestPortion)})`
                    : 'Cicilan Pinjaman';
                return `
                    <div class="simulasi-item ${selected ? 'selected' : ''}" data-action="open-simulasi-actions" data-id="loan-${l.id}" data-title="${credName}" data-description="${description}" data-full-amount="${fmtIDR(remain)}" data-partial-allowed="true">
                        <div class="simulasi-info">
                            <div class="simulasi-title">Cicilan Pinjaman</div>
                            <small class="cicilan-label">${credName}</small>
                            ${interestDetails}
                        </div>
                        <div class="simulasi-amount">${fmtIDR(remain)}</div>
                    </div>`;
            }).join('');
            subsections.push(`
                <div class="simulasi-subsection">
                    <button class="simulasi-subsection-header" data-action="toggle-accordion">
                        <span class="header-title">${credName}</span>
                        <span class="header-total">${fmtIDR(subTotal)}</span>
                        <span class="header-icon">▾</span>
                    </button>
                    <div class="simulasi-subsection-content">${itemsHTML}</div>
                </div>`);
        }
        sectionHTML.push(`
            <section class="simulasi-section">
                <button class="simulasi-section-header" data-action="toggle-accordion">
                    <div class="header-info">
                        <span class="header-title">Cicilan Pinjaman</span>
                        <span class="header-total">Total: ${fmtIDR(sectionTotal)}</span>
                    </div>
                    <span class="header-icon">▾</span>
                </button>
                <div class="simulasi-section-content">${subsections.join('')}</div>
            </section>`);
    }

    if (sectionHTML.length === 0) {
        return '<div class="card card-pad"><div class="empty">Tidak ada tagihan/utang belum lunas.</div></div>';
    }
    return `<div id="simulasi-utang-list">${sectionHTML.join('')}</div>`;
}

function renderSimulasiContent() {
    const container = $('#sub-page-content');
    if (!container) return;

    const headerCard = `
        <div class="simulasi-summary card card-pad">
            <div class="form-group">
                <label for="simulasi-dana-masuk">Dana Masuk (Uang di Tangan)</label>
                <input type="text" id="simulasi-dana-masuk" inputmode="numeric" placeholder="Masukkan jumlah dana...">
            </div>
            <div class="simulasi-totals sim-totals-rows">
                <div class="sim-total-row is-alloc">
                    <span class="sim-total-label">Total Alokasi</span>
                    <strong class="sim-total-value" id="total-selected-display">Rp 0</strong>
                </div>
                <div class="sim-total-row is-remaining">
                    <span class="sim-total-label">Sisa Dana</span>
                    <strong class="sim-total-value" id="remaining-debt-display" data-prev="0">Rp 0</strong>
                </div>
            </div>
            <div class="sim-actions" style="display:flex; gap:.5rem;">
                <button class="btn btn-secondary" id="sim-auto-select" title="Pilih Otomatis">Pilih Otomatis</button>
                <button class="btn-icon" id="sim-clear" title="Reset">${createIcon('rotate_ccw', 20)}</button>
                <button class="btn-icon" id="sim-download-pdf" title="Unduh PDF">${createIcon('download', 20)}</button>
            </div>
        </div>`;

    const body = `<div class="card card-pad">${buildSimulasiListHTML()}</div>`;
    container.innerHTML = `${headerCard}${body}`;

    const danaInput = document.getElementById('simulasi-dana-masuk');
    const totalDisplay = document.getElementById('total-selected-display');
    const remainDisplay = document.getElementById('remaining-debt-display');

    const recalc = () => {
        const dana = parseFormattedNumber(danaInput.value);
        let total = 0;
        appState.simulasiState.selectedPayments.forEach(v => total += (v || 0));
        totalDisplay.textContent = fmtIDR(total);
        const nextRemain = Math.max(0, (dana || 0) - total);
        const prevRemain = parseFormattedNumber(remainDisplay?.dataset.prev || '0');
        animateCount(remainDisplay, prevRemain, nextRemain);
        if (remainDisplay) remainDisplay.dataset.prev = String(nextRemain);
    };

    danaInput.addEventListener('input', (e) => {
        const input = e.target;
        let selectionStart = input.selectionStart;
        const originalLength = input.value.length;
        const rawValue = parseFormattedNumber(input.value);
        if (isNaN(rawValue)) {
            input.value = '';
            return;
        }
        const formattedValue = formatThousandsID(rawValue);
        if (input.value !== formattedValue) {
            input.value = formattedValue;
            const newLength = formattedValue.length;
            const diff = newLength - originalLength;
            if (selectionStart != null) {
                input.setSelectionRange(selectionStart + diff, selectionStart + diff);
            }
        }
        recalc();
    });

    document.getElementById('sim-auto-select').addEventListener('click', () => {
        const dana = parseInt((danaInput.value || '').replace(/[^0-9]/g,'')) || 0;
        let remain = dana;
        appState.simulasiState.selectedPayments.clear();

        const items = Array.from(document.querySelectorAll('.simulasi-item'))
            .map(el => ({ el, amount: parseFormattedNumber(el.dataset.fullAmount) }))
            .sort((a,b) => b.amount - a.amount);
        items.forEach(({el, amount}) => {
            if (remain >= amount) {
                appState.simulasiState.selectedPayments.set(el.dataset.id, amount);
                el.classList.add('selected');
                remain -= amount;
            } else {
                el.classList.remove('selected');
            }
        });
        emit('ui.simulasi.recalcTotals');
    });
    document.getElementById('sim-clear').addEventListener('click', () => {
        appState.simulasiState.selectedPayments.clear();
        document.querySelectorAll('.simulasi-item.selected').forEach(n => n.classList.remove('selected'));
        emit('ui.simulasi.recalcTotals');
    });
    document.getElementById('sim-download-pdf').addEventListener('click', () => {
        createSimulasiPDF();
    });

    on('ui.simulasi.recalcTotals', () => {
        const remainEl = document.getElementById('remaining-debt-display');
        const totalEl = document.getElementById('total-selected-display');
        const dana = parseFormattedNumber(danaInput.value);
        let total = 0;
        appState.simulasiState.selectedPayments.forEach(v => total += (v || 0));
        totalEl.textContent = fmtIDR(total);
        const nextRemain = Math.max(0, (dana || 0) - total);
        const prevRemain = parseFormattedNumber(remainEl?.dataset.prev || '0');
        animateCount(remainEl, prevRemain, nextRemain);
        if (remainEl) remainEl.dataset.prev = String(nextRemain);
    });
    recalc();
}

function initSimulasiPage() {
    const container = $('.page-container');
    container.innerHTML = `
        <div class="content-panel">
            ${createPageToolbarHTML({ title: 'Simulasi Pembayaran' })}
            <div id="sub-page-content" class="scrollable-content" style="padding: 1rem;"></div>
        </div>
    `;
    emit('ui.simulasi.renderContent');

    try {
        if (initSimulasiPage._live) { initSimulasiPage._live.unsubscribe?.(); initSimulasiPage._live = null; }
        initSimulasiPage._live = liveQueryMulti(['bills','expenses','incomes','fundingSources','projects','fundingCreditors'], () => {
            clearTimeout(initSimulasiPage._deb);
            initSimulasiPage._deb = setTimeout(() => emit('ui.simulasi.renderContent'), 250);
        });
    } catch (_) {}
}

on('ui.simulasi.renderContent', renderSimulasiContent);
export { initSimulasiPage };
on('app.unload.simulasi', () => { try { if (initSimulasiPage._live) { initSimulasiPage._live.unsubscribe?.(); initSimulasiPage._live = null; } } catch(_) {} });
