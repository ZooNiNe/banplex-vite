import { appState } from "../state/appState.js";

export function generateUUID() {
    try {
        if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    } catch (_) {}
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0,
            v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export function getJSDate(dateObject) {
  if (!dateObject) {
      return new Date();
  }
  if (typeof dateObject.toDate === 'function') {
      return dateObject.toDate();
  }
  if (dateObject && typeof dateObject.seconds === 'number') {
      const d = new Date(dateObject.seconds * 1000);
      if (isNaN(d.getTime())) {
          return new Date();
      }
      return d;
  }
  if (dateObject instanceof Date) {
      if (isNaN(dateObject.getTime())) {
          return new Date();
      }
      return dateObject;
  }
  const parsedDate = new Date(dateObject);
  if (isNaN(parsedDate.getTime())) {
      return new Date();
  }
  return parsedDate;
}

export function isViewer() {
  return appState.userRole === 'Viewer';
}

export function resolveUserDisplay(ref) {
  try {
    if (!ref) return null;
    const s = String(ref).trim();
    const sLower = s.toLowerCase();
    const users = Array.isArray(appState.users) ? appState.users : [];
    let u = users.find(x => x && (x.id === s || String(x.id || '').toLowerCase() === sLower));
    if (!u) u = users.find(x => x && typeof x.email === 'string' && x.email.toLowerCase() === sLower);
    if (!u) u = users.find(x => x && typeof x.name === 'string' && x.name.toLowerCase() === sLower);
    if (u) return { name: u.name || s, photoURL: u.photoURL || '' };
    return { name: s, photoURL: '' };
  } catch (_) { return ref ? { name: String(ref), photoURL: '' } : null; }
}

export function parseLocalDate(dateStr) {
  if (!dateStr) {
      console.warn("[parseLocalDate] Menerima dateStr kosong, menggunakan tanggal hari ini.");
      dateStr = new Date().toISOString().slice(0, 10);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      console.warn(`[parseLocalDate] Format dateStr tidak valid: ${dateStr}. Menggunakan tanggal hari ini.`);
      dateStr = new Date().toISOString().slice(0, 10);
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function getLocalDayBounds(dateStr) {
  const date = parseLocalDate(dateStr);
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  return { startOfDay, endOfDay };
}

export function validateAndPrepareData(data, defaults) {
  const preparedData = { ...defaults, ...data };
  if (!preparedData.id) {
      preparedData.id = generateUUID();
  }
  return preparedData;
}

export function setLastCommentViewTimestamp(parentId) {
  if (!parentId) return;
  try {
    const key = `comment_view_ts_${parentId}`;
    localStorage.setItem(key, Date.now().toString());
  } catch (e) {
    console.error("Gagal menyimpan timestamp Komentar:", e);
  }
}

export function getUnreadCommentCount(parentId, commentsList) {
    if (!parentId || !commentsList || commentsList.length === 0) return 0;
    try {
      const key = `comment_view_ts_${parentId}`;
      const lastViewed = parseInt(localStorage.getItem(key) || '0', 10);

      const unreadCount = commentsList.filter(comment => {
        const commentTimestamp = getJSDate(comment.createdAt).getTime();
        return commentTimestamp > lastViewed;
      }).length;

      return unreadCount;
    } catch (e) {
      console.error("Gagal menghitung Komentar belum dibaca:", e);
      return 0;
    }
}

export function toProperCase(str) {
  if (!str) return '';
  if (str === str.toUpperCase() && str.length > 3) {
      return str;
  }
  return str.replace(
    /\w\S*/g,
    function(txt) {
      return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    }
  );
}
