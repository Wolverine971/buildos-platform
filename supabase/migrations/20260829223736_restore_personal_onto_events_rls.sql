-- Restore the personal-event access contract that predates the Phase 0 RLS
-- lockdown. Project events remain protected by project membership; projectless
-- events are visible and writable only when they are owned and created by the
-- current authenticated actor.

BEGIN;

DROP POLICY IF EXISTS onto_events_select ON public.onto_events;
DROP POLICY IF EXISTS onto_events_insert ON public.onto_events;
DROP POLICY IF EXISTS onto_events_update ON public.onto_events;
DROP POLICY IF EXISTS onto_events_delete ON public.onto_events;

CREATE POLICY onto_events_select ON public.onto_events
	FOR SELECT TO authenticated
	USING (
		public.current_actor_has_project_member_access(project_id, 'read')
		OR (
			project_id IS NULL
			AND created_by = (SELECT public.current_actor_id())
			AND (
				(
					owner_entity_type = 'actor'
					AND owner_entity_id = (SELECT public.current_actor_id())
				)
				OR owner_entity_type = 'standalone'
			)
		)
		OR (SELECT public.is_admin())
	);

CREATE POLICY onto_events_insert ON public.onto_events
	FOR INSERT TO authenticated
	WITH CHECK (
		public.current_actor_has_project_member_access(project_id, 'write')
		OR (
			project_id IS NULL
			AND created_by = (SELECT public.current_actor_id())
			AND (
				(
					owner_entity_type = 'actor'
					AND owner_entity_id = (SELECT public.current_actor_id())
				)
				OR owner_entity_type = 'standalone'
			)
		)
		OR (SELECT public.is_admin())
	);

CREATE POLICY onto_events_update ON public.onto_events
	FOR UPDATE TO authenticated
	USING (
		public.current_actor_has_project_member_access(project_id, 'write')
		OR (
			project_id IS NULL
			AND created_by = (SELECT public.current_actor_id())
			AND (
				(
					owner_entity_type = 'actor'
					AND owner_entity_id = (SELECT public.current_actor_id())
				)
				OR owner_entity_type = 'standalone'
			)
		)
		OR (SELECT public.is_admin())
	)
	WITH CHECK (
		public.current_actor_has_project_member_access(project_id, 'write')
		OR (
			project_id IS NULL
			AND created_by = (SELECT public.current_actor_id())
			AND (
				(
					owner_entity_type = 'actor'
					AND owner_entity_id = (SELECT public.current_actor_id())
				)
				OR owner_entity_type = 'standalone'
			)
		)
		OR (SELECT public.is_admin())
	);

CREATE POLICY onto_events_delete ON public.onto_events
	FOR DELETE TO authenticated
	USING (
		public.current_actor_has_project_member_access(project_id, 'write')
		OR (
			project_id IS NULL
			AND created_by = (SELECT public.current_actor_id())
			AND (
				(
					owner_entity_type = 'actor'
					AND owner_entity_id = (SELECT public.current_actor_id())
				)
				OR owner_entity_type = 'standalone'
			)
		)
		OR (SELECT public.is_admin())
	);

COMMENT ON POLICY onto_events_select ON public.onto_events IS
	'Authenticated actors can read project events they can access and their own projectless actor/standalone events.';
COMMENT ON POLICY onto_events_insert ON public.onto_events IS
	'Authenticated actors can create writable project events and self-owned projectless actor/standalone events.';
COMMENT ON POLICY onto_events_update ON public.onto_events IS
	'Authenticated actors can update writable project events and self-owned projectless actor/standalone events without reassigning them outside an allowed scope.';
COMMENT ON POLICY onto_events_delete ON public.onto_events IS
	'Authenticated actors can delete writable project events and self-owned projectless actor/standalone events.';

COMMIT;
