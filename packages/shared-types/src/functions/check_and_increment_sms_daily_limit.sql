-- packages/shared-types/src/functions/check_and_increment_sms_daily_limit.sql
-- Atomic SMS daily limit check + increment.

CREATE OR REPLACE FUNCTION public.check_and_increment_sms_daily_limit(
	p_user_id uuid,
	p_increment integer DEFAULT 1,
	p_default_limit integer DEFAULT 10,
	p_now timestamp with time zone DEFAULT now()
)
RETURNS TABLE(
	allowed boolean,
	current_count integer,
	"limit" integer,
	reset_at timestamp with time zone,
	reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
	v_limit integer;
	v_current_count integer;
	v_reset_at timestamp with time zone;
	v_needs_reset boolean := false;
BEGIN
	IF p_user_id IS NULL THEN
		RAISE EXCEPTION 'User ID is required';
	END IF;

	IF p_increment IS NULL OR p_increment < 1 THEN
		RAISE EXCEPTION 'Increment must be >= 1';
	END IF;

	SELECT
		COALESCE(daily_sms_limit, p_default_limit),
		COALESCE(daily_sms_count, 0),
		daily_count_reset_at
	INTO v_limit, v_current_count, v_reset_at
	FROM user_sms_preferences
	WHERE user_id = p_user_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RETURN QUERY
		SELECT
			false,
			NULL::integer,
			NULL::integer,
			NULL::timestamp with time zone,
			'SMS preferences not found'::text;
		RETURN;
	END IF;

	v_needs_reset := v_reset_at IS NULL
		OR ((v_reset_at AT TIME ZONE 'UTC')::date <> (p_now AT TIME ZONE 'UTC')::date);

	IF v_needs_reset THEN
		v_current_count := 0;
		v_reset_at := p_now;
	END IF;

	IF (v_current_count + p_increment) > v_limit THEN
		IF v_needs_reset THEN
			UPDATE user_sms_preferences
			SET
				daily_sms_count = 0,
				daily_count_reset_at = v_reset_at,
				updated_at = p_now
			WHERE user_id = p_user_id;
		END IF;

		RETURN QUERY
		SELECT
			false,
			v_current_count,
			v_limit,
			v_reset_at,
			format('Daily SMS limit reached (%s/%s)', v_current_count, v_limit);
		RETURN;
	END IF;

	UPDATE user_sms_preferences
	SET
		daily_sms_count = v_current_count + p_increment,
		daily_count_reset_at = COALESCE(v_reset_at, p_now),
		updated_at = p_now
	WHERE user_id = p_user_id
	RETURNING
		daily_sms_count,
		COALESCE(daily_sms_limit, p_default_limit),
		daily_count_reset_at
	INTO v_current_count, v_limit, v_reset_at;

	RETURN QUERY
	SELECT
		true,
		v_current_count,
		v_limit,
		v_reset_at,
		NULL::text;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.check_and_increment_sms_daily_limit(
	uuid,
	integer,
	integer,
	timestamp with time zone
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.check_and_increment_sms_daily_limit(
	uuid,
	integer,
	integer,
	timestamp with time zone
) TO service_role;
