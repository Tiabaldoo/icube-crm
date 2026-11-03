import { isIP } from 'node:net';

// Игра работает только на test и development и только со своей базой.
// Production закрыт в коде: снять это можно только отдельным решением владельца.
export const GAME_DATABASE = 'icube_game_test';
const ALLOWED_ENVIRONMENTS = new Set(['test', 'development']);
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function assertGameEnvironment(appEnv) {
  if (!ALLOWED_ENVIRONMENTS.has(appEnv)) throw new Error(`Игра запускается только при APP_ENV=test или development, получено ${appEnv}`);
}

export function assertGameDatabase(appEnv, database) {
  assertGameEnvironment(appEnv);
  if (database !== GAME_DATABASE) throw new Error(`Игра работает только с базой ${GAME_DATABASE}, получено ${database}`);
}

function required(env, name) {
  const value = env[name];
  if (value == null || value === '') throw new Error(`Не задана переменная окружения ${name}`);
  return value;
}

function port(env, name, fallback) {
  const value = Number(env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0 || value >= 65536) throw new Error(`Некорректный ${name}`);
  return value;
}

export function loadDatabaseConfig(env = process.env) {
  const appEnv = env.APP_ENV ?? 'development';
  const database = {
    host: required(env, 'GAME_DB_HOST'),
    port: port(env, 'GAME_DB_PORT', 3306),
    database: required(env, 'GAME_DB_NAME'),
    user: required(env, 'GAME_DB_USER'),
    password: required(env, 'GAME_DB_PASSWORD'),
  };
  assertGameDatabase(appEnv, database.database);
  return { appEnv, database };
}

// Внутренний API CRM не проксируется наружу, поэтому адрес — только loopback и только http.
function crmUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Некорректный GAME_CRM_INTERNAL_URL'); }
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname)) throw new Error('GAME_CRM_INTERNAL_URL должен указывать на 127.0.0.1');
  return url.origin;
}

function publicOrigin(value, appEnv) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Некорректный GAME_PUBLIC_ORIGIN'); }
  const local = appEnv === 'development' && LOOPBACK_HOSTS.has(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('GAME_PUBLIC_ORIGIN должен быть https://');
  return url.origin;
}

export function loadGameConfig(env = process.env) {
  const { appEnv, database } = loadDatabaseConfig(env);
  const internalToken = required(env, 'GAME_INTERNAL_TOKEN');
  if (internalToken.length < 32 || /replace_me/i.test(internalToken)) throw new Error('GAME_INTERNAL_TOKEN должен быть не короче 32 символов');
  // Только для локальной разработки: без Nginx адрес ребёнка взять неоткуда, а loopback CRM отвергает.
  const devClientIp = env.GAME_DEV_CLIENT_IP ? String(env.GAME_DEV_CLIENT_IP).trim() : null;
  if (devClientIp && (appEnv !== 'development' || !isIP(devClientIp))) throw new Error('GAME_DEV_CLIENT_IP допустим только при APP_ENV=development');
  return {
    appEnv,
    database,
    port: port(env, 'GAME_PORT', 3100),
    crmInternalUrl: crmUrl(env.GAME_CRM_INTERNAL_URL ?? 'http://127.0.0.1:3001'),
    internalToken,
    publicOrigin: publicOrigin(required(env, 'GAME_PUBLIC_ORIGIN'), appEnv),
    devClientIp,
  };
}
