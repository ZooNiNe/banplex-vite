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

const BATCH_SIZE = 400;

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
    const normalizedRows = rows.filter(Boolean).map((entry) => prepareApplicantPayload(entry, true));
    if (normalizedRows.length === 0) {
        throw new Error('Format data pelamar tidak valid.');
    }
    for (let i = 0; i < normalizedRows.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = normalizedRows.slice(i, i + BATCH_SIZE);
        chunk.forEach((payload) => {
            const docRef = doc(hrdApplicantsCol);
            batch.set(docRef, payload);
        });
        await batch.commit();
    }
}
