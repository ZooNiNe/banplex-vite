import { notificationsCol } from '../config/firebase.js';
import { appState } from '../state/appState.js';
import { emit } from '../state/eventBus.js';
import { onSnapshot, query, where, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

let unsubscribeFromNotifications = null;
let notificationUnsubscribers = [];
let lastNotificationCheck = null;

const VAPID_PUBLIC_KEY = 'BEYS8popcYLF2cR9nniLuB2TLd9HNQ_XWD-PCX36_jQZH5JuLS7cWnK9mJswqxYaSlV68FKLoLESL0wXVe-EZ3o'; 

export async function triggerNotification(message, userName, type, recipientUserId = null) {
  if (!appState.currentUser || !appState.currentUser.displayName) {
    return;
  }

  if (recipientUserId === appState.currentUser.uid) {
    console.log("Skipping notification to self.");
    return;
  }

  try {
    const response = await fetch('/api/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: message,
        userName: userName,
        type: type,
        recipientUserId: recipientUserId, // <-- Tambahkan penerima
      }),
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      let errorData = { error: `Server error: ${response.status} ${response.statusText}` };
      
      if (contentType && contentType.includes('application/json')) {
        errorData = await response.json();
      } else {
        console.error('Server returned non-JSON error response (status: ' + response.status + ')');
      }
      console.error('Failed to trigger notification:', errorData.error);
    }
  } catch (error) {
    console.error('Error in triggerNotification fetch:', error);
  }
}

export function listenForNotifications() {
  if (notificationUnsubscribers.length > 0) {
    notificationUnsubscribers.forEach(unsub => unsub());
    notificationUnsubscribers = [];
  }
  const qUser = query(
    notificationsCol,
    where('recipientUserId', '==', appState.currentUser.uid),
    orderBy('createdAt', 'desc'),
    limit(10)
  );

  const qGlobal = query(
    notificationsCol,
    where('recipientUserId', '==', null),
    orderBy('createdAt', 'desc'),
    limit(10)
  );

  console.log('Notification listener attached. Listening for notifications for user:', appState.currentUser.uid);

  const processSnapshot = (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const notification = change.doc.data();
        
        const notificationTime = notification.createdAt?.toDate ? notification.createdAt.toDate() : new Date(0);
        if ((new Date() - notificationTime) > 5 * 60 * 1000) {
            console.log("Skipping old notification:", notification.message);
            return;
        }

        if (notification.userName === appState.currentUser.displayName) {
          return;
        }

        console.log('New in-app notification received:', notification);

        emit('ui.toast', {
          args: [
            'info',
            notification.message,
            5000
          ]
        });

      }
    });

    lastNotificationCheck = new Date();
  };

  const onError = (error) => {
    console.error("Error listening to notifications:", error);
  };

  const unsubUser = onSnapshot(qUser, processSnapshot, onError);
  const unsubGlobal = onSnapshot(qGlobal, processSnapshot, onError);
  
  notificationUnsubscribers = [unsubUser, unsubGlobal];
}

function showOSNotification(message) {
  if (!('Notification' in window)) {
    console.warn('This browser does not support desktop notification');
    return;
  }
  if (Notification.permission === 'granted') {
    const notification = new Notification('Pembaruan Baru', {
      body: message,
      icon: '/public/icons-logo.png'
    });
    notification.onclick = () => {
      window.focus();
    };
  }
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('This browser does not support desktop notification');
    return 'unsupported';
  }

  if (Notification.permission === 'default') {
    console.log('Requesting notification permission...');
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      console.log('Notification permission granted.');
      showOSNotification('Notifikasi telah diaktifkan!');
      return 'granted';
    } else {
      console.warn('Notification permission denied.');
      return 'denied';
    }
  }
  return Notification.permission;
}


function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeToPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications are not supported in this browser.');
    return;
  }
  
  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    console.warn('Permission not granted for push notifications.');
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  if (!registration) {
    console.error("Service worker not ready.");
    return;
  }

  let subscription = await registration.pushManager.getSubscription();
  
  if (subscription) {
    console.log('User already subscribed.');
  } else {
    try {
      if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY === 'MASUKKAN_VAPID_PUBLIC_KEY_ANDA_DI_SINI') {
          console.error("VAPID_PUBLIC_KEY belum diatur di notificationService.js");
          emit('ui.toast', { args: ['error', 'Konfigurasi notifikasi klien tidak lengkap.'] });
          return;
      }
      const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey
      });
      console.log('User subscribed successfully.');
    } catch (err) {
      console.error('Failed to subscribe the user: ', err);
      emit('ui.toast', { args: ['error', 'Gagal mendaftar notifikasi push.'] });
      return;
    }
  }

  try {
    const response = await fetch('/api/saveNotificationEndpoint', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await appState.currentUser.getIdToken()}`
      },
      body: JSON.stringify(subscription)
    });

    if (response.ok) {
      console.log('Push subscription saved on server.');
    } else {
      console.error('Failed to save push subscription on server.');
    }
  } catch (err) {
    console.error('Error sending push subscription to server: ', err);
  }
}
