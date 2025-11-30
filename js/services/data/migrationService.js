import { db, incomesCol, fundingSourcesCol, projectsCol, suppliersCol, fundingCreditorsCol, expensesCol } from "../../config/firebase.js";
import { getDocs, updateDoc, doc, collectionGroup, writeBatch, getDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { toast } from "../../ui/components/toast.js";
import { showLoadingModal, hideLoadingModal } from "../../ui/components/modal.js";

// === TEMP HELPER (HARUS DITARUH DI SCRIPT MIGRASI ANDA) ===
// (Salin fungsi generateRandomTimeDate di sini)
function generateRandomTimeDate(oldTimestamp) {
    if (!oldTimestamp || !oldTimestamp.toDate) return null;

    const oldDate = oldTimestamp.toDate();
    
    const day = oldDate.getDate();
    const month = oldDate.getMonth();
    const year = oldDate.getFullYear();

    const newDate = new Date(year, month, day, 0, 0, 0);

    // Waktu acak antara 01:00:00 dan 10:59:59 UTC (08:00:00 - 17:59:59 WIB)
    const randomUTCHour = Math.floor(Math.random() * (10 - 1 + 1)) + 1; 
    const randomMinute = Math.floor(Math.random() * 60);
    const randomSecond = Math.floor(Math.random() * 60);

    newDate.setUTCHours(randomUTCHour, randomMinute, randomSecond, 0);

    return newDate;
}
// ==========================================================

export async function runOneTimeDataRepair() {
    if (!confirm("PERINGATAN: Ini akan memproses ulang SEMUA data Pemasukan dan Pengeluaran untuk denormalisasi dan memperbaiki masalah jam 07:00. Lanjutkan?")) {
        return;
    }

    showLoadingModal("Sedang memperbaiki data lama... (Jangan tutup aplikasi)");
    console.log("=== MEMULAI MIGRASI DATA ===");

    try {
        // ... (STEP 1: LOAD MASTER DATA - TIDAK BERUBAH)
        console.log("1. Memuat Master Data...");
        const [projSnap, suppSnap, credSnap] = await Promise.all([
            getDocs(projectsCol),
            getDocs(suppliersCol),
            getDocs(fundingCreditorsCol)
        ]);

        const projectMap = {};
        projSnap.forEach(d => projectMap[d.id] = d.data().projectName || d.data().name);

        const supplierMap = {};
        suppSnap.forEach(d => supplierMap[d.id] = d.data().supplierName || d.data().name);

        const creditorMap = {};
        credSnap.forEach(d => creditorMap[d.id] = d.data().creditorName || d.data().name);

        const batchSize = 400; 
        let totalUpdated = 0; // Hanya hitung dokumen yang benar-benar di-update ke DB
        let batch = writeBatch(db);
        let opCounter = 0;
        
        const loanDataMap = {}; 
        const billDataMap = {}; 

        const checkBatch = async () => {
            opCounter++;
            if (opCounter >= batchSize) {
                await batch.commit();
                batch = writeBatch(db);
                opCounter = 0;
                console.log("...Menyimpan sebagian perubahan...");
            }
        };

        // 2. PERBAIKI INCOME (Termin) - FOKUS PERBAIKAN TIMESTAMP
        console.log("2. Memperbaiki Pemasukan (Termin) & Timestamp...");
        const incomesSnap = await getDocs(incomesCol);
        for (const docSnap of incomesSnap.docs) {
            const data = docSnap.data();
            let updates = {};

            // Perbaikan Denormalisasi (Jika Belum Ada)
            if (!data.projectName && data.projectId && projectMap[data.projectId]) {
                updates.projectName = projectMap[data.projectId];
            }
            
            if (data.timestamp && data.timestamp.toDate) {
                const dateObj = data.timestamp.toDate();
                
                const isProblematicTimestamp = dateObj.getUTCHours() === 0 && 
                                               dateObj.getUTCMinutes() === 0 && 
                                               dateObj.getUTCSeconds() === 0 &&
                                               dateObj.getUTCMilliseconds() === 0;

                if (isProblematicTimestamp) {
                     const newTimestamp = generateRandomTimeDate(data.timestamp); 
                     
                     if (newTimestamp) {
                         updates.timestamp = newTimestamp;
                     }
                }
            }


            if (Object.keys(updates).length > 0) {
                batch.update(docSnap.ref, updates);
                await checkBatch();
                totalUpdated++; // Pastikan ini dihitung
            }
        }
        // 3. PERBAIKI FUNDING SOURCES (Pinjaman) - TIDAK BERUBAH SIGNIFIKAN
        console.log("3. Memperbaiki Pinjaman dan Mengumpulkan Data Pinjaman...");
        const loansSnap = await getDocs(fundingSourcesCol);
        for (const docSnap of loansSnap.docs) {
            const data = docSnap.data();
            let updates = {};

            if (!data.creditorName && data.creditorId && creditorMap[data.creditorId]) {
                updates.creditorName = creditorMap[data.creditorId];
            }
            
            // Perbaikan Timestamp (Sama seperti di Income)
            if (data.timestamp && data.timestamp.toDate) {
                const dateInWIB = data.timestamp.toDate();
                const isUniformTime = dateInWIB.getHours() === 7 && dateInWIB.getMinutes() === 0 && dateInWIB.getSeconds() === 0;
                
                if (isUniformTime || Object.keys(updates).length === 0) {
                    const newTimestamp = generateRandomTimeDate(data.timestamp);
                    if (newTimestamp && newTimestamp.getTime() !== dateInWIB.getTime()) {
                        updates.timestamp = newTimestamp;
                    }
                }
            }

            const finalCreditorName = updates.creditorName || data.creditorName || creditorMap[data.creditorId];
            if (finalCreditorName) {
                loanDataMap[docSnap.id] = { creditorName: finalCreditorName };
            }

            if (Object.keys(updates).length > 0) {
                batch.update(docSnap.ref, updates);
                await checkBatch();
                totalUpdated++;
            }
        }

        // 4. PERBAIKI EXPENSES (Pengeluaran - Induk) - FOKUS PERBAIKAN TIMESTAMP
        console.log("4. Memperbaiki Pengeluaran (Induk) & Timestamp, dan Mengumpulkan Data Pengeluaran...");
        const expSnap = await getDocs(expensesCol);
        
        for (const docSnap of expSnap.docs) {
            const data = docSnap.data();
            let updates = {};
            
            // Perbaikan Denormalisasi
            if (!data.supplierName && data.supplierId && supplierMap[data.supplierId]) {
                updates.supplierName = supplierMap[data.supplierId];
            }

            // Logika Perbaikan Timestamp (Sama seperti di Income)
            if (data.timestamp && data.timestamp.toDate) {
                const dateInWIB = data.timestamp.toDate();
                const isUniformTime = dateInWIB.getHours() === 7 && dateInWIB.getMinutes() === 0 && dateInWIB.getSeconds() === 0;

                if (isUniformTime || Object.keys(updates).length === 0) {
                    const newTimestamp = generateRandomTimeDate(data.timestamp);
                    if (newTimestamp && newTimestamp.getTime() !== dateInWIB.getTime()) {
                        updates.timestamp = newTimestamp;
                    }
                }
            }

            // ... (Bagian cache billDataMap - TIDAK BERUBAH)
            const finalSupplierName = updates.supplierName || data.supplierName;
            
            const billCache = {
                supplierName: finalSupplierName,
                recipientName: data.description || 'Penerima', 
                workerName: null 
            };

            if (data.type === 'gaji' && data.workerDetails && data.workerDetails[0]) {
                billCache.workerName = data.workerDetails[0].name;
                billCache.supplierName = data.workerDetails[0].name; 
            }

            billDataMap[docSnap.id] = billCache;

            if (Object.keys(updates).length > 0) {
                batch.update(docSnap.ref, updates);
                await checkBatch();
                totalUpdated++;
            }
        }

        // 5. PERBAIKI PAYMENTS (Subcollection) - TIDAK PERLU PERBAIKAN TIMESTAMP
        // ... (Langkah 5 tetap sama karena payments seharusnya sudah memiliki waktu yang benar saat dibuat)

        console.log("5. Memperbaiki List Pembayaran (Subcollection) menggunakan cache...");
        const paymentsSnap = await getDocs(collectionGroup(db, 'payments'));
        
        for (const paySnap of paymentsSnap.docs) {
            const data = paySnap.data();
            const parentRef = paySnap.ref.parent.parent; 
            if (!parentRef) continue;

            const parentId = parentRef.id;
            const parentCollName = parentRef.parent.id; 
            let updates = {};

            // A. KASUS PEMBAYARAN PINJAMAN (Parent: funding_sources)
            if (parentCollName === 'funding_sources') {
                const parentData = loanDataMap[parentId];
                if (parentData && parentData.creditorName && !data.creditorName) {
                    updates.creditorName = parentData.creditorName;
                }
            } 
            // B. KASUS PEMBAYARAN TAGIHAN (Parent: expenses / bills)
            else if (parentCollName === 'expenses' || parentCollName === 'bills') {
                const parentData = billDataMap[parentId];

                if (parentData) {
                    // ... (Logika denormalisasi payment tetap sama)
                    if (parentData.workerName && !data.workerName) {
                        updates.workerName = parentData.workerName;
                    } 
                    if (parentData.supplierName && !data.supplierName) {
                        updates.supplierName = parentData.supplierName;
                    } 
                    if (parentData.recipientName && !data.recipientName && !updates.supplierName && !updates.workerName) {
                        updates.recipientName = parentData.recipientName;
                    }
                }
            }

            if (Object.keys(updates).length > 0) {
                batch.update(paySnap.ref, updates);
                await checkBatch();
                totalUpdated++;
            }
        }


        // 6. FINAL COMMIT
        if (opCounter > 0) {
            await batch.commit();
        }

        console.log("=== SELESAI ===");
        hideLoadingModal();
        toast('success', `Berhasil memperbaiki ${totalUpdated} data (termasuk ${totalUpdated} timestamp)`);
        
        setTimeout(() => window.location.reload(), 1500);

    } catch (e) {
        console.error("Gagal migrasi:", e);
        hideLoadingModal();
        toast('error', 'Gagal migrasi data: ' + e.message);
    }
}
window.runOneTimeDataRepair = runOneTimeDataRepair;