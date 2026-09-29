import { ApiProblem } from './catalog.mjs';
import { lessonUnits, moneyCents, moneyDecimal } from './lesson-rules.mjs';

const percentScale = 1000000n; // 100% with four decimal places.
const rounded = (value, divisor) => (value + divisor / 2n) / divisor;
export function shareUnits(value) {
  const match = String(value ?? '0').match(/^(\d{1,3})(?:\.(\d{1,4}))?$/);
  if (!match) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Доля должна быть от 0 до 100%, не более четырёх знаков после запятой');
  const units = BigInt(match[1]) * 10000n + BigInt((match[2] ?? '').padEnd(4, '0'));
  if (units > percentScale) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Доля должна быть от 0 до 100%');
  return units;
}
export function packageUnitPrice(price, count = 4) {
  if (!Number.isInteger(Number(count)) || Number(count) < 1 || Number(count) > 1000) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Размер пакета должен быть целым числом от 1 до 1000');
  const cents = moneyCents(price);
  if (cents <= 0n) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Цена пакета должна быть больше нуля');
  const result = rounded(cents, BigInt(count));
  if (result <= 0n) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Цена занятия должна быть не меньше копейки');
  return moneyDecimal(result);
}
export function attendanceShares(price, lessons, settings) {
  const gross = rounded(moneyCents(price) * lessonUnits(lessons), 100000000n);
  const teacherRate = shareUnits(settings.teacherSharePercent ?? settings.teacher_share_percent_snapshot);
  const partnerRate = shareUnits(settings.partnerSharePercent ?? settings.partner_share_percent_snapshot);
  if (teacherRate + partnerRate > percentScale) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Сумма долей преподавателя и партнёра не должна превышать 100%');
  const teacher = rounded(gross * teacherRate, percentScale);
  const partner = rounded(gross * partnerRate, percentScale);
  const taxEnabled = Boolean(settings.customTaxEnabled ?? settings.custom_tax_enabled_snapshot);
  if (taxEnabled && settings.taxPercent == null && settings.tax_percent_snapshot == null) throw new ApiProblem(409, 'TAX_RATE_NOT_CONFIGURED', 'Для долевого расчёта не настроена историческая налоговая ставка проекта');
  const tax = taxEnabled ? rounded(gross * shareUnits(settings.taxPercent ?? settings.tax_percent_snapshot), percentScale) : 0n;
  return { gross: moneyDecimal(gross), teacher: moneyDecimal(teacher), partner: moneyDecimal(partner), tax: moneyDecimal(tax), icube: moneyDecimal(gross - teacher - partner - tax) };
}
export function groupSlots(group) {
  let extra = group.scheduleSlots ?? group.schedule_slots ?? [];
  if (typeof extra === 'string') extra = JSON.parse(extra);
  return [{ weekday: Number(group.weekday), startTime: String(group.startTime ?? group.start_time).slice(0, 5), endTime: String(group.endTime ?? group.end_time).slice(0, 5) }, ...extra];
}
export function validateGroupSettings(body, current, primary) {
  const value = {
    isIndividual: body.isIndividual ?? current.isIndividual ?? false,
    packageLessonCount: Number(body.packageLessonCount ?? current.packageLessonCount ?? 4),
    calculationMode: body.calculationMode ?? current.calculationMode ?? 'standard',
    teacherSharePercent: String(body.teacherSharePercent ?? current.teacherSharePercent ?? '0'),
    partnerSharePercent: String(body.partnerSharePercent ?? current.partnerSharePercent ?? '0'),
    customTaxEnabled: body.customTaxEnabled ?? current.customTaxEnabled ?? false,
    scheduleSlots: body.scheduleSlots ?? current.scheduleSlots ?? [],
  };
  if (typeof value.isIndividual !== 'boolean' || typeof value.customTaxEnabled !== 'boolean') throw new ApiProblem(400, 'VALIDATION_ERROR', 'Некорректные настройки группы');
  if (value.isIndividual && primary.isMixed) throw new ApiProblem(400, 'INDIVIDUAL_MIXED_NOT_ALLOWED', 'Индивидуальная группа должна иметь одно направление');
  if (!['standard', 'attendance_share'].includes(value.calculationMode) || (value.calculationMode === 'attendance_share' && !value.isIndividual)) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Долевой расчёт доступен только индивидуальной группе');
  if (!Number.isInteger(value.packageLessonCount) || value.packageLessonCount < 1 || value.packageLessonCount > 1000) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Размер пакета должен быть целым числом от 1 до 1000');
  if (shareUnits(value.teacherSharePercent) + shareUnits(value.partnerSharePercent) > percentScale) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Сумма долей не должна превышать 100%');
  if (!Array.isArray(value.scheduleSlots) || value.scheduleSlots.length > 20) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Некорректные дополнительные слоты');
  value.scheduleSlots = value.scheduleSlots.map((slot) => ({ weekday: Number(slot.weekday), startTime: slot.startTime, endTime: slot.endTime }));
  const slots = groupSlots({ ...primary, scheduleSlots: value.scheduleSlots });
  for (const slot of slots) {
    if (!Number.isInteger(slot.weekday) || slot.weekday < 1 || slot.weekday > 7 || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(slot.startTime) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(slot.endTime) || slot.endTime <= slot.startTime) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Окончание слота должно быть позже начала');
  }
  if (slots.some((slot, index) => slots.slice(0, index).some((other) => other.weekday === slot.weekday && other.startTime < slot.endTime && slot.startTime < other.endTime))) throw new ApiProblem(400, 'SCHEDULE_SLOT_OVERLAP', 'Слоты расписания не должны пересекаться');
  return value;
}

// The group lock serializes every membership writer, including atomic direction/project changes.
export async function assertGroupCapacity(connection, groupId, { childId = null, enrollmentId = null } = {}) {
  if (groupId == null) return;
  const [groups] = await connection.query('SELECT id,is_individual FROM study_groups WHERE id=:groupId FOR UPDATE', { groupId });
  if (!groups.length) throw new ApiProblem(404, 'NOT_FOUND', 'Группа не найдена');
  if (!groups[0].is_individual) return;
  const [members] = await connection.query(`SELECT e.child_id FROM group_memberships gm JOIN child_enrollments e ON e.id=gm.enrollment_id
    WHERE gm.group_id=:groupId AND gm.ended_on IS NULL AND e.superseded_at IS NULL AND e.status IN ('active','paused')
      AND (:childId IS NULL OR e.child_id<>:childId) AND (:enrollmentId IS NULL OR e.id<>:enrollmentId) FOR UPDATE`, { groupId, childId, enrollmentId });
  if (members.length) throw new ApiProblem(409, 'INDIVIDUAL_GROUP_FULL', 'В индивидуальной группе может быть только один текущий ребёнок');
}
