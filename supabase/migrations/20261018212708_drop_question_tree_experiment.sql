-- supabase/migrations/20261018212708_drop_question_tree_experiment.sql
-- Tasker 129: retire the August Question Tree experiment after its code removal.
-- Destructive: the experiment's runs, nodes, proposals and events are deleted.
-- Rehearse only. Do not apply until tasker/129's account-deletion fixture
-- blocker is resolved and the full rehearsal passes; DJ then applies and
-- regenerates the shared types.

BEGIN;
SET LOCAL lock_timeout = '5s';

-- Account deletion is the sole external caller. Remove only its obsolete
-- statement from the deployed definition, preserving later purge fixes, its
-- SECURITY DEFINER/search_path settings, ownership and existing grants.
DO $remove_question_tree_purge$
DECLARE
	v_definition text;
	v_obsolete_statement constant text := E'\tDELETE FROM public.question_tree_runs WHERE created_by = p_user_id;\n';
BEGIN
	SELECT pg_get_functiondef('public.finalize_account_deletion_database(uuid)'::regprocedure)
	INTO v_definition;

	IF position('question_tree' IN v_definition) > 0 THEN
		IF cardinality(string_to_array(v_definition, v_obsolete_statement)) <> 2 THEN
			RAISE EXCEPTION 'Expected one Question Tree account-purge statement; review the deployed function';
		END IF;
		v_definition := replace(v_definition, v_obsolete_statement, '');
		IF position('question_tree' IN v_definition) > 0 THEN
			RAISE EXCEPTION 'Unexpected Question Tree dependency remains in account deletion';
		END IF;
		EXECUTE v_definition;
	END IF;
END;
$remove_question_tree_purge$;

-- Exact RPC signatures from 20260801040100 and 20260801040300. Drop the
-- row-returning claim function before dropping its question_tree_nodes type.
DROP FUNCTION IF EXISTS public.admit_question_tree_proposals(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.claim_question_tree_batch(uuid, text, integer);
DROP FUNCTION IF EXISTS public.complete_question_tree_run(uuid, jsonb, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.control_question_tree_run(uuid, text);
DROP FUNCTION IF EXISTS public.create_question_tree_run_with_job(uuid, text, text, integer, jsonb);
DROP FUNCTION IF EXISTS public.enqueue_question_tree_advance(uuid, integer, timestamptz);
DROP FUNCTION IF EXISTS public.retry_question_tree_node(uuid, uuid);

-- One DROP handles the runs/nodes foreign-key cycle. No CASCADE: an unexpected
-- dependency outside the experiment must fail instead of being removed.
-- Table-owned triggers, indexes, policies and publication membership go too.
DROP TABLE IF EXISTS
	public.question_tree_events,
	public.question_tree_proposals,
	public.question_tree_nodes,
	public.question_tree_runs;

DROP FUNCTION IF EXISTS public.question_tree_assign_event_seq();
DROP FUNCTION IF EXISTS public.question_tree_normalize_question(text);
-- The realtime migration (20260801040200) added these trigger functions.
DROP FUNCTION IF EXISTS public.question_tree_emit_node_started();
DROP FUNCTION IF EXISTS public.question_tree_emit_seed_started();

-- Keep queue_type's admin_question_tree value and historical queue rows.
COMMIT;
