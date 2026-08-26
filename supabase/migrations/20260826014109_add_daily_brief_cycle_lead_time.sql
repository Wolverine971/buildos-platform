-- supabase/migrations/20260826014109_add_daily_brief_cycle_lead_time.sql
-- Daily Brief schedules represent the user's intended availability time. A
-- bounded kind-specific lead allows generation to begin early without moving
-- next_run_at, scheduled_for, or notification delivery semantics.

CREATE OR REPLACE FUNCTION public.cycle_definition_payload_is_valid(
	p_kind text,
	p_target_type text,
	p_project_id uuid,
	p_config jsonb,
	p_policy jsonb,
	p_attention_policy text,
	p_state text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
BEGIN
	IF p_kind IS NULL
		OR p_target_type IS NULL
		OR p_config IS NULL
		OR p_policy IS NULL
		OR p_attention_policy IS NULL
		OR p_state IS NULL
		OR p_kind NOT IN ('daily_brief', 'project_audit', 'project_review', 'task_review')
		OR jsonb_typeof(p_config) <> 'object'
		OR jsonb_typeof(p_policy) <> 'object'
		OR p_attention_policy NOT IN ('silent', 'exceptions', 'always')
		OR p_state NOT IN ('active', 'paused')
		OR (
			(p_target_type = 'user' AND p_project_id IS NOT NULL)
			OR (p_target_type = 'project' AND p_project_id IS NULL)
			OR p_target_type NOT IN ('user', 'project')
		)
		OR (p_kind = 'daily_brief' AND p_target_type <> 'user')
		OR (p_kind IN ('project_audit', 'project_review') AND p_target_type <> 'project')
		OR COALESCE(p_policy->>'overlap', '') NOT IN ('skip', 'allow')
		OR COALESCE(p_policy->>'misfire', '') NOT IN ('skip', 'run_once')
		OR jsonb_typeof(p_policy->'max_attempts') <> 'number'
		OR COALESCE(p_policy->>'max_attempts', '') !~ '^[0-9]+$'
		OR (p_policy->>'max_attempts')::integer NOT BETWEEN 1 AND 10
		OR EXISTS (
			SELECT 1
			FROM jsonb_object_keys(p_policy) AS policy_key(key)
			WHERE policy_key.key NOT IN ('overlap', 'misfire', 'max_attempts')
		) THEN
		RETURN false;
	END IF;

	IF p_kind = 'daily_brief' THEN
		RETURN NOT EXISTS (
			SELECT 1
			FROM jsonb_object_keys(p_config) AS config_key(key)
			WHERE config_key.key <> 'generation_lead_minutes'
		)
		AND CASE
			WHEN NOT (p_config ? 'generation_lead_minutes') THEN true
			WHEN jsonb_typeof(p_config->'generation_lead_minutes') = 'number'
				AND COALESCE(p_config->>'generation_lead_minutes', '') ~ '^[0-9]+$'
				THEN (p_config->>'generation_lead_minutes')::integer BETWEEN 0 AND 30
			ELSE false
		END;
	END IF;

	IF p_kind = 'project_audit' THEN
		RETURN COALESCE(p_config->>'depth', '') IN ('standard', 'deep')
			AND NOT EXISTS (
				SELECT 1
				FROM jsonb_object_keys(p_config) AS config_key(key)
				WHERE config_key.key <> 'depth'
			);
	END IF;

	RETURN NOT EXISTS (SELECT 1 FROM jsonb_object_keys(p_config));
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_due_cycle_triggers(
	p_claim_token uuid,
	p_due_through timestamptz DEFAULT now(),
	p_limit integer DEFAULT 25,
	p_lease_seconds integer DEFAULT 120,
	p_kinds text[] DEFAULT ARRAY['daily_brief']::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_claims jsonb;
BEGIN
	PERFORM public.require_cycle_service_role();

	IF p_claim_token IS NULL
		OR p_due_through IS NULL
		OR p_limit < 1 OR p_limit > 100
		OR p_lease_seconds < 30 OR p_lease_seconds > 900
		OR COALESCE(cardinality(p_kinds), 0) = 0
		OR NOT p_kinds <@ ARRAY[
			'daily_brief', 'project_audit', 'project_review', 'task_review'
		]::text[] THEN
		RAISE EXCEPTION 'cycle_trigger_claim_invalid' USING ERRCODE = '22023';
	END IF;

	WITH due AS (
		SELECT
			trigger_row.id,
			trigger_row.cycle_id,
			trigger_row.next_run_at AS scheduled_for,
			trigger_row.spec,
			cycle_row.user_id,
			cycle_row.kind,
			cycle_row.policy
		FROM public.cycle_triggers trigger_row
		JOIN public.cycles cycle_row ON cycle_row.id = trigger_row.cycle_id
		WHERE trigger_row.trigger_type = 'schedule'
			AND trigger_row.state = 'active'
			AND trigger_row.deleted_at IS NULL
			AND trigger_row.next_run_at IS NOT NULL
			-- Preserve an indexable upper bound before applying the per-Cycle lead.
			AND trigger_row.next_run_at <= p_due_through + interval '30 minutes'
			AND trigger_row.next_run_at <= p_due_through + make_interval(
				mins => CASE
					WHEN cycle_row.kind <> 'daily_brief' THEN 0
					WHEN jsonb_typeof(cycle_row.config->'generation_lead_minutes') = 'number'
						AND COALESCE(cycle_row.config->>'generation_lead_minutes', '') ~ '^[0-9]+$'
						THEN LEAST(GREATEST(
							(cycle_row.config->>'generation_lead_minutes')::integer,
							0
						), 30)
					ELSE 2
				END
			)
			AND (
				trigger_row.scheduler_claim_expires_at IS NULL
				OR trigger_row.scheduler_claim_expires_at <= now()
			)
			AND cycle_row.state = 'active'
			AND cycle_row.deleted_at IS NULL
			AND cycle_row.kind = ANY(p_kinds)
		ORDER BY trigger_row.next_run_at, trigger_row.id
		FOR UPDATE OF trigger_row SKIP LOCKED
		LIMIT p_limit
	), claimed AS (
		UPDATE public.cycle_triggers trigger_row
		SET scheduler_claim_token = p_claim_token,
			scheduler_claim_expires_at = now() + make_interval(secs => p_lease_seconds)
		FROM due
		WHERE trigger_row.id = due.id
		RETURNING
			trigger_row.id AS trigger_id,
			due.cycle_id,
			due.user_id,
			due.kind,
			due.policy,
			due.scheduled_for,
			due.spec,
			trigger_row.scheduler_claim_token AS claim_token,
			trigger_row.scheduler_claim_expires_at AS claim_expires_at
	)
	SELECT COALESCE(
		jsonb_agg(
			jsonb_build_object(
				'trigger_id', claimed.trigger_id,
				'cycle_id', claimed.cycle_id,
				'user_id', claimed.user_id,
				'kind', claimed.kind,
				'policy', claimed.policy,
				'scheduled_for', claimed.scheduled_for,
				'spec', claimed.spec,
				'claim_token', claimed.claim_token,
				'claim_expires_at', claimed.claim_expires_at
			)
			ORDER BY claimed.scheduled_for, claimed.trigger_id
		),
		'[]'::jsonb
	)
	INTO v_claims
	FROM claimed;

	RETURN v_claims;
END;
$function$;

COMMENT ON FUNCTION public.cycle_definition_payload_is_valid(text, text, uuid, jsonb, jsonb, text, text) IS
	'Validates kind-specific Cycle definition shapes, including bounded Daily Brief generation lead time.';
COMMENT ON FUNCTION public.claim_due_cycle_triggers(uuid, timestamptz, integer, integer, text[]) IS
	'Atomically leases due Cycle schedule triggers, applying bounded kind-specific generation lead time.';
