-- supabase/migrations/20260813070000_agentic_chat_terminal_domain_metadata.sql
-- Agentic Chat Worker Phase 4 P5 S3 unit 2: project deterministic domain
-- sensing and durable successful load-tool outcomes into session metadata in
-- the same transaction as authoritative worker terminal truth. Sensing is
-- retained for every terminal status; tool-derived projections match normal
-- completion/cancellation and are skipped for exceptional failure paths.

BEGIN;

CREATE OR REPLACE FUNCTION public.agentic_chat_domain_reference_map_v1_is_valid(
	p_map jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_entry record;
BEGIN
	IF jsonb_typeof(p_map) IS DISTINCT FROM 'object'
		OR (SELECT count(*) FROM jsonb_object_keys(p_map)) > 256 THEN
		RETURN false;
	END IF;
	FOR v_entry IN SELECT key, value FROM jsonb_each(p_map)
	LOOP
		IF v_entry.key !~ '^[a-z0-9][a-z0-9._/-]{0,127}$'
			OR jsonb_typeof(v_entry.value) <> 'array'
			OR jsonb_array_length(v_entry.value) > 16
			OR EXISTS (
				SELECT 1
				FROM jsonb_array_elements(v_entry.value) item(value)
				WHERE jsonb_typeof(item.value) <> 'string'
					OR item.value#>>'{}' !~ '^[a-z0-9][a-z0-9._/-]{0,127}$'
			)
			OR (
				SELECT count(*) <> count(DISTINCT item.value)
				FROM jsonb_array_elements(v_entry.value) item(value)
			)
			OR v_entry.value IS DISTINCT FROM COALESCE((
				SELECT jsonb_agg(item.value ORDER BY item.value#>>'{}')
				FROM jsonb_array_elements(v_entry.value) item(value)
			), '[]'::jsonb) THEN
			RETURN false;
		END IF;
	END LOOP;
	RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agentic_chat_merge_domain_ids_v1(
	p_left jsonb,
	p_right jsonb,
	p_limit integer DEFAULT 8
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
	SELECT COALESCE(jsonb_agg(to_jsonb(items.value) ORDER BY items.first_ordinal), '[]'::jsonb)
	FROM (
		SELECT values.value, min(values.ordinality) AS first_ordinal
		FROM jsonb_array_elements_text(
			COALESCE(p_left, '[]'::jsonb) || COALESCE(p_right, '[]'::jsonb)
		) WITH ORDINALITY values(value, ordinality)
		GROUP BY values.value
		ORDER BY min(values.ordinality)
		LIMIT GREATEST(0, LEAST(COALESCE(p_limit, 8), 64))
	) items;
$function$;

CREATE OR REPLACE FUNCTION public.agentic_chat_jsonb_array_of_objects_v1_is_valid(
	p_array jsonb,
	p_limit integer
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
	IF jsonb_typeof(p_array) IS DISTINCT FROM 'array'
		OR jsonb_array_length(p_array) > GREATEST(0, LEAST(COALESCE(p_limit, 0), 256)) THEN
		RETURN false;
	END IF;
	RETURN NOT EXISTS (
		SELECT 1
		FROM jsonb_array_elements(p_array) item(value)
		WHERE jsonb_typeof(item.value) <> 'object'
	);
END;
$function$;

CREATE OR REPLACE FUNCTION public.agentic_chat_merge_used_domain_signal_v1(
	p_state jsonb,
	p_signal jsonb,
	p_observed_at text,
	p_turn_run_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_entries jsonb := COALESCE(p_state->'used_domains', '[]'::jsonb);
	v_existing jsonb;
	v_existing_ordinal bigint;
	v_new_ordinal bigint;
	v_next jsonb;
	v_merged jsonb;
BEGIN
	SELECT entry.value, entry.ordinality
	INTO v_existing, v_existing_ordinal
	FROM jsonb_array_elements(v_entries) WITH ORDINALITY entry(value, ordinality)
	WHERE COALESCE(entry.value->>'domain_id', '') = COALESCE(p_signal->>'domain_id', '')
		AND COALESCE(entry.value->>'source', '') = COALESCE(p_signal->>'source', '')
		AND COALESCE(entry.value->>'tool_name', '') = COALESCE(p_signal->>'tool_name', '')
		AND COALESCE(entry.value->>'skill_id', '') = COALESCE(p_signal->>'skill_id', '')
		AND COALESCE(entry.value->>'outcome_card_id', '') = COALESCE(p_signal->>'outcome_card_id', '')
		AND COALESCE(entry.value->>'resource_id', '') = COALESCE(p_signal->>'resource_id', '')
	LIMIT 1;

	v_next := jsonb_strip_nulls(p_signal || jsonb_build_object(
		'turn_run_id', p_turn_run_id::text,
		'first_seen_at', COALESCE(v_existing->>'first_seen_at', p_observed_at),
		'last_seen_at', p_observed_at,
		'occurrences', COALESCE((v_existing->>'occurrences')::integer, 0) + 1
	));
	v_new_ordinal := COALESCE(
		v_existing_ordinal,
		(SELECT count(*) + 1 FROM jsonb_array_elements(v_entries))
	);

	SELECT COALESCE(jsonb_agg(
		rows.value ORDER BY rows.sort_time DESC, rows.sort_occurrences DESC, rows.sort_ordinal
	), '[]'::jsonb)
	INTO v_merged
	FROM (
		SELECT candidates.value,
			candidates.value->>'last_seen_at' AS sort_time,
			COALESCE((candidates.value->>'occurrences')::integer, 0) AS sort_occurrences,
			candidates.sort_ordinal
		FROM (
			SELECT entry.value, entry.ordinality AS sort_ordinal
			FROM jsonb_array_elements(v_entries) WITH ORDINALITY entry(value, ordinality)
			WHERE NOT (
				COALESCE(entry.value->>'domain_id', '') = COALESCE(p_signal->>'domain_id', '')
				AND COALESCE(entry.value->>'source', '') = COALESCE(p_signal->>'source', '')
				AND COALESCE(entry.value->>'tool_name', '') = COALESCE(p_signal->>'tool_name', '')
				AND COALESCE(entry.value->>'skill_id', '') = COALESCE(p_signal->>'skill_id', '')
				AND COALESCE(entry.value->>'outcome_card_id', '') = COALESCE(p_signal->>'outcome_card_id', '')
				AND COALESCE(entry.value->>'resource_id', '') = COALESCE(p_signal->>'resource_id', '')
			)
			UNION ALL
			SELECT v_next, v_new_ordinal
		) candidates
		ORDER BY sort_time DESC, sort_occurrences DESC, sort_ordinal
		LIMIT 24
	) rows;

	RETURN jsonb_set(p_state, '{used_domains}', v_merged, true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.agentic_chat_merge_domain_gap_v1(
	p_state jsonb,
	p_candidate jsonb,
	p_observed_at text
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_gap_id text := p_candidate->>'id';
	v_gaps jsonb := COALESCE(p_state->'coverage_gaps', '[]'::jsonb);
	v_backlog jsonb := COALESCE(p_state->'research_backlog', '[]'::jsonb);
	v_existing_gap jsonb;
	v_existing_backlog jsonb;
	v_next_gap jsonb;
	v_next_backlog jsonb;
	v_merged_gaps jsonb;
	v_merged_backlog jsonb;
	v_priority text;
BEGIN
	SELECT entry.value INTO v_existing_gap
	FROM jsonb_array_elements(v_gaps) entry(value)
	WHERE CASE
		WHEN entry.value ? 'missing_skill_id' THEN 'skill:' || (entry.value->>'missing_skill_id')
		ELSE 'resource:' || (entry.value->>'missing_resource_id')
	END = v_gap_id
	LIMIT 1;
	SELECT entry.value INTO v_existing_backlog
	FROM jsonb_array_elements(v_backlog) entry(value)
	WHERE entry.value->>'id' = v_gap_id
	LIMIT 1;

	v_priority := CASE
		WHEN v_existing_backlog IS NULL THEN p_candidate->>'priority'
		WHEN CASE v_existing_backlog->>'priority' WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END
			<= CASE p_candidate->>'priority' WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END
			THEN v_existing_backlog->>'priority'
		ELSE p_candidate->>'priority'
	END;
	v_next_gap := jsonb_strip_nulls(jsonb_build_object(
		'missing_skill_id', p_candidate->'missing_skill_id',
		'missing_resource_id', p_candidate->'missing_resource_id',
		'domain_ids', public.agentic_chat_merge_domain_ids_v1(
			v_existing_gap->'domain_ids', p_candidate->'domain_ids', 8
		),
		'first_seen_at', COALESCE(v_existing_gap->>'first_seen_at', p_observed_at),
		'last_seen_at', p_observed_at,
		'occurrences', COALESCE((v_existing_gap->>'occurrences')::integer, 0) + 1
	));
	v_next_backlog := jsonb_strip_nulls(jsonb_build_object(
		'id', v_gap_id,
		'kind', CASE WHEN p_candidate ? 'missing_skill_id' THEN 'skill' ELSE 'resource' END,
		'status', 'queued',
		'priority', v_priority,
		'domain_ids', public.agentic_chat_merge_domain_ids_v1(
			v_existing_backlog->'domain_ids', p_candidate->'domain_ids', 8
		),
		'missing_skill_id', p_candidate->'missing_skill_id',
		'missing_resource_id', p_candidate->'missing_resource_id',
		'user_need', COALESCE(v_existing_backlog->>'user_need', p_candidate->>'user_need'),
		'summary', COALESCE(v_existing_backlog->>'summary', p_candidate->>'summary'),
		'first_seen_at', COALESCE(v_existing_backlog->>'first_seen_at', p_observed_at),
		'last_seen_at', p_observed_at,
		'occurrences', COALESCE((v_existing_backlog->>'occurrences')::integer, 0) + 1
	));

	SELECT COALESCE(jsonb_agg(rows.value ORDER BY rows.sort_time DESC), '[]'::jsonb)
	INTO v_merged_gaps
	FROM (
		SELECT candidates.value, candidates.value->>'last_seen_at' AS sort_time
		FROM (
			SELECT entry.value
			FROM jsonb_array_elements(v_gaps) entry(value)
			WHERE CASE
				WHEN entry.value ? 'missing_skill_id' THEN 'skill:' || (entry.value->>'missing_skill_id')
				ELSE 'resource:' || (entry.value->>'missing_resource_id')
			END <> v_gap_id
			UNION ALL
			SELECT v_next_gap
		) candidates
		ORDER BY sort_time DESC
		LIMIT 12
	) rows;
	SELECT COALESCE(jsonb_agg(rows.value ORDER BY
		rows.sort_priority,
		rows.sort_time DESC,
		rows.sort_occurrences DESC
	), '[]'::jsonb)
	INTO v_merged_backlog
	FROM (
		SELECT candidates.value,
			CASE candidates.value->>'priority' WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END AS sort_priority,
			candidates.value->>'last_seen_at' AS sort_time,
			COALESCE((candidates.value->>'occurrences')::integer, 0) AS sort_occurrences
		FROM (
			SELECT entry.value
			FROM jsonb_array_elements(v_backlog) entry(value)
			WHERE entry.value->>'id' <> v_gap_id
			UNION ALL
			SELECT v_next_backlog
		) candidates
		ORDER BY sort_priority, sort_time DESC, sort_occurrences DESC
		LIMIT 16
	) rows;

	RETURN jsonb_set(
		jsonb_set(p_state, '{coverage_gaps}', v_merged_gaps, true),
		'{research_backlog}', v_merged_backlog, true
	);
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_agentic_chat_domain_metadata_snapshot_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_snapshot jsonb := NEW.prepared->'domainMetadata';
	v_state jsonb;
BEGIN
	IF NOT (NEW.prepared ? 'domainMetadata') THEN
		RETURN NEW;
	END IF;
	v_state := v_snapshot->'state';
	IF NEW.artifact_version <> 'agentic_chat_input_v3'
		OR jsonb_typeof(v_snapshot) <> 'object'
		OR NOT v_snapshot ?& ARRAY[
			'version', 'sensingApplied', 'state', 'skillDomainIds', 'outcomeCardDomainIds'
		]
		OR (v_snapshot - ARRAY[
			'version', 'sensingApplied', 'state', 'skillDomainIds', 'outcomeCardDomainIds'
		]) <> '{}'::jsonb
		OR v_snapshot->>'version' IS DISTINCT FROM '1'
		OR jsonb_typeof(v_snapshot->'sensingApplied') <> 'boolean'
		OR octet_length(v_snapshot::text) > 524288
		OR jsonb_typeof(v_state) <> 'object'
		OR NOT v_state ?& ARRAY[
			'version', 'updated_at', 'active_domains', 'active_outcome_cards',
			'coverage_gaps', 'research_backlog', 'used_domains',
			'unknown_domain_interests', 'workflow_gap_candidates', 'recent_observations'
		]
		OR (v_state - ARRAY[
			'version', 'updated_at', 'active_domains', 'active_outcome_cards',
			'coverage_gaps', 'research_backlog', 'used_domains',
			'unknown_domain_interests', 'workflow_gap_candidates', 'recent_observations'
		]) <> '{}'::jsonb
		OR v_state->>'version' IS DISTINCT FROM '1'
		OR COALESCE(v_state->>'updated_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$', true)
		OR NOT public.agentic_chat_jsonb_array_of_objects_v1_is_valid(v_state->'active_domains', 6)
		OR NOT public.agentic_chat_jsonb_array_of_objects_v1_is_valid(v_state->'active_outcome_cards', 6)
		OR NOT public.agentic_chat_jsonb_array_of_objects_v1_is_valid(v_state->'coverage_gaps', 12)
		OR NOT public.agentic_chat_jsonb_array_of_objects_v1_is_valid(v_state->'research_backlog', 16)
		OR NOT public.agentic_chat_jsonb_array_of_objects_v1_is_valid(v_state->'used_domains', 24)
		OR NOT public.agentic_chat_jsonb_array_of_objects_v1_is_valid(v_state->'unknown_domain_interests', 16)
		OR NOT public.agentic_chat_jsonb_array_of_objects_v1_is_valid(v_state->'workflow_gap_candidates', 16)
		OR NOT public.agentic_chat_jsonb_array_of_objects_v1_is_valid(v_state->'recent_observations', 8)
		OR NOT public.agentic_chat_domain_reference_map_v1_is_valid(
			v_snapshot->'skillDomainIds'
		)
		OR NOT public.agentic_chat_domain_reference_map_v1_is_valid(
			v_snapshot->'outcomeCardDomainIds'
		) THEN
		RAISE EXCEPTION 'agentic_chat_domain_metadata_invalid_snapshot';
	END IF;
	RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_chat_turn_input_artifacts_zz_domain_metadata
	ON public.chat_turn_input_artifacts;
CREATE TRIGGER trg_chat_turn_input_artifacts_zz_domain_metadata
BEFORE INSERT ON public.chat_turn_input_artifacts
FOR EACH ROW EXECUTE FUNCTION public.validate_agentic_chat_domain_metadata_snapshot_v1();

CREATE OR REPLACE FUNCTION public.apply_agentic_chat_terminal_domain_metadata_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_snapshot jsonb;
	v_state jsonb;
	v_execution record;
	v_payload jsonb;
	v_domain_ids jsonb;
	v_domain_id text;
	v_skill_id text;
	v_outcome_card_id text;
	v_resource_id text;
	v_source text;
	v_signal jsonb;
	v_signal_key text;
	v_used_signals jsonb := '[]'::jsonb;
	v_seen_used_keys text[] := ARRAY[]::text[];
	v_gap_candidates jsonb := '{}'::jsonb;
	v_gap_order text[] := ARRAY[]::text[];
	v_gap jsonb;
	v_gap_id text;
	v_candidate jsonb;
	v_existing_candidate jsonb;
	v_priority text;
	v_observed_at text;
	v_has_projection boolean := false;
	v_session public.chat_sessions%ROWTYPE;
BEGIN
	IF NEW.execution_mode <> 'worker_realtime'
		OR NEW.status NOT IN ('completed', 'failed', 'cancelled')
		OR OLD.status IN ('completed', 'failed', 'cancelled')
		OR NEW.input_artifact_id IS NULL THEN
		RETURN NEW;
	END IF;
	SELECT artifacts.prepared->'domainMetadata'
	INTO v_snapshot
	FROM public.chat_turn_input_artifacts artifacts
	WHERE artifacts.id = NEW.input_artifact_id
		AND artifacts.turn_run_id = NEW.id
		AND artifacts.session_id = NEW.session_id
		AND artifacts.user_id = NEW.user_id;
	IF NOT FOUND OR v_snapshot IS NULL THEN
		RETURN NEW;
	END IF;
	v_state := v_snapshot->'state';
	v_has_projection := (v_snapshot->>'sensingApplied')::boolean;
	IF NEW.terminalized_at IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_terminal_domain_metadata_missing_terminal_time';
	END IF;
	v_observed_at := to_char(
		NEW.terminalized_at AT TIME ZONE 'UTC',
		'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
	);

	FOR v_execution IN
		SELECT executions.tool_name, executions.result
		FROM public.chat_tool_executions executions
		WHERE executions.turn_run_id = NEW.id
			AND executions.session_id = NEW.session_id
			AND NEW.status IN ('completed', 'cancelled')
			AND executions.success = true
			AND executions.tool_name IN (
				'domain_load', 'outcome_card_load', 'work_capability_load',
				'resource_load', 'skill_load'
			)
		ORDER BY executions.sequence_index, executions.id
	LOOP
		v_payload := v_execution.result;
		IF jsonb_typeof(v_payload) <> 'object'
			OR COALESCE(v_payload->>'type', '') IN ('not_found', 'forbidden') THEN
			CONTINUE;
		END IF;
		v_domain_ids := '[]'::jsonb;
		v_skill_id := NULL;
		v_outcome_card_id := NULL;
		v_resource_id := NULL;
		v_source := NULL;

		IF v_execution.tool_name = 'domain_load' THEN
			v_source := 'domain_load';
			IF jsonb_typeof(v_payload->'domain_id') = 'string' THEN
				v_domain_ids := jsonb_build_array(v_payload->'domain_id');
			END IF;
		ELSIF v_execution.tool_name IN ('outcome_card_load', 'work_capability_load') THEN
			v_source := 'outcome_card_load';
			v_outcome_card_id := COALESCE(
				NULLIF(btrim(v_payload->>'id'), ''),
				NULLIF(btrim(v_payload->>'outcome_card_id'), ''),
				NULLIF(btrim(v_payload->>'work_capability_id'), '')
			);
			IF jsonb_typeof(v_payload->'domain_ids') = 'array'
				AND jsonb_array_length(v_payload->'domain_ids') > 0 THEN
				v_domain_ids := v_payload->'domain_ids';
			ELSIF v_outcome_card_id IS NOT NULL THEN
				v_domain_ids := COALESCE(
					v_snapshot->'outcomeCardDomainIds'->v_outcome_card_id,
					'[]'::jsonb
				);
			END IF;
		ELSIF v_execution.tool_name = 'resource_load' THEN
			v_source := 'resource_load';
			v_resource_id := COALESCE(
				NULLIF(btrim(v_payload->>'resource_id'), ''),
				NULLIF(btrim(v_payload->>'reference_id'), '')
			);
			v_skill_id := NULLIF(btrim(v_payload->>'skill_id'), '');
			IF jsonb_typeof(v_payload->'domain_ids') = 'array'
				AND jsonb_array_length(v_payload->'domain_ids') > 0 THEN
				v_domain_ids := v_payload->'domain_ids';
			ELSIF v_skill_id IS NOT NULL THEN
				v_domain_ids := COALESCE(
					v_snapshot->'skillDomainIds'->v_skill_id,
					'[]'::jsonb
				);
			END IF;
		ELSIF v_execution.tool_name = 'skill_load' THEN
			v_source := 'skill_load';
			v_skill_id := NULLIF(btrim(v_payload->>'id'), '');
			IF v_skill_id IS NOT NULL THEN
				v_domain_ids := COALESCE(
					v_snapshot->'skillDomainIds'->v_skill_id,
					'[]'::jsonb
				);
			END IF;
		END IF;

		IF jsonb_typeof(v_domain_ids) = 'array' THEN
			SELECT COALESCE(jsonb_agg(items.value ORDER BY items.ordinality), '[]'::jsonb)
			INTO v_domain_ids
			FROM (
				SELECT item.value, item.ordinality
				FROM jsonb_array_elements(v_domain_ids) WITH ORDINALITY item(value, ordinality)
				WHERE jsonb_typeof(item.value) = 'string'
					AND item.value#>>'{}' ~ '^[a-z0-9][a-z0-9._/-]{0,127}$'
				ORDER BY item.ordinality
				LIMIT 16
			) items;
			FOR v_domain_id IN SELECT value FROM jsonb_array_elements_text(v_domain_ids)
			LOOP
				v_domain_id := btrim(v_domain_id);
				IF v_domain_id = '' THEN CONTINUE; END IF;
				v_signal := jsonb_strip_nulls(jsonb_build_object(
					'domain_id', v_domain_id,
					'source', v_source,
					'tool_name', v_execution.tool_name,
					'skill_id', v_skill_id,
					'outcome_card_id', v_outcome_card_id,
					'resource_id', v_resource_id
				));
				v_signal_key := concat_ws('|',
					v_domain_id, v_source, COALESCE(v_skill_id, ''),
					COALESCE(v_outcome_card_id, ''), COALESCE(v_resource_id, ''),
					v_execution.tool_name
				);
				IF NOT (v_signal_key = ANY(v_seen_used_keys)) THEN
					v_seen_used_keys := array_append(v_seen_used_keys, v_signal_key);
					v_used_signals := v_used_signals || jsonb_build_array(v_signal);
				END IF;
			END LOOP;
		END IF;

		IF v_execution.tool_name IN ('outcome_card_load', 'work_capability_load')
			AND jsonb_typeof(v_payload->'gaps') = 'array' THEN
			v_priority := CASE COALESCE(v_payload->>'coverage_status', 'partial')
				WHEN 'strong' THEN 'low'
				WHEN 'none' THEN 'high'
				ELSE 'medium'
			END;
			FOR v_gap IN SELECT value FROM jsonb_array_elements(v_payload->'gaps')
			LOOP
				IF jsonb_typeof(v_gap) <> 'object' THEN CONTINUE; END IF;
				IF NULLIF(btrim(v_gap->>'missing_skill_id'), '') IS NOT NULL THEN
					v_gap_id := 'skill:' || btrim(v_gap->>'missing_skill_id');
				ELSIF NULLIF(btrim(v_gap->>'missing_resource_id'), '') IS NOT NULL THEN
					v_gap_id := 'resource:' || btrim(v_gap->>'missing_resource_id');
				ELSE
					CONTINUE;
				END IF;
				v_existing_candidate := v_gap_candidates->v_gap_id;
				IF v_existing_candidate IS NULL THEN
					v_gap_order := array_append(v_gap_order, v_gap_id);
				END IF;
				v_candidate := jsonb_strip_nulls(jsonb_build_object(
					'id', v_gap_id,
					'priority', CASE
						WHEN v_existing_candidate IS NULL THEN v_priority
						WHEN CASE v_existing_candidate->>'priority' WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END
							<= CASE v_priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END
							THEN v_existing_candidate->>'priority'
						ELSE v_priority
					END,
					'domain_ids', public.agentic_chat_merge_domain_ids_v1(
						v_existing_candidate->'domain_ids', v_domain_ids, 8
					),
					'missing_skill_id', NULLIF(btrim(v_gap->>'missing_skill_id'), ''),
					'missing_resource_id', NULLIF(btrim(v_gap->>'missing_resource_id'), ''),
					'user_need', COALESCE(
						v_existing_candidate->>'user_need', NULLIF(btrim(v_gap->>'user_need'), ''),
						'Coverage for ' || split_part(v_gap_id, ':', 2) || '.'
					),
					'summary', COALESCE(
						v_existing_candidate->>'summary', NULLIF(btrim(v_gap->>'summary'), ''),
						'Queued from loaded outcome-card coverage gaps.'
					)
				));
				v_gap_candidates := jsonb_set(
					v_gap_candidates, ARRAY[v_gap_id], v_candidate, true
				);
			END LOOP;
		END IF;
	END LOOP;

	FOR v_signal IN SELECT value FROM jsonb_array_elements(v_used_signals)
	LOOP
		v_state := public.agentic_chat_merge_used_domain_signal_v1(
			v_state, v_signal, v_observed_at, NEW.id
		);
		v_has_projection := true;
	END LOOP;
	FOREACH v_gap_id IN ARRAY v_gap_order
	LOOP
		v_candidate := v_gap_candidates->v_gap_id;
		v_state := public.agentic_chat_merge_domain_gap_v1(
			v_state, v_candidate, v_observed_at
		);
		v_has_projection := true;
	END LOOP;
	IF NOT v_has_projection THEN
		RETURN NEW;
	END IF;
	v_state := jsonb_set(v_state, '{updated_at}', to_jsonb(v_observed_at), true);

	SELECT sessions.* INTO v_session
	FROM public.chat_sessions sessions
	WHERE sessions.id = NEW.session_id
	FOR UPDATE;
	IF NOT FOUND OR v_session.user_id IS DISTINCT FROM NEW.user_id THEN
		RAISE EXCEPTION 'agentic_chat_terminal_domain_metadata_scope_mismatch';
	END IF;
	UPDATE public.chat_sessions sessions
	SET agent_metadata = COALESCE(sessions.agent_metadata, '{}'::jsonb)
			|| jsonb_build_object('fastchat_domain_state', v_state),
		updated_at = GREATEST(sessions.updated_at, NEW.terminalized_at)
	WHERE sessions.id = v_session.id;
	RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_chat_turn_runs_terminal_domain_metadata
	ON public.chat_turn_runs;
CREATE TRIGGER trg_chat_turn_runs_terminal_domain_metadata
AFTER UPDATE OF status ON public.chat_turn_runs
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.apply_agentic_chat_terminal_domain_metadata_v1();

REVOKE ALL ON FUNCTION public.agentic_chat_domain_reference_map_v1_is_valid(jsonb)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.agentic_chat_merge_domain_ids_v1(jsonb, jsonb, integer)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.agentic_chat_jsonb_array_of_objects_v1_is_valid(jsonb, integer)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.agentic_chat_merge_used_domain_signal_v1(jsonb, jsonb, text, uuid)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.agentic_chat_merge_domain_gap_v1(jsonb, jsonb, text)
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_agentic_chat_domain_metadata_snapshot_v1()
	FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.apply_agentic_chat_terminal_domain_metadata_v1()
	FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agentic_chat_domain_reference_map_v1_is_valid(jsonb)
	TO service_role;
GRANT EXECUTE ON FUNCTION public.agentic_chat_merge_domain_ids_v1(jsonb, jsonb, integer)
	TO service_role;
GRANT EXECUTE ON FUNCTION public.agentic_chat_jsonb_array_of_objects_v1_is_valid(jsonb, integer)
	TO service_role;
GRANT EXECUTE ON FUNCTION public.agentic_chat_merge_used_domain_signal_v1(jsonb, jsonb, text, uuid)
	TO service_role;
GRANT EXECUTE ON FUNCTION public.agentic_chat_merge_domain_gap_v1(jsonb, jsonb, text)
	TO service_role;

COMMENT ON FUNCTION public.apply_agentic_chat_terminal_domain_metadata_v1() IS
	'Atomically projects admission-frozen sensing plus eligible durable successful domain/skill/outcome/resource loads into fastchat_domain_state on worker terminal truth.';

COMMIT;
