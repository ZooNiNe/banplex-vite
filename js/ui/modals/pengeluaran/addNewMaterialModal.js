import { appState } from "../../../state/appState.js";
import { $ } from "../../../utils/dom.js";
import { createModal } from "../../components/modal.js";
import { emit } from "../../../state/eventBus.js";
import { toast } from "../../components/toast.js";
import { _saveNewMasterMaterial } from "../../../services/data/masterDataService.js";
import { formatNumberInput } from "../../components/forms/index.js"; // Import needed function

function handleAddNewMaterialModal(targetWrapper = null) {
  const content = `
        <form id="add-new-material-form">
            <div class="form-group">
                <label>Nama Material Baru</label>
                <input type="text" name="materialName" required placeholder="Contoh: Semen Tiga Roda" data-proper-case="true">
            </div>
            <div class="form-group">
                <label>Satuan</label>
                <input type="text" name="unit" required placeholder="Contoh: Zak, Pcs, M3">
            </div>
        </form>
    `;
  const footer = `
        <button type="button" class="btn btn-secondary" data-close-modal>Batal</button>
        <button type="submit" class="btn btn-primary" form="add-new-material-form">Simpan & Pilih</button>
    `;

  const modalEl = createModal('dataDetail', { title: 'Tambah Master Material', content, footer });
  emit('ui.forms.init', modalEl);

  $('#add-new-material-form', modalEl)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const newName = form.elements.materialName.value.trim();
    const newUnit = form.elements.unit.value.trim();
    if (!newName || !newUnit) {
      toast('error', 'Nama dan Satuan harus diisi.');
      return;
    }
    toast('syncing', 'Menyimpan material baru...');
    const newMaterial = await _saveNewMasterMaterial({ name: newName, unit: newUnit });

    if (newMaterial) {
      appState.materials.push(newMaterial);
      toast('success', 'Material baru berhasil disimpan!');
      emit('ui.modal.close', modalEl);

      if (targetWrapper) {
        const nameInput = $('.autocomplete-input', targetWrapper);
        const idInput = $('.autocomplete-id', targetWrapper);
        const clearBtn = $('.autocomplete-clear-btn', targetWrapper);

        nameInput.value = newMaterial.materialName;
        idInput.value = newMaterial.id;
        nameInput.readOnly = true;
        if (clearBtn) clearBtn.style.display = 'flex';

        const row = targetWrapper.closest('.invoice-item-row');
        const unitSpan = row?.querySelector('.item-unit');
        if (unitSpan) unitSpan.textContent = newMaterial.unit || '';
      }
    }
  });
}

export { handleAddNewMaterialModal };
