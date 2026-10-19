-- supabase/migrations/20261018215551_inline_onto_embedding_deletes.sql
-- Tasker 134: remove embeddings in the entity write transaction instead of
-- queueing a delete-only worker job. Live-write admission stays unchanged.
-- Copied from 20260828120000; verified against the cached production definition.
BEGIN;

CREATE OR REPLACE FUNCTION public.enqueue_onto_entity_embedding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
	v_entity_type text := TG_ARGV[0];
	v_fields text[] := TG_ARGV[1:TG_NARGS - 1];
	v_row jsonb;
	v_old jsonb;
	v_digest text;
	v_old_digest text;
	v_deleted boolean;
	v_was_deleted boolean;
	v_project_id uuid;
	v_user_id uuid;
BEGIN
	IF TG_OP = 'DELETE' THEN
		v_row := to_jsonb(OLD);
		v_deleted := true;
	ELSE
		v_row := to_jsonb(NEW);
		v_deleted := (v_row ->> 'deleted_at') IS NOT NULL;
	END IF;

	-- Match the worker's deletion predicate, including every document chunk.
	-- Do this before digest/project/owner lookups: deletes need only the entity key.
	IF v_deleted THEN
		DELETE FROM public.onto_embeddings
		WHERE entity_type = v_entity_type
		  AND entity_id = (v_row ->> 'id')::uuid;
		RETURN NULL;
	END IF;

	SELECT md5(string_agg(coalesce(v_row ->> f, ''), chr(31) ORDER BY ord))
	INTO v_digest
	FROM unnest(v_fields) WITH ORDINALITY AS t(f, ord);

	IF TG_OP = 'UPDATE' THEN
		v_old := to_jsonb(OLD);
		v_was_deleted := (v_old ->> 'deleted_at') IS NOT NULL;
		SELECT md5(string_agg(coalesce(v_old ->> f, ''), chr(31) ORDER BY ord))
		INTO v_old_digest
		FROM unnest(v_fields) WITH ORDINALITY AS t(f, ord);
		IF v_digest = v_old_digest AND v_deleted = v_was_deleted THEN
			RETURN NULL;
		END IF;
	END IF;

	v_project_id := coalesce(
		nullif(v_row ->> 'project_id', '')::uuid,
		CASE WHEN v_entity_type = 'project' THEN (v_row ->> 'id')::uuid END
	);
	IF v_project_id IS NULL THEN
		RETURN NULL;
	END IF;

	SELECT a.user_id INTO v_user_id
	FROM public.onto_actors a
	WHERE a.id = nullif(v_row ->> 'created_by', '')::uuid;
	IF v_user_id IS NULL THEN
		SELECT a.user_id INTO v_user_id
		FROM public.onto_projects p
		JOIN public.onto_actors a ON a.id = p.created_by
		WHERE p.id = v_project_id;
	END IF;
	IF v_user_id IS NULL THEN
		RETURN NULL;
	END IF;

	PERFORM public.add_queue_job(
		v_user_id,
		'embed_onto_entity',
		jsonb_build_object(
			'entityType', v_entity_type,
			'entityId', v_row ->> 'id',
			'projectId', v_project_id,
			'userId', v_user_id,
			'deleted', v_deleted
		),
		10,
		now(),
		'embed_onto_entity:' || v_entity_type || ':' || (v_row ->> 'id') || ':'
			|| CASE WHEN v_deleted THEN 'deleted' ELSE coalesce(v_digest, '') END
	);

	RETURN NULL;
EXCEPTION WHEN OTHERS THEN
	-- Embedding freshness is best-effort; the entity write must always win.
	RAISE WARNING 'enqueue_onto_entity_embedding failed for % %: %',
		v_entity_type, v_row ->> 'id', SQLERRM;
	RETURN NULL;
END;
$function$;

-- This SECURITY DEFINER trigger is not a client RPC. PostgreSQL checks EXECUTE
-- when a trigger is created, not when an existing trigger fires on a client write.
-- Preserve service access and remove the legacy public/client grants.
REVOKE ALL ON FUNCTION public.enqueue_onto_entity_embedding() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_onto_entity_embedding() TO service_role;

COMMIT;
