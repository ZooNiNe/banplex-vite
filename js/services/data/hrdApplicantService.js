import { db, hrdApplicantsCol } from '../../config/firebase.js';
import {
    addDoc,
    deleteDoc,
    doc,
    getDocs,
    query,
    serverTimestamp,
    updateDoc,
    where,
    writeBatch,
} from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';
import { sanitizeDigits } from '../../utils/helpers.js';

const BATCH_SIZE = 400;

function normalizeApplicantNik(value) {
    return sanitizeDigits(value || '');
}

async function getExistingApplicantMapByNik(nikList = []) {
    const uniqueNiks = Array.from(new Set(nikList.filter(Boolean)));
    const nikMap = new Map();
    if (uniqueNiks.length === 0) return nikMap;
    for (let i = 0; i < uniqueNiks.length; i += 10) {
        const chunk = uniqueNiks.slice(i, i + 10);
        const nikQuery = query(hrdApplicantsCol, where('nik', 'in', chunk));
        const snapshot = await getDocs(nikQuery);
        snapshot.forEach((docSnap) => {
            const docNik = normalizeApplicantNik(docSnap.data()?.nik);
            if (docNik && !nikMap.has(docNik)) {
                nikMap.set(docNik, docSnap.id);
            }
        });
    }
    return nikMap;
}

function buildApplicantQuery(filters = {}) {
    const constraints = [];
    Object.entries(filters || {}).forEach(([field, value]) => {
        if (value === undefined || value === null || value === '' || value === 'all') return;
        const normalized =
            typeof value === 'string'
                ? value.trim()
                : value;
        if (normalized === '' || normalized === 'all') return;
        constraints.push(where(field, '==', normalized));
    });
    return constraints.length > 0 ? query(hrdApplicantsCol, ...constraints) : hrdApplicantsCol;
}

function prepareApplicantPayload(data = {}, includeCreatedAt = false) {
    const payload = {};
    Object.entries(data || {}).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        const normalizedKey = typeof key === 'string' ? key.trim() : key;
        if (!normalizedKey) return;
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed === '') return;
            payload[normalizedKey] = trimmed;
            return;
        }
        payload[normalizedKey] = value;
    });
    payload.updatedAt = serverTimestamp();
    if (includeCreatedAt) {
        payload.createdAt = serverTimestamp();
    }
    return payload;
}

export async function getApplicants(filters = {}) {
    const queryTarget = buildApplicantQuery(filters);
    const snapshot = await getDocs(queryTarget);
    const items = [];
    snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() });
    });
    return items;
}

export async function addApplicant(data = {}) {
    const payload = prepareApplicantPayload(data, true);
    const docRef = await addDoc(hrdApplicantsCol, payload);
    return docRef.id;
}

export async function updateApplicant(docId, data = {}) {
    if (!docId) throw new Error('ID pelamar tidak valid.');
    await updateDoc(doc(hrdApplicantsCol, docId), prepareApplicantPayload(data, false));
}

export async function deleteApplicant(docId) {
    if (!docId) return;
    await deleteDoc(doc(hrdApplicantsCol, docId));
}

export async function batchImportApplicants(rows = []) {
    if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error('Tidak ada data yang dapat diimpor.');
    }
    const sanitizedRows = rows
        .filter(Boolean)
        .map((entry) => {
            const nik = normalizeApplicantNik(entry.nik);
            return nik ? { ...entry, nik } : { ...entry };
        });
    if (sanitizedRows.length === 0) {
        throw new Error('Format data pelamar tidak valid.');
    }
    const keyedEntries = new Map();
    const newEntries = [];
    sanitizedRows.forEach(entry => {
        if (entry.nik) {
            keyedEntries.set(entry.nik, entry);
        } else {
            newEntries.push(entry);
        }
    });

    const existingMap = await getExistingApplicantMapByNik(Array.from(keyedEntries.keys()));
    const inserts = [];
    const updates = [];

    keyedEntries.forEach((entry, nik) => {
        if (existingMap.has(nik)) {
            updates.push({
                id: existingMap.get(nik),
                payload: prepareApplicantPayload(entry, false)
            });
        } else {
            inserts.push(prepareApplicantPayload(entry, true));
        }
    });

    newEntries.forEach(entry => {
        inserts.push(prepareApplicantPayload(entry, true));
    });

    for (let i = 0; i < inserts.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = inserts.slice(i, i + BATCH_SIZE);
        chunk.forEach((payload) => {
            const docRef = doc(hrdApplicantsCol);
            batch.set(docRef, payload);
        });
        await batch.commit();
    }

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = updates.slice(i, i + BATCH_SIZE);
        chunk.forEach(({ id, payload }) => {
            batch.update(doc(hrdApplicantsCol, id), payload);
        });
        await batch.commit();
    }
}
