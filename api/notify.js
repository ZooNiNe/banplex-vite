import admin from 'firebase-admin';

const TEAM_ID = process.env.TEAM_ID;

function initializeFirebaseAdmin() {
  try {
    const serviceAccountJSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJSON || serviceAccountJSON === "undefined") {
      console.error('Firebase Admin initialization error: GOOGLE_SERVICE_ACCOUNT_JSON environment variable is missing or undefined.');
      console.error('Pastikan file .env.development.local sudah benar dan Anda menjalankan server dengan `vercel dev`.');
      return;
    }
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('Firebase Admin SDK initialized.');
  } catch (error) {
    if (error.code !== 'app/duplicate-app') {
      console.error('Firebase Admin initialization error:', error);
    }
  }
}

// Panggil fungsi inisialisasi saat file ini dimuat
initializeFirebaseAdmin();

// Dapatkan akses ke Firestore
const db = admin.firestore();

// Handler utama untuk API endpoint
export default async function handler(request, response) {
  // 1. Hanya izinkan metode POST
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  // 2. Ambil data dari body request
  const { message, userName, type } = request.body;

  // 3. Validasi data
  if (!message || !userName || !type) {
    return response.status(400).json({ error: 'Missing required fields: message, userName, type' });
  }

  // 4. Validasi TEAM_ID yang baru
  if (!TEAM_ID) {
    console.error('TEAM_ID is not defined in Vercel Environment Variables.');
    return response.status(500).json({ error: 'Server configuration error: TEAM_ID missing.' });
  }

  try {
    // 5. Tentukan koleksi di Firestore
    const notificationsColRef = db.collection('teams').doc(TEAM_ID).collection('notifications');

    // 6. Buat data notifikasi baru
    const notificationData = {
      message: message,
      userName: userName,
      type: type,
      createdAt: admin.firestore.FieldValue.serverTimestamp(), // Gunakan timestamp server
      read: false // Tandai sebagai belum dibaca
    };

    // 7. Tulis data ke Firestore
    const docRef = await notificationsColRef.add(notificationData);

    // 8. Kirim respon sukses
    console.log('Notification successfully written to Firestore with ID:', docRef.id);
    return response.status(200).json({ success: true, id: docRef.id });

  } catch (error) {
    // 9. Tangani error jika gagal menulis
    console.error('Error writing notification to Firestore:', error);
    return response.status(500).json({ success: false, error: 'Failed to write notification.' });
  }
}

