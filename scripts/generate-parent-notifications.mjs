import { loadConfig } from '../backend/src/config.mjs';
import { createPool } from '../backend/src/db.mjs';
import { createMysqlLessons } from '../backend/src/lessons.mjs';
import { createParentNotifications } from '../backend/src/parent-notifications.mjs';
import { createBirthdayNotifications } from '../backend/src/birthday-notifications.mjs';

export function localDate(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function nextDate(date) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const config = loadConfig();
  const pool = createPool(config.database);
  try {
    const today = localDate(new Date(), config.parent.timeZone);
    const targetDate = nextDate(today);
    const lessons = createMysqlLessons(pool);
    await lessons.materialize(targetDate, targetDate);
    const parent = await createParentNotifications(pool).generateDayBefore(targetDate);
    const birthdays = await createBirthdayNotifications(pool).generate(today);
    console.log(JSON.stringify({ parent, birthdays }));
  } finally {
    await pool.end();
  }
}
