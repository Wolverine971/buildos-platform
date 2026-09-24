-- supabase/migrations/20260924190200_redact_stored_pass_through_tool_results.sql
-- Tasker 103: stored results of pass-through read tools become content-free.
--
-- Content BuildOS reads on the user's behalf (Gmail, Google Calendar events it
-- did not create, web pages) is used during the turn and not kept. The worker
-- now stores a content-free trace for these tools
-- (packages/agentic-chat-runtime/src/tools/tool-storage-projection.ts). This
-- one-time rewrite replaces what older rows still hold with a minimal
-- {content_redacted, tool_name, redaction_notice} object in:
--   * chat_tool_executions.result
--   * chat_turn_events.payload->'result'->'result' (event_type = 'tool_result')
--   * chat_turn_stream_state.projection->'semantic_events' (copies of those events)
-- and replaces web_navigate tool_progress descriptions (page titles and link
-- labels) with a fixed step description.
--
-- Tool arguments and tool_call events are not touched.
--
-- Matching is structural only: tool_name, event_type, and the JSON key
-- content_redacted (values that already carry it are kept, so the migration is
-- idempotent). get_calendar_event_details rows for a BuildOS-created event
-- (result.source = 'ontology') are workspace data and keep their result.
--
-- This transforms production data in place and cannot be undone.

BEGIN;

CREATE FUNCTION public.tasker103_pass_through_trace(p_tool_name text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
	SELECT jsonb_build_object(
		'content_redacted', true,
		'tool_name', p_tool_name,
		'redaction_notice', CASE
			WHEN p_tool_name IN ('search_email_messages', 'get_email_message', 'scan_email_inbox')
				THEN 'Email content is not stored; it was available to the assistant only during the turn.'
			WHEN p_tool_name IN ('list_calendar_events', 'get_calendar_event_details')
				THEN 'Google Calendar event details are not stored; they were available to the assistant only during the turn.'
			ELSE 'Web content is not stored; it was available to the assistant only during the turn.'
		END
	);
$function$;

CREATE FUNCTION public.tasker103_pass_through_result_needs_redaction(
	p_tool_name text,
	p_result jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
	SELECT coalesce(
		p_tool_name IN (
			'search_email_messages',
			'get_email_message',
			'scan_email_inbox',
			'list_calendar_events',
			'get_calendar_event_details',
			'web_search',
			'web_visit',
			'web_navigate'
		)
		AND p_result IS NOT NULL
		AND jsonb_typeof(p_result) <> 'null'
		AND NOT (jsonb_typeof(p_result) = 'object' AND p_result ? 'content_redacted')
		AND NOT (
			p_tool_name = 'get_calendar_event_details'
			AND jsonb_typeof(p_result) = 'object'
			AND p_result->>'source' = 'ontology'
		),
		false
	);
$function$;

-- One durable event payload (or its copy inside a stream projection).
CREATE FUNCTION public.tasker103_redact_pass_through_event(p_event_type text, p_payload jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
	SELECT CASE
		WHEN p_event_type = 'tool_result'
			AND jsonb_typeof(p_payload->'result') = 'object'
			AND public.tasker103_pass_through_result_needs_redaction(
				p_payload->'result'->>'tool_name',
				p_payload->'result'->'result'
			)
		THEN jsonb_set(
			p_payload,
			'{result,result}',
			public.tasker103_pass_through_trace(p_payload->'result'->>'tool_name')
		)
		WHEN p_event_type = 'tool_progress'
			AND p_payload->>'tool_name' = 'web_navigate'
			AND NOT (
				jsonb_typeof(p_payload->'data') = 'object'
				AND p_payload->'data' ? 'content_redacted'
			)
		THEN p_payload || jsonb_build_object(
			'message', 'Web navigation step',
			'data', jsonb_strip_nulls(jsonb_build_object(
				'kind', p_payload->'data'->'kind',
				'page', p_payload->'data'->'page',
				'url', p_payload->'data'->'url',
				'content_redacted', true
			))
		)
		ELSE p_payload
	END;
$function$;

CREATE FUNCTION public.tasker103_redact_pass_through_projection(p_projection jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_events jsonb;
	v_step_descriptions text[];
	v_projection jsonb := p_projection;
BEGIN
	IF jsonb_typeof(p_projection->'semantic_events') IS DISTINCT FROM 'array' THEN
		RETURN p_projection;
	END IF;

	SELECT
		coalesce(
			jsonb_agg(
				public.tasker103_redact_pass_through_event(event->>'event_type', event)
				ORDER BY ordinal
			),
			'[]'::jsonb
		),
		array_agg(event->>'message') FILTER (
			WHERE event->>'event_type' = 'tool_progress'
				AND event->>'tool_name' = 'web_navigate'
		)
	INTO v_events, v_step_descriptions
	FROM jsonb_array_elements(p_projection->'semantic_events')
		WITH ORDINALITY AS elements(event, ordinal);

	v_projection := jsonb_set(v_projection, '{semantic_events}', v_events);
	-- current_activity repeats the latest progress description verbatim; an
	-- equal value is one of the web_navigate descriptions being replaced.
	IF p_projection->>'current_activity' = ANY (v_step_descriptions) THEN
		v_projection := jsonb_set(
			v_projection,
			'{current_activity}',
			to_jsonb('Web navigation step'::text)
		);
	END IF;
	RETURN v_projection;
END;
$function$;

UPDATE public.chat_tool_executions
SET result = public.tasker103_pass_through_trace(tool_name)
WHERE tool_name IN (
		'search_email_messages',
		'get_email_message',
		'scan_email_inbox',
		'list_calendar_events',
		'get_calendar_event_details',
		'web_search',
		'web_visit',
		'web_navigate'
	)
	AND public.tasker103_pass_through_result_needs_redaction(tool_name, result);

-- Turn events are immutable by trigger. Disable only that trigger while this
-- transaction holds the table lock, rewrite the payloads, and restore it before
-- commit (precedent: 20260820010000_agentic_chat_worker_retention_cleanup.sql).
ALTER TABLE public.chat_turn_events
	DISABLE TRIGGER trg_chat_turn_events_validate;
UPDATE public.chat_turn_events
SET payload = public.tasker103_redact_pass_through_event(event_type, payload)
WHERE event_type IN ('tool_result', 'tool_progress')
	AND payload IS DISTINCT FROM public.tasker103_redact_pass_through_event(event_type, payload);
ALTER TABLE public.chat_turn_events
	ENABLE TRIGGER trg_chat_turn_events_validate;

-- The stream-state validator guards identity, generation, and sequences, none
-- of which change here; it is disabled so a projection-only rewrite of an older
-- generation cannot be refused and updated_at is left as it was.
ALTER TABLE public.chat_turn_stream_state
	DISABLE TRIGGER trg_chat_turn_stream_state_validate;
UPDATE public.chat_turn_stream_state
SET projection = public.tasker103_redact_pass_through_projection(projection)
WHERE jsonb_typeof(projection->'semantic_events') = 'array'
	AND projection IS DISTINCT FROM public.tasker103_redact_pass_through_projection(projection);
ALTER TABLE public.chat_turn_stream_state
	ENABLE TRIGGER trg_chat_turn_stream_state_validate;

DROP FUNCTION public.tasker103_redact_pass_through_projection(jsonb);
DROP FUNCTION public.tasker103_redact_pass_through_event(text, jsonb);
DROP FUNCTION public.tasker103_pass_through_result_needs_redaction(text, jsonb);
DROP FUNCTION public.tasker103_pass_through_trace(text);

COMMIT;
