-- Фактические границы занятия хранятся отдельно от планового/перенесённого времени.
ALTER TABLE lessons
  ADD COLUMN scheduled_ends_at DATETIME(6) NULL AFTER scheduled_starts_at,
  ADD COLUMN actual_starts_at DATETIME(6) NULL AFTER ends_at,
  ADD COLUMN actual_ends_at DATETIME(6) NULL AFTER actual_starts_at;

UPDATE lessons SET scheduled_ends_at=ends_at WHERE scheduled_ends_at IS NULL;

ALTER TABLE lessons
  MODIFY scheduled_ends_at DATETIME(6) NOT NULL;

-- После reversal у одного attendance может появиться новый debit. Уникальность
-- активного эффекта обеспечивается транзакционной блокировкой attendance.
ALTER TABLE balance_entries
  DROP INDEX uq_balance_entries_attendance,
  ADD KEY idx_balance_entries_attendance (attendance_id, entry_type, created_at);
