let _notifTimer = null;

function _createAvatarHTML(userName = '', avatarUrl = '') {
  const initial = (userName || '').trim().charAt(0).toUpperCase() || 'U';
  if (avatarUrl) {
    return `<img class="notif-avatar" src="${avatarUrl}" alt="${userName}" onerror="this.style.display='none'">` +
           `<div class="notif-avatar-fallback" aria-hidden="true">${initial}</div>`;
  }
  return `<div class="notif-avatar-fallback">${initial}</div>`;
}

export function showTopNotification({ title = 'Notifikasi', message = '', avatarUrl = '', userName = '' , timeoutMs = 5000 } = {}) {
  try {
    let bar = document.getElementById('top-notification-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'top-notification-bar';
      bar.className = 'top-notification-bar';
      document.body.appendChild(bar);
    }

    const avatarHTML = _createAvatarHTML(userName, avatarUrl);

    bar.innerHTML = `
      <div class="top-notification-inner">
        <div class="notif-avatar-wrap">${avatarHTML}</div>
        <div class="notif-text">
          <div class="notif-title">${title}</div>
          <div class="notif-desc">${message}</div>
        </div>
        <button class="notif-close" aria-label="Tutup">&times;</button>
      </div>
    `;

    const close = () => {
      bar.classList.remove('show');
      bar.addEventListener('transitionend', () => {
        if (bar && bar.parentNode) bar.remove();
      }, { once: true });
      setTimeout(() => { if (bar && bar.parentNode) bar.remove(); }, 300);
    };

    bar.querySelector('.notif-close')?.addEventListener('click', close, { once: true });

    // Force reflow then show
    requestAnimationFrame(() => bar.classList.add('show'));

    if (_notifTimer) clearTimeout(_notifTimer);
    _notifTimer = setTimeout(() => close(), Math.max(2000, timeoutMs || 5000));
  } catch (e) {
    console.error('[NotificationBar] Failed to show notification:', e);
  }
}

export default { showTopNotification };

