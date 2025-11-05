/**
 * Modul untuk menampilkan halaman error fullscreen yang informatif dan menarik.
 * Menggantikan body HTML dengan pesan error yang terkustomisasi.
 */

// Fungsi helper untuk membuat ikon Lucide
function createIcon(iconName, size = 20, classes = '') {
    const icons = {
        'rotate-cw': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-rotate-cw ${classes}"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>`,
        'database-zap': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-database-zap ${classes}"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 8 2.82"/><path d="M21 5v14a9 3 0 0 1-9 2.97"/><path d="M3 12a9 3 0 0 0 4.64 2.82"/><path d="M21 12a9 3 0 0 1-4.64 2.82"/><path d="m13 12-4 6h6l-4 6"/></svg>`,
        'cloud-off': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-cloud-off ${classes}"><path d="M22 19a4.4 4.4 0 0 0-1.2-8.4l-1.1-1C18.3 6.3 15.3 4 12 4c-1.6 0-3.1.5-4.4 1.4"/><path d="M8.8 6.2C5.5 7.3 3 10.3 3 14a6 6 0 0 0 12 0c0-.4-.1-.8-.1-1.2"/><path d="m2 2 20 20"/></svg>`,
        'alert-triangle': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle ${classes}"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`
    };
    return icons[iconName] || icons['alert-triangle'];
}

/**
 * Mendapatkan ilustrasi SVG berdasarkan kunci yang diberikan.
 * @param {string} key - Kunci ilustrasi ('offline', 'database-error', 'generic-error')
 * @returns {string} String HTML SVG
 */
function getErrorIllustration(key = 'generic-error') {
    const illustrations = {
        'offline': `
            <svg class="error-illustration" width="140" height="120" viewBox="0 0 140 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M30 100C40.6667 96 58 88.8 70 90C82 91.2 92.6667 96 110 100" stroke="var(--line)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" class="error-svg-shape" style="animation-delay: 0.5s"/>
                <path d="M12 70L40 60L55 80L85 50L100 75L128 65" stroke="var(--line)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" class="error-svg-shape"/>
                <circle cx="95" cy="25" r="15" fill="var(--surface-muted)" class="error-svg-shape" style="animation-delay: 0.2s"/>
                <path d="M95 25L70 50" stroke="var(--primary)" stroke-width="6" stroke-linecap="round" class="error-svg-line"/>
                <path d="M70 25L95 50" stroke="var(--primary)" stroke-width="6" stroke-linecap="round" class="error-svg-line"/>
            </svg>`,
        'database-error': `
            <svg class="error-illustration" width="140" height="120" viewBox="0 0 140 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                <ellipse cx="70" cy="30" rx="45" ry="15" fill="var(--surface-muted)" class="error-svg-shape"/>
                <path d="M25 30V80C25 88.2843 45.1177 95 70 95C94.8823 95 115 88.2843 115 80V30" fill="var(--surface-muted)" stroke="var(--line)" stroke-width="2"/>
                <ellipse cx="70" cy="30" rx="45" ry="15" fill="var(--panel)" stroke="var(--line)" stroke-width="2"/>
                <path d="M25 55C25 63.2843 45.1177 70 70 70C94.8823 70 115 63.2843 115 55" fill="var(--panel)" stroke="var(--line)" stroke-width="2"/>
                <path d="M85 45L65 60L80 60L75 75" stroke="var(--danger)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" class="error-svg-shape" style="animation-delay: 0.3s;"/>
            </svg>`,
        'generic-error': `
            <svg class="error-illustration" width="140" height="120" viewBox="0 0 140 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M104.73 90L70 26L35.27 90H104.73Z" fill="var(--surface-muted)" stroke="var(--line)" stroke-width="2" class="error-svg-shape"/>
                <path d="M70 50V70" stroke="var(--danger)" stroke-width="6" stroke-linecap="round" class="error-svg-line"/>
                <circle cx="70" cy="80" r="3" fill="var(--danger)" class="error-svg-line" style="animation-delay: 0.2s"/>
            </svg>`
    };
    return illustrations[key] || illustrations['generic-error'];
}

/**
 * Merender dan mengganti seluruh body HTML dengan halaman error.
 * @param {object} config - Konfigurasi untuk halaman error.
 * @param {string} config.title - Judul error (mis. "Anda Sedang Offline").
 * @param {string} config.message - Pesan penjelasan untuk pengguna.
 * @param {string} [config.details] - (Opsional) Detail teknis error.
 * @param {string} [config.illustrationKey] - (Opsional) Kunci ilustrasi ('offline', 'database-error').
 * @param {boolean} [config.showRetryButton=false] - (Opsional) Tampilkan tombol muat ulang.
 */
export function renderErrorPage(config = {}) {
    const {
        title = 'Terjadi Kesalahan',
        message = 'Aplikasi gagal dimuat. Silakan coba lagi nanti.',
        details = '',
        illustrationKey = 'generic-error',
        showRetryButton = false
    } = config;

    // Terapkan kelas mode error ke body
    document.body.className = 'error-mode';

    const retryButtonHTML = showRetryButton
        ? `<button class="btn btn-primary btn-block" onclick="window.location.reload()">
               ${createIcon('rotate-cw', 18)}
               Muat Ulang Aplikasi
           </button>`
        : '';
    
    const detailsHTML = details
        ? `<p class="auth-description small error-details"><strong>Detail:</strong> ${details}</p>`
        : '';

    const errorPageHTML = `
        <main>
            <div class="page-container error-page-container">
                <div class="auth-container error-container">
                    <div class="error-illustration">
                        ${getErrorIllustration(illustrationKey)}
                    </div>
                    <h2 class="auth-title">${title}</h2>
                    <p class="auth-description">${message}</p>
                    ${detailsHTML}
                    <div class="auth-actions">
                        ${retryButtonHTML}
                    </div>
                </div>
            </div>
        </main>
    `;

    document.body.innerHTML = errorPageHTML;
}
