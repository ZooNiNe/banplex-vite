import { initializeGlobalClickListeners } from './globalClickListeners.js';
import { initializeFormListeners } from '../components/forms/formListeners.js';
import { initializeNavigationListeners } from './navigationListeners.js';
import { initializeSelectionListeners } from './selectionListeners.js';
import { initializeTooltipListeners } from './tooltipListeners.js';
import { initializeAttachmentListeners } from './attachmentListeners.js';
import { initializeEventBusListeners } from './eventBusListeners.js';
import { initializeSyncIndicatorListeners } from './syncIndicatorListeners.js';
import { initCustomSelects, formatNumberInput } from '../components/forms/index.js'; // Import needed functions
import { emit, on } from '../../state/eventBus.js'; // Import emit and on

export function initializeEventListeners() {
    initializeGlobalClickListeners();
    initializeFormListeners();
    initializeNavigationListeners();
    initializeSelectionListeners();
    initializeTooltipListeners();
    initializeAttachmentListeners();
    initializeEventBusListeners();
    initializeSyncIndicatorListeners();

    on('ui.forms.init', (container) => {
        if (!container) return;
        initCustomSelects(container);
        container.querySelectorAll('input[inputmode="numeric"]').forEach(input => {
            input.removeEventListener('input', formatNumberInput); // Prevent duplicate listeners
            input.addEventListener('input', formatNumberInput);
        });
         emit('ui.form.markDirty', false); // Mark as clean initially
    });

     on('ui.detailPane.formReady', ({ context }) => {
         if (context) {
             initCustomSelects(context);
             context.querySelectorAll('input[inputmode="numeric"]').forEach(input => {
                 input.removeEventListener('input', formatNumberInput);
                 input.addEventListener('input', formatNumberInput);
             });
              emit('ui.form.markDirty', false);
         }
     });

    on('ui.form.formatNumberInput', ({ target }) => {
        if (target) {
            formatNumberInput({ target });
        }
    });

    // Smooth content transitions: fade from skeleton to content and on tab switches
    try {
        if (!initializeEventListeners.__contentObserver) {
            const observer = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    if (m.type !== 'childList') continue;
                    const container = m.target.closest && m.target.closest('#sub-page-content');
                    if (!container) continue;
                    const hasSkeleton = container.querySelector('.skeleton');
                    if (!hasSkeleton && container.innerHTML.trim() !== '') {
                        container.style.opacity = '0';
                        container.style.transition = 'opacity 100ms ease-out';
                        requestAnimationFrame(() => {
                            container.style.opacity = '1';
                            container.addEventListener('transitionend', () => { container.style.transition = ''; }, { once: true });
                        });
                    }
                }
            });
            const attach = () => {
                const el = document.getElementById('sub-page-content');
                if (el) observer.observe(el, { childList: true, subtree: true });
            };
            attach();
            const rootObs = new MutationObserver(() => attach());
            rootObs.observe(document.body, { childList: true, subtree: true });
            initializeEventListeners.__contentObserver = observer;
        }
    } catch (_) {}

}
