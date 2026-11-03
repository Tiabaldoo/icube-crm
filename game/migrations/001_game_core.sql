-- Этап 3: игровой профиль и сессии. Только для icube_game_test.
-- child_id — идентификатор ребёнка в CRM; данных CRM, кроме него, здесь нет.
SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- Ник уникален без учёта регистра и «ё/е» (сравнение по collation).
-- first_access_on записывается один раз при создании профиля (решение Т3).
CREATE TABLE IF NOT EXISTS game_profiles (
  child_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  nickname VARCHAR(32) NOT NULL,
  first_access_on DATE NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_game_profiles_nickname (nickname)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Хранится только sha256 токена. Время — UTC.
CREATE TABLE IF NOT EXISTS game_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  token_hash CHAR(64) NOT NULL,
  child_id BIGINT UNSIGNED NOT NULL,
  token_version INT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  last_seen_at DATETIME(6) NOT NULL,
  checked_at DATETIME(6) NOT NULL,
  revoked_at DATETIME(6) NULL,
  revoke_reason VARCHAR(32) NULL,
  UNIQUE KEY uq_game_sessions_token (token_hash),
  KEY idx_game_sessions_child (child_id, revoked_at),
  CONSTRAINT fk_game_sessions_profile FOREIGN KEY (child_id) REFERENCES game_profiles (child_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
