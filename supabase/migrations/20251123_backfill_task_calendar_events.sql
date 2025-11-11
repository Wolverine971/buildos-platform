-- Migration: Backfill task calendar events into ontology events
-- Description: Materializes existing task_calendar_events rows as onto_events + onto_event_sync + graph edges.
-- Author: Codex (Agent)
-- Date: 2025-11-23

with template as (
	select
		id,
		to_jsonb(tpl.*) as snapshot
	from onto_templates tpl
	where tpl.type_key = 'event.task_work'
	order by tpl.updated_at desc
	limit 1
),
task_mappings as (
	select legacy_id as task_id, onto_id as onto_task_id
	from legacy_entity_mappings
	where legacy_table = 'tasks'
		and onto_table = 'onto_tasks'
),
pending as (
	select
		tce.id as legacy_event_id,
		tce.task_id,
		tce.calendar_id as google_calendar_id,
		tce.calendar_event_id,
		tce.project_calendar_id,
		tce.event_start,
		tce.event_end,
		tce.event_title,
		tce.event_link,
		tce.attendees,
		tce.organizer_email,
		tce.organizer_display_name,
		tce.organizer_self,
		tce.recurrence_rule,
		tce.recurrence_master_id,
		tce.recurrence_instance_date,
		tce.is_exception,
		tce.exception_type,
		tce.sync_status,
		tce.sync_error,
		tce.last_synced_at,
		ot.id as onto_task_id,
		ot.project_id as onto_project_id,
		op.org_id,
		ot.created_by as actor_id,
		bt.id as template_id,
		bt.snapshot as template_snapshot,
		legacy_task.project_id as legacy_project_id,
		legacy_task.title as legacy_task_title,
		legacy_task.description as legacy_task_description,
		coalesce(ot.props->'facets', '{}'::jsonb) as task_facets
	from task_calendar_events tce
	join task_mappings tm on tm.task_id = tce.task_id
	join onto_tasks ot on ot.id = tm.onto_task_id
	join onto_projects op on op.id = ot.project_id
	join tasks legacy_task on legacy_task.id = tce.task_id
	cross join template bt
	left join onto_events existing
		on (existing.props->>'legacy_task_calendar_event_id') = tce.id::text
	where existing.id is null
		and tce.event_start is not null
),
inserted_events as (
	insert into onto_events (
		org_id,
		project_id,
		owner_entity_type,
		owner_entity_id,
		type_key,
		state_key,
		template_id,
		template_snapshot,
		title,
		description,
		location,
		start_at,
		end_at,
		all_day,
		timezone,
		recurrence,
		external_link,
		props,
		last_synced_at,
		sync_status,
		sync_error,
		created_by
	)
	select
		pending.org_id,
		pending.onto_project_id,
		'task'::text,
		pending.onto_task_id,
		'event.task_work',
		case when pending.sync_status::text = 'deleted' then 'cancelled' else 'scheduled' end,
		pending.template_id,
		pending.template_snapshot,
		coalesce(pending.event_title, pending.legacy_task_title, 'Task Work Session'),
		pending.legacy_task_description,
		null,
		pending.event_start,
		pending.event_end,
		false,
		null,
		jsonb_build_object(
			'rule', pending.recurrence_rule,
			'master_id', pending.recurrence_master_id,
			'instance_date', pending.recurrence_instance_date,
			'is_exception', pending.is_exception,
			'exception_type', pending.exception_type
		),
		pending.event_link,
		jsonb_strip_nulls(
			jsonb_build_object(
				'legacy_task_calendar_event_id', pending.legacy_event_id,
				'legacy_task_id', pending.task_id,
				'legacy_project_id', pending.legacy_project_id,
				'google_calendar_event_id', pending.calendar_event_id,
				'google_calendar_id', pending.google_calendar_id,
				'facets', pending.task_facets,
				'attendees', pending.attendees,
				'organizer',
					jsonb_build_object(
						'email', pending.organizer_email,
						'display_name', pending.organizer_display_name,
						'is_self', pending.organizer_self
					)
			)
		),
		pending.last_synced_at,
		pending.sync_status,
		pending.sync_error,
		pending.actor_id
	from pending
	returning
		id as event_id,
		owner_entity_id as onto_task_id,
		(props->>'legacy_task_calendar_event_id')::uuid as legacy_event_id
),
mapping as (
	select
		upsert_legacy_entity_mapping(
			'task_calendar_events',
			inserted_events.legacy_event_id,
			'onto_events',
			inserted_events.event_id,
			jsonb_build_object('source', 'backfill_20251123')
		)
	from inserted_events
	where inserted_events.legacy_event_id is not null
),
event_sync as (
	insert into onto_event_sync (
		event_id,
		calendar_id,
		provider,
		external_event_id,
		sync_token,
		sync_status,
		sync_error,
		last_synced_at
	)
	select
		ie.event_id,
		tce.project_calendar_id,
		'google',
		tce.calendar_event_id,
		null,
		tce.sync_status,
		tce.sync_error,
		tce.last_synced_at
	from inserted_events ie
	join task_calendar_events tce on tce.id = ie.legacy_event_id
	where tce.project_calendar_id is not null
	on conflict (calendar_id, provider, external_event_id) do nothing
	returning 1
),
event_edges as (
	insert into onto_edges (
		src_kind,
		src_id,
		rel,
		dst_kind,
		dst_id,
		props
	)
	select
		'event',
		ie.event_id,
		'schedules',
		'task',
		ie.onto_task_id,
		jsonb_build_object('source', 'backfill_20251123')
	from inserted_events ie
	returning 1
)
select
	(count(*) filter (where true))::bigint as events_inserted,
	(select count(*) from event_sync) as sync_rows_inserted,
	(select count(*) from event_edges) as edge_rows_inserted
from inserted_events;
