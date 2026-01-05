// apps/web/src/lib/services/ontology/task-event-sync.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { OntoEventSyncService } from './onto-event-sync.service';

type OntoTaskRow = Database['public']['Tables']['onto_tasks']['Row'];
type OntoEventRow = Database['public']['Tables']['onto_events']['Row'];

type TaskEventKind = 'range' | 'start' | 'due';

interface TaskEventSpec {
	kind: TaskEventKind;
	startAt: string;
	endAt: string;
	title: string;
}

const TEN_HOURS_MS = 10 * 60 * 60 * 1000;
const HALF_HOUR_MS = 30 * 60 * 1000;

export class TaskEventSyncService {
	private readonly eventSyncService: OntoEventSyncService;

	constructor(private readonly supabase: SupabaseClient<Database>) {
		this.eventSyncService = new OntoEventSyncService(supabase);
	}

	async syncTaskEvents(userId: string, actorId: string, task: OntoTaskRow): Promise<void> {
		const desiredSpecs = this.buildSpecs(task);

		const { data: edges, error: edgeError } = await this.supabase
			.from('onto_edges')
			.select('dst_id')
			.eq('src_id', task.id)
			.eq('src_kind', 'task')
			.eq('dst_kind', 'event')
			.eq('rel', 'has_event');

		if (edgeError) {
			throw new Error(edgeError.message);
		}

		const existingEventIds = (edges ?? []).map((edge) => edge.dst_id);

		if (existingEventIds.length === 0 && desiredSpecs.length === 0) {
			return;
		}

		let existingEvents: OntoEventRow[] = [];
		if (existingEventIds.length > 0) {
			const { data: events, error } = await this.supabase
				.from('onto_events')
				.select('*')
				.in('id', existingEventIds);

			if (error) {
				throw new Error(error.message);
			}

			existingEvents = events ?? [];
		}

		if (desiredSpecs.length === 0) {
			await this.removeEvents(userId, existingEvents);
			return;
		}

		const eventsByKind = new Map<TaskEventKind, OntoEventRow>();
		const untypedEvents: OntoEventRow[] = [];

		for (const event of existingEvents) {
			const props = (event.props as Record<string, unknown>) ?? {};
			const kind = props.task_event_kind as TaskEventKind | undefined;
			if (kind && !eventsByKind.has(kind)) {
				eventsByKind.set(kind, event);
			} else {
				untypedEvents.push(event);
			}
		}

		const usedEventIds = new Set<string>();

		for (const spec of desiredSpecs) {
			const existing = eventsByKind.get(spec.kind) ?? untypedEvents.shift();

			if (existing) {
				usedEventIds.add(existing.id);
				await this.eventSyncService.updateEvent(userId, {
					eventId: existing.id,
					title: spec.title,
					startAt: spec.startAt,
					endAt: spec.endAt,
					props: {
						...((existing.props as Record<string, unknown>) ?? {}),
						task_event_kind: spec.kind,
						task_id: task.id
					},
					syncTaskFromEvent: false
				});
			} else {
				const result = await this.eventSyncService.createEvent(userId, {
					orgId: task.org_id,
					projectId: task.project_id,
					owner: { type: 'task', id: task.id },
					typeKey: 'event.task_work',
					title: spec.title,
					startAt: spec.startAt,
					endAt: spec.endAt,
					createdBy: actorId,
					props: {
						task_event_kind: spec.kind,
						task_id: task.id
					}
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
			}
		}

		const eventsToRemove = existingEvents.filter((event) => !usedEventIds.has(event.id));
		await this.removeEvents(userId, eventsToRemove);
	}

	private buildSpecs(task: OntoTaskRow): TaskEventSpec[] {
		const hasStart = Boolean(task.start_at);
		const hasDue = Boolean(task.due_at);

		if (!hasStart && !hasDue) {
			return [];
		}

		const startDate = hasStart ? new Date(task.start_at as string) : null;
		const dueDate = hasDue ? new Date(task.due_at as string) : null;

		if (startDate && Number.isNaN(startDate.getTime())) {
			return [];
		}

		if (dueDate && Number.isNaN(dueDate.getTime())) {
			return [];
		}

		const title = task.title || 'Task';

		if (startDate && !dueDate) {
			const endDate = new Date(startDate.getTime() + HALF_HOUR_MS);
			return [
				{
					kind: 'start',
					startAt: startDate.toISOString(),
					endAt: endDate.toISOString(),
					title: `Start: ${title}`
				}
			];
		}

		if (!startDate && dueDate) {
			const startDateForDue = new Date(dueDate.getTime() - HALF_HOUR_MS);
			return [
				{
					kind: 'due',
					startAt: startDateForDue.toISOString(),
					endAt: dueDate.toISOString(),
					title: `Due: ${title}`
				}
			];
		}

		if (!startDate || !dueDate) {
			return [];
		}

		const diffMs = dueDate.getTime() - startDate.getTime();
		if (diffMs <= 0) {
			return [];
		}

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

		const startEventEnd = new Date(startDate.getTime() + HALF_HOUR_MS);
		const dueEventStart = new Date(dueDate.getTime() - HALF_HOUR_MS);

		return [
			{
				kind: 'start',
				startAt: startDate.toISOString(),
				endAt: startEventEnd.toISOString(),
				title: `Start: ${title}`
			},
			{
				kind: 'due',
				startAt: dueEventStart.toISOString(),
				endAt: dueDate.toISOString(),
				title: `Due: ${title}`
			}
		];
	}

	private async removeEvents(userId: string, events: OntoEventRow[]): Promise<void> {
		for (const event of events) {
			await this.eventSyncService.deleteEvent(userId, {
				eventId: event.id
			});
			await this.supabase
				.from('onto_edges')
				.delete()
				.eq('dst_id', event.id)
				.eq('dst_kind', 'event')
				.eq('rel', 'has_event');
		}
	}
}
