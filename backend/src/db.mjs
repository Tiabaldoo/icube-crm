import mysql from 'mysql2/promise';

export function createPool(config) {
  const pool = mysql.createPool({
    ...config,
    waitForConnections: true,
    namedPlaceholders: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    timezone: '+11:00',
    dateStrings: true,
    charset: 'utf8mb4',
  });
  pool.pool.on('connection', (connection) => { connection.query("SET time_zone = '+11:00'"); });
  return pool;
}

export async function inTransaction(pool, operation) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
