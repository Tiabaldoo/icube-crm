import { createHash, randomBytes } from 'node:crypto';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

// checkIntervalMs — как часто сверяемся с CRM (GAME_PLAN.md: не чаще раза в минуту).
// graceMs — сколько уже проверенная сессия живёт, пока CRM не отвечает; сроки при этом не продлеваются.
export const SESSION_LIMITS = Object.freeze({
  maxAgeMs: 30 * DAY, idleMs: 14 * DAY, checkIntervalMs: MINUTE, graceMs: 10 * MINUTE, seenWriteMs: MINUTE,
});

export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex');
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export class GameUnavailable extends Error {}

export function createSessions({ store, crm, now = () => Date.now(), limits = SESSION_LIMITS, logger = console }) {
  // Несколько запросов одного ребёнка ждут одну проверку статуса, а не каждый свою.
  const checks = new Map();

  function checkStatus(childId) {
    let pending = checks.get(childId);
    if (!pending) {
      pending = crm.status(childId).finally(() => checks.delete(childId));
      checks.set(childId, pending);
    }
    return pending;
  }

  async function create({ childId, tokenVersion }) {
    const token = randomBytes(32).toString('base64url');
    const createdAt = now();
    const expiresAt = createdAt + limits.maxAgeMs;
    await store.createSession({ tokenHash: hashToken(token), childId, tokenVersion, now: createdAt, expiresAt });
    // Сессии со старой версией пароля после нового входа не нужны.
    await store.revokeChildSessions(childId, 'token_version', createdAt, { keepTokenVersion: tokenVersion });
    return { token, expiresAt };
  }

  // { session } — сессия действительна; null — нет или закрыта; GameUnavailable — CRM молчит дольше льготного окна.
  async function authenticate(token) {
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return null;
    const session = await store.findSession(hashToken(token));
    if (!session || session.revokedAt != null) return null;
    const time = now();
    if (time >= session.expiresAt || time - session.lastSeenAt >= limits.idleMs) {
      await store.revokeSession(session.id, 'expired', time);
      return null;
    }
    if (time - session.checkedAt < limits.checkIntervalMs) {
      if (time - session.lastSeenAt >= limits.seenWriteMs) await store.markSeen(session.id, time);
      return { session };
    }

    const result = await checkStatus(session.childId);
    if (result.ok) {
      const status = result.data ?? {};
      if (!status.exists || !status.canLogin) {
        await store.revokeChildSessions(session.childId, 'access_closed', time);
        return null;
      }
      if (status.tokenVersion !== session.tokenVersion) {
        await store.revokeChildSessions(session.childId, 'token_version', time, { keepTokenVersion: status.tokenVersion });
        return null;
      }
      await store.markChecked(session.id, time);
      return { session };
    }
    if (!result.unavailable) logger.error(`Проверка статуса в CRM отклонена: ${result.status} ${result.code ?? ''}`.trim());
    // Льготное окно — только от последней успешной проверки; активность и сроки не продлеваются.
    if (time - session.checkedAt <= limits.graceMs) return { session, grace: true };
    throw new GameUnavailable('CRM недоступна');
  }

  async function revoke(token, reason = 'logout') {
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return;
    const session = await store.findSession(hashToken(token));
    if (session && session.revokedAt == null) await store.revokeSession(session.id, reason, now());
  }

  return { create, authenticate, revoke, cookieMaxAgeMs: (expiresAt) => Math.max(0, expiresAt - now()) };
}
