import { loadConfig } from '../backend/src/config.mjs';
import { createPool, inTransaction } from '../backend/src/db.mjs';
import { hashPassword } from '../backend/src/auth-service.mjs';

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? null : process.argv[index + 1];
}

const email = String(option('email') ?? '').trim().toLowerCase();
const displayName = String(option('name') ?? '').trim();
const password = process.env.DIRECTOR_PASSWORD;
if (!email || !displayName || !password) {
  throw new Error('Использование: DIRECTOR_PASSWORD=... npm run create-director -- --email director@example.com --name "Имя Директора"');
}

const config = loadConfig();
const pool = createPool(config.database);
try {
  const passwordHash = await hashPassword(password);
  const userId = await inTransaction(pool, async (connection) => {
    const [existing] = await connection.query('SELECT id FROM users WHERE LOWER(email)=:email AND deleted_at IS NULL LIMIT 1', { email });
    if (existing.length) throw new Error('Пользователь с таким email уже существует');
    const [roles] = await connection.query("SELECT id FROM roles WHERE code='director' LIMIT 1");
    if (!roles.length) throw new Error('Роль director не найдена: сначала примените миграции');
    const [created] = await connection.query(`INSERT INTO users (email,password_hash,display_name,status)
      VALUES (:email,:passwordHash,:displayName,'active')`, { email, passwordHash, displayName });
    await connection.query('INSERT INTO user_roles (user_id,role_id) VALUES (:userId,:roleId)', { userId: created.insertId, roleId: roles[0].id });
    return created.insertId;
  });
  console.log(`Директор создан, user id: ${userId}`);
} finally {
  await pool.end();
}
