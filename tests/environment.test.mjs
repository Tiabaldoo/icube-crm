import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../backend/src/config.mjs';
import { permissions } from '../backend/src/auth.mjs';

const base = {
  DB_HOST: '127.0.0.1',
  DB_USER: 'app',
  DB_PASSWORD: 'secret',
  AUTH_ACCESS_TOKEN_SECRET: '01234567890123456789012345678901',
};

test('test и production не могут случайно использовать базу другой среды', () => {
  assert.throws(() => loadConfig({ ...base, APP_ENV: 'production', DB_NAME: 'icube_test' }), /icube_prod/);
  assert.throws(() => loadConfig({ ...base, APP_ENV: 'test', DB_NAME: 'icube_prod' }), /icube_test/);
  assert.equal(loadConfig({ ...base, APP_ENV: 'production', DB_NAME: 'icube_prod' }).database.database, 'icube_prod');
  assert.equal(loadConfig({ ...base, APP_ENV: 'test', DB_NAME: 'icube_test' }).database.database, 'icube_test');
  assert.throws(() => loadConfig({ ...base, APP_ENV: 'development', DB_NAME: 'icube_prod' }), /development/);
  assert.throws(() => loadConfig({ ...base, APP_ENV: 'development', DB_NAME: 'icube_test' }), /development/);
  assert.equal(loadConfig({ ...base, APP_ENV: 'development', DB_NAME: 'icube_dev' }).database.database, 'icube_dev');
});

test('production отклоняет placeholder-секреты', () => {
  assert.throws(() => loadConfig({ ...base, APP_ENV: 'production', DB_NAME: 'icube_prod', DB_PASSWORD: 'replace_me' }), /DB_PASSWORD/);
  assert.throws(() => loadConfig({ ...base, APP_ENV: 'production', DB_NAME: 'icube_prod', AUTH_ACCESS_TOKEN_SECRET: 'replace_with_at_least_32_random_bytes' }), /AUTH_ACCESS_TOKEN_SECRET/);
});

test('модель ролей содержит текущие и будущие роли', () => {
  assert.ok(permissions.director.has('*'));
  for (const permission of [
    'children:read', 'groups:read', 'lessons:read', 'lessons:start', 'lessons:attendance',
    'lessons:finish', 'lessons:photos', 'lessons:extras', 'lessons:quick-child', 'lessons:update-assigned', 'lessons:cancel',
  ]) assert.ok(permissions.teacher.has(permission), `teacher: нет ${permission}`);
  assert.ok(!permissions.teacher.has('*'));
  assert.ok(!permissions.teacher.has('payments:write'));
  assert.ok(!permissions.teacher.has('groups:write'));
  assert.ok(permissions.partner.has('partner-settlements:read'));
  assert.ok(permissions.partner.has('projects:read'));
  assert.ok(!permissions.teacher.has('projects:read'));
  assert.ok(!permissions.parent.has('projects:read'));
  assert.ok(!permissions.child.has('projects:read'));
  assert.ok(permissions.parent.has('own-children:read'));
  assert.ok(permissions.child.has('own-profile:read'));
});
