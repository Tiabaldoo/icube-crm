import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createStars } from '../server/stars.mjs';
import { fakeCrm, silentLogger, visit } from './helpers.mjs';

// Сценарии журнала звёзд для хранилища в памяти и для MySQL (store-*.mjs).
// prefix делает id детей уникальными для запуска, как в store-contract.mjs.
export function starsContract(test, makeStore, { prefix = 0 } = {}) {
  const key = (value) => createHash('sha256').update(`${prefix}:${value}`).digest('hex');
  let next = 100;

  async function setup({ firstAccessOn = '2026-11-01', attendances = [] } = {}) {
    const store = await makeStore();
    const crm = fakeCrm();
    const childId = String(prefix + (next += 1));
    const child = crm.addChild(childId, `child${childId}`, 'pw', { firstAccessOn, attendances });
    await store.insertProfile({ childId, nickname: `Звёзд${prefix}x${next}`, firstAccessOn });
    const logger = silentLogger();
    let time = Date.UTC(2026, 10, 3, 1, 0, 0);
    const stars = createStars({ store, crm: crm.crm, now: () => (time += 1000), logger });
    const read = () => stars.summary(childId, { includeBonuses: true });
    // Инвариант журнала: итог кошелька всегда равен сумме записей.
    async function check() {
      const all = await store.starTransaction(childId, async (tx) => ({ wallet: await tx.wallet(), entries: await tx.entries() }));
      assert.equal(all.wallet.balance + all.wallet.chest, all.entries.reduce((sum, entry) => sum + entry.amount, 0), 'кошелёк = сумма журнала');
      assert.ok(all.wallet.chest >= 0);
      return all;
    }
    return { store, crm, child, childId, stars, read, check, logger };
  }

  test('звёзды: обычное посещение — 3 в сундук, повторная сверка ничего не добавляет', async () => {
    const s = await setup({ attendances: [visit(1, '2026-11-03')] });
    assert.deepEqual(await s.stars.reconcile(s.childId), { status: 'ok', added: 1 });
    for (let i = 0; i < 3; i += 1) assert.deepEqual(await s.stars.reconcile(s.childId), { status: 'ok', added: 0 });
    assert.deepEqual((await s.read()).wallet, { balance: 0, chest: 3, debt: 0 });
    await s.check();
  });

  test('звёзды: пробное — 0, первое платное после него — 6 ровно один раз', async () => {
    const s = await setup({ attendances: [visit(1, '2026-11-02', { trial: true })] });
    await s.stars.reconcile(s.childId);
    assert.equal((await s.read()).wallet.chest, 0);
    s.child.attendances.push(visit(2, '2026-11-03'));
    await s.stars.reconcile(s.childId);
    assert.equal((await s.read()).wallet.chest, 6);
    // Пробное в другом направлении и следующее платное: только обычные 3.
    s.child.attendances.push(visit(3, '2026-11-10', { trial: true }), visit(4, '2026-11-11'));
    await s.stars.reconcile(s.childId);
    await s.stars.reconcile(s.childId);
    const { entries } = await s.check();
    assert.equal(entries.filter((entry) => entry.kind === 'trial_followup_bonus').length, 1);
    assert.equal((await s.read()).wallet.chest, 9);
  });

  test('звёзды: занятия до создания доступа не учитываются, ×2 не даётся (Т1)', async () => {
    const s = await setup({ firstAccessOn: '2026-11-01', attendances: [
      visit(1, '2026-03-01', { trial: true }), visit(2, '2026-03-08'), visit(3, '2026-10-31'), visit(4, '2026-11-01'),
    ] });
    await s.stars.reconcile(s.childId);
    assert.equal((await s.read()).wallet.chest, 3);
  });

  test('звёзды: исправление посещаемости и отмена — отзыв без удаления истории, возврат — новое начисление', async () => {
    const s = await setup({ attendances: [visit(1, '2026-11-03'), visit(2, '2026-11-10')] });
    await s.stars.reconcile(s.childId);
    s.child.attendances = [visit(2, '2026-11-10')];
    await s.stars.reconcile(s.childId);
    assert.equal((await s.read()).wallet.chest, 3);
    s.child.attendances = [visit(1, '2026-11-03'), visit(2, '2026-11-10')];
    await s.stars.reconcile(s.childId);
    const { entries } = await s.check();
    assert.deepEqual(entries.filter((entry) => entry.attendanceId === '1').map((entry) => [entry.kind, entry.amount, entry.idempotencyKey]),
      [['attendance', 3, 'att:1:1'], ['attendance_reversal', -3, 'att:1:2'], ['attendance', 3, 'att:1:3']]);
    assert.equal((await s.read()).wallet.chest, 6);
  });

  test('звёзды: отмена после траты — баланс в минус, видно 0, следующие занятия гасят долг', async () => {
    const s = await setup({ attendances: [visit(1, '2026-11-03')] });
    await s.stars.reconcile(s.childId);
    assert.equal((await s.stars.openChest(s.childId)).opened, 3);
    await s.stars.purchase({ childId: s.childId, itemCode: 'workshop', price: 3, requestKey: key(`buy-${s.childId}`) });
    s.child.attendances = [];
    await s.stars.reconcile(s.childId);
    assert.deepEqual((await s.read()).wallet, { balance: 0, chest: 0, debt: 3 });
    s.child.attendances = [visit(2, '2026-11-10')];
    await s.stars.reconcile(s.childId);
    assert.deepEqual((await s.read()).wallet, { balance: 0, chest: 3, debt: 3 });
    await s.stars.openChest(s.childId);
    assert.deepEqual((await s.read()).wallet, { balance: 0, chest: 0, debt: 0 });
    await s.check();
  });

  test('звёзды: отзыв списывается сначала из неоткрытого сундука (Т10)', async () => {
    const s = await setup({ attendances: [visit(1, '2026-11-03')] });
    await s.stars.reconcile(s.childId);
    await s.stars.openChest(s.childId);
    s.child.attendances.push(visit(2, '2026-11-10'));
    await s.stars.reconcile(s.childId);
    s.child.attendances = [visit(2, '2026-11-10')];
    await s.stars.reconcile(s.childId);
    assert.deepEqual((await s.read()).wallet, { balance: 3, chest: 0, debt: 0 });
  });

  test('звёзды: покупка в долг запрещена, повтор покупки не списывает дважды, гонка двух покупок', async () => {
    const s = await setup({ attendances: [visit(1, '2026-11-03')] });
    await s.stars.reconcile(s.childId);
    // Звёзды в сундуке ещё не на балансе.
    await assert.rejects(s.stars.purchase({ childId: s.childId, itemCode: 'fountain', price: 2, requestKey: key(`a${s.childId}`) }), { code: 'INSUFFICIENT_STARS' });
    await s.stars.openChest(s.childId);
    const results = await Promise.allSettled([
      s.stars.purchase({ childId: s.childId, itemCode: 'fountain', price: 2, requestKey: key(`b${s.childId}`) }),
      s.stars.purchase({ childId: s.childId, itemCode: 'panel', price: 2, requestKey: key(`c${s.childId}`) }),
    ]);
    assert.deepEqual(results.map((item) => item.status).sort(), ['fulfilled', 'rejected']);
    const again = await s.stars.purchase({ childId: s.childId, itemCode: 'fountain', price: 2, requestKey: key(`b${s.childId}`) });
    if (results[0].status === 'fulfilled') assert.equal(again.replayed, true);
    assert.equal((await s.read()).wallet.balance, 1);
    await s.check();
  });

  test('звёзды: недостаточный баланс после корректировки — покупка отклонена', async () => {
    const s = await setup({ attendances: [visit(1, '2026-11-03'), visit(2, '2026-11-04')] });
    await s.stars.reconcile(s.childId);
    await s.stars.openChest(s.childId);
    s.child.attendances = [visit(2, '2026-11-04')];
    await s.stars.reconcile(s.childId);
    await assert.rejects(s.stars.purchase({ childId: s.childId, itemCode: 'egg', price: 6, requestKey: key(`d${s.childId}`) }), { code: 'INSUFFICIENT_STARS' });
    assert.equal((await s.read()).wallet.balance, 3);
  });

  test('звёзды: одновременные сверки и повторная доставка одного списка дают одно начисление', async () => {
    const s = await setup({ attendances: [visit(1, '2026-11-02', { trial: true }), visit(2, '2026-11-03'), visit(3, '2026-11-04')] });
    // Второй экземпляр сервиса — как второй процесс игры с той же базой.
    const other = createStars({ store: s.store, crm: s.crm.crm, logger: silentLogger() });
    await Promise.all([s.stars.reconcile(s.childId), s.stars.reconcile(s.childId), other.reconcile(s.childId), other.reconcile(s.childId)]);
    const { entries } = await s.check();
    assert.equal(entries.length, 3);
    assert.equal((await s.read()).wallet.chest, 9);
  });

  test('звёзды: CRM недоступна или ответила некорректно — журнал не меняется', async () => {
    const s = await setup({ attendances: [visit(1, '2026-11-03')] });
    await s.stars.reconcile(s.childId);
    s.crm.state.attendanceUnavailable = true;
    assert.equal((await s.stars.reconcile(s.childId)).status, 'crm_unavailable');
    s.crm.state.attendanceUnavailable = false;
    s.child.attendances = [{ attendanceId: '1' }];
    assert.equal((await s.stars.reconcile(s.childId)).status, 'invalid_response');
    assert.equal((await s.read()).wallet.chest, 3);
  });

  test('звёзды: ребёнка удалили из CRM — звёзды не отзываются', async () => {
    const s = await setup({ attendances: [visit(1, '2026-11-03')] });
    await s.stars.reconcile(s.childId);
    s.child.deleted = true;
    assert.equal((await s.stars.reconcile(s.childId)).status, 'child_missing');
    assert.equal((await s.read()).wallet.chest, 3);
  });

  test('бонус: двойное нажатие — одна запись, тот же ключ с другими данными — конфликт', async () => {
    const s = await setup();
    const body = { childId: s.childId, amount: 2, reason: 'Помог собрать робота', actorUserId: '5', requestKey: key(`bonus-${s.childId}`) };
    const [a, b] = await Promise.all([s.stars.grantBonus(body), s.stars.grantBonus(body)]);
    assert.equal(a.bonus.id, b.bonus.id);
    assert.deepEqual([a.replayed, b.replayed].sort(), [false, true]);
    await assert.rejects(s.stars.grantBonus({ ...body, amount: 3 }), { code: 'IDEMPOTENCY_CONFLICT' });
    const { bonuses, wallet } = await s.read();
    assert.equal(bonuses.length, 1); assert.equal(wallet.chest, 2);
    assert.deepEqual({ ...bonuses[0], id: undefined, createdAt: undefined }, { id: undefined, createdAt: undefined, childId: s.childId, amount: 2,
      reason: 'Помог собрать робота', createdByUserId: '5', revoked: null });
  });

  test('бонус: сумма 1–10 и причина обязательны', async () => {
    const s = await setup();
    for (const amount of [0, 11, -1, 2.5, '3']) {
      await assert.rejects(s.stars.grantBonus({ childId: s.childId, amount, reason: 'За старание', actorUserId: '5', requestKey: key(`x${amount}`) }), { code: 'VALIDATION_ERROR' });
    }
    await assert.rejects(s.stars.grantBonus({ childId: s.childId, amount: 1, reason: '  ', actorUserId: '5', requestKey: key('y') }), { code: 'VALIDATION_ERROR' });
  });

  test('бонус: отзывает автор или директор, один раз; после траты — долг, история сохраняется', async () => {
    const s = await setup();
    const { bonus } = await s.stars.grantBonus({ childId: s.childId, amount: 4, reason: 'Победа в конкурсе', actorUserId: '5', requestKey: key(`r${s.childId}`) });
    await s.stars.openChest(s.childId);
    await s.stars.purchase({ childId: s.childId, itemCode: 'egg', price: 4, requestKey: key(`p${s.childId}`) });
    const revoke = { childId: s.childId, bonusId: bonus.id, reason: 'Ошибка: не тот ребёнок' };
    await assert.rejects(s.stars.revokeBonus({ ...revoke, actorUserId: '6' }), { code: 'GAME_BONUS_REVOKE_FORBIDDEN' });
    await assert.rejects(s.stars.revokeBonus({ ...revoke, childId: String(Number(s.childId) + 1), actorUserId: '5' }));
    const first = await s.stars.revokeBonus({ ...revoke, actorUserId: '6', actorIsDirector: true });
    const second = await s.stars.revokeBonus({ ...revoke, actorUserId: '5' });
    assert.equal(first.replayed, false); assert.equal(second.replayed, true);
    assert.deepEqual(first.wallet, { balance: 0, chest: 0, debt: 4 });
    const { bonuses } = await s.read();
    assert.equal(bonuses[0].revoked.byUserId, '6'); assert.equal(bonuses[0].revoked.reason, 'Ошибка: не тот ребёнок');
    const { entries } = await s.check();
    assert.deepEqual(entries.map((entry) => entry.kind), ['staff_bonus', 'purchase', 'staff_bonus_revoke']);
  });

  test('без игрового профиля звёзды не начисляются', async () => {
    const store = await makeStore();
    const stars = createStars({ store, crm: fakeCrm().crm, logger: silentLogger() });
    await assert.rejects(stars.grantBonus({ childId: String(prefix + 999_999), amount: 1, reason: 'Тест', actorUserId: '5', requestKey: key('none') }), { code: 'GAME_PROFILE_MISSING' });
    assert.equal((await stars.reconcile(String(prefix + 999_999))).status, 'no_profile');
  });
}
