let currentFeedbackModal = null;
let toastTimeout = null;

// Helper function to create Lucide SVG Icon
function createIcon(iconName, size = 20, classes = '') {
    const icons = {
        syncing: `<div class="spinner ${classes}" style="width: ${size}px; height: ${size}px; border-width: 2px; border-top-color: white; border-color: rgba(255,255,255,0.3);"></div>`, // Spinner is custom
        check_circle: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle-2 ${classes}" style="color: var(--success);"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
        error: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-circle ${classes}" style="color: var(--danger);"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`, // Using AlertCircle
        info: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info ${classes}" style="color: var(--primary);"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
        close: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x ${classes}"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
        notifications: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bell ${classes}"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`, // Using Bell
    };
    return icons[iconName] || '';
}


function toast(type, message, duration = 4000, options = {}) {
    if (currentFeedbackModal) {
        const isCurrentSyncingDialog = currentFeedbackModal.element.classList.contains('feedback-dialog-container') &&
                                      currentFeedbackModal.element.querySelector('.spinner');
        const isCurrentSyncingSnackbar = currentFeedbackModal.element.classList.contains('snackbar-container') &&
                                         type === 'syncing';

        if (!(isCurrentSyncingDialog && type === 'syncing') && !(isCurrentSyncingSnackbar && type === 'syncing')) {
             currentFeedbackModal.close().catch(() => {});
        } else if (type === 'syncing' && isCurrentSyncingSnackbar) {
             const messageEl = currentFeedbackModal.element.querySelector('.snackbar-message');
             if (messageEl) messageEl.textContent = message;
             return currentFeedbackModal;
        } else if (type === 'syncing' && isCurrentSyncingDialog) {
            const messageEl = currentFeedbackModal.element.querySelector('.feedback-dialog-message');
             if (messageEl) messageEl.textContent = message;
            return currentFeedbackModal;
        }
    }


    const isSnackbar = (type === 'info' || type === 'success' || type === 'error' || type === 'syncing' || !!options.actionText || !!options.forceSnackbar) && !options.forceDialog;

    const modalBg = document.createElement('div');
    modalBg.className = isSnackbar ? 'snackbar-container' : 'feedback-dialog-container';

    const modalContent = document.createElement('div');
    modalContent.className = isSnackbar ? 'snackbar-content' : 'feedback-dialog-content';

    let promiseResolver;
    let timeoutId = null;

    const close = () => {
        return new Promise(resolve => {
            clearTimeout(timeoutId);
            modalBg.classList.remove('show');

            const onClosed = () => {
                modalBg.remove();
                if (currentFeedbackModal && currentFeedbackModal.element === modalBg) {
                    currentFeedbackModal = null;
                }
                if (promiseResolver) {
                    promiseResolver({ dismissed: true });
                    promiseResolver = null;
                }
                resolve();
            };

            modalContent.addEventListener('transitionend', onClosed, { once: true });
            setTimeout(() => {
                if (modalBg.parentNode) {
                     onClosed();
                }
            }, 350);
        });
    };


    if (isSnackbar) {
        const iconContainer = document.createElement('div');
        iconContainer.className = 'snackbar-icon';
        if (type === 'syncing') {
            // Remove spinner/progress icon for syncing snackbar
            iconContainer.style.display = 'none';
        } else {
            const iconName = (type === 'success') ? 'check_circle' : (type === 'error') ? 'error' : (type === 'info') ? 'info' : 'notifications';
            iconContainer.innerHTML = createIcon(iconName);
        }
        modalContent.appendChild(iconContainer);

        const textEl = document.createElement('p');
        textEl.className = 'snackbar-message';
        textEl.innerHTML = message;
        modalContent.appendChild(textEl);

        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'snackbar-actions';

        if (options.actionText && options.onAction) {
            const actionButton = document.createElement('button');
            actionButton.className = 'snackbar-action-btn';
            actionButton.textContent = options.actionText;
            actionButton.addEventListener('click', (e) => {
                e.stopPropagation();
                options.onAction();
                close();
            });
            actionsContainer.appendChild(actionButton);
        }

        const closeButton = document.createElement('button');
        closeButton.className = 'snackbar-close';
        closeButton.innerHTML = createIcon('close', 18); // Use createIcon here
        closeButton.addEventListener('click', (e) => { e.stopPropagation(); close(); });
        actionsContainer.appendChild(closeButton);
        modalContent.appendChild(actionsContainer);


        if (duration > 0 && type !== 'syncing') {
            timeoutId = setTimeout(close, duration);
        }

    } else {
        const iconContainer = document.createElement('div');
        iconContainer.className = 'feedback-dialog-icon';
        const textEl = document.createElement('p');
        textEl.className = 'feedback-dialog-message';
        textEl.innerHTML = message;

        if (type === 'syncing') {
            iconContainer.innerHTML = '<div class="spinner"></div>'; // Spinner stays custom CSS
        } else if (type === 'success') {
            iconContainer.innerHTML = `<svg viewBox="0 0 100 100"><circle class="success-animation-circle" cx="50" cy="50" r="42" stroke="#22c55e" stroke-width="8" fill="transparent" /><polyline class="success-animation-checkmark" points="30,55 45,70 70,40" stroke="#22c55e" stroke-width="8" fill="transparent" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
        } else if (type === 'error') {
            iconContainer.innerHTML = `<svg viewBox="0 0 100 100"><circle class="error-animation-circle" cx="50" cy="50" r="42" stroke="#ef4444" stroke-width="8" fill="transparent" /><line class="error-animation-cross-1" x1="35" y1="35" x2="65" y2="65" stroke="#ef4444" stroke-width="8" stroke-linecap="round" /><line class="error-animation-cross-2" x1="65" y1="35" x2="35" y2="65" stroke="#ef4444" stroke-width="8" stroke-linecap="round" /></svg>`;
        } else {
            iconContainer.innerHTML = createIcon(type === 'info' ? 'info' : 'notifications', 72); // Use createIcon here, larger size
        }

        modalContent.appendChild(iconContainer);
        modalContent.appendChild(textEl);

        if (type !== 'syncing' && duration > 0) {
            timeoutId = setTimeout(close, duration);
        }
    }

    modalBg.appendChild(modalContent);
    document.body.appendChild(modalBg);
    void modalBg.offsetWidth;
    modalBg.classList.add('show');


    if (!isSnackbar) {
        modalBg.addEventListener('click', (e) => {
            if (e.target === modalBg) close();
        });
    }

    currentFeedbackModal = { element: modalBg, close };

     if (duration === 0 || type === 'syncing') {
        return currentFeedbackModal;
    } else {
        return new Promise(resolve => {
            promiseResolver = resolve;
             let resolved = false;
             const checkResolve = () => {
                 if (!resolved) {
                     resolve({ dismissed: true });
                     resolved = true;
                 }
             };
             modalContent.addEventListener('transitionend', (e) => {
                 if (e.propertyName === 'transform' && !modalBg.classList.contains('show')) {
                     checkResolve();
                 }
             }, { once: true });
             setTimeout(checkResolve, duration + 350);
        });
    }

}

function hideToast() {
  if (currentFeedbackModal) {
    currentFeedbackModal.close().catch(() => {});
  }
}

function _initToastSwipeHandler() {
    let startY, currentY, isDragging = false;
    document.body.addEventListener('touchstart', (e) => {
        const snackbar = e.target.closest('.snackbar-content');
        if (snackbar && currentFeedbackModal && currentFeedbackModal.element && currentFeedbackModal.element.contains(snackbar)) { // Check element exists
            startY = e.touches[0].clientY;
            isDragging = true;
            snackbar.style.transition = 'none';
        }
    }, { passive: true });

    document.body.addEventListener('touchmove', (e) => {
        if (!isDragging || !currentFeedbackModal || !currentFeedbackModal.element) return; // Add checks
        currentY = e.touches[0].clientY;
        const diff = currentY - startY;
        if (diff > 0) {
            const snackbar = currentFeedbackModal.element.querySelector('.snackbar-content');
            if (snackbar) { // Check snackbar exists
                snackbar.style.transform = `translateY(${diff}px)`;
            }
        }
    }, { passive: true });

    document.body.addEventListener('touchend', () => {
        if (!isDragging || !currentFeedbackModal || !currentFeedbackModal.element) { // Add checks
            isDragging = false; // Ensure dragging flag is reset
            return;
        }
        isDragging = false;
        const snackbar = currentFeedbackModal.element.querySelector('.snackbar-content');
        if (!snackbar) return; // Check snackbar exists

        const diff = currentY - startY;
        const threshold = snackbar.offsetHeight * 0.4;

        if (diff > threshold) {
            hideToast();
        } else {
            snackbar.style.transition = 'transform 0.3s cubic-bezier(0.19, 1, 0.22, 1)';
            snackbar.style.transform = 'translateY(0)';
            snackbar.addEventListener('transitionend', () => {
                // Check if snackbar still exists before resetting transition
                if (snackbar) {
                    snackbar.style.transition = '';
                }
            }, { once: true });
        }
        startY = 0;
        currentY = 0;
    });

}


export { toast, hideToast, _initToastSwipeHandler };
