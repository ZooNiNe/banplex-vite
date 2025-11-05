import { localDB } from "../services/localDbService.js";
import { createModal, closeModal } from "../ui/components/modal.js";
import { toast } from "../ui/components/toast.js";
import { $ } from "./dom.js";
import { _enforceLocalFileStorageLimit } from "../services/fileService.js";
import { exportLocalBackup, importLocalBackup } from "../services/backupService.js";

function createIcon(iconName, size = 18, classes = '') {
    const icons = {
        save: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-save ${classes}"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
        upload: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-upload ${classes}"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>`,
        cleaning_services: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-spray-can ${classes}"><path d="M15.228 17.02c.797-.832 1.34-1.93 1.39-3.155.07-.97.19-2.083.47-3.266C17.68 7.9 18.73 6.18 19 5a2.5 2.5 0 0 0-2.5-2.5c-1.18 0-2.9 1.05-5.606 1.68-.088.016-.176.03-.265.044-.954.127-2.15.267-3.324.47-1.186.204-2.227.76-3.024 1.558C3.47 7.03 3 8.13 3 9.255c-.048 1.225.494 2.322 1.29 3.154.912.956 2.062 1.59 3.322 1.766 1.173.18 2.348.3 3.394.444.09.016.18.028.27.042 2.705.63 4.425 1.68 5.605 1.68A2.5 2.5 0 0 0 21 19c-.27-1.18-1.32-2.9-1.92-5.605a22.5 22.5 0 0 0-.47-3.266"/><path d="m14 6 1-1"/><path d="M8.5 2.76a10.4 10.4 0 0 1 2.91 1.74 5.7 5.7 0 0 1 1.74 2.91"/></svg>`, // Using SprayCan
    };
    return icons[iconName] || '';
}

async function handleOpenConflictsPanel() {
      const conflicts = await localDB.pending_conflicts.toArray();
      const itemsHTML = conflicts.length === 0?'<p class="empty-state-small">Tidak ada konflik yang tertunda.</p>' : conflicts.map(c => {
          const when = new Date(c.when || Date.now()).toLocaleString('id-ID');
          return `
              <div class="dense-list-item" data-id="${c.id}">
                  <div class="item-main-content">
                      <strong class="item-title">${c.table} / ${c.docId}</strong>
                      <span class="item-subtitle">Rev Lokal: ${c.baseRev || 0} | Rev Server: ${c.serverRev || 0} | ${when}</span>
                  </div>
                  <div class="item-actions">
                      <button class="btn btn-sm btn-primary" data-action="apply-conflict" data-conflict-id="${c.id}">Pakai Data Lokal</button>
                      <button class="btn btn-sm btn-secondary" data-action="discard-conflict" data-conflict-id="${c.id}">Pakai Data Server</button>
                  </div>
              </div>`;
      }).join('');
      const content = `<div class="dense-list-container">${itemsHTML}</div>`;
      createModal('dataDetail', {
          title: 'Konflik Sinkron',
          content
      });
  }

async function handleOpenStorageStats() {
    try {
        const files = await localDB.files.toArray();
        const counts = await getPendingSyncCounts();
        const totalBytes = files.reduce((s, f) => s + (f.size || (f.file && f.file.size) || 0), 0);
        const toMB = (b) => (b / 1024 / 1024).toFixed(2) + ' MB';
        // Pembaruan: Pindahkan tombol ke footer, hapus .storage-actions
        const statsHTML = `
            <div class="card card-pad">
                <h5>Statistik Storage Offline</h5>
                <div class="stats-grid">
                    <div><span class="label">Jumlah File</span><strong>${files.length}</strong></div>
                    <div><span class="label">Total Ukuran</span><strong>${toMB(totalBytes)}</strong></div>
                    <div><span class="label">Antrian Sync</span><strong>${counts.total} item</strong></div>
                    <div><span class="label">Konflik</span><strong>${counts.qConf}</strong></div>
                </div>
                 <input type="file" id="backup-import-input" accept="application/json" style="display:none;" />
            </div>`;
        // Pembaruan: Definisikan footer HTML secara terpisah
        const footerHTML = `
                <button class="btn btn-secondary" data-action="evict-storage">${createIcon('cleaning_services', 16)} Bersihkan</button>
                <button class="btn" data-action="export-backup">${createIcon('save', 16)} Ekspor</button>
                <button class="btn" data-action="import-backup">${createIcon('upload', 16)} Impor</button>
            `;
        // Pembaruan: Gunakan footer saat memanggil createModal
        const modal = createModal('dataDetail', { title: 'Statistik Storage', content: statsHTML, footer: footerHTML });
        if (modal) {
            // Pembaruan: Dapatkan tombol dari footer
            $('.modal-footer [data-action="evict-storage"]', modal)?.addEventListener('click', async () => {
                await _enforceLocalFileStorageLimit();
                toast('success', 'Pembersihan selesai.');
                closeModal(modal);
            });
            $('.modal-footer [data-action="export-backup"]', modal)?.addEventListener('click', async () => {
                try {
                    await exportLocalBackup();
                    toast('success', 'Backup diekspor.');
                } catch (e) {
                    console.error(e);
                    toast('error', 'Gagal mengekspor backup.');
                }
            });
            const importInput = modal.querySelector('#backup-import-input');
            $('.modal-footer [data-action="import-backup"]', modal)?.addEventListener('click', () => importInput?.click());
            importInput?.addEventListener('change', async (ev) => {
                const file = ev.target.files && ev.target.files[0];
                if (!file) return;
                try {
                    await importLocalBackup(file);
                    toast('success', 'Backup diimpor.');
                } catch (e) {
                    console.error(e);
                    toast('error', 'Gagal mengimpor backup.');
                }
            });
        }
    } catch (e) {
        console.error('Gagal membuka statistik storage:', e);
        toast('error', 'Gagal memuat statistik storage.');
    }
}

export { handleOpenConflictsPanel, handleOpenStorageStats };

async function getPendingSyncCounts() {
    const tables = ['expenses', 'bills', 'incomes', 'funding_sources', 'attendance_records', 'stock_transactions', 'comments'];
    let total = 0;
    for (const t of tables) {
        try {
            total += await localDB[t].where('syncState').anyOf('pending_create', 'pending_update', 'pending_delete').count();
        } catch (_) {}
    }
    let qConf = 0;
    try { qConf = await localDB.pending_conflicts.count(); } catch (_) {}
    try { total += await localDB.pending_payments.count(); } catch (_) {}
    return { total, qConf };
}
