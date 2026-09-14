import { inTransaction } from './db.mjs';
import { ApiProblem } from './catalog.mjs';

const RATE_COLUMNS = {
  regular_fixed: 'regular_fixed',
  per_present_child: 'per_present_child',
  intro_fixed: 'intro_fixed',
  empty_trip_fixed: 'empty_trip_fixed',
};

function moneyCents(value, field = 'value') {
  const match = String(value ?? '').trim().match(/^(\d{1,11})(?:[.,](\d{1,2}))?$/);
  if (!match) throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректное поле ${field}`);
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
}

function formatCents(cents) {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

function normalizeMoney(value, field) {
  return formatCents(moneyCents(value, field));
}

function rateKey(value) {
  const key = String(value ?? '').trim();
  if (!RATE_COLUMNS[key]) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Неизвестный тип ставки зарплаты');
  return key;
}

function mapRates(row) {
  if (!row) return [];
  return Object.keys(RATE_COLUMNS).map((key) => ({
    key,
    value: String(row[key]),
    versionId: String(row.id),
    validFrom: row.valid_from,
  }));
}

function mapRate(row, key) {
  return {
    key,
    value: String(row[key]),
    versionId: String(row.id),
    validFrom: row.valid_from,
  };
}

export function createSalaryRateVersions(pool) {
  async function list() {
    const [rows] = await pool.query(`SELECT id,regular_fixed,per_present_child,intro_fixed,empty_trip_fixed,valid_from
      FROM salary_rate_versions
      WHERE teacher_id IS NULL AND direction_id IS NULL
        AND valid_from<=NOW(6) AND (valid_to IS NULL OR valid_to>NOW(6))
      ORDER BY valid_from DESC,id DESC LIMIT 1`);
    return mapRates(rows[0] ?? null);
  }

  async function create(body, context = {}) {
    const key = rateKey(body.key);
    const value = normalizeMoney(body.value, 'value');
    return inTransaction(pool, async (connection) => {
      const [rows] = await connection.query(`SELECT id,regular_fixed,per_present_child,intro_fixed,empty_trip_fixed,valid_from,created_by_user_id
        FROM salary_rate_versions
        WHERE teacher_id IS NULL AND direction_id IS NULL
          AND valid_from<=NOW(6) AND (valid_to IS NULL OR valid_to>NOW(6))
        ORDER BY valid_from DESC,id DESC LIMIT 1 FOR UPDATE`);
      const current = rows[0];
      if (!current) throw new ApiProblem(409, 'SALARY_RATES_NOT_CONFIGURED', 'Базовые ставки зарплаты не настроены');
      if (normalizeMoney(current[key], key) === value) return mapRate(current, key);

      const [timeRows] = await connection.query('SELECT NOW(6) effective_at');
      const effectiveAt = timeRows[0].effective_at;
      await connection.query('UPDATE salary_rate_versions SET valid_to=:effectiveAt WHERE id=:id', { effectiveAt, id: current.id });
      const next = {
        regular_fixed: normalizeMoney(current.regular_fixed, 'regular_fixed'),
        per_present_child: normalizeMoney(current.per_present_child, 'per_present_child'),
        intro_fixed: normalizeMoney(current.intro_fixed, 'intro_fixed'),
        empty_trip_fixed: normalizeMoney(current.empty_trip_fixed, 'empty_trip_fixed'),
        [key]: value,
      };
      const [result] = await connection.query(`INSERT INTO salary_rate_versions
        (teacher_id,direction_id,regular_fixed,per_present_child,intro_fixed,empty_trip_fixed,valid_from,created_by_user_id)
        VALUES (NULL,NULL,:regularFixed,:perPresentChild,:introFixed,:emptyTripFixed,:effectiveAt,:actorId)`, {
        regularFixed: next.regular_fixed,
        perPresentChild: next.per_present_child,
        introFixed: next.intro_fixed,
        emptyTripFixed: next.empty_trip_fixed,
        effectiveAt,
        actorId: context.actorUserId ?? null,
      });
      return mapRate({ id: result.insertId, valid_from: effectiveAt, ...next }, key);
    });
  }

  return { list, create };
}
