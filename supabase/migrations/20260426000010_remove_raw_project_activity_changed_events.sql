-- supabase/migrations/20260426000010_remove_raw_project_activity_changed_events.sql
-- Stop emitting raw project.activity.changed events on every project log write.
-- Batched project activity notifications remain intact via queue_project_activity_notification_batch.

BEGIN;

CREATE OR REPLACE FUNCTION public.trg_queue_project_activity_batch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
	PERFORM queue_project_activity_notification_batch(
		p_project_id => NEW.project_id,
		p_actor_user_id => NEW.changed_by,
		p_actor_actor_id => NEW.changed_by_actor_id,
		p_entity_type => NEW.entity_type,
		p_action => NEW.action,
		p_occurred_at => NEW.created_at
	);

	RETURN NEW;
EXCEPTION
	WHEN OTHERS THEN
		RAISE WARNING '[trg_queue_project_activity_batch] Failed for log %: %', NEW.id, SQLERRM;
		RETURN NEW;
END;
$function$;

COMMIT;
