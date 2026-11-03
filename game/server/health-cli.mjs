// Подробная проверка для сервера: npm run health. Наружу отдаётся только /game/api/health.
import { loadGameConfig } from './config.mjs';
import { createCrmClient } from './crm-client.mjs';
import { createGamePool } from './store-mysql.mjs';

const config = loadGameConfig();
const pool = createGamePool(config.database);
let failed = false;
try {
  const [[row]] = await pool.query('SELECT DATABASE() AS name');
  const [tables] = await pool.query("SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('game_profiles','game_sessions')");
  const migrated = Number(tables[0].count) === 2;
  console.log(`База игры: ${row.name}, таблицы ${migrated ? 'на месте' : 'не найдены — нужна npm run migrate'}`);
  if (!migrated) failed = true;
} catch (error) {
  console.log(`База игры недоступна: ${error?.code ?? error?.message}`);
  failed = true;
} finally {
  await pool.end();
}
// Отдельного метода проверки у внутреннего API нет: статус ребёнка 1 — лёгкий запрос только на чтение.
const crm = createCrmClient({ baseUrl: config.crmInternalUrl, token: config.internalToken });
const result = await crm.status('1');
console.log(result.ok ? 'Внутренний API CRM отвечает' : `Внутренний API CRM: ${result.reason ?? `${result.status} ${result.code ?? ''}`}`);
if (!result.ok) failed = true;
process.exitCode = failed ? 1 : 0;
