import { ApiProblem } from './catalog.mjs';
import { BUSINESS_UTC_OFFSET } from '../../src/shared/business-time.mjs';

// Данные для звёзд игры (GAME_PLAN.md, раздел 4, этап 4): только чтение, без денег, имён и родителей.
// Игра сверяет полный список засчитанных посещений с журналом, поэтому CRM отдаёт текущее состояние,
// а не события: исправления, удаления и поздняя офлайн-синхронизация видны сами собой.
const ID = /^[1-9]\d{0,19}$/;
const MAX_BATCH = 200;

const identifier = (value) => {
  const result = String(value ?? '').trim();
  if (!ID.test(result)) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Некорректный childId');
  return result;
};
const bool = (value) => value === true || value === 1 || value === '1';
// starts_at читается в поясе соединения (+11:00): это время и дата по Сахалину.
const isoStartsAt = (value) => `${String(value).slice(0, 10)}T${String(value).slice(11, 19)}${BUSINESS_UTC_OFFSET}`;

export function createGameAttendance(pool) {
  // Засчитано (GAME_PLAN.md, правило 3): присутствовал, занятие завершено, не удалено и не пустой выезд.
  // Ознакомительные посещения тоже в списке: без них не проверить Т1 и Т2. Решает игра.
  async function qualifyingAttendance(rawChildId) {
    const childId = identifier(rawChildId);
    const [children] = await pool.query('SELECT id FROM children WHERE id=:childId AND deleted_at IS NULL', { childId });
    if (!children.length) return { exists: false, attendances: [] };
    const [rows] = await pool.query(`SELECT a.id attendance_id,a.lesson_id,a.attendance_type,a.is_trial,l.is_intro_group,l.starts_at,
        DATE_FORMAT(l.starts_at,'%Y-%m-%d') lesson_date
      FROM attendances a JOIN lessons l ON l.id=a.lesson_id
      WHERE a.child_id=:childId AND a.present=TRUE AND l.status='completed' AND l.deleted_at IS NULL AND l.is_empty_trip=FALSE
      ORDER BY l.starts_at,a.id`, { childId });
    return {
      exists: true,
      attendances: rows.map((row) => ({
        attendanceId: String(row.attendance_id), lessonId: String(row.lesson_id), lessonDate: String(row.lesson_date),
        startsAt: isoStartsAt(row.starts_at), attendanceType: row.attendance_type,
        isTrial: bool(row.is_trial), isIntroLesson: bool(row.is_intro_group),
      })),
    };
  }

  // Для фоновой сверки: какие дети ещё есть в CRM. Удалённых игра не сверяет, их прогресс хранится (Т6).
  async function childrenStatus(rawIds) {
    const ids = [...new Set(String(rawIds ?? '').split(',').map((value) => value.trim()).filter(Boolean))];
    if (!ids.length || ids.length > MAX_BATCH || !ids.every((id) => ID.test(id))) {
      throw new ApiProblem(400, 'VALIDATION_ERROR', `Нужно от 1 до ${MAX_BATCH} id детей`);
    }
    const [rows] = await pool.query('SELECT id,status FROM children WHERE id IN (:ids) AND deleted_at IS NULL', { ids });
    const found = new Map(rows.map((row) => [String(row.id), row.status]));
    return { children: ids.map((childId) => (found.has(childId)
      ? { childId, exists: true, status: found.get(childId) }
      : { childId, exists: false, status: null })) };
  }

  return { qualifyingAttendance, childrenStatus };
}
