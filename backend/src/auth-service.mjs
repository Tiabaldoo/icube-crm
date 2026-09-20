import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { inTransaction } from './db.mjs';
import { ApiProblem } from './catalog.mjs';

export const SESSION_COOKIE = 'icube_session';
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const DUMMY_PASSWORD_HASH = '$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW';

const normalizeLogin = (value) => String(value ?? '').trim().toLowerCase();
const tokenHash = (value) => createHash('sha256').update(value).digest('hex');
const invalidCredentials = () => new ApiProblem(401, 'INVALID_CREDENTIALS', 'Неверный логин или пароль');
const teacherId = (value) => {
  const result = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(result)) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Некорректный teacherId');
  return result;
};
const validLogin = (value) => {
  const login = normalizeLogin(value);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login) || login.length > 254) {
    throw new ApiProblem(400, 'VALIDATION_ERROR', 'Укажите корректный логин email');
  }
  return login;
};
const validPassword = (value) => {
  const password = String(value ?? '');
  if (password.length < 8) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Пароль должен содержать не менее 8 символов');
  return password;
};

export function parseSessionCookie(header = '') {
  for (const part of String(header).split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== SESSION_COOKIE) continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return null; }
  }
  return null;
}

export function sessionCookieOptions({ expires } = {}) {
  return { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/v1', ...(expires ? { expires } : { maxAge: SESSION_TTL_SECONDS * 1000 }) };
}
export function clearSessionCookieOptions() {
  return { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/v1' };
}

async function rolesFor(connection, userId) {
  const [rows] = await connection.query(`SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id
    WHERE ur.user_id=:userId ORDER BY r.code`, { userId });
  return rows.map((row) => row.code);
}

async function profileFor(connection, user) {
  const roles = await rolesFor(connection, user.id);
  let projectIds = [];
  if (roles.includes('partner') && !roles.includes('director')) {
    const [projects] = await connection.query(`SELECT p.id FROM partner_users pu JOIN partners partner ON partner.id=pu.partner_id
      JOIN projects p ON p.partner_id=partner.id
      WHERE pu.user_id=:userId AND partner.active=TRUE AND p.active=TRUE ORDER BY p.id`, { userId: user.id });
    projectIds = projects.map((row) => String(row.id));
  }
  return {
    id: String(user.id), displayName: user.display_name, roles,
    teacherId: user.teacher_id == null ? null : String(user.teacher_id),
    projectIds,
  };
}

export async function hashPassword(password) {
  return bcrypt.hash(validPassword(password), 12);
}

export function createAuthService(pool, {
  now = () => new Date(),
  makeToken = () => randomBytes(32).toString('base64url'),
  makeSessionId = () => randomBytes(16),
  comparePassword = bcrypt.compare,
  createPasswordHash = hashPassword,
} = {}) {
  async function login(body = {}, metadata = {}) {
    const normalized = normalizeLogin(body.login);
    const password = String(body.password ?? '');
    const [users] = normalized ? await pool.query(`SELECT u.id,u.password_hash,u.display_name,u.status,u.token_version,t.id teacher_id
      FROM users u LEFT JOIN teachers t ON t.user_id=u.id AND t.deleted_at IS NULL
      WHERE LOWER(u.email)=:login AND u.deleted_at IS NULL LIMIT 1`, { login: normalized }) : [[]];
    const user = users[0] ?? null;
    const passwordOk = await comparePassword(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
    if (!user || !passwordOk || user.status !== 'active') throw invalidCredentials();
    const profile = await profileFor(pool, user);
    if (!profile.roles.some((role) => role === 'director' || role === 'teacher' || role === 'partner' || role === 'parent')
      || (profile.roles.includes('partner') && !profile.roles.includes('director') && profile.projectIds.length !== 1)) throw invalidCredentials();

    const sessionToken = makeToken();
    const expiresAt = new Date(now().getTime() + SESSION_TTL_SECONDS * 1000);
    await inTransaction(pool, async (connection) => {
      await connection.query(`INSERT INTO auth_sessions
        (id,user_id,refresh_token_hash,token_version,user_agent,ip_address,expires_at)
        VALUES (:id,:userId,:tokenHash,:tokenVersion,:userAgent,NULL,:expiresAt)`, {
        id: makeSessionId(), userId: user.id, tokenHash: tokenHash(sessionToken), tokenVersion: user.token_version,
        userAgent: String(metadata.userAgent ?? '').slice(0, 512) || null, expiresAt,
      });
      await connection.query('UPDATE users SET last_login_at=NOW(6) WHERE id=:userId', { userId: user.id });
    });
    return { profile, sessionToken, expiresAt };
  }

  async function authenticateToken(sessionToken) {
    if (!sessionToken) throw new ApiProblem(401, 'UNAUTHENTICATED', 'Требуется вход');
    const [sessions] = await pool.query(`SELECT s.id session_id,u.id,u.display_name,t.id teacher_id
      FROM auth_sessions s JOIN users u ON u.id=s.user_id
      LEFT JOIN teachers t ON t.user_id=u.id AND t.deleted_at IS NULL
      WHERE s.refresh_token_hash=:tokenHash AND s.revoked_at IS NULL AND s.expires_at>NOW(6)
        AND s.token_version=u.token_version AND u.status='active' AND u.deleted_at IS NULL LIMIT 1`, {
      tokenHash: tokenHash(sessionToken),
    });
    const user = sessions[0];
    if (!user) throw new ApiProblem(401, 'UNAUTHENTICATED', 'Требуется вход');
    const profile = await profileFor(pool, user);
    if (!profile.roles.some((role) => role === 'director' || role === 'teacher' || role === 'partner' || role === 'parent')
      || (profile.roles.includes('partner') && !profile.roles.includes('director') && profile.projectIds.length !== 1)) {
      throw new ApiProblem(403, 'FORBIDDEN', 'Партнёр не связан с одним активным проектом');
    }
    return { ...profile, userId: profile.id, sessionId: user.session_id };
  }

  async function logout(sessionId) {
    if (sessionId) await pool.query('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,NOW(6)) WHERE id=:sessionId', { sessionId });
  }

  async function getTeacherAccess(rawTeacherId, connection = pool) {
    const [rows] = await connection.query(`SELECT t.id teacher_id,t.user_id,u.email,u.status
      FROM teachers t LEFT JOIN users u ON u.id=t.user_id
      WHERE t.id=:teacherId AND t.deleted_at IS NULL LIMIT 1`, { teacherId: teacherId(rawTeacherId) });
    if (!rows.length) throw new ApiProblem(404, 'NOT_FOUND', 'Преподаватель не найден');
    const row = rows[0];
    return { teacherId: String(row.teacher_id), exists: row.user_id != null, login: row.email ?? null, status: row.status ?? null };
  }

  async function createTeacherAccess(rawTeacherId, body, actorUserId) {
    const login = validLogin(body.login); const passwordHash = await createPasswordHash(body.password);
    await inTransaction(pool, async (connection) => {
      const [teachers] = await connection.query('SELECT id,user_id,full_name FROM teachers WHERE id=:teacherId AND deleted_at IS NULL FOR UPDATE', { teacherId: teacherId(rawTeacherId) });
      const teacher = teachers[0];
      if (!teacher) throw new ApiProblem(404, 'NOT_FOUND', 'Преподаватель не найден');
      let userId = teacher.user_id;
      const [duplicate] = await connection.query('SELECT id FROM users WHERE LOWER(email)=:login AND id<>COALESCE(:userId,0) AND deleted_at IS NULL LIMIT 1', { login, userId });
      if (duplicate.length) throw new ApiProblem(409, 'LOGIN_EXISTS', 'Этот логин уже используется');
      if (userId) {
        await connection.query(`UPDATE users SET email=:login,password_hash=:passwordHash,display_name=:displayName,
          status='active',token_version=token_version+1 WHERE id=:userId`, { login, passwordHash, displayName: teacher.full_name, userId });
        await connection.query('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,NOW(6)) WHERE user_id=:userId', { userId });
      } else {
        const [created] = await connection.query(`INSERT INTO users (email,password_hash,display_name,status)
          VALUES (:login,:passwordHash,:displayName,'active')`, { login, passwordHash, displayName: teacher.full_name });
        userId = created.insertId;
        await connection.query('UPDATE teachers SET user_id=:userId WHERE id=:teacherId', { userId, teacherId: teacher.id });
      }
      const [roles] = await connection.query("SELECT id FROM roles WHERE code='teacher' LIMIT 1");
      if (!roles.length) throw new Error('Роль teacher не найдена');
      await connection.query(`INSERT IGNORE INTO user_roles (user_id,role_id,granted_by_user_id)
        VALUES (:userId,:roleId,:actorUserId)`, { userId, roleId: roles[0].id, actorUserId });
    });
    return getTeacherAccess(rawTeacherId);
  }

  async function resetTeacherPassword(rawTeacherId, body) {
    const passwordHash = await createPasswordHash(body.password);
    await inTransaction(pool, async (connection) => {
      const access = await getTeacherAccess(rawTeacherId, connection);
      if (!access.exists) throw new ApiProblem(409, 'TEACHER_ACCESS_MISSING', 'Доступ преподавателя ещё не создан');
      const [teachers] = await connection.query('SELECT user_id FROM teachers WHERE id=:teacherId FOR UPDATE', { teacherId: teacherId(rawTeacherId) });
      const userId = teachers[0].user_id;
      await connection.query(`UPDATE users SET password_hash=:passwordHash,status='active',token_version=token_version+1 WHERE id=:userId`, { passwordHash, userId });
      await connection.query('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,NOW(6)) WHERE user_id=:userId', { userId });
    });
    return getTeacherAccess(rawTeacherId);
  }

  async function disableTeacherAccess(rawTeacherId) {
    await inTransaction(pool, async (connection) => {
      const [teachers] = await connection.query('SELECT user_id FROM teachers WHERE id=:teacherId AND deleted_at IS NULL FOR UPDATE', { teacherId: teacherId(rawTeacherId) });
      if (!teachers.length) throw new ApiProblem(404, 'NOT_FOUND', 'Преподаватель не найден');
      const userId = teachers[0].user_id;
      if (!userId) throw new ApiProblem(409, 'TEACHER_ACCESS_MISSING', 'Доступ преподавателя ещё не создан');
      await connection.query("UPDATE users SET status='blocked',token_version=token_version+1 WHERE id=:userId", { userId });
      await connection.query('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,NOW(6)) WHERE user_id=:userId', { userId });
    });
    return getTeacherAccess(rawTeacherId);
  }

  return { login, authenticateToken, logout, getTeacherAccess, createTeacherAccess, resetTeacherPassword, disableTeacherAccess };
}
