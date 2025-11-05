import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { auth } from "./config/firebase.js";
// MODIFIKASI: Impor localDB dan setupLocalDatabase di sini
import { setupLocalDatabase, localDB } from "./services/localDbService.js";
import { initializeAppSession } from "./services/authService.js";
import { _initQuotaResetScheduler, updateSyncIndicator, syncToServer } from "./services/syncService.js";
import { _initToastSwipeHandler } from "./ui/components/toast.js";
import { initRouter } from "./router.js";
import { initServiceUIBridge } from "./ui/bridges/serviceUIBridge.js";
import { initResizeHandle } from "./ui/components/resizeHandle.js";
import { on, emit } from "./state/eventBus.js";
import { appState } from "./state/appState.js";
// MODIFIKASI: Impor renderErrorPage
import { renderErrorPage } from "./ui/errorScreens.js";

// MODIFIKASI: Tambahkan timer fallback di level modul
let globalFallbackTimer = null;

// Fungsi untuk memastikan elemen loader ada (diperbarui)
function ensureGlobalLoader() {
    let loader = document.getElementById('global-loader');
    if (loader) {
        // Jika sudah ada, pastikan terlihat jika app belum siap
        if (!appState.isReady) { // Anda mungkin perlu menambahkan appState.isReady
            loader.style.display = 'flex';
            loader.style.opacity = '1';
        }
        return loader;
    }

    loader = document.createElement('div');
    loader.id = 'global-loader';
    loader.className = 'global-loader'; // Gunakan kelas untuk styling

    // Konten loader (SVG animasi + pesan)
    loader.innerHTML = `
        <div class="loader-content">
            <div class="loader-logo">
                <svg width="80" height="80" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <linearGradient id="loaderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" class="grad-start" />
                            <stop offset="100%" class="grad-end" />
                        </linearGradient>
                    </defs>
                    <circle class="loader-logo-bg" cx="50" cy="50" r="45" />
                    <circle class="loader-logo-track" cx="50" cy="50" r="40" />
                    <circle class="loader-logo-fg" cx="50" cy="50" r="40" />
                    <text x="50" y="60" text-anchor="middle" class="loader-logo-text">BP</text>
                </svg>
            </div>
            <div class="loader-bar-container">
                <div class="loader-bar"></div>
            </div>
            <p id="loading-message" class="loader-message">Memuat aplikasi...</p>
            <p class="loader-footer">&copy; ${new Date().getFullYear()} BanPlex</p>
        </div>
    `;
    document.body.appendChild(loader);

    // Apply dark theme styles if necessary
    if (document.documentElement.classList.contains('dark-theme')) {
        loader.style.backgroundColor = 'var(--bg-end, #0f172a)';
    }
    return loader;
}

// Fungsi untuk update pesan loading (diperbarui)
function updateLoadingMessage(message) {
    const msgElement = document.getElementById('loading-message');
    if (msgElement) {
        msgElement.classList.remove('show');
        setTimeout(() => {
            msgElement.textContent = message;
            msgElement.classList.add('show');
        }, 150); // Delay kecil untuk efek transisi
    }
}

// Fungsi untuk menyembunyikan loader global (diperbarui)
function hideGlobalLoader() {
    // MODIFIKASI: Hapus timer fallback jika loader disembunyikan
    if (globalFallbackTimer) {
        clearTimeout(globalFallbackTimer);
        globalFallbackTimer = null;
    }
    
    const loader = document.getElementById('global-loader');
    if (loader && !loader.classList.contains('hidden')) {
        loader.classList.add('hidden'); // Tambah kelas .hidden
        loader.addEventListener('transitionend', () => {
            if (loader.classList.contains('hidden')) {
                loader.style.display = 'none'; // Sembunyikan setelah transisi
            }
        }, { once: true });
        // Fallback jika transisi tidak berjalan
        setTimeout(() => {
            if (loader.style.display !== 'none' && loader.classList.contains('hidden')) {
                loader.style.display = 'none';
            }
        }, 600); // Sedikit lebih lama dari durasi transisi
    }
}

function showUpdateNotification(reg) {
    if (document.getElementById('update-notification')) {
        return;
    }
    const notificationHTML = `
      <div class="update-card">
        <div class="update-info">
          <h4>Aplikasi telah diperbarui</h4>
          <p>Mulai ulang untuk versi terbaru.</p>
        </div>
        <button class="btn" id="restart-app-btn">Mulai Ulang</button>
      </div>
    `;
    const notificationElement = document.createElement('div');
    notificationElement.id = 'update-notification';
    notificationElement.innerHTML = notificationHTML;
    document.body.appendChild(notificationElement);

    const restartBtn = document.getElementById('restart-app-btn');
    if (restartBtn && reg && reg.waiting) {
        restartBtn.addEventListener('click', () => {
            restartBtn.disabled = true;
            restartBtn.textContent = 'Memuat ulang...';
            reg.waiting.postMessage({ action: 'skipWaiting' });
        });
    }
    setTimeout(() => {
        notificationElement.classList.add('show');
    }, 100);
}

// Fungsi main aplikasi (DIMODIFIKASI)
async function main() {
  const loader = ensureGlobalLoader(); // Pastikan loader ada
  updateLoadingMessage('Menyiapkan database lokal...'); // Update pesan

  // MODIFIKASI: Tambahkan timer fallback
  if (globalFallbackTimer) clearTimeout(globalFallbackTimer);
  globalFallbackTimer = setTimeout(() => {
      updateLoadingMessage("Memuat data... (Ini mungkin butuh waktu lebih lama.)");
  }, 4000); // 4 detik fallback

  try {
    // 1. Setup DB
    await setupLocalDatabase();
  } catch (dbError) {
      // 2. Handle *critical* DB failure (e.g., private browsing, corrupted)
      console.error("KRITIS: Gagal total setup database lokal.", dbError);
      hideGlobalLoader();
      renderErrorPage({
          title: "Error Database Kritis",
          message: "Gagal mengakses database lokal. Ini bisa terjadi karena data korup atau mode private browsing. Coba bersihkan data situs Anda dan muat ulang.",
          details: dbError.message,
          illustrationKey: "database-error",
          showRetryButton: true
      });
      return; // Hentikan eksekusi
  }

  // 3. Check for "Offline + No Cache"
  if (!navigator.onLine) {
      const projectCount = await localDB.projects.count();
      if (projectCount === 0) {
          console.warn("Offline dan tidak ada data lokal.");
          hideGlobalLoader();
          renderErrorPage({
              title: "Anda Sedang Offline",
              message: "Koneksi internet tidak ditemukan dan tidak ada data lokal yang tersimpan. Harap sambungkan ke internet dan muat ulang.",
              illustrationKey: "offline",
              showRetryButton: true
          });
          return; // Stop
      }
      // Jika kita sampai di sini, artinya kita offline TAPI punya data lokal, jadi lanjutkan.
  }


  updateLoadingMessage('Menghubungkan...'); // Update pesan

  // Inisialisasi komponen lain
  initRouter();
  initServiceUIBridge();
  _initToastSwipeHandler();
  initResizeHandle();

  // Defer event listeners & search init until app is ready
  on('app.ready', async () => {
    const appShell = document.getElementById('app-shell');
    if (appShell) appShell.style.display = 'flex'; // Tampilkan shell utama
    // Impor dan inisialisasi listener & search
    try {
      const { initializeEventListeners } = await import('./ui/eventListeners/index.js');
      const { initGlobalSearch } = await import('./ui/pages/search.js');
      initializeEventListeners();
      initGlobalSearch();
    } catch (e) {
        console.error("Gagal menginisialisasi listeners atau search:", e);
    }
  });

  // Listener status autentikasi
  onAuthStateChanged(auth, async (user) => {
    console.log('[App Log] onAuthStateChanged triggered. User:', user ? user.uid : 'null');
    if (user) {
      console.log(`[App Log] User ditemukan. Memanggil initializeAppSession. ActivePage saat ini: ${appState.activePage}`);
      updateLoadingMessage('Memuat sesi pengguna...'); // Update pesan
      await initializeAppSession(user); // Tunggu sesi selesai
      hideGlobalLoader(); // Sembunyikan loader SETELAH sesi siap
    } else {
      console.log("[App Log] Tidak ada user. Merender UI guest.");
      try {
        const { renderUI } = await import('./ui/mainUI.js');
        renderUI(); // Render UI untuk guest
      } catch (e) {
          console.error("Gagal merender UI guest:", e);
      }
      hideGlobalLoader(); // Sembunyikan loader untuk guest juga
      emit('app.ready'); // Emit ready agar event listener bisa diinisialisasi untuk guest
    }
  });

  // Inisialisasi scheduler & listener online/offline
  _initQuotaResetScheduler();
  try {
    window.addEventListener('online', () => { try { appState.isOnline = true; updateSyncIndicator(); syncToServer({ silent: true }); } catch(_){} });
    window.addEventListener('offline', () => { try { appState.isOnline = false; updateSyncIndicator(); } catch(_){} });
  } catch(_){}

  // Cek Service Worker untuk update
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.waiting) {
        showUpdateNotification(reg);
      }
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    } catch (e) {
        console.warn("Gagal cek service worker:", e);
    }
  }
}

// Jalankan aplikasi
main();


