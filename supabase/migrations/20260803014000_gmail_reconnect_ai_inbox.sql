-- Surface broken Gmail read grants as durable, deduplicated AI Inbox attention.
--
-- `user_email_connections` remains authoritative. The trigger below only keeps
-- the user-visible inbox index in sync with that source lifecycle:
--   reconnect_required -> pending/snoozed integration attention
--   active             -> decided attention
--   disconnected       -> expired attention

BEGIN;

ALTER TABLE public.inbox_items
	DROP CONSTRAINT IF EXISTS inbox_items_source_type_check;

ALTER TABLE public.inbox_items
	ADD CONSTRAINT inbox_items_source_type_check
	CHECK (
		source_type IN (
			'agent_run',
			'project_suggestion',
			'project_audit',
			'calendar_suggestion',
			'profile_fragment',
			'contact_merge_candidate',
			'integration_attention'
		)
	);

CREATE OR REPLACE FUNCTION public.sync_gmail_reconnect_attention_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_now timestamptz := now();
	v_title text;
	v_summary text;
BEGIN
	IF NEW.provider <> 'google_gmail' THEN
		RETURN NEW;
	END IF;

	v_title := format('Reconnect %s', COALESCE(NULLIF(trim(NEW.account_label), ''), 'Gmail'));
	v_summary := format(
		'BuildOS can no longer read %s. Reconnect Google read-only access to restore email context.',
		NEW.email_address
	);

	IF NEW.deleted_at IS NOT NULL THEN
		UPDATE public.inbox_items
		SET
			status = 'expired',
			source_status = 'disconnected',
			decided_at = COALESCE(decided_at, v_now),
			snoozed_until = NULL,
			expires_at = NULL,
			blocked_reason = 'Gmail account was disconnected'
		WHERE source_type = 'integration_attention'
			AND source_ref_id = NEW.id
			AND status IN ('pending', 'deciding', 'blocked', 'snoozed', 'deferred');
		RETURN NEW;
	END IF;

	IF NEW.status = 'reconnect_required' THEN
		INSERT INTO public.inbox_items (
			source_type,
			source_ref_id,
			source_status,
			user_id,
			project_id,
			audience,
			status,
			title,
			summary,
			risk_tier,
			action_kinds,
			blocked_reason,
			snoozed_until,
			expires_at,
			decided_at,
			created_at,
			updated_at
		)
		VALUES (
			'integration_attention',
			NEW.id,
			'reconnect_required',
			NEW.user_id,
			NULL,
			'user',
			'pending',
			v_title,
			v_summary,
			2,
			ARRAY['reconnect', 'snooze', 'manage']::text[],
			NULL,
			NULL,
			NULL,
			NULL,
			v_now,
			v_now
		)
		ON CONFLICT (source_type, source_ref_id) DO UPDATE
		SET
			source_status = 'reconnect_required',
			user_id = EXCLUDED.user_id,
			project_id = NULL,
			audience = 'user',
			status = CASE
				WHEN public.inbox_items.status = 'snoozed'
					AND public.inbox_items.snoozed_until > v_now
					THEN 'snoozed'
				ELSE 'pending'
			END,
			title = EXCLUDED.title,
			summary = EXCLUDED.summary,
			risk_tier = 2,
			action_kinds = EXCLUDED.action_kinds,
			blocked_reason = NULL,
			snoozed_until = CASE
				WHEN public.inbox_items.status = 'snoozed'
					AND public.inbox_items.snoozed_until > v_now
					THEN public.inbox_items.snoozed_until
				ELSE NULL
			END,
			expires_at = NULL,
			decided_at = NULL,
			created_at = CASE
				WHEN public.inbox_items.status IN ('pending', 'snoozed')
					THEN public.inbox_items.created_at
				ELSE v_now
			END,
			updated_at = v_now;

		RETURN NEW;
	END IF;

	IF NEW.status = 'active' AND NEW.read_enabled THEN
		UPDATE public.inbox_items
		SET
			status = 'decided',
			source_status = 'active',
			decided_at = v_now,
			snoozed_until = NULL,
			expires_at = NULL,
			blocked_reason = NULL
		WHERE source_type = 'integration_attention'
			AND source_ref_id = NEW.id
			AND status IN ('pending', 'deciding', 'blocked', 'snoozed', 'deferred');
	ELSIF NEW.status IN ('disabled', 'error') THEN
		UPDATE public.inbox_items
		SET
			status = 'decided',
			source_status = NEW.status,
			decided_at = v_now,
			snoozed_until = NULL,
			expires_at = NULL,
			blocked_reason = NULL
		WHERE source_type = 'integration_attention'
			AND source_ref_id = NEW.id
			AND status IN ('pending', 'deciding', 'blocked', 'snoozed', 'deferred');
	END IF;

	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_gmail_reconnect_attention_item()
	FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_gmail_reconnect_attention_item
	ON public.user_email_connections;

CREATE TRIGGER trg_sync_gmail_reconnect_attention_item
	AFTER INSERT OR UPDATE OF status, read_enabled, account_label, email_address, deleted_at
	ON public.user_email_connections
	FOR EACH ROW
	EXECUTE FUNCTION public.sync_gmail_reconnect_attention_item();

-- Backfill any accounts already waiting for reconnect when this migration is deployed.
INSERT INTO public.inbox_items (
	source_type,
	source_ref_id,
	source_status,
	user_id,
	project_id,
	audience,
	status,
	title,
	summary,
	risk_tier,
	action_kinds,
	expires_at,
	decided_at,
	created_at,
	updated_at
)
SELECT
	'integration_attention',
	connection.id,
	'reconnect_required',
	connection.user_id,
	NULL,
	'user',
	'pending',
	format(
		'Reconnect %s',
		COALESCE(NULLIF(trim(connection.account_label), ''), 'Gmail')
	),
	format(
		'BuildOS can no longer read %s. Reconnect Google read-only access to restore email context.',
		connection.email_address
	),
	2,
	ARRAY['reconnect', 'snooze', 'manage']::text[],
	NULL,
	NULL,
	connection.updated_at,
	now()
FROM public.user_email_connections AS connection
WHERE connection.provider = 'google_gmail'
	AND connection.deleted_at IS NULL
	AND connection.status = 'reconnect_required'
ON CONFLICT (source_type, source_ref_id) DO UPDATE
SET
	source_status = 'reconnect_required',
	user_id = EXCLUDED.user_id,
	project_id = NULL,
	audience = 'user',
	status = CASE
		WHEN public.inbox_items.status = 'snoozed'
			AND public.inbox_items.snoozed_until > now()
			THEN 'snoozed'
		ELSE 'pending'
	END,
	title = EXCLUDED.title,
	summary = EXCLUDED.summary,
	risk_tier = 2,
	action_kinds = EXCLUDED.action_kinds,
	blocked_reason = NULL,
	snoozed_until = CASE
		WHEN public.inbox_items.status = 'snoozed'
			AND public.inbox_items.snoozed_until > now()
			THEN public.inbox_items.snoozed_until
		ELSE NULL
	END,
	expires_at = NULL,
	decided_at = NULL,
	updated_at = now();

-- Realtime drives the live Inbox badge/toast. RLS still limits each subscriber
-- to rows they are allowed to select.
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
		AND NOT EXISTS (
			SELECT 1
			FROM pg_publication_tables
			WHERE pubname = 'supabase_realtime'
				AND schemaname = 'public'
				AND tablename = 'inbox_items'
		)
	THEN
		ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_items;
	END IF;
END;
$$;

COMMIT;
