import { createModal, closeModalImmediate, showDetailPane } from "../../components/modal.js";
import { localDB } from "../../../services/localDbService.js";
import { fmtIDR } from "../../../utils/formatters.js";
import { getJSDate } from "../../../utils/helpers.js";
import { TEAM_ID } from "../../../config/constants.js";
import { db } from "../../../config/firebase.js";
import { getDocs, collection, doc, query, orderBy } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { appState } from "../../../state/appState.js";
import { emit } from "../../../state/eventBus.js";
import { getEmptyStateHTML } from "../../components/emptyState.js";
import { aggregateSalaryBillWorkers } from "../../components/cards.js";

function createIcon(iconName, size = 18, classes = '') {
    const icons = {
        attachment: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-paperclip ${classes}"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
        print: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-printer ${classes}"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>`,
        delete: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2 ${classes}"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
        payment: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-credit-card ${classes}"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
        coins: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-coins ${classes}"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82-.71-.71A6 6 0 0 1 16.71 13.88Z"/></svg>`,
        'calendar-x-2': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar-x-2 ${classes}"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m14.5 14.5-5 5"/><path d="m9.5 14.5 5 5"/></svg>`,
    };
    return icons[iconName] || '';
}

function formatRangeLabelForModal(start, end) {
    const startDate = start ? getJSDate(start) : null;
    const endDate = end ? getJSDate(end) : null;
    const formatter = (date) => date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    if (startDate && endDate) {
        const sameDay = startDate.toISOString().slice(0, 10) === endDate.toISOString().slice(0, 10);
        if (sameDay) return formatter(startDate);
        return `${formatter(startDate)} - ${formatter(endDate)}`;
    }
    if (startDate) return formatter(startDate);
    if (endDate) return formatter(endDate);
    return 'Rentang tidak tersedia';
}

async function getPaymentHistory(billId) {
    const pending = await localDB.pending_payments.where({ billId }).toArray();
    let serverPayments = [];
    try {
        const billRef = doc(db, 'teams', TEAM_ID, 'bills', billId);
        const q = query(collection(billRef, 'payments'), orderBy('date', 'asc'));
        const snap = await getDocs(q);
        serverPayments = snap.docs.map(d => ({
            id: d.id,
            billId,
            ...d.data(),
            _source: 'server'
        }));
    } catch (e) {
        console.warn("Gagal mengambil riwayat pembayaran server:", e);
    }
    const allPayments = [
        ...serverPayments,
        ...pending.map(p => ({ ...p, billId: p.billId || billId, _source: 'pending' }))
    ];
    allPayments.sort((a, b) => getJSDate(a.date) - getJSDate(b.date));
    return allPayments;
}

export async function handleOpenPaymentHistoryModal(dataset = {}) {
  console.warn('[paymentHistoryModal] Opening with dataset:', dataset);
  
  const rawBillIds = dataset.billIds || dataset['bill-ids'];
  const billIds = Array.isArray(rawBillIds)
    ? rawBillIds
    : (typeof rawBillIds === 'string' ? rawBillIds.split(',').filter(Boolean) : []);
  
  let billId = dataset.id || dataset.billId || billIds[0];
  if (!billId) return;

  let bill = appState.bills.find(b => b.id === billId) || await localDB.bills.get(billId);
  
  if (!bill && billIds.length > 0) {
    for (const altId of billIds) {
      bill = appState.bills.find(b => b.id === altId) || await localDB.bills.get(altId);
      if (bill) break;
    }
  }
  
  if (!bill) return;
  const toKeyString = (value) => {
    if (value === undefined || value === null) return '';
    return String(value).trim();
  };
  if (!billId || (bill && billId === dataset.id)) billId = bill.id;

  const isSalaryBill = bill.type === 'gaji';
  let defaultRecipientName = 'Penerima';
  if (!isSalaryBill && bill.expenseId) {
      const expense = appState.expenses.find(e => e.id === bill.expenseId);
      const supplier = expense ? appState.suppliers.find(s => s.id === expense.supplierId) : null;
      defaultRecipientName = supplier?.supplierName || 'Penerima';
  }
  
  const datasetWorkerId = toKeyString(dataset.workerId || dataset['worker-id']);
  const matchesWorkerRecord = (candidate, workerId) => {
    if (!candidate || !workerId) return false;
    if (candidate.workerId === workerId) return true;
    if (Array.isArray(candidate.workerDetails)) {
      return candidate.workerDetails.some(detail => detail && (detail.workerId === workerId || detail.id === workerId));
    }
    return false;
  };

  const candidateBillIds = [];
  const appendUniqueBillId = (value) => {
    const normalized = toKeyString(value);
    if (normalized && !candidateBillIds.includes(normalized)) {
      candidateBillIds.push(normalized);
    }
  };

  const workerBillIds = isSalaryBill && datasetWorkerId
    ? (appState.bills || [])
        .filter(billItem => billItem && billItem.type === 'gaji' && !billItem.isDeleted && matchesWorkerRecord(billItem, datasetWorkerId))
        .map(billItem => billItem.id)
    : [];

  billIds.filter(Boolean).forEach(appendUniqueBillId);
  workerBillIds.forEach(appendUniqueBillId);
  appendUniqueBillId(billId);

  const targetBillIds = candidateBillIds.length > 0 ? candidateBillIds : (billId ? [billId] : []);
  const aggregatedBillIdsAttr = targetBillIds.join(',');

  let allPayments = [];
  const paymentResults = await Promise.all(targetBillIds.map(id => getPaymentHistory(id).catch(() => [])));
  allPayments = paymentResults.flat().sort((a, b) => getJSDate(a.date) - getJSDate(b.date));

  if (isSalaryBill && datasetWorkerId) {
    allPayments = allPayments.filter(p => !p.workerId || p.workerId === datasetWorkerId);
  }

  const realTotalPaid = allPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const recipientName = (() => {
    if (!bill) return '-';
    if (bill.type === 'gaji') {
      if (bill.workerDetails && bill.workerDetails.length === 1) return bill.workerDetails[0].name;
      const worker = appState.workers.find(w => w.id === bill.workerId);
      return worker?.workerName || 'Pekerja';
    }
    if (bill.expenseId) {
      const expense = appState.expenses.find(e => e.id === bill.expenseId);
      const supplier = expense ? appState.suppliers.find(s => s.id === expense.supplierId) : null;
      return supplier?.supplierName || 'Penerima';
    }
    return 'Penerima';
  })();

  let workerOverviewHTML = '';
  let recapListHTML = '';
  let workerChipLabel = recipientName;
  let workerTotalAmount = 0;
  const normalizedPaidAmount = Number(realTotalPaid) || 0;
  let outstandingAmount = 0;
  let computedStatusClass = 'status-badge--positive';
  let computedStatusLabel = 'Lunas';
  let heroTotalAmount = 0;
  let heroOutstandingTotal = 0;
  let summaryCount = 0;

  if (isSalaryBill) {
    const allSalaryBills = targetBillIds
      .map(id => appState.bills.find(b => b.id === id))
      .filter(b => b && b.type === 'gaji' && !b.isDeleted);

    const aggregates = aggregateSalaryBillWorkers(allSalaryBills, { allSalaryBills, sourceItems: allSalaryBills });
    const workerId = datasetWorkerId || bill.workerId || bill.workerDetails?.[0]?.workerId || bill.workerDetails?.[0]?.id;
    const workerSummary = workerId ? aggregates.find(s => s.workerId === workerId) : null;

    const aggregatedBillAmount = allSalaryBills.reduce((sum, salaryBill) => sum + (Number(salaryBill?.amount) || 0), 0);
    const candidateTotalAmount = workerSummary?.totalAmount ?? Math.max(aggregatedBillAmount, Number(bill.amount || 0));
    workerTotalAmount = Number.isFinite(candidateTotalAmount) ? candidateTotalAmount : 0;

    if (workerSummary) {
      workerChipLabel = workerSummary.workerName || recipientName;
    }

    const fallbackSummaries = allSalaryBills.map((salaryBill) => {
      const startDate = salaryBill.startDate || salaryBill.date;
      const endDate = salaryBill.endDate || salaryBill.date;
      return {
        billId: salaryBill.id,
        amount: Number(salaryBill.amount || 0),
        uniqueAmount: Number(salaryBill.amount || 0),
        startDate,
        endDate,
        rangeLabel: formatRangeLabelForModal(startDate, endDate),
        status: salaryBill.status || 'unpaid',
        recordCount: Array.isArray(salaryBill.recordIds) ? salaryBill.recordIds.length : 0,
        attendanceSummary: {}
      };
    });

    const summaryCandidates = Array.isArray(workerSummary?.summaries) ? [...workerSummary.summaries] : [];
    const recapSummaries = summaryCandidates.length ? summaryCandidates : fallbackSummaries;
    summaryCount = recapSummaries.length;
    outstandingAmount = Math.max(0, workerTotalAmount - normalizedPaidAmount);
    computedStatusClass = outstandingAmount > 0 ? 'status-badge--warn' : 'status-badge--positive';
    computedStatusLabel = outstandingAmount > 0 ? 'Belum lunas' : 'Lunas';

    const sortedSummaries = recapSummaries.slice();
    sortedSummaries.sort((a, b) => getJSDate(b.startDate || b.endDate) - getJSDate(a.startDate || a.endDate));
    const recapCardsHTML = sortedSummaries.map((summary, index) => {
      const rangeLabel = summary.rangeLabel || formatRangeLabelForModal(summary.startDate, summary.endDate);
      const rawAmount = Number(summary.uniqueAmount ?? summary.amount ?? 0);
      const amountValue = Number.isFinite(rawAmount) ? rawAmount : 0;
      const statusLabel = summary.status === 'paid' ? 'Lunas' : 'Belum lunas';
      return `
        <article class="payment-history-recap-card">
          <div class="payment-history-recap-card__top">
            <strong>${index + 1}. ${rangeLabel}</strong>
            <span class="status-badge ${summary.status === 'paid' ? 'status-badge--positive' : 'status-badge--warn'}">${statusLabel}</span>
          </div>
          <div class="payment-history-recap-card__body">
            <span class="payment-history-recap-card__amount">${fmtIDR(amountValue)}</span>
            <span class="payment-history-recap-card__meta">${summary.recordCount || 0} absensi</span>
          </div>
        </article>
      `;
    }).join('');

    recapListHTML = summaryCount
      ? `
        <section class="payment-history-recap-section">
          <h4>Rincian Rekap</h4>
          <div class="payment-history-recap-grid">
            ${recapCardsHTML}
          </div>
        </section>
      `
      : `<section class="payment-history-recap-section"><p class="subtext">Belum ada rekapan gaji untuk ditampilkan.</p></section>`;

    const recapTotalAmount = recapSummaries.reduce((sum, summary) => sum + (Number(summary.uniqueAmount ?? summary.amount) || 0), 0);
    heroTotalAmount = recapTotalAmount || workerTotalAmount;
    heroOutstandingTotal = Math.max(0, heroTotalAmount - normalizedPaidAmount);

    workerOverviewHTML = `
      <section class="payment-history-overview-card payment-history-overview-card--salary">
        <div class="payment-history-overview-card__meta">
          <div>
            <span class="payment-history-overview-card__label">Pekerja</span>
            <strong>${workerChipLabel}</strong>
          </div>
          <div>
            <span class="payment-history-overview-card__label">Status</span>
            <span class="status-badge ${computedStatusClass}">${computedStatusLabel}</span>
          </div>
        </div>
        <div class="payment-history-overview-card__stats">
          <div>
            <span class="payment-history-overview-card__label">Total Tagihan</span>
            <strong>${fmtIDR(workerTotalAmount)}</strong>
          </div>
          <div>
            <span class="payment-history-overview-card__label">Terbayar</span>
            <strong>${fmtIDR(normalizedPaidAmount)}</strong>
          </div>
          <div>
            <span class="payment-history-overview-card__label">Sisa</span>
            <strong class="payment-history-overview-card__status-amount ${outstandingAmount > 0 ? 'payment-history-overview-card__status-amount--warn' : 'payment-history-overview-card__status-amount--positive'}">${fmtIDR(outstandingAmount)}</strong>
          </div>
        </div>
        <p class="payment-history-overview-card__subtext">
          ${summaryCount ? `${summaryCount} rekapan tersedia` : 'Belum ada rekapan tambahan'}
        </p>
      </section>
    `;
  } else {
    workerTotalAmount = Number(bill.amount || 0);
    outstandingAmount = Math.max(0, workerTotalAmount - normalizedPaidAmount);
    computedStatusClass = outstandingAmount > 0 ? 'status-badge--warn' : 'status-badge--positive';
    computedStatusLabel = outstandingAmount > 0 ? 'Belum lunas' : 'Lunas';
    heroTotalAmount = workerTotalAmount;
    heroOutstandingTotal = outstandingAmount;
    summaryCount = 0;

    workerOverviewHTML = `
      <section class="payment-history-overview-card">
        <div class="payment-history-overview-card__meta payment-history-overview-card__meta--space-between">
          <div>
            <span class="payment-history-overview-card__label">Penerima</span>
            <strong>${recipientName}</strong>
          </div>
          <div>
            <span class="payment-history-overview-card__label">Status</span>
            <span class="status-badge ${computedStatusClass}">${computedStatusLabel}</span>
          </div>
        </div>
        <div class="payment-history-overview-card__stats">
          <div>
            <span class="payment-history-overview-card__label">Total Tagihan</span>
            <strong>${fmtIDR(workerTotalAmount)}</strong>
          </div>
          <div>
            <span class="payment-history-overview-card__label">Sisa</span>
            <strong class="payment-history-overview-card__status-amount ${outstandingAmount > 0 ? 'payment-history-overview-card__status-amount--warn' : 'payment-history-overview-card__status-amount--positive'}">${fmtIDR(outstandingAmount)}</strong>
          </div>
        </div>
      </section>
    `;
  }

  const billLookup = new Map((appState.bills || []).map(b => [b.id, b]));
  const historyEntries = [...allPayments].sort((a, b) => getJSDate(b.date) - getJSDate(a.date));

  if (bill.status === 'paid' && realTotalPaid > 0 && historyEntries.length === 0) {
      historyEntries.push({
          id: `initial-${bill.id}`,
          amount: bill.amount,
          date: bill.paidAt || bill.createdAt || bill.date,
          _source: 'initial'
      });
  }

  function formatTime(d) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mmm = d.toLocaleString('id-ID', { month: 'short' });
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${dd} ${mmm}, ${hh}:${mm}`;
  }

    const listHTML = historyEntries.map(p => {
        const dateObj = getJSDate(p.date || new Date());
        const timeStr = formatTime(dateObj);
        const parentBillId = p.billId || bill.id;
        const parentBill = billLookup.get(parentBillId);
        const rekapLabel = parentBill ? (parentBill.description || parentBill.workerName || parentBill.id) : (parentBillId || 'Rekap');
        const safeParentLabel = String(rekapLabel || 'Rekap').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const attachmentButton = (p.attachmentUrl || p.localAttachmentId) ? `
            <button class="btn-icon small" data-action="view-payment-attachment" data-url="${p.attachmentUrl||''}" data-local-id="${p.localAttachmentId||''}">
                ${createIcon('attachment', 16)}
            </button>` : '';
        const sourceDescription = p._source === 'pending' ? 'Menunggu sinkronisasi' : 'Tersimpan di server';
        const workerIdForPrint = toKeyString(p.workerId || datasetWorkerId || bill.workerId);
        const canPrintIndividual = Boolean(isSalaryBill && workerIdForPrint && parentBill?.type === 'gaji');
        const workerIdAttr = workerIdForPrint ? `data-worker-id="${workerIdForPrint}"` : '';
        const printButtonHTML = canPrintIndividual
            ? `<button class="btn-icon small" data-action="cetak-kwitansi-individu" data-bill-id="${parentBillId}" ${workerIdAttr} title="Cetak Kwitansi">${createIcon('print', 16)}</button>`
            : `<button class="btn-icon small" data-action="cetak-kwitansi" data-bill-id="${parentBillId}" title="Cetak Kwitansi">${createIcon('print', 16)}</button>`;
        const deleteButtonHTML = `
            <button class="btn-icon small danger" data-action="delete-payment" data-bill-id="${parentBillId}" ${p._source === 'pending' ? `data-pending-id="${p.id}" data-source="pending"` : `data-payment-id="${p.id}" data-source="server"`} data-amount="${p.amount || 0}" title="Hapus Pembayaran">
                ${createIcon('delete', 16)}
            </button>`;
        const actionsHTML = `
            <div class="payment-history-entry__actions payment-history-entry__actions--top">
                ${printButtonHTML}
                ${deleteButtonHTML}
            </div>
        `;
        const attachmentsSection = attachmentButton ? `<div class="payment-history-entry__attachments">${attachmentButton}</div>` : '';

        return `
            <article class="payment-history-entry">
                <div class="payment-history-entry__header">
                    <div>
                        <strong>${timeStr}</strong>
                        <span class="payment-history-entry__description">${sourceDescription}</span>
                    </div>
                </div>
                ${actionsHTML}
                <div class="payment-history-entry__meta">
                    <span>${fmtIDR(p.amount || 0)}</span>
                    <span class="payment-history-entry__tag">Rekap: ${safeParentLabel}</span>
                </div>
                ${attachmentsSection}
            </article>
        `;
    }).join('');

  const emptyState = historyEntries.length === 0 
    ? `<div style="text-align:center; padding:20px; color:var(--text-dim); font-style:italic;">Belum ada riwayat pembayaran.</div>` 
    : '';

  const footerHTML = historyEntries.length > 0 ? `
        <button class="btn btn-secondary w-full" data-action="cetak-kwitansi-kolektif" data-bill-id="${bill.id}" data-bill-ids="${aggregatedBillIdsAttr}" data-worker-id="${dataset.workerId || ''}" data-worker-name="${(workerChipLabel || recipientName || '').replace(/"/g, '&quot;')}">
            ${createIcon('print', 18)} Cetak Semua Kwitansi
        </button>
    </div>
  ` : '';

  const heroSummaryLabel = summaryCount ? `${summaryCount} rekapan aktif` : 'Tanpa rekapan tambahan';
  const heroHTML = `
    <div class="payment-history-panel__hero">
      <div class="payment-history-panel__hero-info">
        <p class="payment-history-panel__hero-label">Total Outstanding Rekap</p>
        <strong class="payment-history-panel__hero-value">${fmtIDR(heroOutstandingTotal)}</strong>
        <span class="payment-history-panel__hero-meta">${heroSummaryLabel}</span>
      </div>
      <div class="payment-history-panel__hero-info">
        <p class="payment-history-panel__hero-label">Total Rekap</p>
        <strong class="payment-history-panel__hero-value">${fmtIDR(heroTotalAmount)}</strong>
        <span class="payment-history-panel__hero-meta">Termasuk ${fmtIDR(normalizedPaidAmount)} terbayar</span>
      </div>
    </div>
  `;

  const paneTitle = isSalaryBill ? `Riwayat: ${workerChipLabel}` : 'Riwayat Pembayaran';

  const content = `
    <div class="payment-history-wrapper">
      <div class="payment-history-panel">
        <aside class="payment-history-panel__sidebar">
          ${workerOverviewHTML}
          ${recapListHTML}
        </aside>
        <section class="payment-history-panel__main">
          ${heroHTML}
          <header class="payment-history-panel__main-header">
            <div>
              <p class="payment-history-panel__main-subtitle">Riwayat Pembayaran</p>
              <h4 class="payment-history-panel__main-title">${paneTitle}</h4>
            </div>
            <div class="payment-history-panel__main-stats">
              <div>
                <span class="payment-history-panel__label">Total Dibayarkan</span>
                <strong>${fmtIDR(normalizedPaidAmount)}</strong>
              </div>
              <div>
                <span class="payment-history-panel__label">Sisa</span>
                <strong class="payment-history-panel__status-amount ${outstandingAmount > 0 ? 'payment-history-panel__status-amount--warn' : 'payment-history-panel__status-amount--positive'}">${fmtIDR(outstandingAmount)}</strong>
              </div>
              <div>
                <span class="payment-history-panel__label">Transaksi</span>
                <strong>${historyEntries.length}</strong>
              </div>
            </div>
          </header>
          <div class="history-list">
            ${listHTML}
            ${emptyState}
          </div>
        </section>
      </div>
    </div>
  `;

  showDetailPane({
      title: paneTitle,
      content,
      footer: footerHTML,
      paneType: 'payment-history'
  });
}
