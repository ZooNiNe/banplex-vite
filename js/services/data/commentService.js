import { emit } from "../../state/eventBus.js";
import { appState } from "../../state/appState.js";
import { localDB } from "../localDbService.js";
import { generateUUID } from "../../utils/helpers.js";
import { requestSync } from "../syncService.js";
import { queueOutbox } from "../outboxService.js";
import { _logActivity } from "../logService.js";
import { doc, setDoc, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { commentsCol } from "../../config/firebase.js";


/**
 * PERUBAHAN: Menerima 'replyToId' sebagai argumen baru.
 */
export async function handlePostComment(dataset, attachmentData = null, replyToId = null) {
    let item;
    // PERUBAHAN: Dapatkan elemen dari container yang lebih spesifik, jangan global
    const composer = document.querySelector('.composer-wrapper:not(.modal-footer .composer-wrapper) footer.composer, .modal-footer footer.composer');
    const ta = composer ? composer.querySelector('textarea') : null;
    const sendButton = composer ? composer.querySelector('.chat-send-btn') : null;

    try {
        const { parentId, parentType } = dataset;
        if (!ta || !parentId || !parentType) {
            console.warn("Missing ta, parentId, or parentType", ta, parentId, parentType);
            return;
        }

        const content = ta.value.trim();
        if (!content && !attachmentData) {
            return;
        }
        if (!appState.currentUser) {
            return;
        }
        
        if (sendButton) sendButton.disabled = true;

        item = {
            id: generateUUID(),
            parentId, // ID thread (cth: bill-id, loan-id)
            parentType,
            replyToId: replyToId || null, // PERUBAHAN: Simpan ID komentar induk
            content,
            userId: appState.currentUser.uid,
            userName: appState.currentUser.displayName || 'Pengguna',
            createdAt: new Date(),
            syncState: 'pending_create', // Mulai sebagai pending
            isDeleted: 0,
            isEdited: 0,
            clientMsgId: null
        };

        if (attachmentData) {
            item.attachments = attachmentData;
        }

        item.clientMsgId = item.id;

        // Update UI immediately
        // PERUBAHAN: Kirim 'replyToId' agar UI tahu cara menempatkannya
        emit('ui.comment.upsert', { commentData: item, changeType: 'added', replyToId: replyToId });
        
        // Selalu simpan ke localDB dan outbox dulu
        await localDB.comments.put(item);
        await queueOutbox({ table: 'comments', docId: item.id, op: 'upsert', payload: item, priority: 7 });
        
        const existingIndex = (appState.comments || []).findIndex(x => x.id === item.id || x.clientMsgId === item.clientMsgId);
        if (existingIndex > -1) appState.comments[existingIndex] = item;
        else appState.comments.push(item);
        
        // Minta sinkronisasi
        requestSync({ silent: true });


        // Reset composer UI
        ta.value = '';
        ta.style.height = 'auto';
        ta.dispatchEvent(new Event('input', { bubbles: true }));

    } catch (e) {
        console.error('Gagal menambah Komentar', e);
        if (item) {
            // Jika gagal, pastikan UI menampilkan status gagal
            emit('ui.comment.upsert', { commentData: { ...item, syncState: 'failed' }, changeType: 'modified' });
        }
    } finally {
        if (sendButton) {
            sendButton.disabled = false;
        }
    }
}

/**
 * Fungsi baru untuk menangani editan komentar
 */
export async function handleEditComment(dataset) {
    const { id, content } = dataset;
    if (!id || content === undefined) {
        console.error('handleEditComment: ID atau konten tidak ada');
        return;
    }
    
    try {
        const comment = await localDB.comments.get(id);
        if (!comment) {
            console.error('handleEditComment: Komentar tidak ditemukan di localDB');
            return;
        }

        const updatedComment = {
            ...comment,
            content: content,
            isEdited: 1,
            syncState: 'pending_update',
            updatedAt: new Date()
        };

        // 1. Update localDB
        await localDB.comments.put(updatedComment);

        // 2. Update appState
        const commentIndex = appState.comments.findIndex(c => c.id === id);
        if (commentIndex > -1) {
            appState.comments[commentIndex] = updatedComment;
        } else {
            appState.comments.push(updatedComment); // Seharusnya tidak terjadi, tapi untuk keamanan
        }

        // 3. Queue Outbox
        await queueOutbox({ 
            table: 'comments', 
            docId: id, 
            op: 'upsert', 
            // Hanya kirim field yang diubah ke server
            payload: { id: id, content: content, isEdited: 1, updatedAt: new Date() }, 
            priority: 5 
        });

        // 4. Update UI
        emit('ui.comment.upsert', { commentData: updatedComment, changeType: 'modified' });

        // 5. Request Sync
        requestSync({ silent: true });
        
    } catch (e) {
        console.error('Gagal mengedit Komentar', e);
        // Jika gagal, beri tahu UI (opsional)
        // emit('ui.comment.upsert', { commentData: { id, syncState: 'failed' }, changeType: 'modified' });
    }
}


export async function handleDeleteComment(dataset) {
    try {
        const { id } = dataset;
        if (!id) return;
        const c = (appState.comments || []).find(x => x.id === id);
        if (!c) {
             // Coba cari di localDB jika tidak ada di appState
            const localC = await localDB.comments.get(id);
            if (!localC) {
                console.error('Komentar untuk dihapus tidak ditemukan', id);
                return;
            }
        }

        // PERUBAHAN: Hapus juga semua balasan turunan (secara logis)
        const allComments = appState.comments || await localDB.comments.toArray();
        const childIdsToDelete = new Set();
        
        function findChildren(parentId) {
            allComments.forEach(comment => {
                if (comment.replyToId === parentId && !comment.isDeleted) {
                    childIdsToDelete.add(comment.id);
                    findChildren(comment.id); // Rekursif
                }
            });
        }
        findChildren(id);

        const allIdsToDelete = [id, ...childIdsToDelete];

        await localDB.transaction('rw', localDB.comments, localDB.outbox, async () => {
            for (const commentId of allIdsToDelete) {
                await localDB.comments.update(commentId, { isDeleted: 1, syncState: 'pending_update', updatedAt: new Date() });
                await queueOutbox({ table: 'comments', docId: commentId, op: 'upsert', payload: { id: commentId, isDeleted: 1, updatedAt: new Date() }, priority: 6 });
                
                const commentIndex = appState.comments.findIndex(x => x.id === commentId);
                if (commentIndex > -1) {
                    appState.comments.splice(commentIndex, 1);
                }
                // Emit event 'removed' untuk setiap komentar yang dihapus
                emit('ui.comment.upsert', { commentData: {id: commentId}, changeType: 'removed' });
            }
        });

        _logActivity(`Menghapus Komentar dan ${childIdsToDelete.size} balasan`, { targetId: id, parentId: c?.parentId });
        requestSync({ silent: true });

    } catch (e) {
        console.error('Gagal menghapus Komentar', e);
    }
}