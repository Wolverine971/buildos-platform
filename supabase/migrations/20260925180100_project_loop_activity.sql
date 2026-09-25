-- supabase/migrations/20260925180100_project_loop_activity.sql
-- Tasker 108 item 3: Project Loops run only on projects with new activity.
--
-- The end-of-day scan used onto_projects.updated_at as its activity signal.
-- That column misses real work (task, document, goal, plan, milestone and risk
-- writes never touch the project row) and, until 20260925180000, counted the
-- daily brief's own next-step write as activity. This function returns each
-- active project's latest activity from the records a user or a user-directed
-- agent changes:
--   * the project row (machine-only updates no longer move it);
--   * tasks, documents, goals, plans, milestones and risks (updated_at, which
--     soft deletes also move);
--   * edges (created_at);
--   * user messages in the project's chats (context sessions and linked ones).
-- A loop's own writes land before its run's finished_at, so the worker compares
-- this timestamp with the last completed run and never re-triggers on them.
--
-- Worker-only (service role). SECURITY INVOKER: the service role reads through
-- RLS bypass; no client can execute it.
--
-- Rollback: DROP FUNCTION public.project_loop_activity(timestamptz, uuid[]);

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.project_loop_activity(
	p_since timestamptz,
	p_project_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (project_id uuid, created_by uuid, last_activity_at timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
	SELECT activity.project_id, activity.created_by, activity.last_activity_at
	FROM (
		SELECT
			p.id AS project_id,
			p.created_by,
			GREATEST(
				p.updated_at,
				(SELECT max(t.updated_at) FROM public.onto_tasks t WHERE t.project_id = p.id),
				(SELECT max(d.updated_at) FROM public.onto_documents d WHERE d.project_id = p.id),
				(SELECT max(g.updated_at) FROM public.onto_goals g WHERE g.project_id = p.id),
				(SELECT max(pl.updated_at) FROM public.onto_plans pl WHERE pl.project_id = p.id),
				(SELECT max(m.updated_at) FROM public.onto_milestones m WHERE m.project_id = p.id),
				(SELECT max(r.updated_at) FROM public.onto_risks r WHERE r.project_id = p.id),
				(SELECT max(e.created_at) FROM public.onto_edges e WHERE e.project_id = p.id),
				(
					SELECT max(msg.created_at)
					FROM public.chat_messages msg
					WHERE msg.role = 'user'
						AND msg.created_at >= p_since
						AND msg.session_id IN (
							SELECT s.id
							FROM public.chat_sessions s
							WHERE s.context_type = 'project' AND s.entity_id = p.id
							UNION
							SELECT link.chat_session_id
							FROM public.chat_sessions_projects link
							WHERE link.project_id = p.id
						)
				)
			) AS last_activity_at
		FROM public.onto_projects p
		WHERE p.state_key IN ('active', 'planning')
			AND p.deleted_at IS NULL
			AND p.archived_at IS NULL
			AND (p_project_ids IS NULL OR p.id = ANY (p_project_ids))
	) AS activity
	WHERE activity.last_activity_at >= p_since;
$$;

REVOKE ALL ON FUNCTION public.project_loop_activity(timestamptz, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.project_loop_activity(timestamptz, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.project_loop_activity(timestamptz, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.project_loop_activity(timestamptz, uuid[]) TO service_role;

COMMENT ON FUNCTION public.project_loop_activity(timestamptz, uuid[]) IS
	'Latest user-driven activity per active project since p_since (project row, child records, edges, user chat messages). Project Loop scheduling signal; service role only. Tasker 108.';

COMMIT;
