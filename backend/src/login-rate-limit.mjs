import { ApiProblem } from './catalog.mjs';

const normalizeLogin = (value) => String(value ?? '').trim().toLowerCase();
const normalizeIp = (value) => String(value ?? '').trim().slice(0, 128) || 'unknown';

export function createLoginRateLimiter({ now = () => Date.now(), maxFailures = 5, windowMs = 15 * 60 * 1000, blockMs = 15 * 60 * 1000 } = {}) {
  const attempts = new Map();
  const keyFor = (ip, login) => `${normalizeIp(ip)}\n${normalizeLogin(login)}`;

  function current(ip, login) {
    const key = keyFor(ip, login); const time = now(); const value = attempts.get(key);
    if (!value || time - value.firstFailureAt >= windowMs) {
      if (value) attempts.delete(key);
      return { key, time, value: null };
    }
    return { key, time, value };
  }

  function assertAllowed(ip, login) {
    const { time, value } = current(ip, login);
    if (value?.blockedUntil > time) {
      throw new ApiProblem(429, 'LOGIN_RATE_LIMITED', 'Слишком много попыток входа. Повторите позже');
    }
  }

  function failure(ip, login) {
    const { key, time, value } = current(ip, login);
    const failures = (value?.failures ?? 0) + 1;
    attempts.set(key, { failures, firstFailureAt: value?.firstFailureAt ?? time, blockedUntil: failures >= maxFailures ? time + blockMs : 0 });
  }

  function success(ip, login) { attempts.delete(keyFor(ip, login)); }
  return { assertAllowed, failure, success };
}
