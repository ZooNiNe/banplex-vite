import { emit, on } from "../../../state/eventBus.js";
import { appState } from "../../../state/appState.js";
import { localDB, loadAllLocalDataToState } from "../../localDbService.js";
import { db, expensesCol, billsCol } from "../../../config/firebase.js";
// TAMBAHAN: Import serverTimestamp
import { doc, runTransaction, serverTimestamp, Timestamp, collection, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { generateUUID } from "../../../utils/helpers.js";
import { syncToServer, requestSync } from "../../syncService.js";
import { toast } from "../../../ui/components/toast.js";
import { _logActivity } from "../../logService.js";
import { parseFormattedNumber, parseLocaleNumber } from "../../../utils/formatters.js";
import { notify } from "../../../state/liveQuery.js";
import { queueOutbox } from "../../outboxService.js";

export async function handleAddPengeluaran(form, type, statusOverride) {
    const status = statusOverride;
    let expenseToStore = null;
    let billDataForPreview = null;
    let specificExpenseType = type;

    try {
        const projectId = form.elements['expense-project']?.value || form.elements['project-id']?.value;
        if (!projectId) {
            throw new Error('Proyek harus dipilih.');
        }

        // REVISI: Ambil tanggal saja, gunakan serverTimestamp untuk waktu akurat
        const dateInput = new Date(form.elements['pengeluaran-tanggal']?.value || form.elements['date']?.value);
        const date = new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate());
        
        const notes = form.elements.notes?.value.trim() || '';
        let expenseDetails = {};
        const formMode = form.elements['formType']?.value || 'faktur';

        const supplierIdInput = form.elements['supplier-id']?.value || form.elements['expense-supplier']?.value;
        let supplierName = '';
        if (supplierIdInput && appState.suppliers) {
             const supp = appState.suppliers.find(s => s.id === supplierIdInput);
             supplierName = supp?.supplierName || '';
        }

        // ... (Logika type === 'material' dan else TETAP SAMA seperti file Anda) ...
        if (type === 'material') {
            specificExpenseType = 'material';
            const items = [];
            if (formMode === 'surat_jalan') {
                form.querySelectorAll('.multi-item-row').forEach(row => {
                    const materialIdInput = row.querySelector('.custom-select-wrapper input[type="hidden"]');
                    const materialId = materialIdInput ? materialIdInput.value : null;
                    const qty = parseLocaleNumber(row.querySelector('input[name="itemQty"]').value);
                    if (materialId && qty > 0) {
                        const mat = appState.materials.find(m => m.id === materialId);
                        items.push({ name: mat?.materialName || 'Barang', price: 0, qty, total: 0, materialId });
                    }
                });
                if (items.length === 0) { throw new Error('Harap tambahkan minimal satu barang.'); }
                expenseDetails = { 
                    amount: 0, 
                    description: form.elements['description'].value.trim() || 'Surat Jalan', 
                    supplierId: supplierIdInput, 
                    supplierName: supplierName,
                    items 
                };
            } else {
                form.querySelectorAll('.multi-item-row').forEach(row => {
                    const materialIdInput = row.querySelector('.custom-select-wrapper input[type="hidden"]');
                    const materialId = materialIdInput ? materialIdInput.value : null;
                    const material = materialId ? appState.materials.find(m => m.id === materialId) : null;
                    const name = material ? material.materialName : 'Barang Manual';
                    const price = parseFormattedNumber(row.querySelector('input[name="itemPrice"]').value);
                    const qty = parseLocaleNumber(row.querySelector('input[name="itemQty"]').value);
                    if ((materialId || name) && price > 0 && qty > 0) {
                        items.push({ name, price, qty, total: price * qty, materialId });
                    }
                });
                if (items.length === 0) { throw new Error('Harap tambahkan minimal satu barang.'); }
                expenseDetails = { 
                    amount: items.reduce((sum, item) => sum + item.total, 0), 
                    description: form.elements['description'].value.trim() || `Faktur ${items[0].name}`, 
                    supplierId: supplierIdInput, 
                    supplierName: supplierName,
                    items 
                };
            }
        } else {
            specificExpenseType = type;
            expenseDetails = { 
                amount: parseFormattedNumber(form.elements['pengeluaran-jumlah'].value), 
                description: form.elements['pengeluaran-deskripsi'].value.trim(), 
                supplierId: supplierIdInput, 
                supplierName: supplierName,
                categoryId: form.elements['expense-category']?.value || '' 
            };
        }

        if (formMode !== 'surat_jalan' && expenseDetails.amount <= 0) {
            throw new Error('Total faktur harus lebih dari Rp 0.');
        }

        const newExpenseId = generateUUID();
        const syncedUrlInput = form.querySelector('input[name="syncedAttachmentUrls"]');
        const syncedUrls = (syncedUrlInput?.value ? JSON.parse(syncedUrlInput.value) : []).filter(url => url.url);

        expenseToStore = {
            ...expenseDetails,
            id: newExpenseId,
            type: specificExpenseType,
            formType: (type === 'material') ? formMode : undefined,
            projectId,
            date,
            notes,
            createdBy: appState.currentUser.uid,
            createdByName: appState.currentUser.displayName,
            // REVISI: Gunakan serverTimestamp
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            syncState: 'pending_create',
            isDeleted: 0,
            attachments: syncedUrls,
            attachmentsLocalIds: []
        };

        const transactionTables = ['expenses', 'bills', 'files', 'outbox', 'pending_payments', 'materials', 'stock_transactions'];

        await localDB.transaction('rw', ...transactionTables.map(t=>localDB[t]).filter(Boolean), async () => {
            if (formMode === 'surat_jalan') {
                expenseToStore.status = 'delivery_order';
            } else if (status === 'paid') {
                 expenseToStore.status = 'paid';
            } else {
                 expenseToStore.status = 'unpaid';
            }

            await localDB.expenses.add(expenseToStore);
            await queueOutbox({ table: 'expenses', docId: expenseToStore.id, op: 'upsert', payload: expenseToStore, priority: 7 });

            if (formMode !== 'surat_jalan') {
                const finalBillStatus = status;

                const billData = {
                    id: generateUUID(),
                    expenseId: expenseToStore.id,
                    description: expenseDetails.description,
                    amount: expenseDetails.amount,
                    dueDate: date,
                    status: finalBillStatus,
                    type: specificExpenseType,
                    projectId: projectId,
                    supplierId: expenseDetails.supplierId,
                    supplierName: supplierName,
                    createdBy: appState.currentUser.uid,
                    createdByName: appState.currentUser.displayName,
                    // REVISI: Timestamp Bill
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    paidAmount: finalBillStatus === 'paid' ? expenseDetails.amount : 0,
                    ...(finalBillStatus === 'paid' && { paidAt: serverTimestamp() }), // Paid at juga serverTimestamp
                    syncState: 'pending_create',
                    isDeleted: 0,
                };
                await localDB.bills.add(billData);
                await queueOutbox({ table: 'bills', docId: billData.id, op: 'upsert', payload: billData, priority: 7 });

                if (formMode === 'faktur' && expenseToStore.items && expenseToStore.items.length > 0) {
                    for (const item of expenseToStore.items) {
                        if (item.materialId && item.qty > 0) {
                            // ... (Logika Stok sama) ...
                            const stockTxId = generateUUID();
                            const stockTx = {
                                id: stockTxId,
                                materialId: item.materialId,
                                quantity: item.qty,
                                date: date, 
                                type: 'in', 
                                pricePerUnit: item.price,
                                relatedExpenseId: expenseToStore.id, 
                                createdBy: appState.currentUser.uid,
                                createdByName: appState.currentUser.displayName,
                                createdAt: new Date(),
                                isDeleted: 0,
                                syncState: 'pending_create'
                            };
                            await localDB.stock_transactions.add(stockTx);
                            await queueOutbox({ table: 'stock_transactions', docId: stockTxId, op: 'upsert', payload: stockTx, priority: 7 });

                            const material = await localDB.materials.get(item.materialId);
                            if (material) {
                                const newStock = (material.currentStock || 0) + item.qty;
                                await localDB.materials.update(item.materialId, {
                                    currentStock: newStock,
                                    syncState: 'pending_update',
                                    updatedAt: new Date()
                                });
                                await queueOutbox({
                                    table: 'materials',
                                    docId: item.materialId,
                                    op: 'upsert',
                                    payload: { id: item.materialId, currentStock: newStock, updatedAt: new Date() },
                                    priority: 6
                                });
                            }
                        }
                    }
                }

                if (finalBillStatus === 'paid') {
                    await localDB.pending_payments.add({
                        billId: billData.id,
                        amount: billData.amount,
                        date: billData.dueDate,
                        createdAt: new Date(),
                        recipientName: supplierName || 'Penerima'
                    });
                }
                billDataForPreview = billData;
            }
        });

        _logActivity(`Menambah Pengeluaran (Lokal): ${expenseDetails.description}`, { amount: expenseDetails.amount });

        if (navigator.onLine) {
            requestSync({ silent: true });
        }

        form.reset();
        if (syncedUrlInput) syncedUrlInput.value = '';
        if (form._clearDraft) form._clearDraft();

        await loadAllLocalDataToState();
        
        notify('expenses');
        notify('bills');
        if (formMode === 'faktur' && specificExpenseType === 'material') {
            notify('materials');
            notify('stock_transactions');
        }

        emit('ui.page.recalcDashboardTotals');

        emit('uiInteraction.showSuccessPreviewPanel', { expense: expenseToStore, bill: billDataForPreview }, specificExpenseType);

    } catch (error) {
        throw error;
    }
}

// ... (HandleUpdatePengeluaran tetap sama, hanya saran: jika mau akurat gunakan serverTimestamp() di updatedAt)
export async function handleUpdatePengeluaran(form) {
    // (Copy paste kode handleUpdatePengeluaran dari file Anda sebelumnya, tidak ada perubahan logika kritis di sini selain timestamp jika diinginkan)
    // ...
    const { id, type } = form.dataset;
    if (type !== 'expense') return { success: false };

    let dataToUpdate = {}, config = { title: 'Pengeluaran' }, table;
    let expenseAmount;
    let expenseDescription;
    let tableName = 'expenses';
    let originalItemType = type;
    let specificExpenseType = 'lainnya';
    const notes = form.elements.notes?.value.trim() || '';

    try {
        expenseAmount = 0;
        expenseDescription = form.elements.description.value;
        
        const supplierIdInput = form.elements['supplier-id']?.value || form.elements['expense-supplier']?.value;
        let supplierName = '';
        if (supplierIdInput && appState.suppliers) {
             const supp = appState.suppliers.find(s => s.id === supplierIdInput);
             supplierName = supp?.supplierName || '';
        }

        let expenseItems = [];

        if (form.querySelector('#invoice-items-container')) {
             originalItemType = 'material';
             specificExpenseType = 'material';
            expenseItems = Array.from(form.querySelectorAll('.multi-item-row')).map(row => {
                const materialId = row.querySelector('input[type="hidden"][name^="materialId_"]')?.value || null;
                const price = parseFormattedNumber(row.querySelector('input[name="itemPrice"]').value);
                const qty = parseLocaleNumber(row.querySelector('input[name="itemQty"]').value);
                return { name: row.querySelector('.custom-select-trigger span')?.textContent || 'Barang', price, qty, total: price * qty, materialId };
            });
            if (expenseItems.length === 0) throw new Error('Faktur harus memiliki minimal satu barang.');
            expenseAmount = expenseItems.reduce((sum, item) => sum + item.total, 0);

            dataToUpdate = {
                projectId: form.elements['project-id'].value,
                supplierId: supplierIdInput,
                supplierName: supplierName,
                description: expenseDescription,
                date: new Date(form.elements.date.value),
                items: expenseItems,
                amount: expenseAmount,
                notes
            };
        } else {
            expenseAmount = parseFormattedNumber(form.elements.amount.value);
            expenseDescription = form.elements.description.value;
            const expense = appState.expenses.find(exp => exp.id === form.dataset.id);
            originalItemType = expense?.type || 'lainnya';
            specificExpenseType = originalItemType;

            dataToUpdate = {
                amount: expenseAmount,
                description: expenseDescription,
                date: new Date(form.elements.date.value),
                projectId: form.elements['expense-project'].value,
                supplierId: supplierIdInput,
                supplierName: supplierName,
                categoryId: form.elements['expense-category']?.value || '',
                notes
            };
        }

        dataToUpdate.formType = form.elements.formType?.value;

        const syncedUrlInput = form.querySelector('input[name="syncedAttachmentUrls"]');
        if(syncedUrlInput) {
            dataToUpdate.attachments = JSON.parse(syncedUrlInput.value || '[]');
        }

        table = localDB[tableName];
        if (!table) throw new Error(`Tabel lokal tidak ditemukan untuk tipe: ${tableName}`);

        const originalExpense = appState.expenses.find(e => e.id === id);
        const isConversion = originalExpense && originalExpense.status === 'delivery_order';
        const transactionTables = [tableName, 'bills', 'outbox'];

        await localDB.transaction('rw', ...transactionTables.map(t=>localDB[t]).filter(Boolean), async () => {
             if (isConversion) {
                 const newStatus = form.elements.status?.value || 'unpaid';
                 dataToUpdate.status = newStatus;
             }
             await table.update(id, { ...dataToUpdate, updatedAt: new Date(), syncState: 'pending_update' });
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


             const localBill = await localDB.bills.where({ expenseId: id }).first();
             const newStatus = form.elements.status?.value || 'unpaid';
             const newBillData = {
                 amount: expenseAmount,
                 description: expenseDescription,
                 dueDate: dataToUpdate.date || new Date(),
                 syncState: 'pending_update',
                 updatedAt: new Date(),
                 supplierName: supplierName, 
             };

             if (localBill) {
                 await localDB.bills.update(localBill.id, newBillData);
                 appState._recentlyEditedIds.add(localBill.id);

                  const billPayloadData = { id: localBill.id };
                  Object.keys(newBillData).forEach(key => {
                     if (key !== 'syncState' && key !== 'updatedAt') {
                         billPayloadData[key] = newBillData[key];
                     }
                  });

                  await queueOutbox({ table: 'bills', docId: localBill.id, op: 'upsert', payload: billPayloadData, priority: 6 });
             } else if (isConversion) {
                 const newBillId = generateUUID();
                 const newBillToCreate = {
                     ...newBillData,
                     id: newBillId,
                     expenseId: id,
                     status: newStatus,
                     type: specificExpenseType,
                     projectId: dataToUpdate.projectId,
                     supplierId: dataToUpdate.supplierId,
                     paidAmount: newStatus === 'paid' ? expenseAmount : 0,
                     ...(newStatus === 'paid' && { paidAt: new Date() }),
                     isDeleted: 0,
                     createdBy: appState.currentUser.uid,
                     createdByName: appState.currentUser.displayName,
                     createdAt: new Date(),
                 };
                 await localDB.bills.add(newBillToCreate);
                  await queueOutbox({ table: 'bills', docId: newBillId, op: 'upsert', payload: newBillToCreate, priority: 7 });
             }
         });

        await _logActivity(`Memperbarui Data (Lokal): ${config.title}`, { docId: id });
        await loadAllLocalDataToState();
                notify('expenses');
                notify('bills');
                if (specificExpenseType === 'material') {
                    notify('materials');
                }
        
        requestSync({ silent: true });

        const updatedExpense = appState.expenses?.find(i => i.id === id);
        const updatedBill = appState.bills?.find(b => b.expenseId === id);
        return { success: true, itemData: { expense: updatedExpense, bill: updatedBill }, itemType: specificExpenseType };

    } catch (error) {
        toast('error', `Gagal menyimpan: ${error.message}`);
        return { success: false };
    }
}