-- supabase/migrations/20260827040932_scope_member_rls_policies_to_authenticated.sql
-- Member-only policies must not run for anonymous requests. The access helper
-- deliberately has no anon EXECUTE grant, so leaving these policies on PUBLIC
-- turns otherwise valid public reads into 42501 errors during RLS evaluation.
-- Service-role callers continue to bypass RLS; signed-in callers retain these
-- policies through the authenticated role.

ALTER POLICY onto_asset_links_select_read
	ON public.onto_asset_links
	TO authenticated;

ALTER POLICY onto_assets_select_read
	ON public.onto_assets
	TO authenticated;

ALTER POLICY comment_mentions_select_reader
	ON public.onto_comment_mentions
	TO authenticated;

ALTER POLICY comment_select_member
	ON public.onto_comments
	TO authenticated;

ALTER POLICY document_select_member
	ON public.onto_documents
	TO authenticated;

ALTER POLICY edge_select_member
	ON public.onto_edges
	TO authenticated;

ALTER POLICY goal_select_member
	ON public.onto_goals
	TO authenticated;

ALTER POLICY milestone_select_member
	ON public.onto_milestones
	TO authenticated;

ALTER POLICY plan_select_member
	ON public.onto_plans
	TO authenticated;

ALTER POLICY project_icon_candidates_read
	ON public.onto_project_icon_candidates
	TO authenticated;

ALTER POLICY project_icon_generations_read
	ON public.onto_project_icon_generations
	TO authenticated;

ALTER POLICY project_logs_select_member
	ON public.onto_project_logs
	TO authenticated;

ALTER POLICY project_members_select_member
	ON public.onto_project_members
	TO authenticated;

ALTER POLICY project_select_member
	ON public.onto_projects
	TO authenticated;

ALTER POLICY public_page_reviews_select_member
	ON public.onto_public_page_review_attempts
	TO authenticated;

ALTER POLICY public_page_slug_history_select_member
	ON public.onto_public_page_slug_history
	TO authenticated;

ALTER POLICY public_page_select_member
	ON public.onto_public_pages
	TO authenticated;

ALTER POLICY risk_select_member
	ON public.onto_risks
	TO authenticated;

ALTER POLICY task_assignees_select_member
	ON public.onto_task_assignees
	TO authenticated;

ALTER POLICY task_select_member
	ON public.onto_tasks
	TO authenticated;

ALTER POLICY project_context_snapshot_read
	ON public.project_context_snapshot
	TO authenticated;

ALTER POLICY project_context_snapshot_metrics_read
	ON public.project_context_snapshot_metrics
	TO authenticated;

ALTER POLICY onto_assets_storage_read
	ON storage.objects
	TO authenticated;
