const TOKEN_KEY = 'funduk_token';
const USER_KEY  = 'funduk_user';

export function saveSession(token, user) {
  localStorage.setItem('funduk_token', token);
  localStorage.setItem('funduk_user', JSON.stringify(user));
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function isLoggedIn() {
  return !!getToken();
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}