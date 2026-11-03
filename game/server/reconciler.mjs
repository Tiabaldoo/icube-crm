// Когда сверять звёзды с CRM (GAME_PLAN.md, раздел 5): фоном раз в 10–15 минут по всем профилям
// и при входе ребёнка в игру, но не чаще раза в минуту на ребёнка.
const MINUTE = 60_000;
export const RECONCILE_LIMITS = Object.freeze({ intervalMs: 12 * MINUTE, perChildMs: MINUTE, pageSize: 100 });
const ID = /^[1-9]\d{0,19}$/;

export function createReconciler({ store, crm, stars, now = () => Date.now(), limits = RECONCILE_LIMITS, logger = console }) {
  const lastRun = new Map();
  let running = null;

  // Для входа и экрана звёзд: сбой CRM не мешает показать то, что уже записано в журнале.
  async function reconcileChild(childId) {
    const time = now();
    if (time - (lastRun.get(childId) ?? -Infinity) < limits.perChildMs) return { status: 'throttled', added: 0 };
    lastRun.set(childId, time);
    try { return await stars.reconcile(childId); } catch (error) {
      lastRun.delete(childId);
      logger.error(`Сверка звёзд для ребёнка ${childId} не удалась: ${error?.code ?? error?.message}`);
      return { status: 'failed', added: 0 };
    }
  }

  async function sweep() {
    let after = '0';
    const totals = { children: 0, added: 0, skipped: 0 };
    for (;;) {
      const ids = await store.listProfileIds({ afterChildId: after, limit: limits.pageSize });
      if (!ids.length) break;
      after = ids.at(-1);
      const statuses = await crm.childrenStatus(ids);
      if (!statuses.ok || !Array.isArray(statuses.data?.children)) {
        logger.error('Фоновая сверка звёзд остановлена: CRM не ответила на статусы детей');
        break;
      }
      const existing = new Set(statuses.data.children.filter((item) => item?.exists === true && ID.test(String(item.childId))).map((item) => String(item.childId)));
      for (const childId of ids) {
        if (!existing.has(childId)) { totals.skipped += 1; continue; }
        lastRun.set(childId, now());
        try {
          const result = await stars.reconcile(childId);
          totals.children += 1; totals.added += result.added;
        } catch (error) {
          logger.error(`Сверка звёзд для ребёнка ${childId} не удалась: ${error?.code ?? error?.message}`);
        }
      }
      if (ids.length < limits.pageSize) break;
    }
    return totals;
  }

  // Один проход за раз: следующий таймер не начинает новый, пока идёт прежний.
  function runSweep() {
    running ??= sweep().catch((error) => { logger.error(`Фоновая сверка звёзд: ${error?.code ?? error?.message}`); return null; })
      .finally(() => { running = null; });
    return running;
  }

  function start() {
    const timer = setInterval(runSweep, limits.intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }

  return { reconcileChild, sweep: runSweep, start };
}
