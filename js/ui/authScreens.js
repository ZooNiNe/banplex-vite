// js/ui/authScreens.js

import { auth } from "../config/firebase.js";

// Helper function to create Lucide SVG Icon (Modern)
function createIcon(iconName, size = 20, classes = '') {
    const icons = {
        login: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-log-in ${classes}"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/></svg>`,
        logout: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-log-out ${classes}"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`,
        hourglass: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-hourglass ${classes}"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg>`,
        'user-plus': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-plus ${classes}"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>`,
        'google-logo': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="${classes}"><path d="M22.56 12.25C22.56 11.45 22.49 10.68 22.36 9.92H12V14.4H17.96C17.73 15.83 17.06 17.09 16.03 17.85V20.55H19.92C21.66 19.01 22.56 16.83 22.56 14.12V12.25Z" fill="#4285F4"/><path d="M12 23C15.24 23 17.99 21.92 19.92 20.55L16.03 17.85C14.95 18.57 13.59 19 12 19C9.26 19 6.83 17.2 5.79 14.73H1.79V17.54C3.72 20.98 7.55 23 12 23Z" fill="#34A853"/><path d="M5.79 14.73C5.59 14.15 5.48 13.53 5.48 12.91C5.48 12.29 5.59 11.67 5.79 11.09V8.28H1.79C0.91 9.99 0.44 11.4 0.44 12.91C0.44 14.42 0.91 15.83 1.79 17.54L5.79 14.73Z" fill="#FBBC05"/><path d="M12 6.99C13.67 6.99 15.04 7.56 16.3 8.76L20.01 5.05C18.11 3.24 15.34 2 12 2C7.55 2 3.72 4.02 1.79 7.46L5.79 10.27C6.83 7.8 9.26 6.99 12 6.99Z" fill="#EA4335"/></svg>`,
    };
    return icons[iconName] || '';
}

// Ilustrasi SVG untuk Halaman Auth
function getAuthIllustration() {
    return `
    <svg width="140" height="120" viewBox="0 0 140 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="auth-grad-1" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.1" />
                <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.05" />
            </linearGradient>
            <linearGradient id="auth-grad-2" x1="1" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.8" />
                <stop offset="100%" stop-color="#10b981" />
            </linearGradient>
        </defs>
        <rect x="20" y="30" width="100" height="80" rx="12" fill="url(#auth-grad-1)" stroke="var(--line)"/>
        <rect x="35" y="45" width="70" height="8" rx="4" fill="var(--surface-muted)"/>
        <rect x="35" y="60" width="50" height="6" rx="3" fill="var(--surface-muted)"/>
        <path d="M60 0 L80 0 L100 20 L40 20 Z" fill="var(--surface-muted)" />
        <path d="M50 15 L90 15 L90 20 L50 20 Z" fill="var(--line)" />
        <rect x="80" y="75" width="30" height="30" rx="8" fill="url(#auth-grad-2)" class="auth-svg-shape"/>
        <circle cx="45" cy="85" r="12" fill="var(--surface-muted)" class="auth-svg-shape" style="animation-delay: 0.5s;"/>
    </svg>
    `;
}

// Ilustrasi SVG untuk Halaman Pending
function getPendingIllustration() {
    return `
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" class="pending-svg">
        <path d="M30 110h60" stroke="var(--line)" stroke-width="4" stroke-linecap="round"/>
        <path d="M30 10h60" stroke="var(--line)" stroke-width="4" stroke-linecap="round"/>
        <path d="M90 110V88.343a4 4 0 0 0-1.172-2.828L72 70l-16.828 15.515a4 4 0 0 0-1.172 2.828V110" fill="var(--surface-muted)" stroke="var(--line)" stroke-width="2"/>
        <path d="M50 10v21.657a4 4 0 0 0 1.172 2.828L68 50l16.828-15.515a4 4 0 0 0 1.172-2.828V10" fill="var(--surface-muted)" stroke="var(--line)" stroke-width="2"/>
        <g class="sand-stream">
            <circle cx="70" cy="55" r="2" fill="var(--primary)"/>
            <circle cx="68" cy="62" r="2" fill="var(--primary)"/>
            <circle cx="72" cy="68" r="2" fill="var(--primary)"/>
        </g>
    </svg>
    `;
}


function getAuthScreenHTML() {
    let lastUser = null;
    try {
        lastUser = JSON.parse(localStorage.getItem('lastActiveUser'));
    } catch (e) {
        lastUser = null;
    }

    if (lastUser && lastUser.displayName) {
        // Tampilan "Returning User" yang diperbarui
        return `
            <div class="auth-container returning-user">
                <div class="auth-illustration">
                    ${getAuthIllustration()}
                </div>
                <h2 class="auth-title">Selamat Datang Kembali</h2>
                <img src="${lastUser.photoURL || 'public/icons-logo.webp'}" alt="Avatar" class="profile-avatar-large" onerror="this.src='public/icons-logo.webp';">
                <p class="returning-user-name">${lastUser.displayName}</p>
                
                <div class="auth-actions">
                    <button type="button" class="btn btn-primary btn-block" data-action="auth-action">
                        ${createIcon('login')}
                        Masuk sebagai ${lastUser.displayName.split(' ')[0]}
                    </button>
                    <button type="button" class="btn btn-secondary btn-block" data-action="login-different-account">
                        ${createIcon('user-plus')}
                        Gunakan akun lain
                    </button>
                </div>
            </div>`;
    }
    else {
        // Tampilan "New User" (Guest) yang diperbarui
        return `
            <div class="auth-container new-user">
                <div class="auth-illustration">
                    ${getAuthIllustration()}
                </div>
                <h1 class="auth-brand-title">Selamat Datang di BanPlex</h1>
                <h3 class="auth-subtitle">Manajemen Proyek Konstruksi Anda</h3>
                <p class="auth-description">Masuk dengan akun Google Anda untuk memulai sinkronisasi data proyek, absensi, dan keuangan.</p>
                
                <div class="auth-actions">
                    <button type="button" class="btn btn-primary btn-block btn-google" data-action="auth-action">
                        ${createIcon('google-logo', 20)}
                        Masuk dengan Google
                    </button>
                </div>
            </div>`;
    }
}

function getPendingScreenHTML() {
    const user = auth.currentUser;
    // Tampilan "Pending" yang diperbarui
    return `
        <div class="auth-container pending-container">
            <div class="pending-illustration">
                ${getPendingIllustration()}
            </div>
            <h2 class="auth-title">Menunggu Persetujuan</h2>
            <p class="auth-description" style="margin-bottom: 1.5rem;">
                Akun Anda (<strong>${user?.email || ''}</strong>) telah terdaftar dan sedang menunggu persetujuan dari Owner tim.
            </p>
            <p class="auth-description small">
                Silakan hubungi administrator tim Anda. Anda dapat mencoba lagi nanti.
            </p>
            <div class="auth-actions">
                <button class="btn btn-secondary btn-block" data-action="auth-action">
                    ${createIcon('logout')} Logout
                </button>
            </div>
        </div>
    `;
}

export { getAuthScreenHTML, getPendingScreenHTML };
