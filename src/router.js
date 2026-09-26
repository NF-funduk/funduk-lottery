const routes = {};
let notFoundHandler = () => {};

export function register(path, handler) {
  routes[path] = handler;
}

export function setNotFound(handler) {
  notFoundHandler = handler;
}

export function navigate(path) {
  if (location.hash === '#' + path) return;
  location.hash = path;
}

export function currentPath() {
  const h = location.hash.replace(/^#/, '');
  return h || '/';
}

export function startRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

function handleRoute() {
  const path = currentPath();

  // точное совпадение
  if (routes[path]) {
    routes[path]();
    return;
  }

  // match /lottery/:id
  for (const pattern of Object.keys(routes)) {
    if (!pattern.includes(':')) continue;
    const params = matchPattern(pattern, path);
    if (params) {
      routes[pattern](params);
      return;
    }
  }

  notFoundHandler();
}

function matchPattern(pattern, path) {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i];
    const v = pathParts[i];
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(v);
    } else if (p !== v) {
      return null;
    }
  }
  return params;
}