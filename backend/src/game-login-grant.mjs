import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Разрешение на вход: подпись CRM о том, что с этого браузера ребёнок уже входил с верным паролем.
// Оно не заменяет пароль и само ничего не открывает: только переводит попытку входа в собственный
// счётчик неудач, чтобы чужие ошибки (одноклассник за тем же адресом, перебор логина с других адресов)
// не блокировали ребёнка. Ключ знает только CRM; сброс пароля и отключение меняют token_version,
// и старые разрешения перестают совпадать.
export const LOGIN_GRANT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const VERSION = 'v1';
const MAX_LENGTH = 512;
const GRANT_PATTERN = /^v1\.[A-Za-z0-9_-]{1,400}\.[A-Za-z0-9_-]{43}$/;

export function createLoginGrants({ key, now = () => Date.now(), ttlMs = LOGIN_GRANT_TTL_MS }) {
  const mac = (payload) => createHmac('sha256', key).update(`${VERSION}.${payload}`).digest();

  // Каждое разрешение получает новый id: копия старого не делит счётчик с новым.
  function sign({ userId, login, tokenVersion }) {
    const payload = Buffer.from(JSON.stringify({
      u: String(userId), l: login, t: tokenVersion, g: randomBytes(16).toString('base64url'), e: now() + ttlMs,
    })).toString('base64url');
    return `${VERSION}.${payload}.${mac(payload).toString('base64url')}`;
  }

  // Возвращает { grantId, userId, tokenVersion } или null: неверный формат, подпись, срок или логин.
  function read(value, login) {
    if (typeof value !== 'string' || value.length > MAX_LENGTH || !GRANT_PATTERN.test(value)) return null;
    const [, payload, signature] = value.split('.');
    const provided = Buffer.from(signature, 'base64url');
    const expected = mac(payload);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
    let data;
    try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
    if (!data || typeof data.g !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(data.g) || typeof data.u !== 'string'
      || !Number.isInteger(data.t) || !Number.isFinite(data.e) || data.e <= now() || data.l !== login) return null;
    return { grantId: data.g, userId: data.u, tokenVersion: data.t };
  }

  return { sign, read };
}
