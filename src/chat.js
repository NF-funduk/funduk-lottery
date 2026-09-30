import { supabase, chat } from './supabase.js';
import { getUser, isLoggedIn } from './auth.js';
import { showToast } from './toast.js';

const STATUS_LABELS = {
  intern: 'Стажёр',
  helper: 'Помощник',
  moderator: 'Модератор',
  admin: 'Админ',
};

let initialized = false;
let messages = [];
let isOpen = false;
let unreadCount = 0;
let currentUser = null;
let pollInterval = null;
let lastMessageId = null;

const EMOJIS = [
  '😀', '😄', '😂', '🤣', '😊', '😍', '😘', '😎', '🤔', '🙄',
  '😴', '😭', '😅', '🥲', '🤯', '🥳', '😱', '🤝', '👋', '👍',
  '👎', '👌', '✌️', '🙏', '💪', '🎉', '🔥', '💯', '⭐', '❤️',
  '💔', '💀', '💩', '🎁', '🎲', '🏆', '🍕', '🍔', '☕', '🍺',
  '🚀', '⚡', '🌙', '☀️', '🌈', '⚔️', '🛡️', '💰', '💎', '🎯',
];

export function initChatWidget() {
  if (initialized) return;
  if (!isLoggedIn()) return;
  initialized = true;

  currentUser = getUser();
  if (!currentUser) return;

  const widget = document.createElement('div');
  widget.id = 'chat-widget';
  widget.innerHTML = `
    <button class="chat-bubble" id="chat-bubble" title="Чат">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <span class="chat-bubble-badge hidden" id="chat-badge">0</span>
    </button>

    <div class="chat-window hidden" id="chat-window">
      <div class="chat-header">
        <div class="chat-title">
          <span>💬 Общий чат</span>
          <span class="chat-online-dot" title="Онлайн"></span>
        </div>
        <button class="chat-close" id="chat-close" title="Закрыть">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="chat-messages" id="chat-messages">
        <div class="chat-loading">Загрузка…</div>
      </div>
      <div class="chat-emoji-picker hidden" id="chat-emoji-picker"></div>
      <div class="chat-input-wrap">
        <button class="chat-emoji-btn" id="chat-emoji-btn" title="Смайлы">😊</button>
        <textarea class="chat-input" id="chat-input" placeholder="Написать сообщение…" rows="1" maxlength="500"></textarea>
        <button class="chat-send" id="chat-send" title="Отправить">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(widget);

  const picker = document.getElementById('chat-emoji-picker');
  picker.innerHTML = EMOJIS.map((e) => `<button class="emoji-btn">${e}</button>`).join('');

  const bubble = document.getElementById('chat-bubble');
  const win = document.getElementById('chat-window');
  const closeBtn = document.getElementById('chat-close');
  const sendBtn = document.getElementById('chat-send');
  const input = document.getElementById('chat-input');
  const messagesEl = document.getElementById('chat-messages');
  const badge = document.getElementById('chat-badge');
  const emojiBtn = document.getElementById('chat-emoji-btn');
  const emojiPicker = document.getElementById('chat-emoji-picker');

  async function openChat() {
    isOpen = true;
    win.classList.remove('hidden');
    bubble.classList.add('hidden');
    unreadCount = 0;
    updateBadge();

    await loadMessages(true);

    setTimeout(() => {
      input.focus();
      scrollToBottom();
    }, 50);

    startPolling();
  }

  function closeChat() {
    isOpen = false;
    win.classList.add('hidden');
    bubble.classList.remove('hidden');
    emojiPicker.classList.add('hidden');
    stopPolling();
  }

  bubble.addEventListener('click', openChat);
  closeBtn.addEventListener('click', closeChat);

  async function loadMessages(scroll = false) {
    try {
      const res = await chat.list(100);
      const newMessages = res.messages || [];

      const lastNew = newMessages[newMessages.length - 1];
      const lastCurrent = messages[messages.length - 1];

      if (newMessages.length === messages.length &&
          lastNew?.id === lastCurrent?.id) {
        return;
      }

      if (!isOpen && lastNew && lastNew.id !== lastMessageId) {
        unreadCount++;
        updateBadge();
      }

      messages = newMessages;
      if (lastNew) lastMessageId = lastNew.id;

      renderMessages();
      if (scroll) scrollToBottom();
    } catch (err) {
      if (isOpen) {
        messagesEl.innerHTML = `<div class="chat-error">Ошибка: ${escapeHtml(err.message)}</div>`;
      }
    }
  }

  function renderMessages() {
    if (messages.length === 0) {
      messagesEl.innerHTML = '<div class="chat-empty">Пока тихо. Напиши первым! 👋</div>';
      return;
    }

    messagesEl.innerHTML = messages
      .filter((m) => m && m.text && m.created_at)
      .map((m) => {
        const isMine = m.user_id === currentUser.id;
        const time = formatTime(m.created_at);
        return `
          <div class="chat-msg ${isMine ? 'mine' : 'theirs'}">
            <div class="chat-msg-head">
              <span class="chat-msg-name">${escapeHtml(m.username)}</span>
              ${m.user_status ? `<span class="role-badge chat-mini-badge" data-role="${m.user_status}">${STATUS_LABELS[m.user_status] || m.user_status}</span>` : ''}
              <span class="chat-msg-time">${time}</span>
            </div>
            <div class="chat-msg-text">${linkify(escapeHtml(m.text))}</div>
          </div>
        `;
      }).join('');
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;

    try {
      await chat.send(text);
      await loadMessages(true);
    } catch (err) {
      const map = {
        text_empty: 'Пустое сообщение',
        text_too_long: 'Слишком длинное',
      };
      showToast(map[err.message] || 'Ошибка: ' + err.message);
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }

  sendBtn.addEventListener('click', sendMessage);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });

  emojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    emojiPicker.classList.toggle('hidden');
  });

  picker.querySelectorAll('.emoji-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      input.value += btn.textContent;
      input.focus();
    });
  });

  document.addEventListener('click', (e) => {
    if (!emojiPicker.classList.contains('hidden') &&
        !emojiPicker.contains(e.target) &&
        e.target !== emojiBtn) {
      emojiPicker.classList.add('hidden');
    }
  });

  function startPolling() {
    if (pollInterval) return;
    pollInterval = setInterval(() => {
      loadMessages(false);
    }, 3000);
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  setInterval(() => {
    if (!isOpen) {
      loadMessages(false);
    }
  }, 10000);

  function updateBadge() {
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  loadMessages(false);
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function linkify(text) {
  return text.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
  );
}