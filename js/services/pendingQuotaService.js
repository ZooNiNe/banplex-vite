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
            }
        });
    } catch (err) {
        console.error('[PendingQuota] Gagal mengambil data pending quota:', err);
    }
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
