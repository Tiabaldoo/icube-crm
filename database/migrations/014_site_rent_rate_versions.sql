CREATE TABLE site_rent_rate_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  site_id BIGINT UNSIGNED NOT NULL,
  rate DECIMAL(12,2) NOT NULL,
  valid_from DATETIME(6) NOT NULL,
  valid_to DATETIME(6) NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  current_site_id BIGINT UNSIGNED
    GENERATED ALWAYS AS (CASE WHEN valid_to IS NULL THEN site_id ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_site_rent_rate_current (current_site_id),
  KEY idx_site_rent_rate_lookup (site_id, valid_from, valid_to),
  CONSTRAINT chk_site_rent_rate_value CHECK (rate >= 0),
  CONSTRAINT chk_site_rent_rate_dates CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT fk_site_rent_rate_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
  CONSTRAINT fk_site_rent_rate_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
