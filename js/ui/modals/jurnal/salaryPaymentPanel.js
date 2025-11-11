import { appState } from "../../../state/appState.js";
import { $ } from "../../../utils/dom.js";
import { fmtIDR } from "../../../utils/formatters.js";
import { createModal, closeModal, showDetailPane, closeDetailPane } from "../../components/modal.js";
import { emit } from "../../../state/eventBus.js";
import { toast } from "../../components/toast.js";
import { getJSDate, isViewer } from "../../../utils/helpers.js";
import { getEmptyStateHTML } from "../../components/emptyState.js";
import { localDB } from "../../../services/localDbService.js";
import { TEAM_ID } from "../../../config/constants.js"
import { db, billsCol } from "../../../config/firebase.js";
import { getDocs, collection, doc, query, orderBy } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// Helper Ikon
function createIcon(iconName, size = 18, classes = '') {
    const icons = {
        payment: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-credit-card ${classes}"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
        printer: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-printer ${classes}"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>`,
        coins: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-coins ${classes}"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82-.71-.71A6 6 0 0 1 16.71 13.88Z"/></svg>`,
    };
    return icons[iconName] || '';
}

/**
 * Mengambil riwayat pembayaran (server & lokal) untuk billId
 */
async function getPaymentHistory(billId) {
    const pending = await localDB.pending_payments.where({ billId }).toArray();
    let serverPayments = [];
    try {
        const billRef = doc(db, 'teams', TEAM_ID, 'bills', billId);
        const q = query(collection(billRef, 'payments'), orderBy('date', 'asc'));
        const snap = await getDocs(q);
        serverPayments = snap.docs.map(d => ({ id: d.id, ...d.data(), _source: 'server' }));
    } catch (e) {
        console.warn("Gagal mengambil riwayat pembayaran server:", e);
    }
    const allPayments = [
        ...serverPayments,
        ...pending.map(p => ({ ...p, _source: 'pending' }))
    ];
    allPayments.sort((a, b) => getJSDate(a.date) - getJSDate(b.date));
    return allPayments;
}

/**
 * Merender konten untuk panel pembayaran gaji.
 */
function _renderSalaryPaymentPanelContent(bill, allPayments) {
    const total = bill?.amount || 0;
    const paid = bill?.paidAmount || 0;
    const remaining = Math.max(0, total - paid);
    const status = bill?.status || 'unpaid';

    // 1. Ringkasan Header (Branding yang sama)
    const summaryHTML = `
        <div class="card card-pad">
            <div class="success-hero success-hero--payment" style="margin-bottom:.75rem;">
                <svg class="success-hero-art" width="120" height="88" viewBox="0 0 120 88" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <defs>
                        <linearGradient id="gsp1" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.18" />
                            <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.05" />
                        </linearGradient>
                    </defs>
                    <rect x="8" y="12" width="84" height="52" rx="10" fill="url(#gsp1)" stroke="var(--line)"/>
                    <rect x="20" y="26" width="40" height="8" rx="4" fill="var(--primary)" opacity="0.25" />
                    <rect x="20" y="40" width="30" height="8" rx="4" fill="var(--primary)" opacity="0.15" />
                </svg>
                <div class="success-preview-icon">${createIcon('payment', 28)}</div>
            </div>
            <div class="payment-modal-header" style="margin: 0;">
                <span class="label" id="payment-remaining-label">Sisa Tagihan Gaji</span>
                <strong class="payment-main-amount" id="payment-remaining-amount" data-raw-amount="${remaining}">${fmtIDR(remaining)}</strong>
            </div>
            <div class="detail-summary-grid" style="grid-template-columns: 1fr 1fr; background-color: var(--panel); margin-top: 1.5rem; border-top: 1px solid var(--line); padding-top: 1rem;">
                <div class="summary-item">
                    <span class="label">Total Tagihan</span>
                    <strong class="value">${fmtIDR(total)}</strong>
                </div>
                <div class="summary-item">
                    <span class="label">Total Terbayar</span>
                    <strong class="value positive">${fmtIDR(paid)}</strong>
                </div>
            </div>
        </div>
    `;

    const workersHTML = `
        <div class="card card-pad" style="margin-top: 1rem;">
            <h5 class="detail-section-title" style="margin-top: 0;">Kelola Pembayaran Individual</h5>
            <div class="detail-list-container">
            ${(bill.workerDetails || []).map(w => {
                const workerId = w.id || w.workerId;
                const totalPaidForWorker = allPayments
                    .filter(p => p.workerId === workerId)
                    .reduce((sum, p) => sum + (p.amount || 0), 0);
                const remainingForWorker = Math.max(0, (w.amount || 0) - totalPaidForWorker);
                const hasPayment = totalPaidForWorker > 0;

                // Tentukan tombol apa yang akan ditampilkan
                const showPayButton = status !== 'paid' && remainingForWorker > 0 && !isViewer();
                const showPrintButton = hasPayment; 

                return `
                    <div class="detail-list-item-card" style="display: flex; justify-content: space-between; align-items: center; gap: 0.75rem;">
                        <div class="item-main" style="flex: 1; min-width: 0;">
                            <strong class="item-title" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;">${w.name || 'Pekerja Dihapus'}</strong>
                            <span class="item-subtitle" style="font-size: 0.8rem; color: var(--text-dim);">Sisa: ${fmtIDR(remainingForWorker)} / ${fmtIDR(w.amount)}</span>
                        </div>
                        <div class="item-secondary" style="flex-shrink: 0; display: flex; gap: 0.5rem;">
                            ${showPrintButton ? `
                                <button class="btn-icon" data-action="cetak-kwitansi-individu" data-bill-id="${bill.id}" data-worker-id="${workerId}" title="Cetak Kwitansi ${w.name}">
                                    ${createIcon('printer', 18)}
                                </button>
                            ` : ''}
                            
                            ${showPayButton ? `
                                <button class="btn-icon" data-action="pay-individual-salary" data-bill-id="${bill.id}" data-worker-id="${workerId}" data-worker-name="${w.name}" data-amount="${remainingForWorker}" title="Bayar Gaji ${w.name}">
                                    ${createIcon('coins', 18)}
                                </button>
                            ` : ''}
                        </div>
                    </div>`;
            }).join('')}
            </div>
        </div>
    `;

    return summaryHTML + workersHTML;
}

/**
 * Memasang listener untuk panel kelola pembayaran.
 */
function _attachSalaryPaymentPanelListeners(pane, bill, allPayments) {
    const controller = pane.__controller;
    if (!controller) {
        console.warn('Pane controller not found for salaryPaymentPanel');
        return;
    }
    const { signal } = controller;

    pane.addEventListener('click', (e) => {
        const actionTarget = e.target.closest('[data-action]');
        if (!actionTarget) return;

        const action = actionTarget.dataset.action;
        const dataset = actionTarget.dataset;

        if (action === 'pay-individual-salary') {
            emit('ui.modal.payIndividualSalary', dataset);
        }
        
        if (action === 'cetak-kwitansi-individu') {
            emit('ui.action.cetak-kwitansi-individu', dataset);
        }
        
        if (action === 'cetak-kwitansi-kolektif') {
            emit('ui.action.cetak-kwitansi-kolektif', dataset);
        }
        
        if (action === 'pay-bill') {
            emit('ui.action.pay-bill', dataset);
        }
    }, { signal });
}

/**
 * Fungsi utama untuk membuka panel kelola pembayaran gaji.
 */
export async function openSalaryPaymentPanel(billId) {
    const bill = appState.bills.find(b => b.id === billId) || await localDB.bills.get(billId);
    if (!bill || bill.type !== 'gaji') {
        toast('error', 'Tagihan gaji tidak ditemukan.');
        return;
    }

    const pane = showDetailPane({
        title: `Kelola Gaji: ${bill.description}`,
        content: '<div class="card card-pad"><div class="skeleton-wrapper"><div class="skeleton" style="height: 120px;"></div><div class="skeleton" style="height: 200px; margin-top: 1rem;"></div></div></div>',
        footer: '' // Footer akan ditambahkan secara dinamis
    });

    if (!pane) return;

    const allPayments = await getPaymentHistory(billId);
    
    // PERBAIKAN: Logika untuk footer
    let footerHTML = '';
    const remaining = Math.max(0, (bill?.amount || 0) - (bill?.paidAmount || 0));
    const showPayAllButton = remaining > 0 && !isViewer();
    const hasPayments = allPayments.length > 0;

    footerHTML = `
        <button class="btn btn-secondary" data-action="cetak-kwitansi-kolektif" data-bill-id="${bill.id}" ${!hasPayments ? 'disabled' : ''}>
            ${createIcon('printer', 18)} Cetak Semua Kwitansi
        </button>
        <button class="btn btn-primary" data-action="pay-bill" data-item-id="${bill.id}" ${!showPayAllButton ? 'disabled' : ''}>
            ${createIcon('coins', 18)} Bayar Sisa (${fmtIDR(remaining)})
        </button>
    `;
    // --- AKHIR PERBAIKAN ---

    const content = _renderSalaryPaymentPanelContent(bill, allPayments);
    
    // Render ulang konten dan footer
    const bodyContainer = pane.querySelector('.detail-pane-body, .mobile-detail-content');
    
    if (bodyContainer) {
        bodyContainer.innerHTML = `<div class="scrollable-content">${content}</div>`;
    }
    
    if (footerHTML) {
        // PERBAIKAN: Atur grid-template-columns agar pas 2 tombol
        pane.insertAdjacentHTML('beforeend', `<div class="detail-pane-footer" style="grid-template-columns: 1fr 1fr;">${footerHTML}</div>`);
    }

    // Pasang listener
    _attachSalaryPaymentPanelListeners(pane, bill, allPayments);
}