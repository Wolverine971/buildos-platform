-- supabase/tests/fixtures/agentic_chat_p3_live_vision_base.sql
-- Hosted-column overlay needed by the Slice 12/16 lifecycle views in the
-- compact disposable P3 fixture.

ALTER TABLE public.chat_turn_runs
	ADD COLUMN IF NOT EXISTS cache_source text,
	ADD COLUMN IF NOT EXISTS cache_age_seconds numeric,
	ADD COLUMN IF NOT EXISTS request_prewarmed_context boolean,
	ADD COLUMN IF NOT EXISTS prompt_snapshot_id uuid;

ALTER TABLE public.chat_prompt_snapshots
	ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
	ADD COLUMN IF NOT EXISTS snapshot_version text NOT NULL DEFAULT 'fastchat_prompt_v1',
	ADD COLUMN IF NOT EXISTS system_prompt text NOT NULL DEFAULT '',
	ADD COLUMN IF NOT EXISTS model_messages jsonb NOT NULL DEFAULT '[]'::jsonb,
	ADD COLUMN IF NOT EXISTS tool_definitions jsonb,
	ADD COLUMN IF NOT EXISTS request_payload jsonb,
	ADD COLUMN IF NOT EXISTS prompt_sections jsonb,
	ADD COLUMN IF NOT EXISTS context_payload jsonb,
	ADD COLUMN IF NOT EXISTS rendered_dump_text text,
	ADD COLUMN IF NOT EXISTS system_prompt_sha256 text NOT NULL DEFAULT repeat('0', 64),
	ADD COLUMN IF NOT EXISTS messages_sha256 text NOT NULL DEFAULT repeat('0', 64),
	ADD COLUMN IF NOT EXISTS tools_sha256 text,
	ADD COLUMN IF NOT EXISTS system_prompt_chars integer NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS message_chars integer NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS approx_prompt_tokens integer,
	ADD COLUMN IF NOT EXISTS prompt_variant text NOT NULL DEFAULT 'fastchat_lite_v1',
	ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT clock_timestamp();
