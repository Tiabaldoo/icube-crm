-- Transfers work before authentication is enabled; NULL is never accepted from the browser.
ALTER TABLE balance_transfers
  MODIFY created_by_user_id BIGINT UNSIGNED NULL;
