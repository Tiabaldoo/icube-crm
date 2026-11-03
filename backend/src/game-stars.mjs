import { ApiProblem } from './catalog.mjs';
import { scopedIdempotencyKey } from './idempotency.mjs';
import { partnerProjectId } from './project-scope.mjs';

// Бонусные звёзды от сотрудников (GAME_PLAN.md, раздел 5, решения Т4, Т5, Т7).
// CRM проверяет право и границы доступа, пишет audit_log и передаёт бонус игре; баланс и журнал
// хранит и считает только игра. Сотрудник не может задать баланс: только выдать или отозвать бонус.
const TEACHER_RECENT_DAYS = 60;
const CONFIRM_ABOVE = 3;
const MARK_BATCH = 500;
const MAX_REASON = 500;

const identifier = (value, name) => {
  const result = String(value ?? '').trim();
  if (!/^[1-9]\d{0,19}$/.test(result)) throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректный ${name}`);
  return result;
};
const hasRole = (context, role) => (context.roles ?? []).includes(role);
// Игра могла успеть записать операцию до обрыва: повтор с тем же ключом её не задвоит.
const unavailable = () => new ApiProblem(503, 'GAME_UNAVAILABLE', 'Игра временно недоступна или не ответила вовремя. Повторите позже — бонус не задвоится');

function reasonOf(value) {
  const reason = typeof value === 'string' ? value.trim() : '';
  if (reason.length < 3 || reason.length > MAX_REASON) throw new ApiProblem(400, 'VALIDATION_ERROR', `Причина: от 3 до ${MAX_REASON} символов`);
  return reason;
}

export function createGameStars(pool, { client, maxStars = 10, logger = console }) {
  // Т5: директор — все дети; партнёр — дети своего проекта; преподаватель — дети групп, где он
  // основной преподаватель, и дети занятий, которые он фактически вёл за последние 60 дней.
  // Одна проверка и для одной операции, и для пометки списка детей преподавателя: ids → множество доступных.
  async function allowedChildIds(context, childIds) {
    const ids = [...new Set(childIds.map(String))];
    if (!ids.length) return new Set();
    if (hasRole(context, 'director')) return new Set(ids);
    const allowed = new Set();
    if (hasRole(context, 'partner')) {
      // Партнёр без единственного проекта не получает его границ, но как преподаватель проверяется ниже.
      let projectId = null;
      try { projectId = partnerProjectId(context); } catch (error) { if (!hasRole(context, 'teacher')) throw error; }
      const [rows] = projectId ? await pool.query(`SELECT DISTINCT child_id FROM child_enrollments WHERE child_id IN (:ids) AND project_id=:projectId
        AND superseded_at IS NULL`, { ids, projectId }) : [[]];
      for (const row of rows) allowed.add(String(row.child_id));
    }
    if (hasRole(context, 'teacher')) {
      const teacherId = context.teacherId ? identifier(context.teacherId, 'teacherId') : await teacherOf(context);
      if (teacherId) {
        const [rows] = await pool.query(`SELECT e.child_id FROM group_memberships gm
            JOIN child_enrollments e ON e.id=gm.enrollment_id JOIN study_groups g ON g.id=gm.group_id
          WHERE e.child_id IN (:ids) AND e.superseded_at IS NULL AND g.default_teacher_id=:teacherId AND g.deleted_at IS NULL
            AND (gm.ended_on IS NULL OR gm.ended_on>=CURRENT_DATE())
          UNION
          SELECT a.child_id FROM attendances a JOIN lessons l ON l.id=a.lesson_id
          WHERE a.child_id IN (:ids) AND l.actual_teacher_id=:teacherId AND l.deleted_at IS NULL
            AND l.status IN ('in_progress','completed') AND l.starts_at>=NOW(6) - INTERVAL ${TEACHER_RECENT_DAYS} DAY
          UNION
          SELECT r.child_id FROM lesson_roster_members r JOIN lessons l ON l.id=r.lesson_id
          WHERE r.child_id IN (:ids) AND l.actual_teacher_id=:teacherId AND l.deleted_at IS NULL
            AND l.status IN ('in_progress','completed') AND l.starts_at>=NOW(6) - INTERVAL ${TEACHER_RECENT_DAYS} DAY`, { ids, teacherId });
        for (const row of rows) allowed.add(String(row.child_id));
      }
    }
    return allowed;
  }

  const inScope = async (context, childId) => (await allowedChildIds(context, [childId])).has(String(childId));

  // Только при включённой игре: преподаватель получает в GET /children признак gameStars у тех детей,
  // которым он вправе выдавать звёзды. Это подсказка интерфейсу, а не разрешение: каждая операция
  // заново проходит scopedChild. Директор и партнёр узнают об игре своим блоком, их список не меняется.
  async function markChildren(children, context = {}) {
    if (!hasRole(context, 'teacher') || hasRole(context, 'director') || hasRole(context, 'partner') || !Array.isArray(children)) return children;
    const allowed = new Set();
    // Сбой пометки не должен ломать список детей: без признака кнопки просто не будет.
    try {
      for (let index = 0; index < children.length; index += MARK_BATCH) {
        for (const id of await allowedChildIds(context, children.slice(index, index + MARK_BATCH).map((child) => child.id))) allowed.add(id);
      }
    } catch (error) {
      logger.error(`Признак звёзд в списке детей не добавлен: ${error?.code ?? error?.message}`);
      return children;
    }
    return children.map((child) => (allowed.has(String(child.id)) ? { ...child, gameStars: true } : child));
  }

  async function teacherOf(context) {
    if (!context.userId) return null;
    const [rows] = await pool.query('SELECT id FROM teachers WHERE user_id=:userId AND deleted_at IS NULL AND active=TRUE', { userId: context.userId });
    return rows[0] ? String(rows[0].id) : null;
  }

  async function scopedChild(rawChildId, context) {
    if (!['director', 'partner', 'teacher'].some((role) => hasRole(context, role))) throw new ApiProblem(403, 'FORBIDDEN', 'Звёзды игры недоступны');
    const childId = identifier(rawChildId, 'childId');
    const [children] = await pool.query('SELECT id FROM children WHERE id=:childId AND deleted_at IS NULL', { childId });
    // Чужому сотруднику не сообщаем, существует ли ребёнок.
    if (!children.length) throw new ApiProblem(hasRole(context, 'director') ? 404 : 403, hasRole(context, 'director') ? 'NOT_FOUND' : 'FORBIDDEN', 'Ребёнок недоступен');
    if (!await inScope(context, childId)) throw new ApiProblem(403, 'FORBIDDEN', 'Ребёнок вне вашей зоны доступа');
    return childId;
  }

  function fromGame(result) {
    if (result.ok) return result.data;
    if (result.unavailable) throw unavailable();
    throw new ApiProblem(result.status, result.code, result.message ?? 'Игра отклонила операцию');
  }

  async function authorNames(ids) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return new Map();
    const [rows] = await pool.query('SELECT id,display_name FROM users WHERE id IN (:ids)', { ids: unique });
    return new Map(rows.map((row) => [String(row.id), row.display_name]));
  }

  // Ответ строится из данных игры: браузер ничего не подставляет, права на отзыв считает CRM.
  async function present(data, context) {
    const bonuses = data.bonuses ?? [];
    const names = await authorNames(bonuses.flatMap((bonus) => [bonus.createdByUserId, bonus.revoked?.byUserId]));
    const director = hasRole(context, 'director');
    return {
      wallet: data.wallet, entries: data.entries ?? [], maxStars, confirmAbove: CONFIRM_ABOVE,
      bonuses: bonuses.map((bonus) => ({
        ...bonus, createdByName: names.get(bonus.createdByUserId) ?? null,
        revoked: bonus.revoked ? { ...bonus.revoked, byName: names.get(bonus.revoked.byUserId) ?? null } : null,
        canRevoke: !bonus.revoked && (director || bonus.createdByUserId === String(context.userId)),
      })),
    };
  }

  async function summary(rawChildId, context = {}) {
    const childId = await scopedChild(rawChildId, context);
    const result = await client.stars(childId);
    if (!result.ok && result.code === 'GAME_PROFILE_MISSING') return { profile: false, maxStars, confirmAbove: CONFIRM_ABOVE };
    return { profile: true, ...await present(fromGame(result), context) };
  }

  // Бонус уже записан в игре вместе с автором, причиной и временем: сбой журнала CRM не должен
  // выглядеть для сотрудника как невыданный бонус (повтор ничего бы не добавил).
  // Запись одна на бонус и действие: повтор после обрыва связи дописывает её, если первой не было.
  async function audit(action, actorId, childId, data) {
    try {
      const [existing] = await pool.query(`SELECT id FROM audit_log WHERE entity_type='child' AND entity_id=:childId AND action=:action
        AND JSON_UNQUOTE(JSON_EXTRACT(after_data,'$.bonusId'))=:bonusId LIMIT 1`, { childId, action, bonusId: String(data.bonusId) });
      if (existing.length) return;
      await pool.query(`INSERT INTO audit_log (actor_user_id,action,entity_type,entity_id,before_data,after_data)
        VALUES (:actorId,:action,'child',:childId,NULL,:after)`, { actorId: actorId ?? null, action, childId, after: JSON.stringify(data) });
    } catch (error) {
      logger.error(`Не записан audit_log ${action} для ребёнка ${childId}: ${error?.code ?? error?.message}`);
    }
  }

  // Итог после операции: если игра успела стать недоступной, сама операция всё равно выполнена.
  async function after(result, childId, context) {
    try { return { ...result, ...await summary(childId, context) }; } catch (error) {
      if (error?.code !== 'GAME_UNAVAILABLE') throw error;
      return { ...result, profile: true, stale: true };
    }
  }

  async function grant(rawChildId, body = {}, context = {}) {
    const childId = await scopedChild(rawChildId, context);
    const amount = body?.amount;
    if (!Number.isInteger(amount) || amount < 1 || amount > maxStars) throw new ApiProblem(400, 'VALIDATION_ERROR', `Количество звёзд: от 1 до ${maxStars}`);
    const reason = reasonOf(body?.reason);
    // Т7: больше трёх звёзд — только с явным подтверждением.
    if (amount > CONFIRM_ABOVE && body?.confirmed !== true) throw new ApiProblem(409, 'GAME_BONUS_CONFIRMATION_REQUIRED', `Подтвердите бонус больше ${CONFIRM_ABOVE} звёзд`);
    const requestKey = scopedIdempotencyKey({ key: context.idempotencyKey, actorUserId: context.userId, operation: 'game_bonus', entity: childId });
    const data = fromGame(await client.grantBonus({ childId, amount, reason, actorUserId: String(context.userId), requestKey }));
    // Повтор того же запроса бонус не создаёт, второй записи в журнал CRM тоже нет.
    await audit('game_stars.bonus', data.bonus.createdByUserId, childId, { bonusId: data.bonus.id, amount: data.bonus.amount, reason: data.bonus.reason });
    return after({ bonus: data.bonus, replayed: data.replayed }, childId, context);
  }

  async function revoke(rawChildId, rawBonusId, body = {}, context = {}) {
    const childId = await scopedChild(rawChildId, context);
    const bonusId = identifier(rawBonusId, 'bonusId');
    const reason = reasonOf(body?.reason);
    const data = fromGame(await client.revokeBonus(bonusId, {
      childId, actorUserId: String(context.userId), actorIsDirector: hasRole(context, 'director'), reason,
    }));
    // Автор и причина — из записи игры: повтор другим сотрудником не подменяет того, кто отозвал.
    await audit('game_stars.bonus_revoke', data.bonus.revoked?.byUserId ?? context.userId, childId,
      { bonusId, amount: data.bonus.amount, reason: data.bonus.revoked?.reason ?? reason });
    return after({ bonus: data.bonus, replayed: data.replayed }, childId, context);
  }

  return { summary, grant, revoke, markChildren };
}
