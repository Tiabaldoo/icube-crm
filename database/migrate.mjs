import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { assertDatabaseEnvironment } from '../backend/src/config.mjs';
import { runMigrations } from './migration-runner.mjs';

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
  charset: 'utf8mb4',
});

try {
  const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
  await runMigrations(connection, { directory });
} finally {
  await connection.end();
}
