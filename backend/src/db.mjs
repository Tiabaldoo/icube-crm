import mysql from 'mysql2/promise';

export function createPool(config) {
  return mysql.createPool({
    ...config,
    waitForConnections: true,
    namedPlaceholders: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    timezone: 'Z',
    charset: 'utf8mb4',
  });
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
