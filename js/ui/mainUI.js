import { appState } from "../state/appState.js";
import { ALL_NAV_LINKS, BOTTOM_NAV_BY_ROLE } from "../config/constants.js";
import { getAuthScreenHTML, getPendingScreenHTML } from "./authScreens.js";
import { $ } from "../utils/dom.js";
import { renderPageContent } from "./pages/pageManager.js";
import { checkFormDirty, resetFormDirty, closeModal, closeDetailPane, closeAllModals } from "./components/modal.js";
import { emit } from "../state/eventBus.js";
// PERBAIKAN: Impor lengkap untuk onSnapshot
import { onSnapshot, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { commentsCol } from "../config/firebase.js";


function createIcon(iconName, size = 22, classes = '') {
    const icons = {
        dashboard: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-layout-dashboard ${classes}"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`,
        account_balance_wallet: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-wallet ${classes}"><path d="M21 12V7H5a2 2 0 0 1 0-4h14a2 2 0 0 1 2 2v4Z"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2Z"/></svg>`,
        post_add: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-plus-2 ${classes}"><path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"/><polyline points="14 2 14 8 20 8"/><path d="M3 15h6"/><path d="M6 12v6"/></svg>`,
        person_check: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-check ${classes}"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>`,
        summarize: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-book-text ${classes}"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M8 7h6"/><path d="M8 11h8"/></svg>`,
        inventory_2: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-archive ${classes}"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>`,
        receipt_long: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-receipt-text ${classes}"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1Z"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/></svg>`,
        chat: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-messages-square-icon lucide-messages-square"><path d="M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/><path d="M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1"/></svg>`,
        monitoring: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bar-chart-3 ${classes}"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>`,
        payments: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-coins ${classes}"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82-.71-.71A6 6 0 0 1 16.71 13.88Z"/></svg>`,
        settings: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings ${classes}"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2l-.15.1a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l-.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1 0-2l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
        menu: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-panel-right-close-icon lucide-panel-right-close"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/><path d="m8 9 3 3-3 3"/></svg>`,
        menu_open: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-panel-left-open-icon lucide-panel-left-open"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m14 9 3 3-3 3"/></svg>`,
    };
    if (iconName.endsWith('_filled')) {
        const baseIcon = iconName.replace('_filled', '');
        if (icons[baseIcon]) {
            return icons[baseIcon].replace('fill="none"', 'fill="currentColor"');
        }
    }
    return icons[iconName] || '';
}


export function renderSidebar() {
    const { currentUser, userRole, userStatus, pendingUsersCount } = appState;
    const sidebar = $('#sidebar-nav');
    if (!sidebar) return;

    if (!currentUser || userStatus !== 'active') {
        sidebar.style.display = 'none';
        return;
    }
    sidebar.style.display = 'flex';

    const isMobile = window.matchMedia('(max-width: 599px)').matches;
    const sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === '1' && !isMobile;
    const accessibleLinks = ALL_NAV_LINKS.filter(link => link.roles.includes(userRole));

    const navLinksHTML = accessibleLinks.map(link => {
        const isActive = link.id === appState.activePage;
        const isPengaturan = link.id === 'pengaturan';
        const showBadge = isPengaturan && pendingUsersCount > 0 && userRole === 'Owner';
        const iconHTML = createIcon(link.icon, 22);
        return `
            <button class="sidebar-nav-item ${isActive ? 'active' : ''}" data-action="navigate" data-nav="${link.id}" data-tooltip="${link.label}">
                ${iconHTML}
                <span class="nav-text">${link.label}</span>
                ${showBadge ? `<span class="notification-badge">${pendingUsersCount}</span>` : ''}
            </button>
        `;
    }).join('');

    sidebar.innerHTML = `
        <div class="sidebar-header">
            ${isMobile ? '' : '<img src="public/icons-logo.webp" alt="BanPlex Logo" class="sidebar-logo">'}
            <span class="sidebar-app-name">BanPlex</span>
            ${isMobile ? '' : `
                <button class="sidebar-toggle" data-action="toggle-sidebar" data-tooltip="${sidebarCollapsed ? 'Buka Sidebar' : 'Tutup Sidebar'}">
                    ${createIcon(sidebarCollapsed ? 'menu_open' : 'menu', 20)}
                </button>
            `}
        </div>
        <div class="sidebar-nav-list">${navLinksHTML}</div>
        <div class="sidebar-profile">
            <div class="sidebar-profile-info">
                <img src="${currentUser.photoURL}" alt="User Avatar" class="profile-avatar-sm">
                <div class="profile-text">
                    <span class="profile-name-sm">${currentUser.displayName}</span>
                    <span class="profile-email-sm">${currentUser.email}</span>
                </div>
            </div>
        </div>
    `;
}

export function renderBottomNav() {
    const { currentUser, userRole, userStatus, activePage } = appState;
    const bottomNav = $('#bottom-nav');
    if (!bottomNav) return;

    if (!currentUser || userStatus !== 'active') {
        bottomNav.style.display = 'none';
        return;
    }
    bottomNav.style.display = 'flex';

    const navIds = BOTTOM_NAV_BY_ROLE[userRole] || [];
    const navLinksHTML = navIds.map(id => {
        const link = ALL_NAV_LINKS.find(l => l.id === id);
        if (!link) return '';
        const isActive = link.id === activePage;
        const iconHTML = createIcon(isActive ? `${link.icon}_filled` : link.icon, 24);
        return `
            <button class="nav-item ${isActive ? 'active' : ''}" data-action="navigate" data-nav="${link.id}" data-tooltip="${link.label}">
                ${iconHTML}
                <span>${link.label}</span>
            </button>
        `;
    }).join('');

    bottomNav.innerHTML = navLinksHTML;
}

export function handleNavigation(targetPage, options = {}) {
    const { source = 'user', push = true } = options;

    const isOverlayOpen = document.body.classList.contains('modal-open') 
                       || document.body.classList.contains('detail-view-active') 
                       || document.body.classList.contains('detail-pane-open');
    const isMobileSidebarOpen = document.body.classList.contains('mobile-sidebar-open');
    const isDirty = checkFormDirty();

    if (isOverlayOpen && isDirty && source === 'user') {
        emit('ui.modal.create', 'confirmUserAction', {
            title: 'Tinggalkan Halaman?',
            message: 'Perubahan yang belum disimpan akan hilang. Anda yakin ingin pindah halaman?',
            onConfirm: () => {
                resetFormDirty();
                emit('ui.modal.closeAll');
                if (isMobileSidebarOpen) { document.body.classList.remove('mobile-sidebar-open'); }
                setTimeout(() => proceedNavigation(targetPage, push), 50);
            },
            onCancel: () => {}
        });
        return;
    }

    const oldPage = appState.activePage;
    if (oldPage && oldPage !== targetPage) {
        emit(`app.unload.${oldPage}`);
        try { emit('app.unload'); } catch(_) {}
    }

    if (appState.activePage === 'absensi' && targetPage !== 'absensi') {
        emit('ui.selection.deactivate');
    }

    if (isMobileSidebarOpen) {
        document.body.classList.remove('mobile-sidebar-open');
    }

    proceedNavigation(targetPage, push);
}

function proceedNavigation(targetPage, push = true) {
    if (appState.activePage === targetPage && document.getElementById('page-container')?.innerHTML.trim() !== '') return;

    appState.activePage = targetPage;
    localStorage.setItem('lastActivePage', targetPage);

    if (push) {
        try {
            const currentState = history.state || {};
             const pageState = { page: targetPage };
            history.pushState(pageState, '', `#${targetPage}`);
        } catch (_) {}
    }

    emit('ui.modal.closeAll');
    renderUI();

    try {
        document.body.className = (document.body.className || '')
            .split(/\s+/)
            .filter(c => c && !c.startsWith('page-'))
            .join(' ');
        document.body.classList.add(`page-${targetPage}`);
    } catch (_) {}
    renderPageContent();
}

export function renderUI() {
    const { currentUser, userStatus } = appState;
    const pageContainer = $('#page-container');
    
    if (!currentUser) {
        document.body.className = 'guest-mode';
        if (pageContainer) pageContainer.innerHTML = getAuthScreenHTML();
        const sidebar = $('#sidebar-nav');
        if (sidebar) sidebar.style.display = 'none';
        const bottomNav = $('#bottom-nav');
        if (bottomNav) bottomNav.style.display = 'none';
        $('#mobile-sidebar-overlay')?.remove(); 
    } else if (userStatus === 'pending') {
        document.body.className = 'pending-mode';
        if (pageContainer) pageContainer.innerHTML = getPendingScreenHTML();
        const sidebar = $('#sidebar-nav');
        if (sidebar) sidebar.style.display = 'none';
        const bottomNav = $('#bottom-nav');
        if (bottomNav) bottomNav.style.display = 'none';
        
        $('#mobile-sidebar-overlay')?.remove();
    } else if (userStatus === 'active') {
        document.body.className = '';
        const sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === '1';
        document.body.classList.toggle('sidebar-collapsed', sidebarCollapsed);
        renderSidebar();
        renderBottomNav();
        try { ensureGlobalCommentsListener(); } catch(_) {}
        
        // !!! PERBAIKAN DI SINI !!!
        // Hapus baris yang mengosongkan pageContainer.
        // const pageContainer = $('#page-container'); // <-- Dihapus
        // if (pageContainer) pageContainer.innerHTML = ''; // <-- Dihapus
        // !!! AKHIR PERBAIKAN !!!
    }
}

let __commentsUnsub;
function ensureGlobalCommentsListener() {
    if (__commentsUnsub) return;
    try {
        const qRef = query(commentsCol, orderBy('createdAt', 'desc'), limit(500));
        __commentsUnsub = onSnapshot(qRef, (snap) => {
            const list = [];
            snap.forEach(doc => {
                const data = doc.data();
                list.push({ id: doc.id, ...data });
            });
            appState.comments = list;
            emit('ui.dashboard.updateCommentsBadge');
        }, (err) => {
            console.warn('Comments listener error:', err?.code || err);
        });
    } catch (e) {
        console.warn('Gagal memulai global comments listener:', e);
    }
}