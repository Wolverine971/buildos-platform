-- supabase/tests/fixtures/cycle_worker_adversarial_base.sql
-- TEST FIXTURE ONLY. Compose the current generic queue recovery function with
-- the full Cycle schema in a brand-new disposable PostgreSQL database.

\ir cycles_v0_foundation_base.sql

-- The queue-lockdown migration replaces the historical one-argument reset
-- function. The Cycle fixture predates that queue migration, so provide the
-- minimal predecessor signature it expects to drop.
CREATE FUNCTION public.reset_stalled_jobs(
	p_stall_timeout text DEFAULT '5 minutes'::text
)
RETURNS integer
LANGUAGE sql
AS $$ SELECT 0 $$;

\ir ../../migrations/20260801030600_agentic_chat_worker_queue_function_lockdown.sql
\ir ../../migrations/20260825211342_add_run_cycle_queue_type.sql
\ir ../../migrations/20260825211343_cycles_v0_foundation.sql
\ir ../../migrations/20260825211344_cycles_v0_commands.sql
\ir ../../migrations/20260826010526_harden_cycle_service_role_wrappers.sql
\ir ../../migrations/20260826011409_cycle_due_trigger_coordinator.sql
\ir ../../migrations/20260826013205_add_cycle_misfire_skip_resolution.sql
\ir ../../migrations/20260826014109_add_daily_brief_cycle_lead_time.sql
\ir ../../migrations/20260826180136_harden_cycle_worker_fencing.sql

CREATE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	IF COALESCE(p_condition, false) IS NOT TRUE THEN
		RAISE EXCEPTION 'assertion failed: %', p_message;
	END IF;
END;
$$;

CREATE FUNCTION pg_temp.create_adversarial_daily_brief_cycle(
	p_user_id uuid,
	p_cycle_id uuid,
	p_request_id text,
	p_state text DEFAULT 'active',
	p_next_run_at timestamptz DEFAULT '2026-08-26T13:00:00Z'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	INSERT INTO public.users (id, name, email)
	VALUES (p_user_id, 'Adversarial Cycle owner', p_user_id::text || '@example.test');

	INSERT INTO public.cycles (
		id, user_id, create_request_id, create_request_fingerprint,
		label, kind, target_type, config, policy, attention_policy, state
	) VALUES (
		p_cycle_id,
		p_user_id,
		p_request_id,
		repeat('a', 64),
		'Daily Brief',
		'daily_brief',
		'user',
		'{}',
		'{"overlap":"skip","misfire":"run_once","max_attempts":3}',
		'always',
		p_state
	);

	INSERT INTO public.cycle_triggers (
		cycle_id, trigger_type, spec, state, next_run_at
	) VALUES (
		p_cycle_id,
		'schedule',
		'{"type":"schedule","schedule":{"type":"daily","time_of_day":"09:00","timezone":"America/New_York"}}',
		'active',
		p_next_run_at
	);
END;
$$;
