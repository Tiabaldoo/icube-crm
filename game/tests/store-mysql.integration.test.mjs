// Интеграционный прогон с настоящей MySQL. Запускается только явно:
// GAME_INTEGRATION=1, APP_ENV=test, база icube_game_test на 127.0.0.1/localhost.
// Строки теста — с уникальными id запуска; DROP, TRUNCATE и массовых удалений нет.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mysql from 'mysql2/promise';
import { loadDatabaseConfig } from '../server/config.mjs';
import { runGameMigrations } from '../server/migration-runner.mjs';
import { createGamePool, createMysqlStore } from '../server/store-mysql.mjs';
import { silentLogger } from './helpers.mjs';
import { starsContract } from './stars-contract.mjs';
import { storeContract } from './store-contract.mjs';

const enabled = process.env.GAME_INTEGRATION === '1';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

if (!enabled) {
  test('интеграция с MySQL пропущена: задайте GAME_INTEGRATION=1', { skip: true }, () => {});
} else {
  const { appEnv, database } = loadDatabaseConfig(process.env);
  assert.equal(appEnv, 'test', 'интеграционные тесты — только при APP_ENV=test');
  assert.ok(LOCAL_HOSTS.has(database.host), 'интеграционные тесты — только с локальной MySQL');
  let pool;
  before(async () => {
    const connection = await mysql.createConnection({ ...database, charset: 'utf8mb4' });
    try { await runGameMigrations(connection, { appEnv, database: database.database, logger: silentLogger() }); } finally { await connection.end(); }
    pool = createGamePool(database);
  });
  after(async () => { await pool?.end(); });

  test('повторный запуск миграций ничего не меняет', async () => {
    const connection = await mysql.createConnection({ ...database, charset: 'utf8mb4' });
    try { assert.deepEqual(await runGameMigrations(connection, { appEnv, database: database.database, logger: silentLogger() }), []); } finally { await connection.end(); }
  });

  // Большой случайный сдвиг: повторные прогоны на той же базе не пересекаются по child_id.
  const prefix = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  storeContract(test, () => createMysqlStore(pool), { prefix });
  starsContract(test, () => createMysqlStore(pool), { prefix: prefix + 500_000 });
}
