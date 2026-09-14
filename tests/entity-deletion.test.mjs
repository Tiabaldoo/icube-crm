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
  payments: 0, refunds: 0, attendances: 0, balanceEntries: 0,
  balanceLots: 0, balanceTransfers: 0, statusHistory: 0,
});

function enrollmentHandler({ ids = [10, 20], dependencies = emptyEnrollmentDependencies(), onSql = () => {} } = {}) {
  return async (sql, params) => {
    onSql(sql, params);
    if (sql.startsWith('SELECT id,child_id FROM child_enrollments')) return [{ id: 10, child_id: 5 }];
    if (sql.startsWith('SELECT id FROM child_enrollments WHERE child_id')) return ids.map((id) => ({ id }));
    if (sql.includes('FROM payments WHERE enrollment_id')) return [dependencies];
    if (sql.startsWith('DELETE FROM group_memberships')) return { affectedRows: 1 };
    if (sql.startsWith('DELETE FROM price_versions')) return { affectedRows: 1 };
    if (sql.startsWith('DELETE FROM child_enrollments')) return { affectedRows: 1 };
    throw new Error(`Unexpected SQL: ${sql}`);
  };
}

test('удаляет физически пустую площадку', async () => {
  let deleted = false;
  const service = createDeletionService(fakePool(async (sql) => {
    if (sql.startsWith('SELECT id FROM sites')) return [{ id: 7 }];
    if (sql.includes('FROM study_groups WHERE site_id')) return [{ groups: 0, lessons: 0 }];
    if (sql.startsWith('DELETE FROM sites')) { deleted = true; return { affectedRows: 1 }; }
    throw new Error(`Unexpected SQL: ${sql}`);
  }));

  await service.deleteSite(7);
  assert.equal(deleted, true);
});

test('удаляет группу, если из связей есть только price_versions', async () => {
  let priceVersionsDeleted = false;
  let groupDeleted = false;
  const service = createDeletionService(fakePool(async (sql) => {
    if (sql.startsWith('SELECT id FROM study_groups')) return [{ id: 10 }];
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
  }));

  await service.deleteGroup(10);
  assert.equal(priceVersionsDeleted, true);
  assert.equal(groupDeleted, true);
});

test('не удаляет группу при наличии бизнес-зависимости', async () => {
  let deleted = false;
  const service = createDeletionService(fakePool(async (sql) => {
    if (sql.startsWith('SELECT id FROM study_groups')) return [{ id: 11 }];
    if (sql.includes('FROM group_memberships WHERE group_id')) return [{
      memberships: 1, lessons: 0, attendances: 0,
      childStatusHistory: 0, enrollmentStatusHistory: 0, payments: 0, refunds: 0,
    }];
    if (sql.startsWith('DELETE FROM study_groups')) { deleted = true; return { affectedRows: 1 }; }
    throw new Error(`Unexpected SQL: ${sql}`);
  }));

  await assert.rejects(() => service.deleteGroup(11), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, 'GROUP_HAS_DEPENDENCIES');
    assert.match(error.message, /участники|история/);
    return true;
  });
  assert.equal(deleted, false);
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
