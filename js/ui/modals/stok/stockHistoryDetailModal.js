import { appState } from '../../../state/appState.js';
import { createModal } from '../../components/modal.js';
import { toast } from '../../components/toast.js';
import { getJSDate, resolveUserDisplay } from '../../../utils/helpers.js';

function formatFullDate(value) {
    const jsDate = getJSDate(value);
    if (!jsDate || Number.isNaN(jsDate.getTime())) return '-';
    try {
        return jsDate.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });
    } catch (_) {
        return jsDate.toLocaleString();
    }
}

export function openStockHistoryDetailModal(dataset = {}) {
    const transactionId = dataset.transactionId || dataset.itemId || dataset.id;
    if (!transactionId) {
        toast('error', 'Riwayat stok tidak valid.');
        return;
    }

    const tx = (appState.stockTransactions || []).find(t => t.id === transactionId);
    if (!tx) {
        toast('error', 'Riwayat stok tidak ditemukan.');
        return;
    }

    const material = (appState.materials || []).find(m => m.id === tx.materialId);
    const project = tx.projectId ? (appState.projects || []).find(p => p.id === tx.projectId) : null;
    const quantity = Number(tx.quantity || 0);
    const quantityText = quantity.toLocaleString('id-ID');
    const unit = material?.unit || '';
    const isOutgoing = tx.type === 'out';
    const statusText = isOutgoing ? 'Stok Keluar' : 'Stok Masuk';
    const recordedAtText = formatFullDate(tx.date || tx.createdAt);
    const recordedByRef = tx.createdBy || tx.recordedBy || tx.updatedBy || tx.createdByName || tx.updatedByName || '';
    const resolvedUser = recordedByRef ? resolveUserDisplay(recordedByRef) : null;
    const recordedBy = tx.createdByName || resolvedUser?.name || tx.updatedByName || 'Tidak diketahui';
    const projectName = project?.projectName || 'Tidak ada proyek';
    const titleMaterial = material?.materialName || 'Material';
    const notes = tx.notes || tx.description || '';
    const syncStatus = tx.syncState?.startsWith('pending') ? 'Menunggu Sinkronisasi' : 'Tersimpan';

    const summaryHTML = `
        <div class="detail-summary-grid">
            <div class="summary-item">
                <span class="label">Jumlah</span>
                <strong class="value">${quantityText} ${unit}</strong>
            </div>
            <div class="summary-item">
                <span class="label">Jenis</span>
                <strong class="value">${statusText}</strong>
            </div>
            <div class="summary-item">
                <span class="label">Tanggal</span>
                <strong class="value">${recordedAtText}</strong>
            </div>
        </div>`;

    const details = [
        { label: 'Material', value: titleMaterial },
        { label: 'Proyek Tujuan', value: projectName },
        { label: 'Dicatat Oleh', value: recordedBy === '-' ? 'Tidak diketahui' : recordedBy },
        { label: 'Status Sinkronisasi', value: syncStatus },
        { label: 'ID Transaksi', value: tx.id }
    ];

    const detailsHTML = `<dl class="detail-list">${details.map(item => `
        <div>
            <dt>${item.label}</dt>
            <dd>${item.value || '-'}</dd>
        </div>`).join('')}</dl>`;

    const notesHTML = notes
        ? `
            <div class="detail-section">
                <h5 class="detail-section-title">Catatan</h5>
                <p style="white-space: pre-wrap; line-height: 1.5;">${notes}</p>
            </div>`
        : '';

    const content = `
        <div class="card card-pad">
            ${summaryHTML}
            ${detailsHTML}
            ${notesHTML}
        </div>`;

    createModal('dataDetail', {
        title: `${statusText}: ${titleMaterial}`,
        content: `<div class="scrollable-content">${content}</div>`
    });
}
