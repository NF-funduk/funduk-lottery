let confirmEl = null;
let resolver = null;

function ensureModal() {
  if (confirmEl) return confirmEl;

  confirmEl = document.createElement('div');
  confirmEl.id = 'global-confirm-modal';
  confirmEl.className = 'modal hidden';
  confirmEl.innerHTML = `
    <div class="modal-content" style="max-width:460px">
      <h2 id="gcm-title">Подтверждение</h2>
      <p id="gcm-message" style="color: var(--text-dim); font-size: 14px; line-height: 1.5; margin-bottom: 20px;"></p>
      <div class="modal-actions">
        <button class="btn ghost" id="gcm-cancel">Отмена</button>
        <button class="btn primary" id="gcm-confirm">Подтвердить</button>
      </div>
    </div>
  `;
  document.body.appendChild(confirmEl);

  confirmEl.querySelector('#gcm-cancel').addEventListener('click', () => {
    closeConfirm(false);
  });

  confirmEl.querySelector('#gcm-confirm').addEventListener('click', () => {
    closeConfirm(true);
  });

  confirmEl.addEventListener('click', (e) => {
    if (e.target === confirmEl) closeConfirm(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && confirmEl && !confirmEl.classList.contains('hidden')) {
      closeConfirm(false);
    }
  });

  return confirmEl;
}

function closeConfirm(result) {
  if (!confirmEl) return;
  confirmEl.classList.add('hidden');
  if (resolver) {
    const r = resolver;
    resolver = null;
    r(result);
  }
}

export function showConfirm({
  title = 'Подтверждение',
  message = 'Вы уверены?',
  confirmText = 'Подтвердить',
  cancelText = 'Отмена',
  danger = false,
} = {}) {
  const el = ensureModal();

  el.querySelector('#gcm-title').textContent = title;
  el.querySelector('#gcm-message').innerHTML = message;

  const confirmBtn = el.querySelector('#gcm-confirm');
  confirmBtn.textContent = confirmText;
  confirmBtn.className = danger ? 'btn danger' : 'btn primary';

  el.querySelector('#gcm-cancel').textContent = cancelText;

  el.classList.remove('hidden');

  return new Promise((resolve) => {
    resolver = resolve;
  });
}