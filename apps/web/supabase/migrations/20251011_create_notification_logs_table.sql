-- =====================================================
-- CREATE NOTIFICATION LOGS TABLE
-- =====================================================
-- Creates a comprehensive logging table for notification system
-- with correlation ID tracking across web → worker → webhook flow
-- =====================================================

-- =====================================================
-- 1. CREATE NOTIFICATION_LOGS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS notification_logs (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Correlation tracking (critical for tracing requests across systems)
  correlation_id UUID, -- Nullable: not all logs have correlation context
  request_id TEXT,

  -- Context (foreign keys to related entities)
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  notification_event_id UUID REFERENCES notification_events(id) ON DELETE CASCADE,
  notification_delivery_id UUID REFERENCES notification_deliveries(id) ON DELETE CASCADE,

  -- Log details
  level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error', 'fatal')),
  message TEXT NOT NULL,
  namespace TEXT, -- e.g., 'web:api:emit', 'worker:notification', 'web:webhook:twilio'

  -- Metadata and error details
  metadata JSONB,
  error_stack TEXT,

  -- Timing
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- =====================================================
-- These indexes enable fast queries by correlation ID, event, delivery, level, and time

CREATE INDEX IF NOT EXISTS idx_notification_logs_correlation
  ON notification_logs(correlation_id);

CREATE INDEX IF NOT EXISTS idx_notification_logs_event
  ON notification_logs(notification_event_id)
  WHERE notification_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_logs_delivery
  ON notification_logs(notification_delivery_id)
  WHERE notification_delivery_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_logs_created
  ON notification_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_logs_level
  ON notification_logs(level);

CREATE INDEX IF NOT EXISTS idx_notification_logs_user
  ON notification_logs(user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_logs_namespace
  ON notification_logs(namespace)
  WHERE namespace IS NOT NULL;

-- Composite index for common query pattern: filtering by level + time range
CREATE INDEX IF NOT EXISTS idx_notification_logs_level_created
  ON notification_logs(level, created_at DESC);

-- Full-text search index for message and namespace
CREATE INDEX IF NOT EXISTS idx_notification_logs_search
  ON notification_logs USING GIN (to_tsvector('english', message || ' ' || COALESCE(namespace, '')));

-- =====================================================
-- 3. GRANT PERMISSIONS
-- =====================================================
-- authenticated users can read logs for debugging
-- service_role can insert logs from API/worker

GRANT SELECT ON notification_logs TO authenticated;
GRANT INSERT ON notification_logs TO service_role;
GRANT SELECT, INSERT ON notification_logs TO service_role;

-- =====================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- =====================================================
-- Enable RLS for security
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

-- Admin users can see all logs
CREATE POLICY "Admin users can view all notification logs"
  ON notification_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.is_admin = true
    )
  );

-- Users can only see their own logs
CREATE POLICY "Users can view their own notification logs"
  ON notification_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Service role can insert logs (used by API and worker)
CREATE POLICY "Service role can insert notification logs"
  ON notification_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- =====================================================
-- 5. ADD COMMENTS
-- =====================================================

COMMENT ON TABLE notification_logs IS
'Comprehensive logging table for notification system with correlation ID tracking across web → worker → webhook flow';

COMMENT ON COLUMN notification_logs.correlation_id IS
'UUID that tracks a notification request across all systems (web API → worker → webhooks)';

COMMENT ON COLUMN notification_logs.request_id IS
'Optional HTTP request ID for additional context';

COMMENT ON COLUMN notification_logs.level IS
'Log level: debug, info, warn, error, fatal';

COMMENT ON COLUMN notification_logs.namespace IS
'Logger namespace (e.g., web:api:emit, worker:notification, web:webhook:twilio)';

COMMENT ON COLUMN notification_logs.metadata IS
'Structured metadata as JSON (event types, delivery counts, etc.)';

COMMENT ON COLUMN notification_logs.error_stack IS
'Full error stack trace for error and fatal level logs';

-- =====================================================
-- NOTES
-- =====================================================
-- This table enables:
-- 1. End-to-end request tracing via correlation_id
-- 2. Fast queries by level, time range, event, delivery, user
-- 3. Security via RLS (admin sees all, users see their own)
-- 4. Flexible metadata storage via JSONB
-- 5. Performance via targeted indexes including partial indexes
--
-- Usage:
-- - Web API emits logs when creating notification events
-- - Worker logs when processing notifications
-- - Webhooks log when receiving status updates
-- - Admin UI queries logs for debugging and monitoring
--
-- Correlation flow example:
-- 1. Web API: emit notification → generate correlation_id → log event
-- 2. Worker: claim job → extract correlation_id from metadata → log processing
-- 3. Webhook: receive status → extract correlation_id from SMS metadata → log update
-- 4. Admin UI: query all logs with same correlation_id → see full flow
