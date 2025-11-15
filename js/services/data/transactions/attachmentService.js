import { emit } from "../../../state/eventBus.js";
import { appState } from "../../../state/appState.js";
import { localDB } from "../../localDbService.js";
import { toast } from "../../../ui/components/toast.js";
import { _logActivity } from "../../logService.js";
import { _uploadFileToCloudinary, _compressImage, _enforceLocalFileStorageLimit } from "../../fileService.js"; // Impor helper kompresi & limit
import { requestSync } from "../../syncService.js";
import { queueOutbox } from "../../outboxService.js";
// *** PERBAIKAN: Impor closeModalImmediate ***
import { closeModalImmediate, startGlobalLoading } from "../../../ui/components/modal.js";
// *** AKHIR PERBAIKAN ***

// Flag untuk mencegah klik ganda pada pemicu file
let isTriggeringReplace = false;

export async function handleReplaceAttachment(expenseId, oldAttachmentUrl) {
    if (!expenseId || !oldAttachmentUrl) return;

    // *** PERBAIKAN: Tambahkan flag guard ***
    if (isTriggeringReplace) {
        console.warn("[handleReplaceAttachment] Sedang memproses penggantian, abaikan klik ganda.");
        return;
    }
    isTriggeringReplace = true;
    // Reset flag setelah delay singkat
    setTimeout(() => { isTriggeringReplace = false; }, 500);
    // *** AKHIR PERBAIKAN ***


    // Fungsi internal untuk memproses file SETELAH dipilih
    const processFile = async (file) => {
        if (!file) return;
        const loader = startGlobalLoading(`Mengunggah lampiran baru...`);
        try {
            // Kompres gambar sebelum upload
            const compressedFile = await _compressImage(file);
            const newUrl = await _uploadFileToCloudinary(compressedFile, { silent: false }); // Gunakan file terkompresi
            if (!newUrl) throw new Error('Gagal mengunggah file baru.');

            const newAttachment = { url: newUrl, name: file.name, size: compressedFile.size || 0 }; // Gunakan ukuran terkompresi

            await localDB.transaction('rw', localDB.expenses, localDB.outbox, async () => { // Tambahkan outbox ke transaksi
                const expense = await localDB.expenses.get(expenseId);
                if (!expense) throw new Error('Data pengeluaran tidak ditemukan di lokal.');

                // Gunakan array attachments jika ada, fallback ke array kosong
                const attachments = Array.isArray(expense.attachments) ? [...expense.attachments] : [];
                const attachmentIndex = attachments.findIndex(att => att && att.url === oldAttachmentUrl);

                if (attachmentIndex > -1) {
                    attachments[attachmentIndex] = newAttachment; // Ganti yang lama
                } else {
                    attachments.push(newAttachment); // Tambah jika tidak ditemukan (fallback)
                }

                const updateData = {
                    attachments: attachments,
                    syncState: 'pending_update',
                    updatedAt: new Date(),
                    attachmentUrl: null // Hapus field legacy jika ada
                };

                await localDB.expenses.update(expenseId, updateData);
                // Antrikan ke outbox untuk sinkronisasi
                await queueOutbox({
                    table: 'expenses',
                    docId: expenseId,
                    op: 'upsert',
                    payload: { id: expenseId, attachments: attachments, attachmentUrl: null }, // Kirim data yang relevan
                    priority: 6
                });
            });

            toast('success', 'Lampiran berhasil diganti.');
            _logActivity('Mengganti Lampiran', { expenseId, newUrl });

            // Emit event untuk me-refresh modal edit jika terbuka
            emit('ui.modal.openEditExpense', { id: expenseId });
            requestSync({ silent: true }); // Minta sinkronisasi

        } catch (error) {
            toast('error', `Gagal mengganti lampiran: ${error.message}`);
            console.error("[handleReplaceAttachment] processFile error:", error);
        } finally {
            loader.close();
        }
    };

    // --- Logika Pemicu Pemilihan File (Dipindahkan ke sini) ---
    const isMobile = window.matchMedia('(max-width: 599px)').matches;
    // PERBAIKAN: Cari form di #detail-pane (desktop) atau .modal-bg (mobile)
    const form = document.querySelector(`#detail-pane #edit-item-form[data-id="${expenseId}"], .modal-bg #edit-item-form[data-id="${expenseId}"], #pengeluaran-form`);
    const fileInput = form ? form.querySelector(`input[type="file"][data-target*="attachment"]`) : null; // Cari input file di form

    if (!fileInput) {
        toast('error', 'Input file tidak ditemukan untuk proses penggantian.');
        isTriggeringReplace = false; // Reset flag jika error
        return;
    }

    // Fungsi untuk memicu klik pada input file
    const triggerFileInputClick = (source = null) => {
        fileInput.removeAttribute('capture');
        if (source === 'camera') {
            fileInput.setAttribute('capture', 'environment');
        }
        // Pastikan hanya single file
        fileInput.removeAttribute('multiple');
        fileInput.accept = 'image/*'; // Hanya gambar untuk replace

        // Hapus listener 'change' sebelumnya untuk menghindari penumpukan
        const oldOnChange = fileInput.onchange;
        fileInput.onchange = null; // Hapus listener lama

        // Tambahkan listener 'change' baru yang memanggil processFile
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                processFile(file);
            }
            // Kembalikan listener lama jika ada (opsional, tergantung kebutuhan)
            // fileInput.onchange = oldOnChange;
            isTriggeringReplace = false; // Reset flag setelah file dipilih/dibatalkan
        };

        // Picu klik
        setTimeout(() => fileInput.click(), 100);
    };

    // Tampilkan modal pilihan sumber di mobile, atau langsung picu file picker di desktop
    if (isMobile) {
        emit('ui.modal.create', 'uploadSource', {
            isUtility: true, // PERBAIKAN: Tandai sebagai modal utilitas
            onSelect: (source, event) => {
                const uploadSourceModal = document.getElementById('uploadSource-modal');
                if (uploadSourceModal && uploadSourceModal.classList.contains('show')) {
                     closeModalImmediate(uploadSourceModal);
                     if (event && event.stopPropagation) event.stopPropagation();
                     if (event && event.preventDefault) event.preventDefault();
                }
                triggerFileInputClick(source); // Panggil fungsi pemicu
                // Flag akan direset di dalam onchange fileInput
            }
        });
        // Jangan reset flag di sini
    } else {
        triggerFileInputClick(); // Panggil fungsi pemicu untuk desktop
        // Flag akan direset di dalam onchange fileInput
    }
    // --- Akhir Logika Pemicu ---
}


export async function handleDeleteAttachment(expenseId, attachmentUrl) {

    if (!expenseId || !attachmentUrl) return;

    emit('ui.modal.create', 'confirmDeleteAttachment', {
        onConfirm: async () => {
            const loader = startGlobalLoading('Menghapus lampiran...');
            try {
                await localDB.transaction('rw', localDB.expenses, localDB.outbox, async () => { // Tambah outbox
                    const expense = await localDB.expenses.get(expenseId);
                    if (!expense) throw new Error('Data pengeluaran tidak ditemukan di lokal.');

                    // Gunakan array attachments jika ada, fallback ke array kosong
                    const updatedAttachments = (Array.isArray(expense.attachments) ? expense.attachments : [])
                        .filter(att => att && att.url !== attachmentUrl);

                    const updateData = {
                        attachments: updatedAttachments,
                        syncState: 'pending_update',
                        updatedAt: new Date(),
                        // Hapus field legacy jika URL-nya sama
                        ...(expense.attachmentUrl === attachmentUrl && { attachmentUrl: null })
                    };

                    await localDB.expenses.update(expenseId, updateData);
                    // Antrikan ke outbox
                    await queueOutbox({
                        table: 'expenses',
                        docId: expenseId,
                        op: 'upsert',
                        payload: { id: expenseId, attachments: updatedAttachments, attachmentUrl: null }, // Kirim data relevan
                        priority: 6
                    });
                });

                toast('success', 'Lampiran berhasil dihapus.');
                _logActivity('Menghapus Lampiran', { expenseId, attachmentUrl });

                // Emit event untuk me-refresh modal edit jika terbuka
                emit('ui.modal.openEditExpense', { id: expenseId });
                requestSync({ silent: true }); // Minta sinkronisasi
                
                return true; // PERBAIKAN: Signal sukses

            } catch (error) {
                toast('error', `Gagal menghapus lampiran: ${error.message}`);
                console.error("[handleDeleteAttachment] Error:", error);
                return false; // PERBAIKAN: Signal gagal
            } finally {
                loader.close();
            }
        }
    });
}
