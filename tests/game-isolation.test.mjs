import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (relative) => readFileSync(path.join(root, relative), 'utf8');

function listFiles(relative, extensions) {
  const directory = path.join(root, relative);
  if (statSync(directory).isFile()) return [relative];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules') return [];
    const entryPath = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) return listFiles(entryPath, extensions);
    return extensions.has(path.extname(entry.name)) ? [entryPath] : [];
  });
}

const stripSqlComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
const importSpecifiers = (code) => [...code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"`]([^'"`]+)['"`]/g)].map((match) => match[1].replaceAll('\\', '/'));
const crmTablesIn = (sql) => [...stripSqlComments(sql).matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)/gi)].map((match) => match[1].toLowerCase());

const findGameTables = (sql) => [...stripSqlComments(sql).matchAll(/(?<![\w])(?:game_\w+|icube_game\w*)/gi)].map((match) => match[0]);

function findCrmTableRefs(text, crmTables, flags = 'gi') {
  const pattern = new RegExp(`\\b(?:FROM|JOIN|INTO|UPDATE|TABLE|REFERENCES)\\s+(?:IF\\s+(?:NOT\\s+)?EXISTS\\s+)?\`?(${crmTables.join('|')})\\b`, flags);
  const qualified = /\b(?:icube_test|icube_prod)\s*\.\s*`?\w+/gi;
  return [...text.matchAll(pattern), ...text.matchAll(qualified)].map((match) => match[0]);
}

function findForbiddenGameAccess(code, crmTables) {
  const imports = importSpecifiers(code).filter((specifier) => /(?:^|\/)(?:backend|database)(?:\/|$)/.test(specifier));
  const crmEnv = [...code.matchAll(/\benv(?:\.|\[['"`])DB_(?:HOST|PORT|NAME|USER|PASSWORD)\b/g)].map((match) => match[0]);
  return [...imports, ...crmEnv, ...findCrmTableRefs(code, crmTables, 'g')];
}

function findGameReferences(text) {
  const imports = importSpecifiers(text).filter((specifier) => /(?:^|\/)game(?:\/|$)/.test(specifier));
  const urls = [...text.matchAll(/['"`](?:\.{0,2}\/)*game\/[^'"`]*['"`]/g)].map((match) => match[0]);
  return [...imports, ...urls];
}

const migrationFiles = listFiles('database/migrations', new Set(['.sql']));
const crmTables = crmTablesIn(migrationFiles.map(read).join('\n'));

test('список таблиц CRM собран из миграций и содержит таблицы с паролями и сессиями', () => {
  for (const table of ['users', 'auth_sessions', 'child_user_accounts', 'attendances']) assert.ok(crmTables.includes(table), table);
});

test('проверки изоляции ловят нарушения на заведомо плохих примерах', () => {
  assert.deepEqual(findGameTables('CREATE TABLE game_sessions (id INT);'), ['game_sessions']);
  assert.deepEqual(findGameTables('-- game_sessions\nCREATE TABLE lessons (id INT);'), []);
  assert.equal(findCrmTableRefs('SELECT password_hash FROM users', crmTables).length, 1);
  assert.equal(findCrmTableRefs('ALTER TABLE `auth_sessions` ADD x INT', crmTables).length, 1);
  assert.equal(findCrmTableRefs('SELECT 1 FROM icube_prod.anything', crmTables).length, 1);
  assert.deepEqual(findCrmTableRefs('CREATE TABLE game_users (id INT); SELECT * FROM game_users', crmTables), []);

  assert.equal(findForbiddenGameAccess("import { createPool } from '../../backend/src/db.mjs';", crmTables).length, 1);
  assert.equal(findForbiddenGameAccess("const db = await import('../../database/migrate.mjs');", crmTables).length, 1);
  assert.equal(findForbiddenGameAccess("const db = require('../../backend/src/config.mjs');", crmTables).length, 1);
  assert.equal(findForbiddenGameAccess('const name = process.env.DB_NAME;', crmTables).length, 1);
  assert.equal(findForbiddenGameAccess("await pool.query('SELECT id FROM users');", crmTables).length, 1);
  assert.equal(findForbiddenGameAccess("import { limit } from '../../backend/src/login-rate-limit.mjs';", crmTables).length, 1);
  assert.deepEqual(findForbiddenGameAccess("const name = process.env.GAME_DB_NAME; const blocked = ['icube_test', 'icube_prod'];", crmTables), []);

  assert.notDeepEqual(findGameReferences("import '../game/server/app.mjs';"), []);
  assert.notDeepEqual(findGameReferences('<script src="./game/client/main.js"></script>'), []);
  assert.deepEqual(findGameReferences("import { x } from './gamepad.mjs'; const text = 'game';"), []);
});

test('в database/migrations нет таблиц игры', () => {
  for (const file of migrationFiles) assert.deepEqual(findGameTables(read(file)), [], file);
});

test('миграции игры создают только таблицы game_*', () => {
  for (const file of listFiles('game/migrations', new Set(['.sql']))) {
    for (const table of crmTablesIn(read(file))) assert.match(table, /^game_/, `${file}: ${table}`);
  }
});

test('миграции игры не обращаются к таблицам CRM', () => {
  for (const file of listFiles('game/migrations', new Set(['.sql']))) assert.deepEqual(findCrmTableRefs(stripSqlComments(read(file)), crmTables), [], file);
});

test('код игры не подключается к базе CRM и не импортирует её модули', () => {
  for (const file of listFiles('game', new Set(['.js', '.mjs', '.cjs']))) assert.deepEqual(findForbiddenGameAccess(read(file), crmTables), [], file);
});

test('CRM не подключает код игры', () => {
  const sources = ['backend', 'database', 'scripts', 'src'].flatMap((directory) => listFiles(directory, new Set(['.js', '.mjs', '.cjs'])));
  for (const file of [...sources, 'index.html', 'service-worker.js']) assert.deepEqual(findGameReferences(read(file)), [], file);
});

test('миграции CRM запускаются только из database/migrations', () => {
  assert.match(read('database/migrate.mjs'), /path\.join\(path\.dirname\(fileURLToPath\(import\.meta\.url\)\), 'migrations'\)/);
});

test('структура game/ соответствует плану', () => {
  for (const item of ['README.md', 'server', 'client', 'migrations', 'tests']) assert.ok(existsSync(path.join(root, 'game', item)), item);
});

test('раннер миграций игры падает на именах icube_test и icube_prod и читает только game/migrations', async () => {
  const { assertGameDatabase } = await import('../game/server/config.mjs');
  for (const name of ['icube_test', 'icube_prod']) {
    for (const appEnv of ['test', 'development', 'production']) assert.throws(() => assertGameDatabase(appEnv, name), `${appEnv}/${name}`);
  }
  assert.throws(() => assertGameDatabase('production', 'icube_game_test'));
  assert.match(read('game/server/migration-runner.mjs'), /path\.join\(path\.dirname\(fileURLToPath\(import\.meta\.url\)\), '\.\.', 'migrations'\)/);
  assert.match(read('game/server/migrate.mjs'), /runGameMigrations/);
  assert.doesNotMatch(read('database/migrate.mjs'), /game/);
});

test('npm test CRM не запускает тесты игры, проверка синтаксиса обходит game/', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.test, 'node --test "tests/**/*.test.mjs"');
  assert.match(read('scripts/check-syntax.mjs'), /'game'/);
  assert.ok(existsSync(path.join(root, 'game', 'package.json')));
});
