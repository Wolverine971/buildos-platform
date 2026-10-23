-- supabase/migrations/20261023230000_workspace_foundation.sql
--
-- Workspace foundation (docs/specs/WORKSPACE_ARCHITECTURE_2026-10-23.md).
--
-- Each person gets one private Workspace: a project row with kind = 'workspace' that
-- holds loose notes, docs and tasks that aren't in a project yet. Loose items are
-- ordinary onto_documents / onto_tasks, so access rules, search, embeddings, the doc
-- tree, Today, the brief and the Organize mover (filing, with undo) keep working.
--
-- 1. onto_projects.kind ('project' | 'workspace'), one live workspace per actor.
-- 2. private.onto_projects_guard_workspace: kind never changes; a workspace keeps its
--    owner, name, state and shape (no parent, no children, no merge, never public),
--    and only the server (service_role) may archive or delete it. A real project can't
--    nest under or merge into a workspace.
-- 3. Sharing guards: a workspace has exactly one member (its owner), no invites and no
--    invite links.
-- 4. public.ensure_workspace_project(): the signed-in user's workspace id, created on
--    first use. public.ensure_workspace_project_for_user(uuid): the same for the
--    server (chat tools, the MCP connector, the worker). The row is created with a
--    tile emoji already set, so the paid pick_project_emoji job skips it.
-- 5. get_onto_project_summaries_v1 returns kind (callers filter; it also feeds Today
--    and chat, so it must keep returning the workspace).
-- 6. evaluate_user_consumption_gate no longer counts the workspace as a project.
--    Known, unchanged: in production this function raises 42702 "column reference
--    user_id is ambiguous" on every call (its RETURNS TABLE has a user_id column; checked
--    2026-10-23 in a read-only transaction), and callers treat the error as "not
--    frozen", so the free-plan limits never freeze anyone. Fixing that turns freezing on
--    and is a product decision, so the body is copied as-is with only the kind filter.
-- 7. get_daily_brief_eligible_user_ids counts a workspace only while it holds an open
--    task (so a workspace alone never produces empty briefs).
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_onto_projects_guard_workspace ON public.onto_projects;
--   DROP TRIGGER IF EXISTS trg_onto_project_members_guard_workspace ON public.onto_project_members;
--   DROP TRIGGER IF EXISTS trg_onto_project_invites_guard_workspace ON public.onto_project_invites;
--   DROP TRIGGER IF EXISTS trg_onto_project_invite_links_guard_workspace ON public.onto_project_invite_links;
--   DROP FUNCTION IF EXISTS public.ensure_workspace_project();
--   DROP FUNCTION IF EXISTS public.ensure_workspace_project_for_user(uuid);
--   (restore the three replaced functions from 20260925013000 / production definitions;
--    then) ALTER TABLE public.onto_projects DROP COLUMN kind;
--
-- Rehearse:
--   pnpm db:rehearse supabase/migrations/20261023230000_workspace_foundation.sql \
--     --check supabase/tests/20261023230000_workspace_foundation.check.sql --role-probe

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. The kind column
-- ---------------------------------------------------------------------------

ALTER TABLE public.onto_projects
	ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'project';

DO $kind$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_catalog.pg_constraint
		WHERE conname = 'onto_projects_kind_check'
			AND conrelid = 'public.onto_projects'::regclass
	) THEN
		ALTER TABLE public.onto_projects
			ADD CONSTRAINT onto_projects_kind_check CHECK (kind IN ('project', 'workspace'));
	END IF;
END $kind$;

COMMENT ON COLUMN public.onto_projects.kind IS
	'project: a focused effort. workspace: the owner''s private holding ground for loose notes, docs and tasks (one per actor, never shared).';

CREATE UNIQUE INDEX IF NOT EXISTS onto_projects_one_workspace_per_actor
	ON public.onto_projects (created_by)
	WHERE kind = 'workspace' AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Shape guard on onto_projects
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.onto_projects_guard_workspace()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
	v_claims text := NULLIF(current_setting('request.jwt.claims', true), '');
	v_role text;
	v_server boolean;
BEGIN
	IF v_claims IS NOT NULL THEN
		v_role := NULLIF((v_claims::jsonb) ->> 'role', '');
	END IF;
	-- Signed-in and anonymous API requests carry their role in the JWT claims. The
	-- server (service_role) and owner sessions (migrations, account deletion) don't.
	v_server := COALESCE(v_role, 'service_role') = 'service_role';

	IF TG_OP = 'INSERT' THEN
		IF NEW.kind = 'workspace' THEN
			IF NEW.parent_project_id IS NOT NULL
				OR NEW.merged_into_project_id IS NOT NULL
				OR COALESCE(NEW.is_public, false) THEN
				RAISE EXCEPTION USING
					ERRCODE = '42501',
					MESSAGE = 'workspace_shape_protected',
					DETAIL = 'The Workspace never nests, merges or goes public.';
			END IF;
		ELSIF NEW.parent_project_id IS NOT NULL AND EXISTS (
			SELECT 1 FROM public.onto_projects AS p
			WHERE p.id = NEW.parent_project_id AND p.kind = 'workspace'
		) THEN
			RAISE EXCEPTION USING
				ERRCODE = '42501',
				MESSAGE = 'workspace_cannot_hold_projects',
				DETAIL = 'Projects can''t go inside the Workspace.';
		END IF;
		RETURN NEW;
	END IF;

	IF NEW.kind IS DISTINCT FROM OLD.kind THEN
		RAISE EXCEPTION USING
			ERRCODE = '42501',
			MESSAGE = 'project_kind_immutable',
			DETAIL = 'A project never becomes the Workspace, and the Workspace never becomes a project.';
	END IF;

	IF NEW.kind = 'workspace' THEN
		IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
			RAISE EXCEPTION USING
				ERRCODE = '42501',
				MESSAGE = 'workspace_owner_fixed',
				DETAIL = 'The Workspace belongs to one person and can''t be handed over.';
		END IF;
		IF NEW.parent_project_id IS NOT NULL
			OR NEW.merged_into_project_id IS NOT NULL
			OR COALESCE(NEW.is_public, false) THEN
			RAISE EXCEPTION USING
				ERRCODE = '42501',
				MESSAGE = 'workspace_shape_protected',
				DETAIL = 'The Workspace never nests, merges or goes public.';
		END IF;
		IF NEW.name IS DISTINCT FROM OLD.name
			OR NEW.type_key IS DISTINCT FROM OLD.type_key
			OR NEW.state_key IS DISTINCT FROM OLD.state_key THEN
			RAISE EXCEPTION USING
				ERRCODE = '42501',
				MESSAGE = 'workspace_identity_fixed',
				DETAIL = 'The Workspace keeps its name and stays active. Rename or finish the items in it instead.';
		END IF;
		IF NOT v_server AND (
			NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
			OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
		) THEN
			RAISE EXCEPTION USING
				ERRCODE = '42501',
				MESSAGE = 'workspace_cannot_be_deleted',
				DETAIL = 'The Workspace can''t be archived or deleted. Delete the items in it instead.';
		END IF;
		RETURN NEW;
	END IF;

	IF NEW.parent_project_id IS NOT NULL
		AND NEW.parent_project_id IS DISTINCT FROM OLD.parent_project_id
		AND EXISTS (
			SELECT 1 FROM public.onto_projects AS p
			WHERE p.id = NEW.parent_project_id AND p.kind = 'workspace'
		) THEN
		RAISE EXCEPTION USING
			ERRCODE = '42501',
			MESSAGE = 'workspace_cannot_hold_projects',
			DETAIL = 'Projects can''t go inside the Workspace.';
	END IF;
	IF NEW.merged_into_project_id IS NOT NULL
		AND NEW.merged_into_project_id IS DISTINCT FROM OLD.merged_into_project_id
		AND EXISTS (
			SELECT 1 FROM public.onto_projects AS p
			WHERE p.id = NEW.merged_into_project_id AND p.kind = 'workspace'
		) THEN
		RAISE EXCEPTION USING
			ERRCODE = '42501',
			MESSAGE = 'workspace_cannot_hold_projects',
			DETAIL = 'Projects can''t be combined into the Workspace. Move their docs and tasks instead.';
	END IF;

	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.onto_projects_guard_workspace() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_onto_projects_guard_workspace ON public.onto_projects;
CREATE TRIGGER trg_onto_projects_guard_workspace
	BEFORE INSERT OR UPDATE ON public.onto_projects
	FOR EACH ROW EXECUTE FUNCTION private.onto_projects_guard_workspace();

-- ---------------------------------------------------------------------------
-- 3. Sharing guards
-- ---------------------------------------------------------------------------

-- Runs as the table owner so the project lookup sees the row whatever the caller's
-- access; it only reads onto_projects and raises.
CREATE OR REPLACE FUNCTION private.guard_workspace_not_shared()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
	IF TG_TABLE_NAME = 'onto_project_members' THEN
		IF EXISTS (
			SELECT 1 FROM public.onto_projects AS p
			WHERE p.id = NEW.project_id
				AND p.kind = 'workspace'
				AND p.created_by IS DISTINCT FROM NEW.actor_id
		) THEN
			RAISE EXCEPTION USING
				ERRCODE = '42501',
				MESSAGE = 'workspace_not_shareable',
				DETAIL = 'The Workspace is private. Move items into a project to share them.';
		END IF;
		RETURN NEW;
	END IF;

	IF EXISTS (
		SELECT 1 FROM public.onto_projects AS p
		WHERE p.id = NEW.project_id AND p.kind = 'workspace'
	) THEN
		RAISE EXCEPTION USING
			ERRCODE = '42501',
			MESSAGE = 'workspace_not_shareable',
			DETAIL = 'The Workspace is private. Move items into a project to share them.';
	END IF;
	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_workspace_not_shared() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_onto_project_members_guard_workspace ON public.onto_project_members;
CREATE TRIGGER trg_onto_project_members_guard_workspace
	BEFORE INSERT OR UPDATE OF project_id, actor_id ON public.onto_project_members
	FOR EACH ROW EXECUTE FUNCTION private.guard_workspace_not_shared();

DROP TRIGGER IF EXISTS trg_onto_project_invites_guard_workspace ON public.onto_project_invites;
CREATE TRIGGER trg_onto_project_invites_guard_workspace
	BEFORE INSERT OR UPDATE OF project_id ON public.onto_project_invites
	FOR EACH ROW EXECUTE FUNCTION private.guard_workspace_not_shared();

DO $links$
BEGIN
	IF to_regclass('public.onto_project_invite_links') IS NOT NULL THEN
		EXECUTE 'DROP TRIGGER IF EXISTS trg_onto_project_invite_links_guard_workspace ON public.onto_project_invite_links';
		EXECUTE 'CREATE TRIGGER trg_onto_project_invite_links_guard_workspace
			BEFORE INSERT OR UPDATE OF project_id ON public.onto_project_invite_links
			FOR EACH ROW EXECUTE FUNCTION private.guard_workspace_not_shared()';
	END IF;
END $links$;

-- ---------------------------------------------------------------------------
-- 4. Creating the workspace (lazily, on first use)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_workspace_project_for_user(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
	v_actor_id uuid;
	v_workspace_id uuid;
BEGIN
	IF p_user_id IS NULL THEN
		RAISE EXCEPTION 'ensure_workspace_project_for_user requires a user id'
			USING ERRCODE = '22004';
	END IF;

	-- Checks the caller: a signed-in user may only resolve themselves.
	v_actor_id := public.ensure_actor_for_user(p_user_id);

	SELECT p.id INTO v_workspace_id
	FROM public.onto_projects AS p
	WHERE p.created_by = v_actor_id
		AND p.kind = 'workspace'
		AND p.deleted_at IS NULL
	LIMIT 1;
	IF v_workspace_id IS NOT NULL THEN
		RETURN v_workspace_id;
	END IF;

	INSERT INTO public.onto_projects (
		name, description, type_key, state_key, kind, created_by, icon_emoji, props
	) VALUES (
		'Workspace',
		'Loose notes, docs and tasks that aren''t in a project yet.',
		'project.workspace',
		'active',
		'workspace',
		v_actor_id,
		-- Set up front so the paid pick_project_emoji job skips it.
		jsonb_build_object('glyphs', jsonb_build_array('🗂️'), 'source', 'user'),
		'{}'::jsonb
	)
	ON CONFLICT (created_by) WHERE kind = 'workspace' AND deleted_at IS NULL DO NOTHING
	RETURNING id INTO v_workspace_id;

	-- A concurrent first call may have created it while this one waited on the index.
	IF v_workspace_id IS NULL THEN
		SELECT p.id INTO v_workspace_id
		FROM public.onto_projects AS p
		WHERE p.created_by = v_actor_id
			AND p.kind = 'workspace'
			AND p.deleted_at IS NULL
		LIMIT 1;
	END IF;

	IF v_workspace_id IS NULL THEN
		RAISE EXCEPTION 'Could not create the workspace for user %', p_user_id;
	END IF;
	RETURN v_workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_workspace_project_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_workspace_project_for_user(uuid) TO service_role;

COMMENT ON FUNCTION public.ensure_workspace_project_for_user(uuid) IS
	'Server-only: the user''s Workspace project id (kind = workspace), created on first use.';

CREATE OR REPLACE FUNCTION public.ensure_workspace_project()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
	v_user_id uuid := auth.uid();
BEGIN
	IF v_user_id IS NULL THEN
		RAISE EXCEPTION 'ensure_workspace_project requires a signed-in user'
			USING ERRCODE = '42501';
	END IF;
	RETURN public.ensure_workspace_project_for_user(v_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_workspace_project() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_workspace_project() TO authenticated, service_role;

COMMENT ON FUNCTION public.ensure_workspace_project() IS
	'The signed-in user''s Workspace project id (kind = workspace), created on first use.';

-- ---------------------------------------------------------------------------
-- 5. Project summaries return kind
-- ---------------------------------------------------------------------------

-- The return type changes, so the function is dropped and created again (same body,
-- one more column at the end). Grants are re-asserted below.
DROP FUNCTION IF EXISTS public.get_onto_project_summaries_v1(uuid, integer);

CREATE FUNCTION public.get_onto_project_summaries_v1(p_actor_id uuid, p_limit integer DEFAULT NULL::integer)
 RETURNS TABLE(id uuid, name text, description text, icon_svg text, icon_concept text, icon_generated_at timestamp with time zone, icon_generation_source text, icon_generation_prompt text, type_key text, state_key text, props jsonb, facet_context text, facet_scale text, facet_stage text, created_at timestamp with time zone, updated_at timestamp with time zone, task_count bigint, goal_count bigint, plan_count bigint, document_count bigint, owner_actor_id uuid, access_role text, access_level text, is_shared boolean, next_step_short text, next_step_long text, next_step_source text, next_step_updated_at timestamp with time zone, kind text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
	v_actor_id uuid;
BEGIN
	IF p_actor_id IS NULL THEN
		RETURN;
	END IF;

	IF auth.role() = 'service_role' THEN
		v_actor_id := p_actor_id;
	ELSE
		v_actor_id := current_actor_id();
		IF v_actor_id IS NULL OR v_actor_id <> p_actor_id THEN
			RAISE EXCEPTION 'Actor mismatch for project summary access'
				USING ERRCODE = '42501';
		END IF;
	END IF;

	RETURN QUERY
	WITH accessible_projects AS (
		SELECT
			p.*,
			m.role_key AS member_role_key,
			m.access AS member_access
		FROM public.onto_projects p
		LEFT JOIN public.onto_project_members m
			ON m.project_id = p.id
			AND m.actor_id = v_actor_id
			AND m.removed_at IS NULL
		WHERE p.deleted_at IS NULL
			AND p.archived_at IS NULL
			AND (
				p.created_by = v_actor_id
				OR m.id IS NOT NULL
			)
	),
	project_rollups AS (
		SELECT
			ap.id,
			COALESCE(tasks.task_count, 0)::bigint AS task_count,
			COALESCE(goals.goal_count, 0)::bigint AS goal_count,
			COALESCE(plans.plan_count, 0)::bigint AS plan_count,
			COALESCE(documents.document_count, 0)::bigint AS document_count,
			GREATEST(
				COALESCE(tasks.latest_activity_at, 'epoch'::timestamptz),
				COALESCE(goals.latest_activity_at, 'epoch'::timestamptz),
				COALESCE(plans.latest_activity_at, 'epoch'::timestamptz),
				COALESCE(documents.latest_activity_at, 'epoch'::timestamptz),
				ap.created_at
			) AS latest_activity_at
		FROM accessible_projects ap
		LEFT JOIN LATERAL (
			SELECT
				COUNT(*) AS task_count,
				MAX(COALESCE(t.updated_at, t.created_at)) AS latest_activity_at
			FROM public.onto_tasks t
			WHERE t.project_id = ap.id
				AND t.deleted_at IS NULL
				AND t.archived_at IS NULL
		) tasks ON true
		LEFT JOIN LATERAL (
			SELECT
				COUNT(*) AS goal_count,
				MAX(COALESCE(g.updated_at, g.created_at)) AS latest_activity_at
			FROM public.onto_goals g
			WHERE g.project_id = ap.id
				AND g.deleted_at IS NULL
				AND g.archived_at IS NULL
		) goals ON true
		LEFT JOIN LATERAL (
			SELECT
				COUNT(*) AS plan_count,
				MAX(COALESCE(pl.updated_at, pl.created_at)) AS latest_activity_at
			FROM public.onto_plans pl
			WHERE pl.project_id = ap.id
				AND pl.deleted_at IS NULL
				AND pl.archived_at IS NULL
		) plans ON true
		LEFT JOIN LATERAL (
			SELECT
				COUNT(*) AS document_count,
				MAX(COALESCE(d.updated_at, d.created_at)) AS latest_activity_at
			FROM public.onto_documents d
			WHERE d.project_id = ap.id
				AND d.deleted_at IS NULL
				AND d.archived_at IS NULL
		) documents ON true
	)
	SELECT
		ap.id,
		ap.name,
		ap.description,
		ap.icon_svg,
		ap.icon_concept,
		ap.icon_generated_at,
		ap.icon_generation_source::text,
		ap.icon_generation_prompt,
		ap.type_key::text,
		ap.state_key::text,
		ap.props,
		ap.facet_context::text,
		ap.facet_scale::text,
		ap.facet_stage::text,
		ap.created_at,
		pr.latest_activity_at AS updated_at,
		pr.task_count,
		pr.goal_count,
		pr.plan_count,
		pr.document_count,
		ap.created_by AS owner_actor_id,
		COALESCE(
			ap.member_role_key::text,
			CASE WHEN ap.created_by = v_actor_id THEN 'owner' ELSE NULL END
		) AS access_role,
		COALESCE(
			ap.member_access::text,
			CASE WHEN ap.created_by = v_actor_id THEN 'admin' ELSE NULL END
		) AS access_level,
		(ap.created_by <> v_actor_id) AS is_shared,
		ap.next_step_short,
		ap.next_step_long,
		ap.next_step_source::text,
		ap.next_step_updated_at,
		ap.kind::text
	FROM accessible_projects ap
	INNER JOIN project_rollups pr ON pr.id = ap.id
	ORDER BY ap.created_at DESC
	LIMIT CASE
		WHEN p_limit IS NOT NULL AND p_limit > 0 THEN p_limit
		ELSE NULL
	END;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_onto_project_summaries_v1(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_onto_project_summaries_v1(uuid, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. The billing gate counts real projects only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.evaluate_user_consumption_gate(p_user_id uuid, p_project_limit integer DEFAULT 5, p_credit_limit integer DEFAULT 400)
 RETURNS TABLE(user_id uuid, billing_state text, billing_tier text, is_frozen boolean, project_count integer, lifetime_credits_used integer, trigger_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_project_count integer := 0;
  v_total_tokens bigint := 0;
  v_lifetime_credits integer := 0;
  v_has_paid_subscription boolean := false;
  v_state text := 'explorer_active';
  v_tier text := 'explorer';
  v_reason text := null;
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.billing_accounts(user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select ba.billing_state, ba.billing_tier
  into v_state, v_tier
  from public.billing_accounts ba
  where ba.user_id = p_user_id;

  -- Primary project count: active ontology project memberships for the current user.
  -- The Workspace (kind = 'workspace') is not a project and never counts.
  select count(distinct m.project_id)::int
  into v_project_count
  from public.onto_project_members m
  join public.onto_actors a on a.id = m.actor_id
  join public.onto_projects p on p.id = m.project_id
  where a.user_id = p_user_id
    and m.removed_at is null
    and p.deleted_at is null
    and p.kind = 'project';

  -- Legacy fallback when ontology memberships are not populated yet.
  if v_project_count = 0 then
    select count(*)::int
    into v_project_count
    from public.projects p
    where p.user_id = p_user_id;
  end if;

  select coalesce(sum(l.total_tokens), 0)::bigint
  into v_total_tokens
  from public.llm_usage_logs l
  where l.user_id = p_user_id
    and coalesce(l.status, 'success') = 'success';

  v_lifetime_credits := ceil(v_total_tokens::numeric / 1000.0)::int;

  select exists(
    select 1
    from public.customer_subscriptions cs
    where cs.user_id = p_user_id
      and cs.status in ('active', 'trialing', 'past_due')
  )
  into v_has_paid_subscription;

  if v_has_paid_subscription then
    if v_state = 'upgrade_required_frozen' then
      update public.billing_accounts
      set billing_state = case when billing_tier = 'power' then 'power_active' else 'pro_active' end,
          billing_tier = case when billing_tier = 'explorer' then 'pro' else billing_tier end,
          frozen_at = null,
          frozen_reason = null,
          updated_at = now()
      where user_id = p_user_id;
    end if;
  else
    -- Founder decision: auto-enrollment trigger is OR (projects OR credits).
    if v_tier = 'explorer'
       and (v_project_count > p_project_limit or v_lifetime_credits >= p_credit_limit) then
      v_reason := case
        when v_project_count > p_project_limit and v_lifetime_credits >= p_credit_limit
          then 'projects_or_credits'
        when v_project_count > p_project_limit
          then 'projects'
        else 'credits'
      end;

      update public.billing_accounts
      set billing_state = 'upgrade_required_frozen',
          frozen_at = coalesce(frozen_at, now()),
          frozen_reason = v_reason,
          updated_at = now()
      where user_id = p_user_id;
    end if;
  end if;

  return query
  select
    ba.user_id,
    ba.billing_state,
    ba.billing_tier,
    (ba.billing_state = 'upgrade_required_frozen') as is_frozen,
    v_project_count,
    v_lifetime_credits,
    ba.frozen_reason
  from public.billing_accounts ba
  where ba.user_id = p_user_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Brief eligibility: a workspace counts only while it holds an open task
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_daily_brief_eligible_user_ids(user_ids uuid[])
 RETURNS TABLE(user_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
	select requested.user_id
	from unnest(user_ids) as requested(user_id)
	where exists (
		select 1
		from public.onto_projects as project
		where project.deleted_at is null
			and project.archived_at is null
			and (
				project.kind = 'project'
				or exists (
					select 1
					from public.onto_tasks as task
					where task.project_id = project.id
						and task.deleted_at is null
						and task.archived_at is null
						and task.state_key <> 'done'
				)
			)
			and (
				project.state_key in ('planning', 'active')
				or (
					project.state_key = 'paused'
					and exists (
						select 1
						from public.onto_project_logs as project_log
						where project_log.project_id = project.id
							and project_log.entity_type = 'project'
							and project_log.action = 'updated'
							and project_log.created_at >= now() - interval '24 hours'
							and project_log.after_data ->> 'state_key' = 'paused'
							and (project_log.before_data ->> 'state_key') is distinct from 'paused'
					)
				)
			)
			and (
				project.created_by = requested.user_id
				or exists (
					select 1
					from public.onto_actors as owner_actor
					where owner_actor.id = project.created_by
						and owner_actor.user_id = requested.user_id
				)
				or exists (
					select 1
					from public.onto_project_members as membership
					join public.onto_actors as member_actor
						on member_actor.id = membership.actor_id
					where membership.project_id = project.id
						and membership.removed_at is null
						and member_actor.user_id = requested.user_id
				)
			)
	);
$function$;

NOTIFY pgrst, 'reload schema';
COMMIT;
