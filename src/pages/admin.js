import { admin, lottery } from '../supabase.js';
import { getUser } from '../auth.js';
import { navigate } from '../router.js';
import { logoHtml } from '../logo.js';

const STATUS_LABELS = {
  intern: 'Стажёр',
  helper: 'Помощник',
  moderator: 'Модератор',
  admin: 'Админ',
};

const TX_REASON_LABELS = {
  admin_grant: 'Начисление админом',
  ticket_purchase: 'Покупка билетов',
  refund: 'Возврат',
  lottery_win: 'Выигрыш в лотерее',
};

const LOTTERY_STATUS = {
  active:    { label: 'Активна',   cls: 'hc-active' },
  drawing:   { label: 'Розыгрыш',  cls: 'hc-drawing' },
  drawn:     { label: 'Разыграна', cls: 'hc-drawn' },
  cancelled: { label: 'Отменена',  cls: 'hc-cancelled' },
};

export async function renderAdmin(root) {
  document.title = 'HardEvo Lottery · Админ-панель';
  const me = getUser();
  if (!me || me.status !== 'admin') {
    navigate('/home');
    return;
  }

  root.innerHTML = `
    <div class="container">
      <div class="header">
        <div class="header-left">
          ${logoHtml('· Админ-панель')}
        </div>
        <div class="header-right">
          <button class="btn ghost" id="nav-home">← На главную</button>
        </div>
      </div>

      <div class="summary">
        <div class="summary-card">
          <div class="label">Пользователей</div>
          <div class="value" id="stat-users">—</div>
        </div>
        <div class="summary-card">
          <div class="label">Активных лотерей</div>
          <div class="value" id="stat-lotteries">—</div>
        </div>
        <div class="summary-card">
          <div class="label">Твой баланс</div>
          <div class="value">${me.balance}</div>
        </div>
      </div>

      <div class="admin-tabs" id="admin-tabs">
        <button class="admin-tab active" data-tab="users">Пользователи</button>
        <button class="admin-tab" data-tab="lotteries">Лотереи</button>
      </div>

      <div id="tab-users" class="admin-tab-content">
        <div style="margin-bottom:16px; display:flex; gap:8px;">
          <button class="btn primary" id="create-user-btn">+ Создать пользователя</button>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Статус</th>
                <th>Баланс</th>
                <th>Билеты</th>
                <th>Создан</th>
                <th style="text-align:right">Действия</th>
              </tr>
            </thead>
            <tbody id="users-tbody">
              <tr><td colspan="6" class="empty-state">Загрузка…</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div id="tab-lotteries" class="admin-tab-content hidden">
        <div style="margin-bottom:16px; display:flex; gap:8px;">
          <button class="btn primary" id="create-lottery-btn">+ Создать лотерею</button>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Статус</th>
                <th>Билетов</th>
                <th>Призов</th>
                <th>Победителей</th>
                <th>Создана</th>
                <th style="text-align:right">Действия</th>
              </tr>
            </thead>
            <tbody id="lotteries-tbody">
              <tr><td colspan="7" class="empty-state">Загрузка…</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="signature">by funduk</div>
    </div>

    <!-- Модалка: создание пользователя -->
    <div class="modal hidden" id="modal-create">
      <div class="modal-content">
        <h2>Создать пользователя</h2>
        <label class="field-label">Логин</label>
        <input type="text" id="new-username" autocomplete="off" />
        <label class="field-label">Статус</label>
        <div class="chip-picker" id="create-status-picker">
          <button class="chip active" data-status="intern">Стажёр</button>
          <button class="chip" data-status="helper">Помощник</button>
          <button class="chip" data-status="moderator">Модератор</button>
          <button class="chip" data-status="admin">Админ</button>
        </div>
        <label class="field-label">Стартовый баланс</label>
        <input type="number" id="new-balance" value="0" min="0" />
        <div class="login-error" id="create-error"></div>
        <div class="modal-actions">
          <button class="btn ghost" id="cancel-create">Отмена</button>
          <button class="btn primary" id="confirm-create">Создать</button>
        </div>
      </div>
    </div>

    <!-- Модалка: редактирование -->
    <div class="modal hidden" id="modal-edit">
      <div class="modal-content">
        <h2>Редактировать пользователя</h2>
        <label class="field-label">Логин</label>
        <input type="text" id="edit-username" autocomplete="off" />
        <label class="field-label">Статус</label>
        <div class="chip-picker" id="edit-status-picker">
          <button class="chip" data-status="intern">Стажёр</button>
          <button class="chip" data-status="helper">Помощник</button>
          <button class="chip" data-status="moderator">Модератор</button>
          <button class="chip" data-status="admin">Админ</button>
        </div>
        <div class="login-error" id="edit-error"></div>
        <div class="modal-actions">
          <button class="btn ghost" id="cancel-edit">Отмена</button>
          <button class="btn primary" id="confirm-edit">Сохранить</button>
        </div>
      </div>
    </div>

    <!-- Модалка: баланс -->
    <div class="modal hidden" id="modal-balance">
      <div class="modal-content">
        <h2>Изменить баланс</h2>
        <p style="color: var(--text-dim); margin-bottom: 12px;">
          Пользователь: <b id="balance-username"></b>
        </p>
        <label class="field-label">Сумма (+ начислить, − списать)</label>
        <input type="number" id="balance-amount" value="100" step="10" />
        <div class="login-error" id="balance-error"></div>
        <div class="modal-actions">
          <button class="btn ghost" id="cancel-balance">Отмена</button>
          <button class="btn primary" id="confirm-balance">Применить</button>
        </div>
      </div>
    </div>

    <!-- Модалка: выдача билетов -->
    <div class="modal hidden" id="modal-certs">
      <div class="modal-content">
        <h2>Выдать билеты</h2>
        <p style="color: var(--text-dim); margin-bottom: 12px;">
          Пользователь: <b id="certs-username"></b>
        </p>
        <label class="field-label">Выберите лотерею</label>
        <div class="lottery-picker" id="lottery-picker">
          <div class="empty-state">Загрузка…</div>
        </div>
        <label class="field-label">Сколько билетов</label>
        <input type="number" id="certs-count" value="1" min="1" />
        <div class="login-error" id="certs-error"></div>
        <div class="modal-actions">
          <button class="btn ghost" id="cancel-certs">Отмена</button>
          <button class="btn primary" id="confirm-certs">Выдать</button>
        </div>
      </div>
    </div>

    <!-- Модалка: создание лотереи -->
    <div class="modal hidden" id="modal-lottery">
      <div class="modal-content">
        <h2>Создать лотерею</h2>

        <label class="field-label">Название</label>
        <input type="text" id="lot-title" placeholder="Например: Розыгрыш меча" />

        <label class="field-label">Описание (необязательно)</label>
        <input type="text" id="lot-description" placeholder="Краткое описание" />

        <label class="field-label">Ссылка на логотип (необязательно)</label>
        <input type="text" id="lot-logo" placeholder="https://..." />

        <div class="row-2">
          <div>
            <label class="field-label">Цена билета</label>
            <input type="number" id="lot-price" value="100" min="0" />
          </div>
          <div>
            <label class="field-label">Всего билетов</label>
            <input type="number" id="lot-total" value="100" min="1" />
          </div>
        </div>

        <div class="row-2">
          <div>
            <label class="field-label">Макс. на человека</label>
            <input type="number" id="lot-max" value="10" min="1" />
          </div>
          <div>
            <label class="field-label">Дедлайн (опц.)</label>
            <input type="datetime-local" id="lot-deadline" />
          </div>
        </div>

        <label class="field-label">Призы</label>
        <div id="prizes-list" class="fines-list"></div>
        <button type="button" class="new-category-btn" id="add-prize-btn">+ Добавить приз</button>

        <div class="login-error" id="lottery-error"></div>

        <div class="modal-actions">
          <button class="btn ghost" id="cancel-lottery">Отмена</button>
          <button class="btn primary" id="confirm-lottery">Создать</button>
        </div>
      </div>
    </div>

    <!-- Модалка: транзакции пользователя -->
    <div class="modal hidden" id="modal-transactions">
      <div class="modal-content" style="max-width:640px;">
        <h2>История баланса</h2>
        <p style="color: var(--text-dim); margin-bottom: 16px;">
          Пользователь: <b id="tx-username"></b>
        </p>
        <div id="tx-list" style="max-height: 60vh; overflow-y: auto;">
          <div class="empty-state">Загрузка…</div>
        </div>
        <div class="modal-actions">
          <button class="btn primary" id="tx-close">Закрыть</button>
        </div>
      </div>
    </div>

    <!-- Модалка: результат -->
    <div class="modal hidden" id="modal-result">
      <div class="modal-content">
        <h2 id="result-title">Готово</h2>
        <p style="color: var(--text-dim); margin-bottom: 16px;" id="result-subtitle"></p>
        <div id="result-body"></div>
        <div class="modal-actions">
          <button class="btn primary" id="result-close">Ок</button>
        </div>
      </div>
    </div>
  `;

  const $ = (sel) => root.querySelector(sel);

  const tbody = $('#users-tbody');
  const ltbody = $('#lotteries-tbody');
  const statUsers = $('#stat-users');
  const statLotteries = $('#stat-lotteries');

  const modalCreate = $('#modal-create');
  const modalEdit = $('#modal-edit');
  const modalBalance = $('#modal-balance');
  const modalCerts = $('#modal-certs');
  const modalLottery = $('#modal-lottery');
  const modalTx = $('#modal-transactions');
  const modalResult = $('#modal-result');

  $('#nav-home').addEventListener('click', () => navigate('/home'));

  root.querySelectorAll('.admin-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      root.querySelectorAll('.admin-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      $('#tab-users').classList.toggle('hidden', target !== 'users');
      $('#tab-lotteries').classList.toggle('hidden', target !== 'lotteries');
      if (target === 'lotteries') loadLotteriesTable();
    });
  });

  function setupChipPicker(selector, onChange) {
    root.querySelectorAll(`${selector} .chip`).forEach((chip) => {
      chip.addEventListener('click', () => {
        root.querySelectorAll(`${selector} .chip`).forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        onChange(chip.dataset.status);
      });
    });
  }

  function setActiveChip(selector, status) {
    root.querySelectorAll(`${selector} .chip`).forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.status === status);
    });
  }

  let currentUsers = [];

  async function loadUsers() {
    try {
      const { users } = await admin.listUsers();
      currentUsers = users;
      statUsers.textContent = users.length;

      if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Пока никого нет</td></tr>`;
        return;
      }

      tbody.innerHTML = users.map((u) => {
        const certsUsed = u.free_tickets_used || 0;
        const certsTotal = u.free_tickets_total || 0;
        const certsFree = certsTotal - certsUsed;
        const certsDisplay = certsTotal === 0 ? '—' : `${certsFree} / ${certsTotal}`;

        return `
        <tr>
          <td><b>${escapeHtml(u.username)}</b></td>
          <td><span class="role-badge" data-role="${u.status}">${STATUS_LABELS[u.status] || u.status}</span></td>
          <td class="cell-balance">${u.balance}</td>
          <td class="cell-dim">${certsDisplay}</td>
          <td class="cell-dim">${formatDate(u.created_at)}</td>
          <td>
            <div class="row-actions">
              <button class="icon-btn" data-action="edit" data-id="${u.id}" title="Редактировать">
                <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="icon-btn pay" data-action="balance" data-id="${u.id}" data-username="${escapeHtml(u.username)}" title="Баланс">
                <svg viewBox="0 0 24 24"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              </button>
              <button class="icon-btn" data-action="certs" data-id="${u.id}" data-username="${escapeHtml(u.username)}" title="Выдать билеты">
                <svg viewBox="0 0 24 24"><path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
              </button>
              <button class="icon-btn" data-action="tx" data-id="${u.id}" data-username="${escapeHtml(u.username)}" title="История баланса">
                <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              </button>
              <button class="icon-btn" data-action="reset" data-id="${u.id}" data-username="${escapeHtml(u.username)}" title="Сбросить пароль">
                <svg viewBox="0 0 24 24"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
              </button>
              <button class="icon-btn del" data-action="delete" data-id="${u.id}" data-username="${escapeHtml(u.username)}" title="Удалить">
                <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `}).join('');

      tbody.querySelectorAll('button[data-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const { action, id, username } = btn.dataset;
          if (action === 'edit') openEdit(id);
          if (action === 'balance') openBalance(id, username);
          if (action === 'certs') openCerts(id, username);
          if (action === 'tx') openTransactions(id, username);
          if (action === 'reset') doResetPassword(id, username);
          if (action === 'delete') doDelete(id, username);
        });
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state" style="color:var(--danger)">Ошибка: ${err.message}</td></tr>`;
    }
  }

  async function loadLotteriesTable() {
    try {
      const { lotteries } = await admin.listAllLotteries();

      if (!lotteries || lotteries.length === 0) {
        ltbody.innerHTML = `<tr><td colspan="7" class="empty-state">Лотерей пока нет</td></tr>`;
        return;
      }

      ltbody.innerHTML = lotteries.map((l) => {
        const st = LOTTERY_STATUS[l.status] || { label: l.status, cls: '' };
        const isActive = l.status === 'active';

        return `
          <tr>
            <td><b>${escapeHtml(l.title)}</b></td>
            <td><span class="hc-status ${st.cls}">${st.label}</span></td>
            <td class="cell-dim">${l.sold_tickets} / ${l.total_tickets}</td>
            <td class="cell-dim">${l.prizes_count}</td>
            <td class="cell-dim">${l.winners_count}</td>
            <td class="cell-dim">${formatDate(l.created_at)}</td>
            <td>
              <div class="row-actions">
                <button class="icon-btn" data-lot-action="open" data-id="${l.id}" title="Открыть">
                  <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
                ${isActive ? `
                  <button class="icon-btn" data-lot-action="draw" data-id="${l.id}" data-title="${escapeHtml(l.title)}" title="Разыграть">
                    <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="16" cy="8" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="8" cy="16" r="1.5" fill="currentColor"/><circle cx="16" cy="16" r="1.5" fill="currentColor"/></svg>
                  </button>
                  <button class="icon-btn" data-lot-action="cancel" data-id="${l.id}" data-title="${escapeHtml(l.title)}" title="Отменить">
                    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                  </button>
                ` : ''}
                <button class="icon-btn del" data-lot-action="delete" data-id="${l.id}" data-title="${escapeHtml(l.title)}" title="Удалить">
                  <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      ltbody.querySelectorAll('button[data-lot-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const { lotAction, id, title } = btn.dataset;
          if (lotAction === 'open') navigate('/lottery/' + id);
          if (lotAction === 'draw') doDrawLottery(id, title);
          if (lotAction === 'cancel') doCancelLottery(id, title);
          if (lotAction === 'delete') doDeleteLottery(id, title);
        });
      });
    } catch (err) {
      ltbody.innerHTML = `<tr><td colspan="7" class="empty-state" style="color:var(--danger)">Ошибка: ${err.message}</td></tr>`;
    }
  }

  async function doDrawLottery(id, title) {
    if (!confirm(`Разыграть лотерею "${title}" сейчас?\nОтменить нельзя.`)) return;
    try {
      const res = await lottery.draw(id);
      const r = res.result;
      alert(`🎉 Розыгрыш завершён!\nРазыграно призов: ${r.drawn_count} из ${r.total_prizes}`);
      loadLotteriesTable();
      loadLotteriesStat();
    } catch (err) {
      const map = {
        already_drawn: 'Уже разыграна',
        lottery_cancelled: 'Лотерея отменена',
        forbidden: 'Нет прав',
      };
      alert(map[err.message] || 'Ошибка: ' + err.message);
    }
  }

  async function doCancelLottery(id, title) {
    if (!confirm(`Отменить лотерею "${title}"?\nКупленные билеты будут возвращены, баллы — возвращены.`)) return;
    try {
      const res = await admin.cancelLottery(id);
      const r = res.result;
      alert(`Лотерея отменена.\nВозвращено баллов: ${r.refunded_total}\nЗатронуто юзеров: ${r.refunded_users}`);
      loadLotteriesTable();
      loadLotteriesStat();
      loadUsers();
    } catch (err) {
      const map = {
        already_drawn: 'Уже разыграна — отмена невозможна',
        already_cancelled: 'Уже отменена',
      };
      alert(map[err.message] || 'Ошибка: ' + err.message);
    }
  }

  async function doDeleteLottery(id, title) {
    if (!confirm(`УДАЛИТЬ лотерею "${title}" навсегда?\nВся история (билеты, победители) будет стёрта. Баллы НЕ вернутся.`)) return;
    try {
      await admin.deleteLottery(id);
      loadLotteriesTable();
      loadLotteriesStat();
    } catch (err) {
      alert('Ошибка: ' + err.message);
    }
  }

  let createStatus = 'intern';
  setupChipPicker('#create-status-picker', (s) => (createStatus = s));

  $('#create-user-btn').addEventListener('click', () => {
    $('#new-username').value = '';
    $('#new-balance').value = '0';
    $('#create-error').textContent = '';
    createStatus = 'intern';
    setActiveChip('#create-status-picker', 'intern');
    modalCreate.classList.remove('hidden');
  });

  $('#cancel-create').addEventListener('click', () => modalCreate.classList.add('hidden'));

  $('#confirm-create').addEventListener('click', async () => {
    const username = $('#new-username').value.trim();
    const balance = parseInt($('#new-balance').value, 10) || 0;
    const errEl = $('#create-error');
    errEl.textContent = '';

    if (!username) { errEl.textContent = 'Введите логин'; return; }

    const btn = $('#confirm-create');
    btn.disabled = true; btn.textContent = 'Создаём…';

    try {
      const res = await admin.createUser(username, createStatus, balance);
      modalCreate.classList.add('hidden');
      showResult('Пользователь создан', 'Передайте данные. Пароль виден только сейчас.', `
        <div class="payout-details">
          <div class="payout-row"><span class="label">Логин</span><span class="value"><b>${escapeHtml(res.username)}</b></span></div>
          <div class="payout-row">
            <span class="label">Пароль</span>
            <span class="value" style="display:flex; gap:8px; align-items:center;">
              <b id="pwd-value">${escapeHtml(res.password)}</b>
              <button class="btn ghost" id="copy-pwd-btn" style="padding:4px 10px; font-size:11px;">📋 Скопировать</button>
            </span>
          </div>
          <div class="payout-row"><span class="label">Статус</span><span class="value">${STATUS_LABELS[res.status]}</span></div>
          <div class="payout-row total"><span class="label">Баланс</span><span class="value">${res.balance}</span></div>
        </div>
      `);
      attachCopyPassword();
      loadUsers();
    } catch (err) {
      const map = { username_taken: 'Такой логин уже занят' };
      errEl.textContent = map[err.message] || 'Ошибка: ' + err.message;
    } finally {
      btn.disabled = false; btn.textContent = 'Создать';
    }
  });

  let editTarget = null;
  let editStatus = 'intern';

  function openEdit(userId) {
    const user = currentUsers.find((u) => u.id === userId);
    if (!user) return;
    editTarget = userId;
    editStatus = user.status;
    $('#edit-username').value = user.username;
    setActiveChip('#edit-status-picker', user.status);
    $('#edit-error').textContent = '';
    modalEdit.classList.remove('hidden');
  }

  setupChipPicker('#edit-status-picker', (s) => (editStatus = s));

  $('#cancel-edit').addEventListener('click', () => modalEdit.classList.add('hidden'));

  $('#confirm-edit').addEventListener('click', async () => {
    const username = $('#edit-username').value.trim();
    const errEl = $('#edit-error');
    errEl.textContent = '';

    if (!username) { errEl.textContent = 'Введите логин'; return; }

    const btn = $('#confirm-edit');
    btn.disabled = true; btn.textContent = 'Сохраняем…';

    try {
      await admin.updateUser(editTarget, username, editStatus);
      modalEdit.classList.add('hidden');
      loadUsers();
    } catch (err) {
      const map = { username_taken: 'Такой логин уже занят' };
      errEl.textContent = map[err.message] || 'Ошибка: ' + err.message;
    } finally {
      btn.disabled = false; btn.textContent = 'Сохранить';
    }
  });

  let balanceTarget = null;

  function openBalance(userId, username) {
    balanceTarget = userId;
    $('#balance-username').textContent = username;
    $('#balance-amount').value = '100';
    $('#balance-error').textContent = '';
    modalBalance.classList.remove('hidden');
  }

  $('#cancel-balance').addEventListener('click', () => modalBalance.classList.add('hidden'));

  $('#confirm-balance').addEventListener('click', async () => {
    const amount = parseInt($('#balance-amount').value, 10);
    const errEl = $('#balance-error');
    errEl.textContent = '';
    if (!amount || isNaN(amount)) { errEl.textContent = 'Введите число'; return; }

    const btn = $('#confirm-balance');
    btn.disabled = true; btn.textContent = 'Применяем…';

    try {
      const res = await admin.grantBalance(balanceTarget, amount);
      modalBalance.classList.add('hidden');
      showResult('Баланс обновлён', '', `
        <div class="payout-details">
          <div class="payout-row total"><span class="label">Новый баланс</span><span class="value">${res.new_balance}</span></div>
        </div>
      `);
      loadUsers();
    } catch (err) {
      errEl.textContent = 'Ошибка: ' + err.message;
    } finally {
      btn.disabled = false; btn.textContent = 'Применить';
    }
  });

  let certsTarget = null;
  let certsLottery = null;

  async function openCerts(userId, username) {
    certsTarget = userId;
    certsLottery = null;
    $('#certs-username').textContent = username;
    $('#certs-count').value = '1';
    $('#certs-error').textContent = '';
    $('#lottery-picker').innerHTML = '<div class="empty-state">Загрузка…</div>';
    modalCerts.classList.remove('hidden');

    try {
      const { lotteries } = await admin.listLotteries();
      const picker = $('#lottery-picker');

      if (!lotteries || lotteries.length === 0) {
        picker.innerHTML = '<div class="empty-state">Нет активных лотерей</div>';
        return;
      }

      picker.innerHTML = lotteries.map((l) => `
        <div class="lottery-option" data-id="${l.id}">
          <div class="l-title">${escapeHtml(l.title)}</div>
          <div class="l-meta">Билетов продано: ${l.sold_tickets} / ${l.total_tickets}</div>
        </div>
      `).join('');

      picker.querySelectorAll('.lottery-option').forEach((el) => {
        el.addEventListener('click', () => {
          picker.querySelectorAll('.lottery-option').forEach((o) => o.classList.remove('active'));
          el.classList.add('active');
          certsLottery = el.dataset.id;
        });
      });
    } catch (err) {
      $('#lottery-picker').innerHTML = `<div class="empty-state" style="color:var(--danger)">Ошибка: ${err.message}</div>`;
    }
  }

  $('#cancel-certs').addEventListener('click', () => modalCerts.classList.add('hidden'));

  $('#confirm-certs').addEventListener('click', async () => {
    const count = parseInt($('#certs-count').value, 10);
    const errEl = $('#certs-error');
    errEl.textContent = '';

    if (!certsLottery) { errEl.textContent = 'Выберите лотерею'; return; }
    if (!count || count < 1) { errEl.textContent = 'Введите количество'; return; }

    const btn = $('#confirm-certs');
    btn.disabled = true; btn.textContent = 'Выдаём…';

    try {
      const res = await admin.grantFreeTickets(certsTarget, certsLottery, count);
      modalCerts.classList.add('hidden');
      showResult('Билеты выданы', '', `
        <div class="payout-details">
          <div class="payout-row total"><span class="label">Выдано</span><span class="value">${res.inserted} шт.</span></div>
        </div>
      `);
      loadUsers();
    } catch (err) {
      errEl.textContent = 'Ошибка: ' + err.message;
    } finally {
      btn.disabled = false; btn.textContent = 'Выдать';
    }
  });

  async function openTransactions(userId, username) {
    $('#tx-username').textContent = username;
    $('#tx-list').innerHTML = '<div class="empty-state">Загрузка…</div>';
    modalTx.classList.remove('hidden');

    try {
      const { transactions } = await admin.userTransactions(userId);

      if (!transactions || transactions.length === 0) {
        $('#tx-list').innerHTML = '<div class="empty-state">Операций пока нет</div>';
        return;
      }

      $('#tx-list').innerHTML = `
        <div class="tx-list-wrap">
          ${transactions.map((t) => {
            const positive = t.amount > 0;
            return `
              <div class="tx-row">
                <div class="tx-info">
                  <div class="tx-reason">${TX_REASON_LABELS[t.reason] || escapeHtml(t.reason)}</div>
                  <div class="tx-date">${formatDateTime(t.created_at)}</div>
                </div>
                <div class="tx-amount ${positive ? 'positive' : 'negative'}">
                  ${positive ? '+' : ''}${t.amount}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } catch (err) {
      $('#tx-list').innerHTML = `<div class="empty-state" style="color:var(--danger)">Ошибка: ${escapeHtml(err.message)}</div>`;
    }
  }

  $('#tx-close').addEventListener('click', () => modalTx.classList.add('hidden'));

  const prizesList = $('#prizes-list');

  function addPrizeRow(place, title = '') {
    const row = document.createElement('div');
    row.className = 'fine-row';
    row.innerHTML = `
      <input type="text" class="prize-title" placeholder="Название приза (место ${place})" value="${escapeHtml(title)}" />
      <input type="number" class="prize-place" value="${place}" min="1" readonly />
      <button type="button" class="fine-remove">×</button>
    `;
    row.querySelector('.fine-remove').addEventListener('click', () => {
      row.remove();
      renumberPrizes();
    });
    prizesList.appendChild(row);
  }

  function renumberPrizes() {
    prizesList.querySelectorAll('.fine-row').forEach((row, i) => {
      const placeInput = row.querySelector('.prize-place');
      const titleInput = row.querySelector('.prize-title');
      placeInput.value = i + 1;
      if (titleInput && !titleInput.value) {
        titleInput.placeholder = `Название приза (место ${i + 1})`;
      }
    });
  }

  $('#add-prize-btn').addEventListener('click', () => {
    addPrizeRow(prizesList.children.length + 1);
  });

  $('#create-lottery-btn').addEventListener('click', () => {
    $('#lot-title').value = '';
    $('#lot-description').value = '';
    $('#lot-logo').value = '';
    $('#lot-price').value = '100';
    $('#lot-total').value = '100';
    $('#lot-max').value = '10';
    $('#lot-deadline').value = '';
    $('#lottery-error').textContent = '';
    prizesList.innerHTML = '';
    addPrizeRow(1);
    addPrizeRow(2);
    addPrizeRow(3);
    modalLottery.classList.remove('hidden');
  });

  $('#cancel-lottery').addEventListener('click', () => modalLottery.classList.add('hidden'));

  $('#confirm-lottery').addEventListener('click', async () => {
    const errEl = $('#lottery-error');
    errEl.textContent = '';

    const title = $('#lot-title').value.trim();
    const description = $('#lot-description').value.trim();
    const logo_url = $('#lot-logo').value.trim() || null;
    const ticket_price = parseInt($('#lot-price').value, 10) || 0;
    const total_tickets = parseInt($('#lot-total').value, 10);
    const max_tickets_per_user = parseInt($('#lot-max').value, 10);
    const deadlineRaw = $('#lot-deadline').value;

    if (!title) { errEl.textContent = 'Введите название'; return; }
    if (!total_tickets || total_tickets < 1) { errEl.textContent = 'Всего билетов — минимум 1'; return; }
    if (!max_tickets_per_user || max_tickets_per_user < 1) { errEl.textContent = 'Макс. на человека — минимум 1'; return; }

    const prizes = [];
    prizesList.querySelectorAll('.fine-row').forEach((row, i) => {
      const prizeTitle = row.querySelector('.prize-title').value.trim();
      if (prizeTitle) {
        prizes.push({ place: i + 1, title: prizeTitle, description: '' });
      }
    });

    if (prizes.length === 0) {
      errEl.textContent = 'Добавьте хотя бы один приз';
      return;
    }

    const deadline = deadlineRaw ? new Date(deadlineRaw).toISOString() : null;

    const btn = $('#confirm-lottery');
    btn.disabled = true;
    btn.textContent = 'Создаём…';

    try {
      const res = await lottery.create({
        title, description, logo_url, ticket_price,
        total_tickets, max_tickets_per_user, deadline, prizes,
      });
      modalLottery.classList.add('hidden');
      showResult('Лотерея создана', '', `
        <div class="payout-details">
          <div class="payout-row"><span class="label">Название</span><span class="value"><b>${escapeHtml(title)}</b></span></div>
          <div class="payout-row"><span class="label">Билетов</span><span class="value">${total_tickets}</span></div>
          <div class="payout-row"><span class="label">Призов</span><span class="value">${prizes.length}</span></div>
          <div class="payout-row total"><span class="label">ID</span><span class="value" style="font-size:11px">${res.lottery_id}</span></div>
        </div>
      `);
      loadLotteriesStat();
    } catch (err) {
      const map = {
        forbidden: 'Нет прав',
        no_prizes: 'Добавьте хотя бы один приз',
        invalid_params: 'Проверьте поля',
      };
      errEl.textContent = map[err.message] || 'Ошибка: ' + err.message;
    } finally {
      btn.disabled = false; btn.textContent = 'Создать';
    }
  });

  async function loadLotteriesStat() {
    try {
      const { lotteries } = await lottery.all();
      const active = lotteries.filter((l) => l.status === 'active' || l.status === 'drawing');
      statLotteries.textContent = active.length;
    } catch {
      statLotteries.textContent = '—';
    }
  }

  async function doResetPassword(userId, username) {
    if (!confirm(`Сбросить пароль пользователю ${username}?`)) return;
    try {
      const res = await admin.resetPassword(userId);
      showResult('Пароль сброшен', `Новый пароль для ${escapeHtml(username)}. Передайте его другу.`, `
        <div class="payout-details">
          <div class="payout-row total">
            <span class="label">Новый пароль</span>
            <span class="value" style="display:flex; gap:8px; align-items:center;">
              <b id="pwd-value">${escapeHtml(res.password)}</b>
              <button class="btn ghost" id="copy-pwd-btn" style="padding:4px 10px; font-size:11px;">📋 Скопировать</button>
            </span>
          </div>
        </div>
      `);
      attachCopyPassword();
    } catch (err) {
      alert('Ошибка: ' + err.message);
    }
  }

  async function doDelete(userId, username) {
    if (!confirm(`Удалить пользователя ${username}? Это действие нельзя отменить.`)) return;
    try {
      await admin.deleteUser(userId);
      loadUsers();
    } catch (err) {
      const map = { cannot_delete_self: 'Нельзя удалить самого себя' };
      alert(map[err.message] || 'Ошибка: ' + err.message);
    }
  }

  function showResult(title, subtitle, html) {
    $('#result-title').textContent = title;
    $('#result-subtitle').textContent = subtitle;
    $('#result-body').innerHTML = html;
    modalResult.classList.remove('hidden');
  }

  function attachCopyPassword() {
    setTimeout(() => {
      const copyBtn = $('#copy-pwd-btn');
      if (!copyBtn) return;
      copyBtn.addEventListener('click', async () => {
        const pwd = $('#pwd-value').textContent;
        try {
          await navigator.clipboard.writeText(pwd);
          copyBtn.textContent = '✅ Скопировано';
          setTimeout(() => { copyBtn.textContent = '📋 Скопировать'; }, 2000);
        } catch {
          copyBtn.textContent = '⚠ Ошибка';
        }
      });
    }, 0);
  }

  $('#result-close').addEventListener('click', () => modalResult.classList.add('hidden'));

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  function formatDateTime(iso) {
    const d = new Date(iso);
    return d.toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  }

  await loadUsers();
  await loadLotteriesStat();
}