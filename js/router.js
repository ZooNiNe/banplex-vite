import { renderPageContent } from './ui/pages/pageManager.js';
import { handleNavigation, renderSidebar, renderBottomNav } from './ui/mainUI.js';
import { appState } from './state/appState.js';
// Impor fungsi 'Immediate' untuk penutupan paksa oleh router
import {
    closeModal,
    closeModalImmediate,
    closeDetailPane,
    hideMobileDetailPage,
    hideMobileDetailPageImmediate,
    closeDetailPaneImmediate,
    checkAndRestoreBottomNav,
    handleDetailPaneBack // Kita mungkin tidak membutuhkannya di sini, tapi impor untuk referensi
} from './ui/components/modal.js';
import { emit, on } from './state/eventBus.js';

let popstateController = null;

function navigate(nav) {
  handleNavigation(nav);
}

function cleanupPopstateListener() {
    if (popstateController) {
        popstateController.abort();
        popstateController = null;
        window.__banplex_history_init = false;
        // Hapus listener 'popstate' secara eksplisit
        window.removeEventListener('popstate', handlePopstateEvent);
    }
}

/**
 * Handler utama untuk event 'popstate' (tombol "back" browser/HP).
 * Fungsi ini SEKARANG menjadi pusat logika untuk navigasi "back" native.
 */
function handlePopstateEvent(e) {
    console.log('[Popstate] Event fired. New state:', e.state, 'Current appPage:', appState.activePage);

    // 1. Dapatkan status UI saat ini (SEBELUM popstate dieksekusi)
    // Ini adalah elemen-elemen yang *mungkin* perlu ditutup.
    const topModal = document.querySelector('#modal-container .modal-bg.show:not([data-utility-modal="true"])');
    const isMobileDetailOpen = document.body.classList.contains('detail-view-active');
    const isDesktopDetailOpen = document.body.classList.contains('detail-pane-open');
    
    // 2. Dapatkan state tujuan (ke mana kita akan "kembali")
    const state = e.state || {};
    const targetPage = state.page || 'dashboard';

// [router.js] - DENGAN BLOK BARU INI:

    // Prioritas 1: Menutup Mobile Detail Pane
    if (isMobileDetailOpen) {
        console.log('[Popstate] Menutup mobile detail pane...');
        // Cek riwayat panel bertumpuk
        if (appState.detailPaneHistory.length > 0) {
            console.log('[Popstate] Kembali ke panel sebelumnya.');
            const prevState = appState.detailPaneHistory.pop();
            // Render ulang panel sebelumnya (true = isGoingBack)
            emit('ui.modal.showMobileDetail', prevState, true);
            return; 
        } else {
            hideMobileDetailPageImmediate();
        }
    }
    // Prioritas 2: Menutup Desktop Detail Pane
    if (isDesktopDetailOpen) {
        console.log('[Popstate] Menutup desktop detail pane...');
        // Cek riwayat panel bertumpuk
        if (appState.detailPaneHistory.length > 0) {
            console.log('[Popstate] Kembali ke panel desktop sebelumnya.');
            const prevState = appState.detailPaneHistory.pop();
            // Render ulang panel sebelumnya (true = isGoingBack)
            emit('ui.modal.showDetail', prevState, true);
            return;
        } else {
            // Ini adalah panel terakhir, tutup sepenuhnya
            closeDetailPaneImmediate();
        }
    }

    // Prioritas 3: Menutup Modal (non-utility)
    if (topModal) {
        console.log('[Popstate] Menutup modal...');
        closeModalImmediate(topModal);
        // Kita telah menangani event "back" ini. Selesai.
        return;
    }
    
    // 4. Jika tidak ada overlay untuk ditutup, tangani navigasi Halaman
    
    // Cek jika kita di 'absensi' (untuk menonaktifkan selection mode)
    if (appState.activePage === 'absensi' && targetPage !== 'absensi') {
        emit('ui.selection.deactivate');
    }

    // Kondisi "Tutup Aplikasi"
    // Jika kita di dashboard DAN state history mencoba membawa kita ke halaman lain (misal: keluar)
    if (appState.activePage === 'dashboard' && (!state.page || state.page === 'dashboard')) {
        console.log('[Popstate] Di Dashboard, menekan "back". Mencegah navigasi keluar.');
        // Dorong state 'dashboard' kembali ke history untuk "membatalkan" aksi "back"
        try {
            history.pushState({ page: 'dashboard' }, '', '#dashboard');
        } catch (_) {}
        // Di sini kita bisa memunculkan toast "Tekan kembali lagi untuk keluar" di masa depan
        return;
    }

    // Navigasi halaman biasa
    if (appState.activePage !== targetPage) { 
        console.log(`[Popstate] Navigasi halaman: ${appState.activePage} -> ${targetPage}`);
        // Panggil handleNavigation, tapi jangan push state baru (karena kita dari popstate)
        handleNavigation(targetPage, { source: 'history', push: false }); 
    } else {
         console.log(`[Popstate] State sama, tidak ada navigasi. Page: ${targetPage}`);
         // Pulihkan bottom nav untuk berjaga-jaga jika ada state history yang "rusak"
         checkAndRestoreBottomNav();
    }
}

function initRouter() {
    // Hapus listener lama jika ada (untuk HMR atau reload)
    cleanupPopstateListener();

    if (window.__banplex_history_init) return;
    window.__banplex_history_init = true;

    try {
        if ('replaceState' in history) {
            // Pastikan state awal kita benar
            history.replaceState({ page: appState.activePage }, '', window.location.href);
        }
    } catch (_) {}

    popstateController = new AbortController();
    const { signal } = popstateController;
    
    // Gunakan handler baru kita
    window.addEventListener('popstate', handlePopstateEvent, { signal });

    on('app.unload', cleanupPopstateListener);
}

on('auth.loggedOut', cleanupPopstateListener);

export { renderPageContent, navigate, initRouter };