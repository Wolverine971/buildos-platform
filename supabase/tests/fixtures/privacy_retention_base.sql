-- supabase/tests/fixtures/privacy_retention_base.sql
-- TEST FIXTURE ONLY. Bootstraps a brand-new disposable PostgreSQL database for
-- apps/worker/tests/privacyRetention.postgres.test.ts, before
-- 20260924190000_privacy_retention.sql is applied on top.
--
-- Tables are column-shaped stubs holding only what the retention functions read
-- or write, plus the production foreign keys and triggers that decide whether a
-- delete or update may go through (effect and control-row delete guards,
-- evidence immutability, relevance review triggers, cascades, SET NULL links).
-- Trigger functions the migration replaces keep their prior definition here.
-- Never apply this file to a local, staging, or hosted Supabase database.
SET client_min_messages = warning;

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END;
$$;
CREATE SCHEMA IF NOT EXISTS storage;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Chat
-- ---------------------------------------------------------------------------

CREATE TABLE public.chat_turn_runs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	status text NOT NULL,
	execution_mode text NOT NULL DEFAULT 'worker_realtime',
	request_message text NOT NULL,
	request_payload jsonb NOT NULL DEFAULT '{}'::jsonb
		CONSTRAINT chk_chat_turn_runs_request_payload_object
		CHECK (jsonb_typeof(request_payload) = 'object'),
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	finished_at timestamptz,
	terminalized_at timestamptz
);

CREATE TABLE public.chat_turn_effects (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	turn_run_id uuid NOT NULL REFERENCES public.chat_turn_runs(id) ON DELETE CASCADE,
	state text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	finished_at timestamptz,
	uncertain_reconciled_at timestamptz
);

CREATE TABLE public.chat_tool_executions (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	turn_run_id uuid REFERENCES public.chat_turn_runs(id) ON DELETE SET NULL,
	effect_id uuid REFERENCES public.chat_turn_effects(id) ON DELETE SET NULL
);

-- 20260820010000 definition; the migration adds the 180-day ceiling.
CREATE FUNCTION public.reject_protected_agentic_chat_effect_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_status text;
	v_terminal_at timestamptz;
	v_effect_terminal_at timestamptz;
BEGIN
	SELECT turns.status, COALESCE(turns.terminalized_at, turns.finished_at)
	INTO v_status, v_terminal_at
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
	IF clock_timestamp() < GREATEST(v_terminal_at, v_effect_terminal_at) + interval '30 days' THEN
		RAISE EXCEPTION 'agentic_chat_effect_retention_not_elapsed';
	END IF;
	RETURN OLD;
END;
$function$;

CREATE TRIGGER trg_chat_turn_effects_protected_delete
BEFORE DELETE ON public.chat_turn_effects
FOR EACH ROW EXECUTE FUNCTION public.reject_protected_agentic_chat_effect_delete();

-- 20260801030500 definition, shared by workflow runs and steps.
CREATE FUNCTION public.enforce_agentic_chat_control_row_retention()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_status text;
	v_terminal_at timestamptz;
BEGIN
	SELECT turns.status, COALESCE(turns.terminalized_at, turns.finished_at)
	INTO v_status, v_terminal_at
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
$function$;

CREATE TABLE public.chat_turn_checkpoints (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	turn_run_id uuid NOT NULL REFERENCES public.chat_turn_runs(id) ON DELETE CASCADE,
	status text NOT NULL DEFAULT 'active',
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.agentic_chat_execution_observations (
	id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	turn_run_id uuid NOT NULL REFERENCES public.chat_turn_runs(id) ON DELETE CASCADE,
	observed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.chat_turn_recovery_failures (
	turn_run_id uuid PRIMARY KEY REFERENCES public.chat_turn_runs(id) ON DELETE CASCADE,
	failure_count integer NOT NULL DEFAULT 1,
	last_failed_at timestamptz NOT NULL,
	last_error text
);

CREATE TABLE public.chat_turn_workflow_runs (
	turn_run_id uuid PRIMARY KEY REFERENCES public.chat_turn_runs(id) ON DELETE CASCADE,
	answer_text text NOT NULL DEFAULT ''
);
CREATE TABLE public.chat_turn_workflow_steps (
	turn_run_id uuid NOT NULL REFERENCES public.chat_turn_workflow_runs(turn_run_id) ON DELETE CASCADE,
	step_key text NOT NULL,
	result jsonb,
	PRIMARY KEY (turn_run_id, step_key)
);
CREATE TABLE public.chat_turn_specialist_snapshots (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	turn_run_id uuid NOT NULL REFERENCES public.chat_turn_workflow_runs(turn_run_id) ON DELETE CASCADE,
	snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.chat_turn_document_read_batches (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	turn_run_id uuid NOT NULL REFERENCES public.chat_turn_workflow_runs(turn_run_id) ON DELETE CASCADE,
	result jsonb
);
CREATE TRIGGER trg_chat_turn_workflow_runs_retention
BEFORE DELETE ON public.chat_turn_workflow_runs
FOR EACH ROW EXECUTE FUNCTION public.enforce_agentic_chat_control_row_retention();
CREATE TRIGGER trg_chat_turn_workflow_steps_retention
BEFORE DELETE ON public.chat_turn_workflow_steps
FOR EACH ROW EXECUTE FUNCTION public.enforce_agentic_chat_control_row_retention();

CREATE TABLE public.agentic_chat_answer_comparisons (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	question text NOT NULL DEFAULT '',
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.agentic_chat_answer_comparison_candidates (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	comparison_id uuid NOT NULL REFERENCES public.agentic_chat_answer_comparisons(id) ON DELETE CASCADE,
	answer text NOT NULL DEFAULT ''
);
CREATE TABLE public.agentic_chat_answer_comparison_votes (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	comparison_id uuid NOT NULL REFERENCES public.agentic_chat_answer_comparisons(id) ON DELETE CASCADE,
	preferred_candidate_id uuid REFERENCES public.agentic_chat_answer_comparison_candidates(id) ON DELETE CASCADE
);

CREATE TABLE public.chat_prompt_eval_runs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.chat_prompt_eval_assertions (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	eval_run_id uuid NOT NULL REFERENCES public.chat_prompt_eval_runs(id) ON DELETE CASCADE
);

CREATE TABLE public.agentic_chat_prepared_prompts (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	expires_at timestamptz NOT NULL,
	consumed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Agents
-- ---------------------------------------------------------------------------

CREATE TABLE public.agent_tool_executions (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	tool_name text NOT NULL,
	arguments jsonb,
	result jsonb,
	success boolean NOT NULL DEFAULT false,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.agent_run_events (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	event_type text NOT NULL,
	payload jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.agent_call_tool_executions (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	op text NOT NULL,
	status text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
	args jsonb NOT NULL DEFAULT '{}'::jsonb,
	response_payload jsonb,
	error_payload jsonb,
	created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Logs and analytics
-- ---------------------------------------------------------------------------

CREATE TABLE public.llm_usage_logs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.error_logs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	error_message text NOT NULL DEFAULT '',
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.notification_logs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	message text NOT NULL DEFAULT '',
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.cron_logs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	job_name text NOT NULL DEFAULT 'job',
	executed_at timestamptz NOT NULL,
	created_at timestamptz DEFAULT now()
);
CREATE TABLE public.user_activity_logs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.queue_jobs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	status text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz,
	completed_at timestamptz
);
CREATE TABLE public.cycle_runs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	queue_job_record_id uuid REFERENCES public.queue_jobs(id) ON DELETE SET NULL
);
-- NOT NULL on purpose: the migration must drop it before blanking.
CREATE TABLE public.visitors (
	id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
	visitor_id text NOT NULL,
	ip_address inet NOT NULL,
	user_agent text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.email_tracking_events (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	event_type text NOT NULL DEFAULT 'opened',
	ip_address inet,
	user_agent text,
	"timestamp" timestamptz,
	created_at timestamptz DEFAULT now()
);
CREATE TABLE public.onto_public_page_views (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	viewed_at timestamptz NOT NULL DEFAULT now(),
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.security_logs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	content text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Sent messages
-- ---------------------------------------------------------------------------

CREATE TABLE public.email_logs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	subject text NOT NULL DEFAULT 'subject',
	body text NOT NULL,
	sent_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.emails (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	subject text NOT NULL DEFAULT 'subject',
	content text NOT NULL,
	category text,
	template_data jsonb,
	status text NOT NULL DEFAULT 'draft',
	sent_at timestamptz,
	created_at timestamptz DEFAULT now()
);
CREATE TABLE public.sms_messages (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	message_content text NOT NULL,
	template_vars jsonb,
	status text NOT NULL DEFAULT 'pending',
	sent_at timestamptz,
	created_at timestamptz DEFAULT now()
);
CREATE TABLE public.scheduled_sms_messages (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	message_content text NOT NULL,
	event_title text,
	event_details jsonb,
	status text NOT NULL DEFAULT 'scheduled',
	scheduled_for timestamptz NOT NULL,
	sent_at timestamptz,
	cancelled_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Calendar
-- ---------------------------------------------------------------------------

CREATE TABLE public.calendar_analyses (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	status text,
	completed_at timestamptz,
	created_at timestamptz DEFAULT now()
);
CREATE TABLE public.calendar_project_suggestions (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	analysis_id uuid NOT NULL REFERENCES public.calendar_analyses(id) ON DELETE CASCADE,
	suggested_name text NOT NULL DEFAULT 'Suggested project',
	calendar_event_ids text[] NOT NULL,
	status text,
	status_changed_at timestamptz,
	created_at timestamptz DEFAULT now(),
	updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.calendar_analysis_events (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	analysis_id uuid NOT NULL REFERENCES public.calendar_analyses(id) ON DELETE CASCADE,
	suggestion_id uuid REFERENCES public.calendar_project_suggestions(id),
	calendar_id text NOT NULL,
	calendar_event_id text NOT NULL,
	event_title text,
	event_description text,
	event_start timestamptz,
	event_end timestamptz,
	event_location text,
	attendee_count integer,
	attendee_emails text[],
	contributing_source_event_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
	created_at timestamptz DEFAULT now()
);
CREATE TABLE public.calendar_oauth_states (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	expires_at timestamptz NOT NULL
);
CREATE TABLE public.email_oauth_states (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	expires_at timestamptz NOT NULL
);

-- ---------------------------------------------------------------------------
-- Gmail and connectors
-- ---------------------------------------------------------------------------

CREATE TABLE public.email_scan_checks (
	user_id uuid NOT NULL,
	connection_id uuid NOT NULL,
	scope_key text NOT NULL,
	message_key text NOT NULL,
	expires_at timestamptz NOT NULL,
	PRIMARY KEY (user_id, connection_id, scope_key, message_key)
);

CREATE TABLE public.email_access_audit_events (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.calendar_access_audit_events (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.profile_access_audit (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_contact_access_audit (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.email_relevance_scan_runs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	state text NOT NULL DEFAULT 'completed',
	expires_at timestamptz NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	completed_at timestamptz
);
CREATE TABLE public.email_relevance_scan_connections (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	run_id uuid NOT NULL REFERENCES public.email_relevance_scan_runs(id) ON DELETE CASCADE
);
CREATE TABLE public.email_relevance_message_observations (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	run_id uuid NOT NULL REFERENCES public.email_relevance_scan_runs(id) ON DELETE CASCADE,
	connection_scope_id uuid NOT NULL
		REFERENCES public.email_relevance_scan_connections(id) ON DELETE CASCADE
);
CREATE TABLE public.email_relevance_project_candidates (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	observation_id uuid NOT NULL
		REFERENCES public.email_relevance_message_observations(id) ON DELETE CASCADE
);
CREATE TABLE public.email_relevance_review_samples (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	run_id uuid NOT NULL REFERENCES public.email_relevance_scan_runs(id) ON DELETE CASCADE,
	connection_scope_id uuid NOT NULL
		REFERENCES public.email_relevance_scan_connections(id) ON DELETE CASCADE,
	source_observation_id uuid,
	state text NOT NULL DEFAULT 'pending'
);
CREATE TABLE public.email_relevance_adjudications (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	run_id uuid NOT NULL REFERENCES public.email_relevance_scan_runs(id) ON DELETE CASCADE,
	sample_id uuid NOT NULL REFERENCES public.email_relevance_review_samples(id) ON DELETE CASCADE
);

-- 20260724020000 definitions.
CREATE FUNCTION public.expire_email_relevance_review_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
	UPDATE public.email_relevance_review_samples
	SET state = 'expired'
	WHERE source_observation_id = OLD.id AND state = 'pending';
	RETURN OLD;
END;
$$;
CREATE TRIGGER email_relevance_review_source_deleted
	BEFORE DELETE ON public.email_relevance_message_observations
	FOR EACH ROW EXECUTE FUNCTION public.expire_email_relevance_review_source();

CREATE FUNCTION public.reject_email_relevance_adjudication_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'email_relevance_adjudication_immutable';
END;
$$;
CREATE TRIGGER email_relevance_adjudications_immutable
	BEFORE UPDATE ON public.email_relevance_adjudications
	FOR EACH ROW EXECUTE FUNCTION public.reject_email_relevance_adjudication_mutation();

CREATE TABLE public.agent_oauth_authorization_codes (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	expires_at timestamptz NOT NULL,
	used_at timestamptz
);
CREATE TABLE public.agent_oauth_access_tokens (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	expires_at timestamptz NOT NULL,
	revoked_at timestamptz
);
CREATE TABLE public.agent_oauth_refresh_tokens (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	expires_at timestamptz NOT NULL,
	revoked_at timestamptz,
	used_at timestamptz,
	rotated_from_id uuid REFERENCES public.agent_oauth_refresh_tokens(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------
-- Web
-- ---------------------------------------------------------------------------

CREATE TABLE public.native_search_cache (
	cache_key text PRIMARY KEY,
	response jsonb,
	expires_at timestamptz NOT NULL
);

CREATE TABLE public.web_page_visits (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	url text NOT NULL,
	last_visited_at timestamptz NOT NULL DEFAULT now(),
	current_version_id uuid
);
CREATE TABLE public.web_page_versions (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	web_page_visit_id uuid NOT NULL,
	content text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT web_page_versions_visit_id_id_unique UNIQUE (web_page_visit_id, id),
	CONSTRAINT web_page_versions_visit_fk
		FOREIGN KEY (web_page_visit_id) REFERENCES public.web_page_visits(id) ON DELETE CASCADE
);
CREATE TABLE public.web_page_evidence_chunks (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	page_version_id uuid NOT NULL
		REFERENCES public.web_page_versions(id) ON DELETE CASCADE,
	content text NOT NULL
);
ALTER TABLE public.web_page_visits
	ADD CONSTRAINT web_page_visits_current_version_fk
	FOREIGN KEY (id, current_version_id)
	REFERENCES public.web_page_versions(web_page_visit_id, id)
	DEFERRABLE INITIALLY IMMEDIATE;

CREATE FUNCTION public.prevent_web_page_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'web_page_evidence_is_immutable';
END;
$$;
CREATE TRIGGER web_page_versions_immutable
	BEFORE UPDATE ON public.web_page_versions
	FOR EACH ROW EXECUTE FUNCTION public.prevent_web_page_evidence_mutation();
CREATE TRIGGER web_page_evidence_chunks_immutable
	BEFORE UPDATE ON public.web_page_evidence_chunks
	FOR EACH ROW EXECUTE FUNCTION public.prevent_web_page_evidence_mutation();

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

CREATE TABLE storage.objects (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	bucket_id text NOT NULL,
	name text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz DEFAULT now(),
	UNIQUE (bucket_id, name)
);

CREATE TABLE public.chat_message_attachments (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL,
	attachment_kind text NOT NULL,
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.onto_assets (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	storage_path text NOT NULL
);
CREATE TABLE public.ontology_daily_briefs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	audio_status text NOT NULL DEFAULT 'none'
		CHECK (audio_status IN ('none', 'pending', 'generating', 'ready', 'failed')),
	audio_storage_path text,
	audio_voice text,
	audio_model text,
	audio_duration_ms integer,
	audio_generation_ms integer,
	audio_requested_at timestamptz,
	audio_generation_started_at timestamptz,
	audio_generated_at timestamptz,
	audio_error text
);

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
