export const BUSINESS_TIME_ZONE = 'Asia/Sakhalin';
export const BUSINESS_UTC_OFFSET = '+11:00';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function partsByType(parts) {
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

export function businessDate(now = new Date()) {
  const parts = partsByType(dateFormatter.formatToParts(now));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function parseCalendarDate(value, message = 'Некорректная дата') {
  const text = String(value ?? '');
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new TypeError(message);
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) throw new TypeError(message);
  return text;
}

export function addCalendarDays(value, days) {
  const date = parseCalendarDate(value);
  const probe = new Date(`${date}T12:00:00Z`);
  probe.setUTCDate(probe.getUTCDate() + Number(days));
  return probe.toISOString().slice(0, 10);
}

export function calendarMonthPeriod(now = new Date(), monthOffset = 0) {
  const [year, month] = businessDate(now).split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
  const last = new Date(Date.UTC(year, month + monthOffset, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

export function ageOnDate(birthDate, onDate = businessDate()) {
  try {
    const birth = parseCalendarDate(birthDate); const current = parseCalendarDate(onDate);
    const [birthYear, birthMonth, birthDay] = birth.split('-').map(Number);
    const [year, month, day] = current.split('-').map(Number);
    if (birth > current) return null;
    let age = year - birthYear;
    if (month < birthMonth || (month === birthMonth && day < birthDay)) age -= 1;
    return age >= 0 && age <= 150 ? age : null;
  } catch { return null; }
}

export function birthdayMatchesDate(birthDate, onDate = businessDate()) {
  try {
    const birth = parseCalendarDate(birthDate); const current = parseCalendarDate(onDate);
    const [, birthMonth, birthDay] = birth.split('-').map(Number);
    const [year, month, day] = current.split('-').map(Number);
    if (birthMonth === month && birthDay === day) return true;
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return birthMonth === 2 && birthDay === 29 && !leap && month === 2 && day === 28;
  } catch { return false; }
}
