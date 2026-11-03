import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertGameDatabase } from './config.mjs';

export const MIGRATIONS_DIRECTORY = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const hash = (value) => createHash('sha256').update(value).digest('hex');

// Миграции игры пишем сами и без процедур, поэтому хватает простого разбора:
// комментарии отбрасываются, кавычки учитываются, «;» вне кавычек делит выражения.
export function splitSqlStatements(sql) {
  const statements = []; let current = ''; let quote = null;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]; const next = sql[index + 1];
    if (!quote && char === '-' && next === '-') { while (index < sql.length && sql[index] !== '\n') index += 1; current += '\n'; continue; }
    if (!quote && char === '/' && next === '*') { index = sql.indexOf('*/', index + 2); if (index < 0) break; index += 1; continue; }
    if (quote) {
      current += char;
      if (char === '\\') { current += next ?? ''; index += 1; } else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') quote = char;
    if (char === ';') { if (current.trim()) statements.push(current.trim()); current = ''; continue; }
    current += char;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

// Выражения миграций идемпотентны (IF NOT EXISTS): после сбоя на середине повторный запуск безопасен.
export async function runGameMigrations(connection, { appEnv, database, directory = MIGRATIONS_DIRECTORY, logger = console } = {}) {
  assertGameDatabase(appEnv, database);
  const [[current]] = await connection.query('SELECT DATABASE() AS name');
  assertGameDatabase(appEnv, current?.name);
  await connection.query(`CREATE TABLE IF NOT EXISTS game_schema_migrations (
    version VARCHAR(64) NOT NULL PRIMARY KEY, checksum CHAR(64) NOT NULL,
    applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)) ENGINE=InnoDB`);
  const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  const applied = [];
  for (const file of files) {
    const version = file.slice(0, -4);
    const sql = await readFile(path.join(directory, file), 'utf8');
    const checksum = hash(sql.replace(/\r\n/g, '\n'));
    const [rows] = await connection.query('SELECT checksum FROM game_schema_migrations WHERE version=?', [version]);
    if (rows[0]) {
      if (rows[0].checksum !== checksum) throw new Error(`Миграция ${version} уже применена с другим содержимым`);
      continue;
    }
    for (const statement of splitSqlStatements(sql)) await connection.query(statement);
    await connection.query('INSERT INTO game_schema_migrations (version,checksum) VALUES (?,?)', [version, checksum]);
    logger.log(`Применена миграция игры ${version}`);
    applied.push(version);
  }
  return applied;
}
