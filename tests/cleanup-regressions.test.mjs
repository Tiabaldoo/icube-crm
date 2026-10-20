import assert from 'node:assert/strict';
import test from 'node:test';
import { createMysqlCatalog } from '../backend/src/catalog.mjs';
import { createDeletionService } from '../backend/src/deletion.mjs';
import { createMysqlLessons } from '../backend/src/lessons.mjs';
import { createMysqlPayments } from '../backend/src/payments.mjs';

function transactionPool(handler) {
  const connection = {
    query: handler,
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };
  return { query: handler, getConnection: async () => connection };
}

test('деактивация группы закрывает memberships, удаляет будущие lessons и возвращает ребёнка без группы', async () => {
  let active = true;
  let membershipEnded = false;
  let futureLessonsDeleted = false;
  const groupRow = () => ({
    id: 10, name: 'Роботы · Пн 10:00', direction_id: 1, direction_name: 'Робототехника', site_id: 2, site_name: 'Площадка',
    project_id: 3, project_name: 'iCubeRobots', teacher_id: 4, teacher_name: 'Преподаватель', weekday: 1,
    start_time: '10:00:00', end_time: '11:00:00', starts_on: '2026-01-01', ends_on: active ? null : '2026-09-15', active, price: null,
  });
  const handler = async (sql, params = {}) => {
    if (sql.includes('FROM study_groups g JOIN directions')) return [[groupRow()]];
    if (sql === 'SELECT id FROM study_groups WHERE id=:groupId FOR UPDATE') return [[{ id: 10 }]];
    if (sql.startsWith('SELECT d.name FROM group_memberships')) return [[]];
    if (/^SELECT id FROM (directions|sites|projects|teachers)/.test(sql)) return [[{ id: 1 }]];
    if (sql.startsWith('SELECT s.id FROM sites s JOIN teacher_projects')) return [[{ id: 2 }]];
    if (sql.startsWith('SELECT teacher_id FROM teacher_project_directions')) return [[{ teacher_id: 4 }]];
    if (sql.startsWith('UPDATE study_groups SET')) { active = params.active; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('UPDATE group_memberships SET ended_on=')) { membershipEnded = true; assert.equal(params.endedOn, '2026-09-15'); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('DELETE l FROM lessons')) { futureLessonsDeleted = true; assert.match(sql, /l\.status='scheduled'/); return [{ affectedRows: 2 }]; }
    if (sql.includes('FROM children c LEFT JOIN child_guardians')) return [[{ id: 8, full_name: 'Ребёнок', status: 'active', needs_director_review: 0, guardian_name: null, guardian_phone: null }]];
    if (sql.includes('FROM child_enrollments e JOIN directions')) return [[{
      id: 9, child_id: 8, direction_id: 1, direction_name: 'Робототехника', status: 'active', individual_price: null,
      balance_lessons: '0.00000000', started_on: '2026-01-01', ended_on: null, group_id: membershipEnded ? null : 10, current_price: '1025.00',
    }]];
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  const catalog = createMysqlCatalog(transactionPool(handler));
  await catalog.update('groups', 10, { active: false, endsOn: '2026-09-15' });
  const [child] = await catalog.list('children');
  assert.equal(active, false);
  assert.equal(futureLessonsDeleted, true);
  assert.equal(child.enrollments[0].groupId, null);
  assert.equal(child.enrollments[0].status, 'active');
});

test('удаление ошибочного посещения возвращает FIFO и сохраняет отменённую проводку для аудита', async () => {
  const lesson = {
    id: 50, group_id: 4, direction_id_snapshot: 1, project_id_snapshot: 2, site_id_snapshot: 3, planned_teacher_id: 6,
    actual_teacher_id: 6, status: 'completed', scheduled_starts_at: '2026-09-14 10:00:00', scheduled_ends_at: '2026-09-14 11:00:00',
    starts_at: '2026-09-14 10:00:00', ends_at: '2026-09-14 11:00:00', actual_starts_at: '2026-09-14 10:00:00', actual_ends_at: '2026-09-14 11:00:00',
    topic: null, is_intro_group: 0, is_empty_trip: 0, roster_frozen_at: '2026-09-14 10:00:00', attendance_applied_at: '2026-09-14 11:00:00',
    completed_at: '2026-09-14 11:00:00', cancelled_at: null, lock_version: 3,
  };
  const calls = [];
  const handler = async (sql, params = {}) => {
    calls.push({ sql, params });
    if (sql === 'SELECT * FROM lessons WHERE id=:id FOR UPDATE') return [[lesson]];
    if (sql.startsWith('SELECT roster_type FROM lesson_roster_members')) return [[{ roster_type: 'main' }]];
    if (sql.startsWith('SELECT e.id,e.child_id,e.direction_id,e.balance_lessons')) return [[{ id: 9, current_price: '1025.00', balance_lessons: '3.00000000' }]];
    if (/^SELECT id FROM (balance_transfers|enrollment_project_transfers|refunds|partner_settlements) WHERE/.test(sql)) return [[]];
    if (sql.startsWith('INSERT INTO audit_log')) return [{ insertId: 82 }];
    if (sql === 'SELECT * FROM attendances WHERE lesson_id=:lessonId AND child_id=:childId FOR UPDATE') return [[{ id: 70, lesson_id: 50, child_id: 8, enrollment_id: 9, attendance_type: 'main', present: 1, is_trial: 0 }]];
    if (sql.includes("be.attendance_id=:attendanceId AND be.entry_type='attendance'")) return [[{ id: 80, enrollment_id: 9, lessons_delta: '-1.00000000', amount_delta: '-1025.00', unit_price_snapshot: '1025.00' }]];
    if (sql.startsWith('SELECT balance_lot_id,lessons')) return [[{ balance_lot_id: 60, lessons: '1.00000000' }]];
    if (sql.startsWith('SELECT id,enrollment_id,original_lessons,remaining_lessons FROM balance_lots')) return [[{ id: 60, enrollment_id: 9, original_lessons: '4.00000000', remaining_lessons: '3.00000000' }]];
    if (sql.startsWith('SELECT dependent.id FROM balance_lot_consumptions linked')) return [[]];
    if (sql.startsWith('INSERT INTO balance_entries')) return [{ insertId: 81 }];
    if (sql.startsWith('SELECT * FROM salary_accruals WHERE')) return [[{ id: 90, teacher_id: 6 }]];
    if (sql.startsWith('SELECT COUNT(*) present_count')) return [[{ present_count: 0 }]];
    if (sql.includes('FROM lessons l JOIN study_groups')) return [[{ ...lesson, group_name: 'Группа', direction_name: 'Робототехника', project_name: 'iCubeRobots', site_name: 'Площадка', planned_teacher_name: 'Преподаватель', actual_teacher_name: 'Преподаватель' }]];
    if (sql.includes('lesson_roster_members WHERE lesson_id IN')) return [[{ lesson_id: 50, child_id: 8, roster_type: 'main' }]];
    if (sql.includes('FROM attendances WHERE lesson_id IN') || sql.includes('FROM salary_accruals sa WHERE sa.lesson_id IN')) return [[]];
    if (/^(UPDATE|DELETE)/.test(sql)) return [{ affectedRows: 1 }];
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  await createMysqlLessons(transactionPool(handler)).removeAttendance(50, 8, { roles: ['director'] });
  assert.ok(calls.some(({ sql, params }) => sql.startsWith('UPDATE balance_lots SET remaining_lessons=remaining_lessons+') && params.lessons === '1.00000000'));
  assert.ok(calls.some(({ sql, params }) => sql.startsWith('UPDATE child_enrollments SET balance_lessons=balance_lessons+') && params.lessons === '1.00000000'));
  assert.ok(calls.some(({ sql, params }) => sql.startsWith('UPDATE attendances SET enrollment_id=:enrollmentId,attendance_type=') && params.present === false));
  assert.ok(!calls.some(({ sql }) => sql.startsWith('DELETE')));
  assert.ok(calls.some(({ sql }) => sql.startsWith('UPDATE salary_accruals SET reversed_at=')));
});

function paymentRemovalPool({ activeConsumption = false, balance = '4.00000000' } = {}) {
  const calls = [];
  const handler = async (sql, params = {}) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT * FROM payments')) return [[{ id: 11, enrollment_id: 9, lessons_credit: '4.00000000' }]];
    if (sql.includes('FROM child_enrollments e')) return [[{ id: 9, child_id: 8, direction_id: 1, balance_lessons: balance, current_price: null }]];
    if (sql.startsWith('SELECT id FROM refunds')) return [[]];
    if (sql.startsWith('SELECT id FROM balance_entries')) return [[{ id: 12 }]];
    if (sql.startsWith('SELECT blc.id FROM balance_lot_consumptions')) return [activeConsumption ? [{ id: 30 }] : []];
    if (/^(UPDATE|DELETE)/.test(sql)) return [{ affectedRows: 1 }];
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  return { pool: transactionPool(handler), calls };
}

test('после reversal посещения оплату можно удалить вместе с восстановленным lot', async () => {
  const { pool, calls } = paymentRemovalPool();
  await createMysqlPayments(pool).remove(11);
  assert.ok(calls.some(({ sql }) => sql.startsWith('DELETE blc FROM balance_lot_consumptions')));
  assert.ok(calls.some(({ sql }) => sql.startsWith('DELETE FROM balance_lots')));
  assert.ok(calls.some(({ sql }) => sql.startsWith('DELETE FROM payments')));
});

test('удаление оплаты уведомляет о реальном пересечении долга без изменения финансового расчёта', async () => {
  const { pool } = paymentRemovalPool({ balance: '1.00000000' });
  const calls = [];
  const notificationEvents = { async debtThreshold(_connection, payload) { calls.push(payload); } };
  await createMysqlPayments(pool, { notificationEvents }).remove(11, { actorUserId: 5 });
  assert.deepEqual(calls, [{
    enrollmentId: 9, before: '1.00000000', after: '-3.00000000',
    causeKey: 'payment-remove-11', actorUserId: 5,
  }]);
});

function paymentUpdateDebtPool() {
  const state = {
    balance: '1.00000000',
    payment: { id: 11, enrollment_id: 9, child_id: 8, direction_id: 1, group_id_snapshot: 4, project_id_snapshot: 2,
      paid_on: '2026-09-01', amount: '4100.00', price_snapshot: '1025.00', lessons_credit: '4.00000000',
      method: 'cashless', note: null, created_at: '2026-09-01 12:00:00.000000', updated_at: '2026-09-10 12:00:00.000000' },
  };
  const decimal = (value) => Number(value).toFixed(8);
  const handler = async (sql, params = {}) => {
    if (sql.startsWith('SELECT * FROM payments WHERE id=')) return [[{ ...state.payment }]];
    if (sql.startsWith('SELECT id FROM refunds WHERE payment_id=') || sql.startsWith('SELECT id,amount,refunded_on FROM refunds')) return [[]];
    if (sql.includes('FROM child_enrollments e')) return [[{
      id: 9, child_id: 8, direction_id: 1, group_id: 4, project_id: 2, superseded_at: null,
      balance_lessons: state.balance, current_price: '1025.00',
    }]];
    if (sql.startsWith('UPDATE child_enrollments SET balance_lessons=balance_lessons-')) {
      state.balance = decimal(Number(state.balance) - Number(params.lessons)); return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE child_enrollments SET balance_lessons=balance_lessons+')) {
      state.balance = decimal(Number(state.balance) + Number(params.lessons)); return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE payments SET')) {
      Object.assign(state.payment, { amount: params.amount, price_snapshot: params.price, lessons_credit: params.lessons,
        paid_on: params.paidOn, method: params.method, updated_at: '2026-09-25 12:00:00.000000' });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT id FROM balance_entries WHERE payment_id=')) return [[{ id: 12 }]];
    if (sql.startsWith('SELECT id,original_lessons,remaining_lessons FROM balance_lots WHERE source_balance_entry_id=')) return [[{ id: 20, original_lessons: '4.00000000', remaining_lessons: '1.00000000' }]];
    if (sql.startsWith('SELECT blc.id,debit.entry_type FROM balance_lot_consumptions') || sql.startsWith('SELECT id FROM balance_transfer_lot_changes')) return [[]];
    if (sql.startsWith('UPDATE balance_entries SET')) return [{ affectedRows: 1 }];
    if (sql.startsWith('UPDATE balance_lots SET enrollment_id=')) return [{ affectedRows: 1 }];
    if (sql.startsWith('SELECT id,balance_lessons FROM child_enrollments')) return [[{ id: 9, balance_lessons: state.balance }]];
    if (sql.startsWith('SELECT be.*,r.payment_id refund_payment_id')) return [[
      ...[1,2,3].map((id) => ({ id, entry_type: 'attendance', lessons_delta: '-1.00000000', amount_delta: '-1025.00' })),
      { id: 12, entry_type: 'payment', payment_id: 11, lessons_delta: state.payment.lessons_credit, unit_price_snapshot: '1025.00' },
    ]];
    if (sql.startsWith('SELECT id,source_balance_entry_id,original_lessons,remaining_lessons,unit_price')) return [[{ id: 20, source_balance_entry_id: 12, unit_price: '1025.00' }]];
    if (sql.startsWith('SELECT blc.* FROM balance_lot_consumptions')) return [[]];
    if (sql.startsWith('UPDATE balance_lots SET original_lessons=')) return [{ affectedRows: 1 }];
    if (sql.includes('FROM payments p JOIN children c')) return [[{
      ...state.payment, child_name: 'Иван', direction_name: 'Робототехника', refunded_amount: '0.00', remaining_lessons: '0.00000000',
    }]];
    throw new Error(`Неожиданный SQL payment update debt: ${sql}`);
  };
  const connection = { query: handler, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  return { state, pool: { query: handler, getConnection: async () => connection } };
}

test('уменьшение оплаты уведомляет о crossing > -2 → <= -2 и сохраняет существующий расчёт balance', async () => {
  const fixture = paymentUpdateDebtPool();
  const calls = [];
  const notificationEvents = { async debtThreshold(_connection, payload) { calls.push(payload); } };
  const result = await createMysqlPayments(fixture.pool, { notificationEvents }).update(11, {
    amount: '1025.00', paidOn: '2026-09-01', method: 'cashless',
  }, { actorUserId: 6 });
  assert.equal(fixture.state.balance, '-2.00000000');
  assert.equal(result.lessonsCredit, '1.00000000');
  assert.deepEqual(calls, [{
    enrollmentId: 9, before: '1.00000000', after: '-2.00000000',
    causeKey: 'payment-update-11-2026-09-10 12:00:00.000000', actorUserId: 6,
  }]);
});

test('оплата с активным consumed lot по-прежнему не удаляется', async () => {
  const { pool, calls } = paymentRemovalPool({ activeConsumption: true });
  await assert.rejects(createMysqlPayments(pool).remove(11), (error) => error.code === 'PAYMENT_HAS_HISTORY');
  assert.equal(calls.some(({ sql }) => sql.startsWith('DELETE FROM payments')), false);
});

test('полностью очищенный enrollment удаляется вместе с reversed техническим ledger', async () => {
  const calls = [];
  const handler = async (sql, params = {}) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT child_id FROM child_enrollments')) return [[{ child_id: 8 }]];
    if (sql.startsWith('SELECT id,status FROM children')) return [[{ id: 8, status: 'active' }]];
    if (sql.startsWith('SELECT id,status FROM child_enrollments')) return [[{ id: 10, status: 'active' }]];
    if (sql.startsWith('SELECT id FROM audit_log')) return [[]];
    if (sql.startsWith('SELECT id,child_id,balance_lessons')) return [[{ id: 9, child_id: 8, balance_lessons: '0.00000000' }]];
    if (sql.startsWith('SELECT id FROM child_enrollments WHERE child_id')) return [[{ id: 9 }, { id: 10 }]];
    if (sql.includes('FROM payments WHERE enrollment_id')) return [[{ payments: 0, refunds: 0, attendances: 0, memberships: 0, balanceTransfers: 0, balanceEffects: 0 }]];
    if (/^(DELETE)/.test(sql)) return [{ affectedRows: 1 }];
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  await createDeletionService(transactionPool(handler)).deleteEnrollment(9);
  assert.ok(calls.some(({ sql }) => sql.startsWith('DELETE reversal FROM balance_entries')));
  assert.ok(calls.some(({ sql }) => sql.startsWith('DELETE FROM child_enrollments')));
});

test('absent attendance остаётся активной историей и блокирует удаление enrollment', async () => {
  const handler = async (sql) => {
    if (sql.startsWith('SELECT child_id FROM child_enrollments')) return [[{ child_id: 8 }]];
    if (sql.startsWith('SELECT id,status FROM children')) return [[{ id: 8, status: 'active' }]];
    if (sql.startsWith('SELECT id,child_id,balance_lessons')) return [[{ id: 9, child_id: 8, balance_lessons: '0.00000000' }]];
    if (sql.startsWith('SELECT id FROM child_enrollments WHERE child_id')) return [[{ id: 9 }, { id: 10 }]];
    if (sql.includes('FROM payments WHERE enrollment_id')) {
      assert.match(sql, /attendances WHERE enrollment_id=:id AND marked_at IS NOT NULL/);
      return [[{ payments: 0, refunds: 0, attendances: 1, memberships: 0, balanceTransfers: 0, balanceEffects: 0 }]];
    }
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  await assert.rejects(createDeletionService(transactionPool(handler)).deleteEnrollment(9), (error) => error.code === 'ENROLLMENT_HAS_HISTORY');
});

test('после полной очистки технической истории удаляются child и пустая historical group', async () => {
  let childDeleted = false;
  const childHandler = async (sql) => {
    if (sql.includes('FROM children c LEFT JOIN child_guardians')) return [[{ id: 8, full_name: 'Ребёнок', status: 'active', needs_director_review: 0, guardian_name: null, guardian_phone: null }]];
    if (sql.includes('FROM child_enrollments e JOIN directions')) return [[{ id: 9, child_id: 8, direction_id: 1, direction_name: 'Робототехника', status: 'active', balance_lessons: '0.00000000', started_on: '2026-01-01' }]];
    if (sql.startsWith('SELECT') && sql.includes('(SELECT COUNT(*) FROM payments WHERE child_id=')) return [[{ payments: 0, refunds: 0, attendances: 0, balanceTransfers: 0, nonzeroBalances: 0, balanceEffects: 0 }]];
    if (sql.startsWith('SELECT id FROM child_enrollments')) return [[{ id: 9 }]];
    if (sql.startsWith('SELECT guardian_id FROM child_guardians')) return [[]];
    if (sql.startsWith('DELETE FROM children')) childDeleted = true;
    if (sql.startsWith('DELETE') || sql.startsWith('UPDATE')) return [{ affectedRows: 1 }];
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  await createMysqlCatalog(transactionPool(childHandler)).deleteChild(8);
  assert.equal(childDeleted, true);

  const order = [];
  const groupHandler = async (sql) => {
    if (sql.startsWith('SELECT id FROM study_groups')) return [[{ id: 10 }]];
    if (sql.startsWith('DELETE l FROM lessons')) return [{ affectedRows: 0 }];
    if (sql.startsWith('SELECT l.id FROM lessons l WHERE')) return [[{ id: 50 }]];
    if (sql.startsWith('DELETE FROM lessons')) order.push('lesson');
    if (sql.startsWith('DELETE FROM price_versions')) order.push('prices');
    if (sql.startsWith('DELETE FROM study_groups')) order.push('group');
    if (sql.includes('FROM group_memberships WHERE group_id')) return [[{ memberships: 0, lessons: 0, attendances: 0, childStatusHistory: 0, enrollmentStatusHistory: 0, payments: 0, refunds: 0 }]];
    if (sql.startsWith('DELETE') || sql.startsWith('UPDATE')) return [{ affectedRows: 1 }];
    throw new Error(`Неожиданный SQL: ${sql}`);
  };
  await createDeletionService(transactionPool(groupHandler)).deleteGroup(10);
  assert.deepEqual(order, ['lesson', 'lesson', 'prices', 'group']);
});
