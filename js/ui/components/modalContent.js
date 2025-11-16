import { fmtIDR } from "../../utils/formatters.js";
import { getEmptyStateHTML } from './emptyState.js';

function createIcon(iconName, size = 20, classes = '') {
    const icons = {
        'trash-2': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2 ${classes}"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`, // Used for delete
        'credit-card': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-credit-card ${classes}"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`, // Used for payment
        save: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-save ${classes}"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
        'receipt-text': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-receipt-text ${classes}"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1Z"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/></svg>`, // Used for receipt_long
        'log-in': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-log-in ${classes}"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/></svg>`, // Used for login
        'log-out': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-log-out ${classes}"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`, // Used for logout
        camera: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-camera ${classes}"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>`, // Used for photo_camera
        image: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image ${classes}"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
        x: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x ${classes}"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`, // Used for close
    };
    return icons[iconName] || '';
}

function getModalLayout(type, data = {}) {
    const normalizedType = typeof type === 'string' ? type.trim() : type;
    const contentGenerators = {
        'confirmDelete': () => _getSimpleDialogHTML('Konfirmasi Hapus', `<p class="confirm-modal-text">${data.message || 'Anda yakin ingin menghapus data ini?'}</p>`, `<button type="button" class="btn btn-ghost" data-action="close-modal">Batal</button><button type="button" id="confirm-btn" class="btn btn-danger">Hapus</button>`),
        'confirmPayment': () => _getSimpleDialogHTML('Konfirmasi Pembayaran', `<p class="confirm-modal-text">${data.message || 'Anda yakin ingin melanjutkan pembayaran?'}</p>`, `<button type="button" class="btn btn-ghost" data-action="close-modal">Batal</button><button type="button" id="confirm-btn" class="btn btn-primary">Ya, Bayar</button>`),
        'confirmEdit': () => _getSimpleDialogHTML('Konfirmasi Perubahan', `<p class="confirm-modal-text">${data.message || 'Anda yakin ingin menyimpan perubahan?'}</p>`, `<button type="button" class="btn btn-ghost" data-action="close-modal">Batal</button><button type="button" id="confirm-btn" class="btn btn-primary">Ya, Simpan</button>`),
        'confirmPayBill': () => _getSimpleDialogHTML('Konfirmasi Pembayaran', `<p class="confirm-modal-text">${data.message || 'Anda yakin ingin melanjutkan pembayaran ini?'}</p>`, `<button type="button" class="btn btn-ghost" data-action="close-modal">Batal</button><button type="button" id="confirm-btn" class="btn btn-primary">Ya, Bayar</button>`),
        'confirmGenerateBill': () => _getSimpleDialogHTML('Konfirmasi Buat Tagihan', `<p class="confirm-modal-text">${data.message || 'Anda akan membuat tagihan gaji. Lanjutkan?'}</p>`, `<button type="button" class="btn btn-ghost" data-action="close-modal">Batal</button><button type="button" id="confirm-btn" class="btn btn-primary">Ya, Buat Tagihan</button>`),
        'hrdApplicantDocuments': () => _getCustomContentModal(
            data.title || 'Dokumen Pelamar',
            data.content || getEmptyStateHTML({ icon: 'file', title: 'Tidak Ada Dokumen', desc: 'Pelamar ini belum memiliki lampiran.' }),
            data.footer || '',
            data.layoutClass || 'is-simple-dialog'
        ),

        'confirmUserAction': () => {
            const hasStatusOverride = data.contextType === 'expense-submit';
            let extraContent = '';
            let defaultStatus = 'unpaid';

            if (hasStatusOverride) {
                 const isSuratJalan = data.formType === 'surat_jalan';
                 const controlClass = isSuratJalan ? 'segmented-control segmented-control--text-only' : 'segmented-control';

                 if (isSuratJalan) {
                     extraContent = `
                        <div class="form-group full-width" style="margin-top: 1rem;">
                            <label>Status Pengeluaran</label>
                            <div class="${controlClass}">
                                <input type="radio" id="status-unpaid-modal" name="status-override" value="delivery_order" checked>
                                <label for="status-unpaid-modal">Simpan Sebagai Surat Jalan</label>
                            </div>
                        </div>`;
                        defaultStatus = 'delivery_order';
                 } else {
                     extraContent = `
                        <div class="form-group full-width" style="margin-top: 1rem;">
                            <label>Pilih Status Pembayaran</label>
                            <div class="${controlClass}">
                                <input type="radio" id="status-unpaid-modal" name="status-override" value="unpaid" checked>
                                <label for="status-unpaid-modal">Jadikan Tagihan</label>
                                <input type="radio" id="status-paid-modal" name="status-override" value="paid">
                                <label for="status-paid-modal">Sudah Lunas</label>
                            </div>
                        </div>`;
                 }
            }
            
            const content = `<p class="confirm-modal-text">${data.message || 'Apakah Anda yakin?'}</p>${extraContent}`;
            const cancelLabel = data.cancelLabel || 'Batal';
            const confirmLabel = data.confirmLabel || 'Ya, Lanjutkan';
            const cancelClass = data.cancelClass || 'btn btn-ghost';
            const confirmClass = data.confirmClass || 'btn btn-primary';
            const defaultFooter = `<button type="button" class="${cancelClass}" data-action="close-modal">${cancelLabel}</button><button type="button" id="confirm-btn" class="${confirmClass}" data-default-status="${defaultStatus}">${confirmLabel}</button>`;
            const footer = data.footer || defaultFooter;
            return _getSimpleDialogHTML(data.title || 'Konfirmasi Aksi', content, footer);
        },
        'confirmDeleteAttachment': () => _getSimpleDialogHTML('Hapus Lampiran', `<p class="confirm-modal-text">${data.message || 'Anda yakin ingin menghapus lampiran ini?'}</p>`, `<button type="button" class="btn btn-ghost" data-action="close-modal">Batal</button><button type="button" id="confirm-btn" class="btn btn-danger">Ya, Hapus</button>`),
        'confirmDeleteRecap': () => _getSimpleDialogHTML('Hapus Rekap Gaji', `<p class="confirm-modal-text">${data.message || 'Menghapus rekap ini akan menghapus data absensi terkait. Aksi ini tidak dapat dibatalkan. Lanjutkan?'}</p>`, `<button type="button" class="btn btn-ghost" data-action="close-modal">Batal</button><button type="button" id="confirm-btn" class="btn btn-danger">Ya, Hapus</button>`),
        'login': () => _getSimpleDialogHTML('Login', '<p class="confirm-modal-text">Gunakan akun Google Anda.</p>', `<button type="button" id="google-login-btn" class="btn btn-primary">${createIcon('log-in')} Masuk dengan Google</button>`),
        'confirmLogout': () => _getSimpleDialogHTML('Keluar', '<p class="confirm-modal-text">Anda yakin ingin keluar?</p>', `<button type="button" class="btn btn-ghost" data-action="close-modal">Batal</button><button type="button" id="confirm-logout-btn" class="btn btn-danger">${createIcon('log-out')} Keluar</button>`),
        'confirmExpense': () => _getSimpleDialogHTML('Konfirmasi Status Pengeluaran', '<p class="confirm-modal-text">Apakah pengeluaran ini sudah dibayar atau akan dijadikan tagihan?</p>', `<button type="button" class="btn btn-secondary" id="confirm-bill-btn">Jadikan Tagihan</button><button type="button" id="confirm-paid-btn" class="btn btn-success">Sudah, Lunas</button>`),
        'actionsPopup': () => ({
            layoutClass: data.layoutClass || 'is-actions-menu',
            contentHTML: _getBottomSheetContent(data.title, data.content, data.footer)
        }), 
        'reportGenerator': () => _getModalWithHeader(data.title || 'Buat Laporan', data.content, data.footer),
        'uploadSource': () => {
            const body = `
                <p class="confirm-modal-text">Pilih sumber untuk mengambil gambar lampiran:</p>
                <div class="upload-source-actions">
                    <button type="button" class="btn btn-secondary" data-source="camera">${createIcon('camera')} Kamera</button>
                    <button type="button" class="btn btn-secondary" data-source="gallery">${createIcon('image')} Galeri</button>
                </div>
            `;
            const isMobile = (typeof window !== 'undefined') && window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
            const contentHTML = isMobile
                ? _getBottomSheetContent('Pilih Sumber Lampiran', body, '')
                : _getSimpleDialogHTML('Pilih Sumber Lampiran', body, '');
            return { layoutClass: isMobile ? 'is-bottom-sheet' : 'is-simple-dialog', contentHTML };
        },
        'formView': () => {
            const dialog = _getModalWithHeader(data.title, data.content, data.footer);
            dialog.layoutClass = [dialog.layoutClass, data.layoutClass].filter(Boolean).join(' ').trim();
            return dialog;
        },
        'dataDetail': () => {
            const dialog = _getModalWithHeader(data.title, data.content, data.footer);
            dialog.layoutClass = [dialog.layoutClass, data.layoutClass].filter(Boolean).join(' ').trim();
            return dialog;
        },
        'dataBottomSheet': () => {
            const body = data.content || '';
            const footer = data.footer || '';
            const contentHTML = _getBottomSheetContent(data.title || '', body, footer);
            const layoutClass = ['is-bottom-sheet', data.layoutClass].filter(Boolean).join(' ').trim();
            return { layoutClass, contentHTML };
        },
        'payment': () => _getModalWithHeader(data.title, data.content, data.footer),
        'imageView': () => _getImageViewerHTML(data.src),
        'invoiceItemsDetail': () => _getInvoiceItemsDetailHTML(data),
        'welcomeModal': () => {
            const dialog = _getSimpleDialogHTML(
                data.title || 'Informasi',
                data.content || '<p>Konten tidak ditemukan.</p>',
                data.footer || ''
            );
            dialog.layoutClass = [dialog.layoutClass, 'is-welcome-modal', data.layoutClass]
                .filter(Boolean)
                .join(' ')
                .trim();
            return dialog;
        },
        'welcomeOnboarding': () => _getWelcomeOnboardingHTML(data),
        'actionsMenu': () => ({ layoutClass: 'is-actions-menu', contentHTML: data.content }),
        'infoSheet': () => _getInfoSheetContent(data)
    };

    const generator = contentGenerators[normalizedType] || (() => ({ layoutClass: 'is-simple-dialog', contentHTML: 'Konten tidak ditemukan' }));
    return generator();
}

function _getModalWithHeader(title, content, footerContent = '') {
    const footerHTML = footerContent ? `<div class="modal-footer">${footerContent}</div>` : '';
    const closeButtonHTML = `<button type="button" class="btn-icon modal-close-btn" data-action="close-modal" style="position: absolute; right: 0.75rem; top: 0.75rem;">${createIcon('x', 20)}</button>`; // Changed icon to 'x'
    const contentHTML = `
        <div class="modal-content">
            <div class="modal-header">
                ${closeButtonHTML}
            </div>
            <div class="modal-body">${content}</div>
            ${footerHTML}
        </div>
    `;
    return { layoutClass: 'is-standard-modal', contentHTML };
}

function _getSimpleDialogHTML(title, content, footer) {
    const closeButtonHTML = !footer ? `<button type="button" class="btn-icon modal-close-btn" data-action="close-modal" style="position: absolute; right: 0.75rem; top: 0.75rem;">${createIcon('x', 20)}</button>` : ''; // Changed icon to 'x'

    const footerHTML = footer ? `<div class="modal-footer">${footer}</div>` : '';
    const contentHTML = `
        <div class="modal-content">
            <div class="modal-header">
                ${closeButtonHTML}
            </div>
            <div class="modal-body">${content}</div>
            ${footerHTML}
        </div>
    `;
    return { layoutClass: 'is-simple-dialog', contentHTML };
}

function _getCustomContentModal(title, content, footerContent = '', layoutClass = 'is-simple-dialog') {
    const closeButtonHTML = `<button type="button" class="btn-icon modal-close-btn" data-action="close-modal" style="position: absolute; right: 0.75rem; top: 0.75rem;">${createIcon('x', 20)}</button>`;
    const footerHTML = footerContent ? `<div class="modal-footer">${footerContent}</div>` : '';
    const headerTitle = title ? `<h3 class="modal-title">${title}</h3>` : '';
    const contentHTML = `
        <div class="modal-content">
            <div class="modal-header">
                ${headerTitle}
                ${closeButtonHTML}
            </div>
            <div class="modal-body">${content}</div>
            ${footerHTML}
        </div>
    `;
    return { layoutClass, contentHTML };
}


function _getImageViewerHTML(src) {
    const contentHTML = `
        <img src="${src}" alt="Lampiran">
        <button type="button" class="btn-icon image-view-close" data-action="close-modal">${createIcon('x', 24)}</button>
    `; // Changed icon to 'x'
    return { layoutClass: 'is-image-viewer', contentHTML };
}


function _getInvoiceItemsDetailHTML(data) {
    const { items, totalAmount } = data;
    if (!items || items.length === 0) {
        return _getModalWithHeader('Rincian Faktur', getEmptyStateHTML({
            icon: 'receipt_long',
            title: 'Tidak Ada Rincian',
            desc: 'Tidak ada rincian barang untuk faktur ini.'
        }));
    }
    const itemsHTML = (items || []).map(item => `
        <div class="invoice-detail-item">
            <div class="item-main-info">
                <span class="item-name">${item.name || 'Material Dihapus'}</span>
                <span class="item-total">${fmtIDR(item.total)}</span>
            </div>
            <div class="item-sub-info">
                <span>${item.qty} &times; ${fmtIDR(item.price)}</span>
            </div>
        </div>`).join('');
    const content = `
        <div class="invoice-detail-card">
            <div class="invoice-detail-list">${itemsHTML}</div>
            <div class="invoice-detail-summary">
                <span>Total Faktur</span>
                <strong>${fmtIDR(totalAmount)}</strong>
            </div>
        </div>
    `;
    return _getModalWithHeader('Rincian Faktur', content);
}

function _getBottomSheetContent(title, bodyContent, footerContent = '') {
    const footerHTML = footerContent ? `<div class="modal-footer">${footerContent}</div>` : '';
    const closeButtonHTML = `<button type="button" class="btn-icon modal-close-btn" data-action="close-modal">${createIcon('x', 20)}</button>`;
    const titleHTML = title ? `<h4 class="modal-title">${title}</h4>` : '';

    return `
        <div class="modal-content">
            <div class="modal-header">
                ${closeButtonHTML}
            </div>
            <div class="modal-body">${bodyContent}</div>
            ${footerHTML}
        </div>
    `;
}
function _getWelcomeOnboardingHTML(data = {}) {
    const { userName = 'Pengguna', isNewUser = false } = data;
    
    const title = isNewUser ? `Selamat Datang, ${userName.split(' ')[0]}!` : `Selamat Datang Kembali, ${userName.split(' ')[0]}!`;
    const description = isNewUser 
        ? 'Senang bertemu dengan Anda. Mari kita mulai atur proyek konstruksi Anda dengan lebih efisien.' 
        : 'Semoga hari Anda produktif! Semua data Anda telah siap dan disinkronkan.';

    const illustration = `
    <svg class="welcome-hero-art" width="140" height="100" viewBox="0 0 140 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="welcome-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.9"/>
                <stop offset="100%" stop-color="var(--secondary)"/>
            </linearGradient>
        </defs>
        <rect x="10" y="20" width="120" height="70" rx="12" fill="var(--panel)" stroke="var(--line)"/>
        <path d="M10 32C10 25.3726 15.3726 20 22 20H118C124.627 20 130 25.3726 130 32V40H10V32Z" fill="url(#welcome-grad)"/>
        <circle cx="25" cy="30" r="4" fill="white" opacity="0.5"/>
        <circle cx="35" cy="30" r="4" fill="white" opacity="0.5"/>
        <circle cx="45" cy="30" r="4" fill="white" opacity="0.5"/>
        <rect x="25" y="55" width="60" height="8" rx="4" fill="var(--surface-muted)"/>
        <rect x="25" y="70" width="80" height="6" rx="3" fill="var(--surface-muted)"/>
        <path d="M95 55L115 55L115 80L95 80L95 55Z" fill="var(--surface-muted)" rx="6" class="auth-svg-shape" style="animation-delay: 0.2s;"/>
    </svg>
    `;

    const contentHTML = `
    <div class="welcome-hero-content">
        <div class="welcome-hero-illustration">
            ${illustration}
        </div>
        <h2 class="welcome-hero-title">${title}</h2>
        <p class="welcome-hero-description">${description}</p>
    </div>
    `;
    
    const footerHTML = `<button type="button" class="btn btn-primary" data-action="close-modal">Mulai Bekerja</button>`;
    
    const dialog = _getSimpleDialogHTML('', contentHTML, footerHTML);
    dialog.layoutClass = 'is-simple-dialog is-welcome-modal'; 
    return dialog;
}

function _getInfoSheetContent(options) {
    const content = options.message || '<p>Konten tidak ditemukan.</p>';
    
    return {
        layoutClass: `is-info-sheet ${options.modalClass || 'modal-large'}`,
        contentHTML: `
            <div class="modal-header">
                <h2 class="modal-title">${options.title || 'Informasi'}</h2>
                <button type="button" class="btn-icon btn-icon--close" data-action="closeModal" aria-label="Tutup modal">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="modal-body-scroller">
                ${content}
            </div>
            <div class="modal-footer">
                ${options.footer || '<button type="button" class="btn btn-primary" data-action="closeModal">Tutup</button>'}
            </div>
        `
    };
}

export { getModalLayout };
