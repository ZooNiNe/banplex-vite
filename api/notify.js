// HAPUS: import admin from 'firebase-admin';

// --- GANTI DENGAN IMPORT DARI HELPER ---
import { dbAdmin } from './firebaseAdminHelper.js';
// ----------------------------------------

import { sendNotificationToUser } from './pushNotiificationUtils.js'; 

const TEAM_ID = process.env.TEAM_ID;

// --- HAPUS FUNGSI 'initializeFirebaseAdmin()' DAN PANGGILANNYA ---
// (Seluruh fungsi dari baris 11-29 dihapus)

// --- GUNAKAN 'dbAdmin' YANG SUDAH DI-INISIALISASI DARI HELPER ---
const db = dbAdmin;
// ---------------------------------------------------------------

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  // --- TAMBAHKAN PENGECEKAN KEAMANAN ---
  if (!db) {
    console.error('Koneksi Firestore (dbAdmin) tidak terinisialisasi. Cek log firebaseAdminHelper.');
    return response.status(500).json({ success: false, error: 'Server configuration error' });
  }
  // -----------------------------------

  const { message, userName, type, recipientUserId } = request.body;

  if (!message || !userName || !type) {
    return response.status(400).json({ error: 'Missing required fields: message, userName, type' });
  }
  
  if (!TEAM_ID) {
    console.error('TEAM_ID is not defined in Vercel Environment Variables.');
    return response.status(500).json({ error: 'Server configuration error: TEAM_ID missing.' });
  }

  try {
    const notificationsColRef = db.collection('teams').doc(TEAM_ID).collection('notifications');

    const notificationData = {
      message: message,
      userName: userName,
      type: type,
      createdAt: new Date(), // Gunakan new Date() jika admin.firestore.FieldValue tidak tersedia
      read: false,
      recipientUserId: recipientUserId || null,
    };

    const docRef = await notificationsColRef.add(notificationData);

    if (recipientUserId) {
      console.log(`Mengirim OS Push ke recipientUserId: ${recipientUserId}`);
      const pushPayload = {
        title: `Notifikasi Baru dari ${userName}`,
        body: message,
        icon: '/public/icons-logo.png', // Pastikan path ini benar
        data: {
          url: '/index.html?page=dashboard' 
        }
      };
      sendNotificationToUser(recipientUserId, pushPayload).catch(err => {
         console.error(`Gagal mengirim OS Push (non-blocking): ${err.message}`);
      });
    }

    console.log('Notification successfully written to Firestore with ID:', docRef.id);
    return response.status(200).json({ success: true, id: docRef.id });

  } catch (error) {
    console.error('Error writing notification to Firestore:', error);
    return response.status(500).json({ success: false, error: 'Failed to write notification.' });
  }
}