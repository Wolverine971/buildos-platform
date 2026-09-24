-- scripts/supabase-health/sql/preflight.sql
-- Metadata only: never invoke the mutating recovery/maintenance RPCs as a probe.
SELECT 'functions' AS section, coalesce(jsonb_agg(jsonb_build_object(
    'name', p.proname, 'identity', p.oid::regprocedure::text,
    'argument_names', p.proargnames, 'definer', p.prosecdef, 'config', p.proconfig,
    'anon_execute', has_function_privilege('anon', p.oid, 'EXECUTE'),
    'authenticated_execute', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
    'public_execute', EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ),
    'service_execute', has_function_privilege('service_role', p.oid, 'EXECUTE')
)), '[]') AS data
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN (
    'recover_dead_agentic_chat_turns', 'reap_stranded_queued_agentic_chat_turns',
    'acquire_migration_platform_lock', 'get_subscription_overview', 'batch_update_phase_dates'
)
UNION ALL
SELECT 'migrations', coalesce(jsonb_agg(version), '[]')
FROM supabase_migrations.schema_migrations
WHERE version IN ('20260924000000', '20260924000100', '20260924150000', '20260924202321')
UNION ALL
SELECT 'cron', jsonb_build_object(
    'latest_status', (array_agg(status ORDER BY executed_at DESC))[1],
    'seconds_since_success', extract(epoch FROM now() - max(executed_at) FILTER (WHERE status = 'success')),
    'errors_last_15m', count(*) FILTER (WHERE status <> 'success' AND executed_at > now() - interval '15 minutes')
)
FROM (
    SELECT status, executed_at FROM public.cron_logs
    WHERE job_name = 'agentic_chat_stale_turns'
    ORDER BY executed_at DESC LIMIT 50
) recent;
