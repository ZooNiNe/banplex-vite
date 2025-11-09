import { appState } from "../state/appState.js";
import { emit } from "../state/eventBus.js";

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
  return typeof window !== 'undefined'
    ? !!window.appState?.isViewerRole?.()
    : appState.userRole === 'Viewer';
}

export function canWriteAdministrasi() {
    return typeof window !== 'undefined'
        ? !!window.appState?.canWriteAdministrasi?.()
        : true;
}

export function canWriteLapangan() {
    return typeof window !== 'undefined'
        ? !!window.appState?.canWriteLapangan?.()
        : true;
}

export function isPrivilegedUser() {
    return typeof window !== 'undefined'
        ? !!window.appState?.isPrivileged?.()
        : appState.userRole === 'Owner';
}

export function canReadData() {
    return typeof window !== 'undefined'
        ? !!window.appState?.canRead?.()
        : true;
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

export function setLastCommentViewTimestamp(parentId, meta = {}) {
    if (!parentId) return;
    try {
        const key = `comment_view_ts_${parentId}`;
        localStorage.setItem(key, Date.now().toString());
        emit('ui.dashboard.updateCommentsBadge');
        emit('ui.comments.threadViewed', { parentId, ...meta });
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

export function sanitizeDigits(value = '') {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\D+/g, '');
}

export function isValidNik(value) {
    const digits = sanitizeDigits(value);
    return digits.length === 16;
}

export function isValidNikKk(value) {
    if (typeof value !== 'string') return false;
    const digits = value.replace(/\D/g, ''); // Hapus semua yang bukan angka
    return /^\d{16}$/.test(digits);
}

export function normalizeDistanceToMeters(value, options = {}) {
    const { allowZero = false } = options;
    if (value === null || value === undefined) return null;
    let raw = String(value).trim();
    if (!raw) return null;

    const lower = raw.toLowerCase();
    let multiplier = 1;
    if (lower.includes('km') || lower.includes('kilometer')) {
        multiplier = 1000;
    }

    let numericPortion = lower.replace(/[^0-9.,-]/g, '');
    if (!numericPortion) return null;

    if (numericPortion.includes(',') && !numericPortion.includes('.')) {
        numericPortion = numericPortion.replace(',', '.');
    } else {
        numericPortion = numericPortion.replace(/,/g, '');
    }

    const parsed = parseFloat(numericPortion);
    if (!Number.isFinite(parsed)) return null;

    const meters = parsed * multiplier;
    if (!allowZero && meters <= 0) return null;
    if (allowZero && meters < 0) return null;

    return Math.round(meters);
}
export function sanitizePhone(phoneStr) {
    if (typeof phoneStr !== 'string' || !phoneStr) return '';
    
    // Hanya izinkan digit dan '+'
    let digits = phoneStr.replace(/[^\d+]/g, '');

    // Tangani awalan umum Indonesia
    if (digits.startsWith('08')) {
        // Ganti 08 -> 628
        digits = '628' + digits.substring(2);
    } else if (digits.startsWith('+62')) {
        // Ganti +62 -> 62
        digits = '62' + digits.substring(3);
    }

    // Pastikan '+' hanya ada di awal (meskipun sudah kita tangani)
    // dan bersihkan jika ada '+' ganda
    if (digits.startsWith('62')) {
        return digits.replace(/(?!^)[+]/g, ''); // Hapus '+' di tengah
    }
    
    // Kembalikan nomor yang sudah bersih
    return digits;
}