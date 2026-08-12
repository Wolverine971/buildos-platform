-- supabase/migrations/20260812040000_agentic_chat_live_vision_resolution_receipts.sql
-- Agentic Chat Worker Phase 4 P3 S4: ephemeral live-vision resolution.
--
-- New artifacts freeze a bounded default-off liveVision policy. Immediately
-- before a provider call, the worker revalidates the immutable source, hashes
-- the raw bytes, creates an ephemeral transformed URL, and persists only this
-- redacted identity/validation receipt behind the active execution lease.

BEGIN;

CREATE OR REPLACE FUNCTION public.validate_agentic_chat_live_vision_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_current_turn jsonb := NEW.prepared->'currentTurn';
	v_policy jsonb;
BEGIN
	-- Rolling compatibility: S3 and earlier artifacts have no liveVision key.
	IF v_current_turn IS NULL OR NOT (v_current_turn ? 'liveVision') THEN
		RETURN NEW;
	END IF;
	v_policy := v_current_turn->'liveVision';
	IF jsonb_typeof(COALESCE(v_policy, 'null'::jsonb)) <> 'object'
		OR jsonb_typeof(COALESCE(v_policy->'requested', 'null'::jsonb)) <> 'boolean'
		OR jsonb_typeof(COALESCE(v_policy->'maxImages', 'null'::jsonb)) <> 'number'
		OR COALESCE((v_policy->>'maxImages') !~ '^[1-9][0-9]*$', true)
		OR (v_policy->>'maxImages')::numeric > 16
		OR jsonb_typeof(COALESCE(v_policy->'maxImageBytes', 'null'::jsonb)) <> 'number'
		OR COALESCE((v_policy->>'maxImageBytes') !~ '^[1-9][0-9]*$', true)
		OR (v_policy->>'maxImageBytes')::numeric > 104857600
		OR jsonb_typeof(COALESCE(v_policy->'renderWidth', 'null'::jsonb)) <> 'number'
		OR COALESCE((v_policy->>'renderWidth') !~ '^[1-9][0-9]*$', true)
		OR (v_policy->>'renderWidth')::numeric > 8192
		OR jsonb_typeof(COALESCE(v_policy->'signedUrlTtlSeconds', 'null'::jsonb)) <> 'number'
		OR COALESCE((v_policy->>'signedUrlTtlSeconds') !~ '^[1-9][0-9]*$', true)
		OR (v_policy->>'signedUrlTtlSeconds')::numeric > 3600 THEN
		RAISE EXCEPTION 'agentic_chat_input_live_vision_policy_invalid';
	END IF;
	RETURN NEW;
EXCEPTION
	WHEN invalid_text_representation OR numeric_value_out_of_range THEN
		RAISE EXCEPTION 'agentic_chat_input_live_vision_policy_invalid';
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_agentic_chat_live_vision_policy()
	FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_chat_turn_input_artifacts_live_vision_policy
	ON public.chat_turn_input_artifacts;
CREATE TRIGGER trg_chat_turn_input_artifacts_live_vision_policy
BEFORE INSERT ON public.chat_turn_input_artifacts
FOR EACH ROW EXECUTE FUNCTION public.validate_agentic_chat_live_vision_policy();

DO $migration$
DECLARE
	v_constraint_name text;
BEGIN
	SELECT constraints.conname
	INTO STRICT v_constraint_name
	FROM pg_catalog.pg_constraint AS constraints
	WHERE constraints.conrelid = 'public.agentic_chat_execution_observations'::regclass
		AND constraints.contype = 'c'
		AND pg_catalog.pg_get_constraintdef(constraints.oid) LIKE '%event_type%'
		AND pg_catalog.pg_get_constraintdef(constraints.oid) LIKE '%provider_attempt_started%';
	EXECUTE format(
		'ALTER TABLE public.agentic_chat_execution_observations DROP CONSTRAINT %I',
		v_constraint_name
	);
END;
$migration$;
ALTER TABLE public.agentic_chat_execution_observations
	ADD CONSTRAINT agentic_chat_execution_observations_event_type_check CHECK (
		event_type IN (
			'provider_attempt_started',
			'provider_attempt_ended',
			'provider_media_resolved',
			'tool_execution_started',
			'tool_execution_ended'
		)
		AND (
			(phase = 'provider' AND event_type LIKE 'provider_%')
			OR (phase = 'tool' AND event_type LIKE 'tool_execution_%')
		)
	) NOT VALID;
ALTER TABLE public.agentic_chat_execution_observations
	VALIDATE CONSTRAINT agentic_chat_execution_observations_event_type_check;

DO $migration$
DECLARE
	v_body text;
	v_next text;
BEGIN
	SELECT procedures.prosrc
	INTO STRICT v_body
	FROM pg_catalog.pg_proc AS procedures
	WHERE procedures.oid =
		'public.persist_agentic_chat_execution_observation(uuid,uuid,uuid,uuid,integer,text,text,text,jsonb)'::regprocedure;

	v_next := replace(
		v_body,
		$old$		'provider_attempt_started',
			'provider_attempt_ended',
			'tool_execution_started',$old$,
		$new$		'provider_attempt_started',
			'provider_attempt_ended',
			'provider_media_resolved',
			'tool_execution_started',$new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_live_vision_unexpected_observation_identity_body';
	END IF;
	v_body := v_next;

	v_next := replace(
		v_body,
		$old$		OR (p_phase = 'provider' AND p_event_type NOT LIKE 'provider_attempt_%')$old$,
		$new$		OR (p_phase = 'provider' AND p_event_type NOT LIKE 'provider_%')$new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_live_vision_unexpected_observation_phase_body';
	END IF;
	v_body := v_next;

	v_next := replace(
		v_body,
		$old$	IF p_phase = 'provider' AND p_payload - ARRAY[
		'round', 'route_id', 'model_requested', 'model_used', 'provider',
		'status', 'duration_ms', 'finish_reason', 'error_class', 'usage'
	] <> '{}'::jsonb THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_payload_not_redacted';
	END IF;$old$,
		$new$	IF p_phase = 'provider' AND p_event_type = 'provider_media_resolved' THEN
		IF p_payload - ARRAY[
			'requested', 'policy', 'resolved', 'failed', 'skipped_by_limit'
		] <> '{}'::jsonb
			OR p_payload->'requested' IS DISTINCT FROM 'true'::jsonb
			OR jsonb_typeof(COALESCE(p_payload->'policy', 'null'::jsonb)) <> 'object'
			OR jsonb_typeof(COALESCE(p_payload->'resolved', 'null'::jsonb)) <> 'array'
			OR jsonb_typeof(COALESCE(p_payload->'failed', 'null'::jsonb)) <> 'array'
			OR jsonb_typeof(COALESCE(p_payload->'skipped_by_limit', 'null'::jsonb)) <> 'number'
			OR COALESCE((p_payload->>'skipped_by_limit') !~ '^[0-9]+$', true)
			OR (p_payload->>'skipped_by_limit')::numeric > 16 THEN
			RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_media_receipt';
		END IF;
		IF (p_payload->'policy') - ARRAY[
			'max_images', 'max_image_bytes', 'render_width', 'signed_url_ttl_seconds'
		] <> '{}'::jsonb
			OR COALESCE((p_payload->'policy'->>'max_images') !~ '^[1-9][0-9]*$', true)
			OR (p_payload->'policy'->>'max_images')::numeric > 16
			OR COALESCE((p_payload->'policy'->>'max_image_bytes') !~ '^[1-9][0-9]*$', true)
			OR (p_payload->'policy'->>'max_image_bytes')::numeric > 104857600
			OR COALESCE((p_payload->'policy'->>'render_width') !~ '^[1-9][0-9]*$', true)
			OR (p_payload->'policy'->>'render_width')::numeric > 8192
			OR COALESCE((p_payload->'policy'->>'signed_url_ttl_seconds') !~ '^[1-9][0-9]*$', true)
			OR (p_payload->'policy'->>'signed_url_ttl_seconds')::numeric > 3600 THEN
			RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_media_policy';
		END IF;
		IF jsonb_array_length(p_payload->'resolved') > 16
			OR jsonb_array_length(p_payload->'failed') > 16
			OR EXISTS (
				SELECT 1
				FROM jsonb_array_elements(p_payload->'resolved') AS item(value)
				WHERE jsonb_typeof(item.value) <> 'object'
					OR item.value - ARRAY[
						'attachment_key', 'content_type', 'file_size_bytes', 'checksum_sha256'
					] <> '{}'::jsonb
					OR COALESCE(item.value->>'attachment_key', '') !~ '^(asset|temporary):[A-Za-z0-9-]+$'
					OR length(COALESCE(item.value->>'attachment_key', '')) > 266
					OR COALESCE(item.value->>'content_type', '') !~ '^image/[^[:space:]]{1,249}$'
					OR COALESCE((item.value->>'file_size_bytes') !~ '^[1-9][0-9]*$', true)
					OR (item.value->>'file_size_bytes')::numeric > 104857600
					OR COALESCE(item.value->>'checksum_sha256', '') !~ '^[0-9a-f]{64}$'
			)
			OR EXISTS (
				SELECT 1
				FROM jsonb_array_elements(p_payload->'failed') AS item(value)
				WHERE jsonb_typeof(item.value) <> 'object'
					OR item.value - ARRAY['attachment_key', 'reason'] <> '{}'::jsonb
					OR COALESCE(item.value->>'attachment_key', '') !~ '^(asset|temporary):[A-Za-z0-9-]+$'
					OR length(COALESCE(item.value->>'attachment_key', '')) > 266
					OR item.value->>'reason' NOT IN (
						'missing_storage_pointer', 'unsupported_content_type',
						'invalid_file_size', 'file_too_large', 'missing_checksum',
						'expired_temporary_attachment', 'access_lost', 'source_missing',
						'source_mismatch', 'source_fetch_failed',
						'source_content_type_mismatch', 'checksum_mismatch',
						'signed_url_failed'
					)
			) THEN
			RAISE EXCEPTION 'agentic_chat_execution_observation_invalid_media_items';
		END IF;
	ELSIF p_phase = 'provider' AND p_payload - ARRAY[
		'round', 'route_id', 'model_requested', 'model_used', 'provider',
		'status', 'duration_ms', 'finish_reason', 'error_class', 'usage'
	] <> '{}'::jsonb THEN
		RAISE EXCEPTION 'agentic_chat_execution_observation_payload_not_redacted';
	END IF;$new$
	);
	IF v_next = v_body THEN
		RAISE EXCEPTION 'agentic_chat_live_vision_unexpected_observation_payload_body';
	END IF;
	v_body := v_next;

	EXECUTE format(
		$ddl$
CREATE OR REPLACE FUNCTION public.persist_agentic_chat_execution_observation(p_turn_run_id uuid, p_user_id uuid, p_queue_job_id uuid, p_processing_token uuid, p_execution_generation integer, p_observation_key text, p_phase text, p_event_type text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'pg_catalog', 'public'
		AS %L
		$ddl$,
		v_body
	);
END;
$migration$;

CREATE OR REPLACE VIEW public.agentic_chat_worker_lifecycle_observations
WITH (security_invoker = true)
AS
WITH observation_sources AS (
	SELECT
		base.turn_run_id,
		base.session_id,
		base.user_id,
		base.stream_run_id,
		base.execution_generation,
		(base.observation_sequence_index * 10)::integer AS lifecycle_ordinal,
		0::bigint AS source_sequence,
		base.observation_key,
		base.phase,
		base.event_type,
		base.payload,
		base.source_kind,
		base.source_id,
		base.observed_at
	FROM public.agentic_chat_worker_lifecycle_observations_slice12 AS base

	UNION ALL

	SELECT
		observations.turn_run_id,
		observations.session_id,
		observations.user_id,
		turns.stream_run_id,
		observations.execution_generation,
		CASE
			WHEN observations.event_type = 'provider_media_resolved' THEN 24
			WHEN observations.event_type = 'provider_attempt_started'
				AND observations.payload->>'round' = 'initial' THEN 25
			WHEN observations.event_type = 'provider_attempt_ended'
				AND observations.payload->>'round' = 'initial' THEN 26
			WHEN observations.event_type = 'tool_execution_started' THEN 42
			WHEN observations.event_type = 'tool_execution_ended' THEN 48
			WHEN observations.event_type = 'provider_attempt_started'
				AND observations.payload->>'round' = 'synthesis' THEN 55
			WHEN observations.event_type = 'provider_attempt_ended'
				AND observations.payload->>'round' = 'synthesis' THEN 56
			ELSE 58
		END,
		observations.id,
		observations.observation_key,
		observations.phase,
		observations.event_type,
		observations.payload,
		'execution_observation'::text,
		observations.id::text,
		observations.observed_at
	FROM public.agentic_chat_execution_observations AS observations
	JOIN public.chat_turn_runs AS turns ON turns.id = observations.turn_run_id
),
ranked AS (
	SELECT
		sources.*,
		row_number() OVER (
			PARTITION BY sources.turn_run_id, sources.execution_generation
			ORDER BY
				sources.lifecycle_ordinal,
				sources.source_sequence,
				sources.observation_key
		)::integer AS observation_sequence_index
	FROM observation_sources AS sources
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

COMMENT ON FUNCTION public.validate_agentic_chat_live_vision_policy() IS
	'Validates the admission-frozen bounded live-vision policy while retaining rolling artifacts that predate S4.';
COMMENT ON VIEW public.agentic_chat_worker_lifecycle_observations IS
	'Private service-only lifecycle projection including a redacted current-turn media-resolution receipt immediately before the initial provider attempt.';

COMMIT;
