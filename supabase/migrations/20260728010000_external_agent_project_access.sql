-- supabase/migrations/20260728010000_external_agent_project_access.sql
-- External agent project access v2.
--
-- Connectors now declare how their project set evolves:
--   all_unrestricted: owned standard projects are included automatically
--   selected:         only explicit project grants are included
--
-- A project can be marked restricted, which always requires an explicit grant.

ALTER TABLE public.onto_projects
	ADD COLUMN IF NOT EXISTS external_agent_access text NOT NULL DEFAULT 'standard'
		CHECK (external_agent_access IN ('standard', 'restricted'));

-- Preserve the meaning of existing connector records. A JSON array was the
-- legacy selected-project allowlist; null/missing meant all visible projects.
-- Run each backfill only when its column is first introduced. This matters when
-- retrying a partially applied migration: new all_unrestricted records may use
-- an array for explicit shared/restricted exceptions and must not be reclassified
-- as selected on a later retry.
DO $migration$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'external_agent_callers'
			AND column_name = 'project_scope_mode'
	) THEN
		ALTER TABLE public.external_agent_callers
			ADD COLUMN project_scope_mode text NOT NULL DEFAULT 'all_unrestricted'
				CHECK (project_scope_mode IN ('all_unrestricted', 'selected'));

		UPDATE public.external_agent_callers
		SET project_scope_mode = CASE
			WHEN jsonb_typeof(policy -> 'allowed_project_ids') = 'array' THEN 'selected'
			ELSE 'all_unrestricted'
		END;
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'agent_oauth_grants'
			AND column_name = 'project_scope_mode'
	) THEN
		ALTER TABLE public.agent_oauth_grants
			ADD COLUMN project_scope_mode text NOT NULL DEFAULT 'all_unrestricted'
				CHECK (project_scope_mode IN ('all_unrestricted', 'selected'));

		UPDATE public.agent_oauth_grants
		SET project_scope_mode = CASE
			WHEN jsonb_typeof(allowed_project_ids) = 'array' THEN 'selected'
			ELSE 'all_unrestricted'
		END;
	END IF;
END
$migration$;

CREATE TABLE IF NOT EXISTS public.external_agent_project_permissions (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	external_agent_caller_id uuid NOT NULL REFERENCES public.external_agent_callers(id) ON DELETE CASCADE,
	agent_oauth_grant_id uuid NULL REFERENCES public.agent_oauth_grants(id) ON DELETE CASCADE,
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	access_mode text NOT NULL DEFAULT 'read_only'
		CHECK (access_mode IN ('read_only', 'read_write')),
	source text NOT NULL DEFAULT 'selected'
		CHECK (source IN ('selected', 'restricted_override', 'connector_created', 'migration')),
	granted_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
	granted_at timestamptz NOT NULL DEFAULT now(),
	revoked_at timestamptz NULL,
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_external_agent_project_permissions_static_active
	ON public.external_agent_project_permissions(external_agent_caller_id, project_id)
	WHERE agent_oauth_grant_id IS NULL AND revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_external_agent_project_permissions_oauth_active
	ON public.external_agent_project_permissions(agent_oauth_grant_id, project_id)
	WHERE agent_oauth_grant_id IS NOT NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_external_agent_project_permissions_user
	ON public.external_agent_project_permissions(user_id, revoked_at, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_external_agent_project_permissions_project
	ON public.external_agent_project_permissions(project_id, revoked_at);

DROP TRIGGER IF EXISTS trg_external_agent_project_permissions_updated
	ON public.external_agent_project_permissions;
CREATE TRIGGER trg_external_agent_project_permissions_updated
	BEFORE UPDATE ON public.external_agent_project_permissions
	FOR EACH ROW
	EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.external_agent_project_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own external agent project permissions"
	ON public.external_agent_project_permissions;
CREATE POLICY "Users can read own external agent project permissions"
	ON public.external_agent_project_permissions
	FOR SELECT
	TO authenticated
	USING (user_id = auth.uid());

-- Materialize existing selected-project allowlists as explicit permission rows.
-- Legacy arrays can retain IDs for projects that were deleted after the
-- connector was authorized, so only backfill projects that still exist.
INSERT INTO public.external_agent_project_permissions (
	user_id,
	external_agent_caller_id,
	agent_oauth_grant_id,
	project_id,
	access_mode,
	source,
	granted_by
)
SELECT
	g.user_id,
	g.external_agent_caller_id,
	g.id,
	existing_project.id,
	g.scope_mode,
	'migration',
	g.user_id
FROM public.agent_oauth_grants g
CROSS JOIN LATERAL jsonb_array_elements_text(
	CASE
		WHEN jsonb_typeof(g.allowed_project_ids) = 'array' THEN g.allowed_project_ids
		ELSE '[]'::jsonb
	END
) AS project_id(value)
INNER JOIN public.onto_projects existing_project
	ON existing_project.id::text = lower(project_id.value)
	AND existing_project.deleted_at IS NULL
WHERE g.project_scope_mode = 'selected'
	AND jsonb_typeof(g.allowed_project_ids) = 'array'
ON CONFLICT DO NOTHING;

INSERT INTO public.external_agent_project_permissions (
	user_id,
	external_agent_caller_id,
	agent_oauth_grant_id,
	project_id,
	access_mode,
	source,
	granted_by
)
SELECT
	c.user_id,
	c.id,
	NULL,
	existing_project.id,
	CASE WHEN c.policy ->> 'scope_mode' = 'read_write' THEN 'read_write' ELSE 'read_only' END,
	'migration',
	c.user_id
FROM public.external_agent_callers c
CROSS JOIN LATERAL jsonb_array_elements_text(
	CASE
		WHEN jsonb_typeof(c.policy -> 'allowed_project_ids') = 'array'
			THEN c.policy -> 'allowed_project_ids'
		ELSE '[]'::jsonb
	END
) AS project_id(value)
INNER JOIN public.onto_projects existing_project
	ON existing_project.id::text = lower(project_id.value)
	AND existing_project.deleted_at IS NULL
WHERE c.project_scope_mode = 'selected'
	AND jsonb_typeof(c.policy -> 'allowed_project_ids') = 'array'
	AND COALESCE(c.metadata ->> 'auth_scheme', '') <> 'oauth'
	AND c.caller_key NOT LIKE 'oauth:%'
	AND NOT EXISTS (
		SELECT 1
		FROM public.external_agent_project_permissions permission
		WHERE permission.external_agent_caller_id = c.id
			AND permission.agent_oauth_grant_id IS NULL
			AND permission.project_id = existing_project.id
			AND permission.revoked_at IS NULL
	)
ON CONFLICT DO NOTHING;

COMMENT ON COLUMN public.onto_projects.external_agent_access IS
	'Whether external agents may inherit access or require an explicit connector grant.';
COMMENT ON COLUMN public.external_agent_callers.project_scope_mode IS
	'How a static connector project scope evolves: all_unrestricted or selected.';
COMMENT ON COLUMN public.agent_oauth_grants.project_scope_mode IS
	'How this OAuth grant project scope evolves: all_unrestricted or selected.';
COMMENT ON TABLE public.external_agent_project_permissions IS
	'Explicit per-project grants for static and OAuth external-agent connectors.';
