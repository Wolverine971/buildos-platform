-- supabase/migrations/20260514001000_tighten_public_project_internal_access.sql
--
-- `onto_projects.is_public` is for deliberately public/example surfaces. It must
-- not grant direct table/RPC access to collaboration payloads such as project
-- full data, document bodies, logs, members, comments, assets, or snapshots.

DO $$
BEGIN
	IF to_regclass('public.onto_projects') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS "project_select_member" ON public.onto_projects';
		EXECUTE 'DROP POLICY IF EXISTS "project_select_public" ON public.onto_projects';
		EXECUTE 'CREATE POLICY "project_select_member" ON public.onto_projects FOR SELECT USING (public.current_actor_has_project_member_access(id, ''read''))';
	END IF;

	IF to_regclass('public.onto_goals') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS "goal_select_member" ON public.onto_goals';
		EXECUTE 'DROP POLICY IF EXISTS "goal_select_public" ON public.onto_goals';
		EXECUTE 'CREATE POLICY "goal_select_member" ON public.onto_goals FOR SELECT USING (public.current_actor_has_project_member_access(project_id, ''read''))';
	END IF;

	IF to_regclass('public.onto_milestones') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS "milestone_select_member" ON public.onto_milestones';
		EXECUTE 'DROP POLICY IF EXISTS "milestone_select_public" ON public.onto_milestones';
		EXECUTE 'CREATE POLICY "milestone_select_member" ON public.onto_milestones FOR SELECT USING (public.current_actor_has_project_member_access(project_id, ''read''))';
	END IF;

	IF to_regclass('public.onto_plans') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS "plan_select_member" ON public.onto_plans';
		EXECUTE 'DROP POLICY IF EXISTS "plan_select_public" ON public.onto_plans';
		EXECUTE 'CREATE POLICY "plan_select_member" ON public.onto_plans FOR SELECT USING (public.current_actor_has_project_member_access(project_id, ''read''))';
	END IF;

	IF to_regclass('public.onto_tasks') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS "task_select_member" ON public.onto_tasks';
		EXECUTE 'DROP POLICY IF EXISTS "task_select_public" ON public.onto_tasks';
		EXECUTE 'CREATE POLICY "task_select_member" ON public.onto_tasks FOR SELECT USING (public.current_actor_has_project_member_access(project_id, ''read''))';
	END IF;

	IF to_regclass('public.onto_decisions') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS "decision_select_member" ON public.onto_decisions';
		EXECUTE 'DROP POLICY IF EXISTS "decision_select_public" ON public.onto_decisions';
		EXECUTE 'CREATE POLICY "decision_select_member" ON public.onto_decisions FOR SELECT USING (public.current_actor_has_project_member_access(project_id, ''read''))';
	END IF;

	IF to_regclass('public.onto_risks') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS "risk_select_member" ON public.onto_risks';
		EXECUTE 'DROP POLICY IF EXISTS "risk_select_public" ON public.onto_risks';
		EXECUTE 'CREATE POLICY "risk_select_member" ON public.onto_risks FOR SELECT USING (public.current_actor_has_project_member_access(project_id, ''read''))';
	END IF;

	IF to_regclass('public.onto_documents') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS "document_select_member" ON public.onto_documents';
		EXECUTE 'DROP POLICY IF EXISTS "document_select_public" ON public.onto_documents';
		EXECUTE 'CREATE POLICY "document_select_member" ON public.onto_documents FOR SELECT USING (public.current_actor_has_project_member_access(project_id, ''read''))';
	END IF;

	IF to_regclass('public.onto_edges') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS "edge_select_member" ON public.onto_edges';
		EXECUTE 'DROP POLICY IF EXISTS "edge_select_public" ON public.onto_edges';
		EXECUTE 'CREATE POLICY "edge_select_member" ON public.onto_edges FOR SELECT USING (public.current_actor_has_project_member_access(project_id, ''read''))';
	END IF;

	IF to_regclass('public.onto_project_logs') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS "project_logs_select_member" ON public.onto_project_logs';
		EXECUTE 'CREATE POLICY "project_logs_select_member" ON public.onto_project_logs FOR SELECT USING (public.current_actor_has_project_member_access(project_id, ''read''))';
	END IF;

	IF to_regclass('public.onto_project_members') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS "project_members_select_member" ON public.onto_project_members';
		EXECUTE 'CREATE POLICY "project_members_select_member" ON public.onto_project_members FOR SELECT USING (public.current_actor_has_project_member_access(project_id, ''read''))';
	END IF;

	IF to_regclass('public.project_context_snapshot') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS project_context_snapshot_read ON public.project_context_snapshot';
		EXECUTE 'CREATE POLICY project_context_snapshot_read ON public.project_context_snapshot FOR SELECT USING (public.current_actor_has_project_member_access(project_id, ''read''))';
	END IF;

	IF to_regclass('public.project_context_snapshot_metrics') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS project_context_snapshot_metrics_read ON public.project_context_snapshot_metrics';
		EXECUTE 'CREATE POLICY project_context_snapshot_metrics_read ON public.project_context_snapshot_metrics FOR SELECT USING (public.current_actor_has_project_member_access(project_id, ''read''))';
	END IF;

	IF to_regclass('public.onto_assets') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS onto_assets_select_read ON public.onto_assets';
		EXECUTE 'CREATE POLICY onto_assets_select_read ON public.onto_assets FOR SELECT USING (public.current_actor_has_project_member_access(project_id, ''read''))';
	END IF;

	IF to_regclass('public.onto_asset_links') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS onto_asset_links_select_read ON public.onto_asset_links';
		EXECUTE 'CREATE POLICY onto_asset_links_select_read ON public.onto_asset_links FOR SELECT USING (public.current_actor_has_project_member_access(project_id, ''read''))';
	END IF;

	IF to_regclass('public.onto_task_assignees') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS task_assignees_select_member ON public.onto_task_assignees';
		EXECUTE 'CREATE POLICY task_assignees_select_member ON public.onto_task_assignees FOR SELECT USING (public.current_actor_has_project_member_access(project_id, ''read''))';
	END IF;

	IF to_regclass('public.onto_project_icon_generations') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS project_icon_generations_read ON public.onto_project_icon_generations';
		EXECUTE 'CREATE POLICY project_icon_generations_read ON public.onto_project_icon_generations FOR SELECT USING (public.current_actor_has_project_member_access(project_id, ''read''))';
	END IF;

	IF to_regclass('public.onto_project_icon_candidates') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS project_icon_candidates_read ON public.onto_project_icon_candidates';
		EXECUTE 'CREATE POLICY project_icon_candidates_read ON public.onto_project_icon_candidates FOR SELECT USING (public.current_actor_has_project_member_access(project_id, ''read''))';
	END IF;

	IF to_regclass('public.onto_public_pages') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS public_page_select_member ON public.onto_public_pages';
		EXECUTE 'CREATE POLICY public_page_select_member ON public.onto_public_pages FOR SELECT USING (public.current_actor_has_project_member_access(project_id, ''read''))';
	END IF;

	IF to_regclass('public.onto_public_page_slug_history') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS public_page_slug_history_select_member ON public.onto_public_page_slug_history';
		EXECUTE 'CREATE POLICY public_page_slug_history_select_member ON public.onto_public_page_slug_history FOR SELECT USING (public.current_actor_has_project_member_access(project_id, ''read''))';
	END IF;

	IF to_regclass('public.onto_public_page_review_attempts') IS NOT NULL THEN
		EXECUTE 'DROP POLICY IF EXISTS public_page_reviews_select_member ON public.onto_public_page_review_attempts';
		EXECUTE 'CREATE POLICY public_page_reviews_select_member ON public.onto_public_page_review_attempts FOR SELECT USING (public.current_actor_has_project_member_access(project_id, ''read''))';
	END IF;
END $$;

DROP POLICY IF EXISTS onto_assets_storage_read ON storage.objects;
CREATE POLICY onto_assets_storage_read
	ON storage.objects
	FOR SELECT
	USING (
		bucket_id = 'onto-assets'
		AND auth.role() = 'authenticated'
		AND (storage.foldername(name))[1] = 'projects'
		AND EXISTS (
			SELECT 1
			FROM public.onto_projects p
			WHERE p.id::text = (storage.foldername(name))[2]
				AND public.current_actor_has_project_member_access(p.id, 'read')
		)
	);

DROP POLICY IF EXISTS "comment_select_member" ON public.onto_comments;
CREATE POLICY "comment_select_member"
	ON public.onto_comments
	FOR SELECT
	USING (public.current_actor_has_project_member_access(project_id, 'read'));

DROP POLICY IF EXISTS "comment_select_public" ON public.onto_comments;
DROP POLICY IF EXISTS "comment_select_public_document" ON public.onto_comments;
CREATE POLICY "comment_select_public_document"
	ON public.onto_comments
	FOR SELECT
	USING (
		entity_type = 'document'
		AND deleted_at IS NULL
		AND EXISTS (
			SELECT 1
			FROM public.onto_public_pages pp
			WHERE pp.project_id = onto_comments.project_id
				AND pp.document_id = onto_comments.entity_id
				AND pp.status = 'published'
				AND pp.public_status = 'live'
				AND pp.visibility = 'public'
				AND pp.deleted_at IS NULL
		)
	);

DROP POLICY IF EXISTS "comment_insert_public_document" ON public.onto_comments;
CREATE POLICY "comment_insert_public_document"
	ON public.onto_comments
	FOR INSERT
	WITH CHECK (
		auth.role() = 'authenticated'
		AND entity_type = 'document'
		AND created_by = public.current_actor_id()
		AND EXISTS (
			SELECT 1
			FROM public.onto_public_pages pp
			WHERE pp.project_id = onto_comments.project_id
				AND pp.document_id = onto_comments.entity_id
				AND pp.status = 'published'
				AND pp.public_status = 'live'
				AND pp.visibility = 'public'
				AND pp.deleted_at IS NULL
		)
	);

DROP POLICY IF EXISTS "comment_mentions_select_reader" ON public.onto_comment_mentions;
CREATE POLICY "comment_mentions_select_reader"
	ON public.onto_comment_mentions
	FOR SELECT
	USING (
		EXISTS (
			SELECT 1
			FROM public.onto_comments c
			WHERE c.id = onto_comment_mentions.comment_id
				AND public.current_actor_has_project_member_access(c.project_id, 'read')
		)
	);

ALTER FUNCTION public.get_project_full(uuid, uuid)
	RENAME TO get_project_full_legacy_public_20260514;

REVOKE ALL ON FUNCTION public.get_project_full_legacy_public_20260514(uuid, uuid)
	FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_project_full(p_project_id uuid, p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_user_id uuid;
BEGIN
	v_user_id := auth.uid();
	IF auth.role() = 'service_role' THEN
		IF NOT public.actor_has_project_member_access(p_actor_id, p_project_id, 'read') THEN
			RETURN NULL;
		END IF;
	ELSIF v_user_id IS NOT NULL THEN
		PERFORM public.ensure_actor_for_user(v_user_id);

		IF NOT public.current_actor_has_project_member_access(p_project_id, 'read') THEN
			RETURN NULL;
		END IF;
	ELSE
		RETURN NULL;
	END IF;

	RETURN public.get_project_full_legacy_public_20260514(p_project_id, p_actor_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_project_full(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_full(uuid, uuid) TO service_role;

ALTER FUNCTION public.get_project_skeleton(uuid, uuid)
	RENAME TO get_project_skeleton_legacy_public_20260514;

REVOKE ALL ON FUNCTION public.get_project_skeleton_legacy_public_20260514(uuid, uuid)
	FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_project_skeleton(p_project_id uuid, p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_user_id uuid;
BEGIN
	v_user_id := auth.uid();
	IF auth.role() = 'service_role' THEN
		IF NOT public.actor_has_project_member_access(p_actor_id, p_project_id, 'read') THEN
			RETURN NULL;
		END IF;
	ELSIF v_user_id IS NOT NULL THEN
		PERFORM public.ensure_actor_for_user(v_user_id);

		IF NOT public.current_actor_has_project_member_access(p_project_id, 'read') THEN
			RETURN NULL;
		END IF;
	ELSE
		RETURN NULL;
	END IF;

	RETURN public.get_project_skeleton_legacy_public_20260514(p_project_id, p_actor_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_project_skeleton(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_skeleton(uuid, uuid) TO service_role;

ALTER FUNCTION public.get_project_skeleton_with_access(uuid)
	RENAME TO get_project_skeleton_with_access_legacy_public_20260514;

REVOKE ALL ON FUNCTION public.get_project_skeleton_with_access_legacy_public_20260514(uuid)
	FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_project_skeleton_with_access(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_user_id uuid;
BEGIN
	v_user_id := auth.uid();
	IF v_user_id IS NOT NULL THEN
		PERFORM public.ensure_actor_for_user(v_user_id);
	END IF;

	IF NOT public.current_actor_has_project_member_access(p_project_id, 'read') THEN
		RETURN NULL;
	END IF;

	RETURN public.get_project_skeleton_with_access_legacy_public_20260514(p_project_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_project_skeleton_with_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_skeleton_with_access(uuid) TO service_role;

COMMENT ON FUNCTION public.get_project_full(uuid, uuid) IS
	'Member-only project full payload. Public/example/project-page output must use explicit public routes.';
COMMENT ON FUNCTION public.get_project_skeleton(uuid, uuid) IS
	'Member-only project skeleton payload. Public/example/project-page output must use explicit public routes.';
COMMENT ON FUNCTION public.get_project_skeleton_with_access(uuid) IS
	'Member-only project skeleton plus access payload. Public/example/project-page output must use explicit public routes.';
