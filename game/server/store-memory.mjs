// Хранилище в памяти с тем же контрактом, что и MySQL (store-mysql.mjs).
// Для тестов: контрактные тесты прогоняют обе реализации.

import { StarProfileMissing } from './star-errors.mjs';

// Ник сравнивается как в MySQL с utf8mb4_0900_ai_ci: без регистра и без различия «ё/е».
export const nicknameKey = (nickname) => String(nickname).toLowerCase().replaceAll('ё', 'е');

export const byNumericId = (a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0);

export function createMemoryStore() {
  const profiles = new Map();
  const sessions = [];
  let nextSessionId = 1;
  const copy = (value) => (value ? { ...value } : null);
  // Звёзды: как в MySQL, транзакции одного ребёнка идут по очереди (блокировка строки кошелька),
  // а при ошибке всё, что транзакция записала, откатывается.
  let stars = { wallets: new Map(), entries: [], bonuses: [], revokes: new Map(), chestOpens: [], nextId: 1 };
  const turns = new Map();
  const duplicate = (key) => Object.assign(new Error(`Duplicate entry '${key}'`), { code: 'ER_DUP_ENTRY' });
  const bonusView = (bonus) => {
    if (!bonus) return null;
    const revoke = stars.revokes.get(bonus.id);
    return { ...bonus, revokedAt: revoke?.createdAt ?? null, revokedByUserId: revoke?.revokedByUserId ?? null, revokeReason: revoke?.reason ?? null };
  };

  function starTx(id) {
    return {
      async wallet() { return { ...stars.wallets.get(id) }; },
      async setWallet({ balance, chest }) {
        if (chest < 0) throw new Error('chk_game_star_wallets_chest');
        stars.wallets.set(id, { balance, chest });
      },
      async entries() { return stars.entries.filter((entry) => entry.childId === id).map((entry) => ({ ...entry })); },
      async findEntryByKey(key) { return copy(stars.entries.find((entry) => entry.idempotencyKey === key)); },
      async insertEntry({ kind, amount, attendanceId = null, bonusId = null, itemCode = null, idempotencyKey, now }) {
        if (!Number.isInteger(amount) || amount === 0) throw new Error('chk_game_star_entries_amount');
        if (stars.entries.some((entry) => entry.idempotencyKey === idempotencyKey)) throw duplicate(idempotencyKey);
        const entry = { id: String(stars.nextId++), childId: id, kind, amount, attendanceId: attendanceId == null ? null : String(attendanceId),
          bonusId: bonusId == null ? null : String(bonusId), itemCode, idempotencyKey, createdAt: now };
        stars.entries.push(entry);
        return entry.id;
      },
      async findBonusByKey(requestKey) { return bonusView(stars.bonuses.find((bonus) => bonus.requestKey === requestKey)); },
      async getBonus(bonusId) { return bonusView(stars.bonuses.find((bonus) => bonus.id === String(bonusId))); },
      async bonuses() { return stars.bonuses.filter((bonus) => bonus.childId === id).map(bonusView); },
      async insertBonus({ amount, reason, createdByUserId, requestKey, requestHash, now }) {
        if (stars.bonuses.some((bonus) => bonus.requestKey === requestKey)) throw duplicate(requestKey);
        const bonus = { id: String(stars.nextId++), childId: id, amount, reason, createdByUserId: String(createdByUserId), requestKey, requestHash, createdAt: now };
        stars.bonuses.push(bonus);
        return bonus.id;
      },
      async insertRevoke({ bonusId, revokedByUserId, reason, now }) {
        if (stars.revokes.has(String(bonusId))) throw duplicate(`revoke:${bonusId}`);
        stars.revokes.set(String(bonusId), { revokedByUserId: String(revokedByUserId), reason, createdAt: now });
      },
      async insertChestOpen({ amount, now }) { stars.chestOpens.push({ id: String(stars.nextId++), childId: id, amount, createdAt: now }); },
    };
  }

  return {
    async ping() {},

    async getProfile(childId) { return copy(profiles.get(String(childId))); },

    // 'created' | 'child_exists' | 'nickname_taken'
    async insertProfile({ childId, nickname, firstAccessOn }) {
      if (profiles.has(String(childId))) return 'child_exists';
      const key = nicknameKey(nickname);
      if ([...profiles.values()].some((profile) => nicknameKey(profile.nickname) === key)) return 'nickname_taken';
      profiles.set(String(childId), { childId: String(childId), nickname, firstAccessOn });
      return 'created';
    },

    async listProfileIds({ afterChildId = '0', limit = 100 } = {}) {
      return [...profiles.keys()].filter((id) => BigInt(id) > BigInt(afterChildId)).sort(byNumericId).slice(0, limit);
    },

    // Операция со звёздами одного ребёнка: целиком или никак. Без профиля — StarProfileMissing.
    async starTransaction(childId, operation) {
      const id = String(childId);
      // Одна очередь на всё хранилище: откат по снимку не должен задеть записи другого ребёнка.
      const previous = turns.get('all') ?? Promise.resolve();
      let finish;
      const current = new Promise((resolve) => { finish = resolve; });
      turns.set('all', current);
      await previous;
      const snapshot = structuredClone(stars);
      try {
        if (!profiles.has(id)) throw new StarProfileMissing();
        if (!stars.wallets.has(id)) stars.wallets.set(id, { balance: 0, chest: 0 });
        return await operation(starTx(id));
      } catch (error) {
        stars = snapshot;
        throw error;
      } finally {
        finish();
        if (turns.get('all') === current) turns.delete('all');
      }
    },

    // Для тестов: проверка, что итог кошелька совпадает с суммой журнала.
    starsSnapshot(childId) {
      const id = String(childId);
      return { wallet: { ...(stars.wallets.get(id) ?? { balance: 0, chest: 0 }) }, entries: stars.entries.filter((entry) => entry.childId === id).map((entry) => ({ ...entry })),
        chestOpens: stars.chestOpens.filter((item) => item.childId === id).map((item) => ({ ...item })) };
    },

    async createSession({ tokenHash, childId, tokenVersion, now, expiresAt }) {
      if (!profiles.has(String(childId))) throw new Error('Нет игрового профиля');
      if (sessions.some((session) => session.tokenHash === tokenHash)) throw new Error('Токен сессии повторился');
      const session = { id: String(nextSessionId++), tokenHash, childId: String(childId), tokenVersion, createdAt: now,
        expiresAt, lastSeenAt: now, checkedAt: now, revokedAt: null, revokeReason: null };
      sessions.push(session);
      return session.id;
    },

    async findSession(tokenHash) { return copy(sessions.find((session) => session.tokenHash === tokenHash)); },

    async markChecked(id, now) {
      const session = sessions.find((item) => item.id === id && item.revokedAt == null);
      if (session) Object.assign(session, { checkedAt: now, lastSeenAt: now });
    },

    async markSeen(id, now) {
      const session = sessions.find((item) => item.id === id && item.revokedAt == null);
      if (session) session.lastSeenAt = now;
    },

    async revokeSession(id, reason, now) {
      const session = sessions.find((item) => item.id === id && item.revokedAt == null);
      if (session) Object.assign(session, { revokedAt: now, revokeReason: reason });
    },

    // keepTokenVersion — сессии с этой версией не трогаем (ребёнок уже вошёл с новым паролем).
    async revokeChildSessions(childId, reason, now, { keepTokenVersion = null } = {}) {
      let count = 0;
      for (const session of sessions) {
        if (session.childId !== String(childId) || session.revokedAt != null) continue;
        if (keepTokenVersion != null && session.tokenVersion === keepTokenVersion) continue;
        Object.assign(session, { revokedAt: now, revokeReason: reason });
        count += 1;
      }
      return count;
    },
  };
}
