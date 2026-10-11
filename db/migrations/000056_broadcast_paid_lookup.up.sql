CREATE INDEX IF NOT EXISTS purchase_broadcast_paid_customer_idx ON purchase (customer_id)
WHERE status='paid' AND purchase_kind='subscription' AND amount>0 AND NOT is_free_plan;
