import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createMysqlCatalog } from '../backend/src/catalog.mjs';

function atomicFixture({ failMembership = false } = {}) {
  const state = { childId: null, enrollmentId: null, key: null, inserts: 0, commits: 0, rollbacks: 0 };
  const query = async (sql, params = {}) => {
    if (sql.startsWith('SELECT id FROM directions') || sql.startsWith('SELECT id FROM projects')) return [[{ id: params.id }]];
    if (sql.startsWith('SELECT id FROM study_groups WHERE id=')) return [[{ id: params.groupId }]];
    if (sql.startsWith('SELECT id FROM children WHERE create_idempotency_key=')) return [state.key === params.key ? [{ id: state.childId }] : []];
    if (sql.startsWith('INSERT INTO children')) { state.childId = 10; state.key = params.commandKey; state.inserts += 1; return [{ insertId: 10 }]; }
    if (sql.startsWith('SELECT g.id FROM guardians')) return [[]];
    if (sql.startsWith('INSERT INTO guardians')) return [{ insertId: 20 }];
    if (sql.startsWith('INSERT INTO child_guardians')) return [{ affectedRows: 1 }];
    if (sql.startsWith('INSERT INTO child_enrollments')) { state.enrollmentId = 30; return [{ insertId: 30 }]; }
    if (sql.startsWith('INSERT INTO group_memberships')) { if (failMembership) throw new Error('membership failed'); return [{ affectedRows: 1 }]; }
    if (sql.includes('FROM children c LEFT JOIN child_guardians')) return [[{ id: 10, full_name: 'Ребёнок', status: 'active', needs_director_review: 0,
      guardian_name: 'Родитель', guardian_phone: '+7' }]];
    if (sql.includes('FROM child_enrollments e JOIN directions')) return [[{ id: 30, child_id: 10, direction_id: 1, project_id: 1,
      project_name: 'iCube', direction_name: 'Робототехника', status: 'active', individual_price: null, balance_lessons: '0.00000000',
      started_on: '2026-09-22', ended_on: null, group_id: 5, group_name: 'Группа' }]];
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  const connection = { query, beginTransaction: async () => {}, commit: async () => { state.commits += 1; }, rollback: async () => { state.rollbacks += 1; }, release() {} };
  return { state, pool: { query, getConnection: async () => connection } };
}

const command = { child: { name: 'Ребёнок', status: 'active', guardian: { name: 'Родитель', phone: '+7' } },
  enrollment: { directionId: 1, projectId: 1, groupId: 5, status: 'active' } };

test('child and first enrollment are committed atomically and duplicate command returns the original child', async () => {
  const fixture = atomicFixture(); const catalog = createMysqlCatalog(fixture.pool);
  const context = { roles: ['director'], userId: '7', idempotencyKey: 'same-command' };
  const first = await catalog.saveChildWithEnrollment(null, command, context);
  const repeated = await catalog.saveChildWithEnrollment(null, command, context);
  assert.equal(first.id, '10'); assert.equal(repeated.id, '10'); assert.equal(first.enrollments[0].id, '30');
  assert.equal(fixture.state.inserts, 1); assert.equal(fixture.state.commits, 2);
});

test('failure while creating enrollment rolls back the child transaction', async () => {
  const fixture = atomicFixture({ failMembership: true });
  await assert.rejects(createMysqlCatalog(fixture.pool).saveChildWithEnrollment(null, command,
    { roles: ['director'], userId: '7', idempotencyKey: 'failed-command' }), /membership failed/);
  assert.equal(fixture.state.commits, 0); assert.equal(fixture.state.rollbacks, 1);
});

test('legacy child command cannot create a contradictory archived child', async () => {
  const catalog = createMysqlCatalog({ getConnection: async () => { throw new Error('database must not be reached'); } });
  await assert.rejects(catalog.create('children', { name: 'Скрытый ребёнок', status: 'archived' }, { roles: ['director'] }),
    { code: 'VALIDATION_ERROR' });
});

test('frontend uses atomic child command and selects an editable enrollment instead of enrollments[0]', async () => {
  const source = await readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8');
  const save = source.slice(source.indexOf('async function saveChild'), source.indexOf('async function saveEnrollment'));
  assert.match(save, /\/children-with-enrollment/); assert.match(save, /\/with-enrollment/);
  assert.match(save, /item\.editable !== false/); assert.doesNotMatch(save, /saved\.enrollments\[0\]/);
  const catalogSource = await readFile(new URL('../backend/src/catalog.mjs', import.meta.url), 'utf8');
  assert.match(catalogSource, /Архивный статус недоступен через CRM/);
});
