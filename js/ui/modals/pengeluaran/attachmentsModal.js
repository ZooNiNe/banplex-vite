import { createModal, closeModalImmediate, startGlobalLoading } from '../../components/modal.js';
import { appState } from '../../../state/appState.js';
import { getEmptyStateHTML } from '../../components/emptyState.js';
import { toast } from '../../components/toast.js';
import { localDB } from '../../../services/localDbService.js';
import { emit } from '../../../state/eventBus.js';
import { db, expensesCol } from '../../../config/firebase.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// Helper function to create Lucide SVG Icon
function createIcon(iconName, size = 20, classes = '') {
    const icons = {
        visibility: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye ${classes}"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
        download: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download ${classes}"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
        image_not_supported: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image-off ${classes}"><path d="M8.5 8.5c.31-.62.9-1.11 1.62-1.38"/><path d="M11.03 11.03c-.27-.11-.56-.18-.86-.2a2 2 0 0 0-1.92 1.54"/><path d="M21 15l-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/><path d="M15.5 6.5a2 2 0 0 0-2.93-1.38"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`,
        attachment_off: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-paperclip-off ${classes}"><path d="m11.19 11.19-3.2 3.2a2 2 0 0 0 0 2.83l1.42 1.41a2 2 0 0 0 2.83 0l3.2-3.2"/><path d="m14 8 .88.88a4 4 0 0 1-5.66 5.66l-2.17-2.17"/><path d="m7.81 12.19 2.17 2.17a4 4 0 0 0 5.66-5.66L14.53 7.58"/><path d="m15.88 5.47 1.42 1.41a6 6 0 0 1 0 8.49l-1.6 1.6"/><path d="m9.47 17.88-1.42-1.41a6 6 0 0 1 0-8.49l3.2-3.2"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`, // Assuming 'attachment_off' means no attachment
        error: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle ${classes}"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`, // Using AlertTriangle
    };
    return icons[iconName] || '';
}


function getAttachmentManagerHTML(attachments = [], expenseId) {
    // DEBUGGING: Log attachments received by the HTML generator
    console.warn('[getAttachmentManagerHTML] Attachments received:', attachments, 'for expenseId:', expenseId);
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

    const attachmentItems = attachments.map((att, index) => {
        // DEBUGGING: Log each attachment URL being processed
        console.warn(`[getAttachmentManagerHTML] Processing attachment ${index}:`, att);
        if (!att || !att.url) {
            console.error(`[getAttachmentManagerHTML] Invalid attachment data at index ${index} for expense ${expenseId}:`, att);
            return `<!-- Invalid attachment data at index ${index} -->`;
        }
        return `
        <div class="attachment-manager-item" data-id="${expenseId}" data-attachment-index="${index}" data-url="${att.url}">
            <img src="${att.url}" class="attachment-preview-thumb" alt="Lampiran" loading="lazy" decoding="async" onerror="this.src='https://placehold.co/400x300/e2e8f0/64748b?text=Gagal+Muat'; this.onerror=null; console.error('Failed to load image:', '${att.url}');">
            <strong>${att.name || 'Lampiran'}</strong>
            <div class="attachment-manager-overlay">
                <button type="button" class="btn-icon" data-action="view-attachment" data-src="${att.url}" title="Lihat">${createIcon('visibility')}</button>
                <button type="button" class="btn-icon" data-action="download-attachment-confirm" data-url="${att.url}" data-filename="${att.name || 'lampiran'}" title="Unduh">${createIcon('download')}</button>
            </div>
        </div>
    `}).join('');

    const emptyStateHTML = getEmptyStateHTML({ icon: 'attachment_off', title: 'Tidak Ada Lampiran', desc: 'Tidak ada lampiran untuk item ini.' });

    // DEBUGGING: Log final decision on showing items or empty state
    console.warn('[getAttachmentManagerHTML] Has attachments:', hasAttachments);

    return `
        <div class="attachment-manager-container">
            ${hasAttachments ? attachmentItems : ''}
        </div>
        ${!hasAttachments ? emptyStateHTML : ''}
    `;
}


export async function handleOpenAttachmentsListModal(dataset) {
    // DEBUGGING: Log the dataset received when opening the modal
    console.warn('[handleOpenAttachmentsListModal] Received dataset:', dataset);
    // PERBAIKAN: Prioritaskan expenseId jika ada, baru fallback ke id/itemId
    const expenseId = dataset.expenseId || dataset.id || dataset.itemId;
    if (!expenseId) {
        console.error('[handleOpenAttachmentsListModal] Error: expenseId is missing or undefined after checking expenseId, id, and itemId.', dataset);
        toast('error', 'ID Pengeluaran tidak ditemukan untuk menampilkan lampiran.');
        return;
    }
    // DEBUGGING: Log the final expenseId being used
    console.warn('[handleOpenAttachmentsListModal] Using expenseId:', expenseId);


    let expenseData = null;
    let attachments = [];
    let source = 'unknown';

    const loader = startGlobalLoading('Memuat lampiran...');

    try {
        // DEBUGGING: Check online status and Firestore attempt
        console.warn('[handleOpenAttachmentsListModal] Online Status:', navigator.onLine);
        if (navigator.onLine) {
            try {
                console.warn('[handleOpenAttachmentsListModal] Attempting to fetch from Firestore for ID:', expenseId);
                const docRef = doc(expensesCol, expenseId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    expenseData = docSnap.data();
                    source = 'firestore';
                     console.warn('[handleOpenAttachmentsListModal] Data found in Firestore:', expenseData);
                } else {
                     console.warn('[handleOpenAttachmentsListModal] Document not found in Firestore for ID:', expenseId);
                }
            } catch (firestoreError) {
                console.warn("[Attachments] Gagal ambil dari Firestore, coba lokal:", firestoreError);
            }
        } else {
             console.warn('[handleOpenAttachmentsListModal] Offline, skipping Firestore fetch.');
        }

        if (!expenseData) {
            console.warn('[handleOpenAttachmentsListModal] Trying to find in appState for ID:', expenseId);
            expenseData = appState.expenses.find(e => e.id === expenseId);
            if(expenseData) {
                source = 'appState';
                 console.warn('[handleOpenAttachmentsListModal] Data found in appState:', expenseData);
            } else {
                 console.warn('[handleOpenAttachmentsListModal] Data not found in appState for ID:', expenseId);
            }
        }

        if (!expenseData) {
             console.warn('[handleOpenAttachmentsListModal] Trying to find in localDB for ID:', expenseId);
            expenseData = await localDB.expenses.get(expenseId);
             if(expenseData) {
                 source = 'localDB';
                  console.warn('[handleOpenAttachmentsListModal] Data found in localDB:', expenseData);
             } else {
                  console.warn('[handleOpenAttachmentsListModal] Data not found in localDB for ID:', expenseId);
             }
        }

        if (expenseData) {
             console.warn('[handleOpenAttachmentsListModal] Processing attachments from source:', source, expenseData);
            if (Array.isArray(expenseData.attachments) && expenseData.attachments.length > 0) {
                attachments.push(...expenseData.attachments);
                 console.warn('[handleOpenAttachmentsListModal] Found attachments array:', attachments);
            } else if (expenseData.attachmentUrl) {
                // Handle legacy single attachment URL
                attachments.push({ url: expenseData.attachmentUrl, name: 'Lampiran' });
                 console.warn('[handleOpenAttachmentsListModal] Found legacy attachmentUrl:', attachments);
            } else {
                 console.warn('[handleOpenAttachmentsListModal] No attachments found in expenseData.');
            }
        } else {
            const errorMsg = `Data pengeluaran dengan ID ${expenseId} tidak ditemukan baik di server maupun lokal.`;
             console.error('[handleOpenAttachmentsListModal] Critical Error:', errorMsg);
            toast('error', errorMsg);
            const errorContent = getEmptyStateHTML({ icon: 'error', title: 'Data Tidak Ditemukan', desc: errorMsg });
            createModal('dataDetail', { title: 'Daftar Lampiran', content: errorContent });
            return;
        }

         // DEBUGGING: Log final attachments before rendering HTML
         console.warn('[handleOpenAttachmentsListModal] Final attachments to render:', attachments);
        const content = getAttachmentManagerHTML(attachments, expenseId);
        const modalTitle = `Daftar Lampiran (${source})`;
        const isMobile = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
        const modalOptions = { title: modalTitle, content };

        if (isMobile) {
            createModal('dataBottomSheet', { ...modalOptions, layoutClass: 'attachments-bottom-sheet', allowContentOverflow: true });
        } else {
            createModal('dataDetail', modalOptions);
        }

    } catch (error) {
        console.error("[handleOpenAttachmentsListModal] General Error:", error);
        toast('error', 'Gagal memuat lampiran.');
        const errorContent = getEmptyStateHTML({ icon: 'error', title: 'Gagal Memuat', desc: 'Terjadi kesalahan saat mencoba memuat data lampiran.' });
        createModal('dataDetail', { title: 'Daftar Lampiran', content: errorContent });
    } finally {
        loader.close();
    }
}
