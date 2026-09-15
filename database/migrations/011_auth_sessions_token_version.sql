-- Binds each server-side session to the password/access version current at login.
ALTER TABLE auth_sessions ADD COLUMN token_version INT UNSIGNED NULL AFTER refresh_token_hash;

UPDATE auth_sessions s JOIN users u ON u.id=s.user_id
SET s.token_version=u.token_version
WHERE s.token_version IS NULL;

ALTER TABLE auth_sessions MODIFY token_version INT UNSIGNED NOT NULL;
