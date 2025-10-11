-- =====================================================
-- ATOMIC TWILIO WEBHOOK DUAL-TABLE UPDATES
-- =====================================================
-- Fixes race condition where sms_messages and notification_deliveries
-- could become out of sync due to non-atomic updates
--
-- Bug #6: Twilio webhook dual-table update race condition
-- Location: /apps/web/src/routes/api/webhooks/twilio/status/+server.ts
-- Issue: Non-atomic updates to both tables can lead to inconsistent state
-- =====================================================

-- =====================================================
-- DROP EXISTING FUNCTION (IF ANY)
-- =====================================================
-- Drop first to avoid return type conflicts if function already exists

DROP FUNCTION IF EXISTS update_sms_status_atomic(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT);

-- =====================================================
-- ATOMIC SMS STATUS UPDATE
-- =====================================================
-- Updates both sms_messages and notification_deliveries atomically
-- Ensures data consistency even if process crashes mid-update

CREATE OR REPLACE FUNCTION update_sms_status_atomic(
  p_message_id UUID,
  p_twilio_sid TEXT,
  p_twilio_status TEXT,
  p_mapped_status TEXT,
  p_error_code INTEGER DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS TABLE (
  notification_delivery_id UUID,
  user_id UUID,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  attempt_count INTEGER,
  max_attempts INTEGER,
  priority TEXT,
  updated_sms BOOLEAN,
  updated_delivery BOOLEAN
) AS $$
DECLARE
  v_sms_record RECORD;
  v_delivery_status TEXT;
  v_timestamp TIMESTAMPTZ := NOW();
  v_sms_updated BOOLEAN := FALSE;
  v_delivery_updated BOOLEAN := FALSE;
BEGIN
  -- Start transaction (function is atomic by default)

  -- Prepare SMS message update data
  -- Build status-specific timestamps
  DECLARE
    v_sms_update_sent_at TIMESTAMPTZ;
    v_sms_update_delivered_at TIMESTAMPTZ;
  BEGIN
    -- Determine sent_at timestamp
    IF p_twilio_status IN ('sent', 'sending') THEN
      v_sms_update_sent_at := v_timestamp;
    ELSE
      v_sms_update_sent_at := NULL; -- Don't update if not sent
    END IF;

    -- Determine delivered_at timestamp
    IF p_twilio_status = 'delivered' THEN
      v_sms_update_delivered_at := v_timestamp;
    ELSE
      v_sms_update_delivered_at := NULL;
    END IF;

    -- Update sms_messages table
    UPDATE sms_messages
    SET
      twilio_status = p_twilio_status,
      status = p_mapped_status::sms_status,
      sent_at = COALESCE(v_sms_update_sent_at, sms_messages.sent_at),
      delivered_at = COALESCE(v_sms_update_delivered_at, sms_messages.delivered_at),
      twilio_error_code = COALESCE(p_error_code, sms_messages.twilio_error_code),
      twilio_error_message = COALESCE(p_error_message, sms_messages.twilio_error_message),
      updated_at = v_timestamp
    WHERE sms_messages.id = p_message_id
      AND sms_messages.twilio_sid = p_twilio_sid
    RETURNING
      sms_messages.notification_delivery_id,
      sms_messages.user_id,
      sms_messages.sent_at,
      sms_messages.delivered_at,
      sms_messages.attempt_count,
      sms_messages.max_attempts,
      sms_messages.priority
    INTO v_sms_record;

    IF FOUND THEN
      v_sms_updated := TRUE;
    ELSE
      -- SMS message not found, return early
      RETURN QUERY SELECT
        NULL::UUID,
        NULL::UUID,
        NULL::TIMESTAMPTZ,
        NULL::TIMESTAMPTZ,
        NULL::INTEGER,
        NULL::INTEGER,
        NULL::TEXT,
        FALSE,
        FALSE;
      RETURN;
    END IF;
  END;

  -- Update notification_deliveries if linked
  IF v_sms_record.notification_delivery_id IS NOT NULL THEN
    -- Map Twilio status to notification delivery status
    v_delivery_status := CASE
      WHEN p_twilio_status IN ('queued', 'accepted') THEN 'pending'
      WHEN p_twilio_status IN ('sending', 'sent', 'receiving') THEN 'sent'
      WHEN p_twilio_status IN ('received', 'delivered') THEN 'delivered'
      WHEN p_twilio_status IN ('failed', 'undelivered', 'canceled') THEN 'failed'
      ELSE 'pending'
    END;

    -- Prepare delivery update with conditional timestamps
    UPDATE notification_deliveries
    SET
      status = v_delivery_status::notification_status,
      sent_at = CASE
        WHEN p_twilio_status IN ('sent', 'sending', 'receiving') THEN v_timestamp
        ELSE notification_deliveries.sent_at
      END,
      delivered_at = CASE
        WHEN p_twilio_status IN ('delivered', 'received') THEN v_timestamp
        ELSE notification_deliveries.delivered_at
      END,
      failed_at = CASE
        WHEN p_twilio_status IN ('failed', 'undelivered', 'canceled') THEN v_timestamp
        ELSE notification_deliveries.failed_at
      END,
      last_error = CASE
        WHEN p_error_message IS NOT NULL THEN
          CASE
            WHEN p_error_code IS NOT NULL THEN p_error_message || ' (Code: ' || p_error_code || ')'
            ELSE p_error_message
          END
        WHEN p_error_code IS NOT NULL THEN 'Twilio error code: ' || p_error_code
        ELSE notification_deliveries.last_error
      END,
      updated_at = v_timestamp
    WHERE notification_deliveries.id = v_sms_record.notification_delivery_id;

    IF FOUND THEN
      v_delivery_updated := TRUE;
    END IF;
  END IF;

  -- Return result with all relevant data
  RETURN QUERY SELECT
    v_sms_record.notification_delivery_id,
    v_sms_record.user_id,
    v_sms_record.sent_at,
    v_sms_record.delivered_at,
    v_sms_record.attempt_count,
    v_sms_record.max_attempts,
    v_sms_record.priority,
    v_sms_updated,
    v_delivery_updated;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_sms_status_atomic IS 'Atomically updates both sms_messages and notification_deliveries tables for Twilio webhook status updates. Prevents race conditions and ensures data consistency.';

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================
-- Re-grant permissions after dropping function
-- Must specify full function signature for proper grant

GRANT EXECUTE ON FUNCTION update_sms_status_atomic(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION update_sms_status_atomic(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT) TO authenticated;

-- =====================================================
-- NOTES
-- =====================================================
-- This function solves Bug #6: Twilio webhook dual-table update race condition
--
-- Benefits:
-- 1. Atomic Updates: Both tables updated in single transaction
-- 2. Consistency: No possibility of partial updates
-- 3. Crash Safety: Transaction rolls back if any step fails
-- 4. Race Condition Prevention: Database-level locking prevents concurrent updates
-- 5. Timestamp Handling: Preserves existing timestamps, only sets new ones when appropriate
--
-- Usage in webhook handler:
-- Replace two separate UPDATE queries with single RPC call:
--   await supabase.rpc('update_sms_status_atomic', {
--     p_message_id: messageId,
--     p_twilio_sid: messageSid,
--     p_twilio_status: messageStatus,
--     p_mapped_status: mappedStatus,
--     p_error_code: errorCode ? parseInt(errorCode) : null,
--     p_error_message: errorMessage
--   });
--
-- Migration Strategy:
-- - Function is backwards compatible with existing data
-- - Webhook handler can be updated to use this RPC
-- - Old direct queries will continue to work during migration
