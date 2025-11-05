import { getJSDate } from "./helpers.js";

function fmtIDR(n) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(Number(n || 0));
  }
  function formatRupiah(n) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(Number(n || 0));
  }

  function _terbilang(n) {
      const bilangan = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
      if (n < 12) return bilangan[n];
      if (n < 20) return _terbilang(n - 10) + " belas";
      if (n < 100) return _terbilang(Math.floor(n / 10)) + " puluh " + _terbilang(n % 10);
      if (n < 200) return "seratus " + _terbilang(n - 100);
      if (n < 1000) return _terbilang(Math.floor(n / 100)) + " ratus " + _terbilang(n % 100);
      if (n < 2000) return "seribu " + _terbilang(n - 1000);
      if (n < 1000000) return _terbilang(Math.floor(n / 1000)) + " ribu " + _terbilang(n % 1000);
      if (n < 1000000000) return _terbilang(Math.floor(n / 1000000)) + " juta " + _terbilang(n % 1000000);
      return "";
  }

  function parseFormattedNumber(str) {
    return Number(String(str).replace(/[^0-9]/g, ''));
  }

  function parseLocaleNumber(val) {
      if (val == null) return 0;
      let s = String(val).trim();
      if (!s) return 0;
      s = s.replace(/,/g, '.');
      s = s.replace(/\s+/g, '');
      const parts = s.split('.');
      if (parts.length > 2) {
        const dec = parts.pop();
        s = parts.join('') + '.' + dec;
      }
      const n = Number(s);
      return isNaN(n) ? 0 : n;
    }

function formatDate(dateVal, options = {}) {
    const date = getJSDate(dateVal);
    const defaultOptions = { day: 'numeric', month: 'short', year: 'numeric' };
    return date.toLocaleDateString('id-ID', { ...defaultOptions, ...options });
}

// PERBAIKAN 1 & 5.2: Tambahkan fungsi formatRelativeTime
function formatRelativeTime(dateVal) {
  const date = getJSDate(dateVal);
  if (isNaN(date.getTime())) return 'Invalid Date';

  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  
  // Hari ini
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const inputDateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (seconds < 5) return 'baru saja';
  if (seconds < 60) return `${seconds} detik lalu`;

  if (inputDateOnly.getTime() === today.getTime()) {
      return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); // Cth: 14.30
  }
  if (inputDateOnly.getTime() === yesterday.getTime()) {
      return 'Kemarin';
  }

  // Lebih dari kemarin, tampilkan tanggal
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

  // PERBAIKAN 1 & 5.2: Ekspor fungsi baru
  export { fmtIDR, _terbilang, parseFormattedNumber, parseLocaleNumber, formatDate, formatRelativeTime };
