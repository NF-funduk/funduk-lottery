import { lottery } from '../supabase.js';
import { logout } from '../auth.js';
import { navigate } from '../router.js';

const STATUS_META = {
  active:    { label: 'Активна',    cls: 'hc-active' },
  drawing:   { label: 'Розыгрыш',   cls: 'hc-drawing' },
  drawn:     { label: 'Разыграна',  cls: 'hc-drawn' },
  cancelled: { label: 'Отменена',   cls: 'hc-cancelled' },
};

export async function renderHistory(root) {
  root.innerHTML = `
    <div class="container">
      <div class="header">
        <div class="header-left">
          <button class="btn ghost" id="back-btn">← На главную</button>
          <h1>История лотерей</h1>
        </div>
        <div class="header-right">
          <button class="btn ghost" id="logout-btn">Выйти</button>
        </div>
      </div>

      <div class="filter-tabs" id="filter-tabs">
        <button class="filter-tab active" data-filter="all">Все</button>
        <button class="filter-tab" data-filter="active">Активные</button>
        <button class="filter-tab" data-filter="drawn">Завершённые</button>
      </div>

      <div id="history-list" class="history-list">
        <div class="empty-state">Загрузка…</div>
      </div>

      <div class="signature">by funduk</div>
    </div>
  `;

  root.querySelector('#back-btn').addEventListener('click', () => navigate('/home'));
  root.querySelector('#logout-btn').addEventListener('click', () => {
    logout();
    navigate('/login');
  });

  const listEl = root.querySelector('#history-list');
  let allLotteries = [];
  let currentFilter = 'all';

  try {
    const { lotteries } = await lottery.all();
    allLotteries = lotteries || [];
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state" style="color:var(--danger)">Ошибка: ${escapeHtml(err.message)}</div>`;
    return;
  }

  function renderList() {
    let filtered = allLotteries;

    if (currentFilter === 'active') {
      filtered = allLotteries.filter((l) => l.status === 'active' || l.status === 'drawing');
    } else if (currentFilter === 'drawn') {
      filtered = allLotteries.filter((l) => l.status === 'drawn' || l.status === 'cancelled');
    }

    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="empty-state">Нет лотерей в этой категории</div>`;
      return;
    }

    listEl.innerHTML = filtered.map((l) => {
      const st = STATUS_META[l.status] || { label: l.status, cls: '' };
      const sold = Number(l.sold_tickets) || 0;
      const total = Number(l.total_tickets) || 1;
      const progress = Math.min(100, Math.round((sold / total) * 100));
      const prizes = Number(l.prizes_count) || 0;
      const winners = Number(l.winners_count) || 0;

      return `
        <div class="history-lottery-card" data-lottery-id="${l.id}">
          <div class="hlc-head">
            <div class="hlc-title">${escapeHtml(l.title)}</div>
            <span class="hc-status ${st.cls}">${st.label}</span>
          </div>
          ${l.description ? `<div class="hlc-desc">${escapeHtml(l.description)}</div>` : ''}
          <div class="hlc-stats">
            <div class="hlc-stat">
              <span class="hlc-label">Продано</span>
              <span class="hlc-value">${sold} / ${total}</span>
            </div>
            <div class="hlc-stat">
              <span class="hlc-label">Призовых мест</span>
              <span class="hlc-value">${prizes}</span>
            </div>
            <div class="hlc-stat">
              <span class="hlc-label">Победителей</span>
              <span class="hlc-value">${winners}</span>
            </div>
          </div>
          <div class="hlc-progress">
            <div class="hlc-progress-bar" style="width:${progress}%"></div>
          </div>
          <div class="hlc-meta">
            ${l.drawn_at 
              ? `Разыграна: ${formatDateTime(l.drawn_at)}`
              : (l.deadline ? `Дедлайн: ${formatDateTime(l.deadline)}` : `Создана: ${formatDateTime(l.created_at)}`)
            }
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('[data-lottery-id]').forEach((card) => {
      card.addEventListener('click', () => {
        navigate('/lottery/' + card.dataset.lotteryId);
      });
    });
  }

  root.querySelectorAll('.filter-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      root.querySelectorAll('.filter-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      renderList();
    });
  });

  renderList();
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}