// Impor dari file helper yang benar
import { verifyAuthToken } from './firebaseAdminHelper.js'; 
// Impor dari file utilitas notifikasi yang benar
import { sendNotificationToUser } from './pushNotiificationUtils.js'; 

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  // --- INI PERBAIKANNYA ---
  // Kita ubah .get('authorization') menjadi ['authorization'] 
  // agar kompatibel dengan Node.js
  const authHeader = request.headers['authorization'] || null;
  const user = await verifyAuthToken(authHeader);
  // --- AKHIR PERBAIKAN ---

  if (!user || !user.uid) {
    return response.status(401).json({ error: 'Unauthorized' });
  }
  
  const testPayload = {
    title: 'Uji Coba Notifikasi BanPlex',
    body: 'Jika Anda melihat ini, notifikasi push berhasil dikonfigurasi!',
    icon: '/icons-logo.png', // Pastikan path ini benar dari root
    data: {
      url: '/index.html?page=dashboard'
    },
    actions: [
      { action: 'lihat-dashboard', title: 'Lihat Dashboard' }
    ]
  };

  try {
    // Panggil fungsi dengan nama yang benar
    await sendNotificationToUser(user.uid, testPayload); 
    
    return response.status(200).json({ 
      success: true, 
      message: `Test notification sent to user: ${user.uid}`
    });

  } catch (error) {
    console.error('Failed in /api/testNotificationEndpoint:', error);
    return response.status(500).json({ error: 'Internal server error' });
  }
}