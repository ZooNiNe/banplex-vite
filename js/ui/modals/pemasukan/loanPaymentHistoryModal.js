// PERBAIKAN: Impor closeModalImmediate
import { createModal, closeModalImmediate } from "../../components/modal.js";
import { localDB } from "../../../services/localDbService.js";
import { fmtIDR } from "../../../utils/formatters.js";
import { getJSDate } from "../../../utils/helpers.js";
import { db } from "../../../config/firebase.js";
import { TEAM_ID } from "../../../config/constants.js";
import { getDocs, collection, doc, query, orderBy } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { getEmptyStateHTML } from "../../components/emptyState.js"; // Import getEmptyStateHTML
// Tambahkan import appState
import { appState } from "../../../state/appState.js";
// PERBAIKAN: Impor emit
import { emit } from "../../../state/eventBus.js";

// Tambahkan createIcon helper
function createIcon(iconName, size = 18, classes = '') {
    const icons = {
        attachment: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-paperclip ${classes}"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
        print: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-printer ${classes}"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>`,
    };
    return icons[iconName] || '';
}


async function handleOpenLoanPaymentHistoryModal(dataset = {}) {
  const loanId = dataset.id || dataset.loanId;
  if (!loanId) return;

  // Ambil data pinjaman untuk mendapatkan nama kreditur
  const loan = appState.fundingSources.find(f => f.id === loanId) || await localDB.funding_sources.get(loanId);
  const creditor = loan ? (appState.fundingCreditors.find(c => c.id === loan.creditorId) || { creditorName: 'Kreditur ?' }) : { creditorName: 'Kreditur ?' };
  const recipientName = creditor.creditorName;
  const loanDescription = loan?.description || 'Pinjaman';

  const pending = await localDB.pending_payments.where({ billId: loanId }).toArray();

  let serverPayments = [];
  try {
    const loanRef = doc(db, 'teams', TEAM_ID, 'funding_sources', loanId);
    const q = query(collection(loanRef, 'payments'), orderBy('date', 'asc'));
    const snap = await getDocs(q);
    serverPayments = snap.docs.map(d => {
      const data = d.data() || {};
      let dateVal = data.date;
      if (dateVal && typeof dateVal.toDate === 'function') dateVal = dateVal.toDate();
      return {
        id: d.id, // Ambil ID pembayaran
        amount: data.amount || 0,
        date: dateVal,
        attachmentUrl: data.attachmentUrl || null,
        _source: 'server'
      };
    });
  } catch (e) {
    // offline/permission issues: fall back to local only
    void e;
  }

  const entries = [
    ...serverPayments.map(p => ({ ...p, _source: 'server' })),
    ...pending.map(p => ({
        id: p.id || `pending-${p.createdAt}`, // Gunakan ID atau timestamp
        amount: p.amount || 0,
        date: p.date || new Date(),
        localAttachmentId: p.localAttachmentId || null, // Tambahkan localAttachmentId
        _source: 'pending'
    }))
  ].sort((a, b) => getJSDate(a.date) - getJSDate(b.date));

  const list = entries.map(p => {
    const date = getJSDate(p.date || new Date());
    const dateStr = date.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });

    let subtitle = 'Tersimpan di server';
    if (p._source === 'pending') subtitle = 'Lokal (Menunggu sinkronisasi)';

    // Siapkan data kwitansi
    const kwitansiData = {
        nomor: `KW-PAY-${(String(p.id) || '').substring(0, 8).toUpperCase()}`,
        tanggal: date.toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}),
        namaPenerima: recipientName,
        jumlah: p.amount,
        deskripsi: `Pembayaran cicilan untuk: ${loanDescription}`,
        isLunas: loan?.status === 'paid', // Cek status pinjaman
        date: date.toISOString(),
        recipient: recipientName
    };

    return `
      <div class="detail-list-item-card payment-history-item">
          <div class="item-main">
              <strong class="item-title">${dateStr}</strong>
              <span class="item-subtitle">${subtitle}</span>
          </div>
          <div class="item-secondary">
              <strong class="item-amount">${fmtIDR(p.amount || 0)}</strong>
              ${(p.attachmentUrl || p.localAttachmentId) ? `
                <button class="btn-icon" data-action="view-payment-attachment" data-url="${p.attachmentUrl || ''}" data-local-id="${p.localAttachmentId || ''}" title="Lihat Lampiran">
                    ${createIcon('attachment')}
                </button>
              ` : ''}
              <button class="btn-icon" data-action="cetak-kwitansi-pembayaran" data-kwitansi='${JSON.stringify(kwitansiData)}' title="Cetak Kwitansi">
                  ${createIcon('print')}
              </button>
          </div>
      </div>`;
  }).join('');

  const emptyStateHTML = entries.length === 0
    ? getEmptyStateHTML({ icon: 'history', title: 'Belum Ada Riwayat', desc: 'Belum ada riwayat pembayaran untuk pinjaman ini.' })
    : '';

  const content = `
      <div class="detail-list-container">
        ${list || ''}
        ${emptyStateHTML}
      </div>`;

  // PERBAIKAN: Tambahkan isUtility: true
  createModal('dataDetail', { title: 'Riwayat Pembayaran Pinjaman', content, isUtility: true });
}

export { handleOpenLoanPaymentHistoryModal };
