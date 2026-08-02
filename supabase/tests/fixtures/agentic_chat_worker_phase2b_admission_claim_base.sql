-- supabase/tests/fixtures/agentic_chat_worker_phase2b_admission_claim_base.sql
-- Minimal pre-Slice-3A fixture for atomic worker admission/claim verification.
\ir agentic_chat_worker_phase2b_effect_base.sql

-- The historical fixtures intentionally model only columns used by their own
-- package. These columns already exist on the hosted schema and are needed by
-- the worker admission contract.
ALTER TABLE public.chat_sessions
	ADD COLUMN entity_id uuid,
	ADD COLUMN agent_metadata jsonb;

ALTER TABLE public.chat_sessions
	ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.chat_turn_runs
	ADD COLUMN prepared_prompt_id uuid REFERENCES public.agentic_chat_prepared_prompts(id) ON DELETE SET NULL,
	ADD COLUMN prepared_prompt_hit boolean,
	ADD COLUMN prepared_prompt_miss_reason text,
	ADD COLUMN prepared_surface_profile text,
	ADD COLUMN assistant_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL;

ALTER TABLE public.agentic_chat_prepared_prompts
	ADD COLUMN conversation_summary text,
	ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- Hosted Supabase grants service_role access to legacy application tables;
-- the small historical fixture does not model those default grants.
GRANT SELECT, INSERT, UPDATE, DELETE
	ON TABLE public.chat_sessions, public.chat_messages
	TO service_role;
