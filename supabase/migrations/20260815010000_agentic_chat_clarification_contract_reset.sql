-- supabase/migrations/20260815010000_agentic_chat_clarification_contract_reset.sql
-- A successful request_turn_clarification is an ordered semantic control.
-- It rejects any premature declarations from the current turn and prevents
-- pre-clarification failed writes from becoming implicit pending work, while
-- preserving an older in-scope pending contract. Keep the established trigger
-- implementation and its internal helper isolation intact by patching its
-- stored definition rather than duplicating the full fulfillment algorithm.

BEGIN;

DO $migration$
DECLARE
	v_function regprocedure;
	v_definition text;
	v_patched text;
BEGIN
	v_function := to_regprocedure(
		'public.apply_agentic_chat_terminal_pending_contract_v1()'
	);
	IF v_function IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_clarification_reset_prerequisite_missing'
			USING HINT = 'Apply migrations 20260814010000 through 20260814013000 before this migration.';
	END IF;

	SELECT pg_get_functiondef(v_function)
	INTO STRICT v_definition;

	-- Migration runners execute this file once, but operators may replay it
	-- while reconciling SQL-editor state. Treat the complete installed patch as
	-- success without weakening failures for missing or partially patched bases.
	IF v_definition LIKE '%v_prior_outcomes jsonb := ''[]''::jsonb;%'
		AND v_definition LIKE '%request_turn_clarification%'
		AND v_definition LIKE '%agentic_chat_turn_contract_invalid_reset_control%' THEN
		RAISE NOTICE 'agentic_chat_clarification_contract_reset_already_applied';
		RETURN;
	END IF;

	v_patched := replace(
		v_definition,
		E'\tv_existing_pending jsonb;',
		E'\tv_existing_pending jsonb;\n\tv_prior_outcomes jsonb := \'[]\'::jsonb;'
	);
	IF v_patched = v_definition THEN
		RAISE EXCEPTION 'agentic_chat_clarification_reset_prior_state_patch_failed';
	END IF;
	v_definition := v_patched;

	v_patched := replace(
		v_definition,
		E'\tIF NOT v_existing_contract_valid THEN\n\t\tv_existing_pending := NULL;\n\tEND IF;',
		E'\tIF NOT v_existing_contract_valid THEN\n\t\tv_existing_pending := NULL;\n\tEND IF;\n\tv_prior_outcomes := v_outcomes;'
	);
	IF v_patched = v_definition THEN
		RAISE EXCEPTION 'agentic_chat_clarification_reset_prior_snapshot_patch_failed';
	END IF;
	v_definition := v_patched;

	v_patched := replace(
		v_definition,
		E'AND executions.tool_name IN (\'declare_turn_contract\', \'cancel_turn_contract\')',
		E'AND executions.tool_name IN (\'declare_turn_contract\', \'cancel_turn_contract\', \'request_turn_clarification\')'
	);
	IF v_patched = v_definition THEN
		RAISE EXCEPTION 'agentic_chat_clarification_reset_control_surface_patch_failed';
	END IF;
	v_definition := v_patched;

	v_patched := replace(
		v_definition,
		E'\t\tIF v_execution.tool_name = \'cancel_turn_contract\' THEN\n\t\t\tIF NULLIF(btrim(v_execution.arguments->>\'reason\'), \'\') IS NULL THEN\n\t\t\t\tRAISE EXCEPTION \'agentic_chat_turn_contract_invalid_cancellation\';\n\t\t\tEND IF;\n\t\t\tv_outcomes := \'[]\'::jsonb;\n\t\t\tv_last_cancel_sequence := v_execution.sequence_index;\n\t\t\tCONTINUE;\n\t\tEND IF;',
		E'\t\tIF v_execution.tool_name IN (\'cancel_turn_contract\', \'request_turn_clarification\') THEN\n\t\t\tIF NULLIF(btrim(v_execution.arguments->>\'reason\'), \'\') IS NULL\n\t\t\t\tOR (v_execution.tool_name = \'request_turn_clarification\'\n\t\t\t\t\tAND NULLIF(btrim(v_execution.arguments->>\'question\'), \'\') IS NULL) THEN\n\t\t\t\tRAISE EXCEPTION \'agentic_chat_turn_contract_invalid_reset_control\';\n\t\t\tEND IF;\n\t\t\tv_outcomes := CASE\n\t\t\t\tWHEN v_execution.tool_name = \'cancel_turn_contract\' THEN \'[]\'::jsonb\n\t\t\t\tELSE v_prior_outcomes\n\t\t\tEND;\n\t\t\tv_last_cancel_sequence := v_execution.sequence_index;\n\t\t\tCONTINUE;\n\t\tEND IF;'
	);
	IF v_patched = v_definition THEN
		RAISE EXCEPTION 'agentic_chat_clarification_reset_control_logic_patch_failed';
	END IF;
	v_definition := v_patched;

	EXECUTE v_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.apply_agentic_chat_terminal_pending_contract_v1()
	FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.apply_agentic_chat_terminal_pending_contract_v1() IS
	'Atomically applies ordered declaration, cancellation, and clarification controls and persists only scope-safe unfinished durable outcomes for worker turns.';

COMMIT;
