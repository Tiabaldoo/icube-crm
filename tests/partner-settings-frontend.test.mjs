import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourceUrl = new URL('../src/frontend/direction-price-settings.mjs', import.meta.url);

test('salary settings use server versions, separate save action and sequential POSTs', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.match(source, /api\.list\('salary-rate-versions'\)/);
  assert.match(source, /button\.textContent = label/);
  assert.match(source, /ensureAction\(salaryBlock, 'salary', 'Сохранить ставки', saveSalaryRates\)/);
  assert.match(source, /for \(const key of changedKeys\) \{\s*await api\.create\('salary-rate-versions'/);
  assert.doesNotMatch(source, /Promise\.all\([^)]*salary-rate-versions/s);
  assert.match(source, /const verified = await loadSalaryRates\(\)/);
  assert.match(source, /state\.serverSalaryRates/);
  assert.match(source, /input\.removeAttribute\('onchange'\)/);
  assert.match(source, /step: '0\.01'/);
});

test('partner settings are Zebra-only, validated and saved through one server version request', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.match(source, /api\.list\('partner-agreement-versions'\)/);
  assert.match(source, /ensureAction\(partnerBlock, 'partner', 'Сохранить условия', savePartnerAgreement\)/);
  assert.match(source, /title\.textContent = 'Партнёрство · Зебра'/);
  assert.match(source, /Доли iCube и партнёра в сумме должны составлять 100%\./);
  assert.match(source, /api\.create\('partner-agreement-versions', \{\s*projectId: currentPartnerAgreement\.projectId,/);
  assert.match(source, /const verified = await loadPartnerAgreement\(\)/);
  assert.match(source, /step: '0\.001'/);
  assert.doesNotMatch(source, /DEFAULT_PARTNER_VALUES/);
});

test('settings load errors are isolated and disable fake frontend saves', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.match(source, /Не удалось загрузить ставки зарплаты\. Обновите страницу или попробуйте ещё раз\./);
  assert.match(source, /Не удалось загрузить условия партнёрства\. Обновите страницу или попробуйте ещё раз\./);
  assert.match(source, /button\.disabled = !salaryLoaded \|\| savingSalary/);
  assert.match(source, /button\.disabled = !partnerLoaded \|\| !partnerSettingsAvailable \|\| savingPartner/);
  assert.match(source, /await Promise\.all\(\[loadPrices\(\), loadSalaryRates\(\), loadPartnerAgreement\(\)\]\)/);
  assert.match(source, /window\.icubeFinancialSettingsReady = initializeSettings\(\)/);
});

test('price version flow remains on existing price-versions API and reloads CRM state', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.match(source, /api\.list\('price-versions'\)/);
  assert.match(source, /api\.create\('price-versions'/);
  assert.match(source, /await window\.icubeApi\.reload\(\{ render: false \}\)/);
  assert.match(source, /Базовая цена абонемента за 4 занятия/);
});

test('settings module only starts privileged financial loads for directors', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.match(source, /if \(authenticatedUser\?\.roles\?\.includes\('director'\)\) \{/);
  assert.doesNotMatch(source, /localStorage/);
});
