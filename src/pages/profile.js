import { profile } from '../supabase.js';
import { logout } from '../auth.js';
import { navigate } from '../router.js';
import { logoHtml } from '../logo.js';

const STATUS_LABELS = {
  intern: 'Стажёр',
  helper: 'Помощник',
  moderator: 'Модератор',
  admin: 'Админ',
};

export async function renderProfile(root) {
  document.title = 'HardEvo Lottery · Профиль';
  root.innerHTML = `
    <div class="container">
      <div class="header">
        <div class="header-left">
          ${logoHtml('· Профиль')}
        </div>
        <div class="header-right">
          <button class="btn ghost" id="back-btn">← На главную</button>
        </div>
      </div>

      <div id="profile-body">
        <div class="empty-state">Загрузка…</div>
      </div>

      <div class="signature">by funduk</div>
    </div>

    <div class="modal hidden" id="modal-password">
      <div class="modal-content">
        <h2>Сменить пароль</h2>
        <label class="field-label">Текущий пароль</label>
        <input type="password" id="old-password" autocomplete="current-password" />
        <label class="field-label">Новый пароль</label>
        <input type="password" id="new-password" autocomplete="new-password" />
        <label class="field-label">Новый пароль ещё раз</label>
        <input type="password" id="new-password-2" autocomplete="new-password" />
        <div class="login-error" id="password-error"></div>
        <div class="modal-actions">
          <button class="btn ghost" id="cancel-password">Отмена</button>
          <button class="btn primary" id="confirm-password">Сменить</button>
        </div>
      </div>
    </div>
  `;

  root.querySelector('#back-btn').addEventListener('click', () => navigate('/home'));

  const body = root.querySelector('#profile-body');

  let meData, history;
  try {
    const [meRes, histRes] = await Promise.all([
      profile.me(),
      profile.lotteryHistory(),
    ]);
    meData = meRes.user;
    history = histRes.history || [];
  } catch (err) {
    body.innerHTML = `<div class="empty-state" style="color:var(--danger)">Ошибка: ${err.message}</div>`;
    return;
  }

  body.innerHTML = `
    <div class="profile-compact">
      <div class="pc-left">
        <div class="pc-username">${escapeHtml(meData.username)}</div>
        <div class="pc-meta">
          <span class="role-badge" data-role="${meData.status}">${STATUS_LABELS[meData.status] || meData.status}</span>
          <span class="pc-meta-text">Создан: ${formatDate(meData.created_at)}</span>
        </div>
      </div>
      <div class="pc-right">
        <div class="pc-balance">
          <span class="pc-balance-label">Баланс:</span>
          <span class="pc-balance-value">${meData.balance}</span>
        </div>
        <div class="pc-actions">
          <button class="btn ghost" id="change-password-btn">Сменить пароль</button>
        </div>
      </div>
    </div>

    <h2 class="profile-section-title">🎟 Мои лотереи</h2>
    <div class="history-list-wrap">
      ${history.length === 0
        ? '<div class="empty-state">Ты ещё не участвовал в лотереях</div>'
        : history.map(renderHistoryCard).join('')
      }
    </div>
  `;

  body.querySelectorAll('[data-lottery-id]').forEach((card) => {
    card.addEventListener('click', () => navigate('/lottery/' + card.dataset.lotteryId));
  });

  const modalPwd = root.querySelector('#modal-password');

  root.querySelector('#change-password-btn').addEventListener('click', () => {
    root.querySelector('#old-password').value = '';
    root.querySelector('#new-password').value = '';
    root.querySelector('#new-password-2').value = '';
    root.querySelector('#password-error').textContent = '';
    modalPwd.classList.remove('hidden');
  });

  root.querySelector('#cancel-password').addEventListener('click', () => {
    modalPwd.classList.add('hidden');
  });

  root.querySelector('#confirm-password').addEventListener('click', async () => {
    const oldPwd = root.querySelector('#old-password').value;
    const newPwd = root.querySelector('#new-password').value;
    const newPwd2 = root.querySelector('#new-password-2').value;
    const errEl = root.querySelector('#password-error');
    errEl.textContent = '';

    if (!oldPwd || !newPwd) { errEl.textContent = 'Заполните все поля'; return; }
    if (newPwd.length < 6) { errEl.textContent = 'Минимум 6 символов'; return; }
    if (newPwd !== newPwd2) { errEl.textContent = 'Пароли не совпадают'; return; }

    const btn = root.querySelector('#confirm-password');
    btn.disabled = true;
    btn.textContent = 'Меняем…';

    try {
      await profile.changePassword(oldPwd, newPwd);
      modalPwd.classList.add('hidden');
      alert('✅ Пароль изменён!');
    } catch (err) {
      const map = {
        wrong_password: 'Неверный текущий пароль',
        password_too_short: 'Новый пароль слишком короткий',
      };
      errEl.textContent = map[err.message] || 'Ошибка: ' + err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Сменить';
    }
  });
}

function renderHistoryCard(h) {
  const isWon = h.won_place != null;
  const statusMap = {
    active: { label: 'Активна', cls: 'active' },
    drawing: { label: 'Розыгрыш', cls: 'drawing' },
    drawn: { label: 'Разыграна', cls: 'drawn' },
    cancelled: { label: 'Отменена', cls: 'cancelled' },
  };
  const st = statusMap[h.lottery_status] || { label: h.lottery_status, cls: '' };

  return `
    <div class="history-card-v2 ${isWon ? 'won' : ''}" data-lottery-id="${h.lottery_id}">
      <div class="hc-head">
        <div class="hc-title">${escapeHtml(h.lottery_title)}</div>
        <span class="hc-status hc-${st.cls}">${st.label}</span>
      </div>
      <div class="hc-body">
        <div class="hc-row">
          <span>Моих билетов</span><b>${h.my_tickets}</b>
        </div>
        <div class="hc-row">
          <span>Первая покупка</span><b>${formatDate(h.first_purchase_at)}</b>
        </div>
        ${isWon ? `
          <div class="hc-win">
            🏆 Место ${h.won_place} · ${escapeHtml(h.won_prize_title || 'Приз')}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
}