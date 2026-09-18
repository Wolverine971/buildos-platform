-- supabase/tests/fixtures/agentic_chat_workflow_v1_base.sql
-- TEST FIXTURE ONLY. Bootstraps a brand-new disposable PostgreSQL database.
-- Generated 2026-09-14 from read-only catalog extracts (pg_get_functiondef,
-- pg_get_constraintdef, pg_get_triggerdef, relacl/proacl) of the isolated QA
-- Agentic Chat database. The nine worker tables, their triggers, and every
-- reachable agentic-chat function body are exact hosted definitions. Unrelated
-- referenced tables are column-shaped stubs without their own constraints.
-- Never apply this file to a local, staging, or hosted Supabase database.
SET check_function_bodies = off;
SET client_min_messages = warning;

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'libri_worker') THEN CREATE ROLE libri_worker NOLOGIN; END IF;
END;
$$;
ALTER ROLE service_role BYPASSRLS;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
	SELECT NULLIF(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'sub', '')::uuid
$$;
CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql VOLATILE AS $$ SELECT gen_random_uuid() $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE FUNCTION public.is_admin(user_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;

CREATE TYPE public.queue_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled', 'retrying');
CREATE TYPE public.queue_type AS ENUM ('generate_daily_brief', 'generate_phases', 'sync_calendar', 'process_brain_dump', 'send_email', 'update_recurring_tasks', 'cleanup_old_data', 'onboarding_analysis', 'other', 'send_sms', 'generate_brief_email', 'send_notification', 'schedule_daily_sms', 'classify_chat_session', 'process_onto_braindump', 'transcribe_voice_note', 'buildos_homework', 'buildos_tree_agent', 'build_project_context_snapshot', 'project_activity_batch_flush', 'generate_project_icon', 'extract_onto_asset_ocr', 'generate_brief_audio', 'buildos_project_loop', 'agent_run', 'agentic_chat_turn', 'admin_question_tree', 'run_cycle', 'embed_onto_entity', 'libri_ingest', 'libri_research', 'libri_derive', 'libri_maintenance');

CREATE TABLE public.users (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	email text,
	name text,
	created_at timestamp with time zone DEFAULT now(),
	bio text,
	is_admin boolean,
	updated_at timestamp with time zone DEFAULT now(),
	last_visit timestamp with time zone,
	stripe_customer_id text,
	subscription_status text,
	subscription_plan_id uuid,
	trial_ends_at timestamp with time zone,
	access_restricted boolean,
	access_restricted_at timestamp with time zone,
	is_beta_user boolean,
	usage_archetype text,
	productivity_challenges jsonb,
	onboarding_completed_at timestamp with time zone,
	onboarding_v2_skipped_calendar boolean,
	onboarding_v2_skipped_sms boolean,
	timezone text,
	preferences jsonb,
	onboarding_intent text,
	onboarding_stakes text,
	username text,
	voice_narration_enabled boolean,
	signup_source text,
	utm_source text,
	utm_medium text,
	utm_campaign text,
	referrer text,
	deletion_status text,
	deletion_requested_at timestamp with time zone,
	deletion_scheduled_for timestamp with time zone
);
CREATE TABLE public.onto_actors (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	kind text,
	name text,
	email text,
	user_id uuid,
	org_id uuid,
	metadata jsonb,
	created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE public.onto_projects (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	org_id uuid,
	name text,
	description text,
	type_key text,
	state_key text,
	props jsonb,
	facet_context text,
	facet_scale text,
	facet_stage text,
	start_at timestamp with time zone,
	end_at timestamp with time zone,
	created_by uuid,
	created_at timestamp with time zone DEFAULT now(),
	updated_at timestamp with time zone DEFAULT now(),
	next_step_short text,
	next_step_long text,
	next_step_updated_at timestamp with time zone,
	next_step_source text,
	is_public boolean,
	deleted_at timestamp with time zone,
	doc_structure jsonb,
	icon_svg text,
	icon_concept text,
	icon_generated_at timestamp with time zone,
	icon_generation_source text,
	icon_generation_prompt text,
	search_vector tsvector,
	archived_at timestamp with time zone,
	external_agent_access text
);
CREATE TABLE public.onto_project_members (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid,
	actor_id uuid,
	role_key text,
	access text,
	added_by_actor_id uuid,
	removed_at timestamp with time zone,
	removed_by_actor_id uuid,
	created_at timestamp with time zone DEFAULT now(),
	role_name text,
	role_description text
);
CREATE TABLE public.agentic_chat_prepared_prompts (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid,
	session_id uuid,
	context_type text,
	entity_id uuid,
	project_id uuid,
	project_focus jsonb,
	cache_key text,
	nonce_sha256 text,
	prompt_variant text,
	context_cache_version integer,
	context_payload jsonb,
	conversation_summary text,
	history_for_model jsonb,
	history_strategy text,
	history_compressed boolean,
	raw_history_count integer,
	history_for_model_count integer,
	prepared_surfaces jsonb,
	default_surface_profile text,
	context_payload_sha256 text,
	expires_at timestamp with time zone,
	consumed_at timestamp with time zone,
	created_at timestamp with time zone DEFAULT now(),
	updated_at timestamp with time zone DEFAULT now(),
	context_invalidation_token text,
	history_cutoff_at timestamp with time zone
);
CREATE TABLE public.chat_turn_checkpoints (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	turn_run_id uuid,
	session_id uuid,
	user_id uuid,
	resume_turn_run_id uuid,
	checkpoint_type text,
	status text,
	reason text,
	digest jsonb,
	resume_context jsonb,
	supervisor_decision jsonb,
	question text,
	resume_started_at timestamp with time zone,
	resumed_at timestamp with time zone,
	expires_at timestamp with time zone,
	created_at timestamp with time zone DEFAULT now(),
	updated_at timestamp with time zone DEFAULT now(),
	execution_generation integer,
	supervisor_transition_id uuid,
	supervisor_sequence integer
);
CREATE TABLE public.chat_tool_executions (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	session_id uuid,
	message_id uuid,
	tool_name text,
	tool_category text,
	arguments jsonb,
	result jsonb,
	execution_time_ms integer,
	tokens_consumed integer,
	success boolean,
	error_message text,
	requires_user_action boolean,
	created_at timestamp with time zone DEFAULT now(),
	turn_run_id uuid,
	stream_run_id text,
	client_turn_id text,
	gateway_op text,
	help_path text,
	sequence_index integer,
	result_count integer,
	zero_result boolean,
	affected_entities jsonb,
	effect_id uuid,
	provider_tool_call_id text
);
CREATE TABLE public.onto_assets (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	project_id uuid,
	kind text,
	storage_bucket text,
	storage_path text,
	original_filename text,
	content_type text,
	file_size_bytes bigint,
	checksum_sha256 text,
	width integer,
	height integer,
	alt_text text,
	caption text,
	metadata jsonb,
	ocr_status text,
	ocr_error text,
	ocr_model text,
	ocr_version integer,
	ocr_started_at timestamp with time zone,
	ocr_completed_at timestamp with time zone,
	extracted_text text,
	extracted_text_source text,
	extracted_text_updated_at timestamp with time zone,
	extracted_text_updated_by uuid,
	extraction_summary text,
	extraction_metadata jsonb,
	search_vector tsvector,
	created_by uuid,
	created_at timestamp with time zone DEFAULT now(),
	updated_at timestamp with time zone DEFAULT now(),
	deleted_at timestamp with time zone
);
CREATE TABLE public.voice_note_groups (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid,
	linked_entity_type text,
	linked_entity_id uuid,
	chat_session_id uuid,
	status text,
	metadata jsonb,
	created_at timestamp with time zone DEFAULT now(),
	updated_at timestamp with time zone DEFAULT now(),
	deleted_at timestamp with time zone
);
CREATE TABLE public.chat_message_attachments (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	message_id uuid,
	session_id uuid,
	user_id uuid,
	project_id uuid,
	asset_id uuid,
	attachment_kind text,
	media_type text,
	role text,
	display_order integer,
	metadata jsonb,
	created_at timestamp with time zone DEFAULT now()
);
CREATE UNIQUE INDEX onto_actors_user_id_key ON public.onto_actors (user_id) WHERE user_id IS NOT NULL;

CREATE TABLE public.chat_sessions (
	id uuid DEFAULT uuid_generate_v4() NOT NULL,
	user_id uuid NOT NULL,
	title text,
	auto_title text,
	context_type text NOT NULL,
	entity_id uuid,
	status text DEFAULT 'active'::text NOT NULL,
	message_count integer DEFAULT 0,
	total_tokens_used integer DEFAULT 0,
	tool_call_count integer DEFAULT 0,
	preferences jsonb DEFAULT '{}'::jsonb,
	created_at timestamp with time zone DEFAULT now(),
	updated_at timestamp with time zone DEFAULT now(),
	last_message_at timestamp with time zone,
	archived_at timestamp with time zone,
	compressed_at timestamp with time zone,
	chat_type text DEFAULT 'general'::text,
	agent_metadata jsonb DEFAULT '{}'::jsonb,
	auto_accept_operations boolean DEFAULT false,
	chat_topics text[],
	summary text,
	last_classified_at timestamp with time zone,
	extracted_entities jsonb
);
CREATE TABLE public.chat_messages (
	id uuid DEFAULT uuid_generate_v4() NOT NULL,
	session_id uuid NOT NULL,
	role text NOT NULL,
	content text NOT NULL,
	tool_calls jsonb,
	tool_call_id text,
	tool_name text,
	tool_result jsonb,
	prompt_tokens integer,
	completion_tokens integer,
	total_tokens integer,
	metadata jsonb DEFAULT '{}'::jsonb,
	error_message text,
	error_code text,
	created_at timestamp with time zone DEFAULT now(),
	operation_ids uuid[],
	message_type text DEFAULT 'assistant_message'::text,
	user_id uuid NOT NULL
);
CREATE TABLE public.queue_jobs (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	user_id uuid NOT NULL,
	scheduled_for timestamp with time zone NOT NULL,
	queue_job_id text NOT NULL,
	created_at timestamp with time zone DEFAULT now() NOT NULL,
	processed_at timestamp with time zone,
	error_message text,
	metadata jsonb DEFAULT '{}'::jsonb,
	priority integer DEFAULT 10,
	attempts integer DEFAULT 0,
	max_attempts integer DEFAULT 3,
	started_at timestamp with time zone,
	completed_at timestamp with time zone,
	result jsonb,
	updated_at timestamp with time zone DEFAULT now(),
	status queue_status NOT NULL,
	job_type queue_type NOT NULL,
	dedup_key text,
	processing_token uuid
);
CREATE TABLE public.chat_turn_runs (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	session_id uuid NOT NULL,
	user_id uuid NOT NULL,
	stream_run_id text NOT NULL,
	client_turn_id text,
	source text DEFAULT 'live_ui'::text NOT NULL,
	context_type text NOT NULL,
	entity_id uuid,
	project_id uuid,
	gateway_enabled boolean DEFAULT false NOT NULL,
	request_message text NOT NULL,
	user_message_id uuid,
	assistant_message_id uuid,
	status text DEFAULT 'running'::text NOT NULL,
	finished_reason text,
	tool_round_count integer DEFAULT 0 NOT NULL,
	tool_call_count integer DEFAULT 0 NOT NULL,
	validation_failure_count integer DEFAULT 0 NOT NULL,
	llm_pass_count integer DEFAULT 0 NOT NULL,
	first_lane text,
	first_help_path text,
	first_skill_path text,
	first_canonical_op text,
	history_strategy text,
	history_compressed boolean,
	raw_history_count integer,
	history_for_model_count integer,
	cache_source text,
	cache_age_seconds numeric,
	request_prewarmed_context boolean,
	prompt_snapshot_id uuid,
	timing_metric_id uuid,
	started_at timestamp with time zone DEFAULT now() NOT NULL,
	finished_at timestamp with time zone,
	created_at timestamp with time zone DEFAULT now() NOT NULL,
	updated_at timestamp with time zone DEFAULT now() NOT NULL,
	prepared_prompt_id uuid,
	prepared_prompt_hit boolean,
	prepared_prompt_miss_reason text,
	prepared_surface_profile text,
	last_progress_at timestamp with time zone,
	request_hash text,
	request_hash_version text,
	execution_mode text DEFAULT 'legacy_sse'::text NOT NULL,
	request_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
	request_payload_version text DEFAULT 'legacy_v1'::text NOT NULL,
	transport_contract_version text,
	transport_decision_id uuid,
	queue_job_id uuid,
	correlation_id uuid DEFAULT gen_random_uuid() NOT NULL,
	execution_generation integer DEFAULT 0 NOT NULL,
	cancel_requested_at timestamp with time zone,
	cancel_reason text,
	worker_started_at timestamp with time zone,
	execution_started_at timestamp with time zone,
	mutation_reserved_at timestamp with time zone,
	irreversible_boundary_at timestamp with time zone,
	history_cutoff_at timestamp with time zone,
	history_message_ids uuid[],
	stale_context_policy text,
	last_event_sequence integer DEFAULT 0 NOT NULL,
	terminal_event_id text,
	terminalized_at timestamp with time zone,
	failure_code text,
	input_artifact_id uuid
);
CREATE TABLE public.chat_turn_input_artifacts (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	turn_run_id uuid NOT NULL,
	session_id uuid NOT NULL,
	user_id uuid NOT NULL,
	source_prepared_prompt_id uuid,
	artifact_version text NOT NULL,
	history_source text NOT NULL,
	history jsonb NOT NULL,
	prepared jsonb NOT NULL,
	content_hash text NOT NULL,
	history_bytes integer NOT NULL,
	content_bytes integer NOT NULL,
	created_at timestamp with time zone DEFAULT now() NOT NULL,
	retain_until timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL
);
CREATE TABLE public.chat_turn_stream_state (
	turn_run_id uuid NOT NULL,
	session_id uuid NOT NULL,
	user_id uuid NOT NULL,
	execution_generation integer DEFAULT 0 NOT NULL,
	snapshot_sequence integer DEFAULT 0 NOT NULL,
	durable_through_sequence integer DEFAULT 0 NOT NULL,
	projection_durable_sequence integer DEFAULT 0 NOT NULL,
	assistant_text text DEFAULT ''::text NOT NULL,
	projection jsonb DEFAULT '{}'::jsonb NOT NULL,
	reconcile_required boolean DEFAULT false NOT NULL,
	created_at timestamp with time zone DEFAULT now() NOT NULL,
	updated_at timestamp with time zone DEFAULT now() NOT NULL,
	last_text_batch_id uuid,
	last_text_sequence integer,
	last_text_end_bytes integer,
	first_text_persisted_at timestamp with time zone
);
CREATE TABLE public.chat_turn_events (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	turn_run_id uuid NOT NULL,
	session_id uuid NOT NULL,
	user_id uuid NOT NULL,
	stream_run_id text NOT NULL,
	sequence_index integer NOT NULL,
	phase text NOT NULL,
	event_type text NOT NULL,
	payload jsonb DEFAULT '{}'::jsonb NOT NULL,
	created_at timestamp with time zone DEFAULT now() NOT NULL,
	execution_generation integer DEFAULT 0 NOT NULL,
	event_id text DEFAULT ''::text NOT NULL,
	worker_transition_id uuid
);
CREATE TABLE public.chat_turn_effects (
	id uuid NOT NULL,
	turn_run_id uuid NOT NULL,
	session_id uuid NOT NULL,
	user_id uuid NOT NULL,
	execution_generation integer NOT NULL,
	tool_name text NOT NULL,
	operation_name text NOT NULL,
	canonical_argument_hash text NOT NULL,
	provider_tool_call_id text,
	state text DEFAULT 'reserved'::text NOT NULL,
	downstream_idempotency_supported boolean NOT NULL,
	downstream_receipt jsonb,
	failure_code text,
	reserved_at timestamp with time zone DEFAULT now() NOT NULL,
	started_at timestamp with time zone,
	finished_at timestamp with time zone,
	created_at timestamp with time zone DEFAULT now() NOT NULL,
	updated_at timestamp with time zone DEFAULT now() NOT NULL,
	uncertain_reconciled_at timestamp with time zone
);
CREATE TABLE public.chat_turn_signals (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	turn_run_id uuid NOT NULL,
	session_id uuid NOT NULL,
	user_id uuid NOT NULL,
	signal_version text DEFAULT 'agentic_chat_signal_v1'::text NOT NULL,
	kind text DEFAULT 'cancel'::text NOT NULL,
	reason text NOT NULL,
	source text NOT NULL,
	created_at timestamp with time zone DEFAULT now() NOT NULL,
	consumed_at timestamp with time zone,
	consumed_by_generation integer
);

ALTER TABLE public.chat_sessions ADD CONSTRAINT chat_sessions_chat_type_check CHECK ((chat_type = ANY (ARRAY['global'::text, 'project'::text, 'calendar'::text, 'general'::text, 'project_create'::text, 'daily_brief'::text, 'daily_brief_update'::text, 'ontology'::text, 'homework'::text, 'project_audit'::text])));
ALTER TABLE public.chat_sessions ADD CONSTRAINT chat_sessions_context_type_check CHECK ((context_type = ANY (ARRAY['global'::text, 'project'::text, 'calendar'::text, 'general'::text, 'project_create'::text, 'daily_brief'::text, 'daily_brief_update'::text, 'ontology'::text])));
ALTER TABLE public.chat_sessions ADD CONSTRAINT chat_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.chat_sessions ADD CONSTRAINT chat_sessions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text, 'compressed'::text])));
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_message_type_check CHECK ((message_type = ANY (ARRAY['user_message'::text, 'assistant_message'::text, 'system_notification'::text, 'operation_summary'::text, 'phase_update'::text])));
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text, 'tool'::text])));
ALTER TABLE public.queue_jobs ADD CONSTRAINT brief_generation_jobs_pkey PRIMARY KEY (id);
ALTER TABLE public.queue_jobs ADD CONSTRAINT queue_jobs_queue_job_id_key UNIQUE (queue_job_id);
ALTER TABLE public.queue_jobs ADD CONSTRAINT valid_job_metadata CHECK (((status = ANY (ARRAY['completed'::queue_status, 'cancelled'::queue_status, 'failed'::queue_status])) OR (NOT ((status <> ALL (ARRAY['completed'::queue_status, 'cancelled'::queue_status, 'failed'::queue_status])) AND (job_type = ANY (ARRAY['generate_daily_brief'::queue_type, 'generate_phases'::queue_type, 'generate_brief_email'::queue_type])) AND (metadata IS NULL)))));
ALTER TABLE public.queue_jobs ADD CONSTRAINT valid_job_metadata_strict CHECK (((status = ANY (ARRAY['completed'::queue_status, 'cancelled'::queue_status, 'failed'::queue_status])) OR
CASE
    WHEN (job_type = 'generate_daily_brief'::queue_type) THEN ((metadata IS NOT NULL) AND (((metadata ? 'briefDate'::text) AND (metadata ? 'timezone'::text)) OR ((metadata ? 'brief_date'::text) AND (metadata ? 'time_zone'::text)) OR ((metadata ? 'date'::text) AND (metadata ? 'tz'::text)) OR (jsonb_typeof(metadata) = 'object'::text)))
    WHEN (job_type = 'generate_phases'::queue_type) THEN ((metadata IS NOT NULL) AND ((metadata ? 'projectId'::text) OR (metadata ? 'project_id'::text) OR (metadata ? 'projectID'::text) OR (metadata ? 'project'::text) OR (jsonb_typeof(metadata) = 'object'::text)))
    ELSE true
END)) NOT VALID;
ALTER TABLE public.chat_turn_runs ADD CONSTRAINT chat_turn_runs_pkey PRIMARY KEY (id);
ALTER TABLE public.chat_turn_runs ADD CONSTRAINT chk_chat_turn_runs_counts CHECK (((tool_round_count >= 0) AND (tool_call_count >= 0) AND (validation_failure_count >= 0) AND (llm_pass_count >= 0)));
ALTER TABLE public.chat_turn_runs ADD CONSTRAINT chk_chat_turn_runs_execution_mode CHECK ((execution_mode = ANY (ARRAY['legacy_sse'::text, 'worker_realtime'::text])));
ALTER TABLE public.chat_turn_runs ADD CONSTRAINT chk_chat_turn_runs_history_lineage_bound CHECK (((history_message_ids IS NULL) OR (cardinality(history_message_ids) <= 50)));
ALTER TABLE public.chat_turn_runs ADD CONSTRAINT chk_chat_turn_runs_request_payload_object CHECK ((jsonb_typeof(request_payload) = 'object'::text));
ALTER TABLE public.chat_turn_runs ADD CONSTRAINT chk_chat_turn_runs_stale_context_policy CHECK (((stale_context_policy IS NULL) OR (stale_context_policy = 'fail_after_max_queue_residence'::text)));
ALTER TABLE public.chat_turn_runs ADD CONSTRAINT chk_chat_turn_runs_status CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])));
ALTER TABLE public.chat_turn_runs ADD CONSTRAINT chk_chat_turn_runs_worker_counters CHECK (((execution_generation >= 0) AND (last_event_sequence >= 0)));
ALTER TABLE public.chat_turn_runs ADD CONSTRAINT uq_chat_turn_runs_stream_run_id UNIQUE (stream_run_id);
ALTER TABLE public.chat_turn_input_artifacts ADD CONSTRAINT chat_turn_input_artifacts_pkey PRIMARY KEY (id);
ALTER TABLE public.chat_turn_input_artifacts ADD CONSTRAINT chat_turn_input_artifacts_turn_run_id_key UNIQUE (turn_run_id);
ALTER TABLE public.chat_turn_input_artifacts ADD CONSTRAINT chk_chat_turn_input_artifacts_content_bound CHECK (((history_bytes >= 0) AND (history_bytes <= 262144) AND (content_bytes > 0) AND (content_bytes <= 2097152) AND (history_bytes <= content_bytes) AND ((octet_length((history)::text) + octet_length((prepared)::text)) <= 4194304)));
ALTER TABLE public.chat_turn_input_artifacts ADD CONSTRAINT chk_chat_turn_input_artifacts_hash CHECK ((content_hash ~ '^[0-9a-f]{64}$'::text));
ALTER TABLE public.chat_turn_input_artifacts ADD CONSTRAINT chk_chat_turn_input_artifacts_history_array CHECK ((jsonb_typeof(history) = 'array'::text));
ALTER TABLE public.chat_turn_input_artifacts ADD CONSTRAINT chk_chat_turn_input_artifacts_history_source CHECK ((history_source = ANY (ARRAY['admission_window'::text, 'prepared_prompt'::text])));
ALTER TABLE public.chat_turn_input_artifacts ADD CONSTRAINT chk_chat_turn_input_artifacts_prepared_object CHECK ((jsonb_typeof(prepared) = 'object'::text));
ALTER TABLE public.chat_turn_input_artifacts ADD CONSTRAINT chk_chat_turn_input_artifacts_retention CHECK ((retain_until >= (created_at + '7 days'::interval)));
ALTER TABLE public.chat_turn_input_artifacts ADD CONSTRAINT chk_chat_turn_input_artifacts_version CHECK ((artifact_version = ANY (ARRAY['agentic_chat_input_v2'::text, 'agentic_chat_input_v3'::text])));
ALTER TABLE public.chat_turn_input_artifacts ADD CONSTRAINT uq_chat_turn_input_artifacts_id_turn UNIQUE (id, turn_run_id);
ALTER TABLE public.chat_turn_stream_state ADD CONSTRAINT chat_turn_stream_state_pkey PRIMARY KEY (turn_run_id);
ALTER TABLE public.chat_turn_stream_state ADD CONSTRAINT chk_chat_turn_stream_state_generation CHECK ((execution_generation >= 0));
ALTER TABLE public.chat_turn_stream_state ADD CONSTRAINT chk_chat_turn_stream_state_last_text_receipt CHECK ((((last_text_batch_id IS NULL) AND (last_text_sequence IS NULL) AND (last_text_end_bytes IS NULL)) OR ((last_text_batch_id IS NOT NULL) AND (last_text_sequence IS NOT NULL) AND (last_text_sequence >= 1) AND (last_text_sequence <= snapshot_sequence) AND (last_text_end_bytes IS NOT NULL) AND (last_text_end_bytes >= 1) AND (last_text_end_bytes <= octet_length(assistant_text)))));
ALTER TABLE public.chat_turn_stream_state ADD CONSTRAINT chk_chat_turn_stream_state_projection CHECK ((jsonb_typeof(projection) = 'object'::text));
ALTER TABLE public.chat_turn_stream_state ADD CONSTRAINT chk_chat_turn_stream_state_sequences CHECK (((projection_durable_sequence >= 0) AND (projection_durable_sequence <= durable_through_sequence) AND (durable_through_sequence <= snapshot_sequence)));
ALTER TABLE public.chat_turn_stream_state ADD CONSTRAINT chk_chat_turn_stream_state_text_bound CHECK ((octet_length(assistant_text) <= 2097152));
ALTER TABLE public.chat_turn_stream_state ADD CONSTRAINT chk_chat_turn_stream_state_timestamps CHECK ((updated_at >= created_at));
ALTER TABLE public.chat_turn_events ADD CONSTRAINT chat_turn_events_pkey PRIMARY KEY (id);
ALTER TABLE public.chat_turn_events ADD CONSTRAINT chk_chat_turn_events_event_id_shape CHECK (((event_id IS NOT NULL) AND (event_id = (((((turn_run_id)::text || ':'::text) || (execution_generation)::text) || ':'::text) || (sequence_index)::text))));
ALTER TABLE public.chat_turn_events ADD CONSTRAINT chk_chat_turn_events_execution_generation CHECK (((execution_generation IS NOT NULL) AND (execution_generation >= 0)));
ALTER TABLE public.chat_turn_events ADD CONSTRAINT chk_chat_turn_events_sequence CHECK ((sequence_index >= 1));
ALTER TABLE public.chat_turn_effects ADD CONSTRAINT chat_turn_effects_pkey PRIMARY KEY (id);
ALTER TABLE public.chat_turn_effects ADD CONSTRAINT chk_chat_turn_effects_argument_hash CHECK ((canonical_argument_hash ~ '^[0-9a-f]{64}$'::text));
ALTER TABLE public.chat_turn_effects ADD CONSTRAINT chk_chat_turn_effects_generation CHECK ((execution_generation >= 1));
ALTER TABLE public.chat_turn_effects ADD CONSTRAINT chk_chat_turn_effects_names CHECK (((btrim(tool_name) <> ''::text) AND (length(tool_name) <= 256) AND (btrim(operation_name) <> ''::text) AND (length(operation_name) <= 256) AND ((provider_tool_call_id IS NULL) OR (length(provider_tool_call_id) <= 512))));
ALTER TABLE public.chat_turn_effects ADD CONSTRAINT chk_chat_turn_effects_state CHECK ((state = ANY (ARRAY['reserved'::text, 'started'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text, 'uncertain'::text])));
ALTER TABLE public.chat_turn_effects ADD CONSTRAINT chk_chat_turn_effects_timeline CHECK ((((state = 'reserved'::text) AND (started_at IS NULL) AND (finished_at IS NULL) AND (downstream_receipt IS NULL)) OR ((state = 'started'::text) AND (started_at IS NOT NULL) AND (finished_at IS NULL) AND (downstream_receipt IS NULL)) OR ((state = 'cancelled'::text) AND (started_at IS NULL) AND (finished_at IS NOT NULL) AND (downstream_receipt IS NULL)) OR ((state = ANY (ARRAY['succeeded'::text, 'failed'::text, 'uncertain'::text])) AND (started_at IS NOT NULL) AND (finished_at IS NOT NULL))));
ALTER TABLE public.chat_turn_effects ADD CONSTRAINT chk_chat_turn_effects_timestamp_order CHECK (((reserved_at >= created_at) AND ((started_at IS NULL) OR (started_at >= reserved_at)) AND ((finished_at IS NULL) OR (finished_at >= COALESCE(started_at, reserved_at))) AND (updated_at >= created_at)));
ALTER TABLE public.chat_turn_effects ADD CONSTRAINT chk_chat_turn_effects_uncertain_reconciliation CHECK (((uncertain_reconciled_at IS NULL) OR (state = ANY (ARRAY['succeeded'::text, 'failed'::text]))));
ALTER TABLE public.chat_turn_effects ADD CONSTRAINT uq_chat_turn_effects_id_turn UNIQUE (id, turn_run_id);
ALTER TABLE public.chat_turn_signals ADD CONSTRAINT chat_turn_signals_pkey PRIMARY KEY (id);
ALTER TABLE public.chat_turn_signals ADD CONSTRAINT chat_turn_signals_turn_run_id_key UNIQUE (turn_run_id);
ALTER TABLE public.chat_turn_signals ADD CONSTRAINT chk_chat_turn_signals_consumption CHECK ((((consumed_at IS NULL) AND (consumed_by_generation IS NULL)) OR ((consumed_at IS NOT NULL) AND (consumed_at >= created_at) AND (consumed_by_generation IS NOT NULL) AND (consumed_by_generation >= 0))));
ALTER TABLE public.chat_turn_signals ADD CONSTRAINT chk_chat_turn_signals_kind CHECK ((kind = 'cancel'::text));
ALTER TABLE public.chat_turn_signals ADD CONSTRAINT chk_chat_turn_signals_reason CHECK ((reason = ANY (ARRAY['user_cancelled'::text, 'superseded'::text, 'timeout'::text, 'operator_cancelled'::text])));
ALTER TABLE public.chat_turn_signals ADD CONSTRAINT chk_chat_turn_signals_source CHECK ((source = ANY (ARRAY['browser'::text, 'worker'::text, 'operator'::text, 'sweeper'::text])));
ALTER TABLE public.chat_turn_signals ADD CONSTRAINT chk_chat_turn_signals_version CHECK ((signal_version = 'agentic_chat_signal_v1'::text));
CREATE INDEX idx_chat_sessions_chat_type ON public.chat_sessions USING btree (chat_type, user_id);
CREATE INDEX idx_chat_sessions_context ON public.chat_sessions USING btree (context_type, entity_id);
CREATE INDEX idx_chat_sessions_context_type ON public.chat_sessions USING btree (context_type, user_id);
CREATE INDEX idx_chat_sessions_created_at_desc ON public.chat_sessions USING btree (created_at DESC);
CREATE INDEX idx_chat_sessions_created_user ON public.chat_sessions USING btree (created_at DESC, user_id) WHERE (user_id IS NOT NULL);
CREATE INDEX idx_chat_sessions_has_summary ON public.chat_sessions USING btree (user_id, created_at DESC) WHERE (summary IS NOT NULL);
CREATE INDEX idx_chat_sessions_history_query ON public.chat_sessions USING btree (user_id, created_at DESC) WHERE (status <> 'archived'::text);
CREATE INDEX idx_chat_sessions_last_message ON public.chat_sessions USING btree (last_message_at DESC);
CREATE INDEX idx_chat_sessions_last_message_at_desc ON public.chat_sessions USING btree (last_message_at DESC) WHERE (last_message_at IS NOT NULL);
CREATE INDEX idx_chat_sessions_status ON public.chat_sessions USING btree (status);
CREATE INDEX idx_chat_sessions_topics ON public.chat_sessions USING gin (chat_topics) WHERE (chat_topics IS NOT NULL);
CREATE INDEX idx_chat_sessions_user_active ON public.chat_sessions USING btree (user_id, status) WHERE (status = 'active'::text);
CREATE INDEX idx_chat_sessions_user_effective_activity_active ON public.chat_sessions USING btree (user_id, COALESCE(last_message_at, updated_at, created_at) DESC) WHERE ((status <> 'archived'::text) AND (COALESCE(message_count, 0) >= 1));
CREATE INDEX idx_chat_sessions_user_id ON public.chat_sessions USING btree (user_id);
CREATE INDEX idx_chat_sessions_user_recent_active ON public.chat_sessions USING btree (user_id, last_message_at DESC, updated_at DESC, created_at DESC) WHERE ((status <> 'archived'::text) AND (message_count >= 1));
CREATE INDEX idx_history_chat_sessions_user_activity_visible ON public.chat_sessions USING btree (user_id, COALESCE(last_message_at, updated_at, created_at, '1970-01-01 00:00:00+00'::timestamp with time zone) DESC, id DESC) WHERE ((status <> 'archived'::text) AND ((COALESCE(message_count, 0) >= 3) OR (summary IS NOT NULL)));
CREATE INDEX idx_history_chat_sessions_user_created_visible ON public.chat_sessions USING btree (user_id, created_at DESC) WHERE ((status <> 'archived'::text) AND ((message_count >= 3) OR (summary IS NOT NULL)));
CREATE UNIQUE INDEX uq_chat_sessions_active_daily_brief_context ON public.chat_sessions USING btree (user_id, entity_id) WHERE ((context_type = 'daily_brief'::text) AND (status = 'active'::text) AND (entity_id IS NOT NULL));
CREATE INDEX idx_chat_messages_created_at ON public.chat_messages USING btree (created_at);
CREATE INDEX idx_chat_messages_created_at_desc ON public.chat_messages USING btree (created_at DESC);
CREATE INDEX idx_chat_messages_created_user ON public.chat_messages USING btree (created_at DESC, user_id) WHERE (user_id IS NOT NULL);
CREATE INDEX idx_chat_messages_operations ON public.chat_messages USING gin (operation_ids) WHERE (operation_ids IS NOT NULL);
CREATE INDEX idx_chat_messages_session_id ON public.chat_messages USING btree (session_id);
CREATE INDEX idx_chat_messages_session_recent ON public.chat_messages USING btree (session_id, created_at DESC);
CREATE INDEX idx_chat_messages_session_role_created_at ON public.chat_messages USING btree (session_id, role, created_at DESC);
CREATE INDEX idx_chat_messages_session_user_created_at ON public.chat_messages USING btree (session_id, user_id, created_at DESC);
CREATE INDEX idx_chat_messages_user ON public.chat_messages USING btree (user_id, created_at DESC);
CREATE UNIQUE INDEX uq_chat_messages_session_idempotency_key ON public.chat_messages USING btree (session_id, ((metadata ->> 'idempotency_key'::text))) WHERE ((metadata ->> 'idempotency_key'::text) IS NOT NULL);
CREATE INDEX idx_brief_generation_jobs_queue_job_id ON public.queue_jobs USING btree (queue_job_id);
CREATE INDEX idx_brief_generation_jobs_scheduled_for ON public.queue_jobs USING btree (scheduled_for);
CREATE INDEX idx_brief_generation_jobs_user_id ON public.queue_jobs USING btree (user_id);
CREATE INDEX idx_history_queue_jobs_classify_session_created ON public.queue_jobs USING btree (user_id, ((metadata ->> 'sessionId'::text)), created_at DESC) WHERE (job_type = 'classify_chat_session'::queue_type);
CREATE INDEX idx_queue_jobs_completed_retention ON public.queue_jobs USING btree (completed_at, id) WHERE (status = 'completed'::queue_status);
CREATE UNIQUE INDEX idx_queue_jobs_dedup_key_unique ON public.queue_jobs USING btree (dedup_key) WHERE ((dedup_key IS NOT NULL) AND (status = ANY (ARRAY['pending'::queue_status, 'processing'::queue_status])));
CREATE INDEX idx_queue_jobs_metadata_gin ON public.queue_jobs USING gin (metadata);
CREATE INDEX idx_queue_jobs_metadata_project_id ON public.queue_jobs USING btree (((metadata ->> 'projectId'::text)));
CREATE INDEX idx_queue_jobs_pending_claim ON public.queue_jobs USING btree (job_type, scheduled_for, priority DESC) WHERE (status = 'pending'::queue_status);
CREATE INDEX idx_queue_jobs_pending_claim_priority ON public.queue_jobs USING btree (job_type, priority, scheduled_for) WHERE (status = 'pending'::queue_status);
CREATE INDEX idx_queue_jobs_processing_token ON public.queue_jobs USING btree (processing_token) WHERE (processing_token IS NOT NULL);
CREATE INDEX idx_queue_jobs_status_updated_at ON public.queue_jobs USING btree (status, updated_at);
CREATE INDEX chat_turn_runs_running_last_progress_idx ON public.chat_turn_runs USING btree (last_progress_at) WHERE (status = 'running'::text);
CREATE INDEX idx_chat_turn_runs_context_created ON public.chat_turn_runs USING btree (context_type, created_at DESC);
CREATE INDEX idx_chat_turn_runs_first_op_created ON public.chat_turn_runs USING btree (first_canonical_op, created_at DESC);
CREATE INDEX idx_chat_turn_runs_first_skill_created ON public.chat_turn_runs USING btree (first_skill_path, created_at DESC);
CREATE INDEX idx_chat_turn_runs_legacy_running_progress ON public.chat_turn_runs USING btree (COALESCE(last_progress_at, started_at), id) WHERE ((execution_mode = 'legacy_sse'::text) AND (status = 'running'::text));
CREATE INDEX idx_chat_turn_runs_prepared_prompt_id ON public.chat_turn_runs USING btree (prepared_prompt_id) WHERE (prepared_prompt_id IS NOT NULL);
CREATE INDEX idx_chat_turn_runs_session_created ON public.chat_turn_runs USING btree (session_id, created_at DESC);
CREATE INDEX idx_chat_turn_runs_status_created ON public.chat_turn_runs USING btree (status, created_at DESC);
CREATE INDEX idx_chat_turn_runs_worker_terminal_retention ON public.chat_turn_runs USING btree (terminalized_at, id) WHERE ((execution_mode = 'worker_realtime'::text) AND (status = ANY (ARRAY['completed'::text, 'failed'::text, 'cancelled'::text])));
CREATE UNIQUE INDEX uq_chat_turn_runs_identity_scope ON public.chat_turn_runs USING btree (id, session_id, user_id);
CREATE UNIQUE INDEX uq_chat_turn_runs_one_active_per_session ON public.chat_turn_runs USING btree (session_id) WHERE (status = ANY (ARRAY['queued'::text, 'running'::text]));
CREATE UNIQUE INDEX uq_chat_turn_runs_session_client_turn ON public.chat_turn_runs USING btree (session_id, client_turn_id) WHERE (client_turn_id IS NOT NULL);
CREATE UNIQUE INDEX uq_chat_turn_runs_terminal_event ON public.chat_turn_runs USING btree (terminal_event_id) WHERE (terminal_event_id IS NOT NULL);
CREATE UNIQUE INDEX uq_chat_turn_runs_transport_decision ON public.chat_turn_runs USING btree (transport_decision_id) WHERE (transport_decision_id IS NOT NULL);
CREATE UNIQUE INDEX uq_chat_turn_runs_user_client_turn ON public.chat_turn_runs USING btree (user_id, client_turn_id) WHERE (client_turn_id IS NOT NULL);
CREATE INDEX idx_chat_turn_input_artifacts_retention ON public.chat_turn_input_artifacts USING btree (retain_until, turn_run_id);
CREATE INDEX idx_chat_turn_input_artifacts_user_created ON public.chat_turn_input_artifacts USING btree (user_id, created_at DESC);
CREATE INDEX idx_chat_turn_stream_state_session_updated ON public.chat_turn_stream_state USING btree (user_id, session_id, updated_at DESC);
CREATE INDEX idx_chat_turn_events_run_sequence ON public.chat_turn_events USING btree (turn_run_id, sequence_index);
CREATE INDEX idx_chat_turn_events_session_user_created ON public.chat_turn_events USING btree (session_id, user_id, created_at);
CREATE INDEX idx_chat_turn_events_stream_created ON public.chat_turn_events USING btree (stream_run_id, created_at DESC);
CREATE INDEX idx_chat_turn_events_type_created ON public.chat_turn_events USING btree (event_type, created_at DESC);
CREATE UNIQUE INDEX uq_chat_turn_events_event_id ON public.chat_turn_events USING btree (event_id);
CREATE UNIQUE INDEX uq_chat_turn_events_generation_sequence ON public.chat_turn_events USING btree (turn_run_id, execution_generation, sequence_index);
CREATE UNIQUE INDEX uq_chat_turn_events_worker_transition ON public.chat_turn_events USING btree (turn_run_id, execution_generation, worker_transition_id) WHERE (worker_transition_id IS NOT NULL);
CREATE INDEX idx_chat_turn_effects_state_updated ON public.chat_turn_effects USING btree (state, updated_at);
CREATE INDEX idx_chat_turn_effects_turn_generation ON public.chat_turn_effects USING btree (turn_run_id, execution_generation, created_at);
CREATE INDEX idx_chat_turn_effects_uncertain_reconciled_retention ON public.chat_turn_effects USING btree (uncertain_reconciled_at, turn_run_id) WHERE (uncertain_reconciled_at IS NOT NULL);
CREATE INDEX idx_chat_turn_signals_unconsumed ON public.chat_turn_signals USING btree (turn_run_id) WHERE (consumed_at IS NULL);
ALTER TABLE public.chat_sessions ADD CONSTRAINT chat_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.queue_jobs ADD CONSTRAINT brief_generation_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.chat_turn_runs ADD CONSTRAINT chat_turn_runs_assistant_message_id_fkey FOREIGN KEY (assistant_message_id) REFERENCES chat_messages(id) ON DELETE SET NULL;
ALTER TABLE public.chat_turn_runs ADD CONSTRAINT chat_turn_runs_prepared_prompt_id_fkey FOREIGN KEY (prepared_prompt_id) REFERENCES agentic_chat_prepared_prompts(id) ON DELETE SET NULL;
ALTER TABLE public.chat_turn_runs ADD CONSTRAINT chat_turn_runs_queue_job_id_fkey FOREIGN KEY (queue_job_id) REFERENCES queue_jobs(id) ON DELETE SET NULL;
ALTER TABLE public.chat_turn_runs ADD CONSTRAINT chat_turn_runs_session_id_fkey FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.chat_turn_runs ADD CONSTRAINT chat_turn_runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.chat_turn_runs ADD CONSTRAINT chat_turn_runs_user_message_id_fkey FOREIGN KEY (user_message_id) REFERENCES chat_messages(id) ON DELETE SET NULL;
ALTER TABLE public.chat_turn_runs ADD CONSTRAINT fk_chat_turn_runs_input_artifact FOREIGN KEY (input_artifact_id) REFERENCES chat_turn_input_artifacts(id) ON DELETE SET NULL;
ALTER TABLE public.chat_turn_input_artifacts ADD CONSTRAINT fk_chat_turn_input_artifacts_turn_scope FOREIGN KEY (turn_run_id, session_id, user_id) REFERENCES chat_turn_runs(id, session_id, user_id) ON DELETE CASCADE;
ALTER TABLE public.chat_turn_stream_state ADD CONSTRAINT fk_chat_turn_stream_state_turn_scope FOREIGN KEY (turn_run_id, session_id, user_id) REFERENCES chat_turn_runs(id, session_id, user_id) ON DELETE RESTRICT;
ALTER TABLE public.chat_turn_events ADD CONSTRAINT chat_turn_events_session_id_fkey FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE;
ALTER TABLE public.chat_turn_events ADD CONSTRAINT chat_turn_events_turn_run_id_fkey FOREIGN KEY (turn_run_id) REFERENCES chat_turn_runs(id) ON DELETE CASCADE;
ALTER TABLE public.chat_turn_events ADD CONSTRAINT chat_turn_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public.chat_turn_effects ADD CONSTRAINT fk_chat_turn_effects_turn_scope FOREIGN KEY (turn_run_id, session_id, user_id) REFERENCES chat_turn_runs(id, session_id, user_id) ON DELETE CASCADE;
ALTER TABLE public.chat_turn_signals ADD CONSTRAINT fk_chat_turn_signals_turn_scope FOREIGN KEY (turn_run_id, session_id, user_id) REFERENCES chat_turn_runs(id, session_id, user_id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.actor_has_project_member_access(p_actor_id uuid, p_project_id uuid, p_required_access text DEFAULT 'read'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
	SELECT
		p_actor_id IS NOT NULL
		AND p_project_id IS NOT NULL
		AND (
			EXISTS (
				SELECT 1
				FROM public.onto_projects AS p
				WHERE p.id = p_project_id
					AND p.deleted_at IS NULL
					AND p.created_by = p_actor_id
			)
			OR EXISTS (
				SELECT 1
				FROM public.onto_project_members AS m
				JOIN public.onto_projects AS p ON p.id = m.project_id
				WHERE m.project_id = p_project_id
					AND p.deleted_at IS NULL
					AND m.actor_id = p_actor_id
					AND m.removed_at IS NULL
					AND (
						(p_required_access = 'read' AND m.access IN ('read', 'write', 'admin'))
						OR (p_required_access = 'write' AND m.access IN ('write', 'admin'))
						OR (p_required_access = 'admin' AND m.access = 'admin')
					)
			)
		)
$function$;

CREATE OR REPLACE FUNCTION public.add_queue_job(p_user_id uuid, p_job_type text, p_metadata jsonb, p_priority integer DEFAULT 10, p_scheduled_for timestamp with time zone DEFAULT now(), p_dedup_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_job_id uuid;
	v_queue_job_id text;
	v_attempt integer := 0;
	v_correlation_id text;
	v_metadata jsonb;
	v_request_role text;
BEGIN
	-- SECURITY DEFINER callers change current_user to the function owner. The
	-- signed PostgREST claim preserves the original trusted request role so a
	-- user-callable definer wrapper cannot smuggle an agentic-chat queue row.
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF p_job_type = 'agentic_chat_turn' AND v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_queue_service_role_required'
			USING ERRCODE = '42501';
	END IF;

	IF jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) = 'object' THEN
		v_correlation_id := NULLIF(BTRIM(p_metadata->>'correlationId'), '');
		IF v_correlation_id IS NULL
			OR v_correlation_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
			v_correlation_id := gen_random_uuid()::text;
		END IF;
		v_metadata := COALESCE(p_metadata, '{}'::jsonb)
			|| jsonb_build_object('correlationId', v_correlation_id);
	ELSE
		v_correlation_id := gen_random_uuid()::text;
		v_metadata := jsonb_build_object(
			'payload', p_metadata,
			'correlationId', v_correlation_id
		);
	END IF;

	LOOP
		v_attempt := v_attempt + 1;
		v_queue_job_id := p_job_type || '_' || gen_random_uuid()::text;
		v_job_id := NULL;

		INSERT INTO public.queue_jobs (
			user_id,
			job_type,
			metadata,
			priority,
			scheduled_for,
			dedup_key,
			status,
			queue_job_id
		) VALUES (
			p_user_id,
			p_job_type::public.queue_type,
			v_metadata,
			p_priority,
			p_scheduled_for,
			p_dedup_key,
			'pending'::public.queue_status,
			v_queue_job_id
		)
		ON CONFLICT (dedup_key)
		WHERE dedup_key IS NOT NULL
			AND status IN ('pending', 'processing')
		DO NOTHING
		RETURNING id INTO v_job_id;

		IF v_job_id IS NOT NULL THEN
			RETURN v_job_id;
		END IF;

		IF p_dedup_key IS NOT NULL THEN
			SELECT jobs.id
			INTO v_job_id
			FROM public.queue_jobs jobs
			WHERE jobs.dedup_key = p_dedup_key
				AND jobs.status IN ('pending', 'processing')
			ORDER BY jobs.created_at ASC
			LIMIT 1;

			IF v_job_id IS NOT NULL THEN
				RETURN v_job_id;
			END IF;
		END IF;

		IF v_attempt >= 2 THEN
			RAISE EXCEPTION 'Failed to create or find job with dedup_key: %', p_dedup_key;
		END IF;
	END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agentic_chat_contract_effect_target_id_v1(p_tool_name text, p_arguments jsonb, p_result jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_semantics jsonb := public.agentic_chat_contract_tool_semantics_v1(p_tool_name);
	v_entity_kind text;
	v_result_payload jsonb;
BEGIN
	IF v_semantics IS NULL THEN RETURN NULL; END IF;
	v_entity_kind := v_semantics->>'entityKind';
	v_result_payload := COALESCE(p_result->'result', p_result);
	RETURN COALESCE(
		p_arguments->>(v_entity_kind || '_id'),
		CASE v_entity_kind
			WHEN 'document' THEN p_arguments->>'document_id'
			WHEN 'task' THEN p_arguments->>'task_id'
			WHEN 'project' THEN p_arguments->>'project_id'
			WHEN 'event' THEN p_arguments->>'event_id'
			WHEN 'relationship' THEN COALESCE(p_arguments->>'edge_id', p_arguments->>'entity_id')
			ELSE p_arguments->>'entity_id'
		END,
		v_result_payload->v_entity_kind->>'id',
		v_result_payload->>(v_entity_kind || '_id'),
		v_result_payload->>'id'
	);
END;
$function$;

CREATE OR REPLACE FUNCTION public.agentic_chat_contract_tool_semantics_v1(p_tool_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_action text;
	v_entity_kind text;
BEGIN
	IF p_tool_name ~ '^(create|update|delete)_onto_[a-z_]+$' THEN
		v_action := split_part(p_tool_name, '_', 1);
		v_entity_kind := regexp_replace(
			p_tool_name,
			'^(?:create|update|delete)_onto_',
			''
		);
	ELSIF p_tool_name = 'move_document_in_tree' THEN
		v_action := 'move'; v_entity_kind := 'document';
	ELSIF p_tool_name = 'move_onto_task' THEN
		v_action := 'move'; v_entity_kind := 'task';
	ELSIF p_tool_name = 'create_task_document' THEN
		v_action := 'create'; v_entity_kind := 'document';
	ELSIF p_tool_name IN ('create_calendar_event', 'update_calendar_event', 'delete_calendar_event') THEN
		v_action := split_part(p_tool_name, '_', 1); v_entity_kind := 'event';
	ELSIF p_tool_name = 'reorganize_onto_project_graph' THEN
		v_action := 'organize'; v_entity_kind := 'project';
	ELSIF p_tool_name = 'link_onto_entities' THEN
		v_action := 'link'; v_entity_kind := 'relationship';
	ELSIF p_tool_name = 'unlink_onto_edge' THEN
		v_action := 'unlink'; v_entity_kind := 'relationship';
	ELSIF p_tool_name = 'set_project_calendar' THEN
		v_action := 'set'; v_entity_kind := 'calendar';
	ELSIF p_tool_name = 'tag_onto_entity' THEN
		v_action := 'tag'; v_entity_kind := 'entity';
	ELSE
		RETURN NULL;
	END IF;
	RETURN jsonb_build_object('action', v_action, 'entityKind', v_entity_kind);
END;
$function$;

CREATE OR REPLACE FUNCTION public.agentic_chat_domain_reference_map_v1_is_valid(p_map jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_entry record;
BEGIN
	IF jsonb_typeof(p_map) IS DISTINCT FROM 'object'
		OR (SELECT count(*) FROM jsonb_object_keys(p_map)) > 256 THEN
		RETURN false;
	END IF;
	FOR v_entry IN SELECT key, value FROM jsonb_each(p_map)
	LOOP
		IF v_entry.key !~ '^[a-z0-9][a-z0-9._/-]{0,127}$'
			OR jsonb_typeof(v_entry.value) <> 'array'
			OR jsonb_array_length(v_entry.value) > 16
			OR EXISTS (
				SELECT 1
				FROM jsonb_array_elements(v_entry.value) item(value)
				WHERE jsonb_typeof(item.value) <> 'string'
					OR item.value#>>'{}' !~ '^[a-z0-9][a-z0-9._/-]{0,127}$'
			)
			OR (
				SELECT count(*) <> count(DISTINCT item.value)
				FROM jsonb_array_elements(v_entry.value) item(value)
			)
			OR v_entry.value IS DISTINCT FROM COALESCE((
				SELECT jsonb_agg(item.value ORDER BY item.value#>>'{}')
				FROM jsonb_array_elements(v_entry.value) item(value)
			), '[]'::jsonb) THEN
			RETURN false;
		END IF;
	END LOOP;
	RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agentic_chat_expected_write_tool_names_v1(p_intent jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_operations jsonb;
	v_operation jsonb;
	v_action text;
	v_entity_kind text;
	v_tool_name text;
	v_result jsonb := '[]'::jsonb;
BEGIN
	v_operations := p_intent->'operations';
	IF jsonb_typeof(v_operations) <> 'array' THEN
		RAISE EXCEPTION 'agentic_chat_turn_intent_invalid_operations';
	END IF;
	IF jsonb_array_length(v_operations) = 0
		AND COALESCE((p_intent->>'requiresWrite')::boolean, false)
		AND jsonb_typeof(p_intent->'action') = 'string' THEN
		v_operations := jsonb_build_array(jsonb_build_object(
			'action', p_intent->>'action',
			'entityKind', p_intent->>'entityKind'
		));
	END IF;

	FOR v_operation IN SELECT value FROM jsonb_array_elements(v_operations)
	LOOP
		v_action := v_operation->>'action';
		v_entity_kind := v_operation->>'entityKind';
		v_tool_name := NULL;

		IF v_action = 'link' THEN
			v_tool_name := 'link_onto_entities';
		ELSIF v_action = 'unlink' THEN
			v_tool_name := 'unlink_onto_edge';
		ELSIF v_entity_kind = 'document' THEN
			v_tool_name := CASE v_action
				WHEN 'create' THEN 'create_onto_document'
				WHEN 'organize' THEN 'move_document_in_tree'
				WHEN 'delete' THEN 'delete_onto_document'
				ELSE 'update_onto_document'
			END;
		ELSIF v_entity_kind = 'task' THEN
			v_tool_name := CASE v_action
				WHEN 'create' THEN 'create_onto_task'
				WHEN 'delete' THEN 'delete_onto_task'
				ELSE 'update_onto_task'
			END;
		ELSIF v_entity_kind = 'project' THEN
			v_tool_name := CASE v_action
				WHEN 'create' THEN 'create_onto_project'
				WHEN 'delete' THEN 'delete_onto_project'
				ELSE 'update_onto_project'
			END;
		ELSIF v_entity_kind = 'event' THEN
			v_tool_name := CASE v_action
				WHEN 'create' THEN 'create_calendar_event'
				WHEN 'delete' THEN 'delete_calendar_event'
				ELSE 'update_calendar_event'
			END;
		ELSIF v_entity_kind IN ('goal', 'plan', 'milestone', 'risk') THEN
			v_tool_name := CASE
				WHEN v_action = 'create' THEN 'create_onto_' || v_entity_kind
				WHEN v_action = 'delete' THEN 'delete_onto_' || v_entity_kind
				ELSE 'update_onto_' || v_entity_kind
			END;
		END IF;

		IF v_tool_name IS NOT NULL
			AND NOT v_result @> jsonb_build_array(v_tool_name) THEN
			v_result := v_result || jsonb_build_array(v_tool_name);
		END IF;
	END LOOP;

	RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agentic_chat_frozen_attachment_v1_is_valid(p_attachment jsonb, p_require_resolution boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_kind text;
	v_file_size numeric;
	v_width numeric;
	v_height numeric;
BEGIN
	IF jsonb_typeof(COALESCE(p_attachment, 'null'::jsonb)) <> 'object'
		OR jsonb_typeof(COALESCE(p_attachment->'attachment_kind', 'null'::jsonb)) <> 'string'
		OR jsonb_typeof(COALESCE(p_attachment->'media_type', 'null'::jsonb)) <> 'string'
		OR p_attachment->>'media_type' <> 'image'
		OR COALESCE(p_attachment->>'role', 'attachment') NOT IN ('attachment', 'analysis_target')
		OR COALESCE((p_attachment->>'display_order') !~ '^[0-9]+$', true)
		OR (p_attachment->>'display_order')::numeric > 100 THEN
		RETURN false;
	END IF;

	v_kind := p_attachment->>'attachment_kind';
	IF v_kind = 'onto_asset' THEN
		IF jsonb_typeof(COALESCE(p_attachment->'asset_id', 'null'::jsonb)) <> 'string'
			OR btrim(p_attachment->>'asset_id') = ''
			OR COALESCE(jsonb_typeof(p_attachment->'temporary_attachment_id'), 'null') <> 'null'
			OR jsonb_typeof(COALESCE(p_attachment->'project_id', 'null'::jsonb)) <> 'string'
			OR btrim(p_attachment->>'project_id') = ''
			OR COALESCE(jsonb_typeof(p_attachment->'expires_at'), 'null') <> 'null' THEN
			RETURN false;
		END IF;
	ELSIF v_kind = 'temporary_file' THEN
		IF COALESCE(jsonb_typeof(p_attachment->'asset_id'), 'null') <> 'null'
			OR jsonb_typeof(COALESCE(p_attachment->'temporary_attachment_id', 'null'::jsonb)) <> 'string'
			OR btrim(p_attachment->>'temporary_attachment_id') = ''
			OR COALESCE(jsonb_typeof(p_attachment->'project_id'), 'null') <> 'null'
			OR p_attachment->>'ocr_status' IS DISTINCT FROM 'skipped'
			OR COALESCE(jsonb_typeof(p_attachment->'extraction_summary'), 'null') <> 'null'
			OR COALESCE(jsonb_typeof(p_attachment->'extracted_text_preview'), 'null') <> 'null'
			OR (
				p_attachment ? 'expires_at'
				AND jsonb_typeof(p_attachment->'expires_at') <> 'string'
			) THEN
			RETURN false;
		END IF;
	ELSE
		RETURN false;
	END IF;

	IF p_require_resolution AND (
		jsonb_typeof(COALESCE(p_attachment->'storage_bucket', 'null'::jsonb)) <> 'string'
		OR btrim(p_attachment->>'storage_bucket') = ''
		OR length(p_attachment->>'storage_bucket') > 128
		OR jsonb_typeof(COALESCE(p_attachment->'storage_path', 'null'::jsonb)) <> 'string'
		OR btrim(p_attachment->>'storage_path') = ''
		OR length(p_attachment->>'storage_path') > 2048
		OR (v_kind = 'temporary_file' AND (
			jsonb_typeof(COALESCE(p_attachment->'expires_at', 'null'::jsonb)) <> 'string'
			OR (p_attachment->>'expires_at')::timestamptz IS NULL
		))
	) THEN
		RETURN false;
	END IF;

	IF (p_attachment ? 'file_name' AND jsonb_typeof(p_attachment->'file_name') NOT IN ('string', 'null'))
		OR length(COALESCE(p_attachment->>'file_name', '')) > 1024
		OR (p_attachment ? 'content_type' AND jsonb_typeof(p_attachment->'content_type') NOT IN ('string', 'null'))
		OR length(COALESCE(p_attachment->>'content_type', '')) > 256
		OR (p_attachment ? 'ocr_status' AND jsonb_typeof(p_attachment->'ocr_status') NOT IN ('string', 'null'))
		OR length(COALESCE(p_attachment->>'ocr_status', '')) > 128
		OR (p_attachment ? 'extraction_summary' AND jsonb_typeof(p_attachment->'extraction_summary') NOT IN ('string', 'null'))
		OR length(COALESCE(p_attachment->>'extraction_summary', '')) > 700
		OR (p_attachment ? 'extracted_text_preview' AND jsonb_typeof(p_attachment->'extracted_text_preview') NOT IN ('string', 'null'))
		OR length(COALESCE(p_attachment->>'extracted_text_preview', '')) > 20000
		OR (
			COALESCE(jsonb_typeof(p_attachment->'checksum_sha256'), 'null') <> 'null'
			AND (
				jsonb_typeof(p_attachment->'checksum_sha256') <> 'string'
				OR (p_attachment->>'checksum_sha256') !~ '^[0-9a-f]{64}$'
			)
		) THEN
		RETURN false;
	END IF;

	IF COALESCE(jsonb_typeof(p_attachment->'file_size_bytes'), 'null') <> 'null' THEN
		IF (p_attachment->>'file_size_bytes') !~ '^[0-9]+$' THEN RETURN false; END IF;
		v_file_size := (p_attachment->>'file_size_bytes')::numeric;
		IF v_file_size > 104857600 THEN RETURN false; END IF;
	END IF;
	IF COALESCE(jsonb_typeof(p_attachment->'width'), 'null') <> 'null' THEN
		IF (p_attachment->>'width') !~ '^[0-9]+$' THEN RETURN false; END IF;
		v_width := (p_attachment->>'width')::numeric;
		IF v_width > 100000 THEN RETURN false; END IF;
	END IF;
	IF COALESCE(jsonb_typeof(p_attachment->'height'), 'null') <> 'null' THEN
		IF (p_attachment->>'height') !~ '^[0-9]+$' THEN RETURN false; END IF;
		v_height := (p_attachment->>'height')::numeric;
		IF v_height > 100000 THEN RETURN false; END IF;
	END IF;

	RETURN true;
EXCEPTION
	WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN
		RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agentic_chat_frozen_attachments_v1_are_valid(p_attachments jsonb, p_require_resolution boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
	IF jsonb_typeof(COALESCE(p_attachments, 'null'::jsonb)) <> 'array'
		OR jsonb_array_length(p_attachments) > 16 THEN
		RETURN false;
	END IF;

	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_attachments) WITH ORDINALITY AS attachment(value, ordinality)
		WHERE NOT public.agentic_chat_frozen_attachment_v1_is_valid(
			attachment.value,
			p_require_resolution
		)
			OR (attachment.value->>'display_order')::bigint <> attachment.ordinality - 1
	) OR EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_attachments) AS attachment(value)
		GROUP BY CONCAT(
			attachment.value->>'attachment_kind', ':',
			COALESCE(attachment.value->>'asset_id', attachment.value->>'temporary_attachment_id')
		)
		HAVING count(*) > 1
	) THEN
		RETURN false;
	END IF;

	RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agentic_chat_jsonb_array_of_objects_v1_is_valid(p_array jsonb, p_limit integer)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
	IF jsonb_typeof(p_array) IS DISTINCT FROM 'array'
		OR jsonb_array_length(p_array) > GREATEST(0, LEAST(COALESCE(p_limit, 0), 256)) THEN
		RETURN false;
	END IF;
	RETURN NOT EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_array) item(value)
		WHERE jsonb_typeof(item.value) <> 'object'
	);
END;
$function$;

CREATE OR REPLACE FUNCTION public.agentic_chat_merge_domain_gap_v1(p_state jsonb, p_candidate jsonb, p_observed_at text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_gap_id text := p_candidate->>'id';
	v_gaps jsonb := COALESCE(p_state->'coverage_gaps', '[]'::jsonb);
	v_backlog jsonb := COALESCE(p_state->'research_backlog', '[]'::jsonb);
	v_existing_gap jsonb;
	v_existing_backlog jsonb;
	v_next_gap jsonb;
	v_next_backlog jsonb;
	v_merged_gaps jsonb;
	v_merged_backlog jsonb;
	v_priority text;
BEGIN
	SELECT entry.value INTO v_existing_gap
	FROM jsonb_array_elements(v_gaps) entry(value)
	WHERE CASE
		WHEN entry.value ? 'missing_skill_id' THEN 'skill:' || (entry.value->>'missing_skill_id')
		ELSE 'resource:' || (entry.value->>'missing_resource_id')
	END = v_gap_id
	LIMIT 1;
	SELECT entry.value INTO v_existing_backlog
	FROM jsonb_array_elements(v_backlog) entry(value)
	WHERE entry.value->>'id' = v_gap_id
	LIMIT 1;

	v_priority := CASE
		WHEN v_existing_backlog IS NULL THEN p_candidate->>'priority'
		WHEN CASE v_existing_backlog->>'priority' WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END
			<= CASE p_candidate->>'priority' WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END
			THEN v_existing_backlog->>'priority'
		ELSE p_candidate->>'priority'
	END;
	v_next_gap := jsonb_strip_nulls(jsonb_build_object(
		'missing_skill_id', p_candidate->'missing_skill_id',
		'missing_resource_id', p_candidate->'missing_resource_id',
		'domain_ids', public.agentic_chat_merge_domain_ids_v1(
			v_existing_gap->'domain_ids', p_candidate->'domain_ids', 8
		),
		'first_seen_at', COALESCE(v_existing_gap->>'first_seen_at', p_observed_at),
		'last_seen_at', p_observed_at,
		'occurrences', COALESCE((v_existing_gap->>'occurrences')::integer, 0) + 1
	));
	v_next_backlog := jsonb_strip_nulls(jsonb_build_object(
		'id', v_gap_id,
		'kind', CASE WHEN p_candidate ? 'missing_skill_id' THEN 'skill' ELSE 'resource' END,
		'status', 'queued',
		'priority', v_priority,
		'domain_ids', public.agentic_chat_merge_domain_ids_v1(
			v_existing_backlog->'domain_ids', p_candidate->'domain_ids', 8
		),
		'missing_skill_id', p_candidate->'missing_skill_id',
		'missing_resource_id', p_candidate->'missing_resource_id',
		'user_need', COALESCE(v_existing_backlog->>'user_need', p_candidate->>'user_need'),
		'summary', COALESCE(v_existing_backlog->>'summary', p_candidate->>'summary'),
		'first_seen_at', COALESCE(v_existing_backlog->>'first_seen_at', p_observed_at),
		'last_seen_at', p_observed_at,
		'occurrences', COALESCE((v_existing_backlog->>'occurrences')::integer, 0) + 1
	));

	SELECT COALESCE(jsonb_agg(rows.value ORDER BY rows.sort_time DESC), '[]'::jsonb)
	INTO v_merged_gaps
	FROM (
		SELECT candidates.value, candidates.value->>'last_seen_at' AS sort_time
		FROM (
			SELECT entry.value
			FROM jsonb_array_elements(v_gaps) entry(value)
			WHERE CASE
				WHEN entry.value ? 'missing_skill_id' THEN 'skill:' || (entry.value->>'missing_skill_id')
				ELSE 'resource:' || (entry.value->>'missing_resource_id')
			END <> v_gap_id
			UNION ALL
			SELECT v_next_gap
		) candidates
		ORDER BY sort_time DESC
		LIMIT 12
	) rows;
	SELECT COALESCE(jsonb_agg(rows.value ORDER BY
		rows.sort_priority,
		rows.sort_time DESC,
		rows.sort_occurrences DESC
	), '[]'::jsonb)
	INTO v_merged_backlog
	FROM (
		SELECT candidates.value,
			CASE candidates.value->>'priority' WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END AS sort_priority,
			candidates.value->>'last_seen_at' AS sort_time,
			COALESCE((candidates.value->>'occurrences')::integer, 0) AS sort_occurrences
		FROM (
			SELECT entry.value
			FROM jsonb_array_elements(v_backlog) entry(value)
			WHERE entry.value->>'id' <> v_gap_id
			UNION ALL
			SELECT v_next_backlog
		) candidates
		ORDER BY sort_priority, sort_time DESC, sort_occurrences DESC
		LIMIT 16
	) rows;

	RETURN jsonb_set(
		jsonb_set(p_state, '{coverage_gaps}', v_merged_gaps, true),
		'{research_backlog}', v_merged_backlog, true
	);
END;
$function$;

CREATE OR REPLACE FUNCTION public.agentic_chat_merge_domain_ids_v1(p_left jsonb, p_right jsonb, p_limit integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
	SELECT COALESCE(jsonb_agg(to_jsonb(items.value) ORDER BY items.first_ordinal), '[]'::jsonb)
	FROM (
		SELECT values.value, min(values.ordinality) AS first_ordinal
		FROM jsonb_array_elements_text(
			COALESCE(p_left, '[]'::jsonb) || COALESCE(p_right, '[]'::jsonb)
		) WITH ORDINALITY values(value, ordinality)
		GROUP BY values.value
		ORDER BY min(values.ordinality)
		LIMIT GREATEST(0, LEAST(COALESCE(p_limit, 8), 64))
	) items;
$function$;

CREATE OR REPLACE FUNCTION public.agentic_chat_merge_used_domain_signal_v1(p_state jsonb, p_signal jsonb, p_observed_at text, p_turn_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_entries jsonb := COALESCE(p_state->'used_domains', '[]'::jsonb);
	v_existing jsonb;
	v_existing_ordinal bigint;
	v_new_ordinal bigint;
	v_next jsonb;
	v_merged jsonb;
BEGIN
	SELECT entry.value, entry.ordinality
	INTO v_existing, v_existing_ordinal
	FROM jsonb_array_elements(v_entries) WITH ORDINALITY entry(value, ordinality)
	WHERE COALESCE(entry.value->>'domain_id', '') = COALESCE(p_signal->>'domain_id', '')
		AND COALESCE(entry.value->>'source', '') = COALESCE(p_signal->>'source', '')
		AND COALESCE(entry.value->>'tool_name', '') = COALESCE(p_signal->>'tool_name', '')
		AND COALESCE(entry.value->>'skill_id', '') = COALESCE(p_signal->>'skill_id', '')
		AND COALESCE(entry.value->>'outcome_card_id', '') = COALESCE(p_signal->>'outcome_card_id', '')
		AND COALESCE(entry.value->>'resource_id', '') = COALESCE(p_signal->>'resource_id', '')
	LIMIT 1;

	v_next := jsonb_strip_nulls(p_signal || jsonb_build_object(
		'turn_run_id', p_turn_run_id::text,
		'first_seen_at', COALESCE(v_existing->>'first_seen_at', p_observed_at),
		'last_seen_at', p_observed_at,
		'occurrences', COALESCE((v_existing->>'occurrences')::integer, 0) + 1
	));
	v_new_ordinal := COALESCE(
		v_existing_ordinal,
		(SELECT count(*) + 1 FROM jsonb_array_elements(v_entries))
	);

	SELECT COALESCE(jsonb_agg(
		rows.value ORDER BY rows.sort_time DESC, rows.sort_occurrences DESC, rows.sort_ordinal
	), '[]'::jsonb)
	INTO v_merged
	FROM (
		SELECT candidates.value,
			candidates.value->>'last_seen_at' AS sort_time,
			COALESCE((candidates.value->>'occurrences')::integer, 0) AS sort_occurrences,
			candidates.sort_ordinal
		FROM (
			SELECT entry.value, entry.ordinality AS sort_ordinal
			FROM jsonb_array_elements(v_entries) WITH ORDINALITY entry(value, ordinality)
			WHERE NOT (
				COALESCE(entry.value->>'domain_id', '') = COALESCE(p_signal->>'domain_id', '')
				AND COALESCE(entry.value->>'source', '') = COALESCE(p_signal->>'source', '')
				AND COALESCE(entry.value->>'tool_name', '') = COALESCE(p_signal->>'tool_name', '')
				AND COALESCE(entry.value->>'skill_id', '') = COALESCE(p_signal->>'skill_id', '')
				AND COALESCE(entry.value->>'outcome_card_id', '') = COALESCE(p_signal->>'outcome_card_id', '')
				AND COALESCE(entry.value->>'resource_id', '') = COALESCE(p_signal->>'resource_id', '')
			)
			UNION ALL
			SELECT v_next, v_new_ordinal
		) candidates
		ORDER BY sort_time DESC, sort_occurrences DESC, sort_ordinal
		LIMIT 24
	) rows;

	RETURN jsonb_set(p_state, '{used_domains}', v_merged, true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.agentic_chat_normalize_frozen_attachment_v1(p_attachment jsonb, p_display_order bigint, p_include_resolution boolean)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
	SELECT jsonb_build_object(
		'attachment_kind', p_attachment->>'attachment_kind',
		'media_type', p_attachment->>'media_type',
		'asset_id', COALESCE(p_attachment->'asset_id', 'null'::jsonb),
		'temporary_attachment_id', COALESCE(p_attachment->'temporary_attachment_id', 'null'::jsonb),
		'project_id', COALESCE(p_attachment->'project_id', 'null'::jsonb),
		'role', COALESCE(p_attachment->'role', '"attachment"'::jsonb),
		'display_order', p_display_order,
		'file_name', COALESCE(p_attachment->'file_name', 'null'::jsonb),
		'content_type', COALESCE(p_attachment->'content_type', 'null'::jsonb),
		'file_size_bytes', COALESCE(p_attachment->'file_size_bytes', 'null'::jsonb),
		'width', COALESCE(p_attachment->'width', 'null'::jsonb),
		'height', COALESCE(p_attachment->'height', 'null'::jsonb),
		'checksum_sha256', COALESCE(p_attachment->'checksum_sha256', 'null'::jsonb),
		'ocr_status', COALESCE(p_attachment->'ocr_status', 'null'::jsonb),
		'extraction_summary', COALESCE(p_attachment->'extraction_summary', 'null'::jsonb),
		'extracted_text_preview', COALESCE(p_attachment->'extracted_text_preview', 'null'::jsonb)
	) || CASE
		WHEN p_include_resolution THEN jsonb_build_object(
			'storage_bucket', COALESCE(p_attachment->'storage_bucket', 'null'::jsonb),
			'storage_path', COALESCE(p_attachment->'storage_path', 'null'::jsonb),
			'expires_at', COALESCE(p_attachment->'expires_at', 'null'::jsonb)
		)
		ELSE '{}'::jsonb
	END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_agentic_chat_terminal_domain_metadata_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_snapshot jsonb;
	v_state jsonb;
	v_execution record;
	v_payload jsonb;
	v_domain_ids jsonb;
	v_domain_id text;
	v_skill_id text;
	v_outcome_card_id text;
	v_resource_id text;
	v_source text;
	v_signal jsonb;
	v_signal_key text;
	v_used_signals jsonb := '[]'::jsonb;
	v_seen_used_keys text[] := ARRAY[]::text[];
	v_gap_candidates jsonb := '{}'::jsonb;
	v_gap_order text[] := ARRAY[]::text[];
	v_gap jsonb;
	v_gap_id text;
	v_candidate jsonb;
	v_existing_candidate jsonb;
	v_priority text;
	v_observed_at text;
	v_has_projection boolean := false;
	v_session public.chat_sessions%ROWTYPE;
BEGIN
	IF NEW.execution_mode <> 'worker_realtime'
		OR NEW.status NOT IN ('completed', 'failed', 'cancelled')
		OR OLD.status IN ('completed', 'failed', 'cancelled')
		OR NEW.input_artifact_id IS NULL THEN
		RETURN NEW;
	END IF;
	SELECT artifacts.prepared->'domainMetadata'
	INTO v_snapshot
	FROM public.chat_turn_input_artifacts artifacts
	WHERE artifacts.id = NEW.input_artifact_id
		AND artifacts.turn_run_id = NEW.id
		AND artifacts.session_id = NEW.session_id
		AND artifacts.user_id = NEW.user_id;
	IF NOT FOUND OR v_snapshot IS NULL THEN
		RETURN NEW;
	END IF;
	v_state := v_snapshot->'state';
	v_has_projection := (v_snapshot->>'sensingApplied')::boolean;
	IF NEW.terminalized_at IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_terminal_domain_metadata_missing_terminal_time';
	END IF;
	v_observed_at := to_char(
		NEW.terminalized_at AT TIME ZONE 'UTC',
		'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
	);

	FOR v_execution IN
		SELECT executions.tool_name, executions.result
		FROM public.chat_tool_executions executions
		WHERE executions.turn_run_id = NEW.id
			AND executions.session_id = NEW.session_id
			AND NEW.status IN ('completed', 'cancelled')
			AND executions.success = true
			AND executions.tool_name IN (
				'domain_load', 'outcome_card_load', 'work_capability_load',
				'resource_load', 'skill_load'
			)
		ORDER BY executions.sequence_index, executions.id
	LOOP
		v_payload := v_execution.result;
		IF jsonb_typeof(v_payload) <> 'object'
			OR COALESCE(v_payload->>'type', '') IN ('not_found', 'forbidden') THEN
			CONTINUE;
		END IF;
		v_domain_ids := '[]'::jsonb;
		v_skill_id := NULL;
		v_outcome_card_id := NULL;
		v_resource_id := NULL;
		v_source := NULL;

		IF v_execution.tool_name = 'domain_load' THEN
			v_source := 'domain_load';
			IF jsonb_typeof(v_payload->'domain_id') = 'string' THEN
				v_domain_ids := jsonb_build_array(v_payload->'domain_id');
			END IF;
		ELSIF v_execution.tool_name IN ('outcome_card_load', 'work_capability_load') THEN
			v_source := 'outcome_card_load';
			v_outcome_card_id := COALESCE(
				NULLIF(btrim(v_payload->>'id'), ''),
				NULLIF(btrim(v_payload->>'outcome_card_id'), ''),
				NULLIF(btrim(v_payload->>'work_capability_id'), '')
			);
			IF jsonb_typeof(v_payload->'domain_ids') = 'array'
				AND jsonb_array_length(v_payload->'domain_ids') > 0 THEN
				v_domain_ids := v_payload->'domain_ids';
			ELSIF v_outcome_card_id IS NOT NULL THEN
				v_domain_ids := COALESCE(
					v_snapshot->'outcomeCardDomainIds'->v_outcome_card_id,
					'[]'::jsonb
				);
			END IF;
		ELSIF v_execution.tool_name = 'resource_load' THEN
			v_source := 'resource_load';
			v_resource_id := COALESCE(
				NULLIF(btrim(v_payload->>'resource_id'), ''),
				NULLIF(btrim(v_payload->>'reference_id'), '')
			);
			v_skill_id := NULLIF(btrim(v_payload->>'skill_id'), '');
			IF jsonb_typeof(v_payload->'domain_ids') = 'array'
				AND jsonb_array_length(v_payload->'domain_ids') > 0 THEN
				v_domain_ids := v_payload->'domain_ids';
			ELSIF v_skill_id IS NOT NULL THEN
				v_domain_ids := COALESCE(
					v_snapshot->'skillDomainIds'->v_skill_id,
					'[]'::jsonb
				);
			END IF;
		ELSIF v_execution.tool_name = 'skill_load' THEN
			v_source := 'skill_load';
			v_skill_id := NULLIF(btrim(v_payload->>'id'), '');
			IF v_skill_id IS NOT NULL THEN
				v_domain_ids := COALESCE(
					v_snapshot->'skillDomainIds'->v_skill_id,
					'[]'::jsonb
				);
			END IF;
		END IF;

		IF jsonb_typeof(v_domain_ids) = 'array' THEN
			SELECT COALESCE(jsonb_agg(items.value ORDER BY items.ordinality), '[]'::jsonb)
			INTO v_domain_ids
			FROM (
				SELECT item.value, item.ordinality
				FROM jsonb_array_elements(v_domain_ids) WITH ORDINALITY item(value, ordinality)
				WHERE jsonb_typeof(item.value) = 'string'
					AND item.value#>>'{}' ~ '^[a-z0-9][a-z0-9._/-]{0,127}$'
				ORDER BY item.ordinality
				LIMIT 16
			) items;
			FOR v_domain_id IN SELECT value FROM jsonb_array_elements_text(v_domain_ids)
			LOOP
				v_domain_id := btrim(v_domain_id);
				IF v_domain_id = '' THEN CONTINUE; END IF;
				v_signal := jsonb_strip_nulls(jsonb_build_object(
					'domain_id', v_domain_id,
					'source', v_source,
					'tool_name', v_execution.tool_name,
					'skill_id', v_skill_id,
					'outcome_card_id', v_outcome_card_id,
					'resource_id', v_resource_id
				));
				v_signal_key := concat_ws('|',
					v_domain_id, v_source, COALESCE(v_skill_id, ''),
					COALESCE(v_outcome_card_id, ''), COALESCE(v_resource_id, ''),
					v_execution.tool_name
				);
				IF NOT (v_signal_key = ANY(v_seen_used_keys)) THEN
					v_seen_used_keys := array_append(v_seen_used_keys, v_signal_key);
					v_used_signals := v_used_signals || jsonb_build_array(v_signal);
				END IF;
			END LOOP;
		END IF;

		IF v_execution.tool_name IN ('outcome_card_load', 'work_capability_load')
			AND jsonb_typeof(v_payload->'gaps') = 'array' THEN
			v_priority := CASE COALESCE(v_payload->>'coverage_status', 'partial')
				WHEN 'strong' THEN 'low'
				WHEN 'none' THEN 'high'
				ELSE 'medium'
			END;
			FOR v_gap IN SELECT value FROM jsonb_array_elements(v_payload->'gaps')
			LOOP
				IF jsonb_typeof(v_gap) <> 'object' THEN CONTINUE; END IF;
				IF NULLIF(btrim(v_gap->>'missing_skill_id'), '') IS NOT NULL THEN
					v_gap_id := 'skill:' || btrim(v_gap->>'missing_skill_id');
				ELSIF NULLIF(btrim(v_gap->>'missing_resource_id'), '') IS NOT NULL THEN
					v_gap_id := 'resource:' || btrim(v_gap->>'missing_resource_id');
				ELSE
					CONTINUE;
				END IF;
				v_existing_candidate := v_gap_candidates->v_gap_id;
				IF v_existing_candidate IS NULL THEN
					v_gap_order := array_append(v_gap_order, v_gap_id);
				END IF;
				v_candidate := jsonb_strip_nulls(jsonb_build_object(
					'id', v_gap_id,
					'priority', CASE
						WHEN v_existing_candidate IS NULL THEN v_priority
						WHEN CASE v_existing_candidate->>'priority' WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END
							<= CASE v_priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END
							THEN v_existing_candidate->>'priority'
						ELSE v_priority
					END,
					'domain_ids', public.agentic_chat_merge_domain_ids_v1(
						v_existing_candidate->'domain_ids', v_domain_ids, 8
					),
					'missing_skill_id', NULLIF(btrim(v_gap->>'missing_skill_id'), ''),
					'missing_resource_id', NULLIF(btrim(v_gap->>'missing_resource_id'), ''),
					'user_need', COALESCE(
						v_existing_candidate->>'user_need', NULLIF(btrim(v_gap->>'user_need'), ''),
						'Coverage for ' || split_part(v_gap_id, ':', 2) || '.'
					),
					'summary', COALESCE(
						v_existing_candidate->>'summary', NULLIF(btrim(v_gap->>'summary'), ''),
						'Queued from loaded outcome-card coverage gaps.'
					)
				));
				v_gap_candidates := jsonb_set(
					v_gap_candidates, ARRAY[v_gap_id], v_candidate, true
				);
			END LOOP;
		END IF;
	END LOOP;

	FOR v_signal IN SELECT value FROM jsonb_array_elements(v_used_signals)
	LOOP
		v_state := public.agentic_chat_merge_used_domain_signal_v1(
			v_state, v_signal, v_observed_at, NEW.id
		);
		v_has_projection := true;
	END LOOP;
	FOREACH v_gap_id IN ARRAY v_gap_order
	LOOP
		v_candidate := v_gap_candidates->v_gap_id;
		v_state := public.agentic_chat_merge_domain_gap_v1(
			v_state, v_candidate, v_observed_at
		);
		v_has_projection := true;
	END LOOP;
	IF NOT v_has_projection THEN
		RETURN NEW;
	END IF;
	v_state := jsonb_set(v_state, '{updated_at}', to_jsonb(v_observed_at), true);

	SELECT sessions.* INTO v_session
	FROM public.chat_sessions sessions
	WHERE sessions.id = NEW.session_id
	FOR UPDATE;
	IF NOT FOUND OR v_session.user_id IS DISTINCT FROM NEW.user_id THEN
		RAISE EXCEPTION 'agentic_chat_terminal_domain_metadata_scope_mismatch';
	END IF;
	UPDATE public.chat_sessions sessions
	SET agent_metadata = COALESCE(sessions.agent_metadata, '{}'::jsonb)
			|| jsonb_build_object('fastchat_domain_state', v_state),
		updated_at = GREATEST(sessions.updated_at, NEW.terminalized_at)
	WHERE sessions.id = v_session.id;
	RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_agentic_chat_terminal_pending_contract_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_session public.chat_sessions%ROWTYPE;
	v_execution record;
	v_raw_outcome jsonb;
	v_outcome jsonb;
	v_existing_pending jsonb;
	v_prior_outcomes jsonb := '[]'::jsonb;
	v_outcomes jsonb := '[]'::jsonb;
	v_unfinished jsonb := '[]'::jsonb;
	v_semantics jsonb;
	v_target_id text;
	v_fields jsonb;
	v_candidate jsonb;
	v_candidates jsonb;
	v_target jsonb;
	v_required_field jsonb;
	v_target_fields jsonb;
	v_effect_key text;
	v_matched_effects jsonb;
	v_match_count integer;
	v_required_count integer;
	v_fulfilled boolean;
	v_target_complete boolean;
	v_outcome_matched boolean;
	v_last_cancel_sequence integer := -2147483648;
	v_observed_contract_state boolean := false;
	v_existing_contract_valid boolean := true;
	v_pending_contract jsonb := 'null'::jsonb;
	v_contract jsonb;
	v_now timestamptz;
	v_created_at text;
BEGIN
	IF NEW.execution_mode <> 'worker_realtime'
		OR NEW.status <> 'completed'
		OR OLD.status IN ('completed', 'failed', 'cancelled') THEN
		RETURN NEW;
	END IF;

	SELECT sessions.*
	INTO v_session
	FROM public.chat_sessions sessions
	WHERE sessions.id = NEW.session_id
	FOR UPDATE;
	IF NOT FOUND OR v_session.user_id IS DISTINCT FROM NEW.user_id THEN
		RAISE EXCEPTION 'agentic_chat_terminal_session_metadata_scope_mismatch';
	END IF;
	v_existing_pending := v_session.agent_metadata->'fastchat_pending_turn_contract';
	v_observed_contract_state := jsonb_typeof(v_existing_pending) = 'object';

	-- Only carry a prior commission into the same context/project. A context
	-- shift must never revive a write against the previous project.
	IF jsonb_typeof(v_existing_pending->'contract'->'outcomes') = 'array'
		AND COALESCE(v_existing_pending->>'contextType', v_existing_pending->>'context_type') = NEW.context_type
		AND COALESCE(v_existing_pending->>'projectId', v_existing_pending->>'project_id')
			IS NOT DISTINCT FROM NEW.project_id::text THEN
		v_observed_contract_state := true;
		FOR v_raw_outcome IN
			SELECT value FROM jsonb_array_elements(v_existing_pending->'contract'->'outcomes')
		LOOP
			BEGIN
				v_outcome := agentic_chat_internal.agentic_chat_normalize_contract_outcome_v1(
					v_raw_outcome,
					'prior_' || (jsonb_array_length(v_outcomes) + 1)::text
				);
			EXCEPTION WHEN OTHERS THEN
				v_existing_contract_valid := false;
				v_outcomes := '[]'::jsonb;
				EXIT;
			END;
			v_outcomes := v_outcomes || jsonb_build_array(v_outcome);
		END LOOP;
	END IF;
	IF NOT v_existing_contract_valid THEN
		v_existing_pending := NULL;
	END IF;
	v_prior_outcomes := v_outcomes;

	-- Apply successful control calls in execution order. Cancellation clears all
	-- obligations before it; a later declaration starts a new commission.
	FOR v_execution IN
		SELECT executions.*
		FROM public.chat_tool_executions executions
		WHERE executions.turn_run_id = NEW.id
			AND executions.session_id = NEW.session_id
			AND executions.success = true
			AND executions.tool_name IN ('declare_turn_contract', 'cancel_turn_contract', 'request_turn_clarification')
		ORDER BY executions.sequence_index, executions.id
	LOOP
		v_observed_contract_state := true;
		IF v_execution.tool_name IN ('cancel_turn_contract', 'request_turn_clarification') THEN
			IF NULLIF(btrim(v_execution.arguments->>'reason'), '') IS NULL
				OR (v_execution.tool_name = 'request_turn_clarification'
					AND NULLIF(btrim(v_execution.arguments->>'question'), '') IS NULL) THEN
				RAISE EXCEPTION 'agentic_chat_turn_contract_invalid_reset_control';
			END IF;
			v_outcomes := CASE
				WHEN v_execution.tool_name = 'cancel_turn_contract' THEN '[]'::jsonb
				ELSE v_prior_outcomes
			END;
			v_last_cancel_sequence := v_execution.sequence_index;
			CONTINUE;
		END IF;
		IF jsonb_typeof(v_execution.arguments->'outcomes') <> 'array'
			OR jsonb_array_length(v_execution.arguments->'outcomes') NOT BETWEEN 1 AND 20 THEN
			RAISE EXCEPTION 'agentic_chat_turn_contract_invalid_declaration';
		END IF;
		FOR v_raw_outcome IN
			SELECT value FROM jsonb_array_elements(v_execution.arguments->'outcomes')
		LOOP
			v_outcome := agentic_chat_internal.agentic_chat_normalize_contract_outcome_v1(
				v_raw_outcome,
				'outcome_' || (jsonb_array_length(v_outcomes) + 1)::text
			);
			IF NOT EXISTS (
				SELECT 1
				FROM jsonb_array_elements(v_outcomes) existing
				WHERE existing - 'id' - 'description' = v_outcome - 'id' - 'description'
			) THEN
				v_outcomes := v_outcomes || jsonb_build_array(v_outcome);
			END IF;
		END LOOP;
	END LOOP;

	-- Failed direct writes are durable evidence of an unfinished commission.
	-- Preserve their requested fields, and add them even when an unrelated prior
	-- contract exists. A failed call already covered by a declaration is evidence
	-- for that declaration rather than a duplicate obligation.
	FOR v_execution IN
		SELECT executions.*
		FROM public.chat_tool_executions executions
		WHERE executions.turn_run_id = NEW.id
			AND executions.session_id = NEW.session_id
			AND executions.success = false
			AND executions.sequence_index > v_last_cancel_sequence
		ORDER BY executions.sequence_index, executions.id
	LOOP
		v_semantics := public.agentic_chat_contract_tool_semantics_v1(v_execution.tool_name);
		IF v_semantics IS NULL THEN CONTINUE; END IF;
		v_observed_contract_state := true;
		v_target_id := public.agentic_chat_contract_effect_target_id_v1(
			v_execution.tool_name,
			v_execution.arguments,
			v_execution.result
		);
		v_outcome_matched := false;
		FOR v_outcome IN SELECT value FROM jsonb_array_elements(v_outcomes)
		LOOP
			IF agentic_chat_internal.agentic_chat_contract_effect_matches_v1(
				v_outcome->>'action',
				v_outcome->>'entityKind',
				v_execution.tool_name,
				v_execution.arguments,
				v_execution.result
			) AND (
				jsonb_array_length(v_outcome->'targetIds') = 0
				OR (v_target_id IS NOT NULL AND v_outcome->'targetIds' @> jsonb_build_array(v_target_id))
			) THEN
				v_outcome_matched := true;
				EXIT;
			END IF;
		END LOOP;
		IF v_outcome_matched THEN CONTINUE; END IF;
		v_fields := agentic_chat_internal.agentic_chat_contract_argument_fields_v1(v_execution.arguments);
		v_outcome := jsonb_build_object(
			'id', 'implicit_' || v_execution.sequence_index::text,
			'action', v_semantics->>'action',
			'entityKind', v_semantics->>'entityKind',
			'targetIds', CASE
				WHEN v_target_id IS NULL THEN '[]'::jsonb
				ELSE jsonb_build_array(v_target_id)
			END,
			'requiredFields', v_fields,
			'minimumSuccessfulEffects', 1
		);
		IF NOT EXISTS (
			SELECT 1
			FROM jsonb_array_elements(v_outcomes) existing
			WHERE existing - 'id' - 'description' = v_outcome - 'id' - 'description'
		) THEN
			v_outcomes := v_outcomes || jsonb_build_array(v_outcome);
		END IF;
	END LOOP;

	IF jsonb_array_length(v_outcomes) > 0 THEN
		FOR v_outcome IN SELECT value FROM jsonb_array_elements(v_outcomes)
		LOOP
			v_required_count := GREATEST(
				1,
				COALESCE((v_outcome->>'minimumSuccessfulEffects')::integer, 1)
			);
			v_candidates := '[]'::jsonb;
			FOR v_execution IN
				SELECT executions.*
				FROM public.chat_tool_executions executions
				WHERE executions.turn_run_id = NEW.id
					AND executions.session_id = NEW.session_id
					AND executions.success = true
					AND executions.sequence_index > v_last_cancel_sequence
				ORDER BY executions.sequence_index, executions.id
			LOOP
				IF NOT agentic_chat_internal.agentic_chat_contract_effect_matches_v1(
					v_outcome->>'action',
					v_outcome->>'entityKind',
					v_execution.tool_name,
					v_execution.arguments,
					v_execution.result
				) THEN
					CONTINUE;
				END IF;
				v_target_id := public.agentic_chat_contract_effect_target_id_v1(
					v_execution.tool_name,
					v_execution.arguments,
					v_execution.result
				);
				v_effect_key := COALESCE(
					v_target_id,
					v_execution.effect_id::text,
					v_execution.id::text
				);
				v_candidates := v_candidates || jsonb_build_array(jsonb_build_object(
					'targetId', v_target_id,
					'effectKey', v_effect_key,
					'fields', agentic_chat_internal.agentic_chat_contract_argument_fields_v1(v_execution.arguments)
				));
			END LOOP;

			v_matched_effects := '[]'::jsonb;
			IF jsonb_array_length(v_outcome->'targetIds') > 0 THEN
				FOR v_target IN SELECT value FROM jsonb_array_elements(v_outcome->'targetIds')
				LOOP
					v_target_fields := '[]'::jsonb;
					v_target_complete := false;
					FOR v_candidate IN SELECT value FROM jsonb_array_elements(v_candidates)
					LOOP
						IF (v_candidate->>'targetId') IS DISTINCT FROM (v_target #>> '{}') THEN
							CONTINUE;
						END IF;
						v_target_complete := true;
						FOR v_required_field IN SELECT value FROM jsonb_array_elements(v_candidate->'fields')
						LOOP
							IF NOT v_target_fields @> jsonb_build_array(v_required_field) THEN
								v_target_fields := v_target_fields || jsonb_build_array(v_required_field);
							END IF;
						END LOOP;
					END LOOP;
					IF v_target_complete THEN
						FOR v_required_field IN SELECT value FROM jsonb_array_elements(v_outcome->'requiredFields')
						LOOP
							IF NOT v_target_fields @> jsonb_build_array(v_required_field) THEN
								v_target_complete := false;
								EXIT;
							END IF;
						END LOOP;
					END IF;
					IF v_target_complete THEN
						v_matched_effects := v_matched_effects || jsonb_build_array(v_target);
					END IF;
				END LOOP;
				v_match_count := jsonb_array_length(v_matched_effects);
				v_fulfilled := v_match_count = jsonb_array_length(v_outcome->'targetIds')
					AND v_match_count >= v_required_count;
			ELSE
				FOR v_candidate IN SELECT value FROM jsonb_array_elements(v_candidates)
				LOOP
					v_target_complete := true;
					FOR v_required_field IN SELECT value FROM jsonb_array_elements(v_outcome->'requiredFields')
					LOOP
						IF NOT v_candidate->'fields' @> jsonb_build_array(v_required_field) THEN
							v_target_complete := false;
							EXIT;
						END IF;
					END LOOP;
					IF v_target_complete
						AND NOT v_matched_effects @> jsonb_build_array(v_candidate->'effectKey') THEN
						v_matched_effects := v_matched_effects || jsonb_build_array(v_candidate->'effectKey');
					END IF;
				END LOOP;
				v_match_count := jsonb_array_length(v_matched_effects);
				v_fulfilled := v_match_count >= v_required_count;
			END IF;
			IF NOT v_fulfilled THEN
				v_unfinished := v_unfinished || jsonb_build_array(v_outcome);
			END IF;
		END LOOP;
	END IF;

	-- No semantic work means no semantic contract, but legacy lexical metadata
	-- still needs clearing once a worker turn reaches a clean terminal state.
	IF NOT v_observed_contract_state
		AND NOT (COALESCE(v_session.agent_metadata, '{}'::jsonb) ? 'fastchat_pending_turn_intent') THEN
		RETURN NEW;
	END IF;
	v_now := NEW.terminalized_at;
	IF v_now IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_terminal_session_metadata_missing_terminal_time';
	END IF;
	v_created_at := to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
	IF jsonb_array_length(v_unfinished) > 0 THEN
		v_contract := jsonb_build_object(
			'version', 1,
			'source', 'declared',
			'outcomes', v_unfinished
		);
		v_pending_contract := jsonb_build_object(
			'version', 1,
			'contract', v_contract,
			'contextType', NEW.context_type,
			'projectId', NEW.project_id,
			'originatingTurnRunId', NEW.id::text,
			'createdAt', v_created_at,
			'finishedReason', NEW.finished_reason
		);
	END IF;

	UPDATE public.chat_sessions sessions
	SET agent_metadata = COALESCE(sessions.agent_metadata, '{}'::jsonb)
			|| jsonb_build_object(
				'fastchat_pending_turn_contract', v_pending_contract,
				'fastchat_pending_turn_intent', 'null'::jsonb
			),
		updated_at = GREATEST(sessions.updated_at, NEW.terminalized_at)
	WHERE sessions.id = v_session.id;

	RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.attach_voice_note_group_from_chat_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_group_id_text text;
BEGIN
	IF NEW.role IS DISTINCT FROM 'user'
		OR jsonb_typeof(COALESCE(NEW.metadata, 'null'::jsonb)) <> 'object' THEN
		RETURN NEW;
	END IF;

	v_group_id_text := NEW.metadata->>'voice_note_group_id';
	IF v_group_id_text IS NULL
		OR v_group_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
		RETURN NEW;
	END IF;

	UPDATE public.voice_note_groups groups
	SET linked_entity_type = 'chat_message',
		linked_entity_id = NEW.id,
		chat_session_id = NEW.session_id,
		status = 'attached',
		updated_at = clock_timestamp()
	WHERE groups.id = v_group_id_text::uuid
		AND groups.user_id = NEW.user_id
		AND groups.status = 'draft'
		AND groups.deleted_at IS NULL;

	RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.begin_agentic_chat_turn_execution(p_turn_run_id uuid, p_queue_job_id uuid, p_processing_token uuid, p_execution_generation integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_request_role text;
	v_turn public.chat_turn_runs%ROWTYPE;
	v_job public.queue_jobs%ROWTYPE;
	v_artifact public.chat_turn_input_artifacts%ROWTYPE;
	v_now timestamptz;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_execution_start_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL
		OR p_queue_job_id IS NULL
		OR p_processing_token IS NULL
		OR p_execution_generation IS NULL
		OR p_execution_generation < 1 THEN
		RAISE EXCEPTION 'agentic_chat_execution_start_invalid_identity';
	END IF;

	-- All worker primitives serialize on turn -> subordinate -> queue.
	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_execution_start_turn_not_found';
	END IF;
	IF v_turn.execution_mode <> 'worker_realtime'
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id THEN
		RAISE EXCEPTION 'agentic_chat_execution_start_relationship_mismatch';
	END IF;

	IF v_turn.status IN ('completed', 'failed', 'cancelled') THEN
		RETURN jsonb_build_object(
			'outcome', 'already_terminal',
			'invoke_provider', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'correlation_id', v_turn.correlation_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status
		);
	END IF;
	IF v_turn.execution_generation <> p_execution_generation THEN
		RETURN jsonb_build_object(
			'outcome', 'stale_generation',
			'invoke_provider', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'correlation_id', v_turn.correlation_id,
			'requested_execution_generation', p_execution_generation,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status
		);
	END IF;
	IF v_turn.status <> 'running' THEN
		RAISE EXCEPTION 'agentic_chat_execution_start_invalid_status';
	END IF;

	SELECT jobs.*
	INTO v_job
	FROM public.queue_jobs jobs
	WHERE jobs.id = p_queue_job_id
	FOR UPDATE;

	IF NOT FOUND
		OR v_job.user_id IS DISTINCT FROM v_turn.user_id
		OR v_job.job_type::text <> 'agentic_chat_turn'
		OR v_job.status::text <> 'processing'
		OR v_job.processing_token IS DISTINCT FROM p_processing_token
		OR v_job.dedup_key IS DISTINCT FROM 'agentic-chat-turn:' || v_turn.id::text
		OR v_job.metadata->>'turnRunId' IS DISTINCT FROM v_turn.id::text
		OR v_job.metadata->>'correlationId' IS DISTINCT FROM v_turn.correlation_id::text THEN
		RAISE EXCEPTION 'agentic_chat_execution_start_ownership_lost';
	END IF;

	-- The receipt clock is captured only after both governing locks.
	v_now := clock_timestamp();

	IF v_turn.cancel_requested_at IS NOT NULL THEN
		RETURN jsonb_build_object(
			'outcome', 'cancel_requested',
			'invoke_provider', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'correlation_id', v_turn.correlation_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status
		);
	END IF;
	IF v_turn.execution_started_at IS NOT NULL THEN
		RETURN jsonb_build_object(
			'outcome', 'already_started',
			'invoke_provider', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'correlation_id', v_turn.correlation_id,
			'execution_generation', v_turn.execution_generation,
			'execution_started_at', v_turn.execution_started_at,
			'status', v_turn.status
		);
	END IF;
	IF v_turn.mutation_reserved_at IS NOT NULL
		OR v_turn.irreversible_boundary_at IS NOT NULL
		OR v_turn.terminalized_at IS NOT NULL THEN
		RAISE EXCEPTION 'agentic_chat_execution_start_boundary_corrupt';
	END IF;

	SELECT artifacts.*
	INTO v_artifact
	FROM public.chat_turn_input_artifacts artifacts
	WHERE artifacts.id = v_turn.input_artifact_id
		AND artifacts.turn_run_id = v_turn.id
		AND artifacts.session_id = v_turn.session_id
		AND artifacts.user_id = v_turn.user_id;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_execution_start_input_artifact_scope_mismatch';
	END IF;
	IF v_artifact.retain_until < v_now THEN
		RETURN jsonb_build_object(
			'outcome', 'stale_context',
			'invoke_provider', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'correlation_id', v_turn.correlation_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status
		);
	END IF;

	UPDATE public.chat_turn_runs turns
	SET execution_started_at = v_now,
		last_progress_at = v_now,
		updated_at = v_now
	WHERE turns.id = v_turn.id
		AND turns.status = 'running'
		AND turns.execution_generation = p_execution_generation
		AND turns.execution_started_at IS NULL
		AND turns.cancel_requested_at IS NULL
	RETURNING * INTO v_turn;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_execution_start_compare_and_set_lost';
	END IF;

	UPDATE public.queue_jobs jobs
	SET updated_at = v_now
	WHERE jobs.id = p_queue_job_id
		AND jobs.status = 'processing'
		AND jobs.processing_token = p_processing_token;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_execution_start_queue_fence_lost';
	END IF;

	RETURN jsonb_build_object(
		'outcome', 'started',
		'invoke_provider', true,
		'turn_run_id', v_turn.id,
		'queue_job_id', v_turn.queue_job_id,
		'session_id', v_turn.session_id,
		'user_id', v_turn.user_id,
		'correlation_id', v_turn.correlation_id,
		'execution_generation', v_turn.execution_generation,
		'execution_started_at', v_turn.execution_started_at,
		'status', v_turn.status
	);
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_agentic_chat_resume_checkpoint_for_artifact()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_turn public.chat_turn_runs%ROWTYPE;
	v_checkpoint public.chat_turn_checkpoints%ROWTYPE;
	v_snapshot jsonb := NEW.prepared->'resumeCheckpoint';
	v_now timestamptz := transaction_timestamp();
BEGIN
	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = NEW.turn_run_id
	FOR UPDATE;
	IF NOT FOUND
		OR v_turn.session_id IS DISTINCT FROM NEW.session_id
		OR v_turn.user_id IS DISTINCT FROM NEW.user_id THEN
		RAISE EXCEPTION 'agentic_chat_resume_artifact_turn_scope_mismatch';
	END IF;
	IF v_turn.execution_mode <> 'worker_realtime' THEN
		IF v_snapshot IS NOT NULL THEN
			RAISE EXCEPTION 'agentic_chat_resume_artifact_worker_mode_required';
		END IF;
		RETURN NEW;
	END IF;
	IF v_turn.status <> 'queued' OR v_turn.execution_generation <> 0 THEN
		RAISE EXCEPTION 'agentic_chat_resume_artifact_admission_state_invalid';
	END IF;

	UPDATE public.chat_turn_checkpoints checkpoints
	SET status = 'expired',
		updated_at = v_now
	WHERE checkpoints.session_id = NEW.session_id
		AND checkpoints.user_id = NEW.user_id
		AND checkpoints.status = 'active'
		AND checkpoints.expires_at IS NOT NULL
		AND checkpoints.expires_at <= v_now;

	SELECT checkpoints.*
	INTO v_checkpoint
	FROM public.chat_turn_checkpoints checkpoints
	WHERE checkpoints.session_id = NEW.session_id
		AND checkpoints.user_id = NEW.user_id
		AND checkpoints.status = 'active'
		AND (checkpoints.expires_at IS NULL OR checkpoints.expires_at > v_now)
	ORDER BY checkpoints.created_at DESC, checkpoints.id DESC
	LIMIT 1
	FOR UPDATE;

	IF NOT FOUND THEN
		IF v_snapshot IS NOT NULL THEN
			RAISE EXCEPTION 'agentic_chat_resume_artifact_snapshot_without_active_checkpoint';
		END IF;
		RETURN NEW;
	END IF;

	IF v_snapshot IS NULL
		OR jsonb_typeof(v_snapshot) <> 'object'
		OR NOT v_snapshot ?& ARRAY[
			'checkpointId',
			'originalTurnRunId',
			'checkpointType',
			'reason',
			'question',
			'resumeContext',
			'resumeMessage',
			'sourceExecutionGeneration',
			'supervisorTransitionId',
			'supervisorSequence'
		]
		OR v_snapshot - ARRAY[
			'checkpointId',
			'originalTurnRunId',
			'checkpointType',
			'reason',
			'question',
			'resumeContext',
			'resumeMessage',
			'sourceExecutionGeneration',
			'supervisorTransitionId',
			'supervisorSequence'
		] <> '{}'::jsonb
		OR v_snapshot->>'checkpointId' IS DISTINCT FROM v_checkpoint.id::text
		OR v_snapshot->>'originalTurnRunId' IS DISTINCT FROM v_checkpoint.turn_run_id::text
		OR v_snapshot->>'checkpointType' IS DISTINCT FROM v_checkpoint.checkpoint_type
		OR v_snapshot->>'reason' IS DISTINCT FROM v_checkpoint.reason
		OR COALESCE(v_snapshot->'question', 'null'::jsonb)
			IS DISTINCT FROM COALESCE(to_jsonb(v_checkpoint.question), 'null'::jsonb)
		OR jsonb_typeof(v_snapshot->'resumeContext') <> 'object'
		OR v_snapshot->'resumeContext' IS DISTINCT FROM v_checkpoint.resume_context
		OR pg_column_size(v_snapshot->'resumeContext') > 262144
		OR jsonb_typeof(v_snapshot->'resumeMessage') <> 'string'
		OR btrim(v_snapshot->>'resumeMessage') = ''
		OR octet_length(v_snapshot->>'resumeMessage') > 524288
		OR COALESCE(v_snapshot->'sourceExecutionGeneration', 'null'::jsonb)
			IS DISTINCT FROM COALESCE(to_jsonb(v_checkpoint.execution_generation), 'null'::jsonb)
		OR COALESCE(v_snapshot->'supervisorTransitionId', 'null'::jsonb)
			IS DISTINCT FROM COALESCE(to_jsonb(v_checkpoint.supervisor_transition_id), 'null'::jsonb)
		OR COALESCE(v_snapshot->'supervisorSequence', 'null'::jsonb)
			IS DISTINCT FROM COALESCE(to_jsonb(v_checkpoint.supervisor_sequence), 'null'::jsonb) THEN
		RAISE EXCEPTION 'agentic_chat_resume_artifact_snapshot_mismatch';
	END IF;

	UPDATE public.chat_turn_checkpoints checkpoints
	SET status = 'resuming',
		resume_turn_run_id = NEW.turn_run_id,
		resume_started_at = v_now,
		resumed_at = NULL,
		updated_at = v_now
	WHERE checkpoints.id = v_checkpoint.id
		AND checkpoints.user_id = NEW.user_id
		AND checkpoints.session_id = NEW.session_id
		AND checkpoints.status = 'active';
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_resume_artifact_claim_lost';
	END IF;

	RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_agentic_chat_turn(p_turn_run_id uuid, p_queue_job_id uuid, p_processing_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_request_role text;
	v_turn public.chat_turn_runs%ROWTYPE;
	v_job public.queue_jobs%ROWTYPE;
	v_artifact public.chat_turn_input_artifacts%ROWTYPE;
	v_stream public.chat_turn_stream_state%ROWTYPE;
	v_now timestamptz := clock_timestamp();
	v_next_generation integer;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_claim_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL OR p_queue_job_id IS NULL OR p_processing_token IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_claim_invalid_identity';
	END IF;

	-- Every worker primitive follows turn -> subordinate row -> queue lock order.
	-- This serializes generation changes with all later turn-owned writes.
	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_claim_turn_not_found';
	END IF;
	IF v_turn.execution_mode <> 'worker_realtime'
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id THEN
		RAISE EXCEPTION 'agentic_chat_claim_turn_relationship_mismatch';
	END IF;

	SELECT jobs.*
	INTO v_job
	FROM public.queue_jobs jobs
	WHERE jobs.id = p_queue_job_id
	FOR UPDATE;

	IF NOT FOUND
		OR v_job.user_id IS DISTINCT FROM v_turn.user_id
		OR v_job.job_type::text <> 'agentic_chat_turn'
		OR v_job.status::text <> 'processing'
		OR v_job.processing_token IS DISTINCT FROM p_processing_token
		OR v_job.dedup_key IS DISTINCT FROM 'agentic-chat-turn:' || v_turn.id::text
		OR v_job.metadata->>'turnRunId' IS DISTINCT FROM v_turn.id::text
		OR v_job.metadata->>'correlationId' IS DISTINCT FROM v_turn.correlation_id::text THEN
		RAISE EXCEPTION 'agentic_chat_claim_ownership_lost';
	END IF;

	IF v_turn.status IN ('completed', 'failed', 'cancelled') THEN
		RETURN jsonb_build_object(
			'outcome', 'already_terminal',
			'execution_may_start', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'correlation_id', v_turn.correlation_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status
		);
	END IF;

	IF v_turn.status = 'running' THEN
		SELECT streams.*
		INTO v_stream
		FROM public.chat_turn_stream_state streams
		WHERE streams.turn_run_id = v_turn.id;

		IF v_turn.execution_generation < 1
			OR NOT FOUND
			OR v_stream.session_id IS DISTINCT FROM v_turn.session_id
			OR v_stream.user_id IS DISTINCT FROM v_turn.user_id
			OR v_stream.execution_generation IS DISTINCT FROM v_turn.execution_generation THEN
			RAISE EXCEPTION 'agentic_chat_claim_current_generation_corrupt';
		END IF;

		RETURN jsonb_build_object(
			'outcome', CASE WHEN v_turn.cancel_requested_at IS NULL
				THEN 'matching_current_claim' ELSE 'cancel_requested' END,
			'execution_may_start',
				v_turn.cancel_requested_at IS NULL AND v_turn.execution_started_at IS NULL,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'correlation_id', v_turn.correlation_id,
			'execution_generation', v_turn.execution_generation,
			'input_artifact_id', v_turn.input_artifact_id,
			'user_message_id', v_turn.user_message_id,
			'status', v_turn.status
		);
	END IF;

	IF v_turn.status <> 'queued' THEN
		RAISE EXCEPTION 'agentic_chat_claim_invalid_status';
	END IF;
	IF v_turn.cancel_requested_at IS NOT NULL THEN
		RETURN jsonb_build_object(
			'outcome', 'cancel_requested',
			'execution_may_start', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'correlation_id', v_turn.correlation_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status
		);
	END IF;
	IF v_turn.execution_started_at IS NOT NULL
		OR v_turn.mutation_reserved_at IS NOT NULL
		OR v_turn.irreversible_boundary_at IS NOT NULL
		OR v_turn.terminalized_at IS NOT NULL THEN
		RAISE EXCEPTION 'agentic_chat_claim_unsafe_replay_boundary';
	END IF;
	IF v_turn.input_artifact_id IS NULL OR v_turn.user_message_id IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_claim_incomplete_admission';
	END IF;

	SELECT artifacts.*
	INTO v_artifact
	FROM public.chat_turn_input_artifacts artifacts
	WHERE artifacts.id = v_turn.input_artifact_id
		AND artifacts.turn_run_id = v_turn.id
		AND artifacts.session_id = v_turn.session_id
		AND artifacts.user_id = v_turn.user_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_claim_input_artifact_scope_mismatch';
	END IF;

	IF v_turn.execution_generation = 2147483647 THEN
		RAISE EXCEPTION 'agentic_chat_claim_generation_exhausted';
	END IF;
	v_next_generation := v_turn.execution_generation + 1;

	UPDATE public.chat_turn_runs turns
	SET status = 'running',
		execution_generation = v_next_generation,
		worker_started_at = v_now,
		last_progress_at = v_now,
		last_event_sequence = 0,
		updated_at = v_now
	WHERE turns.id = v_turn.id
		AND turns.status = 'queued'
		AND turns.execution_generation = v_turn.execution_generation
		AND turns.cancel_requested_at IS NULL;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_claim_compare_and_set_lost';
	END IF;

	INSERT INTO public.chat_turn_stream_state (
		turn_run_id,
		session_id,
		user_id,
		execution_generation,
		snapshot_sequence,
		durable_through_sequence,
		projection_durable_sequence,
		assistant_text,
		projection,
		reconcile_required,
		created_at,
		updated_at
	) VALUES (
		v_turn.id,
		v_turn.session_id,
		v_turn.user_id,
		v_next_generation,
		0,
		0,
		0,
		'',
		'{}'::jsonb,
		false,
		v_now,
		v_now
	)
	ON CONFLICT (turn_run_id) DO UPDATE
	SET execution_generation = EXCLUDED.execution_generation,
		snapshot_sequence = 0,
		durable_through_sequence = 0,
		projection_durable_sequence = 0,
		assistant_text = '',
		projection = '{}'::jsonb,
		reconcile_required = false,
		first_text_persisted_at = NULL,
		updated_at = EXCLUDED.updated_at;

	RETURN jsonb_build_object(
		'outcome', 'claimed',
		'execution_may_start', true,
		'turn_run_id', v_turn.id,
		'queue_job_id', v_turn.queue_job_id,
		'session_id', v_turn.session_id,
		'user_id', v_turn.user_id,
		'correlation_id', v_turn.correlation_id,
		'execution_generation', v_next_generation,
		'input_artifact_id', v_turn.input_artifact_id,
		'user_message_id', v_turn.user_message_id,
		'status', 'running'
	);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_agentic_chat_worker_artifacts(p_terminal_retention_days integer DEFAULT 7, p_effect_retention_days integer DEFAULT 30, p_uncertain_effect_retention_days integer DEFAULT 90, p_batch_size integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
	v_terminal_retention_days integer := GREATEST(
		COALESCE(p_terminal_retention_days, 7),
		7
	);
	v_effect_retention_days integer := GREATEST(
		COALESCE(p_effect_retention_days, 30),
		30
	);
	v_uncertain_effect_retention_days integer := GREATEST(
		COALESCE(p_uncertain_effect_retention_days, 90),
		90,
		v_effect_retention_days
	);
	v_batch_size integer := GREATEST(LEAST(COALESCE(p_batch_size, 1000), 10000), 1);
	v_events_deleted integer := 0;
	v_stream_states_deleted integer := 0;
	v_signals_deleted integer := 0;
	v_input_artifacts_deleted integer := 0;
	v_effects_deleted integer := 0;
BEGIN
	WITH candidates AS (
		SELECT events.id
		FROM public.chat_turn_events events
		JOIN public.chat_turn_runs turns ON turns.id = events.turn_run_id
		WHERE turns.execution_mode = 'worker_realtime'
			AND turns.status IN ('completed', 'failed', 'cancelled')
			AND turns.terminalized_at <= clock_timestamp()
				- make_interval(days => v_terminal_retention_days)
		ORDER BY turns.terminalized_at, events.created_at, events.id
		LIMIT v_batch_size
	)
	DELETE FROM public.chat_turn_events events
	WHERE events.id IN (SELECT id FROM candidates);
	GET DIAGNOSTICS v_events_deleted = ROW_COUNT;

	WITH candidates AS (
		SELECT streams.turn_run_id
		FROM public.chat_turn_stream_state streams
		JOIN public.chat_turn_runs turns ON turns.id = streams.turn_run_id
		WHERE turns.execution_mode = 'worker_realtime'
			AND turns.status IN ('completed', 'failed', 'cancelled')
			AND turns.terminalized_at <= clock_timestamp()
				- make_interval(days => v_terminal_retention_days)
		ORDER BY turns.terminalized_at, streams.turn_run_id
		LIMIT v_batch_size
	)
	DELETE FROM public.chat_turn_stream_state streams
	WHERE streams.turn_run_id IN (SELECT turn_run_id FROM candidates);
	GET DIAGNOSTICS v_stream_states_deleted = ROW_COUNT;

	WITH candidates AS (
		SELECT signals.id
		FROM public.chat_turn_signals signals
		JOIN public.chat_turn_runs turns ON turns.id = signals.turn_run_id
		WHERE turns.execution_mode = 'worker_realtime'
			AND turns.status IN ('completed', 'failed', 'cancelled')
			AND turns.terminalized_at <= clock_timestamp()
				- make_interval(days => v_terminal_retention_days)
		ORDER BY turns.terminalized_at, signals.created_at, signals.id
		LIMIT v_batch_size
	)
	DELETE FROM public.chat_turn_signals signals
	WHERE signals.id IN (SELECT id FROM candidates);
	GET DIAGNOSTICS v_signals_deleted = ROW_COUNT;

	WITH candidates AS (
		SELECT artifacts.id
		FROM public.chat_turn_input_artifacts artifacts
		JOIN public.chat_turn_runs turns ON turns.id = artifacts.turn_run_id
		WHERE turns.execution_mode = 'worker_realtime'
			AND turns.status IN ('completed', 'failed', 'cancelled')
			AND turns.terminalized_at <= clock_timestamp()
				- make_interval(days => v_terminal_retention_days)
			AND artifacts.retain_until <= clock_timestamp()
		ORDER BY GREATEST(turns.terminalized_at, artifacts.retain_until), artifacts.id
		LIMIT v_batch_size
	)
	DELETE FROM public.chat_turn_input_artifacts artifacts
	WHERE artifacts.id IN (SELECT id FROM candidates);
	GET DIAGNOSTICS v_input_artifacts_deleted = ROW_COUNT;

	WITH candidates AS (
		SELECT effects.id
		FROM public.chat_turn_effects effects
		JOIN public.chat_turn_runs turns ON turns.id = effects.turn_run_id
		WHERE turns.execution_mode = 'worker_realtime'
			AND turns.status IN ('completed', 'failed', 'cancelled')
			AND (
				(
					effects.uncertain_reconciled_at IS NULL
					AND effects.state IN ('reserved', 'succeeded', 'failed', 'cancelled')
					AND GREATEST(
						turns.terminalized_at,
						COALESCE(effects.finished_at, effects.updated_at, effects.created_at)
					) <= clock_timestamp() - make_interval(days => v_effect_retention_days)
				)
				OR (
					effects.uncertain_reconciled_at IS NOT NULL
					AND effects.state IN ('succeeded', 'failed')
					AND GREATEST(
						turns.terminalized_at,
						effects.uncertain_reconciled_at
					) <= clock_timestamp()
						- make_interval(days => v_uncertain_effect_retention_days)
				)
			)
		ORDER BY
			COALESCE(effects.uncertain_reconciled_at, effects.updated_at),
			effects.id
		LIMIT v_batch_size
	)
	DELETE FROM public.chat_turn_effects effects
	WHERE effects.id IN (SELECT id FROM candidates);
	GET DIAGNOSTICS v_effects_deleted = ROW_COUNT;

	RETURN jsonb_build_object(
		'turn_events_deleted', v_events_deleted,
		'stream_states_deleted', v_stream_states_deleted,
		'turn_signals_deleted', v_signals_deleted,
		'input_artifacts_deleted', v_input_artifacts_deleted,
		'effects_deleted', v_effects_deleted,
		'terminal_retention_days', v_terminal_retention_days,
		'effect_retention_days', v_effect_retention_days,
		'uncertain_effect_retention_days', v_uncertain_effect_retention_days,
		'batch_size', v_batch_size
	);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_agentic_chat_turn_with_job(p_user_id uuid, p_session_id uuid, p_turn_run_id uuid, p_user_message_id uuid, p_input_artifact_id uuid, p_stream_run_id text, p_client_turn_id text, p_request_hash text, p_request_hash_version text, p_transport_contract_version text, p_transport_decision_id uuid, p_correlation_id uuid, p_context_type text, p_entity_id uuid, p_project_id uuid, p_source text, p_gateway_enabled boolean, p_request_message text, p_request_payload jsonb, p_request_payload_version text, p_user_message_content text, p_user_message_metadata jsonb, p_history_limit integer, p_history_source text, p_artifact_history jsonb, p_artifact_prepared jsonb, p_artifact_content_hash text, p_artifact_history_bytes integer, p_artifact_content_bytes integer, p_prepared_prompt_id uuid, p_prepared_context_payload_sha256 text, p_prepared_surface_profile text, p_session_agent_metadata jsonb, p_capacity_available boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_request_role text;
	v_duplicate public.chat_turn_runs%ROWTYPE;
	v_active public.chat_turn_runs%ROWTYPE;
	v_session public.chat_sessions%ROWTYPE;
	v_prepared public.agentic_chat_prepared_prompts%ROWTYPE;
	v_job public.queue_jobs%ROWTYPE;
	v_now timestamptz := clock_timestamp();
	v_session_created boolean := false;
	v_running_count integer := 0;
	v_queued_count integer := 0;
	v_history_message_ids uuid[] := ARRAY[]::uuid[];
	v_source_history_ids uuid[] := ARRAY[]::uuid[];
	v_message_metadata jsonb;
	v_session_metadata jsonb;
	v_prepared_surface jsonb;
	v_queue_job_id uuid;
	v_conflict_reason text;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_admission_service_role_required'
			USING ERRCODE = '42501';
	END IF;

	IF p_user_id IS NULL
		OR p_turn_run_id IS NULL
		OR p_user_message_id IS NULL
		OR p_input_artifact_id IS NULL
		OR p_transport_decision_id IS NULL
		OR p_correlation_id IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_invalid_identity';
	END IF;
	IF p_stream_run_id IS NULL OR btrim(p_stream_run_id) = ''
		OR length(p_stream_run_id) > 256
		OR p_client_turn_id IS NULL OR btrim(p_client_turn_id) = ''
		OR length(p_client_turn_id) > 256 THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_invalid_client_identity';
	END IF;
	IF p_request_hash IS NULL
		OR p_request_hash !~ '^[0-9a-f]{64}$'
		OR p_request_hash_version <> 'agentic_chat_request_hash_v2' THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_invalid_request_hash';
	END IF;
	IF p_transport_contract_version <> 'agentic_chat_worker_v1'
		OR p_request_payload_version <> 'agentic_chat_request_v1' THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_unsupported_contract';
	END IF;
	IF p_context_type IS NULL OR btrim(p_context_type) = ''
		OR length(p_context_type) > 128
		OR p_source IS NULL OR btrim(p_source) = '' OR length(p_source) > 128
		OR p_gateway_enabled IS NULL
		OR p_request_message IS NULL
		OR p_user_message_content IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_invalid_command';
	END IF;
	IF p_history_limit IS NULL OR p_history_limit < 1 OR p_history_limit > 50 THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_invalid_history_limit';
	END IF;
	IF p_capacity_available IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_invalid_capacity_decision';
	END IF;

	v_message_metadata := COALESCE(p_user_message_metadata, '{}'::jsonb);
	v_session_metadata := COALESCE(p_session_agent_metadata, '{}'::jsonb);
	IF jsonb_typeof(COALESCE(p_request_payload, 'null'::jsonb)) <> 'object'
		OR pg_column_size(p_request_payload) > 262144
		OR jsonb_typeof(v_message_metadata) <> 'object'
		OR pg_column_size(v_message_metadata) > 65536
		OR jsonb_typeof(v_session_metadata) <> 'object'
		OR pg_column_size(v_session_metadata) > 65536 THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_invalid_json_payload';
	END IF;

	IF p_history_source NOT IN ('admission_window', 'prepared_prompt')
		OR jsonb_typeof(COALESCE(p_artifact_history, 'null'::jsonb)) <> 'array'
		OR jsonb_typeof(COALESCE(p_artifact_prepared, 'null'::jsonb)) <> 'object' THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_invalid_input_artifact';
	END IF;
	IF jsonb_array_length(p_artifact_history) > 50
		OR p_artifact_content_hash IS NULL
		OR p_artifact_content_hash !~ '^[0-9a-f]{64}$'
		OR p_artifact_history_bytes IS NULL
		OR p_artifact_history_bytes < 0
		OR p_artifact_history_bytes > 262144
		OR p_artifact_content_bytes IS NULL
		OR p_artifact_content_bytes <= 0
		OR p_artifact_content_bytes > 2097152
		OR p_artifact_history_bytes > p_artifact_content_bytes
		OR pg_column_size(p_artifact_history) + pg_column_size(p_artifact_prepared) > 4194304 THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_invalid_input_artifact';
	END IF;

	IF p_artifact_prepared->>'surfaceProfile' IS NULL
		OR btrim(p_artifact_prepared->>'surfaceProfile') = ''
		OR p_artifact_prepared->>'systemPrompt' IS NULL
		OR jsonb_typeof(COALESCE(p_artifact_prepared->'contextPayload', 'null'::jsonb)) <> 'object'
		OR jsonb_typeof(COALESCE(p_artifact_prepared->'promptSections', 'null'::jsonb)) <> 'array'
		OR jsonb_typeof(COALESCE(p_artifact_prepared->'toolSurface', 'null'::jsonb)) <> 'object' THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_invalid_prepared_artifact';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_artifact_history) AS history_item(value)
		WHERE jsonb_typeof(history_item.value) <> 'object'
			OR history_item.value->>'role' IS NULL
			OR history_item.value->>'role' NOT IN ('user', 'assistant', 'system', 'tool')
			OR history_item.value->>'content' IS NULL
			OR jsonb_typeof(COALESCE(history_item.value->'attachments', 'null'::jsonb)) <> 'array'
			OR jsonb_typeof(COALESCE(history_item.value->'toolCalls', 'null'::jsonb)) <> 'array'
	) THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_invalid_frozen_history';
	END IF;

	BEGIN
		SELECT COALESCE(
			array_agg((history_item.value->>'sourceMessageId')::uuid ORDER BY history_item.ordinality),
			ARRAY[]::uuid[]
		)
		INTO v_source_history_ids
		FROM jsonb_array_elements(p_artifact_history) WITH ORDINALITY AS history_item(value, ordinality)
		WHERE history_item.value->>'sourceMessageId' IS NOT NULL;
	EXCEPTION WHEN invalid_text_representation THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_invalid_history_lineage';
	END;

	-- This lock domain is identical to admit_legacy_agentic_chat_turn. Worker
	-- and legacy admissions therefore cannot pass duplicate/active/capacity
	-- checks concurrently during the canary window.
	PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

	-- A lost response must resolve before pressure, capacity, prompt consumption,
	-- or session creation. Null session means "no assertion" on a retry.
	SELECT turns.*
	INTO v_duplicate
	FROM public.chat_turn_runs turns
	WHERE turns.user_id = p_user_id
		AND turns.client_turn_id = p_client_turn_id
	LIMIT 1;

	IF FOUND THEN
		v_conflict_reason := CASE
			WHEN p_session_id IS NOT NULL
				AND v_duplicate.session_id IS DISTINCT FROM p_session_id THEN 'session_mismatch'
			WHEN v_duplicate.request_hash IS NULL
				OR v_duplicate.request_hash_version IS NULL THEN 'existing_turn_missing_request_hash'
			WHEN v_duplicate.request_hash_version <> p_request_hash_version THEN 'request_hash_version_mismatch'
			WHEN v_duplicate.request_hash <> p_request_hash THEN 'request_hash_mismatch'
			ELSE NULL
		END;

		RETURN jsonb_build_object(
			'outcome', CASE WHEN v_conflict_reason IS NULL
				THEN 'matching_duplicate' ELSE 'idempotency_conflict' END,
			'conflict_reason', v_conflict_reason,
			'execution_may_start', false,
			'turn_run_id', v_duplicate.id,
			'session_id', v_duplicate.session_id,
			'user_message_id', v_duplicate.user_message_id,
			'input_artifact_id', v_duplicate.input_artifact_id,
			'queue_job_id', v_duplicate.queue_job_id,
			'correlation_id', v_duplicate.correlation_id,
			'stream_run_id', v_duplicate.stream_run_id,
			'client_turn_id', v_duplicate.client_turn_id,
			'execution_mode', v_duplicate.execution_mode,
			'status', v_duplicate.status
		);
	END IF;

	SELECT
		count(*) FILTER (WHERE turns.status = 'running'),
		count(*) FILTER (WHERE turns.status = 'queued')
	INTO v_running_count, v_queued_count
	FROM public.chat_turn_runs turns
	WHERE turns.user_id = p_user_id
		AND turns.execution_mode = 'worker_realtime'
		AND turns.status IN ('queued', 'running');

	IF v_queued_count >= 100 THEN
		RETURN jsonb_build_object(
			'outcome', 'capacity_exceeded',
			'execution_may_start', false,
			'capacity_reason', 'max_queued',
			'retry_after_seconds', 30,
			'running_count', v_running_count,
			'queued_count', v_queued_count
		);
	END IF;

	IF p_session_id IS NOT NULL THEN
		SELECT sessions.*
		INTO v_session
		FROM public.chat_sessions sessions
		WHERE sessions.id = p_session_id
			AND sessions.user_id = p_user_id
		FOR KEY SHARE;

		IF NOT FOUND THEN
			RAISE EXCEPTION 'agentic_chat_session_not_owned';
		END IF;
		IF v_session.context_type IS DISTINCT FROM p_context_type
			OR v_session.entity_id IS DISTINCT FROM p_entity_id THEN
			RAISE EXCEPTION 'agentic_chat_worker_admission_session_scope_mismatch';
		END IF;
	ELSIF p_context_type = 'daily_brief' AND p_entity_id IS NOT NULL THEN
		-- The per-user admission lock makes this canonical lookup/create race-safe.
		SELECT sessions.*
		INTO v_session
		FROM public.chat_sessions sessions
		WHERE sessions.user_id = p_user_id
			AND sessions.context_type = 'daily_brief'
			AND sessions.entity_id = p_entity_id
			AND sessions.status = 'active'
		ORDER BY sessions.updated_at DESC, sessions.created_at DESC, sessions.id DESC
		LIMIT 1
		FOR UPDATE;
	END IF;

	IF v_session.id IS NULL THEN
		BEGIN
			INSERT INTO public.chat_sessions (
				user_id,
				context_type,
				entity_id,
				status,
				agent_metadata
			) VALUES (
				p_user_id,
				p_context_type,
				p_entity_id,
				'active',
				v_session_metadata
			)
			RETURNING * INTO v_session;
			v_session_created := true;
		EXCEPTION WHEN unique_violation THEN
			IF p_context_type <> 'daily_brief' OR p_entity_id IS NULL THEN
				RAISE;
			END IF;

			SELECT sessions.*
			INTO v_session
			FROM public.chat_sessions sessions
			WHERE sessions.user_id = p_user_id
				AND sessions.context_type = 'daily_brief'
				AND sessions.entity_id = p_entity_id
				AND sessions.status = 'active'
			LIMIT 1
			FOR UPDATE;
			IF NOT FOUND THEN
				RAISE;
			END IF;
			v_session_created := false;
		END;
	END IF;

	SELECT turns.*
	INTO v_active
	FROM public.chat_turn_runs turns
	WHERE turns.session_id = v_session.id
		AND turns.user_id = p_user_id
		AND turns.status IN ('queued', 'running')
	ORDER BY turns.created_at DESC, turns.id DESC
	LIMIT 1
	FOR UPDATE;

	IF FOUND THEN
		RETURN jsonb_build_object(
			'outcome', 'active_turn_conflict',
			'execution_may_start', false,
			'turn_run_id', v_active.id,
			'session_id', v_active.session_id,
			'user_message_id', v_active.user_message_id,
			'input_artifact_id', v_active.input_artifact_id,
			'queue_job_id', v_active.queue_job_id,
			'correlation_id', v_active.correlation_id,
			'stream_run_id', v_active.stream_run_id,
			'client_turn_id', v_active.client_turn_id,
			'execution_mode', v_active.execution_mode,
			'status', v_active.status
		);
	END IF;

	-- A brand-new inline session has no mutable history or prepared-prompt row.
	-- It may still carry freshly built trusted prepared inputs with null lineage.
	IF v_session_created AND (
		p_history_source <> 'admission_window'
		OR jsonb_array_length(p_artifact_history) <> 0
		OR cardinality(v_source_history_ids) <> 0
		OR p_prepared_prompt_id IS NOT NULL
	) THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_inline_session_input_mismatch';
	END IF;

	IF p_history_source = 'admission_window' THEN
		WITH newest_messages AS (
			SELECT messages.id, messages.role, messages.created_at
			FROM public.chat_messages messages
			WHERE messages.session_id = v_session.id
				AND messages.user_id = p_user_id
			ORDER BY messages.created_at DESC, messages.id DESC
			LIMIT p_history_limit
		), allowed_messages AS (
			SELECT *
			FROM newest_messages
			WHERE role IN ('user', 'assistant', 'system', 'tool')
		)
		SELECT COALESCE(
			array_agg(id ORDER BY created_at ASC, id ASC),
			ARRAY[]::uuid[]
		)
		INTO v_history_message_ids
		FROM allowed_messages;

		IF cardinality(v_history_message_ids) > 0 THEN
			PERFORM 1
			FROM public.chat_messages messages
			WHERE messages.id = ANY(v_history_message_ids)
				AND messages.session_id = v_session.id
				AND messages.user_id = p_user_id
			FOR SHARE;
		END IF;

		IF EXISTS (
			SELECT 1
			FROM unnest(v_source_history_ids) AS source_id(id)
			WHERE NOT (source_id.id = ANY(v_history_message_ids))
		) THEN
			RAISE EXCEPTION 'agentic_chat_worker_admission_history_lineage_mismatch';
		END IF;
	ELSIF cardinality(v_source_history_ids) <> 0 THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_prepared_history_claims_message_lineage';
	END IF;

	IF p_prepared_prompt_id IS NULL THEN
		IF p_prepared_context_payload_sha256 IS NOT NULL
			OR p_prepared_surface_profile IS NOT NULL
			OR p_artifact_prepared->>'sourcePreparedPromptId' IS NOT NULL THEN
			RAISE EXCEPTION 'agentic_chat_worker_admission_unexpected_prepared_lineage';
		END IF;
	ELSIF p_history_source <> 'prepared_prompt' THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_prepared_history_source_required';
	ELSE
		SELECT prepared.*
		INTO v_prepared
		FROM public.agentic_chat_prepared_prompts prepared
		WHERE prepared.id = p_prepared_prompt_id
		FOR UPDATE;

		IF NOT FOUND
			OR v_prepared.user_id IS DISTINCT FROM p_user_id
			OR (v_prepared.session_id IS NOT NULL
				AND v_prepared.session_id IS DISTINCT FROM v_session.id)
			OR v_prepared.context_type IS DISTINCT FROM p_context_type
			OR v_prepared.entity_id IS DISTINCT FROM p_entity_id
			OR v_prepared.project_id IS DISTINCT FROM p_project_id THEN
			RAISE EXCEPTION 'agentic_chat_worker_admission_prepared_scope_mismatch';
		END IF;
		IF v_prepared.consumed_at IS NOT NULL THEN
			RAISE EXCEPTION 'agentic_chat_worker_admission_prepared_already_consumed';
		END IF;
		IF v_prepared.expires_at <= v_now THEN
			RAISE EXCEPTION 'agentic_chat_worker_admission_prepared_expired';
		END IF;
		IF p_prepared_context_payload_sha256 IS NULL
			OR p_prepared_context_payload_sha256 !~ '^[0-9a-f]{64}$'
			OR v_prepared.context_payload_sha256 IS DISTINCT FROM p_prepared_context_payload_sha256
			OR p_prepared_surface_profile IS NULL
			OR btrim(p_prepared_surface_profile) = '' THEN
			RAISE EXCEPTION 'agentic_chat_worker_admission_prepared_integrity_mismatch';
		END IF;

		v_prepared_surface := v_prepared.prepared_surfaces->p_prepared_surface_profile;
		IF jsonb_typeof(COALESCE(v_prepared_surface, 'null'::jsonb)) <> 'object'
			OR v_prepared_surface->>'surface_profile' IS DISTINCT FROM p_prepared_surface_profile
			OR COALESCE(v_prepared_surface->>'system_prompt', '') = ''
			OR COALESCE(v_prepared_surface->>'system_prompt_sha256', '') !~ '^[0-9a-f]{64}$'
			OR v_prepared_surface->>'system_prompt_sha256' IS DISTINCT FROM encode(
				extensions.digest(convert_to(v_prepared_surface->>'system_prompt', 'UTF8'), 'sha256'),
				'hex'
			)
			OR jsonb_typeof(
				COALESCE(p_artifact_prepared->'sourcePreparedSurface', 'null'::jsonb)
			) <> 'object'
			OR p_artifact_prepared#>>'{sourcePreparedSurface,systemPromptSha256}'
				IS DISTINCT FROM v_prepared_surface->>'system_prompt_sha256'
			OR jsonb_typeof(
				COALESCE(
					p_artifact_prepared#>'{sourcePreparedSurface,promptSections}',
					'null'::jsonb
				)
			) <> 'array'
			OR COALESCE(v_prepared_surface->'sections', '[]'::jsonb)
				IS DISTINCT FROM p_artifact_prepared#>'{sourcePreparedSurface,promptSections}'
			OR jsonb_typeof(COALESCE(p_artifact_prepared->'systemPrompt', 'null'::jsonb))
				<> 'string'
			OR jsonb_typeof(COALESCE(p_artifact_prepared->'promptSections', 'null'::jsonb))
				<> 'array'
			OR (
				p_artifact_prepared->>'systemPrompt'
					IS DISTINCT FROM v_prepared_surface->>'system_prompt'
				AND strpos(
					p_artifact_prepared->>'systemPrompt',
					(v_prepared_surface->>'system_prompt') || E'\n\n'
				) <> 1
			)
			OR EXISTS (
				SELECT 1
				FROM jsonb_array_elements(
					COALESCE(v_prepared_surface->'sections', '[]'::jsonb)
				) WITH ORDINALITY AS source_section(value, position)
				WHERE p_artifact_prepared->'promptSections'->((source_section.position - 1)::integer)
					IS DISTINCT FROM source_section.value
			)
			OR p_artifact_prepared->>'sourcePreparedPromptId'
				IS DISTINCT FROM p_prepared_prompt_id::text
			OR p_artifact_prepared->>'surfaceProfile'
				IS DISTINCT FROM p_prepared_surface_profile
			OR p_artifact_prepared->'contextPayload'
				IS DISTINCT FROM v_prepared.context_payload
			OR COALESCE(p_artifact_prepared->'conversationSummary', 'null'::jsonb)
				IS DISTINCT FROM COALESCE(to_jsonb(v_prepared.conversation_summary), 'null'::jsonb) THEN
			RAISE EXCEPTION 'agentic_chat_worker_admission_prepared_copy_mismatch';
		END IF;

		UPDATE public.agentic_chat_prepared_prompts prepared
		SET consumed_at = v_now,
			updated_at = v_now
		WHERE prepared.id = v_prepared.id
			AND prepared.consumed_at IS NULL;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'agentic_chat_worker_admission_prepared_claim_lost';
		END IF;
	END IF;

	-- Insert the turn with nullable links first to break the intentional
	-- turn<->artifact relationship cycle; both links are filled below in the
	-- same transaction and the deferred scope trigger validates the result.
	INSERT INTO public.chat_turn_runs (
		id,
		session_id,
		user_id,
		stream_run_id,
		client_turn_id,
		source,
		context_type,
		entity_id,
		project_id,
		gateway_enabled,
		request_message,
		status,
		request_prewarmed_context,
		started_at,
		request_hash,
		request_hash_version,
		execution_mode,
		request_payload,
		request_payload_version,
		transport_contract_version,
		transport_decision_id,
		correlation_id,
		execution_generation,
		history_cutoff_at,
		history_message_ids,
		stale_context_policy,
		prepared_prompt_id,
		prepared_prompt_hit,
		prepared_surface_profile
	) VALUES (
		p_turn_run_id,
		v_session.id,
		p_user_id,
		p_stream_run_id,
		p_client_turn_id,
		p_source,
		p_context_type,
		p_entity_id,
		p_project_id,
		p_gateway_enabled,
		p_request_message,
		'queued',
		p_prepared_prompt_id IS NOT NULL,
		v_now,
		p_request_hash,
		p_request_hash_version,
		'worker_realtime',
		p_request_payload,
		p_request_payload_version,
		p_transport_contract_version,
		p_transport_decision_id,
		p_correlation_id,
		0,
		v_now,
		v_history_message_ids,
		'fail_after_max_queue_residence',
		p_prepared_prompt_id,
		p_prepared_prompt_id IS NOT NULL,
		p_prepared_surface_profile
	);

	INSERT INTO public.chat_turn_input_artifacts (
		id,
		turn_run_id,
		session_id,
		user_id,
		source_prepared_prompt_id,
		artifact_version,
		history_source,
		history,
		prepared,
		content_hash,
		history_bytes,
		content_bytes,
		created_at,
		retain_until
	) VALUES (
		p_input_artifact_id,
		p_turn_run_id,
		v_session.id,
		p_user_id,
		p_prepared_prompt_id,
		'agentic_chat_input_v2',
		p_history_source,
		p_artifact_history,
		p_artifact_prepared,
		p_artifact_content_hash,
		p_artifact_history_bytes,
		p_artifact_content_bytes,
		v_now,
		v_now + interval '7 days'
	);

	v_message_metadata := v_message_metadata || jsonb_build_object(
		'idempotency_key', 'chat-turn:' || p_turn_run_id::text || ':user'
	);
	INSERT INTO public.chat_messages (
		id,
		session_id,
		user_id,
		role,
		content,
		metadata
	) VALUES (
		p_user_message_id,
		v_session.id,
		p_user_id,
		'user',
		p_user_message_content,
		v_message_metadata
	);

	v_queue_job_id := public.add_queue_job(
		p_user_id,
		'agentic_chat_turn',
		jsonb_build_object(
			'turnRunId', p_turn_run_id,
			'correlationId', p_correlation_id
		),
		1,
		v_now,
		'agentic-chat-turn:' || p_turn_run_id::text
	);

	SELECT jobs.*
	INTO v_job
	FROM public.queue_jobs jobs
	WHERE jobs.id = v_queue_job_id
	FOR UPDATE;
	IF NOT FOUND
		OR v_job.user_id IS DISTINCT FROM p_user_id
		OR v_job.job_type::text <> 'agentic_chat_turn'
		OR v_job.status::text NOT IN ('pending', 'processing')
		OR v_job.dedup_key IS DISTINCT FROM 'agentic-chat-turn:' || p_turn_run_id::text
		OR v_job.metadata->>'turnRunId' IS DISTINCT FROM p_turn_run_id::text
		OR v_job.metadata->>'correlationId' IS DISTINCT FROM p_correlation_id::text THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_queue_relationship_mismatch';
	END IF;

	UPDATE public.chat_turn_runs turns
	SET user_message_id = p_user_message_id,
		input_artifact_id = p_input_artifact_id,
		queue_job_id = v_queue_job_id,
		updated_at = v_now
	WHERE turns.id = p_turn_run_id
		AND turns.user_id = p_user_id
		AND turns.status = 'queued'
		AND turns.execution_generation = 0;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_turn_link_failed';
	END IF;

	RETURN jsonb_build_object(
		'outcome', 'newly_admitted',
		'execution_may_start', false,
		'turn_run_id', p_turn_run_id,
		'session_id', v_session.id,
		'session_created', v_session_created,
		'user_message_id', p_user_message_id,
		'input_artifact_id', p_input_artifact_id,
		'queue_job_id', v_queue_job_id,
		'correlation_id', p_correlation_id,
		'stream_run_id', p_stream_run_id,
		'client_turn_id', p_client_turn_id,
		'execution_mode', 'worker_realtime',
		'status', 'queued'
	);
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_agentic_chat_control_row_retention()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_status text;
	v_terminal_at timestamptz;
BEGIN
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
$function$;

CREATE OR REPLACE FUNCTION public.enforce_agentic_chat_effect_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
	IF TG_OP = 'INSERT' THEN
		IF NEW.state <> 'reserved'
			OR NEW.started_at IS NOT NULL
			OR NEW.finished_at IS NOT NULL
			OR NEW.downstream_receipt IS NOT NULL THEN
			RAISE EXCEPTION 'agentic_chat_effect_must_start_reserved';
		END IF;
		RETURN NEW;
	END IF;

	IF NEW.id IS DISTINCT FROM OLD.id
		OR NEW.turn_run_id IS DISTINCT FROM OLD.turn_run_id
		OR NEW.session_id IS DISTINCT FROM OLD.session_id
		OR NEW.user_id IS DISTINCT FROM OLD.user_id
		OR NEW.execution_generation IS DISTINCT FROM OLD.execution_generation
		OR NEW.tool_name IS DISTINCT FROM OLD.tool_name
		OR NEW.operation_name IS DISTINCT FROM OLD.operation_name
		OR NEW.canonical_argument_hash IS DISTINCT FROM OLD.canonical_argument_hash
		OR NEW.reserved_at IS DISTINCT FROM OLD.reserved_at
		OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
		RAISE EXCEPTION 'agentic_chat_effect_identity_is_immutable';
	END IF;

	IF OLD.started_at IS NOT NULL AND NEW.started_at IS DISTINCT FROM OLD.started_at THEN
		RAISE EXCEPTION 'agentic_chat_effect_started_at_is_immutable';
	END IF;

	IF OLD.finished_at IS NOT NULL AND NEW.finished_at IS DISTINCT FROM OLD.finished_at THEN
		RAISE EXCEPTION 'agentic_chat_effect_finished_at_is_immutable';
	END IF;

	IF OLD.state IN ('succeeded', 'failed', 'cancelled') THEN
		RAISE EXCEPTION 'agentic_chat_effect_terminal_is_immutable';
	END IF;

	IF NOT (
		(OLD.state = 'reserved' AND NEW.state IN ('reserved', 'started', 'cancelled'))
		OR (OLD.state = 'started' AND NEW.state IN ('started', 'succeeded', 'failed', 'uncertain'))
		OR (OLD.state = 'uncertain' AND NEW.state IN ('uncertain', 'succeeded', 'failed'))
	) THEN
		RAISE EXCEPTION 'agentic_chat_effect_invalid_transition:%->%', OLD.state, NEW.state;
	END IF;

	NEW.updated_at := now();
	RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_agentic_chat_turn(p_turn_run_id uuid, p_user_id uuid, p_queue_job_id uuid, p_processing_token uuid, p_execution_generation integer, p_status text, p_finished_reason text, p_failure_code text, p_assistant_message_id uuid, p_assistant_text text, p_assistant_metadata jsonb, p_prompt_tokens integer, p_completion_tokens integer, p_total_tokens integer, p_projection jsonb, p_event_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_request_role text;
	v_turn public.chat_turn_runs%ROWTYPE;
	v_job public.queue_jobs%ROWTYPE;
	v_stream public.chat_turn_stream_state%ROWTYPE;
	v_message public.chat_messages%ROWTYPE;
	v_now timestamptz;
	v_should_persist_message boolean;
	v_message_id uuid;
	v_message_metadata jsonb;
	v_tool_round_count integer;
	v_tool_call_count integer;
	v_authoritative_message_metadata jsonb;
	v_projection jsonb;
	v_event_payload jsonb;
	v_terminal_sequence integer;
	v_terminal_event_id text;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_finalize_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL OR p_user_id IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_finalize_invalid_identity';
	END IF;

	-- Turn is the first lock in every worker-owned control-plane primitive.
	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_finalize_turn_not_found';
	END IF;
	IF v_turn.user_id IS DISTINCT FROM p_user_id
		OR v_turn.execution_mode <> 'worker_realtime' THEN
		RAISE EXCEPTION 'agentic_chat_finalize_turn_relationship_mismatch';
	END IF;

	-- A lost successful response resolves from immutable terminal truth before
	-- any stale ownership token or changed payload is considered.
	IF v_turn.status IN ('completed', 'failed', 'cancelled') THEN
		IF v_turn.terminal_event_id IS NULL OR v_turn.terminalized_at IS NULL THEN
			RAISE EXCEPTION 'agentic_chat_finalize_terminal_receipt_corrupt';
		END IF;
		RETURN jsonb_build_object(
			'outcome', 'already_terminal',
			'turn_run_id', v_turn.id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'queue_job_id', v_turn.queue_job_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status,
			'finished_reason', v_turn.finished_reason,
			'failure_code', v_turn.failure_code,
			'assistant_message_id', v_turn.assistant_message_id,
			'terminal_event_id', v_turn.terminal_event_id,
			'terminal_sequence_index', v_turn.last_event_sequence,
			'terminalized_at', v_turn.terminalized_at
		);
	END IF;

	IF p_queue_job_id IS NULL
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id
		OR p_execution_generation IS NULL
		OR p_execution_generation < 0 THEN
		RAISE EXCEPTION 'agentic_chat_finalize_invalid_ownership';
	END IF;

	IF v_turn.execution_generation IS DISTINCT FROM p_execution_generation THEN
		RETURN jsonb_build_object(
			'outcome', 'stale_generation',
			'turn_run_id', v_turn.id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'queue_job_id', v_turn.queue_job_id,
			'requested_execution_generation', p_execution_generation,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status
		);
	END IF;

	IF p_status IS NULL
		OR p_status NOT IN ('completed', 'failed', 'cancelled') THEN
		RAISE EXCEPTION 'agentic_chat_finalize_invalid_terminal_status';
	END IF;
	IF p_finished_reason IS NULL OR btrim(p_finished_reason) = ''
		OR length(p_finished_reason) > 256
		OR (p_failure_code IS NOT NULL AND (
			btrim(p_failure_code) = '' OR length(p_failure_code) > 128
		)) THEN
		RAISE EXCEPTION 'agentic_chat_finalize_invalid_reason';
	END IF;
	IF p_status = 'completed' AND p_failure_code IS NOT NULL
		OR p_status = 'failed' AND p_failure_code IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_finalize_invalid_failure_code';
	END IF;

	IF v_turn.status = 'queued' THEN
		IF p_status <> 'cancelled' THEN
			RAISE EXCEPTION 'agentic_chat_finalize_invalid_predecessor';
		END IF;
	ELSIF v_turn.status = 'running' THEN
		IF v_turn.cancel_requested_at IS NOT NULL AND p_status <> 'cancelled' THEN
			RETURN jsonb_build_object(
				'outcome', 'cancel_requested',
				'turn_run_id', v_turn.id,
				'session_id', v_turn.session_id,
				'user_id', v_turn.user_id,
				'queue_job_id', v_turn.queue_job_id,
				'execution_generation', v_turn.execution_generation,
				'status', v_turn.status,
				'cancel_requested_at', v_turn.cancel_requested_at,
				'cancel_reason', v_turn.cancel_reason
			);
		END IF;
	ELSE
		RAISE EXCEPTION 'agentic_chat_finalize_invalid_predecessor';
	END IF;
	IF p_status = 'cancelled' AND v_turn.cancel_requested_at IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_finalize_cancel_not_requested';
	END IF;

	IF p_assistant_text IS NULL
		OR octet_length(p_assistant_text) > 2097152 THEN
		RAISE EXCEPTION 'agentic_chat_finalize_invalid_assistant_text';
	END IF;
	v_should_persist_message := p_status = 'completed'
		OR (p_status = 'cancelled' AND p_assistant_text <> '');
	IF v_should_persist_message AND p_assistant_message_id IS NULL
		OR NOT v_should_persist_message AND p_assistant_message_id IS NOT NULL THEN
		RAISE EXCEPTION 'agentic_chat_finalize_invalid_assistant_message';
	END IF;

	v_message_metadata := COALESCE(p_assistant_metadata, '{}'::jsonb);
	IF (v_message_metadata ? 'tool_round_count' AND (
		jsonb_typeof(v_message_metadata->'tool_round_count') <> 'number'
		OR v_message_metadata->>'tool_round_count' !~ '^[0-9]+$'
		OR length(v_message_metadata->>'tool_round_count') > 4
	)) OR (v_message_metadata ? 'tool_call_count' AND (
		jsonb_typeof(v_message_metadata->'tool_call_count') <> 'number'
		OR v_message_metadata->>'tool_call_count' !~ '^[0-9]+$'
		OR length(v_message_metadata->>'tool_call_count') > 4
	)) THEN
		RAISE EXCEPTION 'agentic_chat_finalize_invalid_tool_counts';
	END IF;
	SELECT count(*)::integer
	INTO v_tool_call_count
	FROM public.chat_tool_executions executions
	WHERE executions.turn_run_id = v_turn.id;
	IF v_tool_call_count > 1024 THEN
		RAISE EXCEPTION 'agentic_chat_finalize_invalid_tool_counts';
	END IF;
	IF v_tool_call_count = 0 THEN
		v_tool_round_count := COALESCE((v_message_metadata->>'tool_round_count')::integer, 0);
		IF v_tool_round_count <> 0 THEN
			RAISE EXCEPTION 'agentic_chat_finalize_invalid_tool_counts';
		END IF;
	ELSIF NOT (v_message_metadata ? 'tool_round_count') THEN
		RAISE EXCEPTION 'agentic_chat_finalize_invalid_tool_counts';
	ELSE
		v_tool_round_count := (v_message_metadata->>'tool_round_count')::integer;
		IF v_tool_round_count > v_tool_call_count THEN
			RAISE EXCEPTION 'agentic_chat_finalize_invalid_tool_counts';
		ELSIF v_tool_round_count = 0 THEN
			-- A cancelled/failed worker may lose the response to the fenced ledger
			-- write that committed immediately before interruption. Completion has
			-- no such ambiguity and must always carry the exact executor count.
			IF p_status = 'completed' THEN
				RAISE EXCEPTION 'agentic_chat_finalize_invalid_tool_counts';
			END IF;
			v_tool_round_count := 1;
		END IF;
	END IF;
	v_message_metadata := v_message_metadata || jsonb_build_object(
		'tool_round_count', v_tool_round_count,
		'tool_call_count', v_tool_call_count
	);
	v_projection := COALESCE(p_projection, '{}'::jsonb);
	v_event_payload := COALESCE(p_event_payload, '{}'::jsonb);
	IF jsonb_typeof(v_message_metadata) <> 'object'
		OR jsonb_typeof(v_projection) <> 'object'
		OR jsonb_typeof(v_event_payload) <> 'object'
		OR pg_column_size(v_message_metadata) > 65536
		OR pg_column_size(v_projection) > 524288
		OR pg_column_size(v_event_payload) > 262144 THEN
		RAISE EXCEPTION 'agentic_chat_finalize_invalid_json_payload';
	END IF;

	IF COALESCE(p_prompt_tokens, 0) < 0
		OR COALESCE(p_completion_tokens, 0) < 0
		OR COALESCE(p_total_tokens, 0) < 0
		OR (
			p_prompt_tokens IS NOT NULL
			AND p_completion_tokens IS NOT NULL
			AND p_total_tokens IS NOT NULL
			AND p_total_tokens::bigint
				<> p_prompt_tokens::bigint + p_completion_tokens::bigint
		)
		OR (
			NOT v_should_persist_message
			AND (
				p_prompt_tokens IS NOT NULL
				OR p_completion_tokens IS NOT NULL
				OR p_total_tokens IS NOT NULL
			)
		) THEN
		RAISE EXCEPTION 'agentic_chat_finalize_invalid_token_usage';
	END IF;

	SELECT jobs.*
	INTO v_job
	FROM public.queue_jobs jobs
	WHERE jobs.id = p_queue_job_id
	FOR UPDATE;

	IF NOT FOUND
		OR v_job.user_id IS DISTINCT FROM v_turn.user_id
		OR v_job.job_type::text <> 'agentic_chat_turn'
		OR v_job.dedup_key IS DISTINCT FROM 'agentic-chat-turn:' || v_turn.id::text
		OR v_job.metadata->>'turnRunId' IS DISTINCT FROM v_turn.id::text
		OR v_job.metadata->>'correlationId' IS DISTINCT FROM v_turn.correlation_id::text THEN
		RAISE EXCEPTION 'agentic_chat_finalize_ownership_lost';
	END IF;

	IF v_turn.status = 'queued' THEN
		IF p_processing_token IS NOT NULL
			OR v_job.status::text NOT IN ('pending', 'retrying', 'processing') THEN
			RAISE EXCEPTION 'agentic_chat_finalize_ownership_lost';
		END IF;
	ELSE
		IF p_processing_token IS NULL
			OR v_job.status::text <> 'processing'
			OR v_job.processing_token IS DISTINCT FROM p_processing_token THEN
			RAISE EXCEPTION 'agentic_chat_finalize_ownership_lost';
		END IF;
	END IF;
	v_now := transaction_timestamp();

	IF v_turn.last_event_sequence = 2147483647 THEN
		RAISE EXCEPTION 'agentic_chat_finalize_sequence_exhausted';
	END IF;
	v_terminal_sequence := v_turn.last_event_sequence + 1;
	v_terminal_event_id := v_turn.id::text
		|| ':' || v_turn.execution_generation::text
		|| ':' || v_terminal_sequence::text;

	IF v_should_persist_message THEN
		v_authoritative_message_metadata := jsonb_build_object(
			'idempotency_key', 'chat-turn:' || v_turn.id::text || ':assistant',
			'turn_run_id', v_turn.id,
			'execution_generation', v_turn.execution_generation,
			'finished_reason', p_finished_reason,
			'terminal_status', p_status,
			'interrupted', p_status IN ('failed', 'cancelled'),
			'partial', p_status IN ('failed', 'cancelled')
		);
		v_message_metadata := v_message_metadata || v_authoritative_message_metadata;
		IF pg_column_size(v_message_metadata) > 65536 THEN
			RAISE EXCEPTION 'agentic_chat_finalize_invalid_json_payload';
		END IF;

		SELECT messages.*
		INTO v_message
		FROM public.chat_messages messages
		WHERE messages.session_id = v_turn.session_id
			AND messages.metadata->>'idempotency_key'
				= 'chat-turn:' || v_turn.id::text || ':assistant'
		LIMIT 1
		FOR UPDATE;

		IF NOT FOUND THEN
			INSERT INTO public.chat_messages (
					id,
					session_id,
					user_id,
					role,
					content,
					metadata,
					prompt_tokens,
					completion_tokens,
					total_tokens,
					created_at
				) VALUES (
					p_assistant_message_id,
					v_turn.session_id,
					v_turn.user_id,
					'assistant',
					p_assistant_text,
					v_message_metadata,
					p_prompt_tokens,
					p_completion_tokens,
					p_total_tokens,
					v_now
				)
				ON CONFLICT DO NOTHING
				RETURNING * INTO v_message;

			IF NOT FOUND THEN
				-- A concurrent writer may have won the idempotency or primary-key
				-- race after the first lookup. Resolve and validate the canonical
				-- idempotency row inside this same terminal transaction.
				SELECT messages.*
				INTO v_message
				FROM public.chat_messages messages
				WHERE messages.session_id = v_turn.session_id
					AND messages.metadata->>'idempotency_key'
						= 'chat-turn:' || v_turn.id::text || ':assistant'
				LIMIT 1
				FOR UPDATE;
			END IF;
		END IF;

		IF NOT FOUND
			OR v_message.user_id IS DISTINCT FROM v_turn.user_id
			OR v_message.role <> 'assistant'
			OR v_message.content IS DISTINCT FROM p_assistant_text
			OR v_message.prompt_tokens IS DISTINCT FROM p_prompt_tokens
			OR v_message.completion_tokens IS DISTINCT FROM p_completion_tokens
			OR v_message.total_tokens IS DISTINCT FROM p_total_tokens
			OR NOT COALESCE(v_message.metadata, '{}'::jsonb)
				@> v_authoritative_message_metadata THEN
			RAISE EXCEPTION 'agentic_chat_finalize_assistant_message_conflict';
		END IF;
		v_message_id := v_message.id;
		UPDATE public.chat_tool_executions executions
		SET message_id = v_message_id
		WHERE executions.turn_run_id = v_turn.id
			AND executions.session_id = v_turn.session_id
			AND executions.message_id IS NULL;
	END IF;

	v_projection := v_projection || jsonb_build_object(
		'terminal', jsonb_build_object(
			'eventId', v_terminal_event_id,
			'sequenceIndex', v_terminal_sequence,
			'status', p_status,
			'finishedReason', p_finished_reason,
			'failureCode', p_failure_code,
			'assistantMessageId', v_message_id
		)
	);
	v_event_payload := v_event_payload || jsonb_build_object(
		'type', 'done',
		'status', p_status,
		'finished_reason', p_finished_reason,
		'failure_code', p_failure_code,
		'assistant_message_id', v_message_id
	);
	IF pg_column_size(v_projection) > 524288
		OR pg_column_size(v_event_payload) > 262144 THEN
		RAISE EXCEPTION 'agentic_chat_finalize_invalid_json_payload';
	END IF;

	SELECT streams.*
	INTO v_stream
	FROM public.chat_turn_stream_state streams
	WHERE streams.turn_run_id = v_turn.id
	FOR UPDATE;

	IF v_turn.status = 'running' AND (
		NOT FOUND
		OR v_stream.session_id IS DISTINCT FROM v_turn.session_id
		OR v_stream.user_id IS DISTINCT FROM v_turn.user_id
		OR v_stream.execution_generation IS DISTINCT FROM v_turn.execution_generation
	) THEN
		RAISE EXCEPTION 'agentic_chat_finalize_current_generation_corrupt';
	END IF;

	INSERT INTO public.chat_turn_stream_state (
		turn_run_id,
		session_id,
		user_id,
		execution_generation,
		snapshot_sequence,
		durable_through_sequence,
		projection_durable_sequence,
		assistant_text,
		projection,
		reconcile_required,
		created_at,
		updated_at
	) VALUES (
		v_turn.id,
		v_turn.session_id,
		v_turn.user_id,
		v_turn.execution_generation,
		v_terminal_sequence,
		v_terminal_sequence,
		v_terminal_sequence,
		p_assistant_text,
		v_projection,
		true,
		v_now,
		v_now
	)
	ON CONFLICT (turn_run_id) DO UPDATE
	SET snapshot_sequence = EXCLUDED.snapshot_sequence,
		durable_through_sequence = EXCLUDED.durable_through_sequence,
		projection_durable_sequence = EXCLUDED.projection_durable_sequence,
		assistant_text = EXCLUDED.assistant_text,
		projection = EXCLUDED.projection,
		reconcile_required = true,
		updated_at = EXCLUDED.updated_at;

	INSERT INTO public.chat_turn_events (
		turn_run_id,
		session_id,
		user_id,
		stream_run_id,
		execution_generation,
		sequence_index,
		event_id,
		phase,
		event_type,
		payload,
		created_at
	) VALUES (
		v_turn.id,
		v_turn.session_id,
		v_turn.user_id,
		v_turn.stream_run_id,
		v_turn.execution_generation,
		v_terminal_sequence,
		v_terminal_event_id,
		'finalize',
		'done',
		v_event_payload,
		v_now
	);

	IF v_turn.status = 'queued' THEN
		UPDATE public.queue_jobs jobs
		SET status = 'cancelled',
			processing_token = NULL,
			completed_at = v_now,
			error_message = COALESCE(jobs.error_message, 'Agentic chat turn cancelled before claim'),
			updated_at = v_now
		WHERE jobs.id = v_job.id;
	END IF;

	UPDATE public.chat_turn_runs turns
	SET status = p_status,
		assistant_message_id = v_message_id,
		tool_round_count = v_tool_round_count,
		tool_call_count = v_tool_call_count,
		finished_reason = p_finished_reason,
		failure_code = p_failure_code,
		finished_at = v_now,
		terminal_event_id = v_terminal_event_id,
		terminalized_at = v_now,
		last_event_sequence = v_terminal_sequence,
		last_progress_at = v_now,
		updated_at = v_now
	WHERE turns.id = v_turn.id
		AND turns.status = v_turn.status
		AND turns.execution_generation = v_turn.execution_generation;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_finalize_compare_and_set_lost';
	END IF;

	RETURN jsonb_build_object(
		'outcome', 'finalized',
		'turn_run_id', v_turn.id,
		'session_id', v_turn.session_id,
		'user_id', v_turn.user_id,
		'queue_job_id', v_turn.queue_job_id,
		'execution_generation', v_turn.execution_generation,
		'status', p_status,
		'finished_reason', p_finished_reason,
		'failure_code', p_failure_code,
		'assistant_message_id', v_message_id,
		'terminal_event_id', v_terminal_event_id,
		'terminal_sequence_index', v_terminal_sequence,
		'terminalized_at', v_now
	);
END;
$function$;

CREATE OR REPLACE FUNCTION public.link_agentic_chat_worker_message_attachments()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_turn public.chat_turn_runs%ROWTYPE;
	v_artifact public.chat_turn_input_artifacts%ROWTYPE;
BEGIN
	IF NEW.role <> 'user'
		OR jsonb_typeof(COALESCE(NEW.metadata, '{}'::jsonb)) <> 'object'
		OR COALESCE(NEW.metadata->>'idempotency_key', '') !~
			'^chat-turn:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:user$' THEN
		RETURN NEW;
	END IF;

	SELECT turn_run.*
	INTO v_turn
	FROM public.chat_turn_runs AS turn_run
	WHERE 'chat-turn:' || turn_run.id::text || ':user' = NEW.metadata->>'idempotency_key'
		AND turn_run.session_id = NEW.session_id
		AND turn_run.user_id = NEW.user_id
		AND turn_run.execution_mode = 'worker_realtime'
		AND turn_run.status = 'queued';
	IF NOT FOUND THEN
		RETURN NEW;
	END IF;

	SELECT artifact.*
	INTO v_artifact
	FROM public.chat_turn_input_artifacts AS artifact
	WHERE artifact.turn_run_id = v_turn.id
		AND artifact.session_id = NEW.session_id
		AND artifact.user_id = NEW.user_id;
	IF NOT FOUND OR v_artifact.prepared->'currentTurn' IS NULL THEN
		RETURN NEW;
	END IF;

	INSERT INTO public.chat_message_attachments (
		message_id,
		session_id,
		user_id,
		project_id,
		asset_id,
		attachment_kind,
		media_type,
		role,
		display_order,
		metadata
	)
	SELECT
		NEW.id,
		NEW.session_id,
		NEW.user_id,
		NULLIF(attachment.value->>'project_id', '')::uuid,
		NULLIF(attachment.value->>'asset_id', '')::uuid,
		attachment.value->>'attachment_kind',
		'image',
		attachment.value->>'role',
		(attachment.value->>'display_order')::integer,
		jsonb_build_object(
			'temporary_attachment_id', COALESCE(attachment.value->'temporary_attachment_id', 'null'::jsonb),
			'storage_bucket', COALESCE(attachment.value->'storage_bucket', 'null'::jsonb),
			'storage_path', COALESCE(attachment.value->'storage_path', 'null'::jsonb),
			'file_name', COALESCE(attachment.value->'file_name', 'null'::jsonb),
			'content_type', COALESCE(attachment.value->'content_type', 'null'::jsonb),
			'file_size_bytes', COALESCE(attachment.value->'file_size_bytes', 'null'::jsonb),
			'width', COALESCE(attachment.value->'width', 'null'::jsonb),
			'height', COALESCE(attachment.value->'height', 'null'::jsonb),
			'checksum_sha256', COALESCE(attachment.value->'checksum_sha256', 'null'::jsonb),
			'ocr_status', COALESCE(attachment.value->'ocr_status', 'null'::jsonb),
			'extraction_summary', COALESCE(attachment.value->'extraction_summary', 'null'::jsonb),
			'extracted_text_preview', COALESCE(attachment.value->'extracted_text_preview', 'null'::jsonb),
			'expires_at', COALESCE(attachment.value->'expires_at', 'null'::jsonb)
		)
	FROM jsonb_array_elements(v_artifact.prepared->'currentTurn'->'attachments') AS attachment(value);

	RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.persist_agentic_chat_semantic_event(p_turn_run_id uuid, p_queue_job_id uuid, p_processing_token uuid, p_execution_generation integer, p_transition_id uuid, p_assistant_text text, p_phase text, p_event_type text, p_projection jsonb, p_event_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_request_role text;
	v_turn public.chat_turn_runs%ROWTYPE;
	v_job public.queue_jobs%ROWTYPE;
	v_stream public.chat_turn_stream_state%ROWTYPE;
	v_existing public.chat_turn_events%ROWTYPE;
	v_projection jsonb;
	v_event_payload jsonb;
	v_now timestamptz;
	v_sequence integer;
	v_event_id text;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_semantic_write_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL
		OR p_queue_job_id IS NULL
		OR p_processing_token IS NULL
		OR p_transition_id IS NULL
		OR p_execution_generation IS NULL
		OR p_execution_generation < 1 THEN
		RAISE EXCEPTION 'agentic_chat_semantic_write_invalid_identity';
	END IF;
	IF p_assistant_text IS NULL OR octet_length(p_assistant_text) > 2097152 THEN
		RAISE EXCEPTION 'agentic_chat_semantic_write_invalid_text';
	END IF;
	IF p_phase IS NULL
		OR p_phase NOT IN ('prompt', 'llm', 'tool', 'stream', 'finalize')
		OR p_event_type IS NULL
		OR p_event_type !~ '^[a-z][a-z0-9_]{0,127}$'
		OR p_event_type IN ('done', 'text', 'text_delta') THEN
		RAISE EXCEPTION 'agentic_chat_semantic_write_invalid_event';
	END IF;

	v_projection := COALESCE(p_projection, '{}'::jsonb);
	v_event_payload := COALESCE(p_event_payload, '{}'::jsonb);
	IF jsonb_typeof(v_projection) <> 'object'
		OR jsonb_typeof(v_event_payload) <> 'object'
		OR pg_column_size(v_projection) > 524288
		OR pg_column_size(v_event_payload) > 262144
		OR v_event_payload->>'type' IS DISTINCT FROM p_event_type THEN
		RAISE EXCEPTION 'agentic_chat_semantic_write_invalid_json_payload';
	END IF;

	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_semantic_write_turn_not_found';
	END IF;
	IF v_turn.execution_mode <> 'worker_realtime'
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id THEN
		RAISE EXCEPTION 'agentic_chat_semantic_write_turn_relationship_mismatch';
	END IF;

	IF v_turn.execution_generation IS DISTINCT FROM p_execution_generation THEN
		RETURN jsonb_build_object(
			'outcome', 'stale_generation',
			'publish_allowed', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'execution_generation', v_turn.execution_generation,
			'requested_execution_generation', p_execution_generation,
			'status', v_turn.status
		);
	END IF;
	IF v_turn.status IN ('completed', 'failed', 'cancelled') THEN
		RETURN jsonb_build_object(
			'outcome', 'already_terminal',
			'publish_allowed', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status,
			'terminal_event_id', v_turn.terminal_event_id
		);
	END IF;
	IF v_turn.status <> 'running' THEN
		RAISE EXCEPTION 'agentic_chat_semantic_write_invalid_status';
	END IF;

	SELECT jobs.*
	INTO v_job
	FROM public.queue_jobs jobs
	WHERE jobs.id = p_queue_job_id
	FOR UPDATE;

	IF NOT FOUND
		OR v_job.user_id IS DISTINCT FROM v_turn.user_id
		OR v_job.job_type::text <> 'agentic_chat_turn'
		OR v_job.status::text <> 'processing'
		OR v_job.processing_token IS DISTINCT FROM p_processing_token
		OR v_job.dedup_key IS DISTINCT FROM 'agentic-chat-turn:' || v_turn.id::text
		OR v_job.metadata->>'turnRunId' IS DISTINCT FROM v_turn.id::text
		OR v_job.metadata->>'correlationId' IS DISTINCT FROM v_turn.correlation_id::text THEN
		RAISE EXCEPTION 'agentic_chat_semantic_write_ownership_lost';
	END IF;

	IF v_turn.cancel_requested_at IS NOT NULL THEN
		RETURN jsonb_build_object(
			'outcome', 'cancel_requested',
			'publish_allowed', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status,
			'cancel_requested_at', v_turn.cancel_requested_at,
			'cancel_reason', v_turn.cancel_reason
		);
	END IF;

	SELECT streams.*
	INTO v_stream
	FROM public.chat_turn_stream_state streams
	WHERE streams.turn_run_id = v_turn.id
	FOR UPDATE;

	IF NOT FOUND
		OR v_stream.session_id IS DISTINCT FROM v_turn.session_id
		OR v_stream.user_id IS DISTINCT FROM v_turn.user_id
		OR v_stream.execution_generation IS DISTINCT FROM v_turn.execution_generation THEN
		RAISE EXCEPTION 'agentic_chat_semantic_write_current_generation_corrupt';
	END IF;

	SELECT events.*
	INTO v_existing
	FROM public.chat_turn_events events
	WHERE events.turn_run_id = v_turn.id
		AND events.execution_generation = v_turn.execution_generation
		AND events.worker_transition_id = p_transition_id;

	IF FOUND THEN
		IF v_existing.phase IS DISTINCT FROM p_phase
			OR v_existing.event_type IS DISTINCT FROM p_event_type
			OR v_existing.payload IS DISTINCT FROM v_event_payload THEN
			RAISE EXCEPTION 'agentic_chat_semantic_write_transition_conflict';
		END IF;

		RETURN jsonb_build_object(
			'outcome', 'already_persisted',
			'publish_allowed', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'stream_run_id', v_turn.stream_run_id,
			'client_turn_id', v_turn.client_turn_id,
			'execution_generation', v_turn.execution_generation,
			'sequence_index', v_existing.sequence_index,
			'event_id', v_existing.event_id,
			'phase', v_existing.phase,
			'event_type', v_existing.event_type,
			'durable', true,
			'transition_id', p_transition_id,
			'event_payload', v_existing.payload
		);
	END IF;

	IF v_stream.snapshot_sequence IS DISTINCT FROM v_turn.last_event_sequence
		OR v_stream.durable_through_sequence IS DISTINCT FROM v_turn.last_event_sequence THEN
		RAISE EXCEPTION 'agentic_chat_semantic_write_sequence_cursor_corrupt';
	END IF;
	IF left(p_assistant_text, char_length(v_stream.assistant_text))
		IS DISTINCT FROM v_stream.assistant_text THEN
		RAISE EXCEPTION 'agentic_chat_semantic_write_prefix_conflict';
	END IF;
	IF v_turn.last_event_sequence = 2147483647 THEN
		RAISE EXCEPTION 'agentic_chat_semantic_write_sequence_exhausted';
	END IF;

	v_now := clock_timestamp();
	v_sequence := v_turn.last_event_sequence + 1;
	v_event_id := v_turn.id::text
		|| ':' || v_turn.execution_generation::text
		|| ':' || v_sequence::text;

	INSERT INTO public.chat_turn_events (
		turn_run_id,
		session_id,
		user_id,
		stream_run_id,
		execution_generation,
		sequence_index,
		event_id,
		worker_transition_id,
		phase,
		event_type,
		payload,
		created_at
	) VALUES (
		v_turn.id,
		v_turn.session_id,
		v_turn.user_id,
		v_turn.stream_run_id,
		v_turn.execution_generation,
		v_sequence,
		v_event_id,
		p_transition_id,
		p_phase,
		p_event_type,
		v_event_payload,
		v_now
	);

	UPDATE public.chat_turn_stream_state streams
	SET snapshot_sequence = v_sequence,
		durable_through_sequence = v_sequence,
		projection_durable_sequence = v_sequence,
		assistant_text = p_assistant_text,
		projection = v_projection,
		reconcile_required = true,
		updated_at = v_now
	WHERE streams.turn_run_id = v_turn.id
		AND streams.execution_generation = v_turn.execution_generation;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_semantic_write_stream_compare_and_set_lost';
	END IF;

	UPDATE public.chat_turn_runs turns
	SET last_event_sequence = v_sequence,
		last_progress_at = v_now,
		updated_at = v_now
	WHERE turns.id = v_turn.id
		AND turns.status = 'running'
		AND turns.execution_generation = v_turn.execution_generation
		AND turns.queue_job_id = v_turn.queue_job_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_semantic_write_turn_compare_and_set_lost';
	END IF;

	RETURN jsonb_build_object(
		'outcome', 'persisted',
		'publish_allowed', true,
		'turn_run_id', v_turn.id,
		'queue_job_id', v_turn.queue_job_id,
		'session_id', v_turn.session_id,
		'user_id', v_turn.user_id,
		'stream_run_id', v_turn.stream_run_id,
		'client_turn_id', v_turn.client_turn_id,
		'execution_generation', v_turn.execution_generation,
		'sequence_index', v_sequence,
		'event_id', v_event_id,
		'phase', p_phase,
		'event_type', p_event_type,
		'durable', true,
		'transition_id', p_transition_id,
		'event_payload', v_event_payload,
		'reconcile_required', true,
		'persisted_at', v_now
	);
END;
$function$;

CREATE OR REPLACE FUNCTION public.persist_agentic_chat_text_batch(p_turn_run_id uuid, p_queue_job_id uuid, p_processing_token uuid, p_execution_generation integer, p_batch_id uuid, p_text_delta text, p_assistant_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_request_role text;
	v_turn public.chat_turn_runs%ROWTYPE;
	v_job public.queue_jobs%ROWTYPE;
	v_stream public.chat_turn_stream_state%ROWTYPE;
	v_now timestamptz;
	v_sequence integer;
	v_event_id text;
	v_assistant_bytes integer;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_text_write_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL
		OR p_queue_job_id IS NULL
		OR p_processing_token IS NULL
		OR p_batch_id IS NULL
		OR p_execution_generation IS NULL
		OR p_execution_generation < 1 THEN
		RAISE EXCEPTION 'agentic_chat_text_write_invalid_identity';
	END IF;
	IF p_text_delta IS NULL
		OR p_text_delta = ''
		OR octet_length(p_text_delta) > 524288
		OR p_assistant_text IS NULL
		OR octet_length(p_assistant_text) > 2097152 THEN
		RAISE EXCEPTION 'agentic_chat_text_write_invalid_text';
	END IF;
	v_assistant_bytes := octet_length(p_assistant_text);

	-- Preserve the established worker lock order used by claim/finalization.
	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_text_write_turn_not_found';
	END IF;
	IF v_turn.execution_mode <> 'worker_realtime'
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id THEN
		RAISE EXCEPTION 'agentic_chat_text_write_turn_relationship_mismatch';
	END IF;

	IF v_turn.execution_generation IS DISTINCT FROM p_execution_generation THEN
		RETURN jsonb_build_object(
			'outcome', 'stale_generation',
			'publish_allowed', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'execution_generation', v_turn.execution_generation,
			'requested_execution_generation', p_execution_generation,
			'status', v_turn.status
		);
	END IF;
	IF v_turn.status IN ('completed', 'failed', 'cancelled') THEN
		RETURN jsonb_build_object(
			'outcome', 'already_terminal',
			'publish_allowed', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status,
			'terminal_event_id', v_turn.terminal_event_id
		);
	END IF;
	IF v_turn.status <> 'running' THEN
		RAISE EXCEPTION 'agentic_chat_text_write_invalid_status';
	END IF;

	SELECT jobs.*
	INTO v_job
	FROM public.queue_jobs jobs
	WHERE jobs.id = p_queue_job_id
	FOR UPDATE;

	IF NOT FOUND
		OR v_job.user_id IS DISTINCT FROM v_turn.user_id
		OR v_job.job_type::text <> 'agentic_chat_turn'
		OR v_job.status::text <> 'processing'
		OR v_job.processing_token IS DISTINCT FROM p_processing_token
		OR v_job.dedup_key IS DISTINCT FROM 'agentic-chat-turn:' || v_turn.id::text
		OR v_job.metadata->>'turnRunId' IS DISTINCT FROM v_turn.id::text
		OR v_job.metadata->>'correlationId' IS DISTINCT FROM v_turn.correlation_id::text THEN
		RAISE EXCEPTION 'agentic_chat_text_write_ownership_lost';
	END IF;

	IF v_turn.cancel_requested_at IS NOT NULL THEN
		RETURN jsonb_build_object(
			'outcome', 'cancel_requested',
			'publish_allowed', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status,
			'cancel_requested_at', v_turn.cancel_requested_at,
			'cancel_reason', v_turn.cancel_reason
		);
	END IF;

	SELECT streams.*
	INTO v_stream
	FROM public.chat_turn_stream_state streams
	WHERE streams.turn_run_id = v_turn.id
	FOR UPDATE;

	IF NOT FOUND
		OR v_stream.session_id IS DISTINCT FROM v_turn.session_id
		OR v_stream.user_id IS DISTINCT FROM v_turn.user_id
		OR v_stream.execution_generation IS DISTINCT FROM v_turn.execution_generation THEN
		RAISE EXCEPTION 'agentic_chat_text_write_current_generation_corrupt';
	END IF;

	IF v_stream.last_text_batch_id = p_batch_id THEN
		IF v_stream.last_text_end_bytes IS DISTINCT FROM v_assistant_bytes
			OR left(v_stream.assistant_text, char_length(p_assistant_text))
				IS DISTINCT FROM p_assistant_text THEN
			RAISE EXCEPTION 'agentic_chat_text_write_batch_conflict';
		END IF;

		v_sequence := v_stream.last_text_sequence;
		v_event_id := v_turn.id::text
			|| ':' || v_turn.execution_generation::text
			|| ':' || v_sequence::text;
		RETURN jsonb_build_object(
			'outcome', 'already_persisted',
			'publish_allowed', false,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'stream_run_id', v_turn.stream_run_id,
			'client_turn_id', v_turn.client_turn_id,
			'execution_generation', v_turn.execution_generation,
			'sequence_index', v_sequence,
			'event_id', v_event_id,
			'phase', 'llm',
			'event_type', 'text_delta',
			'durable', true,
			'batch_id', p_batch_id,
			'assistant_text_bytes', v_stream.last_text_end_bytes
		);
	END IF;

	IF v_stream.snapshot_sequence IS DISTINCT FROM v_turn.last_event_sequence
		OR v_stream.durable_through_sequence IS DISTINCT FROM v_turn.last_event_sequence THEN
		RAISE EXCEPTION 'agentic_chat_text_write_sequence_cursor_corrupt';
	END IF;
	IF p_assistant_text IS DISTINCT FROM v_stream.assistant_text || p_text_delta THEN
		RAISE EXCEPTION 'agentic_chat_text_write_prefix_conflict';
	END IF;
	IF v_turn.last_event_sequence = 2147483647 THEN
		RAISE EXCEPTION 'agentic_chat_text_write_sequence_exhausted';
	END IF;

	v_now := clock_timestamp();
	v_sequence := v_turn.last_event_sequence + 1;
	v_event_id := v_turn.id::text
		|| ':' || v_turn.execution_generation::text
		|| ':' || v_sequence::text;

	UPDATE public.chat_turn_stream_state streams
	SET snapshot_sequence = v_sequence,
		durable_through_sequence = v_sequence,
		assistant_text = p_assistant_text,
		last_text_batch_id = p_batch_id,
		last_text_sequence = v_sequence,
		last_text_end_bytes = v_assistant_bytes,
		reconcile_required = true,
		first_text_persisted_at = COALESCE(streams.first_text_persisted_at, v_now),
		updated_at = v_now
	WHERE streams.turn_run_id = v_turn.id
		AND streams.execution_generation = v_turn.execution_generation;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_text_write_stream_compare_and_set_lost';
	END IF;

	UPDATE public.chat_turn_runs turns
	SET last_event_sequence = v_sequence,
		last_progress_at = v_now,
		updated_at = v_now
	WHERE turns.id = v_turn.id
		AND turns.status = 'running'
		AND turns.execution_generation = v_turn.execution_generation
		AND turns.queue_job_id = v_turn.queue_job_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_text_write_turn_compare_and_set_lost';
	END IF;

	RETURN jsonb_build_object(
		'outcome', 'persisted',
		'publish_allowed', true,
		'turn_run_id', v_turn.id,
		'queue_job_id', v_turn.queue_job_id,
		'session_id', v_turn.session_id,
		'user_id', v_turn.user_id,
		'stream_run_id', v_turn.stream_run_id,
		'client_turn_id', v_turn.client_turn_id,
		'execution_generation', v_turn.execution_generation,
		'sequence_index', v_sequence,
		'event_id', v_event_id,
		'phase', 'llm',
		'event_type', 'text_delta',
		'durable', true,
		'batch_id', p_batch_id,
		'text_delta', p_text_delta,
		'assistant_text_bytes', v_assistant_bytes,
		'reconcile_required', true,
		'persisted_at', v_now
	);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reconcile_agentic_chat_turn(p_turn_run_id uuid, p_user_id uuid, p_requested_execution_generation integer DEFAULT NULL::integer, p_after_durable_sequence integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_request_role text;
	v_turn public.chat_turn_runs%ROWTYPE;
	v_stream public.chat_turn_stream_state%ROWTYPE;
	v_message public.chat_messages%ROWTYPE;
	v_generation_changed boolean;
	v_effective_cursor integer;
	v_event_count integer;
	v_events jsonb;
	v_assistant_message jsonb;
	v_snapshot_sequence integer;
	v_durable_sequence integer;
	v_projection_sequence integer;
	v_assistant_text text;
	v_projection jsonb;
	v_reconcile_required boolean;
	v_snapshot_updated_at timestamptz;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_reconcile_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL
		OR p_user_id IS NULL
		OR p_after_durable_sequence IS NULL
		OR p_after_durable_sequence < 0
		OR (
			p_requested_execution_generation IS NOT NULL
			AND p_requested_execution_generation < 0
		)
		OR (
			p_requested_execution_generation IS NULL
			AND p_after_durable_sequence <> 0
		) THEN
		RAISE EXCEPTION 'agentic_chat_reconcile_invalid_cursor';
	END IF;

	-- Every supported claim/write/finalize primitive takes the turn lock first.
	-- If one is in flight this waits for its commit, then all reads below observe
	-- that committed generation while this shared lock blocks the next writer.
	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
		AND turns.user_id = p_user_id
	FOR SHARE;

	IF NOT FOUND THEN
		RETURN jsonb_build_object(
			'outcome', 'not_found',
			'turn_run_id', p_turn_run_id
		);
	END IF;
	IF v_turn.execution_mode <> 'worker_realtime' THEN
		RETURN jsonb_build_object(
			'outcome', 'not_worker_turn',
			'turn_run_id', v_turn.id,
			'execution_mode', v_turn.execution_mode,
			'status', v_turn.status
		);
	END IF;
	IF v_turn.client_turn_id IS NULL
		OR btrim(v_turn.client_turn_id) = ''
		OR v_turn.stream_run_id IS NULL
		OR btrim(v_turn.stream_run_id) = ''
		OR v_turn.execution_generation < 0
		OR (v_turn.status <> 'queued' AND v_turn.execution_generation < 1) THEN
		RAISE EXCEPTION 'agentic_chat_reconcile_turn_relationship_corrupt';
	END IF;

	SELECT streams.*
	INTO v_stream
	FROM public.chat_turn_stream_state streams
	WHERE streams.turn_run_id = v_turn.id;

	IF NOT FOUND THEN
		IF v_turn.status <> 'queued'
			OR v_turn.execution_generation <> 0
			OR v_turn.last_event_sequence <> 0 THEN
			RAISE EXCEPTION 'agentic_chat_reconcile_stream_state_missing';
		END IF;

		v_snapshot_sequence := 0;
		v_durable_sequence := 0;
		v_projection_sequence := 0;
		v_assistant_text := '';
		v_projection := '{}'::jsonb;
		v_reconcile_required := false;
		v_snapshot_updated_at := v_turn.updated_at;
	ELSE
		IF v_stream.session_id IS DISTINCT FROM v_turn.session_id
			OR v_stream.user_id IS DISTINCT FROM v_turn.user_id
			OR v_stream.execution_generation IS DISTINCT FROM v_turn.execution_generation
			OR v_stream.snapshot_sequence IS DISTINCT FROM v_turn.last_event_sequence
			OR v_stream.durable_through_sequence IS DISTINCT FROM v_turn.last_event_sequence
			OR v_stream.projection_durable_sequence > v_stream.durable_through_sequence THEN
			RAISE EXCEPTION 'agentic_chat_reconcile_stream_state_corrupt';
		END IF;

		v_snapshot_sequence := v_stream.snapshot_sequence;
		v_durable_sequence := v_stream.durable_through_sequence;
		v_projection_sequence := v_stream.projection_durable_sequence;
		v_assistant_text := v_stream.assistant_text;
		v_projection := v_stream.projection;
		v_reconcile_required := v_stream.reconcile_required;
		v_snapshot_updated_at := v_stream.updated_at;
	END IF;

	v_generation_changed := p_requested_execution_generation IS NOT NULL
		AND p_requested_execution_generation IS DISTINCT FROM v_turn.execution_generation;

	IF NOT v_generation_changed
		AND p_after_durable_sequence > v_durable_sequence THEN
		RAISE EXCEPTION 'agentic_chat_reconcile_cursor_ahead';
	END IF;

	v_effective_cursor := CASE
		WHEN v_generation_changed THEN v_projection_sequence
		ELSE GREATEST(p_after_durable_sequence, v_projection_sequence)
	END;

	SELECT count(*)
	INTO v_event_count
	FROM public.chat_turn_events events
	WHERE events.turn_run_id = v_turn.id
		AND events.execution_generation = v_turn.execution_generation
		AND events.sequence_index > v_effective_cursor
		AND events.sequence_index <= v_durable_sequence;

	IF v_event_count > 64 THEN
		RAISE EXCEPTION 'agentic_chat_reconcile_event_window_exceeded';
	END IF;

	SELECT COALESCE(
		jsonb_agg(
			COALESCE(events.payload, '{}'::jsonb) || jsonb_build_object(
				'contract_version', 'agentic_chat_worker_v1',
				'event_id', events.event_id,
				'stream_run_id', events.stream_run_id,
				'client_turn_id', v_turn.client_turn_id,
				'session_id', events.session_id,
				'turn_run_id', events.turn_run_id,
				'execution_generation', events.execution_generation,
				'sequence_index', events.sequence_index,
				'phase', events.phase,
				'event_type', events.event_type,
				'durable', true
			)
			ORDER BY events.sequence_index
		),
		'[]'::jsonb
	)
	INTO v_events
	FROM public.chat_turn_events events
	WHERE events.turn_run_id = v_turn.id
		AND events.execution_generation = v_turn.execution_generation
		AND events.sequence_index > v_effective_cursor
		AND events.sequence_index <= v_durable_sequence;

	IF v_turn.assistant_message_id IS NOT NULL THEN
		SELECT messages.*
		INTO v_message
		FROM public.chat_messages messages
		WHERE messages.id = v_turn.assistant_message_id
			AND messages.session_id = v_turn.session_id
			AND messages.user_id = v_turn.user_id;

		IF NOT FOUND
			OR v_message.role <> 'assistant'
			OR v_message.metadata->>'turn_run_id' IS DISTINCT FROM v_turn.id::text
			OR (v_message.metadata->>'execution_generation')::integer
				IS DISTINCT FROM v_turn.execution_generation THEN
			RAISE EXCEPTION 'agentic_chat_reconcile_assistant_message_corrupt';
		END IF;

		v_assistant_message := jsonb_build_object(
			'id', v_message.id,
			'role', v_message.role,
			'content', v_message.content,
			'metadata', COALESCE(v_message.metadata, '{}'::jsonb),
			'prompt_tokens', v_message.prompt_tokens,
			'completion_tokens', v_message.completion_tokens,
			'total_tokens', v_message.total_tokens,
			'created_at', v_message.created_at
		);
	ELSE
		v_assistant_message := NULL;
	END IF;

	IF v_turn.status IN ('completed', 'failed', 'cancelled') THEN
		IF v_turn.terminal_event_id IS NULL
			OR v_turn.terminalized_at IS NULL
			OR v_turn.terminal_event_id IS DISTINCT FROM (
				v_turn.id::text
				|| ':' || v_turn.execution_generation::text
				|| ':' || v_turn.last_event_sequence::text
			)
			OR (v_turn.status = 'completed' AND v_turn.assistant_message_id IS NULL) THEN
			RAISE EXCEPTION 'agentic_chat_reconcile_terminal_receipt_corrupt';
		END IF;
	ELSIF v_turn.terminal_event_id IS NOT NULL
		OR v_turn.terminalized_at IS NOT NULL
		OR v_turn.assistant_message_id IS NOT NULL THEN
		RAISE EXCEPTION 'agentic_chat_reconcile_nonterminal_receipt_corrupt';
	END IF;

	RETURN jsonb_build_object(
		'outcome', 'reconciled',
		'contract_version', 'agentic_chat_worker_v1',
		'turn_run_id', v_turn.id,
		'session_id', v_turn.session_id,
		'user_id', v_turn.user_id,
		'stream_run_id', v_turn.stream_run_id,
		'client_turn_id', v_turn.client_turn_id,
		'execution_mode', v_turn.execution_mode,
		'requested_execution_generation', p_requested_execution_generation,
		'execution_generation', v_turn.execution_generation,
		'generation_changed', v_generation_changed,
		'status', v_turn.status,
		'text', v_assistant_text,
		'projection', v_projection,
		'snapshot_sequence', v_snapshot_sequence,
		'durable_through_sequence', v_durable_sequence,
		'projection_durable_sequence', v_projection_sequence,
		'durable_events', v_events,
		'response_watermark', v_durable_sequence,
		'reconcile_required', v_reconcile_required,
		'assistant_message', v_assistant_message,
		'terminal_event_id', v_turn.terminal_event_id,
		'terminalized_at', v_turn.terminalized_at,
		'finished_reason', v_turn.finished_reason,
		'failure_code', v_turn.failure_code,
		'updated_at', v_snapshot_updated_at
	);
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_agentic_chat_effect_uncertain_reconciliation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
	IF OLD.state = 'uncertain' AND NEW.state IN ('succeeded', 'failed') THEN
		NEW.uncertain_reconciled_at := clock_timestamp();
	ELSIF NEW.uncertain_reconciled_at IS DISTINCT FROM OLD.uncertain_reconciled_at THEN
		RAISE EXCEPTION 'agentic_chat_effect_uncertain_reconciliation_is_database_owned';
	END IF;

	RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recover_agentic_chat_turn(p_turn_run_id uuid, p_queue_job_id uuid, p_processing_token uuid, p_execution_generation integer, p_failure_class text, p_error_message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_request_role text;
	v_turn public.chat_turn_runs%ROWTYPE;
	v_job public.queue_jobs%ROWTYPE;
	v_now timestamptz;
	v_failure_class text := NULLIF(btrim(p_failure_class), '');
	v_error_message text := NULLIF(btrim(p_error_message), '');
	v_current_attempts integer;
	v_max_attempts integer;
	v_effect_count integer;
	v_blocking_effect_count integer;
	v_retryable_class boolean;
	v_safe_pre_start boolean;
	v_attempts_remain boolean;
	v_timeout_retry_available boolean;
	v_queue_residence_expired boolean;
	v_retry_exhausted boolean;
	v_queue_status text;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_recovery_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL
		OR p_queue_job_id IS NULL
		OR p_processing_token IS NULL
		OR p_execution_generation IS NULL
		OR p_execution_generation < 1
		OR v_failure_class IS NULL
		OR v_failure_class NOT IN (
			'transient_infra',
			'provider_throttle',
			'timeout_pre_start',
			'permanent',
			'stale_context',
			'publisher_overload',
			'timeout_post_start',
			'cancelled',
			'uncertain_external_commit',
			'unknown'
		)
		OR length(v_error_message) > 2000 THEN
		RAISE EXCEPTION 'agentic_chat_recovery_invalid_request';
	END IF;

	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_recovery_turn_not_found';
	END IF;
	IF v_turn.execution_mode <> 'worker_realtime'
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id THEN
		RAISE EXCEPTION 'agentic_chat_recovery_relationship_mismatch';
	END IF;

	IF v_turn.status IN ('completed', 'failed', 'cancelled') THEN
		SELECT jobs.*
		INTO v_job
		FROM public.queue_jobs jobs
		WHERE jobs.id = p_queue_job_id
		FOR UPDATE;

		IF NOT FOUND
			OR v_job.user_id IS DISTINCT FROM v_turn.user_id
			OR v_job.job_type::text <> 'agentic_chat_turn'
			OR v_job.dedup_key IS DISTINCT FROM 'agentic-chat-turn:' || v_turn.id::text
			OR v_job.metadata->>'turnRunId' IS DISTINCT FROM v_turn.id::text
			OR v_job.metadata->>'correlationId' IS DISTINCT FROM v_turn.correlation_id::text THEN
			RAISE EXCEPTION 'agentic_chat_recovery_queue_relationship_mismatch';
		END IF;

		v_queue_status := v_turn.status;
		IF v_job.status::text = v_queue_status AND v_job.processing_token IS NULL THEN
			RETURN jsonb_build_object(
				'outcome', 'already_reconciled',
				'execution_may_retry', false,
				'failure_code', v_turn.failure_code,
				'turn_run_id', v_turn.id,
				'queue_job_id', v_turn.queue_job_id,
				'session_id', v_turn.session_id,
				'user_id', v_turn.user_id,
				'correlation_id', v_turn.correlation_id,
				'execution_generation', v_turn.execution_generation,
				'status', v_turn.status,
				'queue_status', v_job.status
			);
		END IF;
		IF v_job.status::text = 'processing'
			AND v_job.processing_token IS DISTINCT FROM p_processing_token THEN
			RAISE EXCEPTION 'agentic_chat_recovery_ownership_lost';
		END IF;
		IF v_job.status::text NOT IN ('pending', 'retrying', 'processing') THEN
			RAISE EXCEPTION 'agentic_chat_recovery_terminal_queue_conflict';
		END IF;

		v_now := clock_timestamp();
		UPDATE public.queue_jobs jobs
		SET status = v_queue_status::public.queue_status,
			processing_token = NULL,
			completed_at = COALESCE(jobs.completed_at, v_now),
			error_message = CASE
				WHEN v_turn.status = 'completed' THEN jobs.error_message
				ELSE COALESCE(jobs.error_message, 'Agentic chat turn ' || v_turn.status)
			END,
			updated_at = v_now
		WHERE jobs.id = p_queue_job_id;

		RETURN jsonb_build_object(
			'outcome', 'queue_reconciled',
			'execution_may_retry', false,
			'failure_code', v_turn.failure_code,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'correlation_id', v_turn.correlation_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status,
			'queue_status', v_queue_status
		);
	END IF;

	IF v_turn.execution_generation <> p_execution_generation THEN
		RETURN jsonb_build_object(
			'outcome', 'stale_generation',
			'execution_may_retry', false,
			'failure_code', v_failure_class,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'correlation_id', v_turn.correlation_id,
			'requested_execution_generation', p_execution_generation,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status
		);
	END IF;

	-- Lock all subordinate effect rows before the queue row, then classify from
	-- their committed states. Terminal effects are not blocking receipts, but
	-- their durable turn boundaries still forbid whole-turn replay.
	PERFORM effects.id
	FROM public.chat_turn_effects effects
	WHERE effects.turn_run_id = v_turn.id
	ORDER BY effects.id
	FOR UPDATE;

	SELECT
		count(*)::integer,
		count(*) FILTER (
			WHERE effects.state IN ('reserved', 'started', 'uncertain')
		)::integer
	INTO v_effect_count, v_blocking_effect_count
	FROM public.chat_turn_effects effects
	WHERE effects.turn_run_id = v_turn.id;

	SELECT jobs.*
	INTO v_job
	FROM public.queue_jobs jobs
	WHERE jobs.id = p_queue_job_id
	FOR UPDATE;

	IF NOT FOUND
		OR v_job.user_id IS DISTINCT FROM v_turn.user_id
		OR v_job.job_type::text <> 'agentic_chat_turn'
		OR v_job.dedup_key IS DISTINCT FROM 'agentic-chat-turn:' || v_turn.id::text
		OR v_job.metadata->>'turnRunId' IS DISTINCT FROM v_turn.id::text
		OR v_job.metadata->>'correlationId' IS DISTINCT FROM v_turn.correlation_id::text THEN
		RAISE EXCEPTION 'agentic_chat_recovery_queue_relationship_mismatch';
	END IF;

	IF v_turn.status = 'queued'
		AND v_job.status::text = 'pending'
		AND v_job.processing_token IS NULL THEN
		RETURN jsonb_build_object(
			'outcome', 'already_requeued',
			'execution_may_retry', false,
			'failure_code', v_failure_class,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'correlation_id', v_turn.correlation_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status,
			'queue_status', v_job.status,
			'queue_attempts', COALESCE(v_job.attempts, 0)
		);
	END IF;
	IF v_turn.status <> 'running' THEN
		RAISE EXCEPTION 'agentic_chat_recovery_invalid_status';
	END IF;
	IF v_job.status::text <> 'processing'
		OR v_job.processing_token IS DISTINCT FROM p_processing_token THEN
		RAISE EXCEPTION 'agentic_chat_recovery_ownership_lost';
	END IF;

	-- Recovery receipts/backoff are calculated only after all governing locks.
	v_now := clock_timestamp();
	v_current_attempts := COALESCE(v_job.attempts, 0);
	v_max_attempts := COALESCE(v_job.max_attempts, 3);
	v_queue_residence_expired := EXISTS (
		SELECT 1
		FROM public.chat_turn_input_artifacts artifacts
		WHERE artifacts.id = v_turn.input_artifact_id
			AND artifacts.turn_run_id = v_turn.id
			AND artifacts.session_id = v_turn.session_id
			AND artifacts.user_id = v_turn.user_id
			AND artifacts.retain_until < v_now
	);

	IF v_turn.cancel_requested_at IS NOT NULL THEN
		RETURN jsonb_build_object(
			'outcome', 'finalize_cancelled',
			'execution_may_retry', false,
			'failure_code', 'cancelled',
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'correlation_id', v_turn.correlation_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status
		);
	END IF;

	IF v_blocking_effect_count > 0 THEN
		RETURN jsonb_build_object(
			'outcome', 'effect_reconciliation_required',
			'execution_may_retry', false,
			'failure_code', v_failure_class,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'correlation_id', v_turn.correlation_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status,
			'blocking_effect_count', v_blocking_effect_count
		);
	END IF;

	v_retryable_class := v_failure_class IN (
		'transient_infra', 'provider_throttle', 'timeout_pre_start'
	);
	v_safe_pre_start := v_turn.execution_started_at IS NULL
		AND v_turn.mutation_reserved_at IS NULL
		AND v_turn.irreversible_boundary_at IS NULL
		AND v_effect_count = 0;
	v_attempts_remain := v_current_attempts + 1 < v_max_attempts;
	v_timeout_retry_available := v_failure_class <> 'timeout_pre_start'
		OR v_current_attempts = 0;

	IF v_retryable_class
		AND v_safe_pre_start
		AND NOT v_queue_residence_expired
		AND v_attempts_remain
		AND v_timeout_retry_available THEN
		UPDATE public.chat_turn_runs turns
		SET status = 'queued',
			last_progress_at = v_now,
			updated_at = v_now
		WHERE turns.id = v_turn.id
			AND turns.status = 'running'
			AND turns.execution_generation = p_execution_generation
			AND turns.cancel_requested_at IS NULL
			AND turns.execution_started_at IS NULL
			AND turns.mutation_reserved_at IS NULL
			AND turns.irreversible_boundary_at IS NULL;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'agentic_chat_recovery_turn_requeue_fence_lost';
		END IF;

		UPDATE public.queue_jobs jobs
		SET status = 'pending',
			processing_token = NULL,
			started_at = NULL,
			completed_at = NULL,
			attempts = v_current_attempts + 1,
			error_message = COALESCE(
				v_error_message,
				'Agentic chat recovery: ' || v_failure_class
			),
			scheduled_for = v_now
				+ CASE
					WHEN v_failure_class IN ('provider_throttle', 'timeout_pre_start') THEN
						(LEAST(5 * POWER(2, v_current_attempts), 60) || ' seconds')::interval
						+ (random() * interval '5 seconds')
					ELSE
						(LEAST(POWER(2, v_current_attempts), 16) || ' minutes')::interval
						+ (random() * interval '60 seconds')
				END,
			updated_at = v_now
		WHERE jobs.id = p_queue_job_id
			AND jobs.status = 'processing'
			AND jobs.processing_token = p_processing_token
		RETURNING * INTO v_job;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'agentic_chat_recovery_queue_requeue_fence_lost';
		END IF;

		RETURN jsonb_build_object(
			'outcome', 'retry_scheduled',
			'execution_may_retry', true,
			'failure_code', v_failure_class,
			'turn_run_id', v_turn.id,
			'queue_job_id', v_turn.queue_job_id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'correlation_id', v_turn.correlation_id,
			'execution_generation', v_turn.execution_generation,
			'status', 'queued',
			'queue_status', v_job.status,
			'queue_attempts', v_job.attempts,
			'scheduled_for', v_job.scheduled_for
		);
	END IF;

	v_retry_exhausted := v_retryable_class
		AND v_safe_pre_start
		AND (NOT v_attempts_remain OR NOT v_timeout_retry_available);
	v_failure_class := CASE
		WHEN v_queue_residence_expired THEN 'stale_context'
		ELSE v_failure_class
	END;

	RETURN jsonb_build_object(
		'outcome', 'finalize_failed',
		'execution_may_retry', false,
		'failure_code', v_failure_class,
		'retry_exhausted', v_retry_exhausted,
		'turn_run_id', v_turn.id,
		'queue_job_id', v_turn.queue_job_id,
		'session_id', v_turn.session_id,
		'user_id', v_turn.user_id,
		'correlation_id', v_turn.correlation_id,
		'execution_generation', v_turn.execution_generation,
		'status', v_turn.status
	);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_active_agentic_chat_input_artifact_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_status text;
	v_terminal_at timestamptz;
BEGIN
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

CREATE OR REPLACE FUNCTION public.reject_agentic_chat_execution_mode_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
	IF NEW.execution_mode IS DISTINCT FROM OLD.execution_mode THEN
		RAISE EXCEPTION 'agentic_chat_execution_mode_is_immutable';
	END IF;
	RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_agentic_chat_input_artifact_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
	RAISE EXCEPTION 'agentic_chat_input_artifact_is_immutable';
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_protected_agentic_chat_effect_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_status text;
	v_terminal_at timestamptz;
	v_effect_terminal_at timestamptz;
BEGIN
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

CREATE OR REPLACE FUNCTION public.request_agentic_chat_turn_cancel(p_turn_run_id uuid, p_user_id uuid, p_reason text, p_source text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_request_role text;
	v_turn public.chat_turn_runs%ROWTYPE;
	v_signal public.chat_turn_signals%ROWTYPE;
	v_finalized jsonb;
	v_now timestamptz;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_cancel_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL OR p_user_id IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_cancel_invalid_identity';
	END IF;
	IF p_reason IS NULL
		OR p_source IS NULL
		OR p_reason NOT IN (
		'user_cancelled', 'superseded', 'timeout', 'operator_cancelled'
	) OR p_source NOT IN ('browser', 'worker', 'operator', 'sweeper') THEN
		RAISE EXCEPTION 'agentic_chat_cancel_invalid_command';
	END IF;

	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_cancel_turn_not_found';
	END IF;
	IF v_turn.user_id IS DISTINCT FROM p_user_id
		OR v_turn.execution_mode <> 'worker_realtime'
		OR v_turn.queue_job_id IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_cancel_turn_relationship_mismatch';
	END IF;

	IF v_turn.status IN ('completed', 'failed', 'cancelled') THEN
		IF v_turn.terminal_event_id IS NULL OR v_turn.terminalized_at IS NULL THEN
			RAISE EXCEPTION 'agentic_chat_cancel_terminal_receipt_corrupt';
		END IF;
		RETURN jsonb_build_object(
			'outcome', 'already_terminal',
			'turn_run_id', v_turn.id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'queue_job_id', v_turn.queue_job_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status,
			'finished_reason', v_turn.finished_reason,
			'failure_code', v_turn.failure_code,
			'assistant_message_id', v_turn.assistant_message_id,
			'terminal_event_id', v_turn.terminal_event_id,
			'terminal_sequence_index', v_turn.last_event_sequence,
			'terminalized_at', v_turn.terminalized_at
		);
	END IF;
	v_now := clock_timestamp();

	IF v_turn.status = 'queued' THEN
		UPDATE public.chat_turn_runs turns
		SET cancel_requested_at = COALESCE(turns.cancel_requested_at, v_now),
			cancel_reason = COALESCE(turns.cancel_reason, p_reason),
			updated_at = v_now
		WHERE turns.id = v_turn.id;

		v_finalized := public.finalize_agentic_chat_turn(
			v_turn.id,
			v_turn.user_id,
			v_turn.queue_job_id,
			NULL,
			v_turn.execution_generation,
			'cancelled',
			COALESCE(v_turn.cancel_reason, p_reason),
			NULL,
			NULL,
			'',
			'{}'::jsonb,
			NULL,
			NULL,
			NULL,
			'{}'::jsonb,
			jsonb_build_object(
				'cancel_reason', COALESCE(v_turn.cancel_reason, p_reason),
				'cancel_source', p_source
			)
		);

		RETURN v_finalized || jsonb_build_object('outcome', 'cancelled');
	END IF;

	IF v_turn.status <> 'running' THEN
		RAISE EXCEPTION 'agentic_chat_cancel_invalid_status';
	END IF;

	IF v_turn.cancel_requested_at IS NULL THEN
		UPDATE public.chat_turn_runs turns
		SET cancel_requested_at = v_now,
			cancel_reason = p_reason,
			updated_at = v_now
		WHERE turns.id = v_turn.id
			AND turns.status = 'running'
			AND turns.execution_generation = v_turn.execution_generation
			AND turns.cancel_requested_at IS NULL;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'agentic_chat_cancel_compare_and_set_lost';
		END IF;
	END IF;

	INSERT INTO public.chat_turn_signals (
		turn_run_id,
		session_id,
		user_id,
		reason,
		source,
		created_at
	) VALUES (
		v_turn.id,
		v_turn.session_id,
		v_turn.user_id,
		COALESCE(v_turn.cancel_reason, p_reason),
		p_source,
		COALESCE(v_turn.cancel_requested_at, v_now)
	)
	ON CONFLICT (turn_run_id) DO NOTHING;

	SELECT signals.*
	INTO v_signal
	FROM public.chat_turn_signals signals
	WHERE signals.turn_run_id = v_turn.id;

	IF NOT FOUND
		OR v_signal.reason IS DISTINCT FROM COALESCE(v_turn.cancel_reason, p_reason) THEN
		RAISE EXCEPTION 'agentic_chat_cancel_signal_corrupt';
	END IF;

	RETURN jsonb_build_object(
		'outcome', 'cancel_requested',
		'turn_run_id', v_turn.id,
		'session_id', v_turn.session_id,
		'user_id', v_turn.user_id,
		'queue_job_id', v_turn.queue_job_id,
		'execution_generation', v_turn.execution_generation,
		'status', 'running',
		'cancel_requested_at', v_signal.created_at,
		'cancel_reason', v_signal.reason,
		'cancel_source', v_signal.source,
		'signal_id', v_signal.id
	);
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_agentic_chat_resume_checkpoint_on_terminal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_snapshot jsonb;
	v_checkpoint_id uuid;
	v_checkpoint public.chat_turn_checkpoints%ROWTYPE;
	v_now timestamptz := transaction_timestamp();
BEGIN
	IF NEW.execution_mode <> 'worker_realtime'
		OR NEW.status NOT IN ('completed', 'failed', 'cancelled')
		OR OLD.status IS NOT DISTINCT FROM NEW.status
		OR NEW.input_artifact_id IS NULL THEN
		RETURN NEW;
	END IF;

	SELECT artifacts.prepared->'resumeCheckpoint'
	INTO v_snapshot
	FROM public.chat_turn_input_artifacts artifacts
	WHERE artifacts.id = NEW.input_artifact_id
		AND artifacts.turn_run_id = NEW.id
		AND artifacts.session_id = NEW.session_id
		AND artifacts.user_id = NEW.user_id;
	IF v_snapshot IS NULL THEN
		RETURN NEW;
	END IF;
	BEGIN
		v_checkpoint_id := (v_snapshot->>'checkpointId')::uuid;
	EXCEPTION WHEN invalid_text_representation THEN
		RAISE EXCEPTION 'agentic_chat_resume_terminal_snapshot_invalid';
	END;

	SELECT checkpoints.*
	INTO v_checkpoint
	FROM public.chat_turn_checkpoints checkpoints
	WHERE checkpoints.id = v_checkpoint_id
	FOR UPDATE;
	IF NOT FOUND
		OR v_checkpoint.user_id IS DISTINCT FROM NEW.user_id
		OR v_checkpoint.session_id IS DISTINCT FROM NEW.session_id
		OR v_checkpoint.resume_turn_run_id IS DISTINCT FROM NEW.id THEN
		RAISE EXCEPTION 'agentic_chat_resume_terminal_scope_mismatch';
	END IF;

	IF NEW.status = 'completed' THEN
		IF v_checkpoint.status = 'resuming' THEN
			UPDATE public.chat_turn_checkpoints checkpoints
			SET status = 'resumed',
				resumed_at = v_now,
				updated_at = v_now
			WHERE checkpoints.id = v_checkpoint.id
				AND checkpoints.status = 'resuming'
				AND checkpoints.resume_turn_run_id = NEW.id;
			IF NOT FOUND THEN
				RAISE EXCEPTION 'agentic_chat_resume_terminal_transition_lost';
			END IF;
		ELSIF v_checkpoint.status <> 'resumed' OR v_checkpoint.resumed_at IS NULL THEN
			RAISE EXCEPTION 'agentic_chat_resume_terminal_state_conflict';
		END IF;
	ELSE
		IF v_checkpoint.status = 'resuming' THEN
			UPDATE public.chat_turn_checkpoints checkpoints
			SET status = 'active',
				resume_turn_run_id = NULL,
				resume_started_at = NULL,
				resumed_at = NULL,
				updated_at = v_now
			WHERE checkpoints.id = v_checkpoint.id
				AND checkpoints.status = 'resuming'
				AND checkpoints.resume_turn_run_id = NEW.id;
			IF NOT FOUND THEN
				RAISE EXCEPTION 'agentic_chat_resume_terminal_restore_lost';
			END IF;
		ELSIF v_checkpoint.status <> 'active'
			OR v_checkpoint.resume_turn_run_id IS NOT NULL
			OR v_checkpoint.resume_started_at IS NOT NULL
			OR v_checkpoint.resumed_at IS NOT NULL THEN
			RAISE EXCEPTION 'agentic_chat_resume_terminal_state_conflict';
		END IF;
	END IF;
	RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end$function$;

CREATE OR REPLACE FUNCTION public.update_chat_session_stats()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE chat_sessions
    SET
      message_count = message_count + 1,
      total_tokens_used = total_tokens_used + COALESCE(NEW.total_tokens, 0),
      last_message_at = NEW.created_at,
      updated_at = NOW()
    WHERE id = NEW.session_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_agentic_chat_attachment_contract()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_current_turn jsonb := NEW.prepared->'currentTurn';
	v_current_attachments jsonb;
	v_request_payload jsonb;
	v_expected_request_attachments jsonb;
	v_expected_request_message text;
BEGIN
	-- Rolling compatibility for artifacts created by the immediately preceding
	-- web version. Every new writer includes currentTurn, including text-only.
	IF v_current_turn IS NULL THEN
		RETURN NEW;
	END IF;

	IF jsonb_typeof(v_current_turn) <> 'object'
		OR jsonb_typeof(COALESCE(v_current_turn->'message', 'null'::jsonb)) <> 'string'
		OR jsonb_typeof(
			COALESCE(v_current_turn->'attachmentContextMaxChars', 'null'::jsonb)
		) <> 'number'
		OR COALESCE((v_current_turn->>'attachmentContextMaxChars') !~ '^[1-9][0-9]*$', true)
		OR jsonb_typeof(COALESCE(v_current_turn->'attachments', 'null'::jsonb)) <> 'array' THEN
		RAISE EXCEPTION 'agentic_chat_input_current_turn_attachment_invalid';
	END IF;

	IF (v_current_turn->>'attachmentContextMaxChars')::numeric > 100000
		OR NOT public.agentic_chat_frozen_attachments_v1_are_valid(
			v_current_turn->'attachments',
			true
		)
		OR (
			v_current_turn->>'message' = ''
			AND jsonb_array_length(v_current_turn->'attachments') = 0
		) THEN
		RAISE EXCEPTION 'agentic_chat_input_current_turn_attachment_invalid';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(NEW.history) AS history_item(value)
		WHERE jsonb_typeof(history_item.value) <> 'object'
			OR NOT public.agentic_chat_frozen_attachments_v1_are_valid(
				history_item.value->'attachments',
				true
			)
	) THEN
		RAISE EXCEPTION 'agentic_chat_input_history_attachment_invalid';
	END IF;

	SELECT turn_run.request_payload
	INTO v_request_payload
	FROM public.chat_turn_runs AS turn_run
	WHERE turn_run.id = NEW.turn_run_id
		AND turn_run.session_id = NEW.session_id
		AND turn_run.user_id = NEW.user_id
		AND turn_run.execution_mode = 'worker_realtime';
	IF NOT FOUND OR jsonb_typeof(v_request_payload) <> 'object' THEN
		RAISE EXCEPTION 'agentic_chat_input_attachment_turn_scope_mismatch';
	END IF;

	SELECT COALESCE(
		jsonb_agg(
			public.agentic_chat_normalize_frozen_attachment_v1(
				attachment.value,
				attachment.ordinality - 1,
				false
			)
			ORDER BY attachment.ordinality
		),
		'[]'::jsonb
	)
	INTO v_expected_request_attachments
	FROM jsonb_array_elements(v_current_turn->'attachments') WITH ORDINALITY AS attachment(value, ordinality);

	v_current_attachments := v_current_turn->'attachments';
	v_expected_request_message := CASE
		WHEN v_current_turn->>'message' <> '' THEN v_current_turn->>'message'
		WHEN jsonb_array_length(v_current_attachments) = 1 THEN 'Attached 1 image'
		ELSE 'Attached ' || jsonb_array_length(v_current_attachments)::text || ' images'
	END;
	IF v_request_payload->>'message' IS DISTINCT FROM v_expected_request_message
		OR v_request_payload->'attachments' IS DISTINCT FROM v_expected_request_attachments THEN
		RAISE EXCEPTION 'agentic_chat_input_current_turn_request_mismatch';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(v_current_attachments) AS attachment(value)
		LEFT JOIN public.onto_assets AS asset
			ON asset.id::text = attachment.value->>'asset_id'
		WHERE attachment.value->>'attachment_kind' = 'onto_asset'
			AND (
				asset.id IS NULL
				OR asset.kind <> 'image'
				OR asset.deleted_at IS NOT NULL
				OR asset.project_id::text IS DISTINCT FROM attachment.value->>'project_id'
				OR asset.storage_bucket IS DISTINCT FROM attachment.value->>'storage_bucket'
				OR asset.storage_path IS DISTINCT FROM attachment.value->>'storage_path'
				OR COALESCE(to_jsonb(asset.original_filename), 'null'::jsonb) IS DISTINCT FROM attachment.value->'file_name'
				OR COALESCE(to_jsonb(asset.content_type), 'null'::jsonb) IS DISTINCT FROM attachment.value->'content_type'
				OR COALESCE(to_jsonb(asset.file_size_bytes), 'null'::jsonb) IS DISTINCT FROM attachment.value->'file_size_bytes'
				OR COALESCE(to_jsonb(asset.width), 'null'::jsonb) IS DISTINCT FROM attachment.value->'width'
				OR COALESCE(to_jsonb(asset.height), 'null'::jsonb) IS DISTINCT FROM attachment.value->'height'
				OR COALESCE(to_jsonb(asset.checksum_sha256), 'null'::jsonb) IS DISTINCT FROM attachment.value->'checksum_sha256'
				OR COALESCE(to_jsonb(asset.ocr_status), 'null'::jsonb) IS DISTINCT FROM attachment.value->'ocr_status'
			)
	) THEN
		RAISE EXCEPTION 'agentic_chat_input_current_turn_asset_mismatch';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(v_current_attachments) AS attachment(value)
		WHERE attachment.value->>'attachment_kind' = 'temporary_file'
			AND (
				attachment.value->>'storage_bucket' <> 'onto-assets'
				OR attachment.value->>'storage_path' NOT LIKE
					'users/' || NEW.user_id::text || '/chat-temp/' ||
					(attachment.value->>'temporary_attachment_id') || '/%'
				OR (attachment.value->>'expires_at')::timestamptz <= statement_timestamp()
				OR (attachment.value->>'expires_at')::timestamptz > statement_timestamp() + interval '7 days 5 minutes'
			)
	) THEN
		RAISE EXCEPTION 'agentic_chat_input_current_turn_temporary_mismatch';
	END IF;

	RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_agentic_chat_domain_metadata_snapshot_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_snapshot jsonb := NEW.prepared->'domainMetadata';
	v_state jsonb;
BEGIN
	IF NOT (NEW.prepared ? 'domainMetadata') THEN
		RETURN NEW;
	END IF;
	v_state := v_snapshot->'state';
	IF NEW.artifact_version <> 'agentic_chat_input_v3'
		OR jsonb_typeof(v_snapshot) <> 'object'
		OR NOT v_snapshot ?& ARRAY[
			'version', 'sensingApplied', 'state', 'skillDomainIds', 'outcomeCardDomainIds'
		]
		OR (v_snapshot - ARRAY[
			'version', 'sensingApplied', 'state', 'skillDomainIds', 'outcomeCardDomainIds'
		]) <> '{}'::jsonb
		OR v_snapshot->>'version' IS DISTINCT FROM '1'
		OR jsonb_typeof(v_snapshot->'sensingApplied') <> 'boolean'
		OR octet_length(v_snapshot::text) > 524288
		OR jsonb_typeof(v_state) <> 'object'
		OR NOT v_state ?& ARRAY[
			'version', 'updated_at', 'active_domains', 'active_outcome_cards',
			'coverage_gaps', 'research_backlog', 'used_domains',
			'unknown_domain_interests', 'workflow_gap_candidates', 'recent_observations'
		]
		OR (v_state - ARRAY[
			'version', 'updated_at', 'active_domains', 'active_outcome_cards',
			'coverage_gaps', 'research_backlog', 'used_domains',
			'unknown_domain_interests', 'workflow_gap_candidates', 'recent_observations'
		]) <> '{}'::jsonb
		OR v_state->>'version' IS DISTINCT FROM '1'
		OR COALESCE(v_state->>'updated_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$', true)
		OR NOT public.agentic_chat_jsonb_array_of_objects_v1_is_valid(v_state->'active_domains', 6)
		OR NOT public.agentic_chat_jsonb_array_of_objects_v1_is_valid(v_state->'active_outcome_cards', 6)
		OR NOT public.agentic_chat_jsonb_array_of_objects_v1_is_valid(v_state->'coverage_gaps', 12)
		OR NOT public.agentic_chat_jsonb_array_of_objects_v1_is_valid(v_state->'research_backlog', 16)
		OR NOT public.agentic_chat_jsonb_array_of_objects_v1_is_valid(v_state->'used_domains', 24)
		OR NOT public.agentic_chat_jsonb_array_of_objects_v1_is_valid(v_state->'unknown_domain_interests', 16)
		OR NOT public.agentic_chat_jsonb_array_of_objects_v1_is_valid(v_state->'workflow_gap_candidates', 16)
		OR NOT public.agentic_chat_jsonb_array_of_objects_v1_is_valid(v_state->'recent_observations', 8)
		OR NOT public.agentic_chat_domain_reference_map_v1_is_valid(
			v_snapshot->'skillDomainIds'
		)
		OR NOT public.agentic_chat_domain_reference_map_v1_is_valid(
			v_snapshot->'outcomeCardDomainIds'
		) THEN
		RAISE EXCEPTION 'agentic_chat_domain_metadata_invalid_snapshot';
	END IF;
	RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_agentic_chat_input_artifact_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
	IF NEW.input_artifact_id IS NOT NULL
		AND NOT EXISTS (
			SELECT 1
			FROM public.chat_turn_input_artifacts artifact
			WHERE artifact.id = NEW.input_artifact_id
				AND artifact.turn_run_id = NEW.id
				AND artifact.session_id = NEW.session_id
				AND artifact.user_id = NEW.user_id
		) THEN
		RAISE EXCEPTION 'agentic_chat_input_artifact_scope_mismatch';
	END IF;
	RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_agentic_chat_input_artifact_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_session_snapshot jsonb := NEW.prepared->'sessionSnapshot';
	v_context_usage jsonb := NEW.prepared->'contextUsageSnapshot';
	v_has_session boolean := NEW.prepared ? 'sessionSnapshot';
	v_has_context_usage boolean := NEW.prepared ? 'contextUsageSnapshot';
BEGIN
	IF v_has_session OR v_has_context_usage THEN
		IF NOT v_has_session OR NOT v_has_context_usage
			OR COALESCE(jsonb_typeof(v_session_snapshot) <> 'object', true)
			OR v_session_snapshot ? 'id'
			OR COALESCE(jsonb_typeof(v_context_usage) <> 'object', true) THEN
			RAISE EXCEPTION 'agentic_chat_input_v3_invalid_lifecycle_snapshot';
		END IF;
		IF COALESCE((v_context_usage->>'estimatedTokens') !~ '^[0-9]+$', true)
			OR COALESCE((v_context_usage->>'tokenBudget') !~ '^[0-9]+$', true)
			OR COALESCE((v_context_usage->>'usagePercent') !~ '^[0-9]+$', true)
			OR COALESCE((v_context_usage->>'tokensRemaining') !~ '^[0-9]+$', true)
			OR COALESCE(
				v_context_usage->>'status' NOT IN ('ok', 'near_limit', 'over_budget'),
				true
			) THEN
			RAISE EXCEPTION 'agentic_chat_input_v3_invalid_lifecycle_snapshot';
		END IF;
		IF (v_context_usage->>'estimatedTokens')::numeric < 0
			OR (v_context_usage->>'estimatedTokens')::numeric > 9007199254740991
			OR (v_context_usage->>'tokenBudget')::numeric <= 0
			OR (v_context_usage->>'tokenBudget')::numeric > 9007199254740991
			OR (v_context_usage->>'usagePercent')::numeric > 999
			OR (v_context_usage->>'tokensRemaining')::numeric < 0
			OR (v_context_usage->>'tokensRemaining')::numeric > 9007199254740991 THEN
			RAISE EXCEPTION 'agentic_chat_input_v3_invalid_lifecycle_snapshot';
		END IF;
		NEW.artifact_version := 'agentic_chat_input_v3';
	ELSIF NEW.artifact_version = 'agentic_chat_input_v3' THEN
		RAISE EXCEPTION 'agentic_chat_input_v3_missing_lifecycle_snapshot';
	END IF;

	RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_agentic_chat_live_vision_policy()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_current_turn jsonb := NEW.prepared->'currentTurn';
	v_policy jsonb;
BEGIN
	-- Rolling compatibility: S3 and earlier artifacts have no liveVision key.
	IF v_current_turn IS NULL OR NOT (v_current_turn ? 'liveVision') THEN
		RETURN NEW;
	END IF;
	v_policy := v_current_turn->'liveVision';
	IF jsonb_typeof(COALESCE(v_policy, 'null'::jsonb)) <> 'object'
		OR jsonb_typeof(COALESCE(v_policy->'requested', 'null'::jsonb)) <> 'boolean'
		OR jsonb_typeof(COALESCE(v_policy->'maxImages', 'null'::jsonb)) <> 'number'
		OR COALESCE((v_policy->>'maxImages') !~ '^[1-9][0-9]*$', true)
		OR (v_policy->>'maxImages')::numeric > 16
		OR jsonb_typeof(COALESCE(v_policy->'maxImageBytes', 'null'::jsonb)) <> 'number'
		OR COALESCE((v_policy->>'maxImageBytes') !~ '^[1-9][0-9]*$', true)
		OR (v_policy->>'maxImageBytes')::numeric > 104857600
		OR jsonb_typeof(COALESCE(v_policy->'renderWidth', 'null'::jsonb)) <> 'number'
		OR COALESCE((v_policy->>'renderWidth') !~ '^[1-9][0-9]*$', true)
		OR (v_policy->>'renderWidth')::numeric > 8192
		OR jsonb_typeof(COALESCE(v_policy->'signedUrlTtlSeconds', 'null'::jsonb)) <> 'number'
		OR COALESCE((v_policy->>'signedUrlTtlSeconds') !~ '^[1-9][0-9]*$', true)
		OR (v_policy->>'signedUrlTtlSeconds')::numeric > 3600 THEN
		RAISE EXCEPTION 'agentic_chat_input_live_vision_policy_invalid';
	END IF;
	RETURN NEW;
EXCEPTION
	WHEN invalid_text_representation OR numeric_value_out_of_range THEN
		RAISE EXCEPTION 'agentic_chat_input_live_vision_policy_invalid';
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_agentic_chat_message_idempotency_key()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_request_role text;
	v_request_claims text;
	v_old_key text;
	v_new_key text;
	v_reserved_pattern constant text :=
		'^chat-turn:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(user|assistant)$';
BEGIN
	v_new_key := NEW.metadata->>'idempotency_key';
	IF TG_OP = 'UPDATE' THEN
		v_old_key := OLD.metadata->>'idempotency_key';
	END IF;

	IF COALESCE(v_new_key ~ v_reserved_pattern, false)
		OR COALESCE(v_old_key ~ v_reserved_pattern, false) THEN
		-- Preserve the signed request role through SECURITY DEFINER wrappers.
		v_request_claims := NULLIF(current_setting('request.jwt.claims', true), '');
		v_request_role := COALESCE(
			NULLIF(v_request_claims::jsonb->>'role', ''),
			current_user
		);
		IF v_request_role NOT IN ('service_role', 'postgres', 'supabase_admin')
			AND NOT (
				v_request_claims IS NULL
				AND EXISTS (
					SELECT 1
					FROM pg_roles roles
					WHERE roles.rolname = current_user
						AND roles.rolsuper
				)
			) THEN
			RAISE EXCEPTION 'agentic_chat_message_idempotency_key_reserved'
				USING ERRCODE = '42501';
		END IF;
	END IF;

	RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_agentic_chat_prepared_history_currency()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_prepared public.agentic_chat_prepared_prompts%ROWTYPE;
	v_history_state jsonb := NEW.prepared->'historyState';
	v_strategy text;
	v_compressed boolean;
	v_raw_history_count integer;
	v_history_for_model_count integer;
	v_expected_prepared_history jsonb;
BEGIN
	IF NEW.history_source = 'prepared_prompt' THEN
		IF NEW.source_prepared_prompt_id IS NULL THEN
			RAISE EXCEPTION 'agentic_chat_input_prepared_history_lineage_missing';
		END IF;

		SELECT prepared.*
		INTO v_prepared
		FROM public.agentic_chat_prepared_prompts AS prepared
		WHERE prepared.id = NEW.source_prepared_prompt_id
			AND prepared.session_id = NEW.session_id
			AND prepared.user_id = NEW.user_id;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'agentic_chat_input_prepared_history_scope_mismatch';
		END IF;
		IF EXISTS (
			SELECT 1
			FROM public.chat_messages AS message
			WHERE message.session_id = NEW.session_id
				AND message.user_id = NEW.user_id
				AND message.created_at > COALESCE(
					v_prepared.history_cutoff_at,
					v_prepared.created_at
				)
		) THEN
			RAISE EXCEPTION 'agentic_chat_input_prepared_history_stale';
		END IF;
	ELSIF NEW.history_source <> 'admission_window' THEN
		RAISE EXCEPTION 'agentic_chat_input_history_source_invalid';
	END IF;

	IF v_history_state IS NULL THEN
		RETURN NEW;
	END IF;
	IF jsonb_typeof(v_history_state) <> 'object'
		OR jsonb_typeof(COALESCE(v_history_state->'strategy', 'null'::jsonb)) <> 'string'
		OR v_history_state->>'strategy' NOT IN ('raw_history', 'continuity_only', 'compressed_history')
		OR jsonb_typeof(COALESCE(v_history_state->'compressed', 'null'::jsonb)) <> 'boolean'
		OR COALESCE((v_history_state->>'rawHistoryCount') !~ '^[0-9]+$', true)
		OR COALESCE((v_history_state->>'historyForModelCount') !~ '^[0-9]+$', true) THEN
		RAISE EXCEPTION 'agentic_chat_input_history_state_invalid';
	END IF;

	v_strategy := v_history_state->>'strategy';
	v_compressed := (v_history_state->>'compressed')::boolean;
	v_raw_history_count := (v_history_state->>'rawHistoryCount')::integer;
	v_history_for_model_count := (v_history_state->>'historyForModelCount')::integer;
	IF v_compressed IS DISTINCT FROM (v_strategy = 'compressed_history')
		OR v_raw_history_count < 0 OR v_raw_history_count > 50
		OR v_history_for_model_count < 0 OR v_history_for_model_count > 50
		OR v_history_for_model_count <> jsonb_array_length(NEW.history)
		OR (
			v_strategy = 'continuity_only'
			AND (v_raw_history_count <> 0 OR v_history_for_model_count <> 1)
		) THEN
		RAISE EXCEPTION 'agentic_chat_input_history_state_invalid';
	END IF;

	IF NEW.history_source = 'prepared_prompt' THEN
		IF jsonb_typeof(v_prepared.history_for_model) <> 'array'
			OR jsonb_array_length(v_prepared.history_for_model) > 50
			OR EXISTS (
				SELECT 1
				FROM jsonb_array_elements(v_prepared.history_for_model) AS history_item(value)
				WHERE jsonb_typeof(history_item.value) <> 'object'
					OR jsonb_typeof(COALESCE(history_item.value->'role', 'null'::jsonb)) <> 'string'
					OR history_item.value->>'role' NOT IN ('user', 'assistant', 'system', 'tool')
					OR jsonb_typeof(COALESCE(history_item.value->'content', 'null'::jsonb)) <> 'string'
					OR NOT public.agentic_chat_frozen_attachments_v1_are_valid(
						COALESCE(history_item.value->'attachments', '[]'::jsonb),
						true
					)
					OR (
						history_item.value ? 'tool_calls'
						AND jsonb_typeof(history_item.value->'tool_calls') <> 'array'
					)
					OR EXISTS (
						SELECT 1
						FROM jsonb_array_elements(
							CASE
								WHEN jsonb_typeof(history_item.value->'tool_calls') = 'array'
									THEN history_item.value->'tool_calls'
								ELSE '[]'::jsonb
							END
						) AS tool_call(value)
						WHERE jsonb_typeof(tool_call.value) <> 'object'
					)
					OR (
						history_item.value ? 'tool_call_id'
						AND jsonb_typeof(history_item.value->'tool_call_id') NOT IN ('string', 'null')
					)
			) THEN
			RAISE EXCEPTION 'agentic_chat_input_prepared_history_invalid';
		END IF;
		IF v_prepared.history_strategy IS DISTINCT FROM v_strategy
			OR v_prepared.history_compressed IS DISTINCT FROM v_compressed
			OR v_prepared.raw_history_count IS DISTINCT FROM v_raw_history_count
			OR v_prepared.history_for_model_count IS DISTINCT FROM v_history_for_model_count THEN
			RAISE EXCEPTION 'agentic_chat_input_prepared_history_state_mismatch';
		END IF;

		SELECT COALESCE(
			jsonb_agg(
				jsonb_build_object(
					'sourceMessageId', NULL,
					'role', history_item.value->>'role',
					'content', history_item.value->>'content',
					'attachments', COALESCE(
						(
							SELECT jsonb_agg(
								public.agentic_chat_normalize_frozen_attachment_v1(
									attachment.value,
									attachment.ordinality - 1,
									true
								)
								ORDER BY attachment.ordinality
							)
							FROM jsonb_array_elements(
								CASE
									WHEN jsonb_typeof(history_item.value->'attachments') = 'array'
										THEN history_item.value->'attachments'
									ELSE '[]'::jsonb
								END
							) WITH ORDINALITY AS attachment(value, ordinality)
						),
						'[]'::jsonb
					),
					'toolCalls', COALESCE(history_item.value->'tool_calls', '[]'::jsonb),
					'toolCallId', COALESCE(history_item.value->'tool_call_id', 'null'::jsonb)
				)
				ORDER BY history_item.ordinality
			),
			'[]'::jsonb
		)
		INTO v_expected_prepared_history
		FROM jsonb_array_elements(v_prepared.history_for_model)
			WITH ORDINALITY AS history_item(value, ordinality);
		IF NEW.history IS DISTINCT FROM v_expected_prepared_history THEN
			RAISE EXCEPTION 'agentic_chat_input_prepared_history_copy_mismatch';
		END IF;
	ELSIF NEW.source_prepared_prompt_id IS NOT NULL THEN
		RAISE EXCEPTION 'agentic_chat_input_admission_history_lineage_invalid';
	END IF;

	UPDATE public.chat_turn_runs AS turn_run
	SET history_strategy = v_strategy,
		history_compressed = v_compressed,
		raw_history_count = v_raw_history_count,
		history_for_model_count = v_history_for_model_count
	WHERE turn_run.id = NEW.turn_run_id
		AND turn_run.session_id = NEW.session_id
		AND turn_run.user_id = NEW.user_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_input_history_state_turn_scope_mismatch';
	END IF;

	RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_agentic_chat_signal_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_session_id uuid;
	v_user_id uuid;
	v_status text;
	v_cancel_requested_at timestamptz;
	v_cancel_reason text;
	v_execution_generation integer;
BEGIN
	SELECT
		turns.session_id,
		turns.user_id,
		turns.status,
		turns.cancel_requested_at,
		turns.cancel_reason,
		turns.execution_generation
	INTO
		v_session_id,
		v_user_id,
		v_status,
		v_cancel_requested_at,
		v_cancel_reason,
		v_execution_generation
	FROM public.chat_turn_runs turns
	WHERE turns.id = NEW.turn_run_id;

	IF NOT FOUND
		OR NEW.session_id IS DISTINCT FROM v_session_id
		OR NEW.user_id IS DISTINCT FROM v_user_id THEN
		RAISE EXCEPTION 'agentic_chat_signal_scope_mismatch';
	END IF;

	IF TG_OP = 'INSERT' THEN
		IF v_status <> 'running'
			OR v_cancel_requested_at IS NULL
			OR NEW.reason IS DISTINCT FROM v_cancel_reason THEN
			RAISE EXCEPTION 'agentic_chat_signal_without_matching_cancel_request';
		END IF;

		IF NEW.consumed_at IS NOT NULL OR NEW.consumed_by_generation IS NOT NULL THEN
			RAISE EXCEPTION 'agentic_chat_signal_must_start_unconsumed';
		END IF;
		RETURN NEW;
	END IF;

	IF NEW.id IS DISTINCT FROM OLD.id
		OR NEW.turn_run_id IS DISTINCT FROM OLD.turn_run_id
		OR NEW.session_id IS DISTINCT FROM OLD.session_id
		OR NEW.user_id IS DISTINCT FROM OLD.user_id
		OR NEW.signal_version IS DISTINCT FROM OLD.signal_version
		OR NEW.kind IS DISTINCT FROM OLD.kind
		OR NEW.reason IS DISTINCT FROM OLD.reason
		OR NEW.source IS DISTINCT FROM OLD.source
		OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
		RAISE EXCEPTION 'agentic_chat_signal_content_is_immutable';
	END IF;

	IF OLD.consumed_at IS NULL AND OLD.consumed_by_generation IS NULL THEN
		IF NEW.consumed_at IS NULL AND NEW.consumed_by_generation IS NULL THEN
			RETURN NEW;
		END IF;

		IF NEW.consumed_at IS NULL OR NEW.consumed_by_generation IS NULL THEN
			RAISE EXCEPTION 'agentic_chat_signal_consumption_must_be_atomic';
		END IF;

		IF NEW.consumed_by_generation IS DISTINCT FROM v_execution_generation THEN
			RAISE EXCEPTION 'agentic_chat_signal_stale_generation';
		END IF;
		RETURN NEW;
	END IF;

	IF NEW.consumed_at IS DISTINCT FROM OLD.consumed_at
		OR NEW.consumed_by_generation IS DISTINCT FROM OLD.consumed_by_generation THEN
		RAISE EXCEPTION 'agentic_chat_signal_consumption_is_immutable';
	END IF;

	RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_agentic_chat_stream_state_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_session_id uuid;
	v_user_id uuid;
	v_execution_generation integer;
BEGIN
	SELECT
		turns.session_id,
		turns.user_id,
		turns.execution_generation
	INTO
		v_session_id,
		v_user_id,
		v_execution_generation
	FROM public.chat_turn_runs turns
	WHERE turns.id = NEW.turn_run_id;

	IF NOT FOUND
		OR NEW.session_id IS DISTINCT FROM v_session_id
		OR NEW.user_id IS DISTINCT FROM v_user_id THEN
		RAISE EXCEPTION 'agentic_chat_stream_state_scope_mismatch';
	END IF;

	IF NEW.execution_generation IS DISTINCT FROM v_execution_generation THEN
		RAISE EXCEPTION 'agentic_chat_stream_state_generation_mismatch';
	END IF;

	IF TG_OP = 'UPDATE' THEN
		IF NEW.turn_run_id IS DISTINCT FROM OLD.turn_run_id
			OR NEW.session_id IS DISTINCT FROM OLD.session_id
			OR NEW.user_id IS DISTINCT FROM OLD.user_id
			OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
			RAISE EXCEPTION 'agentic_chat_stream_state_identity_is_immutable';
		END IF;

		IF NEW.execution_generation = OLD.execution_generation THEN
			IF NEW.snapshot_sequence < OLD.snapshot_sequence
				OR NEW.durable_through_sequence < OLD.durable_through_sequence
				OR NEW.projection_durable_sequence < OLD.projection_durable_sequence THEN
				RAISE EXCEPTION 'agentic_chat_stream_state_sequence_regression';
			END IF;

			IF left(NEW.assistant_text, char_length(OLD.assistant_text))
				IS DISTINCT FROM OLD.assistant_text THEN
				RAISE EXCEPTION 'agentic_chat_stream_state_prefix_regression';
			END IF;

			IF NEW.last_text_sequence IS NOT NULL
				AND OLD.last_text_sequence IS NOT NULL
				AND NEW.last_text_sequence < OLD.last_text_sequence THEN
				RAISE EXCEPTION 'agentic_chat_stream_state_text_receipt_regression';
			END IF;

			IF NEW.last_text_batch_id IS DISTINCT FROM OLD.last_text_batch_id
				AND OLD.last_text_sequence IS NOT NULL
				AND (
					NEW.last_text_sequence IS NULL
					OR NEW.last_text_sequence <= OLD.last_text_sequence
				) THEN
				RAISE EXCEPTION 'agentic_chat_stream_state_text_receipt_transition_invalid';
			END IF;
		ELSIF NEW.execution_generation = OLD.execution_generation + 1 THEN
			IF NEW.snapshot_sequence <> 0
				OR NEW.durable_through_sequence <> 0
				OR NEW.projection_durable_sequence <> 0
				OR NEW.assistant_text <> ''
				OR NEW.reconcile_required THEN
				RAISE EXCEPTION 'agentic_chat_stream_state_generation_reset_required';
			END IF;

			-- Existing claim/fencing code intentionally names only the original
			-- reset columns. Clear replay receipts here so the additive migration
			-- remains compatible with that already-hosted claim RPC.
			NEW.last_text_batch_id := NULL;
			NEW.last_text_sequence := NULL;
			NEW.last_text_end_bytes := NULL;
		ELSE
			RAISE EXCEPTION 'agentic_chat_stream_state_generation_transition_invalid';
		END IF;
	END IF;

	NEW.updated_at := GREATEST(clock_timestamp(), NEW.created_at);
	RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_agentic_chat_turn_event_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_session_id uuid;
	v_user_id uuid;
	v_stream_run_id text;
	v_execution_generation integer;
	v_expected_event_id text;
BEGIN
	IF TG_OP = 'UPDATE' THEN
		RAISE EXCEPTION 'agentic_chat_turn_event_is_immutable';
	END IF;

	SELECT
		turns.session_id,
		turns.user_id,
		turns.stream_run_id,
		turns.execution_generation
	INTO
		v_session_id,
		v_user_id,
		v_stream_run_id,
		v_execution_generation
	FROM public.chat_turn_runs turns
	WHERE turns.id = NEW.turn_run_id;

	IF NOT FOUND
		OR NEW.session_id IS DISTINCT FROM v_session_id
		OR NEW.user_id IS DISTINCT FROM v_user_id
		OR NEW.stream_run_id IS DISTINCT FROM v_stream_run_id THEN
		RAISE EXCEPTION 'agentic_chat_turn_event_scope_mismatch';
	END IF;

	IF NEW.execution_generation IS DISTINCT FROM v_execution_generation THEN
		RAISE EXCEPTION 'agentic_chat_turn_event_stale_generation';
	END IF;

	v_expected_event_id := NEW.turn_run_id::text
		|| ':' || NEW.execution_generation::text
		|| ':' || NEW.sequence_index::text;
	IF NEW.event_id IS NULL OR NEW.event_id = '' THEN
		NEW.event_id := v_expected_event_id;
	ELSIF NEW.event_id IS DISTINCT FROM v_expected_event_id THEN
		RAISE EXCEPTION 'agentic_chat_turn_event_identity_mismatch';
	END IF;

	RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_agentic_chat_turn_intent_snapshot_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
	v_intent jsonb := NEW.prepared->'turnIntent';
	v_operation jsonb;
	v_expected_name jsonb;
BEGIN
	IF NOT (NEW.prepared ? 'turnIntent') THEN
		RETURN NEW;
	END IF;
	IF NEW.artifact_version <> 'agentic_chat_input_v3'
		OR jsonb_typeof(v_intent) <> 'object'
		OR NOT v_intent ?& ARRAY[
			'version', 'requiresWrite', 'action', 'entityKind', 'operations',
			'source', 'originalRequestText', 'originatingTurnRunId',
			'clearPending', 'expectedWriteToolNames'
		]
		OR (v_intent - ARRAY[
			'version', 'requiresWrite', 'action', 'entityKind', 'operations',
			'source', 'originalRequestText', 'originatingTurnRunId',
			'clearPending', 'expectedWriteToolNames'
		]) <> '{}'::jsonb
		OR v_intent->>'version' <> '1'
		OR jsonb_typeof(v_intent->'requiresWrite') <> 'boolean'
		OR jsonb_typeof(v_intent->'clearPending') <> 'boolean'
		OR v_intent->>'entityKind' NOT IN (
			'document', 'task', 'project', 'event', 'goal', 'plan',
			'milestone', 'risk', 'unknown'
		)
		OR v_intent->>'source' NOT IN ('current_message', 'pending_continuation', 'none')
		OR jsonb_typeof(v_intent->'operations') <> 'array'
		OR jsonb_array_length(v_intent->'operations') > 16
		OR jsonb_typeof(v_intent->'expectedWriteToolNames') <> 'array'
		OR jsonb_array_length(v_intent->'expectedWriteToolNames') > 16
		OR NOT (
			jsonb_typeof(v_intent->'action') = 'null'
			OR (
				jsonb_typeof(v_intent->'action') = 'string'
				AND v_intent->>'action' IN (
					'create', 'update', 'delete', 'organize', 'link', 'unlink'
				)
			)
		)
		OR NOT (
			jsonb_typeof(v_intent->'originalRequestText') = 'null'
			OR (
				jsonb_typeof(v_intent->'originalRequestText') = 'string'
				AND length(v_intent->>'originalRequestText') BETWEEN 1 AND 1200
				AND v_intent->>'originalRequestText' = btrim(v_intent->>'originalRequestText')
			)
		)
		OR NOT (
			jsonb_typeof(v_intent->'originatingTurnRunId') = 'null'
			OR (
				jsonb_typeof(v_intent->'originatingTurnRunId') = 'string'
				AND length(v_intent->>'originatingTurnRunId') BETWEEN 1 AND 128
				AND v_intent->>'originatingTurnRunId'
					= btrim(v_intent->>'originatingTurnRunId')
			)
		) THEN
		RAISE EXCEPTION 'agentic_chat_turn_intent_invalid_snapshot';
	END IF;

	FOR v_operation IN SELECT value FROM jsonb_array_elements(v_intent->'operations')
	LOOP
		IF jsonb_typeof(v_operation) <> 'object'
			OR NOT v_operation ?& ARRAY['action', 'entityKind']
			OR (v_operation - ARRAY['action', 'entityKind']) <> '{}'::jsonb
			OR v_operation->>'action' NOT IN (
				'create', 'update', 'delete', 'organize', 'link', 'unlink'
			)
			OR v_operation->>'entityKind' NOT IN (
				'document', 'task', 'project', 'event', 'goal', 'plan',
				'milestone', 'risk', 'unknown'
			) THEN
			RAISE EXCEPTION 'agentic_chat_turn_intent_invalid_snapshot';
		END IF;
	END LOOP;

	FOR v_expected_name IN
		SELECT value FROM jsonb_array_elements(v_intent->'expectedWriteToolNames')
	LOOP
		IF jsonb_typeof(v_expected_name) <> 'string'
			OR v_expected_name#>>'{}' !~ '^[a-z][a-z0-9_]{0,127}$' THEN
			RAISE EXCEPTION 'agentic_chat_turn_intent_invalid_snapshot';
		END IF;
	END LOOP;
	IF (
		SELECT count(*) <> count(DISTINCT value)
		FROM jsonb_array_elements(v_intent->'expectedWriteToolNames')
	) OR public.agentic_chat_expected_write_tool_names_v1(v_intent)
		IS DISTINCT FROM v_intent->'expectedWriteToolNames' THEN
		RAISE EXCEPTION 'agentic_chat_turn_intent_invalid_expected_tools';
	END IF;

	IF (v_intent->>'requiresWrite')::boolean THEN
		IF jsonb_typeof(v_intent->'action') <> 'string'
			OR v_intent->>'source' = 'none'
			OR jsonb_array_length(v_intent->'operations') = 0
			OR (v_intent->>'clearPending')::boolean THEN
			RAISE EXCEPTION 'agentic_chat_turn_intent_invalid_write_snapshot';
		END IF;
	ELSE
		IF jsonb_typeof(v_intent->'action') <> 'null'
			OR v_intent->>'entityKind' <> 'unknown'
			OR jsonb_array_length(v_intent->'operations') <> 0
			OR v_intent->>'source' <> 'none'
			OR jsonb_typeof(v_intent->'originalRequestText') <> 'null'
			OR jsonb_typeof(v_intent->'originatingTurnRunId') <> 'null'
			OR jsonb_array_length(v_intent->'expectedWriteToolNames') <> 0 THEN
			RAISE EXCEPTION 'agentic_chat_turn_intent_invalid_read_snapshot';
		END IF;
	END IF;

	RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.actor_has_project_member_access(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actor_has_project_member_access(uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.add_queue_job(uuid, text, jsonb, integer, timestamp with time zone, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_queue_job(uuid, text, jsonb, integer, timestamp with time zone, text) TO service_role;
REVOKE ALL ON FUNCTION public.agentic_chat_contract_effect_target_id_v1(text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agentic_chat_contract_tool_semantics_v1(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agentic_chat_domain_reference_map_v1_is_valid(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agentic_chat_domain_reference_map_v1_is_valid(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.agentic_chat_expected_write_tool_names_v1(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agentic_chat_expected_write_tool_names_v1(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.agentic_chat_frozen_attachment_v1_is_valid(jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agentic_chat_frozen_attachment_v1_is_valid(jsonb, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.agentic_chat_frozen_attachments_v1_are_valid(jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agentic_chat_frozen_attachments_v1_are_valid(jsonb, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.agentic_chat_jsonb_array_of_objects_v1_is_valid(jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agentic_chat_jsonb_array_of_objects_v1_is_valid(jsonb, integer) TO service_role;
REVOKE ALL ON FUNCTION public.agentic_chat_merge_domain_gap_v1(jsonb, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agentic_chat_merge_domain_gap_v1(jsonb, jsonb, text) TO service_role;
REVOKE ALL ON FUNCTION public.agentic_chat_merge_domain_ids_v1(jsonb, jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agentic_chat_merge_domain_ids_v1(jsonb, jsonb, integer) TO service_role;
REVOKE ALL ON FUNCTION public.agentic_chat_merge_used_domain_signal_v1(jsonb, jsonb, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agentic_chat_merge_used_domain_signal_v1(jsonb, jsonb, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.agentic_chat_normalize_frozen_attachment_v1(jsonb, bigint, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agentic_chat_normalize_frozen_attachment_v1(jsonb, bigint, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.apply_agentic_chat_terminal_domain_metadata_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_agentic_chat_terminal_pending_contract_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attach_voice_note_group_from_chat_message() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_voice_note_group_from_chat_message() TO service_role;
REVOKE ALL ON FUNCTION public.begin_agentic_chat_turn_execution(uuid, uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.begin_agentic_chat_turn_execution(uuid, uuid, uuid, integer) TO service_role;
REVOKE ALL ON FUNCTION public.claim_agentic_chat_resume_checkpoint_for_artifact() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_agentic_chat_resume_checkpoint_for_artifact() TO service_role;
REVOKE ALL ON FUNCTION public.claim_agentic_chat_turn(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_agentic_chat_turn(uuid, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.cleanup_agentic_chat_worker_artifacts(integer, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_agentic_chat_worker_artifacts(integer, integer, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.create_agentic_chat_turn_with_job(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, uuid, uuid, text, uuid, uuid, text, boolean, text, jsonb, text, text, jsonb, integer, text, jsonb, jsonb, text, integer, integer, uuid, text, text, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_agentic_chat_turn_with_job(uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, uuid, uuid, text, uuid, uuid, text, boolean, text, jsonb, text, text, jsonb, integer, text, jsonb, jsonb, text, integer, integer, uuid, text, text, jsonb, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.enforce_agentic_chat_control_row_retention() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_agentic_chat_control_row_retention() TO service_role;
REVOKE ALL ON FUNCTION public.enforce_agentic_chat_effect_transition() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_agentic_chat_effect_transition() TO service_role;
REVOKE ALL ON FUNCTION public.finalize_agentic_chat_turn(uuid, uuid, uuid, uuid, integer, text, text, text, uuid, text, jsonb, integer, integer, integer, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_agentic_chat_turn(uuid, uuid, uuid, uuid, integer, text, text, text, uuid, text, jsonb, integer, integer, integer, jsonb, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.link_agentic_chat_worker_message_attachments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_agentic_chat_worker_message_attachments() TO service_role;
REVOKE ALL ON FUNCTION public.persist_agentic_chat_semantic_event(uuid, uuid, uuid, integer, uuid, text, text, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.persist_agentic_chat_semantic_event(uuid, uuid, uuid, integer, uuid, text, text, text, jsonb, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.persist_agentic_chat_text_batch(uuid, uuid, uuid, integer, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.persist_agentic_chat_text_batch(uuid, uuid, uuid, integer, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.reconcile_agentic_chat_turn(uuid, uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_agentic_chat_turn(uuid, uuid, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.record_agentic_chat_effect_uncertain_reconciliation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_agentic_chat_effect_uncertain_reconciliation() TO service_role;
REVOKE ALL ON FUNCTION public.recover_agentic_chat_turn(uuid, uuid, uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recover_agentic_chat_turn(uuid, uuid, uuid, integer, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.reject_active_agentic_chat_input_artifact_delete() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_active_agentic_chat_input_artifact_delete() TO service_role;
REVOKE ALL ON FUNCTION public.reject_agentic_chat_execution_mode_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_agentic_chat_execution_mode_change() TO service_role;
REVOKE ALL ON FUNCTION public.reject_agentic_chat_input_artifact_update() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_agentic_chat_input_artifact_update() TO service_role;
REVOKE ALL ON FUNCTION public.reject_protected_agentic_chat_effect_delete() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_protected_agentic_chat_effect_delete() TO service_role;
REVOKE ALL ON FUNCTION public.request_agentic_chat_turn_cancel(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_agentic_chat_turn_cancel(uuid, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.resolve_agentic_chat_resume_checkpoint_on_terminal() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_agentic_chat_resume_checkpoint_on_terminal() TO service_role;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;
REVOKE ALL ON FUNCTION public.update_chat_session_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_chat_session_stats() TO anon;
GRANT EXECUTE ON FUNCTION public.update_chat_session_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_chat_session_stats() TO service_role;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO anon;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;
REVOKE ALL ON FUNCTION public.validate_agentic_chat_attachment_contract() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_agentic_chat_attachment_contract() TO service_role;
REVOKE ALL ON FUNCTION public.validate_agentic_chat_domain_metadata_snapshot_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_agentic_chat_input_artifact_link() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_agentic_chat_input_artifact_link() TO service_role;
REVOKE ALL ON FUNCTION public.validate_agentic_chat_input_artifact_version() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_agentic_chat_input_artifact_version() TO service_role;
REVOKE ALL ON FUNCTION public.validate_agentic_chat_live_vision_policy() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_agentic_chat_live_vision_policy() TO service_role;
REVOKE ALL ON FUNCTION public.validate_agentic_chat_message_idempotency_key() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_agentic_chat_message_idempotency_key() TO service_role;
REVOKE ALL ON FUNCTION public.validate_agentic_chat_prepared_history_currency() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_agentic_chat_prepared_history_currency() TO service_role;
REVOKE ALL ON FUNCTION public.validate_agentic_chat_signal_write() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_agentic_chat_signal_write() TO service_role;
REVOKE ALL ON FUNCTION public.validate_agentic_chat_stream_state_write() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_agentic_chat_stream_state_write() TO service_role;
REVOKE ALL ON FUNCTION public.validate_agentic_chat_turn_event_write() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_agentic_chat_turn_event_write() TO service_role;
REVOKE ALL ON FUNCTION public.validate_agentic_chat_turn_intent_snapshot_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_agentic_chat_turn_intent_snapshot_v1() TO service_role;

CREATE TRIGGER attach_voice_note_group_from_chat_message AFTER INSERT ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION attach_voice_note_group_from_chat_message();
CREATE TRIGGER trg_chat_messages_agentic_chat_idempotency BEFORE INSERT OR UPDATE ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION validate_agentic_chat_message_idempotency_key();
CREATE TRIGGER trg_chat_messages_link_worker_attachments AFTER INSERT ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION link_agentic_chat_worker_message_attachments();
CREATE TRIGGER update_session_stats_on_message AFTER INSERT ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION update_chat_session_stats();
CREATE TRIGGER update_queue_jobs_updated_at BEFORE UPDATE ON public.queue_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_chat_turn_runs_checkpoint_resume_terminal AFTER UPDATE OF status ON public.chat_turn_runs FOR EACH ROW EXECUTE FUNCTION resolve_agentic_chat_resume_checkpoint_on_terminal();
CREATE TRIGGER trg_chat_turn_runs_execution_mode_immutable BEFORE UPDATE OF execution_mode ON public.chat_turn_runs FOR EACH ROW EXECUTE FUNCTION reject_agentic_chat_execution_mode_change();
CREATE CONSTRAINT TRIGGER trg_chat_turn_runs_input_artifact_scope AFTER INSERT OR UPDATE ON public.chat_turn_runs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_agentic_chat_input_artifact_link();
CREATE TRIGGER trg_chat_turn_runs_terminal_domain_metadata AFTER UPDATE OF status ON public.chat_turn_runs FOR EACH ROW WHEN ((old.status IS DISTINCT FROM new.status)) EXECUTE FUNCTION apply_agentic_chat_terminal_domain_metadata_v1();
CREATE TRIGGER trg_chat_turn_runs_terminal_pending_contract AFTER UPDATE OF status ON public.chat_turn_runs FOR EACH ROW WHEN ((old.status IS DISTINCT FROM new.status)) EXECUTE FUNCTION apply_agentic_chat_terminal_pending_contract_v1();
CREATE TRIGGER trg_chat_turn_runs_updated BEFORE UPDATE ON public.chat_turn_runs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_chat_turn_input_artifacts_active_retention BEFORE DELETE ON public.chat_turn_input_artifacts FOR EACH ROW EXECUTE FUNCTION reject_active_agentic_chat_input_artifact_delete();
CREATE TRIGGER trg_chat_turn_input_artifacts_attachment_contract BEFORE INSERT ON public.chat_turn_input_artifacts FOR EACH ROW EXECUTE FUNCTION validate_agentic_chat_attachment_contract();
CREATE TRIGGER trg_chat_turn_input_artifacts_checkpoint_resume BEFORE INSERT ON public.chat_turn_input_artifacts FOR EACH ROW EXECUTE FUNCTION claim_agentic_chat_resume_checkpoint_for_artifact();
CREATE TRIGGER trg_chat_turn_input_artifacts_immutable BEFORE UPDATE ON public.chat_turn_input_artifacts FOR EACH ROW EXECUTE FUNCTION reject_agentic_chat_input_artifact_update();
CREATE TRIGGER trg_chat_turn_input_artifacts_live_vision_policy BEFORE INSERT ON public.chat_turn_input_artifacts FOR EACH ROW EXECUTE FUNCTION validate_agentic_chat_live_vision_policy();
CREATE TRIGGER trg_chat_turn_input_artifacts_prepared_history_currency BEFORE INSERT ON public.chat_turn_input_artifacts FOR EACH ROW EXECUTE FUNCTION validate_agentic_chat_prepared_history_currency();
CREATE TRIGGER trg_chat_turn_input_artifacts_version BEFORE INSERT ON public.chat_turn_input_artifacts FOR EACH ROW EXECUTE FUNCTION validate_agentic_chat_input_artifact_version();
CREATE TRIGGER trg_chat_turn_input_artifacts_z_turn_intent BEFORE INSERT ON public.chat_turn_input_artifacts FOR EACH ROW EXECUTE FUNCTION validate_agentic_chat_turn_intent_snapshot_v1();
CREATE TRIGGER trg_chat_turn_input_artifacts_zz_domain_metadata BEFORE INSERT ON public.chat_turn_input_artifacts FOR EACH ROW EXECUTE FUNCTION validate_agentic_chat_domain_metadata_snapshot_v1();
CREATE TRIGGER trg_chat_turn_stream_state_retention BEFORE DELETE ON public.chat_turn_stream_state FOR EACH ROW EXECUTE FUNCTION enforce_agentic_chat_control_row_retention();
CREATE TRIGGER trg_chat_turn_stream_state_validate BEFORE INSERT OR UPDATE ON public.chat_turn_stream_state FOR EACH ROW EXECUTE FUNCTION validate_agentic_chat_stream_state_write();
CREATE TRIGGER trg_chat_turn_events_retention BEFORE DELETE ON public.chat_turn_events FOR EACH ROW EXECUTE FUNCTION enforce_agentic_chat_control_row_retention();
CREATE TRIGGER trg_chat_turn_events_validate BEFORE INSERT OR UPDATE ON public.chat_turn_events FOR EACH ROW EXECUTE FUNCTION validate_agentic_chat_turn_event_write();
CREATE TRIGGER trg_chat_turn_effects_protected_delete BEFORE DELETE ON public.chat_turn_effects FOR EACH ROW EXECUTE FUNCTION reject_protected_agentic_chat_effect_delete();
CREATE TRIGGER trg_chat_turn_effects_transition BEFORE INSERT OR UPDATE ON public.chat_turn_effects FOR EACH ROW EXECUTE FUNCTION enforce_agentic_chat_effect_transition();
CREATE TRIGGER zz_trg_chat_turn_effects_uncertain_reconciliation BEFORE UPDATE ON public.chat_turn_effects FOR EACH ROW EXECUTE FUNCTION record_agentic_chat_effect_uncertain_reconciliation();
CREATE TRIGGER trg_chat_turn_signals_retention BEFORE DELETE ON public.chat_turn_signals FOR EACH ROW EXECUTE FUNCTION enforce_agentic_chat_control_row_retention();
CREATE TRIGGER trg_chat_turn_signals_validate BEFORE INSERT OR UPDATE ON public.chat_turn_signals FOR EACH ROW EXECUTE FUNCTION validate_agentic_chat_signal_write();

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can create their own chat sessions" ON public.chat_sessions FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete their own chat sessions" ON public.chat_sessions FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "Users can update their own chat sessions" ON public.chat_sessions FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id));
CREATE POLICY "Users can view their own chat sessions" ON public.chat_sessions FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));
GRANT INSERT, SELECT, UPDATE, DELETE ON TABLE public.chat_sessions TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE ON TABLE public.chat_sessions TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.chat_sessions TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can create messages in their sessions" ON public.chat_messages FOR INSERT TO PUBLIC WITH CHECK ((EXISTS ( SELECT 1
   FROM chat_sessions
  WHERE ((chat_sessions.id = chat_messages.session_id) AND (chat_sessions.user_id = auth.uid())))));
CREATE POLICY "Users can view messages in their sessions" ON public.chat_messages FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM chat_sessions
  WHERE ((chat_sessions.id = chat_messages.session_id) AND (chat_sessions.user_id = auth.uid())))));
GRANT INSERT, SELECT, UPDATE, DELETE ON TABLE public.chat_messages TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE ON TABLE public.chat_messages TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.chat_messages TO service_role;
ALTER TABLE public.queue_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "queue_jobs_delete" ON public.queue_jobs FOR DELETE TO authenticated USING (((user_id = auth.uid()) OR is_admin()));
CREATE POLICY "queue_jobs_libri_worker_insert" ON public.queue_jobs FOR INSERT TO libri_worker WITH CHECK ((job_type = ANY (ARRAY['libri_ingest'::queue_type, 'libri_research'::queue_type, 'libri_derive'::queue_type, 'libri_maintenance'::queue_type])));
CREATE POLICY "queue_jobs_libri_worker_select" ON public.queue_jobs FOR SELECT TO libri_worker USING ((job_type = ANY (ARRAY['libri_ingest'::queue_type, 'libri_research'::queue_type, 'libri_derive'::queue_type, 'libri_maintenance'::queue_type])));
CREATE POLICY "queue_jobs_libri_worker_update" ON public.queue_jobs FOR UPDATE TO libri_worker USING ((job_type = ANY (ARRAY['libri_ingest'::queue_type, 'libri_research'::queue_type, 'libri_derive'::queue_type, 'libri_maintenance'::queue_type]))) WITH CHECK ((job_type = ANY (ARRAY['libri_ingest'::queue_type, 'libri_research'::queue_type, 'libri_derive'::queue_type, 'libri_maintenance'::queue_type])));
CREATE POLICY "queue_jobs_select" ON public.queue_jobs FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR is_admin()));
CREATE POLICY "queue_jobs_update" ON public.queue_jobs FOR UPDATE TO authenticated USING (((user_id = auth.uid()) OR is_admin())) WITH CHECK (((user_id = auth.uid()) OR is_admin()));
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.queue_jobs TO service_role;
GRANT SELECT, UPDATE, DELETE ON TABLE public.queue_jobs TO authenticated;
ALTER TABLE public.chat_turn_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_turn_runs_admin_select" ON public.chat_turn_runs FOR SELECT TO authenticated USING (is_admin());
GRANT SELECT ON TABLE public.chat_turn_runs TO anon;
GRANT SELECT ON TABLE public.chat_turn_runs TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.chat_turn_runs TO service_role;
ALTER TABLE public.chat_turn_input_artifacts ENABLE ROW LEVEL SECURITY;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.chat_turn_input_artifacts TO service_role;
ALTER TABLE public.chat_turn_stream_state ENABLE ROW LEVEL SECURITY;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.chat_turn_stream_state TO service_role;
ALTER TABLE public.chat_turn_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_turn_events_admin_select" ON public.chat_turn_events FOR SELECT TO authenticated USING (is_admin());
GRANT SELECT ON TABLE public.chat_turn_events TO anon;
GRANT SELECT ON TABLE public.chat_turn_events TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.chat_turn_events TO service_role;
ALTER TABLE public.chat_turn_effects ENABLE ROW LEVEL SECURITY;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.chat_turn_effects TO service_role;
ALTER TABLE public.chat_turn_signals ENABLE ROW LEVEL SECURITY;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.chat_turn_signals TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
REVOKE ALL ON TABLE public.chat_turn_input_artifacts, public.chat_turn_stream_state, public.chat_turn_effects, public.chat_turn_signals FROM anon, authenticated;
RESET check_function_bodies;
RESET client_min_messages;
