import mysql from 'mysql2/promise';
import { loadDatabaseConfig } from './config.mjs';
import { runGameMigrations } from './migration-runner.mjs';

const { appEnv, database } = loadDatabaseConfig();
const connection = await mysql.createConnection({ ...database, charset: 'utf8mb4' });
try {
  const applied = await runGameMigrations(connection, { appEnv, database: database.database });
  if (!applied.length) console.log('Новых миграций игры нет');
} finally {
  await connection.end();
}
