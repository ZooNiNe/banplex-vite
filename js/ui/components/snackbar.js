// js/ui/components/snackbar.js

function createSnackbar(message, duration = 3000) {
  const snackbarId = `snackbar-${Date.now()}`;
  const snackbarHTML = `
    <div id="${snackbarId}" class="snackbar show">
      ${message}
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', snackbarHTML);

  const snackbarEl = document.getElementById(snackbarId);

  setTimeout(() => {
    snackbarEl.classList.remove('show');
    snackbarEl.addEventListener('transitionend', () => {
      if (snackbarEl.parentNode) {
        snackbarEl.remove();
      }
    });
  }, duration);
}

export { createSnackbar };
