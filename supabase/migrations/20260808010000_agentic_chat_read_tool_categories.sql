-- supabase/migrations/20260808010000_agentic_chat_read_tool_categories.sql
-- Phase 4 Slice 18 S3: the shared read catalog uses TOOL_METADATA's semantic
-- `read` / `search` categories. Preserve the deployed constraint expression
-- verbatim and widen it only by those two values; production has accumulated
-- category history that must not be reconstructed from a stale local list.

DO $$
DECLARE
	v_existing_expression text;
BEGIN
	SELECT pg_get_expr(constraints.conbin, constraints.conrelid)
	INTO v_existing_expression
	FROM pg_constraint constraints
	WHERE constraints.conrelid = 'public.chat_tool_executions'::regclass
		AND constraints.conname = 'chat_tool_executions_tool_category_check'
		AND constraints.contype = 'c';

	IF v_existing_expression IS NULL THEN
		RAISE EXCEPTION
			'chat_tool_executions_tool_category_check is missing; refusing to invent a replacement';
	END IF;

	ALTER TABLE public.chat_tool_executions
		DROP CONSTRAINT chat_tool_executions_tool_category_check;

	EXECUTE format(
		'ALTER TABLE public.chat_tool_executions ADD CONSTRAINT chat_tool_executions_tool_category_check CHECK ((%s) OR tool_category = ANY (ARRAY[''read''::text, ''search''::text])) NOT VALID',
		v_existing_expression
	);

	ALTER TABLE public.chat_tool_executions
		VALIDATE CONSTRAINT chat_tool_executions_tool_category_check;
END
$$;

COMMENT ON CONSTRAINT chat_tool_executions_tool_category_check
	ON public.chat_tool_executions IS
	'Legacy chat execution categories plus Phase 4 shared read/search categories; widened without removing deployed values.';
