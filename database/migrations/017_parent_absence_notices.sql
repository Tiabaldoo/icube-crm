CREATE TABLE lesson_child_absence_notices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  lesson_id BIGINT UNSIGNED NOT NULL,
  child_id BIGINT UNSIGNED NOT NULL,
  guardian_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  cancelled_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_lesson_child_absence_notice (lesson_id, child_id),
  KEY idx_absence_notices_child_active (child_id, cancelled_at, lesson_id),
  CONSTRAINT fk_absence_notices_lesson FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
  CONSTRAINT fk_absence_notices_child FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  CONSTRAINT fk_absence_notices_guardian FOREIGN KEY (guardian_id) REFERENCES guardians(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
