import test from 'node:test';
import assert from 'node:assert/strict';
import { financeFixture } from './helpers/finance-sql-fixture.mjs';
import { createMysqlCatalog } from '../backend/src/catalog.mjs';

test('string zero history flag accepts the known individual tariff: quote, creation and historical snapshots', async (t) => {
  const f = financeFixture(t, { price: '825.00', packageCount: 8, mode: 'attendance_share' });
  f.db.exec(`UPDATE child_enrollments SET individual_price='825.00' WHERE id=7;
    INSERT INTO price_versions VALUES(4,'enrollment',7,NULL,NULL,NULL,'825.00','2026-09-01',NULL);
    INSERT INTO study_groups VALUES(10,'standard',4);
    INSERT INTO group_memberships VALUES(2,7,10,'2026-11-01',NULL);
    INSERT INTO price_versions VALUES(5,'group',NULL,10,NULL,NULL,'1100.00','2026-01-01',NULL);`);
  for (const paidOn of ['2026-09-15','2026-10-19']) {
    assert.deepEqual(await f.payments.quote(7, paidOn), { currentPrice: '825.00', subscriptionAmount: '6600.00' });
    const payment = await f.pay('6600', { paidOn });
    assert.equal(payment.priceSnapshot, '825.00'); assert.equal(payment.lessonsCredit, '8.00000000'); assert.equal(payment.groupId, '9');
    assert.equal(f.rows('payments').at(-1).calculation_mode_snapshot, 'attendance_share');
    assert.equal(f.rows('balance_lots').at(-1).unit_price, '825.00');
  }
  assert.equal(f.balance(), 16);
  f.visits(1, { price: '825.00' });
  const visits = f.rows('attendances'); const charges = f.rows('balance_entries').filter((e) => e.entry_type === 'attendance');
  f.db.exec(`UPDATE price_versions SET valid_to='2026-10-20 12:00:00' WHERE id IN (3,4);
    UPDATE child_enrollments SET individual_price='1100.00' WHERE id=7;
    INSERT INTO price_versions VALUES(6,'group',NULL,9,NULL,NULL,'1100.00','2026-10-20 12:00:00',NULL),
      (7,'enrollment',7,NULL,NULL,NULL,'1100.00','2026-10-20 12:00:00',NULL);`);
  assert.equal((await f.payments.quote(7, '2026-10-19')).currentPrice, '825.00');
  assert.equal((await f.payments.quote(7, '2026-10-21')).currentPrice, '1100.00');
  const old = await f.pay('6600', { paidOn: '2026-10-19' }); const updated = await f.pay('6600', { paidOn: '2026-10-21' });
  assert.equal(old.lessonsCredit, '8.00000000'); assert.equal(updated.lessonsCredit, '6.00000000');
  assert.equal((await f.payments.get('1')).priceSnapshot, '825.00');
  assert.deepEqual(f.rows('attendances'), visits);
  assert.deepEqual(f.rows('balance_entries').filter((e) => e.entry_type === 'attendance'), charges);
});

test('individual > group > direction precedence and removing individual price keeps historical snapshots', async (t) => {
  const f = financeFixture(t);
  f.db.exec(`UPDATE child_enrollments SET individual_price='900.00' WHERE id=7;
    INSERT INTO price_versions VALUES(4,'enrollment',7,NULL,NULL,NULL,'900.00','2026-10-01','2026-10-10 12:00:00'),
    (5,'enrollment',7,NULL,NULL,NULL,'950.00','2026-10-10 12:00:00','2026-10-17 12:00:00');`);
  const first = await f.pay('4500', { paidOn: '2026-10-09' });
  assert.equal(first.priceSnapshot, '900.00'); assert.equal(first.lessonsCredit, '5.00000000');
  const second = await f.pay('4750', { paidOn: '2026-10-16' }); assert.equal(second.priceSnapshot, '950.00');
  f.db.exec('UPDATE child_enrollments SET individual_price=NULL WHERE id=7');
  const group = await f.pay('4500', { paidOn: '2026-10-18' }); assert.equal(group.priceSnapshot, '1125.00');
  const noGroup = await f.pay('4100', { paidOn: '2026-08-20' }); assert.equal(noGroup.groupId, null); assert.equal(noGroup.priceSnapshot, '1025.00');
  await f.payments.update(first.id, { amount: '3600' });
  assert.equal((await f.payments.get(first.id)).priceSnapshot, '900.00');
});

test('group boundaries do not substitute today’s membership for a historical payment', async (t) => {
  const f = financeFixture(t);
  f.db.exec(`UPDATE group_memberships SET ended_on='2026-10-10' WHERE id=1;
    INSERT INTO study_groups VALUES(10,'standard',4);
    INSERT INTO group_memberships VALUES(2,7,10,'2026-10-11',NULL);
    INSERT INTO price_versions VALUES(4,'group',NULL,10,NULL,NULL,'1500.00','2026-01-01',NULL);`);
  assert.equal((await f.pay('4500', { paidOn: '2026-10-10' })).lessonsCredit, '4.00000000');
  assert.equal((await f.pay('4500', { paidOn: '2026-10-11' })).lessonsCredit, '3.00000000');
  assert.equal((await f.payments.quote(7, '2026-10-10')).currentPrice, '1125.00');
  await assert.rejects(f.payments.quote(7, '2026-02-31'), { code: 'VALIDATION_ERROR' });
});

test('missing recorded tariff refuses payment before any financial mutation', async (t) => {
  const f = financeFixture(t); f.db.exec('DELETE FROM price_versions');
  await assert.rejects(f.pay('6600'), { code: 'PRICE_NOT_CONFIGURED' });
  assert.equal(f.balance(), 0); assert.deepEqual(f.rows('payments'), []); assert.deepEqual(f.rows('balance_lots'), []);
});

test('unversioned legacy individual price cannot silently replace an unknown past tariff', async (t) => {
  const f = financeFixture(t); f.db.exec("UPDATE child_enrollments SET individual_price='825.00' WHERE id=7");
  await assert.rejects(f.payments.quote(7, '2026-09-15'), { code: 'PRICE_HISTORY_UNAVAILABLE' });
  await assert.rejects(f.pay('6600', { paidOn: '2026-09-15' }), { code: 'PRICE_HISTORY_UNAVAILABLE' });
  assert.equal(f.balance(), 0); assert.deepEqual(f.rows('payments'), []);
});

test('payment created without group keeps price and method when group is assigned later', async (t) => {
  const f = financeFixture(t); f.db.exec('DELETE FROM group_memberships');
  const payment = await f.pay('4100', { method: 'cash' });
  assert.equal(payment.groupId, null); assert.equal(payment.priceSnapshot, '1025.00');
  f.db.exec("INSERT INTO group_memberships VALUES(1,7,9,'2026-10-17',NULL)");
  await f.payments.update(payment.id, { amount: '5125' });
  const saved = await f.payments.get(payment.id);
  assert.equal(saved.priceSnapshot, '1025.00'); assert.equal(saved.method, 'cash'); assert.equal(saved.groupId, null);
  assert.equal(f.balance(), 5);
});

test('current child tariff uses the effective membership rather than a future planned group', async (t) => {
  const f = financeFixture(t);
  f.db.exec(`ALTER TABLE child_enrollments ADD COLUMN status TEXT DEFAULT 'active';
    ALTER TABLE child_enrollments ADD COLUMN started_on TEXT DEFAULT '2026-01-01';
    ALTER TABLE child_enrollments ADD COLUMN ended_on TEXT;
    ALTER TABLE study_groups ADD COLUMN name TEXT;
    ALTER TABLE study_groups ADD COLUMN weekday INTEGER;
    ALTER TABLE study_groups ADD COLUMN start_time TEXT;
    ALTER TABLE study_groups ADD COLUMN site_id INTEGER;
    CREATE TABLE projects(id INTEGER,name TEXT); INSERT INTO projects VALUES(2,'Проект');
    CREATE TABLE sites(id INTEGER,name TEXT);
    CREATE TABLE teacher_projects(teacher_id INTEGER,project_id INTEGER,active INTEGER);
    CREATE TABLE teacher_project_directions(teacher_id INTEGER,project_id INTEGER,direction_id INTEGER);
    INSERT INTO study_groups(id,calculation_mode,package_lesson_count) VALUES(10,'standard',4);
    INSERT INTO group_memberships VALUES(2,7,10,'2099-01-01',NULL);
    INSERT INTO price_versions VALUES(4,'group',NULL,10,NULL,NULL,'1100.00','2026-01-01',NULL);`);
  const catalog = createMysqlCatalog({ async query(sql, p) {
    if (sql.startsWith('SELECT c.id, c.full_name')) return [[{ id: 8, full_name: 'Ребёнок' }]];
    return f.query(sql, p);
  } });
  const [child] = await catalog.list('children');
  assert.equal(child.enrollments[0].currentPrice, '1125.00');
  assert.equal(child.enrollments[0].effectiveGroupId, '9');
  assert.equal(child.enrollments[0].groupId, '10', 'planned membership display is retained');
});
