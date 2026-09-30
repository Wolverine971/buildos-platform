// apps/worker/src/workers/calendar/organizeTaskSync.ts
import { createHash } from 'node:crypto';
import type { Database, Json, OntoProjectEventSyncJobMetadata } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { WorkerTaskEventMutationPort } from '@buildos/shared-agent-ops/calendar/worker-task-event-mutation-port';
import {
	TaskEventSyncCoordinator,
	type TaskEventMutationPort,
	type TaskEventRow
} from '@buildos/shared-agent-ops/calendar/task-event-sync';
import type { ProcessingJob } from '../../lib/supabaseQueue';

type Metadata = {
	kind: 'onto_organize_task_sync';
	taskId: string;
	sourceProjectId: string;
	destinationProjectId: string;
	removedEvents: { id: string; project_id: string }[];
};
export function isOrganizeTaskSync(data: unknown): data is Metadata {
	if (!data || typeof data !== 'object') return false;
	const value = data as Record<string, unknown>;
	return (
		value.kind === 'onto_organize_task_sync' &&
		typeof value.taskId === 'string' &&
		typeof value.sourceProjectId === 'string' &&
		typeof value.destinationProjectId === 'string' &&
		Array.isArray(value.removedEvents) &&
		value.removedEvents.every(
			(row) =>
				row &&
				typeof row === 'object' &&
				typeof row.id === 'string' &&
				row.project_id === value.sourceProjectId
		)
	);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lease token for one queue job, stable across its retries. A crashed attempt
 * leaves its lease behind; the next attempt of the SAME job presents the same
 * token and reclaims it, while a different job for the task still waits for
 * the lease to be released or to expire. The queue retries a job on the same
 * queue_jobs row, so its id is the natural token; the text job id is the
 * fallback for callers that do not carry the row id.
 */
export function organizeLeaseToken(job: Pick<ProcessingJob, 'id' | 'queueRowId'>): string {
	if (job.queueRowId && UUID_PATTERN.test(job.queueRowId)) return job.queueRowId.toLowerCase();
	const hex = createHash('sha256').update(`organize-task-sync:${job.id}`).digest('hex');
	const variant = ((parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function processOrganizeTaskSync(
	job: ProcessingJob<Metadata>,
	admin: SupabaseClient<Database>,
	ports = organizeSyncPorts(admin, job.signal)
) {
	const token = organizeLeaseToken(job);
	const claim = await admin.rpc(
		'claim_organize_calendar_sync' as never,
		{ p_task_id: job.data.taskId, p_token: token } as never
	);
	if (claim.error || claim.data !== true)
		throw new Error('Task calendar reconciliation is busy; retry.');
	try {
		for (const event of job.data.removedEvents) {
			job.signal.throwIfAborted();
			// A deleted ontology row remains until its Google mappings are removed.
			const deleted = await ports.events.deleteEvent(job.userId, {
				eventId: event.id,
				projectId: event.project_id,
				deferCalendarSync: true,
				activityLog: { changeSource: 'form' }
			});
			await enqueueMappedCopyDeletes(admin, job, event, deleted);
		}
		const { data: task, error } = await admin
			.from('onto_tasks')
			.select('*')
			.eq('id', job.data.taskId)
			.maybeSingle();
		if (error) throw new Error(error.message);
		if (!task || task.deleted_at || task.archived_at)
			return { success: true, outcome: 'task_unavailable' };
		const actorResult = await admin
			.from('onto_actors')
			.select('id')
			.eq('user_id', job.userId)
			.single();
		if (actorResult.error) throw new Error(actorResult.error.message);
		const access = await admin.rpc('actor_has_project_member_access', {
			p_actor_id: actorResult.data.id,
			p_project_id: task.project_id,
			p_required_access: 'write'
		});
		if (access.error) throw new Error(access.error.message);
		if (!access.data) return { success: true, outcome: 'access_removed' };
		job.signal.throwIfAborted();
		// A previous attempt can commit createEvent then fail before its has_event
		// edge is written. Reattach existing task-derived events before reconciling.
		const owned = await admin
			.from('onto_events')
			.select('id')
			.eq('project_id', task.project_id)
			.eq('owner_entity_type', 'task')
			.eq('owner_entity_id', task.id)
			.eq('type_key', 'event.task_work')
			.is('deleted_at', null);
		if (owned.error) throw new Error(owned.error.message);
		const linked = await admin
			.from('onto_edges')
			.select('dst_id')
			.eq('project_id', task.project_id)
			.eq('src_kind', 'task')
			.eq('src_id', task.id)
			.eq('dst_kind', 'event')
			.eq('rel', 'has_event');
		if (linked.error) throw new Error(linked.error.message);
		const linkedIds = new Set((linked.data ?? []).map((row) => row.dst_id));
		const missing = (owned.data ?? []).filter((row) => !linkedIds.has(row.id));
		if (missing.length) {
			job.signal.throwIfAborted();
			const repair = await admin.from('onto_edges').insert(
				missing.map((row) => ({
					project_id: task.project_id,
					src_kind: 'task',
					src_id: task.id,
					dst_kind: 'event',
					dst_id: row.id,
					rel: 'has_event'
				}))
			);
			if (repair.error) throw new Error(repair.error.message);
		}
		job.signal.throwIfAborted();
		await ports.tasks.syncTaskEvents(job.userId, actorResult.data.id, task, {
			activityLog: { changeSource: 'form' }
		});
		return { success: true, outcome: 'reconciled' };
	} finally {
		const released = await admin.rpc(
			'release_organize_calendar_sync' as never,
			{ p_task_id: job.data.taskId, p_token: token } as never
		);
		if (released.error)
			await job.log('Calendar reconciliation lease will expire automatically.');
	}
}

/**
 * The port queues Google deletes for the mover only (the default
 * actor_projection mode), and a user's delete job can see only that user's
 * own mapping rows. When a collaborator moves someone else's dated task, the
 * copy in the owner's calendar would be orphaned. Every other user holding a
 * live mapping of the event gets a delete job of their own, run with their own
 * credentials. Same job shape and dedup key as the port, so under
 * member_fanout the jobs it already queued are not duplicated.
 */
async function enqueueMappedCopyDeletes(
	admin: SupabaseClient<Database>,
	job: ProcessingJob<Metadata>,
	removed: { id: string; project_id: string },
	deleted: Partial<TaskEventRow> | null | undefined
) {
	const mappings = await admin
		.from('onto_event_sync')
		.select('user_id, project_calendar_id')
		.eq('event_id', removed.id)
		.eq('provider', 'google')
		.neq('sync_status', 'cancelled');
	if (mappings.error) throw new Error(mappings.error.message);
	const targets = new Set<string>();
	const calendarIds: string[] = [];
	for (const row of mappings.data ?? []) {
		if (row.user_id) targets.add(row.user_id);
		else if (row.project_calendar_id) calendarIds.push(row.project_calendar_id);
	}
	if (calendarIds.length) {
		const calendars = await admin
			.from('project_calendars')
			.select('user_id')
			.in('id', calendarIds);
		if (calendars.error) throw new Error(calendars.error.message);
		for (const row of calendars.data ?? []) if (row.user_id) targets.add(row.user_id);
	}
	// Older events keep the Google identity only in props; the creator holds it.
	const props = (deleted?.props ?? null) as Record<string, unknown> | null;
	if (
		!(mappings.data ?? []).length &&
		typeof props?.external_event_id === 'string' &&
		props.external_event_id &&
		deleted?.created_by
	) {
		const creator = await admin
			.from('onto_actors')
			.select('user_id')
			.eq('id', deleted.created_by)
			.maybeSingle();
		if (creator.error) throw new Error(creator.error.message);
		if (creator.data?.user_id) targets.add(creator.data.user_id);
	}
	targets.delete(job.userId);
	const eventVersion = deleted?.updated_at ?? deleted?.created_at ?? new Date().toISOString();
	for (const targetUserId of targets) {
		job.signal.throwIfAborted();
		const metadata: OntoProjectEventSyncJobMetadata = {
			kind: 'onto_project_event_sync',
			action: 'delete',
			eventId: removed.id,
			projectId: removed.project_id,
			targetUserId,
			triggeredByUserId: job.userId,
			createCalendarIfMissing: false,
			eventUpdatedAt: eventVersion
		};
		const { error } = await admin.rpc('add_queue_job', {
			p_user_id: targetUserId,
			p_job_type: 'sync_calendar',
			p_metadata: metadata as unknown as Json,
			p_priority: 5,
			p_scheduled_for: new Date().toISOString(),
			p_dedup_key: [
				'onto-project-event-sync',
				'delete',
				removed.id,
				targetUserId,
				eventVersion
			].join(':')
		});
		if (error) throw new Error(error.message);
	}
}

function organizeSyncPorts(admin: SupabaseClient<Database>, signal: AbortSignal) {
	const events = new WorkerTaskEventMutationPort(admin);
	async function checked<T>(operation: () => Promise<T>): Promise<T> {
		signal.throwIfAborted();
		const result = await operation();
		signal.throwIfAborted();
		return result;
	}
	const guarded: TaskEventMutationPort = {
		createEvent: (user, request) => checked(() => events.createEvent(user, request)),
		updateEvent: (user, request) => checked(() => events.updateEvent(user, request)),
		deleteEvent: (user, request) => checked(() => events.deleteEvent(user, request))
	};
	return { events: guarded, tasks: new TaskEventSyncCoordinator(admin, guarded) };
}
