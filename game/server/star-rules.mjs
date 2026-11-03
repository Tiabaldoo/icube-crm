// Правила звёзд за посещения (GAME_PLAN.md, разделы 5, 13 и решения Т1–Т3, Т10). Только чистые функции.
//
// Сверка идёт по состоянию, а не по событиям: CRM отдаёт полный список засчитанных посещений
// ребёнка, игра сравнивает его с журналом и записывает только разницу. Поэтому повторное завершение,
// исправление задним числом, удаление занятия и поздняя офлайн-синхронизация обрабатываются одинаково,
// а повторная сверка ничего не добавляет.

// Числа — из конфигурации игры (Island of Oddballs, CONFIG.rewards.lessonStars), новых не придумываем.
// ×2 после ознакомительного — вторая половина двойного начисления, то есть ещё lessonStars.
export const STAR_RULES = Object.freeze({ lessonStars: 3, trialFollowupStars: 3, bonusMaxStars: 10 });

export const STAR_KINDS = Object.freeze([
  'attendance', 'attendance_reversal', 'trial_followup_bonus', 'trial_followup_reversal', 'staff_bonus', 'staff_bonus_revoke', 'purchase',
]);
const ATTENDANCE_KINDS = new Set(['attendance', 'attendance_reversal']);
const FOLLOWUP_KINDS = new Set(['trial_followup_bonus', 'trial_followup_reversal']);

const ID = /^[1-9]\d{0,19}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class InvalidAttendanceList extends Error {}

// Ответ CRM проверяется целиком: неполный список нельзя принимать, иначе сверка отозвала бы честные звёзды.
export function parseQualifyingAttendance(data) {
  if (!data || typeof data !== 'object' || typeof data.exists !== 'boolean') throw new InvalidAttendanceList('нет поля exists');
  if (!data.exists) return { exists: false, attendances: [] };
  if (!Array.isArray(data.attendances)) throw new InvalidAttendanceList('нет списка посещений');
  const seen = new Set();
  const attendances = data.attendances.map((item) => {
    const attendanceId = String(item?.attendanceId ?? '');
    if (!ID.test(attendanceId) || seen.has(attendanceId)) throw new InvalidAttendanceList('некорректный attendanceId');
    seen.add(attendanceId);
    if (!DAY.test(String(item.lessonDate)) || typeof item.startsAt !== 'string' || Number.isNaN(Date.parse(item.startsAt))) throw new InvalidAttendanceList('некорректная дата');
    if (typeof item.isTrial !== 'boolean' || typeof item.isIntroLesson !== 'boolean') throw new InvalidAttendanceList('некорректный признак пробного');
    return { attendanceId, lessonDate: item.lessonDate, startsAt: Date.parse(item.startsAt), trial: item.isTrial || item.isIntroLesson };
  });
  return { exists: true, attendances };
}

const byTime = (a, b) => a.startsAt - b.startsAt || (BigInt(a.attendanceId) < BigInt(b.attendanceId) ? -1 : 1);

// Цели сверки: сколько звёзд должно числиться за каждое посещение и где сейчас бонус ×2.
export function starTargets({ earningSince, attendances, rules = STAR_RULES }) {
  const base = new Map();
  for (const item of attendances) {
    // Граница — начало дня первого доступа по Сахалину: занятие в этот день засчитывается (Т3).
    base.set(item.attendanceId, !item.trial && item.lessonDate >= earningSince ? rules.lessonStars : 0);
  }
  // ×2 — только если самое первое в истории CRM обычное посещение было после earning_since (Т1)
  // и ему предшествовало ознакомительное, даже до доступа (Т2). Один раз на ребёнка за всё время.
  const ordered = [...attendances].sort(byTime);
  const firstRegularIndex = ordered.findIndex((item) => !item.trial);
  const first = ordered[firstRegularIndex];
  const followup = first && first.lessonDate >= earningSince && ordered.slice(0, firstRegularIndex).some((item) => item.trial)
    ? first.attendanceId : null;
  return { base, followup };
}

const sumBy = (entries, kinds, key) => {
  const totals = new Map();
  for (const entry of entries) {
    if (!kinds.has(entry.kind) || entry[key] == null) continue;
    totals.set(String(entry[key]), (totals.get(String(entry[key])) ?? 0) + entry.amount);
  }
  return totals;
};

// План записей: разница «цель − факт» по каждому посещению и по бонусу ×2.
// Ключи — с ребёнком и номером записи для этого посещения: ключ уникален на всю таблицу, а номера посещений
// у разных детей могут совпадать (пересоздание базы CRM, тестовые данные). Уникальный ключ не даст
// второй сверке, начатой с тем же журналом, записать то же самое ещё раз.
export function planReconciliation({ childId, earningSince, attendances, entries, rules = STAR_RULES }) {
  const { base, followup } = starTargets({ earningSince, attendances, rules });
  const facts = sumBy(entries, ATTENDANCE_KINDS, 'attendanceId');
  const followupFacts = sumBy(entries, FOLLOWUP_KINDS, 'attendanceId');
  const counts = new Map();
  for (const entry of entries) if (ATTENDANCE_KINDS.has(entry.kind)) counts.set(String(entry.attendanceId), (counts.get(String(entry.attendanceId)) ?? 0) + 1);
  let followupCount = entries.filter((entry) => FOLLOWUP_KINDS.has(entry.kind)).length;

  const ops = [];
  const ids = [...new Set([...base.keys(), ...facts.keys()])].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0));
  for (const attendanceId of ids) {
    const diff = (base.get(attendanceId) ?? 0) - (facts.get(attendanceId) ?? 0);
    if (!diff) continue;
    const n = (counts.get(attendanceId) ?? 0) + 1;
    counts.set(attendanceId, n);
    ops.push({ kind: diff > 0 ? 'attendance' : 'attendance_reversal', amount: diff, attendanceId, idempotencyKey: `att:${childId}:${attendanceId}:${n}` });
  }
  // Сначала отзыв с прежнего посещения, потом начисление на новое: в сумме ×2 не больше одного раза.
  const followupIds = [...new Set([...followupFacts.keys(), ...(followup ? [followup] : [])])];
  const followupOps = followupIds.map((attendanceId) => ({
    attendanceId, diff: (attendanceId === followup ? rules.trialFollowupStars : 0) - (followupFacts.get(attendanceId) ?? 0),
  })).filter((item) => item.diff).sort((a, b) => a.diff - b.diff);
  for (const { attendanceId, diff } of followupOps) {
    followupCount += 1;
    ops.push({ kind: diff > 0 ? 'trial_followup_bonus' : 'trial_followup_reversal', amount: diff, attendanceId,
      idempotencyKey: `trial_followup:${childId}:${followupCount}` });
  }
  // Отзывы раньше начислений: так звёзды уходят сначала из того, что уже есть, как в Т10.
  return [...ops.filter((op) => op.amount < 0), ...ops.filter((op) => op.amount > 0)];
}

// Т10: начисление попадает в сундук; списание — сначала из неоткрытого сундука, потом с баланса,
// который может уйти в минус. Ребёнок видит max(0, balance).
export function applyToWallet(wallet, amount) {
  if (amount >= 0) return { balance: wallet.balance, chest: wallet.chest + amount };
  const fromChest = Math.min(wallet.chest, -amount);
  return { balance: wallet.balance + amount + fromChest, chest: wallet.chest - fromChest };
}

export const visibleBalance = (wallet) => Math.max(0, wallet.balance);
