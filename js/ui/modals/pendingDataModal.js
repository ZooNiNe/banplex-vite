import { createModal } from '../components/modal.js';

function escapeHTML(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatPayload(payload) {
    if (payload === null || payload === undefined) return 'Tidak ada data.';
    if (typeof payload === 'string') {
        return escapeHTML(payload);
    }
    try {
        return escapeHTML(JSON.stringify(payload, null, 2));
    } catch (_) {
        return escapeHTML(String(payload));
    }
}

export function showPendingDataModal({ payload, title = 'Data Pending', meta = {} } = {}) {
    const details = [];
    if (meta.dataType) details.push(`<li><strong>Tipe:</strong> ${escapeHTML(meta.dataType)}</li>`);
    if (meta.dataId) details.push(`<li><strong>ID:</strong> ${escapeHTML(meta.dataId)}</li>`);
    const content = `
        <div class="pending-data-modal">
            ${details.length ? `<ul class="pending-data-meta">${details.join('')}</ul>` : ''}
            <pre class="pending-data-pre">${formatPayload(payload)}</pre>
        </div>
    `;
    createModal('dataDetail', {
        title,
        content,
        isUtility: true
    });
}
