-- packages/shared-types/src/functions/create_tracking_link.sql
-- Source: Supabase pg_get_functiondef

CREATE OR REPLACE FUNCTION public.create_tracking_link(p_delivery_id uuid, p_destination_url text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
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
$function$
