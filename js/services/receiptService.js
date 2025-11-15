/* global jsPDF, html2canvas */
import { emit, on } from "../state/eventBus.js";
import { appState } from "../state/appState.js";
import { TEAM_ID } from "../config/constants.js";
import { db, billsCol } from "../config/firebase.js";
import { getDocs, collection, doc, query, orderBy } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { toast } from "../ui/components/toast.js";
import { startGlobalLoading } from "../ui/components/modal.js";
import { getJSDate } from "../utils/helpers.js";
import { _terbilang, fmtIDR as fmtIDRFormat } from "../utils/formatters.js";
import { localDB } from "./localDbService.js";
import { createModal, closeModal } from '../ui/components/modal.js';

let __pdfLibsReady;
async function __ensurePdfLibs() {
    if (window.jspdf && window.jspdf.jsPDF && window.html2canvas) return;
    if (!__pdfLibsReady) {
        __pdfLibsReady = (async () => {
            const add = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = true; s.crossOrigin = 'anonymous'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
            try {
                await add('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
                await add('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
                await add('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js');
            } catch (e) { console.warn('Failed loading PDF libs', e); }
        })();
    }
    await __pdfLibsReady;
}
function createIcon(iconName, size = 18, classes = '') {
    const icons = {
        image: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image ${classes}"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
        'file-type-pdf': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-type-pdf ${classes}"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M10 12h1v4h-1"/><path d="M13 16h-1.5a1.5 1.5 0 0 1 0-3H13v3Z"/><path d="M17 16h-1.5a1.5 1.5 0 0 1 0-3H17v3Z"/><path d="M9.5 10.5A1.5 1.5 0 0 1 11 12v1a1.5 1.5 0 0 1-3 0v-1a1.5 1.5 0 0 1 1.5-1.5Z"/></svg>`,
        share: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-share-2 ${classes}"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>`,
        content_copy: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy ${classes}"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
        download: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download ${classes}"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
    };
    return icons[iconName] || '';
}
async function _loadPdfAssetDataUrl(path) {
    try {
        const key = `_pdfAsset_${path}`;
        if (appState[key]) return appState[key];

        const tryPaths = [`./public/${path}`, `/public/${path}`, path];
        let res;
        for (const p of tryPaths) {
            try {
                res = await fetch(p, { cache: 'force-cache' });
                if (res && res.ok) break;
            } catch(_){}
        }
        if (!res || !res.ok) return null;

        const blob = await res.blob();
        const dataUrl = await new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.onerror = reject;
            fr.readAsDataURL(blob);
        });

        appState[key] = dataUrl;
        return dataUrl;
    } catch (_) {
        return null;
    }
}


export async function getKwitansiUniversalHTML(data = {}) {
    const {
        nomor = `INV-${Date.now()}`,
        tanggal = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
        namaPenerima = 'Penerima Tidak Dikenal',
        jumlah = 0,
        deskripsi = 'Pembayaran tagihan/lainnya',
        isLunas = false,
    } = data;

    const namaPencetak = appState.currentUser?.displayName || 'Pengguna';
    const emailPencetak = appState.currentUser?.email || '';
    const terbilangText = _terbilang(jumlah);
    const formattedJumlah = fmtIDRFormat(jumlah);
    const headerLogoUrl = await _loadPdfAssetDataUrl('logo-header-pdf.png');
    const footerLogoUrl = await _loadPdfAssetDataUrl('logo-footer-pdf.png');

    const qrisHTML = emailPencetak ? `<img src="https://api.qrserver.com/v1/create-qr-code/?size=60x60&data=${encodeURIComponent(emailPencetak)}" alt="QR Code" class="signature-qr">` : '';
    const title = isLunas ? 'TANDA TERIMA PELUNASAN' : 'TANDA TERIMA PEMBAYARAN';
    const statusClass = isLunas ? 'paid' : 'unpaid';

    return `
    <div class="invoice-container kwitansi-container">
      <header class="invoice-header">
        <div class="company-info">
            ${headerLogoUrl ? `<img src="${headerLogoUrl}" alt="Company Logo" class="company-logo">` : ''}
        </div>
        <div class="invoice-details">
            <h1 class="invoice-title">${title}</h1>
            <p><strong>No. Kwitansi:</strong> ${nomor}</p>
            <p><strong>Tanggal:</strong> ${tanggal}</p>
        </div>
      </header>
      <main class="invoice-body">
        <section class="recipient-info">
          <p class="section-label">DIBAYARKAN KEPADA:</p>
          <p class="recipient-name">${namaPenerima}</p>
        </section>
        <section class="payment-details">
          <table>
            <thead><tr><th>Deskripsi Pembayaran</th><th style="text-align: right;">Jumlah</th></tr></thead>
            <tbody><tr><td>${deskripsi}</td><td style="text-align: right;">${formattedJumlah}</td></tr></tbody>
          </table>
        </section>
        <section class="terbilang-info">
          <p><strong>TERBILANG:</strong> "${terbilangText.trim().toUpperCase()} RUPIAH"</p>
        </section>
      </main>
      <footer class="invoice-footer">
        <div class="status-footer">
            <div class="status-stamp-container">
                <span class="status-badge ${statusClass}">${isLunas ? 'LUNAS' : 'BELUM LUNAS'}</span>
            </div>
            ${footerLogoUrl ? `<img src="${footerLogoUrl}" alt="Footer Logo" class="footer-logo">` : ''}
        </div>
        <div class="signature-area">
            <p>Cijiwa, ${tanggal}</p>
            <p class="signature-title">Hormat Kami,</p>
            <div class="signature-box">
                <div class="signature-space">
                    ${qrisHTML}
                </div>
                <p class="signature-name">${namaPencetak}</p>
            </div>
        </div>
      </footer>
    </div>`;
}

// Helper function to handle download confirmation and modal closing
function handleDownloadConfirmation(downloader, data, actionType, previewModal) {
    createModal('confirmUserAction', {
        title: 'Konfirmasi Unduh',
        message: `Anda akan mengunduh kwitansi sebagai ${actionType === 'kwitansi-download-image' ? 'gambar (JPG)' : 'dokumen (PDF)'}. Lanjutkan?`,
        onConfirm: async () => {
            await downloader(data);
            if (previewModal) {
                closeModal(previewModal); // Tutup modal preview setelah unduh
            }
        }
    });
}

export async function downloadUniversalKwitansiAsPDF(data = {}) {
    const loader = startGlobalLoading('Membuat PDF Kwitansi...');
    try {
        await __ensurePdfLibs();
        const { jsPDF } = window.jspdf || {};
        if (!jsPDF || !window.html2canvas) { toast('error', 'Library PDF belum siap.'); return; }
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.width = '105mm';
        container.style.height = '148mm';
        container.style.padding = '10mm';
        container.style.boxSizing = 'border-box';
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';
        container.style.backgroundColor = '#ffffff';
        container.innerHTML = await getKwitansiUniversalHTML(data);
        document.body.appendChild(container);

        const canvas = await window.html2canvas(container, { scale: 3, useCORS: true });

        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a6' });
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();

        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pdfWidth, pdfHeight);

        document.body.removeChild(container);

        const dt = data.date ? getJSDate(data.date) : new Date();
        const recipient = data.recipient || data.namaPenerima || '-';
        const fileName = `${data.isLunas ? 'Kwitansi-Lunas' : 'Tanda-Terima'}-${recipient.replace(/\s+/g, '-')}-${dt.toISOString().slice(0,10)}.pdf`;
        pdf.save(fileName);
        toast('success', 'PDF Kwitansi berhasil dibuat!');
    } catch (err) {
        console.error('Gagal membuat PDF universal:', err);
        toast('error', 'Gagal membuat PDF.');
    } finally {
        loader.close();
    }
}


export async function downloadUniversalKwitansiAsImage(data = {}) {
    const loader = startGlobalLoading('Membuat gambar kwitansi...');
    try {
        await __ensurePdfLibs();
        const html2canvas = window.html2canvas;
        if (!html2canvas) { toast('error', 'Library Canvas belum siap.'); return; }

        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.width = '105mm';
        container.style.padding = '10mm';
        container.style.boxSizing = 'border-box';
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';
        container.style.backgroundColor = '#ffffff';
        container.innerHTML = await getKwitansiUniversalHTML(data);
        document.body.appendChild(container);

        const canvas = await html2canvas(container, { scale: 3, useCORS: true });
        document.body.removeChild(container);

        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/jpeg', 0.95);

        const dt = data.date ? getJSDate(data.date) : new Date();
        const recipient = data.recipient || data.namaPenerima || '-';
        link.download = `${data.isLunas ? 'Kwitansi-Lunas' : 'Tanda-Terima'}-${recipient.replace(/\s+/g, '-')}-${dt.toISOString().slice(0,10)}.jpg`;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast('success', 'Gambar kwitansi berhasil diunduh!');
    } catch (err) {
        console.error('Gagal render gambar universal:', err);
        toast('error', 'Gagal membuat gambar.');
    } finally {
        loader.close();
    }
}

// Modifikasi event listener untuk kwitansi
on('ui.modal.showKwitansiPayment', async (kwitansiData = {}) => {
    try {
      // PERBAIKAN: Stringify data kwitansi untuk atribut data-*
      const kwitansiDataString = JSON.stringify(kwitansiData).replace(/"/g, '&quot;'); // Escape quotes for HTML attribute

      const content = `
        <div id="kwitansi-printable-area" style="position: relative;">
          ${await getKwitansiUniversalHTML(kwitansiData)}
          <div class="kwitansi-actions" aria-label="Kwitansi Actions">
            <button class="btn-icon" data-action="kwitansi-download-image" data-kwitansi="${kwitansiDataString}" title="Unduh Gambar">${createIcon('image')}</button>
            <button class="btn-icon" data-action="kwitansi-download-pdf" data-kwitansi="${kwitansiDataString}" title="Unduh PDF">${createIcon('file-type-pdf')}</button>
          </div>
        </div>`;
      const modal = createModal('dataDetail', { title: 'Pratinjau Kwitansi', content, replace: true });

      // Hapus listener lama jika ada (pencegahan)
      const existingListener = modal.__kwitansiClickListener;
      if (existingListener) {
          modal.removeEventListener('click', existingListener);
      }

      // Definisikan listener baru
      const onClick = (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;

        // Ambil data dari tombol yang diklik (sekarang seharusnya ada)
        const currentKwitansiDataString = btn.dataset.kwitansi;

        // Cek lagi sebelum parse (sebagai failsafe tambahan)
        if (typeof currentKwitansiDataString === 'string' && currentKwitansiDataString.trim() !== '') {
            try {
                // Parse data dari tombol
                const currentKwitansiData = JSON.parse(currentKwitansiDataString.replace(/&quot;/g, '"'));

                // Gunakan helper untuk konfirmasi dan close modal
                if (action === 'kwitansi-download-image') {
                    handleDownloadConfirmation(downloadUniversalKwitansiAsImage, currentKwitansiData, action, modal);
                }
                if (action === 'kwitansi-download-pdf') {
                    handleDownloadConfirmation(downloadUniversalKwitansiAsPDF, currentKwitansiData, action, modal);
                }
            } catch (parseError) {
                 console.error("Gagal parse data kwitansi dari tombol:", parseError, currentKwitansiDataString);
                 toast('error', 'Gagal memproses data kwitansi dari tombol.');
            }
        } else {
             console.error("Data kwitansi tidak ditemukan pada tombol:", btn);
             toast('error', 'Data kwitansi tidak ditemukan pada tombol.');
        }
      };

      // Tambahkan listener baru dan simpan referensinya
      modal.addEventListener('click', onClick);
      modal.__kwitansiClickListener = onClick; // Simpan referensi

    } catch (err) { // Tangani error saat membuat modal
        console.error("Gagal menampilkan modal kwitansi:", err);
        toast('error', 'Gagal menampilkan pratinjau kwitansi.');
    }
});

export async function openShareModal(elementSelector, shareData) {
    const loader = startGlobalLoading('Mempersiapkan pratinjau untuk dibagikan...');
    try {
        await __ensurePdfLibs();
        const html2canvas = window.html2canvas;
        const elementToCapture = document.querySelector(elementSelector);

        if (!html2canvas || !elementToCapture) {
            throw new Error('Elemen untuk dibagikan tidak ditemukan.');
        }

        const canvas = await html2canvas(elementToCapture, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
        const imageUrl = canvas.toDataURL('image/png');

        const content = `
            <div class="share-modal-content">
                <img src="${imageUrl}" alt="Pratinjau" class="share-preview-image">
                <div class="form-group">
                    <label>Teks untuk dibagikan:</label>
                    <textarea class="share-text-template" rows="4">${shareData.text}</textarea>
                </div>
                <div class="share-actions">
                    <button class="btn btn-secondary" data-action="native-share">${createIcon('share')}Bagikan</button>
                    <button class="btn btn-secondary" data-action="copy-text">${createIcon('content_copy')}Salin Teks</button>
                    <button class="btn btn-secondary" data-action="download-image">${createIcon('download')}Unduh Gambar</button>
                </div>
            </div>
        `;

        const modal = createModal('dataDetail', { title: 'Bagikan Data', content });

        modal.querySelector('.share-actions').addEventListener('click', async (e) => {
            const actionBtn = e.target.closest('button');
            if (!actionBtn) return;

            const action = actionBtn.dataset.action;
            const text = modal.querySelector('textarea').value;

            if (action === 'native-share') {
                try {
                    const blob = await (await fetch(imageUrl)).blob();
                    const file = new File([blob], 'pratinjau-data.png', { type: 'image/png' });

                    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            files: [file],
                            title: shareData.title,
                            text: text,
                        });
                    } else {
                        toast('info', 'Fitur bagikan file tidak didukung di browser ini.');
                    }
                } catch (error) {
                    if (error.name !== 'AbortError') {
                        toast('error', 'Gagal membagikan file.');
                    }
                }
            } else if (action === 'download-image') {
                const link = document.createElement('a');
                link.href = imageUrl;
                link.download = 'pratinjau-data.png';
                link.click();
            } else if (action === 'copy-text') {
                navigator.clipboard.writeText(text).then(() => {
                    toast('success', 'Teks berhasil disalin!');
                }).catch(() => {
                    toast('error', 'Gagal menyalin teks.');
                });
            }
        });

        loader.close();
    } catch (error) {
        console.error('Gagal membuat modal bagikan:', error);
        toast('error', 'Gagal mempersiapkan pratinjau. Kesalahan: ' + error.message);
        loader.close();
    }
}

export async function shareElementAsImage(elementSelector, shareData) {
    try {
        await __ensurePdfLibs();
        const html2canvas = window.html2canvas;
        const elementToCapture = document.querySelector(elementSelector);

        if (!html2canvas || !elementToCapture) {
            throw new Error('Elemen untuk dibagikan tidak ditemukan.');
        }

        const canvas = await html2canvas(elementToCapture, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const file = new File([blob], 'kwitansi.png', { type: 'image/png' });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: shareData.title,
                text: shareData.text,
            });
        } else {
            toast('info', 'Fitur bagikan file tidak didukung di browser ini.');
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Gagal membagikan elemen:', error);
            toast('error', 'Gagal membagikan. Kesalahan: ' + error.message);
        }
    }
}


async function downloadKolektifKwitansiAsPDF({ allKwitansiData, bill }) {
    const loader = startGlobalLoading(`Membuat PDF Kolektif (${allKwitansiData.length} kwitansi)...`);
    try {
        await __ensurePdfLibs();
        const { jsPDF } = window.jspdf || {};
        if (!jsPDF || !window.html2canvas) {
            toast('error', 'Library PDF belum siap.');
            return;
        }

        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a6' });

        for (let i = 0; i < allKwitansiData.length; i++) {
            const kwitansiData = allKwitansiData[i];

            const container = document.createElement('div');
            container.style.position = 'fixed';
            container.style.left = '-9999px';
            container.style.width = '105mm';
            container.style.padding = '10mm';
            container.style.boxSizing = 'border-box';
            container.style.display = 'flex';
            container.style.alignItems = 'center';
            container.style.justifyContent = 'center';
            container.style.backgroundColor = '#ffffff';
            container.innerHTML = await getKwitansiUniversalHTML(kwitansiData);
            document.body.appendChild(container);

            const canvas = await window.html2canvas(container, { scale: 3, useCORS: true });

            if (i > 0) {
                pdf.addPage();
            }

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();

            pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pdfWidth, pdfHeight);

            document.body.removeChild(container);
        }

        const fileName = `Kwitansi-Kolektif-${bill.description.replace(/\s+/g, '-')}.pdf`;
        pdf.save(fileName);
        toast('success', 'PDF Kolektif berhasil dibuat!');

    } catch (err) {
        console.error('Gagal membuat PDF Kolektif:', err);
        toast('error', 'Gagal membuat PDF kolektif.');
    } finally {
        loader.close();
    }
}

export async function handleCetakKwitansi(billId) {
    const loader = startGlobalLoading('Mempersiapkan kwitansi...');
    try {
        const bill = appState.bills.find(b => b.id === billId);
        if (!bill) {
            toast('error', 'Data tagihan tidak ditemukan.');
            return;
        }
    let recipientName = 'Penerima Tidak Dikenal'; // Default fallback
    if (bill.type === 'gaji') {
        if (bill.workerDetails && bill.workerDetails.length === 1) {
            recipientName = bill.workerDetails[0].name;
        } else if (bill.workerDetails && bill.workerDetails.length > 1) {
            recipientName = "Beberapa Pekerja";
        } else {
            // Fallback cari di appState.workers jika workerDetails tidak ada (data lama?)
            const worker = appState.workers.find(w => w.id === bill.workerId);
            recipientName = worker?.workerName || 'Pekerja (Data Lama)';
        }
    } else if (bill.expenseId) {
        // Coba cari expense di appState dulu
        const expense = appState.expenses.find(e => e.id === bill.expenseId);
        // Jika expense ditemukan, cari supplier
        if (expense) {
            const supplier = appState.suppliers.find(s => s.id === expense.supplierId);
            if (supplier && supplier.supplierName) {
                recipientName = supplier.supplierName;
            } else {
                recipientName = 'Supplier Tidak Ditemukan'; // Fallback jika supplier tidak ada
            }
        } else {
             recipientName = 'Data Pengeluaran Tidak Ditemukan'; // Fallback jika expense tidak ada
        }
    } else {
        recipientName = 'Penerima Umum'; // Fallback jika tidak ada expenseId (seharusnya tidak terjadi untuk non-gaji)
    }


    const __paidAtDate = bill.paidAt ? getJSDate(bill.paidAt) : new Date();
    const kwitansiData = {
        nomor: `KW-${bill.id.substring(0, 5).toUpperCase()}`,
        tanggal: __paidAtDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
        namaPenerima: recipientName, // Gunakan recipientName yang sudah diperbaiki
        jumlah: bill.amount,
        deskripsi: bill.description,
        isLunas: (bill.status === 'paid') || Math.max(0, (bill.amount || 0) - (bill.paidAmount || 0)) === 0,
        date: __paidAtDate.toISOString(),
        recipient: recipientName, // Gunakan recipientName yang sudah diperbaiki
        amount: bill.amount,
        totalTagihan: bill.amount || 0,
        sisaTagihan: Math.max(0, (bill.amount || 0) - (bill.paidAmount || 0)),
    };

        emit('ui.modal.showKwitansiPayment', kwitansiData);
    } finally {
        loader.close();
    }
}

export async function handleCetakKwitansiIndividu(dataset) {
    const { billId, workerId } = dataset;
    const loader = startGlobalLoading('Mempersiapkan kwitansi...');
    try {
        const bill = appState.bills.find(b => b.id === billId);
        if (!bill || !bill.workerDetails) {
            toast('error', 'Data tagihan gabungan tidak ditemukan.');
            return;
        }

        const workerDetail = bill.workerDetails.find(w => w.id === workerId || w.workerId === workerId);
        if (!workerDetail) {
            toast('error', 'Data pekerja di tagihan ini tidak ditemukan.');
            return;
        }

    const __paidAtDate = bill.paidAt ? getJSDate(bill.paidAt) : new Date();
    const kwitansiData = {
        nomor: `KW-G-${bill.id.substring(0, 4)}-${workerId.substring(0, 4)}`.toUpperCase(),
        tanggal: __paidAtDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
        namaPenerima: workerDetail.name,
        jumlah: workerDetail.amount,
        deskripsi: `Pembayaran ${bill.description}`,
        isLunas: true,
        date: __paidAtDate.toISOString(),
        recipient: workerDetail.name,
        amount: workerDetail.amount,
        totalTagihan: workerDetail.amount,
        sisaTagihan: 0,
    };

        emit('ui.modal.showKwitansiPayment', kwitansiData);
    } finally {
        loader.close();
    }
}

export async function handleCetakKwitansiKolektif(dataset) {
    const { billId } = dataset;
    const loader = startGlobalLoading('Mengumpulkan data pembayaran...');
    try {
        const bill = appState.bills.find(b => b.id === billId);
        if (!bill || !bill.workerDetails) {
            toast('error', 'Data tagihan gabungan tidak ditemukan.');
            return;
        }

    let allPaymentsForBill = [];
    try {
        if (navigator.onLine) {
            // PERBAIKAN: Pastikan 'db' dan 'TEAM_ID' diimpor dan query benar
            const billRef = doc(db, 'teams', TEAM_ID, 'bills', billId);
            const paymentsSnap = await getDocs(query(collection(billRef, 'payments'), orderBy('date', 'asc')));
            allPaymentsForBill.push(...paymentsSnap.docs.map(d => d.data()));
        }
        const queuedPayments = await localDB.pending_payments.where({ billId }).toArray();
        allPaymentsForBill.push(...queuedPayments);
    } catch (e) {
        toast('error', 'Gagal mengambil riwayat pembayaran.');
        console.error("Gagal fetch payments:", e);
        return;
    }

    if (allPaymentsForBill.length === 0) {
        toast('info', 'Belum ada pembayaran yang tercatat untuk tagihan ini.');
        return;
    }

    const paymentsByWorker = allPaymentsForBill.reduce((acc, payment) => {
        if (payment.workerId) {
            acc[payment.workerId] = (acc[payment.workerId] || 0) + payment.amount;
        }
        return acc;
    }, {});

    const allKwitansiData = Object.keys(paymentsByWorker).map(workerId => {
        const workerDetail = bill.workerDetails.find(w => (w.id === workerId || w.workerId === workerId));
        if (!workerDetail) return null;

        const totalGajiPeriodeIni = workerDetail.amount;
        const totalSudahDibayar = paymentsByWorker[workerId];
        const sisaTagihan = totalGajiPeriodeIni - totalSudahDibayar;

        return {
            nomor: `KW-G-${bill.id.substring(0, 4)}-${workerId.substring(0, 4)}`.toUpperCase(),
            tanggal: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
            namaPenerima: workerDetail.name,
            jumlah: totalSudahDibayar,
            deskripsi: `Pembayaran Gaji (Periode: ${new Date(bill.description.split(' ').pop()).toLocaleDateString('id-ID')})`,
            isLunas: sisaTagihan <= 0
        };
    }).filter(Boolean);

    if (allKwitansiData.length === 0) {
        toast('info', 'Tidak ada pembayaran yang cocok untuk dicetak.');
        return;
    }

        emit('ui.pdf.downloadKolektif', { allKwitansiData, bill });
    } finally {
        loader.close();
    }
}

on('ui.pdf.downloadKolektif', (data) => {
    downloadKolektifKwitansiAsPDF(data);
});
