-- supabase/migrations/20260824205329_attach_worker_voice_note_groups.sql
-- Attach a draft voice-note group in the same transaction that persists its
-- user chat message. Both legacy and worker admission write the canonical
-- voice_note_group_id into message metadata; the trigger closes the worker
-- path's cleanup race without adding a second non-atomic admission call.

CREATE OR REPLACE FUNCTION public.attach_voice_note_group_from_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_group_id_text text;
BEGIN
	IF NEW.role IS DISTINCT FROM 'user'
		OR jsonb_typeof(COALESCE(NEW.metadata, 'null'::jsonb)) <> 'object' THEN
		RETURN NEW;
	END IF;

	v_group_id_text := NEW.metadata->>'voice_note_group_id';
	IF v_group_id_text IS NULL
		OR v_group_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
		RETURN NEW;
	END IF;

	UPDATE public.voice_note_groups groups
	SET linked_entity_type = 'chat_message',
		linked_entity_id = NEW.id,
		chat_session_id = NEW.session_id,
		status = 'attached',
		updated_at = clock_timestamp()
	WHERE groups.id = v_group_id_text::uuid
		AND groups.user_id = NEW.user_id
		AND groups.status = 'draft'
		AND groups.deleted_at IS NULL;

	RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.attach_voice_note_group_from_chat_message()
	FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS attach_voice_note_group_from_chat_message
	ON public.chat_messages;
CREATE TRIGGER attach_voice_note_group_from_chat_message
AFTER INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.attach_voice_note_group_from_chat_message();

COMMENT ON FUNCTION public.attach_voice_note_group_from_chat_message() IS
	'Atomically attaches an owned draft voice-note group when its user chat message is inserted.';
