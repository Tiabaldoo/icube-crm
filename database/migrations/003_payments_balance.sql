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
SELECT 'direction', d.id, 1125.00, '2026-01-01 00:00:00'
FROM directions d
WHERE (d.code='programming' OR d.name='Программирование')
  AND NOT EXISTS (SELECT 1 FROM price_versions pv WHERE pv.scope_type='direction' AND pv.direction_id=d.id AND pv.valid_to IS NULL);

-- До списаний каждая оплата формирует одну FIFO-партию по исторической цене.
-- Этот INSERT также безопасно дополняет оплаты, созданные до применения миграции.
INSERT INTO balance_lots (enrollment_id, source_balance_entry_id, original_lessons, remaining_lessons, unit_price)
SELECT be.enrollment_id, be.id, p.lessons_credit, p.lessons_credit, p.price_snapshot
FROM payments p
JOIN balance_entries be ON be.payment_id=p.id AND be.entry_type='payment'
LEFT JOIN balance_lots bl ON bl.source_balance_entry_id=be.id
WHERE p.deleted_at IS NULL AND p.lessons_credit>0 AND bl.id IS NULL;
