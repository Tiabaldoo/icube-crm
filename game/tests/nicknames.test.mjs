import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateNickname, NICKNAME_NOUNS, NICKNAME_PREFIXES } from '../server/nicknames.mjs';
import { ensureProfile } from '../server/profiles.mjs';
import { createMemoryStore } from '../server/store-memory.mjs';

test('ник: слово, слово и число; первые попытки с двумя цифрами, потом с тремя', () => {
  for (let index = 0; index < 500; index += 1) {
    const short = generateNickname(0);
    assert.match(short, /^[А-ЯЁ][а-яё]+[А-ЯЁ][а-яё]+[1-9]\d$/u, short);
    assert.ok(short.length <= 32);
    assert.match(generateNickname(10), /[1-9]\d\d$/);
  }
  assert.equal(generateNickname(0, (min) => min), `${NICKNAME_PREFIXES[0]}${NICKNAME_NOUNS[0]}10`);
});

test('словари без повторов и без цифр', () => {
  for (const list of [NICKNAME_PREFIXES, NICKNAME_NOUNS]) {
    assert.equal(new Set(list).size, list.length);
    for (const word of list) assert.match(word, /^[А-ЯЁ][а-яё]+$/u, word);
  }
});

test('тысяча профилей получает тысячу разных ников', async () => {
  const store = createMemoryStore();
  const names = new Set();
  for (let childId = 1; childId <= 1000; childId += 1) names.add((await ensureProfile(store, { childId: String(childId), firstAccessOn: '2026-11-02' })).nickname.toLowerCase());
  assert.equal(names.size, 1000);
});

test('если свободного ника не нашлось, профиль не создаётся', async () => {
  const store = createMemoryStore();
  await store.insertProfile({ childId: '1', nickname: 'Один', firstAccessOn: '2026-11-02' });
  await assert.rejects(ensureProfile(store, { childId: '2', firstAccessOn: '2026-11-02' }, { makeNickname: () => 'Один' }), /свободный ник/);
  assert.equal(await store.getProfile('2'), null);
});
