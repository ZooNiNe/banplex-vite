import { appState } from "../../../state/appState.js";
import { $, $$ } from "../../../utils/dom.js";
import { fmtIDR, parseFormattedNumber } from "../../../utils/formatters.js";
import { createModal, closeModal } from "../../components/modal.js";
import { emit } from "../../../state/eventBus.js";
import { toast } from "../../components/toast.js";
import { getJSDate } from "../../../utils/helpers.js";
import { getEmptyStateHTML } from "../../components/emptyState.js";

// State lokal untuk modal ini
let localState = {
    material: null,
    currentStock: 0,
    projects: [],
    quantities: new Map(), // Map(projectId -> quantity)
    date: new Date().toISOString().slice(0, 10),
    totalUsed: 0,
};

function createIcon(iconName, size = 18, classes = '') {
    const icons = {
        save: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-save ${classes}"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
        minus: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-minus ${classes}"><path d="M5 12h14"/></svg>`,
        plus: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus ${classes}"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
    };
    return icons[iconName] || '';
}

/**
 * Update total yang ditampilkan di UI
 */
function updateTotalUsedUI(modal) {
    const totalEl = modal.querySelector('#stock-usage-total');
    const remainingEl = modal.querySelector('#stock-usage-remaining');
    const saveBtn = modal.querySelector('#save-stock-usage-btn');

    localState.totalUsed = 0;
    localState.quantities.forEach(qty => {
        localState.totalUsed += qty;
    });

    const remaining = localState.currentStock - localState.totalUsed;
    const isOverStock = remaining < 0;

    if (totalEl) totalEl.textContent = localState.totalUsed;
    if (remainingEl) {
        remainingEl.textContent = remaining;
        remainingEl.classList.toggle('over-stock', isOverStock);
    }
    if (saveBtn) {
        saveBtn.disabled = isOverStock || localState.totalUsed === 0;
    }
}

/**
 * Update nilai input dan state
 */
function updateQty(projectId, newQty, modal) {
    const input = modal.querySelector(`.project-stock-row[data-project-id="${projectId}"] .qty-input`);
    if (input) {
        input.value = newQty;
    }
    localState.quantities.set(projectId, newQty);
    updateTotalUsedUI(modal);
}

/**
 * Menyiapkan dan menampilkan modal
 */
export async function handleOpenStockUsageModal(context) {
    const materialId = context.itemId;
    const material = appState.materials.find(m => m.id === materialId);
    if (!material) {
        toast('error', 'Data material tidak ditemukan.');
        return;
    }

    // Reset state
    localState = {
        material: material,
        currentStock: material.currentStock || 0,
        projects: (appState.projects || []).filter(p => p.isWageAssignable && !p.isDeleted),
        quantities: new Map(),
        date: new Date().toISOString().slice(0, 10),
        totalUsed: 0,
    };

    const title = `Penyaluran Stok: ${material.materialName}`;
    
    // Buat daftar proyek
    const projectListHTML = localState.projects.length > 0
        ? localState.projects.map(p => {
            const qty = localState.quantities.get(p.id) || 0;
            return `
            <div class="project-stock-row" data-project-id="${p.id}" style="display:flex; align-items:center; justify-content:space-between; gap:.75rem; padding:.5rem 0;">
                <span class="project-name" style="flex:1; min-width:0;">${p.projectName}</span>
                <div class="stepper" style="display:inline-grid; grid-template-columns: 40px minmax(64px, 88px) 40px; align-items:center; justify-items:center; gap:.35rem;">
                    <button type="button" data-action="dec-qty" class="btn-icon btn-icon-danger" aria-label="Kurangi">${createIcon('minus')}</button>
                    <input type="number" value="${qty}" min="0" max="${localState.currentStock}" class="qty-input" inputmode="numeric" style="width:100%; text-align:center; height:38px; border:1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); color: var(--text);">
                    <button type="button" data-action="inc-qty" class="btn-icon btn-icon-success" aria-label="Tambah">${createIcon('plus')}</button>
                </div>
            </div>`;
        }).join('')
        : getEmptyStateHTML({ icon: 'engineering', title: 'Tidak Ada Proyek', desc: 'Tidak ada proyek yang ditandai "Dapat dialokasikan upah" di master data.', isSmall: true });

    const content = `
        <form id="stock-usage-form">
            <div class="card card-pad" style="margin-bottom: 1rem;">
                <div class="detail-summary-grid" style="grid-template-columns: 1fr 1fr 1fr; background-color: var(--panel); padding-top: 0;">
                    <div class="summary-item">
                        <span class="label">Stok Tersedia</span>
                        <strong class="value" id="stock-usage-available">${localState.currentStock} ${material.unit || ''}</strong>
                    </div>
                    <div class="summary-item">
                        <span class="label">Total Keluar</span>
                        <strong class="value" id="stock-usage-total">0</strong>
                    </div>
                    <div class="summary-item">
                        <span class="label">Sisa Stok</span>
                        <strong class="value" id="stock-usage-remaining">${localState.currentStock}</strong>
                    </div>
                </div>
            </div>
            
            <div class="card card-pad">
                <div class="form-group">
                    <label for="stock-usage-date">Tanggal Penyaluran</label>
                    <input type="date" id="stock-usage-date" name="date" value="${localState.date}" required>
                </div>

                <div style="display:flex; align-items:center; justify-content:space-between; gap:.5rem; margin-top:1.5rem;">
                    <h5 class="detail-section-title" style="margin: 0;">Alokasi ke Proyek</h5>
                    <span style="font-size:.85rem; color: var(--text-dim);">Pilih jumlah per proyek</span>
                </div>
                <div class="project-stock-list" id="project-stock-list">
                    ${projectListHTML}
                </div>
            </div>
        </form>
    `;

    const footer = `
        <div class="form-footer-actions" style="grid-template-columns: 1fr 1fr;">
            <button type="button" class="btn btn-ghost" data-action="history-back">Batal</button>
            <button type="button" id="save-stock-usage-btn" class="btn btn-primary" disabled>
                ${createIcon('save')} Simpan Penyaluran
            </button>
        </div>
    `;

    const isMobile = window.matchMedia('(max-width: 599px)').matches;
    const modal = isMobile
        ? createModal('actionsPopup', { title, content, footer, layoutClass: 'is-bottom-sheet' })
        : createModal('dataDetail', { title, content: `<div class="scrollable-content">${content}</div>`, footer });

    // Pasang event listeners
    const projectListEl = modal.querySelector('#project-stock-list');
    projectListEl.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;

        const row = btn.closest('.project-stock-row');
        const projectId = row.dataset.projectId;
        const input = row.querySelector('.qty-input');
        let currentQty = parseInt(input.value, 10) || 0;
        
        if (btn.dataset.action === 'inc-qty') {
            currentQty++;
        } else if (btn.dataset.action === 'dec-qty') {
            currentQty = Math.max(0, currentQty - 1);
        }
        updateQty(projectId, currentQty, modal);
    });

    projectListEl.addEventListener('input', (e) => {
        const input = e.target;
        if (input.classList.contains('qty-input')) {
            const row = input.closest('.project-stock-row');
            const projectId = row.dataset.projectId;
            let newQty = parseInt(input.value, 10) || 0;
            newQty = Math.max(0, newQty); // Pastikan tidak negatif
            updateQty(projectId, newQty, modal);
        }
    });

    modal.querySelector('#save-stock-usage-btn').addEventListener('click', () => {
        const dateStr = modal.querySelector('#stock-usage-date').value;
        if (!dateStr) {
            toast('error', 'Tanggal harus diisi.');
            return;
        }

        const transactions = [];
        localState.quantities.forEach((quantity, projectId) => {
            if (quantity > 0) {
                transactions.push({ projectId, quantity });
            }
        });

        if (transactions.length === 0) {
            toast('error', 'Tidak ada stok yang dialokasikan.');
            return;
        }

        if (localState.totalUsed > localState.currentStock) {
            toast('error', 'Total stok keluar melebihi stok tersedia.');
            return;
        }

        // Tampilkan modal konfirmasi
        emit('ui.modal.create', 'confirmUserAction', {
            title: 'Konfirmasi Penyaluran Stok',
            message: `Anda akan mengeluarkan total <strong>${localState.totalUsed} ${material.unit || ''}</strong> dari <strong>${material.materialName}</strong> untuk ${transactions.length} proyek. Lanjutkan?`,
            onConfirm: () => {
                emit('data.stock.batchOut', material.id, transactions, dateStr);
                try { closeModal(modal); } catch(_) {}
            }
        });
    });
}
