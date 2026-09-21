-- Only successful briefs should advance engagement backoff. Failed or
-- abandoned rows are generation attempts, not delivered briefs.
create or replace function public.get_latest_ontology_daily_briefs(user_ids uuid[])
returns table (
	user_id uuid,
	brief_date date,
	generation_completed_at timestamptz
)
language sql
stable
set search_path = ''
as $$
	select distinct on (brief.user_id)
		brief.user_id,
		brief.brief_date,
		brief.generation_completed_at
	from public.ontology_daily_briefs as brief
	where brief.user_id = any (user_ids)
		and brief.generation_status = 'completed'
	order by brief.user_id, brief.brief_date desc;
$$;

comment on function public.get_latest_ontology_daily_briefs(uuid[]) is
	'Returns the latest successfully completed ontology daily brief for each requested user.';

-- Scheduler preflight for the same project states accepted by the brief
-- generator: active/planning projects plus a project paused during the last
-- 24 hours. Access includes canonical membership rows and migration-era
-- created_by values that may contain either an actor id or auth user id.
create or replace function public.get_daily_brief_eligible_user_ids(user_ids uuid[])
returns table (user_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
	select requested.user_id
	from unnest(user_ids) as requested(user_id)
	where exists (
		select 1
		from public.onto_projects as project
		where project.deleted_at is null
			and project.archived_at is null
			and (
				project.state_key in ('planning', 'active')
				or (
					project.state_key = 'paused'
					and exists (
						select 1
						from public.onto_project_logs as project_log
						where project_log.project_id = project.id
							and project_log.entity_type = 'project'
							and project_log.action = 'updated'
							and project_log.created_at >= now() - interval '24 hours'
							and project_log.after_data ->> 'state_key' = 'paused'
							and (project_log.before_data ->> 'state_key') is distinct from 'paused'
					)
				)
			)
			and (
				project.created_by = requested.user_id
				or exists (
					select 1
					from public.onto_actors as owner_actor
					where owner_actor.id = project.created_by
						and owner_actor.user_id = requested.user_id
				)
				or exists (
					select 1
					from public.onto_project_members as membership
					join public.onto_actors as member_actor
						on member_actor.id = membership.actor_id
					where membership.project_id = project.id
						and membership.removed_at is null
						and member_actor.user_id = requested.user_id
				)
			)
	);
$$;

comment on function public.get_daily_brief_eligible_user_ids(uuid[]) is
	'Returns requested users who currently have ontology project content eligible for daily brief generation.';

revoke all on function public.get_daily_brief_eligible_user_ids(uuid[])
	from public, anon, authenticated;
grant execute on function public.get_daily_brief_eligible_user_ids(uuid[])
	to service_role;
