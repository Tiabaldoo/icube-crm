import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const hash = (value) => createHash('sha256').update(value).digest('hex');

export function splitSqlStatements(sql) {
  const statements = []; let start = 0; let quote = null; let lineComment = false; let blockComment = false;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]; const next = sql[index + 1];
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; index += 1; } continue; }
    if (!quote && char === '-' && next === '-' && /\s/.test(sql[index + 2] ?? '')) { lineComment = true; index += 1; continue; }
    if (!quote && char === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (quote) {
      if (char === '\\') { index += 1; continue; }
      if (char === quote && next === quote) { index += 1; continue; }
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
    if (char === ';') {
      const statement = sql.slice(start, index).trim(); if (statement) statements.push(statement); start = index + 1;
    }
  }
  const tail = sql.slice(start).trim(); if (tail) statements.push(tail);
  return statements;
}

async function ensureMetadata(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(64) NOT NULL PRIMARY KEY, checksum CHAR(64) NOT NULL,
    applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)) ENGINE=InnoDB`);
  await connection.query(`CREATE TABLE IF NOT EXISTS schema_migration_runs (
    version VARCHAR(64) NOT NULL PRIMARY KEY, checksum CHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL, current_step INT UNSIGNED NULL, last_error TEXT NULL,
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)) ENGINE=InnoDB`);
  await connection.query(`CREATE TABLE IF NOT EXISTS schema_migration_steps (
    version VARCHAR(64) NOT NULL, step_index INT UNSIGNED NOT NULL, statement_checksum CHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL, last_error TEXT NULL, updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY(version,step_index)) ENGINE=InnoDB`);
}

export async function runMigration(connection, { version, sql, logger = console }) {
  await ensureMetadata(connection);
  const checksum = hash(sql);
  const [applied] = await connection.execute('SELECT checksum FROM schema_migrations WHERE version = ?', [version]);
  if (applied.length) {
    if (applied[0].checksum !== checksum) throw new Error(`Уже применённая миграция изменена: ${version}`);
    logger.log(`Пропуск ${version}`); return { status: 'skipped' };
  }
  const [runs] = await connection.execute('SELECT checksum,status,current_step FROM schema_migration_runs WHERE version = ?', [version]);
  if (runs.length && runs[0].checksum !== checksum) throw new Error(`Частично применённая миграция изменена: ${version}`);
  if (!runs.length) await connection.execute(`INSERT INTO schema_migration_runs(version,checksum,status) VALUES (?,?,'running')`, [version, checksum]);
  const statements = splitSqlStatements(sql);
  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index]; const statementChecksum = hash(statement);
    const [steps] = await connection.execute('SELECT statement_checksum,status FROM schema_migration_steps WHERE version=? AND step_index=?', [version, index]);
    if (steps[0]?.statement_checksum !== undefined && steps[0].statement_checksum !== statementChecksum) throw new Error(`Изменён шаг ${index + 1} миграции ${version}`);
    if (steps[0]?.status === 'completed') continue;
    if (steps[0]?.status === 'started') throw new Error(`Шаг ${index + 1} миграции ${version} был прерван в неопределённом состоянии; проверьте объект БД перед продолжением`);
    await connection.execute(`INSERT INTO schema_migration_steps(version,step_index,statement_checksum,status)
      VALUES (?,?,?,'started') ON DUPLICATE KEY UPDATE status='started',last_error=NULL`, [version, index, statementChecksum]);
    await connection.execute(`UPDATE schema_migration_runs SET status='running',current_step=?,last_error=NULL WHERE version=?`, [index, version]);
    try {
      await connection.query(statement);
      await connection.execute(`UPDATE schema_migration_steps SET status='completed',last_error=NULL WHERE version=? AND step_index=?`, [version, index]);
    } catch (error) {
      await connection.execute(`UPDATE schema_migration_steps SET status='failed',last_error=? WHERE version=? AND step_index=?`, [String(error.message).slice(0, 65535), version, index]);
      await connection.execute(`UPDATE schema_migration_runs SET status='failed',last_error=? WHERE version=?`, [String(error.message).slice(0, 65535), version]);
      throw error;
    }
  }
  await connection.execute('INSERT INTO schema_migrations (version,checksum) VALUES (?,?)', [version, checksum]);
  await connection.execute(`UPDATE schema_migration_runs SET status='completed',current_step=NULL,last_error=NULL WHERE version=?`, [version]);
  logger.log(`Применена ${version}`); return { status: 'applied' };
}

export async function runMigrations(connection, { directory, logger = console } = {}) {
  await ensureMetadata(connection);
  const files = (await readdir(directory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  for (const file of files) await runMigration(connection, { version: file, sql: await readFile(path.join(directory, file), 'utf8'), logger });
}
