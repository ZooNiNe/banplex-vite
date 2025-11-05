import { $ } from '../../utils/dom.js';
import { emit } from '../../state/eventBus.js';

let observerInstance = null;
let currentSentinel = null;
// PERBAIKAN 3: Simpan referensi container scrollable
let scrollableContainerRef = null;

export function initInfiniteScroll(scrollableContainerSelector) {
    // PERBAIKAN 3: Cleanup observer lama jika ada
    cleanupInfiniteScroll();

    const scrollableContainer = $(scrollableContainerSelector);
    if (!scrollableContainer) {
        console.warn(`[InfiniteScroll] Container scrollable tidak ditemukan: ${scrollableContainerSelector}`);
        return null; // Kembalikan null jika gagal
    }
    // PERBAIKAN 3: Simpan referensi container
    scrollableContainerRef = scrollableContainer;

    // Sentinel awal dibuat di sini, tapi akan digantikan oleh yang dari renderTagihanContent
    currentSentinel = document.createElement('div');
    currentSentinel.id = 'infinite-scroll-sentinel-initial'; // Beri ID berbeda
    currentSentinel.style.height = '1px'; // Cukup 1px
    scrollableContainer.appendChild(currentSentinel);

    observerInstance = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            // Hanya trigger jika sentinel yang benar (bukan initial) terlihat
            if (entry.isIntersecting && entry.target.id === 'infinite-scroll-sentinel') {
                console.log("[InfiniteScroll] Sentinel terlihat, meminta data baru..."); // Debug log
                emit('request-more-data');
                // PERBAIKAN: Unobserve sentinel ini setelah ter-trigger
                // agar tidak trigger berulang kali saat skeleton muncul/hilang
                observerInstance.unobserve(entry.target);
                console.log("[InfiniteScroll] Sentinel unobserved after triggering.");
            }
        });
    }, {
        root: scrollableContainer,
        rootMargin: '200px 0px 0px 0px',
        threshold: 0.01
    });

    // Observer instance sudah dibuat, tapi jangan observe sentinel initial di sini
    // observerInstance.observe(currentSentinel); // Hapus baris ini

    console.log(`[InfiniteScroll] Observer dimulai untuk ${scrollableContainerSelector}`); // Debug log
    return observerInstance; // Kembalikan instance observer
}

export function cleanupInfiniteScroll() {
     if (observerInstance) {
        console.log("[InfiniteScroll] Membersihkan observer..."); // Debug log
        observerInstance.disconnect();
        observerInstance = null;
    }
    // Hapus sentinel yang mungkin masih ada
    const existingSentinel = scrollableContainerRef?.querySelector('#infinite-scroll-sentinel');
    if (existingSentinel) existingSentinel.remove();
    const initialSentinel = scrollableContainerRef?.querySelector('#infinite-scroll-sentinel-initial');
    if (initialSentinel) initialSentinel.remove();
    currentSentinel = null;
    scrollableContainerRef = null; // Reset referensi container
}
