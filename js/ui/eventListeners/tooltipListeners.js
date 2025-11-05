import { showTooltip, hideTooltip } from "../components/tooltip.js";
import { emit, on } from "../../state/eventBus.js";
import { appState } from "../../state/appState.js";

let longPressTimer = null;
let touchStartX, touchStartY;
let currentTooltipTarget = null;
let showTooltipTimer = null;

export function initializeTooltipListeners() {
    appState.ui = appState.ui || {};
    appState.ui.isLongPress = false;

     document.body.addEventListener('touchstart', (e) => {
        const target = e.target.closest('[data-tooltip]');
        if (target) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            appState.ui.isLongPress = false;
            longPressTimer = setTimeout(() => {
                showTooltip(target);
                appState.ui.isLongPress = true;
                longPressTimer = null;
            }, 300);
        }
    }, { passive: true });

    document.body.addEventListener('touchmove', (e) => {
        if (longPressTimer) {
            const moveX = e.touches[0].clientX;
            const moveY = e.touches[0].clientY;
            if (Math.abs(moveX - touchStartX) > 10 || Math.abs(moveY - touchStartY) > 10) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        }
    }, { passive: true });

    document.body.addEventListener('touchend', (e) => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        if (appState.ui.isLongPress) {
            e.preventDefault();
            e.stopPropagation();
            hideTooltip(500);
        } else {
            hideTooltip(0);
        }
    }, true);


    document.body.addEventListener('mouseover', (e) => {
        if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
            const target = e.target.closest('[data-tooltip]');
            if (target) {
                currentTooltipTarget = target;
                if(showTooltipTimer) clearTimeout(showTooltipTimer);
                showTooltipTimer = setTimeout(() => {
                    if (currentTooltipTarget === target) {
                         showTooltip(target);
                    }
                }, 3000);
            }
        }
    });

    document.body.addEventListener('mouseout', (e) => {
        if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
            if(showTooltipTimer) clearTimeout(showTooltipTimer);
            const target = e.target.closest('[data-tooltip]');
            if(target && target === currentTooltipTarget){
                 hideTooltip();
                 currentTooltipTarget = null;
            } else if (currentTooltipTarget && (!e.relatedTarget || !e.relatedTarget.closest('[data-tooltip]'))) {
                 hideTooltip();
                 currentTooltipTarget = null;
            }
        }
    });

    on('ui.tooltip.handleAction', (action, target) => {
        if (action === 'show-tooltip') showTooltip(target);
        if (action === 'hide-tooltip') hideTooltip();
    });
}
