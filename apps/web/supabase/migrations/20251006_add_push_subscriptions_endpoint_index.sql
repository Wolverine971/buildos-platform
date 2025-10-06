-- Migration: Add index on push_subscriptions.endpoint for better query performance
-- Created: 2025-10-06
-- Description: Adds an index on the endpoint column to speed up lookups when the worker
--              fetches subscriptions for sending push notifications.

-- Add index for endpoint lookups (in addition to the existing unique constraint)
CREATE INDEX IF NOT EXISTS idx_push_subs_endpoint
ON push_subscriptions(endpoint)
WHERE is_active = true;

-- Comment for documentation
COMMENT ON INDEX idx_push_subs_endpoint IS
'Speeds up push subscription lookups by endpoint for the notification worker. Partial index only includes active subscriptions.';
