import { appState } from "../../../state/appState.js";
import { getJSDate } from "../../../utils/helpers.js";
import { fmtIDR } from "../../../utils/formatters.js";
// PERBAIKAN: Impor getEmptyStateHTML dari components/emptyState.js
import { getEmptyStateHTML } from "../../components/emptyState.js";
import { createModal } from "../../components/modal.js";

function handleDailyTransactionDetailsModal(date) {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const dateString = dateObj.toISOString().slice(0, 10);
  const formattedDate = dateObj.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const dailyIncomes = (appState.incomes || []).filter(i => getJSDate(i.date).toISOString().slice(0, 10) === dateString);
  const dailyExpenses = (appState.expenses || []).filter(e => getJSDate(e.date).toISOString().slice(0, 10) === dateString);

  const createListHTML = (items, type) => {
    if (items.length === 0) return '';
    const listItemsHTML = items.map(item => {
      const title = item.description || (type === 'Pemasukan' ? 'Penerimaan Termin' : 'Pengeluaran Umum');
      const amountClass = type === 'Pemasukan' ? 'positive' : 'negative';
      return `
                <div class=\"dense-list-item\">
                    <div class=\"item-main-content\">
                        <strong class=\"item-title\">${title}</strong>
                    </div>
                    <div class=\"item-actions\">
                        <strong class=\"item-amount ${amountClass}\">${fmtIDR(item.amount)}</strong>
                    </div>
                </div>
            `;
    }).join('');
    return `<h5 class=\"detail-section-title\">${type}</h5><div class=\"dense-list-container\">${listItemsHTML}</div>`;
  };

  const hasTransactions = dailyIncomes.length > 0 || dailyExpenses.length > 0;
  const emptyStateHTML = !hasTransactions ? getEmptyStateHTML({ icon: 'receipt_long', title: 'Tidak Ada Transaksi', desc: 'Tidak ada pemasukan atau pengeluaran pada tanggal ini.' }) : '';

  const modalContent = `
        <div style=\"margin-top: -1rem;\">${createListHTML(dailyIncomes, 'Pemasukan')}${createListHTML(dailyExpenses, 'Pengeluaran')}${emptyStateHTML}</div>`;

  // PERBAIKAN: Tambahkan isUtility: true
  createModal('dataDetail', { title: `Rincian Transaksi - ${formattedDate}`, content: modalContent, isUtility: true });
}

export { handleDailyTransactionDetailsModal };
