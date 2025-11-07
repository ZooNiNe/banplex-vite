import { emit, on } from "../../../state/eventBus.js";
import { _getSkeletonLoaderHTML } from "../../components/skeleton.js";
import { getEmptyStateHTML } from "../../components/emptyState.js";
import { appState } from "../../../state/appState.js";
import { getJSDate, isViewer } from "../../../utils/helpers.js";
import { fmtIDR } from "../../../utils/formatters.js";
import { showDetailPane } from "../../components/modal.js";
import { createUnifiedCard } from "../../components/cards.js";

function createIcon(iconName, size = 18, classes = '') {
  const icons = {
      edit: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pencil ${classes}"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
      error: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle ${classes}"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
      'calendar-x-2': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar-x-2 ${classes}"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m14.5 14.5-5 5"/><path d="m9.5 14.5 5 5"/></svg>`,
  };
  return icons[iconName] || '';
}

async function handleViewWorkerRecapModal(workerId) {
    const worker = appState.workers.find(w => w.id === workerId);
    if (!worker) {
        emit('ui.toast', { args: ['error', 'Data pekerja tidak ditemukan.'] });
        return;
    }

    const pane = showDetailPane({
        title: `Rekap: ${worker.workerName}`,
        content: `<div class="skeleton-wrapper" style="padding: 1.5rem; display: flex; flex-direction: column; height: 100%;">${_getSkeletonLoaderHTML('detail-worker-recap')}</div>`,
        footer: ''
    });
    console.warn(`[DEV] salaryPaymentPanel: handleViewWorkerRecapModal loaded. Verify summary calculations if bugs are reported.`, { workerId });

    if (!pane) return;

    try {
        const records = (appState.attendanceRecords || [])
            .filter(rec => rec.workerId === workerId && !rec.isDeleted)
            .sort((a, b) => getJSDate(b.date) - getJSDate(a.date));

        const bodyContainer = pane.querySelector('.detail-pane-body, .mobile-detail-content');
        if (!bodyContainer) return;

        if (records.length === 0) {
            bodyContainer.innerHTML = `<div class="card card-pad">${getEmptyStateHTML({
                icon: 'calendar-x-2',
                title: 'Tidak Ada Absensi',
                desc: `Belum ada data absensi yang tercatat untuk ${worker.workerName}.`
            })}</div>`;
            return;
        }

        const totalUpah = records.reduce((sum, rec) => sum + (rec.totalPay || 0), 0);
        
        const totalUpahBelumLunas = records
            .filter(rec => {
                if (!rec.isPaid) {
                    return true; // Pasti belum lunas jika belum direkap
                }
                const bill = rec.billId ? appState.bills.find(b => b.id === rec.billId) : null;
                const isBillPaid = bill && bill.status === 'paid';
                
                return !isBillPaid; // Hanya tampilkan jika tagihan TIDAK lunas
            })
            .reduce((sum, rec) => sum + (rec.totalPay || 0), 0);

        const totalHari = records.reduce((sum, rec) => {
            if (rec.attendanceStatus === 'full_day') return sum + 1;
            if (rec.attendanceStatus === 'half_day') return sum + 0.5;
            return sum;
        }, 0);

        const summaryHTML = `
            <div class="detail-section">
                <div class="detail-summary-grid">
                    <div class="summary-item">
                        <span class="label">Total Hari Kerja</span>
                        <strong class="value">${totalHari} Hari</strong>
                    </div>
                    <div class="summary-item">
                        <span class="label">Total Upah (Semua)</span>
                        <strong class="value">${fmtIDR(totalUpah)}</strong>
                    </div>
                     <div class="summary-item" style="grid-column: 1 / -1;">
                        <span class="label">Total Belum Lunas</span>
                        <strong class="value negative">${fmtIDR(totalUpahBelumLunas)}</strong>
                    </div>
                </div>
            </div>`;

            const recordsHTML = records.map(rec => {
                const project = appState.projects.find(p => p.id === rec.projectId);
                let statusText = 'Absen';
                let statusColor = 'absen';
                if (rec.attendanceStatus === 'full_day') { statusText = 'Hadir'; statusColor = 'hadir'; }
                else if (rec.attendanceStatus === 'half_day') { statusText = '1/2 Hari'; statusColor = 'setengah'; }
    
                const bill = rec.billId ? appState.bills.find(b => b.id === rec.billId) : null;
                const isBillPaid = bill && bill.status === 'paid';

                const paymentStatus = isBillPaid ? 'Lunas' : 'Belum Lunas';
                const paymentColorClass = isBillPaid ? 'positive' : 'warn';
                
                const title = getJSDate(rec.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
                const description = `${project?.projectName || 'Proyek?'} · ${rec.jobRole || 'Peran?'}`;
    
                return createUnifiedCard({
                    id: `att-rec-${rec.id}`,
                    title: title,
                    headerMeta: `<span class="status-badge status-${statusColor}">${statusText}</span>`,
                    mainContentHTML: `<div class="wa-card-v2__description">${description}</div>`,
                    amount: fmtIDR(rec.totalPay || 0),
                    amountLabel: paymentStatus, // <-- Menggunakan variabel baru
                    amountColorClass: paymentColorClass, // <-- Menggunakan variabel baru
                    dataset: { itemId: rec.id },
                    moreAction: false, // <-- Tombol more dihapus
                    customClasses: isBillPaid ? 'is-paid' : 'is-unpaid' // <-- Menggunakan variabel baru
                });
            }).join('');
            
            const listHTML = `
                <div class="detail-section card card-pad" style="margin-top:1rem;">
                    <h5 class="detail-section-title" style="margin-top:0;">Riwayat Absensi</h5>
                    <div class="wa-card-list-wrapper">${recordsHTML}</div>
                </div>`;
            bodyContainer.innerHTML = `
                <div class="card card-pad" style="flex-shrink: 0;">${summaryHTML}</div>
                <div class="scrollable-content" style="padding-top: 0; flex-grow: 1; min-height: 0;">
                    ${listHTML}
                </div>
            `;
    
        } catch (error) {    
        console.error("Gagal memuat rekap pekerja:", error);
        const detailPane = document.getElementById('detail-pane');
        if (detailPane) {
            const bodyContainer = detailPane.querySelector('.detail-pane-body, .mobile-detail-content');
            if (bodyContainer) bodyContainer.innerHTML = getEmptyStateHTML({ icon: 'error', title: 'Gagal Memuat', desc: error.message });
        }
    }
}

on('ui.modal.viewWorkerRecap', handleViewWorkerRecapModal);

export { handleViewWorkerRecapModal };
