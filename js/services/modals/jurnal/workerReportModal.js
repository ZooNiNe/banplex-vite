import { createModal, closeModalImmediate } from "../../../ui/components/modal.js";
import { appState } from "../../../state/appState.js";
import { createModalSelectField, initModalSelects } from "../../../ui/components/forms/index.js";
import { downloadWorkerAttendanceReport } from "../../reportService.js";
import { toast } from "../../../ui/components/toast.js";

function getDefaultDateRange() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const toIso = (date) => date.toISOString().slice(0, 10);
    return { start: toIso(firstDay), end: toIso(today) };
}

export function openWorkerReportModal() {
    const workers = (appState.workers || []).filter(w => !w.isDeleted);
    if (workers.length === 0) {
        toast('info', 'Belum ada data pekerja untuk membuat laporan.');
        return;
    }

    const workerOptions = workers.map(w => ({ value: w.id, label: w.workerName }));
    const { start, end } = getDefaultDateRange();

    const content = `
        <form id="worker-report-form">
            ${createModalSelectField({
                id: 'worker-report-worker',
                label: 'Pilih Pekerja',
                options: workerOptions,
                placeholder: 'Pilih pekerja',
                value: workerOptions[0]?.value || ''
            })}
            <div class="rekap-filters" style="margin-top:1rem;">
                <div class="form-group">
                    <label for="worker-report-start">Dari Tanggal</label>
                    <input type="date" id="worker-report-start" value="${start}">
                </div>
                <div class="form-group">
                    <label for="worker-report-end">Sampai Tanggal</label>
                    <input type="date" id="worker-report-end" value="${end}">
                </div>
            </div>
        </form>
    `;

    const footer = `
        <button type="button" class="btn btn-secondary" id="worker-report-cancel">Batal</button>
        <button type="submit" form="worker-report-form" class="btn btn-primary">Unduh PDF</button>
    `;

    const isMobile = window.matchMedia('(max-width: 599px)').matches;
    const modal = createModal(isMobile ? 'actionsPopup' : 'formView', {
        title: 'Unduh Laporan Pekerja',
        content,
        footer,
        layoutClass: isMobile ? 'is-bottom-sheet' : '',
        allowContentOverflow: true
    });
    if (!modal) return;

    initModalSelects(modal);

    const form = modal.querySelector('#worker-report-form');
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const workerId = form.querySelector('#worker-report-worker')?.value;
        const startDate = form.querySelector('#worker-report-start')?.value;
        const endDate = form.querySelector('#worker-report-end')?.value;

        if (!workerId) {
            toast('error', 'Pilih pekerja terlebih dahulu.');
            return;
        }
        if (!startDate || !endDate) {
            toast('error', 'Isi rentang tanggal laporan.');
            return;
        }

        try {
            await downloadWorkerAttendanceReport({ workerId, startDate, endDate });
            closeModalImmediate(modal);
        } catch (err) {
            console.error('Gagal mengunduh laporan pekerja:', err);
            toast('error', 'Gagal menyiapkan laporan pekerja.');
        }
    });

    modal.querySelector('#worker-report-cancel')?.addEventListener('click', () => closeModalImmediate(modal));
}
