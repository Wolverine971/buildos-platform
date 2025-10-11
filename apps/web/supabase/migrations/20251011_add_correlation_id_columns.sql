-- =====================================================
-- ADD CORRELATION_ID COLUMNS FOR EFFICIENT QUERYING
-- =====================================================
-- Adds dedicated correlation_id columns to notification_events
-- and notification_deliveries for fast querying and indexing.
--
-- While correlation IDs are also stored in JSONB metadata for
-- flexibility, dedicated columns provide:
-- - Faster queries (native UUID vs JSONB extraction)
-- - Proper indexing for JOIN operations
-- - Type safety at database level
-- =====================================================

-- =====================================================
-- 1. ADD CORRELATION_ID COLUMNS
-- =====================================================

-- Add to notification_events table
ALTER TABLE notification_events
ADD COLUMN IF NOT EXISTS correlation_id UUID;

-- Add to notification_deliveries table
ALTER TABLE notification_deliveries
ADD COLUMN IF NOT EXISTS correlation_id UUID;

-- =====================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

-- Index on notification_events.correlation_id (partial index - only non-null)
CREATE INDEX IF NOT EXISTS idx_notification_events_correlation_id
  ON notification_events(correlation_id)
  WHERE correlation_id IS NOT NULL;

-- Index on notification_deliveries.correlation_id (partial index - only non-null)
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_correlation_id
  ON notification_deliveries(correlation_id)
  WHERE correlation_id IS NOT NULL;

-- =====================================================
-- 3. ADD COMMENTS
-- =====================================================

COMMENT ON COLUMN notification_events.correlation_id IS
'UUID that tracks a notification request across all systems (web API → worker → webhooks). Duplicated from metadata JSONB for performance.';

COMMENT ON COLUMN notification_deliveries.correlation_id IS
'UUID that tracks a notification request across all systems. Inherited from parent notification_event for tracing.';

-- =====================================================
-- NOTES
-- =====================================================
-- Why dedicated columns when we have metadata?
-- 1. Performance: Native UUID column is 10x faster than JSONB extraction
-- 2. Indexing: B-tree index on UUID column is more efficient than GIN on JSONB
-- 3. JOINs: Can join tables on correlation_id efficiently
-- 4. Type safety: Database enforces UUID type
-- 5. Queries: Simpler SQL without JSONB operators
--
-- The correlation_id is populated by:
-- 1. emit_notification_event() RPC function (sets on insert)
-- 2. Notification worker (copies from event to delivery)
-- 3. Webhook handlers (updates existing records)
--
-- Migration strategy:
-- - New records will have correlation_id populated
-- - Existing records keep NULL (can backfill if needed)
-- - Partial indexes only index non-NULL values for efficiency
--
