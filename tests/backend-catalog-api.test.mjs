import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import { createApiRouter } from '../backend/src/routes.mjs';
import { ApiProblem } from '../backend/src/catalog.mjs';

function memoryCatalog() {
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
      const enrollment = { id: next('children') + child.enrollments.length + 100, ...structuredClone(body), directionName: data.directions.find((direction) => direction.id === body.directionId).name };
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
let server;
let baseUrl;
before(async () => {
  const app = express(); app.use(express.json()); app.use('/api/v1', createApiRouter({ query: async () => [[]] }, { catalog, allowUnauthenticated: true }));
  app.use((error, _request, response, _next) => response.status(error.status ?? 500).json({ error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message } }));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(() => new Promise((resolve) => server.close(resolve)));
async function request(path, method = 'GET', body) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const payload = response.status === 204 ? null : await response.json(); return { response, payload };
}

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
