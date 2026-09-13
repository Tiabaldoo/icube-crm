import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('initial migration содержит все критические сущности и не содержит разрушительных команд', async () => {
  const sql = await readFile(new URL('../database/migrations/001_initial.sql', import.meta.url), 'utf8');
  const requiredTables = [
    'roles', 'users', 'user_roles', 'auth_sessions', 'partners', 'partner_users', 'children', 'guardians', 'child_guardians',
    'child_user_accounts', 'directions', 'sites', 'teachers', 'teacher_directions', 'projects',
    'study_groups', 'child_enrollments', 'child_status_history', 'enrollment_status_history', 'group_memberships', 'price_versions', 'lessons',
    'lesson_roster_members', 'attendances', 'lesson_photos', 'payments', 'refunds',
    'balance_transfers', 'balance_entries', 'balance_lots', 'balance_lot_consumptions',
    'salary_rate_versions', 'salary_accruals', 'partner_agreement_versions',
    'partner_settlements', 'notifications', 'idempotency_keys', 'audit_log',
  ];
  for (const table of requiredTables) {
    assert.match(sql, new RegExp(`CREATE TABLE ${table}\\s*\\(`), `нет таблицы ${table}`);
  }
  assert.doesNotMatch(sql, /\b(?:DROP\s+(?:DATABASE|TABLE)|TRUNCATE|DELETE\s+FROM)\b/i);
  assert.match(sql, /UNIQUE KEY uq_balance_entries_attendance \(attendance_id\)/);
  assert.match(sql, /'director'.*'teacher'.*'partner'.*'parent'.*'child'/s);
  assert.doesNotMatch(sql, /school_shift/i);
  assert.match(sql, /needs_director_review BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(sql, /created_from_lesson_id BIGINT UNSIGNED NULL/);
  assert.match(sql, /full_name VARCHAR\(255\) NULL,[\s\S]*?CONSTRAINT fk_guardians_user/);
  assert.match(sql, /PRIMARY KEY \(partner_id, user_id\)/);

  const preciseLessonColumns = [
    'balance_lessons', 'charged_lessons', 'lessons_credit', 'lessons_debit',
    'target_lessons_credit', 'lessons_delta', 'original_lessons', 'remaining_lessons', 'lessons',
  ];
  for (const column of preciseLessonColumns) {
    assert.match(sql, new RegExp(`${column}\\s+DECIMAL\\(16,8\\)`), `${column} должен иметь точность DECIMAL(16,8)`);
  }
});
