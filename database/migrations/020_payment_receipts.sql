CREATE TABLE payment_receipts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  guardian_id BIGINT UNSIGNED NOT NULL,
  uploaded_by_user_id BIGINT UNSIGNED NOT NULL,
  storage_key VARCHAR(512) NOT NULL,
  mime_type VARCHAR(64) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  original_filename VARCHAR(255) NULL,
  uploaded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  closed_at DATETIME(6) NULL,
  closed_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_payment_receipts_guardian_date (guardian_id,uploaded_at,id),
  KEY idx_payment_receipts_queue (closed_at,uploaded_at,id),
  CONSTRAINT chk_payment_receipts_file CHECK (
    size_bytes > 0 AND mime_type IN ('image/jpeg','image/png','application/pdf')
  ),
  CONSTRAINT fk_payment_receipts_guardian FOREIGN KEY (guardian_id) REFERENCES guardians(id),
  CONSTRAINT fk_payment_receipts_uploaded_by FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_payment_receipts_closed_by FOREIGN KEY (closed_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE payment_receipt_payments (
  receipt_id BIGINT UNSIGNED NOT NULL,
  payment_id BIGINT UNSIGNED NOT NULL,
  linked_by_user_id BIGINT UNSIGNED NOT NULL,
  linked_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (receipt_id,payment_id),
  KEY idx_payment_receipt_payments_payment (payment_id,receipt_id),
  CONSTRAINT fk_payment_receipt_payments_receipt FOREIGN KEY (receipt_id) REFERENCES payment_receipts(id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_receipt_payments_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_receipt_payments_linked_by FOREIGN KEY (linked_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE parent_notification_settings
  DROP CHECK chk_parent_notification_type,
  ADD CONSTRAINT chk_parent_notification_type CHECK (notification_type IN (
    'reminder_day_before','lesson_move','lesson_cancel','last_paid_lesson','payment_reminder','lesson_finished','payment_confirmed'
  ));
