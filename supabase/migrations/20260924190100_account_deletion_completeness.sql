-- supabase/migrations/20260924190100_account_deletion_completeness.sql
-- Tasker 103 (DEL): account deletion that finishes, and a lock that is real.
--
-- 1. Request time: request_account_deletion() now also calls
--    lock_account_for_deletion(), which revokes MCP/agent connector credentials,
--    stops briefs, notifications, SMS and lifecycle email, pauses scheduled
--    agents, cancels queued sends, and unpublishes the person's public pages.
-- 2. Purge: finalize_account_deletion_database() no longer trips on the blockers
--    found in the audit:
--      * guard triggers on chat turn rows (they now honour a transaction-local
--        buildos.account_purge = 'on', which only finalize sets);
--      * RESTRICT / NO ACTION chains (chat turn children, agent run cost
--        entries, cycle runs), deleted explicitly in dependency order;
--      * references that are not named user_id (project logs, notification
--        subscriptions, email review labels, admin-only columns, system emails
--        whose created_by is the recipient);
--      * an empty search_path, which broke delete_onto_project's unqualified names;
--      * an unordered generic sweep: it now retries tables blocked by a foreign
--        key until it stops making progress.
--    delete_my_chat_session() reuses the guard bypass so a person can delete one
--    finished chat (the chat DELETE endpoint calls it), and soft-deletes the
--    voice notes recorded in it so the 30-day purge erases them.
--    It also removes rows with no user_id (legacy project history, beta signup,
--    research demand signals, emails sent to the person) and scrubs the
--    metadata/payload of security and notification events that name them.
-- 3. list_account_deletion_storage_objects() accepts the Libri libraries being
--    purged so their libri-assets objects are removed too. The Libri rows
--    themselves are purged by libri.purge_account_deletion()
--    (20260924190110_libri_account_deletion_purge.sql).
--
-- No existing row is transformed by this migration. The final block dry-runs
-- the new functions with the nil uuid so a missing table or column fails the
-- deploy instead of a deletion 30 days later.

SET lock_timeout = '5s';

ALTER TABLE public.account_deletion_requests
	ADD COLUMN IF NOT EXISTS posthog_deletion_status text;

ALTER TABLE public.account_deletion_requests
	DROP CONSTRAINT IF EXISTS account_deletion_requests_posthog_status_check;
ALTER TABLE public.account_deletion_requests
	ADD CONSTRAINT account_deletion_requests_posthog_status_check
	CHECK (
		posthog_deletion_status IS NULL
		OR posthog_deletion_status IN ('deleted', 'not_found', 'skipped', 'failed')
	);

COMMENT ON COLUMN public.account_deletion_requests.posthog_deletion_status IS
	'Outcome of the PostHog person deletion at purge. skipped = PostHog admin credentials were not configured; the request can be replayed against PostHog later by user_id.';

-- ---------------------------------------------------------------------------
-- Guard triggers: purge bypass
-- ---------------------------------------------------------------------------
-- Each body is the latest definition plus the bypass line. The bypass is only
-- reachable through finalize_account_deletion_database() (buildos.account_purge)
-- and delete_my_chat_session() (buildos.user_chat_delete), which set it with
-- SET LOCAL; clients cannot set server settings through PostgREST.

CREATE OR REPLACE FUNCTION public.enforce_agentic_chat_control_row_retention()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_status text;
	v_terminal_at timestamptz;
BEGIN
	IF current_setting('buildos.account_purge', true) = 'on'
		OR current_setting('buildos.user_chat_delete', true) = 'on' THEN
		RETURN OLD;
	END IF;

	SELECT
		turns.status,
		COALESCE(turns.terminalized_at, turns.finished_at)
	INTO
		v_status,
		v_terminal_at
	FROM public.chat_turn_runs turns
	WHERE turns.id = OLD.turn_run_id;

	IF NOT FOUND OR v_status IN ('queued', 'running') THEN
		RAISE EXCEPTION 'agentic_chat_active_control_row_cannot_be_deleted';
	END IF;

	IF v_status NOT IN ('completed', 'failed', 'cancelled')
		OR v_terminal_at IS NULL
		OR clock_timestamp() < v_terminal_at + interval '7 days' THEN
		RAISE EXCEPTION 'agentic_chat_control_row_retention_not_elapsed';
	END IF;

	RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_agentic_chat_control_row_retention()
	FROM PUBLIC, anon, authenticated;

-- Includes the 180-day ceiling from 20260924190000_privacy_retention.sql.
CREATE OR REPLACE FUNCTION public.reject_protected_agentic_chat_effect_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_status text;
	v_terminal_at timestamptz;
	v_effect_terminal_at timestamptz;
BEGIN
	IF current_setting('buildos.account_purge', true) = 'on'
		OR current_setting('buildos.user_chat_delete', true) = 'on' THEN
		RETURN OLD;
	END IF;

	IF OLD.created_at <= clock_timestamp() - interval '180 days' THEN
		RETURN OLD;
	END IF;

	SELECT
		turns.status,
		COALESCE(turns.terminalized_at, turns.finished_at)
	INTO
		v_status,
		v_terminal_at
	FROM public.chat_turn_runs turns
	WHERE turns.id = OLD.turn_run_id;

	IF NOT FOUND OR v_status IN ('queued', 'running') THEN
		RAISE EXCEPTION 'agentic_chat_active_effect_cannot_be_deleted';
	END IF;

	IF OLD.state = 'uncertain' THEN
		RAISE EXCEPTION 'agentic_chat_uncertain_effect_cannot_be_deleted';
	END IF;
	IF OLD.state = 'started' THEN
		RAISE EXCEPTION 'agentic_chat_unresolved_started_effect_cannot_be_deleted';
	END IF;
	IF v_status NOT IN ('completed', 'failed', 'cancelled') OR v_terminal_at IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_effect_terminal_turn_required';
	END IF;

	IF OLD.uncertain_reconciled_at IS NOT NULL THEN
		IF clock_timestamp() < GREATEST(v_terminal_at, OLD.uncertain_reconciled_at)
			+ interval '90 days' THEN
			RAISE EXCEPTION 'agentic_chat_uncertain_effect_audit_retention_not_elapsed';
		END IF;
		RETURN OLD;
	END IF;

	v_effect_terminal_at := COALESCE(OLD.finished_at, OLD.updated_at, OLD.created_at);
	IF clock_timestamp() < GREATEST(v_terminal_at, v_effect_terminal_at)
		+ interval '30 days' THEN
		RAISE EXCEPTION 'agentic_chat_effect_retention_not_elapsed';
	END IF;

	RETURN OLD;
END;
$function$;

REVOKE ALL ON FUNCTION public.reject_protected_agentic_chat_effect_delete()
	FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reject_active_agentic_chat_input_artifact_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_status text;
	v_terminal_at timestamptz;
BEGIN
	IF current_setting('buildos.account_purge', true) = 'on'
		OR current_setting('buildos.user_chat_delete', true) = 'on' THEN
		RETURN OLD;
	END IF;

	SELECT
		turns.status,
		COALESCE(turns.terminalized_at, turns.finished_at)
	INTO
		v_status,
		v_terminal_at
	FROM public.chat_turn_runs turns
	WHERE turns.id = OLD.turn_run_id;

	IF NOT FOUND OR v_status IN ('queued', 'running') THEN
		RAISE EXCEPTION 'agentic_chat_active_input_artifact_cannot_be_deleted';
	END IF;
	IF v_status NOT IN ('completed', 'failed', 'cancelled') OR v_terminal_at IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_input_artifact_terminal_turn_required';
	END IF;
	IF clock_timestamp() < GREATEST(OLD.retain_until, v_terminal_at + interval '7 days') THEN
		RAISE EXCEPTION 'agentic_chat_input_artifact_retention_not_elapsed';
	END IF;

	RETURN OLD;
END;
$function$;

REVOKE ALL ON FUNCTION public.reject_active_agentic_chat_input_artifact_delete()
	FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reject_protected_agentic_chat_workflow_dispatch_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_status text;
	v_terminal_at timestamptz;
BEGIN
	IF current_setting('buildos.account_purge', true) = 'on'
		OR current_setting('buildos.user_chat_delete', true) = 'on' THEN
		RETURN OLD;
	END IF;

	SELECT turns.status, COALESCE(turns.terminalized_at, turns.finished_at)
	INTO v_status, v_terminal_at
	FROM public.chat_turn_runs turns
	WHERE turns.id = OLD.turn_run_id;

	IF NOT FOUND OR v_status IN ('queued', 'running') THEN
		RAISE EXCEPTION 'agentic_chat_workflow_active_dispatch_cannot_be_deleted';
	END IF;
	IF OLD.state IN ('reserved', 'dispatching', 'uncertain') THEN
		RAISE EXCEPTION 'agentic_chat_workflow_unresolved_dispatch_cannot_be_deleted';
	END IF;
	IF v_status NOT IN ('completed', 'failed', 'cancelled') OR v_terminal_at IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_workflow_dispatch_terminal_turn_required';
	END IF;
	IF OLD.reconciled_at IS NOT NULL THEN
		IF clock_timestamp() < GREATEST(v_terminal_at, OLD.reconciled_at) + interval '90 days' THEN
			RAISE EXCEPTION 'agentic_chat_workflow_reconciled_dispatch_retention_not_elapsed';
		END IF;
		RETURN OLD;
	END IF;
	IF clock_timestamp() < GREATEST(v_terminal_at, OLD.settled_at) + interval '30 days' THEN
		RAISE EXCEPTION 'agentic_chat_workflow_dispatch_retention_not_elapsed';
	END IF;
	RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_protected_agentic_chat_workflow_dispatch_delete()
	FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Shared scope
-- ---------------------------------------------------------------------------

-- Projects the person created that no other active owner keeps. These are
-- deleted at purge; every other project keeps its content under "Deleted user".
CREATE OR REPLACE FUNCTION public.account_deletion_purged_project_ids(p_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
	WITH account_actors AS (
		SELECT actor.id
		FROM public.onto_actors AS actor
		WHERE actor.user_id = p_user_id
	)
	SELECT COALESCE(array_agg(project.id ORDER BY project.id), '{}'::uuid[])
	FROM public.onto_projects AS project
	WHERE project.created_by IN (SELECT id FROM account_actors)
		AND NOT EXISTS (
			SELECT 1
			FROM public.onto_project_members AS other_owner
			WHERE other_owner.project_id = project.id
				AND other_owner.role_key = 'owner'
				AND other_owner.removed_at IS NULL
				AND other_owner.actor_id NOT IN (SELECT id FROM account_actors)
		);
$$;

REVOKE ALL ON FUNCTION public.account_deletion_purged_project_ids(uuid)
	FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Request time: disable access and background processing
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lock_account_for_deletion(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_now timestamptz := now();
	v_actor_ids uuid[] := ARRAY(
		SELECT actor.id
		FROM public.onto_actors AS actor
		WHERE actor.user_id = p_user_id
	);
	v_project_ids uuid[] := public.account_deletion_purged_project_ids(p_user_id);
	v_access_tokens integer;
	v_grants integer;
	v_callers integer;
	v_pages integer;
	v_jobs integer;
BEGIN
	-- MCP connectors and agent-call keys. Refresh tokens expire rather than
	-- carry revoked_at, which the token endpoint would treat as token theft.
	UPDATE public.agent_oauth_access_tokens
	SET revoked_at = v_now
	WHERE user_id = p_user_id AND revoked_at IS NULL;
	GET DIAGNOSTICS v_access_tokens = ROW_COUNT;

	UPDATE public.agent_oauth_refresh_tokens
	SET expires_at = LEAST(expires_at, v_now)
	WHERE user_id = p_user_id AND revoked_at IS NULL AND used_at IS NULL;

	UPDATE public.agent_oauth_authorization_codes
	SET expires_at = LEAST(expires_at, v_now)
	WHERE user_id = p_user_id AND used_at IS NULL;

	UPDATE public.agent_oauth_grants
	SET status = 'revoked'
	WHERE user_id = p_user_id AND status <> 'revoked';
	GET DIAGNOSTICS v_grants = ROW_COUNT;

	UPDATE public.external_agent_callers
	SET status = 'revoked'
	WHERE user_id = p_user_id AND status <> 'revoked';
	GET DIAGNOSTICS v_callers = ROW_COUNT;

	UPDATE public.agent_call_bootstrap_links
	SET expires_at = LEAST(expires_at, v_now), updated_at = v_now
	WHERE user_id = p_user_id AND expires_at > v_now;

	-- Briefs, notifications, SMS, lifecycle email, scheduled agents.
	UPDATE public.user_brief_preferences
	SET is_active = false, updated_at = v_now
	WHERE user_id = p_user_id AND is_active IS DISTINCT FROM false;

	UPDATE public.notification_subscriptions
	SET is_active = false, updated_at = v_now
	WHERE user_id = p_user_id AND is_active IS DISTINCT FROM false;

	UPDATE public.user_notification_preferences
	SET email_enabled = false,
		sms_enabled = false,
		push_enabled = false,
		in_app_enabled = false,
		should_email_daily_brief = false,
		should_sms_daily_brief = false,
		updated_at = v_now
	WHERE user_id = p_user_id;

	UPDATE public.user_sms_preferences
	SET event_reminders_enabled = false,
		morning_kickoff_enabled = false,
		evening_recap_enabled = false,
		urgent_alerts = false,
		updated_at = v_now
	WHERE user_id = p_user_id;

	UPDATE public.scheduled_sms_messages
	SET status = 'cancelled', cancelled_at = v_now, updated_at = v_now
	WHERE user_id = p_user_id AND status = 'scheduled';

	UPDATE public.push_subscriptions
	SET is_active = false
	WHERE user_id = p_user_id AND is_active IS DISTINCT FROM false;

	UPDATE public.email_sequence_enrollments
	SET status = 'cancelled', exit_reason = 'user_deleted', next_send_at = NULL, updated_at = v_now
	WHERE user_id = p_user_id AND status IN ('active', 'paused');

	UPDATE public.welcome_email_sequences
	SET status = 'cancelled', updated_at = v_now
	WHERE user_id = p_user_id AND status = 'active';

	UPDATE public.agent_operatives
	SET schedule_enabled = false, next_run_at = NULL, updated_at = v_now
	WHERE user_id = p_user_id AND (schedule_enabled OR next_run_at IS NOT NULL);

	UPDATE public.queue_jobs
	SET status = 'cancelled', updated_at = v_now
	WHERE user_id = p_user_id
		AND status IN ('pending', 'retrying')
		AND job_type IN (
			'generate_daily_brief',
			'generate_brief_email',
			'generate_brief_audio',
			'send_email',
			'send_sms',
			'send_notification',
			'schedule_daily_sms'
		);
	GET DIAGNOSTICS v_jobs = ROW_COUNT;

	-- Public pages the person published, and every page in a project that the
	-- purge will delete, go offline for all readers (API, sitemap, author index).
	UPDATE public.onto_public_pages
	SET status = 'unpublished',
		public_status = 'unpublished',
		last_unpublished_at = v_now
	WHERE deleted_at IS NULL
		AND (status = 'published' OR public_status = 'live')
		AND (
			created_by = ANY(v_actor_ids)
			OR published_by = ANY(v_actor_ids)
			OR project_id = ANY(v_project_ids)
		);
	GET DIAGNOSTICS v_pages = ROW_COUNT;

	RETURN jsonb_build_object(
		'access_tokens_revoked', v_access_tokens,
		'grants_revoked', v_grants,
		'callers_revoked', v_callers,
		'queued_jobs_cancelled', v_jobs,
		'public_pages_unpublished', v_pages
	);
END;
$$;

REVOKE ALL ON FUNCTION public.lock_account_for_deletion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lock_account_for_deletion(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.request_account_deletion(p_user_id uuid)
RETURNS TABLE (
	request_id uuid,
	requested_at timestamptz,
	scheduled_for timestamptz,
	status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_request public.account_deletion_requests%ROWTYPE;
BEGIN
	IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
		RAISE EXCEPTION 'User not found';
	END IF;

	INSERT INTO public.account_deletion_requests (user_id)
	VALUES (p_user_id)
	ON CONFLICT (user_id) DO UPDATE
	SET updated_at = now()
	RETURNING * INTO v_request;

	UPDATE public.users
	SET deletion_status = CASE
			WHEN v_request.status = 'processing' THEN 'processing'
			ELSE 'pending'
		END,
		deletion_requested_at = v_request.requested_at,
		deletion_scheduled_for = v_request.scheduled_for,
		access_restricted = true,
		access_restricted_at = COALESCE(access_restricted_at, now()),
		updated_at = now()
	WHERE id = p_user_id;

	-- Same transaction: the request is recorded only if access is really cut.
	PERFORM public.lock_account_for_deletion(p_user_id);

	RETURN QUERY
	SELECT v_request.id, v_request.requested_at, v_request.scheduled_for, v_request.status;
END;
$$;

REVOKE ALL ON FUNCTION public.request_account_deletion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_account_deletion(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Purge: storage listing
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.list_account_deletion_storage_objects(uuid);

-- p_libri_library_ids comes from libri.account_deletion_storage_scope(); every
-- libri-assets object path starts with its library id.
CREATE OR REPLACE FUNCTION public.list_account_deletion_storage_objects(
	p_user_id uuid,
	p_libri_library_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS TABLE (bucket_id text, object_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
	WITH owned_projects AS (
		SELECT unnest(public.account_deletion_purged_project_ids(p_user_id)) AS id
	),
	known_objects AS (
		SELECT note.storage_bucket AS bucket_id, note.storage_path AS object_name
		FROM public.voice_notes AS note
		WHERE note.user_id = p_user_id

		UNION

		SELECT 'brief-audio'::text, brief.audio_storage_path
		FROM public.ontology_daily_briefs AS brief
		WHERE brief.user_id = p_user_id
			AND brief.audio_storage_path IS NOT NULL

		UNION

		SELECT asset.storage_bucket, asset.storage_path
		FROM public.onto_assets AS asset
		WHERE asset.project_id IN (SELECT id FROM owned_projects)

		UNION

		SELECT attachment.storage_bucket, attachment.storage_path
		FROM public.email_attachments AS attachment
		WHERE attachment.created_by::text = p_user_id::text
	)
	SELECT DISTINCT candidate.bucket_id, candidate.object_name
	FROM (
		SELECT known.bucket_id, known.object_name
		FROM known_objects AS known

		UNION

		-- The user-id prefix covers every bucket keyed that way, including the
		-- data-export zips in user-exports ({user_id}/<export-id>.zip).
		SELECT object.bucket_id, object.name
		FROM storage.objects AS object
		WHERE object.owner_id::text = p_user_id::text
			OR object.name LIKE p_user_id::text || '/%'
			OR object.name LIKE 'users/' || p_user_id::text || '/%'

		UNION

		SELECT object.bucket_id, object.name
		FROM storage.objects AS object
		JOIN unnest(COALESCE(p_libri_library_ids, '{}'::uuid[])) AS library(id)
			ON object.name LIKE library.id::text || '/%'
		WHERE object.bucket_id = 'libri-assets'
	) AS candidate
	WHERE candidate.bucket_id IS NOT NULL
		AND candidate.object_name IS NOT NULL
		AND candidate.object_name <> '';
$$;

REVOKE ALL ON FUNCTION public.list_account_deletion_storage_objects(uuid, uuid[])
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_account_deletion_storage_objects(uuid, uuid[])
	TO service_role;

-- ---------------------------------------------------------------------------
-- Purge: database
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finalize_account_deletion_database(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
-- delete_onto_project() and older trigger functions use unqualified names, so an
-- empty search_path made the purge fail for anyone with a project.
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_actor_ids uuid[] := ARRAY(
		SELECT actor.id
		FROM public.onto_actors AS actor
		WHERE actor.user_id = p_user_id
	);
	v_project_ids uuid[] := public.account_deletion_purged_project_ids(p_user_id);
	v_session_ids uuid[] := ARRAY(
		SELECT session.id
		FROM public.chat_sessions AS session
		WHERE session.user_id = p_user_id
	);
	v_session_texts text[];
	v_legacy_project_ids uuid[] := ARRAY(
		SELECT project.id
		FROM public.projects AS project
		WHERE project.user_id = p_user_id
	);
	v_cycle_ids uuid[];
	v_run_ids uuid[];
	v_email_ids uuid[];
	v_recipient_ids uuid[];
	v_user_email text;
	v_project_id uuid;
	v_page record;
	v_slug record;
	v_page_ids uuid[] := '{}'::uuid[];
	v_pending text[];
	v_blocked text[];
	v_table text;
	v_column_type text;
	v_last_error text;
	v_deleted_user_rows integer := 0;
BEGIN
	IF p_user_id IS NULL THEN
		RAISE EXCEPTION 'User ID required';
	END IF;

	-- Lets the row guards release rows they protect from ordinary deletes.
	SET LOCAL buildos.account_purge = 'on';

	SELECT "user".email
	INTO v_user_email
	FROM public.users AS "user"
	WHERE "user".id = p_user_id;

	v_session_texts := ARRAY(SELECT id::text FROM unnest(v_session_ids) AS session(id));

	-- Event rows survive with the person's id set to NULL; their free-form
	-- metadata can name projects, titles or the person, so it goes first.
	UPDATE public.security_events
	SET metadata = jsonb_build_object('account_deleted', true)
	WHERE actor_user_id = p_user_id
		OR (target_type = 'user' AND target_id = p_user_id::text);

	UPDATE public.notification_events
	SET payload = jsonb_build_object('account_deleted', true),
		metadata = NULL
	WHERE actor_user_id = p_user_id OR target_user_id = p_user_id;

	-- cycle_runs.cycle_id is NO ACTION and cycles cascade from projects.
	v_cycle_ids := ARRAY(
		SELECT cycle.id
		FROM public.cycles AS cycle
		WHERE cycle.user_id = p_user_id OR cycle.project_id = ANY(v_project_ids)
	);
	DELETE FROM public.cycle_runs
	WHERE user_id = p_user_id
		OR cycle_id = ANY(v_cycle_ids)
		OR project_id = ANY(v_project_ids);
	DELETE FROM public.cycles WHERE id = ANY(v_cycle_ids);

	-- Cost entries RESTRICT agent_runs deletes and carry no user_id of their own.
	v_run_ids := ARRAY(
		SELECT run.id
		FROM public.agent_runs AS run
		WHERE run.user_id = p_user_id
	);
	DELETE FROM public.agent_run_cost_entries
	WHERE root_run_id = ANY(v_run_ids) OR leaf_run_id = ANY(v_run_ids);
	DELETE FROM public.agent_runs WHERE id = ANY(v_run_ids);

	-- Shared-project activity the person caused. changed_by is NOT NULL and
	-- references auth.users, so these rows are deleted rather than reassigned.
	DELETE FROM public.onto_project_logs WHERE changed_by = p_user_id;
	UPDATE public.onto_project_logs
	SET chat_session_id = NULL
	WHERE chat_session_id = ANY(v_session_ids);

	-- stream_state and signals RESTRICT turn deletes; the rest are explicit so
	-- the order never depends on catalog order.
	DELETE FROM public.chat_turn_stream_state WHERE user_id = p_user_id;
	DELETE FROM public.chat_turn_signals WHERE user_id = p_user_id;
	DELETE FROM public.chat_turn_events WHERE user_id = p_user_id;
	DELETE FROM public.chat_turn_effects WHERE user_id = p_user_id;
	DELETE FROM public.chat_turn_input_artifacts WHERE user_id = p_user_id;
	DELETE FROM public.chat_turn_runs WHERE user_id = p_user_id;
	DELETE FROM public.chat_sessions WHERE id = ANY(v_session_ids);

	FOREACH v_project_id IN ARRAY v_project_ids LOOP
		PERFORM public.delete_onto_project(v_project_id);
	END LOOP;

	DELETE FROM public.onto_project_members
	WHERE actor_id = ANY(v_actor_ids);

	IF v_user_email IS NOT NULL THEN
		DELETE FROM public.onto_project_invites
		WHERE lower(invitee_email) = lower(v_user_email);
	END IF;

	-- Preserve shared-project history without preserving the former member's identity.
	UPDATE public.onto_actors
	SET user_id = NULL,
		email = NULL,
		name = 'Deleted user',
		metadata = jsonb_build_object('account_deleted', true)
	WHERE id = ANY(v_actor_ids);

	-- Pages that survive in co-owned projects carry a URL prefix derived from the
	-- person's username or name. Re-derive it from the anonymized actor and drop
	-- the redirect history that still holds the old URLs.
	FOR v_page IN
		SELECT page.id, page.created_by, COALESCE(page.slug_base, page.slug) AS slug_base
		FROM public.onto_public_pages AS page
		WHERE page.created_by = ANY(v_actor_ids)
		ORDER BY page.id
	LOOP
		SELECT suggestion.slug_prefix, suggestion.slug_base, suggestion.slug
		INTO v_slug
		FROM public.suggest_onto_public_page_slug(
			public.resolve_onto_public_page_slug_prefix(v_page.created_by),
			v_page.slug_base,
			v_page.id
		) AS suggestion;

		UPDATE public.onto_public_pages
		SET slug_prefix = v_slug.slug_prefix,
			slug_base = v_slug.slug_base,
			slug = v_slug.slug
		WHERE id = v_page.id;

		v_page_ids := array_append(v_page_ids, v_page.id);
	END LOOP;

	DELETE FROM public.onto_public_page_slug_history
	WHERE public_page_id = ANY(v_page_ids);

	-- References to the person in columns not named user_id.
	UPDATE public.notification_subscriptions
	SET created_by = NULL
	WHERE created_by = p_user_id;
	-- Review labels are immutable and reviewer_user_id is NOT NULL.
	DELETE FROM public.email_relevance_adjudications
	WHERE reviewer_user_id = p_user_id;
	UPDATE public.admin_users SET granted_by = NULL WHERE granted_by = p_user_id;
	UPDATE public.beta_events SET created_by = NULL WHERE created_by = p_user_id;
	UPDATE public.beta_signups SET invited_by = NULL WHERE invited_by = p_user_id;
	UPDATE public.migration_platform_lock SET locked_by = NULL WHERE locked_by = p_user_id;
	DELETE FROM public.question_tree_runs WHERE created_by = p_user_id;

	-- Legacy project history and research demand signals have no user_id.
	DELETE FROM public.projects_history
	WHERE project_id = ANY(v_legacy_project_ids) OR created_by = p_user_id;

	DELETE FROM public.domain_research_queue AS queue
	WHERE (
			queue.source_session_ids && v_session_ids
			OR queue.evidence @> jsonb_build_array(jsonb_build_object('user_id', p_user_id::text))
		)
		AND queue.source_session_ids <@ v_session_ids
		AND NOT EXISTS (
			SELECT 1
			FROM jsonb_array_elements(queue.evidence) AS item
			WHERE item->>'user_id' IS DISTINCT FROM p_user_id::text
				AND NOT (COALESCE(item->>'session_id', '') = ANY(v_session_texts))
		);

	UPDATE public.domain_research_queue AS queue
	SET evidence = COALESCE(
			(
				SELECT jsonb_agg(item)
				FROM jsonb_array_elements(queue.evidence) AS item
				WHERE item->>'user_id' IS DISTINCT FROM p_user_id::text
					AND NOT (COALESCE(item->>'session_id', '') = ANY(v_session_texts))
			),
			'[]'::jsonb
		),
		source_session_ids = ARRAY(
			SELECT source.id
			FROM unnest(queue.source_session_ids) AS source(id)
			WHERE NOT (source.id = ANY(v_session_ids))
		),
		source_user_count = GREATEST(queue.source_user_count - 1, 0),
		updated_at = now()
	WHERE queue.source_session_ids && v_session_ids
		OR queue.evidence @> jsonb_build_array(jsonb_build_object('user_id', p_user_id::text));

	-- Every user-scoped public row. A table blocked by a foreign key into a
	-- table not yet swept is retried after the others; the sweep fails only
	-- when a full pass makes no progress.
	v_pending := ARRAY(
		SELECT class.relname::text
		FROM pg_class AS class
		JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
		JOIN pg_attribute AS attribute ON attribute.attrelid = class.oid
		WHERE namespace.nspname = 'public'
			AND class.relkind IN ('r', 'p')
			AND NOT class.relispartition
			AND attribute.attname = 'user_id'
			AND attribute.attnum > 0
			AND NOT attribute.attisdropped
			AND class.relname NOT IN (
				'account_deletion_requests',
				'legal_acceptances',
				'legal_acceptance_intents',
				'onto_actors'
			)
		ORDER BY class.relname
	);

	LOOP
		v_blocked := '{}'::text[];
		FOREACH v_table IN ARRAY v_pending LOOP
			SELECT format_type(attribute.atttypid, attribute.atttypmod)
			INTO v_column_type
			FROM pg_attribute AS attribute
			WHERE attribute.attrelid = format('public.%I', v_table)::regclass
				AND attribute.attname = 'user_id';

			BEGIN
				IF v_column_type = 'uuid' THEN
					EXECUTE format('DELETE FROM public.%I WHERE user_id = $1', v_table)
					USING p_user_id;
				ELSE
					EXECUTE format('DELETE FROM public.%I WHERE user_id::text = $1', v_table)
					USING p_user_id::text;
				END IF;
			EXCEPTION WHEN foreign_key_violation THEN
				v_blocked := array_append(v_blocked, v_table);
				v_last_error := v_table || ': ' || SQLERRM;
			END;
		END LOOP;

		EXIT WHEN cardinality(v_blocked) = 0;
		IF cardinality(v_blocked) = cardinality(v_pending) THEN
			RAISE EXCEPTION 'account_deletion_sweep_blocked: %', v_last_error
				USING ERRCODE = 'foreign_key_violation';
		END IF;
		v_pending := v_blocked;
	END LOOP;

	-- Emails. System brief/notification emails are logged with created_by set to
	-- the recipient, so created_by = the person covers their own mail (and, for
	-- an admin, campaigns they wrote). Other admins' campaigns keep their row and
	-- lose only this person's recipient and tracking rows.
	v_email_ids := ARRAY(
		SELECT email.id
		FROM public.emails AS email
		WHERE email.created_by = p_user_id
	);
	v_recipient_ids := ARRAY(
		SELECT recipient.id
		FROM public.email_recipients AS recipient
		WHERE recipient.email_id = ANY(v_email_ids)
			OR recipient.recipient_id = p_user_id
			OR (v_user_email IS NOT NULL AND lower(recipient.recipient_email) = lower(v_user_email))
	);
	DELETE FROM public.email_tracking_events
	WHERE email_id = ANY(v_email_ids) OR recipient_id = ANY(v_recipient_ids);
	DELETE FROM public.email_recipients WHERE id = ANY(v_recipient_ids);
	DELETE FROM public.email_attachments
	WHERE email_id = ANY(v_email_ids) OR created_by = p_user_id;
	DELETE FROM public.emails WHERE id = ANY(v_email_ids);

	IF v_user_email IS NOT NULL THEN
		DELETE FROM public.beta_signups WHERE lower(email) = lower(v_user_email);
	END IF;

	DELETE FROM public.users WHERE id = p_user_id;
	GET DIAGNOSTICS v_deleted_user_rows = ROW_COUNT;

	SET LOCAL buildos.account_purge = 'off';

	RETURN jsonb_build_object(
		'user_id', p_user_id,
		'public_user_deleted', v_deleted_user_rows > 0,
		'actors_anonymized', COALESCE(array_length(v_actor_ids, 1), 0),
		'projects_deleted', COALESCE(array_length(v_project_ids, 1), 0),
		'public_pages_reprefixed', COALESCE(array_length(v_page_ids, 1), 0)
	);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_account_deletion_database(uuid)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_account_deletion_database(uuid)
	TO service_role;

-- ---------------------------------------------------------------------------
-- Deleting one chat
-- ---------------------------------------------------------------------------
-- A plain DELETE of a chat_sessions row cascades into worker turn rows that
-- RESTRICT (stream state, signals) or are guarded for 7-30 days, so a person
-- could not delete a recent chat, and the old endpoint left an empty session
-- behind. This deletes the caller's own chat atomically, once no turn in it is
-- still queued or running.
CREATE OR REPLACE FUNCTION public.delete_my_chat_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_user_id uuid := auth.uid();
	v_owner_id uuid;
	v_turn_ids uuid[];
	v_voice_notes integer := 0;
BEGIN
	IF v_user_id IS NULL THEN
		RAISE EXCEPTION 'chat_session_delete_requires_user' USING ERRCODE = '42501';
	END IF;

	-- The row lock also holds off new turns: inserting one takes a key-share
	-- lock on this session.
	SELECT session.user_id
	INTO v_owner_id
	FROM public.chat_sessions AS session
	WHERE session.id = p_session_id
	FOR UPDATE;

	IF NOT FOUND OR v_owner_id IS DISTINCT FROM v_user_id THEN
		RAISE EXCEPTION 'chat_session_not_found' USING ERRCODE = 'P0002';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM public.chat_turn_runs AS turn
		WHERE turn.session_id = p_session_id
			AND turn.status IN ('queued', 'running')
	) THEN
		RAISE EXCEPTION 'chat_session_turn_in_progress' USING ERRCODE = '55006';
	END IF;

	v_turn_ids := ARRAY(
		SELECT turn.id
		FROM public.chat_turn_runs AS turn
		WHERE turn.session_id = p_session_id
	);

	-- Voice notes recorded in the chat would outlive it (their group's
	-- chat_session_id is SET NULL). Soft-deleted here, the 30-day purge
	-- (20260924190400) erases the notes, their audio, and the groups.
	UPDATE public.voice_notes AS note
	SET deleted_at = now()
	WHERE note.deleted_at IS NULL
		AND note.group_id IN (
			SELECT voice_group.id
			FROM public.voice_note_groups AS voice_group
			WHERE voice_group.chat_session_id = p_session_id
		);
	GET DIAGNOSTICS v_voice_notes = ROW_COUNT;
	UPDATE public.voice_note_groups AS voice_group
	SET deleted_at = now()
	WHERE voice_group.chat_session_id = p_session_id
		AND voice_group.deleted_at IS NULL;

	SET LOCAL buildos.user_chat_delete = 'on';

	UPDATE public.onto_project_logs
	SET chat_session_id = NULL
	WHERE chat_session_id = p_session_id;
	DELETE FROM public.chat_turn_stream_state WHERE turn_run_id = ANY(v_turn_ids);
	DELETE FROM public.chat_turn_signals WHERE turn_run_id = ANY(v_turn_ids);
	-- Messages, turns and every other turn child cascade from the session.
	DELETE FROM public.chat_sessions WHERE id = p_session_id;

	SET LOCAL buildos.user_chat_delete = 'off';

	RETURN jsonb_build_object(
		'deleted', true,
		'turns_deleted', cardinality(v_turn_ids),
		'voice_notes_deleted', v_voice_notes
	);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_chat_session(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.delete_my_chat_session(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Apply-time dry run
-- ---------------------------------------------------------------------------
-- PL/pgSQL resolves table and column names only when a statement first runs.
-- Running every function once with the nil uuid (no such account) proves each
-- name exists here; it matches no rows, so nothing changes.
DO $$
DECLARE
	v_nil constant uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
	PERFORM public.lock_account_for_deletion(v_nil);
	PERFORM count(*) FROM public.list_account_deletion_storage_objects(v_nil, ARRAY[v_nil]);
	PERFORM public.finalize_account_deletion_database(v_nil);
END;
$$;

RESET lock_timeout;
