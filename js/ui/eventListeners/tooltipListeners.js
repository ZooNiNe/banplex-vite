import { showTooltip, hideTooltip } from "../components/tooltip.js";
import { emit, on } from "../../state/eventBus.js";
import { appState } from "../../state/appState.js";

let longPressTimer = null;
let touchStartX, touchStartY;
let currentTooltipTarget = null;
let showTooltipTimer = null;

export function initializeTooltipListeners() {
    document.body.addEventListener('mouseover', (e) => {
        const target = e.target.closest('[data-tooltip]');
        if (target) {
            showTooltip(target);
        }
    });

    document.body.addEventListener('mouseout', (e) => {
        const target = e.target.closest('[data-tooltip]');
        if (target) {
            hideTooltip();
        }
    });

    on('ui.tooltip.handleAction', (action, target) => {
        if (action === 'show-tooltip') showTooltip(target);
        if (action === 'hide-tooltip') hideTooltip();
    });
}
