import { emit, on } from "../../state/eventBus.js";
import { appState } from "../../state/appState.js";
import { updateSyncIndicator, checkAndPushQueuedData } from "../../services/syncService.js";
import { showLoadingModal, hideLoadingModal, updateLoadingModal } from "../components/modal.js";

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

                if (!silent) {
                    if (!document.getElementById('global-loading-modal')) {
                        showLoadingModal('Sinkronisasi data...', pctClamped);
                    } else {
                        updateLoadingModal('Sinkronisasi data...', pctClamped);
                    }
                }

                if (capsule) hideCapsule(capsule);
                if (__capsuleTimer) { clearTimeout(__capsuleTimer); __capsuleTimer = null; }
                return;
            }

            hideLoadingModal();

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

    window.addEventListener('online', () => {
        try {
            (window.appState || appState).isOnline = true;
            updateSyncIndicator();
            checkAndPushQueuedData({ silent: true, showModalOnBlock: true, forceQuotaRetry: true }).catch((err) => console.error('Auto sync on reconnect failed:', err));
        } catch(_) {}
    });
    window.addEventListener('offline', () => {
        try {
            (window.appState || appState).isOnline = false;
            updateSyncIndicator();
            checkAndPushQueuedData({ silent: true, showModalOnBlock: true }).catch((err) => console.error('Queue check on offline failed:', err));
        } catch(_) {}
    });

    try {
        checkAndPushQueuedData({ silent: true, showModalOnBlock: true }).catch((err) => console.error('Initial queue check failed:', err));
    } catch (_) {}
}
