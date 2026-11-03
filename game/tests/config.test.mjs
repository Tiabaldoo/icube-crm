import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertGameDatabase, loadGameConfig } from '../server/config.mjs';
import { baseEnv } from './helpers.mjs';

test('конфигурация test читается, по умолчанию порт 3100 и CRM на 127.0.0.1:3001', () => {
  const config = loadGameConfig(baseEnv());
  assert.equal(config.port, 3100);
  assert.equal(config.crmInternalUrl, 'http://127.0.0.1:3001');
  assert.equal(config.publicOrigin, 'https://game.example.test');
  assert.equal(config.devClientIp, null);
});

test('production и неизвестное окружение запрещены при любых настройках', () => {
  for (const appEnv of ['production', 'staging', '']) {
    assert.throws(() => loadGameConfig(baseEnv({ APP_ENV: appEnv })), /APP_ENV/);
  }
});

test('база только icube_game_test: базы CRM и любые другие отвергаются', () => {
  for (const name of ['icube_test', 'icube_prod', 'icube_game_prod', 'icube_game_dev', 'mysql']) {
    assert.throws(() => loadGameConfig(baseEnv({ GAME_DB_NAME: name })), /icube_game_test/, name);
    assert.throws(() => assertGameDatabase('test', name), /icube_game_test/, name);
  }
  assert.throws(() => assertGameDatabase('production', 'icube_game_test'), /APP_ENV/);
  assert.doesNotThrow(() => assertGameDatabase('development', 'icube_game_test'));
});

test('секрет, адрес CRM и публичный адрес проверяются', () => {
  assert.throws(() => loadGameConfig(baseEnv({ GAME_INTERNAL_TOKEN: 'short' })), /32/);
  assert.throws(() => loadGameConfig(baseEnv({ GAME_INTERNAL_TOKEN: `replace_me${'x'.repeat(40)}` })), /32/);
  assert.throws(() => loadGameConfig(baseEnv({ GAME_CRM_INTERNAL_URL: 'http://10.0.0.5:3001' })), /127\.0\.0\.1/);
  assert.throws(() => loadGameConfig(baseEnv({ GAME_CRM_INTERNAL_URL: 'https://127.0.0.1:3001' })), /127\.0\.0\.1/);
  assert.throws(() => loadGameConfig(baseEnv({ GAME_PUBLIC_ORIGIN: 'http://game.example.test' })), /https/);
  assert.equal(loadGameConfig(baseEnv({ APP_ENV: 'development', GAME_PUBLIC_ORIGIN: 'http://localhost:3100' })).publicOrigin, 'http://localhost:3100');
  assert.throws(() => loadGameConfig(baseEnv({ GAME_PORT: '70000' })), /GAME_PORT/);
  assert.throws(() => loadGameConfig(baseEnv({ GAME_DB_PASSWORD: '' })), /GAME_DB_PASSWORD/);
});

test('подставной адрес ребёнка допустим только при APP_ENV=development', () => {
  assert.throws(() => loadGameConfig(baseEnv({ GAME_DEV_CLIENT_IP: '203.0.113.9' })), /development/);
  assert.equal(loadGameConfig(baseEnv({ APP_ENV: 'development', GAME_DEV_CLIENT_IP: '203.0.113.9' })).devClientIp, '203.0.113.9');
  assert.throws(() => loadGameConfig(baseEnv({ APP_ENV: 'development', GAME_DEV_CLIENT_IP: 'not-ip' })), /development/);
});

test('переменные базы CRM игру не настраивают', () => {
  const env = baseEnv({ DB_NAME: 'icube_test', DB_HOST: 'crm-host' });
  const config = loadGameConfig(env);
  assert.equal(config.database.database, 'icube_game_test');
  assert.equal(config.database.host, '127.0.0.1');
});

test('обратный канал для CRM: по умолчанию 3101, совпадение с портом игры запрещено', () => {
  assert.equal(loadGameConfig(baseEnv()).internalPort, 3101);
  assert.equal(loadGameConfig(baseEnv({ GAME_INTERNAL_PORT: '3201' })).internalPort, 3201);
  assert.throws(() => loadGameConfig(baseEnv({ GAME_INTERNAL_PORT: '3100' })), /GAME_INTERNAL_PORT/);
  assert.throws(() => loadGameConfig(baseEnv({ GAME_INTERNAL_PORT: 'abc' })), /GAME_INTERNAL_PORT/);
});
