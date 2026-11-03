import { createHash } from 'node:crypto';
import { StarProblem } from './star-errors.mjs';
import { InvalidAttendanceList, STAR_RULES, applyToWallet, parseQualifyingAttendance, planReconciliation, visibleBalance } from './star-rules.mjs';

// Журнал звёзд (GAME_PLAN.md, раздел 5). Каждая операция — одна транзакция под блокировкой
// кошелька ребёнка: запись в журнал и итог кошелька меняются вместе. Журнал только дополняется.
const ID = /^[1-9]\d{0,19}$/;
const REQUEST_KEY = /^[0-9a-f]{64}$/;
const ITEM_CODE = /^[a-z0-9_.-]{1,64}$/;
const MAX_REASON = 500;
const RECENT_ENTRIES = 50;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const invalid = (message) => new StarProblem(400, 'VALIDATION_ERROR', message);

function childIdOf(value) {
  const childId = String(value ?? '');
  if (!ID.test(childId)) throw invalid('Некорректный childId');
  return childId;
}

function reasonOf(value) {
  const reason = typeof value === 'string' ? value.trim() : '';
  if (reason.length < 3 || reason.length > MAX_REASON) throw invalid(`Причина: от 3 до ${MAX_REASON} символов`);
  return reason;
}

async function apply(tx, wallet, entry, now) {
  await tx.insertEntry({ ...entry, now });
  return applyToWallet(wallet, entry.amount);
}

const entryView = (entry) => ({
  id: entry.id, kind: entry.kind, amount: entry.amount, attendanceId: entry.attendanceId, bonusId: entry.bonusId,
  itemCode: entry.itemCode, createdAt: new Date(entry.createdAt).toISOString(),
});
const bonusView = (bonus) => ({
  id: bonus.id, childId: bonus.childId, amount: bonus.amount, reason: bonus.reason, createdByUserId: bonus.createdByUserId,
  createdAt: new Date(bonus.createdAt).toISOString(),
  revoked: bonus.revokedAt != null ? { at: new Date(bonus.revokedAt).toISOString(), byUserId: bonus.revokedByUserId, reason: bonus.revokeReason } : null,
});
// Ребёнок видит только неотрицательный баланс; долг виден сотрудникам, чтобы им было понятно, куда делись звёзды.
const walletView = (wallet) => ({ balance: visibleBalance(wallet), chest: wallet.chest, debt: Math.max(0, -wallet.balance) });

export function createStars({ store, crm, now = () => Date.now(), rules = STAR_RULES, logger = console }) {
  // Сверки одного ребёнка в этом процессе идут по очереди: иначе более старый ответ CRM мог бы
  // примениться после нового и на время откатить исправление.
  const reconciling = new Map();

  async function reconcileNow(childId) {
    const profile = await store.getProfile(childId);
    if (!profile) return { status: 'no_profile', added: 0 };
    const result = await crm.qualifyingAttendance(childId);
    if (!result.ok) {
      if (!result.unavailable) logger.error(`Сверка звёзд: CRM отклонила запрос ${result.status} ${result.code ?? ''}`.trim());
      return { status: 'crm_unavailable', added: 0 };
    }
    let list;
    try { list = parseQualifyingAttendance(result.data); } catch (error) {
      if (!(error instanceof InvalidAttendanceList)) throw error;
      logger.error(`Сверка звёзд для ребёнка ${childId} пропущена: ответ CRM некорректен (${error.message})`);
      return { status: 'invalid_response', added: 0 };
    }
    // Ребёнка удалили из CRM: его посещения удалены вместе с ним, но игровой прогресс сохраняется (Т6).
    if (!list.exists) return { status: 'child_missing', added: 0 };
    return store.starTransaction(childId, async (tx) => {
      const ops = planReconciliation({ childId, earningSince: profile.firstAccessOn, attendances: list.attendances, entries: await tx.entries(), rules });
      if (!ops.length) return { status: 'ok', added: 0 };
      const time = now();
      let wallet = await tx.wallet();
      for (const op of ops) wallet = await apply(tx, wallet, op, time);
      await tx.setWallet({ ...wallet, now: time });
      return { status: 'ok', added: ops.length };
    });
  }

  function reconcile(rawChildId) {
    const childId = childIdOf(rawChildId);
    const previous = reconciling.get(childId) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(() => reconcileNow(childId));
    reconciling.set(childId, current);
    current.finally(() => { if (reconciling.get(childId) === current) reconciling.delete(childId); }).catch(() => {});
    return current;
  }

  async function grantBonus({ childId: rawChildId, amount, reason: rawReason, actorUserId, requestKey }) {
    const childId = childIdOf(rawChildId);
    if (!Number.isInteger(amount) || amount < 1 || amount > rules.bonusMaxStars) throw invalid(`Количество звёзд: от 1 до ${rules.bonusMaxStars}`);
    const reason = reasonOf(rawReason);
    const actor = String(actorUserId ?? '');
    if (!ID.test(actor)) throw invalid('Некорректный автор бонуса');
    if (!REQUEST_KEY.test(String(requestKey ?? ''))) throw invalid('Некорректный ключ идемпотентности');
    const requestHash = sha256(JSON.stringify([childId, amount, reason, actor]));
    const attempt = () => store.starTransaction(childId, async (tx) => {
      const existing = await tx.findBonusByKey(requestKey);
      if (existing) {
        if (existing.requestHash !== requestHash) throw new StarProblem(409, 'IDEMPOTENCY_CONFLICT', 'Этот ключ уже использован для другого бонуса');
        return { bonus: bonusView(existing), wallet: walletView(await tx.wallet()), replayed: true };
      }
      const time = now();
      const bonusId = await tx.insertBonus({ amount, reason, createdByUserId: actor, requestKey, requestHash, now: time });
      const wallet = await apply(tx, await tx.wallet(), { kind: 'staff_bonus', amount, bonusId, idempotencyKey: `bonus:${bonusId}` }, time);
      await tx.setWallet({ ...wallet, now: time });
      return { bonus: bonusView(await tx.getBonus(bonusId)), wallet: walletView(wallet), replayed: false };
    });
    try { return await attempt(); } catch (error) {
      // Тот же ключ одновременно прислали для другого ребёнка: после отката повтор найдёт чужой бонус и ответит конфликтом.
      if (error?.code !== 'ER_DUP_ENTRY') throw error;
      return attempt();
    }
  }

  // Отозвать может автор или директор (Т5); бонус не удаляется, отзыв — отдельная запись.
  async function revokeBonus({ childId: rawChildId, bonusId: rawBonusId, actorUserId, actorIsDirector = false, reason: rawReason }) {
    const childId = childIdOf(rawChildId);
    const bonusId = String(rawBonusId ?? '');
    if (!ID.test(bonusId)) throw invalid('Некорректный bonusId');
    const actor = String(actorUserId ?? '');
    if (!ID.test(actor)) throw invalid('Некорректный автор отзыва');
    const reason = reasonOf(rawReason);
    return store.starTransaction(childId, async (tx) => {
      const bonus = await tx.getBonus(bonusId);
      if (!bonus || bonus.childId !== childId) throw new StarProblem(404, 'GAME_BONUS_NOT_FOUND', 'Бонус не найден');
      if (bonus.createdByUserId !== actor && actorIsDirector !== true) throw new StarProblem(403, 'GAME_BONUS_REVOKE_FORBIDDEN', 'Отозвать бонус может его автор или директор');
      if (bonus.revokedAt != null) return { bonus: bonusView(bonus), wallet: walletView(await tx.wallet()), replayed: true };
      const time = now();
      await tx.insertRevoke({ bonusId, revokedByUserId: actor, reason, now: time });
      const wallet = await apply(tx, await tx.wallet(), { kind: 'staff_bonus_revoke', amount: -bonus.amount, bonusId, idempotencyKey: `bonus_revoke:${bonusId}` }, time);
      await tx.setWallet({ ...wallet, now: time });
      return { bonus: bonusView(await tx.getBonus(bonusId)), wallet: walletView(wallet), replayed: false };
    });
  }

  // Т10: открытие сундука переносит звёзды на баланс. Сумма журнала не меняется.
  async function openChest(rawChildId) {
    const childId = childIdOf(rawChildId);
    return store.starTransaction(childId, async (tx) => {
      const wallet = await tx.wallet();
      if (wallet.chest === 0) return { opened: 0, wallet: walletView(wallet) };
      const time = now();
      await tx.insertChestOpen({ amount: wallet.chest, now: time });
      const next = { balance: wallet.balance + wallet.chest, chest: 0 };
      await tx.setWallet({ ...next, now: time });
      return { opened: wallet.chest, wallet: walletView(next) };
    });
  }

  // Списание в игре (магазин — этап 5): только если внутреннего баланса хватает, в долг нельзя.
  // Проверка и запись — в одной транзакции, повтор с тем же ключом ничего не списывает.
  async function purchase({ childId: rawChildId, itemCode, price, requestKey }) {
    const childId = childIdOf(rawChildId);
    if (!ITEM_CODE.test(String(itemCode ?? ''))) throw invalid('Некорректный предмет');
    if (!Number.isInteger(price) || price < 1) throw invalid('Некорректная цена');
    if (!REQUEST_KEY.test(String(requestKey ?? ''))) throw invalid('Некорректный ключ идемпотентности');
    const idempotencyKey = `purchase:${childId}:${requestKey}`;
    return store.starTransaction(childId, async (tx) => {
      const existing = await tx.findEntryByKey(idempotencyKey);
      if (existing) {
        if (existing.itemCode !== itemCode || existing.amount !== -price) throw new StarProblem(409, 'IDEMPOTENCY_CONFLICT', 'Этот ключ уже использован для другой покупки');
        return { replayed: true, wallet: walletView(await tx.wallet()) };
      }
      const wallet = await tx.wallet();
      if (wallet.balance < price) throw new StarProblem(409, 'INSUFFICIENT_STARS', 'Не хватает звёзд');
      const time = now();
      const next = await apply(tx, wallet, { kind: 'purchase', amount: -price, itemCode, idempotencyKey }, time);
      await tx.setWallet({ ...next, now: time });
      return { replayed: false, wallet: walletView(next) };
    });
  }

  async function summary(rawChildId, { includeBonuses = false } = {}) {
    const childId = childIdOf(rawChildId);
    return store.starTransaction(childId, async (tx) => {
      const entries = await tx.entries();
      return {
        wallet: walletView(await tx.wallet()),
        entries: entries.slice(-RECENT_ENTRIES).reverse().map(entryView),
        ...(includeBonuses ? { bonuses: (await tx.bonuses()).reverse().map(bonusView) } : {}),
      };
    });
  }

  return { reconcile, grantBonus, revokeBonus, openChest, purchase, summary };
}
