// apps/web/src/lib/services/ontology/calendar-migration.service.ts
/**
 * Calendar Migration Service
 *
 * Handles migration of legacy calendar events by linking them to onto_tasks via edges.
 * Events stay in calendar_events table but are linked to ontology entities.
 *
 * @see /thoughts/shared/research/2025-12-10_migration-system-design.md
 *      For comprehensive system design documentation including architecture diagrams,
 *      data flow, component details, and error handling strategies.
 */
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Database } from '@buildos/shared-types';
import type {
	MigrationServiceContext,
	MigrationStatus,
	CalendarMigrationPreviewPayload
} from './migration.types';
import { upsertLegacyMapping } from './legacy-mapping.service';

export type ProjectCalendarRow = Database['public']['Tables']['project_calendars']['Row'];
export type LegacyTaskCalendarEventRow =
	Database['public']['Tables']['task_calendar_events']['Row'];

export interface CalendarMigrationResult {
	projectId: string;
	ontoProjectId: string | null;
	calendarCount: number;
	updatedCalendars: number;
	taskEventCount: number;
	createdEvents: number;
	skippedEvents: number;
	status: MigrationStatus;
	notes: string;
	preview: CalendarMigrationPreviewPayload;
}

const DEFAULT_EVENT_TYPE = 'event.task_work';
const TASK_EVENT_EDGE_REL = 'has_event';
const DEFAULT_EVENT_CONCURRENCY = 10;

export class CalendarMigrationService {
	constructor(private readonly client: TypedSupabaseClient) {}

	/**
	 * Chunk an array into smaller arrays of specified size
	 */
	private chunkArray<T>(array: T[], size: number): T[][] {
		const chunks: T[][] = [];
		for (let i = 0; i < array.length; i += size) {
			chunks.push(array.slice(i, i + size));
		}
		return chunks;
	}

	async migrateCalendarData(
		projectId: string,
		ontoProjectId: string | null,
		actorId: string,
		context: MigrationServiceContext,
		taskMappings: Record<string, string | null> = {}
	): Promise<CalendarMigrationResult> {
		const calendars = await this.fetchCalendars(projectId);
		const taskIds = Object.keys(taskMappings);
		const events = taskIds.length ? await this.fetchTaskEvents(taskIds) : [];
		const preview = this.buildPreview(events, taskMappings);

		let updatedCalendars = 0;
		let createdEvents = 0;
		let skippedEvents = 0;
		let status: MigrationStatus = 'pending';
		let notes =
			'Calendar linkage staged; awaiting ontology project id before emitting onto_events.';

		if (ontoProjectId && !context.dryRun) {
			const { data, error } = await this.client
				.from('project_calendars')
				.update({ onto_project_id: ontoProjectId })
				.eq('project_id', projectId)
				.is('onto_project_id', null)
				.select('id');

			if (error) {
				throw new Error(
					`[CalendarMigration] Failed to update calendars for ${projectId}: ${error.message}`
				);
			}

			updatedCalendars = data?.length ?? 0;

			const eventMappings = await this.fetchExistingEventMappings(
				events.map((event) => event.id)
			);

			// Process events in parallel batches for better performance
			const eventConcurrency = context.eventConcurrency ?? DEFAULT_EVENT_CONCURRENCY;
			const eventBatches = this.chunkArray(events, eventConcurrency);

			for (const batch of eventBatches) {
				const batchResults = await Promise.all(
					batch.map(async (event) => {
						const existingMapping = eventMappings.get(event.id);
						if (existingMapping) {
							return { created: false };
						}

						const ontoTaskId = taskMappings[event.task_id] ?? null;
						if (!ontoTaskId) {
							return { created: false };
						}

						if (!event.event_start) {
							return { created: false };
						}

						const { data: ontoEvent, error: eventError } = await this.client
							.from('onto_events')
							.insert({
								project_id: ontoProjectId,
								owner_entity_type: 'task',
								owner_entity_id: ontoTaskId,
								type_key: DEFAULT_EVENT_TYPE,
								state_key:
									event.sync_status === 'cancelled' ? 'cancelled' : 'scheduled',
								title: event.event_title ?? 'Task Work Session',
								description: event.event_link,
								location: null,
								start_at: event.event_start,
								end_at: event.event_end,
								all_day: false,
								timezone: null,
								template_snapshot: {},
								props: {
									legacy_task_calendar_event_id: event.id,
									calendar_id: event.project_calendar_id,
									sync_source: event.sync_source,
									recurrence: event.recurrence_rule,
									last_synced_at: event.last_synced_at
								},
								created_by: actorId
							})
							.select('id')
							.single();

						if (eventError || !ontoEvent) {
							return { created: false };
						}

						await upsertLegacyMapping(this.client, {
							legacyTable: 'task_calendar_events',
							legacyId: event.id,
							ontoTable: 'onto_events',
							ontoId: ontoEvent.id,
							record: event,
							metadata: {
								run_id: context.runId,
								batch_id: context.batchId,
								dry_run: context.dryRun
							}
						});

						if (event.project_calendar_id && event.calendar_event_id) {
							await this.client.from('onto_event_sync').insert({
								event_id: ontoEvent.id,
								calendar_id: event.project_calendar_id,
								provider: event.sync_source ?? 'google',
								external_event_id: event.calendar_event_id,
								sync_status: event.sync_status ?? 'pending',
								sync_error: event.sync_error,
								last_synced_at: event.last_synced_at
							});
						}

						await this.linkEventToTask({
							taskId: ontoTaskId,
							eventId: ontoEvent.id,
							legacyEventId: event.id
						});

						return { created: true };
					})
				);

				// Aggregate batch results
				for (const result of batchResults) {
					if (result.created) {
						createdEvents += 1;
					} else {
						skippedEvents += 1;
					}
				}
			}

			status = 'completed';
			notes = `Linked ${updatedCalendars} calendars; created ${createdEvents} ontology events.`;
		} else if (!ontoProjectId) {
			notes = 'Ontology project id missing – calendar updates deferred.';
		}

		if (context.dryRun && ontoProjectId) {
			status = 'pending';
			notes = 'Dry-run mode: would link project_calendars + emit onto_events.';
		}

		return {
			projectId,
			ontoProjectId,
			calendarCount: calendars.length,
			updatedCalendars,
			taskEventCount: events.length,
			createdEvents,
			skippedEvents,
			status,
			notes,
			preview
		};
	}

	private async fetchCalendars(projectId: string): Promise<ProjectCalendarRow[]> {
		const { data, error } = await this.client
			.from('project_calendars')
			.select('*')
			.eq('project_id', projectId);

		if (error) {
			throw new Error(
				`[CalendarMigration] Failed to load calendars for ${projectId}: ${error.message}`
			);
		}

		return data ?? [];
	}

	private async fetchTaskEvents(taskIds: string[]): Promise<LegacyTaskCalendarEventRow[]> {
		const { data, error } = await this.client
			.from('task_calendar_events')
			.select('*')
			.in('task_id', taskIds)
			.order('event_start', { ascending: true });

		if (error) {
			throw new Error(`[CalendarMigration] Failed to load task events: ${error.message}`);
		}

		return data ?? [];
	}

	private async fetchExistingEventMappings(eventIds: string[]): Promise<Map<string, string>> {
		if (!eventIds.length) {
			return new Map();
		}

		const { data, error } = await this.client
			.from('legacy_entity_mappings')
			.select('legacy_id, onto_id')
			.eq('legacy_table', 'task_calendar_events')
			.in('legacy_id', eventIds);

		if (error) {
			throw new Error(
				`[CalendarMigration] Failed to resolve event mappings: ${error.message}`
			);
		}

		const lookup = new Map<string, string>();
		for (const row of data ?? []) {
			lookup.set(row.legacy_id, row.onto_id);
		}

		return lookup;
	}

	private buildPreview(
		events: LegacyTaskCalendarEventRow[],
		taskMappings: Record<string, string | null>
	): CalendarMigrationPreviewPayload {
		const entries = events.map((event) => {
			const taskOntoId = taskMappings[event.task_id] ?? null;
			return {
				legacyEventId: event.id,
				taskId: event.task_id,
				taskOntoId,
				eventTitle: event.event_title,
				startAt: event.event_start,
				endAt: event.event_end,
				calendarId: event.project_calendar_id,
				syncSource: event.sync_source,
				syncStatus: event.sync_status,
				willLinkToTask: !!taskOntoId
			};
		});

		const stats = {
			totalEvents: entries.length,
			linkableEvents: entries.filter((entry) => entry.willLinkToTask).length,
			blockedEvents: entries.filter((entry) => !entry.willLinkToTask).length
		};

		return {
			stats,
			events: entries
		};
	}

	private async linkEventToTask(params: {
		taskId: string;
		eventId: string;
		legacyEventId: string;
	}): Promise<void> {
		const { error } = await this.client.from('onto_edges').insert({
			src_id: params.taskId,
			src_kind: 'task',
			dst_id: params.eventId,
			dst_kind: 'event',
			rel: TASK_EVENT_EDGE_REL,
			props: {
				legacy_task_calendar_event_id: params.legacyEventId
			}
		});

		if (error) {
			console.error(
				`[CalendarMigration] Failed to create task→event edge for task ${params.taskId} → event ${params.eventId}: ${error.message}`
			);
			// Throw to ensure edge creation failures are not silently ignored
			throw new Error(`Failed to create task-event edge: ${error.message}`);
		}
	}
}
