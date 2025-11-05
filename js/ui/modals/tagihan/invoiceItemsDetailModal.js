import { fmtIDR } from "../../../utils/formatters.js";
import { appState } from "../../../state/appState.js";
import { getEmptyStateHTML } from "../../components/emptyState.js";
// PERBAIKAN: Impor closeModalImmediate
import { createModal, closeModalImmediate } from "../../components/modal.js";
import { getJSDate } from "../../../utils/helpers.js";

function getMasterItemName(type, id) {
    let collection;
    let key;
    switch (type) {
        case 'material':
            collection = appState.materials;
            key = 'materialName';
            break;
        case 'operasional':
            collection = appState.operationalCategories;
            key = 'categoryName';
            break;
        case 'lainnya':
            collection = appState.otherCategories;
            key = 'categoryName';
            break;
        default:
            return `Item ID: ${id}`;
    }
    const item = (collection || []).find(i => i.id === id);
    return item ? item[key] : `Item ID: ${id} (Tidak Ditemukan)`;
}

export function getInvoiceItemsDetailHTML(expense) {
    if (!expense || !expense.items || expense.items.length === 0) {
        return getEmptyStateHTML({
            icon: 'receipt_long',
            title: 'Tidak Ada Item Faktur',
            desc: 'Tidak ada rincian barang untuk ditampilkan pada faktur ini.',
            isSmall: true
        });
    }

    const itemsHTML = expense.items.map(item => {
        const materialName = getMasterItemName(expense.type, item.materialId);
        const quantity = item.quantity || item.qty || 0;
        const unit = item.unit || '';
        const price = item.price || 0;
        const total = (quantity || 0) * (price || 0);

        const subDetailHTML = `${quantity} ${unit} &times; ${fmtIDR(price)}`;

        return `
            <div>
                <dt>
                    <span class="detail-list-item-name">${materialName}</span>
                    <span class="detail-list-item-sub">${subDetailHTML}</span>
                </dt>
                <dd>${fmtIDR(total)}</dd>
            </div>
        `;
    }).join('');

    const supplier = (appState.suppliers || []).find(s => s.id === expense.supplierId);
    const supplierName = supplier?.supplierName || '-';
    const dateStr = getJSDate(expense.date).toLocaleDateString('id-ID');

    return `
        <div class="card card-pad" id="invoice-items-summary-card">
            <div class="detail-section" style="margin-top:0; display:flex; justify-content:space-between; align-items:center; gap:.5rem;">
                <div>
                    <div class="wa-card-v2__description sub">Supplier</div>
                    <div><strong>${supplierName}</strong></div>
                </div>
                <div style="text-align:right;">
                    <div class="wa-card-v2__description sub">Tanggal</div>
                    <div><strong>${dateStr}</strong></div>
                </div>
            </div>
            <h5 class="invoice-section-title">Rincian Item Faktur (${expense.items.length})</h5>
            <div class="detail-list">
                ${itemsHTML}
            </div>
            <div class="invoice-total">
                <span>Total Faktur</span>
                <strong>${fmtIDR(expense.amount || 0)}</strong>
            </div>
        </div>
    `;
}

export function openInvoiceItemsDetailModal(expenseInput) {
    const expense = typeof expenseInput === 'string' ? (appState.expenses || []).find(e => e.id === expenseInput) : expenseInput;
    if (!expense) {
        const isMobile = window.matchMedia('(max-width: 599px)').matches;
        const modal = isMobile
            ? createModal('actionsPopup', { title: 'Rincian Faktur', content: getEmptyStateHTML({ icon:'receipt_long', title:'Tidak Ada Data', desc:'Faktur tidak ditemukan.' }), layoutClass: 'is-bottom-sheet' })
            : createModal('dataDetail', { title: 'Rincian Faktur', content: getEmptyStateHTML({ icon:'receipt_long', title:'Tidak Ada Data', desc:'Faktur tidak ditemukan.' }) });
        return modal;
    }
    const content = getInvoiceItemsDetailHTML(expense);
    const footerHTML = `
        <button type="button" class="btn btn-ghost" data-action="close">Tutup</button>
        <button type="button" class="btn btn-primary" data-action="print-pdf">Cetak PDF Rincian Material</button>
    `;
    const isMobile = window.matchMedia('(max-width: 599px)').matches;
    const modal = isMobile
        ? createModal('actionsPopup', { title: expense.description || 'Rincian Faktur', content, footer: footerHTML, layoutClass: 'is-bottom-sheet' })
        : createModal('dataDetail', { title: expense.description || 'Rincian Faktur', content, footer: footerHTML });

    // Footer actions (close + safe PDF generation)
    try {
        const footerEl = modal.querySelector('.modal-footer, .form-footer-actions') || modal;
        footerEl.addEventListener('click', async (e) => {
            const btn = e.target.closest('button'); if (!btn) return;
            const act = btn.dataset.action;
            if (act === 'close') {
                // PERBAIKAN: Gunakan closeModalImmediate
                try { closeModalImmediate(modal); } catch(_) {}
            }
            if (act === 'print-pdf') {
                try {
                    const { handleDownloadReport } = await import('../../../services/reportService.js');
                    const d = getJSDate(expense.date);
                    const ymd = isNaN(d.getTime()) ? new Date().toISOString().slice(0,10) : d.toISOString().slice(0,10);
                    // Inject temporary filters
                    const start = document.createElement('input'); start.type='hidden'; start.id='report-start-date'; start.value = ymd;
                    const end = document.createElement('input'); end.type='hidden'; end.id='report-end-date'; end.value = ymd;
                    const sup = document.createElement('input'); sup.type='hidden'; sup.id='report-supplier-id'; sup.value = expense.supplierId || 'all';
                    document.body.append(start, end, sup);
                    await handleDownloadReport('pdf', 'material_supplier');
                    start.remove(); end.remove(); sup.remove();
                } catch (err) {
                    console.error('Failed generating PDF:', err);
                }
            }
        });
    } catch(_) {}

    return modal;
}
