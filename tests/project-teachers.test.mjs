import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
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


function multiProjectTeacherFixture() {
  const state = {
    nextTeacherId: 20,
    teachers: [],
    projects: [{ id: 1, name: 'iCubeRobots' }, { id: 2, name: 'Зебра' }],
    directions: [{ id: 10, name: 'Робототехника' }, { id: 11, name: 'Программирование' }],
    teacherProjects: [],
    teacherDirections: [],
    groups: [],
  };
  const handler = async (sql, params = {}) => {
    if (sql.includes('FROM teachers t LEFT JOIN users u')) return [state.teachers.map((teacher) => ({ id: teacher.id, full_name: teacher.name, phone: teacher.phone, active: 1 }))];
    if (sql.includes('FROM teacher_project_directions tpd')) return [state.teacherDirections.map((row) => ({
      teacher_id: row.teacherId, project_id: row.projectId, id: row.directionId,
      name: state.directions.find((direction) => direction.id === row.directionId)?.name,
    }))];
    if (sql === 'SELECT teacher_id,project_id,active FROM teacher_projects ORDER BY project_id') return [state.teacherProjects.map((row) => ({
      teacher_id: row.teacherId, project_id: row.projectId, active: row.active ? 1 : 0,
    }))];
    if (sql.startsWith('SELECT id FROM projects')) return [[state.projects.find((row) => String(row.id) === String(params.id))].filter(Boolean)];
    if (sql.startsWith('SELECT id FROM directions')) return [[state.directions.find((row) => String(row.id) === String(params.id))].filter(Boolean)];
    if (sql.startsWith('SELECT id FROM study_groups WHERE default_teacher_id=')) return [[state.groups.find((row) => String(row.teacherId) === String(params.teacherId) && String(row.projectId) === String(params.projectId) && row.active)].filter(Boolean)];
    if (sql.startsWith('INSERT INTO teachers ')) {
      const teacher = { id: state.nextTeacherId++, name: params.name, phone: params.phone }; state.teachers.push(teacher); return [{ insertId: teacher.id }];
    }
    if (sql.startsWith('UPDATE teachers SET')) { const teacher = state.teachers.find((row) => String(row.id) === String(params.id)); if (teacher) Object.assign(teacher, { name: params.name, phone: params.phone }); return [{ affectedRows: teacher ? 1 : 0 }]; }
    if (sql.startsWith('UPDATE users u JOIN teachers')) return [{ affectedRows: 1 }];
    if (sql.startsWith('INSERT INTO teacher_projects')) {
      const existing = state.teacherProjects.find((row) => String(row.teacherId) === String(params.teacherId) && String(row.projectId) === String(params.projectId));
      if (existing) existing.active = Boolean(params.active); else state.teacherProjects.push({ teacherId: Number(params.teacherId), projectId: Number(params.projectId), active: Boolean(params.active) });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('DELETE FROM teacher_project_directions')) {
      state.teacherDirections = state.teacherDirections.filter((row) => !(String(row.teacherId) === String(params.teacherId) && String(row.projectId) === String(params.projectId)));
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT INTO teacher_project_directions')) {
      state.teacherDirections.push({ teacherId: Number(params.teacherId), projectId: Number(params.projectId), directionId: Number(params.directionId) }); return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  return { state, catalog: createMysqlCatalog(pool(handler)) };
}

test('director creates one teacher in two projects with independent directions', async () => {
  const fixture = multiProjectTeacherFixture();
  const teacher = await fixture.catalog.create('teachers', {
    name: 'Иванов Сергей', phone: '+7', projectSettings: [
      { projectId: 1, active: true, directionIds: [10, 11] },
      { projectId: 2, active: true, directionIds: [10] },
    ],
  }, { roles: ['director'] });
  assert.equal(fixture.state.teachers.length, 1);
  assert.deepEqual(teacher.projectSettings.map((item) => [item.projectId, item.active, item.directions.map((direction) => direction.id)]), [
    ['1', true, ['10', '11']], ['2', true, ['10']],
  ]);
});

test('director adds a second project and disabling one project leaves the other active', async () => {
  const fixture = multiProjectTeacherFixture();
  const created = await fixture.catalog.create('teachers', {
    name: 'Иванов', projectSettings: [{ projectId: 1, active: true, directionIds: [10] }],
  }, { roles: ['director'] });
  await fixture.catalog.update('teachers', created.id, {
    projectSettings: [{ projectId: 1, active: true, directionIds: [10] }, { projectId: 2, active: true, directionIds: [11] }],
  }, { roles: ['director'] });
  const updated = await fixture.catalog.update('teachers', created.id, {
    projectSettings: [{ projectId: 1, active: false, directionIds: [10] }, { projectId: 2, active: true, directionIds: [11] }],
  }, { roles: ['director'] });
  assert.deepEqual(updated.projectSettings.map((item) => [item.projectId, item.active]), [['1', false], ['2', true]]);
  assert.equal(updated.active, true);
});

test('partner creates only in own project, cannot mutate foreign project, and cannot see foreign settings', async () => {
  const fixture = multiProjectTeacherFixture();
  const partner = { roles: ['partner'], projectIds: ['2'] };
  const created = await fixture.catalog.create('teachers', {
    name: 'Петров', projectSettings: [{ projectId: 2, active: true, directionIds: [10] }],
  }, partner);
  assert.deepEqual(created.projectSettings.map((item) => item.projectId), ['2']);
  await fixture.catalog.update('teachers', created.id, {
    projectSettings: [{ projectId: 2, active: true, directionIds: [10] }],
  }, { roles: ['director'] });
  fixture.state.teacherProjects.push({ teacherId: Number(created.id), projectId: 1, active: true });
  fixture.state.teacherDirections.push({ teacherId: Number(created.id), projectId: 1, directionId: 11 });
  const [scoped] = await fixture.catalog.list('teachers', partner);
  assert.deepEqual(scoped.projectSettings.map((item) => item.projectId), ['2']);
  await assert.rejects(fixture.catalog.update('teachers', created.id, {
    projectSettings: [{ projectId: 1, active: true, directionIds: [11] }],
  }, partner), { status: 403, code: 'FORBIDDEN' });
});

test('inactive teacher project with active group is still protected', async () => {
  const fixture = multiProjectTeacherFixture();
  const created = await fixture.catalog.create('teachers', {
    name: 'Иванов', projectSettings: [
      { projectId: 1, active: true, directionIds: [10] },
      { projectId: 2, active: true, directionIds: [11] },
    ],
  }, { roles: ['director'] });
  fixture.state.groups.push({ id: 7, teacherId: Number(created.id), projectId: 1, active: true });
  await assert.rejects(fixture.catalog.update('teachers', created.id, {
    projectSettings: [
      { projectId: 1, active: false, directionIds: [10] },
      { projectId: 2, active: true, directionIds: [11] },
    ],
  }, { roles: ['director'] }), { status: 409, code: 'TEACHER_PROJECT_IN_USE' });
});

test('teacher form renders project blocks and save sends projectSettings while group filtering stays project-direction scoped', async () => {
  const [uiSource, syncSource, backendSource] = await Promise.all([
    readFile(new URL('../src/frontend/crm-ui.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../backend/src/catalog.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(uiSource, /projects\.forEach\(function\(p\)/);
  assert.match(uiSource, /teacher-project-block/);
  assert.match(uiSource, /tf-project-active-/);
  assert.doesNotMatch(uiSource.slice(uiSource.lastIndexOf('window\.teacherForm'), uiSource.indexOf('window\.saveTeacher', uiSource.lastIndexOf('window\.teacherForm'))), /<select class="select" id="tf-project"/);
  assert.match(syncSource, /projectSettings: projectSettings\.map/);
  assert.match(syncSource, /Активируйте хотя бы один проект/);
  assert.match(syncSource, /В каждом активном проекте выберите хотя бы одно доступное направление/);
  assert.match(uiSource, /setting\.active!==false && \(setting\.directions\|\|\[\]\)\.some/);
  assert.match(backendSource, /tp\.project_id=:projectId AND tp\.active=TRUE/);
  assert.match(backendSource, /teacher_project_directions[\s\S]*project_id=:projectId AND direction_id=:directionId/);
});
