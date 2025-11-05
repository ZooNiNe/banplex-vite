import { emit,on } from "../../state/eventBus.js";
import { appState } from "../../state/appState.js";
import { handleNavigation, renderSidebar } from "../mainUI.js";
import { checkFormDirty, resetFormDirty } from "../components/modal.js";

let navigationController = null;

function cleanupNavigationListeners() {
    if (navigationController) {
        navigationController.abort();
        navigationController = null;

    }
}

function proceedTagihanTabSwitch(mainTabsContainer, tabButton) {
    mainTabsContainer.querySelector('.sub-nav-item.active')?.classList.remove('active');
    tabButton.classList.add('active');
    appState.activeSubPage.set('tagihan', tabButton.dataset.tab);
    appState.billsFilter.category = 'all';

    const categoryNav = document.getElementById('category-sub-nav-container');
    if (categoryNav) {
        categoryNav.querySelector('.sub-nav-item.active')?.classList.remove('active');
        categoryNav.querySelector('.sub-nav-item[data-tab="all"]')?.classList.add('active');
    }
    emit('ui.tagihan.renderContent');
}

export function initializeNavigationListeners() {
    cleanupNavigationListeners();
    navigationController = new AbortController();
    const { signal } = navigationController;

    document.body.addEventListener('click', (e) => {
        const tabBtn = e.target.closest('.sub-nav-item');
        if (!tabBtn) return;

        const mainTabsContainer = e.target.closest('#tagihan-tabs');
        const categoryTabsContainer = e.target.closest('#category-sub-nav-container');

        if (mainTabsContainer) {
            if (tabBtn.classList.contains('active')) return;
            const isDirty = checkFormDirty();
            const isOverlayOpen = document.body.classList.contains('detail-view-active') || document.body.classList.contains('detail-pane-open');
             if (isOverlayOpen && isDirty) {
                 emit('ui.modal.create', 'confirmUserAction', {
                     title: 'Tinggalkan Form?', message: 'Perubahan belum disimpan. Pindah tab?',
                     onConfirm: () => { resetFormDirty(); proceedTagihanTabSwitch(mainTabsContainer, tabBtn); },
                     onCancel: () => {}
                 });
             } else proceedTagihanTabSwitch(mainTabsContainer, tabBtn);
        } else if (categoryTabsContainer) {
            if (tabBtn.classList.contains('active')) return;
            categoryTabsContainer.querySelector('.sub-nav-item.active')?.classList.remove('active');
            tabBtn.classList.add('active');
            appState.billsFilter.category = tabBtn.dataset.tab;
            emit('ui.tagihan.renderContent');
        }
    }, { signal });

    const bottomNav = document.getElementById('bottom-nav');
    if (bottomNav) bottomNav.addEventListener('click', (e) => { e.target.closest('.nav-item')?.dataset.nav && handleNavigation(e.target.closest('.nav-item').dataset.nav); }, { signal });

    const sidebarEl = document.getElementById('sidebar-nav');
    if (sidebarEl) {
        sidebarEl.addEventListener('click', (e) => {
            const toggleBtn = e.target.closest('[data-action="toggle-sidebar"]');
            if (toggleBtn) {
                const nowCollapsed = !document.body.classList.contains('sidebar-collapsed');
                document.body.classList.toggle('sidebar-collapsed', nowCollapsed);
                try { localStorage.setItem('sidebarCollapsed', nowCollapsed ? '1' : '0'); } catch (_) {}
                renderSidebar(); return;
            }
            const item = e.target.closest('.sidebar-nav-item');
            if (item) { const isMobile = window.matchMedia('(max-width: 599px)').matches; if (isMobile) { document.body.classList.remove('mobile-sidebar-open'); } handleNavigation(item.dataset.nav); }
        }, { signal });
    }
     on('app.unload', cleanupNavigationListeners);
}

on('auth.loggedOut', cleanupNavigationListeners);
