import { emit } from "../../../state/eventBus.js";
import { appState } from "../../../state/appState.js";
import { localDB, loadAllLocalDataToState } from "../../localDbService.js";
import { db, incomesCol, fundingSourcesCol, fundingCreditorsCol, projectsCol } from "../../../config/firebase.js";
// TAMBAHAN: Import serverTimestamp
import { doc, runTransaction, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { generateUUID } from "../../../utils/helpers.js";
import { syncToServer, requestSync } from "../../syncService.js";
import { toast } from "../../../ui/components/toast.js";
import { _logActivity } from "../../logService.js";
import { parseFormattedNumber } from "../../../utils/formatters.js";
import { queueOutbox } from "../../outboxService.js";

export async function handleAddPemasukan(formData, type) {

    if (!appState.currentUser || !appState.currentUser.uid) {
        toast('error', 'Sesi pengguna tidak valid. Silakan logout dan login kembali.');
        throw new Error('User session is invalid or missing UID.');
    }

    let data, localTable, logMessage, stateKey;
    let successDataForPreview = null;

    try {
        // REVISI: Gunakan serverTimestamp untuk waktu pembuatan yang akurat
        const createdByInfo = {
            createdBy: appState.currentUser.uid,
            createdByName: appState.currentUser.displayName,
            createdAt: serverTimestamp(), // JAM SERVER AKURAT
            updatedAt: serverTimestamp()
        };

        const amount = parseFormattedNumber(formData['pemasukan-jumlah'] || formData['amount'] || formData['totalAmount'] || '0');
        
        // REVISI: Ambil tanggal saja dari input, jam biarkan 00:00 (karena jam akurat ada di createdAt)
        const dateInput = new Date(formData['pemasukan-tanggal'] || formData['date']);
        const date = new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate());
        
        const notes = formData['notes'] || '';

        if (type === 'termin') {
            const projectId = formData['pemasukan-proyek'];

            if (!projectId || !date.valueOf() || amount <= 0) {
                 throw new Error('Proyek, Tanggal, dan Jumlah harus diisi.');
            }

            if (!Array.isArray(appState.projects)) {
                 toast('error', 'Data proyek belum dimuat. Coba lagi.');
                 throw new Error('Project data not loaded.');
            }

            const project = appState.projects.find(p=>p.id===projectId);
            const projectName = project?.projectName || 'Proyek Tidak Diketahui';

            data = { 
                id: generateUUID(), 
                amount, 
                date, // Tanggal untuk filter
                projectId, 
                projectName: projectName,
                description: `Termin ${projectName}`, 
                notes, 
                isDeleted: 0, 
                syncState: 'pending_create', 
                ...createdByInfo 
            };
            
            localTable = localDB.incomes;
            stateKey = 'incomes';
            logMessage = 'Menambah Termin';

        } else if (type === 'pinjaman') {
            const creditorId = formData['pemasukan-kreditur'];
            const interestType = formData['loan-interest-type'];
            const rate = Number(formData['rate'] || 0);
            const tenor = Number(formData['tenor'] || 0);

            if (!creditorId || !date.valueOf() || amount <= 0) {
                 throw new Error('Kreditur, Tanggal, dan Jumlah harus diisi.');
            }

            if (!Array.isArray(appState.fundingCreditors)) {
                 toast('error', 'Data kreditur belum dimuat. Coba lagi.');
                 throw new Error('Creditor data not loaded.');
            }

            const creditor = appState.fundingCreditors.find(c=>c.id===creditorId);
            const creditorName = creditor?.creditorName || 'Kreditur Tidak Diketahui';

            data = {
                id: generateUUID(), 
                creditorId, 
                creditorName: creditorName,
                totalAmount: amount, 
                description: `Pinjaman dari ${creditorName}`,
                date, 
                status: 'unpaid', 
                paidAmount: 0, 
                isDeleted: 0, 
                syncState: 'pending_create',
                interestType, 
                rate, 
                tenor, 
                notes, 
                ...createdByInfo
            };

            if (interestType === 'interest' && rate > 0 && tenor > 0) {
                const totalInterest = amount * (rate / 100) * tenor;
                data.totalRepaymentAmount = amount + totalInterest;
            } else {
                 data.totalRepaymentAmount = amount;
            }

            localTable = localDB.funding_sources;
            stateKey = 'funding_sources';
            logMessage = 'Menambah Pinjaman';

        } else {
            throw new Error(`Tipe pemasukan tidak dikenal: ${type}`);
        }

        if (!localTable) throw new Error("Tabel localDB tidak valid.");
        await localTable.put(data);

        await queueOutbox({ table: stateKey, docId: data.id, op: 'upsert', payload: data, priority: 7 });

        _logActivity(`${logMessage} (Lokal)`, { amount: data.amount || data.totalAmount, targetId: data.id });
        successDataForPreview = data;

        if (navigator.onLine) {
            requestSync({ silent: true });
        }

        await loadAllLocalDataToState();
        emit('ui.page.recalcDashboardTotals');

        if (successDataForPreview) {
             emit('uiInteraction.showSuccessPreviewPanel', successDataForPreview, type);
        }

    } catch (error) {
        throw error;
    }
}

// ... (Biarkan handleUpdatePemasukan seperti kode Anda yang terakhir jika tidak ingin mengubah logika update)
export async function handleUpdatePemasukan(form) {
    // ... (Kode update Anda yang sudah benar, pastikan menggunakan serverTimestamp pada updatedAt jika memungkinkan)
    // Untuk mempersingkat, saya fokus pada perbaikan ADD di atas karena itu sumber masalah data baru.
    // Gunakan logika denormalisasi yang sudah Anda miliki di handleUpdatePemasukan.
    
    // (Copy paste fungsi handleUpdatePemasukan dari file Anda sebelumnya di sini)
     const { id, type } = form.dataset;
     let dataToUpdate = {}, config = { title: 'Pemasukan' }, table;
     let tableName;
     let originalItemType = type;
     const notes = form.elements.notes?.value.trim() || '';

     if (!appState.currentUser || !appState.currentUser.uid) {
         toast('error', 'Sesi pengguna tidak valid. Silakan logout dan login kembali.');
         return { success: false };
     }

     try {
         switch(type) {
            case 'termin':
                tableName = 'incomes';
                config.title = 'Pemasukan Termin';
                const projectId = form.elements['pemasukan-proyek']?.value;
                const project = appState.projects?.find(p => p.id === projectId);
                const projectName = project?.projectName || '';

                dataToUpdate = {
                    amount: parseFormattedNumber(form.elements.amount?.value || form.elements['pemasukan-jumlah']?.value || '0'),
                    date: new Date(form.elements.date?.value || form.elements['pemasukan-tanggal']?.value),
                    projectId: projectId,
                    projectName: projectName,
                    notes
                };
                break;
            case 'loan': case 'pinjaman':
                tableName = 'funding_sources';
                config.title = 'Pinjaman';
                originalItemType = 'pinjaman';
                const creditorId = form.elements['pemasukan-kreditur']?.value;
                const creditor = appState.fundingCreditors?.find(c => c.id === creditorId);
                const creditorName = creditor?.creditorName || '';

                const interestType = form.elements['loan-interest-type']?.value;
                dataToUpdate = {
                    totalAmount: parseFormattedNumber(form.elements.totalAmount?.value || form.elements['pemasukan-jumlah']?.value || '0'),
                    date: new Date(form.elements.date?.value || form.elements['pemasukan-tanggal']?.value),
                    creditorId: creditorId,
                    creditorName: creditorName,
                    interestType,
                    rate: interestType === 'interest' ? Number(form.elements.rate?.value || 0) : 0,
                    tenor: interestType === 'interest' ? Number(form.elements.tenor?.value || 0) : 0,
                    notes
                };
                if (dataToUpdate.interestType === 'interest' && dataToUpdate.rate > 0 && dataToUpdate.tenor > 0) {
                    const amount = dataToUpdate.totalAmount;
                    const totalInterest = amount * (dataToUpdate.rate / 100) * dataToUpdate.tenor;
                    dataToUpdate.totalRepaymentAmount = amount + totalInterest;
                } else {
                     dataToUpdate.totalRepaymentAmount = dataToUpdate.totalAmount;
                }
                break;
            default: throw new Error(`Tipe data pemasukan untuk update tidak dikenal: ${type}`);
         }

         dataToUpdate.updatedAt = new Date(); // Atau serverTimestamp() jika mau
         dataToUpdate.syncState = 'pending_update';

         table = localDB[tableName];
         if (!table) throw new Error(`Tabel lokal tidak ditemukan untuk tipe: ${tableName}`);

         await localDB.transaction('rw', table, localDB.outbox, async () => {
             await table.update(id, dataToUpdate);
             appState._recentlyEditedIds = appState._recentlyEditedIds || new Set();
             appState._recentlyEditedIds.add(id);

             const payloadData = { id };
             Object.keys(dataToUpdate).forEach(key => {
                 if (key !== 'syncState' && key !== 'updatedAt') {
                     payloadData[key] = dataToUpdate[key];
                 }
             });

             payloadData.notes = notes;
             await queueOutbox({ table: tableName, docId: id, op: 'upsert', payload: payloadData, priority: 6 });
         });

        await _logActivity(`Memperbarui Data (Lokal): ${config.title}`, { docId: id });
        await loadAllLocalDataToState();
        requestSync({ silent: true });

        const updatedItem = appState[tableName === 'incomes' ? 'incomes' : 'fundingSources']?.find(i => i.id === id);
        return { success: true, itemData: updatedItem, itemType: originalItemType };

    } catch (error) {
        toast('error', `Gagal menyimpan: ${error.message}`);
        return { success: false };
    }
}