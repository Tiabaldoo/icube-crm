-- До полноценной авторизации development/test могут сохранять настройки без user_id.
ALTER TABLE salary_rate_versions
  MODIFY created_by_user_id BIGINT UNSIGNED NULL;

-- Базовые ставки из действующего прототипа, если глобальная активная версия ещё не создана.
INSERT INTO salary_rate_versions
  (teacher_id, direction_id, regular_fixed, per_present_child, intro_fixed, empty_trip_fixed, valid_from, created_by_user_id)
SELECT NULL, NULL, 600.00, 100.00, 600.00, 300.00, '2026-01-01 00:00:00', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM salary_rate_versions
  WHERE teacher_id IS NULL AND direction_id IS NULL AND valid_to IS NULL
);
