import assert from 'node:assert/strict';
import { ensureProfile } from '../server/profiles.mjs';
import { silentLogger } from './helpers.mjs';

// Один контракт для хранилища в памяти и для MySQL: тесты прогоняют обе реализации.
// prefix делает id детей уникальными для запуска, чтобы интеграционный прогон не трогал чужие строки.
export function storeContract(test, makeStore, { prefix = 0 } = {}) {
  const child = (n) => String(prefix + n);
  const start = Date.UTC(2026, 10, 3, 1, 0, 0);

  test('профиль: создаётся один раз, ник уникален без учёта регистра и «ё/е»', async () => {
    const store = await makeStore();
    assert.equal(await store.insertProfile({ childId: child(1), nickname: `ЁжТест${prefix}`, firstAccessOn: '2026-11-02' }), 'created');
    assert.equal(await store.insertProfile({ childId: child(1), nickname: `Другой${prefix}`, firstAccessOn: '2026-11-02' }), 'child_exists');
    assert.equal(await store.insertProfile({ childId: child(2), nickname: `ежтест${prefix}`, firstAccessOn: '2026-11-02' }), 'nickname_taken');
    assert.deepEqual(await store.getProfile(child(1)), { childId: child(1), nickname: `ЁжТест${prefix}`, firstAccessOn: '2026-11-02' });
    assert.equal(await store.getProfile(child(2)), null);
  });

  test('ensureProfile: занятый ник пробуется заново, дата первого доступа не сдвигается', async () => {
    const store = await makeStore();
    await store.insertProfile({ childId: child(10), nickname: `Занят${prefix}`, firstAccessOn: '2026-11-01' });
    const names = [`Занят${prefix}`, `Свободен${prefix}`];
    const profile = await ensureProfile(store, { childId: child(11), firstAccessOn: '2026-11-02' }, { makeNickname: () => names.shift(), logger: silentLogger() });
    assert.equal(profile.nickname, `Свободен${prefix}`);
    const logger = silentLogger();
    const again = await ensureProfile(store, { childId: child(11), firstAccessOn: '2026-12-01' }, { makeNickname: () => 'никогда', logger });
    assert.equal(again.firstAccessOn, '2026-11-02');
    assert.match(logger.lines.join('\n'), /другую дату/);
  });

  test('ensureProfile: два одновременных первых входа дают один профиль', async () => {
    const store = await makeStore();
    let n = 0;
    const make = () => `Гонка${prefix}x${n++}`;
    const [a, b] = await Promise.all([
      ensureProfile(store, { childId: child(20), firstAccessOn: '2026-11-02' }, { makeNickname: make }),
      ensureProfile(store, { childId: child(20), firstAccessOn: '2026-11-02' }, { makeNickname: make }),
    ]);
    assert.equal(a.nickname, b.nickname);
  });

  test('сессии: поиск по хэшу, отметки, отзыв одной и всех, кроме новой версии', async () => {
    const store = await makeStore();
    await store.insertProfile({ childId: child(30), nickname: `Сессия${prefix}`, firstAccessOn: '2026-11-02' });
    const hash = (n) => `${String(prefix).padStart(20, '0')}${String(n).padStart(44, '0')}`;
    const expiresAt = start + 1000 * 60 * 60;
    const first = await store.createSession({ tokenHash: hash(1), childId: child(30), tokenVersion: 1, now: start, expiresAt });
    await store.createSession({ tokenHash: hash(2), childId: child(30), tokenVersion: 1, now: start, expiresAt });
    await store.createSession({ tokenHash: hash(3), childId: child(30), tokenVersion: 2, now: start, expiresAt });
    const found = await store.findSession(hash(1));
    assert.deepEqual({ ...found, id: undefined }, { id: undefined, tokenHash: hash(1), childId: child(30), tokenVersion: 1, createdAt: start, expiresAt,
      lastSeenAt: start, checkedAt: start, revokedAt: null, revokeReason: null });
    await store.markSeen(first, start + 5);
    assert.equal((await store.findSession(hash(1))).lastSeenAt, start + 5);
    await store.markChecked(first, start + 9);
    assert.deepEqual([(await store.findSession(hash(1))).checkedAt, (await store.findSession(hash(1))).lastSeenAt], [start + 9, start + 9]);
    assert.equal(await store.revokeChildSessions(child(30), 'token_version', start + 10, { keepTokenVersion: 2 }), 2);
    assert.equal((await store.findSession(hash(1))).revokeReason, 'token_version');
    assert.equal((await store.findSession(hash(3))).revokedAt, null);
    await store.revokeSession((await store.findSession(hash(3))).id, 'logout', start + 11);
    assert.equal((await store.findSession(hash(3))).revokeReason, 'logout');
    // Закрытую сессию отметки не воскрешают.
    await store.markChecked(first, start + 20);
    assert.equal((await store.findSession(hash(1))).checkedAt, start + 9);
    assert.equal(await store.findSession(hash(9)), null);
  });

  test('сессия без профиля не создаётся', async () => {
    const store = await makeStore();
    await assert.rejects(store.createSession({ tokenHash: 'f'.repeat(64), childId: child(99), tokenVersion: 1, now: start, expiresAt: start + 1 }));
  });
}
