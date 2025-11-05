import { appState } from "../../state/appState.js";
import { $ } from "../../utils/dom.js";
import { emit } from "../../state/eventBus.js";
import { getEmptyStateHTML } from "../components/emptyState.js";
import { createPageToolbarHTML } from "../components/toolbar.js";
import { loadDataForPage } from "../../services/localDbService.js";
import { getJSDate } from "../../utils/helpers.js";

// Placeholder: Fungsi untuk me-render daftar di desktop
async function renderDesktopCommentList(container) {
    // Muat data jika perlu
    if (!appState.comments) {
        await loadDataForPage('Komentar');
    }

    const allComments = (appState.comments || []).filter(c => !c.isDeleted);
    
    // Kelompokkan berdasarkan parentId
    const threads = allComments.reduce((acc, c) => {
        const key = `${c.parentType}:${c.parentId}`;
        if (!acc[key]) {
            acc[key] = {
                parentId: c.parentId,
                parentType: c.parentType,
                count: 0,
                latest: c.createdAt,
                sample: c.content
            };
        }
        acc[key].count++;
        if (getJSDate(c.createdAt) > getJSDate(acc[key].latest)) {
            acc[key].latest = c.createdAt;
            acc[key].sample = c.content;
        }
        return acc;
    }, {});

    const sortedThreads = Object.values(threads).sort((a, b) => getJSDate(b.latest) - getJSDate(a.latest));

    if (sortedThreads.length === 0) {
        container.innerHTML = getEmptyStateHTML({
            icon: 'message-circle',
            title: 'Belum Ada Komentar',
            desc: 'Semua diskusi dari tagihan, pengeluaran, dan pinjaman akan muncul di sini.'
        });
        return;
    }

    // (Ini hanya contoh render sederhana, Anda bisa sesuaikan)
    container.innerHTML = `
        <div class="item-list">
            ${sortedThreads.map(t => {
                const date = new Date(getJSDate(t.latest)).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
                return `
                    <div class="list-item" data-action="open-comments-view" data-parent-id="${t.parentId}" data-parent-type="${t.parentType}">
                        <div class="item-content">
                            <div class="item-title">${t.parentType} / ${t.parentId.slice(0, 6)}...</div>
                            <div class="item-subtitle">${t.sample ? t.sample.slice(0, 50) + '...' : '...'}</div>
                        </div>
                        <div class="item-meta">
                            <span>${t.count} pesan</span>
                            <span>${date}</span>
                        </div>
                    </div>
                `
            }).join('')}
        </div>
    `;

    // Tambahkan listener untuk membuka chat desktop
    container.addEventListener('click', (e) => {
        const item = e.target.closest('[data-action="open-comments-view"]');
        if (item) {
            appState.chatOpenRequest = { 
                parentId: item.dataset.parentId, 
                parentType: item.dataset.parentType 
            };
            emit('ui.navigate', 'chat');
        }
    });
}


export async function initKomentarPage() {
    const isMobile = window.matchMedia('(max-width: 599px)').matches;
    const container = $('.page-container');
    if (!container) return;

    container.className = 'page-container page-container--has-panel page-komentar';

    if (isMobile) {
        // --- TAMPILAN MOBILE ---
        // Di mobile, halaman ini tidak boleh ada. 
        // Tampilkan pesan & arahkan kembali ke dashboard.
        const toolbarHTML = createPageToolbarHTML({
            title: 'Komentar',
            showNavBack: true,
            navBackTarget: 'dashboard' // Tombol kembali ke dashboard
        });
        
        container.innerHTML = `
            ${toolbarHTML}
            <div class="panel-body scrollable-content">
                ${getEmptyStateHTML({
                    icon: 'message-circle',
                    title: 'Fitur Pindah',
                    desc: 'Fitur komentar kini dapat diakses langsung dari tombol aksi (â‹®) di setiap item tagihan, pengeluaran, atau pinjaman.'
                })}
            </div>
        `;
        
        // Alihkan kembali ke dashboard setelah beberapa detik
        setTimeout(() => {
            if (appState.activePage === 'komentar') {
                emit('ui.navigate', 'dashboard');
            }
        }, 3000);

    } else {
        // --- TAMPILAN DESKTOP ---
        // Tampilkan daftar semua thread komentar
        const toolbarHTML = createPageToolbarHTML({
            title: 'Semua Komentar'
        });

        container.innerHTML = `
            ${toolbarHTML}
            <div id="komentar-list-container" class="panel-body scrollable-content">
                </div>
        `;
        
        // Render daftar thread di desktop
        renderDesktopCommentList($('#komentar-list-container'));
    }
}