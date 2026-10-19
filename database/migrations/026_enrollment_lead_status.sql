-- Extend validation only. Existing statuses and memberships are unchanged.
ALTER TABLE child_enrollments
  DROP CHECK chk_child_enrollments_status,
  ADD CONSTRAINT chk_child_enrollments_status CHECK (status IN ('active','paused','finished','lead'));
ALTER TABLE enrollment_status_history
  DROP CHECK chk_enrollment_status_history_old,
  DROP CHECK chk_enrollment_status_history_new,
  ADD CONSTRAINT chk_enrollment_status_history_old CHECK (old_status IS NULL OR old_status IN ('active','paused','finished','lead')),
  ADD CONSTRAINT chk_enrollment_status_history_new CHECK (new_status IN ('active','paused','finished','lead'));
