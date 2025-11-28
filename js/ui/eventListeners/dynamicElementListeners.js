import { emit } from "../../state/eventBus.js";
import { closeModalImmediate } from "../components/modal.js";

function _createDataAttributes(dataObject) {
    return Object.entries(dataObject)
        .filter(([key, value]) =>
            key !== 'target' &&
            value !== undefined &&
            value !== null &&
            key !== 'icon' &&
            key !== 'label' &&
            key !== 'isDanger' &&
            key !== 'action'
            && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
        )
        .map(([key, value]) => `data-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}="${String(value ?? '').replace(/"/g, '&quot;')}"`)
        .join(' ');
}


export function attachMenuActionListeners(menuElement) {
    if (!menuElement) return;

    const controller = new AbortController();
    menuElement.__listenerController = controller;

    menuElement.addEventListener('click', (e) => {
        const button = e.target?.closest('.actions-menu-item[data-action]');
        if (!button) {
            if (menuElement.contains(e.target)) {
                e.stopPropagation();
                e.stopImmediatePropagation();
            }
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const action = button.dataset.action;
        const dataset = { ...button.dataset };

        console.log('[attachMenuActionListeners] Tombol aksi diklik:', { action, dataset });

        if (window.closeContextMenu) {
            document.removeEventListener('click', window.closeContextMenu, true);
            window.closeContextMenu = null;
        }
        if (menuElement.parentNode) {
            menuElement.classList.remove('show');
            menuElement.addEventListener('transitionend', () => menuElement.remove(), { once: true });
            setTimeout(() => { if (menuElement.parentNode) menuElement.remove(); }, 200);
        }

        controller.abort();


        const panelOpeningActions = new Set([
            'open-bill-detail',
            'open-pemasukan-detail',
            'pay-bill',                 
            'pay-loan',                 
            'open-edit-expense',
            'edit-item',
            'convert-surat-jalan',
            'edit-surat-jalan',
            'view-invoice-items',
            'open-salary-payment-panel',
            'open-salary-payment-history',
            'pay-individual-salary',    
            'edit-attendance',    
            'view-jurnal-harian',
            'view-worker-recap',
            'open-stock-usage-modal',
            'edit-master-item',
            'open-worker-defaults-modal',
            'open-project-role-editor',
            'open-attachment',
            'download-attachment-confirm'
        ]);

        if (panelOpeningActions.has(action)) {
            setTimeout(() => {
                emit(`ui.action.${action}`, dataset);
            }, 100);
        } else {
            emit(`ui.action.${action}`, dataset);
        }

    }, { capture: true, signal: controller.signal });
    
    const observer = new MutationObserver((mutationsList, obs) => {
        for(const mutation of mutationsList) {
            if (mutation.removedNodes) {
                mutation.removedNodes.forEach(removedNode => {
                    if (removedNode === menuElement) {
                        controller.abort();
                        obs.disconnect();
                        return;
                    }
                });
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
     controller.signal.addEventListener('abort', () => observer.disconnect());

}

export function attachBottomSheetActionListeners(modalElement) {
    const listElement = modalElement?.querySelector('.actions-modal-list');
    if (!listElement) return;

    const controller = new AbortController();
    modalElement.__listenerController = controller;

    listElement.addEventListener('click', (ev) => {
        const button = ev.target?.closest('.actions-menu-item[data-action]');
        if (!button) {
            if (listElement.contains(ev.target)) {
                 ev.stopPropagation();
                 ev.stopImmediatePropagation();
             }
            return;
        }

        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();

        const actionType = button.dataset.action;
        const dataset = { ...button.dataset };

        // *** TAMBAHKAN CONSOLE LOG DI SINI (attachBottomSheetActionListeners) ***
        console.log('[attachBottomSheetActionListeners] Tombol aksi diklik:', { action: actionType, dataset });
        // *** AKHIR TAMBAHAN ***

        closeModalImmediate(modalElement);
        controller.abort();


        emit(`ui.action.${actionType}`, dataset);

    }, { capture: true, signal: controller.signal });

    controller.signal.addEventListener('abort', () => {
    });
}