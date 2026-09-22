import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const uiUrl = new URL('../src/frontend/crm-ui.js', import.meta.url);
const apiUrl = new URL('../src/frontend/api-sync.mjs', import.meta.url);
const cssUrl = new URL('../src/ui/styles.css', import.meta.url);

test('group display title uses site name, short weekday and start time only', async () => {
  const ui = await readFile(uiUrl, 'utf8');
  const start = ui.indexOf('window.groupTitle = function (g)');
  const end = ui.indexOf('\n  };', start) + 5;
  const helper = ui.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(helper, /site\?\.name \|\| 'Без площадки'/);
  assert.match(helper, /DAY_SHORT\[g\.day\]/);
  assert.match(helper, /g\.startTime/);
  assert.doesNotMatch(helper, /DIR_SHORT|shortName|g\.direction/);
});

test('both child group selectors and group cards use the shared display title', async () => {
  const ui = await readFile(uiUrl, 'utf8');

  const childStart = ui.indexOf('window.refreshChildGroupOptions = function');
  const childEnd = ui.indexOf('window.saveChildV111', childStart);
  const childOptions = ui.slice(childStart, childEnd);
  assert.match(childOptions, /<option value=/);
  assert.match(childOptions, /groupTitle\(g\)/);
  assert.match(childOptions, /Без группы/);
  assert.match(childOptions, /String\(g\.projectId\)===projectId/);

  const manageStart = ui.indexOf('function directionGroupsHtml');
  const manageEnd = ui.indexOf('function proposedPrice', manageStart);
  const manageOptions = ui.slice(manageStart, manageEnd);
  assert.match(manageOptions, /groupTitle\(g\)/);
  assert.match(manageOptions, /Без группы/);
  assert.match(manageOptions, /!projectId\|\|g\.projectId===projectId/);
  assert.match(manageOptions, /selected/);

  const groupsStart = ui.lastIndexOf('window.groups=function()');
  const groupsEnd = ui.indexOf('\n\n  render();', groupsStart);
  const groupsPage = ui.slice(groupsStart, groupsEnd);
  assert.ok(groupsStart >= 0 && groupsEnd > groupsStart);
  assert.match(groupsPage, /<h3[^>]*>'\+escapeHtml\(groupTitle\(g\)\)/);
  assert.doesNotMatch(groupsPage, /<h3[^>]*>'\+g\.name/);
  assert.match(groupsPage, /g\.direction/);
  assert.match(groupsPage, /g\.project/);
});

test('site form exposes one visible name and keeps rent/project behavior', async () => {
  const [ui, api] = await Promise.all([readFile(uiUrl, 'utf8'), readFile(apiUrl, 'utf8')]);
  const formStart = ui.indexOf('window.siteForm = function');
  const formEnd = ui.indexOf('window.saveSite = function', formStart);
  const form = ui.slice(formStart, formEnd);

  assert.match(form, /Название площадки/);
  assert.match(form, /placeholder="Название площадки"/);
  assert.doesNotMatch(form, /placeholder="ДК Океан"/);
  assert.match(form, /id="sf-name"/);
  assert.doesNotMatch(form, /Короткое название|id="sf-short"/);
  assert.match(form, /<label>Проект<\/label>/);
  assert.match(form, /<label>Тип<\/label>/);
  assert.match(form, /Аренда за проведённое занятие, ₽/);
  assert.match(form, /state\.role==='director'/);
  assert.match(form, /selectedProjectRow\?\.code==='icube-robots'/);

  const saveStart = api.indexOf('async function saveSite');
  const saveEnd = api.indexOf('async function saveTeacher', saveStart);
  const save = api.slice(saveStart, saveEnd);
  assert.match(save, /const name = value\('#sf-name'\)\.trim\(\)/);
  assert.match(save, /name, shortName: name/);
  assert.doesNotMatch(save, /sf-short/);
  assert.match(save, /Укажите название площадки/);
  assert.match(save, /body\.rentPerLesson = rent/);
});

test('desktop calendar keeps full site, weekday, time and short direction visible', async () => {
  const [css, ui] = await Promise.all([readFile(cssUrl, 'utf8'), readFile(uiUrl, 'utf8')]);
  const calendarCssStart = css.indexOf('/* Calendar redesign v1.1.18 */');
  const calendarCssEnd = css.indexOf('/* Mobile director UX v1.1.19 */', calendarCssStart);
  const calendarCss = css.slice(calendarCssStart, calendarCssEnd);
  const eventStart = ui.indexOf('function calendarWeekdayShort');
  const eventEnd = ui.indexOf('function eventListForDay', eventStart);
  const eventHelper = ui.slice(eventStart, eventEnd);

  assert.ok(calendarCssStart >= 0 && calendarCssEnd > calendarCssStart);
  assert.ok(eventStart >= 0 && eventEnd > eventStart);
  assert.match(eventHelper, /split\('\.'\)/);
  assert.match(eventHelper, /new Date\(parts\[2\],parts\[1\]-1,parts\[0\]\)/);
  assert.match(eventHelper, /direction==='Робототехника'\) return 'Р'/);
  assert.match(eventHelper, /direction==='Программирование'\) return 'П'/);
  assert.match(eventHelper, /calendarWeekdayShort\(e\.date,g\.day\)/);
  assert.match(eventHelper, /timeStart\(e\.time\|\|g\.time\|\|g\.startTime/);
  assert.match(eventHelper, /calendar-event-site/);
  assert.match(eventHelper, /calendar-event-meta/);
  assert.match(calendarCss, /\.calendar-event-site\{[^}]*white-space:normal;word-break:normal;overflow-wrap:normal/);
  assert.match(calendarCss, /\.calendar-event-meta\{[^}]*white-space:normal;word-break:normal;overflow-wrap:normal/);
  assert.doesNotMatch(calendarCss, /text-overflow:ellipsis/);
  assert.match(calendarCss, /@media\(min-width:761px\) and \(max-width:1300px\)/);
  assert.match(calendarCss, /@media\(min-width:761px\) and \(max-width:1100px\)/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.calendar-desktop\{display:none\}[\s\S]*?\.calendar-mobile\{display:block\}/);
  assert.doesNotMatch(ui, /\.teacher-content:has\(\.calendar\) \.event\{\s*overflow-wrap:anywhere/);
  assert.match(ui, /\.teacher-content:has\(\.calendar\) \.event\{\s*overflow-wrap:normal;\s*word-break:normal/);
});
