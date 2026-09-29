-- Backward-compatible defaults: one primary slot, package of 4, standard calculation.
ALTER TABLE study_groups
  ADD COLUMN is_individual BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN package_lesson_count SMALLINT UNSIGNED NOT NULL DEFAULT 4,
  ADD COLUMN calculation_mode VARCHAR(24) NOT NULL DEFAULT 'standard',
  ADD COLUMN teacher_share_percent DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN partner_share_percent DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN custom_tax_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD CONSTRAINT chk_group_advanced CHECK (
    package_lesson_count BETWEEN 1 AND 1000 AND NOT (is_individual AND is_mixed)
    AND calculation_mode IN ('standard','attendance_share')
    AND (calculation_mode='standard' OR is_individual)
    AND teacher_share_percent>=0 AND partner_share_percent>=0
    AND teacher_share_percent+partner_share_percent<=100
  );
CREATE TABLE group_schedule_slots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  group_id BIGINT UNSIGNED NOT NULL,
  weekday TINYINT UNSIGNED NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_group_extra_slot (group_id,weekday,start_time),
  CONSTRAINT chk_group_extra_slot CHECK (weekday BETWEEN 1 AND 7 AND end_time>start_time),
  CONSTRAINT fk_group_extra_slot FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
ALTER TABLE lessons
  ADD COLUMN calculation_mode_snapshot VARCHAR(24) NOT NULL DEFAULT 'standard',
  ADD COLUMN teacher_share_percent_snapshot DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN partner_share_percent_snapshot DECIMAL(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN custom_tax_enabled_snapshot BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN tax_percent_snapshot DECIMAL(6,3) NULL DEFAULT 0,
  ADD CONSTRAINT chk_lesson_shares CHECK (calculation_mode_snapshot IN ('standard','attendance_share')
    AND teacher_share_percent_snapshot>=0 AND partner_share_percent_snapshot>=0
    AND teacher_share_percent_snapshot+partner_share_percent_snapshot<=100 AND tax_percent_snapshot BETWEEN 0 AND 100);
ALTER TABLE payments ADD COLUMN calculation_mode_snapshot VARCHAR(24) NOT NULL DEFAULT 'standard',
  ADD CONSTRAINT chk_payment_calculation_mode CHECK (calculation_mode_snapshot IN ('standard','attendance_share'));
-- Existing accruals remain untouched; custom salary uses the same history/reversal mechanism.
ALTER TABLE salary_accruals DROP CHECK chk_salary_accruals_type;
ALTER TABLE salary_accruals ADD CONSTRAINT chk_salary_accruals_type CHECK (accrual_type IN ('regular','intro','empty_trip','attendance_share'));
