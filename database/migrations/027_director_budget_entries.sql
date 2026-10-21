-- Isolated owner adjustments; no links or writes to children's financial history.
CREATE TABLE director_budget_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entry_type VARCHAR(16) NOT NULL,
  occurred_on DATE NOT NULL,
  amount DECIMAL(13,2) NOT NULL,
  purpose VARCHAR(1000) NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  request_key CHAR(64) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_director_budget_request (request_key),
  KEY idx_director_budget_period (deleted_at,occurred_on,id),
  CONSTRAINT chk_director_budget_type CHECK (entry_type IN ('income','expense')),
  CONSTRAINT chk_director_budget_amount CHECK (amount > 0),
  CONSTRAINT fk_director_budget_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
