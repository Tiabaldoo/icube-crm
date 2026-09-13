'use strict';

const EPSILON = 1e-7;

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 4) {
  return Number(number(value).toFixed(digits));
}

function effectivePrice({ individualPrice, groupPrice, directionPrice }) {
  const value = individualPrice ?? groupPrice ?? directionPrice;
  const price = number(value);
  if (!(price > 0)) throw new Error('Цена занятия должна быть больше нуля');
  return price;
}

function createPayment({ amount, price, date, projectId = null, groupId = null }) {
  const safeAmount = number(amount);
  const safePrice = number(price);
  if (!(safeAmount > 0) || !(safePrice > 0)) throw new Error('Сумма и цена оплаты должны быть больше нуля');
  return Object.freeze({
    amount: safeAmount,
    priceSnapshot: safePrice,
    lessons: safeAmount / safePrice,
    date,
    projectId,
    groupId,
  });
}

function applyPayment(balance, payment) {
  return number(balance) + number(payment.lessons);
}

function applyRefund(balance, { amount, priceSnapshot }) {
  const price = number(priceSnapshot);
  if (!(price > 0)) throw new Error('Для возврата нужен снимок цены');
  return number(balance) - number(amount) / price;
}

function isExtraPresent(extra) {
  return Boolean(extra) && extra.present !== false;
}

function paidAttendanceIds(lesson, hasDirection) {
  const result = [];
  for (const [rawId, present] of Object.entries(lesson.attendance ?? {})) {
    const childId = Number(rawId);
    if (!present || lesson.trialChildren?.[rawId] || lesson.trialChildren?.[childId]) continue;
    if (hasDirection(childId, lesson.direction)) result.push(childId);
  }
  for (const extra of lesson.extras ?? []) {
    if (!isExtraPresent(extra) || extra.trial) continue;
    if (hasDirection(Number(extra.childId), lesson.direction)) result.push(Number(extra.childId));
  }
  return [...new Set(result)];
}

function finishLesson({ lesson, balances, hasDirection }) {
  if (lesson.attendanceApplied) return { lesson, balances: { ...balances }, chargedChildIds: [] };
  const nextBalances = { ...balances };
  const chargedChildIds = paidAttendanceIds(lesson, hasDirection);
  for (const childId of chargedChildIds) {
    const key = `${childId}:${lesson.direction}`;
    nextBalances[key] = number(nextBalances[key]) - 1;
  }
  return {
    lesson: { ...lesson, attendanceApplied: true, done: true, status: 'Проведено' },
    balances: nextBalances,
    chargedChildIds,
  };
}

function freezeRoster({ children, groupId, direction, startedAt }) {
  const childIds = children
    .filter((child) => child.status === 'Активный' || child.status === 'Лид')
    .filter((child) => (child.enrollments ?? []).some((enrollment) =>
      enrollment.direction === direction &&
      Number(enrollment.groupId) === Number(groupId) &&
      (enrollment.status ?? 'Активный') === 'Активный'))
    .map((child) => Number(child.id));
  return Object.freeze({ childIds: [...new Set(childIds)], startedAt });
}

function createSalarySnapshot(rates) {
  return Object.freeze({
    fix: number(rates.fix),
    child: number(rates.child),
    intro: number(rates.intro),
    empty: number(rates.empty),
  });
}

function ensureLots(enrollment, fallbackPrice) {
  if (Array.isArray(enrollment.lots)) return enrollment.lots.map((lot) => ({ ...lot }));
  const balance = Math.max(0, number(enrollment.balance));
  return balance > EPSILON ? [{ lessons: balance, price: number(fallbackPrice), source: 'legacy' }] : [];
}

function remainingMoney(lots) {
  return round((lots ?? []).reduce((sum, lot) => sum + number(lot.lessons) * number(lot.price), 0), 2);
}

function consumeLots(lots, lessons) {
  let left = Math.max(0, number(lessons));
  const next = (lots ?? []).map((lot) => ({ ...lot }));
  while (left > EPSILON && next.length) {
    const take = Math.min(number(next[0].lessons), left);
    next[0].lessons = number(next[0].lessons) - take;
    left -= take;
    if (next[0].lessons <= EPSILON) next.shift();
  }
  return next;
}

function transferRemainingBalance({ sourceBalance, sourceLots, sourcePrice, targetBalance, targetLots, targetPrice }) {
  const price = number(targetPrice);
  if (!(price > 0)) throw new Error('Цена целевого направления должна быть больше нуля');
  const normalizedSourceLots = Array.isArray(sourceLots)
    ? sourceLots.map((lot) => ({ ...lot }))
    : ensureLots({ balance: sourceBalance }, sourcePrice);
  const amount = remainingMoney(normalizedSourceLots);
  const lessons = amount / price;
  const normalizedTargetLots = Array.isArray(targetLots)
    ? targetLots.map((lot) => ({ ...lot }))
    : ensureLots({ balance: targetBalance }, targetPrice);
  if (lessons > EPSILON) normalizedTargetLots.push({ lessons, price, source: 'transfer' });
  return {
    amount,
    sourceBalance: 0,
    sourceLots: [],
    targetBalance: number(targetBalance) + lessons,
    targetLots: normalizedTargetLots,
  };
}

function salaryForLesson(lesson, rates) {
  const extras = (lesson.extras ?? []).filter(isExtraPresent);
  const children = Object.values(lesson.attendance ?? {}).filter(Boolean).length + extras.length;
  if (lesson.emptyTrip) return { type: 'Пустой выезд', children: 0, fixed: number(rates.empty), childrenPay: 0, total: number(rates.empty) };
  if (!lesson.done || lesson.cancelled) return { type: 'Не начисляется', children, fixed: 0, childrenPay: 0, total: 0 };
  if (lesson.intro) return { type: 'Ознакомительное занятие', children, fixed: number(rates.intro), childrenPay: 0, total: number(rates.intro) };
  const childrenPay = children * number(rates.child);
  return { type: 'Обычное занятие', children, fixed: number(rates.fix), childrenPay, total: number(rates.fix) + childrenPay };
}

function partnerSettlement({ payments, refunds, salary, taxRate, partnerRate, icubeRate, partnerCash }) {
  const paymentTotal = (payments ?? []).reduce((sum, item) => sum + number(item.amount), 0);
  const refundTotal = (refunds ?? []).reduce((sum, item) => sum + number(item.amount), 0);
  const income = paymentTotal - refundTotal;
  const tax = Math.max(0, income) * number(taxRate) / 100;
  const distributable = income - tax - number(salary);
  const partnerShare = distributable * number(partnerRate) / 100;
  const icubeShare = distributable * number(icubeRate) / 100;
  return {
    payments: paymentTotal,
    refunds: refundTotal,
    income,
    tax,
    salary: number(salary),
    distributable,
    partnerShare,
    icubeShare,
    transfer: partnerShare - number(partnerCash),
  };
}

module.exports = {
  EPSILON,
  applyPayment,
  applyRefund,
  consumeLots,
  createPayment,
  createSalarySnapshot,
  effectivePrice,
  ensureLots,
  finishLesson,
  freezeRoster,
  isExtraPresent,
  paidAttendanceIds,
  partnerSettlement,
  remainingMoney,
  salaryForLesson,
  transferRemainingBalance,
};
