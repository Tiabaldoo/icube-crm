SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_code (code),
  CONSTRAINT chk_roles_code CHECK (code IN ('director','teacher','partner','parent','child'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO roles (code, name) VALUES
  ('director', 'Директор'),
  ('teacher', 'Преподаватель'),
  ('partner', 'Партнёр'),
  ('parent', 'Родитель'),
  ('child', 'Ребёнок');

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(254) NULL,
  phone VARCHAR(32) NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  token_version INT UNSIGNED NOT NULL DEFAULT 1,
  last_login_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_phone (phone),
  CONSTRAINT chk_users_status CHECK (status IN ('invited','active','blocked','archived'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE user_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  granted_by_user_id BIGINT UNSIGNED NULL,
  granted_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_user_roles_granted_by FOREIGN KEY (granted_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE auth_sessions (
  id BINARY(16) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  refresh_token_hash CHAR(64) NOT NULL,
  user_agent VARCHAR(512) NULL,
  ip_address VARBINARY(16) NULL,
  expires_at DATETIME(6) NOT NULL,
  revoked_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_auth_sessions_refresh_hash (refresh_token_hash),
  KEY idx_auth_sessions_user_expires (user_id, expires_at),
  CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE partners (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  legal_name VARCHAR(255) NULL,
  phone VARCHAR(32) NULL,
  email VARCHAR(254) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE partner_users (
  partner_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (partner_id, user_id),
  KEY idx_partner_users_user (user_id, partner_id),
  CONSTRAINT fk_partner_users_partner FOREIGN KEY (partner_id) REFERENCES partners(id),
  CONSTRAINT fk_partner_users_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE projects (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  partner_id BIGINT UNSIGNED NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_projects_code (code),
  CONSTRAINT fk_projects_partner FOREIGN KEY (partner_id) REFERENCES partners(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE directions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_directions_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sites (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  short_name VARCHAR(100) NULL,
  type VARCHAR(100) NULL,
  address VARCHAR(500) NULL,
  note TEXT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE teachers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(32) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_teachers_user (user_id),
  CONSTRAINT fk_teachers_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE teacher_directions (
  teacher_id BIGINT UNSIGNED NOT NULL,
  direction_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (teacher_id, direction_id),
  CONSTRAINT fk_teacher_directions_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id),
  CONSTRAINT fk_teacher_directions_direction FOREIGN KEY (direction_id) REFERENCES directions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE children (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(255) NOT NULL,
  birth_date DATE NULL,
  school VARCHAR(255) NULL,
  grade VARCHAR(32) NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'lead',
  note TEXT NULL,
  needs_director_review BOOLEAN NOT NULL DEFAULT FALSE,
  created_from_lesson_id BIGINT UNSIGNED NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  KEY idx_children_name (full_name),
  KEY idx_children_status (status),
  KEY idx_children_review (needs_director_review, created_at),
  KEY idx_children_created_from_lesson (created_from_lesson_id),
  CONSTRAINT chk_children_status CHECK (status IN ('lead','active','paused','finished','archived')),
  CONSTRAINT fk_children_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE guardians (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  full_name VARCHAR(255) NULL,
  phone VARCHAR(32) NULL,
  email VARCHAR(254) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_guardians_user (user_id),
  CONSTRAINT fk_guardians_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE child_guardians (
  child_id BIGINT UNSIGNED NOT NULL,
  guardian_id BIGINT UNSIGNED NOT NULL,
  relationship VARCHAR(64) NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  can_receive_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (child_id, guardian_id),
  CONSTRAINT fk_child_guardians_child FOREIGN KEY (child_id) REFERENCES children(id),
  CONSTRAINT fk_child_guardians_guardian FOREIGN KEY (guardian_id) REFERENCES guardians(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE child_user_accounts (
  child_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (child_id),
  UNIQUE KEY uq_child_user_accounts_user (user_id),
  CONSTRAINT fk_child_user_accounts_child FOREIGN KEY (child_id) REFERENCES children(id),
  CONSTRAINT fk_child_user_accounts_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE study_groups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  direction_id BIGINT UNSIGNED NOT NULL,
  site_id BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NOT NULL,
  default_teacher_id BIGINT UNSIGNED NOT NULL,
  weekday TINYINT UNSIGNED NOT NULL COMMENT '1=Monday, 7=Sunday',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  KEY idx_study_groups_schedule (weekday, start_time),
  KEY idx_study_groups_direction_active (direction_id, active),
  CONSTRAINT chk_study_groups_weekday CHECK (weekday BETWEEN 1 AND 7),
  CONSTRAINT chk_study_groups_times CHECK (end_time > start_time),
  CONSTRAINT chk_study_groups_dates CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT fk_study_groups_direction FOREIGN KEY (direction_id) REFERENCES directions(id),
  CONSTRAINT fk_study_groups_site FOREIGN KEY (site_id) REFERENCES sites(id),
  CONSTRAINT fk_study_groups_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_study_groups_teacher FOREIGN KEY (default_teacher_id) REFERENCES teachers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE child_enrollments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  child_id BIGINT UNSIGNED NOT NULL,
  direction_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  individual_price DECIMAL(13,2) NULL,
  balance_lessons DECIMAL(16,8) NOT NULL DEFAULT 0,
  started_on DATE NOT NULL,
  ended_on DATE NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_child_enrollments_child_direction (child_id, direction_id),
  KEY idx_child_enrollments_status (status),
  CONSTRAINT chk_child_enrollments_status CHECK (status IN ('active','paused','finished')),
  CONSTRAINT chk_child_enrollments_price CHECK (individual_price IS NULL OR individual_price > 0),
  CONSTRAINT chk_child_enrollments_dates CHECK (ended_on IS NULL OR ended_on >= started_on),
  CONSTRAINT fk_child_enrollments_child FOREIGN KEY (child_id) REFERENCES children(id),
  CONSTRAINT fk_child_enrollments_direction FOREIGN KEY (direction_id) REFERENCES directions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE group_memberships (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  enrollment_id BIGINT UNSIGNED NOT NULL,
  group_id BIGINT UNSIGNED NOT NULL,
  started_on DATE NOT NULL,
  ended_on DATE NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_group_memberships_group_dates (group_id, started_on, ended_on),
  KEY idx_group_memberships_enrollment_dates (enrollment_id, started_on, ended_on),
  CONSTRAINT chk_group_memberships_dates CHECK (ended_on IS NULL OR ended_on >= started_on),
  CONSTRAINT fk_group_memberships_enrollment FOREIGN KEY (enrollment_id) REFERENCES child_enrollments(id),
  CONSTRAINT fk_group_memberships_group FOREIGN KEY (group_id) REFERENCES study_groups(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE price_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scope_type VARCHAR(24) NOT NULL,
  direction_id BIGINT UNSIGNED NULL,
  group_id BIGINT UNSIGNED NULL,
  enrollment_id BIGINT UNSIGNED NULL,
  price DECIMAL(13,2) NOT NULL,
  valid_from DATETIME(6) NOT NULL,
  valid_to DATETIME(6) NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_price_versions_direction (direction_id, valid_from, valid_to),
  KEY idx_price_versions_group (group_id, valid_from, valid_to),
  KEY idx_price_versions_enrollment (enrollment_id, valid_from, valid_to),
  CONSTRAINT chk_price_versions_scope CHECK (
    (scope_type='direction' AND direction_id IS NOT NULL AND group_id IS NULL AND enrollment_id IS NULL) OR
    (scope_type='group' AND direction_id IS NULL AND group_id IS NOT NULL AND enrollment_id IS NULL) OR
    (scope_type='enrollment' AND direction_id IS NULL AND group_id IS NULL AND enrollment_id IS NOT NULL)
  ),
  CONSTRAINT chk_price_versions_price CHECK (price > 0),
  CONSTRAINT chk_price_versions_dates CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT fk_price_versions_direction FOREIGN KEY (direction_id) REFERENCES directions(id),
  CONSTRAINT fk_price_versions_group FOREIGN KEY (group_id) REFERENCES study_groups(id),
  CONSTRAINT fk_price_versions_enrollment FOREIGN KEY (enrollment_id) REFERENCES child_enrollments(id),
  CONSTRAINT fk_price_versions_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE lessons (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  group_id BIGINT UNSIGNED NOT NULL,
  scheduled_starts_at DATETIME(6) NOT NULL,
  starts_at DATETIME(6) NOT NULL,
  ends_at DATETIME(6) NOT NULL,
  planned_teacher_id BIGINT UNSIGNED NOT NULL,
  actual_teacher_id BIGINT UNSIGNED NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'scheduled',
  topic TEXT NULL,
  is_intro_group BOOLEAN NOT NULL DEFAULT FALSE,
  is_empty_trip BOOLEAN NOT NULL DEFAULT FALSE,
  roster_frozen_at DATETIME(6) NULL,
  attendance_applied_at DATETIME(6) NULL,
  completed_at DATETIME(6) NULL,
  cancelled_at DATETIME(6) NULL,
  lock_version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_lessons_occurrence (group_id, scheduled_starts_at),
  KEY idx_lessons_actual_teacher_start (actual_teacher_id, starts_at),
  KEY idx_lessons_status_start (status, starts_at),
  CONSTRAINT chk_lessons_status CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  CONSTRAINT chk_lessons_times CHECK (ends_at > starts_at),
  CONSTRAINT fk_lessons_group FOREIGN KEY (group_id) REFERENCES study_groups(id),
  CONSTRAINT fk_lessons_planned_teacher FOREIGN KEY (planned_teacher_id) REFERENCES teachers(id),
  CONSTRAINT fk_lessons_actual_teacher FOREIGN KEY (actual_teacher_id) REFERENCES teachers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE children
  ADD CONSTRAINT fk_children_created_from_lesson
  FOREIGN KEY (created_from_lesson_id) REFERENCES lessons(id);

CREATE TABLE child_status_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  child_id BIGINT UNSIGNED NOT NULL,
  old_status VARCHAR(24) NULL,
  new_status VARCHAR(24) NOT NULL,
  project_id_snapshot BIGINT UNSIGNED NULL,
  direction_id_snapshot BIGINT UNSIGNED NULL,
  group_id_snapshot BIGINT UNSIGNED NULL,
  changed_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  changed_by_user_id BIGINT UNSIGNED NULL,
  note TEXT NULL,
  PRIMARY KEY (id),
  KEY idx_child_status_history_child_time (child_id, changed_at, id),
  KEY idx_child_status_history_stats (new_status, changed_at, project_id_snapshot),
  CONSTRAINT chk_child_status_history_old CHECK (old_status IS NULL OR old_status IN ('lead','active','paused','finished','archived')),
  CONSTRAINT chk_child_status_history_new CHECK (new_status IN ('lead','active','paused','finished','archived')),
  CONSTRAINT fk_child_status_history_child FOREIGN KEY (child_id) REFERENCES children(id),
  CONSTRAINT fk_child_status_history_project FOREIGN KEY (project_id_snapshot) REFERENCES projects(id),
  CONSTRAINT fk_child_status_history_direction FOREIGN KEY (direction_id_snapshot) REFERENCES directions(id),
  CONSTRAINT fk_child_status_history_group FOREIGN KEY (group_id_snapshot) REFERENCES study_groups(id),
  CONSTRAINT fk_child_status_history_changed_by FOREIGN KEY (changed_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE enrollment_status_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  enrollment_id BIGINT UNSIGNED NOT NULL,
  old_status VARCHAR(24) NULL,
  new_status VARCHAR(24) NOT NULL,
  direction_id_snapshot BIGINT UNSIGNED NOT NULL,
  group_id_snapshot BIGINT UNSIGNED NULL,
  project_id_snapshot BIGINT UNSIGNED NULL,
  changed_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  changed_by_user_id BIGINT UNSIGNED NULL,
  note TEXT NULL,
  PRIMARY KEY (id),
  KEY idx_enrollment_status_history_time (enrollment_id, changed_at, id),
  KEY idx_enrollment_status_history_stats (new_status, changed_at, project_id_snapshot),
  CONSTRAINT chk_enrollment_status_history_old CHECK (old_status IS NULL OR old_status IN ('active','paused','finished')),
  CONSTRAINT chk_enrollment_status_history_new CHECK (new_status IN ('active','paused','finished')),
  CONSTRAINT fk_enrollment_status_history_enrollment FOREIGN KEY (enrollment_id) REFERENCES child_enrollments(id),
  CONSTRAINT fk_enrollment_status_history_direction FOREIGN KEY (direction_id_snapshot) REFERENCES directions(id),
  CONSTRAINT fk_enrollment_status_history_group FOREIGN KEY (group_id_snapshot) REFERENCES study_groups(id),
  CONSTRAINT fk_enrollment_status_history_project FOREIGN KEY (project_id_snapshot) REFERENCES projects(id),
  CONSTRAINT fk_enrollment_status_history_changed_by FOREIGN KEY (changed_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE lesson_roster_members (
  lesson_id BIGINT UNSIGNED NOT NULL,
  child_id BIGINT UNSIGNED NOT NULL,
  roster_type VARCHAR(16) NOT NULL,
  added_by_user_id BIGINT UNSIGNED NULL,
  frozen_at DATETIME(6) NOT NULL,
  PRIMARY KEY (lesson_id, child_id),
  CONSTRAINT chk_lesson_roster_type CHECK (roster_type IN ('main','extra')),
  CONSTRAINT fk_lesson_roster_lesson FOREIGN KEY (lesson_id) REFERENCES lessons(id),
  CONSTRAINT fk_lesson_roster_child FOREIGN KEY (child_id) REFERENCES children(id),
  CONSTRAINT fk_lesson_roster_added_by FOREIGN KEY (added_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE attendances (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  lesson_id BIGINT UNSIGNED NOT NULL,
  child_id BIGINT UNSIGNED NOT NULL,
  enrollment_id BIGINT UNSIGNED NULL,
  attendance_type VARCHAR(16) NOT NULL,
  present BOOLEAN NOT NULL DEFAULT FALSE,
  is_trial BOOLEAN NOT NULL DEFAULT FALSE,
  price_snapshot DECIMAL(13,2) NULL,
  charged_lessons DECIMAL(16,8) NOT NULL DEFAULT 0,
  marked_by_user_id BIGINT UNSIGNED NULL,
  marked_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_attendances_lesson_child (lesson_id, child_id),
  KEY idx_attendances_child (child_id, lesson_id),
  CONSTRAINT chk_attendances_type CHECK (attendance_type IN ('main','extra')),
  CONSTRAINT chk_attendances_charge CHECK (charged_lessons >= 0 AND (is_trial=FALSE OR charged_lessons=0)),
  CONSTRAINT fk_attendances_lesson FOREIGN KEY (lesson_id) REFERENCES lessons(id),
  CONSTRAINT fk_attendances_child FOREIGN KEY (child_id) REFERENCES children(id),
  CONSTRAINT fk_attendances_enrollment FOREIGN KEY (enrollment_id) REFERENCES child_enrollments(id),
  CONSTRAINT fk_attendances_marked_by FOREIGN KEY (marked_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE lesson_photos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  lesson_id BIGINT UNSIGNED NOT NULL,
  child_id BIGINT UNSIGNED NULL,
  storage_key VARCHAR(512) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  uploaded_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  KEY idx_lesson_photos_lesson (lesson_id),
  CONSTRAINT fk_lesson_photos_lesson FOREIGN KEY (lesson_id) REFERENCES lessons(id),
  CONSTRAINT fk_lesson_photos_child FOREIGN KEY (child_id) REFERENCES children(id),
  CONSTRAINT fk_lesson_photos_uploaded_by FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  enrollment_id BIGINT UNSIGNED NOT NULL,
  child_id BIGINT UNSIGNED NOT NULL,
  direction_id BIGINT UNSIGNED NOT NULL,
  group_id_snapshot BIGINT UNSIGNED NULL,
  project_id_snapshot BIGINT UNSIGNED NULL,
  paid_on DATE NOT NULL,
  amount DECIMAL(13,2) NOT NULL,
  price_snapshot DECIMAL(13,2) NOT NULL,
  lessons_credit DECIMAL(16,8) NOT NULL,
  method VARCHAR(32) NOT NULL,
  external_reference VARCHAR(255) NULL,
  note TEXT NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  KEY idx_payments_child_date (child_id, paid_on),
  KEY idx_payments_project_date (project_id_snapshot, paid_on),
  CONSTRAINT chk_payments_values CHECK (amount > 0 AND price_snapshot > 0 AND lessons_credit > 0),
  CONSTRAINT chk_payments_method CHECK (method IN ('cash','cashless','other')),
  CONSTRAINT fk_payments_enrollment FOREIGN KEY (enrollment_id) REFERENCES child_enrollments(id),
  CONSTRAINT fk_payments_child FOREIGN KEY (child_id) REFERENCES children(id),
  CONSTRAINT fk_payments_direction FOREIGN KEY (direction_id) REFERENCES directions(id),
  CONSTRAINT fk_payments_group_snapshot FOREIGN KEY (group_id_snapshot) REFERENCES study_groups(id),
  CONSTRAINT fk_payments_project_snapshot FOREIGN KEY (project_id_snapshot) REFERENCES projects(id),
  CONSTRAINT fk_payments_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE refunds (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  enrollment_id BIGINT UNSIGNED NOT NULL,
  child_id BIGINT UNSIGNED NOT NULL,
  direction_id BIGINT UNSIGNED NOT NULL,
  payment_id BIGINT UNSIGNED NULL,
  group_id_snapshot BIGINT UNSIGNED NULL,
  project_id_snapshot BIGINT UNSIGNED NULL,
  refunded_on DATE NOT NULL,
  amount DECIMAL(13,2) NOT NULL,
  price_snapshot DECIMAL(13,2) NOT NULL,
  lessons_debit DECIMAL(16,8) NOT NULL,
  reason TEXT NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  KEY idx_refunds_child_date (child_id, refunded_on),
  KEY idx_refunds_project_date (project_id_snapshot, refunded_on),
  CONSTRAINT chk_refunds_values CHECK (amount > 0 AND price_snapshot > 0 AND lessons_debit > 0),
  CONSTRAINT fk_refunds_enrollment FOREIGN KEY (enrollment_id) REFERENCES child_enrollments(id),
  CONSTRAINT fk_refunds_child FOREIGN KEY (child_id) REFERENCES children(id),
  CONSTRAINT fk_refunds_direction FOREIGN KEY (direction_id) REFERENCES directions(id),
  CONSTRAINT fk_refunds_payment FOREIGN KEY (payment_id) REFERENCES payments(id),
  CONSTRAINT fk_refunds_group_snapshot FOREIGN KEY (group_id_snapshot) REFERENCES study_groups(id),
  CONSTRAINT fk_refunds_project_snapshot FOREIGN KEY (project_id_snapshot) REFERENCES projects(id),
  CONSTRAINT fk_refunds_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE balance_transfers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  child_id BIGINT UNSIGNED NOT NULL,
  source_enrollment_id BIGINT UNSIGNED NOT NULL,
  target_enrollment_id BIGINT UNSIGNED NOT NULL,
  transferred_amount DECIMAL(13,2) NOT NULL,
  target_price_snapshot DECIMAL(13,2) NOT NULL,
  target_lessons_credit DECIMAL(16,8) NOT NULL,
  transferred_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  note TEXT NULL,
  PRIMARY KEY (id),
  CONSTRAINT chk_balance_transfers_values CHECK (transferred_amount > 0 AND target_price_snapshot > 0 AND target_lessons_credit > 0),
  CONSTRAINT chk_balance_transfers_different CHECK (source_enrollment_id <> target_enrollment_id),
  CONSTRAINT fk_balance_transfers_child FOREIGN KEY (child_id) REFERENCES children(id),
  CONSTRAINT fk_balance_transfers_source FOREIGN KEY (source_enrollment_id) REFERENCES child_enrollments(id),
  CONSTRAINT fk_balance_transfers_target FOREIGN KEY (target_enrollment_id) REFERENCES child_enrollments(id),
  CONSTRAINT fk_balance_transfers_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE balance_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  enrollment_id BIGINT UNSIGNED NOT NULL,
  entry_type VARCHAR(32) NOT NULL,
  lessons_delta DECIMAL(16,8) NOT NULL,
  amount_delta DECIMAL(13,2) NOT NULL,
  unit_price_snapshot DECIMAL(13,2) NULL,
  payment_id BIGINT UNSIGNED NULL,
  refund_id BIGINT UNSIGNED NULL,
  attendance_id BIGINT UNSIGNED NULL,
  transfer_id BIGINT UNSIGNED NULL,
  idempotency_key VARCHAR(128) NULL,
  occurred_at DATETIME(6) NOT NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_balance_entries_idempotency (idempotency_key),
  UNIQUE KEY uq_balance_entries_attendance (attendance_id),
  KEY idx_balance_entries_enrollment_time (enrollment_id, occurred_at, id),
  CONSTRAINT chk_balance_entries_type CHECK (entry_type IN ('opening','payment','attendance','refund','transfer_out','transfer_in','adjustment','reversal')),
  CONSTRAINT fk_balance_entries_enrollment FOREIGN KEY (enrollment_id) REFERENCES child_enrollments(id),
  CONSTRAINT fk_balance_entries_payment FOREIGN KEY (payment_id) REFERENCES payments(id),
  CONSTRAINT fk_balance_entries_refund FOREIGN KEY (refund_id) REFERENCES refunds(id),
  CONSTRAINT fk_balance_entries_attendance FOREIGN KEY (attendance_id) REFERENCES attendances(id),
  CONSTRAINT fk_balance_entries_transfer FOREIGN KEY (transfer_id) REFERENCES balance_transfers(id),
  CONSTRAINT fk_balance_entries_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE balance_lots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  enrollment_id BIGINT UNSIGNED NOT NULL,
  source_balance_entry_id BIGINT UNSIGNED NOT NULL,
  original_lessons DECIMAL(16,8) NOT NULL,
  remaining_lessons DECIMAL(16,8) NOT NULL,
  unit_price DECIMAL(13,2) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_balance_lots_fifo (enrollment_id, created_at, id),
  CONSTRAINT chk_balance_lots_values CHECK (original_lessons > 0 AND remaining_lessons >= 0 AND remaining_lessons <= original_lessons AND unit_price > 0),
  CONSTRAINT fk_balance_lots_enrollment FOREIGN KEY (enrollment_id) REFERENCES child_enrollments(id),
  CONSTRAINT fk_balance_lots_source FOREIGN KEY (source_balance_entry_id) REFERENCES balance_entries(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE balance_lot_consumptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  balance_lot_id BIGINT UNSIGNED NOT NULL,
  balance_entry_id BIGINT UNSIGNED NOT NULL,
  lessons DECIMAL(16,8) NOT NULL,
  amount DECIMAL(13,2) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_balance_lot_consumption (balance_lot_id, balance_entry_id),
  CONSTRAINT chk_balance_lot_consumptions_values CHECK (lessons > 0 AND amount >= 0),
  CONSTRAINT fk_balance_lot_consumptions_lot FOREIGN KEY (balance_lot_id) REFERENCES balance_lots(id),
  CONSTRAINT fk_balance_lot_consumptions_entry FOREIGN KEY (balance_entry_id) REFERENCES balance_entries(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE salary_rate_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  teacher_id BIGINT UNSIGNED NULL,
  direction_id BIGINT UNSIGNED NULL,
  regular_fixed DECIMAL(13,2) NOT NULL,
  per_present_child DECIMAL(13,2) NOT NULL,
  intro_fixed DECIMAL(13,2) NOT NULL,
  empty_trip_fixed DECIMAL(13,2) NOT NULL,
  valid_from DATETIME(6) NOT NULL,
  valid_to DATETIME(6) NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_salary_rates_teacher_dates (teacher_id, valid_from, valid_to),
  CONSTRAINT chk_salary_rates_values CHECK (regular_fixed >= 0 AND per_present_child >= 0 AND intro_fixed >= 0 AND empty_trip_fixed >= 0),
  CONSTRAINT chk_salary_rates_dates CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT fk_salary_rates_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id),
  CONSTRAINT fk_salary_rates_direction FOREIGN KEY (direction_id) REFERENCES directions(id),
  CONSTRAINT fk_salary_rates_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE salary_accruals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  lesson_id BIGINT UNSIGNED NOT NULL,
  teacher_id BIGINT UNSIGNED NOT NULL,
  rate_version_id BIGINT UNSIGNED NULL,
  accrual_type VARCHAR(24) NOT NULL,
  present_children INT UNSIGNED NOT NULL DEFAULT 0,
  fixed_amount DECIMAL(13,2) NOT NULL DEFAULT 0,
  children_amount DECIMAL(13,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(13,2) NOT NULL,
  accrued_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  reversed_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_salary_accruals_lesson_teacher (lesson_id, teacher_id),
  KEY idx_salary_accruals_teacher_date (teacher_id, accrued_at),
  CONSTRAINT chk_salary_accruals_type CHECK (accrual_type IN ('regular','intro','empty_trip')),
  CONSTRAINT chk_salary_accruals_amounts CHECK (fixed_amount >= 0 AND children_amount >= 0 AND total_amount >= 0),
  CONSTRAINT fk_salary_accruals_lesson FOREIGN KEY (lesson_id) REFERENCES lessons(id),
  CONSTRAINT fk_salary_accruals_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id),
  CONSTRAINT fk_salary_accruals_rate FOREIGN KEY (rate_version_id) REFERENCES salary_rate_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE partner_agreement_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  partner_id BIGINT UNSIGNED NOT NULL,
  tax_percent DECIMAL(6,3) NOT NULL,
  icube_percent DECIMAL(6,3) NOT NULL,
  partner_percent DECIMAL(6,3) NOT NULL,
  valid_from DATETIME(6) NOT NULL,
  valid_to DATETIME(6) NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_partner_agreements_project_dates (project_id, valid_from, valid_to),
  CONSTRAINT chk_partner_agreements_percent CHECK (tax_percent BETWEEN 0 AND 100 AND icube_percent BETWEEN 0 AND 100 AND partner_percent BETWEEN 0 AND 100 AND icube_percent + partner_percent = 100),
  CONSTRAINT chk_partner_agreements_dates CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT fk_partner_agreements_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_partner_agreements_partner FOREIGN KEY (partner_id) REFERENCES partners(id),
  CONSTRAINT fk_partner_agreements_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE partner_settlements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  partner_id BIGINT UNSIGNED NOT NULL,
  agreement_version_id BIGINT UNSIGNED NOT NULL,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  payments_amount DECIMAL(13,2) NOT NULL,
  refunds_amount DECIMAL(13,2) NOT NULL,
  cash_held_by_partner DECIMAL(13,2) NOT NULL,
  tax_amount DECIMAL(13,2) NOT NULL,
  salary_amount DECIMAL(13,2) NOT NULL,
  distributable_amount DECIMAL(13,2) NOT NULL,
  icube_share_amount DECIMAL(13,2) NOT NULL,
  partner_share_amount DECIMAL(13,2) NOT NULL,
  transfer_amount DECIMAL(13,2) NOT NULL COMMENT 'positive=iCube pays partner, negative=partner returns to iCube',
  calculated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  calculated_by_user_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_partner_settlements_period (project_id, partner_id, period_from, period_to),
  CONSTRAINT chk_partner_settlements_dates CHECK (period_to >= period_from),
  CONSTRAINT fk_partner_settlements_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_partner_settlements_partner FOREIGN KEY (partner_id) REFERENCES partners(id),
  CONSTRAINT fk_partner_settlements_agreement FOREIGN KEY (agreement_version_id) REFERENCES partner_agreement_versions(id),
  CONSTRAINT fk_partner_settlements_calculated_by FOREIGN KEY (calculated_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  role_code VARCHAR(32) NULL,
  notification_type VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  entity_type VARCHAR(64) NULL,
  entity_id BIGINT UNSIGNED NULL,
  read_at DATETIME(6) NULL,
  dismissed_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_notifications_user_unread (user_id, read_at, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE idempotency_keys (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  response_status SMALLINT UNSIGNED NULL,
  response_body JSON NULL,
  expires_at DATETIME(6) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_idempotency_keys_user_key (user_id, idempotency_key),
  KEY idx_idempotency_keys_expires (expires_at),
  CONSTRAINT fk_idempotency_keys_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  before_data JSON NULL,
  after_data JSON NULL,
  request_id VARCHAR(64) NULL,
  ip_address VARBINARY(16) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_audit_log_entity (entity_type, entity_id, created_at),
  KEY idx_audit_log_actor (actor_user_id, created_at),
  CONSTRAINT fk_audit_log_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
