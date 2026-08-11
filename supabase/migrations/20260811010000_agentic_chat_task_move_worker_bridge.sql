-- supabase/migrations/20260811010000_agentic_chat_task_move_worker_bridge.sql
-- Service-role bridge for the existing atomic cross-project task move.
--
-- The authoritative move function intentionally derives its actor from
-- auth.uid(), which fails closed for the worker's service-role client. This
-- wrapper keeps the original transaction/preview/token contract intact while
-- requiring an explicit user whose actor has write access to both projects.

CREATE OR REPLACE FUNCTION public.onto_task_move_atomic_for_user(
	p_user_id uuid,
	p_task_id uuid,
	p_expected_source_project_id uuid,
	p_destination_project_id uuid,
	p_confirmation_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
	v_actor_id uuid;
	v_previous_subject text;
	v_result jsonb;
BEGIN
	IF auth.role() IS DISTINCT FROM 'service_role' THEN
		RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'task_move_worker_bridge_forbidden';
	END IF;

	IF p_user_id IS NULL THEN
		RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'task_move_invalid_arguments';
	END IF;

	SELECT actor.id
	INTO v_actor_id
	FROM public.onto_actors actor
	WHERE actor.user_id = p_user_id
	LIMIT 1;

	-- Check both projects before changing the request subject. This preserves the
	-- worker's actor-explicit, membership-only access rule and avoids exposing
	-- project or task existence to an unauthorized user identity.
	IF v_actor_id IS NULL
		OR NOT public.actor_has_project_member_access(
			v_actor_id,
			p_expected_source_project_id,
			'write'
		)
		OR NOT public.actor_has_project_member_access(
			v_actor_id,
			p_destination_project_id,
			'write'
		) THEN
		RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'task_move_access_denied';
	END IF;

	-- Delegate to the established function so task locking, destructive-impact
	-- previews, confirmation tokens, blocked dependents, and the move itself stay
	-- in one authoritative implementation. The setting is transaction-local and
	-- restored defensively before returning or re-raising.
	v_previous_subject := current_setting('request.jwt.claim.sub', true);
	PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
	BEGIN
		v_result := public.onto_task_move_atomic(
			p_task_id,
			p_expected_source_project_id,
			p_destination_project_id,
			p_confirmation_token
		);
	EXCEPTION
		WHEN OTHERS THEN
			PERFORM set_config(
				'request.jwt.claim.sub',
				coalesce(v_previous_subject, ''),
				true
			);
			RAISE;
	END;

	PERFORM set_config(
		'request.jwt.claim.sub',
		coalesce(v_previous_subject, ''),
		true
	);
	RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.onto_task_move_atomic_for_user(uuid, uuid, uuid, uuid, text)
	FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onto_task_move_atomic_for_user(uuid, uuid, uuid, uuid, text)
	FROM anon;
REVOKE ALL ON FUNCTION public.onto_task_move_atomic_for_user(uuid, uuid, uuid, uuid, text)
	FROM authenticated;
GRANT EXECUTE ON FUNCTION public.onto_task_move_atomic_for_user(uuid, uuid, uuid, uuid, text)
	TO service_role;

COMMENT ON FUNCTION public.onto_task_move_atomic_for_user(uuid, uuid, uuid, uuid, text) IS
	'Service-only user-identity bridge to the atomic cross-project task move with actor-explicit dual-project write authorization.';
