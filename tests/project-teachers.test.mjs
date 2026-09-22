import assert from 'node:assert/strict';
import test from 'node:test';
import { createMysqlCatalog } from '../backend/src/catalog.mjs';

function pool(handler) {
  const connection = { query: handler, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  return { query: handler, getConnection: async () => connection };
}

test('teacher activity and directions are returned independently for every project', async () => {
  const db = pool(async (sql) => {
    if (sql.includes('FROM teachers t LEFT JOIN users u')) return [[{ id: 4, full_name: 'Иванов', phone: '+7', active: 1 }]];
    if (sql.includes('FROM teacher_project_directions tpd')) return [[
      { teacher_id: 4, project_id: 1, id: 10, name: 'Робототехника' },
      { teacher_id: 4, project_id: 2, id: 11, name: 'Программирование' },
    ]];
    if (sql === 'SELECT teacher_id,project_id,active FROM teacher_projects ORDER BY project_id') return [[
      { teacher_id: 4, project_id: 1, active: 1 }, { teacher_id: 4, project_id: 2, active: 0 },
    ]];
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const [teacher] = await createMysqlCatalog(db).list('teachers', { roles: ['director'] });
  assert.deepEqual(teacher.projectSettings.map((item) => [item.projectId, item.active, item.directions.map((direction) => direction.name)]), [
    ['1', true, ['Робототехника']], ['2', false, ['Программирование']],
  ]);
});

test('editing one teacher project does not delete settings of another project', async () => {
  const calls = [];
  const teacherRows = [{ teacher_id: 4, project_id: 1, active: 1 }, { teacher_id: 4, project_id: 2, active: 1 }];
  const handler = async (sql, params = {}) => {
    calls.push({ sql, params });
    if (sql.includes('FROM teachers t LEFT JOIN users u')) return [[{ id: 4, full_name: 'Иванов', phone: '+7', active: 1 }]];
    if (sql.includes('FROM teacher_project_directions tpd')) return [[{ teacher_id: 4, project_id: 1, id: 10, name: 'Робототехника' }, { teacher_id: 4, project_id: 2, id: 10, name: 'Робототехника' }]];
    if (sql === 'SELECT teacher_id,project_id,active FROM teacher_projects ORDER BY project_id') return [teacherRows];
    if (sql.startsWith('SELECT id FROM directions') || sql.startsWith('SELECT id FROM projects')) return [[{ id: params.id }]];
    if (sql.startsWith('SELECT id FROM study_groups')) return [[]];
    if (sql.startsWith('INSERT INTO teacher_projects')) { teacherRows[1].active = Number(params.active); return [{ affectedRows: 1 }]; }
    if (/^(UPDATE teachers|UPDATE users|DELETE FROM teacher_project_directions|INSERT INTO teacher_project_directions)/.test(sql)) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  await createMysqlCatalog(pool(handler)).update('teachers', 4, { projectId: 2, active: false, directionIds: [10] }, { roles: ['director'] });
  assert.equal(calls.some(({ sql }) => sql === 'DELETE FROM teacher_projects WHERE teacher_id=:teacherId'), false);
  assert.ok(calls.some(({ sql, params }) => sql.startsWith('DELETE FROM teacher_project_directions') && String(params.projectId) === '2'));
  assert.equal(teacherRows[0].active, 1); assert.equal(teacherRows[1].active, 0);
});

test('inactive site and inactive project teacher cannot be assigned to an active group', async () => {
  const handler = async (sql) => {
    if (sql.startsWith('SELECT id FROM ')) return [[{ id: 1 }]];
    if (sql.startsWith('SELECT s.id FROM sites s JOIN teacher_projects')) return [[]];
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  await assert.rejects(createMysqlCatalog(pool(handler)).create('groups', { name: 'Группа', directionId: 1, siteId: 2, projectId: 3,
    teacherId: 4, weekday: 1, startTime: '10:00', endTime: '11:00', startsOn: '2026-01-01' }, { roles: ['director'] }),
  { status: 400, code: 'PROJECT_MISMATCH' });
});

test('site in an active group cannot be disabled and group cannot end in the future', async () => {
  const siteHandler = async (sql) => {
    if (sql.startsWith('SELECT s.id,s.project_id')) return [[{ id: 2, project_id: 1, name: 'Площадка', active: 1 }]];
    if (sql.startsWith('SELECT id FROM study_groups WHERE site_id=')) return [[{ id: 8 }]];
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  await assert.rejects(createMysqlCatalog(pool(siteHandler)).update('sites', 2, { active: false }, { roles: ['director'] }),
    { status: 409, code: 'SITE_IN_USE' });

  const groupHandler = async (sql) => {
    if (sql.includes('FROM study_groups g JOIN directions')) return [[{ id: 8, name: 'Группа', direction_id: 1, direction_name: 'Роботы', site_id: 2,
      site_name: 'Площадка', project_id: 1, project_name: 'iCube', teacher_id: 4, teacher_name: 'Иванов', weekday: 1,
      start_time: '10:00:00', end_time: '11:00:00', starts_on: '2026-01-01', ends_on: null, active: 1, price: null }]];
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  await assert.rejects(createMysqlCatalog(pool(groupHandler)).update('groups', 8, { active: false, endsOn: '2099-01-01' }, { roles: ['director'] }),
    { status: 400, code: 'GROUP_END_DATE_IN_FUTURE' });
});
