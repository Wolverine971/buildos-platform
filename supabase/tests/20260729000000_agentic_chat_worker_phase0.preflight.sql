-- supabase/tests/20260729000000_agentic_chat_worker_phase0.preflight.sql
-- Read-only preflight for the Agentic Chat worker/realtime migration.
--
-- This intentionally records the legacy security boundary and row hazards before
-- Phase 2 adds RPC-only writes, duplicate-first admission, generation fencing,
-- and terminal compare-and-set finalization. It performs no writes and is safe to
-- repeat against local, staging, or production databases.
--
-- Reading the retained JSON:
--   * `authenticated_effective_table_privileges` (has_table_privilege) is the
--     AUTHORITATIVE grant section. `direct_table_grants`/`direct_routine_grants`
--     read information_schema, which only shows grants visible to enabled roles.
--   * `missing_target_tables` lists targets absent from this database; row counts
--     for those report null rather than aborting the statement.
--   * Probes over chat_turn_runs itself (duplicate keys, id formats) require that
--     table; it is the migration's core relation, so its absence is fatal by design.

with target_tables(table_name) as (
	values
		('chat_turn_runs'),
		('chat_turn_events'),
		('chat_turn_checkpoints'),
		('chat_prompt_snapshots'),
		('agentic_chat_prepared_prompts'),
		('chat_messages'),
		('chat_sessions'),
		('queue_jobs')
),
target_routines(routine_name) as (
	values
		('cleanup_expired_agentic_chat_prepared_prompts'),
		('cleanup_agentic_chat_prompt_artifacts'),
		('merge_chat_session_agent_metadata'),
		('ensure_actor_for_user'),
		('current_actor_has_project_member_access'),
		('build_fastchat_project_intelligence'),
		('add_queue_job'),
		('claim_pending_jobs'),
		('complete_queue_job'),
		('fail_queue_job'),
		('reset_stalled_jobs')
),
duplicate_client_turn_keys as (
	select count(*)::bigint as duplicate_key_count,
		coalesce(sum(grouped.row_count - 1), 0)::bigint as excess_row_count
	from (
		select session_id, client_turn_id, count(*)::bigint as row_count
		from public.chat_turn_runs
		where client_turn_id is not null
		group by session_id, client_turn_id
		having count(*) > 1
	) grouped
),
duplicate_user_client_turn_keys as (
	-- rev .3 admission key is (user_id, client_turn_id): strictly coarser than the
	-- per-session key, so rows unique per session can still collide per user.
	select count(*)::bigint as duplicate_key_count,
		coalesce(sum(grouped.row_count - 1), 0)::bigint as excess_row_count
	from (
		select user_id, client_turn_id, count(*)::bigint as row_count
		from public.chat_turn_runs
		where client_turn_id is not null
		group by user_id, client_turn_id
		having count(*) > 1
	) grouped
),
duplicate_running_sessions as (
	select count(*)::bigint as duplicate_session_count,
		coalesce(sum(grouped.row_count - 1), 0)::bigint as excess_running_row_count
	from (
		select session_id, count(*)::bigint as row_count
		from public.chat_turn_runs
		where status = 'running'
		group by session_id
		having count(*) > 1
	) grouped
),
duplicate_active_sessions as (
	-- the replacement unique index covers status in ('queued','running')
	select count(*)::bigint as duplicate_session_count,
		coalesce(sum(grouped.row_count - 1), 0)::bigint as excess_active_row_count
	from (
		select session_id, count(*)::bigint as row_count
		from public.chat_turn_runs
		where status in ('queued', 'running')
		group by session_id
		having count(*) > 1
	) grouped
)
select jsonb_build_object(
	'contract_family', 'agentic_chat_worker_v1',
	'captured_at', statement_timestamp(),
	'missing_target_tables', (
		-- absence is reported, never fatal: every table-driven section below tolerates it
		select coalesce(
			jsonb_agg(targets.table_name order by targets.table_name),
			'[]'::jsonb
		)
		from target_tables targets
		where to_regclass(format('public.%I', targets.table_name)) is null
	),
	'legacy_row_inventory', jsonb_build_object(
		'row_counts', (
			-- counted dynamically so a target table that does not exist yet reports
			-- null instead of aborting the whole statement with a parse error
			select coalesce(jsonb_object_agg(targets.table_name, counts.row_count), '{}'::jsonb)
			from target_tables targets
			cross join lateral (
				select case
						when to_regclass(format('public.%I', targets.table_name)) is null then null
						else (
							xpath(
								'/row/cnt/text()',
								query_to_xml(
									format('select count(*) as cnt from public.%I', targets.table_name),
									false, true, ''
								)
							)
						)[1]::text::bigint
					end as row_count
			) counts
		),
		'turn_statuses', (
			select coalesce(
				jsonb_object_agg(status, row_count order by status),
				'{}'::jsonb
			)
			from (
				select status, count(*) as row_count
				from public.chat_turn_runs
				group by status
			) status_counts
		),
		'null_client_turn_id_rows', (
			select count(*) from public.chat_turn_runs where client_turn_id is null
		),
		'null_user_message_id_rows', (
			select count(*) from public.chat_turn_runs where user_message_id is null
		),
		'duplicate_client_turn_keys', (
			select to_jsonb(duplicate_client_turn_keys) from duplicate_client_turn_keys
		),
		'duplicate_user_client_turn_keys', (
			select to_jsonb(duplicate_user_client_turn_keys) from duplicate_user_client_turn_keys
		),
		'duplicate_running_sessions', (
			select to_jsonb(duplicate_running_sessions) from duplicate_running_sessions
		),
		'duplicate_active_sessions', (
			select to_jsonb(duplicate_active_sessions) from duplicate_active_sessions
		),
		'client_turn_id_formats', (
			-- P37: non-UUID programmatic ids (e.g. admin_replay:<slug>:<uuid>) are a
			-- precondition hazard for the (user_id, client_turn_id) unique key.
			select coalesce(jsonb_object_agg(fmt, row_count order by fmt), '{}'::jsonb)
			from (
				select case
						when client_turn_id is null then 'null'
						when client_turn_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
							then 'uuid'
						when position(':' in client_turn_id) > 0 then 'colon_prefixed'
						else 'other'
					end as fmt,
					count(*) as row_count
				from public.chat_turn_runs
				group by 1
			) formats
		),
		'duplicate_key_samples', (
			-- bounded id samples so duplicates can be resolved deterministically
			select coalesce(jsonb_agg(to_jsonb(sample) order by sample.user_id), '[]'::jsonb)
			from (
				select user_id, session_id, client_turn_id, count(*) as row_count,
					(array_agg(id order by created_at))[1:5] as sample_turn_ids
				from public.chat_turn_runs
				where client_turn_id is not null
				group by user_id, session_id, client_turn_id
				having count(*) > 1
				limit 25
			) sample
		)
	),
	'row_level_security', (
		select coalesce(
			jsonb_agg(
				jsonb_build_object(
					'table', tables.relname,
					'rls_enabled', tables.relrowsecurity,
					'rls_forced', tables.relforcerowsecurity
				)
				order by tables.relname
			),
			'[]'::jsonb
		)
		from pg_class tables
		join pg_namespace schemas on schemas.oid = tables.relnamespace
		join target_tables targets on targets.table_name = tables.relname
		where schemas.nspname = 'public'
	),
	'authenticated_policies', (
		select coalesce(
			jsonb_agg(
				jsonb_build_object(
					'table', policies.tablename,
					'name', policies.policyname,
					'command', policies.cmd,
					'roles', policies.roles,
					'using', policies.qual,
					'check', policies.with_check
				)
				order by policies.tablename, policies.policyname
			),
			'[]'::jsonb
		)
		from pg_policies policies
		join target_tables targets on targets.table_name = policies.tablename
		where policies.schemaname = 'public'
			and ('authenticated' = any(policies.roles) or 'public' = any(policies.roles))
	),
	'authenticated_effective_table_privileges', (
		select jsonb_agg(
			jsonb_build_object(
				'table', targets.table_name,
				'select', has_table_privilege(
					'authenticated', format('public.%I', targets.table_name), 'SELECT'
				),
				'insert', has_table_privilege(
					'authenticated', format('public.%I', targets.table_name), 'INSERT'
				),
				'update', has_table_privilege(
					'authenticated', format('public.%I', targets.table_name), 'UPDATE'
				),
				'delete', has_table_privilege(
					'authenticated', format('public.%I', targets.table_name), 'DELETE'
				)
			)
			order by targets.table_name
		)
		from target_tables targets
	),
	'direct_table_grants', (
		select coalesce(
			jsonb_agg(
				jsonb_build_object(
					'table', grants.table_name,
					'grantee', grants.grantee,
					'privilege', grants.privilege_type,
					'grantable', grants.is_grantable
				)
				order by grants.table_name, grants.grantee, grants.privilege_type
			),
			'[]'::jsonb
		)
		from information_schema.table_privileges grants
		join target_tables targets on targets.table_name = grants.table_name
		where grants.table_schema = 'public'
			and grants.grantee in ('authenticated', 'PUBLIC')
	),
	'routine_exposure', (
		select coalesce(
			jsonb_agg(
				jsonb_build_object(
					'name', routines.proname,
					'identity_arguments', pg_get_function_identity_arguments(routines.oid),
					'security_definer', routines.prosecdef,
					'authenticated_execute', has_function_privilege(
						'authenticated', routines.oid, 'EXECUTE'
					)
				)
				order by routines.proname, pg_get_function_identity_arguments(routines.oid)
			),
			'[]'::jsonb
		)
		from pg_proc routines
		join pg_namespace schemas on schemas.oid = routines.pronamespace
		join target_routines targets on targets.routine_name = routines.proname
		where schemas.nspname = 'public'
	),
	'direct_routine_grants', (
		select coalesce(
			jsonb_agg(
				jsonb_build_object(
					'name', grants.routine_name,
					'specific_name', grants.specific_name,
					'grantee', grants.grantee,
					'privilege', grants.privilege_type,
					'grantable', grants.is_grantable
				)
				order by grants.routine_name, grants.specific_name, grants.grantee
			),
			'[]'::jsonb
		)
		from information_schema.routine_privileges grants
		join target_routines targets on targets.routine_name = grants.routine_name
		where grants.routine_schema = 'public'
			and grants.grantee in ('authenticated', 'PUBLIC')
	),
	'constraints', (
		select coalesce(
			jsonb_agg(
				jsonb_build_object(
					'table', constraints.conrelid::regclass::text,
					'name', constraints.conname,
					'type', constraints.contype,
					'definition', pg_get_constraintdef(constraints.oid)
				)
				order by constraints.conrelid::regclass::text, constraints.conname
			),
			'[]'::jsonb
		)
		from pg_constraint constraints
		join pg_class tables on tables.oid = constraints.conrelid
		join pg_namespace schemas on schemas.oid = tables.relnamespace
		join target_tables targets on targets.table_name = tables.relname
		where schemas.nspname = 'public'
	),
	'indexes', (
		select coalesce(
			jsonb_agg(
				jsonb_build_object(
					'table', indexes.tablename,
					'name', indexes.indexname,
					'definition', indexes.indexdef
				)
				order by indexes.tablename, indexes.indexname
			),
			'[]'::jsonb
		)
		from pg_indexes indexes
		join target_tables targets on targets.table_name = indexes.tablename
		where indexes.schemaname = 'public'
	),
	'phase_2_required_lockdown', jsonb_build_array(
		'No authenticated direct write to worker-owned rows',
		'No authenticated direct prepared-prompt content read/update',
		'No authenticated cleanup execution for referenced prepared inputs',
		'All worker writes use relationship-validating, generation-fenced RPCs',
		'Existing duplicate command keys are resolved before adding the unique keys',
		'No authenticated INSERT on queue_jobs; add_queue_job definer-gated with a job-type allowlist',
		'chat_prompt_snapshots writes move behind the server-only observability writer'
	)
) as agentic_chat_worker_phase0_preflight;
