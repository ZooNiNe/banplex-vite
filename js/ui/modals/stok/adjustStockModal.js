import { appState } from '../../../state/appState.js';
// PERBAIKAN: Impor closeModalImmediate
import { createModal, closeModal, closeModalImmediate, markFormDirty, resetFormDirty } from '../../components/modal.js';
import { toast } from '../../components/toast.js';
import { emit } from '../../../state/eventBus.js';

function createIcon(name, size = 18) {
  const icons = {
    add: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
    remove: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-minus"><path d="M5 12h14"/></svg>`,
  };
  return icons[name] || '';
}

export function openAdjustStockModal(materialId, mode = 'in') {
  const material = (appState.materials || []).find(m => m.id === materialId);
  const title = `${mode === 'in' ? 'Stok Masuk' : 'Stok Keluar'}${material ? `: ${material.materialName}` : ''}`;

  const today = new Date().toISOString().slice(0,10);

  const projectSelectHTML = (mode === 'out') ? `
    <label>Proyek</label>
    <select name="projectId" required>
      <option value="" disabled selected>Pilih Proyek</option>
      ${(appState.projects || []).filter(p => !p.isDeleted).map(p => `<option value="${p.id}">${p.projectName}</option>`).join('')}
    </select>
  ` : '';

  const priceInputHTML = (mode === 'in') ? `
    <label>Harga Satuan (Opsional)</label>
    <input type="text" name="price" inputmode="numeric" placeholder="0">
  ` : '';

  const formId = mode === 'in' ? 'stok-in-form' : 'stok-out-form';

  const content = `
    <form id="${formId}" data-id="${materialId}" class="stock-adjust-form">
      <div class="input-row">
        <label>Tanggal</label>
        <input type="date" name="date" required value="${today}">
      </div>
      ${projectSelectHTML}
      ${priceInputHTML}
      <div class="input-row">
        <label>Jumlah</label>
        <div class="qty-stepper">
          <button type="button" class="btn-icon" data-action="dec-qty" title="Kurangi">${createIcon('remove')}</button>
          <input type="number" name="quantity" min="1" step="1" value="1" required>
          <button type="button" class="btn-icon" data-action="inc-qty" title="Tambah">${createIcon('add')}</button>
        </div>
        ${material?.unit ? `<div class="hint">Satuan: ${material.unit}</div>` : ''}
      </div>
        <button type="button" class="btn" data-action="cancel">Batal</button>
        <button type="button" class="btn btn-primary" data-action="save">Simpan</button>
    </form>`;

  const modal = createModal('dataForm', { title, content });

  const form = modal.querySelector('form');
  const qtyInput = form.querySelector('input[name="quantity"]');
  const decBtn = form.querySelector('[data-action="dec-qty"]');
  const incBtn = form.querySelector('[data-action="inc-qty"]');
  const saveBtn = form.querySelector('[data-action="save"]');
  const cancelBtn = form.querySelector('[data-action="cancel"]');

  const onInput = () => markFormDirty(true);
  form.addEventListener('input', onInput, { capture: true });
  form.addEventListener('change', onInput, { capture: true });

  decBtn?.addEventListener('click', () => {
    const v = Math.max(1, Number(qtyInput.value || 1) - 1);
    qtyInput.value = String(v);
    markFormDirty(true);
  });
  incBtn?.addEventListener('click', () => {
    const v = Math.max(1, Number(qtyInput.value || 1) + 1);
    qtyInput.value = String(v);
    markFormDirty(true);
  });

  cancelBtn?.addEventListener('click', () => closeModal(modal));

  saveBtn?.addEventListener('click', async () => {
    try {
      const valid = form.reportValidity();
      if (!valid) return;
      const message = 'Simpan perubahan stok?';
      emit('ui.modal.create', 'confirmUserAction', {
        message,
        // PERBAIKAN: Ubah onConfirm agar me-return status
        onConfirm: async () => {
          const savingToast = toast('syncing', 'Menyimpan perubahan stok...');
          try {
            const { processStokIn, processStokOut } = await import('../../../services/data/stockService.js');
            if (mode === 'in') await processStokIn(form); else await processStokOut(form);
            
            if (savingToast?.close) savingToast.close();
            resetFormDirty();
            // PERBAIKAN: Gunakan closeModalImmediate
            closeModalImmediate(modal);
            toast('success', 'Stok diperbarui.');
            return true; // Signal sukses
          } catch (e) {
            if (savingToast?.close) savingToast.close();
            console.error(e);
            toast('error', e.message || 'Gagal memperbarui stok.');
            return false; // Signal gagal
          }
        }
      });
    } catch (_) {}
  });
}
