import { $ } from "../../utils/dom.js";
import { getModalLayout } from "./modalContent.js";
import { attachModalEventListeners } from "./modalEventListeners.js";
import { appState } from "../../state/appState.js";
import { restorePageFab } from "../pages/pageManager.js";
import { initCustomSelects, formatNumberInput } from "./forms/index.js";
// PERUBAHAN: Impor setCommentsScope
import { setCommentsScope } from "../../services/syncService.js";
import { getEmptyStateHTML } from "./emptyState.js";
import { emit } from "../../state/eventBus.js";

function createIcon(iconName, size = 20, classes = '') {
    const icons = {
        x: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x ${classes}"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
        'arrow-left': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left ${classes}"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>`,
    };
    return icons[iconName] || '';
}

let isFormDirty = false;

export function markFormDirty(dirty = true) {
    if (dirty && !isFormDirty) {
        console.log("Form marked dirty");
        isFormDirty = true;
    } else if (!dirty && isFormDirty) {
        console.log("Form marked clean");
    }
}

export function resetFormDirty() {
    if (isFormDirty) {
        console.log("Form dirtiness reset");
        isFormDirty = false;
    }
}

export function checkFormDirty() {
    return isFormDirty;
}

function confirmClose(element, proceedAction) {
    if (!element || element.dataset.forceClose === 'true' || element.dataset.utilityModal === 'true') {
        resetFormDirty();
        proceedAction();
        return;
    }

    // Jangan tampilkan konfirmasi untuk dialog konfirmasi itu sendiri
    if (element.id.startsWith('confirm')) {
        proceedAction();
        return;
    }

    const hasForm = element.querySelector('form');
    if (hasForm && isFormDirty) {
        emit('ui.modal.create', 'confirmUserAction', {
            title: 'Batalkan Aksi?',
            message: 'Perubahan yang belum disimpan akan hilang. Anda yakin ingin keluar?',
            isUtility: true, // Pastikan dialog konfirmasi adalah utility
            onConfirm: () => {
                resetFormDirty();
                proceedAction();
            },
            onCancel: () => {}
        });
    } else {
        resetFormDirty();
        proceedAction();
    }
}


export function closeModalImmediate(modalEl) {
    if (!modalEl || !modalEl.parentNode) return;
    const modalId = modalEl.id || '';

    // --- PERUBAHAN: Tambahkan cleanup scope komentar ---
    if (modalId === 'actionsPopup-modal' && modalEl.classList.contains('is-chat-sheet')) {
        try {
            console.log("[Modal] Menutup chat bottom sheet, membersihkan scope komentar.");
            setCommentsScope(null); 
        } catch (_) {}
    }
    // --- AKHIR PERUBAHAN ---

    try {
        if (modalEl.__controller) {
            console.log(`[Modal Cleanup] Aborting controller for modal: ${modalId}`);
            modalEl.__controller.abort();
            delete modalEl.__controller;
        }
    } catch (e) {
        console.warn(`[Modal Cleanup] Error aborting controller for ${modalId}:`, e);
    }
    modalEl.classList.remove('show');

    const handleTransitionEnd = () => {
        if (modalEl.parentNode) {
            modalEl.remove();
        }
        emit('ui.modal.closed', modalId);
        checkAndRestoreBottomNav();
        resetFormDirty();
    };

    // Fallback jika transisi tidak terdeteksi (mis. elemen sudah tersembunyi)
    const fallbackTimeout = setTimeout(handleTransitionEnd, 350);

    modalEl.addEventListener('transitionend', () => {
        clearTimeout(fallbackTimeout);
        handleTransitionEnd();
    }, { once: true });

    // Jika elemen sudah tidak terlihat, langsung hapus
    if (getComputedStyle(modalEl).opacity === '0') {
         clearTimeout(fallbackTimeout);
         handleTransitionEnd();
    }
}

export function createModal(type, data = {}) {
    if (data.replace) {
        closeAllModals();
    }

    const fabContainer = $('#fab-container');
    if (fabContainer) {
        fabContainer.innerHTML = '';
    }

    let modalContainer = $('#modal-container');
    if (!modalContainer) {
      modalContainer = document.createElement('div');
      modalContainer.id = 'modal-container';
      document.body.appendChild(modalContainer);
    }
    document.body.classList.add('modal-open');
    checkAndRestoreBottomNav();

    const modalEl = document.createElement('div');
    modalEl.id = `${type}-modal`;

    const { layoutClass, contentHTML } = getModalLayout(type, data);
    modalEl.className = `modal-bg ${layoutClass}`;
    modalEl.innerHTML = contentHTML;

    // Tandai modal sebagai 'utility' jika flag-nya ada
    if (data.isUtility) {
         modalEl.dataset.utilityModal = 'true';
    }

    const controller = new AbortController();
    modalEl.__controller = controller;
    const { signal } = controller;

    try {
        const routerReady = typeof window !== 'undefined' && window.__banplex_history_init === true;
        
        // *** PERUBAHAN DI SINI ***
        // Hanya push history jika BUKAN utility modal
        if (routerReady && !data.isUtility) {
            const currentState = history.state || { page: appState.activePage };
            const isOverlayOnOverlay = currentState.modal || currentState.detailView;
            const isSuccess = data.isSuccessPanel === true;
            // Ganti state jika sudah ada overlay, push jika belum
            const historyAction = isOverlayOnOverlay || isSuccess ? 'replaceState' : 'pushState';
            history[historyAction]({ ...currentState, modal: true, modalType: type, isSuccessPanel: isSuccess }, '');
        }
        // *** AKHIR PERUBAHAN ***

    } catch (_) {
        console.warn("History state update failed for modal.");
    }

    modalContainer.appendChild(modalEl);
    setTimeout(() => {
        modalEl.classList.add('show');
    }, 10);

    // Menutup modal jika mengklik background (hanya untuk non-utility)
    modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl) {
            closeModal(modalEl);
        }
    }, { signal });

    // Pasang listener untuk tombol "Batal" / "Ya, Lanjutkan"
    // Gunakan history.back() sebagai aksi tutup default untuk modal non-utility
    attachModalEventListeners(type, data, () => history.back(), modalEl, signal);

    const formInsideModal = modalEl.querySelector('form');
    if (formInsideModal) {
        resetFormDirty();
        const dirtyListener = () => markFormDirty(true);
        formInsideModal.addEventListener('input', dirtyListener, { signal });
        formInsideModal.addEventListener('change', dirtyListener, { signal, capture: true });
        // Initialize client-side validation and input formatters for forms inside modals
        try { emit('ui.forms.init', modalEl); } catch (_) {}
    } else {
        resetFormDirty();
    }

    return modalEl;
}

export function closeModal(modalEl) {
    if (!modalEl) return;
    const modalId = modalEl.id || 'unknown';
    
    confirmClose(modalEl, () => {
        if (modalEl.dataset.utilityModal === 'true') {
            closeModalImmediate(modalEl);
        } else {
            modalEl.classList.remove('show');
            
            if (history.state?.modal) {
                history.back();
            } else {
                closeModalImmediate(modalEl);
            }
        }
    });
}


export function showDetailPane({ title, subtitle, content, footer, headerActions, fabHTML, isMasterDataGrid = false, paneType = '', isSuccessPanel = false }, isGoingBack = false) {
    const isMobile = window.matchMedia('(max-width: 599px)').matches;
    if (isMobile) {
        return showMobileDetailPage({ title, subtitle, content, footer, headerActions, fabHTML, isMasterDataGrid, paneType, isSuccessPanel }, isGoingBack);
    }

    try { const fab = document.getElementById('fab-container'); if (fab) fab.innerHTML = ''; } catch(_) {}

    const detailPane = document.getElementById('detail-pane');
    if (!detailPane) return null;

    // Abort controller sebelumnya jika ada
    if (detailPane.__controller) {
        console.log('[Detail Pane Cleanup] Aborting previous controller for desktop pane.');
        detailPane.__controller.abort();
        delete detailPane.__controller;
    }
    // Buat controller baru untuk panel ini
    const controller = new AbortController();
    detailPane.__controller = controller;
    const { signal } = controller;

    detailPane.dataset.isMasterDataGrid = isMasterDataGrid;
    detailPane.dataset.paneType = paneType;
    detailPane.dataset.isSuccessPanel = isSuccessPanel;

    if (!isGoingBack) {
        const currentState = history.state || { page: appState.activePage };
        const isOverlayOnOverlay = currentState.modal || currentState.detailView;
        const historyAction = isOverlayOnOverlay || isSuccessPanel || isMasterDataGrid ? 'replaceState' : 'pushState';
        try {
            history[historyAction]({ ...currentState, detailView: true, pane: 'desktop', paneType, isMasterDataGrid, isSuccessPanel }, '');
        } catch (_) {
            console.warn("History state update failed for desktop detail pane.");
        }

        // Simpan state UI sebelumnya jika ini adalah navigasi panel bertingkat
        if (document.body.classList.contains('detail-pane-open') && !isMasterDataGrid && !isSuccessPanel) {
            const fabEl = detailPane.querySelector('.fab');
            const previousState = {
                title: detailPane.querySelector('.detail-pane-header h4')?.textContent,
                content: detailPane.querySelector('.detail-pane-body')?.innerHTML,
                footer: detailPane.querySelector('.detail-pane-footer')?.innerHTML,
                headerActions: detailPane.querySelector('.header-actions')?.innerHTML || '',
                fabHTML: fabEl ? fabEl.outerHTML : '',
                isMasterDataGrid: detailPane.dataset.isMasterDataGrid === 'true',
                paneType: detailPane.dataset.paneType || '',
                isSuccessPanel: detailPane.dataset.isSuccessPanel === 'true'
            };
            appState.detailPaneHistory.push(previousState);
        }
    }

    const hasHistory = appState.detailPaneHistory.length > 0;
    const backOrCloseButtonHTML = hasHistory
        ? `<button class="btn-icon" data-action="detail-pane-back" title="Kembali">${createIcon('arrow-left')}</button>`
        : `<button class="btn-icon" data-action="close-detail-pane" title="Tutup">${createIcon('x')}</button>`;

    detailPane.innerHTML = `
        <div class="detail-pane-header">
             <div class="detail-pane-header-left">
                <h4>${title}</h4>
            </div>
             <div class="detail-pane-header-right">
                <div class="header-actions">${headerActions || ''}</div>
                ${backOrCloseButtonHTML}
            </div>
        </div>
        <div class="detail-pane-body">${content}</div>
        ${footer ? `<div class="detail-pane-footer form-footer-actions">${footer}</div>` : ''}
    `;
    try { emit('ui.forms.init', detailPane); } catch(_) {}
    try {
        const paneForm = detailPane.querySelector('form');
        if (paneForm) {
            const dirtyListener = () => markFormDirty(true);
            paneForm.addEventListener('input', dirtyListener, { signal });
            paneForm.addEventListener('change', dirtyListener, { signal, capture: true });
        }
    } catch(_) {}

    // Jika tombol submit ada di dalam body, hapus footer (karena double)
    try {
        const bodyHasSubmit = !!detailPane.querySelector('.detail-pane-body form button[type="submit"], .detail-pane-body form .btn[type="submit"]');
        if (bodyHasSubmit) {
            const footerEl = detailPane.querySelector('.detail-pane-footer');
            if (footerEl) footerEl.remove();
        }
    } catch(_) {}

    if (fabHTML && typeof fabHTML === 'string') {
        detailPane.insertAdjacentHTML('beforeend', fabHTML);
    }

    document.body.classList.add('detail-pane-open');
    checkAndRestoreBottomNav();

    // Setup form dirty checking
    const formInsidePane = detailPane.querySelector('form');
    if (formInsidePane) {
         if (!isGoingBack) resetFormDirty();
         const dirtyListener = () => markFormDirty(true);
         // Gunakan controller panel untuk listener ini
         formInsidePane.addEventListener('input', dirtyListener, { signal });
         formInsidePane.addEventListener('change', dirtyListener, { signal, capture: true });
    } else {
        if (!isGoingBack) resetFormDirty();
    }
    return detailPane;
}


export function closeDetailPaneImmediate() {
    const detailPane = document.getElementById('detail-pane');
    if (!detailPane) return;

    // Abort controller terkait panel ini
    try {
        if (detailPane.__controller) {
            console.log('[Detail Pane Cleanup] Aborting controller for desktop pane (immediate).');
            detailPane.__controller.abort();
            delete detailPane.__controller;
        }
    } catch (e) {
        console.warn('[Detail Pane Cleanup] Error aborting controller for desktop pane:', e);
    }

    document.body.classList.remove('detail-pane-open');
    appState.detailPaneHistory = [];
    delete detailPane.dataset.isMasterDataGrid;
    delete detailPane.dataset.paneType;
    delete detailPane.dataset.isSuccessPanel;
    resetFormDirty();
    detailPane.innerHTML = ''; // Hapus konten
    checkAndRestoreBottomNav();
}

export function closeDetailPane() {
    const detailPane = document.getElementById('detail-pane');
    if (!detailPane) return;
    
    confirmClose(detailPane, () => {
        document.body.classList.remove('detail-pane-open');
        
        if (history.state?.detailView) {
            history.back();
        } else {
            closeDetailPaneImmediate();
        }
    });
}

export function showMobileDetailPage({ title, subtitle, content, footer, headerActions, fabHTML, isMasterDataGrid = false, paneType = '', isSuccessPanel = false }, isGoingBack = false) {
    const detailPane = $('.detail-pane');
    if (!detailPane) return null;

    // Abort controller sebelumnya jika ada
    if (detailPane.__controller) {
        console.log('[Detail Pane Cleanup] Aborting previous controller for mobile pane.');
        detailPane.__controller.abort();
        delete detailPane.__controller;
    }
    // Buat controller baru untuk panel ini
    const controller = new AbortController();
    detailPane.__controller = controller;
    const { signal } = controller;

    detailPane.dataset.isMasterDataGrid = isMasterDataGrid;
    detailPane.dataset.paneType = paneType;
    detailPane.dataset.isSuccessPanel = isSuccessPanel;

    if (!isGoingBack) {
        const currentState = history.state || { page: appState.activePage };
        const isOverlayOnOverlay = currentState.modal || currentState.detailView;

        const historyAction = isOverlayOnOverlay || isSuccessPanel ? 'replaceState' : 'pushState';
        try {
            history[historyAction]({ ...currentState, detailView: true, pane: 'mobile', paneType, isMasterDataGrid, isSuccessPanel }, '');
        } catch (_) {
            console.warn("History state update failed for mobile detail view.");
        }

        if (document.body.classList.contains('detail-view-active') && !isMasterDataGrid && !isSuccessPanel) {
            const currentFabHTML = detailPane.querySelector('.fab')?.outerHTML || '';
            const previousState = {
                title: detailPane.querySelector('.breadcrumb-nav')?.innerHTML || '',
                subtitle: detailPane.querySelector('.chat-subtitle')?.textContent || null,
                content: detailPane.querySelector('.mobile-detail-content')?.innerHTML || '',
                footer: detailPane.querySelector('.modal-footer')?.innerHTML || '',
                headerActions: detailPane.querySelector('.header-actions')?.innerHTML || '',
                fabHTML: currentFabHTML,
                isMasterDataGrid: detailPane.dataset.isMasterDataGrid === 'true',
                paneType: detailPane.dataset.paneType || '',
                isSuccessPanel: detailPane.dataset.isSuccessPanel === 'true'
            };
            appState.detailPaneHistory.push(previousState);
        }
    }

    let titleHTML = `<strong>${title}</strong>`;
    let iconHTML = ''; // Variabel baru untuk ikon

    // Cek jika judul adalah HTML (untuk Chat)
    if (paneType === 'comments') {
        const titleText = title.replace(/<span.*?>.*?<\/span>/, '').trim();
        const iconMatch = title.match(/(<span class="avatar-badge is-icon">.*?<\/span>)/);
        iconHTML = iconMatch ? iconMatch[1] : ''; // Ekstrak HTML ikon
        titleHTML = `<strong class="chat-title">${titleText}</strong>`; // Judul sekarang hanya teks
    } else {
        titleHTML = `<strong class="chat-title">${title}</strong>`;
    }

    if (subtitle) {
        titleHTML = `
            <div class="title-wrap">
                ${titleHTML}
                <span class="chat-subtitle">${subtitle}</span>
            </div>
        `;
    }

    const hasHistory = appState.detailPaneHistory.length > 0;
    const backOrCloseButtonHTML = hasHistory
        ? `<button class="btn-icon" data-action="detail-pane-back" title="Kembali">${createIcon('arrow-left')}</button>`
        : `<button class="btn-icon" data-action="close-detail-pane" title="Tutup">${createIcon('x')}</button>`;

    // Konten header baru
    const headerHTML = `
    <div class="mobile-detail-header">
        ${backOrCloseButtonHTML}
        ${iconHTML}
        <div class="breadcrumb-nav">
            ${titleHTML}
        </div>
        <div class="header-actions">${headerActions || ''}</div>
    </div>`;
    
    const contentHTML = `<div class="mobile-detail-content">${content}</div>`;
    const isCommentsPane = (paneType === 'comments') || (typeof document !== 'undefined' && document.body.classList.contains('comments-view-active'));
    const footerClass = isCommentsPane ? 'modal-footer comments-footer-actions' : 'modal-footer form-footer-actions';
    const baseFooterHTML = footer ? `<div class="${footerClass}">${footer}</div>` : ``;

    detailPane.innerHTML = headerHTML + contentHTML + baseFooterHTML;

    if (fabHTML && typeof fabHTML === 'string') {
        detailPane.insertAdjacentHTML('beforeend', fabHTML);
    }

    document.body.classList.add('detail-view-active');
    checkAndRestoreBottomNav();

    // Inisialisasi form di dalam panel
    initCustomSelects(detailPane);
    detailPane.querySelectorAll('input[inputmode="numeric"]').forEach(i => i.addEventListener('input', formatNumberInput));

     // Setup form dirty checking
     const formInsidePane = detailPane.querySelector('form');
     if (formInsidePane) {
         if (!isGoingBack) resetFormDirty();
         const dirtyListener = () => markFormDirty(true);
         // Gunakan controller panel untuk listener ini
         formInsidePane.addEventListener('input', dirtyListener, { signal });
         formInsidePane.addEventListener('change', dirtyListener, { signal, capture: true });
     } else {
          if (!isGoingBack) resetFormDirty();
     }

    return detailPane;
}



export function hideMobileDetailPage() {
    const detailPane = $('.detail-pane');
    if (!detailPane) return;

    confirmClose(detailPane, () => {
        document.body.classList.remove('detail-view-active');
        
        if (history.state?.detailView) {
            history.back();
        } else {
            hideMobileDetailPageImmediate();
        }
    });
}

export function hideMobileDetailPageImmediate() {
    const detailPane = document.querySelector('.detail-pane');
    if (!detailPane) return;

    // Abort controller terkait panel ini
    try {
        if (detailPane.__controller) {
            console.log('[Modal Cleanup] Aborting controller for mobile pane (immediate).');
            detailPane.__controller.abort();
            delete detailPane.__controller;
        }
    } catch (e) {
        console.warn('[Modal Cleanup] Error aborting controller for mobile pane:', e);
    }

    document.body.classList.remove('detail-view-active');
    document.body.classList.remove('comments-view-active'); // Pastikan ini juga dibersihkan
    appState.detailPaneHistory = [];
    try { setCommentsScope(null); } catch (_) {}
    delete detailPane.dataset.isMasterDataGrid;
    delete detailPane.dataset.paneType;
    delete detailPane.dataset.isSuccessPanel;
    resetFormDirty();
    detailPane.innerHTML = ''; // Hapus konten
    checkAndRestoreBottomNav();
}

export function closeAllModals() {
    const container = $('#modal-container');
    if (container) {
        const openModals = container.querySelectorAll('.modal-bg');
        // Panggil immediate close untuk semua modal
        openModals.forEach(modal => closeModalImmediate(modal));
    }

    // Ini sudah memanggil ...Immediate()
    if (document.body.classList.contains('detail-pane-open')) {
        closeDetailPaneImmediate();
    }
    if (document.body.classList.contains('detail-view-active')) {
        // PERBAIKAN: Fungsi ini memanggil confirmClose, kita harus panggil immediate
        hideMobileDetailPageImmediate(); 
        
        // Ulangi logika cleanup dari hideMobileDetailPageImmediate untuk memastikan
        resetFormDirty();
        const detailPane = document.querySelector('.detail-pane');
        try {
            if (detailPane && detailPane.__controller) {
                console.log('[Detail Pane Cleanup] Aborting controller on closeAllModals (mobile).');
                detailPane.__controller.abort();
                delete detailPane.__controller;
            }
        } catch (e) {
            console.warn('[Detail Pane Cleanup] Error aborting controller on closeAllModals (mobile):', e);
        }
        document.body.classList.remove('detail-view-active');
        document.body.classList.remove('comments-view-active');
        appState.detailPaneHistory = [];
        try { setCommentsScope(null); } catch (_) {}
        delete detailPane?.dataset.isMasterDataGrid;
        delete detailPane?.dataset.paneType;
        delete detailPane?.dataset.isSuccessPanel;
        if(detailPane) detailPane.innerHTML = '';

        // Jika kita menutup paksa, kita harus cek history
        if (history.state?.detailView && history.state?.pane === 'mobile') {
             // Kita tidak bisa `history.back()` karena itu akan memicu popstate
             // Kita biarkan router.js menangani ini saat navigasi halaman
             console.warn("[closeAllModals] Menutup paksa mobile detail view. History state mungkin tertinggal.");
        }
    }
    resetFormDirty();
    checkAndRestoreBottomNav();
}

export function checkAndRestoreBottomNav() {
     requestAnimationFrame(() => {
        const isModalOpen = !!document.querySelector('#modal-container .modal-bg.show');
        const isDetailPaneOpen = document.body.classList.contains('detail-pane-open');
        const isDetailViewActive = document.body.classList.contains('detail-view-active');
        
        // Halaman chat juga harus menyembunyikan bottom nav
        const isChatPage = appState.activePage === 'chat';
        
        // Overlay = Modal ATAU Panel Desktop ATAU Panel Mobile ATAU Halaman Chat
        const isAnyOverlayOpen = isModalOpen || isDetailPaneOpen || isDetailViewActive || isChatPage;

        // Set body class HANYA untuk modal, bukan untuk panel
        document.body.classList.toggle('modal-open', isModalOpen);

        const bottomNav = document.getElementById('bottom-nav');
        const fabContainer = $('#fab-container');

        if (bottomNav) {
            bottomNav.style.transform = isAnyOverlayOpen ? 'translateY(100%)' : 'translateY(0)';
        }

        if (fabContainer) {
            if (isAnyOverlayOpen) {
                fabContainer.innerHTML = '';
            } else {
                restorePageFab();
            }
        } else if (!isAnyOverlayOpen) {
             restorePageFab();
        }
    });
}

export function handleDetailPaneBack() {
    const detailPane = document.getElementById('detail-pane');
    if (!detailPane) return;

    const isSuccess = detailPane?.dataset.isSuccessPanel === 'true';

    const goBack = () => {
        if (isSuccess) {
            history.back();
            return;
        }

        history.back();
    };

    if (!checkFormDirty()) {
        resetFormDirty();
        goBack();
        return;
    }

    if (checkFormDirty()) {
         emit('ui.modal.create', 'confirmUserAction', {
            title: 'Batalkan Perubahan?',
            message: 'Perubahan yang belum disimpan akan hilang. Anda yakin ingin kembali?',
            isUtility: true, // Pastikan ini utility modal
            onConfirm: () => {
                resetFormDirty();
                goBack(); // Panggil goBack setelah konfirmasi
                return true;
            },
            onCancel: () => {}
        });
    }
}