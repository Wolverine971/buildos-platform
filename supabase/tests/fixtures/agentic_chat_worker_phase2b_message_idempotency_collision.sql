-- supabase/tests/fixtures/agentic_chat_worker_phase2b_message_idempotency_collision.sql
-- Negative preflight fixture: one authenticated-writable message has preempted
-- a reserved worker key without a corresponding owned turn/message link.

INSERT INTO public.users (id)
VALUES ('fa000000-0000-4000-8000-000000000001');

INSERT INTO public.chat_sessions (id, user_id, context_type, status)
VALUES (
	'fa000000-0000-4000-8000-000000000002',
	'fa000000-0000-4000-8000-000000000001',
	'global',
	'active'
);

INSERT INTO public.chat_messages (
	id, session_id, user_id, role, content, metadata
) VALUES (
	'fa000000-0000-4000-8000-000000000003',
	'fa000000-0000-4000-8000-000000000002',
	'fa000000-0000-4000-8000-000000000001',
	'assistant',
	'preempted worker key',
	'{"idempotency_key":"chat-turn:fa000000-0000-4000-8000-000000000004:assistant"}'::jsonb
);
