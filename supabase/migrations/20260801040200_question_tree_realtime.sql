-- supabase/migrations/20260801040200_question_tree_realtime.sql
-- Live Question Tree execution.
--
-- Postgres Changes is the websocket transport for the admin graph. The worker
-- continues to write durable table state; clients subscribe to that state and
-- keep a low-frequency HTTP poll only as gap recovery.

DO $$
DECLARE
	v_table text;
BEGIN
	IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
		FOREACH v_table IN ARRAY ARRAY[
			'question_tree_runs',
			'question_tree_nodes',
			'question_tree_proposals',
			'question_tree_events'
		]
		LOOP
			IF NOT EXISTS (
				SELECT 1
				FROM pg_publication_tables
				WHERE pubname = 'supabase_realtime'
					AND schemaname = 'public'
					AND tablename = v_table
			) THEN
				EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
			END IF;
		END LOOP;
	END IF;
END $$;

-- Filters on run_id must continue to work for UPDATE payloads. These tables are
-- bounded by the experiment's 100-node ceiling, so the extra WAL is modest.
ALTER TABLE public.question_tree_runs REPLICA IDENTITY FULL;
ALTER TABLE public.question_tree_nodes REPLICA IDENTITY FULL;
ALTER TABLE public.question_tree_proposals REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION public.question_tree_emit_node_started()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
	IF NEW.attempt_count > OLD.attempt_count AND NEW.status = 'running' THEN
		INSERT INTO public.question_tree_events (run_id, node_id, seq, event_type, payload)
		VALUES (
			NEW.run_id,
			NEW.id,
			0,
			'node.started',
			jsonb_build_object(
				'node_number', NEW.node_number,
				'question', NEW.question,
				'attempt_count', NEW.attempt_count,
				'worker_id', NEW.lease_owner
			)
		);
	END IF;
	RETURN NEW;
END;
$$;

CREATE TRIGGER question_tree_nodes_emit_started
	AFTER UPDATE OF status, attempt_count ON public.question_tree_nodes
	FOR EACH ROW EXECUTE FUNCTION public.question_tree_emit_node_started();

CREATE OR REPLACE FUNCTION public.question_tree_emit_seed_started()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
	IF OLD.status = 'queued'
		AND NEW.status = 'running'
		AND OLD.phase = 'seed'
		AND NEW.phase = 'seed'
	THEN
		INSERT INTO public.question_tree_events (run_id, node_id, seq, event_type, payload)
		VALUES (
			NEW.id,
			NEW.root_node_id,
			0,
			'node.started',
			jsonb_build_object(
				'node_number', 0,
				'question', NEW.root_question,
				'activity', 'seed'
			)
		);
	END IF;
	RETURN NEW;
END;
$$;

CREATE TRIGGER question_tree_runs_emit_seed_started
	AFTER UPDATE OF status, phase ON public.question_tree_runs
	FOR EACH ROW EXECUTE FUNCTION public.question_tree_emit_seed_started();

COMMENT ON FUNCTION public.question_tree_emit_node_started() IS
	'Writes the durable live-activity event whenever a Question Tree agent claims a node.';
