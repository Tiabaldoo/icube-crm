import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPaymentReceiptService, detectReceiptFile } from '../backend/src/payment-receipts.mjs';

const parent = { userId: '50', roles: ['parent'] };
const director = { userId: '1', roles: ['director'] };
const partner = { userId: '2', roles: ['partner'], projectIds: ['7'] };
const foreignPartner = { userId: '3', roles: ['partner'], projectIds: ['8'] };

function fixture(storageDir) {
  const state = { receipts: [], links: [], payments: [], balance: '0.00000000', staffNotifications: [], parentNotifications: [] };
  const options = [
    { child_id: 10, child_name: 'Иван Иванов', enrollment_id: 100, project_id: 7, direction_id: 1, direction_name: 'Робототехника' },
    { child_id: 11, child_name: 'Мария Иванова', enrollment_id: 101, project_id: 7, direction_id: 2, direction_name: 'Программирование' },
  ];
  const receiptRow = (id) => {
    const receipt = state.receipts.find((item) => String(item.id) === String(id));
    if (!receipt) return null;
    return { ...receipt, guardian_name: null, payment_count: state.links.filter((item) => String(item.receiptId) === String(id)).length };
  };
  async function query(sql, params = {}) {
    if (sql.includes('FROM guardians g') && sql.includes('WHERE g.user_id=:userId')) {
      return [[String(params.userId) === '50' ? { id: 5, user_id: 50, full_name: null } : undefined].filter(Boolean)];
    }
    if (sql.startsWith('INSERT INTO payment_receipts')) {
      const id = state.receipts.length + 1;
      state.receipts.push({ id, guardian_id: 5, uploaded_by_user_id: 50, storage_key: params.storageKey,
        mime_type: params.mimeType, size_bytes: params.sizeBytes, original_filename: params.originalFilename,
        uploaded_at: params.uploadedAt, closed_at: null });
      return [{ insertId: id, affectedRows: 1 }];
    }
    if (sql.startsWith('SELECT DISTINCT e.project_id')) return [[{ project_id: 7 }]];
    if (sql.includes('FROM payment_receipts pr JOIN guardians g')) {
      let rows = state.receipts.map((item) => receiptRow(item.id));
      if (params.receiptId != null) rows = rows.filter((item) => String(item.id) === String(params.receiptId));
      if (params.guardianId != null) rows = rows.filter((item) => String(item.guardian_id) === String(params.guardianId));
      if (params.projectId != null && String(params.projectId) !== '7') rows = [];
      if (params.queueOnly) rows = rows.filter((item) => item.closed_at == null);
      return [rows];
    }
    if (sql.startsWith('SELECT DISTINCT c.id child_id')) {
      return [options.filter((item) => params.projectId == null || String(item.project_id) === String(params.projectId))];
    }
    if (sql.startsWith('SELECT c.full_name child_name')) {
      const selected = options.find((item) => String(item.child_id) === String(params.childId) && String(item.direction_id) === String(params.directionId));
      return [[selected ? { child_name: selected.child_name, direction_name: selected.direction_name } : undefined].filter(Boolean)];
    }
    if (sql.startsWith('INSERT IGNORE INTO payment_receipt_payments')) {
      const exists = state.links.some((item) => String(item.receiptId) === String(params.receiptId) && String(item.paymentId) === String(params.paymentId));
      if (!exists) state.links.push({ receiptId: String(params.receiptId), paymentId: String(params.paymentId) });
      return [{ affectedRows: exists ? 0 : 1 }];
    }
    if (sql.startsWith('UPDATE payment_receipts SET closed_at=')) {
      const receipt = state.receipts.find((item) => String(item.id) === String(params.receiptId)); receipt.closed_at ??= new Date('2026-09-26T08:00:00Z');
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected receipt SQL: ${sql}`);
  }
  const connection = { query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} };
  const pool = { query, getConnection: async () => connection };
  const notificationEvents = {
    roleUsers: async () => [{ user_id: 1 }], partnerUsers: async () => [{ user_id: 2 }],
    createUser: async (_connection, value) => state.staffNotifications.push(value),
  };
  const parentNotifications = { createForGuardian: async (_connection, value) => state.parentNotifications.push(value) };
  const payments = {
    quote: async (enrollmentId) => ({ currentPrice: String(enrollmentId) === '100' ? '1025.00' : '1125.00',
      subscriptionAmount: String(enrollmentId) === '100' ? '4100.00' : '4500.00' }),
    create: async (body, context) => {
      const option = options.find((item) => String(item.enrollment_id) === String(body.enrollmentId));
      const payment = { id: String(state.payments.length + 20), enrollmentId: String(option.enrollment_id), childId: String(option.child_id),
        directionId: String(option.direction_id), projectId: String(option.project_id), amount: body.amount, paidOn: body.paidOn, method: body.method };
      state.payments.push(payment); state.balance = String(Number(state.balance) + 4);
      await context.afterCreate(connection, payment);
      return payment;
    },
  };
  const service = createPaymentReceiptService(pool, { storageDir, payments, notificationEvents, parentNotifications,
    now: () => new Date('2026-09-26T05:00:00.000Z') });
  return { state, service };
}

test('receipt upload is non-financial, protected by owner/project scope, and one receipt links multiple normal payments', async () => {
  const storageDir = await mkdtemp(path.join(tmpdir(), 'icube-receipts-'));
  try {
    const { state, service } = fixture(storageDir);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    assert.deepEqual(detectReceiptFile(jpeg), { mimeType: 'image/jpeg', extension: 'jpg' });
    const receipt = await service.upload({ buffer: jpeg, mimeType: 'image/jpeg', originalFilename: 'чек.jpg' }, parent);
    assert.equal(state.payments.length, 0); assert.equal(state.balance, '0.00000000');
    assert.equal(receipt.status, 'pending'); assert.equal(receipt.guardianName, 'Не указан');
    assert.equal((await service.listParent(parent)).length, 1);
    await assert.rejects(service.getParent(receipt.id, { userId: '51', roles: ['parent'] }), { status: 403 });
    assert.equal((await service.getStaff(receipt.id, director)).options.length, 2);
    assert.equal((await service.getStaff(receipt.id, partner)).options.length, 2);
    await assert.rejects(service.getStaff(receipt.id, foreignPartner), { status: 403, code: 'FORBIDDEN' });
    assert.equal(state.staffNotifications.filter((item) => item.type === 'director_payment_receipt').length, 1);
    assert.equal(state.staffNotifications.filter((item) => item.type === 'partner_payment_receipt').length, 1);

    await service.applySubscription(receipt.id, 100, { ...director, idempotencyKey: 'receipt-director-1' });
    await service.applySubscription(receipt.id, 101, { ...partner, idempotencyKey: 'receipt-partner-1' });
    assert.equal(state.payments.length, 2); assert.equal(state.links.length, 2); assert.equal(state.balance, '8');
    assert.deepEqual(state.payments.map((item) => item.method), ['cashless', 'cashless']);
    assert.deepEqual(state.payments.map((item) => item.paidOn), ['2026-09-26', '2026-09-26']);
    assert.equal((await service.getParent(receipt.id, parent)).status, 'confirmed');
    assert.equal(state.parentNotifications.filter((item) => item.type === 'payment_confirmed').length, 2);
    assert.equal(state.staffNotifications.filter((item) => item.type === 'director_partner_payment_confirmed').length, 1);
    assert.deepEqual(await readFile(path.join(storageDir, state.receipts[0].storage_key)), jpeg);
  } finally { await rm(storageDir, { recursive: true, force: true }); }
});

test('receipt migration and UI preserve explicit links, protected files and focused parent flow', async () => {
  const [migration, parentUi, staffUi, apiSync, pushUi, accessUi] = await Promise.all([
    readFile(new URL('../database/migrations/020_payment_receipts.sql', import.meta.url), 'utf8'),
    readFile(new URL('../src/frontend/parent-portal.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/frontend/payment-receipts.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/frontend/api-sync.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/frontend/push-client.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/frontend/parent-access.mjs', import.meta.url), 'utf8'),
  ]);
  assert.match(migration, /CREATE TABLE payment_receipts/); assert.match(migration, /CREATE TABLE payment_receipt_payments/);
  assert.match(migration, /PRIMARY KEY \(receipt_id,payment_id\)/); assert.doesNotMatch(migration, /DROP DATABASE|TRUNCATE/i);
  assert.match(parentUi, /Переведите оплату по номеру телефона/); assert.match(parentUi, /image\/jpeg,image\/png,application\/pdf/);
  assert.match(parentUi, /Ожидает подтверждения/); assert.match(parentUi, /Подтверждено/); assert.doesNotMatch(parentUi, /Оплата абонемента|QR для оплаты/);
  assert.match(staffUi, /Чеки на проверке/); assert.match(staffUi, /Зачислить абонемент/); assert.match(staffUi, /Закрыть без автоматического зачисления/);
  assert.match(apiSync, /body\.receiptId = value\('#pf-receipt'\)/); assert.match(apiSync, /receiptIds: \(payment\.receiptIds \?\? \[\]\)\.map\(Number\)/);
  assert.match(pushUi, /Открыть уведомления/); assert.match(pushUi, /openNotificationSettings/); assert.match(pushUi, /Как установить приложение/);
  assert.match(accessUi, /Родитель: \$\{escapeHtml\(account\.name \|\| 'Не указан'\)\}/);
  assert.match(accessUi, /backdrop\.remove\(\); legacy\.render\(\); return/);
});
