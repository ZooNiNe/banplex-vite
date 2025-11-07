/*
 * pullToRefresh.js
 * Modul Pull-to-Refresh (PTR) kustom v2.
 *
 * Logika baru:
 * - 'triggerElement': Elemen yang didengarkan (misal: toolbar).
 * - 'scrollElement': Elemen yang diperiksa scrollTop-nya (misal: konten).
 * - 'pushDownElement': (Opsional) Elemen yang didorong ke bawah (misal: page-container).
 */

let startY = 0;
let diffY = 0;
let isDragging = false;
let isRefreshing = false;
let pullThreshold = 70; // Jarak tarikan minimum (px) untuk trigger refresh

// Referensi elemen
let triggerEl = null;
let scrollEl = null;
let indicatorContainer = null;
let indicatorEl = null;
let pushDownEl = null; // Elemen yang didorong ke bawah (opsional)

let onRefreshCallback = null;

// Simpan referensi ke event listeners
let touchStartListener = null;
let touchMoveListener = null;
let touchEndListener = null;

/**
 * Membuat elemen indikator PTR
 */
function createIndicator() {
    if (!indicatorContainer) return;
    indicatorContainer.innerHTML = `
        <div class="ptr-indicator">
            <div class="ptr-spinner"></div>
        </div>
    `;
    indicatorEl = indicatorContainer.querySelector('.ptr-indicator');
}

/**
 * Menangani awal sentuhan
 * @param {TouchEvent} e
 */
function handleTouchStart(e) {
    if (isRefreshing || !scrollEl) return;

    // INI LOGIKA KUNCI: Cek scrollTop dari elemen scroll,
    // meskipun listener ada di elemen trigger.
    if (Math.ceil(scrollEl.scrollTop) === 0) {
        startY = e.touches[0].pageY;
        isDragging = true;
        indicatorEl.classList.remove('refreshing', 'pulling');
        
        // Atur transisi 'pull' yang cepat
        const pullTransition = 'transform 0.1s linear, opacity 0.1s linear';
        indicatorEl.style.transition = pullTransition;
        if (pushDownEl) {
            pushDownEl.style.transition = 'transform 0.1s linear';
        }
    }
}

/**
 * Menangani pergerakan sentuhan (tarikan)
 * @param {TouchEvent} e
 */
function handleTouchMove(e) {
    if (!isDragging || isRefreshing) return;

    diffY = e.touches[0].pageY - startY;

    // Hanya proses jika menarik ke bawah
    if (diffY > 0) {
        
        // Cek pengaman kedua: jika konten mulai scroll, batalkan
        if (scrollEl.scrollTop > 5) {
            isDragging = false;
            hideIndicator();
            return;
        }
        
        // Mencegah scroll standar browser saat menarik
        e.preventDefault();

        let pullDistance = Math.min(diffY, pullThreshold + 20);
        let pullProgress = Math.min(diffY / pullThreshold, 1);
        
        // 1. Animasikan Indikator
        indicatorEl.style.transform = `translateY(calc(-100% + ${pullDistance}px))`;
        indicatorEl.style.opacity = pullProgress;
        
        // 2. Animasikan Spinner
        let spinner = indicatorEl.querySelector('.ptr-spinner');
        if (spinner && !isRefreshing) {
            spinner.style.transform = `scale(${pullProgress * 0.8 + 0.2})`;
        }
        
        // 3. (Opsional) Dorong Konten ke Bawah
        if (pushDownEl) {
            pushDownEl.style.transform = `translateY(${pullDistance}px)`;
        }

        if (diffY >= pullThreshold) {
            indicatorEl.classList.add('pulling');
        } else {
            indicatorEl.classList.remove('pulling');
        }
    } else {
        // Jika ditarik ke atas, reset
        isDragging = false;
        diffY = 0;
        hideIndicator();
    }
}

/**
 * Menangani akhir sentuhan (lepas)
 */
function handleTouchEnd() {
    if (!isDragging || isRefreshing) return;
    
    isDragging = false;

    if (diffY >= pullThreshold) {
        startRefresh();
    } else {
        hideIndicator();
    }
    
    diffY = 0;
}

/**
 * Mulai proses refresh
 */
async function startRefresh() {
    isRefreshing = true;
    
    // 1. Atur transisi "snap"
    const snapTransition = 'transform 0.3s ease';
    indicatorEl.style.transition = snapTransition;
    if (pushDownEl) {
        pushDownEl.style.transition = snapTransition;
    }

    // 2. Posisikan Indikator
    indicatorEl.style.transform = 'translateY(0)';
    indicatorEl.classList.add('refreshing');
    indicatorEl.classList.remove('pulling');
    
    // 3. (Opsional) Posisikan Konten
    if (pushDownEl) {
        pushDownEl.style.transform = `translateY(${pullThreshold}px)`;
    }
    
    // 4. Skalakan spinner
    let spinner = indicatorEl.querySelector('.ptr-spinner');
    if (spinner) {
        spinner.style.transform = 'scale(1)';
    }

    // 5. Jalankan Callback
    try {
        if (onRefreshCallback) {
            await onRefreshCallback();
        }
    } catch (err) {
        console.error("PTR callback error:", err);
    } finally {
        setTimeout(() => {
            isRefreshing = false;
            hideIndicator();
        }, 500); // Beri jeda
    }
}

/**
 * Sembunyikan indikator
 */
function hideIndicator() {
    if (indicatorEl) {
        indicatorEl.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
        indicatorEl.style.transform = 'translateY(-100%)';
        indicatorEl.style.opacity = 0;
        indicatorEl.classList.remove('refreshing', 'pulling');
    }
    
    // (Opsional) Kembalikan konten ke atas
    if (pushDownEl) {
        pushDownEl.style.transition = 'transform 0.3s ease';
        pushDownEl.style.transform = 'translateY(0)';
    }
}

/**
 * Helper untuk mendapatkan elemen
 */
function getElement(selector) {
    if (typeof selector === 'string') {
        return document.querySelector(selector);
    }
    return selector;
}

/**
 * Inisialisasi Pull-to-Refresh v2.
 * @param {Object} options
 * @param {HTMLElement|string} options.triggerElement - Elemen untuk 'touchstart' (misal: toolbar).
 * @param {HTMLElement|string} options.scrollElement - Elemen untuk cek 'scrollTop' (misal: konten).
 * @param {HTMLElement|string} options.indicatorContainer - Elemen untuk menampung spinner.
 * @param {Function} options.onRefresh - Callback async.
 * @param {HTMLElement|string} [options.pushDownElement] - (Opsional) Elemen yang didorong ke bawah.
 */
export function initPullToRefresh(options) {
    if (!options || !options.triggerElement || !options.scrollElement || !options.indicatorContainer || !options.onRefresh) {
        console.warn("PTR init failed: Missing required options.");
        return;
    }

    // Hancurkan instance sebelumnya
    destroyPullToRefresh();

    // Set elemen dari options
    triggerEl = getElement(options.triggerElement);
    scrollEl = getElement(options.scrollElement);
    indicatorContainer = getElement(options.indicatorContainer);
    pushDownEl = getElement(options.pushDownElement); // Bisa null
    onRefreshCallback = options.onRefresh;

    if (!triggerEl || !scrollEl || !indicatorContainer) {
        console.warn("PTR init failed: One or more elements not found.", options);
        return;
    }

    createIndicator();

    // Definisikan listeners
    touchStartListener = handleTouchStart;
    touchMoveListener = handleTouchMove;
    touchEndListener = handleTouchEnd;

    // Tambahkan event listeners ke TRIGGER ELEMENT
    triggerEl.addEventListener('touchstart', touchStartListener, { passive: true }); // 'passive: true' karena kita hanya cek, tidak preventDefault di start
    triggerEl.addEventListener('touchmove', touchMoveListener, { passive: false }); // 'passive: false' untuk e.preventDefault()
    triggerEl.addEventListener('touchend', touchEndListener);
    triggerEl.addEventListener('touchcancel', touchEndListener);
    
    console.log("PTR v2 initialized.");
}

/**
 * Hancurkan dan bersihkan event listeners.
 */
export function destroyPullToRefresh() {
    if (triggerEl && touchStartListener) {
        triggerEl.removeEventListener('touchstart', touchStartListener);
        triggerEl.removeEventListener('touchmove', touchMoveListener);
        triggerEl.removeEventListener('touchend', touchEndListener);
        triggerEl.removeEventListener('touchcancel', touchEndListener);
    }

    if (indicatorContainer) {
        indicatorContainer.innerHTML = '';
    }
    
    // Reset style elemen push-down
    if (pushDownEl) {
        pushDownEl.style.transition = 'none';
        pushDownEl.style.transform = 'translateY(0)';
    }

    // Reset state
    triggerEl = null;
    scrollEl = null;
    indicatorContainer = null;
    indicatorEl = null;
    pushDownEl = null;
    onRefreshCallback = null;
    startY = 0;
    diffY = 0;
    isDragging = false;
    isRefreshing = false;
    touchStartListener = null;
    touchMoveListener = null;
    touchEndListener = null;
}