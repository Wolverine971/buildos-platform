-- supabase/migrations/20261118300300_knowledge_lens_text_still_says.sql
-- Tasker 168 edge case: a phone number (or email, address, employer) read from a project's task
-- kept showing to other members after someone edited it out of the task, because "from this
-- project" only checked that the fact once came from the task. Now it must still be in the
-- task's or doc's text at read time. Nothing changes for the owner: the fact stays in their own
-- People (deleting a number from a task is usually cleanup, not "this number is wrong"); for
-- other members it drops back to ask-only ("1 contact detail · Ask").
--
-- knowledge_record_still_says(kind, record, predicate, value, object_name, quote): the record's
-- title + text contain the exact words the fact was read from (the stored quote), or the value
-- itself — phone by its last 10 digits, email/other values by exact (case-insensitive) text,
-- a relationship by the other entry's name. Plain string containment of stored values; no
-- reading of meaning. Production on 2026-11-18: all 160 task-sourced facts still match.
--
-- Rollback: re-run knowledge_entity_visibility from 20261118300200; DROP FUNCTION
-- public.knowledge_record_still_says(text, uuid, text, text, text, text).

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.knowledge_record_still_says(
	p_kind text,
	p_record uuid,
	p_predicate text,
	p_value text,
	p_object_name text,
	p_quote text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_text text;
	v_digits text;
BEGIN
	IF p_kind = 'task' THEN
		SELECT coalesce(t.title, '') || E'\n' || coalesce(t.description, '') INTO v_text
		FROM public.onto_tasks t WHERE t.id = p_record AND t.deleted_at IS NULL;
	ELSIF p_kind = 'document' THEN
		SELECT coalesce(d.title, '') || E'\n' || coalesce(d.description, '') || E'\n' || coalesce(d.content, '')
		INTO v_text
		FROM public.onto_documents d WHERE d.id = p_record AND d.deleted_at IS NULL;
	END IF;
	IF v_text IS NULL THEN
		RETURN false;
	END IF;
	v_text := lower(regexp_replace(v_text, '\s+', ' ', 'g'));

	-- The exact words the fact was read from.
	IF length(btrim(coalesce(p_quote, ''))) >= 3
		AND position(lower(regexp_replace(btrim(p_quote), '\s+', ' ', 'g')) IN v_text) > 0 THEN
		RETURN true;
	END IF;

	-- The value itself, written some other way.
	IF p_predicate = 'phone' AND p_value IS NOT NULL THEN
		-- Digits only (a structured format): "(410) 555-0199" and "+14105550199" agree.
		v_digits := right(regexp_replace(p_value, '\D', '', 'g'), 10);
		RETURN length(v_digits) >= 7
			AND position(v_digits IN regexp_replace(v_text, '\D', '', 'g')) > 0;
	END IF;
	IF p_value IS NOT NULL AND length(btrim(p_value)) >= 3 THEN
		RETURN position(lower(regexp_replace(btrim(p_value), '\s+', ' ', 'g')) IN v_text) > 0;
	END IF;
	IF p_object_name IS NOT NULL AND length(btrim(p_object_name)) >= 2 THEN
		RETURN position(lower(regexp_replace(btrim(p_object_name), '\s+', ' ', 'g')) IN v_text) > 0;
	END IF;
	RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.knowledge_record_still_says(text, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.knowledge_record_still_says(text, uuid, text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.knowledge_entity_visibility(
	p_entity uuid,
	p_owner uuid,
	p_viewer uuid,
	p_project uuid
)
RETURNS TABLE (
	id uuid,
	predicate text,
	value_text text,
	qualifiers jsonb,
	object_name text,
	object_kind text,
	level text,
	shown_via text,
	source_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
	WITH project_records AS (
		SELECT t.id FROM public.onto_tasks t WHERE t.project_id = p_project AND t.deleted_at IS NULL
		UNION ALL
		SELECT d.id FROM public.onto_documents d WHERE d.project_id = p_project AND d.deleted_at IS NULL
	),
	live_grants AS (
		SELECT s.what, s.predicates
		FROM public.knowledge_shares s
		WHERE s.entity_id = p_entity AND s.owner_user_id = p_owner
			AND public.knowledge_share_is_live(s.id, p_viewer)
	),
	facts AS (
		SELECT f.id, f.predicate, f.value_text, f.qualifiers, o.name AS object_name,
			o.kind AS object_kind,
			(f.created_via = 'enrichment' AND f.run_id IS NOT NULL) AS researched,
			public.knowledge_fact_share_level(
				f.predicate, e.kind, f.status, f.qualifiers,
				f.created_via = 'enrichment' AND f.run_id IS NOT NULL AND EXISTS (
					SELECT 1 FROM public.knowledge_fact_sources fs
					JOIN public.knowledge_sources src ON src.id = fs.source_id
					WHERE fs.fact_id = f.id AND src.source_type IN ('web', 'youtube') AND src.url IS NOT NULL
				),
				EXISTS (
					SELECT 1 FROM public.knowledge_fact_sources fs
					JOIN public.knowledge_sources src ON src.id = fs.source_id
					WHERE fs.fact_id = f.id AND src.source_type IN ('task', 'document')
						AND src.record_id IN (SELECT pr.id FROM project_records pr)
						AND EXISTS (
							SELECT 1 FROM public.knowledge_record_links l
							WHERE l.entity_id = p_entity AND l.owner_user_id = p_owner
								AND l.record_id = src.record_id
						)
						-- …and that task or doc still says it today (a number edited out of the
						-- text stops being "from this project"; it stays in the owner's People).
						AND public.knowledge_record_still_says(
							src.source_type, src.record_id, f.predicate, f.value_text, o.name, fs.quote
						)
				)
			) AS level
		FROM public.knowledge_facts f
		JOIN public.knowledge_entities e ON e.id = f.entity_id
		LEFT JOIN public.knowledge_entities o ON o.id = f.object_entity_id
		WHERE f.entity_id = p_entity AND f.owner_user_id = p_owner
			AND (o.id IS NULL OR NOT o.is_self)
	)
	SELECT f.id, f.predicate, f.value_text, f.qualifiers, f.object_name, f.object_kind, f.level,
		CASE
			WHEN f.level = 'shared' THEN 'shared'
			WHEN f.level = 'request' AND EXISTS (
				SELECT 1 FROM live_grants g
				WHERE g.what = 'all'
					OR (g.what = 'contact' AND f.predicate IN ('email', 'phone', 'address'))
					OR f.predicate = ANY (g.predicates)
			) THEN 'grant'
			ELSE NULL
		END AS shown_via,
		CASE WHEN f.researched THEN (
			SELECT src.url FROM public.knowledge_fact_sources fs
			JOIN public.knowledge_sources src ON src.id = fs.source_id
			WHERE fs.fact_id = f.id AND src.source_type IN ('web', 'youtube') AND src.url IS NOT NULL
			ORDER BY src.created_at
			LIMIT 1
		) END AS source_url
	FROM facts f
$$;

REVOKE ALL ON FUNCTION public.knowledge_entity_visibility(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.knowledge_entity_visibility(uuid, uuid, uuid, uuid) TO service_role;

COMMIT;
