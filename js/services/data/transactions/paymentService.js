import { emit } from "../../../state/eventBus.js";
import { appState } from "../../../state/appState.js";
import { localDB, loadAllLocalDataToState } from "../../localDbService.js";
import { db, expensesCol, billsCol, incomesCol, fundingSourcesCol, attendanceRecordsCol } from "../../../config/firebase.js";
import { doc, runTransaction, serverTimestamp, Timestamp, collection, getDoc, setDoc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { syncToServer, _isQuotaExceeded, requestSync, syncFromServer } from "../../syncService.js";
import { toast } from "../../../ui/components/toast.js";
import { _logActivity } from "../../logService.js";
import { _uploadFileToCloudinary, _compressImage, _enforceLocalFileStorageLimit } from "../../fileService.js";
import { parseFormattedNumber, fmtIDR } from "../../../utils/formatters.js";
// PERBAIKAN: Impor fungsi penutup 'Immediate' dan 'hideMobileDetailPageImmediate'
import { createModal, closeModal, closeDetailPane, closeModalImmediate, closeDetailPaneImmediate, hideMobileDetailPage, hideMobileDetailPageImmediate } from "../../../ui/components/modal.js";
import { queueOutbox } from "../../outboxService.js";

export async function handleProcessBillPayment(formElement) {
    const amountToPay = parseFormattedNumber(formElement.elements.amount.value);
    const amountFormatted = fmtIDR(amountToPay);
    const billId = formElement.dataset.id;
    const dateInput = new Date(formElement.elements.date.value);
    const now = new Date();
    const date = new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate(), now.getHours(), now.getMinutes(), 0, 0);
    const file = formElement.elements.paymentAttachment?.files?.[0];

    createModal('confirmPayBill', {
        message: `Anda akan membayar tagihan sebesar <strong>${amountFormatted}</strong>. Lanjutkan?`,
        onConfirm: async () => {
            let loadingToast;
            let containerToClose = null;
            try {
                loadingToast = toast('syncing', 'Memproses pembayaran...');
                containerToClose = formElement.closest('.modal-bg, #detail-pane');

                if (amountToPay <= 0) {
                    throw new Error('Jumlah pembayaran harus lebih dari nol.');
                }

                let attachmentUrl = null;
                let localAttachmentId = null;

                const processPayment = async () => {
                     if (navigator.onLine && !_isQuotaExceeded()) {
                        try {
                            if (file) {
                                 attachmentUrl = await _uploadFileToCloudinary(file, { silent: true });
                                 if (!attachmentUrl) throw new Error("Gagal mengunggah lampiran.");
                             }
                            await runTransaction(db, async (transaction) => {
                                const billRef = doc(billsCol, billId);
                                const billSnap = await transaction.get(billRef);
                                if (!billSnap.exists()) throw new Error("Tagihan tidak ditemukan di server.");
                                const billData = billSnap.data();
                                const newPaidAmount = (billData.paidAmount || 0) + amountToPay;
                                const isNowPaid = newPaidAmount >= (billData.amount || 0);
                                transaction.update(billRef, {
                                    paidAmount: newPaidAmount,
                                    status: isNowPaid ? 'paid' : 'unpaid',
                                    rev: (billData.rev || 0) + 1,
                                    updatedAt: serverTimestamp(),
                                    ...(isNowPaid && { paidAt: Timestamp.fromDate(date) })
                                });
                                const paymentRef = doc(collection(billRef, 'payments'));
                                const paymentData = {
                                    amount: amountToPay,
                                    date: Timestamp.fromDate(date),
                                    createdAt: serverTimestamp(),
                                    ...(attachmentUrl && { attachmentUrl: attachmentUrl }),
                                };
                                transaction.set(paymentRef, paymentData);
                            });
                            await syncFromServer();
                        } catch (error) {
                            console.error("[processPayment - Online] Error:", error);
                            throw error;
                        }
                    } else {
                        try {
                            const transactionTables = ['bills', 'expenses', 'attendance_records', 'pending_payments'];
                            if (file) transactionTables.push('files');
                            const dexieTables = transactionTables.map(name => localDB[name]).filter(Boolean);

                            await localDB.transaction('rw', dexieTables, async () => {
                                const bill = await localDB.bills.get(billId);
                                if (!bill) throw new Error("Tagihan tidak ditemukan di perangkat.");
                                if (file) {
                                    const compressed = await _compressImage(file, 0.85, 1280);
                                    const blob = compressed || file;
                                    localAttachmentId = `payment-${billId}-${Date.now()}`;
                                    await localDB.files.put({ id: localAttachmentId, file: blob, addedAt: new Date(), size: blob.size || 0 });
                                     await _enforceLocalFileStorageLimit();
                                }
                                const newPaidAmount = (bill.paidAmount || 0) + amountToPay;
                                const isNowPaid = newPaidAmount >= (bill.amount || 0);
                                await localDB.bills.where('id').equals(billId).modify({
                                    paidAmount: newPaidAmount,
                                    status: isNowPaid ? 'paid' : 'unpaid',
                                    syncState: 'pending_update',
                                    updatedAt: new Date(),
                                    ...(isNowPaid && { paidAt: date })
                                });
                                if (isNowPaid && bill.expenseId) {
                                     await localDB.expenses.where('id').equals(bill.expenseId).modify({ status: 'paid', syncState: 'pending_update' });
                                }
                                if (isNowPaid && bill.type === 'gaji' && bill.recordIds && bill.recordIds.length > 0) {
                                    await localDB.attendance_records.where('id').anyOf(bill.recordIds).modify({ isPaid: true, syncState: 'pending_update' });
                                }
                                await localDB.pending_payments.add({ billId, amount: amountToPay, date, localAttachmentId, createdAt: new Date() });
                            });
                            _logActivity(`Membayar Tagihan Cicilan (Offline)`, { billId, amount: amountToPay });
                            requestSync({ silent: true });
                        } catch(error){
                             console.error("[processPayment - Offline] Error:", error);
                             throw error;
                        }
                    }
                };

                await processPayment();
                await loadAllLocalDataToState();

                const bill = await localDB.bills.get(billId);
                if (!bill) {
                    console.error("Bill data not found after payment processing for ID:", billId);
                    throw new Error("Data tagihan tidak ditemukan setelah pemrosesan.");
                }
                const expense = bill.expenseId ? await localDB.expenses.get(bill.expenseId) : null;
                const supplier = expense ? appState.suppliers.find(s => s.id === expense.supplierId) : null;
                const recipient = supplier ? supplier.supplierName : 'Penerima';
                const isNowPaid = (bill.paidAmount || 0) >= (bill.amount || 0);

                // PERBAIKAN: Gunakan fungsi penutup 'Immediate'
                if (containerToClose) {
                    if (containerToClose.id === 'detail-pane') {
                        if (window.matchMedia('(max-width: 599px)').matches) {
                            hideMobileDetailPageImmediate(); // <--- PERBAIKAN
                        } else {
                            closeDetailPaneImmediate();
                        }
                    } else if (containerToClose.classList.contains('modal-bg')) {
                        closeModalImmediate(containerToClose);
                    }
                    containerToClose = null;
                }

                if(loadingToast && typeof loadingToast.close === 'function') loadingToast.close();
                emit('uiInteraction.showPaymentSuccessPreviewPanel', {
                    title: 'Pembayaran Tagihan Berhasil!',
                    description: `Pembayaran untuk: ${bill.description}`,
                    amount: amountToPay,
                    date: date,
                    recipient: recipient,
                    isLunas: isNowPaid,
                    billId: billId,
                }, 'tagihan');
                toast('success', 'Pembayaran berhasil diproses!');
                
                return true; // Signal sukses ke modalEventListeners

            } catch (error) {
                if(loadingToast && typeof loadingToast.close === 'function') loadingToast.close();
                // PERBAIKAN: Gunakan fungsi penutup 'Immediate'
                if (containerToClose) {
                    if (containerToClose.id === 'detail-pane') {
                        if (window.matchMedia('(max-width: 599px)').matches) {
                            hideMobileDetailPageImmediate(); // <--- PERBAIKAN
                        } else {
                            closeDetailPaneImmediate();
                        }
                    } else if (containerToClose.classList.contains('modal-bg')) {
                        closeModalImmediate(containerToClose);
                    }
                }
                toast('error', `Gagal memproses pembayaran: ${error.message}`);
                console.error("Gagal memproses pembayaran:", error);
                return false; // Signal gagal ke modalEventListeners
            }
        }
    });
}

export async function handleProcessPayment(formElement) {
    const { id, type } = formElement.dataset;
    if (type !== 'pinjaman' && type !== 'loan') return false;
    const amountToPay = parseFormattedNumber(formElement.elements.amount.value);
    const dateInput = new Date(formElement.elements.date.value);
    const now = new Date();
    const date = new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate(), now.getHours(), now.getMinutes(), 0, 0);
    const file = formElement.elements.paymentAttachment?.files?.[0];

    if (amountToPay <= 0) {
        toast('error', 'Jumlah pembayaran harus lebih dari nol.');
        return false;
    }

    let attachmentUrl = null;
    let localAttachmentId = null;
    const amountFormatted = fmtIDR(amountToPay);

    createModal('confirmPayBill', {
        message: `Anda akan membayar cicilan pinjaman sebesar <strong>${amountFormatted}</strong>. Lanjutkan?`,
        onConfirm: async () => {
             let loadingToast;
             let containerToClose = null;
            try {
                loadingToast = toast('syncing', 'Memproses pembayaran...');
                containerToClose = formElement.closest('.modal-bg, #detail-pane');

                const processPayment = async () => {
                    if (navigator.onLine && !_isQuotaExceeded()) {
                        try {
                            if (file) {
                                attachmentUrl = await _uploadFileToCloudinary(file, { silent: true });
                                if (!attachmentUrl) throw new Error("Gagal mengunggah lampiran.");
                            }
                            await runTransaction(db, async (transaction) => {
                                const loanRef = doc(fundingSourcesCol, id);
                                const loanSnap = await transaction.get(loanRef);
                                if (!loanSnap.exists()) throw new Error("Data pinjaman tidak ditemukan di server.");
                                const loanData = loanSnap.data();
                                const totalPayableServer = loanData.totalRepaymentAmount || loanData.totalAmount || 0;
                                const newPaidAmountServer = (loanData.paidAmount || 0) + amountToPay;
                                const isPaidServer = newPaidAmountServer >= totalPayableServer;
                                transaction.update(loanRef, {
                                    paidAmount: newPaidAmountServer,
                                    status: isPaidServer ? 'paid' : 'unpaid',
                                    rev: (loanData.rev || 0) + 1,
                                    updatedAt: serverTimestamp(),
                                    ...(isPaidServer && { paidAt: Timestamp.fromDate(date) })
                                });
                                const paymentRef = doc(collection(loanRef, 'payments'));
                                const paymentData = { amount: amountToPay, date: Timestamp.fromDate(date), createdAt: serverTimestamp() };
                                if (attachmentUrl) paymentData.attachmentUrl = attachmentUrl;
                                transaction.set(paymentRef, paymentData);
                            });
                            await syncFromServer();
                        } catch (error) {
                            console.error("[processPayment Loan - Online] Error:", error);
                            throw error;
                        }
                    } else {
                        try {
                            const transactionTables = ['funding_sources', 'pending_payments'];
                            if (file) transactionTables.push('files');
                            const dexieTables = transactionTables.map(name => localDB[name]).filter(Boolean);

                            await localDB.transaction('rw', dexieTables, async () => {
                                const loan = await localDB.funding_sources.get(id);
                                if (!loan) throw new Error('Data pinjaman tidak ditemukan di perangkat.');
                                if (file) {
                                    const compressed = await _compressImage(file, 0.85, 1280);
                                    const blob = compressed || file;
                                    localAttachmentId = `payment-loan-${id}-${Date.now()}`;
                                    await localDB.files.put({ id: localAttachmentId, file: blob, addedAt: new Date(), size: blob.size || 0 });
                                    await _enforceLocalFileStorageLimit();
                                }
                                 const totalPayable = loan.totalRepaymentAmount || loan.totalAmount || 0;
                                 const newPaidAmount = (loan.paidAmount || 0) + amountToPay;
                                 const isPaid = newPaidAmount >= totalPayable;
                                await localDB.funding_sources.where('id').equals(id).modify({
                                    paidAmount: newPaidAmount,
                                    status: isPaid ? 'paid' : 'unpaid',
                                    updatedAt: new Date(),
                                    ...(isPaid && { paidAt: date }),
                                    syncState: 'pending_update'
                                });
                                await localDB.pending_payments.add({
                                    billId: id,
                                    paymentType: 'loan',
                                    amount: amountToPay, date, localAttachmentId, createdAt: new Date()
                                });
                            });
                            _logActivity(`Membayar Cicilan Pinjaman (Offline)`, { loanId: id, amount: amountToPay });
                            requestSync({ silent: true });
                        } catch(error){
                             console.error("[processPayment Loan - Offline] Error:", error);
                             throw error;
                        }
                    }
                };

                await processPayment();
                await loadAllLocalDataToState();

                // *** PERBAIKAN: Failsafe refresh appState ***
                if (!Array.isArray(appState.fundingSources) || appState.fundingSources.length === 0) {
                    console.warn("[handleProcessPayment] appState.fundingSources kosong/invalid setelah loadAll. Re-fetching...");
                    appState.fundingSources = await localDB.funding_sources.where('isDeleted').notEqual(1).toArray();
                }
                if (!Array.isArray(appState.fundingCreditors) || appState.fundingCreditors.length === 0) {
                    console.warn("[handleProcessPayment] appState.fundingCreditors kosong/invalid setelah loadAll. Re-fetching...");
                    appState.fundingCreditors = await localDB.funding_creditors.where('isDeleted').notEqual(1).toArray();
                }
                // *** AKHIR PERBAIKAN ***

                // Ambil data terbaru dari appState (yang sudah di-refresh)
                const loan = appState.fundingSources.find(f => f.id === id);
                if (!loan) {
                    console.error("Data pinjaman tidak ditemukan di appState bahkan setelah refresh untuk ID:", id);
                    throw new Error("Data pinjaman tidak ditemukan setelah pemrosesan.");
                }

                const creditor = appState.fundingCreditors.find(c => c.id === loan.creditorId);
                const isNowPaid = loan.status === 'paid';

                // PERBAIKAN: Gunakan fungsi penutup 'Immediate'
                if (containerToClose) {
                    if (containerToClose.id === 'detail-pane') {
                        if (window.matchMedia('(max-width: 599px)').matches) {
                            hideMobileDetailPageImmediate(); // <--- PERBAIKAN
                        } else {
                            closeDetailPaneImmediate();
                        }
                    } else if (containerToClose.classList.contains('modal-bg')) {
                        closeModalImmediate(containerToClose);
                    }
                    containerToClose = null;
                }

                if(loadingToast && typeof loadingToast.close === 'function') loadingToast.close();

                emit('uiInteraction.showPaymentSuccessPreviewPanel', {
                    title: 'Pembayaran Cicilan Berhasil!',
                    description: `Pembayaran cicilan untuk pinjaman dari: ${creditor ? creditor.creditorName : 'Kreditur'}`,
                    amount: amountToPay,
                    date: date,
                    recipient: creditor ? creditor.creditorName : 'Kreditur',
                    isLunas: isNowPaid,
                    billId: id,
                }, 'pemasukan');

                _logActivity(`Membayar Cicilan Pinjaman`, { loanId: id, amount: amountToPay });
                emit('ui.page.recalcDashboardTotals');
                toast('success', 'Pembayaran cicilan berhasil diproses!');
                
                return true; // Signal sukses

            } catch (error) {
                if(loadingToast && typeof loadingToast.close === 'function') loadingToast.close();
                // PERBAIKAN: Gunakan fungsi penutup 'Immediate'
                if (containerToClose) {
                    if (containerToClose.id === 'detail-pane') {
                        if (window.matchMedia('(max-width: 599px)').matches) {
                            hideMobileDetailPageImmediate(); // <--- PERBAIKAN
                        } else {
                            closeDetailPaneImmediate();
                        }
                    } else if (containerToClose.classList.contains('modal-bg')) {
                        closeModalImmediate(containerToClose);
                    }
                }
                toast('error', `Gagal memproses pembayaran: ${error.message}`);
                console.error("Gagal memproses pembayaran pinjaman:", error);
                return false; // Signal gagal
            }
        }
    });
    return true;
}


export async function handleProcessIndividualSalaryPayment(formElement) {
    const billId = formElement.dataset.billId;
    const workerId = formElement.dataset.workerId;
    const amountToPay = parseFormattedNumber(formElement.elements.amount.value);
    const dateInput = new Date(formElement.elements.date.value);
    const now = new Date();
    const date = new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate(), now.getHours(), now.getMinutes(), 0, 0);

    if (amountToPay <= 0) {
         toast('error', 'Jumlah pembayaran harus lebih dari nol.');
         return false;
    }

    const bill = appState.bills.find(b => b.id === billId);
    const workerDetail = bill?.workerDetails.find(w => w.id === workerId || w.workerId === workerId);
    if (!bill || !workerDetail) {
         toast('error', 'Data tagihan atau pekerja tidak ditemukan.');
         return false;
    }

    const amountFormatted = fmtIDR(amountToPay);

    createModal('confirmPayBill', {
         message: `Anda akan membayar gaji <strong>${workerDetail.name}</strong> sebesar <strong>${amountFormatted}</strong>. Lanjutkan?`,
         onConfirm: async () => {
              let loadingToast;
              let containerToClose = null;
             try {
                 loadingToast = toast('syncing', 'Memproses pembayaran...');
                 containerToClose = formElement.closest('.modal-bg, #detail-pane');

                 const processPayment = async () => {
                     let localAttachmentId = null;
                     const file = formElement.elements.paymentAttachment?.files?.[0];

                     if (!navigator.onLine || _isQuotaExceeded()) {
                         try {
                             const transactionTables = ['bills', 'pending_payments'];
                             if (file) transactionTables.push('files');
                             const dexieTables = transactionTables.map(name => localDB[name]).filter(Boolean);

                             await localDB.transaction('rw', dexieTables, async () => {
                                 if (file) {
                                     const compressed = await _compressImage(file, 0.85, 1280);
                                     const blob = compressed || file;
                                     localAttachmentId = `payment-${billId}-${workerId}-${Date.now()}`;
                                     await localDB.files.put({ id: localAttachmentId, file: blob, addedAt: new Date(), size: blob.size || 0 });
                                     await _enforceLocalFileStorageLimit();
                                 }
                                 const localBill = await localDB.bills.get(billId);
                                 if (!localBill) throw new Error("Tagihan tidak ditemukan di perangkat.");
                                 const baseAmount = localBill.amount || 0;
                                 const currentPaid = localBill.paidAmount || 0;
                                 const newPaidAmount = currentPaid + amountToPay;
                                 const isPaid = newPaidAmount >= baseAmount;
                                 await localDB.bills.where('id').equals(billId).modify({
                                     paidAmount: newPaidAmount,
                                     status: isPaid ? 'paid' : 'unpaid',
                                     ...(isPaid ? { paidAt: date } : {}),
                                     syncState: 'pending_update',
                                     updatedAt: new Date()
                                 });
                                 await localDB.pending_payments.add({
                                     billId: bill.id, amount: amountToPay, date, workerId: workerDetail.id || workerId,
                                     workerName: workerDetail.name, localAttachmentId, createdAt: new Date()
                                 });
                             });

                             _logActivity(`Membayar Gaji Individual (Offline): ${workerDetail.name}`, { billId, amount: amountToPay });
                             toast('info', 'Offline atau kuota habis. Data disimpan di perangkat.');
                             requestSync({ silent: true });

                         } catch (e) {
                             console.error("[processPayment Gaji - Offline] Error:", e);
                             throw e;
                         }
                     } else {
                        try {
                            const billRef = doc(billsCol, bill.id);
                            let attachmentUrl = null;
                            if (file) attachmentUrl = await _uploadFileToCloudinary(file, { silent: true });
                            if (file && !attachmentUrl) throw new Error("Gagal mengunggah lampiran.");

                            await runTransaction(db, async (transaction) => {
                                const billSnap = await transaction.get(billRef);
                                if (!billSnap.exists()) throw new Error('Tagihan tidak ditemukan di server.');
                                const billData = billSnap.data();
                                const baseAmountServer = billData.amount || 0;
                                const newPaidAmountServer = (billData.paidAmount || 0) + amountToPay;
                                const isFullyPaidServer = newPaidAmountServer >= baseAmountServer;
                                transaction.update(billRef, {
                                    paidAmount: increment(amountToPay),
                                    status: isFullyPaidServer ? 'paid' : 'unpaid',
                                    rev: (billData.rev || 0) + 1,
                                    updatedAt: serverTimestamp(),
                                    ...(isFullyPaidServer && { paidAt: Timestamp.fromDate(date) })
                                });
                                const paymentRef = doc(collection(billRef, 'payments'));
                                const paymentData = {
                                    amount: amountToPay, date: Timestamp.fromDate(date), workerId: workerDetail.id || workerId,
                                    workerName: workerDetail.name, createdAt: serverTimestamp()
                                };
                                if (attachmentUrl) paymentData.attachmentUrl = attachmentUrl;
                                transaction.set(paymentRef, paymentData);
                            });
                            _logActivity(`Membayar Gaji Individual: ${workerDetail.name}`, { billId, amount: amountToPay });
                            await syncFromServer();
                        } catch(error) {
                             console.error("[processPayment Gaji - Online] Error:", error);
                             throw error;
                        }
                     }
                 };

                 await processPayment();
                 await loadAllLocalDataToState();

                 const updatedBill = await localDB.bills.get(billId);
                  if (!updatedBill) {
                     console.error("Updated bill data not found after payment processing for ID:", billId);
                     throw new Error("Data tagihan tidak ditemukan setelah pemrosesan.");
                 }

                // PERBAIKAN: Gunakan fungsi penutup 'Immediate'
                if (containerToClose) {
                    if (containerToClose.id === 'detail-pane') {
                        if (window.matchMedia('(max-width: 599px)').matches) {
                            hideMobileDetailPageImmediate(); // <--- PERBAIKAN
                        } else {
                            closeDetailPaneImmediate();
                        }
                    } else if (containerToClose.classList.contains('modal-bg')) {
                        closeModalImmediate(containerToClose);
                    }
                    containerToClose = null;
                }

                 if(loadingToast && typeof loadingToast.close === 'function') loadingToast.close();
                 emit('uiInteraction.showPaymentSuccessPreviewPanel', {
                     title: 'Pembayaran Gaji Berhasil!',
                     description: `Pembayaran gaji untuk ${workerDetail.name}`,
                     amount: amountToPay,
                     date: date,
                     recipient: workerDetail.name,
                     isLunas: updatedBill.status === 'paid',
                     billId: billId,
                 }, 'tagihan');
                 toast('success', 'Pembayaran gaji berhasil diproses!');
                 
                 return true; // Signal sukses

             } catch (error) {
                 if(loadingToast && typeof loadingToast.close === 'function') loadingToast.close();
                // PERBAIKAN: Gunakan fungsi penutup 'Immediate'
                if (containerToClose) {
                    if (containerToClose.id === 'detail-pane') {
                        if (window.matchMedia('(max-width: 599px)').matches) {
                            hideMobileDetailPageImmediate(); // <--- PERBAIKAN
                        } else {
                            closeDetailPaneImmediate();
                        }
                    } else if (containerToClose.classList.contains('modal-bg')) {
                        closeModalImmediate(containerToClose);
                    }
                }
                 toast('error', `Gagal memproses pembayaran: ${error.message}`);
                 console.error("Gagal memproses pembayaran gaji individu:", error);
                 return false; // Signal gagal
             }
         }
    });
     return true;
}
