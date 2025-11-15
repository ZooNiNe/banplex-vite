import { createModal, closeModalImmediate } from "../../../ui/components/modal.js";

const SESSION_KEY = 'attendance.guidance.dismissed';

export function openAttendanceGuidanceModal() {
    try {
        if (sessionStorage.getItem(SESSION_KEY) === '1') return;
    } catch (_) {}

    const content = `
        <div class="welcome-hero-content" style="text-align:left;">
            <h3 style="margin-bottom:0.5rem;">Penting: Cara Mengedit Absensi yang Sudah Direkap</h3>
            <p style="margin:0 0 1rem 0; line-height:1.55;">
                Untuk mengedit data absensi yang sudah masuk ke dalam rekap gaji (invoice), Anda <strong>HARUS</strong> menghapus data rekap gaji tersebut secara permanen di halaman <strong>Tagihan</strong> terlebih dahulu. Ini akan membuka kunci absensi agar dapat diedit dengan aman.
            </p>
            <label style="display:flex; align-items:center; gap:0.5rem; font-weight:500;">
                <input type="checkbox" id="attendance-guidance-hide" />
                Jangan tampilkan lagi di sesi ini
            </label>
        </div>
    `;

    const footer = `
        <button type="button" class="btn btn-primary" id="attendance-guidance-confirm">Mengerti</button>
    `;

    const modal = createModal('welcomeModal', {
        title: 'Panduan Edit Absensi',
        content,
        footer,
        isUtility: true
    });
    if (!modal) return;

    modal.querySelector('#attendance-guidance-confirm')?.addEventListener('click', () => {
        const dontShow = modal.querySelector('#attendance-guidance-hide')?.checked;
        if (dontShow) {
            try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (_) {}
        }
        closeModalImmediate(modal);
    });
}
