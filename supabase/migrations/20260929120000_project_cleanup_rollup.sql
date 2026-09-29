-- supabase/migrations/20260929120000_project_cleanup_rollup.sql
-- Project Review roll-up (Tasker 112): findings carry forward across review passes
-- as lineages instead of rotating out, and each project gets one living
-- "Project cleanup" item in the AI Inbox.
--
-- project_suggestions gains:
--   lineage_id  the finding a row belongs to (its first row's id). Re-confirmations
--               update the live row; a change of scope writes a new row in the same
--               lineage and supersedes the old one with a recorded reason.
--   rollup      {first_seen_at, last_confirmed_at, seen_run_ids[], passes_since_confirmed,
--                source, summary, section, close:{reason, detail, run_id, at}}.
-- Both are nullable: every existing row keeps working unchanged.
--
-- inbox_items accepts source_type 'project_cleanup', keyed by the project id.
--
-- project_review_document_facts gives the review worker each live document's content
-- size and public-page state without loading every body. Server-only (no client grant).
--
-- Rollback:
--   DROP FUNCTION public.project_review_document_facts(uuid);
--   DROP INDEX public.project_suggestions_open_lineage;
--   ALTER TABLE public.project_suggestions DROP COLUMN rollup, DROP COLUMN lineage_id;
--   restore inbox_items_source_type_check without 'project_cleanup' (after expiring those rows).

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.project_suggestions
	ADD COLUMN IF NOT EXISTS lineage_id uuid,
	ADD COLUMN IF NOT EXISTS rollup jsonb;

-- The open change set: a project's pending rows, grouped by lineage.
CREATE INDEX IF NOT EXISTS project_suggestions_open_lineage
	ON public.project_suggestions(project_id, lineage_id)
	WHERE status = 'pending';

ALTER TABLE public.inbox_items DROP CONSTRAINT IF EXISTS inbox_items_source_type_check;
ALTER TABLE public.inbox_items
	ADD CONSTRAINT inbox_items_source_type_check CHECK (source_type = ANY (ARRAY[
		'agent_run'::text,
		'project_suggestion'::text,
		'project_review'::text,
		'project_audit'::text,
		'project_cleanup'::text,
		'calendar_suggestion'::text,
		'profile_fragment'::text,
		'contact_merge_candidate'::text,
		'integration_attention'::text
	])) NOT VALID;
ALTER TABLE public.inbox_items VALIDATE CONSTRAINT inbox_items_source_type_check;

CREATE OR REPLACE FUNCTION public.project_review_document_facts(p_project_id uuid)
RETURNS TABLE (document_id uuid, content_chars integer, is_public boolean)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
	SELECT
		d.id,
		coalesce(char_length(d.content), 0),
		EXISTS (
			SELECT 1
			FROM public.onto_public_pages p
			WHERE p.document_id = d.id
				AND p.deleted_at IS NULL
				AND p.status = 'published'
		)
	FROM public.onto_documents d
	WHERE d.project_id = p_project_id
		AND d.deleted_at IS NULL
		AND d.archived_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.project_review_document_facts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_review_document_facts(uuid) TO service_role;

COMMENT ON FUNCTION public.project_review_document_facts(uuid) IS
	'Tasker 112: content size and published state of a project''s live documents, for the Project Review checks. Server-only.';

COMMIT;
