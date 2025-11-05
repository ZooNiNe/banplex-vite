import { appState } from "../state/appState.js";
import { logsCol } from "../config/firebase.js";
import { localDB } from "./localDbService.js";
import { addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { isViewer } from "../utils/helpers.js";
import { triggerNotification } from "./notificationService.js";

async function _logActivity(action, details = {}) {
    if (!appState.currentUser || isViewer()) return;

    let actionType = 'info';
    if (action.toLowerCase().includes('menambah') || action.toLowerCase().includes('membuat')) {
        actionType = 'add';
    } else if (action.toLowerCase().includes('mengedit') || action.toLowerCase().includes('memperbarui')) {
        actionType = 'edit';
    } else if (action.toLowerCase().includes('menghapus') || action.toLowerCase().includes('membatalkan')) {
        actionType = 'delete';
    }

    const logData = {
        action: action,
        actionType: actionType,
        details: details,
        userId: appState.currentUser.uid,
        userName: appState.currentUser.displayName,
        createdAt: serverTimestamp()
    };
    
    try {
        await addDoc(logsCol, logData);
        const notificationMessage = `${appState.currentUser.displayName} baru saja ${action.toLowerCase()}.`;
        triggerNotification(notificationMessage, appState.currentUser.displayName, actionType);
    } catch (error) {
        console.error("Gagal mencatat aktivitas:", error);
        try {
            await localDB.pending_logs.add({ ...logData, createdAt: new Date() });
        } catch (e2) {
            console.warn('Gagal antre log offline:', e2);
        }
    }
}

export { _logActivity };
