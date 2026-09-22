ALTER TABLE teacher_projects
  ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE AFTER project_id;

ALTER TABLE children
  ADD COLUMN create_idempotency_key CHAR(64) NULL,
  ADD UNIQUE KEY uq_children_create_idempotency (create_idempotency_key);

CREATE TABLE teacher_project_directions (
  teacher_id BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NOT NULL,
  direction_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (teacher_id,project_id,direction_id),
  KEY idx_teacher_project_directions_project (project_id,direction_id,teacher_id),
  CONSTRAINT fk_teacher_project_directions_teacher_project FOREIGN KEY (teacher_id,project_id)
    REFERENCES teacher_projects(teacher_id,project_id) ON DELETE CASCADE,
  CONSTRAINT fk_teacher_project_directions_direction FOREIGN KEY (direction_id) REFERENCES directions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO teacher_project_directions (teacher_id,project_id,direction_id)
SELECT tp.teacher_id,tp.project_id,td.direction_id
FROM teacher_projects tp JOIN teacher_directions td ON td.teacher_id=tp.teacher_id;

CREATE TABLE migration_018_invariant_check (
  key_value VARCHAR(191) NOT NULL PRIMARY KEY
) ENGINE=InnoDB;

INSERT INTO migration_018_invariant_check(key_value)
SELECT CONCAT('membership:',enrollment_id) FROM group_memberships WHERE ended_on IS NULL;

INSERT INTO migration_018_invariant_check(key_value)
SELECT CONCAT('price:',scope_type,':',COALESCE(project_id,0),':',COALESCE(direction_id,0),':',COALESCE(group_id,0),':',COALESCE(enrollment_id,0))
FROM price_versions WHERE valid_to IS NULL;

INSERT INTO migration_018_invariant_check(key_value)
SELECT CONCAT('salary:',COALESCE(teacher_id,0),':',COALESCE(direction_id,0))
FROM salary_rate_versions WHERE valid_to IS NULL;

INSERT INTO migration_018_invariant_check(key_value)
SELECT CONCAT('agreement:',project_id,':',partner_id)
FROM partner_agreement_versions WHERE valid_to IS NULL;

DROP TABLE migration_018_invariant_check;

ALTER TABLE group_memberships
  ADD COLUMN current_enrollment_id BIGINT UNSIGNED GENERATED ALWAYS AS (IF(ended_on IS NULL,enrollment_id,NULL)) STORED,
  ADD UNIQUE KEY uq_group_memberships_one_current (current_enrollment_id);

ALTER TABLE price_versions
  ADD COLUMN current_scope_key VARCHAR(191) GENERATED ALWAYS AS (
    IF(valid_to IS NULL,CONCAT(scope_type,':',COALESCE(project_id,0),':',COALESCE(direction_id,0),':',COALESCE(group_id,0),':',COALESCE(enrollment_id,0)),NULL)
  ) STORED,
  ADD UNIQUE KEY uq_price_versions_one_current (current_scope_key);

ALTER TABLE salary_rate_versions
  ADD COLUMN current_context_key VARCHAR(191) GENERATED ALWAYS AS (
    IF(valid_to IS NULL,CONCAT(COALESCE(teacher_id,0),':',COALESCE(direction_id,0)),NULL)
  ) STORED,
  ADD UNIQUE KEY uq_salary_rates_one_current (current_context_key);

ALTER TABLE partner_agreement_versions
  ADD COLUMN current_context_key VARCHAR(191) GENERATED ALWAYS AS (
    IF(valid_to IS NULL,CONCAT(project_id,':',partner_id),NULL)
  ) STORED,
  ADD UNIQUE KEY uq_partner_agreements_one_current (current_context_key);
