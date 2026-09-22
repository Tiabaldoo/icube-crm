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

test('database and serialized lesson wall time use the Sakhalin business offset', async () => {
  const [db, lessons] = await Promise.all([
    readFile(new URL('../backend/src/db.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../backend/src/lessons.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(db, /timezone: '\+11:00'/); assert.match(db, /SET time_zone = '\+11:00'/); assert.match(db, /dateStrings: true/);
  assert.match(lessons, /BUSINESS_UTC_OFFSET/);
});
