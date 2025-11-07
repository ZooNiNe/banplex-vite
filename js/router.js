import { renderPageContent } from './ui/pages/pageManager.js';
import { handleNavigation, renderSidebar, renderBottomNav } from './ui/mainUI.js';
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

let popstateController = null;

function navigate(nav) {
  handleNavigation(nav);
}

function cleanupPopstateListener() {
    if (popstateController) {
        popstateController.abort();
        popstateController = null;
        window.__banplex_history_init = false;
        window.removeEventListener('popstate', handlePopstateEvent);
    }
}

function handlePopstateEvent(e) {
    console.log('[Popstate] Event fired. New state:', e.state, 'Current appPage:', appState.activePage);

    const topModal = document.querySelector('#modal-container .modal-bg.show:not([data-utility-modal="true"])');
    const isMobileDetailOpen = document.body.classList.contains('detail-view-active');
    const isDesktopDetailOpen = document.body.classList.contains('detail-pane-open');
    
    const state = e.state || {};
    const targetPage = state.page || 'dashboard';

    if (isMobileDetailOpen) {
        console.log('[Popstate] Menutup mobile detail pane...');
  
        if (appState.detailPaneHistory.length > 0) {
            console.log('[Popstate] Kembali ke panel sebelumnya.');
            const prevState = appState.detailPaneHistory.pop();
            emit('ui.modal.showMobileDetail', prevState, true);
            return; 
        } else {
            hideMobileDetailPageImmediate();
            return; 
        }
    }
    if (isDesktopDetailOpen) {
        console.log('[Popstate] Menutup desktop detail pane...');
        if (appState.detailPaneHistory.length > 0) {
            console.log('[Popstate] Kembali ke panel desktop sebelumnya.');
            const prevState = appState.detailPaneHistory.pop();
            emit('ui.modal.showDetail', prevState, true);
            return;
        } else {
            closeDetailPaneImmediate();
        }
    }

    if (topModal) {
        console.log('[Popstate] Menutup modal...');
        closeModalImmediate(topModal);
        return;
    }
    
    if (appState.activePage === 'absensi' && targetPage !== 'absensi') {
        emit('ui.selection.deactivate');
    }

    if (appState.activePage === 'dashboard' && (!state.page || state.page === 'dashboard')) {
        console.log('[Popstate] Di Dashboard, menekan "back". Mencegah navigasi keluar.');
        try {
            history.pushState({ page: 'dashboard' }, '', '#dashboard');
        } catch (_) {}
        return;
    }

    if (appState.activePage !== targetPage) { 
        console.log(`[Popstate] Navigasi halaman: ${appState.activePage} -> ${targetPage}`);
        handleNavigation(targetPage, { source: 'history', push: false }); 
    } else {
         console.log(`[Popstate] State sama, tidak ada navigasi. Page: ${targetPage}`);
         checkAndRestoreBottomNav();
    }
}

function initRouter() {
    cleanupPopstateListener();

    if (window.__banplex_history_init) return;
    window.__banplex_history_init = true;

    try {
        if ('replaceState' in history) {
            history.replaceState({ page: appState.activePage }, '', window.location.href);
        }
    } catch (_) {}

    popstateController = new AbortController();
    const { signal } = popstateController;
    
    window.addEventListener('popstate', handlePopstateEvent, { signal });

    on('app.unload', cleanupPopstateListener);
}

on('auth.loggedOut', cleanupPopstateListener);

export { renderPageContent, navigate, initRouter };