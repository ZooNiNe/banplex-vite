import { localDB } from './localDbService.js';

function ensureMap(map, key) {
    if (!map.has(key)) {
        map.set(key, new Map());
    }
    return map.get(key);
}

function normalizeTypes(types) {
    if (!Array.isArray(types) || types.length === 0) return [];
    return types.filter(Boolean);
}

function mergePendingEntry(existing, incoming) {
    if (!existing) return incoming;
    return {
        ...existing,
        ...incoming,
        status: existing.status || incoming.status,
        message: existing.message || incoming.message,
        dataPayload: incoming.dataPayload || existing.dataPayload || null,
        operation: existing.operation || incoming.operation
    };
}

async function attachOutboxSnapshots(grouped, normalizedTypes = []) {
    if (!localDB?.outbox) return;
    const typeFilter = normalizedTypes.length > 0 ? new Set(normalizedTypes) : null;
    let rows = [];
    try {
        rows = await localDB.outbox.toArray();
    } catch (err) {
        console.error('[PendingQuota] Gagal membaca outbox untuk snapshot quota:', err);
        return;
    }

    const relevantRows = rows.filter(job => {
        if (typeFilter && !typeFilter.has(job.table)) return false;
        return job.status === 'pending' || job.quotaBlocked === 1;
    });

    for (const job of relevantRows) {
        let payload = job.payload;
        if (!payload && job.table && localDB[job.table]) {
            try {
                payload = await localDB[job.table].get(job.docId);
            } catch (_) {}
        }
        const type = job.table || 'unknown';
        const typeMap = ensureMap(grouped, type);
        const existing = typeMap.get(job.docId);
        const merged = mergePendingEntry(existing, {
            id: existing?.id || `outbox-${job.id || job.docId}`,
            status: existing?.status || (job.quotaBlocked ? 'pending_quota' : 'pending_local'),
            dataType: type,
            dataId: job.docId,
            dataPayload: payload || null,
            operation: job.op || existing?.operation || 'upsert',
            lastAttempt: job.lastTriedAt || existing?.lastAttempt || Date.now(),
            message: existing?.message || (job.quotaBlocked ? 'Perubahan tertahan hingga kuota server tersedia.' : 'Perubahan belum disinkron.')
        });
        typeMap.set(job.docId, merged);
    }
}

export async function getPendingQuotaMap(dataType) {
    const maps = await getPendingQuotaMaps(dataType ? [dataType] : []);
    if (dataType) {
        return maps.get(dataType) || new Map();
    }
    return maps;
}

export async function getPendingQuotaMaps(dataTypes = []) {
    const normalizedTypes = normalizeTypes(dataTypes);
    const grouped = new Map();
    try {
        if (!localDB.logs) return grouped;
        let rows = await localDB.logs.where('status').equals('pending_quota').toArray();
        if (normalizedTypes.length > 0) {
            rows = rows.filter(log => normalizedTypes.includes(log.dataType));
        }
        rows.forEach(log => {
            if (!log || !log.dataId) return;
            const type = log.dataType || 'unknown';
            if (normalizedTypes.length > 0 && !normalizedTypes.includes(type)) return;
            const typeMap = ensureMap(grouped, type);
            if (!typeMap.has(log.dataId)) {
                typeMap.set(log.dataId, log);
            } else {
                const existing = typeMap.get(log.dataId);
                typeMap.set(log.dataId, mergePendingEntry(existing, log));
            }
        });
    } catch (err) {
        console.error('[PendingQuota] Gagal mengambil data pending quota:', err);
    }
    await attachOutboxSnapshots(grouped, normalizedTypes);
    return grouped;
}

export function encodePayloadForDataset(payload) {
    if (!payload) return '';
    try {
        return encodeURIComponent(JSON.stringify(payload));
    } catch (err) {
        console.warn('[PendingQuota] Gagal menyandikan payload:', err);
        return '';
    }
}

export function decodePayloadFromDataset(value) {
    if (!value) return null;
    try {
        return JSON.parse(decodeURIComponent(value));
    } catch (err) {
        console.warn('[PendingQuota] Gagal membaca payload:', err);
        return null;
    }
}
