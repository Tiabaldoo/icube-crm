import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const flush = async () => { for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
const htmlNotFound = () => ({ ok: false, status: 404, json: async () => { throw new SyntaxError('html'); } });
const access = { manageable: true, exists: true, login: 'misha.k', status: 'active', canLogin: true, firstAccessOn: '2026-11-02' };
const stars = {
  profile: true, maxStars: 10, confirmAbove: 3, wallet: { balance: 4, chest: 3, debt: 0 },
  entries: [{ id: '1', kind: 'attendance', amount: 3, createdAt: '2026-11-03T01:00:00.000Z' }],
  bonuses: [{ id: '5', amount: 2, reason: '<b>Помог</b>', createdByUserId: '2', createdByName: 'Директор', createdAt: '2026-11-03T01:00:00.000Z', revoked: null, canRevoke: true }],
};

// Оба модуля карточки, как на странице: сначала доступ, потом звёзды.
// Строка ученика в экране занятия — как её собирает crm-ui.js (studentCheck).
const EXISTING_MORE = '<button class="btn student-more trial-more" onclick="visitTrialOptionsV121(12,false)">⋯</button>';
const studentRow = (child, flags = '', more = '') => '<div class="student-check lesson-student-card"><div class="lesson-student-name-cell"><div class="lesson-student-name">'
  + child.name + '</div>' + (flags ? '<div class="lesson-student-flags">' + flags + '</div>' : '') + '</div><div class="lesson-student-attendance-slot"><input type="checkbox"></div>'
  + '<div class="lesson-photo-control-slot"></div><div class="lesson-student-more-slot">' + more + '</div></div>';
const stubRow = (child) => studentRow(child, child.birthday ? '<span class="lesson-student-flag birthday">🎂</span>' : '', child.menu ? EXISTING_MORE : '');

async function loadModules({ role = 'director', respond, inputs = { amount: '2', reason: 'Лучший проект' }, confirm = () => true, children = [] }) {
  const state = { role, page: role === 'teacher' ? 'teacherLesson' : 'child', childTab: 'overview', selectedChild: 8, authUser: { id: '2' }, children, modal: null };
  const original = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, localStorage: globalThis.localStorage };
  const calls = []; const alerts = [];
  const page = { respond };
  globalThis.fetch = async (url, options = {}) => { calls.push({ url: String(url), method: options.method ?? 'GET', headers: options.headers ?? {}, body: options.body ? JSON.parse(options.body) : undefined }); return page.respond(String(url), options); };
  globalThis.window = { icubeLegacy: { state, render() {} }, child: () => '<div>Карточка</div>', alert: (text) => alerts.push(text), confirm, prompt: () => 'Ошибка',
    studentCheck: (child) => stubRow(child),
    // Существующие меню «⋯», как в crm-ui.js и api-sync.mjs.
    visitTrialOptionsV121: (childId) => { state.modal = '<h3>Тип посещения</h3><div class="modal-actions"><button class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" onclick="forceVisitTrialV121(' + childId + ',true,false)">Сделать ознакомительным</button></div>'; },
    icubeExtraOptions: (childId) => { state.modal = '<h3>Дополнительные действия</h3><div class="modal-actions" style="flex-wrap:wrap"><button class="btn danger" onclick="icubeApi.extraRemove(' + childId + ')">Удалить из занятия</button><button class="btn" onclick="closeModal()">Отмена</button></div>'; } };
  globalThis.document = {
    querySelector: (selector) => {
      if (selector === '#game-bonus-amount') return { value: inputs.amount };
      if (selector === '#game-bonus-reason') return { value: inputs.reason };
      return null;
    },
    createElement: () => ({}), body: { append() {} },
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: { getItem: () => null, setItem() {}, removeItem() {} } });
  const tag = `${Date.now()}-${Math.random()}`;
  await import(`../src/frontend/game-access.mjs?case=${tag}`);
  await import(`../src/frontend/game-stars.mjs?case=${tag}`);
  const restore = () => { Object.assign(globalThis, original); };
  return Object.assign(page, { state, calls, alerts, restore, render: () => globalThis.window.child() });
}

const starsCalls = (page) => page.calls.filter((call) => call.url.includes('/game-stars'));

test('выключенный флаг: звёзды не запрашиваются вовсе', async () => {
  const page = await loadModules({ respond: htmlNotFound });
  try {
    page.render(); await flush(); page.render(); await flush();
    assert.equal(starsCalls(page).length, 0);
    assert.equal(page.calls.length, 1);
  } finally { page.restore(); }
});

test('преподаватель и родитель запросов не делают', async () => {
  for (const role of ['teacher', 'parent']) {
    const page = await loadModules({ role, respond: () => json(200, { data: access }) });
    try { page.render(); await flush(); assert.equal(page.calls.length, 0, role); } finally { page.restore(); }
  }
});

test('после подтверждения игры блок показывает итог сервера и экранирует причину', async () => {
  const page = await loadModules({ respond: (url) => json(200, { data: url.includes('/game-stars') ? stars : access }) });
  try {
    page.render(); await flush(); page.render(); await flush();
    const html = page.render();
    assert.equal(starsCalls(page).length, 1);
    assert.match(html, /На балансе: 4 ⭐/); assert.match(html, /В сундуке: 3/);
    assert.match(html, /&lt;b&gt;Помог&lt;\/b&gt;/); assert.doesNotMatch(html, /<b>Помог<\/b>/);
    assert.match(html, /icubeRevokeGameBonus\(8,'5'\)/);
  } finally { page.restore(); }
});

test('выдача: ключ идемпотентности, повтор после сбоя сети — тот же ключ, после ответа — новый', async () => {
  let failNext = true;
  const page = await loadModules({ respond: (url, options) => {
    if (url.includes('/game-stars/bonuses')) {
      if (failNext) { failNext = false; throw new TypeError('Failed to fetch'); }
      return json(201, { data: { ...stars, bonus: { id: '6' }, replayed: false } });
    }
    return json(200, { data: url.includes('/game-stars') ? stars : access });
  } });
  try {
    page.render(); await flush(); page.render(); await flush();
    await window.icubeGrantGameBonus(8);
    await window.icubeGrantGameBonus(8);
    await window.icubeGrantGameBonus(8);
    const posts = page.calls.filter((call) => call.method === 'POST');
    assert.equal(posts.length, 3);
    assert.deepEqual(posts[0].body, { amount: 2, reason: 'Лучший проект' });
    assert.equal(posts[0].headers['Idempotency-Key'], posts[1].headers['Idempotency-Key']);
    assert.notEqual(posts[1].headers['Idempotency-Key'], posts[2].headers['Idempotency-Key']);
    assert.equal(page.alerts.length, 1);
  } finally { page.restore(); }
});

test('больше трёх звёзд — подтверждение; отказ от подтверждения ничего не отправляет', async () => {
  let answer = false;
  const page = await loadModules({ inputs: { amount: '5', reason: 'Олимпиада' }, confirm: () => answer,
    respond: (url) => json(url.includes('/bonuses') ? 201 : 200, { data: url.includes('/game-stars') ? stars : access }) });
  try {
    page.render(); await flush(); page.render(); await flush();
    await window.icubeGrantGameBonus(8);
    assert.equal(page.calls.filter((call) => call.method === 'POST').length, 0);
    answer = true;
    await window.icubeGrantGameBonus(8);
    assert.deepEqual(page.calls.find((call) => call.method === 'POST').body, { amount: 5, reason: 'Олимпиада', confirmed: true });
  } finally { page.restore(); }
});

test('модуль звёзд входит в оболочку PWA и подключается после модуля доступа', async () => {
  const shell = await readFile(new URL('../src/frontend/pwa-shell.js', import.meta.url), 'utf8');
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(shell, /\.\/src\/frontend\/game-stars\.mjs/);
  assert.ok(index.indexOf('game-access.mjs') < index.indexOf('game-stars.mjs'));
});

const teacherChildren = [{ id: 8, name: 'Миша', gameStars: true }, { id: 9, name: 'Аня' }, { id: 12, name: 'Петя', gameStars: true, birthday: true, menu: true }];
const stripMarker = (child) => { const { gameStars, ...rest } = child; return rest; };

test('без признака (игра выключена, нет учётки или доступ отключён): строки и меню прежние, запросов нет', async () => {
  const page = await loadModules({ role: 'teacher', children: teacherChildren.map(stripMarker), respond: () => assert.fail('лишний запрос') });
  try {
    for (const child of page.state.children) assert.equal(window.studentCheck(child, {}, false), stubRow(child));
    window.visitTrialOptionsV121(12, false);
    assert.doesNotMatch(page.state.modal, /game-stars-open/);
    window.icubeExtraOptions(12);
    assert.doesNotMatch(page.state.modal, /game-stars-open/);
    window.icubeGameStarsMenu(8); window.icubeOpenGameStars(8);
    await flush();
    assert.equal(page.calls.length, 0);
    assert.doesNotMatch(String(page.state.modal), /Звёзды в игре/);
  } finally { page.restore(); }
});

test('признак есть, меню «⋯» уже было: пункт добавляется первым, остальные пункты не меняются', async () => {
  const page = await loadModules({ role: 'teacher', children: teacherChildren, respond: () => assert.fail('лишний запрос') });
  try {
    assert.equal(window.studentCheck(teacherChildren[2], {}, false), stubRow(teacherChildren[2]), 'строка с меню не меняется');
    window.visitTrialOptionsV121(12, false);
    assert.match(page.state.modal, /<div class="modal-actions"><button class="btn game-stars-open" type="button" onclick="icubeOpenGameStars\(12\)">⭐ Звёзды в игре<\/button><button class="btn" onclick="closeModal\(\)">Отмена<\/button><button class="btn primary"/);
    assert.equal(page.state.modal.match(/game-stars-open/g).length, 1);
    window.icubeExtraOptions(12);
    assert.match(page.state.modal, /style="flex-wrap:wrap"><button class="btn game-stars-open"[^]*Удалить из занятия[^]*Отмена/);
    assert.equal(page.calls.length, 0, 'до выбора пункта запросов нет');
  } finally { page.restore(); }
});

test('признак есть, меню не было: в пустой ячейке «⋯» кнопка с одним пунктом, строка отметок не меняется', async () => {
  const page = await loadModules({ role: 'teacher', children: teacherChildren, respond: () => assert.fail('лишний запрос') });
  try {
    const row = window.studentCheck(teacherChildren[0], {}, false);
    assert.equal(row, stubRow(teacherChildren[0]).replace('<div class="lesson-student-more-slot"></div>',
      '<div class="lesson-student-more-slot"><button class="btn student-more trial-more" aria-label="Дополнительные действия" title="Дополнительные действия" onclick="icubeGameStarsMenu(8)">⋯</button></div>'));
    assert.doesNotMatch(row, /lesson-student-flags/);
    window.icubeGameStarsMenu(8);
    assert.match(page.state.modal, /Дополнительные действия[^]*⭐ Звёзды в игре[^]*Отмена/);
    assert.doesNotMatch(window.studentCheck(teacherChildren[1], {}, false), /icubeGameStarsMenu/);
  } finally { page.restore(); }
});

test('у директора и партнёра в экране занятия ни кнопки, ни пункта, даже если признак есть', async () => {
  for (const role of ['director', 'partner']) {
    const page = await loadModules({ role, children: teacherChildren, respond: htmlNotFound });
    try {
      assert.equal(window.studentCheck(teacherChildren[0], {}, false), stubRow(teacherChildren[0]), role);
      window.visitTrialOptionsV121(12, false);
      assert.doesNotMatch(page.state.modal, /game-stars-open/, role);
    } finally { page.restore(); }
  }
});

test('пункт открывает окно звёзд, выдача и отзыв идут через тот же API', async () => {
  const page = await loadModules({ role: 'teacher', children: teacherChildren, respond: (url) => json(url.includes('/bonuses') ? 201 : 200, { data: { ...stars, accessActive: true, bonus: { id: '6' } } }) });
  try {
    window.icubeGameStarsMenu(8);
    window.icubeOpenGameStars(8);
    assert.match(page.state.modal, /data-game-stars-modal="8"/); assert.match(page.state.modal, /Загружаем/);
    await flush();
    assert.deepEqual(page.calls.map((call) => call.url), ['/api/v1/children/8/game-stars']);
    assert.match(page.state.modal, /На балансе: 4 ⭐/); assert.match(page.state.modal, /⭐ Миша/); assert.match(page.state.modal, /Выдать/);
    await window.icubeGrantGameBonus(8);
    const post = page.calls.find((call) => call.method === 'POST');
    assert.equal(post.url, '/api/v1/children/8/game-stars/bonuses'); assert.ok(post.headers['Idempotency-Key']);
    await window.icubeRevokeGameBonus(8, '5');
    assert.equal(page.calls.at(-1).url, '/api/v1/children/8/game-stars/bonuses/5/revoke');
    page.state.modal = null;
    await window.icubeRetryGameStars(8);
    assert.equal(page.state.modal, null, 'закрытое окно не открывается снова');
  } finally { page.restore(); }
});

test('доступ отключили после загрузки списка: окно берёт состояние с сервера — звёзды видны, выдачи нет', async () => {
  const inactive = { ...stars, accessActive: false, bonuses: stars.bonuses.map((bonus) => ({ ...bonus, canRevoke: false })) };
  const page = await loadModules({ role: 'teacher', children: teacherChildren, respond: () => json(200, { data: inactive }) });
  try {
    window.icubeOpenGameStars(8);
    await flush();
    assert.match(page.state.modal, /На балансе: 4 ⭐/);
    assert.match(page.state.modal, /Игровой доступ ребёнка не активен: звёзды сохранены/);
    assert.doesNotMatch(page.state.modal, /icubeGrantGameBonus|icubeRevokeGameBonus/);
  } finally { page.restore(); }
});

test('отказ сервера показывается в окне, признак не обходит проверку прав', async () => {
  const page = await loadModules({ role: 'teacher', children: teacherChildren, respond: () => json(403, { error: { code: 'FORBIDDEN', message: 'Ребёнок вне вашей зоны доступа' } }) });
  try {
    window.icubeOpenGameStars(8);
    await flush();
    assert.match(page.state.modal, /Ребёнок вне вашей зоны доступа/);
  } finally { page.restore(); }
});

test('устаревший признак из офлайн-снимка, игра выключена: один ответ 404 убирает пункт и кнопку, без повторов', async () => {
  const page = await loadModules({ role: 'teacher', children: teacherChildren, respond: htmlNotFound });
  try {
    window.icubeOpenGameStars(8);
    await flush();
    assert.equal(page.calls.length, 1);
    assert.equal(page.state.modal, null);
    assert.equal(window.studentCheck(teacherChildren[0], {}, false), stubRow(teacherChildren[0]));
    window.visitTrialOptionsV121(12, false);
    assert.doesNotMatch(page.state.modal, /game-stars-open/);
    window.icubeOpenGameStars(12);
    await flush();
    assert.equal(page.calls.length, 1);
  } finally { page.restore(); }
});

test('без сети пункта нет: звёзды всё равно не загрузить, офлайн-данные не используются', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
  const page = await loadModules({ role: 'teacher', children: teacherChildren, respond: () => assert.fail('лишний запрос') });
  try {
    assert.equal(window.studentCheck(teacherChildren[0], {}, false), stubRow(teacherChildren[0]));
    window.visitTrialOptionsV121(12, false);
    assert.doesNotMatch(page.state.modal, /game-stars-open/);
  } finally {
    page.restore();
    if (original) Object.defineProperty(globalThis, 'navigator', original); else delete globalThis.navigator;
  }
});
