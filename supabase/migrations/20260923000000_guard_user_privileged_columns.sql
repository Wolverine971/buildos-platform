-- supabase/migrations/20260923000000_guard_user_privileged_columns.sql
--
-- A signed-in user could write privileged columns on their own public.users row:
--
-- * The "Users can manage their own data" policy is FOR ALL with USING (auth.uid() = id),
--   so it also allows INSERT and DELETE of the caller's own row.
-- * prevent_privilege_escalation() only runs BEFORE UPDATE and only checks is_admin.
--
-- A user could therefore delete their row and re-insert it with is_admin = true, which
-- app_auth.is_admin(), public.is_admin() and every web admin gate that reads users.is_admin
-- trust. The same path (or a plain UPDATE) lets a user grant themselves a trial, a paid
-- status, lift an access restriction, or point stripe_customer_id at another customer, which
-- the Stripe webhook uses to find the account.
--
-- Every legitimate writer of these columns runs as service_role or inside a SECURITY DEFINER
-- function, so the guard only applies to the authenticated and anon roles.

CREATE OR REPLACE FUNCTION public.guard_user_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER on purpose: current_user must be the caller's role, not the owner's.
SET search_path = public
AS $$
BEGIN
	IF current_user NOT IN ('authenticated', 'anon') OR public.is_admin(auth.uid()) THEN
		RETURN NEW;
	END IF;

	IF TG_OP = 'INSERT' THEN
		-- Reset rather than reject: a self-created profile row must never carry privileges,
		-- and before_user_insert_set_trial (which fires after this trigger) grants the
		-- standard trial from subscription_status = 'free'.
		NEW.is_admin := false;
		NEW.is_beta_user := false;
		NEW.access_restricted := false;
		NEW.access_restricted_at := NULL;
		NEW.subscription_status := 'free';
		NEW.subscription_plan_id := NULL;
		NEW.trial_ends_at := NULL;
		NEW.stripe_customer_id := NULL;
		NEW.deletion_status := NULL;
		NEW.deletion_requested_at := NULL;
		NEW.deletion_scheduled_for := NULL;
		RETURN NEW;
	END IF;

	IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
		OR NEW.is_beta_user IS DISTINCT FROM OLD.is_beta_user
		OR NEW.access_restricted IS DISTINCT FROM OLD.access_restricted
		OR NEW.access_restricted_at IS DISTINCT FROM OLD.access_restricted_at
		OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
		OR NEW.subscription_plan_id IS DISTINCT FROM OLD.subscription_plan_id
		OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
		OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
		OR NEW.deletion_status IS DISTINCT FROM OLD.deletion_status
		OR NEW.deletion_requested_at IS DISTINCT FROM OLD.deletion_requested_at
		OR NEW.deletion_scheduled_for IS DISTINCT FROM OLD.deletion_scheduled_for
	THEN
		RAISE EXCEPTION 'Account, billing, and access fields can only be changed by BuildOS'
			USING ERRCODE = '42501';
	END IF;

	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_user_privileged_columns() FROM PUBLIC, anon, authenticated;

-- BEFORE triggers fire in name order. This name sorts ahead of before_user_insert_set_trial
-- so the trial trigger sees the reset subscription_status on self-created rows.
DROP TRIGGER IF EXISTS aa_guard_user_privileged_columns ON public.users;
CREATE TRIGGER aa_guard_user_privileged_columns
	BEFORE INSERT OR UPDATE ON public.users
	FOR EACH ROW
	EXECUTE FUNCTION public.guard_user_privileged_columns();
