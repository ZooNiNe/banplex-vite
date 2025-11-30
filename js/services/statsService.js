import { 
    doc, updateDoc, setDoc, increment, getDocs, collection, query, where, writeBatch 
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { db, dashboardStatsDocRef, billsCol } from "../config/firebase.js";

// --- FUNGSI UPDATE REALTIME (Dipanggil saat Add/Edit/Delete Tagihan) ---
export async function updateBillingStats(unpaidChange = 0, paidChange = 0, countChange = 0) {
    try {
        await updateDoc(dashboardStatsDocRef, {
            totalOutstanding: increment(unpaidChange),
            totalPaid: increment(paidChange),
            totalCount: increment(countChange),
            lastUpdated: new Date()
        });
    } catch (error) {
        if (error.code === 'not-found') {
            await setDoc(dashboardStatsDocRef, {
                totalOutstanding: unpaidChange,
                totalPaid: paidChange,
                totalCount: countChange,
                lastUpdated: new Date()
            });
        }
    }
}

// --- FUNGSI HITUNG ULANG OTOMATIS (Dipanggil 1x saat inisialisasi jika data 0) ---
export async function ensureBillingStatsExist() {
    try {
        // Ambil SEMUA tagihan aktif (hanya field penting agar ringan)
        const q = query(billsCol, where('isDeleted', '==', false));
        const snapshot = await getDocs(q);
        
        let totalOutstanding = 0;
        let totalPaid = 0;
        let totalCount = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            const amt = Number(data.amount) || 0;
            const pd = Number(data.paidAmount) || 0;
            
            // Logika Gaji & Tagihan Biasa
            if (data.status === 'paid') {
                totalPaid += amt;
            } else {
                // Status Unpaid
                const sisa = Math.max(0, amt - pd);
                totalOutstanding += sisa;
                totalPaid += pd;
            }
            totalCount++;
        });

        // Simpan ke dokumen statistik
        await setDoc(dashboardStatsDocRef, {
            totalOutstanding,
            totalPaid,
            totalCount,
            lastCalculated: new Date()
        });
        
        console.log(`[Stats] Recalculated: ${totalCount} items, Out: ${totalOutstanding}, Paid: ${totalPaid}`);
        return { totalOutstanding, totalPaid, totalCount };

    } catch (e) {
        console.error("[Stats] Failed to ensure stats:", e);
        return null;
    }
}