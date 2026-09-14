const LESSON_SCALE = 100000000n;
const DAY = 86400000;

export function occurrenceDates(group, from, to) {
  const dateKey = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const first = Math.max(Date.parse(`${from}T00:00:00Z`), Date.parse(`${dateKey(group.startsOn ?? group.starts_on)}T00:00:00Z`));
  const groupEnd = group.endsOn ?? group.ends_on;
  const last = Math.min(Date.parse(`${to}T00:00:00Z`), groupEnd ? Date.parse(`${dateKey(groupEnd)}T00:00:00Z`) : Infinity);
  const dates = [];
  for (let stamp = first; stamp <= last; stamp += DAY) {
    const day = new Date(stamp); const weekday = day.getUTCDay() || 7;
    if (weekday === Number(group.weekday)) dates.push(day.toISOString().slice(0, 10));
  }
  return dates;
}

export function lessonUnits(value) {
  const match = String(value ?? '').trim().match(/^(-?)(\d+)(?:\.(\d{1,8}))?$/);
  if (!match) throw new TypeError(`Некорректное количество занятий: ${value}`);
  const units = BigInt(match[2]) * LESSON_SCALE + BigInt((match[3] ?? '').padEnd(8, '0'));
  return match[1] ? -units : units;
}

export function lessonDecimal(units) {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  return `${negative ? '-' : ''}${absolute / LESSON_SCALE}.${String(absolute % LESSON_SCALE).padStart(8, '0')}`;
}

export function moneyCents(value) {
  const match = String(value ?? '').trim().match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new TypeError(`Некорректная сумма: ${value}`);
  const cents = BigInt(match[2]) * 100n + BigInt((match[3] ?? '').padEnd(2, '0'));
  return match[1] ? -cents : cents;
}

export function moneyDecimal(cents) {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  return `${negative ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

export function planFifoConsumption(lots, debit = '1.00000000', fallbackUnitPrice = '0.00') {
  let required = lessonUnits(debit);
  const consumptions = [];
  let amountCents = 0n;
  for (const lot of lots) {
    if (required <= 0n) break;
    const available = lessonUnits(lot.remainingLessons ?? lot.remaining_lessons);
    if (available <= 0n) continue;
    const consumed = available < required ? available : required;
    const unitPrice = moneyCents(lot.unitPrice ?? lot.unit_price);
    const amount = (consumed * unitPrice + LESSON_SCALE / 2n) / LESSON_SCALE;
    consumptions.push({ lotId: String(lot.id), lessons: lessonDecimal(consumed), amount: moneyDecimal(amount) });
    amountCents += amount;
    required -= consumed;
  }
  if (required > 0n) {
    const fallback = moneyCents(fallbackUnitPrice);
    amountCents += (required * fallback + LESSON_SCALE / 2n) / LESSON_SCALE;
  }
  return { consumptions, uncoveredLessons: lessonDecimal(required), amount: moneyDecimal(amountCents) };
}

export function restoredLotBalances(lots, consumptions) {
  const restored = new Map(lots.map((lot) => [String(lot.id), lessonUnits(lot.remainingLessons ?? lot.remaining_lessons)]));
  for (const consumption of consumptions) {
    const id = String(consumption.lotId ?? consumption.balance_lot_id);
    restored.set(id, (restored.get(id) ?? 0n) + lessonUnits(consumption.lessons));
  }
  return [...restored].map(([lotId, remaining]) => ({ lotId, remainingLessons: lessonDecimal(remaining) }));
}

export function freezeRosterMembers(members) {
  const unique = new Map();
  for (const member of members) {
    const childId = String(member.childId ?? member.child_id);
    if (!unique.has(childId)) unique.set(childId, { childId, enrollmentId: String(member.enrollmentId ?? member.enrollment_id), type: 'main' });
  }
  return [...unique.values()];
}

export function calculateSalary(kind, presentCount, rates) {
  const count = BigInt(presentCount);
  if (kind === 'cancelled') return { kind, presentCount: Number(count), fixed: '0.00', children: '0.00', total: '0.00' };
  if (kind === 'empty_trip') {
    const fixed = moneyCents(rates.emptyTripFixed ?? rates.empty_trip_fixed);
    return { kind, presentCount: 0, fixed: moneyDecimal(fixed), children: '0.00', total: moneyDecimal(fixed) };
  }
  if (kind === 'intro') {
    const fixed = moneyCents(rates.introFixed ?? rates.intro_fixed);
    return { kind, presentCount: Number(count), fixed: moneyDecimal(fixed), children: '0.00', total: moneyDecimal(fixed) };
  }
  const fixed = moneyCents(rates.regularFixed ?? rates.regular_fixed);
  const children = moneyCents(rates.perPresentChild ?? rates.per_present_child) * count;
  return { kind: 'regular', presentCount: Number(count), fixed: moneyDecimal(fixed), children: moneyDecimal(children), total: moneyDecimal(fixed + children) };
}
