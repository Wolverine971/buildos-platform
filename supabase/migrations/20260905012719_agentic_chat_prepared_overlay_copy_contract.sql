-- supabase/migrations/20260905012719_agentic_chat_prepared_overlay_copy_contract.sql
-- Prepared prompts are immutable base surfaces, but the worker adds
-- turn-specific domain/skill rules after prewarm. Preserve the strong database
-- copy fence by validating a compact snapshot of that base surface, then allow
-- only an append-only final prompt/section overlay.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO service_role;
GRANT EXECUTE ON FUNCTION extensions.digest(bytea, text) TO service_role;

DO $migration$
DECLARE
	v_target regprocedure := to_regprocedure(
		'public.create_agentic_chat_turn_with_job(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,uuid,uuid,text,uuid,uuid,text,boolean,text,jsonb,text,text,jsonb,integer,text,jsonb,jsonb,text,integer,integer,uuid,text,text,jsonb,boolean)'
	);
	v_current_definition text;
	v_patched_definition text;
	v_old_guard text := $guard$
		v_prepared_surface := v_prepared.prepared_surfaces->p_prepared_surface_profile;
		IF jsonb_typeof(COALESCE(v_prepared_surface, 'null'::jsonb)) <> 'object'
			OR v_prepared_surface->>'surface_profile' IS DISTINCT FROM p_prepared_surface_profile
			OR v_prepared_surface->>'system_prompt' IS DISTINCT FROM p_artifact_prepared->>'systemPrompt'
			OR COALESCE(v_prepared_surface->'sections', '[]'::jsonb)
				IS DISTINCT FROM p_artifact_prepared->'promptSections'
			OR p_artifact_prepared->>'sourcePreparedPromptId'
				IS DISTINCT FROM p_prepared_prompt_id::text
			OR p_artifact_prepared->>'surfaceProfile'
				IS DISTINCT FROM p_prepared_surface_profile
			OR p_artifact_prepared->'contextPayload'
				IS DISTINCT FROM v_prepared.context_payload
			OR COALESCE(p_artifact_prepared->'conversationSummary', 'null'::jsonb)
				IS DISTINCT FROM COALESCE(to_jsonb(v_prepared.conversation_summary), 'null'::jsonb) THEN
			RAISE EXCEPTION 'agentic_chat_worker_admission_prepared_copy_mismatch';
		END IF;
$guard$;
	v_new_guard text := $guard$
		v_prepared_surface := v_prepared.prepared_surfaces->p_prepared_surface_profile;
		IF jsonb_typeof(COALESCE(v_prepared_surface, 'null'::jsonb)) <> 'object'
			OR v_prepared_surface->>'surface_profile' IS DISTINCT FROM p_prepared_surface_profile
			OR COALESCE(v_prepared_surface->>'system_prompt', '') = ''
			OR COALESCE(v_prepared_surface->>'system_prompt_sha256', '') !~ '^[0-9a-f]{64}$'
			OR v_prepared_surface->>'system_prompt_sha256' IS DISTINCT FROM encode(
				extensions.digest(convert_to(v_prepared_surface->>'system_prompt', 'UTF8'), 'sha256'),
				'hex'
			)
			OR jsonb_typeof(
				COALESCE(p_artifact_prepared->'sourcePreparedSurface', 'null'::jsonb)
			) <> 'object'
			OR p_artifact_prepared#>>'{sourcePreparedSurface,systemPromptSha256}'
				IS DISTINCT FROM v_prepared_surface->>'system_prompt_sha256'
			OR jsonb_typeof(
				COALESCE(
					p_artifact_prepared#>'{sourcePreparedSurface,promptSections}',
					'null'::jsonb
				)
			) <> 'array'
			OR COALESCE(v_prepared_surface->'sections', '[]'::jsonb)
				IS DISTINCT FROM p_artifact_prepared#>'{sourcePreparedSurface,promptSections}'
			OR jsonb_typeof(COALESCE(p_artifact_prepared->'systemPrompt', 'null'::jsonb))
				<> 'string'
			OR jsonb_typeof(COALESCE(p_artifact_prepared->'promptSections', 'null'::jsonb))
				<> 'array'
			OR (
				p_artifact_prepared->>'systemPrompt'
					IS DISTINCT FROM v_prepared_surface->>'system_prompt'
				AND strpos(
					p_artifact_prepared->>'systemPrompt',
					(v_prepared_surface->>'system_prompt') || E'\n\n'
				) <> 1
			)
			OR EXISTS (
				SELECT 1
				FROM jsonb_array_elements(
					COALESCE(v_prepared_surface->'sections', '[]'::jsonb)
				) WITH ORDINALITY AS source_section(value, position)
				WHERE p_artifact_prepared->'promptSections'->((source_section.position - 1)::integer)
					IS DISTINCT FROM source_section.value
			)
			OR p_artifact_prepared->>'sourcePreparedPromptId'
				IS DISTINCT FROM p_prepared_prompt_id::text
			OR p_artifact_prepared->>'surfaceProfile'
				IS DISTINCT FROM p_prepared_surface_profile
			OR p_artifact_prepared->'contextPayload'
				IS DISTINCT FROM v_prepared.context_payload
			OR COALESCE(p_artifact_prepared->'conversationSummary', 'null'::jsonb)
				IS DISTINCT FROM COALESCE(to_jsonb(v_prepared.conversation_summary), 'null'::jsonb) THEN
			RAISE EXCEPTION 'agentic_chat_worker_admission_prepared_copy_mismatch';
		END IF;
$guard$;
BEGIN
	IF v_target IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_function_missing';
	END IF;

	SELECT pg_get_functiondef(v_target) INTO v_current_definition;
	IF strpos(v_current_definition, v_old_guard) = 0 THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_prepared_guard_drift';
	END IF;

	v_patched_definition := replace(v_current_definition, v_old_guard, v_new_guard);
	IF v_patched_definition = v_current_definition THEN
		RAISE EXCEPTION 'agentic_chat_worker_admission_prepared_guard_patch_failed';
	END IF;

	EXECUTE v_patched_definition;
END;
$migration$;

COMMENT ON FUNCTION public.create_agentic_chat_turn_with_job(
	uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, uuid, uuid,
	text, uuid, uuid, text, boolean, text, jsonb, text, text, jsonb, integer,
	text, jsonb, jsonb, text, integer, integer, uuid, text, text, jsonb, boolean
) IS
	'Service-only duplicate-first worker admission. Prepared hits verify their immutable cached base and an append-only per-turn overlay before the artifact is admitted.';
