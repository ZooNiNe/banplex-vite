import { fmtIDR, parseFormattedNumber } from "./formatters.js";
import { toast } from "../ui/components/toast.js";
import { hideMobileDetailPage } from "../ui/components/modal.js";
import { appState } from "../state/appState.js";

export function $(s, context = document) {
    return context.querySelector(s);
}

export function $$(s, context = document) {
    return Array.from(context.querySelectorAll(s));
}

export function addItemToListWithAnimation(containerSelector, itemHtml, position = 'prepend') {
    const container = $(containerSelector);
    if (!container) return;

    const emptyState = container.querySelector('.empty-state');
    if (emptyState) {
        container.innerHTML = '';
    }

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = itemHtml;
    const newItem = tempDiv.firstElementChild;

    if (!newItem) return;

    newItem.classList.add('item-entering');

    if (position === 'prepend') {
        container.prepend(newItem);
    } else {
        container.append(newItem);
    }
}

export async function removeItemFromListWithAnimation(itemId) {
    return new Promise((resolve, reject) => {
        const itemElement = document.querySelector(`[data-id="${itemId}"], [data-item-id="${itemId}"]`);
        if (!itemElement) {

            resolve();
            return;
        }

        const animationTimeout = setTimeout(() => {
            console.warn(`[removeItemFromListWithAnimation] Animationend timeout for ${itemId}. Removing element forcefully.`);
            if (itemElement.parentNode) {
                itemElement.remove();
            }
            resolve();
        }, 500);

        const onAnimationEnd = () => {
            clearTimeout(animationTimeout);
            if (itemElement.parentNode) {
                itemElement.remove();
            }
            resolve();
        };

        itemElement.addEventListener('animationend', onAnimationEnd, { once: true });
        itemElement.classList.add('item-exiting');
    });
}

export function updateItemInListWithAnimation(itemId, newInnerHtml) {
    const itemElement = $(`[data-id="${itemId}"], [data-item-id="${itemId}"]`);
    if (itemElement) {
        const contentWrapper = itemElement.querySelector('.wa-card-v2, .dense-list-item, .jurnal-card');
        if (contentWrapper) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = newInnerHtml.trim();
            const newContentElement = tempDiv.querySelector('.wa-card-v2, .dense-list-item, .jurnal-card');

            if (newContentElement) {
                contentWrapper.innerHTML = newContentElement.innerHTML;
                contentWrapper.classList.add('item-updated-flash');
                contentWrapper.addEventListener('animationend', () => {
                    contentWrapper.classList.remove('item-updated-flash');
                }, { once: true });
                try {
                    let normalizedId = String(itemId);
                    if (normalizedId.startsWith('expense-')) normalizedId = normalizedId.slice(8);
                    if (normalizedId.startsWith('trash-')) normalizedId = normalizedId.slice(6);

                    if (appState._recentlyEditedIds && appState._recentlyEditedIds.has(normalizedId)) {
                        toast('success', 'Item diperbarui', 1500);
                        appState._recentlyEditedIds.delete(normalizedId);
                    }
                } catch (_) {}
            } else {
                 console.warn(`[updateItemInList] Could not find correct inner content element in newInnerHtml for ${itemId}`);
            }
        } else {
            console.warn(`[updateItemInList] Could not find content wrapper inside element with ID ${itemId}`);
        }
    } else {

    }
}


export function animateNumber(element, to) {
      if (!element || to == null || isNaN(Number(to))) return;
      const currentText = element.textContent || '0';
      let from = parseFormattedNumber(currentText);
      if (from === to && !element.dataset.animated) {
          from = 0;
      }
      if (from === to) return;
      const duration = 600;
      const startTime = performance.now();
      element.dataset.animated = '1';

      function step(now) {
          const elapsed = now - startTime;
          if (elapsed >= duration) {
              element.textContent = fmtIDR(to);
              return;
          }
          const progress = elapsed / duration;
          const current = Math.round(from + (to - from) * progress);
          element.textContent = fmtIDR(current);
          requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
  }

export async function transitionContent(container, newHtml) {
  if (!container) return;

  container.innerHTML = newHtml;
  container.style.opacity = '0';

  requestAnimationFrame(() => {
      container.style.transition = 'opacity 0.25s ease-in';
      container.style.opacity = '1';

      const itemsToAnimate = container.querySelectorAll('.card, .wa-card-v2-wrapper, .dense-list-item, .jurnal-card, .log-item-card, .dashboard-balance-grid, .quick-actions-section');
      itemsToAnimate.forEach((item, index) => {
          item.classList.add('card-item-enter');
          item.style.animationDelay = `${index * 40}ms`;
      });

      container.addEventListener('transitionend', () => {
           container.style.transition = '';
      }, { once: true });
  });
}

export async function transitionFromSkeleton(container, newHtml) {
    if (!container) return;

    const skeleton = container.querySelector('.skeleton-wrapper, .skeleton-item');

    if (skeleton) {
        skeleton.classList.add('content-fade-out');
        await new Promise(resolve => setTimeout(resolve, 150));
    }

    container.innerHTML = newHtml;
    container.style.opacity = '0';

    requestAnimationFrame(() => {
        container.style.transition = 'opacity 0.25s ease-in';
        container.style.opacity = '1';

        const itemsToAnimate = container.querySelectorAll('.card, .wa-card-v2-wrapper, .dense-list-item, .jurnal-card, .log-item-card, .dashboard-balance-grid, .quick-actions-section');
        itemsToAnimate.forEach((item, index) => {
            item.classList.add('card-item-enter');
            item.style.animationDelay = `${index * 40}ms`;
        });

        container.addEventListener('transitionend', () => {
             container.style.transition = '';
        }, { once: true });
    });
}

export async function animateDetailPaneDeletion(detailPaneEl) {
    return new Promise(resolve => {
        if (!detailPaneEl) {
            resolve();
            return;
        }

        const contentArea = detailPaneEl.querySelector('.mobile-detail-content');
        if (!contentArea) {
            hideMobileDetailPage();
            resolve();
            return;
        }

        contentArea.classList.add('detail-content-deleted');

        setTimeout(() => {
            hideMobileDetailPage();

            setTimeout(() => {
                contentArea.classList.remove('detail-content-deleted');
                resolve();
            }, 350);

        }, 400);
    });
}

export async function animateTabSwitch(contentContainer, renderNewContentFunc, direction = 'forward') {
    if (!contentContainer) return;
    const exitClass = direction === 'forward' ? 'sub-page-exit-to-left' : 'sub-page-exit-to-right';
    const enterClass = direction === 'forward' ? 'sub-page-enter-from-right' : 'sub-page-enter-from-left';
    contentContainer.classList.add(exitClass);
    contentContainer.addEventListener('animationend', async function onExitAnimationEnd() {
        contentContainer.removeEventListener('animationend', onExitAnimationEnd);
        contentContainer.classList.remove(exitClass);
        await renderNewContentFunc();
        contentContainer.classList.add(enterClass);
        contentContainer.addEventListener('animationend', function onEnterAnimationEnd() {
            contentContainer.removeEventListener('animationend', onEnterAnimationEnd);
            contentContainer.classList.remove(enterClass);
        }, { once: true });
    }, { once: true });
}

export async function onPageExit() {
    return new Promise((resolve) => {
        const container = $('.page-container');
        if (!container) {
            resolve();
            return;
        }
        container.classList.add('page-exit');
        const handler = () => {
            container.removeEventListener('animationend', handler);
            resolve();
        };
        container.addEventListener('animationend', handler);
    });
}

export function onPageEnter() {
    const container = $('.page-container');
    if (container) {
        container.classList.add('page-enter');
        const handler = () => {
            container.removeEventListener('animationend', handler);
        };
        container.addEventListener('animationend', handler);
    }
}

export async function onExitAnimationEnd() {
    const container = $('.page-container');
    if (container) {
        container.classList.remove('page-exit');
    }
}

export function onEnterAnimationEnd() {
    const container = $('.page-container');
    if (container) {
        container.classList.remove('page-enter');
    }
}
