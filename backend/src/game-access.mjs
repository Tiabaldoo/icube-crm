import { randomInt } from 'node:crypto';
import { hashPassword } from './auth-service.mjs';
import { ApiProblem } from './catalog.mjs';
import { childPasswordWords } from './child-password-words.mjs';
import { inTransaction } from './db.mjs';
import { createGameLoginGuard, normalizeClientIp } from './game-login-guard.mjs';
import { createPasswordVerifier } from './game-password-verifier.mjs';
import { partnerProjectId } from './project-scope.mjs';

export const CHILD_LOGIN_SUFFIX = '@child.icube.local';
const LOGIN_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const LOGIN_STATUSES = new Set(['active', 'paused']);
const MAX_PASSWORD_LENGTH = 128;
const DUMMY_PASSWORD_HASH = '$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW';

const invalidCredentials = () => new ApiProblem(401, 'INVALID_CREDENTIALS', 'Неверный логин или пароль');
const identifier = (value, name) => {
  const result = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(result)) throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректный ${name}`);
  return result;
};
const normalizeLogin = (value) => {
  const login = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return LOGIN_PATTERN.test(login) ? login : null;
};
const emailFor = (login) => `${login}${CHILD_LOGIN_SUFFIX}`;
const loginFrom = (email) => String(email ?? '').endsWith(CHILD_LOGIN_SUFFIX) ? email.slice(0, -CHILD_LOGIN_SUFFIX.length) : email;
const isChildOnly = (roles) => roles.length === 1 && roles[0] === 'child';

// created_at читается в поясе соединения (+11:00), поэтому его дата и есть день по Сахалину.
function firstAccessOn(createdAt) {
  const date = String(createdAt ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Некорректная дата первого игрового доступа');
  return date;
}

export function generatedChildPassword(pick = randomInt) {
  const word = () => childPasswordWords[pick(0, childPasswordWords.length)];
  return `${word()}-${word()}-${word()}-${word()}-${pick(0, 10)}${pick(0, 10)}`;
}

export function createGameAccess(pool, {
  guard = createGameLoginGuard(),
  passwordVerifier = null,
  createPasswordHash = hashPassword,
  makePassword = generatedChildPassword,
  allowPrivateClientIp = false,
} = {}) {
  let verifier = passwordVerifier;

  async function transaction(operation) {
    try { return await inTransaction(pool, operation); }
    catch (error) {
      if (error?.code !== 'ER_LOCK_DEADLOCK') throw error;
      return inTransaction(pool, operation);
    }
  }

  async function rolesOf(connection, userId) {
    const [rows] = await connection.query(`SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id
      WHERE ur.user_id=:userId ORDER BY r.code`, { userId });
    return rows.map((row) => row.code);
  }

  async function childScope(connection, context, rawChildId, { lock = false } = {}) {
    if (!(context.roles ?? []).some((role) => role === 'director' || role === 'partner')) throw new ApiProblem(403, 'FORBIDDEN', 'Управление игровым доступом недоступно');
    const childId = identifier(rawChildId, 'childId');
    const projectId = partnerProjectId(context);
    const [children] = await connection.query(`SELECT id,full_name,status FROM children WHERE id=:childId AND deleted_at IS NULL${lock ? ' FOR UPDATE' : ''}`, { childId });
    const child = children[0];
    if (!child) throw new ApiProblem(projectId ? 403 : 404, projectId ? 'FORBIDDEN' : 'NOT_FOUND', projectId ? 'Ребёнок другого проекта недоступен' : 'Ребёнок не найден');
    if (!projectId) return { child, childId, manageable: true };
    const [enrollments] = await connection.query(`SELECT DISTINCT project_id FROM child_enrollments
      WHERE child_id=:childId AND superseded_at IS NULL`, { childId });
    const projects = enrollments.map((row) => String(row.project_id));
    if (!projects.includes(projectId)) throw new ApiProblem(403, 'FORBIDDEN', 'Ребёнок другого проекта недоступен');
    return { child, childId, manageable: projects.every((id) => id === projectId) };
  }

  async function managedChild(connection, context, rawChildId, options) {
    const scope = await childScope(connection, context, rawChildId, options);
    if (!scope.manageable) throw new ApiProblem(403, 'GAME_ACCESS_DIRECTOR_ONLY', 'Ребёнок относится к нескольким проектам: доступом управляет директор');
    return scope;
  }

  async function accountOf(connection, childId, { lock = false } = {}) {
    const [rows] = await connection.query(`SELECT a.user_id,a.created_at,u.email,u.status,u.deleted_at
      FROM child_user_accounts a JOIN users u ON u.id=a.user_id WHERE a.child_id=:childId${lock ? ' FOR UPDATE' : ''}`, { childId });
    return rows[0] ?? null;
  }

  // Строка child_user_accounts могла появиться раньше: чужую учётку управление доступом не трогает.
  const isChildAccount = async (connection, account) => account.deleted_at == null && isChildOnly(await rolesOf(connection, account.user_id));

  async function childAccount(connection, childId, options) {
    const account = await accountOf(connection, childId, options);
    if (!account) throw new ApiProblem(409, 'GAME_ACCESS_MISSING', 'Игровой доступ ещё не создан');
    if (!await isChildAccount(connection, account)) throw new ApiProblem(409, 'GAME_ACCESS_INVALID', 'Связанная учётная запись не является детской');
    return account;
  }

  const describe = (child, account) => ({
    manageable: true, exists: true, login: loginFrom(account.email), status: account.status,
    canLogin: account.status === 'active' && LOGIN_STATUSES.has(child.status),
    firstAccessOn: firstAccessOn(account.created_at),
  });

  async function audit(connection, context, action, childId, userId) {
    await connection.query(`INSERT INTO audit_log (actor_user_id,action,entity_type,entity_id,before_data,after_data)
      VALUES (:actorId,:action,'child',:childId,NULL,:after)`, {
      actorId: context.userId ?? null, action, childId, after: JSON.stringify({ userId: String(userId) }),
    });
  }

  async function get(rawChildId, context = {}) {
    const { child, childId, manageable } = await childScope(pool, context, rawChildId);
    if (!manageable) return { manageable: false };
    const account = await accountOf(pool, childId);
    if (!account) return { manageable: true, exists: false, canCreate: LOGIN_STATUSES.has(child.status) };
    if (!await isChildAccount(pool, account)) return { manageable: true, exists: true, invalid: true };
    return describe(child, account);
  }

  async function create(rawChildId, body = {}, context = {}) {
    await managedChild(pool, context, rawChildId);
    const login = normalizeLogin(body?.login);
    if (!login) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Логин: от 3 до 32 символов, латинские буквы, цифры, точка, дефис или подчёркивание');
    const password = makePassword();
    const passwordHash = await createPasswordHash(password);
    const email = emailFor(login);
    try {
      const access = await transaction(async (connection) => {
        const { child, childId } = await managedChild(connection, context, rawChildId, { lock: true });
        // Блокировка строки ребёнка уже упорядочивает операции над ним; блокировать
        // отсутствующую строку нельзя: gap-блокировка дала бы взаимоблокировку на вставке.
        if (await accountOf(connection, childId)) throw new ApiProblem(409, 'GAME_ACCESS_EXISTS', 'Игровой доступ уже создан');
        if (!LOGIN_STATUSES.has(child.status)) throw new ApiProblem(409, 'GAME_ACCESS_CHILD_STATUS', 'Доступ создаётся только активному ребёнку или ребёнку на паузе');
        const [duplicate] = await connection.query('SELECT id FROM users WHERE LOWER(email)=:email LIMIT 1', { email });
        if (duplicate.length) throw new ApiProblem(409, 'LOGIN_EXISTS', 'Этот логин уже используется');
        const [created] = await connection.query(`INSERT INTO users (email,password_hash,display_name,status)
          VALUES (:email,:passwordHash,:displayName,'active')`, { email, passwordHash, displayName: child.full_name });
        const [roles] = await connection.query("SELECT id FROM roles WHERE code='child' LIMIT 1");
        if (!roles.length) throw new Error('Роль child не найдена');
        await connection.query(`INSERT INTO user_roles (user_id,role_id,granted_by_user_id)
          VALUES (:userId,:roleId,:actorId)`, { userId: created.insertId, roleId: roles[0].id, actorId: context.userId ?? null });
        await connection.query('INSERT INTO child_user_accounts (child_id,user_id) VALUES (:childId,:userId)', { childId, userId: created.insertId });
        await audit(connection, context, 'game_access.create', childId, created.insertId);
        return describe(child, await accountOf(connection, childId));
      });
      return { ...access, password };
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') throw new ApiProblem(409, 'LOGIN_EXISTS', 'Этот логин или доступ уже существует');
      throw error;
    }
  }

  async function resetPassword(rawChildId, context = {}) {
    await managedChild(pool, context, rawChildId);
    const password = makePassword();
    const passwordHash = await createPasswordHash(password);
    const access = await transaction(async (connection) => {
      const { child, childId } = await managedChild(connection, context, rawChildId, { lock: true });
      const account = await childAccount(connection, childId, { lock: true });
      await connection.query(`UPDATE users SET password_hash=:passwordHash,status='active',token_version=token_version+1 WHERE id=:userId`, { passwordHash, userId: account.user_id });
      await connection.query('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,NOW(6)) WHERE user_id=:userId', { userId: account.user_id });
      await audit(connection, context, 'game_access.reset', childId, account.user_id);
      return describe(child, { ...account, status: 'active' });
    });
    guard.unlock(access.login);
    return { ...access, password };
  }

  async function disable(rawChildId, context = {}) {
    return transaction(async (connection) => {
      const { child, childId } = await managedChild(connection, context, rawChildId, { lock: true });
      const account = await childAccount(connection, childId, { lock: true });
      await connection.query("UPDATE users SET status='blocked',token_version=token_version+1 WHERE id=:userId", { userId: account.user_id });
      await connection.query('UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,NOW(6)) WHERE user_id=:userId', { userId: account.user_id });
      await audit(connection, context, 'game_access.disable', childId, account.user_id);
      return describe(child, { ...account, status: 'blocked' });
    });
  }

  async function unlock(rawChildId, context = {}) {
    const access = await transaction(async (connection) => {
      const { child, childId } = await managedChild(connection, context, rawChildId, { lock: true });
      const account = await childAccount(connection, childId);
      await audit(connection, context, 'game_access.unlock', childId, account.user_id);
      return describe(child, account);
    });
    guard.unlock(access.login);
    return access;
  }

  // Имён детей игра не получает: в игре у ребёнка только ник, ФИО остаётся в CRM.
  async function verifyChild(body = {}) {
    const clientIp = normalizeClientIp(body?.clientIp, { allowPrivate: allowPrivateClientIp });
    if (!clientIp) {
      console.error('Игровой вход отклонён: некорректный clientIp, проверьте цепочку прокси');
      throw new ApiProblem(400, 'INVALID_CLIENT_IP', 'Некорректный адрес клиента');
    }
    const login = normalizeLogin(body?.login);
    const attempt = guard.begin(clientIp, login);
    let result = null;
    let slot = null;
    try {
      verifier ??= createPasswordVerifier();
      slot = verifier.reserve();
      const password = typeof body?.password === 'string' ? body.password : '';
      const [rows] = login ? await pool.query(`SELECT u.id,u.password_hash,u.status,u.token_version,u.deleted_at,
          a.child_id,a.created_at,c.status child_status,c.deleted_at child_deleted_at
        FROM users u LEFT JOIN child_user_accounts a ON a.user_id=u.id LEFT JOIN children c ON c.id=a.child_id
        WHERE LOWER(u.email)=:email LIMIT 1`, { email: emailFor(login) }) : [[]];
      const user = rows[0] ?? null;
      const passwordOk = await slot.compare(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
      const allowed = passwordOk && password.length <= MAX_PASSWORD_LENGTH && user != null && user.status === 'active' && user.deleted_at == null
        && user.child_id != null && user.child_deleted_at == null && LOGIN_STATUSES.has(user.child_status)
        && isChildOnly(await rolesOf(pool, user.id));
      if (allowed) {
        result = {
          childId: String(user.child_id), userId: String(user.id),
          tokenVersion: Number(user.token_version), firstAccessOn: firstAccessOn(user.created_at),
        };
      }
    } catch (error) {
      attempt.release();
      throw error;
    } finally { slot?.release(); }
    if (!result) {
      attempt.failure();
      throw invalidCredentials();
    }
    attempt.success();
    return result;
  }

  async function status(rawChildId) {
    const childId = identifier(rawChildId, 'childId');
    const [rows] = await pool.query(`SELECT c.status child_status,a.user_id,a.created_at,u.status,u.token_version,u.deleted_at
      FROM children c LEFT JOIN child_user_accounts a ON a.child_id=c.id LEFT JOIN users u ON u.id=a.user_id
      WHERE c.id=:childId AND c.deleted_at IS NULL LIMIT 1`, { childId });
    const row = rows[0];
    if (!row) return { exists: false, canLogin: false, tokenVersion: null, status: null, firstAccessOn: null };
    const hasAccount = row.user_id != null;
    const canLogin = hasAccount && row.status === 'active' && row.deleted_at == null && LOGIN_STATUSES.has(row.child_status)
      && isChildOnly(await rolesOf(pool, row.user_id));
    return {
      exists: true, canLogin, tokenVersion: hasAccount ? Number(row.token_version) : null, status: row.child_status,
      firstAccessOn: hasAccount ? firstAccessOn(row.created_at) : null,
    };
  }

  return { get, create, resetPassword, disable, unlock, verifyChild, status };
}
