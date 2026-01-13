-- packages/shared-types/src/functions/check_feedback_rate_limit.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.check_feedback_rate_limit(client_ip inet)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
    rate_record RECORD;
    current_time TIMESTAMP WITH TIME ZONE := CURRENT_TIMESTAMP;
    hour_ago TIMESTAMP WITH TIME ZONE := current_time - INTERVAL '1 hour';
    day_ago TIMESTAMP WITH TIME ZONE := current_time - INTERVAL '24 hours';
BEGIN
    -- Get or create rate limit record for this IP
    SELECT * INTO rate_record 
    FROM feedback_rate_limit 
    WHERE ip_address = client_ip;
    
    IF NOT FOUND THEN
        -- First submission from this IP
        INSERT INTO feedback_rate_limit (ip_address, submission_count, first_submission, last_submission)
        VALUES (client_ip, 1, current_time, current_time);
        RETURN TRUE;
    END IF;
    
    -- Check if IP is blocked
    IF rate_record.is_blocked THEN
        RETURN FALSE;
    END IF;
    
    -- Reset counter if last submission was more than 24 hours ago
    IF rate_record.last_submission < day_ago THEN
        UPDATE feedback_rate_limit 
        SET submission_count = 1, 
            first_submission = current_time, 
            last_submission = current_time
        WHERE ip_address = client_ip;
        RETURN TRUE;
    END IF;
    
    -- Check hourly limit (max 3 per hour)
    IF rate_record.last_submission > hour_ago AND rate_record.submission_count >= 3 THEN
        RETURN FALSE;
    END IF;
    
    -- Check daily limit (max 10 per day)
    IF rate_record.submission_count >= 10 THEN
        -- Block this IP for 24 hours
        UPDATE feedback_rate_limit 
        SET is_blocked = TRUE 
        WHERE ip_address = client_ip;
        RETURN FALSE;
    END IF;
    
    -- Update submission count
    UPDATE feedback_rate_limit 
    SET submission_count = submission_count + 1,
        last_submission = current_time
    WHERE ip_address = client_ip;
    
    RETURN TRUE;
END;
$function$
