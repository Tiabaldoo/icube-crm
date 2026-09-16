-- Current ownership is explicit; historical payments/lessons keep their snapshots.
ALTER TABLE child_enrollments
  ADD COLUMN project_id BIGINT UNSIGNED NULL AFTER direction_id,
  ADD COLUMN superseded_at DATETIME(6) NULL AFTER ended_on,
  ADD KEY idx_enrollments_project (project_id,status),
  ADD CONSTRAINT fk_enrollments_project FOREIGN KEY (project_id) REFERENCES projects(id);

UPDATE child_enrollments e
LEFT JOIN group_memberships gm ON gm.id=(SELECT gm2.id FROM group_memberships gm2
  WHERE gm2.enrollment_id=e.id ORDER BY (gm2.ended_on IS NULL) DESC,gm2.started_on DESC,gm2.id DESC LIMIT 1)
LEFT JOIN study_groups g ON g.id=gm.group_id
SET e.project_id=COALESCE(g.project_id,(SELECT id FROM projects WHERE code='icube-robots' LIMIT 1));
ALTER TABLE child_enrollments MODIFY project_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE child_enrollments
  ADD COLUMN current_direction_id BIGINT UNSIGNED
    GENERATED ALWAYS AS (CASE WHEN superseded_at IS NULL THEN direction_id ELSE NULL END) STORED,
  ADD UNIQUE KEY uq_enrollments_current_direction (child_id,current_direction_id),
  ADD KEY idx_enrollments_child_direction_history (child_id,direction_id,superseded_at);
ALTER TABLE child_enrollments DROP INDEX uq_child_enrollments_child_direction;

-- Only previously unresolved project snapshots are filled; existing historical values stay intact.
UPDATE payments p JOIN child_enrollments e ON e.id=p.enrollment_id
LEFT JOIN study_groups g ON g.id=p.group_id_snapshot
SET p.project_id_snapshot=COALESCE(g.project_id,e.project_id)
WHERE p.project_id_snapshot IS NULL;
UPDATE refunds r JOIN child_enrollments e ON e.id=r.enrollment_id
LEFT JOIN study_groups g ON g.id=r.group_id_snapshot
SET r.project_id_snapshot=COALESCE(g.project_id,e.project_id)
WHERE r.project_id_snapshot IS NULL;

ALTER TABLE price_versions
  ADD COLUMN project_id BIGINT UNSIGNED NULL AFTER direction_id,
  ADD KEY idx_price_versions_project_direction(project_id,direction_id,valid_from,valid_to),
  ADD CONSTRAINT fk_price_versions_project FOREIGN KEY(project_id) REFERENCES projects(id);

ALTER TABLE sites
  ADD COLUMN project_id BIGINT UNSIGNED NULL AFTER id,
  ADD COLUMN created_by_user_id BIGINT UNSIGNED NULL AFTER active,
  ADD KEY idx_sites_project (project_id,deleted_at),
  ADD CONSTRAINT fk_sites_project FOREIGN KEY (project_id) REFERENCES projects(id),
  ADD CONSTRAINT fk_sites_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id);

-- A previously shared site becomes separate editable site records per project.
UPDATE sites s SET s.project_id=COALESCE(
  (SELECT MIN(g.project_id) FROM study_groups g WHERE g.site_id=s.id),
  (SELECT id FROM projects WHERE code='icube-robots' LIMIT 1));
CREATE TEMPORARY TABLE site_project_clones (
  old_site_id BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NOT NULL,
  new_site_id BIGINT UNSIGNED NULL,
  PRIMARY KEY(old_site_id,project_id)
) ENGINE=InnoDB;
INSERT INTO site_project_clones(old_site_id,project_id)
SELECT DISTINCT g.site_id,g.project_id FROM study_groups g JOIN sites s ON s.id=g.site_id
WHERE s.project_id<>g.project_id;
ALTER TABLE sites ADD COLUMN migration_source_site_id BIGINT UNSIGNED NULL;
INSERT INTO sites(name,short_name,type,address,note,active,created_at,project_id,migration_source_site_id)
SELECT s.name,s.short_name,s.type,s.address,s.note,s.active,s.created_at,m.project_id,m.old_site_id
FROM site_project_clones m JOIN sites s ON s.id=m.old_site_id;
UPDATE site_project_clones m JOIN sites s ON s.migration_source_site_id=m.old_site_id AND s.project_id=m.project_id
SET m.new_site_id=s.id;
UPDATE study_groups g JOIN site_project_clones m ON m.old_site_id=g.site_id AND m.project_id=g.project_id
SET g.site_id=m.new_site_id;
ALTER TABLE sites DROP COLUMN migration_source_site_id;
DROP TEMPORARY TABLE site_project_clones;
ALTER TABLE sites MODIFY project_id BIGINT UNSIGNED NOT NULL;

ALTER TABLE study_groups
  ADD COLUMN created_by_user_id BIGINT UNSIGNED NULL AFTER active,
  ADD CONSTRAINT fk_groups_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id);
ALTER TABLE teachers
  ADD COLUMN created_by_user_id BIGINT UNSIGNED NULL AFTER active,
  ADD CONSTRAINT fk_teachers_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id);

CREATE TABLE teacher_projects (
  teacher_id BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY(teacher_id,project_id),
  KEY idx_teacher_projects_project(project_id,teacher_id),
  CONSTRAINT fk_teacher_projects_teacher FOREIGN KEY(teacher_id) REFERENCES teachers(id),
  CONSTRAINT fk_teacher_projects_project FOREIGN KEY(project_id) REFERENCES projects(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT INTO teacher_projects(teacher_id,project_id)
SELECT t.id,p.id FROM teachers t CROSS JOIN projects p WHERE t.deleted_at IS NULL;

CREATE TABLE enrollment_project_transfers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  child_id BIGINT UNSIGNED NOT NULL,
  source_enrollment_id BIGINT UNSIGNED NOT NULL,
  target_enrollment_id BIGINT UNSIGNED NOT NULL,
  source_project_id BIGINT UNSIGNED NOT NULL,
  target_project_id BIGINT UNSIGNED NOT NULL,
  balance_transfer_id BIGINT UNSIGNED NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_project_transfer_target(target_enrollment_id),
  CONSTRAINT fk_project_transfer_child FOREIGN KEY(child_id) REFERENCES children(id),
  CONSTRAINT fk_project_transfer_source FOREIGN KEY(source_enrollment_id) REFERENCES child_enrollments(id),
  CONSTRAINT fk_project_transfer_target FOREIGN KEY(target_enrollment_id) REFERENCES child_enrollments(id),
  CONSTRAINT fk_project_transfer_source_project FOREIGN KEY(source_project_id) REFERENCES projects(id),
  CONSTRAINT fk_project_transfer_target_project FOREIGN KEY(target_project_id) REFERENCES projects(id),
  CONSTRAINT fk_project_transfer_balance FOREIGN KEY(balance_transfer_id) REFERENCES balance_transfers(id),
  CONSTRAINT fk_project_transfer_creator FOREIGN KEY(created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE notifications
  ADD COLUMN recipient_project_id BIGINT UNSIGNED NULL AFTER role_code,
  ADD KEY idx_notifications_role_project_unread(role_code,recipient_project_id,read_at,created_at),
  ADD CONSTRAINT fk_notifications_recipient_project FOREIGN KEY(recipient_project_id) REFERENCES projects(id);
