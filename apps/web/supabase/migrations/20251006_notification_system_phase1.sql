-- =====================================================
-- EXTENSIBLE NOTIFICATION SYSTEM - PHASE 1
-- =====================================================
-- Creates core notification infrastructure for admin-only
-- user signup notifications with browser push support
--
-- Phase 1 Goal: Admin notifications on user signup
-- =====================================================

-- =====================================================
-- 1. CORE NOTIFICATION TABLES
-- =====================================================

-- notification_events: Immutable log of all notification-worthy events
CREATE TABLE IF NOT EXISTS notification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  event_source TEXT NOT NULL CHECK (
    event_source IN ('database_trigger', 'worker_job', 'api_action', 'cron_scheduler')
  ),

  -- Event actors and targets
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB,

  -- Validation
  CONSTRAINT valid_event_type CHECK (event_type ~ '^[a-z]+\.[a-z_]+$')
);

CREATE INDEX idx_notification_events_type ON notification_events(event_type);
CREATE INDEX idx_notification_events_target_user ON notification_events(target_user_id);
CREATE INDEX idx_notification_events_created_at ON notification_events(created_at DESC);

COMMENT ON TABLE notification_events IS 'Immutable log of all notification-worthy events in the system';
COMMENT ON COLUMN notification_events.event_type IS 'Event type in format: domain.action (e.g., user.signup, brief.completed)';
COMMENT ON COLUMN notification_events.event_source IS 'Source that triggered the event';
COMMENT ON COLUMN notification_events.actor_user_id IS 'User who caused the event (null for system events)';
COMMENT ON COLUMN notification_events.target_user_id IS 'User affected by the event (null for system-wide events)';

-- notification_subscriptions: Who subscribes to what events
CREATE TABLE IF NOT EXISTS notification_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,

  -- Subscription control
  is_active BOOLEAN DEFAULT TRUE,
  admin_only BOOLEAN DEFAULT FALSE,

  -- Optional filters for advanced use cases
  filters JSONB,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),

  -- Prevent duplicates
  UNIQUE(user_id, event_type)
);

CREATE INDEX idx_notif_subs_user_id ON notification_subscriptions(user_id);
CREATE INDEX idx_notif_subs_event_type ON notification_subscriptions(event_type);
CREATE INDEX idx_notif_subs_active ON notification_subscriptions(is_active) WHERE is_active = true;

COMMENT ON TABLE notification_subscriptions IS 'Defines which users subscribe to which notification events';
COMMENT ON COLUMN notification_subscriptions.admin_only IS 'When true, only admin users can subscribe to this event type';

-- user_notification_preferences: Per-user, per-event-type, per-channel preferences
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,

  -- Channel preferences
  push_enabled BOOLEAN DEFAULT TRUE,
  email_enabled BOOLEAN DEFAULT TRUE,
  sms_enabled BOOLEAN DEFAULT FALSE,
  in_app_enabled BOOLEAN DEFAULT TRUE,

  -- Delivery preferences
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('urgent', 'normal', 'low')),
  batch_enabled BOOLEAN DEFAULT FALSE,
  batch_interval_minutes INTEGER,

  -- Quiet hours
  quiet_hours_enabled BOOLEAN DEFAULT FALSE,
  quiet_hours_start TIME DEFAULT '22:00:00',
  quiet_hours_end TIME DEFAULT '08:00:00',
  timezone TEXT DEFAULT 'UTC',

  -- Frequency limits
  max_per_day INTEGER,
  max_per_hour INTEGER,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, event_type)
);

CREATE INDEX idx_user_notif_prefs_user_id ON user_notification_preferences(user_id);
CREATE INDEX idx_user_notif_prefs_event_type ON user_notification_preferences(event_type);

COMMENT ON TABLE user_notification_preferences IS 'User preferences for how they want to receive notifications per event type';

-- notification_deliveries: Track all notification deliveries across all channels
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event relationship
  event_id UUID REFERENCES notification_events(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES notification_subscriptions(id) ON DELETE SET NULL,

  -- Recipient
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Channel details
  channel TEXT NOT NULL CHECK (channel IN ('push', 'email', 'sms', 'in_app')),
  channel_identifier TEXT,

  -- Delivery status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'sent', 'delivered', 'failed', 'bounced', 'opened', 'clicked')
  ),

  -- Payload
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Tracking timestamps
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,

  -- Retry tracking
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,

  -- External tracking IDs
  external_id TEXT,
  tracking_id TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notif_deliveries_event_id ON notification_deliveries(event_id);
CREATE INDEX idx_notif_deliveries_recipient ON notification_deliveries(recipient_user_id);
CREATE INDEX idx_notif_deliveries_status ON notification_deliveries(status);
CREATE INDEX idx_notif_deliveries_channel ON notification_deliveries(channel);
CREATE INDEX idx_notif_deliveries_created_at ON notification_deliveries(created_at DESC);

COMMENT ON TABLE notification_deliveries IS 'Tracks all notification delivery attempts across all channels';

-- =====================================================
-- 2. BROWSER PUSH INFRASTRUCTURE
-- =====================================================

-- push_subscriptions: Store browser push subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Push subscription data (from browser's PushManager.subscribe())
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,

  -- Metadata
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,

  -- Prevent duplicate subscriptions for same endpoint
  UNIQUE(endpoint)
);

CREATE INDEX idx_push_subs_user_id ON push_subscriptions(user_id);
CREATE INDEX idx_push_subs_active ON push_subscriptions(is_active) WHERE is_active = true;

COMMENT ON TABLE push_subscriptions IS 'Browser push notification subscriptions for users';
COMMENT ON COLUMN push_subscriptions.endpoint IS 'Unique push service endpoint URL';
COMMENT ON COLUMN push_subscriptions.p256dh_key IS 'Public key for message encryption';
COMMENT ON COLUMN push_subscriptions.auth_key IS 'Authentication secret for encryption';

-- =====================================================
-- 3. QUEUE INTEGRATION
-- =====================================================

-- Add send_notification to queue_type enum if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'queue_type'
        AND e.enumlabel = 'send_notification'
    ) THEN
        ALTER TYPE queue_type ADD VALUE 'send_notification';
        RAISE NOTICE 'Added send_notification to queue_type enum';
    ELSE
        RAISE NOTICE 'send_notification already exists in queue_type enum';
    END IF;
END$$;

-- =====================================================
-- 4. HELPER FUNCTIONS
-- =====================================================

-- Auto-create default preferences when user subscribes to an event
CREATE OR REPLACE FUNCTION create_default_notification_prefs()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_notification_preferences (user_id, event_type)
  VALUES (NEW.user_id, NEW.event_type)
  ON CONFLICT (user_id, event_type) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_notif_prefs_on_subscribe
AFTER INSERT ON notification_subscriptions
FOR EACH ROW EXECUTE FUNCTION create_default_notification_prefs();

COMMENT ON FUNCTION create_default_notification_prefs() IS 'Automatically creates default notification preferences when user subscribes to an event';

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_notification_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_notif_subs_updated_at
BEFORE UPDATE ON notification_subscriptions
FOR EACH ROW EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER update_notif_prefs_updated_at
BEFORE UPDATE ON user_notification_preferences
FOR EACH ROW EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER update_notif_deliveries_updated_at
BEFORE UPDATE ON notification_deliveries
FOR EACH ROW EXECUTE FUNCTION update_notification_updated_at();

-- =====================================================
-- 5. EVENT DISPATCHER RPC FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION emit_notification_event(
  p_event_type TEXT,
  p_event_source TEXT,
  p_actor_user_id UUID DEFAULT NULL,
  p_target_user_id UUID DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::jsonb,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
  v_subscription RECORD;
  v_prefs RECORD;
  v_delivery_id UUID;
  v_push_sub RECORD;
BEGIN
  -- Insert event
  INSERT INTO notification_events (
    event_type,
    event_source,
    actor_user_id,
    target_user_id,
    payload,
    metadata
  ) VALUES (
    p_event_type,
    p_event_source,
    p_actor_user_id,
    p_target_user_id,
    p_payload,
    p_metadata
  ) RETURNING id INTO v_event_id;

  -- Find active subscriptions for this event type
  FOR v_subscription IN
    SELECT * FROM notification_subscriptions
    WHERE event_type = p_event_type
      AND is_active = true
  LOOP
    -- Get user preferences (use defaults if not found)
    SELECT * INTO v_prefs
    FROM user_notification_preferences
    WHERE user_id = v_subscription.user_id
      AND event_type = p_event_type;

    -- If no preferences exist, use safe defaults (push enabled)
    IF NOT FOUND THEN
      v_prefs.push_enabled := true;
      v_prefs.email_enabled := false;
      v_prefs.sms_enabled := false;
      v_prefs.in_app_enabled := true;
    END IF;

    -- Queue browser push notifications
    IF v_prefs.push_enabled THEN
      -- Find active push subscriptions for this user
      FOR v_push_sub IN
        SELECT * FROM push_subscriptions
        WHERE user_id = v_subscription.user_id
          AND is_active = true
      LOOP
        -- Create delivery record
        INSERT INTO notification_deliveries (
          event_id,
          subscription_id,
          recipient_user_id,
          channel,
          channel_identifier,
          payload,
          status
        ) VALUES (
          v_event_id,
          v_subscription.id,
          v_subscription.user_id,
          'push',
          v_push_sub.endpoint,
          p_payload,
          'pending'
        ) RETURNING id INTO v_delivery_id;

        -- Queue notification job
        INSERT INTO queue_jobs (
          user_id,
          job_type,
          status,
          scheduled_for,
          queue_job_id,
          metadata
        ) VALUES (
          v_subscription.user_id,
          'send_notification',
          'pending',
          NOW(),
          'notif_' || v_delivery_id::text,
          jsonb_build_object(
            'event_id', v_event_id,
            'delivery_id', v_delivery_id,
            'channel', 'push',
            'event_type', p_event_type
          )
        );
      END LOOP;
    END IF;

    -- Queue in-app notifications
    IF v_prefs.in_app_enabled THEN
      INSERT INTO notification_deliveries (
        event_id,
        subscription_id,
        recipient_user_id,
        channel,
        payload,
        status
      ) VALUES (
        v_event_id,
        v_subscription.id,
        v_subscription.user_id,
        'in_app',
        p_payload,
        'pending'
      ) RETURNING id INTO v_delivery_id;

      INSERT INTO queue_jobs (
        user_id,
        job_type,
        status,
        scheduled_for,
        queue_job_id,
        metadata
      ) VALUES (
        v_subscription.user_id,
        'send_notification',
        'pending',
        NOW(),
        'notif_' || v_delivery_id::text,
        jsonb_build_object(
          'event_id', v_event_id,
          'delivery_id', v_delivery_id,
          'channel', 'in_app',
          'event_type', p_event_type
        )
      );
    END IF;

    -- Email and SMS would be added here in future phases
  END LOOP;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION emit_notification_event IS 'Emits a notification event and queues deliveries to all subscribers based on their preferences';

GRANT EXECUTE ON FUNCTION emit_notification_event TO authenticated;

-- =====================================================
-- 6. ROW LEVEL SECURITY
-- =====================================================

-- notification_events: Users can see events they're involved in
ALTER TABLE notification_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own events" ON notification_events
  FOR SELECT
  USING (
    auth.uid() = actor_user_id
    OR auth.uid() = target_user_id
    OR EXISTS (
      SELECT 1 FROM admin_users WHERE user_id = auth.uid()
    )
  );

-- notification_subscriptions: Users can manage their own subscriptions
ALTER TABLE notification_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own subscriptions" ON notification_subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own subscriptions" ON notification_subscriptions
  FOR ALL
  USING (auth.uid() = user_id);

-- user_notification_preferences: Users can manage their own preferences
ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own preferences" ON user_notification_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own preferences" ON user_notification_preferences
  FOR ALL
  USING (auth.uid() = user_id);

-- notification_deliveries: Users can see their own deliveries
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own deliveries" ON notification_deliveries
  FOR SELECT
  USING (
    auth.uid() = recipient_user_id
    OR EXISTS (
      SELECT 1 FROM admin_users WHERE user_id = auth.uid()
    )
  );

-- push_subscriptions: Users can manage their own push subscriptions
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own push subscriptions" ON push_subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own push subscriptions" ON push_subscriptions
  FOR ALL
  USING (auth.uid() = user_id);

-- =====================================================
-- 7. SEED ADMIN SUBSCRIPTIONS FOR USER.SIGNUP EVENT
-- =====================================================

-- Subscribe all admin users to user.signup events
INSERT INTO notification_subscriptions (user_id, event_type, admin_only)
SELECT
  user_id,
  'user.signup',
  true
FROM admin_users
ON CONFLICT (user_id, event_type) DO NOTHING;

-- Create default preferences for admin users
INSERT INTO user_notification_preferences (user_id, event_type, push_enabled, in_app_enabled)
SELECT
  user_id,
  'user.signup',
  true,
  true
FROM admin_users
ON CONFLICT (user_id, event_type) DO NOTHING;

-- =====================================================
-- 8. UPDATE USER SIGNUP TRIGGER
-- =====================================================

-- Modify existing handle_new_user_trial function to emit notification event
CREATE OR REPLACE FUNCTION handle_new_user_trial()
RETURNS TRIGGER AS $$
DECLARE
  v_trial_days INTEGER;
  v_event_id UUID;
BEGIN
  -- Get trial days from environment or use default
  v_trial_days := COALESCE(
    current_setting('app.trial_days', true)::INTEGER,
    14
  );

  -- Set trial end date and subscription status for new users
  IF NEW.subscription_status IS NULL OR NEW.subscription_status = 'free' THEN
    NEW.subscription_status := 'trialing';
    NEW.trial_ends_at := NOW() + (v_trial_days || ' days')::INTERVAL;
  END IF;

  -- Emit user signup notification event (async via PERFORM)
  -- This will notify all subscribed admins
  PERFORM emit_notification_event(
    p_event_type := 'user.signup',
    p_event_source := 'database_trigger',
    p_actor_user_id := NEW.id,
    p_payload := jsonb_build_object(
      'user_id', NEW.id,
      'user_email', NEW.email,
      'signup_method', COALESCE(
        (SELECT provider FROM auth.users WHERE id = NEW.id LIMIT 1),
        'email'
      ),
      'referral_source', NEW.referral_source,
      'created_at', NEW.created_at
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure trigger exists (it should from the trial_system migration)
DROP TRIGGER IF EXISTS on_auth_user_created_trial ON users;
CREATE TRIGGER on_auth_user_created_trial
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_trial();

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Add comment to track migration
COMMENT ON TABLE notification_events IS 'PHASE 1 COMPLETE - Extensible notification system with admin user signup notifications';
