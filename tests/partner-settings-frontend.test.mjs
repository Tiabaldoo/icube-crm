import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('общая кнопка сохраняет партнёрские параметры через существующий settings flow', async () => {
  const source = await readFile(new URL('../src/frontend/direction-price-settings.mjs', import.meta.url), 'utf8');
  assert.match(source, /api\.list\('partner-agreement-versions'\)/);
  assert.match(source, /api\.create\('partner-agreement-versions'/);
  assert.match(source, /projectCode: 'zebra'/);
  assert.match(source, /settings-partner-tax/);
  assert.match(source, /settings-partner-icube/);
  assert.match(source, /settings-partner-share/);
  assert.match(source, /taxPercent: normalizePercent\(currentPartnerAgreement\?\.taxPercent\)/);
  assert.match(source, /icubePercent: normalizePercent\(currentPartnerAgreement\?\.icubePercent\)/);
  assert.match(source, /partnerPercent: normalizePercent\(currentPartnerAgreement\?\.partnerPercent\)/);
  assert.match(source, /dirty = Object\.keys\(baseline\)\.some/);
  assert.match(source, /input\.addEventListener\('input', recalculateDirty\)/);
  assert.equal((source.match(/button\.textContent = 'Сохранить настройки'/g) ?? []).length, 1);
  assert.doesNotMatch(source, /Сохранить партнёрские настройки/);
});

test('страница заменяет верхнюю техническую подпись и удаляет production-подпись', async () => {
  const source = await readFile(new URL('../src/frontend/direction-price-settings.mjs', import.meta.url), 'utf8');
  assert.match(source, /Основные параметры работы CRM: цены, зарплаты и условия партнёрских проектов\./);
  assert.match(source, /pageDescription\.textContent = SETTINGS_DESCRIPTION/);
  assert.match(source, /productionNotice\?\.remove\(\)/);
});
