import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [uiSource, apiSource, lessonSource] = await Promise.all([
  readFile(new URL('../src/frontend/crm-ui.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../backend/src/lessons.mjs', import.meta.url), 'utf8'),
]);

test('поиск добавляемого ребёнка привязан к roster занятия, а не к текущей группе', () => {
  const start = uiSource.indexOf('window.showExtraResults=function(q)');
  const end = uiSource.indexOf('// Make the new-child action visible', start);
  const block = uiSource.slice(start, end);
  assert.match(block, /lessonChildIds=new Set/);
  assert.match(block, /groupChildIdsV146/);
  assert.match(block, /Object\.keys\(lesson\.attendance\|\|\{\}\)/);
  assert.match(block, /lesson\.extras/);
  assert.doesNotMatch(block, /inMainGroup/);
  assert.doesNotMatch(block, /groupChildren\(group\.id\).*some/);
});

test('поиск ребёнка требует enrollment того же projectId и direction', () => {
  const start = uiSource.indexOf('window.showExtraResults=function(q)');
  const end = uiSource.indexOf('// Make the new-child action visible', start);
  const block = uiSource.slice(start, end);
  assert.match(block, /String\(enrollment\.projectId\)===String\(lessonProjectId\)/);
  assert.match(block, /enrollment\.direction===group\.direction/);
});

test('сервер выбирает enrollment по projectId + direction и completed extra использует debit + salary', () => {
  const enrollmentStart = lessonSource.indexOf('async function enrollmentForAttendance');
  const enrollmentEnd = lessonSource.indexOf('async function activeAttendanceDebit', enrollmentStart);
  const enrollmentBlock = lessonSource.slice(enrollmentStart, enrollmentEnd);
  assert.match(enrollmentBlock, /e\.direction_id=:directionId/);
  assert.match(enrollmentBlock, /e\.project_id=:projectId/);
  assert.match(enrollmentBlock, /directionId: lesson\.direction_id_snapshot/);
  assert.match(enrollmentBlock, /projectId: lesson\.project_id_snapshot/);

  const addStart = lessonSource.indexOf('async function addExtra');
  const addEnd = lessonSource.indexOf('async function removeExtra', addStart);
  const addBlock = lessonSource.slice(addStart, addEnd);
  assert.match(addBlock, /\['in_progress', 'completed'\]/);
  assert.match(addBlock, /lesson\.status === 'completed' && !trial/);
  assert.match(addBlock, /await debitAttendance/);
  assert.match(addBlock, /await recalculateSalary/);
  assert.match(addBlock, /attendance_type,present,is_trial/);
});

test('teacher не может менять состав completed lesson, а director temporary teacher-view получает UI-доступ', () => {
  const addStart = lessonSource.indexOf('async function addExtra');
  const removeStart = lessonSource.indexOf('async function removeExtra', addStart);
  const removeEnd = lessonSource.indexOf('async function quickChild', removeStart);
  assert.match(lessonSource.slice(addStart, removeStart), /lesson\.status === 'completed'[\s\S]*?hasRole\(context, 'teacher'\)[\s\S]*?403/);
  assert.match(lessonSource.slice(removeStart, removeEnd), /lesson\.status === 'completed'[\s\S]*?hasRole\(context, 'teacher'\)[\s\S]*?403/);
  assert.match(apiSource, /window\.icubeTemporaryTeacherParentRole = temporaryTeacherParentRole/);
  assert.match(uiSource, /window\.icubeTemporaryTeacherParentRole\(\)==='director'/);
  assert.match(uiSource, /l\.done&&!completedRosterEditable/);
  assert.match(uiSource, /l\.done && !completedRosterEditable/);
  assert.doesNotMatch(uiSource, /Точечная правка: исторический состав занятия/);
});

test('подпись из другой группы использует enrollment проекта и направления занятия', () => {
  assert.match(uiSource, /String\(enrollment\.projectId\)===String\(lessonProjectId\)/);
  assert.match(uiSource, /enrollment\.direction===group\?\.direction/);
  assert.match(uiSource, /Number\(lessonEnrollment\.groupId\)===Number\(l\.groupId\)/);
  assert.match(uiSource, /sameGroup \? '' : '<div class="muted mini lesson-student-subtitle">из другой группы<\/div>'/);
});

test('календарь разрешает lesson по scheduled occurrence identity, а не только groupId', () => {
  const start = apiSource.indexOf('function serverLessonForOccurrence');
  const end = apiSource.indexOf('async function startLessonApi', start);
  const block = apiSource.slice(start, end);
  assert.match(block, /mapped\.occurrenceKey === key/);
  assert.doesNotMatch(block, /loaded\.find\(\(item\) => String\(item\.groupId\)/);
  assert.match(block, /api\.list\('lessons'/);
  assert.match(block, /api\.create\('lessons', \{ groupId, scheduledDate: date \}\)/);
  assert.match(block, /created\.occurrenceKey !== key/);
  assert.match(block, /cacheCalendarLesson/);
});

test('ошибка открытия календаря не проглатывается молча', () => {
  const start = apiSource.indexOf('async function openCalendarEvent');
  const end = apiSource.indexOf('async function startLessonApi', start);
  const block = apiSource.slice(start, end);
  assert.match(block, /throw new Error\('Не удалось открыть занятие/);
  assert.match(block, /catch \(error\) \{ fail\(error\); \}/);
});


test('calendar открывает lesson до необязательной загрузки фото и не отправляет её ошибку в fail', () => {
  const start = apiSource.indexOf('async function openCalendarEvent');
  const end = apiSource.indexOf('async function startLessonApi', start);
  const block = apiSource.slice(start, end);
  const selectedPos = block.indexOf('legacy.state.selectedLesson = lesson.id');
  const firstRenderPos = block.indexOf('legacy.render();', selectedPos);
  const photoPos = block.indexOf('loadLessonPhotos', firstRenderPos);
  assert.ok(selectedPos >= 0 && firstRenderPos > selectedPos && photoPos > firstRenderPos);
  assert.match(block, /console\.error\('Не удалось загрузить фотографии занятия'/);
  assert.match(block, /catch \(error\) \{ fail\(error\); \}/);
});
