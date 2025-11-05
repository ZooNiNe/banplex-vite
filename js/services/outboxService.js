import { localDB } from "./localDbService.js";

export async function queueOutbox({ table, docId, op = 'upsert', payload = {}, priority = 5 }) {
  // Deduplicate for comments by clientMsgId/docId to prevent double send
  try {
    if (table === 'comments') {
      const existing = await localDB.outbox
        .where('table')
        .equals('comments')
        .toArray();
      const clientId = payload && (payload.clientMsgId || payload.id || docId);
      if (existing && existing.some(r => r.status === 'pending' && (r.docId === docId || (r.payload && (r.payload.clientMsgId === clientId || r.payload.id === clientId))))) {
        return null;
      }
    }
  } catch (_) {}

  const item = {
    table,
    docId,
    op,
    payload,
    priority,
    status: 'pending',
    createdAt: Date.now(),
    retryCount: 0,
    lastTriedAt: 0,
  };
  return await localDB.outbox.add(item);
}

export async function takeOutboxBatch(limit = 50) {
  // FIFO by createdAt, then higher priority first
  const rows = await localDB.outbox
    .orderBy('createdAt')
    .toArray();
  // simple prioritization in-memory
  rows.sort((a, b) => (b.priority || 0) - (a.priority || 0) || (a.createdAt - b.createdAt));
  return rows.slice(0, limit);
}

export async function markOutboxDone(id) {
  try { await localDB.outbox.delete(id); } catch (_) {}
}

export async function markOutboxFailed(id) {
  try {
    await localDB.outbox.update(id, { status: 'failed', retryCount: (await localDB.outbox.get(id))?.retryCount + 1 || 1, lastTriedAt: Date.now() });
  } catch (_) {}
}
