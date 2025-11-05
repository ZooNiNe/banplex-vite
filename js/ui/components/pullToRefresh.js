import { $ } from '../../utils/dom.js';
import { emit } from '../../state/eventBus.js';

export function initAdvancedPTR() {
    const ptrContainer = $('.ptr-scroll-container');
    const ptrIndicator = $('.ptr-indicator');
    if (!ptrContainer || !ptrIndicator) return;

    let startY = 0;
    let pullDistance = 0;
    const ptrThreshold = 70;

    const resetStyles = () => {
        ptrContainer.style.transition = 'transform 0.3s ease';
        ptrContainer.style.transform = 'translateY(0)';
        ptrIndicator.style.transform = 'translateY(-100%)';
        ptrContainer.classList.remove('ptr-pulling', 'ptr-refreshing');
    };

    const onTouchStart = (e) => {
        if (ptrContainer.scrollTop === 0) {
            startY = e.touches[0].pageY;
            ptrContainer.style.transition = 'none';
        }
    };

    const onTouchMove = (e) => {
        if (ptrContainer.scrollTop === 0 && startY > 0) {
            const currentY = e.touches[0].pageY;
            pullDistance = Math.max(0, (currentY - startY) / 2.5); // Add resistance

            if (pullDistance > 0) {
                ptrContainer.style.transform = `translateY(${pullDistance}px)`;
                ptrIndicator.style.transform = `translateY(${Math.min(pullDistance, ptrThreshold) - ptrThreshold}px)`;
            }

            if (pullDistance > ptrThreshold) {
                ptrContainer.classList.add('ptr-pulling');
            } else {
                ptrContainer.classList.remove('ptr-pulling');
            }
        }
    };

    const onTouchEnd = () => {
        if (pullDistance > ptrThreshold) {
            ptrContainer.classList.add('ptr-refreshing');
            ptrContainer.style.transform = `translateY(${ptrThreshold}px)`;
            emit('request-refresh');
            
            // Simulate refresh completion and reset
            setTimeout(() => {
                resetStyles();
            }, 1500); 
        } else {
            resetStyles();
        }
        startY = 0;
        pullDistance = 0;
    };

    ptrContainer.addEventListener('touchstart', onTouchStart, { passive: true });
    ptrContainer.addEventListener('touchmove', onTouchMove, { passive: true });
    ptrContainer.addEventListener('touchend', onTouchEnd);
}
