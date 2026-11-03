// Заглушка: вход, ник, звёзды с сундуком и выход. Сама игра подключается на этапе 5.
const API = '/game/api';
const BUSY_RETRIES = 6;

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method, credentials: 'same-origin', cache: 'no-store',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let payload = null;
  try { payload = await response.json(); } catch { /* 204 и не-JSON */ }
  return { status: response.status, data: payload?.data ?? null, error: payload?.error ?? null };
}

function show(view) {
  $('loading').hidden = view !== 'loading';
  $('login').hidden = view !== 'login';
  $('island').hidden = view !== 'island';
}

function showLogin(message = '') {
  $('login-name').value = '';
  $('login-password').value = '';
  $('login-message').textContent = message;
  $('nickname').textContent = '';
  show('login');
  $('login-name').focus();
}

function showStars({ balance, chest }) {
  $('stars-balance').textContent = String(balance);
  $('chest-stars').textContent = String(chest);
  $('chest').hidden = chest <= 0;
}

// Звёзды считает сервер: страница только показывает итог.
async function loadStars() {
  try {
    const result = await call('/stars');
    if (result.status === 200) showStars(result.data);
  } catch { /* покажем при следующем входе */ }
}

function showIsland(nickname) {
  $('nickname').textContent = nickname;
  $('island-message').textContent = '';
  $('stars-balance').textContent = '…';
  $('chest').hidden = true;
  show('island');
  loadStars();
}

async function openChest() {
  $('chest-open').disabled = true;
  try {
    const result = await call('/stars/chest/open', { method: 'POST', body: {} });
    if (result.status === 200) showStars(result.data);
    else $('island-message').textContent = result.error?.message ?? 'Не получилось открыть сундук';
  } catch {
    $('island-message').textContent = 'Нет связи. Проверь интернет';
  } finally {
    $('chest-open').disabled = false;
  }
}

async function loadMe() {
  try {
    const result = await call('/me');
    if (result.status === 200) return showIsland(result.data.nickname);
    if (result.status === 401) return showLogin();
    return showLogin(result.error?.message ?? 'Игра временно недоступна. Попробуй позже');
  } catch {
    return showLogin('Нет связи. Проверь интернет');
  }
}

let busy = false;
async function login(event) {
  event.preventDefault();
  if (busy) return;
  const credentials = { login: $('login-name').value.trim(), password: $('login-password').value };
  if (!credentials.login || !credentials.password) { $('login-message').textContent = 'Введи логин и пароль'; return; }
  busy = true;
  $('login-submit').disabled = true;
  $('login-message').textContent = 'Входим…';
  try {
    // Когда за одним адресом входит целая группа, сервер может попросить подождать: повторяем сами.
    for (let attempt = 0; ; attempt += 1) {
      const result = await call('/login', { method: 'POST', body: credentials });
      if (result.status === 200) { $('login-password').value = ''; return showIsland(result.data.nickname); }
      if (result.error?.code === 'GAME_LOGIN_BUSY' && attempt < BUSY_RETRIES) { await sleep(1000 + Math.random() * 2000); continue; }
      $('login-password').value = '';
      $('login-message').textContent = result.error?.message ?? 'Не получилось войти. Попробуй ещё раз';
      return undefined;
    }
  } catch {
    $('login-message').textContent = 'Нет связи. Проверь интернет';
    return undefined;
  } finally {
    busy = false;
    $('login-submit').disabled = false;
  }
}

async function logout() {
  $('logout').disabled = true;
  try {
    const result = await call('/logout', { method: 'POST', body: {} });
    if (result.status !== 204) { $('island-message').textContent = 'Не получилось выйти. Попробуй ещё раз'; return; }
    showLogin();
  } catch {
    $('island-message').textContent = 'Нет связи. Проверь интернет';
  } finally {
    $('logout').disabled = false;
  }
}

$('login').addEventListener('submit', login);
$('logout').addEventListener('click', logout);
$('chest-open').addEventListener('click', openChest);
// Страница из кэша «Назад» могла остаться от прежнего входа: проверяем сессию заново.
window.addEventListener('pageshow', (event) => { if (event.persisted) loadMe(); });
loadMe();
