import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inTransaction } from './db.mjs';
import { ApiProblem } from './catalog.mjs';
import { partnerProjectId } from './project-scope.mjs';
import { businessDate, BUSINESS_UTC_OFFSET } from '../../src/shared/business-time.mjs';

const allowedMime = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const identifier = (value, field = 'id') => {
  const result = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(result)) throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректное поле ${field}`);
  return result;
};
const hasRole = (context, role) => (context.roles ?? []).includes(role);
const isoDateTime = (value) => value == null ? null : value instanceof Date
  ? value.toISOString() : `${String(value).slice(0, 10)}T${String(value).slice(11, 19)}${BUSINESS_UTC_OFFSET}`;
const safeOriginalFilename = (value) => {
  let decoded;
  try { decoded = decodeURIComponent(String(value ?? '')); } catch { decoded = String(value ?? ''); }
  decoded = decoded.replace(/\\/g, '/').trim().slice(0, 255);
  return decoded ? path.basename(decoded).replace(/[\u0000-\u001f\u007f]/g, '') || null : null;
};

export function detectReceiptFile(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mimeType: 'image/jpeg', extension: 'jpg' };
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mimeType: 'image/png', extension: 'png' };
  }
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return { mimeType: 'application/pdf', extension: 'pdf' };
  return null;
}

function mapReceipt(row, { parent = false } = {}) {
  const linkedPayments = Number(row.payment_count ?? 0);
  return {
    id: String(row.id), guardianId: String(row.guardian_id), guardianName: row.guardian_name || 'Не указан',
    uploadedAt: isoDateTime(row.uploaded_at), mimeType: row.mime_type, sizeBytes: Number(row.size_bytes),
    originalFilename: row.original_filename, status: linkedPayments > 0 ? 'confirmed' : 'pending',
    linkedPayments, closed: row.closed_at != null, closedAt: isoDateTime(row.closed_at),
    fileUrl: parent ? `/api/v1/parent/payment-receipts/${row.id}/file` : `/api/v1/payment-receipts/${row.id}/file`,
  };
}

export function createPaymentReceiptService(pool, {
  storageDir = path.resolve(process.cwd(), 'var', 'payment-receipts'),
  maxUploadBytes = 10 * 1024 * 1024,
  now = () => new Date(),
  payments,
  notificationEvents = null,
  parentNotifications = null,
} = {}) {
  if (!payments) throw new TypeError('payments service is required');
  const root = path.resolve(storageDir);
  const safePath = (storageKey) => {
    const resolved = path.resolve(root, String(storageKey));
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
      throw new ApiProblem(500, 'RECEIPT_STORAGE_KEY_INVALID', 'Некорректный ключ файла');
    }
    return resolved;
  };

  async function guardianForParent(connection, context) {
    if (!hasRole(context, 'parent') || (context.roles ?? []).some((role) => ['director', 'partner', 'teacher'].includes(role))) {
      throw new ApiProblem(403, 'FORBIDDEN', 'Чеки доступны только родителю');
    }
    const userId = identifier(context.userId, 'userId');
    const [rows] = await connection.query(`SELECT g.id,g.user_id,g.full_name FROM guardians g
      JOIN users u ON u.id=g.user_id AND u.status='active' AND u.deleted_at IS NULL
      WHERE g.user_id=:userId LIMIT 1`, { userId });
    if (!rows.length) throw new ApiProblem(403, 'PARENT_ACCOUNT_MISSING', 'Родительский профиль не настроен');
    return rows[0];
  }

  function staffProject(context) {
    if (hasRole(context, 'director')) return null;
    if (hasRole(context, 'partner')) return partnerProjectId(context);
    throw new ApiProblem(403, 'FORBIDDEN', 'Чеки об оплате недоступны');
  }

  async function receiptForAccess(connection, receiptId, context, { lock = false, parent = false } = {}) {
    receiptId = identifier(receiptId, 'receiptId');
    if (parent) {
      const guardian = await guardianForParent(connection, context);
      const [rows] = await connection.query(`SELECT pr.*,g.full_name guardian_name,
        (SELECT COUNT(*) FROM payment_receipt_payments rp JOIN payments p ON p.id=rp.payment_id AND p.deleted_at IS NULL
          WHERE rp.receipt_id=pr.id) payment_count
        FROM payment_receipts pr JOIN guardians g ON g.id=pr.guardian_id
        WHERE pr.id=:receiptId AND pr.guardian_id=:guardianId${lock ? ' FOR UPDATE' : ''}`, {
        receiptId, guardianId: guardian.id,
      });
      if (!rows.length) throw new ApiProblem(404, 'RECEIPT_NOT_FOUND', 'Чек не найден');
      return rows[0];
    }
    const projectId = staffProject(context);
    const [rows] = await connection.query(`SELECT pr.*,g.full_name guardian_name,
      (SELECT COUNT(*) FROM payment_receipt_payments rp JOIN payments p ON p.id=rp.payment_id AND p.deleted_at IS NULL
        WHERE rp.receipt_id=pr.id) payment_count
      FROM payment_receipts pr JOIN guardians g ON g.id=pr.guardian_id
      WHERE pr.id=:receiptId AND (:projectId IS NULL OR EXISTS (
        SELECT 1 FROM child_guardians cg JOIN child_enrollments e ON e.child_id=cg.child_id
        WHERE cg.guardian_id=pr.guardian_id AND e.project_id=:projectId AND e.superseded_at IS NULL
      ) OR EXISTS (
        SELECT 1 FROM payment_receipt_payments rp JOIN payments p ON p.id=rp.payment_id AND p.deleted_at IS NULL
        WHERE rp.receipt_id=pr.id AND p.project_id_snapshot=:projectId
      ))${lock ? ' FOR UPDATE' : ''}`, { receiptId, projectId });
    if (!rows.length) throw new ApiProblem(projectId ? 403 : 404, projectId ? 'FORBIDDEN' : 'RECEIPT_NOT_FOUND',
      projectId ? 'Чек другого проекта недоступен' : 'Чек не найден');
    return rows[0];
  }

  async function notifyUploaded(connection, receipt, guardian) {
    if (!notificationEvents) return;
    const payload = {
      title: 'Новый чек на проверку', body: `${guardian.full_name || 'Не указан'} — родитель загрузил чек об оплате.`,
      entityType: 'payment_receipt', entityId: receipt.id, destination: 'payment-receipt',
      referenceType: 'payment_receipt', referenceId: receipt.id,
    };
    for (const row of await notificationEvents.roleUsers(connection, 'director')) {
      await notificationEvents.createUser(connection, { ...payload, userId: row.user_id, roleCode: 'director',
        type: 'director_payment_receipt', dedupKey: `director:payment_receipt:${receipt.id}` });
    }
    const [projects] = await connection.query(`SELECT DISTINCT e.project_id FROM child_guardians cg
      JOIN child_enrollments e ON e.child_id=cg.child_id AND e.superseded_at IS NULL AND e.status='active'
      WHERE cg.guardian_id=:guardianId`, { guardianId: guardian.id });
    for (const project of projects) for (const row of await notificationEvents.partnerUsers(connection, project.project_id)) {
      await notificationEvents.createUser(connection, { ...payload, userId: row.user_id, roleCode: 'partner',
        projectId: project.project_id, type: 'partner_payment_receipt',
        dedupKey: `partner:payment_receipt:${receipt.id}:${project.project_id}` });
    }
  }

  async function upload({ buffer, mimeType, originalFilename }, context = {}) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new ApiProblem(400, 'RECEIPT_REQUIRED', 'Файл чека не передан');
    if (buffer.length > maxUploadBytes) throw new ApiProblem(413, 'RECEIPT_TOO_LARGE', `Чек должен быть не больше ${Math.ceil(maxUploadBytes / 1024 / 1024)} МБ`);
    const detected = detectReceiptFile(buffer);
    if (!detected || !allowedMime.has(mimeType) || detected.mimeType !== mimeType) {
      throw new ApiProblem(415, 'RECEIPT_TYPE_INVALID', 'Разрешены только JPG, PNG и PDF');
    }
    const uploadedAt = now();
    const folder = businessDate(uploadedAt).slice(0, 7).replace('-', '/');
    const storageKey = `${folder}/${randomUUID()}.${detected.extension}`;
    const destination = safePath(storageKey); const temporary = `${destination}.tmp`;
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(temporary, buffer, { flag: 'wx', mode: 0o600 });
    let stored = false; let receiptId;
    try {
      receiptId = await inTransaction(pool, async (connection) => {
        const guardian = await guardianForParent(connection, context);
        await rename(temporary, destination); stored = true;
        const [result] = await connection.query(`INSERT INTO payment_receipts
          (guardian_id,uploaded_by_user_id,storage_key,mime_type,size_bytes,original_filename,uploaded_at)
          VALUES (:guardianId,:userId,:storageKey,:mimeType,:sizeBytes,:originalFilename,:uploadedAt)`, {
          guardianId: guardian.id, userId: context.userId, storageKey, mimeType: detected.mimeType,
          sizeBytes: buffer.length, originalFilename: safeOriginalFilename(originalFilename), uploadedAt,
        });
        await notifyUploaded(connection, { id: result.insertId }, guardian);
        return String(result.insertId);
      });
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => {});
      await rm(destination, { force: true }).catch(() => {});
      throw error;
    }
    if (!stored) await rm(temporary, { force: true }).catch(() => {});
    return getParent(receiptId, context);
  }

  async function listParent(context = {}) {
    const guardian = await guardianForParent(pool, context);
    const [rows] = await pool.query(`SELECT pr.*,g.full_name guardian_name,
      (SELECT COUNT(*) FROM payment_receipt_payments rp JOIN payments p ON p.id=rp.payment_id AND p.deleted_at IS NULL
        WHERE rp.receipt_id=pr.id) payment_count
      FROM payment_receipts pr JOIN guardians g ON g.id=pr.guardian_id
      WHERE pr.guardian_id=:guardianId ORDER BY pr.uploaded_at DESC,pr.id DESC`, { guardianId: guardian.id });
    return rows.map((row) => mapReceipt(row, { parent: true }));
  }

  async function getParent(receiptId, context = {}) {
    return mapReceipt(await receiptForAccess(pool, receiptId, context, { parent: true }), { parent: true });
  }

  async function listStaff(filters = {}, context = {}) {
    const projectId = staffProject(context);
    const childId = filters.childId == null || filters.childId === '' ? null : identifier(filters.childId, 'childId');
    const queueOnly = childId == null && String(filters.all ?? '') !== 'true';
    const [rows] = await pool.query(`SELECT pr.*,g.full_name guardian_name,
      (SELECT COUNT(*) FROM payment_receipt_payments rp JOIN payments p ON p.id=rp.payment_id AND p.deleted_at IS NULL
        WHERE rp.receipt_id=pr.id) payment_count
      FROM payment_receipts pr JOIN guardians g ON g.id=pr.guardian_id
      WHERE (:queueOnly=FALSE OR pr.closed_at IS NULL)
        AND (:childId IS NULL OR EXISTS (SELECT 1 FROM child_guardians child_cg
          WHERE child_cg.guardian_id=pr.guardian_id AND child_cg.child_id=:childId))
        AND (:projectId IS NULL OR EXISTS (SELECT 1 FROM child_guardians cg JOIN child_enrollments e ON e.child_id=cg.child_id
          WHERE cg.guardian_id=pr.guardian_id AND e.project_id=:projectId AND e.superseded_at IS NULL)
          OR EXISTS (SELECT 1 FROM payment_receipt_payments rp JOIN payments p ON p.id=rp.payment_id AND p.deleted_at IS NULL
            WHERE rp.receipt_id=pr.id AND p.project_id_snapshot=:projectId))
        AND (:childId IS NULL OR pr.closed_at IS NULL OR NOT EXISTS (
          SELECT 1 FROM payment_receipt_payments linked WHERE linked.receipt_id=pr.id))
      ORDER BY pr.uploaded_at DESC,pr.id DESC`, { queueOnly, childId, projectId });
    return rows.map((row) => mapReceipt(row));
  }

  async function options(receipt, context) {
    const projectId = staffProject(context);
    const [rows] = await pool.query(`SELECT DISTINCT c.id child_id,c.full_name child_name,e.id enrollment_id,e.project_id,
      e.direction_id,d.name direction_name FROM child_guardians cg JOIN children c ON c.id=cg.child_id AND c.deleted_at IS NULL
      JOIN child_enrollments e ON e.child_id=c.id AND e.superseded_at IS NULL AND e.status='active'
      JOIN directions d ON d.id=e.direction_id WHERE cg.guardian_id=:guardianId
        AND (:projectId IS NULL OR e.project_id=:projectId) ORDER BY c.full_name,d.name,e.id`, {
      guardianId: receipt.guardian_id, projectId,
    });
    return Promise.all(rows.map(async (row) => ({
      childId: String(row.child_id), childName: row.child_name, enrollmentId: String(row.enrollment_id),
      projectId: String(row.project_id), directionId: String(row.direction_id), directionName: row.direction_name,
      ...(await payments.quote(row.enrollment_id)),
    })));
  }

  async function getStaff(receiptId, context = {}) {
    const receipt = await receiptForAccess(pool, receiptId, context);
    return { ...mapReceipt(receipt), options: await options(receipt, context) };
  }

  async function linkPayment(connection, receiptId, payment, context = {}) {
    const receipt = await receiptForAccess(connection, receiptId, context, { lock: true });
    const projectId = staffProject(context);
    if (projectId && String(payment.projectId) !== String(projectId)) throw new ApiProblem(403, 'FORBIDDEN', 'Оплата другого проекта недоступна');
    const [children] = await connection.query(`SELECT c.full_name child_name,d.name direction_name FROM child_guardians cg
      JOIN children c ON c.id=cg.child_id JOIN directions d ON d.id=:directionId
      WHERE cg.guardian_id=:guardianId AND cg.child_id=:childId LIMIT 1`, {
      guardianId: receipt.guardian_id, childId: payment.childId, directionId: payment.directionId,
    });
    if (!children.length) throw new ApiProblem(403, 'FORBIDDEN', 'Оплата не относится к ребёнку владельца чека');
    const [linked] = await connection.query(`INSERT IGNORE INTO payment_receipt_payments
      (receipt_id,payment_id,linked_by_user_id) VALUES (:receiptId,:paymentId,:userId)`, {
      receiptId: receipt.id, paymentId: payment.id, userId: identifier(context.userId, 'userId'),
    });
    if (!linked.affectedRows) return;
    if (parentNotifications) await parentNotifications.createForGuardian(connection, {
      guardianId: receipt.guardian_id, childId: payment.childId, type: 'payment_confirmed',
      data: { childName: children[0].child_name, directionName: children[0].direction_name, amount: payment.amount },
      referenceType: 'payment', referenceId: payment.id,
      dedupKey: `parent:payment_confirmed:${receipt.id}:${payment.id}`,
    });
    if (projectId && notificationEvents) for (const director of await notificationEvents.roleUsers(connection, 'director')) {
      await notificationEvents.createUser(connection, {
        userId: director.user_id, roleCode: 'director', type: 'director_partner_payment_confirmed',
        title: 'Партнёр подтвердил оплату',
        body: `${children[0].child_name} — ${children[0].direction_name} — ${payment.amount} ₽.`,
        entityType: 'payment', entityId: payment.id, destination: 'payments',
        dedupKey: `director:partner_payment_confirmed:${payment.id}`, referenceType: 'payment', referenceId: payment.id,
        actorUserId: context.userId,
      });
    }
  }

  const linkAfterCreate = (receiptId, context) => receiptId == null || receiptId === '' ? null
    : (connection, payment) => linkPayment(connection, identifier(receiptId, 'receiptId'), payment, context);

  async function applySubscription(receiptId, enrollmentId, context = {}) {
    const receipt = await receiptForAccess(pool, receiptId, context);
    const available = await options(receipt, context);
    const selected = available.find((item) => item.enrollmentId === identifier(enrollmentId, 'enrollmentId'));
    if (!selected) throw new ApiProblem(403, 'FORBIDDEN', 'Направление недоступно для этого чека');
    const receiptDate = receipt.uploaded_at instanceof Date ? businessDate(receipt.uploaded_at) : String(receipt.uploaded_at).slice(0, 10);
    return payments.create({
      enrollmentId: selected.enrollmentId, paidOn: receiptDate,
      amount: selected.subscriptionAmount, method: 'cashless', note: 'Зачислено по чеку родителя',
    }, {
      actorUserId: context.userId, idempotencyKey: context.idempotencyKey,
      afterCreate: linkAfterCreate(receipt.id, context),
    });
  }

  async function close(receiptId, context = {}) {
    await inTransaction(pool, async (connection) => {
      const receipt = await receiptForAccess(connection, receiptId, context, { lock: true });
      await connection.query(`UPDATE payment_receipts SET closed_at=COALESCE(closed_at,NOW(6)),
        closed_by_user_id=COALESCE(closed_by_user_id,:userId) WHERE id=:receiptId`, {
        receiptId: receipt.id, userId: identifier(context.userId, 'userId'),
      });
    });
    return null;
  }

  async function file(receiptId, context = {}, { parent = false } = {}) {
    const receipt = await receiptForAccess(pool, receiptId, context, { parent });
    try {
      return { data: await readFile(safePath(receipt.storage_key)), mimeType: receipt.mime_type,
        filename: receipt.original_filename || `payment-receipt-${receipt.id}.${receipt.mime_type === 'application/pdf' ? 'pdf' : receipt.mime_type === 'image/png' ? 'png' : 'jpg'}` };
    } catch (error) {
      if (error?.code === 'ENOENT') throw new ApiProblem(410, 'RECEIPT_FILE_MISSING', 'Файл чека больше недоступен');
      throw error;
    }
  }

  return {
    maxUploadBytes, upload, listParent, getParent, listStaff, getStaff, applySubscription, close, file,
    linkAfterCreate, linkPayment,
  };
}
