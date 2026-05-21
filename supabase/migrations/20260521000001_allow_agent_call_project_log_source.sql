-- supabase/migrations/20260521000001_allow_agent_call_project_log_source.sql
-- Allow Bridge/external-agent writes to appear in project activity.

ALTER TABLE public.onto_project_logs
	DROP CONSTRAINT IF EXISTS check_change_source_values;

ALTER TABLE public.onto_project_logs
	ADD CONSTRAINT check_change_source_values CHECK (
		change_source IS NULL
		OR change_source IN ('chat', 'form', 'brain_dump', 'api', 'agent_call')
	);

UPDATE public.onto_project_logs
SET
	change_source = 'agent_call',
	after_data =
		CASE
			WHEN after_data IS NULL THEN NULL
			ELSE after_data - 'intended_change_source'
		END
WHERE change_source = 'api'
	AND external_agent_caller_id IS NOT NULL
	AND agent_call_session_id IS NOT NULL
	AND after_data ->> 'intended_change_source' = 'agent_call';
