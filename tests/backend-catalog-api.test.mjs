import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import { createApiRouter } from '../backend/src/routes.mjs';
import { ApiProblem, createMysqlCatalog } from '../backend/src/catalog.mjs';
import { calculateLessonsCredit, createMysqlPayments } from '../backend/src/payments.mjs';

function memoryCatalog() {
  let nextEnrollmentId = 101;
  const data = {
    projects: [{ id: 1, code: 'icube-robots', name: 'iCubeRobots', active: true }],
    directions: [{ id: 1, code: 'robotics', name: 'Робототехника', active: true }],
    sites: [], teachers: [], groups: [], children: [],
  };
  const next = (resource) => Math.max(0, ...data[resource].map((item) => item.id)) + 1;
  const get = async (resource, rawId) => {
    const item = data[resource].find((entry) => entry.id === Number(rawId));
    if (!item) throw new ApiProblem(404, 'NOT_FOUND', 'Запись не найдена');
    return structuredClone(item);
  };
  return {
    data,
    list: async (resource) => structuredClone(data[resource]),
    get,
    create: async (resource, body) => {
      const item = { id: next(resource), ...structuredClone(body) };
      if (resource === 'teachers') item.directions = body.directionIds.map((directionId) => ({ id: directionId, name: data.directions.find((direction) => direction.id === directionId).name }));
      if (resource === 'children') { item.enrollments = []; item.guardian = body.guardian; }
      data[resource].push(item); return structuredClone(item);
    },
    update: async (resource, rawId, body) => { const item = data[resource].find((entry) => entry.id === Number(rawId)); Object.assign(item, structuredClone(body)); return structuredClone(item); },
    createEnrollment: async (rawChildId, body) => {
      const child = data.children.find((item) => item.id === Number(rawChildId));
      const enrollment = { id: nextEnrollmentId++, ...structuredClone(body), directionName: data.directions.find((direction) => direction.id === body.directionId).name };
      child.enrollments.push(enrollment); return structuredClone(enrollment);
    },
    updateEnrollment: async (rawId, body) => { const enrollment = data.children.flatMap((child) => child.enrollments).find((item) => item.id === Number(rawId)); Object.assign(enrollment, structuredClone(body)); return structuredClone(enrollment); },
    deleteChild: async (rawId) => {
      const child = data.children.find((item) => item.id === Number(rawId));
      if (child.hasHistory) throw new ApiProblem(409, 'CHILD_HAS_HISTORY', 'Ребёнка с историей удалить нельзя');
      data.children = data.children.filter((item) => item.id !== Number(rawId));
    },
  };
}

const catalog = memoryCatalog();
function memoryPayments(catalogStore) {
  let nextId = 1;
  const records = [];
  const balanceValues = new Map();
  const prices = new Map();
  const scaled = (value) => {
    const [whole, fraction = ''] = String(value).split('.');
    return BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, '0').slice(0, 8));
  };
  const decimal = (value) => `${value / 100000000n}.${String(value % 100000000n).padStart(8, '0')}`;
  const change = (enrollmentId, delta) => balanceValues.set(Number(enrollmentId), decimal((scaled(balanceValues.get(Number(enrollmentId)) ?? '0.00000000') + scaled(delta))));
  const findEnrollment = (rawId) => {
    for (const child of catalogStore.data.children) {
      const enrollment = child.enrollments.find((item) => item.id === Number(rawId));
      if (enrollment) return { child, enrollment };
    }
    throw new ApiProblem(404, 'ENROLLMENT_NOT_FOUND', 'Направление ребёнка не найдено');
  };
  const priceAt = (enrollmentId, date) => {
    const configured = prices.get(enrollmentId);
    if (!Array.isArray(configured)) return configured;
    return configured
      .filter((version) => version.validFrom <= date && (!version.validTo || version.validTo > date))
      .sort((left, right) => right.validFrom.localeCompare(left.validFrom))[0]?.price;
  };
  const apiRecord = (record) => structuredClone(record);
  return {
    prices, balanceValues,
    list: async (filters = {}) => records.filter((record) => !filters.childId || record.childId === String(filters.childId)).map(apiRecord),
    get: async (rawId) => { const record = records.find((item) => item.id === String(rawId)); if (!record) throw new ApiProblem(404, 'NOT_FOUND', 'Оплата не найдена'); return apiRecord(record); },
    create: async (body) => {
      const { child, enrollment } = findEnrollment(body.enrollmentId);
      const priceSnapshot = priceAt(enrollment.id, body.paidOn);
      const record = { id: String(nextId++), enrollmentId: String(enrollment.id), childId: String(child.id), childName: child.name,
        directionId: String(enrollment.directionId), directionName: enrollment.directionName, paidOn: body.paidOn, amount: String(body.amount),
        priceSnapshot, lessonsCredit: calculateLessonsCredit(body.amount, priceSnapshot), method: body.method, groupId: enrollment.groupId == null ? null : String(enrollment.groupId), projectId: '1' };
      records.push(record); change(enrollment.id, record.lessonsCredit); return apiRecord(record);
    },
    update: async (rawId, body) => {
      const record = records.find((item) => item.id === String(rawId));
      change(record.enrollmentId, `-${record.lessonsCredit}`);
      const { child, enrollment } = findEnrollment(body.enrollmentId ?? record.enrollmentId);
      const priceSnapshot = body.priceSnapshot ?? (String(enrollment.id) === record.enrollmentId ? record.priceSnapshot : priceAt(enrollment.id, body.paidOn ?? record.paidOn));
      Object.assign(record, { enrollmentId: String(enrollment.id), childId: String(child.id), directionId: String(enrollment.directionId), directionName: enrollment.directionName,
        paidOn: body.paidOn ?? record.paidOn, amount: String(body.amount ?? record.amount), priceSnapshot,
        lessonsCredit: calculateLessonsCredit(body.amount ?? record.amount, priceSnapshot), method: body.method ?? record.method });
      change(record.enrollmentId, record.lessonsCredit); return apiRecord(record);
    },
    remove: async (rawId) => { const index = records.findIndex((item) => item.id === String(rawId)); const [record] = records.splice(index, 1); change(record.enrollmentId, `-${record.lessonsCredit}`); },
    balances: async () => [...balanceValues].map(([enrollmentId, balanceLessons]) => ({ enrollmentId: String(enrollmentId), balanceLessons })),
  };
}
const paymentStore = memoryPayments(catalog);
let server;
let baseUrl;
before(async () => {
  const testAuth = (request, _response, next) => { request.auth = { userId: '1', displayName: 'Тестовый директор', roles: ['director'], teacherId: null, sessionId: 'test' }; next(); };
  const app = express(); app.use(express.json()); app.use('/api/v1', createApiRouter({ query: async () => [[]] }, { catalog, payments: paymentStore, testAuth }));
  app.use((error, _request, response, _next) => response.status(error.status ?? 500).json({ error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message } }));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(() => new Promise((resolve) => server.close(resolve)));
async function request(path, method = 'GET', body) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const payload = response.status === 204 ? null : await response.json(); return { response, payload };
}

test('MySQL-оплата задним числом выбирает цену на paidOn и создаёт balance lot', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('FROM child_enrollments e')) {
        assert.equal(params.priceDate, '2026-08-20');
        assert.doesNotMatch(sql, /NOW\(6\)/);
        return [[{ id: 7, child_id: 8, direction_id: 1, group_id: 9, project_id: 1, balance_lessons: '-1.00000000', current_price: params.priceDate < '2026-09-01' ? '1025.00' : '820.00' }]];
      }
      if (sql.includes('INSERT INTO payments')) return [{ insertId: 11 }];
      if (sql.includes('INSERT INTO balance_entries')) return [{ insertId: 12 }];
      return [{ affectedRows: 1 }];
    },
  };
  const pool = {
    getConnection: async () => connection,
    query: async () => [[{ id: 11, enrollment_id: 7, child_id: 8, child_name: 'Тест', direction_id: 1,
      direction_name: 'Робототехника', group_id_snapshot: 9, project_id_snapshot: 1, paid_on: '2026-08-20',
      amount: '2050.00', price_snapshot: '1025.00', lessons_credit: '2.00000000', method: 'cashless', note: null }]],
  };
  const payment = await createMysqlPayments(pool).create({ enrollmentId: 7, paidOn: '2026-08-20', amount: '2050.00', method: 'cashless' });
  assert.equal(payment.priceSnapshot, '1025.00');
  assert.equal(payment.lessonsCredit, '2.00000000');
  const lot = calls.find((call) => call.sql.includes('INSERT INTO balance_lots'));
  assert.equal(lot.params.entryId, 12);
  assert.equal(lot.params.price, '1025.00');
  assert.equal(lot.params.remainingLessons, '1.00000000');
});

test('первый API-срез сохраняет справочники, ребёнка и независимое направление', async () => {
  const site = await request('/sites', 'POST', { name: 'Тестовая площадка', shortName: 'Тест', active: true });
  assert.equal(site.response.status, 201);
  const teacher = await request('/teachers', 'POST', { name: 'Тестовый преподаватель', directionIds: [1], active: true });
  const group = await request('/groups', 'POST', { name: 'Роботы · Пн 10:00', directionId: 1, siteId: site.payload.data.id, projectId: 1, teacherId: teacher.payload.data.id, weekday: 1, startTime: '10:00', endTime: '11:30', startsOn: '2026-09-14', active: true });
  const child = await request('/children', 'POST', { name: 'Тестовый Ребёнок', status: 'active', guardian: { name: 'Родитель', phone: '+70000000000' } });
  const enrollment = await request(`/children/${child.payload.data.id}/enrollments`, 'POST', { directionId: 1, groupId: group.payload.data.id, status: 'active', individualPrice: 875 });
  assert.equal(enrollment.response.status, 201);
  const reread = await request(`/children/${child.payload.data.id}`);
  assert.equal(reread.payload.data.name, 'Тестовый Ребёнок');
  assert.equal(reread.payload.data.enrollments[0].groupId, group.payload.data.id);
  assert.equal(reread.payload.data.enrollments[0].individualPrice, 875);
});

test('API блокирует физическое удаление ребёнка с историей', async () => {
  const child = catalog.data.children[0]; child.hasHistory = true;
  const result = await request(`/children/${child.id}`, 'DELETE');
  assert.equal(result.response.status, 409);
  assert.equal(result.payload.error.code, 'CHILD_HAS_HISTORY');
  assert.ok(catalog.data.children.some((item) => item.id === child.id));
});

test('подтверждение созданного преподавателем ребёнка сохраняется в MySQL', async () => {
  let needsDirectorReview = true;
  let savedReview;
  const query = async (sql, params = {}) => {
    if (sql.includes('FROM children c LEFT JOIN child_guardians')) return [[{
      id: 8, full_name: 'Новый Ребёнок', birth_date: null, school: null, grade: null, status: 'lead', note: null,
      needs_director_review: needsDirectorReview, guardian_name: null, guardian_phone: null,
    }]];
    if (sql.includes('FROM child_enrollments e JOIN directions')) return [[]];
    if (sql.startsWith('UPDATE children SET')) {
      savedReview = params.review;
      needsDirectorReview = params.review;
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  const connection = { query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  const child = await createMysqlCatalog({ query, getConnection: async () => connection }).update('children', 8, { needsDirectorReview: false });
  assert.equal(savedReview, false);
  assert.equal(child.needsDirectorReview, false);
});

test('API оплат сохраняет снимки цены и независимые балансы', async (t) => {
  catalog.data.directions.push({ id: 2, code: 'programming', name: 'Программирование', active: true });
  const child = await request('/children', 'POST', { name: 'Финансовый Тест', status: 'active' });
  const robotics = await request(`/children/${child.payload.data.id}/enrollments`, 'POST', { directionId: 1, status: 'active' });
  const programming = await request(`/children/${child.payload.data.id}/enrollments`, 'POST', { directionId: 2, status: 'active' });
  paymentStore.prices.set(robotics.payload.data.id, '1025.00');
  paymentStore.prices.set(programming.payload.data.id, '1125.00');
  let firstPayment;

  await t.test('4100 ₽ по 1025 ₽ дают ровно 4 занятия', async () => {
    firstPayment = await request('/payments', 'POST', { enrollmentId: robotics.payload.data.id, paidOn: '2026-09-14', amount: '4100.00', method: 'cashless' });
    assert.equal(firstPayment.payload.data.lessonsCredit, '4.00000000');
    assert.equal(paymentStore.balanceValues.get(robotics.payload.data.id), '4.00000000');
  });
  await t.test('старая оплата сохраняет снимок после изменения текущей цены', async () => {
    paymentStore.prices.set(robotics.payload.data.id, '820.00');
    const reread = await request(`/payments/${firstPayment.payload.data.id}`);
    assert.equal(reread.payload.data.priceSnapshot, '1025.00');
    assert.equal(reread.payload.data.lessonsCredit, '4.00000000');
  });
  await t.test('оплата задним числом использует цену периода оплаты', async () => {
    const historicalChild = await request('/children', 'POST', { name: 'Тест прошлой цены', status: 'active' });
    const historicalEnrollment = await request(`/children/${historicalChild.payload.data.id}/enrollments`, 'POST', { directionId: 1, status: 'active' });
    paymentStore.prices.set(historicalEnrollment.payload.data.id, [
      { validFrom: '2026-01-01', validTo: '2026-09-01', price: '1025.00' },
      { validFrom: '2026-09-01', validTo: null, price: '820.00' },
    ]);
    const backdated = await request('/payments', 'POST', { enrollmentId: historicalEnrollment.payload.data.id, paidOn: '2026-08-20', amount: '2050.00', method: 'cashless' });
    assert.equal(backdated.payload.data.priceSnapshot, '1025.00');
    assert.equal(backdated.payload.data.lessonsCredit, '2.00000000');
  });
  let secondPayment;
  await t.test('новая оплата использует новую цену', async () => {
    secondPayment = await request('/payments', 'POST', { enrollmentId: robotics.payload.data.id, paidOn: '2026-09-15', amount: '820.00', method: 'cash' });
    assert.equal(secondPayment.payload.data.priceSnapshot, '820.00');
    assert.equal(secondPayment.payload.data.lessonsCredit, '1.00000000');
  });
  await t.test('удаление полностью отменяет вклад оплаты', async () => {
    assert.equal((await request(`/payments/${secondPayment.payload.data.id}`, 'DELETE')).response.status, 204);
    assert.equal(paymentStore.balanceValues.get(robotics.payload.data.id), '4.00000000');
  });
  await t.test('редактирование не создаёт двойного начисления', async () => {
    const edited = await request(`/payments/${firstPayment.payload.data.id}`, 'PATCH', { amount: '2050.00', paidOn: '2026-09-14', method: 'cashless' });
    assert.equal(edited.payload.data.lessonsCredit, '2.00000000');
    assert.equal(paymentStore.balanceValues.get(robotics.payload.data.id), '2.00000000');
  });
  await t.test('направления одного ребёнка имеют независимые балансы', async () => {
    await request('/payments', 'POST', { enrollmentId: programming.payload.data.id, paidOn: '2026-09-16', amount: '1125.00', method: 'cashless' });
    assert.equal(paymentStore.balanceValues.get(robotics.payload.data.id), '2.00000000');
    assert.equal(paymentStore.balanceValues.get(programming.payload.data.id), '1.00000000');
  });
});
