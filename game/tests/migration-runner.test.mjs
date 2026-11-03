import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { MIGRATIONS_DIRECTORY, runGameMigrations, splitSqlStatements } from '../server/migration-runner.mjs';
import { silentLogger } from './helpers.mjs';

function fakeConnection(databaseName = 'icube_game_test') {
  const applied = new Map();
  const statements = [];
  return {
    applied, statements,
    async query(sql, params = []) {
      if (sql === 'SELECT DATABASE() AS name') return [[{ name: databaseName }]];
      if (sql.startsWith('CREATE TABLE IF NOT EXISTS game_schema_migrations')) return [{}];
      if (sql.startsWith('SELECT checksum FROM game_schema_migrations')) return [applied.has(params[0]) ? [{ checksum: applied.get(params[0]) }] : []];
      if (sql.startsWith('INSERT INTO game_schema_migrations')) { applied.set(params[0], params[1]); return [{}]; }
      statements.push(sql);
      return [{}];
    },
  };
}

test('разбор SQL: комментарии отброшены, «;» в строках не делит выражение', () => {
  assert.deepEqual(splitSqlStatements("-- a;b\nSELECT 'x;y'; /* c; */ SELECT 2;\n"), ["SELECT 'x;y'", 'SELECT 2']);
});

test('раннер отказывается работать с базами CRM, другими базами и production', async () => {
  for (const name of ['icube_test', 'icube_prod', 'icube_game_prod', 'other']) {
    await assert.rejects(runGameMigrations(fakeConnection(), { appEnv: 'test', database: name, logger: silentLogger() }), /icube_game_test/, name);
    // Даже если имя в настройке верное, а соединение смотрит в другую базу.
    await assert.rejects(runGameMigrations(fakeConnection(name), { appEnv: 'test', database: 'icube_game_test', logger: silentLogger() }), /icube_game_test/, name);
  }
  await assert.rejects(runGameMigrations(fakeConnection(), { appEnv: 'production', database: 'icube_game_test', logger: silentLogger() }), /APP_ENV/);
});

test('миграции применяются один раз, изменённая применённая миграция — ошибка', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'game-migrations-'));
  try {
    await writeFile(path.join(directory, '001_a.sql'), 'CREATE TABLE IF NOT EXISTS game_a (id INT);\nCREATE TABLE IF NOT EXISTS game_b (id INT);\n');
    const connection = fakeConnection();
    const options = { appEnv: 'test', database: 'icube_game_test', directory, logger: silentLogger() };
    assert.deepEqual(await runGameMigrations(connection, options), ['001_a']);
    assert.equal(connection.statements.length, 2);
    assert.deepEqual(await runGameMigrations(connection, options), []);
    assert.equal(connection.statements.length, 2);
    await writeFile(path.join(directory, '001_a.sql'), 'CREATE TABLE IF NOT EXISTS game_a (id BIGINT);\n');
    await assert.rejects(runGameMigrations(connection, options), /другим содержимым/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('миграции игры создают только таблицы game_* без DROP, TRUNCATE и массовых изменений', async () => {
  const connection = fakeConnection();
  await runGameMigrations(connection, { appEnv: 'test', database: 'icube_game_test', logger: silentLogger() });
  const sql = await readFile(path.join(MIGRATIONS_DIRECTORY, '001_game_core.sql'), 'utf8');
  assert.doesNotMatch(sql, /\b(DROP|TRUNCATE|DELETE|UPDATE)\b/i);
  const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((match) => match[1]);
  assert.deepEqual(tables, ['game_profiles', 'game_sessions']);
  assert.ok(connection.statements.some((statement) => statement.startsWith('CREATE TABLE IF NOT EXISTS game_sessions')));
});
