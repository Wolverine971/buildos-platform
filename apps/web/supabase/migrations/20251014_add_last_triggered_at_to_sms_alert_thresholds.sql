-- Add last_triggered_at column to sms_alert_thresholds
-- Migration: 20251014_add_last_triggered_at_to_sms_alert_thresholds.sql
-- Purpose: Add missing last_triggered_at column for alert cooldown functionality
--
-- Context: The smsAlerts.service.ts expects this column for cooldown logic,
-- but it was omitted from the original migration (20251008_sms_metrics_monitoring.sql).
-- This column tracks when an alert was last triggered to prevent alert spam.

-- Add last_triggered_at column (nullable, defaults to NULL for existing rows)
ALTER TABLE sms_alert_thresholds
ADD COLUMN IF NOT EXISTS last_triggered_at TIMESTAMPTZ;

-- Add index for cooldown queries
CREATE INDEX IF NOT EXISTS idx_sms_alert_thresholds_last_triggered
ON sms_alert_thresholds(last_triggered_at);

-- Add helpful comment
COMMENT ON COLUMN sms_alert_thresholds.last_triggered_at IS 'Timestamp when this alert was last triggered. Used for cooldown period calculation to prevent alert spam.';

-- Migration complete
-- Next: Regenerate TypeScript types from Supabase schema
