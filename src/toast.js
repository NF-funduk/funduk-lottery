let toastEl = null;
let toastTimer = null;

export function showToast(message, type = 'info') {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.id = 'global-toast';
    document.body.appendChild(toastEl);
  }

  toastEl.textContent = message;
  toastEl.className = 'toast';

  if (type === 'success') toastEl.classList.add('toast-success');
  if (type === 'error') toastEl.classList.add('toast-error');
  if (type === 'info') toastEl.classList.add('toast-info');

  requestAnimationFrame(() => {
    toastEl.classList.add('show');
  });

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
  }, 3000);
}