-- packages/shared-types/src/functions/check_feedback_rate_limit.sql
-- check_feedback_rate_limit(inet)
-- Check if feedback submission is rate limited for the given IP
-- Source: Supabase database (function definition not in migration files)

-- Note: This function checks feedback rate limiting based on client IP.
-- The SQL definition below is reconstructed from database.types.ts signature.

CREATE OR REPLACE FUNCTION check_feedback_rate_limit(client_ip inet)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Count recent feedback submissions from this IP
  SELECT COUNT(*) INTO v_count
  FROM feedback
  WHERE ip_address = client_ip
    AND created_at > NOW() - INTERVAL '1 hour';

  -- Allow max 5 submissions per hour per IP
  RETURN v_count < 5;
END;
$$;
