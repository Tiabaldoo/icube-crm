ALTER TABLE lesson_photos
  ADD COLUMN client_upload_id VARCHAR(80) NULL AFTER size_bytes,
  ADD COLUMN original_filename VARCHAR(255) NULL AFTER client_upload_id,
  ADD COLUMN width INT UNSIGNED NULL AFTER original_filename,
  ADD COLUMN height INT UNSIGNED NULL AFTER width,
  ADD COLUMN uploaded_at DATETIME(6) NULL AFTER uploaded_by_user_id,
  ADD COLUMN expires_at DATETIME(6) NULL AFTER uploaded_at,
  ADD COLUMN purged_at DATETIME(6) NULL AFTER expires_at;

UPDATE lesson_photos
SET uploaded_at=created_at,
    expires_at=DATE_ADD(created_at,INTERVAL 30 DAY)
WHERE uploaded_at IS NULL OR expires_at IS NULL;

ALTER TABLE lesson_photos
  MODIFY uploaded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  MODIFY expires_at DATETIME(6) NOT NULL,
  ADD UNIQUE KEY uq_lesson_photos_client_upload (client_upload_id),
  ADD KEY idx_lesson_photos_lesson_child (lesson_id,child_id,deleted_at,uploaded_at),
  ADD KEY idx_lesson_photos_expiry (purged_at,expires_at,deleted_at);
