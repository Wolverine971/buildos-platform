-- supabase/migrations/20260205_003_user_notifications_linkage.sql
-- =====================================================
-- Link in-app notifications to delivery/event records
-- =====================================================

BEGIN;

ALTER TABLE user_notifications
  ADD COLUMN IF NOT EXISTS delivery_id UUID,
  ADD COLUMN IF NOT EXISTS event_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_notifications_delivery_id_fkey'
  ) THEN
    ALTER TABLE user_notifications
      ADD CONSTRAINT user_notifications_delivery_id_fkey
      FOREIGN KEY (delivery_id) REFERENCES notification_deliveries(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_notifications_event_id_fkey'
  ) THEN
    ALTER TABLE user_notifications
      ADD CONSTRAINT user_notifications_event_id_fkey
      FOREIGN KEY (event_id) REFERENCES notification_events(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_notifications_delivery_id
  ON user_notifications(delivery_id);

CREATE INDEX IF NOT EXISTS idx_user_notifications_event_id
  ON user_notifications(event_id);

COMMIT;
