CREATE TABLE parent_notification_settings (
  guardian_id BIGINT UNSIGNED NOT NULL,
  notification_type VARCHAR(64) NOT NULL,
  enabled BOOLEAN NOT NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (guardian_id, notification_type),
  CONSTRAINT chk_parent_notification_type CHECK (notification_type IN (
    'reminder_day_before','lesson_move','lesson_cancel','last_paid_lesson','payment_reminder','lesson_finished'
  )),
  CONSTRAINT fk_parent_notification_settings_guardian FOREIGN KEY (guardian_id) REFERENCES guardians(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE parent_documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  document_type VARCHAR(64) NOT NULL,
  document_version VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NULL,
  document_url VARCHAR(1024) NULL,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_parent_documents_type_version (document_type, document_version),
  KEY idx_parent_documents_active (is_active, is_required, document_type),
  CONSTRAINT chk_parent_document_type CHECK (document_type IN (
    'privacy_policy','personal_data_parent','personal_data_child_legal_representative'
  ))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE parent_document_acceptances (
  guardian_id BIGINT UNSIGNED NOT NULL,
  document_id BIGINT UNSIGNED NOT NULL,
  accepted_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(512) NULL,
  PRIMARY KEY (guardian_id, document_id),
  KEY idx_parent_document_acceptances_document (document_id, accepted_at),
  CONSTRAINT fk_parent_document_acceptances_guardian FOREIGN KEY (guardian_id) REFERENCES guardians(id),
  CONSTRAINT fk_parent_document_acceptances_document FOREIGN KEY (document_id) REFERENCES parent_documents(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE notifications
  ADD COLUMN child_id BIGINT UNSIGNED NULL AFTER recipient_project_id,
  ADD COLUMN destination VARCHAR(64) NULL AFTER entity_id,
  ADD COLUMN dedup_key VARCHAR(191) NULL AFTER destination,
  ADD COLUMN reference_type VARCHAR(64) NULL AFTER dedup_key,
  ADD COLUMN reference_id BIGINT UNSIGNED NULL AFTER reference_type,
  ADD UNIQUE KEY uq_notifications_user_dedup (user_id, dedup_key),
  ADD KEY idx_notifications_parent_child (user_id, child_id, created_at),
  ADD CONSTRAINT fk_notifications_child FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE SET NULL;

INSERT INTO parent_documents (document_type,document_version,title,body,is_required,is_active) VALUES
  ('privacy_policy','draft-2026-09','Политика конфиденциальности','Черновой текст. Перед production замените документ юридически проверенной редакцией.',TRUE,TRUE),
  ('personal_data_parent','draft-2026-09','Согласие на обработку персональных данных родителя','Черновой текст. Перед production замените документ юридически проверенной редакцией.',TRUE,TRUE),
  ('personal_data_child_legal_representative','draft-2026-09','Согласие законного представителя на обработку данных ребёнка','Черновой текст. Перед production замените документ юридически проверенной редакцией.',TRUE,TRUE);
