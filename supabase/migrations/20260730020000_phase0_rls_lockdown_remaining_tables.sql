-- supabase/migrations/20260730020000_phase0_rls_lockdown_remaining_tables.sql
-- Phase 0: close the remaining public-schema tables that had RLS disabled.
--
-- This migration intentionally revokes table privileges before selectively
-- granting only the operations the web client needs. service_role keeps its
-- normal PostgreSQL BYPASSRLS access; service-only tables therefore have no
-- policy at all.

begin;

-- Public feedback is handled by a server endpoint. The function is kept as a
-- narrow service-only mutation surface so callers cannot choose another IP and
-- poison its rate-limit bucket through PostgREST.
alter function public.check_feedback_rate_limit(inet) security definer;
alter function public.check_feedback_rate_limit(inet) set search_path = public, pg_temp;
revoke all on function public.check_feedback_rate_limit(inet) from public, anon, authenticated;
grant execute on function public.check_feedback_rate_limit(inet) to service_role;

-- Browser/auth failures still need to be recordable before a session exists.
-- This RPC exposes INSERT-only behavior, whitelists columns, caps payload size,
-- and prevents callers from impersonating another user or attaching a log to a
-- project they cannot read.
create or replace function public.log_client_error(p_entry jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
	v_id uuid;
	v_role text := auth.role();
	v_user_id uuid;
	v_project_id uuid;
	v_metadata jsonb := case
		when jsonb_typeof(p_entry -> 'metadata') = 'object' then p_entry -> 'metadata'
		else '{}'::jsonb
	end;
begin
	if p_entry is null or jsonb_typeof(p_entry) <> 'object' then
		raise exception 'p_entry must be a JSON object' using errcode = '22023';
	end if;

	if pg_column_size(p_entry) > 65536 then
		raise exception 'error log payload exceeds 64 KiB' using errcode = '22023';
	end if;

	if v_role not in ('anon', 'authenticated', 'service_role') then
		raise exception 'not authorized to create error logs' using errcode = '42501';
	end if;

	if v_role = 'authenticated' then
		v_user_id := auth.uid();
	elsif v_role = 'service_role' then
		v_user_id := nullif(p_entry ->> 'user_id', '')::uuid;
	else
		v_user_id := null;
	end if;

	v_project_id := nullif(p_entry ->> 'project_id', '')::uuid;
	if v_project_id is not null and (
		(v_role = 'authenticated' and not public.current_actor_has_project_member_access(v_project_id, 'read'))
		or v_role = 'anon'
		or not exists (select 1 from public.onto_projects p where p.id = v_project_id)
	) then
		v_metadata := v_metadata || jsonb_build_object(
			'invalid_project_id', v_project_id,
			'project_id_omitted_reason', 'not_found_or_not_accessible'
		);
		v_project_id := null;
	end if;

	insert into public.error_logs (
		error_type,
		error_code,
		error_message,
		error_stack,
		severity,
		user_id,
		project_id,
		brain_dump_id,
		endpoint,
		http_method,
		request_id,
		user_agent,
		ip_address,
		llm_provider,
		llm_model,
		prompt_tokens,
		completion_tokens,
		total_tokens,
		response_time_ms,
		llm_temperature,
		llm_max_tokens,
		operation_type,
		table_name,
		record_id,
		operation_payload,
		metadata,
		environment,
		app_version,
		browser_info
	)
	values (
		left(coalesce(nullif(p_entry ->> 'error_type', ''), 'unknown'), 100),
		left(nullif(p_entry ->> 'error_code', ''), 200),
		left(coalesce(nullif(p_entry ->> 'error_message', ''), 'Unknown error'), 8000),
		left(nullif(p_entry ->> 'error_stack', ''), 32000),
		left(coalesce(nullif(p_entry ->> 'severity', ''), 'error'), 50),
		v_user_id,
		v_project_id,
		nullif(p_entry ->> 'brain_dump_id', '')::uuid,
		left(nullif(p_entry ->> 'endpoint', ''), 2000),
		left(nullif(p_entry ->> 'http_method', ''), 20),
		left(nullif(p_entry ->> 'request_id', ''), 500),
		left(nullif(p_entry ->> 'user_agent', ''), 2000),
		nullif(p_entry ->> 'ip_address', '')::inet,
		left(nullif(p_entry ->> 'llm_provider', ''), 200),
		left(nullif(p_entry ->> 'llm_model', ''), 500),
		nullif(p_entry ->> 'prompt_tokens', '')::integer,
		nullif(p_entry ->> 'completion_tokens', '')::integer,
		nullif(p_entry ->> 'total_tokens', '')::integer,
		nullif(p_entry ->> 'response_time_ms', '')::integer,
		nullif(p_entry ->> 'llm_temperature', '')::numeric,
		nullif(p_entry ->> 'llm_max_tokens', '')::integer,
		left(nullif(p_entry ->> 'operation_type', ''), 500),
		left(nullif(p_entry ->> 'table_name', ''), 500),
		nullif(p_entry ->> 'record_id', '')::uuid,
		case when p_entry ? 'operation_payload' then p_entry -> 'operation_payload' else null end,
		v_metadata,
		left(nullif(p_entry ->> 'environment', ''), 100),
		left(nullif(p_entry ->> 'app_version', ''), 100),
		case when p_entry ? 'browser_info' then p_entry -> 'browser_info' else null end
	)
	returning id into v_id;

	return v_id;
end;
$function$;

revoke all on function public.log_client_error(jsonb) from public;
grant execute on function public.log_client_error(jsonb) to anon, authenticated, service_role;

-- delete_onto_project touches several service-only tables. Make the operation
-- atomic under the function owner while preserving the project-admin check.
create or replace function public.delete_onto_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
	v_goal_ids uuid[];
	v_requirement_ids uuid[];
	v_plan_ids uuid[];
	v_task_ids uuid[];
	v_document_ids uuid[];
	v_source_ids uuid[];
	v_risk_ids uuid[];
	v_milestone_ids uuid[];
	v_metric_ids uuid[];
	v_signal_ids uuid[];
	v_insight_ids uuid[];
	v_event_ids uuid[];
	v_all_ids uuid[];
begin
	if p_project_id is null then
		raise exception 'Project ID required' using errcode = '22023';
	end if;

	if coalesce(auth.role(), '') <> 'service_role'
		and not public.current_actor_has_project_member_access(p_project_id, 'admin') then
		raise exception 'Project admin access required' using errcode = '42501';
	end if;

	select coalesce(array_agg(id), '{}'::uuid[]) into v_goal_ids from public.onto_goals where project_id = p_project_id;
	select coalesce(array_agg(id), '{}'::uuid[]) into v_requirement_ids from public.onto_requirements where project_id = p_project_id;
	select coalesce(array_agg(id), '{}'::uuid[]) into v_plan_ids from public.onto_plans where project_id = p_project_id;
	select coalesce(array_agg(id), '{}'::uuid[]) into v_task_ids from public.onto_tasks where project_id = p_project_id;
	select coalesce(array_agg(id), '{}'::uuid[]) into v_document_ids from public.onto_documents where project_id = p_project_id;
	select coalesce(array_agg(id), '{}'::uuid[]) into v_source_ids from public.onto_sources where project_id = p_project_id;
	select coalesce(array_agg(id), '{}'::uuid[]) into v_risk_ids from public.onto_risks where project_id = p_project_id;
	select coalesce(array_agg(id), '{}'::uuid[]) into v_milestone_ids from public.onto_milestones where project_id = p_project_id;
	select coalesce(array_agg(id), '{}'::uuid[]) into v_metric_ids from public.onto_metrics where project_id = p_project_id;
	select coalesce(array_agg(id), '{}'::uuid[]) into v_signal_ids from public.onto_signals where project_id = p_project_id;
	select coalesce(array_agg(id), '{}'::uuid[]) into v_insight_ids from public.onto_insights where project_id = p_project_id;
	select coalesce(array_agg(id), '{}'::uuid[]) into v_event_ids from public.onto_events where project_id = p_project_id;

	v_all_ids := array[p_project_id]
		|| v_goal_ids || v_requirement_ids || v_plan_ids || v_task_ids
		|| v_document_ids || v_source_ids || v_risk_ids || v_milestone_ids
		|| v_metric_ids || v_signal_ids || v_insight_ids || v_event_ids;

	delete from public.onto_event_sync where event_id = any(v_event_ids);
	delete from public.onto_metric_points where metric_id = any(v_metric_ids);
	delete from public.onto_document_versions where document_id = any(v_document_ids);
	delete from public.onto_edges where src_id = any(v_all_ids) or dst_id = any(v_all_ids);
	delete from public.onto_assignments
	where object_id = any(v_all_ids)
		and object_kind = any(array['project','plan','task','goal','document','requirement','milestone','risk','metric','event']);
	delete from public.onto_permissions
	where object_id = any(v_all_ids)
		and object_kind = any(array['project','plan','task','goal','document','requirement','milestone','risk','metric','event']);
	delete from public.legacy_entity_mappings
	where onto_id = any(v_all_ids)
		and onto_table = any(array[
			'onto_projects','onto_plans','onto_tasks','onto_goals','onto_documents',
			'onto_requirements','onto_milestones','onto_risks','onto_sources',
			'onto_metrics','onto_signals','onto_insights','onto_events'
		]);

	delete from public.onto_events where project_id = p_project_id;
	delete from public.onto_signals where project_id = p_project_id;
	delete from public.onto_insights where project_id = p_project_id;
	delete from public.onto_sources where project_id = p_project_id;
	delete from public.onto_risks where project_id = p_project_id;
	delete from public.onto_milestones where project_id = p_project_id;
	delete from public.onto_metrics where project_id = p_project_id;
	delete from public.onto_documents where project_id = p_project_id;
	delete from public.onto_tasks where project_id = p_project_id;
	delete from public.onto_plans where project_id = p_project_id;
	delete from public.onto_requirements where project_id = p_project_id;
	delete from public.onto_goals where project_id = p_project_id;
	delete from public.onto_projects where id = p_project_id;
end;
$function$;

revoke all on function public.delete_onto_project(uuid) from public, anon;
grant execute on function public.delete_onto_project(uuid) to authenticated, service_role;

-- Enable RLS, remove the dormant/broad policies, and remove all direct table
-- privileges. Explicit grants and policies are recreated below.
do $block$
declare
	v_table_name text;
	policy_row record;
	tables text[] := array[
		'agent_chat_sessions','beta_feedback','beta_members','beta_signups',
		'calendar_webhook_channels','error_logs','feedback_rate_limit',
		'legacy_entity_mappings','migration_log','notes','notification_deliveries',
		'notification_events','notification_subscriptions','onto_actors',
		'onto_assignments','onto_document_versions','onto_event_sync','onto_events',
		'onto_facet_values','onto_metrics','onto_requirements','onto_sources',
		'project_brief_templates','project_notification_batches','project_questions',
		'queue_jobs','retargeting_founder_pilot_members','system_metrics',
		'task_calendar_events','user_calendar_preferences',
		'user_notification_preferences','user_notifications','user_sms_preferences',
		'visitors'
	];
begin
	foreach v_table_name in array tables loop
		execute format('alter table public.%I enable row level security', v_table_name);
		execute format('revoke all privileges on table public.%I from anon, authenticated', v_table_name);

		for policy_row in
			select policyname
			from pg_policies
			where schemaname = 'public' and tablename = v_table_name
		loop
			execute format('drop policy %I on public.%I', policy_row.policyname, v_table_name);
		end loop;
	end loop;
end;
$block$;

-- User-owned tables with normal CRUD.
create policy agent_chat_sessions_own_all on public.agent_chat_sessions
	for all to authenticated using (user_id = auth.uid() or public.is_admin())
	with check (user_id = auth.uid() or public.is_admin());
create policy calendar_webhook_channels_own_all on public.calendar_webhook_channels
	for all to authenticated using (user_id = auth.uid() or public.is_admin())
	with check (user_id = auth.uid() or public.is_admin());
create policy notes_own_all on public.notes
	for all to authenticated using (user_id = auth.uid() or public.is_admin())
	with check (user_id = auth.uid() or public.is_admin());
create policy notification_subscriptions_own_all on public.notification_subscriptions
	for all to authenticated using (user_id = auth.uid() or public.is_admin())
	with check (user_id = auth.uid() or public.is_admin());
create policy onto_event_sync_own_all on public.onto_event_sync
	for all to authenticated using (user_id = auth.uid() or public.is_admin())
	with check (user_id = auth.uid() or public.is_admin());
create policy project_questions_own_all on public.project_questions
	for all to authenticated using (user_id = auth.uid() or public.is_admin())
	with check (user_id = auth.uid() or public.is_admin());
create policy task_calendar_events_own_all on public.task_calendar_events
	for all to authenticated using (user_id = auth.uid() or public.is_admin())
	with check (user_id = auth.uid() or public.is_admin());
create policy user_calendar_preferences_own_all on public.user_calendar_preferences
	for all to authenticated using (user_id = auth.uid() or public.is_admin())
	with check (user_id = auth.uid() or public.is_admin());
create policy user_notification_preferences_own_all on public.user_notification_preferences
	for all to authenticated using (user_id = auth.uid() or public.is_admin())
	with check (user_id = auth.uid() or public.is_admin());
create policy user_sms_preferences_own_all on public.user_sms_preferences
	for all to authenticated using (user_id = auth.uid() or public.is_admin())
	with check (user_id = auth.uid() or public.is_admin());

-- Templates are private to their owner, except explicitly global defaults.
create policy project_brief_templates_select on public.project_brief_templates
	for select to authenticated
	using (user_id = auth.uid() or is_default = true or public.is_admin());
create policy project_brief_templates_insert on public.project_brief_templates
	for insert to authenticated with check (user_id = auth.uid() or public.is_admin());
create policy project_brief_templates_update on public.project_brief_templates
	for update to authenticated using (user_id = auth.uid() or public.is_admin())
	with check (user_id = auth.uid() or public.is_admin());
create policy project_brief_templates_delete on public.project_brief_templates
	for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- Notification history is written by trusted server paths. Users can only read
-- and acknowledge their own rows.
create policy notification_deliveries_select on public.notification_deliveries
	for select to authenticated
	using (recipient_user_id = auth.uid() or public.is_admin());
create policy notification_deliveries_update on public.notification_deliveries
	for update to authenticated
	using (recipient_user_id = auth.uid() or public.is_admin())
	with check (recipient_user_id = auth.uid() or public.is_admin());
create policy notification_events_select on public.notification_events
	for select to authenticated
	using (actor_user_id = auth.uid() or target_user_id = auth.uid() or public.is_admin());
create policy user_notifications_select on public.user_notifications
	for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy user_notifications_update on public.user_notifications
	for update to authenticated using (user_id = auth.uid() or public.is_admin())
	with check (user_id = auth.uid() or public.is_admin());
create policy user_notifications_delete on public.user_notifications
	for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- Actors can be resolved only when they belong to the current user or one of
-- that user's projects. Public author endpoints now use the server client.
create policy onto_actors_select on public.onto_actors
	for select to authenticated
	using (
		user_id = auth.uid()
		or public.is_admin()
		or exists (
			select 1
			from public.onto_project_members m
			where m.actor_id = onto_actors.id
				and m.removed_at is null
				and public.current_actor_has_project_member_access(m.project_id, 'read')
		)
	);

-- Project-scoped ontology tables follow the established member read/write
-- helper used by the rest of the ontology schema.
create policy onto_events_select on public.onto_events for select to authenticated
	using (public.current_actor_has_project_member_access(project_id, 'read'));
create policy onto_events_insert on public.onto_events for insert to authenticated
	with check (public.current_actor_has_project_member_access(project_id, 'write'));
create policy onto_events_update on public.onto_events for update to authenticated
	using (public.current_actor_has_project_member_access(project_id, 'write'))
	with check (public.current_actor_has_project_member_access(project_id, 'write'));
create policy onto_events_delete on public.onto_events for delete to authenticated
	using (public.current_actor_has_project_member_access(project_id, 'write'));

create policy onto_requirements_select on public.onto_requirements for select to authenticated
	using (public.current_actor_has_project_member_access(project_id, 'read'));
create policy onto_requirements_insert on public.onto_requirements for insert to authenticated
	with check (public.current_actor_has_project_member_access(project_id, 'write'));
create policy onto_requirements_update on public.onto_requirements for update to authenticated
	using (public.current_actor_has_project_member_access(project_id, 'write'))
	with check (public.current_actor_has_project_member_access(project_id, 'write'));
create policy onto_requirements_delete on public.onto_requirements for delete to authenticated
	using (public.current_actor_has_project_member_access(project_id, 'write'));

create policy onto_metrics_select on public.onto_metrics for select to authenticated
	using (public.current_actor_has_project_member_access(project_id, 'read'));
create policy onto_metrics_insert on public.onto_metrics for insert to authenticated
	with check (public.current_actor_has_project_member_access(project_id, 'write'));
create policy onto_metrics_update on public.onto_metrics for update to authenticated
	using (public.current_actor_has_project_member_access(project_id, 'write'))
	with check (public.current_actor_has_project_member_access(project_id, 'write'));
create policy onto_metrics_delete on public.onto_metrics for delete to authenticated
	using (public.current_actor_has_project_member_access(project_id, 'write'));

create policy onto_sources_select on public.onto_sources for select to authenticated
	using (public.current_actor_has_project_member_access(project_id, 'read'));
create policy onto_sources_insert on public.onto_sources for insert to authenticated
	with check (public.current_actor_has_project_member_access(project_id, 'write'));
create policy onto_sources_update on public.onto_sources for update to authenticated
	using (public.current_actor_has_project_member_access(project_id, 'write'))
	with check (public.current_actor_has_project_member_access(project_id, 'write'));
create policy onto_sources_delete on public.onto_sources for delete to authenticated
	using (public.current_actor_has_project_member_access(project_id, 'write'));

create policy project_notification_batches_select on public.project_notification_batches
	for select to authenticated
	using (public.current_actor_has_project_member_access(project_id, 'read'));
create policy project_notification_batches_write on public.project_notification_batches
	for all to authenticated
	using (public.current_actor_has_project_member_access(project_id, 'write'))
	with check (public.current_actor_has_project_member_access(project_id, 'write'));

create policy onto_document_versions_select on public.onto_document_versions
	for select to authenticated using (exists (
		select 1 from public.onto_documents d
		where d.id = onto_document_versions.document_id
			and public.current_actor_has_project_member_access(d.project_id, 'read')
	));
create policy onto_document_versions_write on public.onto_document_versions
	for all to authenticated using (exists (
		select 1 from public.onto_documents d
		where d.id = onto_document_versions.document_id
			and public.current_actor_has_project_member_access(d.project_id, 'write')
	)) with check (exists (
		select 1 from public.onto_documents d
		where d.id = onto_document_versions.document_id
			and public.current_actor_has_project_member_access(d.project_id, 'write')
	));

-- Queue inserts are server-only. Realtime and cancellation remain user-scoped.
create policy queue_jobs_select on public.queue_jobs
	for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy queue_jobs_update on public.queue_jobs
	for update to authenticated using (user_id = auth.uid() or public.is_admin())
	with check (user_id = auth.uid() or public.is_admin());
create policy queue_jobs_delete on public.queue_jobs
	for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- Client error reads are private; all writes go through log_client_error.
create policy error_logs_select on public.error_logs
	for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy error_logs_admin_update on public.error_logs
	for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy error_logs_admin_delete on public.error_logs
	for delete to authenticated using (public.is_admin());

-- Admin-maintained tables. These retain authenticated DML grants solely so the
-- existing session-checked admin routes can operate under is_admin().
create policy beta_feedback_admin on public.beta_feedback
	for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy beta_members_admin on public.beta_members
	for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy beta_signups_admin on public.beta_signups
	for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy legacy_entity_mappings_admin on public.legacy_entity_mappings
	for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy migration_log_admin on public.migration_log
	for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy system_metrics_admin on public.system_metrics
	for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy visitors_admin_select on public.visitors
	for select to authenticated using (public.is_admin());

-- Global ontology reference data is readable but never writable by users.
create policy onto_facet_values_select on public.onto_facet_values
	for select to authenticated using (true);

-- Selective table grants. No anon table grants remain in this migration.
grant select, insert, update, delete on table
	public.agent_chat_sessions,
	public.calendar_webhook_channels,
	public.notes,
	public.notification_subscriptions,
	public.onto_event_sync,
	public.project_brief_templates,
	public.project_questions,
	public.task_calendar_events,
	public.user_calendar_preferences,
	public.user_notification_preferences,
	public.user_sms_preferences,
	public.onto_events,
	public.onto_requirements,
	public.onto_metrics,
	public.onto_sources,
	public.onto_document_versions,
	public.project_notification_batches
to authenticated;

grant select, update, delete on table public.queue_jobs, public.user_notifications
to authenticated;
grant select, update on table public.notification_deliveries to authenticated;
grant select on table public.notification_events, public.onto_actors, public.onto_facet_values
to authenticated;
grant select, update, delete on table public.error_logs to authenticated;
grant select, insert, update, delete on table
	public.beta_feedback,
	public.beta_members,
	public.beta_signups,
	public.legacy_entity_mappings,
	public.migration_log,
	public.system_metrics
to authenticated;
grant select on table public.visitors to authenticated;

-- RLS does not protect TRUNCATE, REFERENCES, or TRIGGER. Supabase's historical
-- broad grants included those capabilities, so remove them globally and from
-- future tables created by the migration owner.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges in schema public
	revoke truncate, references, trigger on tables from anon, authenticated;

commit;
