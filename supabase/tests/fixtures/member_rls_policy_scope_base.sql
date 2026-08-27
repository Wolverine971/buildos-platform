-- supabase/tests/fixtures/member_rls_policy_scope_base.sql
-- Minimal schema for the member-only RLS policy scope regression contract.

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA storage;

GRANT USAGE ON SCHEMA public, storage TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.current_actor_has_project_member_access(
	p_project_id uuid,
	p_required_access text DEFAULT 'read'::text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
	SELECT false
$$;

REVOKE ALL ON FUNCTION public.current_actor_has_project_member_access(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_actor_has_project_member_access(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.current_actor_has_project_member_access(uuid, text)
	TO authenticated, service_role;

DO $$
DECLARE
	policy_spec text[];
BEGIN
	FOREACH policy_spec SLICE 1 IN ARRAY ARRAY[
		ARRAY['public', 'onto_asset_links', 'onto_asset_links_select_read'],
		ARRAY['public', 'onto_assets', 'onto_assets_select_read'],
		ARRAY['public', 'onto_comment_mentions', 'comment_mentions_select_reader'],
		ARRAY['public', 'onto_comments', 'comment_select_member'],
		ARRAY['public', 'onto_documents', 'document_select_member'],
		ARRAY['public', 'onto_edges', 'edge_select_member'],
		ARRAY['public', 'onto_goals', 'goal_select_member'],
		ARRAY['public', 'onto_milestones', 'milestone_select_member'],
		ARRAY['public', 'onto_plans', 'plan_select_member'],
		ARRAY['public', 'onto_project_icon_candidates', 'project_icon_candidates_read'],
		ARRAY['public', 'onto_project_icon_generations', 'project_icon_generations_read'],
		ARRAY['public', 'onto_project_logs', 'project_logs_select_member'],
		ARRAY['public', 'onto_project_members', 'project_members_select_member'],
		ARRAY['public', 'onto_projects', 'project_select_member'],
		ARRAY[
			'public',
			'onto_public_page_review_attempts',
			'public_page_reviews_select_member'
		],
		ARRAY[
			'public',
			'onto_public_page_slug_history',
			'public_page_slug_history_select_member'
		],
		ARRAY['public', 'onto_risks', 'risk_select_member'],
		ARRAY['public', 'onto_task_assignees', 'task_assignees_select_member'],
		ARRAY['public', 'onto_tasks', 'task_select_member'],
		ARRAY['public', 'project_context_snapshot', 'project_context_snapshot_read'],
		ARRAY[
			'public',
			'project_context_snapshot_metrics',
			'project_context_snapshot_metrics_read'
		],
		ARRAY['storage', 'objects', 'onto_assets_storage_read']
	]
	LOOP
		EXECUTE format(
			'CREATE TABLE %I.%I (project_id uuid)',
			policy_spec[1],
			policy_spec[2]
		);
		EXECUTE format(
			'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
			policy_spec[1],
			policy_spec[2]
		);
		EXECUTE format(
			'CREATE POLICY %I ON %I.%I FOR SELECT USING (public.current_actor_has_project_member_access(project_id, ''read''))',
			policy_spec[3],
			policy_spec[1],
			policy_spec[2]
		);
	END LOOP;
END;
$$;

CREATE TABLE public.onto_public_pages (
	project_id uuid,
	status text,
	public_status text,
	visibility text,
	noindex boolean NOT NULL DEFAULT false,
	deleted_at timestamptz
);

ALTER TABLE public.onto_public_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_page_select_member
	ON public.onto_public_pages
	FOR SELECT
	USING (public.current_actor_has_project_member_access(project_id, 'read'));

CREATE POLICY public_page_select_public
	ON public.onto_public_pages
	FOR SELECT
	TO anon, authenticated
	USING (
		status = 'published'
		AND public_status = 'live'
		AND visibility = 'public'
		AND deleted_at IS NULL
	);

GRANT SELECT ON public.onto_public_pages TO anon, authenticated;
