-- supabase/migrations/20261115180000_collaborator_emails_private.sql
--
-- Tasker 158 §2: collaborators can't read each other's email addresses, in the app or through
-- the raw database API.
--
-- Before this, onto_actors_select let any co-member read every member's onto_actors.email
-- through PostgREST, and a project owner who invited someone by @handle could read the
-- invitee's email from onto_project_invites.invitee_email. The app already hid both (members
-- route, people hub, hideHandleInviteEmail); the database did not. Several SECURITY DEFINER
-- readers also returned other members' emails to any project reader.
--
-- 1. onto_actors: signed-in clients may read every column except email. The app reads emails
--    it is entitled to (the owner's member list, a collaborator ping by email) with the server
--    client after its own access check.
-- 2. onto_project_invites: signed-in clients may read every column except invitee_email.
--    The owner's invite list, resend and revoke read it server-side and keep hiding it for
--    @handle invites.
-- 3. get_project_full_v2_initial (task assignees) and load_fastchat_context (members) return
--    an email only to that person or the project owner.
-- 4. resolve_onto_public_page_slug_prefix falls back to an email's local part only for the
--    caller's own actor.
-- 5. get_admin_dashboard_comprehensive_analytics is an invoker function with no admin check;
--    the app calls it with the server client only. It is now server-only.
--
-- Apply only after the web deploy that stops selecting these columns with the signed-in
-- client (the same change set as this file); the old web code 500s on those reads.

SET lock_timeout = '5s';
SET statement_timeout = '60s';

-- 1. onto_actors.email
REVOKE SELECT ON public.onto_actors FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, kind, name, user_id, org_id, metadata, created_at, account_deleted_at)
	ON public.onto_actors TO authenticated;

-- 2. onto_project_invites.invitee_email (writes are unchanged; RETURNING never names the column)
REVOKE SELECT ON public.onto_project_invites FROM PUBLIC, anon, authenticated;
GRANT SELECT (
	id, project_id, token_hash, role_key, access, status, expires_at, invited_by_actor_id,
	accepted_by_actor_id, accepted_at, created_at, declined_at, agent_access, invitee_user_id,
	invitee_handle
) ON public.onto_project_invites TO authenticated;

-- 5. Admin analytics: server-only.
REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard_comprehensive_analytics(timestamptz, timestamptz, timestamptz)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_comprehensive_analytics(timestamptz, timestamptz, timestamptz)
	TO service_role;

-- 3 and 4. Live definitions as of 2026-11-15 with only the email expressions changed.
CREATE OR REPLACE FUNCTION public.get_project_full_v2_initial(p_project_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
	v_user_id uuid;
	v_actor_id uuid;
	v_project jsonb;
	v_result jsonb;
	v_task_payload jsonb;
	v_task_as_of timestamptz := statement_timestamp();
	v_task_limit integer := 20;
BEGIN
	v_user_id := auth.uid();

	IF auth.role() = 'service_role' THEN
		v_actor_id := p_actor_id;
		IF NOT public.actor_has_project_member_access(p_actor_id, p_project_id, 'read') THEN
			RETURN NULL;
		END IF;
	ELSIF v_user_id IS NOT NULL THEN
		v_actor_id := public.ensure_actor_for_user(v_user_id);

		IF NOT (
			public.is_admin()
			OR public.actor_has_project_member_access(v_actor_id, p_project_id, 'read')
		) THEN
			RETURN NULL;
		END IF;
	ELSE
		RETURN NULL;
	END IF;

	SELECT to_jsonb(p)
	INTO v_project
	FROM (
		SELECT
			p.archived_at,
			p.created_at,
			p.created_by,
			p.deleted_at,
			p.description,
			p.doc_structure,
			p.end_at,
			p.facet_context,
			p.facet_scale,
			p.facet_stage,
			p.icon_concept,
			p.icon_generated_at,
			p.icon_generation_prompt,
			p.icon_generation_source,
			p.icon_svg,
			p.id,
			p.is_public,
			p.name,
			p.next_step_long,
			p.next_step_short,
			p.next_step_source,
			p.next_step_updated_at,
			p.org_id,
			p.props,
			p.start_at,
			p.state_key,
			p.type_key,
			p.updated_at
		FROM public.onto_projects p
		WHERE p.id = p_project_id
			AND p.deleted_at IS NULL
	) p;

	IF v_project IS NULL THEN
		RETURN NULL;
	END IF;

	WITH classified_tasks AS MATERIALIZED (
		SELECT
			t.archived_at,
			t.completed_at,
			t.created_at,
			t.created_by,
			t.deleted_at,
			t.description,
			t.due_at,
			t.facet_scale,
			t.id,
			t.priority,
			t.project_id,
			t.props,
			t.start_at,
			t.state_key,
			t.title,
			t.type_key,
			t.updated_at,
			CASE
				WHEN t.state_key = 'done' THEN 'done'
				WHEN t.due_at IS NOT NULL AND t.due_at < v_task_as_of THEN 'overdue'
				WHEN t.state_key = 'todo' AND (
					t.due_at >= v_task_as_of
					OR (t.due_at IS NULL AND t.start_at >= v_task_as_of)
				) THEN 'scheduled'
				WHEN t.state_key = 'in_progress' THEN 'in_progress'
				WHEN t.state_key = 'blocked' THEN 'blocked'
				ELSE 'backlog'
			END AS task_bucket
		FROM public.onto_tasks t
		WHERE t.project_id = p_project_id
			AND t.deleted_at IS NULL
	),
	ranked_tasks AS MATERIALIZED (
		SELECT
			ct.*,
			row_number() OVER (
				PARTITION BY ct.task_bucket
				ORDER BY
					COALESCE(ct.priority, 5) ASC,
					CASE WHEN ct.task_bucket = 'done' THEN ct.completed_at END DESC NULLS LAST,
					CASE WHEN ct.task_bucket <> 'done' THEN ct.due_at END ASC NULLS LAST,
					CASE WHEN ct.task_bucket <> 'done' THEN ct.start_at END ASC NULLS LAST,
					ct.updated_at DESC,
					ct.id ASC
			) AS bucket_rank
		FROM classified_tasks ct
	),
	selected_tasks AS MATERIALIZED (
		SELECT *
		FROM ranked_tasks
		WHERE bucket_rank <= v_task_limit
	),
	bucket_counts AS (
		SELECT
			count(*) FILTER (WHERE task_bucket = 'backlog') AS backlog_total,
			count(*) FILTER (WHERE task_bucket = 'in_progress') AS in_progress_total,
			count(*) FILTER (WHERE task_bucket = 'scheduled') AS scheduled_total,
			count(*) FILTER (WHERE task_bucket = 'overdue') AS overdue_total,
			count(*) FILTER (WHERE task_bucket = 'blocked') AS blocked_total,
			count(*) FILTER (WHERE task_bucket = 'done') AS done_total,
			count(*) AS all_total
		FROM classified_tasks
	),
	pulse_tasks AS MATERIALIZED (
		SELECT
			ct.*,
			CASE
				WHEN COALESCE(ct.due_at, ct.start_at) < v_task_as_of THEN 0
				ELSE 1
			END AS pulse_group,
			COALESCE(ct.due_at, ct.start_at) AS pulse_at
		FROM classified_tasks ct
		WHERE ct.state_key <> 'done'
			AND COALESCE(ct.due_at, ct.start_at) IS NOT NULL
		ORDER BY
			pulse_group ASC,
			pulse_at ASC,
			ct.id ASC
		LIMIT 6
	)
	SELECT jsonb_build_object(
		'tasks', COALESCE((
			SELECT jsonb_agg(
				to_jsonb(st) - 'task_bucket' - 'bucket_rank'
				ORDER BY
					CASE st.task_bucket
						WHEN 'backlog' THEN 1
						WHEN 'in_progress' THEN 2
						WHEN 'scheduled' THEN 3
						WHEN 'overdue' THEN 4
						WHEN 'blocked' THEN 5
						WHEN 'done' THEN 6
						ELSE 7
					END,
					st.bucket_rank
			)
			FROM selected_tasks st
		), '[]'::jsonb),
		'tasks_coverage', (
			SELECT jsonb_build_object(
				'scope', 'initial-board',
				'as_of', v_task_as_of,
				'complete',
					bc.backlog_total <= v_task_limit
					AND bc.in_progress_total <= v_task_limit
					AND bc.scheduled_total <= v_task_limit
					AND bc.overdue_total <= v_task_limit
					AND bc.blocked_total <= v_task_limit
					AND bc.done_total <= v_task_limit,
				'returned',
					LEAST(bc.backlog_total, v_task_limit)
					+ LEAST(bc.in_progress_total, v_task_limit)
					+ LEAST(bc.scheduled_total, v_task_limit)
					+ LEAST(bc.overdue_total, v_task_limit)
					+ LEAST(bc.blocked_total, v_task_limit)
					+ LEAST(bc.done_total, v_task_limit),
				'total', bc.all_total,
				'limit_per_bucket', v_task_limit,
				'buckets', jsonb_build_object(
					'backlog', jsonb_build_object(
						'returned', LEAST(bc.backlog_total, v_task_limit),
						'total', bc.backlog_total,
						'complete', bc.backlog_total <= v_task_limit
					),
					'in_progress', jsonb_build_object(
						'returned', LEAST(bc.in_progress_total, v_task_limit),
						'total', bc.in_progress_total,
						'complete', bc.in_progress_total <= v_task_limit
					),
					'scheduled', jsonb_build_object(
						'returned', LEAST(bc.scheduled_total, v_task_limit),
						'total', bc.scheduled_total,
						'complete', bc.scheduled_total <= v_task_limit
					),
					'overdue', jsonb_build_object(
						'returned', LEAST(bc.overdue_total, v_task_limit),
						'total', bc.overdue_total,
						'complete', bc.overdue_total <= v_task_limit
					),
					'blocked', jsonb_build_object(
						'returned', LEAST(bc.blocked_total, v_task_limit),
						'total', bc.blocked_total,
						'complete', bc.blocked_total <= v_task_limit
					),
					'done', jsonb_build_object(
						'returned', LEAST(bc.done_total, v_task_limit),
						'total', bc.done_total,
						'complete', bc.done_total <= v_task_limit
					)
				)
			)
			FROM bucket_counts bc
		),
		'pulse_tasks', COALESCE((
			SELECT jsonb_agg(
				to_jsonb(pt) - 'task_bucket' - 'pulse_group' - 'pulse_at'
				ORDER BY pt.pulse_group, pt.pulse_at, pt.id
			)
			FROM pulse_tasks pt
		), '[]'::jsonb),
		'task_assignees', COALESCE((
			SELECT jsonb_object_agg(task_id::text, assignees)
			FROM (
				SELECT
					ta.task_id,
					jsonb_agg(
						jsonb_build_object(
							'actor_id', a.id,
							'user_id', a.user_id,
							'name', a.name,
							-- Emails stay with the person and the project owner (Tasker 158).
							'email', CASE
								WHEN a.id = v_actor_id
									OR EXISTS (
										SELECT 1 FROM public.onto_projects op
										WHERE op.id = p_project_id AND op.created_by = v_actor_id
									)
								THEN a.email
							END,
							'assigned_at', ta.created_at
						)
						ORDER BY ta.created_at ASC
					) AS assignees
				FROM public.onto_task_assignees ta
				JOIN public.onto_actors a ON a.id = ta.assignee_actor_id
				WHERE ta.project_id = p_project_id
					AND ta.task_id IN (SELECT id FROM selected_tasks)
				GROUP BY ta.task_id
			) grouped
		), '{}'::jsonb),
		'task_last_changed_by', COALESCE((
			WITH latest_logs AS (
				SELECT DISTINCT ON (l.entity_id)
					l.entity_id,
					l.changed_by_actor_id,
					l.changed_by
				FROM public.onto_project_logs l
				WHERE l.project_id = p_project_id
					AND l.entity_type = 'task'
					AND l.action IN ('created', 'updated')
					AND l.entity_id IN (SELECT id FROM selected_tasks)
				ORDER BY l.entity_id, l.created_at DESC
			),
			resolved AS (
				SELECT
					ll.entity_id,
					COALESCE(
						ll.changed_by_actor_id,
						(
							SELECT a.id
							FROM public.onto_actors a
							WHERE ll.changed_by IS NOT NULL
								AND a.user_id = ll.changed_by
							LIMIT 1
						)
					) AS actor_id
				FROM latest_logs ll
			)
			SELECT jsonb_object_agg(entity_id::text, actor_id)
			FROM resolved
			WHERE actor_id IS NOT NULL
		), '{}'::jsonb)
	)
	INTO v_task_payload;

	SELECT jsonb_build_object(
		'project', v_project,
		'current_actor_id', v_actor_id,
		'goals', COALESCE((
			SELECT jsonb_agg(to_jsonb(g) - 'created_at' ORDER BY g.created_at)
			FROM (
				SELECT
					g.created_at,
					g.description,
					g.goal,
					g.id,
					g.name,
					g.state_key,
					g.target_date
				FROM public.onto_goals g
				WHERE g.project_id = p_project_id
					AND g.deleted_at IS NULL
			) g
		), '[]'::jsonb),
		'plans', COALESCE((
			SELECT jsonb_agg(to_jsonb(pl) - 'created_at' ORDER BY pl.created_at)
			FROM (
				SELECT
					pl.created_at,
					pl.description,
					pl.id,
					pl.name,
					pl.state_key
				FROM public.onto_plans pl
				WHERE pl.project_id = p_project_id
					AND pl.deleted_at IS NULL
			) pl
		), '[]'::jsonb),
		'tasks', v_task_payload->'tasks',
		'tasks_coverage', v_task_payload->'tasks_coverage',
		'pulse_tasks', v_task_payload->'pulse_tasks',
		'documents', COALESCE((
			SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at)
			FROM (
				SELECT
					d.content IS NOT NULL AND length(btrim(d.content)) > 0 AS has_content,
					d.created_at,
					d.description,
					d.id,
					d.state_key,
					d.title,
					d.type_key,
					d.updated_at
				FROM public.onto_documents d
				WHERE d.project_id = p_project_id
					AND d.deleted_at IS NULL
			) d
		), '[]'::jsonb),
		'milestones', COALESCE((
			SELECT jsonb_agg(
				to_jsonb(m) - 'created_at'
				ORDER BY m.due_at NULLS LAST, m.created_at
			)
			FROM (
				SELECT
					m.created_at,
					m.due_at,
					m.id,
					m.state_key,
					m.title
				FROM public.onto_milestones m
				WHERE m.project_id = p_project_id
					AND m.deleted_at IS NULL
			) m
		), '[]'::jsonb),
		'risks', COALESCE((
			SELECT jsonb_agg(to_jsonb(rk) - 'created_at' ORDER BY rk.created_at)
			FROM (
				SELECT
					rk.content,
					rk.created_at,
					rk.id,
					rk.state_key,
					rk.title
				FROM public.onto_risks rk
				WHERE rk.project_id = p_project_id
					AND rk.deleted_at IS NULL
			) rk
		), '[]'::jsonb),
		'context_document', (
			SELECT to_jsonb(d)
			FROM (
				SELECT
					d.content IS NOT NULL AND length(btrim(d.content)) > 0 AS has_content,
					d.created_at,
					d.description,
					d.id,
					d.state_key,
					d.title,
					d.type_key,
					d.updated_at
				FROM public.onto_documents d
				WHERE d.project_id = p_project_id
					AND d.type_key = 'document.context.project'
					AND d.deleted_at IS NULL
				ORDER BY
					CASE
						WHEN d.props->>'origin' = 'start_here_template' THEN 0
						WHEN btrim(coalesce(d.title, '')) ~* '^start\s+here\y' THEN 1
						WHEN btrim(coalesce(d.content, '')) ~* '^#\s+start\s+here\y' THEN 2
						ELSE 3
					END,
					COALESCE(d.updated_at, d.created_at) DESC
				LIMIT 1
			) d
		),
		'goal_milestone_edges', COALESCE((
			SELECT jsonb_agg(jsonb_build_object(
				'src_id', e.src_id,
				'dst_id', e.dst_id,
				'created_at', e.created_at
			))
			FROM public.onto_edges e
			JOIN public.onto_goals g
				ON g.id = e.src_id
				AND g.project_id = p_project_id
				AND g.deleted_at IS NULL
			JOIN public.onto_milestones m
				ON m.id = e.dst_id
				AND m.project_id = p_project_id
				AND m.deleted_at IS NULL
			WHERE e.src_kind = 'goal'
				AND e.dst_kind = 'milestone'
				AND e.rel = 'has_milestone'
		), '[]'::jsonb),
		'task_assignees', v_task_payload->'task_assignees',
		'task_last_changed_by', v_task_payload->'task_last_changed_by'
	)
	INTO v_result;

	RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.load_fastchat_context(p_context_type text, p_user_id uuid, p_project_id uuid DEFAULT NULL::uuid, p_focus_type text DEFAULT NULL::text, p_focus_entity_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_projects jsonb;
  v_project jsonb;
  v_goals jsonb;
  v_goals_total integer := 0;
  v_milestones jsonb;
  v_milestones_total integer := 0;
  v_plans jsonb;
  v_plans_total integer := 0;
  v_tasks jsonb;
  v_tasks_total integer := 0;
  v_documents jsonb;
  v_documents_total integer := 0;
  v_documents_linked_total integer := 0;
  v_documents_unlinked_total integer := 0;
  v_events jsonb;
  v_events_total integer := 0;
  v_members jsonb;
  v_logs jsonb;
  v_focus_entity jsonb;
  v_linked_edges jsonb;
  v_linked_entities jsonb;
  v_project_ids uuid[];
  v_user_id uuid;
  v_actor_id uuid;
BEGIN
  v_user_id := p_user_id;
  IF auth.role() <> 'service_role' THEN
    v_user_id := auth.uid();
  END IF;
  IF v_user_id IS NOT NULL THEN
    IF auth.role() = 'service_role' THEN
      v_actor_id := ensure_actor_for_user(v_user_id);
    ELSE
      v_actor_id := current_actor_id();
    END IF;
  END IF;

  IF p_context_type = 'global' THEN
    IF v_user_id IS NULL THEN
      RETURN jsonb_build_object(
        'projects', '[]'::jsonb,
        'goals', '[]'::jsonb,
        'milestones', '[]'::jsonb,
        'plans', '[]'::jsonb,
        'project_logs', '[]'::jsonb,
        'project_intelligence', public.build_fastchat_project_intelligence('global', v_user_id, NULL)
      );
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
    INTO v_projects
    FROM (
      SELECT
        ps.id,
        ps.name,
        ps.state_key,
        ps.description,
        p.start_at,
        p.end_at,
        ps.next_step_short,
        ps.updated_at
      FROM get_onto_project_summaries_v1(v_actor_id) ps
      INNER JOIN onto_projects p ON p.id = ps.id
      ORDER BY ps.updated_at DESC
    ) p;

    SELECT array_agg(id ORDER BY updated_at DESC)
    INTO v_project_ids
    FROM get_onto_project_summaries_v1(v_actor_id);

    IF v_project_ids IS NULL OR array_length(v_project_ids, 1) IS NULL THEN
      RETURN jsonb_build_object(
        'projects', v_projects,
        'goals', '[]'::jsonb,
        'milestones', '[]'::jsonb,
        'plans', '[]'::jsonb,
        'project_logs', '[]'::jsonb,
        'project_intelligence', public.build_fastchat_project_intelligence('global', v_user_id, NULL)
      );
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(g)), '[]'::jsonb)
    INTO v_goals
    FROM (
      SELECT id, project_id, name, description, state_key, target_date, completed_at, updated_at
      FROM (
        SELECT
          g.id,
          g.project_id,
          g.name,
          g.description,
          g.state_key,
          g.target_date,
          g.completed_at,
          g.updated_at,
          row_number() OVER (
            PARTITION BY g.project_id
            ORDER BY
              CASE WHEN g.is_completed THEN 1 ELSE 0 END ASC,
              CASE
                WHEN g.is_completed THEN NULL
                WHEN g.target_date IS NULL THEN 3
                WHEN g.target_date < now() THEN 0
                WHEN g.target_date <= (now() + interval '7 days') THEN 1
                ELSE 2
              END ASC NULLS LAST,
              CASE
                WHEN g.is_completed THEN NULL
                WHEN g.state_norm IN ('active', 'in_progress') THEN 0
                WHEN g.state_norm IN ('todo', 'pending', 'draft') THEN 1
                WHEN g.state_norm = 'blocked' THEN 2
                ELSE 3
              END ASC NULLS LAST,
              CASE WHEN g.is_completed THEN g.completed_at ELSE NULL END DESC NULLS LAST,
              g.updated_at DESC NULLS LAST,
              g.id ASC
          ) AS project_rank
        FROM (
          SELECT
            id,
            project_id,
            name,
            description,
            state_key,
            target_date,
            completed_at,
            updated_at,
            lower(btrim(COALESCE(state_key::text, ''))) AS state_norm,
            (
              completed_at IS NOT NULL
              OR lower(btrim(COALESCE(state_key::text, ''))) IN ('done', 'completed', 'closed', 'archived', 'cancelled', 'canceled')
            ) AS is_completed
          FROM onto_goals
          WHERE project_id = ANY(v_project_ids)
            AND deleted_at IS NULL
            AND archived_at IS NULL
        ) g
      ) g
      WHERE g.project_rank <= 4
      ORDER BY array_position(v_project_ids, g.project_id), g.project_rank
    ) g;

    SELECT COALESCE(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
    INTO v_milestones
    FROM (
      SELECT id, project_id, title, description, state_key, due_at, completed_at, updated_at
      FROM (
        SELECT
          m.id,
          m.project_id,
          m.title,
          m.description,
          m.state_key,
          m.due_at,
          m.completed_at,
          m.updated_at,
          row_number() OVER (
            PARTITION BY m.project_id
            ORDER BY
              CASE WHEN m.is_completed THEN 1 ELSE 0 END ASC,
              CASE
                WHEN m.is_completed THEN NULL
                WHEN m.due_at IS NULL THEN 3
                WHEN m.due_at < now() THEN 0
                WHEN m.due_at <= (now() + interval '7 days') THEN 1
                ELSE 2
              END ASC NULLS LAST,
              CASE
                WHEN m.is_completed THEN NULL
                WHEN m.state_norm = 'missed' THEN 0
                WHEN m.state_norm = 'in_progress' THEN 1
                WHEN m.state_norm IN ('pending', 'todo') THEN 2
                WHEN m.state_norm = 'draft' THEN 3
                ELSE 4
              END ASC NULLS LAST,
              CASE WHEN m.is_completed THEN m.completed_at ELSE NULL END DESC NULLS LAST,
              m.updated_at DESC NULLS LAST,
              m.id ASC
          ) AS project_rank
        FROM (
          SELECT
            id,
            project_id,
            title,
            description,
            state_key,
            due_at,
            completed_at,
            updated_at,
            lower(btrim(COALESCE(state_key::text, ''))) AS state_norm,
            (
              completed_at IS NOT NULL
              OR lower(btrim(COALESCE(state_key::text, ''))) IN ('done', 'completed', 'closed', 'archived', 'cancelled', 'canceled')
            ) AS is_completed
          FROM onto_milestones
          WHERE project_id = ANY(v_project_ids)
            AND deleted_at IS NULL
            AND archived_at IS NULL
        ) m
      ) m
      WHERE m.project_rank <= 4
      ORDER BY array_position(v_project_ids, m.project_id), m.project_rank
    ) m;

    SELECT COALESCE(jsonb_agg(to_jsonb(pl)), '[]'::jsonb)
    INTO v_plans
    FROM (
      SELECT id, project_id, name, description, state_key, updated_at
      FROM (
        SELECT
          pl.id,
          pl.project_id,
          pl.name,
          pl.description,
          pl.state_key,
          pl.updated_at,
          row_number() OVER (
            PARTITION BY pl.project_id
            ORDER BY
              CASE WHEN pl.is_completed THEN 1 ELSE 0 END ASC,
              CASE
                WHEN pl.state_norm IN ('active', 'in_progress') THEN 0
                WHEN pl.state_norm = 'blocked' THEN 1
                WHEN pl.state_norm IN ('todo', 'pending', 'draft') THEN 2
                ELSE 3
              END ASC,
              pl.updated_at DESC NULLS LAST,
              pl.id ASC
          ) AS project_rank
        FROM (
          SELECT
            id,
            project_id,
            name,
            description,
            state_key,
            updated_at,
            lower(btrim(COALESCE(state_key::text, ''))) AS state_norm,
            lower(btrim(COALESCE(state_key::text, ''))) IN ('done', 'completed', 'closed', 'archived', 'cancelled', 'canceled') AS is_completed
          FROM onto_plans
          WHERE project_id = ANY(v_project_ids)
            AND deleted_at IS NULL
            AND archived_at IS NULL
        ) pl
      ) pl
      WHERE pl.project_rank <= 4
      ORDER BY array_position(v_project_ids, pl.project_id), pl.project_rank
    ) pl;

    SELECT COALESCE(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
    INTO v_logs
    FROM (
      SELECT project_id, entity_type, entity_id, action, created_at, after_data, before_data
      FROM (
        SELECT
          l.project_id,
          l.entity_type,
          l.entity_id,
          l.action,
          l.created_at,
          l.after_data,
          l.before_data,
          row_number() OVER (
            PARTITION BY l.project_id
            ORDER BY l.created_at DESC, l.entity_id ASC
          ) AS project_rank
        FROM onto_project_logs l
        WHERE l.project_id = ANY(v_project_ids)
      ) l
      WHERE l.project_rank <= 6
      ORDER BY array_position(v_project_ids, l.project_id), l.project_rank
    ) l;

    RETURN jsonb_build_object(
      'projects', v_projects,
      'goals', v_goals,
      'milestones', v_milestones,
      'plans', v_plans,
      'project_logs', v_logs,
      'project_intelligence', public.build_fastchat_project_intelligence('global', v_user_id, NULL)
    );
  END IF;

  IF p_project_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT actor_has_project_member_access(v_actor_id, p_project_id, 'read') THEN
    RETURN NULL;
  END IF;

  SELECT to_jsonb(p)
  INTO v_project
  FROM (
    SELECT id, name, state_key, description, start_at, end_at, next_step_short, updated_at, doc_structure
    FROM onto_projects
    WHERE id = p_project_id
      AND deleted_at IS NULL
  ) p;

  IF v_project IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    COALESCE(jsonb_agg(to_jsonb(g)), '[]'::jsonb),
    COALESCE(MAX(g.total_count), 0)
  INTO v_goals, v_goals_total
  FROM (
    SELECT id, project_id, name, description, state_key, target_date, completed_at, updated_at, total_count
    FROM (
      SELECT
        g.id,
        g.project_id,
        g.name,
        g.description,
        g.state_key,
        g.target_date,
        g.completed_at,
        g.updated_at,
        count(*) OVER () AS total_count,
        lower(btrim(COALESCE(g.state_key::text, ''))) AS state_norm,
        (
          g.completed_at IS NOT NULL
          OR lower(btrim(COALESCE(g.state_key::text, ''))) IN ('done', 'completed', 'closed', 'archived', 'cancelled', 'canceled')
        ) AS is_completed
      FROM onto_goals g
      WHERE g.project_id = p_project_id
        AND g.deleted_at IS NULL
        AND g.archived_at IS NULL
    ) g
    ORDER BY
      CASE WHEN g.is_completed THEN 1 ELSE 0 END ASC,
      CASE
        WHEN g.is_completed THEN NULL
        WHEN g.target_date IS NULL THEN 3
        WHEN g.target_date < now() THEN 0
        WHEN g.target_date <= (now() + interval '7 days') THEN 1
        ELSE 2
      END ASC NULLS LAST,
      CASE
        WHEN g.is_completed THEN NULL
        WHEN g.state_norm IN ('active', 'in_progress') THEN 0
        WHEN g.state_norm IN ('todo', 'pending', 'draft') THEN 1
        WHEN g.state_norm = 'blocked' THEN 2
        ELSE 3
      END ASC NULLS LAST,
      CASE WHEN g.is_completed THEN g.completed_at ELSE NULL END DESC NULLS LAST,
      g.updated_at DESC NULLS LAST,
      g.id ASC
    LIMIT 12
  ) g;

  SELECT
    COALESCE(jsonb_agg(to_jsonb(m)), '[]'::jsonb),
    COALESCE(MAX(m.total_count), 0)
  INTO v_milestones, v_milestones_total
  FROM (
    SELECT id, project_id, title, description, state_key, due_at, completed_at, updated_at, total_count
    FROM (
      SELECT
        m.id,
        m.project_id,
        m.title,
        m.description,
        m.state_key,
        m.due_at,
        m.completed_at,
        m.updated_at,
        count(*) OVER () AS total_count,
        lower(btrim(COALESCE(m.state_key::text, ''))) AS state_norm,
        (
          m.completed_at IS NOT NULL
          OR lower(btrim(COALESCE(m.state_key::text, ''))) IN ('done', 'completed', 'closed', 'archived', 'cancelled', 'canceled')
        ) AS is_completed
      FROM onto_milestones m
      WHERE m.project_id = p_project_id
        AND m.deleted_at IS NULL
        AND m.archived_at IS NULL
    ) m
    ORDER BY
      CASE WHEN m.is_completed THEN 1 ELSE 0 END ASC,
      CASE
        WHEN m.is_completed THEN NULL
        WHEN m.due_at IS NULL THEN 3
        WHEN m.due_at < now() THEN 0
        WHEN m.due_at <= (now() + interval '7 days') THEN 1
        ELSE 2
      END ASC NULLS LAST,
      CASE
        WHEN m.is_completed THEN NULL
        WHEN m.state_norm = 'missed' THEN 0
        WHEN m.state_norm = 'in_progress' THEN 1
        WHEN m.state_norm IN ('pending', 'todo') THEN 2
        WHEN m.state_norm = 'draft' THEN 3
        ELSE 4
      END ASC NULLS LAST,
      CASE WHEN m.is_completed THEN m.completed_at ELSE NULL END DESC NULLS LAST,
      m.updated_at DESC NULLS LAST,
      m.id ASC
    LIMIT 12
  ) m;

  SELECT
    COALESCE(jsonb_agg(to_jsonb(pl)), '[]'::jsonb),
    COALESCE(MAX(pl.total_count), 0)
  INTO v_plans, v_plans_total
  FROM (
    SELECT id, project_id, name, description, state_key, updated_at, total_count
    FROM (
      SELECT
        pl.id,
        pl.project_id,
        pl.name,
        pl.description,
        pl.state_key,
        pl.updated_at,
        count(*) OVER () AS total_count,
        lower(btrim(COALESCE(pl.state_key::text, ''))) AS state_norm,
        lower(btrim(COALESCE(pl.state_key::text, ''))) IN ('done', 'completed', 'closed', 'archived', 'cancelled', 'canceled') AS is_completed
      FROM onto_plans pl
      WHERE pl.project_id = p_project_id
        AND pl.deleted_at IS NULL
        AND pl.archived_at IS NULL
    ) pl
    ORDER BY
      CASE WHEN pl.is_completed THEN 1 ELSE 0 END ASC,
      CASE
        WHEN pl.state_norm IN ('active', 'in_progress') THEN 0
        WHEN pl.state_norm = 'blocked' THEN 1
        WHEN pl.state_norm IN ('todo', 'pending', 'draft') THEN 2
        ELSE 3
      END ASC,
      pl.updated_at DESC NULLS LAST,
      pl.id ASC
    LIMIT 12
  ) pl;

  SELECT
    COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb),
    COALESCE(MAX(t.total_count), 0)
  INTO v_tasks, v_tasks_total
  FROM (
    SELECT
      id,
      project_id,
      title,
      description,
      state_key,
      priority,
      start_at,
      due_at,
      completed_at,
      updated_at,
      total_count
    FROM (
      SELECT
        t.id,
        t.project_id,
        t.title,
        t.description,
        t.state_key,
        t.priority,
        t.start_at,
        t.due_at,
        t.completed_at,
        t.updated_at,
        count(*) OVER () AS total_count,
        lower(btrim(COALESCE(t.state_key::text, ''))) AS state_norm,
        (
          t.completed_at IS NOT NULL
          OR lower(btrim(COALESCE(t.state_key::text, ''))) IN ('done', 'completed', 'closed', 'archived', 'cancelled', 'canceled')
        ) AS is_completed
      FROM onto_tasks t
      WHERE t.project_id = p_project_id
        AND t.deleted_at IS NULL
        AND t.archived_at IS NULL
    ) t
    ORDER BY
      CASE WHEN t.is_completed THEN 1 ELSE 0 END ASC,
      CASE
        WHEN t.is_completed THEN NULL
        WHEN t.due_at IS NULL THEN 3
        WHEN t.due_at < now() THEN 0
        WHEN t.due_at <= (now() + interval '7 days') THEN 1
        ELSE 2
      END ASC NULLS LAST,
      CASE
        WHEN t.is_completed THEN NULL
        WHEN t.state_norm = 'in_progress' THEN 0
        WHEN t.state_norm = 'blocked' THEN 1
        WHEN t.state_norm IN ('todo', 'pending') THEN 2
        WHEN t.state_norm IN ('draft', 'backlog') THEN 3
        ELSE 4
      END ASC NULLS LAST,
      CASE WHEN t.is_completed THEN NULL ELSE t.priority END ASC NULLS LAST,
      CASE WHEN t.is_completed THEN t.completed_at ELSE NULL END DESC NULLS LAST,
      t.updated_at DESC NULLS LAST,
      t.start_at ASC NULLS LAST,
      t.id ASC
    LIMIT 18
  ) t;

  WITH RECURSIVE doc_nodes AS (
    SELECT root.node
    FROM jsonb_array_elements(COALESCE(v_project -> 'doc_structure' -> 'root', '[]'::jsonb)) AS root(node)

    UNION ALL

    SELECT child.node
    FROM doc_nodes
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(doc_nodes.node -> 'children', '[]'::jsonb)) AS child(node)
  ),
  linked_doc_ids AS (
    SELECT DISTINCT node ->> 'id' AS id
    FROM doc_nodes
    WHERE node ? 'id'
  ),
  ranked_documents AS (
    SELECT
      d.id,
      d.project_id,
      d.title,
      d.state_key,
      d.created_at,
      d.updated_at,
      count(*) OVER () AS total_count,
      sum(CASE WHEN l.id IS NOT NULL THEN 1 ELSE 0 END) OVER () AS linked_total,
      sum(CASE WHEN l.id IS NULL THEN 1 ELSE 0 END) OVER () AS unlinked_total,
      (l.id IS NOT NULL) AS is_linked,
      GREATEST(
        COALESCE(EXTRACT(EPOCH FROM d.updated_at), '-Infinity'::double precision),
        COALESCE(EXTRACT(EPOCH FROM d.created_at), '-Infinity'::double precision)
      ) AS recency_rank
    FROM onto_documents d
    LEFT JOIN linked_doc_ids l ON l.id = d.id::text
    WHERE d.project_id = p_project_id
      AND d.deleted_at IS NULL
      AND d.archived_at IS NULL
      AND COALESCE(d.state_key::text, '') <> 'archived'
  )
  SELECT
    COALESCE(jsonb_agg(to_jsonb(d)), '[]'::jsonb),
    COALESCE(MAX(d.total_count), 0),
    COALESCE(MAX(d.linked_total), 0),
    COALESCE(MAX(d.unlinked_total), 0)
  INTO v_documents, v_documents_total, v_documents_linked_total, v_documents_unlinked_total
  FROM (
    SELECT id, project_id, title, state_key, created_at, updated_at, total_count, linked_total, unlinked_total
    FROM ranked_documents d
    ORDER BY
      CASE WHEN d.is_linked THEN 1 ELSE 0 END ASC,
      d.recency_rank DESC,
      COALESCE(d.title, '') ASC
    LIMIT 20
  ) d;

  SELECT
    COALESCE(jsonb_agg(to_jsonb(e)), '[]'::jsonb),
    COALESCE(MAX(e.total_count), 0)
  INTO v_events, v_events_total
  FROM (
    SELECT
      id,
      project_id,
      title,
      description,
      state_key,
      start_at,
      end_at,
      all_day,
      location,
      updated_at,
      total_count
    FROM (
      SELECT
        e.id,
        e.project_id,
        e.title,
        e.description,
        e.state_key,
        e.start_at,
        e.end_at,
        e.all_day,
        e.location,
        e.updated_at,
        count(*) OVER () AS total_count
      FROM onto_events e
      WHERE e.project_id = p_project_id
        AND e.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM onto_tasks owner_task
          WHERE e.owner_entity_type = 'task'
            AND owner_task.id = e.owner_entity_id
            AND (owner_task.deleted_at IS NOT NULL OR owner_task.archived_at IS NOT NULL)
        )
        AND e.start_at >= (now() - interval '7 days')
        AND e.start_at <= (now() + interval '14 days')
    ) e
    ORDER BY e.start_at ASC NULLS LAST, e.id ASC
    LIMIT 16
  ) e;

  SELECT COALESCE(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
  INTO v_members
  FROM (
    SELECT
      pm.id,
      pm.project_id,
      pm.actor_id,
      pm.role_key,
      pm.access,
      pm.role_name,
      pm.role_description,
      pm.created_at,
      a.name AS actor_name,
      -- Emails stay with the person and the project owner (Tasker 158).
      CASE
        WHEN a.id = v_actor_id
          OR EXISTS (
            SELECT 1 FROM public.onto_projects op
            WHERE op.id = p_project_id AND op.created_by = v_actor_id
          )
        THEN a.email
      END AS actor_email
    FROM onto_project_members pm
    LEFT JOIN onto_actors a ON a.id = pm.actor_id
    WHERE pm.project_id = p_project_id
      AND pm.removed_at IS NULL
    ORDER BY
      CASE pm.role_key
        WHEN 'owner' THEN 0
        WHEN 'editor' THEN 1
        ELSE 2
      END,
      pm.created_at ASC
  ) m;

  IF p_focus_type IS NOT NULL AND p_focus_entity_id IS NOT NULL THEN
    CASE p_focus_type
      WHEN 'task' THEN
        SELECT to_jsonb(t) INTO v_focus_entity
        FROM onto_tasks t
        WHERE t.id = p_focus_entity_id AND t.project_id = p_project_id AND t.deleted_at IS NULL;
      WHEN 'goal' THEN
        SELECT to_jsonb(g) INTO v_focus_entity
        FROM onto_goals g
        WHERE g.id = p_focus_entity_id AND g.project_id = p_project_id AND g.deleted_at IS NULL;
      WHEN 'plan' THEN
        SELECT to_jsonb(pl) INTO v_focus_entity
        FROM onto_plans pl
        WHERE pl.id = p_focus_entity_id AND pl.project_id = p_project_id AND pl.deleted_at IS NULL;
      WHEN 'document' THEN
        SELECT to_jsonb(d) INTO v_focus_entity
        FROM onto_documents d
        WHERE d.id = p_focus_entity_id AND d.project_id = p_project_id AND d.deleted_at IS NULL;
      WHEN 'milestone' THEN
        SELECT to_jsonb(m) INTO v_focus_entity
        FROM onto_milestones m
        WHERE m.id = p_focus_entity_id AND m.project_id = p_project_id AND m.deleted_at IS NULL;
      WHEN 'risk' THEN
        SELECT to_jsonb(r) INTO v_focus_entity
        FROM onto_risks r
        WHERE r.id = p_focus_entity_id AND r.project_id = p_project_id AND r.deleted_at IS NULL;
      WHEN 'requirement' THEN
        SELECT to_jsonb(rq) INTO v_focus_entity
        FROM onto_requirements rq
        WHERE rq.id = p_focus_entity_id AND rq.project_id = p_project_id AND rq.deleted_at IS NULL;
      ELSE
        v_focus_entity := NULL;
    END CASE;

    WITH edges AS (
      SELECT src_id, src_kind, dst_id, dst_kind, rel
      FROM onto_edges
      WHERE project_id = p_project_id
        AND (src_id = p_focus_entity_id OR dst_id = p_focus_entity_id)
    )
    SELECT COALESCE(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
    INTO v_linked_edges
    FROM (SELECT * FROM edges) e;

    WITH edges AS (
      SELECT src_id, src_kind, dst_id, dst_kind, rel
      FROM onto_edges
      WHERE project_id = p_project_id
        AND (src_id = p_focus_entity_id OR dst_id = p_focus_entity_id)
    ),
    linked AS (
      SELECT dst_kind AS kind, dst_id AS id
      FROM edges
      WHERE src_id = p_focus_entity_id
      UNION
      SELECT src_kind AS kind, src_id AS id
      FROM edges
      WHERE dst_id = p_focus_entity_id
    )
    SELECT jsonb_build_object(
      'project', COALESCE((
        SELECT jsonb_agg(to_jsonb(p))
        FROM (
          SELECT id, name, state_key, description, start_at, end_at, next_step_short, updated_at
          FROM onto_projects
          WHERE id IN (SELECT id FROM linked WHERE kind = 'project')
            AND deleted_at IS NULL
        ) p
      ), '[]'::jsonb),
      'task', COALESCE((
        SELECT jsonb_agg(to_jsonb(t))
        FROM (
          SELECT id, title, description, state_key, priority, start_at, due_at, completed_at, updated_at
          FROM onto_tasks
          WHERE id IN (SELECT id FROM linked WHERE kind = 'task')
            AND deleted_at IS NULL
            AND archived_at IS NULL
        ) t
      ), '[]'::jsonb),
      'plan', COALESCE((
        SELECT jsonb_agg(to_jsonb(pl))
        FROM (
          SELECT id, name, description, state_key, updated_at
          FROM onto_plans
          WHERE id IN (SELECT id FROM linked WHERE kind = 'plan')
            AND deleted_at IS NULL
            AND archived_at IS NULL
        ) pl
      ), '[]'::jsonb),
      'goal', COALESCE((
        SELECT jsonb_agg(to_jsonb(g))
        FROM (
          SELECT id, name, description, state_key, target_date, completed_at, updated_at
          FROM onto_goals
          WHERE id IN (SELECT id FROM linked WHERE kind = 'goal')
            AND deleted_at IS NULL
            AND archived_at IS NULL
        ) g
      ), '[]'::jsonb),
      'milestone', COALESCE((
        SELECT jsonb_agg(to_jsonb(m))
        FROM (
          SELECT id, title, description, state_key, due_at, completed_at, updated_at
          FROM onto_milestones
          WHERE id IN (SELECT id FROM linked WHERE kind = 'milestone')
            AND deleted_at IS NULL
            AND archived_at IS NULL
        ) m
      ), '[]'::jsonb),
      'document', COALESCE((
        SELECT jsonb_agg(to_jsonb(d))
        FROM (
          SELECT id, title, description, state_key, updated_at
          FROM onto_documents
          WHERE id IN (SELECT id FROM linked WHERE kind = 'document')
            AND deleted_at IS NULL
            AND archived_at IS NULL
            AND COALESCE(state_key::text, '') <> 'archived'
        ) d
      ), '[]'::jsonb),
      'event', COALESCE((
        SELECT jsonb_agg(to_jsonb(e))
        FROM (
          SELECT id, title, description, state_key, start_at, end_at, all_day, location, updated_at
          FROM onto_events
          WHERE id IN (SELECT id FROM linked WHERE kind = 'event')
            AND deleted_at IS NULL
        ) e
      ), '[]'::jsonb),
      'risk', COALESCE((
        SELECT jsonb_agg(to_jsonb(r))
        FROM (
          SELECT id, title, content, state_key, impact, probability, updated_at
          FROM onto_risks
          WHERE id IN (SELECT id FROM linked WHERE kind = 'risk')
            AND deleted_at IS NULL
            AND archived_at IS NULL
        ) r
      ), '[]'::jsonb),
      'requirement', COALESCE((
        SELECT jsonb_agg(to_jsonb(rq))
        FROM (
          SELECT id, text, priority, updated_at
          FROM onto_requirements
          WHERE id IN (SELECT id FROM linked WHERE kind = 'requirement')
            AND deleted_at IS NULL
        ) rq
      ), '[]'::jsonb)
    )
    INTO v_linked_entities;
  ELSE
    v_linked_edges := '[]'::jsonb;
    v_linked_entities := '{}'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'project', v_project,
    'goals', v_goals,
    'milestones', v_milestones,
    'plans', v_plans,
    'tasks', v_tasks,
    'documents', v_documents,
    'events', v_events,
    'entity_counts', jsonb_build_object(
      'goals_total', v_goals_total,
      'milestones_total', v_milestones_total,
      'plans_total', v_plans_total,
      'tasks_total', v_tasks_total,
      'documents_total', v_documents_total,
      'document_linked_total', v_documents_linked_total,
      'document_unlinked_total', v_documents_unlinked_total,
      'events_total', v_events_total
    ),
    'members', v_members,
    'focus_entity_full', v_focus_entity,
    'focus_entity_type', p_focus_type,
    'focus_entity_id', p_focus_entity_id,
    'linked_entities', v_linked_entities,
    'linked_edges', v_linked_edges,
    'project_intelligence', public.build_fastchat_project_intelligence('project', v_user_id, p_project_id)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_onto_public_page_slug_prefix(p_actor_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
	resolved_name TEXT;
BEGIN
	SELECT COALESCE(
		NULLIF(trim(u.username), ''),
		NULLIF(trim(a.name), ''),
		NULLIF(trim(u.name), ''),
		-- The email's local part is a last resort, and only for the person themselves.
		CASE
			WHEN auth.role() = 'service_role' OR a.user_id = auth.uid()
			THEN NULLIF(split_part(COALESCE(a.email, u.email, ''), '@', 1), '')
		END,
		'user'
	)
	INTO resolved_name
	FROM public.onto_actors a
	LEFT JOIN public.users u ON u.id = a.user_id
	WHERE a.id = p_actor_id;

	RETURN public.normalize_onto_public_page_slug_part(
		COALESCE(resolved_name, 'user'),
		24,
		'user'
	);
END;
$function$;
