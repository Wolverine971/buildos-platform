-- supabase/migrations/20260924190400_purge_soft_deleted_items.sql
-- Tasker 103 (PURGE): "delete means delete". A row a person deletes (deleted_at
-- set) is erased 30 days later, with the copies keyed to it and its storage
-- objects. Until then the existing restore paths keep working.
--
-- Run by the worker's daily privacy retention job
-- (apps/worker/src/scheduler/privacyRetention.ts), in this order:
--   1. list_privacy_deleted_asset_objects / list_privacy_deleted_voice_note_objects
--      return storage objects of expired rows; the worker removes them through
--      the Storage API.
--   2. The cleanup_privacy_deleted_* functions delete rows. A row that still has
--      a storage object is skipped, so a failed Storage call leaves the row for
--      the next run and never orphans a file.
--
-- What goes (window: 30 days after deleted_at, every table):
--   onto_projects ........ through delete_onto_project(), after cycle runs,
--                          project logs and project edges are removed explicitly.
--                          Everything else cascades. Activity events keep the
--                          project id but lose project_name.
--   onto_tasks, _documents, _goals, _plans, _milestones, _risks, _requirements,
--   _events (live or no project), _assets (live project):
--                          plus their embeddings, edges (and the edge logs),
--                          project-log snapshots (deleted, not nulled), comments,
--                          asset links, assignments, permissions, legacy id
--                          mappings; documents also lose versions, proposals,
--                          public pages and every doc-tree history snapshot that
--                          lists them; events lose their calendar mappings.
--   onto_comments ........ leaf-first; a deleted comment with live replies keeps
--                          its row (the thread hangs off it) and loses its text.
--   voice_notes, voice_note_groups (+ audio object).
--   user_contacts (+ methods, links, and the observations resolved to them),
--   user_contact_methods, profile_documents (+ versions, embeddings, links).
--   user_calendar_connections (+ credential ciphertext, OAuth states, sources),
--   user_calendar_sources, user_email_connections (+ credentials, grants).
--   cycles (+ runs, triggers); soft-deleted triggers no run points at.
--
-- Archived tasks (archived_at set with deleted_at, 20260924190350) are kept
-- until the person deletes them; they still go with a purged project.
-- Items inside a project that is itself deleted wait for the project.
-- An ontology row that fails to delete is recorded in privacy_purge_failures and
-- retried the next day instead of blocking the rows behind it.
--
-- Not covered: onto_public_pages, draft_tasks, email_project_profiles and legacy
-- tasks (no current writer sets deleted_at); public pages go with their
-- document or project.
--
-- This migration deletes nothing when applied. The worker job does.

BEGIN;

-- ---------------------------------------------------------------------------
-- Failure ledger: one row per ontology row that could not be deleted.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.privacy_purge_failures (
	source_table text NOT NULL,
	row_id uuid NOT NULL,
	sqlstate text NOT NULL,
	attempts integer NOT NULL DEFAULT 1,
	first_failed_at timestamptz NOT NULL DEFAULT now(),
	last_failed_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (source_table, row_id)
);

ALTER TABLE public.privacy_purge_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.privacy_purge_failures FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.privacy_purge_failures TO service_role;

COMMENT ON TABLE public.privacy_purge_failures IS
	'Rows the 30-day soft-delete purge could not delete (ids and SQLSTATE only). A row is retried once its last failure is 20 hours old.';

CREATE OR REPLACE FUNCTION public.record_privacy_purge_failure(
	p_source_table text,
	p_row_id uuid,
	p_sqlstate text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
	INSERT INTO public.privacy_purge_failures (source_table, row_id, sqlstate)
	VALUES (p_source_table, p_row_id, COALESCE(p_sqlstate, 'unknown'))
	ON CONFLICT (source_table, row_id) DO UPDATE
	SET sqlstate = EXCLUDED.sqlstate,
		attempts = public.privacy_purge_failures.attempts + 1,
		last_failed_at = now();
	RAISE WARNING 'privacy purge failed for %.% (SQLSTATE %)', p_source_table, p_row_id, p_sqlstate;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Storage candidates. Object paths are structured ids:
--   onto-assets: projects/<project_id>/assets/<asset_id>/<file>
--   voice_notes: voice_notes.storage_path (exact)
-- ---------------------------------------------------------------------------

-- Objects under an expired project, plus objects of an expired asset.
CREATE OR REPLACE FUNCTION public.list_privacy_deleted_asset_objects(
	p_limit integer DEFAULT 200
)
RETURNS TABLE (object_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_cutoff timestamptz := clock_timestamp() - interval '30 days';
BEGIN
	RETURN QUERY
	SELECT objects.name
	FROM storage.objects objects
	WHERE objects.bucket_id = 'onto-assets'
		AND split_part(objects.name, '/', 1) = 'projects'
		AND (
			EXISTS (
				SELECT 1
				FROM public.onto_projects projects
				WHERE projects.id::text = split_part(objects.name, '/', 2)
					AND projects.deleted_at <= v_cutoff
			)
			OR EXISTS (
				SELECT 1
				FROM public.onto_assets assets
				WHERE assets.deleted_at <= v_cutoff
					AND (
						assets.storage_path = objects.name
						OR (
							assets.project_id::text = split_part(objects.name, '/', 2)
							AND split_part(objects.name, '/', 3) = 'assets'
							AND assets.id::text = split_part(objects.name, '/', 4)
						)
					)
			)
		)
	ORDER BY objects.name
	LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
END;
$function$;

-- Audio of an expired note, or of any note in an expired group.
CREATE OR REPLACE FUNCTION public.list_privacy_deleted_voice_note_objects(
	p_limit integer DEFAULT 200
)
RETURNS TABLE (object_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_cutoff timestamptz := clock_timestamp() - interval '30 days';
BEGIN
	RETURN QUERY
	SELECT DISTINCT objects.name
	FROM storage.objects objects
	JOIN public.voice_notes notes
		ON notes.storage_bucket = objects.bucket_id
		AND notes.storage_path = objects.name
	LEFT JOIN public.voice_note_groups groups ON groups.id = notes.group_id
	WHERE objects.bucket_id = 'voice_notes'
		AND (notes.deleted_at <= v_cutoff OR groups.deleted_at <= v_cutoff)
	ORDER BY objects.name
	LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------

-- delete_onto_project() marks the project deleted again (its calendar trigger
-- queues Google deletes for mappings that were never cancelled), deletes the
-- children, then the project; the other project tables cascade. What it does
-- not reach is removed first: cycle runs (NO ACTION into cycles, immutable
-- project_id), project logs and project edges (explicit, whatever their FK rule).
CREATE OR REPLACE FUNCTION public.cleanup_privacy_deleted_projects(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
-- delete_onto_project() uses unqualified names.
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 25);
	v_cutoff timestamptz := clock_timestamp() - interval '30 days';
	v_project_id uuid;
	v_purged uuid[] := '{}'::uuid[];
	v_failed integer := 0;
BEGIN
	FOR v_project_id IN
		SELECT projects.id
		FROM public.onto_projects projects
		WHERE projects.deleted_at <= v_cutoff
			AND NOT EXISTS (
				SELECT 1
				FROM storage.objects objects
				WHERE objects.bucket_id = 'onto-assets'
					AND split_part(objects.name, '/', 1) = 'projects'
					AND split_part(objects.name, '/', 2) = projects.id::text
			)
			AND NOT EXISTS (
				SELECT 1
				FROM public.privacy_purge_failures failures
				WHERE failures.source_table = 'onto_projects'
					AND failures.row_id = projects.id
					AND failures.last_failed_at > now() - interval '20 hours'
			)
		ORDER BY projects.deleted_at, projects.id
		LIMIT v_batch
		FOR UPDATE OF projects SKIP LOCKED
	LOOP
		BEGIN
			DELETE FROM public.cycle_runs runs
			WHERE runs.project_id = v_project_id
				OR runs.cycle_id IN (
					SELECT cycles.id FROM public.cycles cycles WHERE cycles.project_id = v_project_id
				);
			DELETE FROM public.cycles WHERE project_id = v_project_id;
			DELETE FROM public.onto_project_logs WHERE project_id = v_project_id;
			DELETE FROM public.onto_edges WHERE project_id = v_project_id;
			PERFORM public.delete_onto_project(v_project_id);
			v_purged := array_append(v_purged, v_project_id);
		EXCEPTION WHEN OTHERS THEN
			PERFORM public.record_privacy_purge_failure('onto_projects', v_project_id, SQLSTATE);
			v_failed := v_failed + 1;
		END;
	END LOOP;

	IF cardinality(v_purged) > 0 THEN
		UPDATE public.notification_events events
		SET payload = events.payload - 'project_name'
		WHERE events.payload ? 'project_name'
			AND events.payload->>'project_id' = ANY (v_purged::text[]);

		DELETE FROM public.privacy_purge_failures
		WHERE source_table = 'onto_projects' AND row_id = ANY (v_purged);
	END IF;

	RETURN jsonb_build_object(
		'projects_deleted', cardinality(v_purged),
		'project_purge_failures', v_failed
	);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Items inside live projects
-- ---------------------------------------------------------------------------

-- Deletes the expired rows among p_ids of one kind, and every copy keyed to
-- them by (kind, id). Ids that are live, younger than 30 days, or archived
-- tasks are ignored.
CREATE OR REPLACE FUNCTION public.purge_privacy_onto_items(p_kind text, p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_table text := CASE p_kind
		WHEN 'task' THEN 'onto_tasks'
		WHEN 'document' THEN 'onto_documents'
		WHEN 'goal' THEN 'onto_goals'
		WHEN 'plan' THEN 'onto_plans'
		WHEN 'milestone' THEN 'onto_milestones'
		WHEN 'risk' THEN 'onto_risks'
		WHEN 'requirement' THEN 'onto_requirements'
		WHEN 'event' THEN 'onto_events'
		WHEN 'asset' THEN 'onto_assets'
	END;
	v_ids uuid[];
	v_deleted integer;
BEGIN
	IF v_table IS NULL THEN
		RAISE EXCEPTION 'privacy_purge_unknown_kind';
	END IF;

	EXECUTE format(
		'SELECT COALESCE(array_agg(item.id), ''{}''::uuid[])
		FROM public.%I item
		WHERE item.id = ANY ($1)
			AND item.deleted_at <= clock_timestamp() - interval ''30 days''
			%s',
		v_table,
		CASE WHEN p_kind = 'task' THEN 'AND item.archived_at IS NULL' ELSE '' END
	)
	INTO v_ids
	USING p_ids;

	IF cardinality(v_ids) = 0 THEN
		RETURN 0;
	END IF;

	DELETE FROM public.onto_embeddings
	WHERE entity_type = CASE WHEN p_kind = 'asset' THEN 'image' ELSE p_kind END
		AND entity_id = ANY (v_ids);

	IF p_kind <> 'asset' THEN
		WITH edges AS (
			DELETE FROM public.onto_edges
			WHERE src_id = ANY (v_ids) OR dst_id = ANY (v_ids)
			RETURNING id
		)
		DELETE FROM public.onto_project_logs logs
		USING edges
		WHERE logs.entity_type = 'edge' AND logs.entity_id = edges.id;

		DELETE FROM public.onto_project_logs WHERE entity_type = p_kind AND entity_id = ANY (v_ids);
		DELETE FROM public.onto_comments WHERE entity_type = p_kind AND entity_id = ANY (v_ids);
		DELETE FROM public.onto_asset_links WHERE entity_kind = p_kind AND entity_id = ANY (v_ids);
		DELETE FROM public.onto_assignments WHERE object_kind = p_kind AND object_id = ANY (v_ids);
		DELETE FROM public.onto_permissions WHERE object_kind = p_kind AND object_id = ANY (v_ids);
		DELETE FROM public.legacy_entity_mappings WHERE onto_table = v_table AND onto_id = ANY (v_ids);
	END IF;

	IF p_kind = 'document' THEN
		DELETE FROM public.onto_document_versions WHERE document_id = ANY (v_ids);
		DELETE FROM public.onto_document_proposals WHERE document_id = ANY (v_ids);
		DELETE FROM public.onto_public_pages WHERE document_id = ANY (v_ids);
		-- Tree snapshots cache each node's title; drop every snapshot that lists one.
		DELETE FROM public.onto_project_structure_history history
		WHERE history.project_id IN (
				SELECT documents.project_id FROM public.onto_documents documents
				WHERE documents.id = ANY (v_ids)
			)
			AND jsonb_path_exists(
				history.doc_structure,
				'$.**.id ? (@ == $ids[*])',
				jsonb_build_object('ids', to_jsonb(v_ids::text[]))
			);
	ELSIF p_kind = 'event' THEN
		DELETE FROM public.onto_event_sync WHERE event_id = ANY (v_ids);
	END IF;

	EXECUTE format('DELETE FROM public.%I WHERE id = ANY ($1)', v_table) USING v_ids;
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	DELETE FROM public.privacy_purge_failures
	WHERE source_table = v_table AND row_id = ANY (v_ids);

	RETURN v_deleted;
END;
$function$;

-- One bounded batch per kind, children before parents. A batch that fails is
-- retried row by row so one bad row is recorded and skipped, not a blocker.
CREATE OR REPLACE FUNCTION public.cleanup_privacy_deleted_project_items(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 500);
	v_cutoff timestamptz := clock_timestamp() - interval '30 days';
	v_kind text;
	v_table text;
	v_ids uuid[];
	v_id uuid;
	v_deleted integer;
	v_failed integer := 0;
	v_comments integer := 0;
	v_scrubbed integer := 0;
	v_result jsonb := '{}'::jsonb;
BEGIN
	-- Comments: leaves go; a deleted comment that still has replies keeps its
	-- row (FKs cascade down the thread) and loses its text. Later batches peel
	-- the thread upward as its deleted replies go.
	WITH candidates AS (
		SELECT comments.id
		FROM public.onto_comments comments
		JOIN public.onto_projects projects ON projects.id = comments.project_id
		WHERE comments.deleted_at <= v_cutoff
			AND projects.deleted_at IS NULL
			AND NOT EXISTS (
				SELECT 1
				FROM public.onto_comments replies
				WHERE replies.id <> comments.id
					AND (replies.parent_id = comments.id OR replies.root_id = comments.id)
			)
		LIMIT v_batch
		FOR UPDATE OF comments SKIP LOCKED
	)
	DELETE FROM public.onto_comments comments
	USING candidates
	WHERE comments.id = candidates.id;
	GET DIAGNOSTICS v_comments = ROW_COUNT;

	WITH candidates AS (
		SELECT comments.id
		FROM public.onto_comments comments
		JOIN public.onto_projects projects ON projects.id = comments.project_id
		WHERE comments.deleted_at <= v_cutoff
			AND projects.deleted_at IS NULL
			AND (comments.body <> '[deleted]' OR comments.metadata <> '{}'::jsonb)
		LIMIT v_batch
		FOR UPDATE OF comments SKIP LOCKED
	)
	UPDATE public.onto_comments comments
	SET body = '[deleted]',
		metadata = '{}'::jsonb
	FROM candidates
	WHERE comments.id = candidates.id;
	GET DIAGNOSTICS v_scrubbed = ROW_COUNT;

	FOREACH v_kind IN ARRAY ARRAY[
		'event', 'asset', 'task', 'document', 'milestone', 'risk', 'requirement', 'plan', 'goal'
	]
	LOOP
		v_table := 'onto_' || v_kind || 's';

		-- Events may have no project; archived tasks stay; assets wait until
		-- their object is gone.
		EXECUTE format(
			'SELECT COALESCE(array_agg(candidate.id), ''{}''::uuid[])
			FROM (
				SELECT item.id
				FROM public.%1$I item
				LEFT JOIN public.onto_projects projects ON projects.id = item.project_id
				WHERE item.deleted_at <= $1
					AND projects.deleted_at IS NULL
					AND NOT EXISTS (
						SELECT 1
						FROM public.privacy_purge_failures failures
						WHERE failures.source_table = %2$L
							AND failures.row_id = item.id
							AND failures.last_failed_at > now() - interval ''20 hours''
					)
					%3$s
				ORDER BY item.deleted_at, item.id
				LIMIT $2
				FOR UPDATE OF item SKIP LOCKED
			) candidate',
			v_table,
			v_table,
			CASE WHEN v_kind = 'task' THEN 'AND item.archived_at IS NULL'
			WHEN v_kind = 'asset' THEN
				'AND NOT EXISTS (
					SELECT 1
					FROM storage.objects objects
					WHERE objects.bucket_id = item.storage_bucket
						AND (
							objects.name = item.storage_path
							OR (
								split_part(objects.name, ''/'', 2) = item.project_id::text
								AND split_part(objects.name, ''/'', 4) = item.id::text
							)
						)
				)'
			ELSE '' END
		)
		INTO v_ids
		USING v_cutoff, v_batch;

		v_deleted := 0;
		IF cardinality(v_ids) > 0 THEN
			BEGIN
				v_deleted := public.purge_privacy_onto_items(v_kind, v_ids);
			EXCEPTION WHEN OTHERS THEN
				v_deleted := 0;
				FOREACH v_id IN ARRAY v_ids LOOP
					BEGIN
						v_deleted := v_deleted + public.purge_privacy_onto_items(v_kind, ARRAY[v_id]);
					EXCEPTION WHEN OTHERS THEN
						PERFORM public.record_privacy_purge_failure(v_table, v_id, SQLSTATE);
						v_failed := v_failed + 1;
					END;
				END LOOP;
			END;
		END IF;
		v_result := v_result || jsonb_build_object(v_table || '_deleted', v_deleted);
	END LOOP;

	RETURN v_result || jsonb_build_object(
		'onto_comments_deleted', v_comments,
		'onto_comments_blanked', v_scrubbed,
		'item_purge_failures', v_failed
	);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Voice
-- ---------------------------------------------------------------------------

-- Rows go once their audio object is gone (the storage sweep runs first).
CREATE OR REPLACE FUNCTION public.cleanup_privacy_deleted_voice_notes(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_cutoff timestamptz := clock_timestamp() - interval '30 days';
	v_notes integer := 0;
	v_groups integer := 0;
BEGIN
	WITH candidates AS (
		SELECT notes.id
		FROM public.voice_notes notes
		LEFT JOIN public.voice_note_groups groups ON groups.id = notes.group_id
		WHERE (notes.deleted_at <= v_cutoff OR groups.deleted_at <= v_cutoff)
			AND NOT EXISTS (
				SELECT 1
				FROM storage.objects objects
				WHERE objects.bucket_id = notes.storage_bucket
					AND objects.name = notes.storage_path
			)
		LIMIT v_batch
		FOR UPDATE OF notes SKIP LOCKED
	)
	DELETE FROM public.voice_notes notes
	USING candidates
	WHERE notes.id = candidates.id;
	GET DIAGNOSTICS v_notes = ROW_COUNT;

	WITH candidates AS (
		SELECT groups.id
		FROM public.voice_note_groups groups
		WHERE groups.deleted_at <= v_cutoff
			AND NOT EXISTS (
				SELECT 1 FROM public.voice_notes notes WHERE notes.group_id = groups.id
			)
		LIMIT v_batch
		FOR UPDATE OF groups SKIP LOCKED
	)
	DELETE FROM public.voice_note_groups groups
	USING candidates
	WHERE groups.id = candidates.id;
	GET DIAGNOSTICS v_groups = ROW_COUNT;

	RETURN jsonb_build_object(
		'voice_notes_deleted', v_notes,
		'voice_note_groups_deleted', v_groups
	);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Contacts and profile documents
-- ---------------------------------------------------------------------------

-- Methods, links and merge candidates cascade. Observations resolved to the
-- contact hold its proposed name and method, so they go too.
CREATE OR REPLACE FUNCTION public.cleanup_privacy_deleted_contacts(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_cutoff timestamptz := clock_timestamp() - interval '30 days';
	v_ids uuid[];
	v_observations integer := 0;
	v_contacts integer := 0;
	v_methods integer := 0;
BEGIN
	SELECT COALESCE(array_agg(candidate.id), '{}'::uuid[])
	INTO v_ids
	FROM (
		SELECT contacts.id
		FROM public.user_contacts contacts
		WHERE contacts.deleted_at <= v_cutoff
		LIMIT v_batch
		FOR UPDATE OF contacts SKIP LOCKED
	) candidate;

	IF cardinality(v_ids) > 0 THEN
		DELETE FROM public.user_contact_observations
		WHERE resolved_contact_id = ANY (v_ids);
		GET DIAGNOSTICS v_observations = ROW_COUNT;

		DELETE FROM public.user_contacts WHERE id = ANY (v_ids);
		GET DIAGNOSTICS v_contacts = ROW_COUNT;
	END IF;

	WITH candidates AS (
		SELECT methods.id
		FROM public.user_contact_methods methods
		WHERE methods.deleted_at <= v_cutoff
		LIMIT v_batch
		FOR UPDATE OF methods SKIP LOCKED
	)
	DELETE FROM public.user_contact_methods methods
	USING candidates
	WHERE methods.id = candidates.id;
	GET DIAGNOSTICS v_methods = ROW_COUNT;

	RETURN jsonb_build_object(
		'user_contacts_deleted', v_contacts,
		'user_contact_observations_deleted', v_observations,
		'user_contact_methods_deleted', v_methods
	);
END;
$function$;

-- Versions, embeddings and contact links cascade; fragments suggested for the
-- chapter keep their own text and lose the pointer (SET NULL).
CREATE OR REPLACE FUNCTION public.cleanup_privacy_deleted_profile_documents(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_cutoff timestamptz := clock_timestamp() - interval '30 days';
	v_deleted integer := 0;
BEGIN
	WITH candidates AS (
		SELECT documents.id
		FROM public.profile_documents documents
		WHERE documents.deleted_at <= v_cutoff
		LIMIT v_batch
		FOR UPDATE OF documents SKIP LOCKED
	)
	DELETE FROM public.profile_documents documents
	USING candidates
	WHERE documents.id = candidates.id;
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	RETURN jsonb_build_object('profile_documents_deleted', v_deleted);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Connections
-- ---------------------------------------------------------------------------

-- Calendar disconnect keeps the credential row (revoked, ciphertext intact) and
-- soft-deletes the sources; all of it cascades from the connection here. Rows
-- that pointed at a purged source keep their calendar id and lose the source id
-- (ON DELETE SET NULL (calendar_source_id)). Gmail disconnect already hard-deletes;
-- this also catches any soft-deleted Gmail row.
CREATE OR REPLACE FUNCTION public.cleanup_privacy_deleted_connections(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_cutoff timestamptz := clock_timestamp() - interval '30 days';
	v_calendar_connections integer := 0;
	v_calendar_sources integer := 0;
	v_email_connections integer := 0;
BEGIN
	WITH candidates AS (
		SELECT connections.id
		FROM public.user_calendar_connections connections
		WHERE connections.deleted_at <= v_cutoff
		LIMIT v_batch
		FOR UPDATE OF connections SKIP LOCKED
	)
	DELETE FROM public.user_calendar_connections connections
	USING candidates
	WHERE connections.id = candidates.id;
	GET DIAGNOSTICS v_calendar_connections = ROW_COUNT;

	WITH candidates AS (
		SELECT sources.id
		FROM public.user_calendar_sources sources
		WHERE sources.deleted_at <= v_cutoff
		LIMIT v_batch
		FOR UPDATE OF sources SKIP LOCKED
	)
	DELETE FROM public.user_calendar_sources sources
	USING candidates
	WHERE sources.id = candidates.id;
	GET DIAGNOSTICS v_calendar_sources = ROW_COUNT;

	WITH candidates AS (
		SELECT connections.id
		FROM public.user_email_connections connections
		WHERE connections.deleted_at <= v_cutoff
		LIMIT v_batch
		FOR UPDATE OF connections SKIP LOCKED
	)
	DELETE FROM public.user_email_connections connections
	USING candidates
	WHERE connections.id = candidates.id;
	GET DIAGNOSTICS v_email_connections = ROW_COUNT;

	RETURN jsonb_build_object(
		'user_calendar_connections_deleted', v_calendar_connections,
		'user_calendar_sources_deleted', v_calendar_sources,
		'user_email_connections_deleted', v_email_connections
	);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Cycles
-- ---------------------------------------------------------------------------

-- cycle_runs.cycle_id is NO ACTION and a run's identity columns are immutable
-- (a SET NULL on trigger_id raises), so runs go before their cycle. A deleted
-- trigger of a live cycle goes only once no run points at it.
CREATE OR REPLACE FUNCTION public.cleanup_privacy_deleted_cycles(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_cutoff timestamptz := clock_timestamp() - interval '30 days';
	v_ids uuid[];
	v_runs integer := 0;
	v_cycles integer := 0;
	v_triggers integer := 0;
BEGIN
	SELECT COALESCE(array_agg(candidate.id), '{}'::uuid[])
	INTO v_ids
	FROM (
		SELECT cycles.id
		FROM public.cycles cycles
		WHERE cycles.deleted_at <= v_cutoff
		LIMIT v_batch
		FOR UPDATE OF cycles SKIP LOCKED
	) candidate;

	IF cardinality(v_ids) > 0 THEN
		DELETE FROM public.cycle_runs WHERE cycle_id = ANY (v_ids);
		GET DIAGNOSTICS v_runs = ROW_COUNT;

		DELETE FROM public.cycles WHERE id = ANY (v_ids);
		GET DIAGNOSTICS v_cycles = ROW_COUNT;
	END IF;

	WITH candidates AS (
		SELECT triggers.id
		FROM public.cycle_triggers triggers
		WHERE triggers.deleted_at <= v_cutoff
			AND NOT EXISTS (
				SELECT 1 FROM public.cycle_runs runs WHERE runs.trigger_id = triggers.id
			)
		LIMIT v_batch
		FOR UPDATE OF triggers SKIP LOCKED
	)
	DELETE FROM public.cycle_triggers triggers
	USING candidates
	WHERE triggers.id = candidates.id;
	GET DIAGNOSTICS v_triggers = ROW_COUNT;

	RETURN jsonb_build_object(
		'cycles_deleted', v_cycles,
		'cycle_runs_deleted', v_runs,
		'cycle_triggers_deleted', v_triggers
	);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Grants: the scheduled functions are service_role only; the helpers are
-- reachable only through them.
-- ---------------------------------------------------------------------------

DO $grants$
DECLARE
	v_signature text;
BEGIN
	FOREACH v_signature IN ARRAY ARRAY[
		'public.list_privacy_deleted_asset_objects(integer)',
		'public.list_privacy_deleted_voice_note_objects(integer)',
		'public.cleanup_privacy_deleted_projects(integer)',
		'public.cleanup_privacy_deleted_project_items(integer)',
		'public.cleanup_privacy_deleted_voice_notes(integer)',
		'public.cleanup_privacy_deleted_contacts(integer)',
		'public.cleanup_privacy_deleted_profile_documents(integer)',
		'public.cleanup_privacy_deleted_connections(integer)',
		'public.cleanup_privacy_deleted_cycles(integer)'
	]
	LOOP
		EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_signature);
		EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_signature);
	END LOOP;

	FOREACH v_signature IN ARRAY ARRAY[
		'public.record_privacy_purge_failure(text, uuid, text)',
		'public.purge_privacy_onto_items(text, uuid[])'
	]
	LOOP
		EXECUTE format(
			'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role',
			v_signature
		);
	END LOOP;
END;
$grants$;

COMMIT;
