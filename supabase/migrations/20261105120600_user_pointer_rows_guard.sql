-- supabase/migrations/20261105120600_user_pointer_rows_guard.sql
--
-- Security audit 2026-11-05, user pointer rows. Signed-in users write their own rows in four
-- tables whose columns point at other rows or Storage objects, and service-role code later
-- follows those pointers without checking that the user may reach the target:
--
-- 1. task_calendar_events.task_id. A user could link another tenant's onto_task id (through a
--    legacy public.tasks row they create with that id) to one of their own Google events; the
--    Google push sync then rewrote that task's title and time with the service role. Now a
--    signed-in writer's task_id must be a legacy task they own, and if an onto_task has that id
--    they must be able to write its project. (The webhook also re-checks before every write.)
-- 2. voice_notes.storage_bucket/storage_path. The data export, transcription, account
--    deletion and 30-day purge read or delete whatever object a row names. A signed-in writer
--    now has to use the voice_notes bucket and their own "<user_id>/" folder, and cannot
--    repoint an existing row. The deletion and purge listings only follow such rows too.
-- 3. chat_message_attachments.asset_id. A user could attach another project's image to their
--    own message and turn admission read its OCR text into their chat. A signed-in writer's
--    row must sit on a message of their own session, and its asset and project must be ones
--    they can read (owner or active member). Nothing in the app updates these rows, so
--    signed-in UPDATE is removed. (The history loader also drops unreadable assets.)
-- 4. project_calendars. Member fan-out sends task details to every project_calendars row of a
--    project, and anyone could insert a row for any project id. A signed-in writer can now only
--    map a project they own or are an active member of. (Fan-out also filters to current
--    members, which covers mappings left behind by removed members.)
--
-- Guards act only on signed-in or anonymous writers (current_user authenticated/anon). The
-- worker and server routes (service_role) and SECURITY DEFINER functions (current_user is their
-- owner) keep working. Logged-out callers had table grants on three of these tables but no
-- policy that could pass; those grants are removed.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

-- 1. task_calendar_events --------------------------------------------------------------------

-- Callable by signed-in users because the guard below runs as the caller (the rehearsal flags
-- this; it is intended). It answers only "may I point a calendar row at this task id" for the
-- signed-in caller: true when no onto_task has the id, otherwise whether the caller can write
-- that task's project. It reveals no task data.
CREATE OR REPLACE FUNCTION public.current_actor_can_link_task_id(p_task_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
	v_project_id uuid;
BEGIN
	IF p_task_id IS NULL OR auth.uid() IS NULL THEN
		RETURN false;
	END IF;

	SELECT t.project_id INTO v_project_id
	FROM public.onto_tasks AS t
	WHERE t.id = p_task_id;
	IF NOT FOUND THEN
		RETURN true;
	END IF;

	-- Uses auth.uid() through current_actor_id().
	RETURN public.current_actor_has_project_member_access(v_project_id, 'write');
END;
$$;

REVOKE ALL ON FUNCTION public.current_actor_can_link_task_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_actor_can_link_task_id(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.task_calendar_events_guard_task_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
	IF current_user NOT IN ('authenticated', 'anon') THEN
		RETURN NEW;
	END IF;
	IF TG_OP = 'UPDATE'
		AND NEW.task_id IS NOT DISTINCT FROM OLD.task_id
		AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id THEN
		RETURN NEW;
	END IF;

	-- Runs as the caller, so the legacy task read goes through RLS.
	IF NOT EXISTS (
		SELECT 1 FROM public.tasks AS t
		WHERE t.id = NEW.task_id AND t.user_id = NEW.user_id
	) OR NOT public.current_actor_can_link_task_id(NEW.task_id) THEN
		RAISE EXCEPTION USING
			ERRCODE = '42501',
			MESSAGE = 'task_calendar_event_task_not_writable',
			DETAIL = 'A calendar link must point at a task you can edit.';
	END IF;

	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.task_calendar_events_guard_task_link() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_task_calendar_events_task_link ON public.task_calendar_events;
CREATE TRIGGER guard_task_calendar_events_task_link
	BEFORE INSERT OR UPDATE ON public.task_calendar_events
	FOR EACH ROW EXECUTE FUNCTION private.task_calendar_events_guard_task_link();

-- 2. voice_notes -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.voice_notes_guard_storage_pointer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
	IF current_user NOT IN ('authenticated', 'anon') THEN
		RETURN NEW;
	END IF;

	IF TG_OP = 'UPDATE' THEN
		IF NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket
			OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
			OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
			RAISE EXCEPTION USING
				ERRCODE = '42501',
				MESSAGE = 'voice_note_storage_immutable',
				DETAIL = 'A voice note keeps the audio file it was uploaded with.';
		END IF;
		RETURN NEW;
	END IF;

	IF NEW.storage_bucket IS DISTINCT FROM 'voice_notes'
		OR NEW.storage_path IS NULL
		OR NOT starts_with(NEW.storage_path, NEW.user_id::text || '/')
		OR length(NEW.storage_path) <= length(NEW.user_id::text) + 1
		OR strpos(NEW.storage_path, '..') > 0 THEN
		RAISE EXCEPTION USING
			ERRCODE = '42501',
			MESSAGE = 'voice_note_storage_outside_owner_folder',
			DETAIL = 'Voice note audio must live in your own folder of the voice_notes bucket.';
	END IF;

	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.voice_notes_guard_storage_pointer() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_voice_notes_storage_pointer ON public.voice_notes;
CREATE TRIGGER guard_voice_notes_storage_pointer
	BEFORE INSERT OR UPDATE ON public.voice_notes
	FOR EACH ROW EXECUTE FUNCTION private.voice_notes_guard_storage_pointer();

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.voice_notes FROM anon;

-- Older rows were never checked, so the purge only follows rows naming the owner's own folder.
CREATE OR REPLACE FUNCTION public.list_privacy_deleted_voice_note_objects(p_limit integer DEFAULT 200)
RETURNS TABLE(object_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
	v_cutoff timestamptz := clock_timestamp() - interval '30 days';
BEGIN
	RETURN QUERY
	SELECT DISTINCT objects.name
	FROM storage.objects objects
	JOIN public.voice_notes notes
		ON notes.storage_bucket = objects.bucket_id
		AND notes.storage_path = objects.name
	LEFT JOIN public.voice_note_groups groups ON groups.id = notes.group_id
	WHERE objects.bucket_id = 'voice_notes'
		AND starts_with(notes.storage_path, notes.user_id::text || '/')
		AND (notes.deleted_at <= v_cutoff OR groups.deleted_at <= v_cutoff)
	ORDER BY objects.name
	LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
END;
$$;

REVOKE ALL ON FUNCTION public.list_privacy_deleted_voice_note_objects(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_privacy_deleted_voice_note_objects(integer) TO service_role;

-- Same body as 20260930170110, except voice note rows count only for the user's own folder.
CREATE OR REPLACE FUNCTION public.list_account_deletion_storage_objects(
	p_user_id uuid,
	p_libri_library_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS TABLE(bucket_id text, object_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $$
	WITH owned_projects AS (
		SELECT unnest(public.account_deletion_purged_project_ids(p_user_id)) AS id
	),
	known_objects AS (
		SELECT note.storage_bucket AS bucket_id, note.storage_path AS object_name
		FROM public.voice_notes AS note
		WHERE note.user_id = p_user_id
			AND note.storage_bucket = 'voice_notes'
			AND starts_with(note.storage_path, p_user_id::text || '/')

		UNION

		SELECT 'brief-audio'::text, brief.audio_storage_path
		FROM public.ontology_daily_briefs AS brief
		WHERE brief.user_id = p_user_id
			AND brief.audio_storage_path IS NOT NULL

		UNION

		SELECT asset.storage_bucket, asset.storage_path
		FROM public.onto_assets AS asset
		WHERE asset.project_id IN (SELECT id FROM owned_projects)

		UNION

		SELECT attachment.storage_bucket, attachment.storage_path
		FROM public.email_attachments AS attachment
		WHERE attachment.created_by::text = p_user_id::text
	)
	SELECT DISTINCT candidate.bucket_id, candidate.object_name
	FROM (
		SELECT known.bucket_id, known.object_name
		FROM known_objects AS known

		UNION

		-- The user-id prefix covers every bucket keyed that way, including the
		-- data-export zips in user-exports ({user_id}/<export-id>.zip).
		SELECT object.bucket_id, object.name
		FROM storage.objects AS object
		WHERE object.owner_id::text = p_user_id::text
			OR object.name LIKE p_user_id::text || '/%'
			OR object.name LIKE 'users/' || p_user_id::text || '/%'

		UNION

		SELECT object.bucket_id, object.name
		FROM storage.objects AS object
		JOIN unnest(COALESCE(p_libri_library_ids, '{}'::uuid[])) AS library(id)
			ON object.name LIKE library.id::text || '/%'
		WHERE object.bucket_id = 'libri-assets'
	) AS candidate
	WHERE candidate.bucket_id IS NOT NULL
		AND candidate.object_name IS NOT NULL
		AND candidate.object_name <> ''
		AND NOT EXISTS (SELECT 1 FROM public.onto_assets asset
			WHERE asset.storage_bucket=candidate.bucket_id AND asset.storage_path=candidate.object_name
			AND asset.project_id NOT IN (SELECT id FROM owned_projects));
$$;

REVOKE ALL ON FUNCTION public.list_account_deletion_storage_objects(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_account_deletion_storage_objects(uuid, uuid[]) TO service_role;

-- 3. chat_message_attachments ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.chat_message_attachments_guard_refs()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
	IF current_user NOT IN ('authenticated', 'anon') THEN
		RETURN NEW;
	END IF;

	-- Runs as the caller, so these reads go through RLS: an asset the caller can't read
	-- (owner or active member of its project) is invisible and counts as refused.
	IF NOT EXISTS (
		SELECT 1
		FROM public.chat_messages AS m
		JOIN public.chat_sessions AS s ON s.id = m.session_id
		WHERE m.id = NEW.message_id
			AND m.session_id = NEW.session_id
			AND s.user_id = NEW.user_id
	) THEN
		RAISE EXCEPTION USING
			ERRCODE = '42501',
			MESSAGE = 'chat_attachment_message_not_owned',
			DETAIL = 'Attachments can only be added to messages in your own chats.';
	END IF;

	IF NEW.asset_id IS NOT NULL AND NOT EXISTS (
		SELECT 1 FROM public.onto_assets AS a WHERE a.id = NEW.asset_id
	) THEN
		RAISE EXCEPTION USING
			ERRCODE = '42501',
			MESSAGE = 'chat_attachment_asset_not_readable',
			DETAIL = 'Attachments can only use images from projects you can open.';
	END IF;

	IF NEW.project_id IS NOT NULL
		AND NOT public.current_actor_has_project_member_access(NEW.project_id, 'read') THEN
		RAISE EXCEPTION USING
			ERRCODE = '42501',
			MESSAGE = 'chat_attachment_project_not_readable',
			DETAIL = 'Attachments can only reference projects you can open.';
	END IF;

	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.chat_message_attachments_guard_refs() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_chat_message_attachments_refs ON public.chat_message_attachments;
CREATE TRIGGER guard_chat_message_attachments_refs
	BEFORE INSERT OR UPDATE ON public.chat_message_attachments
	FOR EACH ROW EXECUTE FUNCTION private.chat_message_attachments_guard_refs();

DROP POLICY IF EXISTS chat_message_attachments_user_update ON public.chat_message_attachments;
REVOKE UPDATE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.chat_message_attachments
	FROM anon, authenticated;
REVOKE INSERT, DELETE ON TABLE public.chat_message_attachments FROM anon;

-- 4. project_calendars -----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.project_calendars_guard_membership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
	IF current_user NOT IN ('authenticated', 'anon') THEN
		RETURN NEW;
	END IF;
	IF TG_OP = 'UPDATE'
		AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id
		AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id THEN
		RETURN NEW;
	END IF;

	-- RLS already pins user_id to auth.uid(); the caller must also belong to the project.
	IF NOT public.current_actor_has_project_member_access(NEW.project_id, 'read') THEN
		RAISE EXCEPTION USING
			ERRCODE = '42501',
			MESSAGE = 'project_calendar_requires_membership',
			DETAIL = 'Only the project owner or a current member can link a calendar to it.';
	END IF;

	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.project_calendars_guard_membership() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_project_calendars_membership ON public.project_calendars;
CREATE TRIGGER guard_project_calendars_membership
	BEFORE INSERT OR UPDATE ON public.project_calendars
	FOR EACH ROW EXECUTE FUNCTION private.project_calendars_guard_membership();

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.project_calendars FROM anon;
