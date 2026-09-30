import { lottery, feedback, profile } from '../supabase.js';
import { getUser, saveSession, logout } from '../auth.js';
import { navigate } from '../router.js';
import { logoHtml } from '../logo.js';
import { showToast } from '../toast.js';

const STATUS_LABELS = {
  intern: 'Стажёр',
  helper: 'Помощник',
  moderator: 'Модератор',
  admin: 'Админ',
};

export async function renderHome(root) {
  document.title = 'HardEvo Lottery';

  let user = getUser();

  root.innerHTML = `
    <div class="container">
      <div class="header">
        <div class="header-left">
          ${logoHtml('· Главная')}
        </div>
        <div class="header-right">
          <button class="btn ghost" id="feedback-btn" title="Обратная связь">💬 Обратная связь</button>
          ${user?.status === 'admin' ? `<button class="btn ghost" id="nav-admin">Админка</button>` : ''}
          <div class="user-panel" id="profile-btn">
            <div class="user-panel-info">
              <div class="up-name">${escapeHtml(user?.username || '?')}</div>
              <span class="role-badge" data-role="${user?.status}">${STATUS_LABELS[user?.status] || user?.status}</span>
            </div>
            <div class="up-balance-wrap">
              <div class="up-balance-label">Баланс</div>
              <div class="up-balance" id="up-balance">${user?.balance ?? 0}</div>
            </div>
            <button class="icon-btn-logout" id="logout-btn" title="Выйти">
              <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </button>
          </div>
        </div>
      </div>

      <div class="filter-tabs-center">
        <div class="filter-tabs" id="filter-tabs">
          <button class="filter-tab active" data-filter="active">Активные</button>
          <button class="filter-tab" data-filter="finished">Завершённые</button>
        </div>
      </div>

      <div id="lotteries-grid" class="lotteries-grid">
        <div class="empty-state">Загрузка…</div>
      </div>

      <div class="signature">by funduk</div>
    </div>

    <!-- Модалка: обратная связь -->
    <div class="modal hidden" id="feedback-modal">
      <div class="modal-content">
        <h2>Обратная связь</h2>
        <p style="color: var(--text-dim); margin-bottom: 14px; font-size: 13px;">
          Напиши что угодно: идея, баг, предложение. Админ увидит сообщение в Discord.
        </p>
        <label class="field-label">Сообщение</label>
        <textarea id="feedback-text" rows="5" placeholder="Начни писать..."></textarea>
        <div class="login-error" id="feedback-error"></div>
        <div class="modal-actions">
          <button class="btn ghost" id="feedback-cancel">Отмена</button>
          <button class="btn primary" id="feedback-submit">Отправить</button>
        </div>
      </div>
    </div>
  `;

  root.querySelector('#profile-btn').addEventListener('click', (e) => {
    if (e.target.closest('#logout-btn')) return;
    navigate('/profile');
  });
  root.querySelector('#logout-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    logout();
    navigate('/login');
  });
  const adminBtn = root.querySelector('#nav-admin');
  if (adminBtn) adminBtn.addEventListener('click', () => navigate('/admin'));

  refreshUser();

  async function refreshUser() {
    try {
      const res = await profile.me();
      if (!res?.user) return;

      const fresh = res.user;
      const old = getUser();

      const changed =
        old?.status !== fresh.status ||
        old?.balance !== fresh.balance ||
        old?.username !== fresh.username;

      if (changed) {
        saveSession(sessionStorage.getItem('funduk_token'), {
          ...old,
          ...fresh,
        });
        user = { ...old, ...fresh };

        const nameEl = root.querySelector('.up-name');
        const badgeEl = root.querySelector('.role-badge');
        const balEl = root.querySelector('#up-balance');
        const adminBtnEl = root.querySelector('#nav-admin');
        const headerRight = root.querySelector('.header-right');

        if (nameEl) nameEl.textContent = fresh.username;
        if (badgeEl) {
          badgeEl.textContent = STATUS_LABELS[fresh.status] || fresh.status;
          badgeEl.setAttribute('data-role', fresh.status);
        }
        if (balEl) balEl.textContent = fresh.balance;

        if (fresh.status === 'admin' && !adminBtnEl) {
          const btn = document.createElement('button');
          btn.className = 'btn ghost';
          btn.id = 'nav-admin';
          btn.textContent = 'Админка';
          btn.addEventListener('click', () => navigate('/admin'));
          headerRight.insertBefore(btn, root.querySelector('#profile-btn'));
        } else if (fresh.status !== 'admin' && adminBtnEl) {
          adminBtnEl.remove();
        }
      }
    } catch (e) {
      console.warn('Не удалось обновить данные юзера:', e.message);
    }
  }

  const grid = root.querySelector('#lotteries-grid');
  let allLotteries = [];
  let currentFilter = 'active';

  async function loadLotteries() {
    try {
      const { lotteries } = await lottery.all();
      allLotteries = lotteries || [];
      renderGrid();
    } catch (err) {
      grid.innerHTML = `<div class="empty-state" style="color:var(--danger)">Ошибка: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderGrid() {
    let filtered;
    if (currentFilter === 'active') {
      filtered = allLotteries.filter((l) => l.status === 'active' || l.status === 'drawing');
    } else {
      filtered = allLotteries.filter((l) => l.status === 'drawn' || l.status === 'cancelled');
    }

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          ${currentFilter === 'active' ? 'Пока нет активных лотерей.' : 'Завершённых лотерей пока нет.'}
          <br><span style="font-size:13px;opacity:0.7;">Заходи позже 👀</span>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map(renderLotteryCard).join('');
    grid.querySelectorAll('[data-lottery-id]').forEach((card) => {
      card.addEventListener('click', () => navigate('/lottery/' + card.dataset.lotteryId));
    });
  }

  root.querySelectorAll('.filter-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      root.querySelectorAll('.filter-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      renderGrid();
    });
  });

  const modalFeedback = root.querySelector('#feedback-modal');
  const feedbackBtn = root.querySelector('#feedback-btn');
  const feedbackText = root.querySelector('#feedback-text');
  const feedbackErr = root.querySelector('#feedback-error');
  const feedbackSubmit = root.querySelector('#feedback-submit');

  feedbackBtn.addEventListener('click', () => {
    feedbackText.value = '';
    feedbackErr.textContent = '';
    feedbackSubmit.disabled = false;
    feedbackSubmit.textContent = 'Отправить';
    modalFeedback.classList.remove('hidden');
    setTimeout(() => feedbackText.focus(), 50);
  });

  root.querySelector('#feedback-cancel').addEventListener('click', () => {
    modalFeedback.classList.add('hidden');
  });

  feedbackSubmit.addEventListener('click', async () => {
    const text = feedbackText.value.trim();
    feedbackErr.textContent = '';

    if (text.length < 3) { feedbackErr.textContent = 'Минимум 3 символа'; return; }
    if (text.length > 2000) { feedbackErr.textContent = 'Максимум 2000 символов'; return; }

    feedbackSubmit.disabled = true;
    feedbackSubmit.textContent = 'Отправляем…';

    try {
      await feedback.send(text);
      modalFeedback.classList.add('hidden');
      showToast('✅ Спасибо! Отзыв отправлен.');
    } catch (err) {
      const map = {
        text_too_short: 'Сообщение слишком короткое',
        text_too_long: 'Сообщение слишком длинное',
        webhook_not_configured: 'Вебхук не настроен',
        discord_error: 'Не удалось отправить в Discord',
      };
      feedbackErr.textContent = map[err.message] || 'Ошибка: ' + err.message;
    } finally {
      feedbackSubmit.disabled = false;
      feedbackSubmit.textContent = 'Отправить';
    }
  });

  await loadLotteries();
}

function renderLotteryCard(l) {
  const sold = Number(l.sold_tickets) || 0;
  const total = Number(l.total_tickets) || 1;
  const progress = Math.min(100, Math.round((sold / total) * 100));
  const prizes = Number(l.prizes_count) || 0;
  const price = Number(l.ticket_price) || 0;
  const isFinished = l.status === 'drawn' || l.status === 'cancelled';

  const logoInner = l.logo_url
    ? `<img src="${escapeAttr(l.logo_url)}" alt="" class="lottery-logo-img" onerror="this.style.display='none';this.parentElement.classList.add('placeholder');this.parentElement.textContent='🎁';" />`
    : '🎁';

  const timer = !isFinished ? formatDeadline(l.deadline) : null;

  const isSoldOut = sold >= total;
  let statusBadge = '';
  if (isFinished) {
    statusBadge = l.status === 'drawn'
      ? `<span class="lottery-badge drawn">Разыграна</span>`
      : `<span class="lottery-badge cancelled">Отменена</span>`;
  } else if (isSoldOut) {
    statusBadge = `<span class="lottery-badge sold-out">Распродано</span>`;
  }

  return `
    <div class="lottery-card" data-lottery-id="${l.id}">
      <div class="lottery-card-head">
        <div class="lottery-logo">${logoInner}</div>
        <div class="lottery-head-text">
          <div class="lottery-title">${escapeHtml(l.title)}</div>
          ${l.description ? `<div class="lottery-desc">${escapeHtml(l.description)}</div>` : ''}
        </div>
      </div>

      ${statusBadge}

      <div class="lottery-stats">
        <div class="stat-row">
          <span class="stat-label">Цена билета</span>
          <span class="stat-value">${price}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Призовых мест</span>
          <span class="stat-value">${prizes}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Продано</span>
          <span class="stat-value">${sold} / ${total}</span>
        </div>
      </div>

      <div class="lottery-progress">
        <div class="lottery-progress-bar" style="width:${progress}%"></div>
      </div>

      ${timer ? `<div class="lottery-timer">⏱ ${timer}</div>` : ''}

      <button class="btn primary lottery-open-btn">${isFinished ? 'Результаты' : 'Открыть'}</button>
    </div>
  `;
}

function formatDeadline(deadlineIso) {
  if (!deadlineIso) return null;
  const d = new Date(deadlineIso);
  const now = new Date();
  const diff = d - now;
  if (diff <= 0) return 'Дедлайн прошёл';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `до конца ${days}д ${hours}ч`;
  if (hours > 0) return `до конца ${hours}ч ${mins}м`;
  return `до конца ${mins}м`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function escapeAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;');
}