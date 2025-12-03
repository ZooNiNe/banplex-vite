import { appState } from '../../state/appState.js';

function createIcon(iconName, size = 22, classes = '') {
    const icons = {
        bell: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bell ${classes}"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`,
        search: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search ${classes}"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
        more_vert: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-more-vertical ${classes}"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>`,
        menu_open: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-panel-left-open-icon lucide-panel-left-open"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m14 9 3 3-3 3"/></svg>`,
        landmark: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-landmark ${classes}"><line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>`,
        download: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download ${classes}"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
        'check-square': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-square ${classes}"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`, // Revisi: Pastikan ikon check-square ada
        settings: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings ${classes}"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2l-.15.1a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l-.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1 0-2l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
        layout: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-layout-grid ${classes}"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`,
        filter_list: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-filter ${classes}"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
        sort: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-up-down ${classes}"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg>`,
        payments: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-wallet ${classes}"><path d="M20 7H7a2 2 0 0 1 0-4h13"/><path d="M7 3v4"/><rect x="3" y="7" width="18" height="14" rx="2"/></svg>`,
        'check-check': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-check ${classes}"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg>`,
    };
    if (iconName.endsWith('_filled')) {
        const baseIcon = iconName.replace('_filled', '');
        if (icons[baseIcon]) {
            return icons[baseIcon].replace('fill="none"', 'fill="currentColor"');
        }
    }
    return icons[iconName] || '';
}

export function createPageToolbarHTML({ title, searchId, searchPlaceholder, actions = [], isTransparent = false }) {
    const validActions = Array.isArray(actions) ? actions : [];

    const actionsHTML = validActions.map(action => `
        <button
            class="btn-icon icon-btn"
            data-action="${action.action}"
            ${action.nav ? `data-nav="${action.nav}"` : ''}
            ${action.type ? `data-type="${action.type}"` : ''}
            id="${action.id || ''}"
            data-tooltip="${action.label || action.title || ''}"
        >
            ${createIcon(action.icon, action.size || 22)}
        </button>
    `).join('');

    // Update: Tambahkan 'pemasukan' ke dalam Set ini
    const pagesWithoutMoreVert = new Set([
        'pengeluaran', 
        'pemasukan_form', 
        'hrd_applicants_form', 
        'hrd_applicants', 
        'file_storage', 
        'file_storage_form', 
        'pengaturan', 
        'jurnal', 
        'dashboard', 
        'laporan', 
        'absensi', 
        'simulasi', 
        'log_aktivitas', 
        'stok',
        'mutasi', // Added
        'master_data'
    ]);
    
    const showMoreVert = !pagesWithoutMoreVert.has(appState.activePage) && !validActions.some(a => a.action === 'open-page-overflow');

    const moreVertButtonHTML = showMoreVert ? `
        <button class="btn-icon header-overflow-trigger" data-action="open-page-overflow" data-tooltip="Opsi Lainnya">
            ${createIcon('more_vert')}
        </button>
    ` : '';

    const toolbarClass = isTransparent ? 'toolbar' : 'toolbar sticky-toolbar';

    const showSearch = appState.activePage === 'tagihan';
    const searchButtonHTML = showSearch ? `
        <button class="btn-icon" data-action="open-global-search" data-tooltip="Cari">
            ${createIcon('search')}
        </button>
    ` : '';

    const mobileSidebarToggleHTML = `
        <button class="btn-icon mobile-sidebar-toggle" data-action="toggle-sidebar" data-tooltip="Menu">
            ${createIcon('menu_open')}
        </button>
    `;

    return `
        <div class="${toolbarClass}">
            <div class="toolbar-standard-actions">
                <div class="page-label">
                    ${mobileSidebarToggleHTML}
                    <div class="title-group">
                        <h4 id="page-label-name" class="page-name">${title}</h4>
                    </div>
                </div>
                <div class="header-actions">
                    ${actionsHTML}
                    ${searchButtonHTML}
                    ${moreVertButtonHTML}
                </div>
            </div>
        </div>
    `;
}
