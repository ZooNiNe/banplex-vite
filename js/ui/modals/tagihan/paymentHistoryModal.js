// PERBAIKAN: Impor closeModalImmediate
import { createModal, closeModalImmediate } from "../../components/modal.js";
import { localDB } from "../../../services/localDbService.js";
import { fmtIDR } from "../../../utils/formatters.js";
import { getJSDate } from "../../../utils/helpers.js";
import { TEAM_ID } from "../../../config/constants.js"
import { db, billsCol } from "../../../config/firebase.js";
import { getDocs, collection, doc, query, orderBy } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { appState } from "../../../state/appState.js";
import { emit } from "../../../state/eventBus.js";
import { getEmptyStateHTML } from "../../components/emptyState.js"; // Import getEmptyStateHTML

// Helper function to create Lucide SVG Icon
function createIcon(iconName, size = 18, classes = '') {
    const icons = {
        attachment: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-paperclip ${classes}"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
        print: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-printer ${classes}"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>`,
        delete: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2 ${classes}"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
    };
    return icons[iconName] || '';
}

// --- FUNGSI BARU DISALIN DARI salaryPaymentPanel.js ---
/**
 * Mengambil riwayat pembayaran (server & lokal) untuk billId
 */
async function getPaymentHistory(billId) {
    const pending = await localDB.pending_payments.where({ billId }).toArray();
    let serverPayments = [];
    try {
        const billRef = doc(db, 'teams', TEAM_ID, 'bills', billId); // Membutuhkan 'db' dan 'TEAM_ID'
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
// --- AKHIR FUNGSI BARU ---


async function handleOpenPaymentHistoryModal(dataset = {}) {
  const billId = dataset.id || dataset.billId;
  if (!billId) return;

  const bill = appState.bills.find(b => b.id === billId) || await localDB.bills.get(billId);
  if (!bill) return;

  const isSalaryBill = bill.type === 'gaji';
  let defaultRecipientName = 'Penerima';

  if (isSalaryBill) {
    // Logika spesifik gaji (jika perlu)
  } else if (bill.expenseId) {
      const expense = appState.expenses.find(e => e.id === bill.expenseId);
      const supplier = expense ? appState.suppliers.find(s => s.id === expense.supplierId) : null;
      defaultRecipientName = supplier?.supplierName || 'Penerima';
  }
  
  // PERBAIKAN: Memanggil fungsi getPaymentHistory yang baru ditambahkan
  const payments = await getPaymentHistory(billId); 

  const entries = payments.sort((a, b) => getJSDate(a.date) - getJSDate(b.date));

  if (bill.status === 'paid' && bill.paidAmount > 0 && entries.length === 0) {
      entries.push({
          id: `initial-${bill.id}`,
          amount: bill.amount,
          date: bill.paidAt || bill.createdAt || bill.date,
          _source: 'initial'
      });
  }

  entries.sort((a, b) => getJSDate(a.date) - getJSDate(b.date));


  const recipientName = (() => {
    if (!bill) return '-';
    if (bill.type === 'gaji') {
      if (bill.workerDetails && bill.workerDetails.length === 1) return bill.workerDetails[0].name;
      if (bill.workerDetails && bill.workerDetails.length > 1) return 'Beberapa Pekerja';
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

  function formatFullTimestamp(d) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mmm = d.toLocaleString('id-ID', { month: 'short' });
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${dd}/${mmm}/${yyyy} ${hh}:${mm}:${ss}`;
  }

  const list = entries.map(p => {
    const date = getJSDate(p.date || new Date());
    const titleStr = formatFullTimestamp(date);

    let subtitle = 'Tersimpan di server';
    if (p._source === 'pending') subtitle = 'Lokal (Menunggu sinkronisasi)';
    else if (p._source === 'initial') subtitle = 'Pembayaran awal (Lunas)';

    let recipientName = defaultRecipientName;
    let description = bill?.description || 'Tagihan';
    let action = 'cetak-kwitansi-pembayaran'; // Default action
    let kwitansiDataset = `data-bill-id="${bill.id}"`;

    if (isSalaryBill) {
        if (p.workerId && p.workerName) {
            recipientName = p.workerName;
            description = `Pembayaran Gaji: ${p.workerName}`;
            action = 'cetak-kwitansi-individu';
            kwitansiDataset = `data-bill-id="${bill.id}" data-worker-id="${p.workerId}"`;
        } else {
            recipientName = "Pembayaran Kolektif";
            description = `Pembayaran ${bill.description}`;
            action = 'cetak-kwitansi-kolektif'; // Tombol ini akan cetak SEMUA
            kwitansiDataset = `data-bill-id="${bill.id}"`;
        }
    }

    const kwitansiData = {
        nomor: `KW-PAY-${(String(p.id)||'').substring(0,8).toUpperCase()}`,
        tanggal: getJSDate(p.date).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}),
        namaPenerima: recipientName,
        jumlah: p.amount,
        deskripsi: description,
        isLunas: bill?.status === 'paid',
        date: getJSDate(p.date).toISOString(),
        recipient: recipientName
    };

    return `
      <div class="detail-list-item-card payment-history-item">
          <div class="item-main">
              <strong class="item-title">${titleStr}</strong>
              <span class="item-subtitle">${subtitle}</span>
          </div>
          <div class="item-secondary">
              <strong class="item-amount">${fmtIDR(p.amount || 0)}</strong>
              <div class="item-actions">
                ${(p.attachmentUrl || p.localAttachmentId) ? `
                  <button class="btn-icon" data-action="view-payment-attachment" data-url="${p.attachmentUrl || ''}" data-local-id="${p.localAttachmentId || ''}" title="Lihat Lampiran">
                      ${createIcon('attachment')}
                  </button>
                ` : ''}
                <button class="btn-icon btn-icon-danger" data-action="delete-payment" data-bill-id="${bill.id}" ${p._source === 'pending' ? `data-pending-id="${p.id}" data-source="pending"` : `data-payment-id="${p.id}" data-source="server"`} data-amount="${p.amount || 0}" title="Hapus Pembayaran">
                    ${createIcon('delete')}
                </button>
                <button class="btn-icon" data-action="${action}" data-kwitansi='${JSON.stringify(kwitansiData)}' ${kwitansiDataset} title="Cetak Kwitansi">
                    ${createIcon('print')}
                </button>
              </div>
          </div>
      </div>`;
  }).join('');
  
  // PENYESUAIAN: Cek jika ada pembayaran, bukan hanya jika itu tagihan gaji
  const hasAnyPayment = entries.length > 0;
  
  const footerHTML = (isSalaryBill && hasAnyPayment) ? `
    <div class="modal-footer">
        <button class="btn btn-secondary" data-action="cetak-kwitansi-kolektif" data-bill-id="${bill.id}">
            ${createIcon('printer', 18)} Cetak Semua Kwitansi
        </button>
    </div>
  ` : '';
  
  const emptyStateHTML = entries.length === 0
    ? getEmptyStateHTML({ icon: 'history', title: 'Belum Ada Riwayat', desc: 'Belum ada riwayat pembayaran untuk tagihan ini.' })
    : '';

  const content = `
      <div class="detail-list-container">
        ${list || ''}
        ${emptyStateHTML}
      </div>`;

  // Tampilkan sebagai bottom sheet di mobile; dialog standar di desktop
  const isMobile = window.matchMedia('(max-width: 599px)').matches;
  const modalType = isMobile ? 'dataBottomSheet' : 'dataDetail';
  createModal(modalType, { title: 'Riwayat Pembayaran', content: content, footer: footerHTML, replace: true, isUtility: true });
}

export { handleOpenPaymentHistoryModal };
