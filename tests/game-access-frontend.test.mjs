import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const flush = async () => { for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
const htmlNotFound = () => ({ ok: false, status: 404, json: async () => { throw new SyntaxError('html'); } });
const offline = () => { throw new TypeError('Failed to fetch'); };
const base = '<div>Карточка</div>';
const access = { manageable: true, exists: true, login: 'misha.k', status: 'active', canLogin: true, firstAccessOn: '2026-11-02' };

async function loadModule({ role = 'director', respond, confirmed = false, user = { id: '2' } }) {
  const state = { role, page: 'child', childTab: 'overview', selectedChild: 8, authUser: user };
  const original = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, localStorage: globalThis.localStorage };
  const calls = []; const alerts = []; const dialog = { removed: 0 }; let renders = 0;
  const store = new Map(confirmed ? [['icube-game-access-available', '1']] : []);
  const page = { respond };
  globalThis.fetch = async (url, options = {}) => { calls.push({ url: String(url), method: options.method ?? 'GET' }); return page.respond(url, options); };
  globalThis.window = {
    icubeLegacy: { state, render() { renders += 1; state.renderHook?.(); } },
    child: () => base, alert: (text) => alerts.push(text), confirm: () => true,
  };
  const shown = [];
  globalThis.document = {
    querySelector: (selector) => (selector === '#game-credentials-dialog' && page.dialogOpen ? { remove() { dialog.removed += 1; } } : null),
    createElement: () => {
      const element = { values: {}, removed: false, addEventListener() {}, remove() { this.removed = true; }, querySelector(selector) {
        const name = selector.match(/data-value="(\w+)"/)?.[1];
        return { set textContent(value) { if (name) element.values[name] = value; } };
      } };
      return element;
    },
    body: { append: (element) => shown.push(element) },
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: {
    getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: (key) => store.delete(key),
  } });
  await import(`../src/frontend/game-access.mjs?case=${Date.now()}-${Math.random()}`);
  const restore = () => { Object.assign(globalThis, original); };
  return Object.assign(page, { shown, state, calls, alerts, dialog, store, restore, render: () => globalThis.window.child(), renders: () => renders });
}

test('выключенный флаг: 404 без кода скрывает блок, запрос один, лишней перерисовки нет', async () => {
  const page = await loadModule({ respond: htmlNotFound });
  try {
    assert.equal(page.render(), base);
    await flush();
    assert.equal(page.render(), base);
    page.state.selectedChild = 9; page.render(); await flush();
    assert.equal(page.calls.length, 1);
    assert.equal(page.renders(), 0);
    assert.equal(page.store.size, 0);
  } finally { page.restore(); }
});

test('неизвестное состояние: сеть, 502 и 401 не показывают игру и не вызывают перерисовку', async () => {
  const responses = [offline, () => json(502, null), () => ({ ok: false, status: 502, json: async () => { throw new SyntaxError('html'); } }),
    () => json(500, { error: { code: 'INTERNAL_ERROR', message: 'x' } }), () => json(401, { error: { code: 'UNAUTHENTICATED', message: 'Требуется вход' } })];
  for (const respond of responses) {
    const page = await loadModule({ respond });
    try {
      assert.equal(page.render(), base);
      await flush();
      assert.equal(page.render(), base);
      await flush();
      assert.equal(page.renders(), 0);
      assert.equal(page.calls.length, 1);
      assert.equal(page.store.size, 0);
    } finally { page.restore(); }
  }
});

test('игра подтверждена на этом устройстве: ошибка сети показывается с кнопкой повтора', async () => {
  const page = await loadModule({ respond: offline, confirmed: true });
  try {
    page.render(); await flush();
    const html = page.render(); await flush();
    assert.match(html, /Нет связи с сервером/);
    assert.match(html, /Повторить/);
    assert.equal(page.calls.length, 1);
  } finally { page.restore(); }
});

test('игра подтверждена: ошибка сервера показывается с кодом', async () => {
  const page = await loadModule({ respond: () => json(500, { error: { code: 'INTERNAL_ERROR', message: 'x' } }), confirmed: true });
  try { page.render(); await flush(); assert.match(page.render(), /Ошибка сервера \(500\)/); } finally { page.restore(); }
});

test('успешный ответ запоминается, поэтому следующие ошибки уже видны', async () => {
  const page = await loadModule({ respond: () => json(200, { data: access }) });
  try {
    page.render(); await flush();
    assert.equal(page.store.get('icube-game-access-available'), '1');
    page.respond = offline;
    page.state.selectedChild = 9; page.render(); await flush();
    assert.match(page.render(), /Нет связи с сервером/);
  } finally { page.restore(); }
});

test('404 без кода сбрасывает прежнее подтверждение: игру выключили', async () => {
  const page = await loadModule({ respond: htmlNotFound, confirmed: true });
  try { page.render(); await flush(); assert.equal(page.render(), base); assert.equal(page.store.size, 0); } finally { page.restore(); }
});

test('403 проверки сессии и ответ 200 от прокси не подтверждают игру', async () => {
  const responses = [() => json(403, { error: { code: 'FORBIDDEN', message: 'Партнёр не связан с одним активным проектом' } }),
    () => json(200, null), () => json(200, {}), () => json(200, { data: { status: 'ok' } }), () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('html'); } })];
  for (const respond of responses) {
    const page = await loadModule({ respond });
    try {
      assert.equal(page.render(), base); await flush();
      assert.equal(page.render(), base); await flush();
      assert.equal(page.renders(), 0); assert.equal(page.calls.length, 1); assert.equal(page.store.size, 0);
    } finally { page.restore(); }
  }
});

test('нет цикла запросов и перерисовок, когда перерисовка снова запрашивает карточку', async () => {
  for (const respond of [() => json(200, null), htmlNotFound, offline, () => json(200, { data: access })]) {
    const page = await loadModule({ respond });
    try {
      page.state.renderHook = () => globalThis.window.child();
      page.render();
      for (let i = 0; i < 5; i += 1) await flush();
      assert.ok(page.calls.length <= 1, String(page.calls.length));
    } finally { page.restore(); }
  }
});

test('запрет localStorage не ломает модуль: подтверждение живёт в памяти', async () => {
  const page = await loadModule({ respond: () => json(200, { data: access }) });
  try {
    globalThis.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
    page.render(); await flush();
    page.respond = offline;
    page.state.selectedChild = 9; page.render(); await flush();
    assert.match(page.render(), /Нет связи с сервером/);
  } finally { page.restore(); }
});

test('скрытая ошибка не остаётся навсегда: подтверждение игры повторяет загрузку', async () => {
  const page = await loadModule({ respond: offline });
  try {
    page.render(); await flush();
    page.respond = () => json(200, { data: access });
    page.state.selectedChild = 9; page.render(); await flush();
    page.state.selectedChild = 8; page.render(); await flush();
    assert.match(page.render(), /Логин: misha\.k/);
  } finally { page.restore(); }
});

test('успешный сброс показывает пароль, диалог закрывается при выходе, пароль не кешируется', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const page = await loadModule({ respond: (url, options) => json(200, { data: options.method === 'POST' ? { ...access, password: 'secret-word' } : access }) });
  try {
    page.render(); await flush();
    await globalThis.window.icubeResetGameAccess(8);
    assert.equal(page.shown[0].values.password, 'secret-word');
    assert.doesNotMatch(page.render(), /secret-word/);
    page.state.authUser = null;
    t.mock.timers.tick(600);
    assert.equal(page.shown[0].removed, true);
  } finally { page.restore(); }
});

test('код GAME_ подтверждает игру, а прочие ошибки показываются только после подтверждения', async () => {
  const proof = await loadModule({ respond: () => json(403, { error: { code: 'GAME_ACCESS_DIRECTOR_ONLY', message: 'Только директор' } }) });
  try { proof.render(); await flush(); assert.match(proof.render(), /Только директор/); assert.equal(proof.store.size, 1); } finally { proof.restore(); }
  const missing = await loadModule({ confirmed: true, respond: () => json(404, { error: { code: 'NOT_FOUND', message: 'Ребёнок не найден' } }) });
  try {
    missing.render(); await flush();
    assert.match(missing.render(), /Ребёнок не найден/);
    assert.match(missing.render(), /icubeRetryGameAccess\(8\)/);
  } finally { missing.restore(); }
  const forbidden = await loadModule({ role: 'partner', confirmed: true, respond: () => json(403, { error: { code: 'FORBIDDEN', message: 'Ребёнок другого проекта недоступен' } }) });
  try { forbidden.render(); await flush(); assert.match(forbidden.render(), /Ребёнок другого проекта недоступен/); } finally { forbidden.restore(); }
});

test('смена пользователя очищает кэш: партнёр не видит данных директора', async () => {
  const page = await loadModule({ respond: () => json(200, { data: access }) });
  try {
    page.render(); await flush();
    assert.match(page.render(), /misha\.k/);
    page.state.authUser = { id: '3' }; page.state.role = 'partner';
    page.respond = () => json(200, { data: { manageable: false } });
    assert.doesNotMatch(page.render(), /misha\.k/);
    await flush();
    const html = page.render();
    assert.doesNotMatch(html, /misha\.k/);
    assert.match(html, /управляет директор/);
    assert.equal(page.calls.length, 2);
  } finally { page.restore(); }
});

test('выход очищает кэш, а ответ, пришедший после смены пользователя, отбрасывается', async () => {
  let release;
  const page = await loadModule({ respond: () => new Promise((resolve) => { release = () => resolve(json(200, { data: access })); }) });
  try {
    page.render(); await flush();
    page.state.authUser = null; page.state.role = 'teacher';
    release(); await flush();
    page.state.authUser = { id: '3' }; page.state.role = 'partner';
    page.respond = () => json(200, { data: { manageable: false } });
    assert.doesNotMatch(page.render(), /misha\.k/);
    await flush();
    assert.doesNotMatch(page.render(), /misha\.k/);
  } finally { page.restore(); }
});

test('запоздавший ответ директору не попадает в кэш партнёра', async () => {
  let release;
  const page = await loadModule({ respond: () => new Promise((resolve) => { release = () => resolve(json(200, { data: access })); }) });
  try {
    page.render(); await flush();
    const late = release;
    page.state.authUser = { id: '3' }; page.state.role = 'partner';
    page.respond = () => json(200, { data: { manageable: false } });
    page.render(); await flush();
    late();
    await flush();
    const html = page.render();
    assert.doesNotMatch(html, /misha\.k/);
    assert.match(html, /управляет директор/);
  } finally { page.restore(); }
});

test('смена пользователя закрывает диалог с паролем и сбрасывает признак выключенной игры', async () => {
  const page = await loadModule({ respond: htmlNotFound });
  try {
    page.render(); await flush();
    page.dialogOpen = true;
    page.state.authUser = { id: '3' };
    page.respond = () => json(200, { data: access });
    page.render(); await flush();
    assert.equal(page.dialog.removed, 1);
    assert.match(page.render(), /misha\.k/);
  } finally { page.restore(); }
});

test('без авторизованного пользователя запросов нет', async () => {
  const page = await loadModule({ respond: htmlNotFound, user: null });
  try { page.render(); await flush(); assert.equal(page.calls.length, 0); } finally { page.restore(); }
});

test('повтор после ошибки загружает данные заново', async () => {
  const page = await loadModule({ respond: offline, confirmed: true });
  try {
    page.render(); await flush();
    page.respond = () => json(200, { data: { manageable: true, exists: false, canCreate: true } });
    await globalThis.window.icubeRetryGameAccess(8);
    assert.match(page.render(), /Создать доступ/);
  } finally { page.restore(); }
});

test('ошибка действия показывается, а состояние перечитывается с сервера', async () => {
  const page = await loadModule({ respond: (url, options) => {
    if (options.method === 'POST') throw new TypeError('offline');
    return json(200, { data: page.calls.length > 1 ? access : { manageable: true, exists: false, canCreate: true } });
  } });
  try {
    page.render(); await flush();
    await globalThis.window.icubeCreateGameAccess(8);
    assert.match(page.alerts[0], /Нет связи с сервером/);
    assert.match(page.render(), /Логин: misha\.k/);
  } finally { page.restore(); }
});

test('статусы доступа: логин с датой, закрытый вход, директор вместо партнёра, чужая учётка', async () => {
  const cases = [
    [{ ...access, login: '<b>x' }, /&lt;b&gt;x[\s\S]*2026-11-02[\s\S]*Разблокировать вход/],
    [{ ...access, status: 'blocked', canLogin: false }, /Отключён[\s\S]*Восстановить с новым паролем/],
    [{ ...access, canLogin: false }, /Вход закрыт: ребёнок не активен/],
    [{ manageable: false }, /управляет директор/],
    [{ manageable: true, exists: false, canCreate: false }, /только активному ребёнку/],
    [{ manageable: true, exists: true, invalid: true }, /не является детской/],
  ];
  for (const [data, expected] of cases) {
    const page = await loadModule({ respond: () => json(200, { data }) });
    try { page.render(); await flush(); assert.match(page.render(), expected); } finally { page.restore(); }
  }
});

test('блок только у директора и партнёра и только на вкладке Обзор', async () => {
  for (const role of ['teacher', 'parent']) {
    const page = await loadModule({ role, respond: htmlNotFound });
    try { assert.equal(page.render(), base); await flush(); assert.equal(page.calls.length, 0); } finally { page.restore(); }
  }
  const page = await loadModule({ respond: htmlNotFound });
  try { page.state.childTab = 'payments'; page.render(); await flush(); assert.equal(page.calls.length, 0); } finally { page.restore(); }
});

test('модуль входит в офлайн-оболочку PWA', async () => {
  const shell = await readFile(new URL('../src/frontend/pwa-shell.js', import.meta.url), 'utf8');
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(shell, /\.\/src\/frontend\/game-access\.mjs/);
  assert.match(index, /<script type="module" src="\.\/src\/frontend\/game-access\.mjs">/);
});
