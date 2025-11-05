import { storage } from "../config/firebase.js";
import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-storage.js";
import { localDB } from "./localDbService.js";
import { toast } from "../ui/components/toast.js";
import { isViewer } from "../utils/helpers.js";
import { emit } from "../state/eventBus.js";

async function _uploadFileToFirebaseStorage(file, folder = 'attachments') {
      if (!file) return null;
      if (isViewer()) {
          toast('error', 'Viewer tidak dapat mengunggah file.');
          return null;
      }
      toast('syncing', `Mengunggah ${file.name}...`);
      try {
          const timestamp = Date.now();
          const uniqueFileName = `${timestamp}-${file.name}`;
          const storageRef = ref(storage, `${folder}/${uniqueFileName}`);
          const uploadTask = await uploadBytesResumable(storageRef, file);
          const downloadURL = await getDownloadURL(uploadTask.ref);
          toast('success', `${file.name} berhasil diupload!`);
          return downloadURL;
      } catch (error) {
          console.error("Upload error:", error);
          toast('error', 'Gagal mengunggah file.');
          return null;
      }
  }

  async function _uploadFileToCloudinary(file, options = {}) {
    const { silent = false, onProgress = () => {}, onError = () => {} } = options;
    const CLOUDINARY_CLOUD_NAME = "dcjp0fxvb";
    const CLOUDINARY_UPLOAD_PRESET = "BanPlex-UploadDev";
    const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

    let loadingToast;

    console.log(`[Cloudinary] Starting upload for: ${file.name}`);
    try {
        const compressedFile = await _compressImage(file);
        const formData = new FormData();
        formData.append('file', compressedFile);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

        const uploadPromise = new Promise((resolve, reject) => {
             const xhr = new XMLHttpRequest();
             xhr.open('POST', url);

             xhr.upload.addEventListener('progress', (e) => {
                 if (e.lengthComputable) {
                     const percent = Math.round((e.loaded / e.total) * 100);
                     onProgress(percent);
                 }
             });

             xhr.onload = () => {
                 if (xhr.status >= 200 && xhr.status < 300) {
                     try {
                        resolve(JSON.parse(xhr.responseText));
                     } catch (parseError) {
                        console.error("[Cloudinary] Failed to parse response:", xhr.responseText);
                        reject(new Error('Format respons server tidak valid.'));
                     }
                 } else {
                     console.error(`[Cloudinary] Upload HTTP error ${xhr.status}:`, xhr.responseText);
                     reject(new Error(`Server error (${xhr.status}). Coba lagi nanti.`));
                 }
             };

             xhr.onerror = () => {
                 console.error('[Cloudinary] XHR onerror triggered.');
                 reject(new Error('Gagal koneksi ke server upload. Periksa jaringan Anda.'));
             };
             xhr.ontimeout = () => {
                 console.error('[Cloudinary] XHR ontimeout triggered.');
                 // --- PERBAIKAN ERROR 2 START ---
                 reject(new Error('Koneksi ke server upload timeout. Coba lagi atau periksa jaringan.'));
                 // --- PERBAIKAN ERROR 2 END ---
             };
             // --- PERBAIKAN ERROR 2: Tambah timeout ---
             xhr.timeout = 120000; // Tingkatkan ke 120 detik (2 menit)
             // --- PERBAIKAN ERROR 2 END ---

             xhr.send(formData);
        });

        const data = await uploadPromise;

        console.log(`[Cloudinary] Upload success for: ${file.name}, URL: ${data.secure_url}`);
        return data.secure_url;

    } catch (error) {
        onError(error);
        console.error(`[Cloudinary] Upload error for ${file.name}:`, error);
        return null;
    }
}

async function _compressImage(file, quality = 0.85, maxWidth = 1024) {
    if (!file || !file.type || !file.type.startsWith('image/')) {
        return file;
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let {
                    width,
                    height
                } = img;
                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (blob) {
                        if (blob.size > file.size) {
                            console.log(`[Compress] Compressed size (${blob.size}) > original size (${file.size}). Using original.`);
                            resolve(file);
                        } else {
                            resolve(new File([blob], file.name, {
                                type: file.type,
                                lastModified: file.lastModified
                            }));
                        }
                    } else {
                        console.error('[Compress] Failed to create blob.');
                        reject(new Error('Gagal membuat blob gambar.'));
                    }
                }, file.type, quality);
            };
            img.onerror = (err) => {
                 console.error('[Compress] Image load error:', err);
                 reject(new Error('Gagal memuat gambar untuk kompresi.'));
            };
        };
        reader.onerror = (err) => {
             console.error('[Compress] FileReader error:', err);
             reject(new Error('Gagal membaca file gambar.'));
        };
    });
}


async function downloadAttachment(url, filename) {
    if (!url) return;
    toast('syncing', `Mengunduh ${filename}...`);
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Gagal mengunduh: Server merespon dengan status ${response.status}`);

        const blob = await response.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename || 'lampiran.jpg';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        toast('success', `${filename} berhasil diunduh.`);
    } catch (error) {
        console.error("Gagal mengunduh lampiran:", error);
        toast('error', `Gagal mengunduh file: ${error.message}`);
    }
}

async function _enforceLocalFileStorageLimit(maxBytes = 50 * 1024 * 1024, maxFiles = 300) {
      try {
          const files = await localDB.files.toArray();
          let totalBytes = 0;
          files.forEach(f => {
              totalBytes += (f.size || (f.file && f.file.size) || 0);
          });
          if (files.length <= maxFiles && totalBytes <= maxBytes) return;
          const sorted = files.slice().sort((a, b) => new Date(a.addedAt || 0) - new Date(b.addedAt || 0));
          while ((sorted.length > maxFiles) || (totalBytes > maxBytes)) {
              const oldest = sorted.shift();
              totalBytes -= (oldest.size || (oldest.file && oldest.file.size) || 0);
              await localDB.files.delete(oldest.id);
          }
      } catch (e) {
          console.warn('Gagal menegakkan batas storage lokal:', e);
      }
  }

export { _uploadFileToFirebaseStorage, _uploadFileToCloudinary, _compressImage, downloadAttachment, _enforceLocalFileStorageLimit };
