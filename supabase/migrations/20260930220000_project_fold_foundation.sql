-- supabase/migrations/20260930220000_project_fold_foundation.sql
--
-- Project hierarchy, phase 3 ("Combine"), database foundation, part 1 of 2.
-- Plan: ~/.claude/plans/whimsical-chasing-sunrise.md ("Phase 3: combine");
-- handoff: docs/architecture/PROJECT_HIERARCHY_2026-09-30.md.
--
-- Folding moves every record of a source project into a destination project with
-- its id intact, files the source's doc tree under a new "From <source>" folder,
-- demotes the source START HERE / thinking log to plain documents, archives the
-- source with merged_into_project_id, and keeps a manifest so
-- 20260930220100_project_unfold.sql can move things back.
--
-- 1. private.project_fold_table_policy classifies every column that points at a
--    project (move / repoint / rebuild / leave_behind, with a reason). The fold
--    implements exactly the move/repoint rows (private.project_fold_implemented);
--    private.project_fold_policy_gaps() reports any drift and the fold refuses
--    to run while there is any. supabase/tests/project_fold_table_coverage.check.sql
--    re-proves coverage on every migration rehearsal (DEFAULT_CHECKS).
-- 2. public.onto_project_fold_preview / public.onto_project_fold_apply: service
--    only, explicit user id, admin on both projects re-checked in SQL. Preview
--    takes no locks; apply locks both projects in UUID order, then the source's
--    documents and tasks (the Organize mover's order), recomputes the token and
--    refuses a mismatch. Idempotent by fold id.
-- 3. public.onto_project_fold_manifests: service-only journal (RLS on, no browser
--    grants). Either project's deletion cascades its manifests. Purged after 30
--    days by public.cleanup_privacy_project_fold_manifests (worker retention job).
-- 4. public.get_project_route_redirect: {status:'merged', destination_project_id}
--    only for callers who can read the destination.
--
-- Reused Organize machinery: private.organize_rollout (calendar/asset readiness),
-- the buildos.organize_refs / buildos.organize_assets guard settings,
-- private.organize_write_tree (structure history + child caches),
-- private.organize_tree / private.organize_nodes, and the
-- onto_organize_task_sync calendar job the deployed worker already handles.
-- The Organize mover itself (private.onto_move_entity_set) is not reused: it
-- moves only documents and tasks and detaches every link leaving that set, which
-- would cut task -> goal links when a whole project moves.

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Table coverage policy.

CREATE TABLE private.project_fold_table_policy (
	table_schema text NOT NULL DEFAULT 'public',
	table_name text NOT NULL,
	column_name text NOT NULL,
	action text NOT NULL CHECK (action IN ('move', 'repoint', 'rebuild', 'leave_behind')),
	reason text NOT NULL CHECK (char_length(btrim(reason)) >= 12),
	-- Columns machines rewrite (sync status, caches, counters). They are left out
	-- of change fingerprints: the preview token and "edited since the fold".
	machine_columns text[] NOT NULL DEFAULT '{}',
	PRIMARY KEY (table_schema, table_name, column_name)
);
ALTER TABLE private.project_fold_table_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.project_fold_table_policy FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON private.project_fold_table_policy TO service_role;

COMMENT ON TABLE private.project_fold_table_policy IS
	'What a project fold does with each column that points at a project. move: rows go to the destination with ids intact (manifest records them for unfold). repoint: the reference follows the merge. rebuild: derived state stays with the archived source and is regenerated for the destination after commit. leave_behind: history/settings stay with the archived source. Coverage is enforced by supabase/tests/project_fold_table_coverage.check.sql.';

INSERT INTO private.project_fold_table_policy (table_schema, table_name, column_name, action, reason, machine_columns) VALUES
	-- move: the project's content, ids intact.
	('public', 'onto_documents', 'project_id', 'move', 'Documents move with ids intact; the source tree lands under a "From <source>" folder; START HERE, the thinking log and a shared-folder role are demoted to plain documents.', '{}'),
	('public', 'onto_tasks', 'project_id', 'move', 'Tasks move with ids intact; dated tasks queue the Organize calendar job (onto_organize_task_sync) to rebuild their events in the destination.', '{}'),
	('public', 'onto_goals', 'project_id', 'move', 'Goals move with ids intact; task goal_id links stay valid because both ends move.', '{}'),
	('public', 'onto_plans', 'project_id', 'move', 'Plans move with ids intact.', '{}'),
	('public', 'onto_milestones', 'project_id', 'move', 'Milestones move with ids intact.', '{}'),
	('public', 'onto_risks', 'project_id', 'move', 'Risks move with ids intact.', '{}'),
	('public', 'onto_requirements', 'project_id', 'move', 'Requirements move with ids intact.', '{}'),
	('public', 'onto_metrics', 'project_id', 'move', 'Metrics move with ids intact (metric points follow through metric_id).', '{}'),
	('public', 'onto_insights', 'project_id', 'move', 'Insights move with ids intact.', '{}'),
	('public', 'onto_signals', 'project_id', 'move', 'Signals move with ids intact.', '{}'),
	('public', 'onto_sources', 'project_id', 'move', 'Sources move with ids intact.', '{}'),
	('public', 'onto_assets', 'project_id', 'move', 'Assets move (asset_access_ready gate); storage_project_id keeps the file where it is, so asset ids and render URLs survive.',
		ARRAY['ocr_status', 'ocr_error', 'ocr_model', 'ocr_version', 'ocr_started_at', 'ocr_completed_at', 'extracted_text',
			'extracted_text_source', 'extracted_text_updated_at', 'extracted_text_updated_by', 'extraction_summary', 'extraction_metadata']),
	('public', 'onto_asset_links', 'project_id', 'move', 'Asset links follow their asset and entity.', '{}'),
	('public', 'onto_edges', 'project_id', 'move', 'Relationships move; project-node endpoints are repointed to the destination; the source has_context_document link and links to rebuilt task events are dropped (kept in the manifest).', '{}'),
	('public', 'onto_comments', 'project_id', 'move', 'Comments follow their entity; comments on the source project itself or on rebuilt task events stay with the archived source.', '{}'),
	('public', 'onto_comment_read_states', 'project_id', 'move', 'Read states follow their comment thread''s entity.', '{}'),
	('public', 'onto_embeddings', 'project_id', 'move', 'Embeddings follow their entity; the source project''s own embedding and event embeddings stay.', ARRAY['embedding', 'content_text', 'content_hash', 'embedding_model', 'chunk_anchor']),
	('public', 'onto_public_pages', 'project_id', 'move', 'Published pages follow their document and keep their slug.', ARRAY['view_count_all', 'view_count_30d', 'view_count_30d_updated_at', 'last_live_sync_at', 'last_live_sync_error']),
	('public', 'onto_public_page_review_attempts', 'project_id', 'move', 'Publication review records follow their document.', '{}'),
	('public', 'onto_public_page_slug_history', 'project_id', 'move', 'Slug history follows its public page so old links keep resolving.', '{}'),
	('public', 'onto_task_assignees', 'project_id', 'move', 'Assignees follow their task; assignees without access to the destination are removed (kept in the manifest) and listed in the preview.', '{}'),
	-- repoint: references that should follow the merge.
	('public', 'chat_sessions', 'entity_id', 'repoint', 'Project chats (context_type project) continue in the destination; unfold moves back chats with no activity since the fold.',
		ARRAY['auto_title', 'summary', 'chat_topics', 'extracted_entities', 'last_classified_at', 'compressed_at', 'capture_watermark_message_id', 'capture_watermark_at']),
	('public', 'chat_sessions_projects', 'project_id', 'repoint', 'Chats linked to the source are linked to the destination (a duplicate link is dropped and kept in the manifest).', '{}'),
	('public', 'user_contact_links', 'project_id', 'repoint', 'Contacts linked to the source are linked to the destination.', '{}'),
	-- rebuild: derived state; the destination regenerates its own after commit.
	('public', 'onto_events', 'project_id', 'rebuild', 'Task events are soft-deleted in the source and recreated in the destination by the calendar job (Organize''s path); live non-task events block the fold until a calendar re-home job exists.',
		ARRAY['sync_status', 'last_synced_at', 'sync_error', 'props', 'external_link']),
	('private', 'agentic_chat_project_context_versions', 'project_id', 'rebuild', 'Chat context versions; the entity triggers bump both projects, so destination caches rebuild.', '{}'),
	('public', 'project_context_snapshot', 'project_id', 'rebuild', 'Derived project snapshot; recomputed for the destination after commit.', '{}'),
	('public', 'project_context_snapshot_metrics', 'project_id', 'rebuild', 'Snapshot timing metrics; recomputed with the destination snapshot.', '{}'),
	('public', 'user_project_behavioral_profiles', 'project_id', 'rebuild', 'Per-project behavior profile; recomputed for the destination from its sessions.', '{}'),
	('public', 'freshness_scans', 'project_id', 'rebuild', 'Freshness radar state of the source; the destination gets a fresh scan after commit.', '{}'),
	('public', 'freshness_flags', 'project_id', 'rebuild', 'Freshness flags of the source; the destination scan raises its own.', '{}'),
	('public', 'freshness_concerns', 'project_id', 'rebuild', 'Freshness concerns of the source; the destination scan raises its own.', '{}'),
	('public', 'freshness_track_scores', 'project_id', 'rebuild', 'Freshness track scores; recomputed for the destination.', '{}'),
	('public', 'project_review_signals', 'project_id', 'rebuild', 'Project Review signals of the source; the destination review runs after commit.', '{}'),
	-- leave_behind: history, settings and grants stay with the archived source.
	('public', 'onto_projects', 'parent_project_id', 'leave_behind', 'v1 refuses to fold a project with sub-projects (source_has_sub_projects); the source''s own parent link is cleared by the fold and restored by unfold.', '{}'),
	('public', 'onto_projects', 'merged_into_project_id', 'leave_behind', 'Projects already merged into the source keep pointing at it; route forwarding follows the chain.', '{}'),
	('public', 'onto_document_proposals', 'project_id', 'leave_behind', 'project_id is immutable and pinned inside the patch (patch_scope_check), so finished proposals stay with the archived source as history; pending proposals block the fold.', '{}'),
	('public', 'onto_project_members', 'project_id', 'leave_behind', 'Members are never moved; source members the destination lacks block the fold unless named, then they are added to the destination with their source role.', '{}'),
	('public', 'onto_project_invites', 'project_id', 'leave_behind', 'Pending invites to the archived source are not carried over.', '{}'),
	('public', 'external_agent_project_permissions', 'project_id', 'leave_behind', 'Connector grants are never copied (DJ, 2026-09-30); the preview lists them.', '{}'),
	('public', 'agent_oauth_grants', 'allowed_project_ids', 'leave_behind', 'Connector OAuth scopes are never widened by a fold; the preview counts grants that named the source.', '{}'),
	('public', 'onto_project_logs', 'project_id', 'leave_behind', 'Activity history stays with the archived source; the fold writes one summary row in each project.', '{}'),
	('public', 'onto_project_structure_history', 'project_id', 'leave_behind', 'Tree history stays; the fold records its own tree versions in both projects.', '{}'),
	('public', 'onto_project_icon_candidates', 'project_id', 'leave_behind', 'The destination keeps its own icon.', '{}'),
	('public', 'onto_project_icon_generations', 'project_id', 'leave_behind', 'Icon generation history stays with the source.', '{}'),
	('public', 'onto_assets', 'storage_project_id', 'leave_behind', 'Physical storage location is immutable; storage policies follow project_id.', '{}'),
	('public', 'onto_organize_batches', 'project_ids', 'leave_behind', 'Organize journal entries keep their projects; Organize undo skips items a fold moved.', '{}'),
	('public', 'onto_project_fold_manifests', 'source_project_id', 'leave_behind', 'Fold bookkeeping; cascades with the source project.', '{}'),
	('public', 'onto_project_fold_manifests', 'destination_project_id', 'leave_behind', 'Fold bookkeeping; cascades with the destination project.', '{}'),
	('public', 'project_calendars', 'project_id', 'leave_behind', 'The source''s Google calendar stays with it; the preview reports it. Task events are rebuilt on the destination''s calendar.', '{}'),
	('public', 'cycles', 'project_id', 'leave_behind', 'Automations stay with the archived source (one live cycle per kind and project); the preview counts them.', '{}'),
	('public', 'cycle_runs', 'project_id', 'leave_behind', 'Automation run history.', '{}'),
	('public', 'agent_operatives', 'project_id', 'leave_behind', 'Scheduled operatives are tuned to the source; they stay and the preview counts them.', '{}'),
	('public', 'agent_runs', 'project_id', 'leave_behind', 'Agent run history.', '{}'),
	('public', 'homework_runs', 'workspace_project_id', 'leave_behind', 'Research run history.', '{}'),
	('public', 'homework_runs', 'project_ids', 'leave_behind', 'Research run history (scope snapshot).', '{}'),
	('public', 'inbox_items', 'project_id', 'leave_behind', 'Pending inbox decisions reference source-scoped review and freshness rows; the destination review raises fresh ones.', '{}'),
	('public', 'email_project_rules', 'project_id', 'leave_behind', 'Inbox routing rules stay with the source; the preview counts them so they can be re-pointed by hand.', '{}'),
	('public', 'email_project_profiles', 'project_id', 'leave_behind', 'Inbox routing profile of the source.', '{}'),
	('public', 'email_relevance_project_candidates', 'project_id', 'leave_behind', 'Email relevance scan history.', '{}'),
	('public', 'email_relevance_review_samples', 'project_id', 'leave_behind', 'Email relevance review history.', '{}'),
	('public', 'email_relevance_scan_projects', 'project_id', 'leave_behind', 'Email relevance scan scope history.', '{}'),
	('public', 'email_relevance_adjudications', 'corrected_project_id', 'leave_behind', 'Email relevance adjudication history.', '{}'),
	('public', 'chat_capture_checkpoints', 'project_id', 'leave_behind', 'Thinking-capture history; it may point at the demoted START HERE / thinking log, which keep their ids.', '{}'),
	('public', 'chat_message_attachments', 'project_id', 'leave_behind', 'Attachment rows keep the project they were uploaded under; their chat may be repointed.', '{}'),
	('public', 'chat_turn_runs', 'project_id', 'leave_behind', 'Chat turn telemetry.', '{}'),
	('public', 'chat_turn_specialist_snapshots', 'project_id', 'leave_behind', 'Chat turn telemetry.', '{}'),
	('public', 'chat_turn_workflow_runs', 'project_id', 'leave_behind', 'Chat workflow telemetry.', '{}'),
	('public', 'agentic_chat_context_snapshots', 'project_id', 'leave_behind', 'Prompt cache keyed to the source context; never reused for the destination.', '{}'),
	('public', 'agentic_chat_prepared_prompts', 'project_id', 'leave_behind', 'Prompt cache keyed to the source context; never reused for the destination.', '{}'),
	('public', 'agentic_chat_specialist_recommendations', 'project_id', 'leave_behind', 'Specialist recommendation history.', '{}'),
	('public', 'agent_chat_media_events', 'project_id', 'leave_behind', 'Chat media telemetry.', '{}'),
	('public', 'ontology_project_briefs', 'project_id', 'leave_behind', 'Past project briefs are history; the destination''s next brief covers the moved work.', '{}'),
	('public', 'ontology_brief_entities', 'project_id', 'leave_behind', 'Past brief contents are history.', '{}'),
	('public', 'project_daily_briefs', 'project_id', 'leave_behind', 'Legacy daily brief history.', '{}'),
	('public', 'project_audits', 'project_id', 'leave_behind', 'Project Review audit history.', '{}'),
	('public', 'project_audit_trigger_evaluations', 'project_id', 'leave_behind', 'Project Review trigger history.', '{}'),
	('public', 'project_loop_runs', 'project_id', 'leave_behind', 'Project loop run history.', '{}'),
	('public', 'project_notification_batches', 'project_id', 'leave_behind', 'Notification batch history.', '{}'),
	('public', 'project_suggestions', 'project_id', 'leave_behind', 'Suggestions about the source; stale after the fold.', '{}'),
	('public', 'calendar_project_suggestions', 'created_project_id', 'leave_behind', 'Calendar suggestion history (which project a suggestion created).', '{}'),
	('public', 'project_drafts', 'finalized_project_id', 'leave_behind', 'Draft history (which project a draft became).', '{}'),
	('public', 'users', 'onboarding_project_id', 'leave_behind', 'Onboarding history; route forwarding sends old links to the destination.', '{}'),
	('public', 'error_logs', 'project_id', 'leave_behind', 'Error telemetry.', '{}'),
	('public', 'llm_usage_logs', 'project_id', 'leave_behind', 'Model usage telemetry and billing history.', '{}'),
	('public', 'sms_messages', 'project_id', 'leave_behind', 'SMS history.', '{}'),
	-- Legacy tables keyed to the retired projects table, not onto_projects.
	('public', 'tasks', 'project_id', 'leave_behind', 'Legacy table keyed to the retired projects table, not onto_projects.', '{}'),
	('public', 'phases', 'project_id', 'leave_behind', 'Legacy table keyed to the retired projects table, not onto_projects.', '{}'),
	('public', 'time_blocks', 'project_id', 'leave_behind', 'Legacy table keyed to the retired projects table, not onto_projects.', '{}'),
	('public', 'projects_history', 'project_id', 'leave_behind', 'Legacy table keyed to the retired projects table, not onto_projects.', '{}'),
	('public', 'project_brief_templates', 'project_id', 'leave_behind', 'Legacy table keyed to the retired projects table, not onto_projects.', '{}'),
	('public', 'project_questions', 'project_id', 'leave_behind', 'Legacy table keyed to the retired projects table, not onto_projects.', '{}'),
	('public', 'project_synthesis', 'project_id', 'leave_behind', 'Legacy table keyed to the retired projects table, not onto_projects.', '{}'),
	('public', 'recurring_task_migration_log', 'project_id', 'leave_behind', 'Legacy migration log keyed to the retired projects table.', '{}'),
	('public', 'draft_tasks', 'draft_project_id', 'leave_behind', 'Legacy draft table keyed to project drafts, not onto_projects.', '{}');

-- Agent permission requests (20260930185213) may land before or after this file.
-- Classify them when present; if they land later, the coverage check names them.
INSERT INTO private.project_fold_table_policy (table_schema, table_name, column_name, action, reason)
SELECT 'public', v.table_name, 'project_id', 'leave_behind', v.reason
FROM (VALUES
	('agent_permission_requests', 'Connector permission requests are grants in waiting; never copied.'),
	('agent_permission_grants', 'Connector permission grants are never copied (DJ, 2026-09-30).'),
	('agent_permission_work', 'Connector permission work queue for the source.')
) AS v(table_name, reason)
WHERE to_regclass('public.' || v.table_name) IS NOT NULL;

-- The move/repoint columns the fold below implements. Changing either side
-- without the other is reported by project_fold_policy_gaps().
CREATE FUNCTION private.project_fold_implemented()
RETURNS TABLE (table_schema text, table_name text, column_name text, action text)
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
	SELECT 'public', t, c, a FROM (VALUES
		('onto_documents', 'project_id', 'move'), ('onto_tasks', 'project_id', 'move'),
		('onto_goals', 'project_id', 'move'), ('onto_plans', 'project_id', 'move'),
		('onto_milestones', 'project_id', 'move'), ('onto_risks', 'project_id', 'move'),
		('onto_requirements', 'project_id', 'move'), ('onto_metrics', 'project_id', 'move'),
		('onto_insights', 'project_id', 'move'), ('onto_signals', 'project_id', 'move'),
		('onto_sources', 'project_id', 'move'), ('onto_assets', 'project_id', 'move'),
		('onto_asset_links', 'project_id', 'move'), ('onto_edges', 'project_id', 'move'),
		('onto_comments', 'project_id', 'move'), ('onto_comment_read_states', 'project_id', 'move'),
		('onto_embeddings', 'project_id', 'move'), ('onto_public_pages', 'project_id', 'move'),
		('onto_public_page_review_attempts', 'project_id', 'move'),
		('onto_public_page_slug_history', 'project_id', 'move'),
		('onto_task_assignees', 'project_id', 'move'),
		('chat_sessions', 'entity_id', 'repoint'), ('chat_sessions_projects', 'project_id', 'repoint'),
		('user_contact_links', 'project_id', 'repoint')
	) AS v(t, c, a);
$$;

-- Every column that points at a project: named project_id / *_project_id /
-- *project_ids in public or private, or a single-column foreign key to
-- onto_projects anywhere. Partitions inherit their parent's row.
CREATE FUNCTION private.project_fold_policy_gaps()
RETURNS TABLE (problem text, table_schema text, table_name text, column_name text)
LANGUAGE sql STABLE SET search_path = '' AS $$
	WITH discovered AS (
		SELECT n.nspname::text AS s, c.relname::text AS t, a.attname::text AS col
		FROM pg_catalog.pg_attribute a
		JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
		JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
		WHERE c.relkind IN ('r', 'p') AND NOT c.relispartition
			AND n.nspname IN ('public', 'private') AND a.attnum > 0 AND NOT a.attisdropped
			AND (a.attname = 'project_id' OR a.attname LIKE '%\_project\_id' OR a.attname LIKE '%project\_ids')
		UNION
		SELECT n.nspname::text, c.relname::text, a.attname::text
		FROM pg_catalog.pg_constraint k
		JOIN pg_catalog.pg_class c ON c.oid = k.conrelid
		JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
		JOIN pg_catalog.pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
		WHERE k.contype = 'f' AND k.confrelid = 'public.onto_projects'::regclass
			AND cardinality(k.conkey) = 1 AND NOT c.relispartition
	),
	policy AS (SELECT p.table_schema, p.table_name, p.column_name, p.action FROM private.project_fold_table_policy p)
	SELECT 'unclassified', d.s, d.t, d.col FROM discovered d
	WHERE NOT EXISTS (SELECT 1 FROM policy p WHERE p.table_schema = d.s AND p.table_name = d.t AND p.column_name = d.col)
	UNION ALL
	SELECT 'policy_names_missing_column', p.table_schema, p.table_name, p.column_name FROM policy p
	WHERE NOT EXISTS (
		SELECT 1 FROM pg_catalog.pg_attribute a
		JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
		JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = p.table_schema AND c.relname = p.table_name AND c.relkind IN ('r', 'p')
			AND a.attname = p.column_name AND a.attnum > 0 AND NOT a.attisdropped)
	UNION ALL
	SELECT 'classified_' || p.action || '_but_not_implemented', p.table_schema, p.table_name, p.column_name FROM policy p
	WHERE p.action IN ('move', 'repoint') AND NOT EXISTS (
		SELECT 1 FROM private.project_fold_implemented() i
		WHERE i.table_schema = p.table_schema AND i.table_name = p.table_name AND i.column_name = p.column_name AND i.action = p.action)
	UNION ALL
	SELECT 'implemented_' || i.action || '_but_classified_otherwise', i.table_schema, i.table_name, i.column_name
	FROM private.project_fold_implemented() i
	WHERE NOT EXISTS (SELECT 1 FROM policy p WHERE p.table_schema = i.table_schema AND p.table_name = i.table_name
		AND p.column_name = i.column_name AND p.action = i.action);
$$;

-- ---------------------------------------------------------------------------
-- 2. Manifest (journal for unfold). Service only.

CREATE TABLE public.onto_project_fold_manifests (
	id uuid PRIMARY KEY,
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	source_project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	destination_project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	request_hash text NOT NULL,
	-- The "From <source>" folder (no foreign key: a second project/document
	-- relationship would make PostgREST embeds ambiguous, see 20260930150000).
	folder_document_id uuid,
	source_state jsonb NOT NULL,
	manifest jsonb NOT NULL,
	receipt jsonb NOT NULL,
	unfolded_at timestamptz,
	unfold_receipt jsonb,
	created_at timestamptz NOT NULL DEFAULT now(),
	CHECK (source_project_id <> destination_project_id)
);
CREATE INDEX onto_project_fold_manifests_source_idx ON public.onto_project_fold_manifests(source_project_id);
CREATE INDEX onto_project_fold_manifests_destination_idx ON public.onto_project_fold_manifests(destination_project_id);
CREATE INDEX onto_project_fold_manifests_user_idx ON public.onto_project_fold_manifests(user_id, created_at DESC);
CREATE INDEX onto_project_fold_manifests_created_idx ON public.onto_project_fold_manifests(created_at);
ALTER TABLE public.onto_project_fold_manifests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.onto_project_fold_manifests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.onto_project_fold_manifests TO service_role;

COMMENT ON TABLE public.onto_project_fold_manifests IS
	'Project fold journal: what moved where, with post-fold fingerprints, so unfold can move unedited items back. Service only. Deleted with either project, with the folding user, and after 30 days (cleanup_privacy_project_fold_manifests).';

-- ---------------------------------------------------------------------------
-- 3. Helpers.

-- Node tables: rows that are things (not links or annotations). Unfold decides
-- per node; everything else follows its node. 'note' is a document alias used
-- by comments.
CREATE FUNCTION private.project_fold_node_kinds()
RETURNS TABLE (kind text, table_name text)
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
	VALUES ('document', 'onto_documents'), ('note', 'onto_documents'), ('task', 'onto_tasks'),
		('goal', 'onto_goals'), ('plan', 'onto_plans'), ('milestone', 'onto_milestones'),
		('risk', 'onto_risks'), ('requirement', 'onto_requirements'), ('metric', 'onto_metrics'),
		('insight', 'onto_insights'), ('signal', 'onto_signals'), ('source', 'onto_sources'),
		('asset', 'onto_assets'), ('image', 'onto_assets');
$$;

CREATE FUNCTION private.project_fold_ignore(p_table text) RETURNS text[]
LANGUAGE sql STABLE SET search_path = '' AS $$
	SELECT ARRAY['updated_at', 'search_vector', 'content_hash', 'outline', 'children', 'embedding', 'project_id']
		|| coalesce((SELECT p.machine_columns || ARRAY[p.column_name] FROM private.project_fold_table_policy p
			WHERE p.table_schema = 'public' AND p.table_name = p_table AND p.action IN ('move', 'repoint', 'rebuild')
			ORDER BY p.action LIMIT 1), '{}');
$$;

-- {id: fingerprint} for the given rows. START HERE managed regions are
-- deterministic projections of project state, so they are left out.
CREATE FUNCTION private.project_fold_fps(p_table text, p_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE v jsonb;
BEGIN
	IF coalesce(cardinality(p_ids), 0) = 0 THEN RETURN '{}'::jsonb; END IF;
	IF p_table = 'onto_documents' THEN
		SELECT coalesce(jsonb_object_agg(d.id, md5(((to_jsonb(d) - private.project_fold_ignore('onto_documents') - 'content')::text)
			|| md5(coalesce(CASE WHEN d.type_key = 'document.context.project'
				THEN public.strip_start_here_managed_regions(d.content) ELSE d.content END, '')))), '{}'::jsonb)
		INTO v FROM public.onto_documents d WHERE d.id = ANY(p_ids);
		RETURN v;
	END IF;
	EXECUTE format('SELECT coalesce(jsonb_object_agg(t.id, md5((to_jsonb(t) - $2)::text)), ''{}''::jsonb) FROM public.%I t WHERE t.id = ANY($1)', p_table)
		INTO v USING p_ids, private.project_fold_ignore(p_table);
	RETURN v;
END $$;

-- Order-stable digest of a table's rows in one project (for the preview token).
CREATE FUNCTION private.project_fold_digest(p_table text, p_project uuid) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE v text;
BEGIN
	IF p_table = 'onto_documents' THEN
		SELECT md5(coalesce(string_agg(f.value, '' ORDER BY f.key), ''))
		INTO v FROM jsonb_each_text(private.project_fold_fps('onto_documents',
			ARRAY(SELECT d.id FROM public.onto_documents d WHERE d.project_id = p_project))) f;
		RETURN v;
	END IF;
	EXECUTE format('SELECT md5(coalesce(string_agg(md5((to_jsonb(t) - $2)::text), '''' ORDER BY t.id), '''')) FROM public.%I t WHERE t.project_id = $1', p_table)
		INTO v USING p_project, private.project_fold_ignore(p_table);
	RETURN v;
END $$;

-- Keep tree nodes whose id is in p_keep (with their display metadata); lift the
-- children of dropped nodes into the dropped node's place.
CREATE FUNCTION private.project_fold_prune(p_nodes jsonb, p_keep uuid[]) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE n jsonb; kids jsonb; result jsonb := '[]'; nid uuid;
BEGIN
	FOR n IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_nodes) = 'array' THEN p_nodes ELSE '[]'::jsonb END) LOOP
		IF jsonb_typeof(n) IS DISTINCT FROM 'object' THEN CONTINUE; END IF;
		kids := private.project_fold_prune(n->'children', p_keep);
		nid := CASE WHEN (n->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (n->>'id')::uuid END;
		IF nid = ANY(p_keep) THEN
			result := result || jsonb_build_array((n - 'children') || jsonb_build_object('children', kids));
		ELSE
			result := result || kids;
		END IF;
	END LOOP;
	RETURN result;
END $$;

-- p_keep, filed as a tree: the stored tree pruned to p_keep (duplicates dropped,
-- first occurrence wins), then any p_keep document missing from it, oldest first.
CREATE FUNCTION private.project_fold_file_tree(p_root jsonb, p_keep uuid[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE tree jsonb; listed uuid[];
BEGIN
	tree := private.project_fold_prune(p_root, p_keep);
	IF (SELECT count(*) <> count(DISTINCT id) FROM private.organize_nodes(tree)) THEN
		-- A corrupt tree (a document listed twice): file everything flat, in the
		-- order of first appearance, rather than refuse.
		SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'children', '[]'::jsonb) ORDER BY x.first_seen), '[]')
		INTO tree FROM (SELECT n.id, min(n.ord) AS first_seen
			FROM (SELECT o.id, row_number() OVER () AS ord FROM private.organize_nodes(tree) o) n GROUP BY n.id) x;
	END IF;
	listed := ARRAY(SELECT id FROM private.organize_nodes(tree));
	RETURN tree || coalesce((
		SELECT jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'children', '[]'::jsonb) ORDER BY d.created_at, d.id)
		FROM public.onto_documents d WHERE d.id = ANY(p_keep) AND NOT (d.id = ANY(listed))), '[]'::jsonb);
END $$;

-- {id: kind} of every node row in a project.
CREATE FUNCTION private.project_fold_node_ids(p_project uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
	SELECT coalesce(jsonb_object_agg(x.id, x.kind), '{}'::jsonb) FROM (
		SELECT id, 'document' AS kind FROM public.onto_documents WHERE project_id = p_project
		UNION ALL SELECT id, 'task' FROM public.onto_tasks WHERE project_id = p_project
		UNION ALL SELECT id, 'goal' FROM public.onto_goals WHERE project_id = p_project
		UNION ALL SELECT id, 'plan' FROM public.onto_plans WHERE project_id = p_project
		UNION ALL SELECT id, 'milestone' FROM public.onto_milestones WHERE project_id = p_project
		UNION ALL SELECT id, 'risk' FROM public.onto_risks WHERE project_id = p_project
		UNION ALL SELECT id, 'requirement' FROM public.onto_requirements WHERE project_id = p_project
		UNION ALL SELECT id, 'metric' FROM public.onto_metrics WHERE project_id = p_project
		UNION ALL SELECT id, 'insight' FROM public.onto_insights WHERE project_id = p_project
		UNION ALL SELECT id, 'signal' FROM public.onto_signals WHERE project_id = p_project
		UNION ALL SELECT id, 'source' FROM public.onto_sources WHERE project_id = p_project
		UNION ALL SELECT id, 'asset' FROM public.onto_assets WHERE project_id = p_project
	) x;
$$;

-- A link endpoint can move when it is not a node, or is a node of the set.
-- (Production has a few legacy links whose task lives in another project; they
-- stay with the archived source instead of failing the dependent guard.)
CREATE FUNCTION private.project_fold_endpoint_ok(p_nodes jsonb, p_kind text, p_id uuid) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
	SELECT p_kind NOT IN (SELECT k.kind FROM private.project_fold_node_kinds() k) OR p_nodes ? p_id::text;
$$;

-- Change project_id for documents or tasks in chunks, presenting each chunk to
-- private.organize_entity_guard through buildos.organize_refs.
CREATE FUNCTION private.project_fold_relocate_guarded(p_table text, p_kind text, p_ids uuid[], p_to uuid) RETURNS integer
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE previous text := current_setting('buildos.organize_refs', true); chunk uuid[]; i integer := 1; n integer := 0; v_count integer;
BEGIN
	IF p_table NOT IN ('onto_documents', 'onto_tasks') THEN RAISE EXCEPTION 'project_fold_invalid_arguments' USING ERRCODE = '22023'; END IF;
	WHILE i <= coalesce(cardinality(p_ids), 0) LOOP
		chunk := p_ids[i:i + 199];
		PERFORM set_config('buildos.organize_refs',
			(SELECT jsonb_agg(jsonb_build_object('kind', p_kind, 'id', x))::text FROM unnest(chunk) x), true);
		EXECUTE format('UPDATE public.%I SET project_id = $1 WHERE id = ANY($2) AND project_id <> $1', p_table) USING p_to, chunk;
		GET DIAGNOSTICS v_count = ROW_COUNT;
		n := n + v_count; i := i + 200;
	END LOOP;
	PERFORM set_config('buildos.organize_refs', coalesce(previous, ''), true);
	RETURN n;
END $$;

-- Move the comments on the given (entity_type, entity_id) targets, in chunks the
-- comment trigger accepts (public.onto_comments_before_update).
CREATE FUNCTION private.project_fold_relocate_comments(p_from uuid, p_to uuid, p_targets jsonb) RETURNS integer
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE previous text := current_setting('buildos.organize_refs', true); chunk jsonb; i integer := 0; n integer := 0; v_count integer;
	total integer := jsonb_array_length(coalesce(p_targets, '[]'::jsonb));
BEGIN
	WHILE i < total LOOP
		SELECT jsonb_agg(t.value) INTO chunk FROM jsonb_array_elements(p_targets) WITH ORDINALITY t
		WHERE t.ordinality > i AND t.ordinality <= i + 200;
		PERFORM set_config('buildos.organize_refs', chunk::text, true);
		UPDATE public.onto_comments cm SET project_id = p_to
		WHERE cm.project_id = p_from AND EXISTS (SELECT 1 FROM jsonb_array_elements(chunk) r
			WHERE r->>'kind' = cm.entity_type AND (r->>'id')::uuid = cm.entity_id);
		GET DIAGNOSTICS v_count = ROW_COUNT;
		n := n + v_count; i := i + 200;
	END LOOP;
	PERFORM set_config('buildos.organize_refs', coalesce(previous, ''), true);
	RETURN n;
END $$;

-- Change assets' project_id (presented to enforce_onto_asset_storage_location
-- through buildos.organize_assets), then their links.
CREATE FUNCTION private.project_fold_relocate_assets(p_ids uuid[], p_to uuid, p_nodes jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE previous text := current_setting('buildos.organize_assets', true); a integer; l integer;
BEGIN
	IF coalesce(cardinality(p_ids), 0) = 0 THEN RETURN jsonb_build_object('assets', 0, 'links', 0); END IF;
	PERFORM set_config('buildos.organize_assets', to_jsonb(p_ids)::text, true);
	UPDATE public.onto_assets SET project_id = p_to WHERE id = ANY(p_ids) AND project_id <> p_to;
	GET DIAGNOSTICS a = ROW_COUNT;
	UPDATE public.onto_asset_links SET project_id = p_to WHERE asset_id = ANY(p_ids) AND project_id <> p_to
		AND private.project_fold_endpoint_ok(p_nodes, entity_kind, entity_id);
	GET DIAGNOSTICS l = ROW_COUNT;
	PERFORM set_config('buildos.organize_assets', coalesce(previous, ''), true);
	RETURN jsonb_build_object('assets', a, 'links', l);
END $$;

-- Admin on both projects, re-checked after the locks. p_merged: the source is
-- the archived result of a fold into p_dest (unfold, replays).
CREATE FUNCTION private.project_fold_authorize(p_user uuid, p_source uuid, p_dest uuid, p_lock boolean, p_merged boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_actor uuid; v_ids uuid[];
BEGIN
	IF p_user IS NULL OR p_source IS NULL OR p_dest IS NULL THEN
		RAISE EXCEPTION 'project_fold_invalid_arguments' USING ERRCODE = '22023';
	END IF;
	IF p_source = p_dest THEN RAISE EXCEPTION 'project_fold_same_project' USING ERRCODE = '22023'; END IF;
	SELECT id INTO v_actor FROM public.onto_actors WHERE user_id = p_user LIMIT 1;
	IF v_actor IS NULL
		OR NOT public.actor_has_project_member_access(v_actor, p_source, 'admin')
		OR NOT public.actor_has_project_member_access(v_actor, p_dest, 'admin') THEN
		RAISE EXCEPTION 'project_fold_access_denied' USING ERRCODE = '42501';
	END IF;
	v_ids := ARRAY[least(p_source, p_dest), greatest(p_source, p_dest)];
	IF p_lock THEN
		IF public.onto_lock_projects_for_write(v_ids) <> 2 THEN
			RAISE EXCEPTION 'project_fold_project_missing' USING ERRCODE = 'P0002';
		END IF;
		-- Access can change while waiting for the locks.
		IF NOT public.actor_has_project_member_access(v_actor, p_source, 'admin')
			OR NOT public.actor_has_project_member_access(v_actor, p_dest, 'admin') THEN
			RAISE EXCEPTION 'project_fold_access_denied' USING ERRCODE = '42501';
		END IF;
	ELSIF (SELECT count(*) FROM public.onto_projects WHERE id = ANY(v_ids) AND deleted_at IS NULL) <> 2 THEN
		RAISE EXCEPTION 'project_fold_project_missing' USING ERRCODE = 'P0002';
	END IF;
	IF EXISTS (SELECT 1 FROM public.onto_projects WHERE id = p_dest
			AND (archived_at IS NOT NULL OR merged_into_project_id IS NOT NULL)) THEN
		RAISE EXCEPTION 'project_fold_destination_archived' USING ERRCODE = 'P0001';
	END IF;
	IF p_merged THEN
		IF NOT EXISTS (SELECT 1 FROM public.onto_projects WHERE id = p_source AND merged_into_project_id = p_dest) THEN
			RAISE EXCEPTION 'project_unfold_source_changed' USING ERRCODE = 'P0001';
		END IF;
	ELSIF EXISTS (SELECT 1 FROM public.onto_projects WHERE id = p_source AND merged_into_project_id IS NOT NULL) THEN
		RAISE EXCEPTION 'project_fold_source_already_merged' USING ERRCODE = 'P0001';
	END IF;
	RETURN v_actor;
END $$;

-- What the token promises: the source's records and their dependents, both
-- projects' status, and the source tree. Embeddings, read states, repointed
-- chats and everything left behind are not part of it (machine churn).
CREATE FUNCTION private.project_fold_source_digest(p_source uuid, p_dest uuid) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE parts text[] := '{}'; tbl text;
BEGIN
	parts := parts || (SELECT md5(jsonb_build_array(p.id, p.name, p.archived_at, p.deleted_at, p.parent_project_id,
			p.shared_folder_document_id, p.merged_into_project_id,
			private.organize_tree(CASE WHEN jsonb_typeof(p.doc_structure->'root') = 'array' THEN p.doc_structure->'root' ELSE '[]'::jsonb END))::text)
		FROM public.onto_projects p WHERE p.id = p_source);
	parts := parts || (SELECT md5(jsonb_build_array(p.id, p.archived_at, p.deleted_at, p.merged_into_project_id)::text)
		FROM public.onto_projects p WHERE p.id = p_dest);
	FOREACH tbl IN ARRAY ARRAY['onto_documents', 'onto_tasks', 'onto_goals', 'onto_plans', 'onto_milestones', 'onto_risks',
		'onto_requirements', 'onto_metrics', 'onto_insights', 'onto_signals', 'onto_sources', 'onto_assets', 'onto_asset_links',
		'onto_edges', 'onto_comments', 'onto_public_pages', 'onto_public_page_review_attempts', 'onto_public_page_slug_history',
		'onto_document_proposals', 'onto_task_assignees', 'onto_events'] LOOP
		parts := parts || private.project_fold_digest(tbl, p_source);
	END LOOP;
	RETURN md5(array_to_string(parts, '|', '-'));
END $$;

-- ---------------------------------------------------------------------------
-- 4. Prepare: authorize, measure, decide blockers, compute the token.

CREATE FUNCTION private.project_fold_prepare(p_user uuid, p_source uuid, p_dest uuid, p_additions uuid[], p_lock boolean)
RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
	v_actor uuid;
	src public.onto_projects;
	dst public.onto_projects;
	v_additions uuid[] := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_additions, '{}'::uuid[])) x WHERE x IS NOT NULL ORDER BY x);
	v_rollout record;
	blockers text[] := '{}';
	members jsonb;
	missing uuid[];
	counts jsonb := '{}';
	tbl text;
	n bigint;
	v_entities bigint;
	v_docs bigint;
	v_dependents bigint;
	v_widest integer;
	v_embeddings bigint;
	v_dated bigint;
	v_task_events bigint;
	v_other_events bigint;
	v_assets bigint;
	demoted jsonb;
	impact jsonb;
	info jsonb := '{}';
	left_counts jsonb := '{}';
	pol record;
	v_task_ids uuid[];
	v_task_event_ids uuid[];
	v_nodes_map jsonb;
BEGIN
	v_actor := private.project_fold_authorize(p_user, p_source, p_dest, p_lock);
	IF p_lock THEN
		-- The Organize mover's entity order: documents, then tasks, by id.
		PERFORM 1 FROM public.onto_documents WHERE project_id = p_source ORDER BY id FOR UPDATE;
		PERFORM 1 FROM public.onto_tasks WHERE project_id = p_source ORDER BY id FOR UPDATE;
	END IF;
	SELECT * INTO src FROM public.onto_projects WHERE id = p_source;
	SELECT * INTO dst FROM public.onto_projects WHERE id = p_dest;
	SELECT coalesce(bool_or(calendar_sync_ready), false) AS calendar, coalesce(bool_or(asset_access_ready), false) AS assets
		INTO v_rollout FROM private.organize_rollout WHERE singleton;

	IF EXISTS (SELECT 1 FROM private.project_fold_policy_gaps()) THEN
		blockers := array_append(blockers, 'table_policy_incomplete');
	END IF;
	-- v1: one level of nesting. Folding a hub would strand its sub-projects, and
	-- folding a project into its own child needs the hub folded. The destination
	-- keeps its place in the hierarchy.
	IF EXISTS (SELECT 1 FROM public.onto_projects c WHERE c.parent_project_id = p_source AND c.deleted_at IS NULL) THEN
		blockers := array_append(blockers, 'source_has_sub_projects');
	END IF;

	-- Members: everyone who can open the source must be able to open the
	-- destination, or be named for addition (added with their source role).
	WITH source_members AS (
		SELECT m.actor_id, m.role_key, m.access FROM public.onto_project_members m
		WHERE m.project_id = p_source AND m.removed_at IS NULL
		UNION ALL
		SELECT src.created_by, 'owner', 'admin'
		WHERE src.created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.onto_project_members m
			WHERE m.project_id = p_source AND m.actor_id = src.created_by AND m.removed_at IS NULL)
	), rated AS (
		SELECT s.*, a.name,
			CASE WHEN public.actor_has_project_member_access(s.actor_id, p_dest, 'admin') THEN 'admin'
				WHEN public.actor_has_project_member_access(s.actor_id, p_dest, 'write') THEN 'write'
				WHEN public.actor_has_project_member_access(s.actor_id, p_dest, 'read') THEN 'read' END AS destination_access
		FROM source_members s LEFT JOIN public.onto_actors a ON a.id = s.actor_id
	)
	SELECT coalesce(jsonb_agg(jsonb_build_object('actor_id', r.actor_id, 'name', r.name, 'role_key', r.role_key,
			'access', r.access, 'destination_access', r.destination_access,
			'named_for_addition', r.actor_id = ANY(v_additions)) ORDER BY r.actor_id), '[]'::jsonb),
		coalesce(array_agg(r.actor_id) FILTER (WHERE r.destination_access IS NULL), '{}')
	INTO members, missing FROM rated r;
	IF EXISTS (SELECT 1 FROM unnest(v_additions) x WHERE NOT (x = ANY(missing))) THEN
		RAISE EXCEPTION 'project_fold_invalid_member_addition' USING ERRCODE = '22023',
			DETAIL = 'Only source members the destination lacks can be named.';
	END IF;
	IF EXISTS (SELECT 1 FROM unnest(missing) x WHERE NOT (x = ANY(v_additions))) THEN
		blockers := array_append(blockers, 'members_missing');
	END IF;

	-- Counts of what moves (part of the token; no machine-churned tables).
	FOREACH tbl IN ARRAY ARRAY['onto_documents', 'onto_tasks', 'onto_goals', 'onto_plans', 'onto_milestones', 'onto_risks',
		'onto_requirements', 'onto_metrics', 'onto_insights', 'onto_signals', 'onto_sources', 'onto_assets', 'onto_asset_links',
		'onto_edges', 'onto_public_pages', 'onto_public_page_review_attempts', 'onto_public_page_slug_history', 'onto_task_assignees'] LOOP
		EXECUTE format('SELECT count(*) FROM public.%I WHERE project_id = $1', tbl) INTO n USING p_source;
		counts := counts || jsonb_build_object(tbl, n);
	END LOOP;
	v_nodes_map := private.project_fold_node_ids(p_source);
	v_task_ids := ARRAY(SELECT id FROM public.onto_tasks WHERE project_id = p_source);
	v_task_event_ids := ARRAY(SELECT e.id FROM public.onto_events e WHERE e.project_id = p_source AND e.deleted_at IS NULL
		AND ((e.owner_entity_type = 'task' AND e.owner_entity_id = ANY(v_task_ids)) OR e.props->>'task_id' = ANY(v_task_ids::text[])));
	counts := counts || jsonb_build_object(
		'onto_edges', (SELECT count(*) FROM public.onto_edges e WHERE e.project_id = p_source
			AND private.project_fold_endpoint_ok(v_nodes_map, e.src_kind, e.src_id)
			AND private.project_fold_endpoint_ok(v_nodes_map, e.dst_kind, e.dst_id)
			AND NOT (e.src_kind = 'event' AND e.src_id = ANY(v_task_event_ids))
			AND NOT (e.dst_kind = 'event' AND e.dst_id = ANY(v_task_event_ids))
			AND NOT (e.src_kind = 'project' AND e.src_id = p_source AND e.dst_kind = 'document' AND e.rel = 'has_context_document')),
		'task_event_links_dropped', (SELECT count(*) FROM public.onto_edges e WHERE e.project_id = p_source
			AND ((e.src_kind = 'event' AND e.src_id = ANY(v_task_event_ids)) OR (e.dst_kind = 'event' AND e.dst_id = ANY(v_task_event_ids)))),
		'stale_links_left_with_source', (SELECT count(*) FROM public.onto_edges e WHERE e.project_id = p_source
			AND NOT (private.project_fold_endpoint_ok(v_nodes_map, e.src_kind, e.src_id)
				AND private.project_fold_endpoint_ok(v_nodes_map, e.dst_kind, e.dst_id))),
		'onto_comments', (SELECT count(*) FROM public.onto_comments WHERE project_id = p_source AND entity_type NOT IN ('project', 'event')),
		'comments_left_with_source', (SELECT count(*) FROM public.onto_comments WHERE project_id = p_source AND entity_type IN ('project', 'event')),
		'finished_proposals_left_with_source', (SELECT count(*) FROM public.onto_document_proposals WHERE project_id = p_source AND status <> 'pending'),
		'pending_proposals', (SELECT count(*) FROM public.onto_document_proposals WHERE project_id = p_source AND status = 'pending'),
		'documents_filed', (SELECT count(*) FROM public.onto_documents WHERE project_id = p_source
			AND deleted_at IS NULL AND archived_at IS NULL AND state_key::text <> 'archived'),
		'project_edges_repointed', (SELECT count(*) FROM public.onto_edges WHERE project_id = p_source
			AND ((src_kind = 'project' AND src_id = p_source) OR (dst_kind = 'project' AND dst_id = p_source))
			AND NOT (src_kind = 'project' AND dst_kind = 'document' AND rel = 'has_context_document')),
		'context_document_links_dropped', (SELECT count(*) FROM public.onto_edges WHERE project_id = p_source
			AND src_kind = 'project' AND src_id = p_source AND dst_kind = 'document' AND rel = 'has_context_document'),
		'assignees_removed', (SELECT count(*) FROM public.onto_task_assignees a WHERE a.project_id = p_source
			AND NOT public.actor_has_project_member_access(a.assignee_actor_id, p_dest, 'read')
			AND NOT (a.assignee_actor_id = ANY(v_additions)))
	);

	SELECT count(*) INTO v_dated FROM public.onto_tasks t WHERE t.project_id = p_source AND t.deleted_at IS NULL
		AND t.archived_at IS NULL AND (t.start_at IS NOT NULL OR t.due_at IS NOT NULL);
	SELECT count(*) FILTER (WHERE x.task_event), count(*) FILTER (WHERE NOT x.task_event)
	INTO v_task_events, v_other_events
	FROM public.onto_events e
	CROSS JOIN LATERAL (SELECT coalesce((e.owner_entity_type = 'task' AND e.owner_entity_id = ANY(v_task_ids))
		OR e.props->>'task_id' = ANY(v_task_ids::text[]), false) AS task_event) x
	WHERE e.project_id = p_source AND e.deleted_at IS NULL;
	counts := counts || jsonb_build_object('dated_tasks', v_dated, 'task_events_rebuilt', v_task_events, 'other_live_events', v_other_events);
	v_assets := (counts->>'onto_assets')::bigint;

	IF (counts->>'pending_proposals')::int > 0 THEN blockers := array_append(blockers, 'pending_document_proposal'); END IF;
	IF EXISTS (SELECT 1 FROM public.onto_tasks WHERE project_id = p_source AND deleted_at IS NULL AND (
		nullif(btrim(props->>'series_id'), '') IS NOT NULL OR coalesce(props->'series', 'null') <> 'null'
		OR coalesce(props->'recurrence', 'null') <> 'null' OR nullif(btrim(props->>'recurrence_pattern'), '') IS NOT NULL
		OR nullif(btrim(props->>'recurrence_rrule'), '') IS NOT NULL OR props->>'task_type' = 'recurring')) THEN
		blockers := array_append(blockers, 'recurring_task_not_supported');
	END IF;
	IF EXISTS (SELECT 1 FROM public.onto_events WHERE project_id = p_source AND deleted_at IS NULL
		AND recurrence IS NOT NULL AND recurrence <> '{}' AND recurrence <> 'null') THEN
		blockers := array_append(blockers, 'recurring_event_not_supported');
	END IF;
	IF v_other_events > 0 THEN blockers := array_append(blockers, 'standalone_events_not_supported'); END IF;
	IF (v_dated > 0 OR v_task_events > 0) AND NOT v_rollout.calendar THEN blockers := array_append(blockers, 'calendar_sync_not_deployed'); END IF;
	IF v_assets > 0 AND NOT v_rollout.assets THEN blockers := array_append(blockers, 'asset_access_not_deployed'); END IF;

	-- Limits: a fold is one transaction holding both projects; keep it short.
	-- PostgREST runs it under the authenticator's statement_timeout (8 s in production).
	-- DJ's largest real project (2026-10-01: 54 documents, ~250 entities, ~360 embeddings)
	-- folds and unfolds in ~0.3 s locally. At 2x these caps (2000 entities, 9490
	-- relationships, 4000 embeddings) fold took 4.8 s and unfold 5.4 s; every moved
	-- embedding re-enters the HNSW index (~0.8 ms each). These caps keep both near 2.5 s.
	v_entities := (SELECT sum(value::bigint) FROM jsonb_each_text(counts) WHERE key IN ('onto_documents', 'onto_tasks', 'onto_goals',
		'onto_plans', 'onto_milestones', 'onto_risks', 'onto_requirements', 'onto_metrics', 'onto_insights', 'onto_signals', 'onto_sources', 'onto_assets'));
	v_docs := (counts->>'onto_documents')::bigint;
	v_dependents := (SELECT sum(value::bigint) FROM jsonb_each_text(counts) WHERE key IN ('onto_edges', 'onto_comments',
		'onto_asset_links', 'onto_public_pages', 'onto_task_assignees'));
	IF v_entities > 1000 THEN blockers := array_append(blockers, 'too_many_entities'); END IF;
	IF v_docs > 300 THEN blockers := array_append(blockers, 'too_many_documents'); END IF;
	IF v_dependents > 5000 THEN blockers := array_append(blockers, 'too_many_relationships'); END IF;
	v_embeddings := (SELECT count(*) FROM public.onto_embeddings WHERE project_id = p_source);
	IF v_embeddings > 2000 THEN
		blockers := array_append(blockers, 'too_many_embeddings');
	END IF;
	-- The folder holds the source's top level. A document's children cache sits in a btree
	-- index (idx_onto_documents_has_children) that overflows at ~60 direct children with
	-- random ids, so block wide folders with a reason instead of failing on the index.
	-- Production max on 2026-10-01: 17 top-level documents, 11 children under any document.
	WITH filed AS (
		SELECT private.project_fold_file_tree(
			CASE WHEN jsonb_typeof(src.doc_structure->'root') = 'array' THEN src.doc_structure->'root' ELSE '[]'::jsonb END,
			ARRAY(SELECT d.id FROM public.onto_documents d WHERE d.project_id = p_source
				AND d.deleted_at IS NULL AND d.archived_at IS NULL AND d.state_key::text <> 'archived')) AS tree)
	SELECT greatest(jsonb_array_length(f.tree), coalesce((SELECT max(jsonb_array_length(n.node->'children'))
		FROM private.organize_nodes(f.tree) n WHERE jsonb_typeof(n.node->'children') = 'array'), 0))
	INTO v_widest FROM filed f;
	IF v_widest > 50 THEN blockers := array_append(blockers, 'too_many_documents_in_one_folder'); END IF;

	SELECT coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'type_key', d.type_key,
		'former_role', CASE WHEN d.id = src.shared_folder_document_id THEN 'shared_with_sub_projects'
			WHEN d.type_key = 'document.context.project' THEN 'start_here' ELSE 'thinking_log' END) ORDER BY d.id), '[]'::jsonb)
	INTO demoted FROM public.onto_documents d
	WHERE d.project_id = p_source AND (d.type_key IN ('document.context.project', 'document.context.thinking_log')
		OR d.id = src.shared_folder_document_id);

	impact := jsonb_build_object(
		'source', jsonb_build_object('id', src.id, 'name', src.name, 'archived', src.archived_at IS NOT NULL,
			'parent_project_id', src.parent_project_id),
		'destination', jsonb_build_object('id', dst.id, 'name', dst.name),
		'folder_title', left('From ' || coalesce(nullif(btrim(src.name), ''), 'combined project'), 200),
		'counts', counts,
		'demoted_documents', demoted,
		'members', members,
		'members_missing', to_jsonb(missing),
		'member_additions', to_jsonb(v_additions),
		'connector_grants_not_copied', jsonb_build_object(
			'project_permissions', (SELECT count(*) FROM public.external_agent_project_permissions
				WHERE project_id = p_source AND revoked_at IS NULL),
			'oauth_grants_naming_source', (SELECT count(*) FROM public.agent_oauth_grants
				WHERE jsonb_typeof(allowed_project_ids) = 'array' AND allowed_project_ids ? p_source::text)),
		'rebuild_after_commit', (SELECT coalesce(jsonb_agg(p.table_schema || '.' || p.table_name ORDER BY p.table_schema, p.table_name), '[]')
			FROM private.project_fold_table_policy p WHERE p.action = 'rebuild'),
		'limits', jsonb_build_object('entities', v_entities, 'max_entities', 1000, 'documents', v_docs, 'max_documents', 300,
			'relationships', v_dependents, 'max_relationships', 5000,
			'widest_folder', v_widest, 'max_widest_folder', 50),
		'blockers', to_jsonb(blockers)
	);

	-- Informational only (machine-churned, not promised by the token).
	FOR pol IN SELECT p.* FROM private.project_fold_table_policy p
		JOIN pg_catalog.pg_attribute a ON a.attname = p.column_name AND a.attnum > 0 AND NOT a.attisdropped
			AND a.attrelid = to_regclass(format('%I.%I', p.table_schema, p.table_name))
		WHERE p.action IN ('leave_behind', 'rebuild') AND a.atttypid = 'uuid'::regtype
			AND NOT (p.table_name = 'onto_projects') AND p.table_name <> 'onto_project_fold_manifests'
		ORDER BY p.table_schema, p.table_name, p.column_name LOOP
		EXECUTE format('SELECT count(*) FROM %I.%I WHERE %I = $1', pol.table_schema, pol.table_name, pol.column_name) INTO n USING p_source;
		IF n > 0 THEN
			left_counts := left_counts || jsonb_build_object(pol.table_name || CASE WHEN pol.column_name <> 'project_id' THEN '.' || pol.column_name ELSE '' END, n);
		END IF;
	END LOOP;
	info := jsonb_build_object(
		'embeddings_moved', (SELECT count(*) FROM public.onto_embeddings WHERE project_id = p_source AND entity_type NOT IN ('project', 'event')),
		'embeddings', v_embeddings, 'max_embeddings', 2000,
		'read_states_moved', (SELECT count(*) FROM public.onto_comment_read_states WHERE project_id = p_source AND entity_type NOT IN ('project', 'event')),
		'repointed', jsonb_build_object(
			'chat_sessions', (SELECT count(*) FROM public.chat_sessions WHERE context_type = 'project' AND entity_id = p_source),
			'chat_sessions_projects', (SELECT count(*) FROM public.chat_sessions_projects WHERE project_id = p_source),
			'user_contact_links', (SELECT count(*) FROM public.user_contact_links WHERE project_id = p_source)),
		'left_with_source', left_counts,
		'source_calendar', EXISTS (SELECT 1 FROM public.project_calendars WHERE project_id = p_source)
	);

	RETURN jsonb_build_object(
		'token', md5(concat_ws('|', 'fold-v1', p_user::text, p_source::text, p_dest::text, v_additions::text,
			private.project_fold_source_digest(p_source, p_dest), impact::text)),
		'impact', impact,
		'info', info,
		'actor_id', v_actor
	);
END $$;

-- ---------------------------------------------------------------------------
-- 5. Public RPCs: preview and apply (service role; the worker bridge passes the
--    signed-in user's id and SQL re-checks admin on both projects).

CREATE FUNCTION public.onto_project_fold_preview(
	p_user_id uuid,
	p_source_project_id uuid,
	p_destination_project_id uuid,
	p_member_additions uuid[] DEFAULT '{}'
) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE prepared jsonb;
BEGIN
	IF auth.role() IS DISTINCT FROM 'service_role' THEN
		RAISE EXCEPTION 'project_fold_service_only' USING ERRCODE = '42501';
	END IF;
	-- No locks: apply recomputes the token under its locks.
	prepared := private.project_fold_prepare(p_user_id, p_source_project_id, p_destination_project_id, p_member_additions, false);
	RETURN jsonb_build_object('confirmation_token', prepared->'token', 'impact', prepared->'impact', 'info', prepared->'info');
END $$;

CREATE FUNCTION public.onto_project_fold_apply(
	p_user_id uuid,
	p_source_project_id uuid,
	p_destination_project_id uuid,
	p_confirmation_token text,
	p_fold_id uuid,
	p_member_additions uuid[] DEFAULT '{}'
) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
	v_started timestamptz := clock_timestamp();
	v_now timestamptz := now();
	v_source uuid := p_source_project_id;
	v_dest uuid := p_destination_project_id;
	v_additions uuid[] := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_member_additions, '{}'::uuid[])) x WHERE x IS NOT NULL ORDER BY x);
	v_request_hash text;
	existing public.onto_project_fold_manifests;
	prepared jsonb;
	impact jsonb;
	v_actor uuid;
	src public.onto_projects;
	v_folder uuid := gen_random_uuid();
	v_folder_title text;
	v_doc_ids uuid[];
	v_task_ids uuid[];
	v_live_docs uuid[];
	v_asset_ids uuid[];
	ids uuid[];
	tbl text;
	moved jsonb := '{}';
	nodes jsonb := '{}';
	repointed jsonb := '{}';
	members_added jsonb := '[]';
	removed_assignees jsonb := '[]';
	dropped_edges jsonb := '[]';
	dropped_links jsonb := '[]';
	demoted jsonb := '[]';
	rebuilt_events jsonb := '[]';
	v_edge_ids uuid[];
	v_project_edge_ids uuid[];
	v_nodes_map jsonb;
	v_targets jsonb;
	v_tree jsonb;
	v_dest_root jsonb;
	v_jobs integer := 0;
	t uuid;
	n integer;
	receipt jsonb;
	manifest jsonb;
	source_state jsonb;
BEGIN
	IF auth.role() IS DISTINCT FROM 'service_role' THEN
		RAISE EXCEPTION 'project_fold_service_only' USING ERRCODE = '42501';
	END IF;
	IF p_fold_id IS NULL OR p_confirmation_token IS NULL OR v_source IS NULL OR v_dest IS NULL THEN
		RAISE EXCEPTION 'project_fold_invalid_arguments' USING ERRCODE = '22023';
	END IF;
	PERFORM set_config('lock_timeout', '5s', true);
	v_request_hash := md5(concat_ws('|', v_source::text, v_dest::text, p_confirmation_token, v_additions::text));
	-- The fold id serializes retries even when two requests arrive together.
	PERFORM pg_advisory_xact_lock(hashtextextended('project_fold:' || p_fold_id::text, 0));
	SELECT * INTO existing FROM public.onto_project_fold_manifests WHERE id = p_fold_id;
	IF FOUND THEN
		IF existing.user_id <> p_user_id OR existing.request_hash <> v_request_hash THEN
			RAISE EXCEPTION 'project_fold_idempotency_conflict' USING ERRCODE = 'P0001';
		END IF;
		PERFORM private.project_fold_authorize(p_user_id, existing.source_project_id, existing.destination_project_id, false,
			existing.unfolded_at IS NULL);
		RETURN existing.receipt || jsonb_build_object('replayed', true, 'unfolded_at', existing.unfolded_at);
	END IF;

	prepared := private.project_fold_prepare(p_user_id, v_source, v_dest, v_additions, true);
	IF prepared->>'token' IS DISTINCT FROM p_confirmation_token THEN
		RAISE EXCEPTION 'project_fold_stale_preview' USING ERRCODE = 'P0001';
	END IF;
	impact := prepared->'impact';
	IF jsonb_array_length(impact->'blockers') > 0 THEN
		RAISE EXCEPTION 'project_fold_blocked: %', impact->'blockers' USING ERRCODE = 'P0001';
	END IF;
	v_actor := (prepared->>'actor_id')::uuid;
	SELECT * INTO src FROM public.onto_projects WHERE id = v_source;
	v_folder_title := impact->>'folder_title';
	v_doc_ids := ARRAY(SELECT id FROM public.onto_documents WHERE project_id = v_source ORDER BY id);
	v_task_ids := ARRAY(SELECT id FROM public.onto_tasks WHERE project_id = v_source ORDER BY id);
	v_asset_ids := ARRAY(SELECT id FROM public.onto_assets WHERE project_id = v_source ORDER BY id);

	-- 1. Named members join the destination with their source role. An owner
	--    becomes an editor with the same (admin) access; the destination keeps
	--    its owner.
	WITH wanted AS (
		SELECT x AS actor_id,
			coalesce((SELECT CASE WHEN m.role_key = 'owner' THEN 'editor' ELSE m.role_key END FROM public.onto_project_members m
				WHERE m.project_id = v_source AND m.actor_id = x AND m.removed_at IS NULL), 'editor') AS role_key,
			coalesce((SELECT m.access FROM public.onto_project_members m
				WHERE m.project_id = v_source AND m.actor_id = x AND m.removed_at IS NULL), 'admin') AS access,
			(SELECT to_jsonb(m) FROM public.onto_project_members m WHERE m.project_id = v_dest AND m.actor_id = x) AS before
		FROM unnest(v_additions) x
	), upserted AS (
		INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access, added_by_actor_id)
		SELECT v_dest, w.actor_id, w.role_key, w.access, v_actor FROM wanted w
		ON CONFLICT (project_id, actor_id) DO UPDATE SET role_key = excluded.role_key, access = excluded.access,
			removed_at = NULL, removed_by_actor_id = NULL, added_by_actor_id = excluded.added_by_actor_id
		RETURNING id, actor_id, role_key, access
	)
	SELECT coalesce(jsonb_agg(jsonb_build_object('member_id', u.id, 'actor_id', u.actor_id, 'role_key', u.role_key,
		'access', u.access, 'previous_row', w.before) ORDER BY u.actor_id), '[]')
	INTO members_added FROM upserted u JOIN wanted w ON w.actor_id = u.actor_id;

	-- 2. Finished document proposals stay with the source (project_id is
	--    pinned inside the patch); pending ones blocked the fold.

	-- 3. Task events: soft-delete in the source so their calendar mappings
	--    survive until the sync job removes them (Organize's path); links to
	--    them are dropped. The job recreates events in the destination.
	WITH gone AS (
		UPDATE public.onto_events e SET deleted_at = v_now, sync_status = 'pending'
		WHERE e.project_id = v_source AND e.deleted_at IS NULL
			AND ((e.owner_entity_type = 'task' AND e.owner_entity_id = ANY(v_task_ids)) OR e.props->>'task_id' = ANY(v_task_ids::text[]))
		RETURNING e.id, e.project_id, CASE WHEN e.owner_entity_type = 'task' THEN e.owner_entity_id::text ELSE e.props->>'task_id' END AS task_id
	)
	SELECT coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'project_id', g.project_id, 'task_id', g.task_id) ORDER BY g.id), '[]')
	INTO rebuilt_events FROM gone g;
	WITH dropped AS (
		DELETE FROM public.onto_edges e WHERE e.project_id = v_source AND (
			(e.src_kind = 'event' AND e.src_id = ANY(SELECT (r->>'id')::uuid FROM jsonb_array_elements(rebuilt_events) r))
			OR (e.dst_kind = 'event' AND e.dst_id = ANY(SELECT (r->>'id')::uuid FROM jsonb_array_elements(rebuilt_events) r))
			OR (e.src_kind = 'project' AND e.src_id = v_source AND e.dst_kind = 'document' AND e.rel = 'has_context_document'))
		RETURNING e.*
	)
	SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.id), '[]') INTO dropped_edges FROM dropped d;

	-- 4. Assignees who cannot open the destination are removed (kept here).
	WITH removed AS (
		DELETE FROM public.onto_task_assignees a WHERE a.project_id = v_source
			AND NOT public.actor_has_project_member_access(a.assignee_actor_id, v_dest, 'read')
		RETURNING a.*
	)
	SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id), '[]') INTO removed_assignees FROM removed r;

	-- 5. Demote START HERE, the thinking log and a shared-folder role to plain
	--    documents (the destination keeps its own).
	SELECT coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'type_key', d.type_key, 'props', d.props,
		'former_role', CASE WHEN d.id = src.shared_folder_document_id THEN 'shared_with_sub_projects'
			WHEN d.type_key = 'document.context.project' THEN 'start_here' ELSE 'thinking_log' END) ORDER BY d.id), '[]')
	INTO demoted FROM public.onto_documents d
	WHERE d.project_id = v_source AND (d.type_key IN ('document.context.project', 'document.context.thinking_log')
		OR d.id = src.shared_folder_document_id);
	UPDATE public.onto_documents d SET
		type_key = CASE WHEN d.type_key IN ('document.context.project', 'document.context.thinking_log') THEN 'document.default' ELSE d.type_key END,
		props = (d.props
			- CASE WHEN d.props->>'origin' = 'start_here_template' THEN 'origin' ELSE '' END
			- CASE WHEN d.props->>'role' = 'shared_with_sub_projects' THEN 'role' ELSE '' END)
			|| jsonb_build_object('former_role', x.value->>'former_role', 'folded_from_project_id', v_source)
	FROM jsonb_array_elements(demoted) x
	WHERE d.id = (x.value->>'id')::uuid;

	-- 6. Records, ids intact. Documents and tasks first (the guards check
	--    dependents against their entity's project). Dependents whose node is
	--    not in the source (legacy cross-project rows) stay behind.
	v_nodes_map := private.project_fold_node_ids(v_source);
	n := private.project_fold_relocate_guarded('onto_documents', 'document', v_doc_ids, v_dest);
	moved := moved || jsonb_build_object('onto_documents', n);
	n := private.project_fold_relocate_guarded('onto_tasks', 'task', v_task_ids, v_dest);
	moved := moved || jsonb_build_object('onto_tasks', n);
	nodes := nodes || jsonb_build_object('onto_documents', to_jsonb(v_doc_ids), 'onto_tasks', to_jsonb(v_task_ids));
	FOREACH tbl IN ARRAY ARRAY['onto_goals', 'onto_plans', 'onto_milestones', 'onto_risks', 'onto_requirements',
		'onto_metrics', 'onto_insights', 'onto_signals', 'onto_sources'] LOOP
		EXECUTE format('WITH m AS (UPDATE public.%I SET project_id = $1 WHERE project_id = $2 RETURNING id) SELECT coalesce(array_agg(id ORDER BY id), ''{}'') FROM m', tbl)
			INTO ids USING v_dest, v_source;
		moved := moved || jsonb_build_object(tbl, cardinality(ids));
		nodes := nodes || jsonb_build_object(tbl, to_jsonb(ids));
	END LOOP;
	moved := moved || jsonb_build_object('assets_and_links', private.project_fold_relocate_assets(v_asset_ids, v_dest, v_nodes_map));
	nodes := nodes || jsonb_build_object('onto_assets', to_jsonb(v_asset_ids));
	UPDATE public.onto_public_pages SET project_id = v_dest WHERE project_id = v_source AND document_id = ANY(v_doc_ids);
	GET DIAGNOSTICS n = ROW_COUNT; moved := moved || jsonb_build_object('onto_public_pages', n);
	UPDATE public.onto_public_page_review_attempts SET project_id = v_dest WHERE project_id = v_source AND document_id = ANY(v_doc_ids);
	GET DIAGNOSTICS n = ROW_COUNT; moved := moved || jsonb_build_object('onto_public_page_review_attempts', n);
	UPDATE public.onto_public_page_slug_history SET project_id = v_dest WHERE project_id = v_source;
	GET DIAGNOSTICS n = ROW_COUNT; moved := moved || jsonb_build_object('onto_public_page_slug_history', n);

	SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('kind', c.entity_type, 'id', c.entity_id)), '[]') INTO v_targets
	FROM public.onto_comments c WHERE c.project_id = v_source AND c.entity_type NOT IN ('project', 'event')
		AND (c.entity_type = 'metric_point' OR v_nodes_map ? c.entity_id::text);
	moved := moved || jsonb_build_object('onto_comments', private.project_fold_relocate_comments(v_source, v_dest, v_targets));
	UPDATE public.onto_comment_read_states SET project_id = v_dest WHERE project_id = v_source AND entity_type NOT IN ('project', 'event')
		AND (entity_type = 'metric_point' OR v_nodes_map ? entity_id::text);
	GET DIAGNOSTICS n = ROW_COUNT; moved := moved || jsonb_build_object('onto_comment_read_states', n);
	UPDATE public.onto_embeddings SET project_id = v_dest WHERE project_id = v_source AND entity_type NOT IN ('project', 'event')
		AND v_nodes_map ? entity_id::text;
	GET DIAGNOSTICS n = ROW_COUNT; moved := moved || jsonb_build_object('onto_embeddings', n);

	-- Relationships, with project-node endpoints following the merge.
	SELECT coalesce(array_agg(e.id ORDER BY e.id) FILTER (WHERE (e.src_kind = 'project' AND e.src_id = v_source)
			OR (e.dst_kind = 'project' AND e.dst_id = v_source)), '{}')
	INTO v_project_edge_ids FROM public.onto_edges e WHERE e.project_id = v_source
		AND private.project_fold_endpoint_ok(v_nodes_map, e.src_kind, e.src_id)
		AND private.project_fold_endpoint_ok(v_nodes_map, e.dst_kind, e.dst_id);
	WITH m AS (
		UPDATE public.onto_edges e SET project_id = v_dest,
			src_id = CASE WHEN e.src_kind = 'project' AND e.src_id = v_source THEN v_dest ELSE e.src_id END,
			dst_id = CASE WHEN e.dst_kind = 'project' AND e.dst_id = v_source THEN v_dest ELSE e.dst_id END
		WHERE e.project_id = v_source
			AND private.project_fold_endpoint_ok(v_nodes_map, e.src_kind, e.src_id)
			AND private.project_fold_endpoint_ok(v_nodes_map, e.dst_kind, e.dst_id)
		RETURNING e.id
	)
	SELECT coalesce(array_agg(id ORDER BY id), '{}') INTO v_edge_ids FROM m;
	moved := moved || jsonb_build_object('onto_edges', cardinality(v_edge_ids));

	UPDATE public.onto_task_assignees SET project_id = v_dest WHERE project_id = v_source AND task_id = ANY(v_task_ids);
	GET DIAGNOSTICS n = ROW_COUNT; moved := moved || jsonb_build_object('onto_task_assignees', n);

	-- 7. Calendar: the deployed worker reconciles each task against its current
	--    project (onto_organize_task_sync); a retry of the same fold is a no-op.
	FOR t IN SELECT id FROM public.onto_tasks WHERE id = ANY(v_task_ids) AND deleted_at IS NULL AND archived_at IS NULL
		AND ((start_at IS NOT NULL OR due_at IS NOT NULL)
			OR id::text = ANY(SELECT r->>'task_id' FROM jsonb_array_elements(rebuilt_events) r)) ORDER BY id LOOP
		PERFORM public.add_queue_job(p_user_id, 'sync_calendar', jsonb_build_object('kind', 'onto_organize_task_sync',
			'taskId', t, 'sourceProjectId', v_source, 'destinationProjectId', v_dest,
			'removedEvents', (SELECT coalesce(jsonb_agg(r), '[]') FROM jsonb_array_elements(rebuilt_events) r WHERE r->>'task_id' = t::text)),
			5, now(), 'project-fold-task-sync:' || t || ':' || p_fold_id);
		v_jobs := v_jobs + 1;
	END LOOP;

	-- 8. Repoint: project chats and contact links follow the merge.
	WITH m AS (UPDATE public.chat_sessions SET entity_id = v_dest WHERE context_type = 'project' AND entity_id = v_source RETURNING id)
	SELECT coalesce(array_agg(id ORDER BY id), '{}') INTO ids FROM m;
	repointed := repointed || jsonb_build_object('chat_sessions', private.project_fold_fps('chat_sessions', ids));
	WITH dropped AS (
		DELETE FROM public.chat_sessions_projects s WHERE s.project_id = v_source
			AND EXISTS (SELECT 1 FROM public.chat_sessions_projects o WHERE o.chat_session_id = s.chat_session_id AND o.project_id = v_dest)
		RETURNING s.*
	)
	SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.id), '[]') INTO dropped_links FROM dropped d;
	WITH m AS (UPDATE public.chat_sessions_projects SET project_id = v_dest WHERE project_id = v_source RETURNING id)
	SELECT coalesce(array_agg(id ORDER BY id), '{}') INTO ids FROM m;
	repointed := repointed || jsonb_build_object('chat_sessions_projects', private.project_fold_fps('chat_sessions_projects', ids));
	WITH m AS (UPDATE public.user_contact_links SET project_id = v_dest WHERE project_id = v_source RETURNING id)
	SELECT coalesce(array_agg(id ORDER BY id), '{}') INTO ids FROM m;
	repointed := repointed || jsonb_build_object('user_contact_links', private.project_fold_fps('user_contact_links', ids));

	-- 9. The "From <source>" folder and both trees (structure history 'move').
	INSERT INTO public.onto_documents (id, project_id, title, type_key, state_key, description, content, created_by, props)
	VALUES (v_folder, v_dest, v_folder_title, 'document.default', 'ready',
		left('Everything from ' || coalesce(src.name, 'the combined project') || ', combined into this project on '
			|| to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD') || '.', 600),
		'', v_actor,
		jsonb_build_object('folded_from', jsonb_build_object('fold_id', p_fold_id, 'project_id', v_source, 'project_name', src.name)));
	v_live_docs := ARRAY(SELECT id FROM public.onto_documents WHERE id = ANY(v_doc_ids)
		AND deleted_at IS NULL AND archived_at IS NULL AND state_key::text <> 'archived');
	v_tree := private.project_fold_file_tree(
		CASE WHEN jsonb_typeof(src.doc_structure->'root') = 'array' THEN src.doc_structure->'root' ELSE '[]'::jsonb END, v_live_docs);
	SELECT CASE WHEN jsonb_typeof(p.doc_structure->'root') = 'array' THEN p.doc_structure->'root' ELSE '[]'::jsonb END
	INTO v_dest_root FROM public.onto_projects p WHERE p.id = v_dest;
	v_dest_root := v_dest_root || jsonb_build_array(jsonb_build_object('id', v_folder, 'title', v_folder_title,
		'order', jsonb_array_length(v_dest_root), 'children', v_tree));
	PERFORM private.organize_write_tree(v_dest, v_dest_root, v_actor);
	PERFORM private.organize_write_tree(v_source, '[]'::jsonb, v_actor);

	-- 10. Archive the source and point it at the destination. The hierarchy
	--     flag is on only around this write.
	PERFORM set_config('buildos.project_hierarchy_write', 'on', true);
	UPDATE public.onto_projects SET archived_at = coalesce(archived_at, v_now), merged_into_project_id = v_dest,
		parent_project_id = NULL, shared_folder_document_id = NULL
	WHERE id = v_source;
	PERFORM set_config('buildos.project_hierarchy_write', '', true);

	-- 11. Manifest: post-fold fingerprints of everything that moved, so unfold
	--     can tell what was edited since.
	manifest := jsonb_build_object('version', 1,
		'nodes', (SELECT jsonb_object_agg(k.key, private.project_fold_fps(k.key, ARRAY(SELECT jsonb_array_elements_text(k.value)::uuid)))
			FROM jsonb_each(nodes) k),
		'edges', to_jsonb(v_edge_ids),
		'project_edges', to_jsonb(v_project_edge_ids),
		'dropped_edges', dropped_edges,
		'demoted', demoted,
		'removed_assignees', removed_assignees,
		'rebuilt_task_events', rebuilt_events,
		'repointed', repointed,
		'dropped_links', dropped_links,
		'members_added', members_added,
		'folder', jsonb_build_object('id', v_folder, 'fp', private.project_fold_fps('onto_documents', ARRAY[v_folder])->>v_folder::text));
	source_state := jsonb_build_object('name', src.name, 'archived_at_before', src.archived_at, 'archived_at', coalesce(src.archived_at, v_now),
		'parent_project_id', src.parent_project_id, 'shared_folder_document_id', src.shared_folder_document_id,
		'doc_structure_root', CASE WHEN jsonb_typeof(src.doc_structure->'root') = 'array' THEN src.doc_structure->'root' ELSE '[]'::jsonb END);
	receipt := jsonb_build_object('status', 'folded', 'fold_id', p_fold_id,
		'source_project_id', v_source, 'destination_project_id', v_dest, 'folder_document_id', v_folder,
		'folder_title', v_folder_title, 'moved', moved,
		'demoted_documents', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', d.value->'id', 'former_role', d.value->'former_role')), '[]') FROM jsonb_array_elements(demoted) d),
		'members_added', members_added, 'assignees_removed', jsonb_array_length(removed_assignees),
		'task_events_rebuilt', jsonb_array_length(rebuilt_events),
		'calendar_sync', CASE WHEN v_jobs > 0 THEN 'queued' ELSE 'not_needed' END, 'calendar_jobs', v_jobs,
		'repointed', (SELECT jsonb_object_agg(k.key, (SELECT count(*) FROM jsonb_object_keys(k.value))) FROM jsonb_each(repointed) k),
		'connector_grants_not_copied', impact->'connector_grants_not_copied',
		'rebuild_after_commit', impact->'rebuild_after_commit',
		'duration_ms', round(extract(epoch FROM clock_timestamp() - v_started) * 1000),
		'replayed', false);
	INSERT INTO public.onto_project_fold_manifests (id, user_id, source_project_id, destination_project_id, request_hash,
		folder_document_id, source_state, manifest, receipt)
	VALUES (p_fold_id, p_user_id, v_source, v_dest, v_request_hash, v_folder, source_state, manifest, receipt);

	-- One summary row per project (per-entity rows would wake review loops
	-- hundreds of times).
	INSERT INTO public.onto_project_logs (project_id, entity_type, entity_id, action, before_data, after_data, changed_by, change_source)
	VALUES
		(v_source, 'project', v_source, 'updated', jsonb_build_object('archived_at', src.archived_at),
			jsonb_build_object('merged_into_project_id', v_dest, 'fold_id', p_fold_id), p_user_id, 'form'),
		(v_dest, 'project', v_dest, 'updated', NULL,
			jsonb_build_object('folded_from_project_id', v_source, 'fold_id', p_fold_id, 'folder_document_id', v_folder, 'moved', moved),
			p_user_id, 'form');
	RETURN receipt;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Route forwarding. SECURITY INVOKER: a signed-in caller follows only the
--    project rows RLS lets them read (every source member was a destination
--    member at fold time), and gets an answer only when the final destination
--    is live and they can read it. The service role (gateway forwarding, a later
--    slice) passes the acting actor. Follows a chain of folds, at most 5 hops.

CREATE FUNCTION public.get_project_route_redirect(p_project_id uuid, p_actor_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
	v_service boolean := coalesce(auth.role(), '') = 'service_role';
	v_current uuid := p_project_id;
	v_next uuid;
	v_hops integer := 0;
BEGIN
	IF p_project_id IS NULL OR (v_service AND p_actor_id IS NULL) OR (NOT v_service AND auth.uid() IS NULL) THEN
		RETURN NULL;
	END IF;
	LOOP
		SELECT p.merged_into_project_id INTO v_next FROM public.onto_projects p
		WHERE p.id = v_current AND p.archived_at IS NOT NULL AND p.merged_into_project_id IS NOT NULL;
		EXIT WHEN v_next IS NULL OR v_hops >= 5 OR v_next = p_project_id;
		v_current := v_next;
		v_hops := v_hops + 1;
	END LOOP;
	IF v_current = p_project_id
		OR NOT EXISTS (SELECT 1 FROM public.onto_projects p WHERE p.id = v_current AND p.deleted_at IS NULL AND p.archived_at IS NULL) THEN
		RETURN NULL;
	END IF;
	-- Separate statements: a signed-in caller cannot execute the actor-explicit
	-- helper, and PL/pgSQL checks EXECUTE when it first runs an expression.
	IF v_service THEN
		IF NOT public.actor_has_project_member_access(p_actor_id, v_current, 'read') THEN RETURN NULL; END IF;
	ELSIF NOT public.current_actor_has_project_member_access(v_current, 'read') THEN
		RETURN NULL;
	END IF;
	RETURN jsonb_build_object('status', 'merged', 'destination_project_id', v_current);
END $$;

-- ---------------------------------------------------------------------------
-- 7. Retention: manifests older than 30 days (worker privacyRetention task).

CREATE FUNCTION public.cleanup_privacy_project_fold_manifests(p_batch_size integer DEFAULT 500) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_batch integer := least(greatest(coalesce(p_batch_size, 500), 1), 5000); v_deleted integer;
BEGIN
	WITH candidates AS (
		SELECT m.id FROM public.onto_project_fold_manifests m
		WHERE m.created_at <= clock_timestamp() - interval '30 days'
		ORDER BY m.created_at LIMIT v_batch
	)
	DELETE FROM public.onto_project_fold_manifests m USING candidates c WHERE m.id = c.id;
	GET DIAGNOSTICS v_deleted = ROW_COUNT;
	RETURN jsonb_build_object('fold_manifests_deleted', v_deleted);
END $$;

-- ---------------------------------------------------------------------------
-- Grants: server-only except the route redirect (checks auth itself).

DO $$ DECLARE f record; BEGIN
	FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
		WHERE (n.nspname = 'private' AND p.proname LIKE 'project\_fold\_%')
			OR (n.nspname = 'public' AND p.proname IN ('onto_project_fold_preview', 'onto_project_fold_apply',
				'cleanup_privacy_project_fold_manifests', 'get_project_route_redirect')) LOOP
		EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.signature);
		EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.signature);
	END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.get_project_route_redirect(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.onto_project_fold_preview(uuid, uuid, uuid, uuid[]) IS
	'Service only. Impact of folding a project into another, plus a confirmation token scoped to what the fold touches. Errors: project_fold_access_denied, project_fold_project_missing, project_fold_destination_archived, project_fold_source_already_merged, project_fold_same_project, project_fold_invalid_member_addition.';
COMMENT ON FUNCTION public.onto_project_fold_apply(uuid, uuid, uuid, text, uuid, uuid[]) IS
	'Service only. Folds the source into the destination (idempotent by fold id). Errors: as preview, plus project_fold_stale_preview, project_fold_blocked: [...], project_fold_idempotency_conflict.';
COMMENT ON FUNCTION public.get_project_route_redirect(uuid, uuid) IS
	'{status:"merged", destination_project_id} when the project was folded and the caller can read the destination; otherwise null.';

COMMIT;
