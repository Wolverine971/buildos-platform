-- supabase/migrations/20260508000000_project_activity_agent_events.sql
-- Track external-agent attribution and event changes in project activity logs.

ALTER TABLE public.onto_project_logs
	ADD COLUMN IF NOT EXISTS external_agent_caller_id uuid
		REFERENCES public.external_agent_callers(id) ON DELETE SET NULL,
	ADD COLUMN IF NOT EXISTS agent_call_session_id uuid
		REFERENCES public.agent_call_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_onto_project_logs_external_agent_caller
	ON public.onto_project_logs(external_agent_caller_id, created_at DESC)
	WHERE external_agent_caller_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_onto_project_logs_agent_call_session
	ON public.onto_project_logs(agent_call_session_id, created_at DESC)
	WHERE agent_call_session_id IS NOT NULL;

ALTER TABLE public.onto_project_logs
	DROP CONSTRAINT IF EXISTS check_entity_type_values;

ALTER TABLE public.onto_project_logs
	ADD CONSTRAINT check_entity_type_values CHECK (entity_type IN (
		'project',
		'task',
		'output',
		'note',
		'document',
		'goal',
		'milestone',
		'risk',
		'plan',
		'event',
		'requirement',
		'decision',
		'source',
		'edge',
		'member',
		'invite'
	));

DROP FUNCTION IF EXISTS public.log_project_change(
	uuid,
	text,
	uuid,
	text,
	jsonb,
	jsonb,
	uuid,
	text,
	uuid
);

CREATE OR REPLACE FUNCTION public.log_project_change(
	p_project_id uuid,
	p_entity_type text,
	p_entity_id uuid,
	p_action text,
	p_before_data jsonb DEFAULT NULL,
	p_after_data jsonb DEFAULT NULL,
	p_changed_by uuid DEFAULT NULL,
	p_change_source text DEFAULT NULL,
	p_chat_session_id uuid DEFAULT NULL,
	p_external_agent_caller_id uuid DEFAULT NULL,
	p_agent_call_session_id uuid DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
	v_log_id uuid;
	v_changed_by uuid;
	v_changed_by_actor uuid;
BEGIN
	v_changed_by := COALESCE(p_changed_by, auth.uid());
	v_changed_by_actor := COALESCE(
		current_actor_id(),
		(SELECT id FROM public.onto_actors WHERE user_id = v_changed_by)
	);

	INSERT INTO public.onto_project_logs (
		project_id,
		entity_type,
		entity_id,
		action,
		before_data,
		after_data,
		changed_by,
		changed_by_actor_id,
		change_source,
		chat_session_id,
		external_agent_caller_id,
		agent_call_session_id
	) VALUES (
		p_project_id,
		p_entity_type,
		p_entity_id,
		p_action,
		p_before_data,
		p_after_data,
		v_changed_by,
		v_changed_by_actor,
		p_change_source,
		p_chat_session_id,
		p_external_agent_caller_id,
		p_agent_call_session_id
	)
	RETURNING id INTO v_log_id;

	RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
