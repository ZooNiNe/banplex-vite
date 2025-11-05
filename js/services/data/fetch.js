import { appState } from "../../state/appState.js";
import { localDB } from "../localDbService.js";
import { getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { toast } from "../../ui/components/toast.js";

export async function fetchAndCacheData(key, col, order = 'createdAt', signal) {
    try {
        if (!col) {
            console.error(`Koleksi tidak valid untuk kunci: ${key}`);
            if(localDB[key]) {
                appState[key] = await localDB[key].toArray();
            }
            return;
        }

        const q = order ? query(col, orderBy(order, 'desc')) : query(col);

        if (signal?.aborted) {
            console.log(`Fetch for ${key} aborted before Firestore call.`);
            return; // Hentikan jika sudah dibatalkan
        }

        const snap = await getDocs(q); // Pass signal here if supported: getDocs(q, { signal })

        if (signal?.aborted) {
            console.log(`Fetch for ${key} aborted after Firestore call.`);
            return; // Hentikan jika dibatalkan setelah fetch
        }

        const firestoreData = snap.docs.map(d => ({
            id: d.id,
            ...d.data(),
            syncState: 'synced'
        }));

        if (localDB[key]) {
            if (signal?.aborted) {
                console.log(`Fetch for ${key} aborted before Dexie write.`);
                return;
            }
            await localDB[key].bulkPut(firestoreData);
        }

        appState[key] = firestoreData;
        appState.masterDataLastRefreshed[key] = Date.now(); // Update timestamp after successful fetch & cache


    } catch (e) {
        if (e.name === 'AbortError') {
            console.log(`Fetch operation for ${key} was cancelled.`);
            return; // Jangan tampilkan error jika dibatalkan
        }
        console.error(`Gagal memuat data untuk ${key}:`, e);
        if(localDB[key]) {
            appState[key] = await localDB[key].toArray();
        } else {
            appState[key] = appState[key] || [];
        }
    }
};
