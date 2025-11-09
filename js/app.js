import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { auth } from "./config/firebase.js";
import { setupLocalDatabase, localDB } from "./services/localDbService.js";
import { initializeAppSession } from "./services/authService.js";
import { _initQuotaResetScheduler, updateSyncIndicator, syncToServer } from "./services/syncService.js";
import { _initToastSwipeHandler } from "./ui/components/toast.js";
import { initRouter } from "./router.js";
import { initServiceUIBridge } from "./ui/bridges/serviceUIBridge.js";
import { initResizeHandle } from "./ui/components/resizeHandle.js";
import { on, emit } from "./state/eventBus.js";
import { appState } from "./state/appState.js";
import { renderErrorPage } from "./ui/errorScreens.js";
import { subscribeToPushNotifications } from "./services/notificationService.js";


let globalFallbackTimer = null;

function ensureGlobalLoader() {
    let loader = document.getElementById('global-loader');
    if (loader) {
        if (!appState.isReady) {
            loader.style.display = 'flex';
            loader.style.opacity = '1';
        }
        return loader;
    }
    loader = document.createElement('div');
    loader.id = 'global-loader';
    loader.className = 'global-loader';
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
    if (document.documentElement.classList.contains('dark-theme')) {
        loader.style.backgroundColor = 'var(--bg-end, #0f172a)';
    }
    return loader;
}

function updateLoadingMessage(message) {
    const msgElement = document.getElementById('loading-message');
    if (msgElement) {
        msgElement.classList.remove('show');
        setTimeout(() => {
            msgElement.textContent = message;
            msgElement.classList.add('show');
        }, 150);
    }
}

function hideGlobalLoader() {
    if (globalFallbackTimer) {
        clearTimeout(globalFallbackTimer);
        globalFallbackTimer = null;
    }
    const loader = document.getElementById('global-loader');
    if (loader && !loader.classList.contains('hidden')) {
        loader.classList.add('hidden');
        loader.addEventListener('transitionend', () => {
            if (loader.classList.contains('hidden')) {
                loader.style.display = 'none';
            }
        }, { once: true });
        setTimeout(() => {
            if (loader.style.display !== 'none' && loader.classList.contains('hidden')) {
                loader.style.display = 'none';
            }
        }, 600);
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

async function main() {
  const loader = ensureGlobalLoader();
  updateLoadingMessage('Menyiapkan database lokal...');
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/sw-workbox.js');
      console.log('Service Worker berhasil terdaftar:', reg);

      if (reg && reg.waiting) {
        showUpdateNotification(reg);
      }
    } catch (e) {
        console.error('Registrasi Service Worker gagal:', e);
    }
  }

  if (globalFallbackTimer) clearTimeout(globalFallbackTimer);
  globalFallbackTimer = setTimeout(() => {
      updateLoadingMessage("Memuat data... (Ini mungkin butuh waktu lebih lama.)");
  }, 4000);

  try {
    await setupLocalDatabase();
  } catch (dbError) {
      console.error("KRITIS: Gagal total setup database lokal.", dbError);
      hideGlobalLoader();
      renderErrorPage({
          title: "Error Database Kritis",
          message: "Gagal mengakses database lokal. Ini bisa terjadi karena data korup atau mode private browsing. Coba bersihkan data situs Anda dan muat ulang.",
          details: dbError.message,
          illustrationKey: "database-error",
          showRetryButton: true
      });
      return;
  }

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
          return;
      }
  }

  updateLoadingMessage('Menghubungkan...');

  initRouter();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'SHOW_IN_APP_NOTIFICATION') {
        console.log('Menerima notifikasi in-app dari Service Worker:', event.data.payload);
        
        const payload = event.data.payload;
        emit('ui.toast', {
          args: [
            'info', // tipe toast
            payload.body || 'Anda memiliki pembaruan baru.', // pesan
            5000 // durasi
          ]
        });
      }
    });
  }

  initServiceUIBridge();
  _initToastSwipeHandler();
  initResizeHandle();

  // Pre-initialize core click listeners early so login buttons work immediately
  try {
    const { initializeGlobalClickListeners } = await import('./ui/eventListeners/globalClickListeners.js');
    initializeGlobalClickListeners();
  } catch (e) {
    console.warn('Gagal pre-initialize global click listeners:', e);
  }

  on('app.ready', async () => {
    const appShell = document.getElementById('app-shell');
    if (appShell) appShell.style.display = 'flex';
    try {
      const { initializeEventListeners } = await import('./ui/eventListeners/index.js');
      const { initGlobalSearch } = await import('./ui/pages/search.js');
      initializeEventListeners();
      initGlobalSearch();
    } catch (e) {
        console.error("Gagal menginisialisasi listeners atau search:", e);
    }
  });

  onAuthStateChanged(auth, async (user) => {
        console.log('[App Log] onAuthStateChanged triggered. User:', user ? user.uid : 'null');
        if (user) {
            
            try {
                console.log(`[App Log] User ditemukan. Memanggil initializeAppSession. ActivePage saat ini: ${appState.activePage}`);
                updateLoadingMessage('Memuat sesi pengguna...');
                await initializeAppSession(user);
          
                try {
                    console.log("Mencoba mendaftarkan untuk Push Notifications...");
                    await subscribeToPushNotifications();
                } catch (pushError) {
                    console.error("Gagal mendaftar push notifications:", pushError);
                }
    
                hideGlobalLoader();
    
            } catch (initError) {
                console.error("KRITIS: Gagal total inisialisasi sesi.", initError);
                hideGlobalLoader(); 
                
                renderErrorPage({
                    title: "Gagal Memuat Sesi",
                    message: "Tidak dapat memuat data pengguna atau profil Anda. Periksa koneksi internet Anda dan coba lagi.",
                    details: initError.message,
                    illustrationKey: "database-error",
                    showRetryButton: true
                });
            }
          } else {
      console.log("[App Log] Tidak ada user. Merender UI guest.");
      try {
        const { renderUI } = await import('./ui/mainUI.js');
        renderUI();
      } catch (e) {
          console.error("Gagal merender UI guest:", e);
      }
      hideGlobalLoader();
      emit('app.ready');
    }
  });

  _initQuotaResetScheduler();
  try {
    window.addEventListener('online', () => { try { appState.isOnline = true; updateSyncIndicator(); syncToServer({ silent: true }); } catch(_){} });
    window.addEventListener('offline', () => { try { appState.isOnline = false; updateSyncIndicator(); } catch(_){} });
  } catch(_){}

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

main();
