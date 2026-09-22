import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { businessDate, calendarMonthPeriod } from '../src/shared/business-time.mjs';

const exec = promisify(execFile);

test('Sakhalin business day changes between 23:30 and 00:30 independent of UTC day', () => {
  assert.equal(businessDate(new Date('2026-09-14T12:30:00Z')), '2026-09-14');
  assert.equal(businessDate(new Date('2026-09-14T13:30:00Z')), '2026-09-15');
  assert.deepEqual(calendarMonthPeriod(new Date('2026-09-30T13:30:00Z')), { from: '2026-10-01', to: '2026-10-31' });
});

test('businessDate returns the same value under Sakhalin, Omsk, Moscow and UTC client timezones', async () => {
  const moduleUrl = new URL('../src/shared/business-time.mjs', import.meta.url).href;
  const script = `import {businessDate} from ${JSON.stringify(moduleUrl)}; process.stdout.write(businessDate(new Date('2026-09-14T13:30:00Z')));`;
  const results = await Promise.all(['Asia/Sakhalin', 'Asia/Omsk', 'Europe/Moscow', 'UTC'].map(async (TZ) =>
    (await exec(process.execPath, ['--input-type=module', '--eval', script], { env: { ...process.env, TZ } })).stdout));
  assert.deepEqual(results, ['2026-09-15', '2026-09-15', '2026-09-15', '2026-09-15']);
});

test('dashboard month follows Sakhalin at midnight boundary in every client timezone', async () => {
  const moduleUrl = new URL('../src/frontend/dashboard-ui.mjs', import.meta.url).href;
  const script = `import {monthlyPaymentAmount} from ${JSON.stringify(moduleUrl)};
    const payments=[{paidOn:'2026-09-30',amount:'10'},{paidOn:'2026-10-01',amount:'20'}];
    process.stdout.write(String(monthlyPaymentAmount(payments,new Date('2026-09-30T13:30:00Z'))));`;
  const results = await Promise.all(['Asia/Sakhalin', 'Asia/Omsk', 'Europe/Moscow', 'UTC'].map(async (TZ) =>
    (await exec(process.execPath, ['--input-type=module', '--eval', script], { env: { ...process.env, TZ } })).stdout));
  assert.deepEqual(results, ['20', '20', '20', '20']);
});

test('parent calendar and photo expiry date are identical in supported client timezones', async () => {
  const parentUrl = new URL('../src/frontend/parent-portal.mjs', import.meta.url).href;
  const photosUrl = new URL('../src/frontend/lesson-photos.mjs', import.meta.url).href;
  const script = `globalThis.window={icubeLegacy:{state:{lessons:[]}},addEventListener(){}};
    const {parentScheduleCalendar}=await import(${JSON.stringify(parentUrl)});
    const {photoExpiryDate}=await import(${JSON.stringify(photosUrl)});
    const calendar=parentScheduleCalendar([{id:'1',startsAt:'2026-09-01T10:00:00+11:00',endsAt:'2026-09-01T11:00:00+11:00',site:'A',group:'B',status:'scheduled'}],'2026-09-01');
    process.stdout.write(JSON.stringify({first:calendar.indexOf('01.09'),label:calendar.includes('1 сентября'),expiry:photoExpiryDate('2026-09-30T13:30:00Z')}));`;
  const results = await Promise.all(['Asia/Sakhalin', 'Asia/Omsk', 'Europe/Moscow', 'UTC'].map(async (TZ) =>
    (await exec(process.execPath, ['--input-type=module', '--eval', script], { env: { ...process.env, TZ } })).stdout));
  assert.equal(new Set(results).size, 1);
  assert.deepEqual(JSON.parse(results[0]), { first: JSON.parse(results[0]).first, label: true, expiry: '01.10.2026' });
});

test('database and serialized lesson wall time use the Sakhalin business offset', async () => {
  const [db, lessons] = await Promise.all([
    readFile(new URL('../backend/src/db.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../backend/src/lessons.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(db, /timezone: '\+11:00'/); assert.match(db, /SET time_zone = '\+11:00'/); assert.match(db, /dateStrings: true/);
  assert.match(lessons, /BUSINESS_UTC_OFFSET/);
});
