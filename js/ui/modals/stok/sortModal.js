// PERBAIKAN: Impor closeModalImmediate
import { createModal, closeModal, closeModalImmediate } from "../../components/modal.js";
import { appState } from "../../../state/appState.js";

function createIcon(iconName, size = 16, classes = '') {
  const icons = {
    sort: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-up-down ${classes}"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg>`,
    arrow_down: `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"${size}\" height=\"${size}\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-arrow-down ${classes}\"><path d=\"M12 5v14\"/><path d=\"m19 12-7 7-7-7\"/></svg>`
  };
  return icons[iconName] || '';
}

export function showStockSortModal(onApply) {
  const current = (() => { try { return localStorage.getItem('stok.sortMode') || 'name'; } catch(_) { return 'name'; } })();

  const content = `
    <form id="stock-sort-form">
      <div class="form-group">
        <label>Urutkan Daftar Material</label>
        <div class="segmented-control">
          <input type="radio" id="sort-name" name="sortMode" value="name" ${current === 'name' ? 'checked' : ''}>
          <label for="sort-name">Nama</label>
          <input type="radio" id="sort-most-used" name="sortMode" value="most_used" ${current === 'most_used' ? 'checked' : ''}>
          <label for="sort-most-used">Paling Sering Dipakai</label>
        </div>
      </div>
      <div class="form-group">
        <label>Aktivitas Stok</label>
        <div class="segmented-control">
          <input type="radio" id="sort-incoming" name="sortMode" value="incoming" ${current === 'incoming' ? 'checked' : ''}>
          <label for="sort-incoming">Masuk Terbanyak</label>
          <input type="radio" id="sort-outgoing" name="sortMode" value="outgoing" ${current === 'outgoing' ? 'checked' : ''}>
          <label for="sort-outgoing">Keluar Terbanyak</label>
        </div>
      </div>
      <div class="form-group">
        <label>Berdasarkan Faktur</label>
        <div class="segmented-control">
          <input type="radio" id="sort-invoice-incoming" name="sortMode" value="invoice_incoming" ${current === 'invoice_incoming' ? 'checked' : ''}>
          <label for="sort-invoice-incoming">Paling Aktif dari Faktur</label>
        </div>
      </div>
    </form>`;

  const footer = `<button type="submit" class="btn btn-primary" form="stock-sort-form">Terapkan</button>`;

  // PERBAIKAN: Tambahkan isUtility: true
  const modalEl = createModal('formView', { title: 'Urutkan Stok', content, footer, isUtility: true });
  if (!modalEl) return;

  const form = modalEl.querySelector('#stock-sort-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const selected = form.querySelector('input[name="sortMode"]:checked')?.value || 'name';
    try { localStorage.setItem('stok.sortMode', selected); } catch(_) {}
    if (typeof onApply === 'function') onApply(selected);
    // PERBAIKAN: Gunakan closeModalImmediate
    closeModalImmediate(modalEl);
  });
}
