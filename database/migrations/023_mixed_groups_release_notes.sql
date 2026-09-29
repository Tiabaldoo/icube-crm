-- Existing groups/lessons remain ordinary; historical prices and ledger are untouched.
ALTER TABLE study_groups ADD COLUMN is_mixed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE lessons ADD COLUMN is_mixed_snapshot BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE price_versions DROP CHECK chk_price_versions_scope;
ALTER TABLE price_versions ADD CONSTRAINT chk_price_versions_scope CHECK (
 (scope_type='direction' AND direction_id IS NOT NULL AND group_id IS NULL AND enrollment_id IS NULL) OR
 (scope_type='group' AND direction_id IS NULL AND group_id IS NOT NULL AND enrollment_id IS NULL) OR
 (scope_type='mixed_group' AND direction_id IS NOT NULL AND group_id IS NOT NULL AND enrollment_id IS NULL) OR
 (scope_type='enrollment' AND direction_id IS NULL AND group_id IS NULL AND enrollment_id IS NOT NULL)
);
CREATE TABLE user_release_views (
 user_id BIGINT UNSIGNED NOT NULL,
 release_version VARCHAR(32) NOT NULL,
 seen_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY (user_id,release_version),
 CONSTRAINT fk_release_views_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
