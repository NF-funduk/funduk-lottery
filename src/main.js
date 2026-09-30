import './style.css';
import { startRouter, register, navigate, setNotFound } from './router.js';
import { isLoggedIn, logout } from './auth.js';
import { profile } from './supabase.js';
import { renderLogin } from './pages/login.js';
import { renderHome } from './pages/home.js';
import { renderAdmin } from './pages/admin.js';
import { renderLottery } from './pages/lottery.js';
import { renderProfile } from './pages/profile.js';
import { renderHistory } from './pages/history.js';
import { initChatWidget } from './chat.js';

const root = document.querySelector('#app');

function guarded(handler) {
  return (params) => {
    if (!isLoggedIn()) {
      navigate('/login');
      return;
    }
    handler(root, params);
  };
}

register('/', () => {
  navigate(isLoggedIn() ? '/home' : '/login');
});

register('/login', () => {
  if (isLoggedIn()) {
    navigate('/home');
    return;
  }
  renderLogin(root);
});

register('/home', guarded((r) => renderHome(r)));
register('/profile', guarded((r) => renderProfile(r)));
register('/admin', guarded((r) => renderAdmin(r)));
register('/history', guarded((r) => renderHistory(r)));
register('/lottery/:id', guarded((r, params) => renderLottery(r, params.id)));

setNotFound(() => {
  document.title = 'HardEvo Lottery · 404';
  root.innerHTML = `
    <div class="container">
      <div class="not-found">
        <div class="nf-code">404</div>
        <div class="nf-text">Такой страницы нет</div>
        <button class="btn primary" id="nf-back">← На главную</button>
      </div>
      <div class="signature">by funduk</div>
    </div>
  `;
  root.querySelector('#nf-back').addEventListener('click', () => navigate('/home'));
});

startRouter();

function syncChat() {
  const isLogin = location.hash === '#/login' || location.hash === '#/';
  const widget = document.querySelector('#chat-widget');

  if (isLogin || !isLoggedIn()) {
    if (widget) widget.remove();
    return;
  }
  initChatWidget();
}

window.addEventListener('hashchange', syncChat);
setTimeout(syncChat, 100);

let heartbeatRunning = false;

async function checkSession() {
  if (!isLoggedIn()) return;
  if (heartbeatRunning) return;
  heartbeatRunning = true;

  try {
    await profile.me();
  } catch (err) {
    const msg = err?.message || '';
    if (
      msg.includes('session_expired') ||
      msg.includes('user_not_found') ||
      msg.includes('invalid_token') ||
      msg.includes('no_token')
    ) {
      logout();
      alert('🔒 Твой аккаунт больше не активен. Войди заново.');
      location.hash = '#/login';
      setTimeout(() => location.reload(), 50);
    }
  } finally {
    heartbeatRunning = false;
  }
}

window.addEventListener('load', () => {
  checkSession();
});

setInterval(() => {
  if (document.visibilityState === 'visible') {
    checkSession();
  }
}, 30 * 1000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkSession();
  }
});