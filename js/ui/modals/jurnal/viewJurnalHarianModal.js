import { emit, on } from "../../../state/eventBus.js";
import { _getSkeletonLoaderHTML } from "../../components/skeleton.js";
import { getEmptyStateHTML } from "../../components/emptyState.js";
import { appState } from "../../../state/appState.js";
import { getJSDate, isViewer, parseLocalDate, getLocalDayBounds } from "../../../utils/helpers.js"; 
import { fmtIDR } from "../../../utils/formatters.js";
import { showDetailPane } from "../../components/modal.js";
import { createUnifiedCard } from "../../components/cards.js";

function createIcon(iconName, size = 18, classes = '') {
  const icons = {
      edit: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pencil ${classes}"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
      error: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle ${classes}"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
      'calendar-x-2': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar-x-2 ${classes}"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m14.5 14.5-5 5"/><path d="m9.5 14.5 5 5"/></svg>`,
      save: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-save ${classes}"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
  };
  return icons[iconName] || '';
}

async function handleViewJurnalHarianModal(dateStr) {
  const date = parseLocalDate(dateStr);
  const formattedDate = date.toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long' 
  });

  const pane = showDetailPane({
    title: `Jurnal: ${formattedDate}`,
    content: `<div class="card card-pad">${_getSkeletonLoaderHTML('jurnal')}</div>`,
    footer: ''
  });

  if (!pane) return;

  try {
    const { startOfDay, endOfDay } = getLocalDayBounds(dateStr);

    const recordsOnDate = (appState.attendanceRecords || []).filter(rec => {
      const recDate = getJSDate(rec.date);
      return recDate >= startOfDay && recDate <= endOfDay && !rec.isDeleted;
    });

    const bodyContainer = pane.querySelector('.detail-pane-body, .mobile-detail-content');
    if (!bodyContainer) return;

    if (recordsOnDate.length === 0) {
      bodyContainer.innerHTML = `<div class="card card-pad">${getEmptyStateHTML({
        icon: 'calendar-x-2',
        title: 'Tidak Ada Absensi',
        desc: 'Tidak ada data absensi yang tercatat pada tanggal ini.'
      })}</div>`;
      return;
    }

    const productiveRecords = recordsOnDate.filter(r => r.attendanceStatus !== 'absent');
    const unpaidRecordsOnDate = productiveRecords.filter(r => !r.isPaid && r.totalPay > 0);
    const hasUnpaid = unpaidRecordsOnDate.length > 0;
    const totalUnpaid = unpaidRecordsOnDate.reduce((sum, r) => sum + (r.totalPay || 0), 0);
    
    const totalUpah = productiveRecords.reduce((sum, rec) => sum + (rec.totalPay || 0), 0);
    const workerCount = new Set(productiveRecords.map(r => r.workerId)).size;

    const summaryHTML = `
                <div class="detail-section">
                    <div class="detail-summary-grid">
                        <div class="summary-item">
                            <span class="label">Total Pekerja Hadir</span>
                            <strong class="value">${workerCount} Orang</strong>
                        </div>
                        <div class="summary-item">
                            <span class="label">Total Beban Upah</span>
                            <strong class="value negative">${fmtIDR(totalUpah)}</strong>
                        </div>
                    </div>
                </div>`;

      const workersByProject = productiveRecords
          .filter(rec => rec.projectId)
          .reduce((acc, rec) => {
            const projectId = rec.projectId;
            if (!acc[projectId]) acc[projectId] = [];
            acc[projectId].push(rec);
            return acc;
          }, {});

      const projectSectionsHTMLArray = Object.entries(workersByProject).map(([projectId, records]) => {
        const projectName = appState.projects.find(p => p.id === projectId)?.projectName || 'Proyek Tidak Diketahui';
        
        const workersHTML = records
          .sort((a, b) => (a.workerName || '').localeCompare(b.workerName || ''))
          .map(rec => {
              let statusText = 'Absen';
              let statusColor = 'absen';
              if (rec.attendanceStatus === 'full_day') { statusText = 'Hadir'; statusColor = 'hadir'; }
              else if (rec.attendanceStatus === 'half_day') { statusText = '1/2 Hari'; statusColor = 'setengah'; }

              const paymentStatus = rec.isPaid ? 'Lunas' : 'Belum Lunas';
              const paymentColorClass = rec.isPaid ? 'positive' : 'warn';

              return createUnifiedCard({
                  id: `att-${rec.id}`,
                  title: rec.workerName || 'Pekerja Dihapus',
                  headerMeta: `<span class="status-badge status-${statusColor}">${statusText}</span>`,
                  mainContentHTML: `<div class="wa-card-v2__description">${rec.jobRole || 'Peran?'}</div>`,
                  amount: fmtIDR(rec.totalPay || 0),
                  amountLabel: paymentStatus,
                  amountColorClass: paymentColorClass,
                  dataset: { itemId: rec.id },
                  moreAction: false,
                  customClasses: rec.isPaid ? 'is-paid' : 'is-unpaid'
              });
          }).join('');

        return `
            <div class="detail-section card card-pad" style="margin-top: 1rem;">
                <h5 class="detail-section-title" style="margin-top:0;">${projectName}</h5>
                <div class="wa-card-list-wrapper">${workersHTML}</div>
            </div>`;
      });
      
      const finalProjectHTML = projectSectionsHTMLArray.length > 0 
          ? projectSectionsHTMLArray.join('')
          : `<div class="card card-pad" style="margin-top: 1rem;">${getEmptyStateHTML({
                icon: 'calendar-x-2',
                title: 'Tidak Ada Absensi Produktif',
                desc: 'Semua pekerja yang tercatat ditandai sebagai "Absen".'
            })}</div>`;

      bodyContainer.innerHTML = `
          <div class="card card-pad" style="flex-shrink: 0;">${summaryHTML}</div>
          <div class="scrollable-content" style="padding-top: 0; flex-grow: 1; min-height: 0;">
              ${finalProjectHTML}
          </div>
      `;

      const footer = hasUnpaid && !isViewer() ? `
          <div class="form-footer-actions">
              <button type="button" class="btn btn-primary" id="buat-tagihan-harian-btn" data-date="${dateStr}">
                  ${createIcon('save')} Jadikan Tagihan (${fmtIDR(totalUnpaid)})
              </button>
          </div>
      ` : '';
      
      if (footer) {
          pane.insertAdjacentHTML('beforeend', `<div class="detail-pane-footer">${footer}</div>`);
          pane.querySelector('#buat-tagihan-harian-btn')?.addEventListener('click', (e) => {
              const date = e.currentTarget.dataset.date;
              emit('jurnal.generateDailyBill', { date, records: unpaidRecordsOnDate });
          });
      }

    } catch (error) {
        console.error("Gagal memuat detail jurnal harian:", error);
        const detailPane = document.getElementById('detail-pane');
        if (detailPane) {
            const bodyContainer = detailPane.querySelector('.detail-pane-body, .mobile-detail-content');
            if (bodyContainer) bodyContainer.innerHTML = getEmptyStateHTML({ icon: 'error', title: 'Gagal Memuat', desc: error.message });
        }
    }
}

on('ui.modal.viewJurnalHarian', handleViewJurnalHarianModal);

export { handleViewJurnalHarianModal };
