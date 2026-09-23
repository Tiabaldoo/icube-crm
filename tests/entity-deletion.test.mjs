import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDeletionService } from '../backend/src/deletion.mjs';

function fakePool(handler) {
  return {
    query: async (sql, params) => [await handler(sql, params)],
    getConnection: async () => ({
      query: async (sql, params) => [await handler(sql, params)],
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
    }),
  };
}

const emptyEnrollmentDependencies = () => ({
  payments: 0, refunds: 0, attendances: 0, memberships: 0,
  balanceTransfers: 0, balanceEffects: 0,
});

function groupHandler(handler) {
  return async (sql, params) => {
    if (sql.startsWith('SELECT l.id FROM lessons l WHERE')) return [];
    if (sql.startsWith('DELETE FROM group_memberships WHERE group_id=')) return { affectedRows: 0 };
    if (sql.startsWith('DELETE FROM lessons WHERE group_id=')) return { affectedRows: 0 };
    return handler(sql, params);
  };
}

function enrollmentHandler({ ids = [10, 20], dependencies = emptyEnrollmentDependencies(), onSql = () => {} } = {}) {
  return async (sql, params) => {
    onSql(sql, params);
    if (sql.startsWith('SELECT id,child_id,balance_lessons FROM child_enrollments')) return [{ id: 10, child_id: 5, balance_lessons: '0.00000000' }];
    if (sql.startsWith('SELECT id FROM child_enrollments WHERE child_id')) return ids.map((id) => ({ id }));
    if (sql.includes('FROM payments WHERE enrollment_id')) return [dependencies];
    if (sql.startsWith('DELETE blc FROM balance_lot_consumptions') || sql.startsWith('DELETE reversal FROM balance_entries') || sql.startsWith('DELETE FROM balance_lots') || sql.startsWith('DELETE FROM balance_entries') || sql.startsWith('DELETE FROM attendances')) return { affectedRows: 0 };
    if (sql.startsWith('DELETE FROM group_memberships')) return { affectedRows: 1 };
    if (sql.startsWith('DELETE FROM enrollment_status_history')) return { affectedRows: 1 };
    if (sql.startsWith('DELETE FROM price_versions')) return { affectedRows: 1 };
    if (sql.startsWith('DELETE FROM child_enrollments')) return { affectedRows: 1 };
    throw new Error(`Unexpected SQL: ${sql}`);
  };
}

test('удаляет физически пустую площадку', async () => {
  let deleted = false;
  const service = createDeletionService(fakePool(groupHandler(async (sql) => {
    if (sql.startsWith('SELECT id FROM sites')) return [{ id: 7 }];
    if (sql.includes('FROM study_groups WHERE site_id')) return [{ groups: 0, lessons: 0 }];
    if (sql.startsWith('DELETE FROM sites')) { deleted = true; return { affectedRows: 1 }; }
    throw new Error(`Unexpected SQL: ${sql}`);
  })));

  await service.deleteSite(7);
  assert.equal(deleted, true);
});

test('удаляет группу, если из связей есть только price_versions', async () => {
  let priceVersionsDeleted = false;
  let groupDeleted = false;
  const service = createDeletionService(fakePool(groupHandler(async (sql) => {
    if (sql.startsWith('SELECT id FROM study_groups')) return [{ id: 10 }];
    if (sql.startsWith('DELETE l FROM lessons')) return { affectedRows: 0 };
    if (sql.includes('FROM group_memberships WHERE group_id')) return [{
      memberships: 0, lessons: 0, attendances: 0,
      childStatusHistory: 0, enrollmentStatusHistory: 0, payments: 0, refunds: 0,
    }];
    if (sql.startsWith('DELETE FROM price_versions')) {
      priceVersionsDeleted = true;
      return { affectedRows: 1 };
    }
    if (sql.startsWith('DELETE FROM study_groups')) {
      assert.equal(priceVersionsDeleted, true);
      groupDeleted = true;
      return { affectedRows: 1 };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  })));

  await service.deleteGroup(10);
  assert.equal(priceVersionsDeleted, true);
  assert.equal(groupDeleted, true);
});

test('не удаляет группу при наличии бизнес-зависимости', async () => {
  let deleted = false;
  const service = createDeletionService(fakePool(groupHandler(async (sql) => {
    if (sql.startsWith('SELECT id FROM study_groups')) return [{ id: 11 }];
    if (sql.startsWith('DELETE l FROM lessons')) return { affectedRows: 0 };
    if (sql.includes('FROM group_memberships WHERE group_id')) return [{
      memberships: 1, lessons: 0, attendances: 0,
      childStatusHistory: 0, enrollmentStatusHistory: 0, payments: 0, refunds: 0,
    }];
    if (sql.startsWith('DELETE FROM study_groups')) { deleted = true; return { affectedRows: 1 }; }
    throw new Error(`Unexpected SQL: ${sql}`);
  })));

  await assert.rejects(() => service.deleteGroup(11), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, 'GROUP_HAS_DEPENDENCIES');
    assert.match(error.message, /dependencies|зависимости/);
    return true;
  });
  assert.equal(deleted, false);
});

test('безопасные будущие materialized lessons не блокируют удаление пустой группы', async () => {
  const order = [];
  const service = createDeletionService(fakePool(groupHandler(async (sql) => {
    if (sql.startsWith('SELECT id FROM study_groups')) return [{ id: 12 }];
    if (sql.startsWith('DELETE l FROM lessons')) {
      assert.match(sql, /l\.status='scheduled'/);
      assert.match(sql, /l\.scheduled_starts_at>NOW\(6\)/);
      assert.match(sql, /l\.lock_version=1/);
      assert.match(sql, /NOT EXISTS \(SELECT 1 FROM attendances/);
      order.push('lessons'); return { affectedRows: 3 };
    }
    if (sql.includes('FROM group_memberships WHERE group_id')) return [{
      memberships: 0, lessons: 0, attendances: 0,
      childStatusHistory: 0, enrollmentStatusHistory: 0, payments: 0, refunds: 0,
    }];
    if (sql.startsWith('DELETE FROM price_versions')) { order.push('prices'); return { affectedRows: 1 }; }
    if (sql.startsWith('DELETE FROM study_groups')) { order.push('group'); return { affectedRows: 1 }; }
    throw new Error(`Unexpected SQL: ${sql}`);
  })));
  await service.deleteGroup(12);
  assert.deepEqual(order, ['lessons', 'prices', 'group']);
});

test('после очистки истории удаление группы снимает текущие memberships и удаляет tombstones', async () => {
  let memberships = 1; let tombstonesDeleted = false; let groupDeleted = false;
  const service = createDeletionService(fakePool(async (sql) => {
    if (sql.startsWith('SELECT id FROM study_groups')) return [{ id: 15 }];
    if (sql.startsWith('DELETE l FROM lessons')) return { affectedRows: 0 };
    if (sql.startsWith('SELECT l.id FROM lessons l WHERE')) return [];
    if (sql.startsWith('DELETE FROM group_memberships')) { memberships = 0; return { affectedRows: 1 }; }
    if (sql.includes('FROM group_memberships WHERE group_id')) return [{ memberships, lessons: 0, attendances: 0, quickChildren: 0,
      childStatusHistory: 0, enrollmentStatusHistory: 0, payments: 0, refunds: 0 }];
    if (sql.startsWith('DELETE FROM lessons WHERE group_id=')) { tombstonesDeleted = true; return { affectedRows: 1 }; }
    if (sql.startsWith('DELETE FROM price_versions')) return { affectedRows: 0 };
    if (sql.startsWith('DELETE FROM study_groups')) { groupDeleted = true; return { affectedRows: 1 }; }
    throw new Error(`Unexpected SQL: ${sql}`);
  }));
  await service.deleteGroup(15);
  assert.equal(memberships, 0); assert.equal(tombstonesDeleted, true); assert.equal(groupDeleted, true);
});

test('проведённое занятие остаётся реальной историей и блокирует удаление группы', async () => {
  let groupDeleted = false;
  const service = createDeletionService(fakePool(groupHandler(async (sql) => {
    if (sql.startsWith('SELECT id FROM study_groups')) return [{ id: 13 }];
    if (sql.startsWith('DELETE l FROM lessons')) return { affectedRows: 0 };
    if (sql.includes('FROM group_memberships WHERE group_id')) return [{
      memberships: 0, lessons: 1, attendances: 1,
      childStatusHistory: 0, enrollmentStatusHistory: 0, payments: 0, refunds: 0,
    }];
    if (sql.startsWith('DELETE FROM study_groups')) { groupDeleted = true; return { affectedRows: 1 }; }
    throw new Error(`Unexpected SQL: ${sql}`);
  })));
  await assert.rejects(() => service.deleteGroup(13), (error) => error.code === 'GROUP_HAS_DEPENDENCIES');
  assert.equal(groupDeleted, false);
});

test('реальная оплата группы по-прежнему блокирует её удаление', async () => {
  const service = createDeletionService(fakePool(groupHandler(async (sql) => {
    if (sql.startsWith('SELECT id FROM study_groups')) return [{ id: 14 }];
    if (sql.startsWith('DELETE l FROM lessons')) return { affectedRows: 0 };
    if (sql.includes('FROM group_memberships WHERE group_id')) return [{
      memberships: 0, lessons: 0, attendances: 0,
      childStatusHistory: 0, enrollmentStatusHistory: 0, payments: 1, refunds: 0,
    }];
    throw new Error(`Unexpected SQL: ${sql}`);
  })));
  await assert.rejects(() => service.deleteGroup(14), (error) => error.code === 'GROUP_HAS_DEPENDENCIES');
});

test('пустой enrollment удаляется, если у ребёнка есть второе направление', async () => {
  let deleted = false;
  const service = createDeletionService(fakePool(enrollmentHandler({ onSql(sql) {
    if (sql.startsWith('DELETE FROM child_enrollments')) deleted = true;
  } })));
  await service.deleteEnrollment(10);
  assert.equal(deleted, true);
});

test('enrollment только с пустой group_membership удаляется вместе с membership', async () => {
  let membershipDeleted = false;
  let enrollmentDeleted = false;
  const service = createDeletionService(fakePool(enrollmentHandler({ onSql(sql) {
    if (sql.startsWith('DELETE FROM group_memberships')) membershipDeleted = true;
    if (sql.startsWith('DELETE FROM child_enrollments')) {
      assert.equal(membershipDeleted, true);
      enrollmentDeleted = true;
    }
  } })));
  await service.deleteEnrollment(10);
  assert.equal(membershipDeleted, true);
  assert.equal(enrollmentDeleted, true);
});

test('последнее направление ребёнка не удаляется', async () => {
  let deleted = false;
  const service = createDeletionService(fakePool(enrollmentHandler({ ids: [10], onSql(sql) {
    if (sql.startsWith('DELETE FROM child_enrollments')) deleted = true;
  } })));
  await assert.rejects(() => service.deleteEnrollment(10), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, 'LAST_ENROLLMENT');
    assert.match(error.message, /последнее направление/);
    return true;
  });
  assert.equal(deleted, false);
});

test('enrollment с оплатой не удаляется', async () => {
  const dependencies = { ...emptyEnrollmentDependencies(), payments: 1 };
  const service = createDeletionService(fakePool(enrollmentHandler({ dependencies })));
  await assert.rejects(() => service.deleteEnrollment(10), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, 'ENROLLMENT_HAS_HISTORY');
    return true;
  });
});

test('enrollment с посещением не удаляется', async () => {
  const dependencies = { ...emptyEnrollmentDependencies(), attendances: 1 };
  const service = createDeletionService(fakePool(enrollmentHandler({ dependencies })));
  await assert.rejects(() => service.deleteEnrollment(10), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, 'ENROLLMENT_HAS_HISTORY');
    return true;
  });
});

test('удаление одного enrollment не затрагивает другое направление ребёнка', async () => {
  const deletes = [];
  const service = createDeletionService(fakePool(enrollmentHandler({ onSql(sql, params) {
    if (sql.startsWith('DELETE')) deletes.push({ sql, params });
  } })));
  await service.deleteEnrollment(10);
  const enrollmentDeletes = deletes.filter(({ sql }) => sql.startsWith('DELETE FROM child_enrollments'));
  assert.deepEqual(enrollmentDeletes, [{ sql: 'DELETE FROM child_enrollments WHERE id=:id', params: { id: '10' } }]);
  assert.equal(deletes.some(({ sql }) => sql.includes('child_id')), false);
});

function teacherDeletionFixture({ projects = [{ project_id: 2, active: 1 }], dependencies = {}, userId = 70, remainingRoles = 0 } = {}) {
  const calls = []; let teacherDeleted = false;
  const handler = async (sql, params = {}) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT id,user_id FROM teachers')) return [{ id: 41, user_id: userId }];
    if (sql.startsWith('SELECT project_id FROM teacher_projects')) return projects;
    if (sql.includes('(SELECT COUNT(*) FROM study_groups WHERE default_teacher_id=')) return [{
      groupCount: 0, lessons: 0, salaryRateVersions: 0, salaryAccruals: 0, ...dependencies,
    }];
    if (sql.startsWith('SELECT COUNT(*) role_count FROM user_roles')) return [{ role_count: remainingRoles }];
    if (sql.startsWith('DELETE FROM teachers')) { teacherDeleted = true; return { affectedRows: 1 }; }
    if (/^(DELETE|UPDATE)/.test(sql)) return { affectedRows: 1 };
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  return { service: createDeletionService(fakePool(handler)), calls, deleted: () => teacherDeleted };
}

test('partner удаляет преподавателя только своего проекта и очищает teacher-only доступ', async () => {
  const fixture = teacherDeletionFixture();
  await fixture.service.deleteTeacher(41, { projectId: '2' });
  assert.equal(fixture.deleted(), true);
  assert.ok(fixture.calls.some(({ sql }) => sql.startsWith('UPDATE auth_sessions')));
  assert.ok(fixture.calls.some(({ sql }) => sql.startsWith('DELETE ur FROM user_roles')));
  assert.ok(fixture.calls.some(({ sql }) => sql.includes("status='blocked'") && sql.includes('deleted_at=COALESCE')));
  assert.equal(fixture.calls.some(({ sql }) => sql.includes('created_by_user_id')), false);
});

test('partner не удаляет глобальную карточку при любой связи с другим проектом', async () => {
  const fixture = teacherDeletionFixture({ projects: [{ project_id: 2, active: 1 }, { project_id: 1, active: 0 }] });
  await assert.rejects(fixture.service.deleteTeacher(41, { projectId: '2' }), {
    status: 409, code: 'TEACHER_OTHER_PROJECT',
  });
  assert.equal(fixture.deleted(), false);
});

test('бизнес-история продолжает блокировать удаление преподавателя', async () => {
  const fixture = teacherDeletionFixture({ dependencies: { lessons: 1 } });
  await assert.rejects(fixture.service.deleteTeacher(41, { projectId: '2' }), {
    status: 409, code: 'TEACHER_HAS_DEPENDENCIES',
  });
  assert.equal(fixture.deleted(), false);
});

test('директор удаляет multi-project преподавателя, сохраняя user с другой ролью', async () => {
  const fixture = teacherDeletionFixture({ projects: [{ project_id: 1 }, { project_id: 2 }], remainingRoles: 1 });
  await fixture.service.deleteTeacher(41);
  assert.equal(fixture.deleted(), true);
  assert.ok(fixture.calls.some(({ sql }) => sql === 'UPDATE users SET token_version=token_version+1 WHERE id=:userId'));
  assert.equal(fixture.calls.some(({ sql }) => sql.includes("status='blocked'")), false);
});
