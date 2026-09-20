import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inTransaction } from './db.mjs';
import { ApiProblem } from './catalog.mjs';

const allowedMime = new Set(['image/jpeg', 'image/png', 'image/webp']);
const identifier = (value, field = 'id') => {
  const result = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(result)) throw new ApiProblem(400, 'VALIDATION_ERROR', `Некорректное поле ${field}`);
  return result;
};
const bool = (value) => value === true || value === 1 || value === '1';
const hasRole = (context, role) => (context.roles ?? []).includes(role);
const iso = (value) => value == null ? null : (value instanceof Date ? value.toISOString() : `${String(value).slice(0, 10)}T${String(value).slice(11, 19)}Z`);
const clientId = (value) => {
  const result = String(value ?? '').trim();
  if (!/^[A-Za-z0-9-]{8,80}$/.test(result)) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Некорректный идентификатор загрузки');
  return result;
};
const capturedTimestamp = (value) => {
  const result = new Date(String(value ?? ''));
  if (!Number.isFinite(result.getTime())) throw new ApiProblem(400, 'VALIDATION_ERROR', 'Некорректное время съёмки');
  return result;
};

export function detectImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: 'image/jpeg', extension: 'jpg' };
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', extension: 'png' };
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', extension: 'webp' };
  return null;
}

export function imageDimensions(buffer, mime) {
  if (mime === 'image/png' && buffer.length >= 24) return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  if (mime === 'image/webp' && buffer.length >= 30 && buffer.toString('ascii', 12, 16) === 'VP8X') {
    return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  }
  if (mime === 'image/jpeg') {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  return { width: null, height: null };
}

function safeOriginalFilename(value) {
  let decoded;
  try { decoded = decodeURIComponent(String(value ?? '')); } catch { decoded = String(value ?? ''); }
  decoded = decoded.replace(/\\/g, '/').trim().slice(0, 255);
  return decoded ? path.basename(decoded).replace(/[\u0000-\u001f\u007f]/g, '') || null : null;
}

function mapPhoto(row, context, lesson) {
  const teacherLessonAccess = hasRole(context, 'teacher')
    && [lesson.planned_teacher_id, lesson.actual_teacher_id].some((id) => String(id ?? '') === String(context.teacherId ?? ''));
  const canDelete = hasRole(context, 'director') || hasRole(context, 'partner') || teacherLessonAccess;
  const expired = row.purged_at != null || row.deleted_at != null || new Date(row.expires_at).getTime() <= Date.now();
  return {
    id: String(row.id), lessonId: String(row.lesson_id), childId: String(row.child_id), mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes), width: row.width == null ? null : Number(row.width), height: row.height == null ? null : Number(row.height),
    originalFilename: row.original_filename, uploadedAt: iso(row.uploaded_at ?? row.created_at), expiresAt: iso(row.expires_at),
    expired, canDelete, canReplace: !expired && canDelete,
    fileUrl: expired ? null : `/api/v1/lessons/${row.lesson_id}/photos/${row.id}/file`,
  };
}

export function createLessonPhotoService(pool, {
  storageDir = path.resolve(process.cwd(), 'var', 'lesson-photos'),
  retentionDays = 30,
  maxUploadBytes = 5 * 1024 * 1024,
  now = () => new Date(),
} = {}) {
  const root = path.resolve(storageDir);
  const safePath = (storageKey) => {
    const resolved = path.resolve(root, String(storageKey));
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new ApiProblem(500, 'PHOTO_STORAGE_KEY_INVALID', 'Некорректный ключ файла');
    return resolved;
  };
  async function lessonForAccess(connection, lessonId, context, { lock = false } = {}) {
    lessonId = identifier(lessonId, 'lessonId');
    const [rows] = await connection.query(`SELECT id,status,completed_at,project_id_snapshot,planned_teacher_id,actual_teacher_id
      FROM lessons WHERE id=:id AND deleted_at IS NULL${lock ? ' FOR UPDATE' : ''}`, { id: lessonId });
    const lesson = rows[0];
    if (!lesson) throw new ApiProblem(404, 'LESSON_NOT_FOUND', 'Занятие не найдено');
    if (hasRole(context, 'director')) return lesson;
    if (hasRole(context, 'partner')) {
      if (!(context.projectIds ?? []).map(String).includes(String(lesson.project_id_snapshot))) throw new ApiProblem(403, 'FORBIDDEN', 'Занятие другого проекта недоступно');
      return lesson;
    }
    if (hasRole(context, 'teacher') && [lesson.planned_teacher_id, lesson.actual_teacher_id].some((id) => String(id ?? '') === String(context.teacherId ?? ''))) return lesson;
    throw new ApiProblem(403, 'FORBIDDEN', 'Занятие недоступно');
  }
  async function list(lessonId, context = {}) {
    const lesson = await lessonForAccess(pool, lessonId, context);
    const [rows] = await pool.query(`SELECT * FROM lesson_photos WHERE lesson_id=:lessonId AND deleted_at IS NULL
      ORDER BY child_id,uploaded_at,id`, { lessonId: lesson.id });
    return rows.map((row) => mapPhoto(row, context, lesson));
  }
  async function upload(lessonId, { childId, buffer, mimeType, originalFilename, replacePhotoId = null, clientUploadId, capturedAt }, context = {}) {
    childId = identifier(childId, 'childId');
    clientUploadId = clientId(clientUploadId);
    capturedTimestamp(capturedAt);
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new ApiProblem(400, 'PHOTO_REQUIRED', 'Файл фотографии не передан');
    if (buffer.length > maxUploadBytes) throw new ApiProblem(413, 'PHOTO_TOO_LARGE', `После обработки фотография должна быть не больше ${Math.ceil(maxUploadBytes / 1024 / 1024)} МБ`);
    const detected = detectImage(buffer);
    if (!detected || !allowedMime.has(mimeType) || detected.mime !== mimeType) throw new ApiProblem(415, 'PHOTO_TYPE_INVALID', 'Разрешены только JPEG, PNG и WebP');
    const dimensions = imageDimensions(buffer, detected.mime);
    const uploadedAt = now();
    const expiresAt = new Date(uploadedAt.getTime() + retentionDays * 86400000);
    const dateFolder = uploadedAt.toISOString().slice(0, 7).replace('-', '/');
    const storageKey = `${dateFolder}/${randomUUID()}.${detected.extension}`;
    const destination = safePath(storageKey); const temporary = `${destination}.tmp`;
    let replacedStorageKey = null; let createdId; let fileStored = false;
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(temporary, buffer, { flag: 'wx', mode: 0o600 });
    try {
      createdId = await inTransaction(pool, async (connection) => {
        const lesson = await lessonForAccess(connection, lessonId, context, { lock: true });
        const actorId = identifier(context.userId, 'userId');
        const [duplicates] = await connection.query('SELECT * FROM lesson_photos WHERE client_upload_id=:clientUploadId FOR UPDATE', { clientUploadId });
        if (duplicates.length) {
          const existing = duplicates[0];
          if (String(existing.lesson_id) !== String(lesson.id) || String(existing.child_id) !== childId || String(existing.uploaded_by_user_id) !== actorId) {
            throw new ApiProblem(409, 'PHOTO_UPLOAD_ID_CONFLICT', 'Идентификатор загрузки уже использован');
          }
          if (existing.deleted_at != null) throw new ApiProblem(409, 'PHOTO_ALREADY_DELETED', 'Эта фотография уже была удалена');
          return String(existing.id);
        }
        const [present] = await connection.query(`SELECT a.id FROM attendances a WHERE a.lesson_id=:lessonId
          AND a.child_id=:childId AND a.present=TRUE LIMIT 1`, { lessonId: lesson.id, childId });
        if (!present.length) throw new ApiProblem(409, 'CHILD_NOT_PRESENT', 'Фотографию можно добавить только присутствующему ребёнку');
        let replacement = null;
        if (replacePhotoId != null && replacePhotoId !== '') {
          const [rows] = await connection.query(`SELECT * FROM lesson_photos WHERE id=:photoId AND lesson_id=:lessonId
            AND child_id=:childId AND deleted_at IS NULL FOR UPDATE`, { photoId: identifier(replacePhotoId, 'replacePhotoId'), lessonId: lesson.id, childId });
          replacement = rows[0];
          if (!replacement) throw new ApiProblem(404, 'PHOTO_NOT_FOUND', 'Заменяемая фотография не найдена');
          if (!mapPhoto(replacement, context, lesson).canReplace) throw new ApiProblem(403, 'FORBIDDEN', 'Заменить эту фотографию нельзя');
        }
        const [counts] = await connection.query(`SELECT COUNT(*) count FROM lesson_photos
          WHERE lesson_id=:lessonId AND child_id=:childId AND deleted_at IS NULL
            AND purged_at IS NULL AND expires_at>NOW(6) FOR UPDATE`, { lessonId: lesson.id, childId });
        if (Number(counts[0]?.count ?? 0) - (replacement ? 1 : 0) >= 5) throw new ApiProblem(409, 'PHOTO_LIMIT', 'Можно загрузить не больше 5 фотографий ребёнка за занятие');
        await rename(temporary, destination);
        fileStored = true;
        const [result] = await connection.query(`INSERT INTO lesson_photos
          (lesson_id,child_id,storage_key,mime_type,size_bytes,client_upload_id,original_filename,width,height,uploaded_by_user_id,uploaded_at,expires_at)
          VALUES (:lessonId,:childId,:storageKey,:mimeType,:sizeBytes,:clientUploadId,:originalFilename,:width,:height,:actorId,:uploadedAt,:expiresAt)`, {
          lessonId: lesson.id, childId, storageKey, mimeType: detected.mime, sizeBytes: buffer.length,
          originalFilename: safeOriginalFilename(originalFilename), width: dimensions.width, height: dimensions.height,
          clientUploadId, actorId, uploadedAt, expiresAt,
        });
        if (replacement) {
          replacedStorageKey = replacement.storage_key;
          await connection.query('UPDATE lesson_photos SET deleted_at=NOW(6) WHERE id=:id', { id: replacement.id });
        }
        return String(result.insertId);
      });
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => {});
      await rm(destination, { force: true }).catch(() => {});
      throw error;
    }
    if (!fileStored) await rm(temporary, { force: true }).catch(() => {});
    if (replacedStorageKey) await rm(safePath(replacedStorageKey), { force: true }).catch(() => {});
    const photos = await list(lessonId, context);
    return photos.find((photo) => photo.id === createdId);
  }
  async function remove(lessonId, photoId, context = {}) {
    let storageKey;
    await inTransaction(pool, async (connection) => {
      const lesson = await lessonForAccess(connection, lessonId, context, { lock: true });
      const [rows] = await connection.query(`SELECT * FROM lesson_photos WHERE id=:photoId AND lesson_id=:lessonId
        AND deleted_at IS NULL FOR UPDATE`, { photoId: identifier(photoId, 'photoId'), lessonId: lesson.id });
      const photo = rows[0];
      if (!photo) throw new ApiProblem(404, 'PHOTO_NOT_FOUND', 'Фотография не найдена');
      if (!mapPhoto(photo, context, lesson).canDelete) throw new ApiProblem(403, 'FORBIDDEN', 'Удалить эту фотографию нельзя');
      storageKey = photo.storage_key;
      await connection.query('UPDATE lesson_photos SET deleted_at=NOW(6) WHERE id=:id', { id: photo.id });
    });
    try {
      await rm(safePath(storageKey), { force: true });
      await pool.query('UPDATE lesson_photos SET purged_at=NOW(6) WHERE id=:id', { id: identifier(photoId, 'photoId') });
    } catch { /* Metadata is already inaccessible; cleanup retries physical deletion. */ }
    return null;
  }
  async function file(lessonId, photoId, context = {}) {
    const lesson = await lessonForAccess(pool, lessonId, context);
    const [rows] = await pool.query(`SELECT * FROM lesson_photos WHERE id=:photoId AND lesson_id=:lessonId
      AND deleted_at IS NULL`, { photoId: identifier(photoId, 'photoId'), lessonId: lesson.id });
    const photo = rows[0];
    if (!photo) throw new ApiProblem(404, 'PHOTO_NOT_FOUND', 'Фотография не найдена');
    if (photo.purged_at != null || new Date(photo.expires_at).getTime() <= now().getTime()) throw new ApiProblem(410, 'PHOTO_EXPIRED', 'Срок хранения фотографии истёк');
    try {
      const data = await readFile(safePath(photo.storage_key));
      return { data, mimeType: photo.mime_type, filename: photo.original_filename || `lesson-${lesson.id}-photo-${photo.id}.${detectImage(data)?.extension ?? 'jpg'}` };
    } catch (error) {
      if (error?.code === 'ENOENT') throw new ApiProblem(410, 'PHOTO_FILE_MISSING', 'Файл фотографии больше недоступен');
      throw error;
    }
  }
  async function fileForParent(photoId, context = {}) {
    if (!(context.roles ?? []).includes('parent') || (context.roles ?? []).some((role) => ['director', 'partner', 'teacher'].includes(role))) {
      throw new ApiProblem(403, 'FORBIDDEN', 'Фотография недоступна');
    }
    const [rows] = await pool.query(`SELECT ph.* FROM lesson_photos ph
      JOIN guardians g ON g.user_id=:userId JOIN child_guardians cg ON cg.guardian_id=g.id AND cg.child_id=ph.child_id
      JOIN lessons l ON l.id=ph.lesson_id AND l.deleted_at IS NULL
      WHERE ph.id=:photoId AND ph.deleted_at IS NULL LIMIT 1`, {
      userId: identifier(context.userId, 'userId'), photoId: identifier(photoId, 'photoId'),
    });
    const photo = rows[0];
    if (!photo) throw new ApiProblem(404, 'PHOTO_NOT_FOUND', 'Фотография не найдена');
    if (photo.purged_at != null || new Date(photo.expires_at).getTime() <= now().getTime()) throw new ApiProblem(410, 'PHOTO_EXPIRED', 'Срок хранения фотографии истёк');
    try {
      const data = await readFile(safePath(photo.storage_key));
      return { data, mimeType: photo.mime_type, filename: photo.original_filename || `lesson-${photo.lesson_id}-photo-${photo.id}.${detectImage(data)?.extension ?? 'jpg'}` };
    } catch (error) {
      if (error?.code === 'ENOENT') throw new ApiProblem(410, 'PHOTO_FILE_MISSING', 'Файл фотографии больше недоступен');
      throw error;
    }
  }
  async function purgeLesson(connection, lessonId) {
    const [rows] = await connection.query('SELECT storage_key FROM lesson_photos WHERE lesson_id=:lessonId', { lessonId });
    for (const row of rows) await rm(safePath(row.storage_key), { force: true });
    await connection.query('DELETE FROM lesson_photos WHERE lesson_id=:lessonId', { lessonId });
  }
  async function cleanupExpired({ limit = 500 } = {}) {
    const [rows] = await pool.query(`SELECT id,storage_key FROM lesson_photos
      WHERE purged_at IS NULL AND (expires_at<=NOW(6) OR deleted_at IS NOT NULL)
      ORDER BY COALESCE(expires_at,deleted_at),id LIMIT ${Math.max(1, Math.min(5000, Number(limit) || 500))}`);
    let purged = 0; const failed = [];
    for (const row of rows) {
      try {
        await rm(safePath(row.storage_key), { force: true });
        await pool.query('UPDATE lesson_photos SET purged_at=NOW(6) WHERE id=:id', { id: row.id });
        purged += 1;
      } catch (error) { failed.push({ id: String(row.id), message: error.message }); }
    }
    return { selected: rows.length, purged, failed };
  }
  async function storageHealth() { await mkdir(root, { recursive: true }); return stat(root); }
  return { maxUploadBytes, list, upload, remove, file, fileForParent, purgeLesson, cleanupExpired, storageHealth };
}
