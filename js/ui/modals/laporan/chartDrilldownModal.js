import { emit } from "../../../state/eventBus.js";
import { appState } from "../../../state/appState.js";
import { fmtIDR } from "../../../utils/formatters.js";
import { getJSDate } from "../../../utils/helpers.js";
import { getEmptyStateHTML } from "../../components/emptyState.js";

function showChartDrilldownModal(context) {
    const { title, type, category } = context;

    const { start, end } = appState.reportFilter || {};
    const inRange = (d) => {
        const dt = getJSDate(d);
        if (start && dt < new Date(start + 'T00:00:00')) return false;
        if (end && dt > new Date(end + 'T23:59:59')) return false;
        return true;
    };

    let items = [];
    if (type === 'income') {
        items = (appState.incomes || []).filter(inc => !inc.isDeleted && inRange(inc.date));
    } else if (type === 'expense') {
        items = (appState.expenses || []).filter(exp => !exp.isDeleted && inRange(exp.date));
        if (category) {
            items = items.filter(exp => exp.type === category || exp.category === category);
        }
    }

    if (items.length === 0) {
         emit('ui.modal.create', 'dataDetail', {
            title: `Rincian: ${title}`,
            content: getEmptyStateHTML({ icon: 'receipt_long', title: 'Tidak Ada Data', desc: 'Tidak ada transaksi untuk kategori dan periode ini.' })
        });
        return;
    }

    items.sort((a, b) => getJSDate(b.date) - getJSDate(a.date));

    const listHTML = items.map(item => {
        const itemDate = getJSDate(item.date).toLocaleDateString('id-ID');
        const itemAmount = item.amount || item.totalAmount || 0;
        const itemDesc = item.description || (type === 'income' ? 'Pemasukan' : 'Pengeluaran');
        const amountClass = type === 'income' ? 'positive' : 'negative';

        return `
            <div class="dense-list-item">
                <div class="item-main-content">
                    <strong class="item-title">${itemDesc}</strong>
                    <span class="item-subtitle">${itemDate}</span>
                </div>
                <div class="item-actions">
                    <strong class="item-amount ${amountClass}">${fmtIDR(itemAmount)}</strong>
                </div>
            </div>
        `;
    }).join('');

    const content = `<div class="dense-list-container">${listHTML}</div>`;

    emit('ui.modal.create', 'dataDetail', {
        title: `Rincian: ${title}`,
        content: content
    });
}

export { showChartDrilldownModal };
