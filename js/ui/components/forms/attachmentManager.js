import { emit } from "../../../state/eventBus.js";
import { toast } from "../toast.js";
import { generateUUID } from "../../../utils/helpers.js";
import { _uploadFileToCloudinary } from '../../../services/fileService.js';

// Helper function to create Lucide SVG Icon
function createIcon(iconName, size = 20, classes = '') { // Size default 20 for overlays
    const icons = {
        visibility: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye ${classes}"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
        swap_horiz: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-replace ${classes}"><path d="M14 4h6v6"/><path d="M10 20H4v-6"/><path d="m20 4-6 6"/><path d="m10 14-6 6"/><path d="M4 14l6-6"/><path d="M20 10l-6 6"/></svg>`, // Using Replace icon
        delete: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2 ${classes}"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`,
        add_photo_alternate: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image-plus ${classes}"><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"/><line x1="16" x2="22" y1="5" y2="5"/><line x1="19" x2="19" y1="2" y2="8"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`, // Using ImagePlus icon
    };
    return icons[iconName] || '';
}

export function _createAttachmentManagerHTML(itemData = {}, options = {}) {
    const { singleOptional = false, inputName = 'attachment', containerId = 'attachment-manager-container' } = options;
    const attachments = [];

    if (!singleOptional) {
        if (Array.isArray(itemData.attachments)) {
            itemData.attachments.forEach(a => {
                if (a && a.url) attachments.push({ ...a, isPending: false });
            });
        } else if (itemData.attachmentUrl) {
            attachments.push({ url: itemData.attachmentUrl, name: 'Lampiran', isPending: false });
        }
    } else if (itemData[inputName + '_url']) {
         attachments.push({ url: itemData[inputName + '_url'], name: 'Lampiran', isPending: false });
    }

    const totalExisting = attachments.length;
    const showPlaceholder = !singleOptional || (singleOptional && totalExisting === 0);
    const isSingleItemLayout = singleOptional && totalExisting === 1;
    const containerClasses = isSingleItemLayout ? 'single-item-layout' : '';

    const attachmentItems = attachments.map((att, index) => `
        <div class="attachment-manager-item" data-id="${itemData.id || ''}" data-attachment-index="${index}" data-url="${att.url}">
            <div class="attachment-manager-overlay">
                <button type="button" class="btn-icon" data-action="view-attachment" data-src="${att.url}" title="Lihat">${createIcon('visibility')}</button>
                <button type="button" class="btn-icon" data-action="replace-attachment" data-expense-id="${itemData.id || ''}" data-old-url="${att.url}" data-target="${inputName}" title="Ganti">${createIcon('swap_horiz')}</button>
                <button type="button" class="btn-icon btn-icon-danger" data-action="${singleOptional ? 'remove-payment-attachment' : 'delete-attachment'}" data-expense-id="${itemData.id || ''}" data-url="${att.url}" title="Hapus">${createIcon('delete')}</button>
            </div>
            <img src="${att.url}" class="attachment-preview-thumb" alt="Lampiran" loading="lazy" decoding="async" onerror="this.src='https://placehold.co/400x300/e2e8f0/64748b?text=Gagal+Muat'; this.onerror=null;">
            <strong>${att.name || 'Lampiran'}</strong>
        </div>
    `).join('');

    const placeholderHTML = showPlaceholder ? `
        <div class="attachment-manager-item placeholder" data-action="${singleOptional ? 'trigger-single-upload' : 'upload-attachment'}" data-target="${inputName}" ${itemData.id ? `data-id="${itemData.id}"` : ''}>
            ${createIcon('add_photo_alternate', 32)}
            <span>Tambah Lampiran</span>
            <div class="upload-progress" style="display: none; width: 80%; margin-top: 0.5rem;">
                 <div class="upload-progress-bar-container">
                     <div class="upload-progress-bar" style="width: 0%;"></div>
                 </div>
                 <span class="upload-progress-text" style="font-size: 0.7rem; color: var(--text-dim); margin-top: 0.2rem;">0%</span>
            </div>
             <span class="upload-error-text" style="font-size: 0.7rem; color: var(--danger); margin-top: 0.2rem; display:none;"></span>
        </div>
    ` : '';

    const syncedUrlsInputHTML = !singleOptional ? `
        <input type="hidden" name="syncedAttachmentUrls" value='${JSON.stringify(itemData.attachments || (itemData.attachmentUrl ? [{ url: itemData.attachmentUrl, name: 'Lampiran' }] : []))}'>
    ` : '';

    const newUrlInputHTML = singleOptional ? `
        <input type="hidden" name="${inputName}_url" id="${inputName}_url" value="${attachments[0]?.url || ''}">
    ` : '';

    const fileInputHTML = `
        <input type="file" name="${inputName}" accept="image/*,application/pdf" ${singleOptional ? '' : 'multiple'} class="hidden-file-input" style="display: none;">
    `;


    return `
        ${!singleOptional ? `<h5 class="invoice-section-title full-width">Lampiran ${itemData.id ? '' : '(Opsional)'}</h5>` : ''}
        <div class="attachment-manager-container ${containerClasses}" id="${containerId}">
            ${attachmentItems}
            ${placeholderHTML}
        </div>
        ${fileInputHTML}
        ${syncedUrlsInputHTML}
        ${newUrlInputHTML}
    `;
}

export async function handleAttachmentUpload(file, form, inputName, isSingle = false) {
    const container = form.querySelector(`#${isSingle ? 'new-payment-attachment-container' : 'new-attachment-container'}`);
    const placeholder = container?.querySelector('.placeholder');
    const syncedUrlsInput = form.querySelector('input[name="syncedAttachmentUrls"]');
    const singleUrlInput = isSingle ? form.querySelector(`input[name="${inputName}_url"]`) : null;
    const saveButton = form.querySelector('button[type="submit"]');

    if (saveButton) saveButton.disabled = true;

    if (!container || (!placeholder && !isSingle)) {
        console.error("Container atau placeholder lampiran tidak ditemukan.");
        toast('error', 'Gagal memulai upload: Elemen UI tidak ditemukan.');
        return;
    }

    const tempId = `uploading-${generateUUID()}`;
    const previewEl = document.createElement('div');
    previewEl.className = 'attachment-manager-item is-pending-local-upload';
    previewEl.id = tempId;
    previewEl.innerHTML = `
        <div class="attachment-manager-overlay is-pending" style="opacity: 1; pointer-events: none; flex-direction: column; gap: 0.5rem;">
            <div class="spinner" style="width: 24px; height: 24px; border-width: 3px;"></div>
            <span class="upload-progress-text" style="font-size: 0.8rem; color: #fff;">Mengunggah (0%)...</span>
            <span class="upload-error-text" style="font-size: 0.7rem; color: #f87171; display:none;"></span>
        </div>
        <img src="${URL.createObjectURL(file)}" class="attachment-preview-thumb" alt="Pratinjau" loading="lazy" decoding="async">
        <strong>${file.name}</strong>`;

    if (isSingle) {
        container.innerHTML = '';
        container.appendChild(previewEl);
    } else if (placeholder) {
        container.insertBefore(previewEl, placeholder);
    } else {
        container.appendChild(previewEl);
    }

    const progressTextEl = previewEl.querySelector('.upload-progress-text');
    const errorTextEl = previewEl.querySelector('.upload-error-text');
    const spinnerEl = previewEl.querySelector('.spinner');

    const onProgress = (percent) => {
        if (progressTextEl) progressTextEl.textContent = `Mengunggah (${percent}%)...`;
    };

    const onError = (error) => {
        if (progressTextEl) progressTextEl.style.display = 'none';
        if (spinnerEl) spinnerEl.style.display = 'none';
        if (errorTextEl) {
            let errorMessage = error.message || 'Error tidak diketahui';
            if (errorMessage.toLowerCase().includes('timeout')) {
                errorMessage = 'Upload timeout. Periksa koneksi atau coba lagi.';
            } else if (errorMessage.toLowerCase().includes('network error') || errorMessage.toLowerCase().includes('failed to fetch')) {
                errorMessage = 'Gagal koneksi. Periksa jaringan Anda.';
            }
            errorTextEl.textContent = `Gagal: ${errorMessage}`;
            errorTextEl.style.display = 'block';
        }
        previewEl.classList.add('upload-failed');
        toast('error', `Gagal mengunggah ${file.name}: ${error.message}`);
        const overlay = previewEl.querySelector('.attachment-manager-overlay');
        if (overlay) {
            overlay.innerHTML = `
                <span class="upload-error-text" style="font-size: 0.7rem; color: #f87171;">Upload Gagal</span>
                <button type="button" class="btn-icon btn-icon-danger" data-action="delete-temp-attachment" title="Hapus">${createIcon('delete')}</button>
            `;
            overlay.style.pointerEvents = 'auto';
        }
        if (saveButton) saveButton.disabled = false;
    };

    const url = await _uploadFileToCloudinary(file, { onProgress, onError });

    if (url) {
        previewEl.classList.remove('is-pending-local-upload');
        previewEl.dataset.url = url;

        if (isSingle && singleUrlInput) {
            singleUrlInput.value = url;
        } else if (syncedUrlsInput) {
            const currentUrls = syncedUrlsInput.value ? JSON.parse(syncedUrlsInput.value) : [];
            currentUrls.push({ url, name: file.name, size: file.size || 0 });
            syncedUrlsInput.value = JSON.stringify(currentUrls);
        }

        previewEl.innerHTML = `
             <div class="attachment-manager-overlay">
                 <button type="button" class="btn-icon" data-action="view-attachment" data-src="${url}" title="Lihat">${createIcon('visibility')}</button>
                 <button type="button" class="btn-icon" data-action="replace-attachment" data-expense-id="${form.dataset.id || ''}" data-old-url="${url}" data-target="${inputName}" title="Ganti">${createIcon('swap_horiz')}</button>
                 <button type="button" class="btn-icon btn-icon-danger" data-action="${isSingle ? 'remove-payment-attachment' : 'delete-temp-attachment'}" title="Hapus">${createIcon('delete')}</button>
             </div>
             <img src="${url}" class="attachment-preview-thumb" alt="Lampiran" loading="lazy" decoding="async">
             <strong>${file.name}</strong>`;
        toast('success', `${file.name} berhasil diunggah.`);
         import('../modal.js').then(({ markFormDirty }) => markFormDirty(true));
        if (saveButton) saveButton.disabled = false;
    } else {
        const fileInput = form.querySelector(`input[name="${inputName}"]`);
        if (fileInput) fileInput.value = '';
        if (saveButton) saveButton.disabled = false;
    }
}


export function _attachSingleFileUploadListener(context, inputName, containerSelector) {
    const fileInput = context.querySelector(`input[name="${inputName}"]`);
    const attachmentContainer = context.querySelector(containerSelector);
    const urlInput = context.querySelector(`input[name="${inputName}_url"]`);

    if (!fileInput || !attachmentContainer || !urlInput) {
        console.warn("Element attachment tidak lengkap untuk listener single upload.", { fileInput, attachmentContainer, urlInput });
        return;
    }

    attachmentContainer.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-action="trigger-single-upload"]');
        if (trigger && trigger.dataset.target === inputName) {
            if (window.matchMedia('(max-width: 599px)').matches) {
                e.preventDefault();
                emit('ui.modal.create', 'uploadSource', {
                    onSelect: (source) => {
                        fileInput.removeAttribute('capture');
                        if (source === 'camera') {
                            fileInput.setAttribute('capture', 'environment');
                        }
                        setTimeout(() => fileInput.click(), 50);
                    }
                });
            } else {
                fileInput.click();
            }
        }

        const removeBtn = e.target.closest('[data-action="remove-payment-attachment"]');
        if (removeBtn) {
            fileInput.value = '';
            urlInput.value = '';
            attachmentContainer.innerHTML = `
                <div class="attachment-manager-item placeholder" data-action="trigger-single-upload" data-target="${inputName}">
                    ${createIcon('add_photo_alternate', 32)}
                    <span>Tambah Lampiran</span>
                     <div class="upload-progress" style="display: none; width: 80%; margin-top: 0.5rem;">
                         <div class="upload-progress-bar-container"><div class="upload-progress-bar" style="width: 0%;"></div></div>
                         <span class="upload-progress-text" style="font-size: 0.7rem; color: var(--text-dim); margin-top: 0.2rem;">0%</span>
                    </div>
                     <span class="upload-error-text" style="font-size: 0.7rem; color: var(--danger); margin-top: 0.2rem; display:none;"></span>
                </div>`;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            toast('info', 'Lampiran dibatalkan.');
             import('../modal.js').then(({ markFormDirty }) => markFormDirty(true));
        }

        const deleteExistingBtn = e.target.closest('[data-action="delete-attachment"]');
         if (deleteExistingBtn) {
             const expenseId = deleteExistingBtn.dataset.expenseId;
             const urlToDelete = deleteExistingBtn.dataset.url;
             if (expenseId && urlToDelete) {
                 emit('data.deleteAttachment', { expenseId, url: urlToDelete });
                 const itemPreview = deleteExistingBtn.closest('.attachment-manager-item');
                 if (itemPreview) itemPreview.remove();
             }
         }

    });

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        urlInput.value = '';

        if (!file) {
            attachmentContainer.innerHTML = `
                <div class="attachment-manager-item placeholder" data-action="trigger-single-upload" data-target="${inputName}">
                    ${createIcon('add_photo_alternate', 32)}
                    <span>Tambah Lampiran</span>
                    <div class="upload-progress" style="display: none; width: 80%; margin-top: 0.5rem;">
                         <div class="upload-progress-bar-container"><div class="upload-progress-bar" style="width: 0%;"></div></div>
                         <span class="upload-progress-text" style="font-size: 0.7rem; color: var(--text-dim); margin-top: 0.2rem;">0%</span>
                    </div>
                     <span class="upload-error-text" style="font-size: 0.7rem; color: var(--danger); margin-top: 0.2rem; display:none;"></span>
                </div>`;
            return;
        }

        await handleAttachmentUpload(file, context.closest('form') || context, inputName, true);
    });
}
