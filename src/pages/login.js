import { loginRequest } from '../supabase.js';
import { saveSession } from '../auth.js';
import { navigate } from '../router.js';

export function renderLogin(root) {
  document.title = 'HardEvo Lottery · Вход';
  root.innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <h1>Funduk Lottery</h1>
        <p class="login-sub">Вход в систему</p>

        <form id="login-form">
          <label class="field-label">Логин</label>
          <input type="text" id="login-username" autocomplete="username" required>

          <label class="field-label">Пароль</label>
          <input type="password" id="login-password" autocomplete="current-password" required>

          <div class="login-error" id="login-error"></div>

          <div class="modal-actions">
            <button type="submit" class="btn primary" style="width:100%">Войти</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const form = root.querySelector('#login-form');
  const errEl = root.querySelector('#login-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.textContent = '';

    const username = root.querySelector('#login-username').value.trim();
    const password = root.querySelector('#login-password').value;

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Проверяем...';

    try {
      const { token, user } = await loginRequest(username, password);
      saveSession(token, user);
      navigate('/home');
    } catch (err) {
      const map = {
        invalid_credentials: 'Неверный логин или пароль',
        missing_credentials: 'Заполните все поля',
        server_misconfigured: 'Ошибка сервера',
        db_error: 'Ошибка базы данных',
      };
      errEl.textContent = map[err.message] || 'Ошибка входа: ' + err.message;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Войти';
    }
  });
}