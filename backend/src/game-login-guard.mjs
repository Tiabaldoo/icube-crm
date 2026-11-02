import { isIP } from 'node:net';
import { ApiProblem } from './catalog.mjs';

export const GAME_LOGIN_LIMITS = Object.freeze({
  pairFailures: 5, loginFailures: 20, ipFailures: 50,
  windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000,
  knownPairMs: 30 * 24 * 60 * 60 * 1000, maxEntries: 50_000,
});

function expandIpv6(value) {
  let text = value.toLowerCase();
  const dotted = text.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number);
    text = `${text.slice(0, -dotted[0].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = text.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const fill = text.includes('::') ? 8 - left.length - right.length : 0;
  return [...left, ...Array(fill).fill('0'), ...right].map((part) => part.padStart(4, '0'));
}

const unusableIpv4 = (ip) => ip.startsWith('127.') || ip === '0.0.0.0';

// Адрес ребёнка приходит только от игрового процесса. Loopback значит, что прокси
// настроен неверно: все дети попали бы в один счётчик, поэтому такой адрес отвергается.
export function normalizeClientIp(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > 45 || text.includes('%')) return null;
  const version = isIP(text);
  if (version === 4) return unusableIpv4(text) ? null : text;
  if (version !== 6) return null;
  const groups = expandIpv6(text);
  const zeros = groups.slice(0, 5).every((part) => part === '0000');
  if (zeros && groups[5] === 'ffff') {
    const [a, b] = [parseInt(groups[6], 16), parseInt(groups[7], 16)];
    const ipv4 = `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
    return unusableIpv4(ipv4) ? null : ipv4;
  }
  if (zeros && groups[5] === '0000' && groups[6] === '0000' && ['0000', '0001'].includes(groups[7])) return null;
  return `${groups.slice(0, 4).join(':')}::/64`;
}

export function createGameLoginGuard({ now = () => Date.now(), limits = GAME_LOGIN_LIMITS } = {}) {
  const pairs = new Map();
  const logins = new Map();
  const ips = new Map();
  const knownPairs = new Map();
  const unlocked = new Map();
  const pairKey = (ip, login) => `${ip}\n${login}`;

  function remember(map, key, value) {
    map.delete(key); map.set(key, value);
    if (map.size > limits.maxEntries) map.delete(map.keys().next().value);
  }
  function current(map, key) {
    const value = map.get(key);
    if (!value) return null;
    if (now() - value.firstFailureAt < limits.windowMs || value.blockedUntil > now()) return value;
    map.delete(key);
    return null;
  }
  const blocked = (map, key) => (current(map, key)?.blockedUntil ?? 0) > now();
  function count(map, key, maxFailures) {
    const value = current(map, key);
    const failures = (value?.failures ?? 0) + 1;
    remember(map, key, { failures, firstFailureAt: value?.firstFailureAt ?? now(), blockedUntil: failures >= maxFailures ? now() + limits.blockMs : 0 });
  }
  function isKnown(ip, login) {
    const until = knownPairs.get(pairKey(ip, login));
    if (until > now()) return true;
    if (until) knownPairs.delete(pairKey(ip, login));
    return false;
  }
  function isUnlocked(login) {
    const until = unlocked.get(login);
    if (until > now()) return true;
    if (until) unlocked.delete(login);
    return false;
  }

  // Знакомая пара проходит общие уровни: чужие попытки не могут закрыть вход ребёнку.
  function assertAllowed(ip, login) {
    const limited = login == null
      ? blocked(ips, ip)
      : blocked(pairs, pairKey(ip, login)) || (!isKnown(ip, login)
        && (blocked(logins, login) || (blocked(ips, ip) && !isUnlocked(login))));
    if (limited) throw new ApiProblem(429, 'LOGIN_RATE_LIMITED', 'Слишком много попыток входа. Повторите позже');
  }

  function failure(ip, login) {
    count(ips, ip, limits.ipFailures);
    if (login == null) return;
    count(pairs, pairKey(ip, login), limits.pairFailures);
    count(logins, login, limits.loginFailures);
  }

  function success(ip, login) {
    pairs.delete(pairKey(ip, login));
    remember(knownPairs, pairKey(ip, login), now() + limits.knownPairMs);
  }

  function unlock(login) {
    logins.delete(login);
    for (const key of pairs.keys()) if (key.endsWith(`\n${login}`)) pairs.delete(key);
    remember(unlocked, login, now() + limits.blockMs);
  }

  return { assertAllowed, failure, success, unlock };
}
