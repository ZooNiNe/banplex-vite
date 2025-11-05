let tooltipElement;
let showTimeout;
let hideTimeout;

function createTooltip(text) {
    if (hideTimeout) clearTimeout(hideTimeout);
    
    if (tooltipElement) {
        tooltipElement.textContent = text;
        return;
    }

    tooltipElement = document.createElement('div');
    tooltipElement.className = 'custom-tooltip';
    tooltipElement.textContent = text;
    document.body.appendChild(tooltipElement);

    requestAnimationFrame(() => {
        tooltipElement.classList.add('visible');
    });
}

function positionTooltip(targetElement) {
    if (!tooltipElement || !targetElement) return;

    const targetRect = targetElement.getBoundingClientRect();
    const tooltipRect = tooltipElement.getBoundingClientRect();
    
    let top = targetRect.top - tooltipRect.height - 8;
    let left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);

    if (top < 8) {
        top = targetRect.bottom + 8;
    }
    if (left < 8) {
        left = 8;
    }
    if (left + tooltipRect.width > window.innerWidth) {
        left = window.innerWidth - tooltipRect.width - 8;
    }

    tooltipElement.style.top = `${top}px`;
    tooltipElement.style.left = `${left}px`;
}

export function showTooltip(targetElement) {
    const text = targetElement.dataset.tooltip;
    if (!text) return;

    if (showTimeout) clearTimeout(showTimeout);
    
    showTimeout = setTimeout(() => {
        createTooltip(text);
        positionTooltip(targetElement);
    }, 50);
}

export function hideTooltip(delay = 200) {
    if (showTimeout) clearTimeout(showTimeout);
    if (hideTimeout) clearTimeout(hideTimeout);

    hideTimeout = setTimeout(() => {
        if (tooltipElement) {
            tooltipElement.classList.remove('visible');
            tooltipElement.addEventListener('transitionend', () => {
                tooltipElement?.remove();
                tooltipElement = null;
            }, { once: true });
        }
    }, delay);
}
