// packages/shared-agent-ops/src/calendar/task-event-sync.ts
import type { Database, Json, ProjectLogChangeSource } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActivityLogActorContext } from '../ops/async-activity-logger';
import type {
	TaskCalendarEventReceipt,
	TaskEventSyncSummary,
	TaskSyncPort
} from '../gateway/op-execution-gateway.types';

type OntoTaskRow = Database['public']['Tables']['onto_tasks']['Row'];
export type TaskEventRow = Database['public']['Tables']['onto_events']['Row'];
export type TaskEventKind = 'range' | 'start' | 'due';

export interface TaskEventActivityLogOptions {
	changeSource?: ProjectLogChangeSource;
	chatSessionId?: string;
	actorContext?: ActivityLogActorContext;
}

export interface TaskEventMutationPort {
	createEvent(
		userId: string,
		request: {
			projectId: string;
			owner: { type: 'task'; id: string };
			typeKey: 'event.task_work';
			title: string;
			startAt: string;
			endAt: string;
			createdBy: string;
			deferCalendarSync: true;
			props: Json;
			activityLog: TaskEventActivityLogOptions;
		}
	): Promise<{ event: TaskEventRow }>;
	updateEvent(
		userId: string,
		request: {
			eventId: string;
			projectId: string;
			title: string;
			startAt: string;
			endAt: string;
			deferCalendarSync: true;
			props: Json;
			syncTaskFromEvent: false;
			activityLog: TaskEventActivityLogOptions;
		}
	): Promise<TaskEventRow>;
	deleteEvent(
		userId: string,
		request: {
			eventId: string;
			projectId: string;
			deferCalendarSync: true;
			activityLog: TaskEventActivityLogOptions;
		}
	): Promise<TaskEventRow>;
}

interface TaskEventSpec {
	kind: TaskEventKind;
	startAt: string;
	endAt: string;
	title: string;
}

const TEN_HOURS_MS = 10 * 60 * 60 * 1000;
const HALF_HOUR_MS = 30 * 60 * 1000;

/**
 * Runtime-neutral coordinator for task-derived ontology events.
 *
 * Web and worker runtimes provide their own event mutation port, while this
 * class owns the legacy scheduling, matching, edge, and completion semantics.
 */
export class TaskEventSyncCoordinator implements TaskSyncPort {
	constructor(
		private readonly supabase: SupabaseClient<Database>,
		private readonly eventMutations: TaskEventMutationPort
	) {}

	/**
	 * Reconcile a task's derived calendar events and report what happened, so
	 * tool receipts can state the real side effects instead of guessing.
	 */
	async syncTaskEvents(
		userId: string,
		actorId: string,
		task: OntoTaskRow,
		options: { activityLog?: TaskEventActivityLogOptions } = {}
	): Promise<TaskEventSyncSummary> {
		const syncedEvents: TaskCalendarEventReceipt[] = [];
		let removedEventCount = 0;
		const desiredSpecs = buildTaskEventSpecs(task);
		const activityLog = buildActivityLogOptions(options.activityLog, actorId);

		const { data: edges, error: edgeError } = await this.supabase
			.from('onto_edges')
			.select('dst_id')
			.eq('src_id', task.id)
			.eq('src_kind', 'task')
			.eq('dst_kind', 'event')
			.eq('rel', 'has_event');

		if (edgeError) throw new Error(edgeError.message);

		const existingEventIds = (edges ?? []).map((edge) => edge.dst_id);
		if (existingEventIds.length === 0 && desiredSpecs.length === 0) {
			return { events: [], removed_event_count: 0 };
		}

		let existingEvents: TaskEventRow[] = [];
		if (existingEventIds.length > 0) {
			const { data: events, error } = await this.supabase
				.from('onto_events')
				.select('*')
				.in('id', existingEventIds)
				.eq('project_id', task.project_id);
			if (error) throw new Error(error.message);
			existingEvents = events ?? [];
		}

		if (task.state_key === 'done') {
			removedEventCount = await this.removeEvents(
				userId,
				futureTaskEventsOnCompletion(existingEvents),
				activityLog,
				task.id,
				task.project_id
			);
			return { events: [], removed_event_count: removedEventCount };
		}

		if (desiredSpecs.length === 0) {
			removedEventCount = await this.removeEvents(
				userId,
				existingEvents,
				activityLog,
				task.id,
				task.project_id
			);
			return { events: [], removed_event_count: removedEventCount };
		}

		const eventsByKind = new Map<TaskEventKind, TaskEventRow>();
		const untypedEvents: TaskEventRow[] = [];
		for (const event of existingEvents) {
			const props = (event.props as Record<string, unknown> | null) ?? {};
			const kind = props.task_event_kind as TaskEventKind | undefined;
			if (kind && !eventsByKind.has(kind)) eventsByKind.set(kind, event);
			else untypedEvents.push(event);
		}

		const usedEventIds = new Set<string>();
		for (const spec of desiredSpecs) {
			const existing = eventsByKind.get(spec.kind) ?? untypedEvents.shift();
			const props = taskEventProps(task, spec.kind, existing?.props);
			if (existing) {
				usedEventIds.add(existing.id);
				await this.eventMutations.updateEvent(userId, {
					eventId: existing.id,
					projectId: task.project_id,
					title: spec.title,
					startAt: spec.startAt,
					endAt: spec.endAt,
					deferCalendarSync: true,
					props,
					syncTaskFromEvent: false,
					activityLog
				});
				syncedEvents.push({
					id: existing.id,
					title: spec.title,
					start_at: spec.startAt,
					end_at: spec.endAt
				});
				continue;
			}

			const result = await this.eventMutations.createEvent(userId, {
				projectId: task.project_id,
				owner: { type: 'task', id: task.id },
				typeKey: 'event.task_work',
				title: spec.title,
				startAt: spec.startAt,
				endAt: spec.endAt,
				createdBy: actorId,
				deferCalendarSync: true,
				props,
				activityLog
			});

			await this.supabase.from('onto_edges').insert({
				project_id: task.project_id,
				src_id: task.id,
				src_kind: 'task',
				dst_id: result.event.id,
				dst_kind: 'event',
				rel: 'has_event'
			});
			usedEventIds.add(result.event.id);
			syncedEvents.push({
				id: result.event.id,
				title: spec.title,
				start_at: spec.startAt,
				end_at: spec.endAt
			});
		}

		removedEventCount = await this.removeEvents(
			userId,
			existingEvents.filter((event) => !usedEventIds.has(event.id)),
			activityLog,
			task.id,
			task.project_id
		);

		return { events: syncedEvents, removed_event_count: removedEventCount };
	}

	private async removeEvents(
		userId: string,
		events: TaskEventRow[],
		activityLog: TaskEventActivityLogOptions,
		taskId: string,
		projectId: string
	): Promise<number> {
		for (const event of events) {
			await this.eventMutations.deleteEvent(userId, {
				eventId: event.id,
				projectId,
				deferCalendarSync: true,
				activityLog
			});
			await this.supabase
				.from('onto_edges')
				.delete()
				.eq('src_id', taskId)
				.eq('src_kind', 'task')
				.eq('dst_id', event.id)
				.eq('dst_kind', 'event')
				.eq('rel', 'has_event');
		}
		return events.length;
	}
}

export function buildTaskEventSpecs(
	task: Pick<OntoTaskRow, 'title' | 'start_at' | 'due_at'>
): TaskEventSpec[] {
	const startDate = parseOptionalDate(task.start_at);
	const dueDate = parseOptionalDate(task.due_at);
	if ((task.start_at && !startDate) || (task.due_at && !dueDate)) return [];
	if (!startDate && !dueDate) return [];

	const title = task.title || 'Task';
	if (startDate && !dueDate) {
		return [
			{
				kind: 'start',
				startAt: startDate.toISOString(),
				endAt: new Date(startDate.getTime() + HALF_HOUR_MS).toISOString(),
				title: `Start: ${title}`
			}
		];
	}
	if (!startDate && dueDate) {
		return [
			{
				kind: 'due',
				startAt: new Date(dueDate.getTime() - HALF_HOUR_MS).toISOString(),
				endAt: dueDate.toISOString(),
				title: `Due: ${title}`
			}
		];
	}
	if (!startDate || !dueDate) return [];

	const diffMs = dueDate.getTime() - startDate.getTime();
	if (diffMs <= 0) return [];
	if (diffMs <= TEN_HOURS_MS) {
		return [
			{
				kind: 'range',
				startAt: startDate.toISOString(),
				endAt: dueDate.toISOString(),
				title
			}
		];
	}

	return [
		{
			kind: 'start',
			startAt: startDate.toISOString(),
			endAt: new Date(startDate.getTime() + HALF_HOUR_MS).toISOString(),
			title: `Start: ${title}`
		},
		{
			kind: 'due',
			startAt: new Date(dueDate.getTime() - HALF_HOUR_MS).toISOString(),
			endAt: dueDate.toISOString(),
			title: `Due: ${title}`
		}
	];
}

export function futureTaskEventsOnCompletion(
	events: TaskEventRow[],
	nowMs = Date.now()
): TaskEventRow[] {
	return events.filter((event) => {
		const props = (event.props as Record<string, unknown> | null) ?? {};
		const kind = props.task_event_kind as TaskEventKind | undefined;
		const startMs = parseTimestampMs(event.start_at);
		const endMs = parseTimestampMs(event.end_at);
		if (kind === 'due') {
			const dueMs = endMs ?? startMs;
			return dueMs !== null && dueMs > nowMs;
		}
		return startMs !== null && startMs > nowMs;
	});
}

function taskEventProps(
	task: Pick<OntoTaskRow, 'id' | 'project_id' | 'title'>,
	kind: TaskEventKind,
	existingProps?: TaskEventRow['props']
): Json {
	return {
		...((existingProps as Record<string, unknown> | null) ?? {}),
		task_event_kind: kind,
		task_id: task.id,
		task_title: task.title ?? 'Task',
		task_link: `/projects/${task.project_id}/tasks/${task.id}`,
		project_id: task.project_id
	} as Json;
}

function buildActivityLogOptions(
	activityLog: TaskEventActivityLogOptions | undefined,
	actorId: string
): TaskEventActivityLogOptions {
	return {
		...(activityLog ?? {}),
		actorContext: {
			...(activityLog?.actorContext ?? {}),
			changedByActorId: activityLog?.actorContext?.changedByActorId ?? actorId
		}
	};
}

function parseOptionalDate(value: string | null): Date | null {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function parseTimestampMs(value: string | null): number | null {
	if (!value) return null;
	const timestamp = Date.parse(value);
	return Number.isNaN(timestamp) ? null : timestamp;
}
