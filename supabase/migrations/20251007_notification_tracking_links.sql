-- supabase/migrations/20251007_notification_tracking_links.sql
-- =====================================================
-- NOTIFICATION TRACKING LINKS - PHASE 3
-- =====================================================
-- Creates link shortener infrastructure for SMS click tracking
--
-- Phase 3 Goal: Track clicks on links in SMS messages
-- =====================================================

-- =====================================================
-- 1. TRACKING LINKS TABLE
-- =====================================================

-- notification_tracking_links: URL shortener for tracking clicks in SMS
CREATE TABLE IF NOT EXISTS notification_tracking_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link details
  short_code TEXT UNIQUE NOT NULL,
  delivery_id UUID NOT NULL REFERENCES notification_deliveries(id) ON DELETE CASCADE,
  destination_url TEXT NOT NULL,

  -- Tracking timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  first_clicked_at TIMESTAMPTZ,
  last_clicked_at TIMESTAMPTZ,
  click_count INTEGER DEFAULT 0,

  -- Optional metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for performance
CREATE INDEX idx_tracking_links_short_code ON notification_tracking_links(short_code);
CREATE INDEX idx_tracking_links_delivery_id ON notification_tracking_links(delivery_id);
CREATE INDEX idx_tracking_links_created ON notification_tracking_links(created_at DESC);

-- Comments for documentation
COMMENT ON TABLE notification_tracking_links IS 'URL shortener for tracking clicks in SMS notifications';
COMMENT ON COLUMN notification_tracking_links.short_code IS 'Unique 6-character code used in shortened URL (e.g., "abc123")';
COMMENT ON COLUMN notification_tracking_links.delivery_id IS 'Associated notification delivery (cascades on delete)';
COMMENT ON COLUMN notification_tracking_links.destination_url IS 'Original URL to redirect to after tracking';
COMMENT ON COLUMN notification_tracking_links.click_count IS 'Total number of times this link was clicked';

-- =====================================================
-- 2. HELPER FUNCTIONS
-- =====================================================

-- Generate random short code (6 characters, base62)
CREATE OR REPLACE FUNCTION generate_short_code(length INTEGER DEFAULT 6)
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..length LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql VOLATILE;

COMMENT ON FUNCTION generate_short_code IS 'Generates random alphanumeric code for URL shortening';

-- Create tracking link with unique short code (handles collisions)
CREATE OR REPLACE FUNCTION create_tracking_link(
  p_delivery_id UUID,
  p_destination_url TEXT
)
RETURNS TEXT AS $$
DECLARE
  v_short_code TEXT;
  v_max_attempts INTEGER := 10;
  v_attempt INTEGER := 0;
BEGIN
  -- Validate inputs
  IF p_delivery_id IS NULL THEN
    RAISE EXCEPTION 'delivery_id cannot be null';
  END IF;

  IF p_destination_url IS NULL OR p_destination_url = '' THEN
    RAISE EXCEPTION 'destination_url cannot be empty';
  END IF;

  -- Try to generate unique short code
  LOOP
    v_short_code := generate_short_code(6);

    BEGIN
      INSERT INTO notification_tracking_links (
        short_code,
        delivery_id,
        destination_url
      ) VALUES (
        v_short_code,
        p_delivery_id,
        p_destination_url
      );

      -- Success! Return the short code
      RETURN v_short_code;

    EXCEPTION WHEN unique_violation THEN
      -- Collision detected, try again
      v_attempt := v_attempt + 1;

      IF v_attempt >= v_max_attempts THEN
        RAISE EXCEPTION 'Failed to generate unique short code after % attempts', v_max_attempts;
      END IF;

      -- Log collision (optional, for monitoring)
      RAISE NOTICE 'Short code collision on attempt %, retrying...', v_attempt;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_tracking_link IS 'Creates a tracking link with unique short code, retries on collision';

-- =====================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS
ALTER TABLE notification_tracking_links ENABLE ROW LEVEL SECURITY;

-- Policy 1: Anyone can read tracking links (needed for public redirect endpoint)
CREATE POLICY "Anyone can read tracking links"
ON notification_tracking_links
FOR SELECT
USING (true);

-- Policy 2: Service role can insert tracking links (worker creates them)
CREATE POLICY "Service role can create tracking links"
ON notification_tracking_links
FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- Policy 3: Service role can update tracking links (for click counts)
CREATE POLICY "Service role can update tracking links"
ON notification_tracking_links
FOR UPDATE
USING (auth.role() = 'service_role');

-- Policy 4: Authenticated users can update tracking links (for click counts from web)
CREATE POLICY "Authenticated users can update tracking links"
ON notification_tracking_links
FOR UPDATE
USING (auth.role() = 'authenticated');

-- =====================================================
-- 4. GRANT PERMISSIONS
-- =====================================================

-- Grant table access
GRANT SELECT ON notification_tracking_links TO anon;
GRANT SELECT ON notification_tracking_links TO authenticated;
GRANT ALL ON notification_tracking_links TO service_role;

-- Grant function access
GRANT EXECUTE ON FUNCTION generate_short_code TO service_role;
GRANT EXECUTE ON FUNCTION create_tracking_link TO service_role;

-- =====================================================
-- 5. ANALYTICS HELPER FUNCTION (OPTIONAL)
-- =====================================================

-- Get link click statistics
CREATE OR REPLACE FUNCTION get_link_click_stats(
  p_delivery_id UUID DEFAULT NULL,
  p_days_back INTEGER DEFAULT 7
)
RETURNS TABLE (
  total_links BIGINT,
  total_clicks BIGINT,
  unique_clicked_links BIGINT,
  click_through_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_links,
    SUM(click_count)::BIGINT as total_clicks,
    COUNT(*) FILTER (WHERE click_count > 0)::BIGINT as unique_clicked_links,
    CASE
      WHEN COUNT(*) > 0 THEN
        ROUND(100.0 * COUNT(*) FILTER (WHERE click_count > 0) / COUNT(*), 2)
      ELSE 0
    END as click_through_rate
  FROM notification_tracking_links
  WHERE
    (p_delivery_id IS NULL OR delivery_id = p_delivery_id)
    AND created_at > NOW() - (p_days_back || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_link_click_stats IS 'Returns click statistics for tracking links';

-- =====================================================
-- 6. CLEANUP FUNCTION (OPTIONAL)
-- =====================================================

-- Delete old tracking links (optional, run via cron or manually)
CREATE OR REPLACE FUNCTION cleanup_old_tracking_links(
  p_days_old INTEGER DEFAULT 90
)
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM notification_tracking_links
  WHERE created_at < NOW() - (p_days_old || ' days')::INTERVAL;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RAISE NOTICE 'Deleted % old tracking links', v_deleted_count;

  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_tracking_links IS 'Deletes tracking links older than specified days (default 90)';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Verify table created
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_tracking_links') THEN
    RAISE NOTICE '✅ notification_tracking_links table created successfully';
  ELSE
    RAISE EXCEPTION '❌ Failed to create notification_tracking_links table';
  END IF;
END $$;
