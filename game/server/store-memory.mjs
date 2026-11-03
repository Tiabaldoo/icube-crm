// Хранилище в памяти с тем же контрактом, что и MySQL (store-mysql.mjs).
// Для тестов: контрактные тесты прогоняют обе реализации.

// Ник сравнивается как в MySQL с utf8mb4_0900_ai_ci: без регистра и без различия «ё/е».
export const nicknameKey = (nickname) => String(nickname).toLowerCase().replaceAll('ё', 'е');

export function createMemoryStore() {
  const profiles = new Map();
  const sessions = [];
  let nextSessionId = 1;
  const copy = (value) => (value ? { ...value } : null);

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
