-- Этап 4: журнал звёзд, сундук церемонии и бонусы сотрудников. Только для icube_game_test.
-- Журнал только дополняется: строки не меняются и не удаляются, исправления — новыми записями.
SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- Кошелёк — строка блокировки ребёнка и быстрый итог журнала: balance + chest = сумма amount.
-- balance может быть отрицательным (отменили потраченное), ребёнок видит max(0, balance).
CREATE TABLE IF NOT EXISTS game_star_wallets (
  child_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  balance INT NOT NULL DEFAULT 0,
  chest INT NOT NULL DEFAULT 0,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT chk_game_star_wallets_chest CHECK (chest >= 0),
  CONSTRAINT fk_game_star_wallets_profile FOREIGN KEY (child_id) REFERENCES game_profiles (child_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Бонус сотрудника. created_by_user_id — пользователь CRM; request_key — ключ идемпотентности CRM.
CREATE TABLE IF NOT EXISTS game_staff_bonuses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  child_id BIGINT UNSIGNED NOT NULL,
  amount SMALLINT UNSIGNED NOT NULL,
  reason VARCHAR(500) NOT NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  request_key CHAR(64) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  UNIQUE KEY uq_game_staff_bonuses_request (request_key),
  KEY idx_game_staff_bonuses_child (child_id, id),
  CONSTRAINT chk_game_staff_bonuses_amount CHECK (amount BETWEEN 1 AND 10),
  CONSTRAINT fk_game_staff_bonuses_profile FOREIGN KEY (child_id) REFERENCES game_profiles (child_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Отзыв бонуса: один на бонус, кто и почему.
CREATE TABLE IF NOT EXISTS game_staff_bonus_revokes (
  bonus_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  revoked_by_user_id BIGINT UNSIGNED NOT NULL,
  reason VARCHAR(500) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  CONSTRAINT fk_game_staff_bonus_revokes_bonus FOREIGN KEY (bonus_id) REFERENCES game_staff_bonuses (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- attendance_id — посещение в CRM; bonus_id — бонус выше; item_code — покупка в игре (этап 5).
CREATE TABLE IF NOT EXISTS game_star_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  child_id BIGINT UNSIGNED NOT NULL,
  kind VARCHAR(32) NOT NULL,
  amount INT NOT NULL,
  attendance_id BIGINT UNSIGNED NULL,
  bonus_id BIGINT UNSIGNED NULL,
  item_code VARCHAR(64) NULL,
  idempotency_key VARCHAR(191) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  UNIQUE KEY uq_game_star_entries_key (idempotency_key),
  KEY idx_game_star_entries_child (child_id, id),
  KEY idx_game_star_entries_attendance (child_id, attendance_id),
  CONSTRAINT chk_game_star_entries_kind CHECK (kind IN ('attendance','attendance_reversal','trial_followup_bonus','trial_followup_reversal',
    'staff_bonus','staff_bonus_revoke','purchase')),
  CONSTRAINT chk_game_star_entries_amount CHECK (amount <> 0),
  CONSTRAINT fk_game_star_entries_profile FOREIGN KEY (child_id) REFERENCES game_profiles (child_id),
  CONSTRAINT fk_game_star_entries_bonus FOREIGN KEY (bonus_id) REFERENCES game_staff_bonuses (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Открытие сундука переносит звёзды на баланс; сумма журнала при этом не меняется.
CREATE TABLE IF NOT EXISTS game_star_chest_opens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  child_id BIGINT UNSIGNED NOT NULL,
  amount INT NOT NULL,
  created_at DATETIME(6) NOT NULL,
  KEY idx_game_star_chest_opens_child (child_id, id),
  CONSTRAINT chk_game_star_chest_opens_amount CHECK (amount > 0),
  CONSTRAINT fk_game_star_chest_opens_profile FOREIGN KEY (child_id) REFERENCES game_profiles (child_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
