-- Keep migration 56 in history for servers that already applied it.
-- Undo its schema change through a new forward migration.
DROP INDEX IF EXISTS purchase_broadcast_paid_customer_idx;
