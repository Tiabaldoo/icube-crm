import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyToWallet, InvalidAttendanceList, parseQualifyingAttendance, planReconciliation, starTargets, STAR_RULES, visibleBalance } from '../server/star-rules.mjs';
import { visit } from './helpers.mjs';

const parse = (...visits) => parseQualifyingAttendance({ exists: true, attendances: visits }).attendances;
const targets = (earningSince, ...visits) => starTargets({ earningSince, attendances: parse(...visits) });

test('числа взяты из конфигурации игры: 3 звезды за занятие, ×2 — ещё 3, бонус до 10', () => {
  assert.deepEqual({ ...STAR_RULES }, { lessonStars: 3, trialFollowupStars: 3, bonusMaxStars: 10 });
});

test('обычное посещение — 3, пробное и занятие ознакомительной группы — 0', () => {
  const { base } = targets('2026-11-01', visit(1, '2026-11-03'), visit(2, '2026-11-04', { trial: true }), visit(3, '2026-11-05', { intro: true }));
  assert.deepEqual([...base], [['1', 3], ['2', 0], ['3', 0]]);
});

test('занятия до дня первого доступа не засчитываются, в сам день — засчитываются', () => {
  const { base } = targets('2026-11-03', visit(1, '2026-11-02', { hour: 23 }), visit(2, '2026-11-03', { hour: 0 }));
  assert.deepEqual([...base], [['1', 0], ['2', 3]]);
});

test('×2: первое обычное после ознакомительного, даже если ознакомительное было до доступа (Т2)', () => {
  assert.equal(targets('2026-11-01', visit(1, '2026-10-20', { trial: true }), visit(2, '2026-11-03')).followup, '2');
  assert.equal(targets('2026-11-01', visit(1, '2026-11-02', { trial: true }), visit(2, '2026-11-03'), visit(3, '2026-11-04')).followup, '2');
});

test('×2 нет: ходил на обычные до доступа (Т1), без ознакомительного, пробное после первого обычного', () => {
  assert.equal(targets('2026-11-01', visit(1, '2026-09-01', { trial: true }), visit(2, '2026-09-08'), visit(3, '2026-11-03')).followup, null);
  assert.equal(targets('2026-11-01', visit(1, '2026-11-03')).followup, null);
  // Ознакомительное в новом направлении после обычных занятий ×2 повторно не даёт.
  assert.equal(targets('2026-11-01', visit(1, '2026-11-02', { trial: true }), visit(2, '2026-11-03'), visit(3, '2026-11-10', { trial: true }), visit(4, '2026-11-11')).followup, '2');
});

test('порядок занятий одного дня — по времени, потом по номеру посещения', () => {
  assert.equal(targets('2026-11-01', visit(5, '2026-11-03', { hour: 12 }), visit(9, '2026-11-03', { trial: true, hour: 10 })).followup, '5');
  assert.equal(targets('2026-11-01', visit(9, '2026-11-03', { trial: true, hour: 10 }), visit(5, '2026-11-03', { hour: 10 })).followup, null);
});

test('план: начисление, повтор пуст, исправление — отзыв с новым ключом', () => {
  const attendances = parse(visit(1, '2026-11-03'));
  const first = planReconciliation({ childId: '8', earningSince: '2026-11-01', attendances, entries: [] });
  assert.deepEqual(first, [{ kind: 'attendance', amount: 3, attendanceId: '1', idempotencyKey: 'att:1:1' }]);
  const entries = first.map((op) => ({ ...op }));
  assert.deepEqual(planReconciliation({ childId: '8', earningSince: '2026-11-01', attendances, entries }), []);
  const removed = planReconciliation({ childId: '8', earningSince: '2026-11-01', attendances: [], entries });
  assert.deepEqual(removed, [{ kind: 'attendance_reversal', amount: -3, attendanceId: '1', idempotencyKey: 'att:1:2' }]);
  const back = planReconciliation({ childId: '8', earningSince: '2026-11-01', attendances, entries: [...entries, ...removed] });
  assert.deepEqual(back, [{ kind: 'attendance', amount: 3, attendanceId: '1', idempotencyKey: 'att:1:3' }]);
});

test('план: ×2 переходит на следующее посещение — сначала отзыв, потом начисление', () => {
  const before = parse(visit(1, '2026-11-02', { trial: true }), visit(2, '2026-11-03'), visit(3, '2026-11-10'));
  const entries = planReconciliation({ childId: '8', earningSince: '2026-11-01', attendances: before, entries: [] });
  assert.deepEqual(entries.map((op) => [op.kind, op.attendanceId, op.amount]), [['attendance', '2', 3], ['attendance', '3', 3], ['trial_followup_bonus', '2', 3]]);
  const after = parse(visit(1, '2026-11-02', { trial: true }), visit(3, '2026-11-10'));
  const plan = planReconciliation({ childId: '8', earningSince: '2026-11-01', attendances: after, entries });
  assert.deepEqual(plan.map((op) => [op.kind, op.attendanceId, op.amount, op.idempotencyKey]), [
    ['attendance_reversal', '2', -3, 'att:2:2'], ['trial_followup_reversal', '2', -3, 'trial_followup:8:2'], ['trial_followup_bonus', '3', 3, 'trial_followup:8:3'],
  ]);
});

test('ответ CRM проверяется целиком: неполный или с повтором не принимается', () => {
  for (const data of [null, {}, { exists: true }, { exists: true, attendances: [{ attendanceId: 'x' }] },
    { exists: true, attendances: [visit(1, '2026-11-03'), visit(1, '2026-11-03')] },
    { exists: true, attendances: [{ ...visit(1, '2026-11-03'), isTrial: 'false' }] },
    { exists: true, attendances: [{ ...visit(1, '2026-11-03'), lessonDate: '03.11.2026' }] }]) {
    assert.throws(() => parseQualifyingAttendance(data), InvalidAttendanceList, JSON.stringify(data));
  }
  assert.deepEqual(parseQualifyingAttendance({ exists: false }), { exists: false, attendances: [] });
});

test('кошелёк: начисление в сундук, списание сначала из сундука, долг не показывается', () => {
  assert.deepEqual(applyToWallet({ balance: 0, chest: 0 }, 3), { balance: 0, chest: 3 });
  assert.deepEqual(applyToWallet({ balance: 5, chest: 2 }, -3), { balance: 4, chest: 0 });
  assert.deepEqual(applyToWallet({ balance: 0, chest: 0 }, -3), { balance: -3, chest: 0 });
  assert.equal(visibleBalance({ balance: -3, chest: 0 }), 0);
});
