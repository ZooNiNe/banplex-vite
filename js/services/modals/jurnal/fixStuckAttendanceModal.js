import { emit } from "../../../state/eventBus.js";
import { appState } from "../../../state/appState.js";
import { workersCol } from "../../../config/firebase.js";
import { fetchAndCacheData } from "../../data/fetch.js";
import { createMasterDataSelect } from "../../../ui/components/forms/index.js";

export async function handleFixStuckAttendanceModal() {
  await fetchAndCacheData('workers', workersCol, 'workerName');
  const workerOptions = [{ value: 'all', text: 'Semua Pekerja' },
    ...appState.workers.filter(w => w.status === 'active').map(w => ({ value: w.id, text: w.workerName }))
  ];

  const content = `
            <form id="fix-attendance-form">
                <p class="confirm-modal-text">Fitur ini akan secara paksa mereset status absensi yang 'lunas' tanpa tagihan menjadi 'belum lunas'.</p>
                <div id="worker-select-container"></div>
                <div class="rekap-filters" style="padding:0; margin-top: 1rem;">
                    <div class="form-group"><label>Dari Tanggal</label><input type="date" name="startDate" required></div>
                    <div class="form-group"><label>Sampai Tanggal</label><input type="date" name="endDate" required></div>
                </div>
            </form>
        `;

  // Pembaruan: Pindahkan tombol submit ke argumen footer
  const footer = `<button type="submit" class="btn btn-danger" form="fix-attendance-form">Jalankan Perbaikan</button>`;

  // Pembaruan: Gunakan footer saat memanggil createModal
  const modal = emit('ui.modal.create', 'dataDetail', { title: 'Perbaiki Data Absensi', content, footer });

  setTimeout(() => {
    const modalEl = document.getElementById('dataDetail-modal');
    if (!modalEl) return;

    const workerSelectContainer = modalEl.querySelector('#worker-select-container');
    if (workerSelectContainer) {
        workerSelectContainer.innerHTML = createMasterDataSelect(
            'fix-worker-id',
            'Pilih Pekerja (atau Semua)',
            workerOptions,
            'all'
        );
        emit('ui.forms.init', modalEl); // Initialize custom select
    }

    const form = modalEl.querySelector('#fix-attendance-form');

    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const workerId = e.target.elements['fix-worker-id'].value;
      let msg = 'Anda yakin ingin mereset status absensi untuk pekerja dan periode ini?';
      if (workerId === 'all') {
        msg = 'PERINGATAN: Anda akan mereset status LUNAS menjadi BELUM LUNAS untuk SEMUA pekerja pada periode ini. Lanjutkan hanya jika Anda yakin.';
      }
      emit('ui.modal.create', 'confirmUserAction', {
        message: msg,
        onConfirm: () => _forceResetAttendanceStatus(e.target)
      });
    });
  }, 100);
}
