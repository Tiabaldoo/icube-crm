import { ApiProblem } from './catalog.mjs';
import { assertBudgetDirector, budgetPeriod, createBudgetEntries } from './budget-entries.mjs';
import { inTransaction } from './db.mjs';
import { moneyCents, moneyDecimal } from './lesson-rules.mjs';
import { calculatePartnerSettlement, createPartnerSettlements } from './partner-settlements.mjs';
import { createSiteRentService } from './site-rent.mjs';
import { calendarMonthPeriod } from '../../src/shared/business-time.mjs';

// Ratios are management indicators; a nonpositive income base has no useful margin.
const margin = (result, income) => {
  if (income <= 0n) return null;
  const value = (result < 0n ? -result : result) * 10000n;
  const rounded = (value + income / 2n) / income;
  return `${result < 0n ? '-' : ''}${rounded / 100n}.${String(rounded % 100n).padStart(2, '0')}`;
};

export function calculateDirectorBudget({ period, projects, financialRows, rent, partner, entries }) {
  const rows = projects.map((project) => ({ id: String(project.id), code: project.code, name: project.name,
    payments: 0n, cash: 0n, cashless: 0n, refunds: 0n, salary: 0n, rent: 0n, tax: 0n, partnerShare: 0n }));
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const row of financialRows) {
    const amount = moneyCents(String(row.amount));
    if (row.project_id == null) {
      if (amount !== 0n) throw new ApiProblem(409, 'BUDGET_PROJECT_UNKNOWN', 'Часть финансовых операций не привязана к проекту. Уточните принадлежность операций перед расчётом бюджета.');
      continue;
    }
    const project = byId.get(String(row.project_id)); if (!project) continue;
    project[row.kind] += amount;
    if (row.kind === 'payments') { project.cash += moneyCents(String(row.cash)); project.cashless += moneyCents(String(row.cashless)); }
  }
  const icube = rows.find((row) => row.code === 'icube-robots'); const zebra = rows.find((row) => row.code === 'zebra');
  if (!icube || !zebra) throw new ApiProblem(409, 'BUDGET_PROJECTS_NOT_CONFIGURED', 'Для бюджета должны быть настроены проекты Айкуб и Зебра');
  icube.rent = moneyCents(rent.totalAmount);
  // Reuse the existing tax rounding and nonnegative base, without a new tax formula.
  const own = calculatePartnerSettlement({ paymentsAmount: moneyDecimal(icube.payments), refundsAmount: moneyDecimal(icube.refunds),
    cashHeldByPartner: '0.00', salaryAmount: moneyDecimal(icube.salary), taxPercent: '4', icubePercent: '100', partnerPercent: '0' });
  icube.tax = moneyCents(own.taxAmount);
  // Standard cash-based and individual attendance-based obligations are supplied
  // by the existing settlement. Transfer and earned iCube share are references only.
  zebra.tax = moneyCents(partner.taxAmount); zebra.partnerShare = moneyCents(partner.partnerShareAmount);
  const income = entries.filter((row) => row.type === 'income').reduce((sum, row) => sum + moneyCents(row.amount), 0n);
  const expense = entries.filter((row) => row.type === 'expense').reduce((sum, row) => sum + moneyCents(row.amount), 0n);
  const sums = { payments: 0n, refunds: 0n, salary: 0n, rent: 0n, tax: 0n, partnerShare: 0n };
  let automaticResult = 0n; let automaticIncome = 0n;
  const resultProjects = rows.map((row) => {
    for (const key of Object.keys(sums)) sums[key] += row[key];
    const netIncome = row.payments - row.refunds;
    const deductions = row.salary + row.rent + row.tax + row.partnerShare;
    const result = netIncome - deductions; automaticResult += result; automaticIncome += netIncome;
    return { id: row.id, code: row.code, name: row.name, ...Object.fromEntries(['payments','cash','cashless','refunds','salary','rent','tax','partnerShare'].map((key) => [key, moneyDecimal(row[key])])),
      income: moneyDecimal(netIncome), result: moneyDecimal(result), marginPercent: margin(result, netIncome) };
  });
  const deductions = sums.refunds + sums.salary + sums.rent + sums.tax + sums.partnerShare + expense;
  const result = sums.payments - deductions + income;
  return { period, projects: resultProjects, totals: { ...Object.fromEntries(Object.entries(sums).map(([key, value]) => [key, moneyDecimal(value)])),
    manualIncome: moneyDecimal(income), manualExpense: moneyDecimal(expense), deductions: moneyDecimal(deductions), result: moneyDecimal(result),
    automaticIncome: moneyDecimal(automaticIncome), automaticResult: moneyDecimal(automaticResult), combinedMarginPercent: margin(automaticResult, automaticIncome),
    overallMarginPercent: margin(result, automaticIncome + income) },
    partner: { projectId: zebra.id, earnedIncome: partner.incomeAmount, earnedIcubeShare: partner.icubeShareAmount,
      cashHeld: partner.cashHeldByPartner, transfer: moneyDecimal(-moneyCents(partner.transferAmount)),
      taxPercent: partner.taxPercent, salary: partner.salaryAmount, individualGroups: partner.customGroups },
    rent: { total: rent.totalAmount, sites: rent.sites }, entries };
}

export function createDirectorBudget(pool, { now = () => new Date() } = {}) {
  async function get(raw = {}, context = {}) {
    assertBudgetDirector(context); const defaults = calendarMonthPeriod(now());
    const period = budgetPeriod({ from: raw.from ?? defaults.from, to: raw.to ?? defaults.to });
    return inTransaction(pool, (connection) => report(connection, period, context));
  }
  // Both views use the same report and rounding, in one consistent read snapshot.
  async function monthly(_raw = {}, context = {}) {
    assertBudgetDirector(context);
    const instant = now();
    const periods = Array.from({ length: 12 }, (_, index) => calendarMonthPeriod(instant, index - 11));
    return inTransaction(pool, async (connection) => {
      const months = [];
      for (const period of periods) {
        const budget = await report(connection, period, context);
        months.push({ month: period.from.slice(0, 7), ...period, result: budget.totals.result });
      }
      return { months };
    });
  }
  async function report(connection, period, context) {
      const [projects] = await connection.query("SELECT id,code,name FROM projects WHERE code IN ('icube-robots','zebra')");
      const zebra = projects.find((p) => p.code === 'zebra');
      if (!zebra || !projects.some((p) => p.code === 'icube-robots')) throw new ApiProblem(409, 'BUDGET_PROJECTS_NOT_CONFIGURED', 'Для бюджета должны быть настроены проекты Айкуб и Зебра');
      const [[financialRows], rent, partner, entries] = await Promise.all([
        connection.query(`SELECT 'payments' kind,p.project_id_snapshot project_id,SUM(p.amount) amount,
            SUM(CASE WHEN p.method='cash' THEN p.amount ELSE 0 END) cash,SUM(CASE WHEN p.method='cashless' THEN p.amount ELSE 0 END) cashless
          FROM payments p LEFT JOIN projects pr ON pr.id=p.project_id_snapshot
          WHERE p.deleted_at IS NULL AND p.paid_on BETWEEN :from AND :to AND (pr.code IN ('icube-robots','zebra') OR p.project_id_snapshot IS NULL)
          GROUP BY p.project_id_snapshot
          UNION ALL SELECT 'refunds',r.project_id_snapshot,SUM(r.amount),0,0 FROM refunds r LEFT JOIN projects pr ON pr.id=r.project_id_snapshot
          WHERE r.deleted_at IS NULL AND r.refunded_on BETWEEN :from AND :to AND (pr.code IN ('icube-robots','zebra') OR r.project_id_snapshot IS NULL) GROUP BY r.project_id_snapshot
          UNION ALL SELECT 'salary',l.project_id_snapshot,SUM(sa.total_amount),0,0 FROM salary_accruals sa JOIN lessons l ON l.id=sa.lesson_id
          JOIN projects pr ON pr.id=l.project_id_snapshot WHERE sa.reversed_at IS NULL AND l.deleted_at IS NULL AND l.status='completed'
            AND DATE(l.starts_at) BETWEEN :from AND :to AND pr.code IN ('icube-robots','zebra') GROUP BY l.project_id_snapshot`, period),
        createSiteRentService(connection).report(period, context),
        createPartnerSettlements(connection).preview({ ...period, projectId: zebra.id }),
        createBudgetEntries(connection).list(period, context),
      ]);
      return calculateDirectorBudget({ period, projects, financialRows, rent, partner, entries });
  }
  return { get, monthly };
}
