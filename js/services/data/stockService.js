import { emit, on } from "../../state/eventBus.js";
import { appState } from "../../state/appState.js";
import { db, materialsCol, stockTransactionsCol } from "../../config/firebase.js";
import { doc, runTransaction, increment, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { toast } from "../../ui/components/toast.js";
import { startGlobalLoading } from "../../ui/components/modal.js";
import { _logActivity } from "../logService.js";
import { parseFormattedNumber } from "../../utils/formatters.js";
import { apiRequest, mapDeleteEndpoint } from "../../utils/formPersistence.js";
import { localDB, loadAllLocalDataToState } from "../localDbService.js";
import { queueOutbox } from "../outboxService.js";
import { _isQuotaExceeded, requestSync } from "../syncService.js";
import { generateUUID } from "../../utils/helpers.js";
import { fetchAndCacheData } from "./fetch.js";

export async function processStokIn(form) {
    const materialId = form.dataset.id;
    const quantity = Number(form.elements.quantity.value);
    const price = parseFormattedNumber(form.elements.price.value);
    const date = new Date(form.elements.date.value);
    const material = appState.materials.find(m => m.id === materialId);
    
    if (!navigator.onLine || _isQuotaExceeded()) {
        try {
            const newStock = (material?.currentStock || 0) + quantity;
            const newTxId = generateUUID();
            const newTxRecord = {
                id: newTxId,
                materialId,
                quantity,
                date: date,
                type: 'in',
                pricePerUnit: price,
                createdAt: new Date(),
                syncState: 'pending_create',
                isDeleted: 0
            };
            
            await localDB.transaction('rw', localDB.materials, localDB.stock_transactions, localDB.outbox, async () => {
                await localDB.materials.update(materialId, {
                    currentStock: newStock,
                    syncState: 'pending_update',
                    updatedAt: new Date()
                });
                await localDB.stock_transactions.add(newTxRecord);
                
                await queueOutbox({ table: 'materials', docId: materialId, op: 'upsert', payload: { id: materialId, currentStock: newStock }, priority: 6 });
                await queueOutbox({ table: 'stock_transactions', docId: newTxId, op: 'upsert', payload: newTxRecord, priority: 7 });
            });

            _logActivity('Mencatat Stok Masuk (Lokal)', { materialId, quantity });
            await loadAllLocalDataToState(); // Muat ulang state
            emit('ui.page.render'); // Render ulang halaman stok
            emit('ui.stok.renderContent');
            requestSync({ silent: true });
            return;
        } catch (error) {
            console.error("Gagal simpan stok masuk (offline):", error);
            throw error;
        }
    }

    try {
        const materialRef = doc(materialsCol, materialId);
        const transRef = doc(stockTransactionsCol);
        await runTransaction(db, async (transaction) => {
            const mSnap2 = await transaction.get(materialRef);
            const mRev2 = mSnap2.exists() ? (mSnap2.data().rev || 0) : 0;
            transaction.update(materialRef, {
                currentStock: increment(quantity),
                rev: mRev2 + 1,
                updatedAt: serverTimestamp()
            });
            transaction.set(transRef, {
                materialId,
                quantity,
                date: Timestamp.fromDate(date),
                type: 'in',
                pricePerUnit: price,
                createdAt: serverTimestamp()
            });
        });
        _logActivity('Mencatat Stok Masuk', {
            materialId,
            quantity
        });
        emit('ui.page.render');
        await refreshStockDataCaches();
    } catch (error) {
        console.error(error);
        throw error;
    }
}

export async function processStokOut(form) {
    const materialId = form.dataset.id;
    const quantity = Number(form.elements.quantity.value);
    const projectId = form.elements.projectId.value;
    const date = new Date(form.elements.date.value);
    const material = appState.materials.find(m => m.id === materialId);
    if (!navigator.onLine || _isQuotaExceeded()) {
        try {
            const currentStock = material?.currentStock || 0;
            if (currentStock < quantity) {
                throw new Error("Stok lokal tidak mencukupi!");
            }
            const newStock = currentStock - quantity;
            const newTxId = generateUUID();
            const newTxRecord = {
                id: newTxId,
                materialId,
                quantity,
                date: date,
                type: 'out',
                projectId,
                createdAt: new Date(),
                syncState: 'pending_create',
                isDeleted: 0
            };
            
            await localDB.transaction('rw', localDB.materials, localDB.stock_transactions, localDB.outbox, async () => {
                await localDB.materials.update(materialId, {
                    currentStock: newStock,
                    syncState: 'pending_update',
                    updatedAt: new Date()
                });
                await localDB.stock_transactions.add(newTxRecord);
                
                await queueOutbox({ table: 'materials', docId: materialId, op: 'upsert', payload: { id: materialId, currentStock: newStock }, priority: 6 });
                await queueOutbox({ table: 'stock_transactions', docId: newTxId, op: 'upsert', payload: newTxRecord, priority: 7 });
            });

            _logActivity('Mencatat Stok Keluar (Lokal)', { materialId, quantity, projectId });
            await loadAllLocalDataToState(); // Muat ulang state
            emit('ui.page.render'); // Render ulang halaman stok
            emit('ui.stok.renderContent');
            requestSync({ silent: true });
            return;
        } catch (error) {
            console.error("Gagal simpan stok keluar (offline):", error);
            throw error;
        }
    }

    
    if (!projectId) {
        throw new Error('Proyek harus dipilih.');
    }

    try {
        const materialRef = doc(materialsCol, materialId);
        const transRef = doc(stockTransactionsCol);
        await runTransaction(db, async (transaction) => {
            const matDoc = await transaction.get(materialRef);
            if (!matDoc.exists() || (matDoc.data().currentStock || 0) < quantity) {
                throw new Error("Stok tidak mencukupi!");
            }
            const mSnap3 = await transaction.get(materialRef);
            const mRev3 = mSnap3.exists() ? (mSnap3.data().rev || 0) : 0;
            transaction.update(materialRef, {
                currentStock: increment(-quantity),
                rev: mRev3 + 1,
                updatedAt: serverTimestamp()
            });
            transaction.set(transRef, {
                materialId,
                quantity,
                date: Timestamp.fromDate(date),
                type: 'out',
                projectId,
                createdAt: serverTimestamp()
            });
        });
        _logActivity('Mencatat Stok Keluar', {
            materialId,
            quantity,
            projectId
        });
        emit('ui.page.render');
        await refreshStockDataCaches();
    } catch (error) {
        console.error(error);
        throw error;
    }
}

export async function processBatchStockOut(materialId, transactions = [], dateStr) {
    const normalizedTx = Array.isArray(transactions)
        ? transactions
            .map(tx => ({
                projectId: tx?.projectId,
                quantity: Number(tx?.quantity) || 0
            }))
            .filter(tx => tx.projectId && tx.quantity > 0)
        : [];

    if (!materialId) throw new Error('Material tidak valid.');
    if (normalizedTx.length === 0) throw new Error('Tidak ada alokasi stok yang valid.');

    const material = appState.materials.find(m => m.id === materialId);
    if (!material) throw new Error('Data material tidak ditemukan.');

    const totalQuantity = normalizedTx.reduce((sum, tx) => sum + tx.quantity, 0);
    if (totalQuantity <= 0) throw new Error('Total stok keluar harus lebih dari 0.');

    const usageDate = dateStr ? new Date(dateStr) : new Date();
    if (Number.isNaN(usageDate.getTime())) {
        throw new Error('Tanggal penyaluran tidak valid.');
    }

    if (!navigator.onLine || _isQuotaExceeded()) {
        try {
            const currentStock = material?.currentStock || 0;
            if (currentStock < totalQuantity) {
                throw new Error('Stok lokal tidak mencukupi.');
            }
            const newStock = currentStock - totalQuantity;
            await localDB.transaction('rw', localDB.materials, localDB.stock_transactions, localDB.outbox, async () => {
                await localDB.materials.update(materialId, {
                    currentStock: newStock,
                    syncState: 'pending_update',
                    updatedAt: new Date()
                });

                for (const tx of normalizedTx) {
                    const newTxId = generateUUID();
                    const record = {
                        id: newTxId,
                        materialId,
                        quantity: tx.quantity,
                        date: usageDate,
                        type: 'out',
                        projectId: tx.projectId,
                        createdAt: new Date(),
                        syncState: 'pending_create',
                        isDeleted: 0
                    };
                    await localDB.stock_transactions.add(record);
                    await queueOutbox({
                        table: 'stock_transactions',
                        docId: newTxId,
                        op: 'upsert',
                        payload: record,
                        priority: 7
                    });
                }

                await queueOutbox({
                    table: 'materials',
                    docId: materialId,
                    op: 'upsert',
                    payload: { id: materialId, currentStock: newStock },
                    priority: 6
                });
            });

        _logActivity('Mencatat Penyaluran Stok (Lokal)', {
            materialId,
            totalQuantity,
            detailCount: normalizedTx.length
        });
        await loadAllLocalDataToState();
        emit('ui.page.render');
        emit('ui.stok.renderContent');
        requestSync({ silent: true });
        toast('success', 'Penyaluran stok tersimpan offline.');
        return;
        } catch (error) {
            console.error('Gagal memproses batch stok keluar (offline):', error);
            throw error;
        }
    }

    try {
        const materialRef = doc(materialsCol, materialId);
        await runTransaction(db, async (transaction) => {
            const matSnapshot = await transaction.get(materialRef);
            if (!matSnapshot.exists()) {
                throw new Error('Material tidak ditemukan.');
            }
            const currentStock = matSnapshot.data().currentStock || 0;
            if (currentStock < totalQuantity) {
                throw new Error('Stok tidak mencukupi!');
            }
            const currentRev = matSnapshot.data().rev || 0;
            transaction.update(materialRef, {
                currentStock: increment(-totalQuantity),
                rev: currentRev + 1,
                updatedAt: serverTimestamp()
            });

            for (const tx of normalizedTx) {
                const txRef = doc(stockTransactionsCol);
                transaction.set(txRef, {
                    materialId,
                    quantity: tx.quantity,
                    date: Timestamp.fromDate(usageDate),
                    type: 'out',
                    projectId: tx.projectId,
                    createdAt: serverTimestamp()
                });
            }
        });

    _logActivity('Mencatat Penyaluran Stok', {
        materialId,
        totalQuantity,
        detailCount: normalizedTx.length
    });
    emit('ui.page.render');
    await refreshStockDataCaches();
    toast('success', 'Penyaluran stok berhasil.');
} catch (error) {
    console.error('Gagal memproses batch stok keluar:', error);
    throw error;
}
}

export async function handleEditStockTransaction(dataset) {
    // Implement logic from _processStockTransactionUpdate
}

export async function handleDeleteStockTransaction(dataset) {
    emit('ui.modal.create', 'confirmDelete', {
        message: 'Menghapus riwayat ini juga akan mengembalikan jumlah stok. Aksi ini tidak dapat dibatalkan. Lanjutkan?',
        onConfirm: () => _processStockTransactionDelete(dataset)
    });
} 

async function refreshStockDataCaches() {
    try {
        await Promise.all([
            fetchAndCacheData('materials', materialsCol, 'materialName'),
            fetchAndCacheData('stockTransactions', stockTransactionsCol, 'date')
        ]);
        emit('ui.stok.renderContent');
    } catch (error) {
        console.error('Gagal menyegarkan cache stok:', error);
    }
}

async function _processStockTransactionUpdate(form) {
    const { id, type, oldQty, materialId } = form.dataset;
    const newQty = Number(form.elements.quantity.value);
    const qtyDifference = newQty - Number(oldQty);
    
    if (qtyDifference === 0 && type === 'in') {
        return;
    }

    try {
        const transRef = doc(stockTransactionsCol, id);
        const materialRef = doc(materialsCol, materialId);
        const dataToUpdate = { quantity: newQty };
        if (type === 'out') {
            dataToUpdate.projectId = form.elements.projectId.value;
        }
        await runTransaction(db, async (transaction) => {
            transaction.update(transRef, dataToUpdate);
            const stockAdjustment = type === 'out' ? -qtyDifference : qtyDifference;
            const mSnap = await transaction.get(materialRef);
            const mRev = mSnap.exists() ? (mSnap.data().rev || 0) : 0;
            transaction.update(materialRef, {
                currentStock: increment(stockAdjustment),
                rev: mRev + 1,
                updatedAt: serverTimestamp()
            });
        });
        _logActivity('Mengedit Riwayat Stok', {
            transactionId: id,
            newQty
        });
        emit('ui.page.render');
    } catch (error) {
        console.error(error);
        throw error;
    }
}

async function _processStockTransactionDelete(dataset) {
      const { id, type, qty, materialId } = dataset;
      const loader = startGlobalLoading('Menghapus transaksi...');
      try {
          let apiOk = false;
          try {
              await apiRequest('DELETE', mapDeleteEndpoint('stock_transaction', id));
              apiOk = true;
          } catch (_) {}
          if (!apiOk) {
              const transRef = doc(stockTransactionsCol, id);
              await runTransaction(db, async (transaction) => {
                  let materialRef;
                  let matDoc = null;
                  if (materialId && materialId !== 'undefined') {
                      materialRef = doc(materialsCol, materialId);
                      matDoc = await transaction.get(materialRef);
                  }
                  transaction.delete(transRef);
                  if (matDoc && matDoc.exists()) {
                      const stockAdjustment = type === 'in'?-Number(qty) : Number(qty);
                      transaction.update(materialRef, {
                          currentStock: increment(stockAdjustment)
                      });
                  } else if (materialId && materialId !== 'undefined') {
                      console.warn(`Master material dengan ID ${materialId} tidak ditemukan. Melewatkan pembaruan stok.`);
                  }
              });
          }
  
          _logActivity('Menghapus Riwayat Stok', {
              transactionId: id
          });
          toast('success', 'Riwayat stok berhasil dihapus.');
          emit('ui.page.render');
      } catch (error) {
          toast('error', 'Gagal menghapus riwayat.');
          console.error(error);
      } finally {
          loader.close();
      }
}

document.addEventListener('DOMContentLoaded', () => {
    on('form.submit.stokIn', (e) => processStokIn(e.target));
    on('form.submit.stokOut', (e) => processStokOut(e.target));
});
