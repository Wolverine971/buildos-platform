-- supabase/migrations/20261105120100_user_identity_columns_guard.sql
--
-- Security audit 2026-11-05, identity columns. Signed-in users can write their own
-- public.users and user_sms_preferences rows through the table API, and server code trusts
-- some of those columns as facts:
--
-- 1. public.users.email. The project invite RPCs (accept_project_invite_by_id,
--    list_pending_project_invites, decline_project_invite, finish_project_join, ...) match
--    plain-email invites against it. A user could set their email to someone else's address
--    and accept that person's invite. Now a signed-in user can only write the email their
--    signed Supabase session carries (auth.jwt() ->> 'email', which is auth.users.email). New
--    profile rows get that email; an update may only change it to that email.
-- 2. public.users.username. PUT /api/profile/me/username refuses reserved handles (buildos,
--    support, staff, ...), but a direct table write did not. The same list now lives here.
-- 3. user_sms_preferences. A user could set phone_verified = true for any number, raise
--    daily_sms_limit, reset daily_sms_count, and clear opted_out, and the worker sends SMS
--    from those columns. Verification now has to come from the server (the confirm route
--    writes it with the service role after Twilio Verify approves the code). Changing the
--    phone number clears verification. Users keep their reminder, quiet-hours and opt-out
--    toggles.
--
-- The existing aa_guard_user_privileged_columns trigger already protects is_admin,
-- is_beta_user, access_restricted(_at), subscription_*, trial_ends_at, stripe_customer_id and
-- deletion_*; it is unchanged. Service role, SECURITY DEFINER functions (current_user is their
-- owner) and admins keep full access to public.users, as in that guard.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

-- public.users: email and username --------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_user_identity_columns()
RETURNS trigger
LANGUAGE plpgsql
-- public, not '': public.is_admin(uuid) has no search_path of its own and reads admin_users.
SET search_path = public
AS $$
DECLARE
	v_session_email text;
BEGIN
	IF current_user NOT IN ('authenticated', 'anon') OR public.is_admin(auth.uid()) THEN
		RETURN NEW;
	END IF;

	v_session_email := nullif(btrim(auth.jwt() ->> 'email'), '');

	IF TG_OP = 'INSERT' THEN
		IF v_session_email IS NULL THEN
			RAISE EXCEPTION 'A profile needs the signed-in account email'
				USING ERRCODE = '42501';
		END IF;
		NEW.email := v_session_email;
	ELSIF NEW.email IS DISTINCT FROM OLD.email
		AND (v_session_email IS NULL OR NEW.email IS DISTINCT FROM v_session_email) THEN
		RAISE EXCEPTION 'Email can only be changed through account settings'
			USING ERRCODE = '42501';
	END IF;

	-- Keep in sync with RESERVED in apps/web/src/routes/api/profile/me/username/+server.ts.
	IF NEW.username IS NOT NULL
		AND (TG_OP = 'INSERT' OR NEW.username IS DISTINCT FROM OLD.username)
		AND lower(NEW.username) IN (
			'admin', 'api', 'auth', 'billing', 'blogs', 'build-os', 'buildos', 'builders',
			'docs', 'gallery', 'help', 'integrations', 'official', 'p', 'pricing', 'profile',
			'projects', 'road-map', 'security', 'settings', 'showcase', 'signup', 'staff',
			'support', 'team', 'user'
		) THEN
		RAISE EXCEPTION 'That username is reserved' USING ERRCODE = '23514';
	END IF;

	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_user_identity_columns() FROM PUBLIC, anon, authenticated;

-- "ab_" so it runs right after aa_guard_user_privileged_columns.
DROP TRIGGER IF EXISTS ab_guard_user_identity_columns ON public.users;
CREATE TRIGGER ab_guard_user_identity_columns
	BEFORE INSERT OR UPDATE ON public.users
	FOR EACH ROW EXECUTE FUNCTION public.guard_user_identity_columns();

-- user_sms_preferences: verification, spend cap, opt-out ------------------------------------

CREATE OR REPLACE FUNCTION public.guard_user_sms_preferences_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
	IF current_user NOT IN ('authenticated', 'anon') THEN
		RETURN NEW;
	END IF;

	IF TG_OP = 'INSERT' THEN
		-- Refuse rather than reset: an upsert's insert half feeds its update half, so a
		-- silently reset value could un-verify an existing row.
		IF NEW.phone_verified IS TRUE
			OR NEW.phone_verified_at IS NOT NULL
			OR coalesce(NEW.daily_sms_limit, 10) > 10
			OR coalesce(NEW.daily_sms_count, 0) <> 0
		THEN
			RAISE EXCEPTION 'Phone verification and SMS limits can only be set by BuildOS'
				USING ERRCODE = '42501';
		END IF;
		RETURN NEW;
	END IF;

	-- A new number is unverified until the server verifies it.
	IF NEW.phone_number IS DISTINCT FROM OLD.phone_number THEN
		NEW.phone_verified := false;
		NEW.phone_verified_at := NULL;
	END IF;

	IF (NEW.phone_verified IS TRUE AND OLD.phone_verified IS NOT TRUE)
		OR (NEW.phone_verified IS TRUE
			AND NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at)
		OR NEW.daily_sms_limit IS DISTINCT FROM OLD.daily_sms_limit
		OR NEW.daily_sms_count IS DISTINCT FROM OLD.daily_sms_count
		OR NEW.daily_count_reset_at IS DISTINCT FROM OLD.daily_count_reset_at
		OR NEW.user_id IS DISTINCT FROM OLD.user_id
		OR (OLD.opted_out IS TRUE AND NEW.opted_out IS NOT TRUE)
	THEN
		RAISE EXCEPTION 'Phone verification, SMS limits and opt-outs can only be changed by BuildOS'
			USING ERRCODE = '42501';
	END IF;

	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_user_sms_preferences_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS aa_guard_user_sms_preferences_columns ON public.user_sms_preferences;
CREATE TRIGGER aa_guard_user_sms_preferences_columns
	BEFORE INSERT OR UPDATE ON public.user_sms_preferences
	FOR EACH ROW EXECUTE FUNCTION public.guard_user_sms_preferences_columns();
