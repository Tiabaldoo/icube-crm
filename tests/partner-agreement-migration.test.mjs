import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('partner migration создаёт только условную стартовую версию zebra без фиктивного партнёра', async () => {
  const sql = await readFile(new URL('../database/migrations/005_partner_agreements.sql', import.meta.url), 'utf8');
  assert.match(sql, /MODIFY created_by_user_id BIGINT UNSIGNED NULL/);
  assert.match(sql, /p\.code='zebra'/);
  assert.match(sql, /p\.partner_id IS NOT NULL/);
  assert.match(sql, /4\.000, 40\.000, 60\.000/);
  assert.match(sql, /NOT EXISTS/);
  assert.doesNotMatch(sql, /INSERT INTO partners/i);
  assert.doesNotMatch(sql, /\b(?:DROP\s+(?:DATABASE|TABLE)|TRUNCATE|DELETE\s+FROM)\b/i);
});
