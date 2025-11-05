import admin from 'firebase-admin';

const serviceAccountJson = process.env.FIREBASE_ADMIN_CONFIG;

let dbAdmin, authAdmin;

if (!serviceAccountJson) {
  console.error('KRITIS: Variabel lingkungan FIREBASE_ADMIN_CONFIG tidak ditemukan.');
  console.error('Pastikan file .env Anda sudah benar.');
} else {
  try {
    // Cek jika aplikasi BELUM diinisialisasi
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('Firebase Admin SDK Berhasil Diinisialisasi (dari helper).');
    }
    
    // Ambil instance service setelah inisialisasi
    dbAdmin = admin.firestore();
    authAdmin = admin.auth();

  } catch (error) {
    console.error('Firebase Admin Initialization Error:', error.message);
  }
}

export const verifyAuthToken = async (authHeader) => {
  if (!authAdmin) {
    console.error('Auth Admin not initialized. Cek error FIREBASE_ADMIN_CONFIG.');
    return null;
  }
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.split(' ')[1];
  if (!token) {
    return null;
  }

  try {
    const decodedToken = await authAdmin.verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    console.warn('Invalid auth token:', error.code);
    return null;
  }
};

export { dbAdmin, authAdmin };