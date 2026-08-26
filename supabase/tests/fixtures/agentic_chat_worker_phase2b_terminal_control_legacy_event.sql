-- supabase/tests/fixtures/agentic_chat_worker_phase2b_terminal_control_legacy_event.sql
-- Bring the intentionally small historical fixture up to the hosted columns
-- used by Slice 4, then leave one pre-migration event for the generation-zero
-- backfill proof.

ALTER TABLE public.chat_messages
	ADD COLUMN prompt_tokens integer,
	ADD COLUMN completion_tokens integer,
	ADD COLUMN total_tokens integer;

CREATE UNIQUE INDEX uq_chat_messages_session_idempotency_key
	ON public.chat_messages (session_id, (metadata->>'idempotency_key'))
	WHERE metadata->>'idempotency_key' IS NOT NULL;

ALTER TABLE public.chat_turn_events
	ALTER COLUMN id SET DEFAULT gen_random_uuid(),
	ADD COLUMN session_id uuid REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
	ADD COLUMN stream_run_id text,
	ADD COLUMN sequence_index integer,
	ADD COLUMN phase text,
	ADD COLUMN event_type text,
	ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.chat_turn_events
	ALTER COLUMN session_id SET NOT NULL,
	ALTER COLUMN stream_run_id SET NOT NULL,
	ALTER COLUMN sequence_index SET NOT NULL,
	ALTER COLUMN phase SET NOT NULL,
	ALTER COLUMN event_type SET NOT NULL,
	ADD CONSTRAINT uq_chat_turn_events_sequence UNIQUE (turn_run_id, sequence_index),
	ADD CONSTRAINT chk_chat_turn_events_sequence CHECK (sequence_index >= 1);

CREATE INDEX idx_chat_turn_events_run_sequence
	ON public.chat_turn_events(turn_run_id, sequence_index);
CREATE INDEX idx_chat_turn_events_stream_created
	ON public.chat_turn_events(stream_run_id, created_at DESC);

-- Keep the event-identity fixture independent from the admission proof. The
-- terminal harness can now apply later migrations before running admission
-- without relying on a turn created as a side effect of another SQL contract.
INSERT INTO public.users (id)
VALUES ('ce100000-0000-4000-8000-000000000040');

INSERT INTO public.chat_sessions (id, user_id, context_type, status)
VALUES (
	'ce200000-0000-4000-8000-000000000040',
	'ce100000-0000-4000-8000-000000000040',
	'global',
	'active'
);

INSERT INTO public.chat_turn_runs (
	id,
	session_id,
	user_id,
	stream_run_id,
	client_turn_id,
	context_type,
	request_message,
	status
)
VALUES (
	'ce400000-0000-4000-8000-000000000040',
	'ce200000-0000-4000-8000-000000000040',
	'ce100000-0000-4000-8000-000000000040',
	'legacy-event-stream-40',
	'legacy-event-client-40',
	'global',
	'legacy event fixture',
	'running'
);

INSERT INTO public.chat_turn_events (
	id,
	turn_run_id,
	session_id,
	user_id,
	stream_run_id,
	sequence_index,
	phase,
	event_type,
	payload
)
SELECT
	'de000000-0000-4000-8000-000000000040',
	turns.id,
	turns.session_id,
	turns.user_id,
	turns.stream_run_id,
	1,
	'finalize',
	'done',
	'{"type":"done","legacy":true}'::jsonb
FROM public.chat_turn_runs turns
WHERE turns.id = 'ce400000-0000-4000-8000-000000000040';
