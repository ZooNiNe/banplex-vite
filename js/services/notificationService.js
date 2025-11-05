import { notificationsCol } from '../config/firebase.js';
import { appState } from '../state/appState.js';
import { emit } from '../state/eventBus.js';
import { onSnapshot, query, where, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

let unsubscribeFromNotifications = null;
let lastNotificationCheck = null;

export async function triggerNotification(message, userName, type) {
  if (!appState.currentUser || !appState.currentUser.displayName) {
    return;
  }

  try {
    const response = await fetch('/api/notify', { // <-- Baris 15
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: message,
        userName: userName, // Gunakan nama dari parameter
        type: type,
      }),
    });

    if (!response.ok) {
      // --- PERBAIKAN ERROR HANDLING ---
      // Cek apakah responsnya JSON sebelum parsing
      const contentType = response.headers.get('content-type');
      let errorData = { error: `Server error: ${response.status} ${response.statusText}` };
      
      if (contentType && contentType.includes('application/json')) {
        errorData = await response.json(); // <-- Baris 28
      } else {
        // Jika bukan JSON (misal: 404 HTML), berikan pesan error default
        console.error('Server returned non-JSON error response (status: ' + response.status + ')');
      }
      console.error('Failed to trigger notification:', errorData.error);
      // --- AKHIR PERBAIKAN ---
    }
  } catch (error) { // <-- Baris 32 (SyntaxError akan ditangkap di sini)
    console.error('Error in triggerNotification fetch:', error);
  }
}

export function listenForNotifications() {
  if (unsubscribeFromNotifications) {
    unsubscribeFromNotifications();
  }
  const queryTimestamp = lastNotificationCheck || new Date();
  
  // Buat query untuk hanya mengambil notifikasi BARU
  const q = query(
    notificationsCol,
    where('createdAt', '>', queryTimestamp),
    orderBy('createdAt', 'desc'),
    limit(10) // Batasi untuk performa
  );

  console.log('Notification listener attached. Listening for notifications newer than:', queryTimestamp);

  unsubscribeFromNotifications = onSnapshot(q, (snapshot) => {
    // Update waktu cek terakhir
    lastNotificationCheck = new Date();

    snapshot.docChanges().forEach((change) => {
      // Hanya proses notifikasi yang baru ditambahkan
      if (change.type === 'added') {
        const notification = change.doc.data();
        
        // JANGAN TAMPILKAN notifikasi yang dibuat oleh diri sendiri
        if (notification.userName === appState.currentUser.displayName) {
          return; // Lewati notifikasi ini
        }

        console.log('New notification received:', notification);

        // 1. Tampilkan Notifikasi In-App (Toast)
        // Kita menggunakan eventBus 'ui.toast' yang sudah ada
        emit('ui.toast', {
          type: 'info', // atau 'success', 'warning'
          message: notification.message,
          duration: 5000 // 5 detik
        });

        // 2. Tampilkan Notifikasi OS (Push)
        showOSNotification(notification.message);
      }
    });
  }, (error) => {
    console.error("Error listening to notifications:", error);
  });
}

function showOSNotification(message) {
  // Cek apakah browser mendukung Notifikasi
  if (!('Notification' in window)) {
    console.warn('This browser does not support desktop notification');
    return;
  }

  // Cek apakah izin sudah diberikan
  if (Notification.permission === 'granted') {
    // Cek apakah tab aplikasi sedang tidak aktif
    if (document.hidden) {
      const notification = new Notification('Pembaruan Baru', {
        body: message,
        icon: '/icons-logo.png' // Ambil ikon dari folder public
      });
      // (Opsional) Aksi saat notifikasi di-klik
      notification.onclick = () => {
        window.focus();
      };
    }
  }
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('This browser does not support desktop notification');
    return;
  }

  // Jika izin belum 'denied' atau 'granted', maka minta
  if (Notification.permission === 'default') {
    console.log('Requesting notification permission...');
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      console.log('Notification permission granted.');
      // Tampilkan notifikasi tes
      showOSNotification('Notifikasi telah diaktifkan!');
    } else {
      console.warn('Notification permission denied.');
    }
  }
}
