-- supabase/migrations/20260928000000_project_loop_activity_ledger.sql
-- Tasker 111 (unit economics): the Project Loop activity signal reads the
-- change ledger instead of updated_at.
--
-- 20260925180100 took the latest updated_at across the project and its child
-- records. Machine writes move updated_at without being project work: the
-- START HERE snapshot job rewrites its managed regions on every chat close
-- without logging a change, and any other background column write (sync,
-- enrichment) does the same. Each one made an unchanged project look active
-- and bought a paid review.
--
-- Activity is now what the project's change ledger (onto_project_logs) records:
-- writes from the app, chat and connected agents, plus user messages in the
-- project's chats. Steward on/off and approval control rows are excluded
-- (they are settings, not project work; new code no longer writes them).
-- Same signature, return shape, and grants, so callers are unchanged.
--
-- Uses idx_onto_project_logs_project_created_desc (project_id, created_at DESC).
--
-- Rollback: re-apply the function body from 20260925180100.

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
				(
					SELECT max(l.created_at)
					FROM public.onto_project_logs l
					WHERE l.project_id = p.id
						AND l.created_at >= p_since
						AND COALESCE(l.after_data ->> 'event', '')
							NOT IN ('steward_charter_approved', 'steward_toggled')
				),
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
	'Latest recorded project work per active project since p_since: change-ledger rows (excluding steward control rows) and user chat messages. Project Loop scheduling signal; service role only. Tasker 111.';

COMMIT;
