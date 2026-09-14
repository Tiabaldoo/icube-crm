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
  assert.match(source, /taxPercent: normalizePercent\(currentPartnerValues\.taxPercent\)/);
  assert.match(source, /icubePercent: normalizePercent\(currentPartnerValues\.icubePercent\)/);
  assert.match(source, /partnerPercent: normalizePercent\(currentPartnerValues\.partnerPercent\)/);
  assert.match(source, /dirty = Object\.keys\(baseline\)\.some/);
  assert.match(source, /input\.addEventListener\('input', recalculateDirty\)/);
  assert.equal((source.match(/button\.textContent = 'Сохранить настройки'/g) ?? []).length, 1);
  assert.doesNotMatch(source, /Сохранить партнёрские настройки/);
});

test('zebra без partner_id не блокирует загрузку и сохранение цен/зарплаты', async () => {
  const source = await readFile(new URL('../src/frontend/direction-price-settings.mjs', import.meta.url), 'utf8');
  assert.match(source, /const \[prices, salaryRates\] = await Promise\.all\(\[\s*api\.list\('price-versions'\),\s*api\.list\('salary-rate-versions'\),\s*\]\);/);
  assert.match(source, /await loadPartnerAgreement\(\);/);
  assert.match(source, /\['PARTNER_NOT_CONFIGURED', 'PARTNER_AGREEMENT_NOT_CONFIGURED'\]\.includes\(error\.code\)/);
  assert.match(source, /applyPartnerAgreement\(null\);/);
  assert.match(source, /DEFAULT_PARTNER_VALUES[\s\S]*?taxPercent: '4\.000'[\s\S]*?icubePercent: '40\.000'[\s\S]*?partnerPercent: '60\.000'/);
  assert.match(source, /Сначала настройте партнёра проекта «Зебра»/);
  assert.match(source, /if \(partnerSettingsAvailable && currentPartnerAgreement\)/);
  assert.match(source, /api\.create\('price-versions'/);
  assert.match(source, /api\.create\('salary-rate-versions'/);
  assert.doesNotMatch(source, /if \(!currentPartnerAgreement\) return window\.alert/);
});

test('страница заменяет верхнюю техническую подпись и удаляет production-подпись', async () => {
  const source = await readFile(new URL('../src/frontend/direction-price-settings.mjs', import.meta.url), 'utf8');
  assert.match(source, /Основные параметры работы CRM: цены, зарплаты и условия партнёрских проектов\./);
  assert.match(source, /pageDescription\.textContent = SETTINGS_DESCRIPTION/);
  assert.match(source, /productionNotice\?\.remove\(\)/);
});
