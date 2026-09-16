ALTER TABLE lessons
  ADD COLUMN site_override_id BIGINT UNSIGNED NULL AFTER site_id_snapshot,
  ADD KEY ix_lessons_site_override_id (site_override_id),
  ADD CONSTRAINT fk_lessons_site_override FOREIGN KEY (site_override_id) REFERENCES sites(id);
