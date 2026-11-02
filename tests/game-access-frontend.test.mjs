import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const flush = async () => { for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
const json = (status, body) => ({ ok: status < 400, status, json: async () => body });

async function loadModule({ role = 'director', respond }) {
  const state = { role, page: 'child', childTab: 'overview', selectedChild: 8 };
  const original = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
  const calls = []; const alerts = []; let renders = 0;
  globalThis.fetch = async (url, options = {}) => { calls.push({ url: String(url), method: options.method ?? 'GET' }); return respond(url, options); };
  globalThis.window = {
    icubeLegacy: { state, render() { renders += 1; } },
    child: () => '<div>Карточка</div>', alert: (text) => alerts.push(text), confirm: () => true,
  };
  globalThis.document = { querySelector: () => null };
  await import(`../src/frontend/game-access.mjs?case=${Date.now()}-${Math.random()}`);
  const restore = () => Object.assign(globalThis, original);
  return { state, calls, alerts, restore, render: () => globalThis.window.child(), renders: () => renders };
}

const htmlNotFound = () => ({ ok: false, status: 404, json: async () => { throw new SyntaxError('html'); } });

test('выключенный флаг: 404 без кода скрывает блок и запрашивается один раз', async () => {
  const page = await loadModule({ respond: htmlNotFound });
  try {
    assert.equal(page.render(), '<div>Карточка</div>');
    await flush();
    assert.equal(page.render(), '<div>Карточка</div>');
    page.state.selectedChild = 9; page.render(); await flush();
    assert.equal(page.calls.length, 1);
  } finally { page.restore(); }
});

test('404 с кодом API — это ошибка, а не отсутствие функции', async () => {
  const page = await loadModule({ respond: () => json(404, { error: { code: 'NOT_FOUND', message: 'Ребёнок не найден' } }) });
  try {
    page.render(); await flush();
    assert.match(page.render(), /Ребёнок не найден/);
    assert.match(page.render(), /icubeRetryGameAccess\(8\)/);
  } finally { page.restore(); }
});

test('ошибка сети показывается с кнопкой повтора, без бесконечных запросов', async () => {
  const page = await loadModule({ respond: () => { throw new TypeError('Failed to fetch'); } });
  try {
    page.render(); await flush();
    const html = page.render(); await flush();
    assert.match(html, /Нет связи с сервером/);
    assert.match(html, /Повторить/);
    assert.equal(page.calls.length, 1);
  } finally { page.restore(); }
});

test('ошибка сервера показывается с кодом, а 403 — с текстом API', async () => {
  const server = await loadModule({ respond: () => json(500, { error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } }) });
  try { server.render(); await flush(); assert.match(server.render(), /Ошибка сервера \(500\)/); } finally { server.restore(); }
  const forbidden = await loadModule({ role: 'partner', respond: () => json(403, { error: { code: 'FORBIDDEN', message: 'Ребёнок другого проекта недоступен' } }) });
  try { forbidden.render(); await flush(); assert.match(forbidden.render(), /Ребёнок другого проекта недоступен/); } finally { forbidden.restore(); }
});

test('повтор после ошибки загружает данные заново', async () => {
  let fail = true;
  const page = await loadModule({ respond: () => { if (fail) throw new TypeError('offline'); return json(200, { data: { manageable: true, exists: false, canCreate: true } }); } });
  try {
    page.render(); await flush();
    fail = false;
    await globalThis.window.icubeRetryGameAccess(8);
    assert.match(page.render(), /Создать доступ/);
  } finally { page.restore(); }
});

test('ошибка действия показывается, а не скрывается', async () => {
  const page = await loadModule({ respond: (url, options) => {
    if (options.method === 'DELETE') throw new TypeError('offline');
    return json(200, { data: { manageable: true, exists: true, login: 'misha.k', status: 'active', firstAccessOn: '2026-11-02' } });
  } });
  try {
    page.render(); await flush();
    await globalThis.window.icubeDisableGameAccess(8);
    assert.match(page.alerts[0], /Нет связи с сервером/);
  } finally { page.restore(); }
});

test('статусы доступа: логин с датой, директор вместо партнёра, закрытое создание', async () => {
  const cases = [
    [{ manageable: true, exists: true, login: '<b>x', status: 'active', firstAccessOn: '2026-11-02' }, /&lt;b&gt;x[\s\S]*2026-11-02[\s\S]*Разблокировать вход/],
    [{ manageable: true, exists: true, login: 'misha.k', status: 'blocked', firstAccessOn: '2026-11-02' }, /Восстановить с новым паролем/],
    [{ manageable: false }, /управляет директор/],
    [{ manageable: true, exists: false, canCreate: false }, /только активному ребёнку/],
  ];
  for (const [data, expected] of cases) {
    const page = await loadModule({ respond: () => json(200, { data }) });
    try { page.render(); await flush(); assert.match(page.render(), expected); } finally { page.restore(); }
  }
});

test('блок только у директора и партнёра и только на вкладке Обзор', async () => {
  for (const role of ['teacher', 'parent']) {
    const page = await loadModule({ role, respond: htmlNotFound });
    try { assert.equal(page.render(), '<div>Карточка</div>'); await flush(); assert.equal(page.calls.length, 0); } finally { page.restore(); }
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
