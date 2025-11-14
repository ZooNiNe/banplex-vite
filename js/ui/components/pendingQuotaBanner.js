import { encodePayloadForDataset } from '../../services/pendingQuotaService.js';

function escapeHTML(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function buildPendingQuotaBanner(log) {
    if (!log) return '';
    const payloadAttr = log.dataPayload ? ` data-payload="${encodePayloadForDataset(log.dataPayload)}"` : '';
    const logIdAttr = log.id ? ` data-log-id="${escapeHTML(log.id)}"` : '';
    const metaAttrs = ` data-datatype="${escapeHTML(log.dataType || '')}" data-dataid="${escapeHTML(log.dataId || '')}"`;
    const message = log.message || log.action || 'Perubahan ini menunggu kuota server.';
    return `
        <div class="pending-warning-banner">
            <div class="pending-warning-text">
                <strong>Perubahan Belum Terkirim</strong>
                <p>${escapeHTML(message)}</p>
            </div>
            <div class="pending-warning-actions">
                <button type="button" class="btn btn-secondary" data-action="view-pending-data"${payloadAttr}${logIdAttr}${metaAttrs}>Lihat Data</button>
            </div>
        </div>
    `;
}
