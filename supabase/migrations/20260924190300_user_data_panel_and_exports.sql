-- supabase/migrations/20260924190300_user_data_panel_and_exports.sql
-- Tasker 103 (PANEL), part 2 of 2: the Settings "Your data" tab and the
-- self-serve "Download my data" export.
--
--   get_my_data_summary() ........ one round trip of live counts and connection
--                                  status for auth.uid() only (authenticated).
--   user_data_exports ............ one row per export request; owners can read
--                                  their own rows, nobody but service_role writes.
--   request_user_data_export() ... enqueues the 'user_data_export' job
--                                  (20260924190250). One active export per user,
--                                  at most 3 per rolling 24 hours (failed ones
--                                  don't count), none while the account is
--                                  being deleted.
--   complete_user_data_export() .. worker only: marks an export ready. The
--                                  download link window (7 days) lives here.
--   Bucket user-exports .......... private, objects at {user_id}/{export_id}.zip
--                                  (parts: {user_id}/{export_id}.part{n}.zip).
--                                  No storage policy for browsers: downloads go
--                                  only through server-issued signed URLs.
--   cleanup_privacy_user_data_exports() / list_privacy_expired_user_exports()
--                                  run in the worker's daily privacy retention job
--                                  (apps/worker/src/scheduler/privacyRetention.ts).
--
-- No existing row is transformed. The indexes below back the summary counts.

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Indexes for the summary counts (user_id-keyed tables already have them)
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_onto_documents_created_by_active
	ON public.onto_documents (created_by)
	WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_tasks_created_by_active
	ON public.onto_tasks (created_by)
	WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_assets_created_by_active
	ON public.onto_assets (created_by)
	WHERE deleted_at IS NULL;

-- chat_tool_executions is bounded by its 30-day window, so this builds quickly.
CREATE INDEX IF NOT EXISTS idx_chat_tool_executions_session_id
	ON public.chat_tool_executions (session_id);

-- ---------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_data_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_user uuid := auth.uid();
	v_actor uuid;
	v_legacy_calendar_connected boolean := false;
	v_legacy_calendar_synced_at timestamptz;
BEGIN
	IF v_user IS NULL THEN
		RAISE EXCEPTION 'get_my_data_summary_auth_required' USING ERRCODE = '42501';
	END IF;

	SELECT actors.id INTO v_actor
	FROM public.onto_actors actors
	WHERE actors.user_id = v_user
	LIMIT 1;

	SELECT
		NULLIF(tokens.access_token, '') IS NOT NULL
			AND NULLIF(tokens.refresh_token, '') IS NOT NULL,
		tokens.updated_at
	INTO v_legacy_calendar_connected, v_legacy_calendar_synced_at
	FROM public.user_calendar_tokens tokens
	WHERE tokens.user_id = v_user
	LIMIT 1;

	RETURN jsonb_build_object(
		'generated_at', now(),
		'workspace', jsonb_build_object(
			'projects', (
				SELECT count(*) FROM public.onto_projects projects
				WHERE projects.created_by = v_actor AND projects.deleted_at IS NULL
			),
			'documents', (
				SELECT count(*) FROM public.onto_documents documents
				WHERE documents.created_by = v_actor AND documents.deleted_at IS NULL
			),
			'tasks', (
				SELECT count(*) FROM public.onto_tasks tasks
				WHERE tasks.created_by = v_actor AND tasks.deleted_at IS NULL
			),
			'chats', (
				SELECT count(*) FROM public.chat_sessions sessions
				WHERE sessions.user_id = v_user
			),
			'messages', (
				SELECT count(*) FROM public.chat_messages messages
				WHERE messages.user_id = v_user
			),
			'voice_notes', (
				SELECT count(*) FROM public.voice_notes notes
				WHERE notes.user_id = v_user AND notes.deleted_at IS NULL
			),
			'daily_briefs', (
				SELECT count(*) FROM public.ontology_daily_briefs briefs
				WHERE briefs.user_id = v_user
			),
			'uploads', (
				SELECT count(*) FROM public.onto_assets assets
				WHERE assets.created_by = v_actor AND assets.deleted_at IS NULL
			)
		),
		'traces', jsonb_build_object(
			'tool_traces', (
				SELECT count(*)
				FROM public.chat_tool_executions executions
				JOIN public.chat_sessions sessions ON sessions.id = executions.session_id
				WHERE sessions.user_id = v_user
			),
			'prompt_snapshots', (
				SELECT count(*) FROM public.chat_prompt_snapshots snapshots
				WHERE snapshots.user_id = v_user
			),
			'ai_usage_records', (
				SELECT count(*) FROM public.llm_usage_logs logs
				WHERE logs.user_id = v_user
			)
		),
		'connections', jsonb_build_object(
			'gmail', jsonb_build_object(
				'connected', EXISTS (
					SELECT 1 FROM public.user_email_connections connections
					WHERE connections.user_id = v_user
						AND connections.deleted_at IS NULL
						AND connections.status = 'active'
						AND connections.read_enabled
				),
				'needs_reconnect', EXISTS (
					SELECT 1 FROM public.user_email_connections connections
					WHERE connections.user_id = v_user
						AND connections.deleted_at IS NULL
						AND connections.status IN ('reconnect_required', 'error')
				),
				-- Operation codes are a structured namespace (gmail-read-gateway.ts);
				-- only real reads log outcome 'success' under gmail.messages.*.
				'last_read_at', (
					SELECT max(audits.created_at)
					FROM public.email_access_audit_events audits
					WHERE audits.user_id = v_user
						AND audits.outcome = 'success'
						AND audits.operation LIKE 'gmail.messages.%'
				)
			),
			'calendar', jsonb_build_object(
				'connected', COALESCE(v_legacy_calendar_connected, false) OR EXISTS (
					SELECT 1 FROM public.user_calendar_connections connections
					WHERE connections.user_id = v_user
						AND connections.deleted_at IS NULL
						AND connections.status = 'active'
				),
				'last_synced_at', GREATEST(
					CASE WHEN v_legacy_calendar_connected THEN v_legacy_calendar_synced_at END,
					(
						SELECT max(COALESCE(connections.last_used_at, connections.last_verified_at))
						FROM public.user_calendar_connections connections
						WHERE connections.user_id = v_user
							AND connections.deleted_at IS NULL
							AND connections.status = 'active'
					)
				)
			),
			'agents', COALESCE((
				SELECT jsonb_agg(
					jsonb_build_object(
						'id', callers.id,
						'provider', callers.provider,
						'name', NULLIF(btrim(callers.metadata->>'installation_name'), ''),
						'last_used_at', callers.last_used_at
					)
					ORDER BY callers.last_used_at DESC NULLS LAST, callers.created_at DESC
				)
				FROM (
					SELECT agent_callers.*
					FROM public.external_agent_callers agent_callers
					WHERE agent_callers.user_id = v_user
						AND agent_callers.status = 'trusted'
					ORDER BY agent_callers.last_used_at DESC NULLS LAST
					LIMIT 10
				) callers
			), '[]'::jsonb)
		)
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_data_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_data_summary() TO authenticated;

-- ---------------------------------------------------------------------------
-- Exports
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_data_exports (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	status text NOT NULL DEFAULT 'queued'
		CHECK (status IN ('queued', 'running', 'ready', 'failed', 'expired')),
	storage_path text,
	byte_size bigint CHECK (byte_size IS NULL OR byte_size >= 0),
	part_count integer CHECK (part_count IS NULL OR part_count BETWEEN 1 AND 100),
	-- A code, never content.
	error_code text CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_]{1,64}$'),
	requested_at timestamptz NOT NULL DEFAULT now(),
	started_at timestamptz,
	completed_at timestamptz,
	expires_at timestamptz,
	CONSTRAINT user_data_exports_ready_has_object CHECK (
		status <> 'ready'
		OR (storage_path IS NOT NULL AND part_count IS NOT NULL AND expires_at IS NOT NULL)
	)
);

CREATE UNIQUE INDEX IF NOT EXISTS user_data_exports_one_active_idx
	ON public.user_data_exports (user_id)
	WHERE status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS user_data_exports_user_requested_idx
	ON public.user_data_exports (user_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS user_data_exports_ready_expiry_idx
	ON public.user_data_exports (expires_at)
	WHERE status = 'ready';

ALTER TABLE public.user_data_exports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_data_exports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_data_exports TO authenticated;
GRANT ALL ON TABLE public.user_data_exports TO service_role;

DROP POLICY IF EXISTS user_data_exports_owner_select ON public.user_data_exports;
CREATE POLICY user_data_exports_owner_select
	ON public.user_data_exports
	FOR SELECT
	TO authenticated
	USING (user_id = (SELECT auth.uid()));

COMMENT ON TABLE public.user_data_exports IS
	'Download-my-data requests. Status, object path, size and error code only; the zip lives in the private user-exports bucket for 7 days.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('user-exports', 'user-exports', false, 52428800, ARRAY['application/zip'])
ON CONFLICT (id) DO NOTHING;

-- An export still queued or running after 2 hours lost its worker; it stops
-- blocking a new request (here) and is closed by the daily cleanup (below).
CREATE OR REPLACE FUNCTION public.request_user_data_export()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_user uuid := auth.uid();
	v_active public.user_data_exports%ROWTYPE;
	v_recent integer;
	v_oldest_recent timestamptz;
	v_export_id uuid;
BEGIN
	IF v_user IS NULL THEN
		RAISE EXCEPTION 'user_data_export_auth_required' USING ERRCODE = '42501';
	END IF;

	PERFORM pg_catalog.pg_advisory_xact_lock(
		pg_catalog.hashtextextended('user_data_export:' || v_user::text, 0)
	);

	-- An account being deleted gets no new copy of its data.
	IF EXISTS (
		SELECT 1 FROM public.users users
		WHERE users.id = v_user
			AND users.deletion_status IS NOT NULL
			AND users.deletion_status <> 'none'
	) THEN
		RETURN jsonb_build_object('outcome', 'account_deletion_pending', 'export_id', NULL);
	END IF;

	UPDATE public.user_data_exports exports
	SET status = 'failed', error_code = 'stale', completed_at = now()
	WHERE exports.user_id = v_user
		AND exports.status IN ('queued', 'running')
		AND exports.requested_at <= now() - interval '2 hours';

	SELECT * INTO v_active
	FROM public.user_data_exports exports
	WHERE exports.user_id = v_user
		AND exports.status IN ('queued', 'running')
	ORDER BY exports.requested_at DESC
	LIMIT 1;

	IF FOUND THEN
		RETURN jsonb_build_object('outcome', 'active', 'export_id', v_active.id);
	END IF;

	SELECT count(*), min(exports.requested_at)
	INTO v_recent, v_oldest_recent
	FROM public.user_data_exports exports
	WHERE exports.user_id = v_user
		AND exports.requested_at > now() - interval '24 hours'
		AND exports.status <> 'failed';

	IF v_recent >= 3 THEN
		RETURN jsonb_build_object(
			'outcome', 'rate_limited',
			'export_id', NULL,
			'next_allowed_at', v_oldest_recent + interval '24 hours'
		);
	END IF;

	INSERT INTO public.user_data_exports (user_id, status)
	VALUES (v_user, 'queued')
	RETURNING id INTO v_export_id;

	PERFORM public.add_queue_job(
		p_user_id := v_user,
		p_job_type := 'user_data_export',
		p_metadata := jsonb_build_object('exportId', v_export_id, 'userId', v_user),
		p_priority := 10,
		p_scheduled_for := now(),
		p_dedup_key := 'user-data-export:' || v_export_id::text
	);

	RETURN jsonb_build_object('outcome', 'created', 'export_id', v_export_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.request_user_data_export() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_user_data_export() TO authenticated;

-- The worker calls this after every part is uploaded. The path must be the
-- first part's name for this user and export, and the link window starts now.
CREATE OR REPLACE FUNCTION public.complete_user_data_export(
	p_export_id uuid,
	p_storage_path text,
	p_byte_size bigint,
	p_part_count integer
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_expires_at timestamptz;
BEGIN
	UPDATE public.user_data_exports exports
	SET status = 'ready',
		storage_path = p_storage_path,
		byte_size = p_byte_size,
		part_count = p_part_count,
		error_code = NULL,
		completed_at = clock_timestamp(),
		expires_at = clock_timestamp() + interval '7 days'
	WHERE exports.id = p_export_id
		AND exports.status IN ('queued', 'running')
		AND p_storage_path = exports.user_id::text || '/' || exports.id::text || '.zip'
	RETURNING exports.expires_at INTO v_expires_at;

	IF v_expires_at IS NULL THEN
		RAISE EXCEPTION 'user_data_export_not_completable';
	END IF;
	RETURN v_expires_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_user_data_export(uuid, text, bigint, integer)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_user_data_export(uuid, text, bigint, integer)
	TO service_role;

-- ---------------------------------------------------------------------------
-- Retention (worker daily job)
-- ---------------------------------------------------------------------------

-- Ready exports expire when their 7-day link window ends; exports stuck in
-- queued/running for 2 hours fail as 'stale'; finished rows (no content: status,
-- size, codes) are deleted 30 days after the request.
CREATE OR REPLACE FUNCTION public.cleanup_privacy_user_data_exports(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_expired integer := 0;
	v_stale integer := 0;
	v_deleted integer := 0;
BEGIN
	WITH candidates AS (
		SELECT exports.id
		FROM public.user_data_exports exports
		WHERE exports.status = 'ready'
			AND exports.expires_at <= clock_timestamp()
		LIMIT v_batch
	)
	UPDATE public.user_data_exports exports
	SET status = 'expired', storage_path = NULL
	FROM candidates
	WHERE exports.id = candidates.id;
	GET DIAGNOSTICS v_expired = ROW_COUNT;

	WITH candidates AS (
		SELECT exports.id
		FROM public.user_data_exports exports
		WHERE exports.status IN ('queued', 'running')
			AND exports.requested_at <= clock_timestamp() - interval '2 hours'
		LIMIT v_batch
	)
	UPDATE public.user_data_exports exports
	SET status = 'failed', error_code = 'stale', completed_at = clock_timestamp()
	FROM candidates
	WHERE exports.id = candidates.id;
	GET DIAGNOSTICS v_stale = ROW_COUNT;

	WITH candidates AS (
		SELECT exports.id
		FROM public.user_data_exports exports
		WHERE exports.status IN ('expired', 'failed')
			AND exports.requested_at <= clock_timestamp() - interval '30 days'
		LIMIT v_batch
	)
	DELETE FROM public.user_data_exports exports
	USING candidates
	WHERE exports.id = candidates.id;
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	RETURN jsonb_build_object(
		'user_data_exports_expired', v_expired,
		'user_data_exports_failed_stale', v_stale,
		'user_data_export_rows_deleted', v_deleted
	);
END;
$function$;

-- Every user-exports object whose export is not queued, running, or ready inside
-- its window: expired, failed, or gone (e.g. the account was deleted). The
-- export id is the file name before its first dot; the hour of grace covers an
-- upload whose row is still being written.
CREATE OR REPLACE FUNCTION public.list_privacy_expired_user_exports(
	p_limit integer DEFAULT 200
)
RETURNS TABLE (object_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
	RETURN QUERY
	SELECT objects.name
	FROM storage.objects objects
	WHERE objects.bucket_id = 'user-exports'
		AND objects.created_at <= clock_timestamp() - interval '1 hour'
		AND NOT EXISTS (
			SELECT 1
			FROM public.user_data_exports exports
			WHERE exports.id::text = split_part(split_part(objects.name, '/', 2), '.', 1)
				AND exports.user_id::text = split_part(objects.name, '/', 1)
				AND (
					exports.status IN ('queued', 'running')
					OR (exports.status = 'ready' AND exports.expires_at > clock_timestamp())
				)
		)
	ORDER BY objects.created_at, objects.name
	LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
END;
$function$;

REVOKE ALL ON FUNCTION public.cleanup_privacy_user_data_exports(integer)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_privacy_user_data_exports(integer) TO service_role;
REVOKE ALL ON FUNCTION public.list_privacy_expired_user_exports(integer)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_privacy_expired_user_exports(integer) TO service_role;

COMMIT;
