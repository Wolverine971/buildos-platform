-- supabase/migrations/20260801030300_agentic_chat_worker_validate_active_index.sql
-- Agentic Chat Worker migration, Phase 2A Slice 3D: prove the replacement
-- index is valid before the legacy running-only guard may be removed.

DO $$
DECLARE
	v_is_valid boolean;
	v_is_unique boolean;
	v_key_is_session_id boolean;
	v_predicate text;
BEGIN
	SELECT
		indexes.indisvalid,
		indexes.indisunique,
		(
			SELECT count(*) = 1 AND bool_and(attributes.attname = 'session_id')
			FROM unnest(indexes.indkey) AS keys(attnum)
			JOIN pg_attribute attributes
				ON attributes.attrelid = indexes.indrelid
				AND attributes.attnum = keys.attnum
			WHERE keys.attnum > 0
		),
		pg_get_expr(indexes.indpred, indexes.indrelid)
	INTO
		v_is_valid,
		v_is_unique,
		v_key_is_session_id,
		v_predicate
	FROM pg_index indexes
	WHERE indexes.indexrelid =
		to_regclass('public.uq_chat_turn_runs_one_active_per_session');

	IF NOT COALESCE(v_is_valid, false)
		OR NOT COALESCE(v_is_unique, false)
		OR NOT COALESCE(v_key_is_session_id, false)
		OR v_predicate IS NULL
		OR v_predicate NOT LIKE '%queued%'
		OR v_predicate NOT LIKE '%running%'
		OR v_predicate LIKE '%completed%'
		OR v_predicate LIKE '%failed%'
		OR v_predicate LIKE '%cancelled%'
	THEN
		RAISE EXCEPTION
			'agentic_chat_active_index_validation_failed: valid unique session queued/running index is absent';
	END IF;
END;
$$;
