import { inTransaction } from './db.mjs';
import { ApiProblem } from './catalog.mjs';

function identifier(value, field = 'id') {
  const result = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(result)) throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректное поле ${field}`);
  return result;
}

function moneyCents(value, field) {
  const match = String(value ?? '').trim().match(/^(\d{1,11})(?:[.,](\d{1,2}))?$/);
  if (!match) throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректное поле ${field}`);
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  if (cents <= 0n) throw new ApiProblem(400, 'VALIDATION_ERROR', `${field} должно быть больше нуля`);
  return cents;
}

function formatCents(cents) {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

export function packagePriceToLessonPrice(value) {
  const packageCents = moneyCents(value, 'packagePrice');
  if (packageCents % 4n !== 0n) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Цена абонемента должна делиться на 4 с точностью до копейки');
  return formatCents(packageCents / 4n);
}

export function lessonPriceToPackagePrice(value) {
  return formatCents(moneyCents(value, 'price') * 4n);
}

function mapDirectionPrice(row) {
  return {
    id: row.price_version_id == null ? null : String(row.price_version_id),
    directionId: String(row.direction_id),
    directionCode: row.direction_code,
    directionName: row.direction_name,
    price: row.price == null ? null : String(row.price),
    packagePrice: row.price == null ? null : lessonPriceToPackagePrice(row.price),
    validFrom: row.valid_from ?? null,
  };
}

export function createDirectionPriceVersions(pool) {
  async function list() {
    const [rows] = await pool.query(`SELECT d.id direction_id,d.code direction_code,d.name direction_name,
      pv.id price_version_id,pv.price,pv.valid_from
      FROM directions d
      LEFT JOIN price_versions pv ON pv.id=(
        SELECT pv2.id FROM price_versions pv2
        WHERE pv2.scope_type='direction' AND pv2.direction_id=d.id
          AND pv2.valid_from<=NOW(6) AND (pv2.valid_to IS NULL OR pv2.valid_to>NOW(6))
        ORDER BY pv2.valid_from DESC,pv2.id DESC LIMIT 1
      )
      ORDER BY d.name`);
    return rows.map(mapDirectionPrice);
  }

  async function create(body, context = {}) {
    const directionId = identifier(body.directionId, 'directionId');
    const price = packagePriceToLessonPrice(body.packagePrice);
    return inTransaction(pool, async (connection) => {
      const [directions] = await connection.query('SELECT id,code,name FROM directions WHERE id=:directionId FOR UPDATE', { directionId });
      if (!directions.length) throw new ApiProblem(404, 'NOT_FOUND', 'Направление не найдено');
      const direction = directions[0];
      const [currentRows] = await connection.query(`SELECT id,price,valid_from FROM price_versions
        WHERE scope_type='direction' AND direction_id=:directionId
          AND valid_from<=NOW(6) AND (valid_to IS NULL OR valid_to>NOW(6))
        ORDER BY valid_from DESC,id DESC LIMIT 1 FOR UPDATE`, { directionId });
      const current = currentRows[0] ?? null;
      if (current && String(current.price) === price) {
        return mapDirectionPrice({
          direction_id: direction.id, direction_code: direction.code, direction_name: direction.name,
          price_version_id: current.id, price: current.price, valid_from: current.valid_from,
        });
      }

      const [timeRows] = await connection.query('SELECT NOW(6) effective_at');
      const effectiveAt = timeRows[0].effective_at;
      if (current) await connection.query('UPDATE price_versions SET valid_to=:effectiveAt WHERE id=:id', { effectiveAt, id: current.id });
      const [result] = await connection.query(`INSERT INTO price_versions
        (scope_type,direction_id,price,valid_from,created_by_user_id)
        VALUES ('direction',:directionId,:price,:effectiveAt,:actorId)`, {
        directionId, price, effectiveAt, actorId: context.actorUserId ?? null,
      });
      return mapDirectionPrice({
        direction_id: direction.id, direction_code: direction.code, direction_name: direction.name,
        price_version_id: result.insertId, price, valid_from: effectiveAt,
      });
    });
  }

  return { list, create };
}
