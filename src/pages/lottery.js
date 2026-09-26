import { lottery } from '../supabase.js';
import { getUser, saveSession } from '../auth.js';
import { navigate } from '../router.js';

export async function renderLottery(root, lotteryId) {
  document.title = 'HardEvo Lottery · Лотерея';
  const me = getUser();

  root.innerHTML = `
    <div class="container">
      <div class="header">
        <div class="header-left">
          <button class="btn ghost" id="back-btn">← Назад</button>
          <h1 id="lottery-title">Загрузка…</h1>
        </div>
        <div class="header-right">
          <div class="summary-card" style="padding:10px 14px">
            <div class="label">${me?.username || '?'}</div>
            <div class="value" style="font-size:16px" id="my-balance">${me?.balance ?? 0}</div>
          </div>
        </div>
      </div>

      <div id="lottery-body" class="lottery-page">
        <div class="empty-state">Загрузка…</div>
      </div>

      <div class="signature">by funduk</div>
    </div>
  `;

  root.querySelector('#back-btn').addEventListener('click', () => navigate('/home'));

  const body = root.querySelector('#lottery-body');
  const titleEl = root.querySelector('#lottery-title');
  const balanceEl = root.querySelector('#my-balance');

  let details, ticketsData, freeCount;

  try {
    const [dRes, tRes, fRes] = await Promise.all([
      lottery.details(lotteryId),
      lottery.tickets(lotteryId),
      lottery.myFreeTickets(lotteryId),
    ]);
    details = dRes;
    ticketsData = tRes.tickets;
    freeCount = fRes.count;
  } catch (err) {
    body.innerHTML = `<div class="empty-state" style="color:var(--danger)">Ошибка: ${err.message}</div>`;
    return;
  }

  const l = details.lottery;
  const prizes = details.prizes || [];

  titleEl.textContent = l.title;
  document.title = `HardEvo Lottery · ${l.title}`;

  if (l.status === 'drawn') {
    await renderWinners(body, lotteryId, l, prizes);
    return;
  }

  if (l.status === 'cancelled') {
    body.innerHTML = `<div class="empty-state">Лотерея отменена.</div>`;
    return;
  }

  const sold = ticketsData.filter((t) => t.user_id).length;
  const total = ticketsData.length;
  const price = Number(l.ticket_price) || 0;
  const maxPerUser = Number(l.max_tickets_per_user) || 0;
  const myTickets = ticketsData.filter((t) => t.user_id === me.id);
  const myCount = myTickets.length;
  const remaining = Math.max(0, maxPerUser - myCount);

  body.innerHTML = `
    <div class="lottery-info">
      ${l.logo_url ? `<img src="${escapeAttr(l.logo_url)}" class="lottery-hero-logo" onerror="this.style.display='none'" />` : ''}
      ${l.description ? `<div class="lottery-hero-desc">${escapeHtml(l.description)}</div>` : ''}
      <div class="lottery-hero-stats">
        <div class="hero-stat"><div class="hs-label">Цена билета</div><div class="hs-value">${price}</div></div>
        <div class="hero-stat"><div class="hs-label">Продано</div><div class="hs-value">${sold} / ${total}</div></div>
        <div class="hero-stat"><div class="hs-label">Призовых мест</div><div class="hs-value">${prizes.length}</div></div>
        ${l.deadline ? `<div class="hero-stat"><div class="hs-label">Дедлайн</div><div class="hs-value">${formatDate(l.deadline)}</div></div>` : ''}
      </div>
    </div>

    <div class="lottery-layout">
      <!-- Левая колонка: сетка билетов -->
      <div class="lottery-left">
        <div class="lottery-section-head">
          <h3>Билеты</h3>
          <div class="lottery-actions">
            <button class="btn ghost" id="pick-random-btn">🎲 Случайные 3</button>
            <button class="btn ghost" id="clear-btn">Очистить</button>
          </div>
        </div>
        <div class="tickets-grid" id="tickets-grid"></div>
        <div class="tickets-legend">
          <span class="legend-dot legend-free"></span> свободен
          <span class="legend-dot legend-taken"></span> занят
          <span class="legend-dot legend-mine"></span> мой
          <span class="legend-dot legend-selected"></span> выбран
        </div>
      </div>

      <!-- Правая колонка: чек -->
      <div class="lottery-right">
        <div class="checkout-card">
          <h3>Покупка</h3>

          <div class="checkout-row">
            <span>Выбрано</span>
            <b id="sel-count">0</b>
          </div>
          <div class="checkout-row">
            <span>Свободных билетов у тебя</span>
            <b>${remaining} из ${maxPerUser}</b>
          </div>
          <div class="checkout-row">
            <span>Сертификатов</span>
            <b id="free-count">${freeCount}</b>
          </div>

          <label class="field-label">Использовать сертификаты</label>
          <input type="number" id="use-free-input" value="0" min="0" max="0" />

          <div class="checkout-row total">
            <span>К оплате</span>
            <b id="total-cost">0</b>
          </div>

          <div class="login-error" id="buy-error"></div>

          <button class="btn primary" id="buy-btn" disabled>Купить</button>
        </div>

        <div class="prizes-card">
          <h3>Призы</h3>
          ${prizes.length === 0
            ? '<div class="empty-state" style="padding:20px">Призов нет</div>'
            : prizes.map((p) => `
              <div class="prize-item">
                <div class="prize-place">${p.place}</div>
                <div class="prize-info">
                  <div class="prize-title">${escapeHtml(p.title)}</div>
                  ${p.description ? `<div class="prize-desc">${escapeHtml(p.description)}</div>` : ''}
                </div>
              </div>
            `).join('')
          }
        </div>

        ${me.status === 'admin' ? `
          <button class="btn danger" id="draw-now-btn" style="width:100%">🎲 Разыграть сейчас</button>
        ` : ''}
      </div>
    </div>
  `;

  const grid = body.querySelector('#tickets-grid');
  const selCountEl = body.querySelector('#sel-count');
  const totalCostEl = body.querySelector('#total-cost');
  const freeCountEl = body.querySelector('#free-count');
  const useFreeInput = body.querySelector('#use-free-input');
  const buyBtn = body.querySelector('#buy-btn');
  const buyError = body.querySelector('#buy-error');

  const selected = new Set();

  function renderGrid() {
    grid.innerHTML = ticketsData.map((t) => {
      let cls = 'ticket';
      if (t.user_id === me.id) cls += ' mine';
      else if (t.user_id) cls += ' taken';
      if (selected.has(t.number)) cls += ' selected';

      const disabled = t.user_id ? 'disabled' : '';
      return `<button class="${cls}" data-num="${t.number}" ${disabled}>${t.number}</button>`;
    }).join('');

    grid.querySelectorAll('.ticket:not(.taken):not(.mine)').forEach((btn) => {
      btn.addEventListener('click', () => {
        const n = parseInt(btn.dataset.num, 10);
        if (selected.has(n)) selected.delete(n);
        else selected.add(n);
        renderGrid();
        updateCheckout();
      });
    });
  }

  function updateCheckout() {
    const count = selected.size;
    selCountEl.textContent = count;

    const maxFree = Math.min(freeCount, count);
    useFreeInput.max = maxFree;
    let useFree = parseInt(useFreeInput.value, 10) || 0;
    if (useFree > maxFree) useFree = maxFree;
    if (useFree < 0) useFree = 0;
    useFreeInput.value = useFree;

    const paid = count - useFree;
    const cost = paid * price;
    totalCostEl.textContent = cost;

    let canBuy = true;
    if (count === 0) canBuy = false;
    if (count > remaining) canBuy = false;
    if (cost > (me.balance ?? 0)) canBuy = false;

    buyBtn.disabled = !canBuy;
  }

  useFreeInput.addEventListener('input', updateCheckout);

  body.querySelector('#clear-btn').addEventListener('click', () => {
    selected.clear();
    renderGrid();
    updateCheckout();
  });

  body.querySelector('#pick-random-btn').addEventListener('click', () => {
    const available = ticketsData.filter((t) => !t.user_id);
    if (available.length === 0) {
      buyError.textContent = 'Свободных билетов нет';
      return;
    }
    const needed = Math.min(3, remaining, available.length);
    selected.clear();
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    for (let i = 0; i < needed; i++) selected.add(shuffled[i].number);
    renderGrid();
    updateCheckout();
  });

  buyBtn.addEventListener('click', async () => {
    buyError.textContent = '';
    const useFree = parseInt(useFreeInput.value, 10) || 0;
    const nums = Array.from(selected);

    buyBtn.disabled = true;
    buyBtn.textContent = 'Покупаем…';

    try {
      const res = await lottery.buy(lotteryId, nums, useFree);
      console.log('BUY RESPONSE:', JSON.stringify(res));

      const newBal = res?.result?.new_balance ?? res?.user?.balance;
      if (newBal != null) {
        me.balance = newBal;
        balanceEl.textContent = newBal;
        const curUser = JSON.parse(localStorage.getItem('funduk_user') || '{}');
        curUser.balance = newBal;
        localStorage.setItem('funduk_user', JSON.stringify(curUser));
      }
      if (res?.user) {
        saveSession(localStorage.getItem('funduk_token'), res.user);
      }
      const [tRes, fRes] = await Promise.all([
        lottery.tickets(lotteryId),
        lottery.myFreeTickets(lotteryId),
      ]);
      ticketsData = tRes.tickets;
      freeCount = fRes.count;
      freeCountEl.textContent = freeCount;

      selected.clear();
      renderGrid();

      const newMyCount = ticketsData.filter((t) => t.user_id === me.id).length;
      const newRemaining = Math.max(0, maxPerUser - newMyCount);
      body.querySelector('.checkout-row:nth-child(2) b').textContent = `${newRemaining} из ${maxPerUser}`;

      updateCheckout();
      buyError.textContent = '✅ Куплено!';
      buyError.style.color = 'var(--success)';
      setTimeout(() => { buyError.textContent = ''; buyError.style.color = ''; }, 3000);
    } catch (err) {
      const map = {
        insufficient_balance: 'Недостаточно баллов',
        exceeds_user_limit: 'Превышен лимит на человека',
        ticket_already_taken: 'Кто-то уже купил один из выбранных билетов',
        not_enough_free_tickets: 'Не хватает сертификатов',
        lottery_not_active: 'Лотерея неактивна',
        deadline_passed: 'Дедлайн прошёл',
      };
      buyError.textContent = map[err.message] || 'Ошибка: ' + err.message;
    } finally {
      buyBtn.disabled = false;
      buyBtn.textContent = 'Купить';
    }
  });

  const drawBtn = body.querySelector('#draw-now-btn');
  if (drawBtn) {
    drawBtn.addEventListener('click', async () => {
      if (!confirm('Разыграть лотерею прямо сейчас? Отменить нельзя.')) return;
      drawBtn.disabled = true;
      drawBtn.textContent = 'Разыгрываем…';
      try {
        const res = await lottery.draw(lotteryId);
        const r = res.result;
        alert(`🎉 Розыгрыш завершён!\nРазыграно призов: ${r.drawn_count} из ${r.total_prizes}`);
        navigate('/lottery/' + lotteryId);
        setTimeout(() => window.location.reload(), 50);
      } catch (err) {
        const map = {
          forbidden: 'Нет прав',
          already_drawn: 'Лотерея уже разыграна',
          lottery_cancelled: 'Лотерея отменена',
          lottery_not_found: 'Лотерея не найдена',
        };
        alert(map[err.message] || 'Ошибка: ' + err.message);
      } finally {
        drawBtn.disabled = false;
        drawBtn.textContent = '🎲 Разыграть сейчас';
      }
    });
  }

  renderGrid();
  updateCheckout();
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function escapeAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;');
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

async function renderWinners(body, lotteryId, l, prizes) {
  body.innerHTML = `
    <div class="lottery-info">
      ${l.logo_url ? `<img src="${escapeAttr(l.logo_url)}" class="lottery-hero-logo" onerror="this.style.display='none'" />` : ''}
      ${l.description ? `<div class="lottery-hero-desc">${escapeHtml(l.description)}</div>` : ''}
      <div class="lottery-hero-stats">
        <div class="hero-stat"><div class="hs-label">Статус</div><div class="hs-value" style="color:var(--gold)">🎉 Разыграна</div></div>
        ${l.drawn_at ? `<div class="hero-stat"><div class="hs-label">Разыграна</div><div class="hs-value">${formatDate(l.drawn_at)}</div></div>` : ''}
      </div>
    </div>
    <div class="empty-state">Загрузка победителей…</div>
  `;

  try {
    const res = await lottery.winners(lotteryId);

    if (!res.winners || res.winners.length === 0) {
      body.insertAdjacentHTML('beforeend', `<div class="empty-state">Призов не разыграно (не было билетов или призов).</div>`);
      return;
    }

    body.querySelector('.empty-state').remove();

    body.insertAdjacentHTML('beforeend', `
      <div class="winners-wrap">
        <h2 class="winners-title">🏆 Победители</h2>
        <div class="winners-list">
          ${res.winners.map((w) => `
            <div class="winner-card" data-place="${w.place}">
              <div class="winner-place">${w.place}</div>
              <div class="winner-body">
                <div class="winner-prize">${escapeHtml(w.prize_title || 'Приз')}</div>
                ${w.prize_description ? `<div class="winner-prize-desc">${escapeHtml(w.prize_description)}</div>` : ''}
                <div class="winner-meta">
                  🎟 Билет №${w.ticket_number ?? '?'} · <b>${escapeHtml(w.username || '?')}</b>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `);
  } catch (err) {
    body.insertAdjacentHTML('beforeend', `
      <div class="empty-state" style="color:var(--danger)">Ошибка загрузки победителей: ${escapeHtml(err.message)}</div>
    `);
  }
}