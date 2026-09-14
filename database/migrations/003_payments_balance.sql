-- Оплаты работают до внедрения авторизации; после неё backend снова всегда
-- записывает фактического пользователя. NULL не принимается от браузера.
ALTER TABLE payments
  MODIFY created_by_user_id BIGINT UNSIGNED NULL;

ALTER TABLE balance_entries
  ADD UNIQUE KEY uq_balance_entries_payment (payment_id);

-- Базовые цены из действующего прототипа, если для направления ещё нет цены.
INSERT INTO price_versions (scope_type, direction_id, price, valid_from)
SELECT 'direction', d.id, 1025.00, '2026-01-01 00:00:00'
FROM directions d
WHERE (d.code='robotics' OR d.name='Робототехника')
  AND NOT EXISTS (SELECT 1 FROM price_versions pv WHERE pv.scope_type='direction' AND pv.direction_id=d.id AND pv.valid_to IS NULL);

INSERT INTO price_versions (scope_type, direction_id, price, valid_from)
SELECT 'direction', d.id, 900.00, '2026-01-01 00:00:00'
FROM directions d
WHERE (d.code='programming' OR d.name='Программирование')
  AND NOT EXISTS (SELECT 1 FROM price_versions pv WHERE pv.scope_type='direction' AND pv.direction_id=d.id AND pv.valid_to IS NULL);
