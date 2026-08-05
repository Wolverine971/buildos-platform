-- supabase/migrations/20260804037000_agentic_chat_worker_lifecycle_observations.sql
-- Agentic Chat Worker, Phase 4 Slice 12: private lifecycle-observability
-- projection over already-durable worker facts. This view must never be used
-- as the public reconnect stream or consume public sequence numbers.

BEGIN;

CREATE VIEW public.agentic_chat_worker_lifecycle_observations
WITH (security_invoker = true)
AS
WITH worker_turns AS NOT MATERIALIZED (
	SELECT turns.*
	FROM public.chat_turn_runs turns
	WHERE turns.execution_mode = 'worker_realtime'
),
observation_sources AS (
	SELECT
		turns.id AS turn_run_id,
		turns.session_id,
		turns.user_id,
		turns.stream_run_id,
		turns.execution_generation,
		10 AS lifecycle_ordinal,
		0::bigint AS source_sequence,
		'turn_intent_resolved'::text AS observation_key,
		'prompt'::text AS phase,
		'turn_intent_resolved'::text AS event_type,
		jsonb_strip_nulls(jsonb_build_object(
			'context_type', turns.context_type,
			'entity_id', turns.entity_id,
			'project_id', turns.project_id,
			'request_hash_version', turns.request_hash_version
		)) AS payload,
		'turn_run'::text AS source_kind,
		turns.id::text AS source_id,
		turns.created_at AS observed_at
	FROM worker_turns turns

	UNION ALL

	SELECT
		turns.id,
		turns.session_id,
		turns.user_id,
		turns.stream_run_id,
		turns.execution_generation,
		20,
		0::bigint,
		'prepared_prompt_cache_checked',
		'prompt',
		'prepared_prompt_cache_checked',
		jsonb_strip_nulls(jsonb_build_object(
			'prepared_prompt_hit', turns.prepared_prompt_hit,
			'prepared_prompt_id', turns.prepared_prompt_id,
			'prepared_prompt_miss_reason', turns.prepared_prompt_miss_reason,
			'prepared_surface_profile', turns.prepared_surface_profile,
			'cache_source', turns.cache_source,
			'cache_age_seconds', turns.cache_age_seconds
		)),
		'turn_run',
		turns.id::text,
		turns.started_at
	FROM worker_turns turns

	UNION ALL

	SELECT
		turns.id,
		turns.session_id,
		turns.user_id,
		turns.stream_run_id,
		turns.execution_generation,
		30,
		events.sequence_index::bigint,
		'tool_call_emitted:' || events.event_id,
		'tool',
		'tool_call_emitted',
		events.payload,
		'public_stream_event',
		events.event_id,
		events.created_at
	FROM worker_turns turns
	JOIN public.chat_turn_events events
		ON events.turn_run_id = turns.id
		AND events.execution_generation = turns.execution_generation
	WHERE events.event_type = 'tool_call'
		AND events.payload->>'type' = 'tool_call'

	UNION ALL

	SELECT
		turns.id,
		turns.session_id,
		turns.user_id,
		turns.stream_run_id,
		turns.execution_generation,
		40,
		events.sequence_index::bigint,
		'first_tool_call_planning_cue_emitted:' || events.event_id,
		'stream',
		'first_tool_call_planning_cue_emitted',
		events.payload,
		'public_stream_event',
		events.event_id,
		events.created_at
	FROM worker_turns turns
	JOIN public.chat_turn_events events
		ON events.turn_run_id = turns.id
		AND events.execution_generation = turns.execution_generation
	WHERE events.event_type = 'agent_state'
		AND events.payload->>'type' = 'agent_state'
		AND events.payload->>'state' = 'thinking'
		AND events.payload->>'details' = 'Planning the first step...'

	UNION ALL

	SELECT
		turns.id,
		turns.session_id,
		turns.user_id,
		turns.stream_run_id,
		turns.execution_generation,
		50,
		events.sequence_index::bigint,
		'tool_result_received:' || events.event_id,
		'tool',
		'tool_result_received',
		events.payload,
		'public_stream_event',
		events.event_id,
		events.created_at
	FROM worker_turns turns
	JOIN public.chat_turn_events events
		ON events.turn_run_id = turns.id
		AND events.execution_generation = turns.execution_generation
	WHERE events.event_type = 'tool_result'
		AND events.payload->>'type' = 'tool_result'

	UNION ALL

	SELECT
		turns.id,
		turns.session_id,
		turns.user_id,
		turns.stream_run_id,
		turns.execution_generation,
		60,
		events.sequence_index::bigint,
		'turn_phase_changed:' || events.event_id,
		'stream',
		'turn_phase_changed',
		events.payload,
		'public_stream_event',
		events.event_id,
		events.created_at
	FROM worker_turns turns
	JOIN public.chat_turn_events events
		ON events.turn_run_id = turns.id
		AND events.execution_generation = turns.execution_generation
	WHERE events.event_type = 'turn_phase'
		AND events.payload->>'type' = 'turn_phase'
		AND events.payload->>'turn_phase' = 'finalizing'

	UNION ALL

	SELECT
		turns.id,
		turns.session_id,
		turns.user_id,
		turns.stream_run_id,
		turns.execution_generation,
		70,
		0::bigint,
		'turn_outcome_resolved',
		'finalize',
		'turn_outcome_resolved',
		jsonb_build_object(
			'status', turns.status,
			'finished_reason', turns.finished_reason,
			'assistant_message_linked', turns.assistant_message_id IS NOT NULL,
			'tool_round_count', turns.tool_round_count,
			'tool_call_count', turns.tool_call_count
		),
		'turn_run',
		turns.id::text,
		COALESCE(turns.finished_at, turns.updated_at)
	FROM worker_turns turns
	WHERE turns.status IN ('completed', 'cancelled')
		AND EXISTS (
			SELECT 1
			FROM public.chat_turn_events done_events
			WHERE done_events.turn_run_id = turns.id
				AND done_events.execution_generation = turns.execution_generation
				AND done_events.event_type = 'done'
				AND done_events.payload->>'type' = 'done'
		)

	UNION ALL

	SELECT
		turns.id,
		turns.session_id,
		turns.user_id,
		turns.stream_run_id,
		turns.execution_generation,
		80,
		0::bigint,
		'orchestration_interventions',
		'finalize',
		'orchestration_interventions',
		jsonb_build_object('interventions', '[]'::jsonb, 'count', 0),
		'turn_run',
		turns.id::text,
		COALESCE(turns.finished_at, turns.updated_at)
	FROM worker_turns turns
	WHERE turns.status IN ('completed', 'cancelled')
		AND EXISTS (
			SELECT 1
			FROM public.chat_turn_events done_events
			WHERE done_events.turn_run_id = turns.id
				AND done_events.execution_generation = turns.execution_generation
				AND done_events.event_type = 'done'
				AND done_events.payload->>'type' = 'done'
		)

	UNION ALL

	SELECT
		turns.id,
		turns.session_id,
		turns.user_id,
		turns.stream_run_id,
		turns.execution_generation,
		90,
		events.sequence_index::bigint,
		'done_emitted:' || events.event_id,
		'finalize',
		'done_emitted',
		events.payload,
		'public_stream_event',
		events.event_id,
		events.created_at
	FROM worker_turns turns
	JOIN public.chat_turn_events events
		ON events.turn_run_id = turns.id
		AND events.execution_generation = turns.execution_generation
	WHERE events.event_type = 'done'
		AND events.payload->>'type' = 'done'

	UNION ALL

	SELECT
		turns.id,
		turns.session_id,
		turns.user_id,
		turns.stream_run_id,
		turns.execution_generation,
		100,
		0::bigint,
		'prompt_snapshot_created:' || snapshots.id::text,
		'prompt',
		'prompt_snapshot_created',
		jsonb_build_object(
			'prompt_snapshot_id', snapshots.id,
			'snapshot_version', snapshots.snapshot_version,
			'messages_sha256', snapshots.messages_sha256,
			'system_prompt_sha256', snapshots.system_prompt_sha256
		),
		'prompt_snapshot',
		snapshots.id::text,
		snapshots.created_at
	FROM worker_turns turns
	JOIN public.chat_prompt_snapshots snapshots
		ON snapshots.id = turns.prompt_snapshot_id
		AND snapshots.turn_run_id = turns.id
		AND snapshots.session_id = turns.session_id
		AND snapshots.user_id = turns.user_id
),
ranked AS (
	SELECT
		sources.*,
		row_number() OVER (
			PARTITION BY sources.turn_run_id, sources.execution_generation
			ORDER BY sources.lifecycle_ordinal, sources.source_sequence, sources.observation_key
		)::integer AS observation_sequence_index
	FROM observation_sources sources
)
SELECT
	turn_run_id,
	session_id,
	user_id,
	stream_run_id,
	execution_generation,
	observation_sequence_index,
	observation_key,
	phase,
	event_type,
	payload,
	source_kind,
	source_id,
	observed_at
FROM ranked;

REVOKE ALL ON TABLE public.agentic_chat_worker_lifecycle_observations
	FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.agentic_chat_worker_lifecycle_observations TO service_role;

COMMENT ON VIEW public.agentic_chat_worker_lifecycle_observations IS
	'Private service-only projection of legacy lifecycle meanings from authoritative worker turn, public stream, terminal, tool, and prompt-snapshot facts. It is not a public reconnect stream.';

COMMIT;
