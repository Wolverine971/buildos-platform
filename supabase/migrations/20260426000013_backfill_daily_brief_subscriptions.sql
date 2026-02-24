-- supabase/migrations/20260426000013_backfill_daily_brief_subscriptions.sql
-- Backfill and normalize daily brief subscriptions after explicit opt-in migration drift.
--
-- Problem observed in production:
-- - Many users have brief.completed rows with is_active = false and created_by = null
-- - brief.failed rows are often missing entirely
-- - emit_notification_event() requires explicit opt-in semantics (created_by/admin_only),
--   so these rows are skipped even when user preferences indicate brief notifications should flow.

BEGIN;

WITH desired_brief_subscription_state AS (
	SELECT
		unp.user_id,
		(
			COALESCE(unp.should_email_daily_brief, false)
			OR COALESCE(unp.should_sms_daily_brief, false)
			OR COALESCE(unp.push_enabled, false)
			OR COALESCE(unp.in_app_enabled, false)
		) AS should_be_active
	FROM public.user_notification_preferences unp
),
brief_event_types AS (
	SELECT unnest(ARRAY['brief.completed'::text, 'brief.failed'::text]) AS event_type
)
INSERT INTO public.notification_subscriptions (
	user_id,
	event_type,
	is_active,
	admin_only,
	created_by,
	updated_at
)
SELECT
	state.user_id,
	ev.event_type,
	state.should_be_active,
	false,
	state.user_id,
	NOW()
FROM desired_brief_subscription_state state
CROSS JOIN brief_event_types ev
ON CONFLICT (user_id, event_type)
DO UPDATE
SET
	is_active = EXCLUDED.is_active,
	admin_only = false,
	created_by = COALESCE(notification_subscriptions.created_by, EXCLUDED.created_by),
	updated_at = NOW();

-- Safety cleanup: if a user has no preference row, keep brief subscriptions inactive.
UPDATE public.notification_subscriptions ns
SET
	is_active = false,
	updated_at = NOW()
WHERE ns.event_type IN ('brief.completed', 'brief.failed')
	AND ns.admin_only IS NOT TRUE
	AND ns.is_active = true
	AND NOT EXISTS (
		SELECT 1
		FROM public.user_notification_preferences unp
		WHERE unp.user_id = ns.user_id
	);

COMMIT;
