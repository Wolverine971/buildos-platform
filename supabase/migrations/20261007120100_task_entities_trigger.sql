-- supabase/migrations/20261007120100_task_entities_trigger.sql
-- Attaches the task-entity read to every task write (function and tables:
-- 20261007120000_task_entities.sql). Apply together with the worker deploy that registers
-- `extract_task_entities` (apps/worker/src/workers/task-entities/extractTaskEntitiesWorker.ts);
-- before that, queued jobs would wait unclaimed and trip the oldest-pending queue alert.
--
-- Fires on title, description, deleted_at (restores) and project_id (entities follow a moved
-- task). The function returns early when none of the read text changed.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_onto_tasks_extract_entities ON public.onto_tasks;

BEGIN;
SET LOCAL lock_timeout = '5s';

DROP TRIGGER IF EXISTS trg_onto_tasks_extract_entities ON public.onto_tasks;
CREATE TRIGGER trg_onto_tasks_extract_entities
	AFTER INSERT OR UPDATE OF title, description, deleted_at, project_id ON public.onto_tasks
	FOR EACH ROW EXECUTE FUNCTION public.enqueue_task_entity_extraction();

COMMIT;
