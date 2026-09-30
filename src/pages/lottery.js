import { lottery } from '../supabase.js';
import { getUser, saveSession, logout } from '../auth.js';
import { navigate } from '../router.js';
import { logoHtml } from '../logo.js';

export async function renderLottery(root, lotteryId) {
  document.title = 'HardEvo Lottery · Лотерея';
  const me = getUser();

  root.innerHTML = `
    <div class="container">
      <div class="header">
        <div class="header-left">
          ${logoHtml('· Лотерея')}
        </div>
        <div class="header-right">
          <button class="btn ghost" id="back-btn">← На главную</button>
          <div class="user-panel" id="profile-btn">
            <div class="user-panel-info">
              <div class="up-name">${escapeHtml(me?.username || '?')}</div>
              <span class="role-badge" data-role="${me?.status}">${statusLabel(me?.status)}</span>
            </div>
            <div class="up-balance-wrap">
              <div class="up-balance-label">Баланс</div>
              <div class="up-balance" id="my-balance">${me?.balance ?? 0}</div>
            </div>
            <button class="icon-btn-logout" id="logout-btn" title="Выйти">
              <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </button>
          </div>
        </div>
      </div>

      <h1 class="lottery-page-title" id="lottery-title">Загрузка…</h1>

      <div id="lottery-body" class="lottery-page">
        <div class="empty-state">Загрузка…</div>
      </div>

      <div class="signature">by funduk</div>
    </div>

    <!-- Модалка: подтверждение покупки -->
    <div class="modal hidden" id="modal-buy">
      <div class="modal-content">
        <h2>Покупка билетов</h2>
        <p style="color: var(--text-dim); margin-bottom: 16px; font-size: 13px;" id="buy-summary">
          Выбрано: 0
        </p>

        <div class="buy-row">
          <span>Выбрано билетов</span>
          <b id="buy-count">0</b>
        </div>
        <div class="buy-row">
          <span>Доступно бесплатных</span>
          <b id="buy-free-available">0</b>
        </div>
        <div class="buy-row">
          <span>Осталось платных по лимиту</span>
          <b id="buy-paid-limit">0</b>
        </div>

        <label class="field-label">Оплатить бесплатными</label>
        <div class="free-slider-wrap">
          <input type="range" id="free-slider" min="0" max="0" value="0" />
          <div class="free-slider-controls">
            <input type="number" id="free-number" value="0" min="0" max="0" />
            <button class="btn ghost" id="free-max-btn" title="Использовать все">Макс</button>
          </div>
        </div>

        <div class="buy-row total">
          <span>К оплате баллами</span>
          <b id="buy-cost">0</b>
        </div>
        <div class="buy-row">
          <span>Твой баланс</span>
          <b id="buy-balance">0</b>
        </div>

        <div class="login-error" id="buy-error"></div>

        <div class="modal-actions">
          <button class="btn ghost" id="buy-cancel">Отмена</button>
          <button class="btn primary" id="buy-confirm">Купить</button>
        </div>
      </div>
    </div>

    <!-- Модалка: покупка случайных -->
    <div class="modal hidden" id="modal-random">
      <div class="modal-content">
        <h2>🎲 Случайные билеты</h2>
        <p style="color: var(--text-dim); margin-bottom: 16px; font-size: 13px;">
          Сколько билетов купить?
        </p>

        <div class="chip-picker" id="random-picker">
          <button class="chip active" data-count="1">1</button>
          <button class="chip" data-count="3">3</button>
          <button class="chip" data-count="5">5</button>
          <button class="chip" data-count="10">10</button>
          <button class="chip" data-count="max">Все</button>
        </div>

        <label class="field-label">Или своё количество</label>
        <input type="number" id="random-custom" min="1" placeholder="Введите число" />

        <div class="buy-row">
          <span>Свободных билетов</span>
          <b id="random-free">0</b>
        </div>
        <div class="buy-row">
          <span>Будет куплено</span>
          <b id="random-will">0</b>
        </div>
        <div class="buy-row total">
          <span>Стоимость</span>
          <b id="random-cost">0</b>
        </div>

        <div class="login-error" id="random-error"></div>

        <div class="modal-actions">
          <button class="btn ghost" id="random-cancel">Отмена</button>
          <button class="btn primary" id="random-confirm" disabled>Купить</button>
        </div>
      </div>
    </div>
  `;

  root.querySelector('#back-btn').addEventListener('click', () => navigate('/home'));

  root.querySelector('#profile-btn').addEventListener('click', (e) => {
    if (e.target.closest('#logout-btn')) return;
    navigate('/profile');
  });

  root.querySelector('#logout-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    logout();
    navigate('/login');
  });

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
  const myPaidCount = myTickets.filter((t) => !t.is_free).length;
  const myFreeCount = myTickets.filter((t) => t.is_free).length;
  const paidLimitLeft = Math.max(0, maxPerUser - myPaidCount);

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
      <div class="lottery-left">
        <div class="lottery-section-head">
          <h3>Билеты</h3>
          <div class="lottery-actions">
            <button class="btn primary" id="buy-random-btn">🎲 Купить случайные</button>
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

      <div class="lottery-right">
        <div class="checkout-card">
          <h3>Твоя статистика</h3>

          <div class="checkout-row">
            <span>Выбрано</span>
            <b id="sel-count">0</b>
          </div>
          <div class="checkout-row">
            <span>Платных куплено</span>
            <b>${myPaidCount} / ${maxPerUser}</b>
          </div>
          <div class="checkout-row">
            <span>Бесплатных куплено</span>
            <b>${myFreeCount}</b>
          </div>
          <div class="checkout-row">
            <span>Доступно бесплатных</span>
            <b id="free-count">${freeCount}</b>
          </div>

          <div class="login-error" id="buy-hint"></div>

          <button class="btn primary" id="buy-btn" disabled style="width:100%">Купить</button>
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
  const freeCountEl = body.querySelector('#free-count');
  const buyBtn = body.querySelector('#buy-btn');
  const buyHint = body.querySelector('#buy-hint');

  const selected = new Set();

  function maxSelectable() {
    const freeAvailable = Math.min(freeCount, total - sold);
    return paidLimitLeft + freeAvailable;
  }

  function renderGrid() {
    grid.innerHTML = ticketsData.map((t) => {
      const isMine = t.user_id === me.id;
      const isTaken = t.user_id && !isMine;
      const isSelected = selected.has(t.number);

      let cls = 'ticket';
      if (isMine) cls += ' mine';
      else if (isTaken) cls += ' taken';
      if (isSelected) cls += ' selected';

      const numStr = '#' + String(t.number).padStart(4, '0');
      const username = t.username ? escapeHtml(t.username) : '';

      let rightSide = '';
      if (isTaken) {
        rightSide = `<div class="ticket-stub ticket-stub-taken">Занято</div>`;
      } else if (isMine) {
        rightSide = `<div class="ticket-stub ticket-stub-mine">Мой</div>`;
      } else if (isSelected) {
        rightSide = `<div class="ticket-stub ticket-stub-selected">Выбран</div>`;
      } else {
        rightSide = `<div class="ticket-stub ticket-stub-free">Свободен</div>`;
      }

      const disabled = t.user_id ? 'disabled' : '';
      return `
        <button class="${cls}" data-num="${t.number}" ${disabled}>
          <div class="ticket-main">
            <div class="ticket-num">${numStr}</div>
            ${username ? `<div class="ticket-user">${username}</div>` : ''}
          </div>
          ${rightSide}
        </button>
      `;
    }).join('');

    grid.querySelectorAll('.ticket:not(.taken):not(.mine)').forEach((btn) => {
      btn.addEventListener('click', () => {
        const n = parseInt(btn.dataset.num, 10);
        if (selected.has(n)) {
          selected.delete(n);
        } else {
          if (selected.size >= maxSelectable()) {
            buyHint.style.color = 'var(--danger)';
            buyHint.textContent = `Доступно выбрать: ${maxSelectable()}. (${paidLimitLeft} платных + ${Math.min(freeCount, total - sold)} бесплатных)`;
            setTimeout(() => { buyHint.textContent = ''; buyHint.style.color = ''; }, 3500);
            return;
          }
          selected.add(n);
        }
        renderGrid();
        updateCheckout();
      });
    });
  }

  function updateCheckout() {
    const count = selected.size;
    selCountEl.textContent = count;

    let canBuy = true;
    if (count === 0) canBuy = false;
    if (count > maxSelectable()) canBuy = false;
    buyBtn.disabled = !canBuy;
  }

  body.querySelector('#clear-btn').addEventListener('click', () => {
    selected.clear();
    renderGrid();
    updateCheckout();
  });

  const modalBuy = root.querySelector('#modal-buy');
  const buyCount = root.querySelector('#buy-count');
  const buyFreeAvailable = root.querySelector('#buy-free-available');
  const buyPaidLimit = root.querySelector('#buy-paid-limit');
  const freeSlider = root.querySelector('#free-slider');
  const freeNumber = root.querySelector('#free-number');
  const freeMaxBtn = root.querySelector('#free-max-btn');
  const buyCost = root.querySelector('#buy-cost');
  const buyBalance = root.querySelector('#buy-balance');
  const buyError = root.querySelector('#buy-error');
  const buyConfirm = root.querySelector('#buy-confirm');
  const buySummary = root.querySelector('#buy-summary');

  let freeToUse = 0;
  let maxFree = 0;
  let paidCount = 0;

  function recalcBuy() {
    const count = selected.size;
    paidCount = count - freeToUse;
    const cost = paidCount * price;

    buyCount.textContent = count;
    buyFreeAvailable.textContent = freeCount;
    buyPaidLimit.textContent = paidLimitLeft;
    buyCost.textContent = cost;
    buyBalance.textContent = me.balance ?? 0;
    buySummary.textContent = `Выбрано билетов: ${count}`;

    let can = true;
    let err = '';
    if (count === 0) { can = false; err = 'Билеты не выбраны'; }
    else if (paidCount > paidLimitLeft) {
      can = false;
      err = `Платных не хватает по лимиту: осталось ${paidLimitLeft}`;
    }
    else if (cost > (me.balance ?? 0)) {
      can = false;
      err = 'Недостаточно баллов';
    }
    buyError.textContent = err;
    buyConfirm.disabled = !can;
  }

  function openBuyModal() {
    if (selected.size === 0) return;
    const count = selected.size;
    maxFree = Math.min(freeCount, count);
    freeToUse = Math.min(maxFree, Math.max(0, count - paidLimitLeft));

    freeSlider.min = 0;
    freeSlider.max = maxFree;
    freeSlider.value = freeToUse;
    freeNumber.min = 0;
    freeNumber.max = maxFree;
    freeNumber.value = freeToUse;

    recalcBuy();
    modalBuy.classList.remove('hidden');
  }

  freeSlider.addEventListener('input', () => {
    freeToUse = parseInt(freeSlider.value, 10) || 0;
    freeNumber.value = freeToUse;
    recalcBuy();
  });

  freeNumber.addEventListener('input', () => {
    let v = parseInt(freeNumber.value, 10) || 0;
    if (v < 0) v = 0;
    if (v > maxFree) v = maxFree;
    freeToUse = v;
    freeSlider.value = v;
    recalcBuy();
  });

  freeMaxBtn.addEventListener('click', () => {
    freeToUse = maxFree;
    freeSlider.value = maxFree;
    freeNumber.value = maxFree;
    recalcBuy();
  });

  buyBtn.addEventListener('click', openBuyModal);
  root.querySelector('#buy-cancel').addEventListener('click', () => modalBuy.classList.add('hidden'));

  buyConfirm.addEventListener('click', async () => {
    buyConfirm.disabled = true;
    buyConfirm.textContent = 'Покупаем…';

    const nums = Array.from(selected);

    try {
      const res = await lottery.buy(lotteryId, nums, freeToUse);

      const newBal = res?.result?.new_balance ?? res?.user?.balance;
      if (newBal != null) {
        me.balance = newBal;
        balanceEl.textContent = newBal;
        const curUser = JSON.parse(sessionStorage.getItem('funduk_user') || '{}');
        curUser.balance = newBal;
        sessionStorage.setItem('funduk_user', JSON.stringify(curUser));
      }
      if (res?.user) saveSession(sessionStorage.getItem('funduk_token'), res.user);

      await reloadData();

      selected.clear();
      renderGrid();
      updateCheckout();

      modalBuy.classList.add('hidden');
      buyHint.style.color = 'var(--success)';
      buyHint.textContent = `✅ Куплено ${nums.length} билетов`;
      setTimeout(() => { buyHint.textContent = ''; buyHint.style.color = ''; }, 3000);
    } catch (err) {
      const map = {
        insufficient_balance: 'Недостаточно баллов',
        exceeds_user_limit: 'Превышен лимит по платным билетам',
        ticket_already_taken: 'Кто-то уже купил один из выбранных билетов',
        not_enough_free_tickets: 'Не хватает бесплатных билетов',
        lottery_not_active: 'Лотерея неактивна',
        deadline_passed: 'Дедлайн прошёл',
      };
      buyError.textContent = map[err.message] || 'Ошибка: ' + err.message;
    } finally {
      buyConfirm.disabled = false;
      buyConfirm.textContent = 'Купить';
    }
  });

  async function reloadData() {
    const [tRes, fRes] = await Promise.all([
      lottery.tickets(lotteryId),
      lottery.myFreeTickets(lotteryId),
    ]);
    ticketsData = tRes.tickets;
    freeCount = fRes.count;

    const myTicketsNew = ticketsData.filter((t) => t.user_id === me.id);
    const myPaid = myTicketsNew.filter((t) => !t.is_free).length;
    const myFree = myTicketsNew.filter((t) => t.is_free).length;

    body.querySelector('.checkout-row:nth-child(2) b').textContent = `${myPaid} / ${maxPerUser}`;
    body.querySelector('.checkout-row:nth-child(3) b').textContent = myFree;
    freeCountEl.textContent = freeCount;
  }

  const modalRandom = root.querySelector('#modal-random');
  const randomPicker = root.querySelector('#random-picker');
  const randomCustom = root.querySelector('#random-custom');
  const randomFree = root.querySelector('#random-free');
  const randomWill = root.querySelector('#random-will');
  const randomCost = root.querySelector('#random-cost');
  const randomError = root.querySelector('#random-error');
  const randomConfirm = root.querySelector('#random-confirm');

  let randomMode = 'chip';
  let randomChipCount = 1;

  function openRandomModal() {
    const available = ticketsData.filter((t) => !t.user_id).length;
    randomFree.textContent = available;

    randomChipCount = 1;
    randomMode = 'chip';
    randomCustom.value = '';
    randomPicker.querySelectorAll('.chip').forEach((c, i) => {
      c.classList.toggle('active', i === 0);
    });
    randomError.textContent = '';
    updateRandomCalc();
    modalRandom.classList.remove('hidden');
  }

  function updateRandomCalc() {
    const available = ticketsData.filter((t) => !t.user_id).length;
    const maxPaidAdd = paidLimitLeft;
    const maxAdd = maxPaidAdd + freeCount;
    let requested = 0;

    if (randomMode === 'chip') {
      if (randomChipCount === 'max') requested = Math.min(available, maxAdd);
      else requested = Math.min(Number(randomChipCount) || 1, available, maxAdd);
    } else {
      requested = Math.min(Number(randomCustom.value) || 0, available, maxAdd);
    }

    if (requested < 0) requested = 0;
    const cost = requested * price;

    randomWill.textContent = requested;
    randomCost.textContent = cost;

    let can = true;
    if (requested === 0) can = false;
    if (cost > (me.balance ?? 0)) can = false;
    randomConfirm.disabled = !can;

    if (available === 0) randomError.textContent = 'Свободных билетов нет';
    else if (maxAdd === 0) randomError.textContent = 'Нет доступных билетов (лимит + бесплатные исчерпаны)';
    else if (cost > (me.balance ?? 0)) randomError.textContent = 'Недостаточно баллов';
    else randomError.textContent = '';
  }

  randomPicker.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      randomPicker.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      randomChipCount = chip.dataset.count;
      randomMode = 'chip';
      randomCustom.value = '';
      updateRandomCalc();
    });
  });

  randomCustom.addEventListener('input', () => {
    if (randomCustom.value) {
      randomMode = 'custom';
      randomPicker.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
    } else {
      randomMode = 'chip';
      randomPicker.querySelectorAll('.chip')[0].classList.add('active');
      randomChipCount = 1;
    }
    updateRandomCalc();
  });

  body.querySelector('#buy-random-btn').addEventListener('click', openRandomModal);
  root.querySelector('#random-cancel').addEventListener('click', () => modalRandom.classList.add('hidden'));

  randomConfirm.addEventListener('click', async () => {
    const available = ticketsData.filter((t) => !t.user_id);
    const maxAdd = paidLimitLeft + freeCount;
    let count = 0;

    if (randomMode === 'chip') {
      if (randomChipCount === 'max') count = Math.min(available.length, maxAdd);
      else count = Math.min(Number(randomChipCount) || 1, available.length, maxAdd);
    } else {
      count = Math.min(Number(randomCustom.value) || 0, available.length, maxAdd);
    }

    if (count < 1) return;

    const freeToUseRandom = Math.min(freeCount, count);
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    const nums = shuffled.slice(0, count).map((t) => t.number);

    randomConfirm.disabled = true;
    randomConfirm.textContent = 'Покупаем…';

    try {
      const res = await lottery.buy(lotteryId, nums, freeToUseRandom);

      const newBal = res?.result?.new_balance ?? res?.user?.balance;
      if (newBal != null) {
        me.balance = newBal;
        balanceEl.textContent = newBal;
        const curUser = JSON.parse(sessionStorage.getItem('funduk_user') || '{}');
        curUser.balance = newBal;
        sessionStorage.setItem('funduk_user', JSON.stringify(curUser));
      }
      if (res?.user) saveSession(sessionStorage.getItem('funduk_token'), res.user);

      await reloadData();
      selected.clear();
      renderGrid();
      updateCheckout();

      modalRandom.classList.add('hidden');
      buyHint.style.color = 'var(--success)';
      buyHint.textContent = `✅ Куплено ${count} билетов`;
      setTimeout(() => { buyHint.textContent = ''; buyHint.style.color = ''; }, 3000);
    } catch (err) {
      const map = {
        insufficient_balance: 'Недостаточно баллов',
        exceeds_user_limit: 'Превышен лимит',
        ticket_already_taken: 'Кто-то уже купил',
        not_enough_free_tickets: 'Не хватает бесплатных',
        lottery_not_active: 'Лотерея неактивна',
        deadline_passed: 'Дедлайн прошёл',
      };
      randomError.textContent = map[err.message] || 'Ошибка: ' + err.message;
    } finally {
      randomConfirm.disabled = false;
      randomConfirm.textContent = 'Купить';
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
      body.insertAdjacentHTML('beforeend', `<div class="empty-state">Призов не разыграно.</div>`);
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
    body.insertAdjacentHTML('beforeend', `<div class="empty-state" style="color:var(--danger)">Ошибка: ${escapeHtml(err.message)}</div>`);
  }
}

function statusLabel(status) {
  const map = {
    intern: 'Стажёр',
    helper: 'Помощник',
    moderator: 'Модератор',
    admin: 'Админ',
  };
  return map[status] || status || '—';
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