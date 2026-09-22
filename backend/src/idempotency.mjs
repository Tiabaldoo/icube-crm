import { createHash } from 'node:crypto';
import { ApiProblem } from './catalog.mjs';

export function requireIdempotencyKey(value) {
  const key = String(value ?? '').trim();
  if (!key || key.length > 128) {
    throw new ApiProblem(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Для финансовой операции нужен Idempotency-Key');
  }
  return key;
}

export function scopedIdempotencyKey({ key, actorUserId, operation, projectId, entity }) {
  const raw = requireIdempotencyKey(key);
  const actor = String(actorUserId ?? '').trim();
  if (!actor) throw new ApiProblem(401, 'UNAUTHENTICATED', 'Для финансовой операции требуется пользователь');
  return createHash('sha256').update(JSON.stringify({ actor, operation, project: String(projectId ?? ''), entity: String(entity ?? ''), raw })).digest('hex');
}
