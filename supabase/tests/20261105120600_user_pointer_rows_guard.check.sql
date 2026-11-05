-- supabase/tests/20261105120600_user_pointer_rows_guard.check.sql
-- Free disposable rehearsal only. Never execute this against a linked database.
--   pnpm db:rehearse supabase/migrations/20261105120600_user_pointer_rows_guard.sql \
--     --check supabase/tests/20261105120600_user_pointer_rows_guard.check.sql --role-probe
--
-- Attacker A, victim B (owns project P with task T and image X), read member M of P. As
-- signed-in A, every pointer from the audit is refused: a calendar link to T (even through a
-- legacy task row A creates with T's id), voice notes naming another bucket or folder, a chat
-- attachment of X or on B's message, and a project_calendars row for P. A's own links, notes,
-- attachments and calendars still work, M can map P, and server writers are not restricted.
-- The deletion and purge listings ignore voice note rows outside the owner's folder.

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL search_path = public, extensions;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	IF NOT coalesce(p_condition, false) THEN
		RAISE EXCEPTION 'assertion_failed: %', p_message;
	END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_user(p_user uuid)
RETURNS void LANGUAGE sql AS $$
	SELECT set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

CREATE TEMP TABLE results (key text PRIMARY KEY, value text) ON COMMIT DROP;
GRANT ALL ON results TO authenticated, anon, service_role;

-- Runs one statement as the current role and records the error message (or 'ok').
CREATE OR REPLACE FUNCTION pg_temp.try(p_key text, p_sql text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	BEGIN
		EXECUTE p_sql;
		INSERT INTO results VALUES (p_key, 'ok');
	EXCEPTION WHEN insufficient_privilege THEN
		INSERT INTO results VALUES (p_key, SQLERRM);
	END;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.try(text, text) TO authenticated, anon;

-- Users c6…0N, actors c6…1N, projects c6…2N, member c6…31, tasks c6…4N, assets c6…5N,
-- chats c6…6N, legacy tasks c6…7N.
INSERT INTO auth.users (id, email) VALUES
	('c6060000-0000-4000-8000-000000000001', 'pointer-guard-a@example.com'),
	('c6060000-0000-4000-8000-000000000002', 'pointer-guard-b@example.com'),
	('c6060000-0000-4000-8000-000000000003', 'pointer-guard-m@example.com');
INSERT INTO public.users (id, email, name) VALUES
	('c6060000-0000-4000-8000-000000000001', 'pointer-guard-a@example.com', 'Attacker'),
	('c6060000-0000-4000-8000-000000000002', 'pointer-guard-b@example.com', 'Victim'),
	('c6060000-0000-4000-8000-000000000003', 'pointer-guard-m@example.com', 'Member')
	ON CONFLICT (id) DO NOTHING;
INSERT INTO public.onto_actors (id, kind, name, user_id, email) VALUES
	('c6060000-0000-4000-8000-000000000011', 'human', 'Attacker', 'c6060000-0000-4000-8000-000000000001', 'pointer-guard-a@example.com'),
	('c6060000-0000-4000-8000-000000000012', 'human', 'Victim', 'c6060000-0000-4000-8000-000000000002', 'pointer-guard-b@example.com'),
	('c6060000-0000-4000-8000-000000000013', 'human', 'Member', 'c6060000-0000-4000-8000-000000000003', 'pointer-guard-m@example.com')
	ON CONFLICT DO NOTHING;
INSERT INTO public.onto_projects (id, name, type_key, created_by, state_key) VALUES
	('c6060000-0000-4000-8000-000000000021', 'Victim plan', 'project.default', 'c6060000-0000-4000-8000-000000000012', 'active'),
	('c6060000-0000-4000-8000-000000000022', 'Attacker plan', 'project.default', 'c6060000-0000-4000-8000-000000000011', 'active');
INSERT INTO public.onto_project_members (id, project_id, actor_id, role_key, access) VALUES
	('c6060000-0000-4000-8000-000000000031', 'c6060000-0000-4000-8000-000000000021', 'c6060000-0000-4000-8000-000000000013', 'viewer', 'read');
INSERT INTO public.onto_tasks (id, project_id, title, state_key, created_by) VALUES
	('c6060000-0000-4000-8000-000000000041', 'c6060000-0000-4000-8000-000000000021', 'Victim task', 'todo', 'c6060000-0000-4000-8000-000000000012'),
	('c6060000-0000-4000-8000-000000000042', 'c6060000-0000-4000-8000-000000000022', 'Attacker task', 'todo', 'c6060000-0000-4000-8000-000000000011');
INSERT INTO public.onto_assets (id, project_id, storage_bucket, storage_path, content_type, file_size_bytes, created_by, extracted_text) VALUES
	('c6060000-0000-4000-8000-000000000051', 'c6060000-0000-4000-8000-000000000021', 'onto-assets',
		'projects/c6060000-0000-4000-8000-000000000021/assets/c6060000-0000-4000-8000-000000000051/x.png',
		'image/png', 10, 'c6060000-0000-4000-8000-000000000012', 'victim secret'),
	('c6060000-0000-4000-8000-000000000052', 'c6060000-0000-4000-8000-000000000022', 'onto-assets',
		'projects/c6060000-0000-4000-8000-000000000022/assets/c6060000-0000-4000-8000-000000000052/y.png',
		'image/png', 10, 'c6060000-0000-4000-8000-000000000011', 'attacker text');
INSERT INTO public.chat_sessions (id, user_id, context_type) VALUES
	('c6060000-0000-4000-8000-000000000061', 'c6060000-0000-4000-8000-000000000001', 'global'),
	('c6060000-0000-4000-8000-000000000063', 'c6060000-0000-4000-8000-000000000002', 'global');
INSERT INTO public.chat_messages (id, session_id, user_id, role, content) VALUES
	('c6060000-0000-4000-8000-000000000062', 'c6060000-0000-4000-8000-000000000061', 'c6060000-0000-4000-8000-000000000001', 'user', 'mine'),
	('c6060000-0000-4000-8000-000000000064', 'c6060000-0000-4000-8000-000000000063', 'c6060000-0000-4000-8000-000000000002', 'user', 'theirs');
INSERT INTO public.tasks (id, user_id, title) VALUES
	('c6060000-0000-4000-8000-000000000072', 'c6060000-0000-4000-8000-000000000002', 'Victim legacy task');

-- 1. Grants.
SELECT pg_temp.assert_true(
	has_function_privilege('authenticated', 'public.current_actor_can_link_task_id(uuid)', 'EXECUTE')
	AND NOT has_function_privilege('anon', 'public.current_actor_can_link_task_id(uuid)', 'EXECUTE')
	AND NOT has_function_privilege('authenticated', 'private.task_calendar_events_guard_task_link()', 'EXECUTE')
	AND NOT has_function_privilege('authenticated', 'private.voice_notes_guard_storage_pointer()', 'EXECUTE')
	AND NOT has_function_privilege('authenticated', 'private.chat_message_attachments_guard_refs()', 'EXECUTE')
	AND NOT has_function_privilege('authenticated', 'private.project_calendars_guard_membership()', 'EXECUTE')
	AND NOT has_function_privilege('authenticated', 'public.list_account_deletion_storage_objects(uuid, uuid[])', 'EXECUTE')
	AND NOT has_function_privilege('authenticated', 'public.list_privacy_deleted_voice_note_objects(integer)', 'EXECUTE')
	AND has_function_privilege('service_role', 'public.list_privacy_deleted_voice_note_objects(integer)', 'EXECUTE')
	AND has_table_privilege('authenticated', 'public.chat_message_attachments', 'INSERT')
	AND NOT has_table_privilege('authenticated', 'public.chat_message_attachments', 'UPDATE')
	AND NOT has_table_privilege('anon', 'public.chat_message_attachments', 'INSERT')
	AND NOT has_table_privilege('anon', 'public.voice_notes', 'INSERT')
	AND NOT has_table_privilege('anon', 'public.project_calendars', 'INSERT')
	AND has_table_privilege('authenticated', 'public.voice_notes', 'UPDATE')
	AND has_table_privilege('authenticated', 'public.project_calendars', 'INSERT'),
	'grants');

-- 2. Attacker A.
SELECT pg_temp.as_user('c6060000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
-- task_calendar_events: A forges a legacy task with T's id, then links it. Refused.
SELECT pg_temp.try('a_legacy_spoof', $q$INSERT INTO public.tasks (id, user_id, title) VALUES ('c6060000-0000-4000-8000-000000000041', 'c6060000-0000-4000-8000-000000000001', 'spoof')$q$);
SELECT pg_temp.try('a_link_foreign_onto', $q$INSERT INTO public.task_calendar_events (user_id, task_id, calendar_event_id, calendar_id, sync_source) VALUES ('c6060000-0000-4000-8000-000000000001', 'c6060000-0000-4000-8000-000000000041', 'evt-foreign', 'primary', 'google')$q$);
SELECT pg_temp.try('a_link_foreign_legacy', $q$INSERT INTO public.task_calendar_events (user_id, task_id, calendar_event_id, calendar_id) VALUES ('c6060000-0000-4000-8000-000000000001', 'c6060000-0000-4000-8000-000000000072', 'evt-legacy', 'primary')$q$);
-- A's own legacy task, and a legacy row sharing A's own onto_task id, still link.
SELECT pg_temp.try('a_legacy_own', $q$INSERT INTO public.tasks (id, user_id, title) VALUES ('c6060000-0000-4000-8000-000000000071', 'c6060000-0000-4000-8000-000000000001', 'own')$q$);
SELECT pg_temp.try('a_link_own_legacy', $q$INSERT INTO public.task_calendar_events (id, user_id, task_id, calendar_event_id, calendar_id) VALUES ('c6060000-0000-4000-8000-000000000081', 'c6060000-0000-4000-8000-000000000001', 'c6060000-0000-4000-8000-000000000071', 'evt-own', 'primary')$q$);
SELECT pg_temp.try('a_legacy_own_onto', $q$INSERT INTO public.tasks (id, user_id, title) VALUES ('c6060000-0000-4000-8000-000000000042', 'c6060000-0000-4000-8000-000000000001', 'own onto')$q$);
SELECT pg_temp.try('a_link_own_onto', $q$INSERT INTO public.task_calendar_events (user_id, task_id, calendar_event_id, calendar_id) VALUES ('c6060000-0000-4000-8000-000000000001', 'c6060000-0000-4000-8000-000000000042', 'evt-own-onto', 'primary')$q$);
SELECT pg_temp.try('a_link_repoint', $q$UPDATE public.task_calendar_events SET task_id = 'c6060000-0000-4000-8000-000000000041' WHERE id = 'c6060000-0000-4000-8000-000000000081'$q$);
SELECT pg_temp.try('a_link_status', $q$UPDATE public.task_calendar_events SET sync_status = 'synced', sync_error = NULL WHERE id = 'c6060000-0000-4000-8000-000000000081'$q$);

-- voice_notes.
SELECT pg_temp.try('a_voice_other_bucket', $q$INSERT INTO public.voice_notes (user_id, storage_bucket, storage_path, file_size_bytes, mime_type) VALUES ('c6060000-0000-4000-8000-000000000001', 'onto-assets', 'projects/c6060000-0000-4000-8000-000000000021/assets/c6060000-0000-4000-8000-000000000051/x.png', 1, 'audio/webm')$q$);
SELECT pg_temp.try('a_voice_other_folder', $q$INSERT INTO public.voice_notes (user_id, storage_bucket, storage_path, file_size_bytes, mime_type) VALUES ('c6060000-0000-4000-8000-000000000001', 'voice_notes', 'c6060000-0000-4000-8000-000000000002/n.webm', 1, 'audio/webm')$q$);
SELECT pg_temp.try('a_voice_dotdot', $q$INSERT INTO public.voice_notes (user_id, storage_bucket, storage_path, file_size_bytes, mime_type) VALUES ('c6060000-0000-4000-8000-000000000001', 'voice_notes', 'c6060000-0000-4000-8000-000000000001/../c6060000-0000-4000-8000-000000000002/n.webm', 1, 'audio/webm')$q$);
SELECT pg_temp.try('a_voice_own', $q$INSERT INTO public.voice_notes (id, user_id, storage_bucket, storage_path, file_size_bytes, mime_type) VALUES ('c6060000-0000-4000-8000-000000000091', 'c6060000-0000-4000-8000-000000000001', 'voice_notes', 'c6060000-0000-4000-8000-000000000001/c6060000-0000-4000-8000-000000000091.webm', 1, 'audio/webm')$q$);
SELECT pg_temp.try('a_voice_repoint', $q$UPDATE public.voice_notes SET storage_path = 'c6060000-0000-4000-8000-000000000002/n.webm' WHERE id = 'c6060000-0000-4000-8000-000000000091'$q$);
SELECT pg_temp.try('a_voice_soft_delete', $q$UPDATE public.voice_notes SET deleted_at = now(), transcript = 'kept' WHERE id = 'c6060000-0000-4000-8000-000000000091'$q$);

-- chat_message_attachments.
SELECT pg_temp.try('a_attach_foreign_asset', $q$INSERT INTO public.chat_message_attachments (message_id, session_id, user_id, project_id, asset_id, attachment_kind, media_type) VALUES ('c6060000-0000-4000-8000-000000000062', 'c6060000-0000-4000-8000-000000000061', 'c6060000-0000-4000-8000-000000000001', NULL, 'c6060000-0000-4000-8000-000000000051', 'onto_asset', 'image')$q$);
SELECT pg_temp.try('a_attach_foreign_project', $q$INSERT INTO public.chat_message_attachments (message_id, session_id, user_id, project_id, attachment_kind, media_type, metadata) VALUES ('c6060000-0000-4000-8000-000000000062', 'c6060000-0000-4000-8000-000000000061', 'c6060000-0000-4000-8000-000000000001', 'c6060000-0000-4000-8000-000000000021', 'temporary_file', 'image', '{"temporary_attachment_id":"t1"}')$q$);
SELECT pg_temp.try('a_attach_on_victim_message', $q$INSERT INTO public.chat_message_attachments (message_id, session_id, user_id, project_id, asset_id, attachment_kind, media_type) VALUES ('c6060000-0000-4000-8000-000000000064', 'c6060000-0000-4000-8000-000000000063', 'c6060000-0000-4000-8000-000000000001', 'c6060000-0000-4000-8000-000000000022', 'c6060000-0000-4000-8000-000000000052', 'onto_asset', 'image')$q$);
SELECT pg_temp.try('a_attach_own', $q$INSERT INTO public.chat_message_attachments (message_id, session_id, user_id, project_id, asset_id, attachment_kind, media_type) VALUES ('c6060000-0000-4000-8000-000000000062', 'c6060000-0000-4000-8000-000000000061', 'c6060000-0000-4000-8000-000000000001', 'c6060000-0000-4000-8000-000000000022', 'c6060000-0000-4000-8000-000000000052', 'onto_asset', 'image')$q$);
SELECT pg_temp.try('a_attach_repoint', $q$UPDATE public.chat_message_attachments SET asset_id = 'c6060000-0000-4000-8000-000000000051' WHERE message_id = 'c6060000-0000-4000-8000-000000000062'$q$);

-- project_calendars.
SELECT pg_temp.try('a_calendar_foreign', $q$INSERT INTO public.project_calendars (project_id, user_id, calendar_id, calendar_name) VALUES ('c6060000-0000-4000-8000-000000000021', 'c6060000-0000-4000-8000-000000000001', 'cal-foreign', 'Spy')$q$);
SELECT pg_temp.try('a_calendar_own', $q$INSERT INTO public.project_calendars (id, project_id, user_id, calendar_id, calendar_name) VALUES ('c6060000-0000-4000-8000-0000000000a1', 'c6060000-0000-4000-8000-000000000022', 'c6060000-0000-4000-8000-000000000001', 'cal-own', 'Mine')$q$);
SELECT pg_temp.try('a_calendar_move', $q$UPDATE public.project_calendars SET project_id = 'c6060000-0000-4000-8000-000000000021' WHERE id = 'c6060000-0000-4000-8000-0000000000a1'$q$);
SELECT pg_temp.try('a_calendar_rename', $q$UPDATE public.project_calendars SET calendar_name = 'Mine v2', sync_enabled = false WHERE id = 'c6060000-0000-4000-8000-0000000000a1'$q$);
RESET ROLE;

SELECT pg_temp.assert_true((SELECT value = 'ok' FROM results WHERE key = 'a_legacy_spoof'), 'legacy task insert itself is unchanged');
SELECT pg_temp.assert_true((SELECT value = 'task_calendar_event_task_not_writable' FROM results WHERE key = 'a_link_foreign_onto'), 'link to a foreign onto_task refused');
SELECT pg_temp.assert_true((SELECT value = 'task_calendar_event_task_not_writable' FROM results WHERE key = 'a_link_foreign_legacy'), 'link to a foreign legacy task refused');
SELECT pg_temp.assert_true((SELECT value = 'ok' FROM results WHERE key = 'a_link_own_legacy'), 'own legacy link works');
SELECT pg_temp.assert_true((SELECT value = 'ok' FROM results WHERE key = 'a_link_own_onto'), 'link to own writable onto_task id works');
SELECT pg_temp.assert_true((SELECT value = 'task_calendar_event_task_not_writable' FROM results WHERE key = 'a_link_repoint'), 'repointing a link refused');
SELECT pg_temp.assert_true((SELECT value = 'ok' FROM results WHERE key = 'a_link_status'), 'sync status update works');
SELECT pg_temp.assert_true((SELECT value = 'voice_note_storage_outside_owner_folder' FROM results WHERE key = 'a_voice_other_bucket'), 'voice note in another bucket refused');
SELECT pg_temp.assert_true((SELECT value = 'voice_note_storage_outside_owner_folder' FROM results WHERE key = 'a_voice_other_folder'), 'voice note in another folder refused');
SELECT pg_temp.assert_true((SELECT value = 'voice_note_storage_outside_owner_folder' FROM results WHERE key = 'a_voice_dotdot'), 'voice note path with .. refused');
SELECT pg_temp.assert_true((SELECT value = 'ok' FROM results WHERE key = 'a_voice_own'), 'own voice note works');
SELECT pg_temp.assert_true((SELECT value = 'voice_note_storage_immutable' FROM results WHERE key = 'a_voice_repoint'), 'voice note repoint refused');
SELECT pg_temp.assert_true((SELECT value = 'ok' FROM results WHERE key = 'a_voice_soft_delete'), 'voice note soft delete works');
SELECT pg_temp.assert_true((SELECT value = 'chat_attachment_asset_not_readable' FROM results WHERE key = 'a_attach_foreign_asset'), 'foreign asset attachment refused');
SELECT pg_temp.assert_true((SELECT value = 'chat_attachment_project_not_readable' FROM results WHERE key = 'a_attach_foreign_project'), 'foreign project attachment refused');
SELECT pg_temp.assert_true((SELECT value = 'chat_attachment_message_not_owned' FROM results WHERE key = 'a_attach_on_victim_message'), 'attachment on another user message refused');
SELECT pg_temp.assert_true((SELECT value = 'ok' FROM results WHERE key = 'a_attach_own'), 'own attachment works');
SELECT pg_temp.assert_true((SELECT value LIKE 'permission denied%' FROM results WHERE key = 'a_attach_repoint'), 'attachment update refused');
SELECT pg_temp.assert_true((SELECT value = 'project_calendar_requires_membership' FROM results WHERE key = 'a_calendar_foreign'), 'calendar for a foreign project refused');
SELECT pg_temp.assert_true((SELECT value = 'ok' FROM results WHERE key = 'a_calendar_own'), 'own project calendar works');
SELECT pg_temp.assert_true((SELECT value = 'project_calendar_requires_membership' FROM results WHERE key = 'a_calendar_move'), 'moving a calendar to a foreign project refused');
SELECT pg_temp.assert_true((SELECT value = 'ok' FROM results WHERE key = 'a_calendar_rename'), 'calendar settings update works');
SELECT pg_temp.assert_true(
	(SELECT title = 'Victim task' FROM public.onto_tasks WHERE id = 'c6060000-0000-4000-8000-000000000041')
	AND NOT EXISTS (SELECT 1 FROM public.task_calendar_events WHERE task_id = 'c6060000-0000-4000-8000-000000000041')
	AND NOT EXISTS (SELECT 1 FROM public.chat_message_attachments WHERE asset_id = 'c6060000-0000-4000-8000-000000000051')
	AND NOT EXISTS (SELECT 1 FROM public.project_calendars WHERE project_id = 'c6060000-0000-4000-8000-000000000021'),
	'no attacker pointer rows were written');

-- 3. Read member M can map P to their own calendar.
SELECT pg_temp.as_user('c6060000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
SELECT pg_temp.try('m_calendar_member', $q$INSERT INTO public.project_calendars (project_id, user_id, calendar_id, calendar_name) VALUES ('c6060000-0000-4000-8000-000000000021', 'c6060000-0000-4000-8000-000000000003', 'cal-member', 'Shared')$q$);
RESET ROLE;
SELECT pg_temp.assert_true((SELECT value = 'ok' FROM results WHERE key = 'm_calendar_member'), 'member can map the project calendar');

-- 4. Server writers are not restricted (run as the owner role; the guards only act on
--    authenticated/anon).
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO public.voice_notes (id, user_id, storage_bucket, storage_path, file_size_bytes, mime_type, deleted_at) VALUES
	-- Older pointer rows the guard never saw: one at another user's audio, one at brief audio.
	('c6060000-0000-4000-8000-000000000092', 'c6060000-0000-4000-8000-000000000001', 'voice_notes',
		'c6060000-0000-4000-8000-000000000002/victim.webm', 1, 'audio/webm', now() - interval '40 days'),
	('c6060000-0000-4000-8000-000000000093', 'c6060000-0000-4000-8000-000000000001', 'brief-audio',
		'c6060000-0000-4000-8000-000000000002/brief.mp3', 1, 'audio/webm', NULL),
	-- A's own old deleted note.
	('c6060000-0000-4000-8000-000000000094', 'c6060000-0000-4000-8000-000000000001', 'voice_notes',
		'c6060000-0000-4000-8000-000000000001/old.webm', 1, 'audio/webm', now() - interval '40 days');
UPDATE public.chat_message_attachments SET display_order = 1
WHERE message_id = 'c6060000-0000-4000-8000-000000000062';

-- 5. Deletion and purge listings only follow voice note rows in the owner's folder.
INSERT INTO storage.buckets (id, name) VALUES ('voice_notes', 'voice_notes') ON CONFLICT DO NOTHING;
INSERT INTO storage.objects (bucket_id, name) VALUES
	('voice_notes', 'c6060000-0000-4000-8000-000000000002/victim.webm'),
	('voice_notes', 'c6060000-0000-4000-8000-000000000001/old.webm');
SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1 FROM public.list_privacy_deleted_voice_note_objects(1000)
		WHERE object_name = 'c6060000-0000-4000-8000-000000000002/victim.webm'
	)
	AND EXISTS (
		SELECT 1 FROM public.list_privacy_deleted_voice_note_objects(1000)
		WHERE object_name = 'c6060000-0000-4000-8000-000000000001/old.webm'
	),
	'purge skips pointer rows and keeps own old notes');
SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1 FROM public.list_account_deletion_storage_objects('c6060000-0000-4000-8000-000000000001')
		WHERE object_name LIKE 'c6060000-0000-4000-8000-000000000002/%'
	)
	AND EXISTS (
		SELECT 1 FROM public.list_account_deletion_storage_objects('c6060000-0000-4000-8000-000000000001')
		WHERE bucket_id = 'voice_notes' AND object_name = 'c6060000-0000-4000-8000-000000000001/c6060000-0000-4000-8000-000000000091.webm'
	),
	'account deletion skips pointer rows and keeps own notes');

ROLLBACK;

SELECT 'user pointer rows guard: all checks passed' AS result;
