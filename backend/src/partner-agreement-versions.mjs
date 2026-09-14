import { inTransaction } from './db.mjs';
import { ApiProblem } from './catalog.mjs';

const DEFAULT_PROJECT_CODE = 'zebra';
const SCALE = 1000n;
const MAX_PERCENT = 100n * SCALE;

function percentUnits(value, field) {
  const match = String(value ?? '').trim().match(/^(\d{1,3})(?:[.,](\d{1,3}))?$/);
  if (!match) throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректное поле ${field}`);
  const units = BigInt(match[1]) * SCALE + BigInt((match[2] ?? '').padEnd(3, '0'));
  if (units < 0n || units > MAX_PERCENT) throw new ApiProblem(400, 'VALIDATION_ERROR', `${field} должно быть от 0 до 100`);
  return units;
}

function formatPercent(units) {
  return `${units / SCALE}.${String(units % SCALE).padStart(3, '0')}`;
}

function normalizePercent(value, field) {
  return formatPercent(percentUnits(value, field));
}

function validatedPercents(body) {
  const tax = percentUnits(body.taxPercent, 'taxPercent');
  const icube = percentUnits(body.icubePercent, 'icubePercent');
  const partner = percentUnits(body.partnerPercent, 'partnerPercent');
  if (icube + partner !== MAX_PERCENT) {
    throw new ApiProblem(400, 'VALIDATION_ERROR', 'Доли iCube и партнёра в сумме должны составлять 100%');
  }
  return {
    taxPercent: formatPercent(tax),
    icubePercent: formatPercent(icube),
    partnerPercent: formatPercent(partner),
  };
}

function mapAgreement(row) {
  return {
    projectId: String(row.project_id),
    projectCode: row.project_code,
    partnerId: String(row.partner_id),
    taxPercent: String(row.tax_percent),
    icubePercent: String(row.icube_percent),
    partnerPercent: String(row.partner_percent),
    versionId: String(row.id),
    validFrom: row.valid_from,
  };
}

async function resolveProject(connection, body = {}) {
  const projectCode = String(body.projectCode ?? DEFAULT_PROJECT_CODE).trim();
  const projectId = body.projectId == null || body.projectId === '' ? null : String(body.projectId);
  const [rows] = await connection.query(`SELECT id,code,partner_id
    FROM projects
    WHERE ${projectId ? 'id=:projectId' : 'code=:projectCode'}
    LIMIT 1${body.lock ? ' FOR UPDATE' : ''}`, { projectId, projectCode });
  const project = rows[0];
  if (!project) throw new ApiProblem(404, 'PROJECT_NOT_FOUND', 'Партнёрский проект не найден');
  if (project.code !== DEFAULT_PROJECT_CODE) throw new ApiProblem(400, 'VALIDATION_ERROR', 'На этом этапе поддерживается только проект zebra');
  if (project.partner_id == null) throw new ApiProblem(409, 'PARTNER_NOT_CONFIGURED', 'У проекта «Зебра» не назначен партнёр');
  return project;
}

export function createPartnerAgreementVersions(pool) {
  async function list() {
    const project = await resolveProject(pool, { projectCode: DEFAULT_PROJECT_CODE });
    const [rows] = await pool.query(`SELECT pav.id,pav.project_id,p.code project_code,pav.partner_id,
        pav.tax_percent,pav.icube_percent,pav.partner_percent,pav.valid_from
      FROM partner_agreement_versions pav
      JOIN projects p ON p.id=pav.project_id
      WHERE pav.project_id=:projectId AND pav.partner_id=:partnerId
        AND pav.valid_from<=NOW(6) AND (pav.valid_to IS NULL OR pav.valid_to>NOW(6))
      ORDER BY pav.valid_from DESC,pav.id DESC LIMIT 1`, {
      projectId: project.id,
      partnerId: project.partner_id,
    });
    if (!rows[0]) throw new ApiProblem(409, 'PARTNER_AGREEMENT_NOT_CONFIGURED', 'Для проекта «Зебра» не настроены партнёрские условия');
    return mapAgreement(rows[0]);
  }

  async function create(body, context = {}) {
    const values = validatedPercents(body);
    return inTransaction(pool, async (connection) => {
      const project = await resolveProject(connection, { ...body, lock: true });
      const [rows] = await connection.query(`SELECT pav.id,pav.project_id,p.code project_code,pav.partner_id,
          pav.tax_percent,pav.icube_percent,pav.partner_percent,pav.valid_from
        FROM partner_agreement_versions pav
        JOIN projects p ON p.id=pav.project_id
        WHERE pav.project_id=:projectId AND pav.partner_id=:partnerId
          AND pav.valid_from<=NOW(6) AND (pav.valid_to IS NULL OR pav.valid_to>NOW(6))
        ORDER BY pav.valid_from DESC,pav.id DESC LIMIT 1 FOR UPDATE`, {
        projectId: project.id,
        partnerId: project.partner_id,
      });
      const current = rows[0];
      if (!current) throw new ApiProblem(409, 'PARTNER_AGREEMENT_NOT_CONFIGURED', 'Для проекта «Зебра» не настроены партнёрские условия');

      const same = normalizePercent(current.tax_percent, 'taxPercent') === values.taxPercent
        && normalizePercent(current.icube_percent, 'icubePercent') === values.icubePercent
        && normalizePercent(current.partner_percent, 'partnerPercent') === values.partnerPercent;
      if (same) return mapAgreement(current);

      const [timeRows] = await connection.query('SELECT NOW(6) effective_at');
      const effectiveAt = timeRows[0].effective_at;
      await connection.query('UPDATE partner_agreement_versions SET valid_to=:effectiveAt WHERE id=:id', {
        effectiveAt,
        id: current.id,
      });
      const [result] = await connection.query(`INSERT INTO partner_agreement_versions
        (project_id,partner_id,tax_percent,icube_percent,partner_percent,valid_from,created_by_user_id)
        VALUES (:projectId,:partnerId,:taxPercent,:icubePercent,:partnerPercent,:effectiveAt,:actorId)`, {
        projectId: project.id,
        partnerId: project.partner_id,
        ...values,
        effectiveAt,
        actorId: context.actorUserId ?? null,
      });
      return mapAgreement({
        id: result.insertId,
        project_id: project.id,
        project_code: project.code,
        partner_id: project.partner_id,
        tax_percent: values.taxPercent,
        icube_percent: values.icubePercent,
        partner_percent: values.partnerPercent,
        valid_from: effectiveAt,
      });
    });
  }

  return { list, create };
}
