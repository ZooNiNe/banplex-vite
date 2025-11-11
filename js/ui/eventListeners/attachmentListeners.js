// js/ui/eventListeners/attachmentListeners.js

import { emit, on, off } from "../../state/eventBus.js";
import { toast } from "../components/toast.js";
import { closeModalImmediate } from "../components/modal.js";

let isHandlingAttachmentAction = false;

const resetAttachmentFlag = () => {
    setTimeout(() => {
        isHandlingAttachmentAction = false;
    }, 150);
};

export function handleAttachmentAction(context, clickedElement, event) {
    if (isHandlingAttachmentAction) {
        if (event && event.stopImmediatePropagation) {
            event.stopImmediatePropagation();
        }
        return;
    }
    isHandlingAttachmentAction = true;

    const action = context.action;
    const targetInputName = clickedElement?.dataset.target;
    const form = clickedElement?.closest('form, .detail-pane, .modal-bg');

    if (!form || !targetInputName) {
        console.error("[handleAttachmentAction] Konteks form atau target input tidak valid.");
        resetAttachmentFlag();
        return;
    }
    const fileInput = form.querySelector(`input[type="file"][name="${targetInputName}"]`);
    if (!fileInput) {
        console.error(`[handleAttachmentAction] Input file '${targetInputName}' tidak ditemukan.`);
        resetAttachmentFlag();
        return;
    }

    const isSingleUpload = action === 'trigger-single-upload' || action === 'trigger-payment-upload';

    const triggerFilePicker = (source = null) => {
        fileInput.removeAttribute('capture');
        if (source === 'camera') {
            fileInput.setAttribute('capture', 'environment');
        }
        if (isSingleUpload) {
            fileInput.removeAttribute('multiple');
        } else {
            fileInput.setAttribute('multiple', 'multiple');
        }

        setTimeout(() => {
            fileInput.click();
            resetAttachmentFlag();
        }, 100);
    };

    const isMobile = window.matchMedia('(max-width: 599px)').matches;

    const actionsTriggeringPicker = new Set([
        'upload-attachment', 'trigger-single-upload', 'trigger-payment-upload'
    ]);

    if (actionsTriggeringPicker.has(action)) {
        if (isMobile) {
            emit('ui.modal.create', 'uploadSource', {
                isUtility: true, // <-- PERBAIKAN 1: Tambahkan isUtility
                onSelect: (source, selectEvent) => {
                    const uploadSourceModal = document.getElementById('uploadSource-modal');
                    if (uploadSourceModal && uploadSourceModal.classList.contains('show')) {
                        closeModalImmediate(uploadSourceModal);
                        if (selectEvent && selectEvent.stopPropagation) selectEvent.stopPropagation();
                        if (selectEvent && selectEvent.preventDefault) selectEvent.preventDefault();
                    }
                    triggerFilePicker(source);
                }
            });
        } else {
            triggerFilePicker();
        }
    } else {
        console.warn(`[handleAttachmentAction] Menerima aksi tak terduga: ${action}`);
        resetAttachmentFlag();
    }
}


export function initializeAttachmentListeners() {
    
    // --- PERBAIKAN 2: Tambahkan listener untuk mereset flag saat modal source ditutup ---
    on('ui.modal.closed', (modalId) => {
        if (modalId === 'uploadSource-modal') {
            // Panggil resetAttachmentFlag, yang ada di scope file ini
            resetAttachmentFlag();
        }
    });
    // --- AKHIR PERBAIKAN 2 ---

    on('ui.attachments.viewPayment', async (context) => {
        const { url, localId } = context;
        if (url) {
            emit('ui.modal.create', 'imageView', { src: url });
        } else if (localId) {
            try {
                const { localDB } = await import('../../services/localDbService.js');
                const { getEmptyStateHTML } = await import('../components/emptyState.js');
                const fileRecord = await localDB.files.get(localId);
                if (fileRecord && fileRecord.file) {
                    const blobUrl = URL.createObjectURL(fileRecord.file);
                    emit('ui.modal.create', 'imageView', { src: blobUrl });

                    const handler = (modalId) => {
                        if (modalId === 'imageView-modal') {
                            URL.revokeObjectURL(blobUrl);
                            off('ui.modal.closed', handler);
                        }
                    };
                    on('ui.modal.closed', handler);
                } else {
                   emit('ui.modal.create', 'dataDetail', {
                        title: 'Lampiran Tidak Ditemukan',
                        content: getEmptyStateHTML({
                            icon: 'image_not_supported',
                            title: 'Lampiran Lokal Tidak Ditemukan',
                            desc: 'File lampiran mungkin telah dihapus dari cache perangkat.'
                        })
                    });
                }
            } catch (err) {
                toast('error', 'Gagal memuat lampiran lokal.');
            }
        } else {
           const { getEmptyStateHTML } = await import('../components/emptyState.js');
           emit('ui.modal.create', 'dataDetail', {
                title: 'Lampiran Tidak Ditemukan',
                content: getEmptyStateHTML({
                    icon: 'image_not_supported',
                    title: 'Tidak Ada Lampiran',
                    desc: 'Tidak ada file lampiran yang terkait dengan pembayaran ini.'
                })
            });
        }
    });
}