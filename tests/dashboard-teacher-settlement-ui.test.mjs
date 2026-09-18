import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { dashboardLessonsForDate } from '../src/frontend/dashboard-ui.mjs';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('dashboard attention remains a compact vertical list and tomorrow lessons are capped at three', async () => {
  const [source, css] = await Promise.all([read('../src/frontend/dashboard-ui.mjs'), read('../src/ui/dashboard.css')]);
  assert.match(source, /tomorrowDate,[\s\S]*allowedProjectIds\(\),[\s\S]*\.filter\(\(lesson\) => lesson\.status !== 'Отменено'\)\.slice\(0, 3\)/);
  assert.match(source, /dashboard-attention-row/);
  assert.match(css, /\.dashboard-attention\{display:grid;grid-template-columns:1fr;grid-template-rows:repeat\(3,minmax\(0,1fr\)\);gap:10px/);
  assert.match(css, /\.dashboard-attention-row\{[^}]*border:1px solid var\(--line\);border-radius:10px/);
  assert.match(css, /@media \(min-width:981px\)\{[\s\S]*\.dashboard-main-grid\{align-items:stretch\}[\s\S]*\.dashboard-attention\{flex:1\}/);
  assert.match(css, /\.dashboard-attention-row b\{display:block;margin:0 0 0 auto/);
});

test('dashboard separates today and tomorrow and keeps partner project scope', async () => {
  const groups = [
    { id: 1, projectId: 1 },
    { id: 2, projectId: 2 },
  ];
  const lessons = [
    { id: 1, groupId: 1, date: '18.09.2026', time: '10:00–11:30' },
    { id: 2, groupId: 2, date: '18.09.2026', time: '12:00–13:30' },
    { id: 3, groupId: 1, date: '19.09.2026', time: '09:00–10:30' },
    { id: 4, groupId: 2, date: '19.09.2026', time: '11:00–12:30' },
    { id: 6, groupId: 1, date: '19.09.2026', time: '15:00–16:30' },
    { id: 5, groupId: 2, date: '20.09.2026', time: '08:00–09:30' },
  ];

  assert.deepEqual(
    dashboardLessonsForDate({ lessons, groups }, '18.09.2026').map((lesson) => lesson.id),
    [1, 2],
  );
  const tomorrow = dashboardLessonsForDate({ lessons, groups }, '19.09.2026');
  assert.deepEqual(tomorrow.map((lesson) => lesson.id), [3, 4, 6]);
  assert.ok(tomorrow.every((lesson) => lesson.date === '19.09.2026'));
  assert.ok(tomorrow.every((lesson) => ![1, 2].includes(lesson.id)));
  assert.deepEqual(
    dashboardLessonsForDate({ lessons, groups }, '19.09.2026', ['2']).map((lesson) => lesson.id),
    [4],
  );
  assert.deepEqual(
    dashboardLessonsForDate({ lessons, groups }, '19.09.2026', ['3']),
    [],
  );
  assert.deepEqual(
    dashboardLessonsForDate({ lessons, groups }, '21.09.2026'),
    [],
  );

  const source = await read('../src/frontend/dashboard-ui.mjs');
  assert.match(source, /<h2>Занятия завтра<\/h2>/);
  assert.match(source, /Завтра занятий нет/);
  assert.doesNotMatch(source, /Ближайшие занятия/);
  assert.ok(source.indexOf('html += todayBlock(now);') < source.indexOf('dashboard-main-grid'));
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
  assert.match(uiSource, /state\.role==='partner'\?\!\['partner','rent','stats','settings'\]\.includes\(p\):p!=='settlements'/);
  assert.match(css, /\.page-partner \.toolbar,\.page-settlements \.toolbar/);
});
