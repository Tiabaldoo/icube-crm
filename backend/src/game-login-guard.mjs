import { isIP } from 'node:net';
import { ApiProblem } from './catalog.mjs';

export const GAME_LOGIN_LIMITS = Object.freeze({
  pairFailures: 5, loginFailures: 20, ipFailures: 50,
  windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000,
  knownPairMs: 30 * 24 * 60 * 60 * 1000, maxEntries: 50_000,
  maxPairInFlight: 1, maxIpInFlight: 3,
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

function classifyIpv4(ip) {
  const [a, b] = ip.split('.').map(Number);
  if (a === 0 || a === 127 || (a === 169 && b === 254) || a >= 224) return 'invalid';
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return 'private';
  return 'public';
}

function classifyIpv6(groups) {
  const first = parseInt(groups[0], 16);
  if (groups.slice(0, 6).every((part) => part === '0000')) return 'invalid';
  if (groups[0] === '0064' && groups[1] === 'ff9b') return 'invalid';
  if ((first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00) return 'invalid';
  return (first & 0xfe00) === 0xfc00 ? 'private' : 'public';
}

// Адрес ребёнка приходит только от игрового процесса. Служебный или внутренний адрес значит,
// что прокси настроен неверно: все дети попали бы в один счётчик, поэтому такой адрес отвергается.
export function normalizeClientIp(value, { allowPrivate = false } = {}) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > 45 || text.includes('%')) return null;
  const usable = (kind) => kind === 'public' || (kind === 'private' && allowPrivate);
  const version = isIP(text);
  if (version === 4) return usable(classifyIpv4(text)) ? text : null;
  if (version !== 6) return null;
  const groups = expandIpv6(text);
  if (groups.slice(0, 5).every((part) => part === '0000') && groups[5] === 'ffff') {
    const [a, b] = [parseInt(groups[6], 16), parseInt(groups[7], 16)];
    const ipv4 = `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
    return usable(classifyIpv4(ipv4)) ? ipv4 : null;
  }
  return usable(classifyIpv6(groups)) ? `${groups.slice(0, 4).join(':')}::/64` : null;
}

export function createGameLoginGuard({ now = () => Date.now(), limits = GAME_LOGIN_LIMITS } = {}) {
  const pairs = new Map();
  const logins = new Map();
  const ips = new Map();
  const knownPairs = new Map();
  const unlocked = new Map();
  const flight = { pairs: new Map(), logins: new Map(), ips: new Map() };
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
  function count(map, key, maxFailures) {
    const value = current(map, key);
    const failures = (value?.failures ?? 0) + 1;
    const active = (value?.blockedUntil ?? 0) > now();
    remember(map, key, {
      failures, firstFailureAt: value?.firstFailureAt ?? now(),
      blockedUntil: active ? value.blockedUntil : failures >= maxFailures ? now() + limits.blockMs : 0,
    });
  }
  // Запросы в полёте считаются как неудачи: параллельные попытки не обходят лимит.
  function exhausted(map, inFlight, key, maxFailures) {
    const value = current(map, key);
    return (value?.blockedUntil ?? 0) > now() || (value?.failures ?? 0) + (inFlight.get(key) ?? 0) >= maxFailures;
  }
  function hold(map, key) { map.set(key, (map.get(key) ?? 0) + 1); }
  function drop(map, key) {
    const left = (map.get(key) ?? 0) - 1;
    if (left > 0) map.set(key, left); else map.delete(key);
  }
  function isKnown(key) {
    const until = knownPairs.get(key);
    if (until > now()) return true;
    if (until) knownPairs.delete(key);
    return false;
  }
  function isUnlocked(login) {
    const until = unlocked.get(login);
    if (until > now()) return true;
    if (until) unlocked.delete(login);
    return false;
  }

  // Знакомая пара проходит общие уровни: чужие попытки не могут закрыть вход ребёнку.
  function begin(ip, login) {
    const pair = login == null ? null : pairKey(ip, login);
    const ipSpent = exhausted(ips, flight.ips, ip, limits.ipFailures);
    const limited = login == null ? ipSpent
      : exhausted(pairs, flight.pairs, pair, limits.pairFailures) || (!isKnown(pair)
        && (exhausted(logins, flight.logins, login, limits.loginFailures) || (ipSpent && !isUnlocked(login))));
    if (limited) throw new ApiProblem(429, 'LOGIN_RATE_LIMITED', 'Слишком много попыток входа. Повторите позже');
    // Один адрес не может занять общую очередь проверки паролей, даже с верным паролем.
    if ((flight.ips.get(ip) ?? 0) >= limits.maxIpInFlight || (pair != null && (flight.pairs.get(pair) ?? 0) >= limits.maxPairInFlight)) {
      throw new ApiProblem(429, 'GAME_LOGIN_BUSY', 'Сервер занят. Повторите вход через несколько секунд');
    }

    hold(flight.ips, ip);
    if (login != null) { hold(flight.pairs, pair); hold(flight.logins, login); }
    let open = true;
    const finish = () => {
      if (!open) return false;
      open = false;
      drop(flight.ips, ip);
      if (login != null) { drop(flight.pairs, pair); drop(flight.logins, login); }
      return true;
    };
    return {
      release: finish,
      failure() {
        if (!finish()) return;
        count(ips, ip, limits.ipFailures);
        if (login == null) return;
        count(pairs, pair, limits.pairFailures);
        count(logins, login, limits.loginFailures);
      },
      success() {
        if (!finish() || login == null) return;
        pairs.delete(pair);
        remember(knownPairs, pair, now() + limits.knownPairMs);
      },
    };
  }

  function unlock(login) {
    logins.delete(login);
    for (const key of pairs.keys()) if (key.endsWith(`\n${login}`)) pairs.delete(key);
    remember(unlocked, login, now() + limits.blockMs);
  }

  const size = () => ({ pairs: pairs.size, logins: logins.size, ips: ips.size, knownPairs: knownPairs.size });
  return { begin, unlock, size };
}
