-- supabase/migrations/20260730030000_phase0_view_and_rpc_hardening.sql
-- Phase 0: remove direct browser access to internal/admin views and RPCs.
-- Admin SvelteKit routes use the server-side service client after checking the
-- session's is_admin flag. user_calendar_items is the one deliberately
-- authenticated view and runs with the invoker's RLS context.

begin;

do $block$
declare
	v_view_name text;
	v_relkind "char";
	views text[] := array[
		'admin_llm_cost_analytics',
		'admin_user_llm_costs',
		'brief_email_stats',
		'daily_brief_engagement_weekly_metrics',
		'error_summary',
		'global_migration_progress',
		'project_kept_versions',
		'queue_jobs_stats',
		'recurring_task_summary',
		'sms_metrics_daily',
		'task_documents',
		'trial_statistics',
		'user_calendar_items',
		'user_migration_stats'
	];
begin
	foreach v_view_name in array views loop
		select c.relkind
		into v_relkind
		from pg_class c
		join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public' and c.relname = v_view_name;

		if v_relkind is null then
			raise exception 'Expected internal view public.% does not exist', v_view_name;
		end if;

		-- PostgreSQL supports security_invoker only for ordinary views. Materialized
		-- views are made service-only through grants below.
		if v_relkind = 'v' then
			execute format('alter view public.%I set (security_invoker = true)', v_view_name);
		end if;

		execute format(
			'revoke all privileges on table public.%I from public, anon, authenticated',
			v_view_name
		);
		execute format('grant select on table public.%I to service_role', v_view_name);
		v_relkind := null;
	end loop;
end;
$block$;

grant select on table public.user_calendar_items to authenticated;

-- Read-only catalog projection used by the deployment verifier. This avoids the
-- old verifier's unsafe practice of attempting real INSERTs against production.
create or replace function public.get_phase0_security_inventory(p_relations text[])
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
	select coalesce(jsonb_agg(item order by item ->> 'relation'), '[]'::jsonb)
	from (
		select jsonb_build_object(
			'relation', c.relname,
			'kind', case c.relkind
				when 'r' then 'table'
				when 'p' then 'partitioned_table'
				when 'v' then 'view'
				when 'm' then 'materialized_view'
				else c.relkind::text
			end,
			'rls_enabled', c.relrowsecurity,
			'rls_forced', c.relforcerowsecurity,
			'reloptions', coalesce(to_jsonb(c.reloptions), '[]'::jsonb),
			'anon', jsonb_build_object(
				'select', has_table_privilege('anon', c.oid, 'SELECT'),
				'insert', has_table_privilege('anon', c.oid, 'INSERT'),
				'update', has_table_privilege('anon', c.oid, 'UPDATE'),
				'delete', has_table_privilege('anon', c.oid, 'DELETE'),
				'truncate', has_table_privilege('anon', c.oid, 'TRUNCATE'),
				'references', has_table_privilege('anon', c.oid, 'REFERENCES'),
				'trigger', has_table_privilege('anon', c.oid, 'TRIGGER')
			),
			'authenticated', jsonb_build_object(
				'select', has_table_privilege('authenticated', c.oid, 'SELECT'),
				'insert', has_table_privilege('authenticated', c.oid, 'INSERT'),
				'update', has_table_privilege('authenticated', c.oid, 'UPDATE'),
				'delete', has_table_privilege('authenticated', c.oid, 'DELETE'),
				'truncate', has_table_privilege('authenticated', c.oid, 'TRUNCATE'),
				'references', has_table_privilege('authenticated', c.oid, 'REFERENCES'),
				'trigger', has_table_privilege('authenticated', c.oid, 'TRIGGER')
			),
			'policies', coalesce((
				select jsonb_agg(jsonb_build_object(
					'name', p.policyname,
					'command', p.cmd,
					'roles', p.roles,
					'using', p.qual,
					'check', p.with_check
				) order by p.policyname)
				from pg_catalog.pg_policies p
				where p.schemaname = 'public' and p.tablename = c.relname
			), '[]'::jsonb)
		) as item
		from pg_class c
		join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public' and c.relname = any(p_relations)
	) inventory;
$function$;

revoke all on function public.get_phase0_security_inventory(text[]) from public, anon, authenticated;
grant execute on function public.get_phase0_security_inventory(text[]) to service_role;

-- These functions are either admin analytics or trusted operational mutations.
-- Every application caller is now behind an admin/cron/webhook route using the
-- service client. Revoke default PUBLIC execution for every overload.
do $block$
declare
	fn record;
	function_names text[] := array[
		'emit_notification_event',
		'freeze_retargeting_founder_pilot_cohort',
		'get_brief_generation_stats',
		'get_daily_active_users',
		'get_daily_visitors',
		'get_notification_active_subscriptions',
		'get_notification_channel_performance',
		'get_notification_delivery_timeline',
		'get_notification_event_performance',
		'get_notification_failed_deliveries',
		'get_notification_overview_metrics',
		'get_retargeting_founder_pilot_member_metrics',
		'get_sms_daily_metrics',
		'get_sms_notification_stats',
		'get_visitor_overview',
		'record_sms_metric',
		'refresh_sms_metrics_daily',
		'refresh_user_migration_stats',
		'update_sms_status_atomic'
	];
begin
	for fn in
		select
			n.nspname,
			p.proname,
			pg_get_function_identity_arguments(p.oid) as identity_arguments
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public'
			and p.prokind = 'f'
			and p.proname = any(function_names)
	loop
		execute format(
			'revoke all on function %I.%I(%s) from public, anon, authenticated',
			fn.nspname,
			fn.proname,
			fn.identity_arguments
		);
		execute format(
			'grant execute on function %I.%I(%s) to service_role',
			fn.nspname,
			fn.proname,
			fn.identity_arguments
		);
	end loop;
end;
$block$;

commit;
