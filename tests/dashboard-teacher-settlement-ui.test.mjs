import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('dashboard attention remains a compact vertical list and upcoming lessons are capped at three', async () => {
  const [source, css] = await Promise.all([read('../src/frontend/dashboard-ui.mjs'), read('../src/ui/dashboard.css')]);
  assert.match(source, /lessonRows\(now\)\.slice\(0, 3\)/);
  assert.match(source, /dashboard-attention-row/);
  assert.match(css, /\.dashboard-attention\{display:grid;grid-template-columns:1fr;gap:0/);
  assert.match(css, /\.dashboard-attention-row\+\.dashboard-attention-row\{border-top:/);
  assert.match(css, /\.dashboard-attention-row b\{display:block;margin:0 0 0 auto/);
});

test('dashboard lesson cards use effective site once and reuse group direction classes', async () => {
  const [source, uiSource, css] = await Promise.all([
    read('../src/frontend/dashboard-ui.mjs'),
    read('../src/frontend/crm-ui.js'),
    read('../src/ui/dashboard.css'),
  ]);
  assert.match(source, /dashboard-upcoming-title">\$\{safe\(siteFor\(lesson, group\)\)\}/);
  assert.match(source, /dashboard-lesson-site">\$\{safe\(siteFor\(lesson, group\)\)\}/);
  assert.doesNotMatch(source, /dashboard-lesson-time/);
  assert.match(source, /windowObject\.crmDirectionClassV134\(group\?\.direction\)/);
  assert.match(uiSource, /window\.crmDirectionClassV134=directionClass/);
  assert.match(uiSource, /\.dashboard-direction-card\.crm-direction-robot/);
  assert.match(uiSource, /\.dashboard-direction-card\.crm-direction-program/);
  assert.match(css, /\.dashboard-upcoming-row\{[\s\S]*border:1px solid var\(--line\)/);
});

test('temporary teacher view returns director or partner home without replacing logout', async () => {
  const source = await read('../src/frontend/api-sync.mjs');
  assert.match(source, /function temporaryTeacherParentRole\(\)[\s\S]*roles\?\.includes\('director'\)[\s\S]*roles\?\.includes\('partner'\)/);
  assert.match(source, /function returnFromTemporaryTeacherView\(\)[\s\S]*legacy\.state\.role = parentRole;[\s\S]*legacy\.state\.page = 'dashboard'/);
  assert.match(source, /Вернуться на главную/);
  assert.match(source, /window\.icubeReturnToHome = returnFromTemporaryTeacherView/);
  assert.match(source, /window\.icubeAuthLogout = logout/);
  assert.doesNotMatch(source, /Вернуться в режим директора|Вернуться в режим партнёра/);
  assert.match(source, /const right = parentRole[\s\S]*icubeReturnToHome\(\)[\s\S]*icubeAuthLogout\(\)[\s\S]*: '<button class="btn" onclick="icubeAuthLogout\(\)">Выйти<\/button>'/);
});

test('partner has a dedicated read-only settlements page without project selector', async () => {
  const [apiSource, uiSource, css] = await Promise.all([
    read('../src/frontend/api-sync.mjs'),
    read('../src/frontend/crm-ui.js'),
    read('../src/ui/styles.css'),
  ]);
  const pageStart = apiSource.indexOf('function partnerSettlementPage()');
  const pageEnd = apiSource.indexOf('async function calculatePartnerSettlement()', pageStart);
  const page = apiSource.slice(pageStart, pageEnd);
  assert.ok(pageStart >= 0 && pageEnd > pageStart);
  assert.match(page, /pageHead\('Расчёты'/);
  assert.doesNotMatch(page, /partner-project/);
  assert.match(apiSource, /const query = partnerView[\s\S]*\? `\?from=[\s\S]*: `\?projectId=/);
  assert.match(apiSource, /К получению/);
  assert.match(apiSource, /К переводу/);
  assert.match(apiSource, /Взаиморасчёт закрыт/);
  assert.match(uiSource, /\['settlements','Расчёты'\]/);
  assert.match(uiSource, /state\.role==='partner'\?\!\['partner','stats','settings'\]\.includes\(p\):p!=='settlements'/);
  assert.match(css, /\.page-partner \.toolbar,\.page-settlements \.toolbar/);
});
