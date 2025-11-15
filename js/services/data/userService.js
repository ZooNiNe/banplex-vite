import { emit } from "../../state/eventBus.js";
import { appState } from "../../state/appState.js";
import { db, membersCol } from "../../config/firebase.js";
import { doc, getDocs, deleteDoc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { toast } from "../../ui/components/toast.js";
import { _logActivity } from "../logService.js";
import { createModal, showDetailPane, closeModalImmediate, startGlobalLoading } from "../../ui/components/modal.js";
import { _getUserManagementListHTML } from "../../ui/components/cards.js";
import { getEmptyStateHTML } from "../../ui/components/emptyState.js";

function createIcon(iconName, size = 18, classes = '') {
    const icons = {
        'users-round': `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-users-round ${classes}"><path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="4"/><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/></svg>`,
        error: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle ${classes}"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    };
    return icons[iconName] || '';
}

export async function handleManageUsers() {
      const loader = startGlobalLoading('Memuat data pengguna...');
      try {
          const pendingQuery = query(membersCol, where("status", "==", "pending"));
          const pendingSnap = await getDocs(pendingQuery);
          const pendingUsers = pendingSnap.docs.map(d => ({
              id: d.id,
              ...d.data()
          }));
          const otherUsersQuery = query(membersCol, where("status", "!=", "pending"));
          const otherUsersSnap = await getDocs(otherUsersQuery);
          const otherUsers = otherUsersSnap.docs.map(d => ({
              id: d.id,
              ...d.data()
          }));
          appState.users = [...pendingUsers, ...otherUsers];

          const pendingUsersHTML = pendingUsers.length > 0 ?
              `<h5 class="detail-section-title" style="margin-top: 0;">Menunggu Persetujuan</h5><div class="wa-card-list-wrapper">${_getUserManagementListHTML(pendingUsers)}</div>` :
              '';

          const otherUsersSorted = otherUsers.sort((a, b) => (a.role === 'Owner'?-1 : (a.role === 'Editor' ? 0 : 1)));
          const otherUsersHTML = otherUsersSorted.length > 0 ?
              `<h5 class="detail-section-title" style="${pendingUsers.length > 0?'' : 'margin-top: 0;'}">Pengguna Terdaftar</h5><div class="wa-card-list-wrapper">${_getUserManagementListHTML(otherUsersSorted)}</div>` :
              '';

          const noUsersHTML = appState.users.length === 0 ? getEmptyStateHTML({ icon: 'users-round', title: 'Tidak Ada Pengguna', desc: 'Belum ada pengguna lain yang terdaftar.'}) : '';

          const content = `
              <div class="master-data-list">
                  ${noUsersHTML}
                  ${pendingUsersHTML}
                  ${otherUsersHTML}
              </div>
          `;
          showDetailPane({
              title: 'Manajemen Pengguna',
              content: `<div class="scrollable-content">${content}</div>`,
              paneType: 'user-management'
          });

          loader.close();
      } catch (e) {
          loader.close();
          console.error("Gagal mengambil data pengguna:", e);
          toast('error', 'Gagal memuat data pengguna.');
          showDetailPane({
            title: 'Manajemen Pengguna',
            content: getEmptyStateHTML({ icon: 'error', title: 'Gagal Memuat', desc: 'Tidak dapat memuat data pengguna saat ini.'}),
            paneType: 'user-management'
        });
    }
}


export async function handleUserAction(dataset) {
    const { type } = dataset;
    const userId = dataset.itemId || dataset.id; // Mencari itemId dulu, lalu fallback ke id

    const user = appState.users.find(u => u.id === userId);
    if (!user) {
        console.error('User tidak ditemukan di appState.users.', { userId, dataset, appStateUsers: appState.users });
        toast('error', 'User tidak ditemukan.');
        return;
    }

    const actionMap = {
        'approve': { message: `Setujui <strong>${user.name}</strong> sebagai Viewer?`, data: { status: 'active', role: 'Viewer' } },
        'make-editor': { message: `Ubah peran <strong>${user.name}</strong> menjadi Editor?`, data: { role: 'Editor' } },
        'make-viewer': { message: `Ubah peran <strong>${user.name}</strong> menjadi Viewer?`, data: { role: 'Viewer' } },
        'delete': { message: `Hapus atau tolak pengguna <strong>${user.name}</strong>? Aksi ini tidak dapat dibatalkan.`, data: null, isDelete: true }
    };
    const action = actionMap[type];
    if (!action) {
        toast('error', 'Aksi tidak valid.');
        return;
    }

    const confirmAction = async () => {
        const loader = startGlobalLoading('Memproses...');
        try {
            const userRef = doc(membersCol, userId);
            if (action.isDelete) {
                await deleteDoc(userRef);
            } else {
                await updateDoc(userRef, action.data);
            }

            _logActivity(`Aksi Pengguna: ${type}`, {
                targetUserId: userId,
                targetUserName: user.name
            });

            loader.close();
            toast('success', 'Aksi berhasil dilakukan.');

            const detailPane = document.getElementById('detail-pane');
            if (detailPane && detailPane.dataset.paneType === 'user-management') {
                await handleManageUsers();
            }

        } catch (error) {
            loader.close();
            console.error('User action error:', error);
            toast('error', 'Gagal memproses aksi.');
        }
    };

    // Tampilkan modal konfirmasi
    createModal('confirmUserAction', {
        title: action.isDelete ? 'Konfirmasi Hapus' : 'Konfirmasi Aksi',
        message: action.message,
        onConfirm: confirmAction
    });
}
