-- Keep an explicit occurrence tombstone so recurring materialization cannot recreate it.
ALTER TABLE lessons
  ADD COLUMN deleted_at DATETIME(6) NULL AFTER cancelled_at,
  ADD KEY idx_lessons_deleted_occurrence (deleted_at, group_id, scheduled_starts_at);
