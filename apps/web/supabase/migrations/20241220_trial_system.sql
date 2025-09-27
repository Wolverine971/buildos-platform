-- supabase/migrations/20241220_trial_system.sql

-- Add trial configuration to users if not exists
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_beta_user BOOLEAN DEFAULT FALSE;

-- Create function to handle new user trial setup
CREATE OR REPLACE FUNCTION handle_new_user_trial()
RETURNS TRIGGER AS $$
DECLARE
  v_trial_days INTEGER;
BEGIN
  -- Get trial days from environment or use default
  v_trial_days := COALESCE(
    current_setting('app.trial_days', true)::INTEGER,
    14 -- Default trial days
  );

  -- Set trial end date and subscription status for new users
  IF NEW.subscription_status IS NULL OR NEW.subscription_status = 'free' THEN
    NEW.subscription_status := 'trialing';
    NEW.trial_ends_at := NOW() + (v_trial_days || ' days')::INTERVAL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user registration
DROP TRIGGER IF EXISTS on_auth_user_created_trial ON users;
CREATE TRIGGER on_auth_user_created_trial
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_trial();

-- Update existing free users to trial (one-time migration)
-- Give existing users 30 days grace period
UPDATE users 
SET 
  subscription_status = 'trialing',
  trial_ends_at = NOW() + INTERVAL '30 days'
WHERE 
  subscription_status = 'free' 
  AND trial_ends_at IS NULL;

-- Create trial_reminders table to track email notifications
CREATE TABLE IF NOT EXISTS trial_reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('7_days', '3_days', '1_day', 'expired', 'grace_period')),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, reminder_type)
);

-- Create index for performance
CREATE INDEX idx_trial_reminders_user_id ON trial_reminders(user_id);

-- Create function to check trial status
CREATE OR REPLACE FUNCTION get_user_trial_status(p_user_id UUID)
RETURNS TABLE (
  is_in_trial BOOLEAN,
  is_trial_expired BOOLEAN,
  is_in_grace_period BOOLEAN,
  days_until_trial_end INTEGER,
  trial_end_date TIMESTAMPTZ,
  has_active_subscription BOOLEAN,
  is_read_only BOOLEAN
) AS $$
DECLARE
  v_user RECORD;
  v_grace_period_days INTEGER := 7;
BEGIN
  -- Get user data
  SELECT 
    u.trial_ends_at,
    u.subscription_status,
    EXISTS(
      SELECT 1 FROM customer_subscriptions cs
      WHERE cs.user_id = u.id
      AND cs.status = 'active'
    ) as has_active_sub
  INTO v_user
  FROM users u
  WHERE u.id = p_user_id;

  -- Calculate trial status
  RETURN QUERY
  SELECT
    -- Is in trial
    CASE 
      WHEN v_user.trial_ends_at IS NULL THEN FALSE
      WHEN v_user.has_active_sub THEN FALSE
      WHEN v_user.trial_ends_at > NOW() THEN TRUE
      ELSE FALSE
    END as is_in_trial,
    
    -- Is trial expired (past grace period)
    CASE
      WHEN v_user.trial_ends_at IS NULL THEN FALSE
      WHEN v_user.has_active_sub THEN FALSE
      WHEN v_user.trial_ends_at + (v_grace_period_days || ' days')::INTERVAL < NOW() THEN TRUE
      ELSE FALSE
    END as is_trial_expired,
    
    -- Is in grace period
    CASE
      WHEN v_user.trial_ends_at IS NULL THEN FALSE
      WHEN v_user.has_active_sub THEN FALSE
      WHEN v_user.trial_ends_at < NOW() 
        AND v_user.trial_ends_at + (v_grace_period_days || ' days')::INTERVAL >= NOW() THEN TRUE
      ELSE FALSE
    END as is_in_grace_period,
    
    -- Days until trial end
    CASE
      WHEN v_user.trial_ends_at IS NULL THEN 0
      WHEN v_user.has_active_sub THEN 0
      ELSE GREATEST(0, EXTRACT(DAY FROM v_user.trial_ends_at - NOW())::INTEGER)
    END as days_until_trial_end,
    
    -- Trial end date
    v_user.trial_ends_at,
    
    -- Has active subscription
    v_user.has_active_sub,
    
    -- Is read only (trial expired or in grace period without subscription)
    CASE
      WHEN v_user.has_active_sub THEN FALSE
      WHEN v_user.trial_ends_at IS NULL THEN FALSE
      WHEN v_user.trial_ends_at < NOW() THEN TRUE
      ELSE FALSE
    END as is_read_only;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_user_trial_status(UUID) TO authenticated;

-- Create RLS policies for trial_reminders
ALTER TABLE trial_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own trial reminders" ON trial_reminders
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert trial reminders" ON trial_reminders
  FOR INSERT
  WITH CHECK (true);

-- Create view for admin to see trial statistics
CREATE OR REPLACE VIEW trial_statistics AS
SELECT
  COUNT(*) FILTER (WHERE subscription_status = 'trialing' AND trial_ends_at > NOW()) as active_trials,
  COUNT(*) FILTER (WHERE subscription_status = 'trialing' AND trial_ends_at < NOW()) as expired_trials,
  COUNT(*) FILTER (WHERE subscription_status = 'active') as active_subscriptions,
  COUNT(*) FILTER (WHERE is_beta_user = true) as beta_users,
  AVG(EXTRACT(DAY FROM trial_ends_at - created_at)) as avg_trial_length_days
FROM users;

-- Grant access to admin
GRANT SELECT ON trial_statistics TO authenticated;