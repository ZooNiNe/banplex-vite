// PERBAIKAN: Impor closeModalImmediate
import { createModal, closeModal, closeModalImmediate } from "../../components/modal.js";
import { masterDataConfig } from "../../../config/constants.js";
import { handleManageMasterData } from "../../../services/data/masterDataService.js";
import { emit } from "../../../state/eventBus.js"; // Import emit

function createIcon(iconName, size = 18, classes = '') {
    const icons = {
        database: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-database ${classes}"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`,
    };
    return icons[iconName] || '';
}


function openMasterGlobalModal() {
  const allowed = [
    'materials',
    'suppliers',
    'professions',
    'workers',
    'op-cats',
    'other-cats',
    'creditors',
  ];
  const items = allowed
    .filter(key => !!masterDataConfig[key])
    .map(key => ({ key, title: masterDataConfig[key].title }));

  const content = `
    <div class="dense-list-container">
      ${items.map(it => `
        <button class="dense-list-item btn btn-ghost" data-action="manage-master" data-type="${it.key}">
          <div class="item-main-content">
            <div class="action-item-primary">
              ${createIcon('database', 20)}
              <strong class="item-title">${it.title}</strong>
            </div>
          </div>
        </button>
      `).join('')}
    </div>`;

  // PERBAIKAN: Tambahkan isUtility: true
  const modal = createModal('dataDetail', { title: 'Master Data Lain', content, isUtility: true });

  if (modal) {
    modal.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-action="manage-master"]');
      if (button) {
        const type = button.dataset.type;
        // PERBAIKAN: Gunakan closeModalImmediate
        closeModalImmediate(modal);
        setTimeout(() => {
          handleManageMasterData(type);
        }, 300); // 300ms delay, adjust if needed
      }
    });
  }
}

export { openMasterGlobalModal };
