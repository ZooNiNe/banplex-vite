import { emit, on } from "../../state/eventBus.js";
import { appState } from "../../state/appState.js";
import { updateSyncIndicator } from "../../services/syncService.js";
import { toast, hideToast } from "../components/toast.js";

let __capsuleTimer = null;
let __lastNet = (typeof navigator !== 'undefined' && navigator.onLine) ? 'online' : 'offline';
const showCapsule = (capsule) => { capsule.classList.remove('hide'); capsule.classList.add('show'); };
const hideCapsule = (capsule) => { capsule.classList.remove('show'); capsule.classList.add('hide'); };

export function initializeSyncIndicatorListeners() {
    on('ui.sync.updateIndicator', () => {
        try {
            const el = document.getElementById('sync-indicator');
            const s = (window.appState || appState);
            let capsule = el ? el.querySelector('.sync-capsule') : null;
            if (el && !capsule) {
                capsule = document.createElement('div');
                capsule.className = 'sync-capsule hide';
                capsule.innerHTML = `<span class="dot"></span><span class="label"></span>`;
                el.insertBefore(capsule, el.firstChild);
            }
            const label = capsule ? capsule.querySelector('.label') : null;

            const syncing = !!(s.isSyncing || (s.syncProgress && s.syncProgress.active));
            const online = !!s.isOnline;
            // PERBAIKAN 2: Baca flag silent
            const silent = !!s.isSilentSync;
            
            if (capsule) capsule.classList.remove('is-online','is-offline','is-syncing');

            if (syncing) {
                const pct = s.syncProgress?.total
                    ? Math.round((s.syncProgress.completed / Math.max(1, s.syncProgress.total)) * 100)
                    : Math.round(s.syncProgress?.percentage || 0);
                const pctClamped = Math.max(0, Math.min(100, pct));

                // PERBAIKAN 2: Hanya tampilkan toast jika tidak silent
                if (!silent) {
                    // Show/update syncing snackbar with percentage and keep it persistent
                    toast('syncing', `Sinkron ${pctClamped}%`, 0, { forceSnackbar: true });
                } else {
                    // Jika silent, pastikan toast sync (jika ada) disembunyikan
                    try { hideToast(); } catch (_) {}
                }

                // Hide header capsule during syncing (we moved indicator to snackbar)
                if (capsule) hideCapsule(capsule);
                if (__capsuleTimer) { clearTimeout(__capsuleTimer); __capsuleTimer = null; }
                return;
            }

            // Not syncing anymore: ensure snackbar is closed
            try { hideToast(); } catch (_) {}

            const nowState = online ? 'online' : 'offline';
            if (nowState !== __lastNet) {
                __lastNet = nowState;
                if (capsule) {
                    capsule.classList.add(online ? 'is-online' : 'is-offline');
                    if (label) label.textContent = online ? 'Online' : 'Offline';
                    showCapsule(capsule);
                }
                if (__capsuleTimer) clearTimeout(__capsuleTimer);
                __capsuleTimer = setTimeout(() => { if (capsule) hideCapsule(capsule); }, 1600);
                return;
            }

            if (capsule) hideCapsule(capsule);
            if (__capsuleTimer) { clearTimeout(__capsuleTimer); __capsuleTimer = null; }
        } catch (e) { console.error(e); }
    });

    window.addEventListener('online', () => { try { (window.appState || appState).isOnline = true; updateSyncIndicator(); } catch(_) {} });
    window.addEventListener('offline', () => { try { (window.appState || appState).isOnline = false; updateSyncIndicator(); } catch(_) {} });
}
