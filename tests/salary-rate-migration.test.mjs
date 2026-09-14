import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('salary migration разрешает unauthenticated actor и создаёт только отсутствующую глобальную ставку', async () => {
  const sql = await readFile(new URL('../database/migrations/004_salary_rates.sql', import.meta.url), 'utf8');
  assert.match(sql, /MODIFY created_by_user_id BIGINT UNSIGNED NULL/);
  assert.match(sql, /600\.00, 100\.00, 600\.00, 300\.00/);
  assert.match(sql, /teacher_id IS NULL AND direction_id IS NULL AND valid_to IS NULL/);
  assert.doesNotMatch(sql, /\b(?:DROP\s+(?:DATABASE|TABLE)|TRUNCATE|DELETE\s+FROM)\b/i);
});
