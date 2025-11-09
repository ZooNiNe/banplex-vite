import { renderPageContent } from './ui/pages/pageManager.js';
// PERBAIKAN: Tambahkan 'renderUI' ke impor ini
import { handleNavigation, renderSidebar, renderBottomNav, renderUI } from './ui/mainUI.js';
import { appState } from './state/appState.js';
import {
    closeModal,
    closeModalImmediate,
    closeDetailPane,
    hideMobileDetailPage,
    hideMobileDetailPageImmediate,
    closeDetailPaneImmediate,
    checkAndRestoreBottomNav,
    handleDetailPaneBack
} from './ui/components/modal.js';
import { emit, on } from './state/eventBus.js';

const ROUTES = [
    { path: '/dashboard', page: 'dashboard', title: 'Dashboard', authRequired: true },
    { path: '/auth', page: 'auth', title: 'Masuk', authRequired: false },
];
const ROUTE_BY_PAGE = ROUTES.reduce((acc, route) => {
    acc[route.page] = route;
    return acc;
}, {});

const ROUTE_BY_PATH = ROUTES.reduce((acc, route) => {
    acc[route.path] = route;
    acc[`#${route.page}`] = route;
    return acc;
}, {});

function getCurrentUser() {
    try {
        const globalState = typeof window !== 'undefined' ? window.appState : null;
        if (globalState && typeof globalState.getUser === 'function') {
            return globalState.getUser();
        }
    } catch (_) {}
    return appState.currentUser;
}

function requiresAuth(route) {
    if (!route) return true;
    return route.authRequired !== false;
}

function ensureRouteAccess(route) {
    if (!requiresAuth(route)) return true;
    const user = getCurrentUser();
    if (!user) {
        if (route?.page !== 'auth') {
            navigate('/auth');
        }
        return false;
    }
    if (route?.adminRequired === true && !(window.appState?.isPrivileged?.())) {
        try {
            window.router?.navigateTo?.('/dashboard');
        } catch (_) {
            navigate('/dashboard');
        }
        return false;
    }
    return true;
}

function resolveRoute(target) {
    if (!target) return null;
    if (typeof target === 'object' && target.page) return target;
    if (ROUTE_BY_PAGE[target]) return ROUTE_BY_PAGE[target];
    if (ROUTE_BY_PATH[target]) return ROUTE_BY_PATH[target];
    const normalized = typeof target === 'string' ? target.replace(/^#/, '') : target;
    return ROUTE_BY_PAGE[normalized] || { page: normalized };
}

let popstateController = null;

function navigate(nav) {
  const route = resolveRoute(nav);
  if (!ensureRouteAccess(route)) return;
  handleNavigation(route?.page || nav, { route });
}

function cleanupPopstateListener() {
    if (popstateController) {
        popstateController.abort();
        popstateController = null;
        window.__banplex_history_init = false;
        window.removeEventListener('popstate', handlePopstateEvent);
    }
}

/**
 * FUNGSI BARU: Membersihkan listener DAN state history browser saat logout.
 */
function resetHistoryOnLogout() {
    console.log("[Router] Logout terdeteksi. Membersihkan listener dan state history.");
    cleanupPopstateListener(); // Hapus listener 'popstate'
    
    // Atur ulang tumpukan panel internal kita
    appState.detailPaneHistory = [];

    // Manuver history untuk membersihkan tumpukan
    try {
        // 1. Dorong state "logout" baru. Ini menjadi entri baru di history.
        history.pushState({ page: null, loggedOut: true }, '', '#logged_out');
        // 2. Ganti state "logout" tersebut dengan state "login".
        // Ini secara efektif membuat 'login' sebagai state dasar baru,
        // membersihkan history "forward" dan "menjebak" tombol "back".
        history.replaceState({ page: 'login' }, '', window.location.pathname); 
    } catch(e) {
        console.warn("Gagal membersihkan history state saat logout.", e);
    }
}


/**
 * Menangani event 'popstate' (ketika pengguna menekan tombol kembali browser).
 * Logika ini diubah untuk memprioritaskan penutupan overlay (Modal -> Pane)
 * sebelum melakukan navigasi halaman, meniru perilaku aplikasi native.
 * @param {PopStateEvent} e
 */
function handlePopstateEvent(e) {
    console.log('[Popstate] Event fired. New state:', e.state, 'Current appPage:', appState.activePage);

    // PERBAIKAN: Cek overlay dengan urutan prioritas yang benar (dari atas ke bawah).
    // Modal > Mobile Detail Pane > Desktop Detail Pane.

    // 1. Cek Modal (non-utility)
    // Modal adalah UI paling atas, jadi kita cek ini dulu.
    const topModal = document.querySelector('#modal-container .modal-bg.show:not([data-utility-modal="true"])');
    if (topModal) {
        console.log('[Popstate] Menutup modal...');
        // Gunakan 'closeModalImmediate' karena 'popstate' SUDAH terjadi.
        // Memanggil closeModal() biasa akan memicu history.back() lagi dan menyebabkan loop.
        closeModalImmediate(topModal); 
        return;
    }

    // 2. Cek Mobile Detail Pane
    const isMobileDetailOpen = document.body.classList.contains('detail-view-active');
    if (isMobileDetailOpen) {
        console.log('[Popstate] Menutup mobile detail pane...');
        
        // Cek apakah ada riwayat panel bertingkat (misal: Buka Detail -> Buka Edit)
        if (appState.detailPaneHistory.length > 0) {
            console.log('[Popstate] Kembali ke panel sebelumnya.');
            const prevState = appState.detailPaneHistory.pop();
            // Render ulang panel sebelumnya tanpa push history baru
            emit('ui.modal.showMobileDetail', prevState, true); // true = isGoingBack
            return; 
        } else {
            // PERBAIKAN: Pindahkan 'hideMobileDetailPageImmediate' ke dalam 'else'
            // Ini adalah panel terakhir, tutup immediate
            hideMobileDetailPageImmediate();
            return; 
        }
    }

    // 3. Cek Desktop Detail Pane
    const isDesktopDetailOpen = document.body.classList.contains('detail-pane-open');
    if (isDesktopDetailOpen) {
        console.log('[Popstate] Menutup desktop detail pane...');
        
        // Cek history panel bertingkat
        if (appState.detailPaneHistory.length > 0) {
            console.log('[Popstate] Kembali ke panel desktop sebelumnya.');
            const prevState = appState.detailPaneHistory.pop();
            // Render ulang panel sebelumnya tanpa push history baru
            emit('ui.modal.showDetail', prevState, true); // true = isGoingBack
            return;
        } else {
            // PERBAIKAN: Pindahkan 'closeDetailPaneImmediate' ke dalam 'else'
            // Ini adalah panel terakhir, tutup immediate
            closeDetailPaneImmediate();
            return;
        }
    }
    
    // 4. Jika tidak ada overlay, baru tangani navigasi halaman
    const state = e.state || {};
    const targetPage = state.page || 'dashboard';
    const targetRoute = resolveRoute(targetPage);
    if (!ensureRouteAccess(targetRoute)) {
        return;
    }

    // Logika khusus saat meninggalkan halaman absensi
    if (appState.activePage === 'absensi' && targetPage !== 'absensi') {
        emit('ui.selection.deactivate');
    }

    // Mencegah keluar dari app jika di dashboard
    if (appState.activePage === 'dashboard' && (!state.page || state.page === 'dashboard')) {
        console.log('[Popstate] Di Dashboard, menekan "back". Mencegah navigasi keluar.');
        try {
            // Dorong state dashboard kembali untuk "menangkap" tombol kembali
            history.pushState({ page: 'dashboard' }, '', '#dashboard');
        } catch (_) {}
        return;
    }

    // Navigasi halaman
    // PERBAIKAN UTAMA:
    // Panggil logika render ulang secara langsung, JANGAN panggil handleNavigation.
    // handleNavigation adalah untuk *membuat* navigasi baru (dan pushState).
    // Kita *merespon* state yang sudah diubah oleh browser.
        if (appState.activePage !== targetPage) { 
            console.log(`[Popstate] Navigasi halaman: ${appState.activePage} -> ${targetPage}`);
        
        // --- AWAL BLOK YANG DIPINDAHKAN DARI 'proceedNavigation' ---
        const oldPage = appState.activePage;
        if (oldPage && oldPage !== targetPage) {
            emit(`app.unload.${oldPage}`);
            try { emit('app.unload'); } catch(_) {}
        }

        appState.activePage = targetPage;
        // Kita menggunakan sessionStorage, jadi kita update juga
        sessionStorage.setItem('lastActivePage', targetPage);
        
        emit('ui.modal.closeAll');
        renderUI();
    
        try {
            document.body.className = (document.body.className || '')
                .split(/\s+/)
                .filter(c => c && !c.startsWith('page-'))
                .join(' ');
            document.body.classList.add(`page-${targetPage}`);
        } catch (_) {}
        
        renderPageContent(); // Render UI halaman baru
        // --- AKHIR BLOK YANG DIPINDAHKAN ---

    } else {
         console.log(`[Popstate] State sama, tidak ada navigasi. Page: ${targetPage}`);
         checkAndRestoreBottomNav(); // Pastikan bottom nav terlihat
    }
}

function initRouter() {
    // PERBAIKAN: Selalu bersihkan listener sebelumnya jika init dipanggil lagi
    if (window.__banplex_history_init) {
        console.log("[Router] Router sudah diinisialisasi, membersihkan listener lama.");
        cleanupPopstateListener();
    }

    window.__banplex_history_init = true;

    try {
        if ('replaceState' in history) {
            console.log(`[Router] Mengatur base history state ke: ${appState.activePage}`);
            history.replaceState({ page: appState.activePage }, '', window.location.href);
        }
    } catch (_) {}

    popstateController = new AbortController();
    const { signal } = popstateController;
    
    window.addEventListener('popstate', handlePopstateEvent, { signal });

}

on('auth.loggedOut', resetHistoryOnLogout); // <-- Gunakan fungsi reset yang baru

if (typeof window !== 'undefined') {
    window.router = Object.assign({}, window.router || {}, {
        navigateTo: navigate,
    });
}

export { renderPageContent, navigate, initRouter };
