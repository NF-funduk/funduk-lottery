// src/supabase.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let _sessionExpiredShown = false;

function handleSessionExpired() {
  sessionStorage.removeItem('funduk_token');
  sessionStorage.removeItem('funduk_user');

  if (_sessionExpiredShown) return;
  _sessionExpiredShown = true;

  alert('🔒 Сессия истекла. Пожалуйста, зайди заново.');
  if (location.hash !== '#/login') {
    location.hash = '#/login';
    setTimeout(() => location.reload(), 50);
  } else {
    location.reload();
  }
}

export async function loginRequest(username, password) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'login_failed');
  return data;
}

export async function callFunction(name, payload) {
  const token = sessionStorage.getItem('funduk_token');

  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (networkErr) {
    handleSessionExpired();
    throw new Error('session_expired');
  }

  if (res.status === 401 || res.status === 403) {
    handleSessionExpired();
    throw new Error('session_expired');
  }

  const data = await res.json();
  if (!res.ok) {
    if (
      data.error === 'invalid_token' ||
      data.error === 'no_token' ||
      data.error === 'forbidden'
    ) {
      handleSessionExpired();
      throw new Error('session_expired');
    }
    throw new Error(data.error || 'request_failed');
  }
  return data;
}

export const admin = {
  listUsers: () => callFunction('admin', { action: 'list_users' }),
  createUser: (username, status, balance) =>
    callFunction('admin', { action: 'create_user', username, status, balance }),
  updateUser: (user_id, username, status) =>
    callFunction('admin', { action: 'update_user', user_id, username, status }),
  deleteUser: (user_id) =>
    callFunction('admin', { action: 'delete_user', user_id }),
  grantBalance: (user_id, amount, reason) =>
    callFunction('admin', { action: 'grant_balance', user_id, amount, reason }),
  grantFreeTickets: (user_id, lottery_id, count) =>
    callFunction('admin', { action: 'grant_free_tickets', user_id, lottery_id, count }),
  resetPassword: (user_id) =>
    callFunction('admin', { action: 'reset_password', user_id }),
  userTransactions: (user_id) =>
    callFunction('admin', { action: 'user_transactions', user_id }),
  listLotteries: () =>
    callFunction('admin', { action: 'list_lotteries_for_admin' }),
  cancelLottery: (lottery_id) =>
    callFunction('admin', { action: 'cancel_lottery', lottery_id }),
  deleteLottery: (lottery_id) =>
    callFunction('admin', { action: 'delete_lottery', lottery_id }),
  listAllLotteries: () =>
    callFunction('admin', { action: 'list_all_lotteries' }),
};

export const lottery = {
  list: () => callFunction('lottery', { action: 'list' }),
  details: (lottery_id) => callFunction('lottery', { action: 'details', lottery_id }),
  tickets: (lottery_id) => callFunction('lottery', { action: 'tickets', lottery_id }),
  myFreeTickets: (lottery_id) =>
    callFunction('lottery', { action: 'my_free_tickets', lottery_id }),
  buy: (lottery_id, ticket_numbers, use_free) =>
    callFunction('lottery', { action: 'buy', lottery_id, ticket_numbers, use_free }),
  create: (payload) => callFunction('lottery', { action: 'create', ...payload }),
  draw: (lottery_id) => callFunction('lottery', { action: 'draw', lottery_id }),
  winners: (lottery_id) => callFunction('lottery', { action: 'winners', lottery_id }),
  all: () => callFunction('lottery', { action: 'all' }),
};

export const profile = {
  me: () => callFunction('profile', { action: 'me' }),
  lotteryHistory: () => callFunction('profile', { action: 'my_lottery_history' }),
  changePassword: (old_password, new_password) =>
    callFunction('profile', { action: 'change_password', old_password, new_password }),
  refreshToken: () => callFunction('profile', { action: 'refresh_token' }),
};

export const feedback = {
  send: (text) => callFunction('feedback', { text }),
};

export const chat = {
  list: (limit = 100) => callFunction('chat', { action: 'list', limit }),
  send: (text) => callFunction('chat', { action: 'send', text }),
};