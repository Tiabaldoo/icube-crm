import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { assertDatabaseEnvironment } from '../backend/src/config.mjs';

function required(name) {
  if (!process.env[name]) throw new Error(`Не задана переменная окружения ${name}`);
  return process.env[name];
}

const appEnv = process.env.APP_ENV ?? 'development';
const database = required('DB_NAME');
assertDatabaseEnvironment(appEnv, database);

const connection = await mysql.createConnection({
  host: required('DB_HOST'),
  port: Number(process.env.DB_PORT ?? 3306),
  user: required('DB_USER'),
  password: required('DB_PASSWORD'),
  database,
  multipleStatements: true,
  charset: 'utf8mb4',
});

try {
  await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(64) NOT NULL PRIMARY KEY,
    checksum CHAR(64) NOT NULL,
    applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
  ) ENGINE=InnoDB`);
  const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
  const files = (await readdir(directory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  for (const file of files) {
    const sql = await readFile(path.join(directory, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const [rows] = await connection.execute('SELECT checksum FROM schema_migrations WHERE version = ?', [file]);
    if (rows.length) {
      if (rows[0].checksum !== checksum) throw new Error(`Уже применённая миграция изменена: ${file}`);
      console.log(`Пропуск ${file}`);
      continue;
    }
    await connection.beginTransaction();
    try {
      await connection.query(sql);
      await connection.execute('INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)', [file, checksum]);
      await connection.commit();
      console.log(`Применена ${file}`);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }
} finally {
  await connection.end();
}
