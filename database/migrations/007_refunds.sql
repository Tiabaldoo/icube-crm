-- Enable API-created refunds and enforce one ledger entry per refund.
ALTER TABLE refunds
  MODIFY created_by_user_id BIGINT UNSIGNED NULL;

ALTER TABLE balance_entries
  ADD UNIQUE KEY uq_balance_entries_refund (refund_id);
