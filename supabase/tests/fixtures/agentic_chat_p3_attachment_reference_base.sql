-- supabase/tests/fixtures/agentic_chat_p3_attachment_reference_base.sql
-- Minimal hosted-column overlay for P3 attachment-reference verification.
\ir agentic_chat_worker_phase2b_admission_claim_base.sql

ALTER TABLE public.onto_assets
	ADD COLUMN kind text NOT NULL DEFAULT 'image',
	ADD COLUMN storage_bucket text,
	ADD COLUMN storage_path text,
	ADD COLUMN deleted_at timestamptz;

ALTER TABLE public.chat_message_attachments
	ADD COLUMN user_id uuid REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.chat_message_attachments
	ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.agentic_chat_prepared_prompts
	ADD COLUMN cache_key text NOT NULL DEFAULT 'fixture-cache-key',
	ADD COLUMN nonce_sha256 text NOT NULL DEFAULT repeat('a', 64),
	ADD COLUMN context_cache_version integer NOT NULL DEFAULT 1,
	ADD COLUMN history_strategy text,
	ADD COLUMN history_compressed boolean,
	ADD COLUMN raw_history_count integer,
	ADD COLUMN history_for_model_count integer,
	ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.chat_turn_runs
	ADD COLUMN history_strategy text,
	ADD COLUMN history_compressed boolean,
	ADD COLUMN raw_history_count integer,
	ADD COLUMN history_for_model_count integer;

GRANT SELECT, INSERT, UPDATE, DELETE
	ON TABLE public.onto_assets, public.chat_message_attachments
	TO service_role;
