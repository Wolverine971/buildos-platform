import type { Database, Json, OntoProjectEventSyncJobMetadata } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logCreateAsync, logDeleteAsync, logUpdateAsync } from '../ops/async-activity-logger';
import {
	TaskEventSyncCoordinator,
	type TaskEventActivityLogOptions,
	type TaskEventMutationPort,
	type TaskEventRow
} from './task-event-sync';

type CreateRequest = Parameters<TaskEventMutationPort['createEvent']>[1];
type UpdateRequest = Parameters<TaskEventMutationPort['updateEvent']>[1];
type DeleteRequest = Parameters<TaskEventMutationPort['deleteEvent']>[1];
type ProjectCalendarSyncMode = 'actor_projection' | 'member_fanout';
type ProjectEventSyncAction = OntoProjectEventSyncJobMetadata['action'];

const DEFAULT_PROJECT_CALENDAR_SYNC_MODE: ProjectCalendarSyncMode = 'actor_projection';

/**
 * Worker-safe event mutation adapter used by task-derived calendar syncing.
 * It performs only Supabase mutations and durable queue enqueues; it never
 * imports SvelteKit or calls the web host.
 */
export class WorkerTaskEventMutationPort implements TaskEventMutationPort {
	constructor(private readonly admin: SupabaseClient<Database>) {}

	async createEvent(userId: string, request: CreateRequest): Promise<{ event: TaskEventRow }> {
		assertEventRange(request.startAt, request.endAt);
		const { data, error } = await this.admin
			.from('onto_events')
			.insert({
				org_id: null,
				project_id: request.projectId,
				owner_entity_type: request.owner.type,
				owner_entity_id: request.owner.id,
				type_key: request.typeKey,
				state_key: 'scheduled',
				title: request.title,
				description: null,
				location: null,
				start_at: request.startAt,
				end_at: request.endAt,
				all_day: false,
				timezone: null,
				recurrence: {},
				external_link: null,
				props: request.props,
				created_by: request.createdBy
			})
			.select('*')
			.single();
		if (error || !data) throw new Error(error?.message ?? 'Failed to create ontology event');

		await logCreateAsync(
			this.admin,
			request.projectId,
			'event',
			data.id,
			eventActivitySnapshot(data),
			userId,
			request.activityLog.changeSource ?? 'api',
			request.activityLog.chatSessionId,
			request.activityLog.actorContext
		);
		await this.enqueueProjectEventSyncJobs(userId, data, 'upsert');
		return { event: data };
	}

	async updateEvent(userId: string, request: UpdateRequest): Promise<TaskEventRow> {
		assertEventRange(request.startAt, request.endAt);
		const existing = await this.loadEvent(request.eventId, request.projectId);
		const { data, error } = await this.admin
			.from('onto_events')
			.update({
				title: request.title,
				start_at: request.startAt,
				end_at: request.endAt,
				props: request.props
			})
			.eq('id', request.eventId)
			.eq('project_id', request.projectId)
			.select('*')
			.single();
		if (error || !data) throw new Error(error?.message ?? 'Failed to update ontology event');

		const projectId = data.project_id ?? existing.project_id;
		if (projectId) {
			await logUpdateAsync(
				this.admin,
				projectId,
				'event',
				data.id,
				eventActivitySnapshot(existing),
				eventActivitySnapshot(data),
				userId,
				request.activityLog.changeSource ?? 'api',
				request.activityLog.chatSessionId,
				request.activityLog.actorContext
			);
			await this.enqueueProjectEventSyncJobs(userId, data, 'upsert');
		}
		return data;
	}

	async deleteEvent(userId: string, request: DeleteRequest): Promise<TaskEventRow> {
		const existing = await this.loadEvent(request.eventId, request.projectId);
		const now = new Date().toISOString();
		const { data, error } = await this.admin
			.from('onto_events')
			.update({ deleted_at: now, updated_at: now })
			.eq('id', request.eventId)
			.eq('project_id', request.projectId)
			.select('*')
			.single();
		if (error || !data) throw new Error(error?.message ?? 'Failed to delete ontology event');

		const projectId = data.project_id ?? existing.project_id;
		if (projectId) {
			await logDeleteAsync(
				this.admin,
				projectId,
				'event',
				existing.id,
				eventActivitySnapshot(existing),
				userId,
				request.activityLog.changeSource ?? 'api',
				request.activityLog.chatSessionId,
				request.activityLog.actorContext
			);
			await this.enqueueProjectEventSyncJobs(userId, data, 'delete');
		}
		return data;
	}

	private async loadEvent(eventId: string, projectId: string): Promise<TaskEventRow> {
		const { data, error } = await this.admin
			.from('onto_events')
			.select('*')
			.eq('id', eventId)
			.eq('project_id', projectId)
			.maybeSingle();
		if (error) throw new Error(error.message);
		if (!data) throw new Error('Event not found');
		return data;
	}

	private async enqueueProjectEventSyncJobs(
		triggeredByUserId: string,
		event: TaskEventRow,
		action: ProjectEventSyncAction
	): Promise<void> {
		if (!event.project_id) return;
		const targetUserIds = await this.resolveProjectSyncTargets(
			event.project_id,
			triggeredByUserId
		);
		const eventVersion = event.updated_at ?? event.created_at ?? new Date().toISOString();
		let enqueued = 0;

		for (const targetUserId of targetUserIds) {
			const metadata: OntoProjectEventSyncJobMetadata = {
				kind: 'onto_project_event_sync',
				action,
				eventId: event.id,
				projectId: event.project_id,
				targetUserId,
				triggeredByUserId,
				createCalendarIfMissing: targetUserId === triggeredByUserId,
				eventUpdatedAt: eventVersion
			};
			const { error } = await this.admin.rpc('add_queue_job', {
				p_user_id: targetUserId,
				p_job_type: 'sync_calendar',
				p_metadata: metadata as unknown as Json,
				p_priority: 5,
				p_scheduled_for: new Date().toISOString(),
				p_dedup_key: [
					'onto-project-event-sync',
					action,
					event.id,
					targetUserId,
					eventVersion
				].join(':')
			});
			if (error) {
				console.error(
					'[WorkerTaskEventMutationPort] Failed to enqueue calendar sync job:',
					error
				);
				continue;
			}
			enqueued += 1;
		}

		if (enqueued === 0) {
			await this.admin
				.from('onto_events')
				.update({
					sync_status: 'failed',
					sync_error: 'Failed to enqueue calendar sync job'
				})
				.eq('id', event.id)
				.eq('project_id', event.project_id);
		}
	}

	private async resolveProjectSyncTargets(
		projectId: string,
		triggeredByUserId: string
	): Promise<string[]> {
		const { data: project } = await this.admin
			.from('onto_projects')
			.select('props')
			.eq('id', projectId)
			.is('deleted_at', null)
			.maybeSingle();
		const props = (project?.props as Record<string, unknown> | null) ?? {};
		const mode: ProjectCalendarSyncMode =
			props.calendar_sync_mode === 'member_fanout'
				? 'member_fanout'
				: DEFAULT_PROJECT_CALENDAR_SYNC_MODE;
		if (mode === 'actor_projection') return [triggeredByUserId];

		const { data: mappings, error } = await this.admin
			.from('project_calendars')
			.select('user_id')
			.eq('project_id', projectId)
			.or('sync_enabled.is.null,sync_enabled.eq.true');
		if (error) throw new Error(error.message);
		const targetUserIds = Array.from(
			new Set((mappings ?? []).map((mapping) => mapping.user_id).filter(Boolean))
		);
		return targetUserIds.length > 0 ? targetUserIds : [triggeredByUserId];
	}
}

export function createWorkerTaskSyncPort(
	admin: SupabaseClient<Database>
): TaskEventSyncCoordinator {
	return new TaskEventSyncCoordinator(admin, new WorkerTaskEventMutationPort(admin));
}

function eventActivitySnapshot(event: TaskEventRow): Record<string, unknown> {
	return {
		title: event.title,
		type_key: event.type_key,
		state_key: event.state_key,
		start_at: event.start_at,
		end_at: event.end_at,
		owner_entity_type: event.owner_entity_type,
		owner_entity_id: event.owner_entity_id,
		project_id: event.project_id
	};
}

function assertEventRange(startAt: string, endAt: string): void {
	const startMs = Date.parse(startAt);
	const endMs = Date.parse(endAt);
	if (!Number.isFinite(startMs)) throw new Error('Invalid start_at value');
	if (!Number.isFinite(endMs) || endMs <= startMs) {
		throw new Error('end_at must be after start_at');
	}
}
