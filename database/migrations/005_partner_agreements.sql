-- До полноценной авторизации development/test могут сохранять соглашения без user_id.
ALTER TABLE partner_agreement_versions
  MODIFY created_by_user_id BIGINT UNSIGNED NULL;

-- Стартовые условия только для уже настроенного проекта zebra с назначенным партнёром.
INSERT INTO partner_agreement_versions
  (project_id, partner_id, tax_percent, icube_percent, partner_percent, valid_from, created_by_user_id)
SELECT p.id, p.partner_id, 4.000, 40.000, 60.000, '2026-01-01 00:00:00', NULL
FROM projects p
WHERE p.code='zebra'
  AND p.partner_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM partner_agreement_versions pav
    WHERE pav.project_id=p.id AND pav.partner_id=p.partner_id AND pav.valid_to IS NULL
  );
