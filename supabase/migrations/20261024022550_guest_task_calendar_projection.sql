-- supabase/migrations/20261024022550_guest_task_calendar_projection.sql
-- Tasker 144: guest-created tasks retain their person's calendar recipient.
-- No new public input field: the gateway stamps this property from its trusted
-- connector identity, in the same transaction as task creation. Ordinary JSON
-- edits cannot remove/reassign it. Events inherit it so queued work can enforce
-- the rule without another task lookup, including after archive/deletion.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION private.guard_guest_task_calendar_projection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_key constant text := 'guest_agent_calendar_user_id';
  v_user text;
  v_old_user text;
  v_creator_user uuid;
  v_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', current_user::text);
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old_user := OLD.props ->> v_key;
  END IF;
  IF TG_TABLE_NAME = 'onto_tasks' THEN
    v_user := coalesce(v_old_user, NEW.props ->> v_key);
    IF v_old_user IS NOT NULL AND NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'A guest calendar task cannot change its creator' USING ERRCODE = '23514';
    END IF;
    IF v_user IS NOT NULL AND v_old_user IS NULL THEN
      IF v_role NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
        RAISE EXCEPTION 'Guest calendar recipient is server-managed' USING ERRCODE = '42501';
      END IF;
      SELECT a.user_id INTO v_creator_user FROM public.onto_actors a WHERE a.id = NEW.created_by;
      IF v_creator_user IS NULL OR v_user IS DISTINCT FROM v_creator_user::text THEN
        RAISE EXCEPTION 'Guest calendar recipient must be the task creator' USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSE
    -- A retained pin also survives task moves/deletion and event props replacement.
    v_user := v_old_user;
    IF v_user IS NULL AND NEW.owner_entity_type = 'task' THEN
      SELECT t.props ->> v_key INTO v_user FROM public.onto_tasks t
      WHERE t.id = NEW.owner_entity_id AND t.project_id = NEW.project_id;
    END IF;
  END IF;
  NEW.props := coalesce(NEW.props, '{}'::jsonb) - v_key;
  IF v_user IS NOT NULL THEN
    NEW.props := jsonb_set(NEW.props, ARRAY[v_key], to_jsonb(v_user));
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_guest_task_calendar_projection() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.guard_guest_task_calendar_projection() TO authenticated, service_role;

CREATE TRIGGER guard_guest_task_calendar_projection
BEFORE INSERT OR UPDATE ON public.onto_tasks
FOR EACH ROW EXECUTE FUNCTION private.guard_guest_task_calendar_projection();

CREATE TRIGGER guard_guest_event_calendar_projection
BEFORE INSERT OR UPDATE ON public.onto_events
FOR EACH ROW EXECUTE FUNCTION private.guard_guest_task_calendar_projection();

COMMIT;
