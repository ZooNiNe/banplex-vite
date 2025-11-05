/* js/state/liveQuery.js */

import { appState } from './appState.js';

// PERBAIKAN: Ubah nama 'subscribers' menjadi 'listeners' agar lebih jelas
const listeners = new Map();

let pendingNotifications = new Set();
let batchTimeout = null;

function scheduleNotification(key) {
    pendingNotifications.add(key);
    
    if (batchTimeout) {
        return;
    }

    // Gunakan setTimeout(0) untuk mengelompokkan semua panggilan 'notify'
    // dalam satu tick event loop.
    batchTimeout = setTimeout(() => {
        const keysToNotify = [...pendingNotifications];
        
        pendingNotifications.clear();
        batchTimeout = null;
        
        console.log(`[liveQuery] Notifying batch keys: [${keysToNotify.join(', ')}]`);
        
        // Jalankan semua listener yang relevan
        keysToNotify.forEach(k => {
            const subs = listeners.get(k) || [];
            const data = appState[k] || [];
            
            // Salin array subscriber jika mereka memodifikasi daftar asli saat iterasi
            [...subs].forEach(callback => { 
                try {
                    // Panggil callback dengan (data, key)
                    callback(data, k); 
                } catch (e) {
                    console.error(`Error in liveQuery callback for key "${k}":`, e);
                }
            });
        });
    }, 0); 
}

export function notify(key) {
    if (!key) {
        console.warn('[liveQuery] notify() dipanggil tanpa key.');
        return;
    }
    
    // PERBAIKAN: Normalisasi nama tabel DB (cth: funding_sources)
    // ke nama appState (cth: fundingSources)
    const stateKeyMap = { 
        'funding_sources': 'funding_sources', // DIUBAH: Menjadi snake_case
        'operational_categories': 'operational_categories', // DIUBAH: Menjadi snake_case
        'material_categories': 'material_categories', // DIUBAH: Menjadi snake_case
        'other_categories': 'other_categories', // DIUBAH: Menjadi snake_case
        'funding_creditors': 'funding_creditors', // DIUBAH: Menjadi snake_case
        'attendance_records': 'attendance_records', // DIUBAH: Menjadi snake_case
        'stock_transactions': 'stock_transactions' // DIUBAH: Menjadi snake_case
    };
    const appStateKey = stateKeyMap[key] || key;
    
    scheduleNotification(appStateKey);
}

export function liveQuery(key, callback) {
    if (!key) {
        console.error('[liveQuery] liveQuery dipanggil tanpa key.');
        return { unsubscribe: () => {} };
    }
    
    if (!listeners.has(key)) {
        listeners.set(key, []);
    }
    listeners.get(key).push(callback);

    const unsubscribe = () => {
        const arr = listeners.get(key);
        if (arr) {
            const index = arr.indexOf(callback);
            if (index > -1) arr.splice(index, 1);
        }
    };

    try {
        const currentData = appState[key] || [];
        callback(currentData, key); // Panggilan Awal
    } catch (e) {
        console.error(`Error in initial liveQuery callback for key "${key}":`, e);
    }

    return { unsubscribe };
}

export function liveQueryMulti(keys, callback) {
    if (!keys || keys.length === 0) {
        console.error('[liveQuery] liveQueryMulti dipanggil tanpa keys.');
        return { unsubscribe: () => {} };
    }

    const subscriptions = [];
    
    // --- PERBAIKAN BUG 2 ---
    // Ganti 'batchGuard' (timer) dengan Set untuk mengumpulkan key
    let changedKeysInBatch = new Set();
    let batchGuardTimer = null;

    const debouncedMultiCallback = (data, keyChanged) => {
        changedKeysInBatch.add(keyChanged); // Kumpulkan key yang berubah

        if (batchGuardTimer) return; // Timer sudah di-set, tunggu batch

        // Jadwalkan callback untuk dieksekusi sekali di akhir tick
        batchGuardTimer = setTimeout(() => {
            const keysToNotify = [...changedKeysInBatch]; // Ambil semua key yang berubah
            changedKeysInBatch.clear(); // Bersihkan Set
            batchGuardTimer = null; // Reset timer
            
            try {
                // Panggil callback pengguna dengan array key yang *sebenarnya* berubah
                callback(keysToNotify); 
            } catch (e) {
                console.error(`Error in liveQueryMulti callback:`, e);
            }
        }, 0); // Batch di event loop yang sama
    };
    // --- AKHIR PERBAIKAN BUG 2 ---
    
    keys.forEach(key => {
        if (!listeners.has(key)) {
            listeners.set(key, []);
        }
        listeners.get(key).push(debouncedMultiCallback);
        subscriptions.push({ key, callback: debouncedMultiCallback });
    });

    const unsubscribe = () => {
        // PERBAIKAN: Hapus juga timer jika ada
        if (batchGuardTimer) clearTimeout(batchGuardTimer);
        subscriptions.forEach(sub => {
            const arr = listeners.get(sub.key);
            if (arr) {
                const index = arr.indexOf(sub.callback);
                if (index > -1) arr.splice(index, 1);
            }
        });
    };
    
    try {
        callback(keys); // Panggilan Awal
    } catch (e) {
        console.error(`Error in initial liveQueryMulti callback for keys [${keys.join(', ')}]:`, e);
    }

    return { unsubscribe };
}