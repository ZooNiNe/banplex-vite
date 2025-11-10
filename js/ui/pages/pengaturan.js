import { appState } from '../../state/appState.js';
import { $ } from '../../utils/dom.js';
import { createPageToolbarHTML } from '../components/toolbar.js';
import { emit, on } from '../../state/eventBus.js';
import { checkFormDirty, resetFormDirty } from '../components/modal.js';

function createIcon(iconName, size = 22, classes = '') {
    const icons = {
        dark_mode: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-moon ${classes}"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
        light_mode: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sun ${classes}"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`,
        group: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-users ${classes}"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
        database: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-database ${classes}"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`,
        hard_hat: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-wrench ${classes}"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
        history: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-history ${classes}"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>`,
        trash: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash ${classes}"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
        logout: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-log-out ${classes}"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`,
        chevron_right: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right ${classes}"><path d="m9 18 6-6-6-6"/></svg>`,
    };
    return icons[iconName] || '';
}

function renderPengaturanContent() {
    const container = $('#sub-page-content');
    if (!container) return;

    const user = appState.currentUser;
    const profileHTML = `
        <div class="profile-card-settings card">
            <img src="${user.photoURL || './public/icons-logo.png'}" alt="Avatar" class="profile-avatar">
            <h4 class="profile-name-sm">${user.displayName}</h4>
            <p class="profile-email-sm">${user.email}</p>
            <span class="profile-role-badge">${appState.userRole}</span>
            <button class="theme-toggle-btn" id="theme-toggle-btn" data-action="toggle-theme" title="Toggle Tema">
                ${createIcon(document.documentElement.classList.contains('dark-theme') ? 'dark_mode' : 'light_mode', 20)}
            </button>
        </div>
    `;

    const settingsItems = [
        { title: 'Akun', items: [
            { label: 'Manajemen Pengguna', action: 'manage-users', icon: 'group', role: ['Owner'] },
        ]},
        { title: 'Data', items: [
            { label: 'Kelola Master Data', action: 'navigate', nav: 'master_data', icon: 'database', role: ['Owner', 'Editor'] },
            { label: 'Log Aktivitas', action: 'navigate', nav: 'log_aktivitas', icon: 'history', role: ['Owner', 'Editor', 'Viewer'] },
            { label: 'Keranjang Sampah', action: 'navigate', nav: 'recycle_bin', icon: 'trash', role: ['Owner', 'Editor'] }
        ]},
        { title: 'Utilitas', items: [
            { label: 'Tools Aplikasi', action: 'open-tools-grid', icon: 'hard_hat', role: ['Owner', 'Editor'] },
        ]},
        { title: '', items: [
            { label: 'Keluar', action: 'auth-action', icon: 'logout', role: ['Owner', 'Editor', 'Viewer'] }
        ]}
    ];

    const settingsHTML = settingsItems.map(group => {
        const groupItems = group.items
            .filter(item => item.role.includes(appState.userRole))
            .map(item => `
                <button class="settings-list-item" data-action="${item.action}" ${item.type ? `data-type="${item.type}"` : ''} ${item.nav ? `data-nav="${item.nav}"` : ''}>
                    <div class="icon-wrapper">${createIcon(item.icon)}</div>
                    <span class="label">${item.label}</span>
                    ${createIcon('chevron_right', 20, 'chevron-icon')}
                </button>
            `).join('');
        return groupItems ? `<h5 class="settings-group-title">${group.title}</h5><div class="settings-list">${groupItems}</div>` : '';
    }).join('');

    container.innerHTML = profileHTML + settingsHTML;
}

function initPengaturanPage() {
    const container = $('.page-container');
    container.innerHTML = `
        <div class="content-panel settings-panel">
            <div class="panel-header">
                ${createPageToolbarHTML({ title: 'Pengaturan' })}
            </div>
            <div id="sub-page-content" class="scrollable-content has-padding"></div>
        </div>
    `;
    emit('ui.pengaturan.renderContent');


    const tabsContainer = container.querySelector('#pengaturan-tabs');
    if (tabsContainer) {
        tabsContainer.addEventListener('click', (e) => {
            const tabButton = e.target.closest('.sub-nav-item');
            if (tabButton && !tabButton.classList.contains('active')) {
                const newTabId = tabButton.dataset.tab;
                const detailPane = document.getElementById('detail-pane');
                const isDirty = checkFormDirty();

                if (detailPane && detailPane.querySelector('form') && isDirty) {
                    emit('ui.modal.create', 'confirmUserAction', {
                        title: 'Tinggalkan Form?',
                        message: 'Perubahan yang belum disimpan akan hilang. Anda yakin ingin pindah tab?',
                        onConfirm: () => {
                            resetFormDirty();
                            proceedTabSwitch(tabsContainer, tabButton, newTabId);
                        },
                        onCancel: () => {}
                    });
                } else {
                    proceedTabSwitch(tabsContainer, tabButton, newTabId);
                }
            }
        });
    }
}

function proceedTabSwitch(tabsContainer, tabButton, newTabId) {
    const currentActive = tabsContainer.querySelector('.sub-nav-item.active');
    if(currentActive) currentActive.classList.remove('active');
    tabButton.classList.add('active');
    appState.activeSubPage.set('pengaturan', newTabId);
    emit('ui.pengaturan.renderContent');
}



function renderPengaturanSection() {
    renderPengaturanContent();
}

on('ui.pengaturan.renderContent', renderPengaturanSection);
export { initPengaturanPage };
