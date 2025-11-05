import { renderPageContent } from './ui/pages/pageManager.js';
import { handleNavigation, renderSidebar, renderBottomNav } from './ui/mainUI.js';
import { appState } from './state/appState.js';
import { closeModal, closeModalImmediate, closeDetailPane, hideMobileDetailPage, hideMobileDetailPageImmediate, closeDetailPaneImmediate, checkAndRestoreBottomNav } from './ui/components/modal.js';
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

    }
}

function initRouter() {
    if (window.__banplex_history_init) return;
    window.__banplex_history_init = true;

    try {
        if ('replaceState' in history) {
            history.replaceState({ page: appState.activePage }, '', window.location.href);
        }
    } catch (_) {}

    cleanupPopstateListener();
    popstateController = new AbortController();
    const { signal } = popstateController;

    window.addEventListener('popstate', (e) => {
        console.log('[Popstate] Event fired. New state:', e.state, 'Current appPage:', appState.activePage);

        const topModal = document.querySelector('#modal-container .modal-bg.show');
        const isMobileDetailOpen = document.body.classList.contains('detail-view-active');
        const isDesktopDetailOpen = document.body.classList.contains('detail-pane-open');
        
        const statePage = e.state?.page || 'dashboard';
        const stateHasDetailView = e.state?.detailView === true;
        const stateHasModal = e.state?.modal === true; 


        let overlayClosed = false;

        if (topModal && !stateHasModal) {
            console.log('[Popstate] Menutup modal...');
            closeModalImmediate(topModal); 
            overlayClosed = true; 
        }
        else if (isMobileDetailOpen) { 
            if (stateHasDetailView) {
                console.log('[Popstate] Navigasi internal panel mobile. UI sudah di-handle oleh click handler.');
                checkAndRestoreBottomNav();
                return;
            } else {
                console.log('[Popstate] Menutup mobile detail pane (keluar dari panel).');
                hideMobileDetailPageImmediate(); 
                overlayClosed = true; 
            }
        }
        else if (isDesktopDetailOpen && !stateHasDetailView) {
            console.log('[Popstate] Menutup desktop detail pane...');
            closeDetailPaneImmediate(); 
            overlayClosed = true; 
        }

        if (overlayClosed) { 
            console.log('[Popstate] Overlay ditutup, memulihkan bottom nav dan return.');
            checkAndRestoreBottomNav(); 
            return;
        }

        if (appState.activePage === 'absensi' && statePage !== 'absensi') { emit('ui.selection.deactivate'); }
        if (appState.activePage !== statePage) { 
            console.log(`[Popstate] Navigasi halaman: ${appState.activePage} -> ${statePage}`);
            handleNavigation(statePage, { source: 'history', push: false }); 
        } else {
             console.log(`[Popstate] Tidak ada navigasi halaman, statePage (${statePage}) sama dengan activePage (${appState.activePage}).`);
        }
    }, { signal });

    on('app.unload', cleanupPopstateListener);
}

on('auth.loggedOut', cleanupPopstateListener);

export { renderPageContent, navigate, initRouter };
