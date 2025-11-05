import { localDB } from "../../localDbService.js";
import { queueOutbox } from "../../outboxService.js";

export async function _performSoftDelete(id, type, isSoftDelete = true) {
    const localMark = { isDeleted: isSoftDelete ? 1 : 0, syncState: 'pending_update', updatedAt: new Date() };
    const tablesToUpdate = new Set();
    const affectedRecords = [];

    try {
        let undoAction = async () => {};

        const allTableNames = localDB.tables.map(table => table.name);

        await localDB.transaction('rw', allTableNames.map(name => localDB[name]), async () => {
            const originalItems = [];

            const backupItem = async (table, itemId) => {
                if (!itemId) return;
                const item = await table.get(itemId);
                if (item) originalItems.push({ table, item });
            };

            const normalizedType = type.startsWith('bill') ? 'bills' : (type.startsWith('expense') ? 'expenses' : type);

            if (normalizedType === 'bills') {
                const bill = await localDB.bills.get(id);
                if (!bill) return;

                await backupItem(localDB.bills, id);
                await localDB.bills.update(id, localMark);
                await queueOutbox({ table: 'bills', docId: id, op: 'upsert', payload: { id, ...localMark }, priority: 6 });
                tablesToUpdate.add(localDB.bills);
                affectedRecords.push({ table: 'bills', id });

                if (bill.expenseId && bill.type !== 'gaji' && bill.type !== 'fee') {
                    await backupItem(localDB.expenses, bill.expenseId);
                    await localDB.expenses.update(bill.expenseId, localMark);
                    await queueOutbox({ table: 'expenses', docId: bill.expenseId, op: 'upsert', payload: { id: bill.expenseId, ...localMark }, priority: 6 });
                    tablesToUpdate.add(localDB.expenses);
                    affectedRecords.push({ table: 'expenses', id: bill.expenseId });
                }
            
            } else if (normalizedType === 'expenses') {
                const expense = await localDB.expenses.get(id);
                if (!expense) return;

                await backupItem(localDB.expenses, id);
                await localDB.expenses.update(id, localMark);
                await queueOutbox({ table: 'expenses', docId: id, op: 'upsert', payload: { id, ...localMark }, priority: 6 });
                tablesToUpdate.add(localDB.expenses);
                affectedRecords.push({ table: 'expenses', id });

                const bill = await localDB.bills.where('expenseId').equals(id).first();
                if (bill) {
                    await backupItem(localDB.bills, bill.id);
                    await localDB.bills.update(bill.id, localMark);
                    await queueOutbox({ table: 'bills', docId: bill.id, op: 'upsert', payload: { id: bill.id, ...localMark }, priority: 6 });
                    tablesToUpdate.add(localDB.bills);
                    affectedRecords.push({ table: 'bills', id: bill.id });
                }

            } else if (type === 'gaji' || (await localDB.bills.get(id))?.type === 'gaji') {
                const bill = await localDB.bills.get(id);
                if (!bill) throw new Error('Tagihan gaji tidak ditemukan.');

                await backupItem(localDB.bills, bill.id);
                await localDB.bills.update(id, localMark);
                try { await queueOutbox({ table: 'bills', docId: id, op: 'upsert', payload: { id, ...localMark }, priority: 6 }); } catch(_) {}
                tablesToUpdate.add(localDB.bills);
                affectedRecords.push({ table: 'bills', id });

                if (bill.recordIds && bill.recordIds.length > 0) {
                     const records = await localDB.attendance_records.where('id').anyOf(bill.recordIds).toArray();
                     for(const r of records) { await backupItem(localDB.attendance_records, r.id); }

                    const attendanceUpdate = isSoftDelete ? { isPaid: false, billId: null } : { isPaid: true, billId: id };
                    const attendanceUpdateWithSync = {...attendanceUpdate, syncState: 'pending_update', updatedAt: new Date()};
                    await localDB.attendance_records.where('id').anyOf(bill.recordIds).modify(attendanceUpdateWithSync);
                    tablesToUpdate.add(localDB.attendance_records);
                    for (const rid of bill.recordIds) {
                        affectedRecords.push({ table: 'attendance_records', id: rid });
                        try { await queueOutbox({ table: 'attendance_records', docId: rid, op: 'upsert', payload: { id: rid, ...attendanceUpdate }, priority: 6 }); } catch(_) {}
                    }
                }
            } else {
                const tableName = (type === 'pinjaman' || type === 'funding_sources') ? 'funding_sources' : (type === 'termin' ? 'incomes' : type);
                const table = localDB[tableName];
                if (table) {
                    await backupItem(table, id);
                    await table.update(id, localMark);
                    try { await queueOutbox({ table: tableName, docId: id, op: 'upsert', payload: { id, ...localMark }, priority: 6 }); } catch(_) {}
                    tablesToUpdate.add(table);
                    affectedRecords.push({ table: tableName, id });
                } else {
                    throw new Error(`Tipe data tidak valid: ${type}`);
                }
            }
            
            undoAction = async () => {
                 await localDB.transaction('rw', Array.from(tablesToUpdate).map(t => t.name), async () => {
                    for (const { table, item } of originalItems) {
                        await table.put(item);
                        const undoMark = { syncState: 'pending_update', updatedAt: new Date() };
                        await table.update(item.id, undoMark);
                        try { await queueOutbox({ table: table.name, docId: item.id, op: 'upsert', payload: { id: item.id, isDeleted: item.isDeleted, isPaid: item.isPaid, billId: item.billId }, priority: 6 }); } catch(_) {}
                    }
                 });
            };
        });

        return { success: true, undoAction };

    } catch (error) {
         console.error(`_performSoftDelete error for ${id} (${type}, delete=${isSoftDelete}):`, error);
        return { success: false, undoAction: async () => {} };
    }
}