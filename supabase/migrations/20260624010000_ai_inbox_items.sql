-- supabase/migrations/20260624010000_ai_inbox_items.sql
-- AI Inbox read model.
--
-- `inbox_items` is a denormalized index over source review artifacts. Source
-- tables remain authoritative; this table makes cross-source lists/counts fast
-- and gives the UI one queue to read.

CREATE TABLE IF NOT EXISTS public.inbox_items (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	source_type text NOT NULL
		CHECK (
			source_type IN (
				'agent_run',
				'project_suggestion',
				'calendar_suggestion',
				'profile_fragment',
				'contact_merge_candidate'
			)
		),
	source_ref_id uuid NOT NULL,
	source_status text,
	user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
	project_id uuid REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	audience text NOT NULL DEFAULT 'user'
		CHECK (audience IN ('user', 'project_members')),
	status text NOT NULL DEFAULT 'pending'
		CHECK (status IN ('pending', 'deciding', 'decided', 'blocked', 'expired', 'snoozed')),
	title text NOT NULL,
	summary text,
	risk_tier int CHECK (risk_tier BETWEEN 1 AND 3),
	action_kinds text[] NOT NULL DEFAULT ARRAY[]::text[],
	blocked_reason text,
	snoozed_until timestamptz,
	expires_at timestamptz,
	decided_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT inbox_items_source_unique UNIQUE (source_type, source_ref_id),
	CONSTRAINT inbox_items_user_or_project_scope CHECK (
		user_id IS NOT NULL OR project_id IS NOT NULL
	),
	CONSTRAINT inbox_items_project_audience_has_project CHECK (
		audience <> 'project_members' OR project_id IS NOT NULL
	)
);

CREATE INDEX IF NOT EXISTS idx_inbox_items_status_created
	ON public.inbox_items(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inbox_items_project_status_created
	ON public.inbox_items(project_id, status, created_at DESC)
	WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbox_items_user_status_created
	ON public.inbox_items(user_id, status, created_at DESC)
	WHERE user_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_inbox_items_updated_at ON public.inbox_items;
CREATE TRIGGER trg_inbox_items_updated_at
	BEFORE UPDATE ON public.inbox_items
	FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.inbox_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inbox_items_user_owned_read ON public.inbox_items;
CREATE POLICY inbox_items_user_owned_read
	ON public.inbox_items FOR SELECT
	USING (
		audience = 'user'
		AND user_id = auth.uid()
	);

DROP POLICY IF EXISTS inbox_items_project_member_read ON public.inbox_items;
CREATE POLICY inbox_items_project_member_read
	ON public.inbox_items FOR SELECT
	USING (
		audience = 'project_members'
		AND project_id IS NOT NULL
		AND current_actor_has_project_access(project_id, 'read')
	);

DROP POLICY IF EXISTS inbox_items_service_role_all ON public.inbox_items;
CREATE POLICY inbox_items_service_role_all
	ON public.inbox_items FOR ALL
	USING (auth.role() = 'service_role')
	WITH CHECK (auth.role() = 'service_role');
