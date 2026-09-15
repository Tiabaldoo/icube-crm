-- Records the exact lot state changed by a transfer so it can be safely reversed.
CREATE TABLE balance_transfer_lot_changes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  transfer_id BIGINT UNSIGNED NOT NULL,
  balance_lot_id BIGINT UNSIGNED NOT NULL,
  change_type VARCHAR(24) NOT NULL,
  lessons_delta DECIMAL(16,8) NOT NULL,
  remaining_before DECIMAL(16,8) NOT NULL,
  remaining_after DECIMAL(16,8) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_transfer_lot_change (transfer_id, balance_lot_id),
  KEY idx_transfer_lot_changes_lot (balance_lot_id),
  CONSTRAINT chk_transfer_lot_change_type CHECK (change_type IN ('source_reduction','target_created')),
  CONSTRAINT chk_transfer_lot_change_values CHECK (lessons_delta > 0 AND remaining_before >= 0 AND remaining_after >= 0),
  CONSTRAINT fk_transfer_lot_changes_transfer FOREIGN KEY (transfer_id) REFERENCES balance_transfers(id),
  CONSTRAINT fk_transfer_lot_changes_lot FOREIGN KEY (balance_lot_id) REFERENCES balance_lots(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
