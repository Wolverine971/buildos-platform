// apps/worker/src/workers/calendar/organizeTaskSync.ts
import { randomUUID } from 'node:crypto';
import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { WorkerTaskEventMutationPort } from '@buildos/shared-agent-ops/calendar/worker-task-event-mutation-port';
import {
	TaskEventSyncCoordinator,
	type TaskEventMutationPort
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

export async function processOrganizeTaskSync(
	job: ProcessingJob<Metadata>,
	admin: SupabaseClient<Database>,
	ports = organizeSyncPorts(admin, job.signal)
) {
	const token = randomUUID();
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
			await ports.events.deleteEvent(job.userId, {
				eventId: event.id,
				projectId: event.project_id,
				deferCalendarSync: true,
				activityLog: { changeSource: 'form' }
			});
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
