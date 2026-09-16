import { loadConfig } from '../backend/src/config.mjs';
import { createPool, inTransaction } from '../backend/src/db.mjs';
import { hashPassword } from '../backend/src/auth-service.mjs';

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? null : process.argv[index + 1];
}

const email = String(option('email') ?? '').trim().toLowerCase();
const displayName = String(option('name') ?? '').trim();
const projectCode = String(option('project') ?? '').trim();
const password = process.env.PARTNER_PASSWORD;
if (!email || !displayName || !projectCode || !password) {
  throw new Error('Использование: PARTNER_PASSWORD=... npm run create-partner -- --email partner@example.com --name "Имя" --project zebra');
}
const config = loadConfig();
const pool = createPool(config.database);
try {
  const passwordHash = await hashPassword(password);
  const userId = await inTransaction(pool, async (connection) => {
    const [projects] = await connection.query('SELECT id,name,partner_id FROM projects WHERE code=:code AND active=TRUE FOR UPDATE', { code: projectCode });
    if (projects.length !== 1) throw new Error('Активный проект не найден');
    const [existing] = await connection.query('SELECT id FROM users WHERE LOWER(email)=:email AND deleted_at IS NULL', { email });
    if (existing.length) throw new Error('Пользователь с таким email уже существует');
    const [roles] = await connection.query("SELECT id FROM roles WHERE code='partner' LIMIT 1");
    if (!roles.length) throw new Error('Роль partner не найдена: сначала примените миграции');
    let partnerId = projects[0].partner_id;
    if (partnerId == null) {
      const [createdPartner] = await connection.query('INSERT INTO partners(name,active) VALUES (:name,TRUE)', { name: projects[0].name ?? displayName });
      partnerId = createdPartner.insertId;
      await connection.query('UPDATE projects SET partner_id=:partnerId WHERE id=:projectId', { partnerId, projectId: projects[0].id });
    }
    if (projectCode === 'zebra') await connection.query(`INSERT INTO partner_agreement_versions
      (project_id,partner_id,tax_percent,icube_percent,partner_percent,valid_from,created_by_user_id)
      SELECT :projectId,:partnerId,4.000,40.000,60.000,'2026-01-01 00:00:00',NULL
      WHERE NOT EXISTS (SELECT 1 FROM partner_agreement_versions
        WHERE project_id=:projectId AND partner_id=:partnerId AND valid_to IS NULL)`, {
      projectId: projects[0].id, partnerId,
    });
    const [created] = await connection.query(`INSERT INTO users(email,password_hash,display_name,status)
      VALUES (:email,:passwordHash,:displayName,'active')`, { email, passwordHash, displayName });
    await connection.query('INSERT INTO user_roles(user_id,role_id) VALUES (:userId,:roleId)', { userId: created.insertId, roleId: roles[0].id });
    await connection.query('INSERT INTO partner_users(partner_id,user_id) VALUES (:partnerId,:userId)', { partnerId, userId: created.insertId });
    return created.insertId;
  });
  console.log(`Партнёр создан, user id: ${userId}`);
} finally { await pool.end(); }
