import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { getFirestore, collection, doc, initializeFirestore, persistentLocalCache, Timestamp, increment, serverTimestamp, where, orderBy, limit, startAfter, runTransaction, writeBatch, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-storage.js";
import { TEAM_ID } from "./constants.js";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const storage = getStorage(app);

if (import.meta.env.VITE_CYPRESS_TESTING === 'true') {
  window.cypressAuth = {
    auth,
    signInWithCustomToken
  };
}

async function initializeAuthPersistence() {
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (e) {
    console.warn("Persistence failed", e.code);
  }
}
initializeAuthPersistence();

let db;
try {
  db = initializeFirestore(app, {
    cache: persistentLocalCache({
      tabManager: 'MEMORY_CACHE_TAB_MANAGER'
    })
  });
} catch (e) {
  db = getFirestore(app);
}

export { db };
export { getDoc };

export const membersCol = collection(db, 'teams', TEAM_ID, 'members');
export const projectsCol = collection(db, 'teams', TEAM_ID, 'projects');
export const fundingCreditorsCol = collection(db, 'teams', TEAM_ID, 'funding_creditors');
export const opCatsCol = collection(db, 'teams', TEAM_ID, 'operational_categories');
export const matCatsCol = collection(db, 'teams', TEAM_ID, 'material_categories');
export const otherCatsCol = collection(db, 'teams', TEAM_ID, 'other_categories');
export const suppliersCol = collection(db, 'teams', TEAM_ID, 'suppliers');
export const workersCol = collection(db, 'teams', TEAM_ID, 'workers');
export const professionsCol = collection(db, 'teams', TEAM_ID, 'professions');
export const attendanceRecordsCol = collection(db, 'teams', TEAM_ID, 'attendance_records');
export const incomesCol = collection(db, 'teams', TEAM_ID, 'incomes');
export const fundingSourcesCol = collection(db, 'teams', TEAM_ID, 'funding_sources');
export const expensesCol = collection(db, 'teams', TEAM_ID, 'expenses');
export const billsCol = collection(db, 'teams', TEAM_ID, 'bills');
export const logsCol = collection(db, 'teams', TEAM_ID, 'logs');
export const materialsCol = collection(db, 'teams', TEAM_ID, 'materials');
export const stockTransactionsCol = collection(db, 'teams', TEAM_ID, 'stock_transactions');
export const staffCol = collection(db, 'teams', TEAM_ID, 'staff');
export const commentsCol = collection(db, 'teams', TEAM_ID, 'comments');
export const notificationsCol = collection(db, 'teams', TEAM_ID, 'notifications');
export const settingsDocRef = doc(db, 'teams', TEAM_ID, 'settings', 'pdf');
