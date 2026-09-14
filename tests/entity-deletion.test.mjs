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
