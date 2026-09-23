import assert from 'node:assert/strict';
import test from 'node:test';
import { createMysqlCatalog } from '../backend/src/catalog.mjs';

function pool(handler) {
  const connection = { query: handler, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  return { query: handler, getConnection: async () => connection };
}

function teacherModelStore({ activeGroupProjects = [] } = {}) {
  const teachers = []; const memberships = []; const directions = [];
  let nextTeacherId = 4;
  const directionNames = new Map([['10', 'Робототехника'], ['11', 'Программирование']]);
  const handler = async (sql, params = {}) => {
    if (sql.includes('FROM teachers t LEFT JOIN users u')) {
      const visible = teachers.filter((teacher) => params.projectId == null
        || memberships.some((item) => item.teacher_id === teacher.id && String(item.project_id) === String(params.projectId)));
      return [visible.map((teacher) => ({ id: teacher.id, full_name: teacher.name, phone: teacher.phone, active: 1,
        access_login: teacher.accessLogin ?? null, access_status: teacher.accessStatus ?? null }))];
    }
    if (sql.includes('FROM teacher_project_directions tpd')) return [directions.map((item) => ({
      teacher_id: item.teacher_id, project_id: item.project_id, id: item.direction_id, name: directionNames.get(String(item.direction_id)),
    }))];
    if (sql === 'SELECT teacher_id,project_id,active FROM teacher_projects ORDER BY project_id') {
      return [[...memberships].sort((a, b) => Number(a.project_id) - Number(b.project_id))];
    }
    if (sql.startsWith('SELECT id FROM projects')) return [[{ id: Number(params.id) }]];
    if (sql.startsWith('SELECT id FROM directions')) return [directionNames.has(String(params.id)) ? [{ id: Number(params.id) }] : []];
    if (sql.startsWith('INSERT INTO teachers')) {
      const teacher = { id: nextTeacherId++, name: params.name, phone: params.phone }; teachers.push(teacher); return [{ insertId: teacher.id }];
    }
    if (sql.startsWith('UPDATE teachers SET full_name=')) {
      const teacher = teachers.find((item) => String(item.id) === String(params.id)); teacher.name = params.name; teacher.phone = params.phone;
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE users u JOIN teachers')) return [{ affectedRows: 0 }];
    if (sql.startsWith('SELECT id FROM study_groups WHERE default_teacher_id=')) {
      return [activeGroupProjects.map(String).includes(String(params.projectId)) ? [{ id: 90 }] : []];
    }
    if (sql.startsWith('DELETE FROM teacher_project_directions')) {
      for (let index = directions.length - 1; index >= 0; index -= 1) {
        if (String(directions[index].teacher_id) === String(params.teacherId)
          && String(directions[index].project_id) === String(params.projectId)) directions.splice(index, 1);
      }
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('DELETE FROM teacher_projects')) {
      for (let index = memberships.length - 1; index >= 0; index -= 1) {
        if (String(memberships[index].teacher_id) === String(params.teacherId)
          && String(memberships[index].project_id) === String(params.projectId)) memberships.splice(index, 1);
      }
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT INTO teacher_projects')) {
      const current = memberships.find((item) => String(item.teacher_id) === String(params.teacherId)
        && String(item.project_id) === String(params.projectId));
      if (current) current.active = Number(params.active); else memberships.push({ teacher_id: Number(params.teacherId), project_id: Number(params.projectId), active: Number(params.active) });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT INTO teacher_project_directions')) {
      directions.push({ teacher_id: Number(params.teacherId), project_id: Number(params.projectId), direction_id: Number(params.directionId) });
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  return { db: pool(handler), teachers, memberships, directions };
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

test('active project teacher без направления не назначается в новую группу', async () => {
  const handler = async (sql) => {
    if (sql.startsWith('SELECT id FROM ')) return [[{ id: 1 }]];
    if (sql.startsWith('SELECT s.id FROM sites s JOIN teacher_projects')) return [[{ id: 2 }]];
    if (sql.startsWith('SELECT teacher_id FROM teacher_project_directions')) return [[]];
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  await assert.rejects(createMysqlCatalog(pool(handler)).create('groups', { name: 'Группа', directionId: 1, siteId: 2, projectId: 3,
    teacherId: 4, weekday: 1, startTime: '10:00', endTime: '11:00', startsOn: '2026-01-01' }, { roles: ['director'] }),
  { status: 400, code: 'TEACHER_DIRECTION_MISMATCH' });
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

test('project membership проходит active → inactive → none и определяет видимость партнёру', async () => {
  const store = teacherModelStore(); const catalog = createMysqlCatalog(store.db);
  const director = { roles: ['director'] }; const zebra = { roles: ['partner'], projectIds: ['2'] };
  const created = await catalog.create('teachers', { name: 'Иванов', phone: '+7', projectSettings: [
    { projectId: 1, status: 'active', directionIds: [10] },
    { projectId: 2, status: 'none', directionIds: [] },
  ] }, director);
  assert.deepEqual(created.projectIds, ['1']);
  assert.deepEqual(store.memberships.map((item) => item.project_id), [1]);
  assert.equal((await catalog.list('teachers', zebra)).length, 0);

  await catalog.update('teachers', created.id, { projectSettings: [{ projectId: 2, status: 'active', directionIds: [11] }] }, director);
  assert.equal((await catalog.list('teachers', zebra))[0].projectSettings[0].status, 'active');
  await catalog.update('teachers', created.id, { projectSettings: [{ projectId: 2, status: 'inactive', directionIds: [11] }] }, director);
  const [inactive] = await catalog.list('teachers', zebra);
  assert.equal(inactive.active, false); assert.equal(inactive.projectSettings[0].status, 'inactive');

  await catalog.update('teachers', created.id, { projectSettings: [{ projectId: 2, status: 'none', directionIds: [11] }] }, director);
  assert.equal(store.memberships.some((item) => item.project_id === 2), false);
  assert.equal(store.directions.some((item) => item.project_id === 2), false);
  assert.equal((await catalog.list('teachers', zebra)).length, 0);
  assert.equal(store.memberships.some((item) => item.project_id === 1), true);
});

test('все project memberships могут быть неактивными без требования активировать проект', async () => {
  const store = teacherModelStore(); const catalog = createMysqlCatalog(store.db);
  const teacher = await catalog.create('teachers', { name: 'Неактивный', projectSettings: [
    { projectId: 1, status: 'inactive', directionIds: [10] },
    { projectId: 2, status: 'inactive', directionIds: [11] },
  ] }, { roles: ['director'] });
  assert.equal(teacher.active, false);
  assert.deepEqual(teacher.projectSettings.map((item) => item.status), ['inactive', 'inactive']);
});

test('active group блокирует inactive и none только в своём проекте', async () => {
  for (const status of ['inactive', 'none']) {
    const store = teacherModelStore({ activeGroupProjects: [2] }); const catalog = createMysqlCatalog(store.db);
    const teacher = await catalog.create('teachers', { name: 'Занятый', projectSettings: [
      { projectId: 1, status: 'active', directionIds: [10] },
      { projectId: 2, status: 'active', directionIds: [11] },
    ] }, { roles: ['director'] });
    await assert.rejects(catalog.update('teachers', teacher.id, {
      projectSettings: [{ projectId: 2, status, directionIds: status === 'none' ? [] : [11] }],
    }, { roles: ['director'] }), { status: 409, code: 'TEACHER_PROJECT_IN_USE' });
    assert.equal(store.memberships.find((item) => item.project_id === 1)?.active, 1);
    assert.equal(store.memberships.find((item) => item.project_id === 2)?.active, 1);
  }
});

test('partner получает и меняет только свой project membership', async () => {
  const store = teacherModelStore(); const catalog = createMysqlCatalog(store.db); const director = { roles: ['director'] };
  const teacher = await catalog.create('teachers', { name: 'Общий', projectSettings: [
    { projectId: 1, status: 'active', directionIds: [10] },
    { projectId: 2, status: 'inactive', directionIds: [11] },
  ] }, director);
  const partner = { roles: ['partner'], projectIds: ['2'] };
  const [visible] = await catalog.list('teachers', partner);
  assert.deepEqual(visible.projectIds, ['2']);
  assert.deepEqual(visible.projectSettings.map((item) => item.projectId), ['2']);
  await assert.rejects(catalog.update('teachers', teacher.id, {
    projectSettings: [{ projectId: 1, status: 'inactive', directionIds: [10] }],
  }, partner), { status: 403, code: 'FORBIDDEN' });
  assert.equal(store.memberships.find((item) => item.project_id === 1)?.active, 1);
});
