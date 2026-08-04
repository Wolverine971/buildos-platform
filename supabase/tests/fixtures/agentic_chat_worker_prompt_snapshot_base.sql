-- supabase/tests/fixtures/agentic_chat_worker_prompt_snapshot_base.sql
-- Minimal hosted-shape extension for the Phase 4 worker prompt-snapshot RPC.
\ir agentic_chat_worker_phase2b_admission_claim_base.sql

-- The historical Phase 2B fixture predates the worker execution columns and
-- immutable artifact table. Model the hosted columns consumed by Slice 7 so
-- this contract can run from a genuinely empty disposable database instead of
-- depending on state left behind by earlier migration tests.
ALTER TYPE public.queue_type ADD VALUE 'agentic_chat_turn';

ALTER TABLE public.chat_turn_runs
	ADD COLUMN execution_mode text NOT NULL DEFAULT 'legacy_sse',
	ADD COLUMN request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
	ADD COLUMN request_payload_version text NOT NULL DEFAULT 'legacy_v1',
	ADD COLUMN queue_job_id uuid REFERENCES public.queue_jobs(id) ON DELETE SET NULL,
	ADD COLUMN correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
	ADD COLUMN execution_generation integer NOT NULL DEFAULT 0,
	ADD COLUMN cancel_requested_at timestamptz,
	ADD COLUMN cancel_reason text,
	ADD COLUMN worker_started_at timestamptz,
	ADD COLUMN execution_started_at timestamptz,
	ADD COLUMN history_cutoff_at timestamptz,
	ADD COLUMN last_event_sequence integer NOT NULL DEFAULT 0,
	ADD COLUMN terminal_event_id text,
	ADD COLUMN terminalized_at timestamptz,
	ADD COLUMN prompt_snapshot_id uuid;

CREATE TABLE public.chat_turn_input_artifacts (
	id uuid PRIMARY KEY,
	turn_run_id uuid NOT NULL UNIQUE REFERENCES public.chat_turn_runs(id) ON DELETE CASCADE,
	session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	source_prepared_prompt_id uuid,
	artifact_version text NOT NULL
		CHECK (artifact_version IN ('agentic_chat_input_v2', 'agentic_chat_input_v3')),
	history_source text NOT NULL
		CHECK (history_source IN ('admission_window', 'prepared_prompt')),
	history jsonb NOT NULL CHECK (jsonb_typeof(history) = 'array'),
	prepared jsonb NOT NULL CHECK (jsonb_typeof(prepared) = 'object'),
	content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
	history_bytes integer NOT NULL CHECK (history_bytes >= 0),
	content_bytes integer NOT NULL CHECK (content_bytes > 0),
	created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
	retain_until timestamptz NOT NULL
);

ALTER TABLE public.chat_turn_runs
	ADD COLUMN input_artifact_id uuid
		REFERENCES public.chat_turn_input_artifacts(id) ON DELETE RESTRICT;

GRANT SELECT, INSERT, DELETE ON TABLE public.chat_turn_input_artifacts TO service_role;

ALTER TABLE public.chat_prompt_snapshots
	ADD COLUMN session_id uuid REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
	ADD COLUMN snapshot_version text NOT NULL DEFAULT 'fastchat_prompt_v1',
	ADD COLUMN system_prompt text NOT NULL DEFAULT '',
	ADD COLUMN model_messages jsonb NOT NULL DEFAULT '[]'::jsonb,
	ADD COLUMN tool_definitions jsonb,
	ADD COLUMN request_payload jsonb,
	ADD COLUMN prompt_sections jsonb,
	ADD COLUMN context_payload jsonb,
	ADD COLUMN rendered_dump_text text,
	ADD COLUMN system_prompt_sha256 text NOT NULL DEFAULT repeat('0', 64),
	ADD COLUMN messages_sha256 text NOT NULL DEFAULT repeat('0', 64),
	ADD COLUMN tools_sha256 text,
	ADD COLUMN system_prompt_chars integer NOT NULL DEFAULT 0,
	ADD COLUMN message_chars integer NOT NULL DEFAULT 0,
	ADD COLUMN approx_prompt_tokens integer,
	ADD COLUMN prompt_variant text NOT NULL DEFAULT 'fastchat_lite_v1',
	ADD COLUMN created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
	ADD CONSTRAINT uq_chat_prompt_snapshots_turn_run_id UNIQUE (turn_run_id);

ALTER TABLE public.chat_prompt_snapshots
	ALTER COLUMN session_id SET NOT NULL;
