import { ApiProblem } from './catalog.mjs';
import { moneyCents, moneyDecimal } from './lesson-rules.mjs';
import { partnerProjectId } from './project-scope.mjs';

const PERCENT_SCALE = 1000n;
const HUNDRED_PERCENT = 100n * PERCENT_SCALE;

function identifier(value, field = 'id') {
  const result = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(result)) throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректное поле ${field}`);
  return result;
}
function dateOnly(value, field) {
  const result = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00Z`))) {
    throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректное поле ${field}`);
  }
  return result;
}
function percentUnits(value, field) {
  const match = String(value ?? '').trim().match(/^(\d{1,3})(?:\.(\d{1,3}))?$/);
  if (!match) throw new ApiProblem(409, 'PARTNER_AGREEMENT_INVALID', `Некорректное поле ${field}`);
  return BigInt(match[1]) * PERCENT_SCALE + BigInt((match[2] ?? '').padEnd(3, '0'));
}
function roundedPercent(cents, percent) {
  const product = cents * percent; const negative = product < 0n; const absolute = negative ? -product : product;
  const rounded = (absolute + HUNDRED_PERCENT / 2n) / HUNDRED_PERCENT;
  return negative ? -rounded : rounded;
}

export function calculatePartnerSettlement({ paymentsAmount, refundsAmount, cashHeldByPartner, salaryAmount, taxPercent, icubePercent, partnerPercent }) {
  const payments = moneyCents(paymentsAmount); const refunds = moneyCents(refundsAmount); const cash = moneyCents(cashHeldByPartner); const salary = moneyCents(salaryAmount);
  const taxRate = percentUnits(taxPercent, 'taxPercent'); const icubeRate = percentUnits(icubePercent, 'icubePercent'); const partnerRate = percentUnits(partnerPercent, 'partnerPercent');
  if (icubeRate + partnerRate !== HUNDRED_PERCENT) throw new ApiProblem(409, 'PARTNER_AGREEMENT_INVALID', 'Доли iCube и партнёра должны составлять 100%');
  const income = payments - refunds;
  const tax = roundedPercent(income > 0n ? income : 0n, taxRate);
  const distributable = income - tax - salary;
  const partnerShare = roundedPercent(distributable, partnerRate);
  const icubeShare = distributable - partnerShare;
  const transfer = partnerShare - cash;
  return {
    paymentsAmount: moneyDecimal(payments), refundsAmount: moneyDecimal(refunds), incomeAmount: moneyDecimal(income),
    cashHeldByPartner: moneyDecimal(cash), taxAmount: moneyDecimal(tax), salaryAmount: moneyDecimal(salary),
    distributableAmount: moneyDecimal(distributable), icubeShareAmount: moneyDecimal(icubeShare),
    partnerShareAmount: moneyDecimal(partnerShare), transferAmount: moneyDecimal(transfer),
  };
}

export function settlementProjectId(filters = {}, context = {}) {
  const scopedProjectId = partnerProjectId(context);
  if (scopedProjectId) {
    if (filters.projectId != null && String(filters.projectId) !== String(scopedProjectId)) {
      throw new ApiProblem(403, 'FORBIDDEN', 'Расчёт другого проекта недоступен');
    }
    return identifier(scopedProjectId, 'projectId');
  }
  return identifier(filters.projectId, 'projectId');
}

export function createPartnerSettlements(pool) {
  async function preview(filters = {}, context = {}) {
    const projectId = settlementProjectId(filters, context); const from = dateOnly(filters.from, 'from'); const to = dateOnly(filters.to, 'to');
    if (from > to) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Дата начала периода должна быть не позже даты окончания');
    const [projects] = await pool.query(`SELECT p.id,p.name,p.partner_id,partner.name partner_name
      FROM projects p LEFT JOIN partners partner ON partner.id=p.partner_id WHERE p.id=:projectId`, { projectId });
    const project = projects[0];
    if (!project) throw new ApiProblem(404, 'PROJECT_NOT_FOUND', 'Проект не найден');
    if (project.partner_id == null) throw new ApiProblem(409, 'PARTNER_NOT_CONFIGURED', 'У выбранного проекта не назначен партнёр');
    const [agreements] = await pool.query(`SELECT id,tax_percent,icube_percent,partner_percent FROM partner_agreement_versions
      WHERE project_id=:projectId AND partner_id=:partnerId AND valid_from<=NOW(6) AND (valid_to IS NULL OR valid_to>NOW(6))
      ORDER BY valid_from DESC,id DESC LIMIT 1`, { projectId, partnerId: project.partner_id });
    const agreement = agreements[0];
    if (!agreement) throw new ApiProblem(409, 'PARTNER_AGREEMENT_NOT_CONFIGURED', 'Для выбранного проекта не настроены партнёрские условия');
    const [[paymentRows], [refundRows], [salaryRows]] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(amount),0) payments_amount,
          COALESCE(SUM(CASE WHEN method='cash' THEN amount ELSE 0 END),0) cash_held_by_partner
        FROM payments WHERE project_id_snapshot=:projectId AND paid_on BETWEEN :from AND :to AND deleted_at IS NULL`, { projectId, from, to }),
      pool.query(`SELECT COALESCE(SUM(amount),0) refunds_amount FROM refunds
        WHERE project_id_snapshot=:projectId AND refunded_on BETWEEN :from AND :to AND deleted_at IS NULL`, { projectId, from, to }),
      pool.query(`SELECT COALESCE(SUM(sa.total_amount),0) salary_amount FROM salary_accruals sa
        JOIN lessons l ON l.id=sa.lesson_id WHERE sa.reversed_at IS NULL AND l.project_id_snapshot=:projectId
          AND DATE(l.starts_at) BETWEEN :from AND :to AND l.deleted_at IS NULL`, { projectId, from, to }),
    ]);
    const amounts = calculatePartnerSettlement({
      paymentsAmount: String(paymentRows[0]?.payments_amount ?? '0.00'), refundsAmount: String(refundRows[0]?.refunds_amount ?? '0.00'),
      cashHeldByPartner: String(paymentRows[0]?.cash_held_by_partner ?? '0.00'), salaryAmount: String(salaryRows[0]?.salary_amount ?? '0.00'),
      taxPercent: agreement.tax_percent, icubePercent: agreement.icube_percent, partnerPercent: agreement.partner_percent,
    });
    return {
      projectId: String(project.id), projectName: project.name, partnerId: String(project.partner_id), partnerName: project.partner_name,
      periodFrom: from, periodTo: to, agreementVersionId: String(agreement.id), taxPercent: String(agreement.tax_percent),
      icubePercent: String(agreement.icube_percent), partnerPercent: String(agreement.partner_percent), ...amounts,
    };
  }
  return { preview };
}
