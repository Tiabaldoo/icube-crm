import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rules = require('../src/domain/business-rules.cjs');

test('цена выбирается по приоритету: индивидуальная, группа, направление', () => {
  assert.equal(rules.effectivePrice({ individualPrice: 800, groupPrice: 900, directionPrice: 1000 }), 800);
  assert.equal(rules.effectivePrice({ individualPrice: null, groupPrice: 900, directionPrice: 1000 }), 900);
  assert.equal(rules.effectivePrice({ individualPrice: null, groupPrice: null, directionPrice: 1000 }), 1000);
});

test('оплата сохраняет историческую цену и не меняется после новой цены направления', () => {
  const payment = rules.createPayment({ amount: 4000, price: 1000, date: '2026-09-01', projectId: 1, groupId: 10 });
  assert.equal(payment.lessons, 4);
  assert.equal(payment.priceSnapshot, 1000);
  assert.equal(rules.applyPayment(0, payment), 4);
  assert.equal(payment.priceSnapshot, 1000);
  assert.equal(payment.lessons, 4);
});

test('отрицательный баланс разрешён', () => {
  const result = rules.finishLesson({
    lesson: { direction: 'Робототехника', attendance: { 1: true }, extras: [], trialChildren: {}, attendanceApplied: false },
    balances: { '1:Робототехника': 0 },
    hasDirection: (_id, direction) => direction === 'Робототехника',
  });
  assert.equal(result.balances['1:Робототехника'], -1);
});

test('пробное посещение не списывает баланс, платное списывает только своё направление', () => {
  const result = rules.finishLesson({
    lesson: {
      direction: 'Программирование',
      attendance: { 1: true, 2: true, 3: true },
      trialChildren: { 1: true },
      extras: [{ childId: 4, trial: false, present: true }, { childId: 5, trial: false, present: false }],
      attendanceApplied: false,
    },
    balances: {
      '1:Программирование': 2,
      '2:Программирование': 2,
      '3:Робототехника': 7,
      '4:Программирование': 1,
      '5:Программирование': 1,
    },
    hasDirection: (id, direction) => ({
      1: ['Программирование', 'Робототехника'],
      2: ['Программирование'],
      3: ['Робототехника'],
      4: ['Программирование'],
      5: ['Программирование'],
    })[id].includes(direction),
  });
  assert.equal(result.balances['1:Программирование'], 2);
  assert.equal(result.balances['2:Программирование'], 1);
  assert.equal(result.balances['3:Робототехника'], 7);
  assert.equal(result.balances['4:Программирование'], 0);
  assert.equal(result.balances['5:Программирование'], 1);
});

test('повторное завершение занятия не делает двойное списание', () => {
  const lesson = { direction: 'Робототехника', attendance: { 1: true }, extras: [], attendanceApplied: false };
  const first = rules.finishLesson({ lesson, balances: { '1:Робототехника': 3 }, hasDirection: () => true });
  const second = rules.finishLesson({ lesson: first.lesson, balances: first.balances, hasDirection: () => true });
  assert.equal(first.balances['1:Робототехника'], 2);
  assert.equal(second.balances['1:Робототехника'], 2);
  assert.deepEqual(second.chargedChildIds, []);
});

test('возврат уменьшает баланс по снимку цены операции', () => {
  assert.equal(rules.applyRefund(4, { amount: 1500, priceSnapshot: 1000 }), 2.5);
});

test('перенос между направлениями сохраняет рублёвую стоимость остатка', () => {
  const transfer = rules.transferRemainingBalance({
    sourceBalance: 3,
    sourceLots: [{ lessons: 2, price: 1000 }, { lessons: 1, price: 1200 }],
    sourcePrice: 2000,
    targetBalance: 1,
    targetLots: [{ lessons: 1, price: 800 }],
    targetPrice: 800,
  });
  assert.equal(transfer.amount, 3200);
  assert.equal(transfer.sourceBalance, 0);
  assert.equal(transfer.targetBalance, 5);
  assert.equal(rules.remainingMoney(transfer.targetLots), 4000);
});

test('изменение текущей цены не пересчитывает старые ценовые лоты', () => {
  const lots = [{ lessons: 2, price: 1000 }, { lessons: 1, price: 1200 }];
  assert.equal(rules.remainingMoney(lots), 3200);
  assert.notEqual(3 * 2000, rules.remainingMoney(lots));
});

test('состав основной группы фиксируется со статусом конкретного направления', () => {
  const roster = rules.freezeRoster({
    groupId: 7,
    direction: 'Программирование',
    startedAt: '2026-09-13T10:00:00Z',
    children: [
      { id: 1, status: 'Активный', enrollments: [{ direction: 'Программирование', groupId: 7, status: 'Активный' }] },
      { id: 2, status: 'Активный', enrollments: [{ direction: 'Программирование', groupId: 7, status: 'Пауза' }] },
      { id: 3, status: 'Пауза', enrollments: [{ direction: 'Программирование', groupId: 7, status: 'Активный' }] },
      { id: 4, status: 'Активный', enrollments: [{ direction: 'Робототехника', groupId: 7, status: 'Активный' }] },
    ],
  });
  assert.deepEqual(roster.childIds, [1]);
});

test('зарплата учитывает только реально присутствующих дополнительных детей', () => {
  const historicalRates = rules.createSalarySnapshot({ fix: 600, child: 100, intro: 600, empty: 300 });
  const normal = rules.salaryForLesson({ done: true, cancelled: false, attendance: { 1: true, 2: false }, extras: [{ present: true }, { present: false }] }, historicalRates);
  assert.deepEqual(normal, { type: 'Обычное занятие', children: 2, fixed: 600, childrenPay: 200, total: 800 });
  assert.equal(rules.salaryForLesson({ done: true, attendance: { 1: true }, extras: [] }, historicalRates).total, 700);
  assert.equal(rules.salaryForLesson({ done: true, attendance: { 1: true }, extras: [] }, { fix: 1000, child: 500 }).total, 1500);
  const intro = rules.salaryForLesson({ done: true, intro: true, attendance: { 1: true }, extras: [] }, { fix: 600, child: 100, intro: 700, empty: 300 });
  assert.equal(intro.total, 700);
  const empty = rules.salaryForLesson({ done: false, emptyTrip: true, attendance: {}, extras: [] }, { fix: 600, child: 100, intro: 700, empty: 300 });
  assert.equal(empty.total, 300);
});

test('партнёрский расчёт вычитает возвраты, налог, зарплату и наличные один раз', () => {
  const result = rules.partnerSettlement({
    payments: [{ amount: 10000 }, { amount: 5000 }],
    refunds: [{ amount: 1000 }],
    salary: 2000,
    taxRate: 4,
    partnerRate: 60,
    icubeRate: 40,
    partnerCash: 3000,
  });
  assert.equal(result.income, 14000);
  assert.equal(result.tax, 560);
  assert.equal(result.distributable, 11440);
  assert.equal(result.partnerShare, 6864);
  assert.equal(result.icubeShare, 4576);
  assert.equal(result.transfer, 3864);
});
