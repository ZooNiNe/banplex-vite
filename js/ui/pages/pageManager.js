import { appState } from "../../state/appState.js";
import { $ } from "../../utils/dom.js";
import { _getSkeletonLoaderHTML } from "../components/skeleton.js";
import { isViewer } from "../../utils/helpers.js";
import { ALL_NAV_LINKS } from "../../config/constants.js";
import { loadDataForPage } from "../../services/localDbService.js";
import { emit } from "../../state/eventBus.js";
import { getEmptyStateHTML } from '../components/emptyState.js';

function createIcon(iconName, size = 26, classes = '') {
    const icons = {
        account_balance_wallet: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-wallet ${classes}"><path d="M21 12V7H5a2 2 0 0 1 0-4h14a2 2 0 0 1 2 2v4Z"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2Z"/></svg>`,
        post_add: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-plus-2 ${classes}"><path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"/><polyline points="14 2 14 8 20 8"/><path d="M3 15h6"/><path d="M6 12v6"/></svg>`,
        download: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download ${classes}"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
        person_add: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-plus ${classes}"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>`,
        chat: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-messages-square-icon lucide-messages-square"><path d="M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/><path d="M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1"/></svg>`,
        share: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-share-2 ${classes}"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>`,
        'list-checks': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-list-checks ${classes}"><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg>`,
    };
    return icons[iconName] || '';
}


async function renderPageContent() {
    const { activePage, userStatus } = appState;
    if (userStatus !== 'active') return;

    const fabContainer = $('#fab-container');
    if (fabContainer) {
        fabContainer.innerHTML = '';
    }

    const container = $('.page-container');
    if (!container) return;

    container.className = 'page-container';

    if (['tagihan', 'pemasukan', 'jurnal', 'stok', 'pengeluaran', 'recycle_bin', 'log_aktivitas', 'absensi'].includes(activePage)) {
        container.classList.add('page-container--has-panel');
    }

    const skeletonHTML = _getSkeletonLoaderHTML(activePage);
    container.innerHTML = skeletonHTML;

    let didTransition = false;
    const observer = new MutationObserver(() => {
        if (didTransition) return;
        const hasSkeleton = container.querySelector('.skeleton');
        if (!hasSkeleton && container.innerHTML.trim() !== '') {
            didTransition = true;
            observer.disconnect();
            container.style.opacity = '0';
            requestAnimationFrame(() => {
                container.style.transition = 'opacity 0.1s ease-out';
                container.style.opacity = '1';
                container.addEventListener('transitionend', () => {
                    container.style.transition = '';
                }, { once: true });
            });
        }
    });
    observer.observe(container, { childList: true, subtree: true });

    await new Promise(resolve => setTimeout(resolve, 50));

    try {
        await loadDataForPage(activePage);
    } catch (e) {
    }

    try {
        let pageModule;
        let initFunctionName = `init${activePage.charAt(0).toUpperCase() + activePage.slice(1).replace(/_([a-z])/g, (match, letter) => letter.toUpperCase())}Page`;
        
        switch (activePage) {
            case 'dashboard': pageModule = await import('./dashboard.js'); break;
            case 'pemasukan': pageModule = await import('./pemasukan.js'); break;
            case 'pengeluaran': pageModule = await import('./pengeluaran.js'); break;
            case 'absensi': pageModule = await import('./absensi.js'); break;
            case 'jurnal': pageModule = await import('./jurnal.js'); break;
            case 'stok': pageModule = await import('./stok.js'); break;
            case 'tagihan': pageModule = await import('./tagihan.js'); break;
            case 'komentar':
                initFunctionName = 'initKomentarPage';
                pageModule = await import('./komentar.js');
                break;
            case 'chat':
                initFunctionName = 'initChatPage';
                pageModule = await import('./chat.js');
                break;    
            case 'laporan': pageModule = await import('./laporan.js'); break;
            case 'simulasi': pageModule = await import('./simulasi.js'); break;
            case 'pengaturan': pageModule = await import('./pengaturan.js'); break;
            case 'log_aktivitas':
                 initFunctionName = 'initLogAktivitasPage';
                 pageModule = await import('./log_aktivitas.js');
                 break;
            case 'recycle_bin':
                 initFunctionName = 'initRecycleBinPage';
                 pageModule = await import('./recycleBin.js');
                 break;
            default:
                emit('ui.transitionContent', container, getEmptyStateHTML({ icon: 'error', title: 'Halaman Tidak Ditemukan', desc: 'Halaman yang diminta tidak valid.', illustration: 'lost' }));
                if (activePage !== 'absensi') { restorePageFab(); }
                return;
        }

        if (pageModule && typeof pageModule[initFunctionName] === 'function') {
            await pageModule[initFunctionName]();
        } else {
             emit('ui.transitionContent', container, getEmptyStateHTML({ icon: 'error', title: 'Kesalahan Memuat Halaman', desc: 'Gagal menginisialisasi halaman.' }));
        }

    } catch (e) {
        emit('ui.transitionContent', container, getEmptyStateHTML({ icon: 'error', title: 'Kesalahan Memuat Halaman', desc: `Terjadi masalah saat memuat halaman ${activePage}.` }));
    }
    if (activePage !== 'absensi') {
        restorePageFab();
    }
}
function restorePageFab() {
    const fabContainer = document.getElementById('fab-container');
    if (!fabContainer) return;
    if (typeof isViewer === 'function' && isViewer()) {
        fabContainer.innerHTML = '';
        return;
    }
    const page = appState.activePage;
    
    let fabHTML = '';

    const fabConfigs = {
        pemasukan: { action: 'open-pemasukan-form', icon: 'account_balance_wallet', label: 'Buat Pemasukan', tooltip: 'Tambah Pemasukan Baru' },
        tagihan: { action: 'navigate', nav: 'pengeluaran', icon: 'post_add', label: 'Buat Tagihan', tooltip: 'Buat Pengeluaran / Tagihan Baru' },
        jurnal: { action: 'navigate', nav: 'absensi', icon: 'person_add', label: 'Input Absensi', tooltip: 'Buka Halaman Input Absensi' },
        dashboard: { action: 'navigate', nav: 'komentar', icon: 'chat', label: 'Chat', tooltip: 'Buka Halaman Chat' },
        komentar: { action: 'navigate', nav: 'chat', icon: 'post_add', label: 'Diskusi Baru', tooltip: 'Mulai Diskusi Baru' },
    };

    const config = fabConfigs[page];
    if (config) {
        fabHTML = `
            <button class="fab fab-extended fab-pop-in" data-action="${config.action}" ${config.nav ? `data-nav="${config.nav}"` : ''} data-tooltip="${config.tooltip}">
                ${createIcon(config.icon)}
                <span class="fab-label">${config.label}</span>
            </button>
        `;
    }
    fabContainer.innerHTML = fabHTML;

    if (page === 'absensi') {
        emit('ui.absensi.updateFooter');
    }
}

export { renderPageContent, restorePageFab };
