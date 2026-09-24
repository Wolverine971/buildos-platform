-- supabase/tests/20260924190100_account_deletion_completeness.test.sql
-- Account deletion contract: the request-time lock, and a purge that finishes
-- for a person with a live worker turn (stream state, signal, events, input
-- artifact, a started effect), a recently finished turn, an agent run with a
-- cost entry, cycle runs, a co-owned project with their log and public page,
-- system and campaign email, and rows that carry no user_id. The purge must
-- leave none of their rows, and the auth user delete must then succeed.
-- Libri is covered by 20260924190110_libri_account_deletion_purge.test.sql.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked, staging,
-- or production database.

\set ON_ERROR_STOP on
\ir fixtures/account_deletion_completeness_base.sql

SET client_min_messages = warning;

CREATE OR REPLACE FUNCTION pg_temp.expect(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	IF NOT COALESCE(p_condition, false) THEN
		RAISE EXCEPTION 'assertion_failed: %', p_message;
	END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.error_of(p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
	EXECUTE p_sql;
	RETURN NULL;
EXCEPTION
	WHEN OTHERS THEN
		RETURN SQLERRM;
END;
$$;

-- d1 users, d2 sessions, d3 turns, d4 projects, d5 actors, d6 documents,
-- d7 public pages, d8 everything else.
-- U = the person deleting their account, O = a collaborator, A = an admin.

INSERT INTO auth.users (id)
VALUES
	('d1000000-0000-4000-8000-000000000001'),
	('d1000000-0000-4000-8000-000000000002'),
	('d1000000-0000-4000-8000-000000000003');

INSERT INTO public.users (id, email, name, username)
VALUES
	('d1000000-0000-4000-8000-000000000001', 'Gone@Example.com', 'Gone Person', 'goneperson'),
	('d1000000-0000-4000-8000-000000000002', 'other@example.com', 'Other Person', NULL),
	('d1000000-0000-4000-8000-000000000003', 'admin@example.com', 'Admin Person', NULL);

INSERT INTO public.onto_actors (id, kind, name, email, user_id)
VALUES
	('d5000000-0000-4000-8000-000000000001', 'human', 'Gone Person', 'gone@example.com', 'd1000000-0000-4000-8000-000000000001'),
	('d5000000-0000-4000-8000-000000000002', 'human', 'Other Person', 'other@example.com', 'd1000000-0000-4000-8000-000000000002');

-- P1 is U's alone; P2 was created by U and is co-owned by O; P3 is O's, U edits.
INSERT INTO public.onto_projects (id, name, created_by)
VALUES
	('d4000000-0000-4000-8000-000000000001', 'Solo', 'd5000000-0000-4000-8000-000000000001'),
	('d4000000-0000-4000-8000-000000000002', 'Shared', 'd5000000-0000-4000-8000-000000000001'),
	('d4000000-0000-4000-8000-000000000003', 'Theirs', 'd5000000-0000-4000-8000-000000000002');

INSERT INTO public.onto_project_members (project_id, actor_id, role_key)
VALUES
	('d4000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'owner'),
	('d4000000-0000-4000-8000-000000000002', 'd5000000-0000-4000-8000-000000000001', 'owner'),
	('d4000000-0000-4000-8000-000000000002', 'd5000000-0000-4000-8000-000000000002', 'owner'),
	('d4000000-0000-4000-8000-000000000003', 'd5000000-0000-4000-8000-000000000002', 'owner'),
	('d4000000-0000-4000-8000-000000000003', 'd5000000-0000-4000-8000-000000000001', 'editor');

INSERT INTO public.onto_project_invites (project_id, invitee_email)
VALUES ('d4000000-0000-4000-8000-000000000003', 'gone@example.com');

INSERT INTO public.onto_documents (id, project_id, title)
VALUES
	('d6000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'Solo doc'),
	('d6000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000002', 'Shared doc'),
	('d6000000-0000-4000-8000-000000000003', 'd4000000-0000-4000-8000-000000000003', 'Their doc');

INSERT INTO public.onto_assets (id, project_id, storage_bucket, storage_path)
VALUES
	('d8000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'onto-assets', 'projects/solo/photo.png'),
	('d8000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000002', 'onto-assets', 'projects/shared/photo.png');

INSERT INTO public.onto_public_pages (
	id, project_id, document_id, slug, slug_prefix, slug_base, title, status, public_status,
	created_by, updated_by, published_by, published_at
)
VALUES
	('d7000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001',
		'goneperson-solo', 'goneperson', 'solo', 'Solo', 'published', 'live',
		'd5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', now()),
	('d7000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000002', 'd6000000-0000-4000-8000-000000000002',
		'goneperson-plan', 'goneperson', 'plan', 'Plan', 'published', 'live',
		'd5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', now()),
	('d7000000-0000-4000-8000-000000000003', 'd4000000-0000-4000-8000-000000000003', 'd6000000-0000-4000-8000-000000000003',
		'other-notes', 'other', 'notes', 'Notes', 'published', 'live',
		'd5000000-0000-4000-8000-000000000002', 'd5000000-0000-4000-8000-000000000002', 'd5000000-0000-4000-8000-000000000002', now());

INSERT INTO public.onto_public_page_slug_history (public_page_id, project_id, old_slug, new_slug, changed_by)
VALUES (
	'd7000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000002',
	'goneperson-old-plan', 'goneperson-plan', 'd5000000-0000-4000-8000-000000000001'
);

-- Chat: S1 holds a live worker turn, S2 a turn that finished a minute ago, S3 is O's.
INSERT INTO public.chat_sessions (id, user_id, context_type, status)
VALUES
	('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'global', 'active'),
	('d2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'global', 'active'),
	('d2000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000002', 'global', 'active');

INSERT INTO public.chat_turn_runs (
	id, session_id, user_id, stream_run_id, client_turn_id, source,
	context_type, gateway_enabled, request_message, status, execution_mode,
	execution_generation, cancel_requested_at, cancel_reason
)
VALUES
	('d3000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
		'purge-live', 'purge-live-client', 'live_ui', 'global', true,
		'live turn', 'running', 'worker_realtime', 1, now(), 'user_cancelled'),
	('d3000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001',
		'purge-done', 'purge-done-client', 'live_ui', 'global', true,
		'finished turn', 'running', 'worker_realtime', 1, now(), 'user_cancelled');

INSERT INTO public.chat_turn_stream_state (
	turn_run_id, session_id, user_id, execution_generation,
	snapshot_sequence, durable_through_sequence, projection_durable_sequence,
	assistant_text, projection
)
VALUES
	('d3000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 1, 1, 1, 1, 'partial', '{}'::jsonb),
	('d3000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 1, 1, 1, 1, 'done', '{}'::jsonb);

INSERT INTO public.chat_turn_signals (turn_run_id, session_id, user_id, reason, source)
VALUES
	('d3000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'user_cancelled', 'browser'),
	('d3000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'user_cancelled', 'browser');

INSERT INTO public.chat_turn_events (
	turn_run_id, session_id, user_id, stream_run_id, sequence_index,
	phase, event_type, payload, execution_generation, event_id
)
VALUES
	('d3000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
		'purge-live', 1, 'stream', 'text_delta', '{}'::jsonb, 1, 'd3000000-0000-4000-8000-000000000001:1:1'),
	('d3000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001',
		'purge-done', 1, 'stream', 'text_delta', '{}'::jsonb, 1, 'd3000000-0000-4000-8000-000000000002:1:1');

-- Admission validators expect a queued turn; the row only has to exist here.
SET session_replication_role = replica;
INSERT INTO public.chat_turn_input_artifacts (
	id, turn_run_id, session_id, user_id, artifact_version, history_source,
	history, prepared, content_hash, history_bytes, content_bytes, retain_until
)
VALUES (
	'd8000000-0000-4000-8000-000000000010', 'd3000000-0000-4000-8000-000000000001',
	'd2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
	'agentic_chat_input_v2', 'admission_window', '[]'::jsonb, '{}'::jsonb, repeat('a', 64), 2, 32,
	now() + interval '7 days'
);
SET session_replication_role = origin;

INSERT INTO public.chat_turn_effects (
	id, turn_run_id, session_id, user_id, execution_generation, tool_name, operation_name,
	canonical_argument_hash, downstream_idempotency_supported
)
VALUES (
	'd8000000-0000-4000-8000-000000000011', 'd3000000-0000-4000-8000-000000000001',
	'd2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 1,
	'create_calendar_event', 'calendar.create', repeat('a', 64), false
);
UPDATE public.chat_turn_effects
SET state = 'started', started_at = clock_timestamp()
WHERE id = 'd8000000-0000-4000-8000-000000000011';

-- Finish the second turn a minute ago without running the terminal triggers.
SET session_replication_role = replica;
UPDATE public.chat_turn_runs
SET status = 'completed', finished_at = now() - interval '1 minute',
	terminalized_at = now() - interval '1 minute'
WHERE id = 'd3000000-0000-4000-8000-000000000002';
SET session_replication_role = origin;

-- O's chats for delete_my_chat_session: S4 finished an hour ago, S5 is live.
INSERT INTO public.chat_sessions (id, user_id, context_type, status)
VALUES
	('d2000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000002', 'global', 'active'),
	('d2000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000002', 'global', 'active');
INSERT INTO public.chat_messages (session_id, user_id, role, content)
VALUES ('d2000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000002', 'user', 'hello');
INSERT INTO public.chat_turn_runs (
	id, session_id, user_id, stream_run_id, client_turn_id, source,
	context_type, gateway_enabled, request_message, status, execution_mode,
	execution_generation, cancel_requested_at, cancel_reason
)
VALUES
	('d3000000-0000-4000-8000-000000000004', 'd2000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000002',
		'chat-delete-done', 'chat-delete-done-client', 'live_ui', 'global', true,
		'finished turn', 'running', 'worker_realtime', 1, now(), 'user_cancelled'),
	('d3000000-0000-4000-8000-000000000005', 'd2000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000002',
		'chat-delete-live', 'chat-delete-live-client', 'live_ui', 'global', true,
		'live turn', 'running', 'worker_realtime', 1, NULL, NULL);
INSERT INTO public.chat_turn_stream_state (
	turn_run_id, session_id, user_id, execution_generation,
	snapshot_sequence, durable_through_sequence, projection_durable_sequence,
	assistant_text, projection
)
VALUES
	('d3000000-0000-4000-8000-000000000004', 'd2000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000002', 1, 1, 1, 1, 'done', '{}'::jsonb),
	('d3000000-0000-4000-8000-000000000005', 'd2000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000002', 1, 1, 1, 1, 'partial', '{}'::jsonb);
INSERT INTO public.chat_turn_signals (turn_run_id, session_id, user_id, reason, source)
VALUES ('d3000000-0000-4000-8000-000000000004', 'd2000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000002', 'user_cancelled', 'browser');
INSERT INTO public.chat_turn_events (
	turn_run_id, session_id, user_id, stream_run_id, sequence_index,
	phase, event_type, payload, execution_generation, event_id
)
VALUES ('d3000000-0000-4000-8000-000000000004', 'd2000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000002',
	'chat-delete-done', 1, 'stream', 'text_delta', '{}'::jsonb, 1, 'd3000000-0000-4000-8000-000000000004:1:1');
INSERT INTO public.chat_turn_effects (
	id, turn_run_id, session_id, user_id, execution_generation, tool_name, operation_name,
	canonical_argument_hash, downstream_idempotency_supported
)
VALUES (
	'd8000000-0000-4000-8000-000000000012', 'd3000000-0000-4000-8000-000000000004',
	'd2000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000002', 1,
	'create_calendar_event', 'calendar.create', repeat('b', 64), false
);
INSERT INTO public.onto_project_logs (id, project_id, entity_type, entity_id, action, changed_by, changed_by_actor_id, chat_session_id)
VALUES ('d8000000-0000-4000-8000-000000000032', 'd4000000-0000-4000-8000-000000000003', 'document', 'd6000000-0000-4000-8000-000000000003',
	'updated', 'd1000000-0000-4000-8000-000000000002', 'd5000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000004');

SET session_replication_role = replica;
UPDATE public.chat_turn_runs
SET status = 'completed', finished_at = now() - interval '1 hour',
	terminalized_at = now() - interval '1 hour'
WHERE id = 'd3000000-0000-4000-8000-000000000004';
UPDATE public.chat_turn_effects
SET state = 'succeeded', created_at = now() - interval '62 minutes', reserved_at = now() - interval '62 minutes', started_at = now() - interval '61 minutes', finished_at = now() - interval '1 hour'
WHERE id = 'd8000000-0000-4000-8000-000000000012';
SET session_replication_role = origin;

-- Agent run with a RESTRICT cost entry; U's cycle, and O's cycle on U's solo project.
INSERT INTO public.agent_runs (id, user_id, project_id)
VALUES ('d8000000-0000-4000-8000-000000000020', 'd1000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001');
INSERT INTO public.agent_run_cost_entries (root_run_id, leaf_run_id)
VALUES ('d8000000-0000-4000-8000-000000000020', 'd8000000-0000-4000-8000-000000000020');

INSERT INTO public.cycles (id, user_id, project_id)
VALUES
	('d8000000-0000-4000-8000-000000000021', 'd1000000-0000-4000-8000-000000000001', NULL),
	('d8000000-0000-4000-8000-000000000022', 'd1000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000001');
INSERT INTO public.cycle_runs (id, cycle_id, user_id, project_id)
VALUES
	('d8000000-0000-4000-8000-000000000023', 'd8000000-0000-4000-8000-000000000021', 'd1000000-0000-4000-8000-000000000001', NULL),
	('d8000000-0000-4000-8000-000000000024', 'd8000000-0000-4000-8000-000000000022', 'd1000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000001');
UPDATE public.cycles SET last_run_id = 'd8000000-0000-4000-8000-000000000023'
WHERE id = 'd8000000-0000-4000-8000-000000000021';

-- U's activity in O's project; O's log cites U's chat session.
INSERT INTO public.onto_project_logs (id, project_id, entity_type, entity_id, action, changed_by, changed_by_actor_id, chat_session_id)
VALUES
	('d8000000-0000-4000-8000-000000000030', 'd4000000-0000-4000-8000-000000000003', 'document', 'd6000000-0000-4000-8000-000000000003',
		'updated', 'd1000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001'),
	('d8000000-0000-4000-8000-000000000031', 'd4000000-0000-4000-8000-000000000003', 'document', 'd6000000-0000-4000-8000-000000000003',
		'updated', 'd1000000-0000-4000-8000-000000000002', 'd5000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000001');

-- Connector credentials.
INSERT INTO public.external_agent_callers (id, user_id)
VALUES
	('d8000000-0000-4000-8000-000000000040', 'd1000000-0000-4000-8000-000000000001'),
	('d8000000-0000-4000-8000-000000000041', 'd1000000-0000-4000-8000-000000000002');
INSERT INTO public.agent_oauth_grants (id, user_id, external_agent_caller_id)
VALUES
	('d8000000-0000-4000-8000-000000000042', 'd1000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000040'),
	('d8000000-0000-4000-8000-000000000043', 'd1000000-0000-4000-8000-000000000002', 'd8000000-0000-4000-8000-000000000041');
INSERT INTO public.agent_oauth_access_tokens (grant_id, user_id, expires_at)
VALUES
	('d8000000-0000-4000-8000-000000000042', 'd1000000-0000-4000-8000-000000000001', now() + interval '1 hour'),
	('d8000000-0000-4000-8000-000000000043', 'd1000000-0000-4000-8000-000000000002', now() + interval '1 hour');
INSERT INTO public.agent_oauth_refresh_tokens (grant_id, user_id, expires_at)
VALUES ('d8000000-0000-4000-8000-000000000042', 'd1000000-0000-4000-8000-000000000001', now() + interval '30 days');
INSERT INTO public.agent_oauth_authorization_codes (grant_id, user_id, expires_at)
VALUES ('d8000000-0000-4000-8000-000000000042', 'd1000000-0000-4000-8000-000000000001', now() + interval '5 minutes');
INSERT INTO public.agent_call_bootstrap_links (user_id, external_agent_caller_id, expires_at)
VALUES ('d1000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000040', now() + interval '1 day');

-- Background work.
INSERT INTO public.user_brief_preferences (user_id) VALUES ('d1000000-0000-4000-8000-000000000001');
INSERT INTO public.notification_subscriptions (id, user_id, event_type, created_by)
VALUES
	('d8000000-0000-4000-8000-000000000050', 'd1000000-0000-4000-8000-000000000001', 'brief.completed', 'd1000000-0000-4000-8000-000000000001'),
	('d8000000-0000-4000-8000-000000000051', 'd1000000-0000-4000-8000-000000000002', 'project.shared', 'd1000000-0000-4000-8000-000000000001');
INSERT INTO public.user_notification_preferences (user_id) VALUES ('d1000000-0000-4000-8000-000000000001');
INSERT INTO public.user_sms_preferences (user_id) VALUES ('d1000000-0000-4000-8000-000000000001');
INSERT INTO public.scheduled_sms_messages (user_id, message_content)
VALUES ('d1000000-0000-4000-8000-000000000001', 'Standup in 10');
INSERT INTO public.push_subscriptions (user_id, endpoint)
VALUES ('d1000000-0000-4000-8000-000000000001', 'https://push.example/1');
INSERT INTO public.email_sequence_enrollments (user_id, next_send_at)
VALUES ('d1000000-0000-4000-8000-000000000001', now() + interval '1 day');
INSERT INTO public.welcome_email_sequences (user_id) VALUES ('d1000000-0000-4000-8000-000000000001');
INSERT INTO public.agent_operatives (user_id, schedule_enabled, schedule_frequency, schedule_time_of_day, next_run_at)
VALUES ('d1000000-0000-4000-8000-000000000001', true, 'daily', '08:00', now() + interval '1 hour');
INSERT INTO public.queue_jobs (id, user_id, job_type, status, queue_job_id, scheduled_for)
VALUES
	('d8000000-0000-4000-8000-000000000052', 'd1000000-0000-4000-8000-000000000001', 'generate_daily_brief', 'pending', 'brief-u', now() + interval '1 hour'),
	('d8000000-0000-4000-8000-000000000053', 'd1000000-0000-4000-8000-000000000002', 'generate_daily_brief', 'pending', 'brief-o', now() + interval '1 hour');

-- References outside user_id.
INSERT INTO public.email_relevance_adjudications (user_id, reviewer_user_id)
VALUES
	('d1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001'),
	('d1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000003');
INSERT INTO public.admin_users (user_id, granted_by)
VALUES ('d1000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001');
INSERT INTO public.beta_events (id, created_by)
VALUES ('d8000000-0000-4000-8000-000000000060', 'd1000000-0000-4000-8000-000000000001');
INSERT INTO public.beta_signups (id, email, full_name, invited_by)
VALUES
	('d8000000-0000-4000-8000-000000000061', 'gone@example.com', 'Gone Person', 'd1000000-0000-4000-8000-000000000003'),
	('d8000000-0000-4000-8000-000000000062', 'friend@example.com', 'Friend', 'd1000000-0000-4000-8000-000000000001');
INSERT INTO public.migration_platform_lock (id, locked_by)
VALUES (1, 'd1000000-0000-4000-8000-000000000001');
INSERT INTO public.question_tree_runs (id, created_by)
VALUES ('d8000000-0000-4000-8000-000000000063', 'd1000000-0000-4000-8000-000000000001');
INSERT INTO public.question_tree_nodes (run_id) VALUES ('d8000000-0000-4000-8000-000000000063');

-- EM1 is a system brief email logged with created_by = its recipient (U).
-- EM2 is A's campaign sent to U and O.
INSERT INTO public.emails (id, created_by, subject, content, category)
VALUES
	('d8000000-0000-4000-8000-000000000070', 'd1000000-0000-4000-8000-000000000001', 'Your daily brief', 'brief body', 'daily_brief'),
	('d8000000-0000-4000-8000-000000000071', 'd1000000-0000-4000-8000-000000000003', 'Launch news', 'campaign body', 'campaign');
INSERT INTO public.email_recipients (id, email_id, recipient_email, recipient_id)
VALUES
	('d8000000-0000-4000-8000-000000000072', 'd8000000-0000-4000-8000-000000000070', 'gone@example.com', 'd1000000-0000-4000-8000-000000000001'),
	('d8000000-0000-4000-8000-000000000073', 'd8000000-0000-4000-8000-000000000071', 'GONE@example.com', NULL),
	('d8000000-0000-4000-8000-000000000074', 'd8000000-0000-4000-8000-000000000071', 'other@example.com', 'd1000000-0000-4000-8000-000000000002');
INSERT INTO public.email_tracking_events (email_id, recipient_id, ip_address)
VALUES
	('d8000000-0000-4000-8000-000000000070', 'd8000000-0000-4000-8000-000000000072', '10.0.0.1'),
	('d8000000-0000-4000-8000-000000000071', 'd8000000-0000-4000-8000-000000000073', '10.0.0.1'),
	('d8000000-0000-4000-8000-000000000071', 'd8000000-0000-4000-8000-000000000074', '10.0.0.2');
INSERT INTO public.email_attachments (email_id, created_by, storage_path)
VALUES ('d8000000-0000-4000-8000-000000000070', 'd1000000-0000-4000-8000-000000000001', 'attachments/brief.pdf');
UPDATE public.email_sequence_enrollments SET last_email_id = 'd8000000-0000-4000-8000-000000000070';

-- Rows with no user_id.
INSERT INTO public.projects (id, user_id, name)
VALUES ('d8000000-0000-4000-8000-000000000080', 'd1000000-0000-4000-8000-000000000001', 'Legacy');
INSERT INTO public.projects_history (project_id, created_by, project_data)
VALUES
	('d8000000-0000-4000-8000-000000000080', NULL, '{"name": "Legacy"}'),
	('d8000000-0000-4000-8000-000000000081', 'd1000000-0000-4000-8000-000000000001', '{"name": "Old"}');

INSERT INTO public.domain_research_queue (id, queue_key, user_need, summary, evidence, source_session_ids, source_user_count)
VALUES
	('d8000000-0000-4000-8000-000000000082', 'only-u', 'need', 'summary',
		jsonb_build_array(jsonb_build_object('user_id', 'd1000000-0000-4000-8000-000000000001', 'session_id', 'd2000000-0000-4000-8000-000000000001', 'quote', 'mine')),
		ARRAY['d2000000-0000-4000-8000-000000000001']::uuid[], 1),
	('d8000000-0000-4000-8000-000000000083', 'shared', 'need', 'summary',
		jsonb_build_array(
			jsonb_build_object('user_id', 'd1000000-0000-4000-8000-000000000001', 'session_id', 'd2000000-0000-4000-8000-000000000002', 'quote', 'mine'),
			jsonb_build_object('user_id', 'd1000000-0000-4000-8000-000000000002', 'session_id', 'd2000000-0000-4000-8000-000000000003', 'quote', 'theirs')
		),
		ARRAY['d2000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000003']::uuid[], 2);

INSERT INTO public.security_events (id, event_type, actor_user_id, target_type, target_id, metadata)
VALUES
	('d8000000-0000-4000-8000-000000000090', 'auth.login', 'd1000000-0000-4000-8000-000000000001', NULL, NULL, '{"project": "Secret plan"}'),
	('d8000000-0000-4000-8000-000000000091', 'admin.user_viewed', 'd1000000-0000-4000-8000-000000000003', 'user', 'd1000000-0000-4000-8000-000000000001', '{"email": "gone@example.com"}'),
	('d8000000-0000-4000-8000-000000000092', 'auth.login', 'd1000000-0000-4000-8000-000000000002', NULL, NULL, '{"browser": "firefox"}');
INSERT INTO public.notification_events (id, event_type, actor_user_id, target_user_id, payload, metadata)
VALUES
	('d8000000-0000-4000-8000-000000000093', 'project.shared', 'd1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002', '{"project_name": "Shared"}', '{"x": 1}'),
	('d8000000-0000-4000-8000-000000000094', 'brief.completed', NULL, 'd1000000-0000-4000-8000-000000000001', '{"brief": "text"}', NULL);

-- Storage-bearing rows.
INSERT INTO public.voice_notes (user_id, storage_path)
VALUES ('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001/note.webm');
INSERT INTO public.ontology_daily_briefs (user_id, audio_storage_path)
VALUES ('d1000000-0000-4000-8000-000000000001', 'briefs/u/today.mp3');
INSERT INTO storage.objects (bucket_id, name, owner_id)
VALUES
	('avatars', 'avatar-u.png', 'd1000000-0000-4000-8000-000000000001'),
	('user-exports', 'd1000000-0000-4000-8000-000000000001/e1.zip', NULL),
	('user-exports', 'd1000000-0000-4000-8000-000000000002/e2.zip', NULL),
	('libri-assets', 'a1000000-0000-4000-8000-000000000001/cover.png', NULL),
	('libri-assets', 'a2000000-0000-4000-8000-000000000002/cover.png', NULL),
	('avatars', 'avatar-o.png', 'd1000000-0000-4000-8000-000000000002');

-- ---------------------------------------------------------------------------
-- Before: the released purge cannot finish for this person.
-- ---------------------------------------------------------------------------

-- Its empty search_path breaks delete_onto_project's unqualified names before
-- it ever reaches the chat guards checked further down.
SELECT pg_temp.expect(
	pg_temp.error_of($$SELECT public.finalize_account_deletion_database('d1000000-0000-4000-8000-000000000001')$$)
		= 'relation "onto_goals" does not exist',
	'the released finalize fails on the first sole-owned project'
);
SELECT pg_temp.expect(
	(SELECT count(*) FROM public.users WHERE id = 'd1000000-0000-4000-8000-000000000001') = 1,
	'a failed purge must roll back'
);

\ir ../migrations/20260924190100_account_deletion_completeness.sql
-- Re-applying is a no-op.
\ir ../migrations/20260924190100_account_deletion_completeness.sql

SET client_min_messages = warning;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

SELECT pg_temp.expect(
	has_function_privilege('service_role', 'public.lock_account_for_deletion(uuid)', 'EXECUTE')
		AND has_function_privilege('service_role', 'public.finalize_account_deletion_database(uuid)', 'EXECUTE')
		AND has_function_privilege('service_role', 'public.list_account_deletion_storage_objects(uuid, uuid[])', 'EXECUTE')
		AND NOT has_function_privilege('authenticated', 'public.lock_account_for_deletion(uuid)', 'EXECUTE')
		AND NOT has_function_privilege('authenticated', 'public.finalize_account_deletion_database(uuid)', 'EXECUTE')
		AND NOT has_function_privilege('anon', 'public.finalize_account_deletion_database(uuid)', 'EXECUTE')
		AND NOT has_function_privilege('authenticated', 'public.list_account_deletion_storage_objects(uuid, uuid[])', 'EXECUTE')
		AND NOT has_function_privilege('authenticated', 'public.account_deletion_purged_project_ids(uuid)', 'EXECUTE'),
	'deletion functions are service_role only'
);
SELECT pg_temp.expect(
	to_regprocedure('public.list_account_deletion_storage_objects(uuid)') IS NULL,
	'the one-argument storage listing is gone, so PostgREST has one candidate'
);

-- ---------------------------------------------------------------------------
-- Deleting one chat (delete_my_chat_session)
-- ---------------------------------------------------------------------------

-- Runs the RPC as a signed-in user; returns 'ok' or the SQLSTATE it raised.
CREATE OR REPLACE FUNCTION pg_temp.delete_chat_as(p_user uuid, p_session uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
	PERFORM set_config(
		'request.jwt.claims',
		CASE WHEN p_user IS NULL THEN '' ELSE jsonb_build_object('sub', p_user)::text END,
		true
	);
	SET LOCAL ROLE authenticated;
	PERFORM public.delete_my_chat_session(p_session);
	RESET ROLE;
	RETURN 'ok';
EXCEPTION
	WHEN OTHERS THEN
		RETURN SQLSTATE;
END;
$$;

-- Voice notes recorded in O's chats: one group per chat, one note each.
INSERT INTO public.voice_note_groups (id, user_id, chat_session_id)
VALUES
	('d8000000-0000-4000-8000-0000000000a1', 'd1000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000004'),
	('d8000000-0000-4000-8000-0000000000a2', 'd1000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000005');
INSERT INTO public.voice_notes (id, user_id, group_id, storage_path)
VALUES
	('d8000000-0000-4000-8000-0000000000a3', 'd1000000-0000-4000-8000-000000000002', 'd8000000-0000-4000-8000-0000000000a1', 'd1000000-0000-4000-8000-000000000002/chat-note.webm'),
	('d8000000-0000-4000-8000-0000000000a4', 'd1000000-0000-4000-8000-000000000002', 'd8000000-0000-4000-8000-0000000000a2', 'd1000000-0000-4000-8000-000000000002/live-note.webm');

SELECT pg_temp.expect(
	pg_temp.error_of($$DELETE FROM public.chat_sessions WHERE id = 'd2000000-0000-4000-8000-000000000004'$$)
		SIMILAR TO '%(fk_chat_turn_stream_state_turn_scope|fk_chat_turn_signals_turn_scope|agentic_chat_active_control_row_cannot_be_deleted)%',
	'a plain delete of a recently finished worker chat is blocked'
);
SELECT pg_temp.expect(
	has_function_privilege('authenticated', 'public.delete_my_chat_session(uuid)', 'EXECUTE')
		AND NOT has_function_privilege('anon', 'public.delete_my_chat_session(uuid)', 'EXECUTE'),
	'chat delete is for signed-in users only'
);
SELECT pg_temp.expect(
	pg_temp.delete_chat_as('d1000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000001') = 'P0002',
	'someone else''s chat reads as not found'
);
SELECT pg_temp.expect(
	pg_temp.delete_chat_as(NULL, 'd2000000-0000-4000-8000-000000000004') = '42501',
	'no user, no delete'
);
SELECT pg_temp.expect(
	pg_temp.delete_chat_as('d1000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000005') = '55006'
		AND EXISTS (SELECT 1 FROM public.chat_turn_runs WHERE id = 'd3000000-0000-4000-8000-000000000005')
		AND EXISTS (SELECT 1 FROM public.chat_turn_stream_state WHERE turn_run_id = 'd3000000-0000-4000-8000-000000000005'),
	'a chat with a live turn is refused and left intact'
);
SELECT pg_temp.expect(
	(SELECT deleted_at IS NULL FROM public.voice_note_groups WHERE id = 'd8000000-0000-4000-8000-0000000000a2')
		AND (SELECT deleted_at IS NULL FROM public.voice_notes WHERE id = 'd8000000-0000-4000-8000-0000000000a4'),
	'a refused chat delete leaves its voice notes alone'
);
SELECT pg_temp.expect(
	pg_temp.delete_chat_as('d1000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000004') = 'ok',
	'a chat that finished an hour ago deletes'
);
SELECT pg_temp.expect(
	NOT EXISTS (SELECT 1 FROM public.chat_sessions WHERE id = 'd2000000-0000-4000-8000-000000000004')
	AND NOT EXISTS (SELECT 1 FROM public.chat_messages WHERE session_id = 'd2000000-0000-4000-8000-000000000004')
	AND NOT EXISTS (SELECT 1 FROM public.chat_turn_runs WHERE id = 'd3000000-0000-4000-8000-000000000004')
	AND NOT EXISTS (SELECT 1 FROM public.chat_turn_stream_state WHERE turn_run_id = 'd3000000-0000-4000-8000-000000000004')
	AND NOT EXISTS (SELECT 1 FROM public.chat_turn_signals WHERE turn_run_id = 'd3000000-0000-4000-8000-000000000004')
	AND NOT EXISTS (SELECT 1 FROM public.chat_turn_events WHERE turn_run_id = 'd3000000-0000-4000-8000-000000000004')
	AND NOT EXISTS (SELECT 1 FROM public.chat_turn_effects WHERE id = 'd8000000-0000-4000-8000-000000000012')
	AND (SELECT chat_session_id IS NULL FROM public.onto_project_logs WHERE id = 'd8000000-0000-4000-8000-000000000032'),
	'the chat, its messages and every worker row are gone; project history stays'
);
SELECT pg_temp.expect(
	(SELECT deleted_at IS NOT NULL AND chat_session_id IS NULL
		FROM public.voice_note_groups WHERE id = 'd8000000-0000-4000-8000-0000000000a1')
		AND (SELECT deleted_at IS NOT NULL FROM public.voice_notes WHERE id = 'd8000000-0000-4000-8000-0000000000a3'),
	'the chat''s voice notes and their group are soft-deleted, so the 30-day purge erases them and their audio'
);
SELECT pg_temp.expect(
	COALESCE(current_setting('buildos.user_chat_delete', true), '') <> 'on',
	'the chat-delete bypass does not outlive the call'
);

-- ---------------------------------------------------------------------------
-- Request time
-- ---------------------------------------------------------------------------

SET ROLE service_role;
SELECT * FROM public.request_account_deletion('d1000000-0000-4000-8000-000000000001');
RESET ROLE;

SELECT pg_temp.expect(
	(SELECT deletion_status = 'pending' AND access_restricted FROM public.users WHERE id = 'd1000000-0000-4000-8000-000000000001'),
	'request marks the account pending and restricted'
);
SELECT pg_temp.expect(
	NOT EXISTS (
		SELECT 1 FROM public.agent_oauth_access_tokens
		WHERE user_id = 'd1000000-0000-4000-8000-000000000001' AND revoked_at IS NULL
	)
	AND EXISTS (
		SELECT 1 FROM public.agent_oauth_access_tokens
		WHERE user_id = 'd1000000-0000-4000-8000-000000000002' AND revoked_at IS NULL
	),
	'access tokens revoked for the person only'
);
SELECT pg_temp.expect(
	(SELECT bool_and(expires_at <= now() AND revoked_at IS NULL) FROM public.agent_oauth_refresh_tokens
		WHERE user_id = 'd1000000-0000-4000-8000-000000000001'),
	'refresh tokens expire without the revoked_at that means theft'
);
SELECT pg_temp.expect(
	(SELECT bool_and(expires_at <= now()) FROM public.agent_oauth_authorization_codes
		WHERE user_id = 'd1000000-0000-4000-8000-000000000001')
	AND (SELECT bool_and(expires_at <= now()) FROM public.agent_call_bootstrap_links
		WHERE user_id = 'd1000000-0000-4000-8000-000000000001'),
	'authorization codes and bootstrap links expire'
);
SELECT pg_temp.expect(
	(SELECT status FROM public.agent_oauth_grants WHERE id = 'd8000000-0000-4000-8000-000000000042') = 'revoked'
	AND (SELECT status FROM public.agent_oauth_grants WHERE id = 'd8000000-0000-4000-8000-000000000043') = 'active'
	AND (SELECT status FROM public.external_agent_callers WHERE id = 'd8000000-0000-4000-8000-000000000040') = 'revoked'
	AND (SELECT status FROM public.external_agent_callers WHERE id = 'd8000000-0000-4000-8000-000000000041') = 'trusted',
	'grants and callers revoked for the person only'
);
SELECT pg_temp.expect(
	(SELECT is_active FROM public.user_brief_preferences WHERE user_id = 'd1000000-0000-4000-8000-000000000001') = false
	AND (SELECT is_active FROM public.notification_subscriptions WHERE id = 'd8000000-0000-4000-8000-000000000050') = false
	AND (SELECT is_active FROM public.notification_subscriptions WHERE id = 'd8000000-0000-4000-8000-000000000051') = true
	AND (SELECT NOT (email_enabled OR sms_enabled OR push_enabled OR in_app_enabled
			OR should_email_daily_brief OR should_sms_daily_brief)
		FROM public.user_notification_preferences WHERE user_id = 'd1000000-0000-4000-8000-000000000001')
	AND (SELECT NOT (event_reminders_enabled OR morning_kickoff_enabled OR evening_recap_enabled OR urgent_alerts)
		FROM public.user_sms_preferences WHERE user_id = 'd1000000-0000-4000-8000-000000000001')
	AND (SELECT status = 'cancelled' AND cancelled_at IS NOT NULL FROM public.scheduled_sms_messages
		WHERE user_id = 'd1000000-0000-4000-8000-000000000001')
	AND (SELECT is_active FROM public.push_subscriptions WHERE user_id = 'd1000000-0000-4000-8000-000000000001') = false
	AND (SELECT status = 'cancelled' AND exit_reason = 'user_deleted' AND next_send_at IS NULL
		FROM public.email_sequence_enrollments WHERE user_id = 'd1000000-0000-4000-8000-000000000001')
	AND (SELECT status FROM public.welcome_email_sequences WHERE user_id = 'd1000000-0000-4000-8000-000000000001') = 'cancelled'
	AND (SELECT NOT schedule_enabled AND next_run_at IS NULL FROM public.agent_operatives
		WHERE user_id = 'd1000000-0000-4000-8000-000000000001'),
	'briefs, notifications, SMS, push, lifecycle email and scheduled agents stop'
);
SELECT pg_temp.expect(
	(SELECT status FROM public.queue_jobs WHERE id = 'd8000000-0000-4000-8000-000000000052') = 'cancelled'
	AND (SELECT status FROM public.queue_jobs WHERE id = 'd8000000-0000-4000-8000-000000000053') = 'pending',
	'queued brief for the person is cancelled, others untouched'
);
SELECT pg_temp.expect(
	(SELECT count(*) FROM public.onto_public_pages
		WHERE id IN ('d7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000002')
			AND status = 'unpublished' AND public_status = 'unpublished' AND last_unpublished_at IS NOT NULL) = 2
	AND (SELECT status FROM public.onto_public_pages WHERE id = 'd7000000-0000-4000-8000-000000000003') = 'published',
	'the person''s public pages go offline; the collaborator''s stay live'
);

-- Outside a purge the guards still hold.
SELECT pg_temp.expect(
	pg_temp.error_of($$DELETE FROM public.chat_turn_stream_state WHERE turn_run_id = 'd3000000-0000-4000-8000-000000000001'$$)
		LIKE '%agentic_chat_active_control_row_cannot_be_deleted%',
	'stream state guard still blocks ordinary deletes'
);
SELECT pg_temp.expect(
	pg_temp.error_of($$DELETE FROM public.chat_turn_effects WHERE id = 'd8000000-0000-4000-8000-000000000011'$$)
		LIKE '%agentic_chat_active_effect_cannot_be_deleted%',
	'effect guard still blocks ordinary deletes'
);
SELECT pg_temp.expect(
	pg_temp.error_of($$DELETE FROM public.chat_turn_events WHERE turn_run_id = 'd3000000-0000-4000-8000-000000000002'$$)
		LIKE '%agentic_chat_control_row_retention_not_elapsed%',
	'retention guard still blocks deletes of a recently finished turn'
);

-- ---------------------------------------------------------------------------
-- Storage listing
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE listed AS
SELECT bucket_id || ':' || object_name AS object
FROM public.list_account_deletion_storage_objects(
	'd1000000-0000-4000-8000-000000000001',
	ARRAY['a1000000-0000-4000-8000-000000000001']::uuid[]
);

SELECT pg_temp.expect(
	(SELECT array_agg(object ORDER BY object) FROM listed) = ARRAY[
		'avatars:avatar-u.png',
		'brief-audio:briefs/u/today.mp3',
		'email-attachments:attachments/brief.pdf',
		'libri-assets:a1000000-0000-4000-8000-000000000001/cover.png',
		'onto-assets:projects/solo/photo.png',
		'user-exports:d1000000-0000-4000-8000-000000000001/e1.zip',
		'voice_notes:d1000000-0000-4000-8000-000000000001/note.webm'
	]::text[],
	'storage listing: own files and data exports, sole-owned project assets and purged Libri libraries only'
);

-- ---------------------------------------------------------------------------
-- Purge
-- ---------------------------------------------------------------------------

BEGIN;
SET LOCAL ROLE service_role;
CREATE TEMP TABLE purge_result ON COMMIT PRESERVE ROWS AS
SELECT public.finalize_account_deletion_database('d1000000-0000-4000-8000-000000000001') AS result;
RESET ROLE;
SELECT pg_temp.expect(
	current_setting('buildos.account_purge', true) = 'off',
	'the guard bypass is switched off before finalize returns'
);
COMMIT;

SELECT pg_temp.expect(
	(SELECT result FROM purge_result) @> jsonb_build_object(
		'public_user_deleted', true,
		'actors_anonymized', 1,
		'projects_deleted', 1,
		'public_pages_reprefixed', 1
	),
	'finalize summary'
);

-- The auth delete (auth.admin.deleteUser) now has nothing left to trip on.
DELETE FROM auth.users WHERE id = 'd1000000-0000-4000-8000-000000000001';

-- No row keyed by user_id survives, in any public table.
DO $$
DECLARE
	v_table text;
	v_count bigint;
BEGIN
	FOR v_table IN
		SELECT class.relname
		FROM pg_class AS class
		JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
		JOIN pg_attribute AS attribute ON attribute.attrelid = class.oid
		WHERE namespace.nspname = 'public'
			AND class.relkind IN ('r', 'p')
			AND attribute.attname = 'user_id'
			AND NOT attribute.attisdropped
			AND class.relname NOT IN ('account_deletion_requests', 'legal_acceptances')
	LOOP
		EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id::text = $1', v_table)
		INTO v_count
		USING 'd1000000-0000-4000-8000-000000000001';
		IF v_count > 0 THEN
			RAISE EXCEPTION 'assertion_failed: % still has % row(s) for the person', v_table, v_count;
		END IF;
	END LOOP;
END;
$$;

SELECT pg_temp.expect(
	NOT EXISTS (SELECT 1 FROM public.users WHERE id = 'd1000000-0000-4000-8000-000000000001')
	AND NOT EXISTS (SELECT 1 FROM public.chat_sessions WHERE id IN (
		'd2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002'))
	AND NOT EXISTS (SELECT 1 FROM public.chat_turn_runs WHERE id IN (
		'd3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000002'))
	AND NOT EXISTS (SELECT 1 FROM public.chat_turn_effects WHERE id = 'd8000000-0000-4000-8000-000000000011')
	AND NOT EXISTS (SELECT 1 FROM public.agent_runs WHERE id = 'd8000000-0000-4000-8000-000000000020')
	AND NOT EXISTS (SELECT 1 FROM public.agent_run_cost_entries)
	AND NOT EXISTS (SELECT 1 FROM public.cycles)
	AND NOT EXISTS (SELECT 1 FROM public.cycle_runs),
	'chat turns, agent runs with cost entries, and cycle runs are gone'
);
SELECT pg_temp.expect(
	(SELECT user_id IS NULL AND email IS NULL AND name = 'Deleted user'
		FROM public.onto_actors WHERE id = 'd5000000-0000-4000-8000-000000000001'),
	'actor anonymized'
);
SELECT pg_temp.expect(
	NOT EXISTS (SELECT 1 FROM public.onto_projects WHERE id = 'd4000000-0000-4000-8000-000000000001')
	AND NOT EXISTS (SELECT 1 FROM public.onto_assets WHERE id = 'd8000000-0000-4000-8000-000000000001')
	AND EXISTS (SELECT 1 FROM public.onto_projects WHERE id = 'd4000000-0000-4000-8000-000000000002')
	AND EXISTS (SELECT 1 FROM public.onto_projects WHERE id = 'd4000000-0000-4000-8000-000000000003')
	AND NOT EXISTS (SELECT 1 FROM public.onto_project_members WHERE actor_id = 'd5000000-0000-4000-8000-000000000001')
	AND (SELECT count(*) FROM public.onto_project_members WHERE project_id = 'd4000000-0000-4000-8000-000000000002') = 1
	AND NOT EXISTS (SELECT 1 FROM public.onto_project_invites),
	'sole-owned project deleted; shared projects kept without the person'
);
SELECT pg_temp.expect(
	NOT EXISTS (SELECT 1 FROM public.onto_project_logs WHERE changed_by = 'd1000000-0000-4000-8000-000000000001')
	AND (SELECT chat_session_id IS NULL FROM public.onto_project_logs WHERE id = 'd8000000-0000-4000-8000-000000000031'),
	'the person''s shared-project log rows are gone; the collaborator''s row survives without the session link'
);
SELECT pg_temp.expect(
	(SELECT slug_prefix = 'deleted-user' AND slug = 'deleted-user-plan' AND status = 'unpublished'
		FROM public.onto_public_pages WHERE id = 'd7000000-0000-4000-8000-000000000002')
	AND NOT EXISTS (SELECT 1 FROM public.onto_public_page_slug_history
		WHERE public_page_id = 'd7000000-0000-4000-8000-000000000002')
	AND NOT EXISTS (SELECT 1 FROM public.onto_public_pages WHERE id = 'd7000000-0000-4000-8000-000000000001')
	AND (SELECT slug FROM public.onto_public_pages WHERE id = 'd7000000-0000-4000-8000-000000000003') = 'other-notes',
	'a surviving page no longer carries the person''s name in its URL or redirects'
);
SELECT pg_temp.expect(
	(SELECT created_by IS NULL AND is_active FROM public.notification_subscriptions
		WHERE id = 'd8000000-0000-4000-8000-000000000051')
	AND NOT EXISTS (SELECT 1 FROM public.email_relevance_adjudications
		WHERE reviewer_user_id = 'd1000000-0000-4000-8000-000000000001')
	AND (SELECT count(*) FROM public.email_relevance_adjudications) = 1
	AND (SELECT granted_by IS NULL FROM public.admin_users WHERE user_id = 'd1000000-0000-4000-8000-000000000003')
	AND (SELECT created_by IS NULL FROM public.beta_events WHERE id = 'd8000000-0000-4000-8000-000000000060')
	AND (SELECT locked_by IS NULL FROM public.migration_platform_lock WHERE id = 1)
	AND NOT EXISTS (SELECT 1 FROM public.question_tree_runs)
	AND NOT EXISTS (SELECT 1 FROM public.question_tree_nodes),
	'references not named user_id are cleared or removed'
);
SELECT pg_temp.expect(
	NOT EXISTS (SELECT 1 FROM public.beta_signups WHERE id = 'd8000000-0000-4000-8000-000000000061')
	AND (SELECT invited_by IS NULL FROM public.beta_signups WHERE id = 'd8000000-0000-4000-8000-000000000062'),
	'beta signup matched by email is deleted; people they invited keep theirs'
);
SELECT pg_temp.expect(
	NOT EXISTS (SELECT 1 FROM public.emails WHERE id = 'd8000000-0000-4000-8000-000000000070')
	AND NOT EXISTS (SELECT 1 FROM public.email_attachments)
	AND EXISTS (SELECT 1 FROM public.emails WHERE id = 'd8000000-0000-4000-8000-000000000071')
	AND (SELECT array_agg(id) FROM public.email_recipients) = ARRAY['d8000000-0000-4000-8000-000000000074']::uuid[]
	AND (SELECT array_agg(recipient_id) FROM public.email_tracking_events) = ARRAY['d8000000-0000-4000-8000-000000000074']::uuid[],
	'system email to the person is deleted; the admin campaign keeps only other recipients'
);
SELECT pg_temp.expect(
	NOT EXISTS (SELECT 1 FROM public.projects_history)
	AND NOT EXISTS (SELECT 1 FROM public.projects),
	'legacy projects and their history are gone'
);
SELECT pg_temp.expect(
	NOT EXISTS (SELECT 1 FROM public.domain_research_queue WHERE id = 'd8000000-0000-4000-8000-000000000082')
	AND (
		SELECT evidence = jsonb_build_array(jsonb_build_object(
				'user_id', 'd1000000-0000-4000-8000-000000000002',
				'session_id', 'd2000000-0000-4000-8000-000000000003',
				'quote', 'theirs'))
			AND source_session_ids = ARRAY['d2000000-0000-4000-8000-000000000003']::uuid[]
			AND source_user_count = 1
		FROM public.domain_research_queue WHERE id = 'd8000000-0000-4000-8000-000000000083'
	),
	'research demand: sole-source rows deleted, shared rows lose only the person''s evidence'
);
SELECT pg_temp.expect(
	(SELECT actor_user_id IS NULL AND metadata = '{"account_deleted": true}'::jsonb
		FROM public.security_events WHERE id = 'd8000000-0000-4000-8000-000000000090')
	AND (SELECT metadata = '{"account_deleted": true}'::jsonb
		FROM public.security_events WHERE id = 'd8000000-0000-4000-8000-000000000091')
	AND (SELECT metadata = '{"browser": "firefox"}'::jsonb
		FROM public.security_events WHERE id = 'd8000000-0000-4000-8000-000000000092')
	AND (SELECT actor_user_id IS NULL AND payload = '{"account_deleted": true}'::jsonb AND metadata IS NULL
		FROM public.notification_events WHERE id = 'd8000000-0000-4000-8000-000000000093')
	AND (SELECT target_user_id IS NULL AND payload = '{"account_deleted": true}'::jsonb
		FROM public.notification_events WHERE id = 'd8000000-0000-4000-8000-000000000094'),
	'security and notification event bodies that name the person are scrubbed'
);
SELECT pg_temp.expect(
	EXISTS (SELECT 1 FROM public.account_deletion_requests WHERE user_id = 'd1000000-0000-4000-8000-000000000001'),
	'the deletion request row stays as the audit record'
);
SELECT pg_temp.expect(
	EXISTS (SELECT 1 FROM public.users WHERE id = 'd1000000-0000-4000-8000-000000000002')
	AND EXISTS (SELECT 1 FROM public.chat_sessions WHERE id = 'd2000000-0000-4000-8000-000000000003')
	AND EXISTS (SELECT 1 FROM public.queue_jobs WHERE id = 'd8000000-0000-4000-8000-000000000053')
	AND EXISTS (SELECT 1 FROM public.agent_oauth_grants WHERE id = 'd8000000-0000-4000-8000-000000000043'),
	'the collaborator''s account is untouched'
);

-- A replay after completion is harmless.
SELECT pg_temp.expect(
	public.finalize_account_deletion_database('d1000000-0000-4000-8000-000000000001')
		@> '{"public_user_deleted": false}'::jsonb,
	'finalize is idempotent'
);

\echo 'account deletion completeness contract passed'
