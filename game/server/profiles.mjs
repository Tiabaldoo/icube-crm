import { generateNickname } from './nicknames.mjs';

const MAX_NICKNAME_ATTEMPTS = 30;

// Профиль создаётся при первом входе. Ник уникален: занятый пробуем заново.
// Дата первого доступа записывается один раз и потом не сдвигается (решение Т3).
export async function ensureProfile(store, { childId, firstAccessOn }, { makeNickname = generateNickname, logger = console } = {}) {
  for (let attempt = 0; attempt < MAX_NICKNAME_ATTEMPTS; attempt += 1) {
    const existing = await store.getProfile(childId);
    if (existing) {
      if (firstAccessOn && existing.firstAccessOn !== firstAccessOn) {
        logger.warn(`CRM вернула другую дату первого доступа для ребёнка ${childId}: оставлена ${existing.firstAccessOn}`);
      }
      return existing;
    }
    const result = await store.insertProfile({ childId, nickname: makeNickname(attempt), firstAccessOn });
    if (result === 'created') return store.getProfile(childId);
    // child_exists — профиль создал параллельный вход: следующий проход его прочитает.
  }
  throw new Error('Не удалось подобрать свободный ник');
}
