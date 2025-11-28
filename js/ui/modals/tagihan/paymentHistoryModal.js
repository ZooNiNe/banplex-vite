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
  if (!billId || (bill && billId === dataset.id)) billId = bill.id;

  const isSalaryBill = bill.type === 'gaji';
  let defaultRecipientName = 'Penerima';
  if (!isSalaryBill && bill.expenseId) {
      const expense = appState.expenses.find(e => e.id === bill.expenseId);
      const supplier = expense ? appState.suppliers.find(s => s.id === expense.supplierId) : null;
      defaultRecipientName = supplier?.supplierName || 'Penerima';
  }
  
  // FIX: Definisi Variabel Scope Atas
  const targetBillIds = billIds.length > 0 ? billIds : [billId];
  const aggregatedBillIdsAttr = targetBillIds.join(',');

  let allPayments = [];
  const paymentResults = await Promise.all(targetBillIds.map(id => getPaymentHistory(id).catch(() => [])));
  allPayments = paymentResults.flat().sort((a, b) => getJSDate(a.date) - getJSDate(b.date));

  if (isSalaryBill && dataset.workerId) {
    allPayments = allPayments.filter(p => !p.workerId || p.workerId === dataset.workerId);
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
  
  if (isSalaryBill) {
    const allSalaryBills = targetBillIds
      .map(id => appState.bills.find(b => b.id === id))
      .filter(b => b && b.type === 'gaji' && !b.isDeleted);

    const aggregates = aggregateSalaryBillWorkers(allSalaryBills);

    const workerId = dataset.workerId || bill.workerId || bill.workerDetails?.[0]?.workerId || bill.workerDetails?.[0]?.id;
    const workerSummary = aggregates.find(s => s.workerId === workerId);

    const aggregatedBillAmount = allSalaryBills.reduce((sum, salaryBill) => sum + (Number(salaryBill?.amount) || 0), 0);
    const candidateTotalAmount = workerSummary?.totalAmount ?? Math.max(aggregatedBillAmount, bill.amount || 0);
    workerTotalAmount = Number.isFinite(candidateTotalAmount) ? candidateTotalAmount : 0;

    if (workerSummary) {
      workerChipLabel = workerSummary.workerName || recipientName;
    }

    const outstanding = Math.max(0, workerTotalAmount - normalizedPaidAmount);
    const statusColor = outstanding > 0 ? 'var(--danger, #ef4444)' : 'var(--success, #22c55e)';

    workerOverviewHTML = `
      <div style="background:var(--surface-sunken); border-radius:12px; padding:16px; margin-bottom:20px;">
        <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:24px; align-items:flex-start;">
           <div>
              <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; margin-bottom:4px;">Pekerja</div>
              <div style="font-weight:600; font-size:1.1rem; color:var(--text-main);">${workerChipLabel}</div>
           </div>
           <div style="display:flex; gap:24px; flex-wrap:wrap; align-items:flex-end;">
              <div style="text-align:right;">
                 <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase;">Total Tagihan</div>
                 <div style="font-weight:700; font-size:1rem;">${fmtIDR(workerTotalAmount)}</div>
              </div>
              <div style="text-align:right;">
                 <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase;">Sudah Dibayar</div>
                 <div style="font-weight:700; font-size:1rem; color:var(--success);">${fmtIDR(normalizedPaidAmount)}</div>
              </div>
              <div style="text-align:right;">
                 <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase;">Sisa Pembayaran</div>
                 <div style="font-weight:700; font-size:1rem; color:${statusColor};">${fmtIDR(outstanding)}</div>
              </div>
           </div>
        </div>
      </div>
    `;

    const summaryCandidates = Array.isArray(workerSummary?.summaries) ? [...workerSummary.summaries] : [];
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
    const summaryEntries = summaryCandidates.length ? summaryCandidates : fallbackSummaries;
    const sortedSummaries = summaryEntries.slice();
    sortedSummaries.sort((a, b) => getJSDate(b.startDate || b.endDate) - getJSDate(a.startDate || a.endDate));

    const summaryListHTML = sortedSummaries.length
      ? sortedSummaries.map((summary, index) => {
          const rawAmount = Number(summary.uniqueAmount ?? summary.amount ?? 0);
          const amountValue = Number.isFinite(rawAmount) ? rawAmount : 0;
          const attendanceSummary = summary.attendanceSummary || {};
          const attendanceParts = [];
          if (attendanceSummary.full) attendanceParts.push(`${attendanceSummary.full} Hadir`);
          if (attendanceSummary.half) attendanceParts.push(`${attendanceSummary.half} 1/2 Hari`);
          if (attendanceSummary.absent) attendanceParts.push(`${attendanceSummary.absent} Absen`);
          if (summary.recordCount) attendanceParts.push(`${summary.recordCount} Absensi`);
          const attendanceText = attendanceParts.length ? attendanceParts.join(' · ') : 'Tanpa data absensi';
          const rangeLabel = summary.rangeLabel || formatRangeLabelForModal(summary.startDate, summary.endDate);
          const isPaidSummary = summary.status === 'paid';
          return `
            <div style="padding:10px 0; border-bottom:1px solid var(--line); display:flex; flex-direction:column; gap:6px;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
                <div style="flex:1;">
                  <div style="font-weight:600; font-size:0.95rem;">Rekap ${index + 1}${summary.billId ? ` • ${summary.billId}` : ''}</div>
                  <div style="font-size:0.8rem; color:var(--text-dim);">${rangeLabel}</div>
                </div>
                <span style="font-size:0.75rem; padding:2px 10px; border-radius:999px; border:1px solid ${isPaidSummary ? 'var(--success)' : 'var(--danger)'}; color:${isPaidSummary ? 'var(--success)' : 'var(--danger)'};">
                  ${isPaidSummary ? 'Lunas' : 'Belum Lunas'}
                </span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="font-size:1rem; color:var(--text-main);">${fmtIDR(amountValue)}</strong>
                <span style="font-size:0.75rem; color:var(--text-dim);">${attendanceText}</span>
              </div>
            </div>
          `;
        }).join('')
      : `<div style="padding:10px 0; color:var(--text-dim); font-style:italic;">Belum ada rangkuman tagihan.</div>`;

    recapListHTML = `
      <div class="payment-history-summary-section" style="margin-bottom:20px;">
        <h4 style="margin:0 0 12px 0; font-size:1rem; border-bottom:2px solid var(--surface-sunken); padding-bottom:6px;">Rincian Rekap ${workerChipLabel}</h4>
        <div class="payment-history-summary-list">
          ${summaryListHTML}
        </div>
      </div>
    `;

  } else {
      workerTotalAmount = Number(bill.amount || 0);
      const outstanding = Math.max(0, workerTotalAmount - normalizedPaidAmount);
      const statusColor = outstanding > 0 ? 'var(--danger)' : 'var(--success)';
       workerOverviewHTML = `
        <div style="background:var(--surface-sunken); border-radius:12px; padding:16px; margin-bottom:20px;">
           <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="color:var(--text-dim);">Total Tagihan</span>
                <strong style="font-size:1.1rem;">${fmtIDR(workerTotalAmount)}</strong>
           </div>
           <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
                <span style="color:var(--text-dim);">Sisa</span>
                <strong style="font-size:1.1rem; color:${statusColor}">${fmtIDR(outstanding)}</strong>
           </div>
        </div>
      `;
  }

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
    let statusLabel = 'Server';
    if (p._source === 'pending') statusLabel = 'Menunggu';
    
    // FIX: Gunakan ID Bill Asli untuk Delete agar tidak error
    const parentBillId = p.billId || bill.id;

    return `
      <div class="history-item" style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; padding:12px 0; border-bottom:1px solid var(--line); gap:10px;">
          <div style="display:flex; flex-direction:column; min-width:120px;">
              <span style="font-weight:600; font-size:0.95rem; color:var(--text-main);">${timeStr}</span>
              <span style="font-size:0.75rem; color:var(--text-dim);">${statusLabel}</span>
          </div>

          <div style="display:flex; align-items:center; gap:12px; margin-left:auto;">
              <strong style="color:var(--success); font-size:1rem;">+ ${fmtIDR(p.amount || 0)}</strong>
              
              <div style="display:flex; gap:4px;">
                ${(p.attachmentUrl || p.localAttachmentId) ? `
                    <button class="btn-icon small" data-action="view-payment-attachment" data-url="${p.attachmentUrl||''}" data-local-id="${p.localAttachmentId||''}">
                        ${createIcon('attachment', 16)}
                    </button>` : ''}
                
                <button class="btn-icon small danger" data-action="delete-payment" data-bill-id="${parentBillId}" ${p._source === 'pending' ? `data-pending-id="${p.id}" data-source="pending"` : `data-payment-id="${p.id}" data-source="server"`} data-amount="${p.amount || 0}">
                    ${createIcon('delete', 16)}
                </button>
              </div>
          </div>
      </div>
    `;
  }).join('');

  const emptyState = historyEntries.length === 0 
    ? `<div style="text-align:center; padding:20px; color:var(--text-dim); font-style:italic;">Belum ada riwayat pembayaran.</div>` 
    : '';

  const footerHTML = historyEntries.length > 0 ? `
    <div class="modal-footer">
        <button class="btn btn-secondary w-full" data-action="cetak-kwitansi-kolektif" data-bill-id="${bill.id}" data-bill-ids="${aggregatedBillIdsAttr}" data-worker-id="${dataset.workerId || ''}" data-worker-name="${(workerChipLabel || recipientName || '').replace(/"/g, '&quot;')}">
            ${createIcon('print', 18)} Cetak Semua Kwitansi
        </button>
    </div>
  ` : '';

  const paneTitle = isSalaryBill ? `Riwayat: ${workerChipLabel}` : 'Riwayat Pembayaran';

  const content = `
      <div class="payment-history-wrapper">
          ${workerOverviewHTML}
          ${recapListHTML}
          <h4 style="margin:0 0 10px 0; font-size:1rem; border-bottom:2px solid var(--surface-sunken); padding-bottom:8px;">Riwayat Pembayaran</h4>
          <div class="history-list">
              ${listHTML}
              ${emptyState}
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
