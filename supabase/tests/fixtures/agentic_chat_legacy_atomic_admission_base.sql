-- supabase/tests/fixtures/agentic_chat_legacy_atomic_admission_base.sql
CREATE SCHEMA IF NOT EXISTS public;

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
		CREATE ROLE anon NOLOGIN;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
		CREATE ROLE authenticated NOLOGIN;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
		CREATE ROLE service_role NOLOGIN;
	END IF;
END;
$$;

CREATE TABLE public.users (
	id uuid PRIMARY KEY
);

CREATE TABLE public.chat_sessions (
	id uuid PRIMARY KEY,
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	context_type text NOT NULL,
	status text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
	updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE public.chat_messages (
	id uuid PRIMARY KEY,
	session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	role text NOT NULL,
	content text NOT NULL,
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
	updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE public.chat_turn_runs (
	id uuid PRIMARY KEY,
	session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	stream_run_id text NOT NULL UNIQUE,
	client_turn_id text NULL,
	source text NOT NULL DEFAULT 'live_ui',
	context_type text NOT NULL,
	entity_id uuid NULL,
	project_id uuid NULL,
	gateway_enabled boolean NOT NULL DEFAULT true,
	request_message text NOT NULL,
	status text NOT NULL,
	request_prewarmed_context boolean NOT NULL DEFAULT false,
	started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
	last_progress_at timestamptz NULL,
	user_message_id uuid NULL REFERENCES public.chat_messages(id) ON DELETE SET NULL,
	finished_reason text NULL,
	finished_at timestamptz NULL,
	created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
	updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
	CONSTRAINT chk_chat_turn_runs_status
		CHECK (status IN ('running', 'completed', 'failed', 'cancelled'))
);

CREATE UNIQUE INDEX uq_chat_turn_runs_one_running_per_session
	ON public.chat_turn_runs(session_id)
	WHERE status = 'running';

CREATE TABLE public.onto_assets (
	id uuid PRIMARY KEY,
	project_id uuid NULL,
	original_filename text NULL,
	content_type text NULL,
	file_size_bytes bigint NULL,
	width integer NULL,
	height integer NULL,
	checksum_sha256 text NULL,
	ocr_status text NULL,
	extraction_summary text NULL,
	extracted_text text NULL
);

CREATE TABLE public.chat_message_attachments (
	id uuid PRIMARY KEY,
	message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
	session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
	asset_id uuid NULL REFERENCES public.onto_assets(id) ON DELETE SET NULL,
	project_id uuid NULL,
	attachment_kind text NOT NULL,
	media_type text NULL,
	role text NULL,
	display_order integer NOT NULL DEFAULT 0,
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.chat_tool_executions (
	id uuid PRIMARY KEY,
	message_id uuid NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
	tool_name text NOT NULL,
	gateway_op text NULL,
	sequence_index integer NOT NULL,
	success boolean NOT NULL,
	error_message text NULL,
	arguments jsonb NULL,
	result jsonb NULL,
	created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
