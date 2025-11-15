import { GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { doc, getDoc, setDoc, onSnapshot, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { auth, db, membersCol } from "../config/firebase.js";
import { OWNER_EMAIL } from "../config/constants.js";
import { appState } from "../state/appState.js";
import { localDB, loadAllLocalDataToState, _verifyDataIntegrity } from "./localDbService.js";
import { syncFromServer, subscribeToAllRealtimeData, updateSyncIndicator } from "./syncService.js";
import { emit } from "../state/eventBus.js";
import { toast } from "../ui/components/toast.js";
import { startGlobalLoading } from "../ui/components/modal.js";
import { renderUI } from "../ui/mainUI.js";
import { calculateAndCacheDashboardTotals } from "./data/calculationService.js";
import { listenForNotifications, requestNotificationPermission } from './notificationService.js';
import { navigate } from "../router.js";
import { ensureMasterDataFresh } from "./data/ensureMasters.js";
import { getJSDate } from "../utils/helpers.js";


async function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
        toast('success', 'Login berhasil. Menyiapkan akun...');
    } catch (error) {
        console.error('Popup sign-in failed:', error);
        toast('error', 'Login gagal. Coba lagi.');
    }
}

async function handleLogout() {
    emit('ui.modal.close', document.getElementById('confirmLogout-modal'));
    const loader = startGlobalLoading('Keluar...');
    try {
        const user = auth.currentUser;
        if (user) {
            const lastActiveUser = {
                displayName: user.displayName,
                photoURL: user.photoURL,
                email: user.email
            };
            localStorage.setItem('lastActiveUser', JSON.stringify(lastActiveUser));
        }

        await signOut(auth);
        toast('success', 'Anda telah keluar.');
        try { window.appState?.clearUser?.(); } catch (_) { appState.currentUser = null; }
        if (window.router?.navigateTo) {
            window.router.navigateTo('/auth');
        } else {
            renderUI();
        }
        loader.close();
    } catch (error) {
        loader.close();
        toast('error', `Gagal keluar.`);
    }
}

// ** PERBAIKAN BUG 3: Helper untuk update pesan loading (jika belum ada) **
function updateLoadingMessage(message) {
    const msgElement = document.getElementById('loading-message');
    if (msgElement) {
        msgElement.textContent = message;
    }
}

function setUserOnState(user) {
    if (typeof appState.setUser === 'function') {
        appState.setUser(user);
    } else {
        appState.currentUser = user;
    }
}

async function assignUserRoleFromProfile(user) {
    if (!user || !user.uid) return null;
    try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        const role = userDocSnap.exists() ? userDocSnap.data().role || null : null;
        if (role) {
            user.role = role;
        } else if ('role' in user) {
            delete user.role;
        }
        setUserOnState(user);
        return role;
    } catch (error) {
        console.warn('[Auth] Failed to fetch user role from /users collection.', error);
        return null;
    }
}

async function initializeAppSession(user) {
    setUserOnState(user);
    await assignUserRoleFromProfile(user);
    const userDocRef = doc(membersCol, user.uid);
    try {
        updateLoadingMessage('Memeriksa profil pengguna...'); // Update pesan
        let userDoc = await getDoc(userDocRef);
        // Logika pembuatan user baru jika tidak ada (tetap sama)
        if (!userDoc.exists()) {
            const isOwner = user.email.toLowerCase() === OWNER_EMAIL.toLowerCase();
            const initialData = {
                email: user.email, name: user.displayName, photoURL: user.photoURL,
                role: isOwner ? 'Owner' : 'Viewer', status: isOwner ? 'active' : 'pending',
                createdAt: serverTimestamp(), updatedAt: serverTimestamp()
            };
            await setDoc(userDocRef, initialData);
            userDoc = await getDoc(userDocRef);
        }
        const userData = userDoc.data();
        Object.assign(appState, { userRole: userData.role, userStatus: userData.status });
        attachRoleListener(userDocRef);
        if (appState.userRole === 'Owner') listenForPendingUsers();
        listenForNotifications();
        const createdAt = userData.createdAt ? getJSDate(userData.createdAt) : new Date();
        const isNewUser = (new Date() - createdAt) < 5 * 60 * 1000;
        
        // Selalu tampilkan modal Welcome saat sesi aplikasi dimulai
        setTimeout(() => {
            try {
                emit('ui.modal.create', 'welcomeOnboarding', {
                    userName: userData.name,
                    isNewUser: isNewUser
                });
            } catch(_) {}
        }, 900);

        updateLoadingMessage('Memastikan data master...'); // Update pesan
        await ensureMasterDataFresh(['projects', 'workers', 'professions', 'suppliers', 'materials']); // Muat master data penting di awal

        let needsFullSync = false;
        // Logika cek database lokal kosong (tetap sama)
        try {
            const projectCount = await localDB.projects.count();
            if (projectCount === 0) {
                console.warn("Database lokal terdeteksi kosong. Sinkronisasi penuh akan dipaksa.");
                needsFullSync = true;
            }
        } catch (e) {
            console.error("Gagal memeriksa database lokal, mengasumsikan kosong.", e);
            needsFullSync = true;
            if (e.name === 'DatabaseClosedError' || (e.inner && e.inner.name === 'InvalidStateError')) {
                emit('ui.toast', { args: ['error', 'Database lokal error. Memuat ulang mungkin diperlukan.'] });
            }
        }
        if (needsFullSync) {
            localStorage.removeItem('lastSyncTimestamp');
            console.log("Penanda sinkronisasi terakhir dihapus untuk memulai unduhan penuh.");
        }
        // --- Akhir Logika Cek DB Lokal ---

        updateLoadingMessage('Memuat data lokal...'); // Update pesan
        try {
            await loadAllLocalDataToState(); // Muat semua data dari IndexedDB
        } catch (loadError) {
             console.error("Critical error loading local data:", loadError);
             emit('ui.toast', { args: ['error', 'Gagal total memuat data lokal. Aplikasi mungkin tidak berfungsi.'] });
        }

        // Emit app.ready SETELAH data awal (master & lokal) dimuat
        emit('app.ready');
        renderUI(); // Render shell UI dasar (sidebar, bottom nav)

        // Lakukan sinkronisasi awal jika online
        if (navigator.onLine) {
            updateLoadingMessage('Sinkronisasi data...'); // Update pesan
            try { appState.isSyncing = true; emit('ui.sync.updateIndicator'); } catch(_){}
            await syncFromServer({ silent: true }); // Tunggu sinkronisasi awal selesai
            try { appState.isSyncing = false; emit('ui.sync.updateIndicator'); } catch(_){}

            // Aktifkan listener realtime setelah sink awal
            subscribeToAllRealtimeData();
            listenForNotifications();
        } else {
            toast('info', 'Anda sedang offline. Menampilkan data yang tersimpan di perangkat.');
            emit('ui.sync.updateIndicator');
        }

        // Verifikasi integritas data
        try {
             await _verifyDataIntegrity();
        } catch (verifyError) {
             console.error("Error during data integrity verification:", verifyError);
        }

        // Kalkulasi total dashboard setelah semua data siap
        calculateAndCacheDashboardTotals();

        if (appState.justLoggedIn) {
            toast('success', `Selamat datang kembali, ${userData.name}!`);
            appState.justLoggedIn = false;
        }
        
        requestNotificationPermission(); // <-- MINTA IZIN SAAT LOGIN
  
        // Cek pinjaman yatim
        try { await emit('data.offerRestoreOrphanLoans'); } catch(_) {}

        // Navigasi ke halaman terakhir SETELAH semua siap
        navigate(appState.activePage);


    } catch (error) {
            console.error("Gagal inisialisasi sesi:", error);
            throw error; 
        }
    }
    
function attachRoleListener(userDocRef) {
    onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const {
                role,
                status
            } = docSnap.data();
            // Hanya update jika ada perubahan
            if (appState.userRole !== role || appState.userStatus !== status) {
                Object.assign(appState, {
                    userRole: role,
                    userStatus: status
                });
                renderUI(); // Render ulang UI jika role/status berubah
            }
        }
    });
}

async function listenForPendingUsers() {
    // Listener untuk jumlah user pending (tetap sama)
    onSnapshot(query(membersCol, where("status", "==", "pending")), (snapshot) => {
        appState.pendingUsersCount = snapshot.size;
        emit('ui.nav.render'); // Emit event untuk update UI navigasi
    });
}

export { signInWithGoogle, handleLogout, initializeAppSession, attachRoleListener, listenForPendingUsers };
