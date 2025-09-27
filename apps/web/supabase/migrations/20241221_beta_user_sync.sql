-- supabase/migrations/20241221_beta_user_sync.sql

-- Update the handle_new_user_trial function to check for beta members
CREATE OR REPLACE FUNCTION handle_new_user_trial()
RETURNS TRIGGER AS $$
DECLARE
  v_trial_days INTEGER;
  v_is_beta_member BOOLEAN;
BEGIN
  -- Get trial days from environment or use default
  v_trial_days := COALESCE(
    current_setting('app.trial_days', true)::INTEGER,
    14 -- Default trial days
  );

  -- Check if this email is already a beta member
  SELECT EXISTS (
    SELECT 1 
    FROM beta_members 
    WHERE email = NEW.email 
    AND (access_level = 'full' OR access_level = 'limited')
  ) INTO v_is_beta_member;

  -- If they're a beta member, mark them as such
  IF v_is_beta_member THEN
    NEW.is_beta_user := true;
  END IF;

  -- Set trial end date and subscription status for new users
  IF NEW.subscription_status IS NULL OR NEW.subscription_status = 'free' THEN
    NEW.subscription_status := 'trialing';
    NEW.trial_ends_at := NOW() + (v_trial_days || ' days')::INTERVAL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update existing users who are beta members but not marked as beta users
UPDATE users u
SET is_beta_user = true
WHERE EXISTS (
  SELECT 1 
  FROM beta_members bm
  WHERE bm.email = u.email
  AND (bm.access_level = 'full' OR bm.access_level = 'limited')
)
AND u.is_beta_user = false;

-- Create index on beta_members email for faster lookups
CREATE INDEX IF NOT EXISTS idx_beta_members_email ON beta_members(email);

-- Add comment explaining the field
COMMENT ON COLUMN users.is_beta_user IS 'Indicates if the user is part of the beta program';