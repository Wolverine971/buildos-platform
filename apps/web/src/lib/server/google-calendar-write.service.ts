// apps/web/src/lib/server/google-calendar-write.service.ts
import { google, type calendar_v3 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { GoogleCalendarConnectionService } from './google-calendar-connection.service';
import {
	GoogleCalendarTargetError,
	GoogleCalendarTargetService,
	type CalendarTarget
} from './google-calendar-target.service';

const COMPENSATION_TIMEOUT_MS = 2500;

type CalendarDatabaseClient = TypedSupabaseClient & {
	from(table: string): any;
};

type CalendarApi = Pick<calendar_v3.Calendar, 'events'>;

type WriteServiceOptions = {
	connectionService?: Pick<GoogleCalendarConnectionService, 'getAuthenticatedClient'>;
	targetService?: Pick<
		GoogleCalendarTargetService,
		| 'resolveDefaultWriteTarget'
		| 'resolveExplicitSource'
		| 'resolveProjectTarget'
		| 'resolveEventTarget'
		| 'resolveExternalEventTarget'
		| 'resolveLegacyCalendarId'
	>;
	createCalendarApi?: (auth: unknown) => CalendarApi;
	compensationTimeoutMs?: number;
	now?: () => Date;
};

export type GoogleCalendarCreateSelector = {
	calendarSourceId?: string;
	projectId?: string;
	calendarId?: string;
};

export type GoogleCalendarMutationSelector = {
	calendarSourceId?: string;
	ontoEventId?: string;
	calendarId?: string;
};

export type GoogleCalendarWriteResult = {
	calendarSourceId: string;
	connectionId: string;
	providerCalendarId: string;
	providerEventId: string;
	event: calendar_v3.Schema$Event;
	ontoEventSyncId?: string;
	taskCalendarEventId?: string;
};

export type GoogleCalendarTaskTracking = {
	taskId: string;
	eventStart: string;
	eventEnd: string;
	eventTitle: string;
	isMasterEvent: boolean;
	recurrenceRule?: string | null;
};

export class GoogleCalendarWriteError extends Error {
	constructor(
		public readonly code:
			| 'CALENDAR_PROVIDER_EVENT_ID_MISSING'
			| 'CALENDAR_MAPPING_PERSIST_FAILED'
			| 'CALENDAR_ORPHAN_RECORDED',
		message: string,
		public readonly cause?: unknown
	) {
		super(message);
		this.name = 'GoogleCalendarWriteError';
	}
}

function isNotFoundError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const value = error as {
		code?: number | string;
		status?: number;
		message?: string;
		response?: { status?: number };
	};
	return (
		value.code === 404 ||
		value.code === '404' ||
		value.status === 404 ||
		value.response?.status === 404 ||
		Boolean(value.message?.includes('404'))
	);
}

function hasProjectCalendarId(
	target: CalendarTarget
): target is CalendarTarget & { projectCalendarId: string } {
	return 'projectCalendarId' in target && typeof target.projectCalendarId === 'string';
}

export class GoogleCalendarWriteService {
	private readonly admin: CalendarDatabaseClient;
	private readonly connectionService: Pick<
		GoogleCalendarConnectionService,
		'getAuthenticatedClient'
	>;
	private readonly targetService: Pick<
		GoogleCalendarTargetService,
		| 'resolveDefaultWriteTarget'
		| 'resolveExplicitSource'
		| 'resolveProjectTarget'
		| 'resolveEventTarget'
		| 'resolveExternalEventTarget'
		| 'resolveLegacyCalendarId'
	>;
	private readonly createCalendarApi: (auth: unknown) => CalendarApi;
	private readonly compensationTimeoutMs: number;
	private readonly now: () => Date;

	constructor(
		admin: TypedSupabaseClient | CalendarDatabaseClient,
		options: WriteServiceOptions = {}
	) {
		this.admin = admin as CalendarDatabaseClient;
		this.connectionService =
			options.connectionService ?? new GoogleCalendarConnectionService(admin);
		this.targetService = options.targetService ?? new GoogleCalendarTargetService(admin);
		this.createCalendarApi =
			options.createCalendarApi ??
			((auth) => google.calendar({ version: 'v3', auth: auth as OAuth2Client }));
		this.compensationTimeoutMs = options.compensationTimeoutMs ?? COMPENSATION_TIMEOUT_MS;
		this.now = options.now ?? (() => new Date());
	}

	private async resolveCreateTarget(
		userId: string,
		selector: GoogleCalendarCreateSelector
	): Promise<CalendarTarget> {
		if (selector.calendarSourceId) {
			return this.targetService.resolveExplicitSource(
				userId,
				selector.calendarSourceId,
				'write'
			);
		}
		if (selector.projectId) {
			return this.targetService.resolveProjectTarget(userId, selector.projectId, 'write');
		}
		if (selector.calendarId) {
			return this.targetService.resolveLegacyCalendarId(userId, selector.calendarId, 'write');
		}
		return this.targetService.resolveDefaultWriteTarget(userId);
	}

	private async resolveExistingTarget(params: {
		userId: string;
		providerEventId: string;
		selector: GoogleCalendarMutationSelector;
		capability: 'read' | 'write';
	}): Promise<CalendarTarget & { externalEventId: string }> {
		if (params.selector.ontoEventId) {
			const mapped = await this.targetService.resolveEventTarget(
				params.userId,
				params.selector.ontoEventId,
				params.capability
			);
			if (
				params.providerEventId !== mapped.externalEventId &&
				!params.providerEventId.startsWith(`${mapped.externalEventId}_`)
			) {
				throw new GoogleCalendarTargetError(
					'CALENDAR_EVENT_SOURCE_REQUIRED',
					'The requested Google event does not match its stored source mapping'
				);
			}
			return { ...mapped, externalEventId: params.providerEventId };
		}
		if (params.selector.calendarSourceId) {
			return {
				...(await this.targetService.resolveExplicitSource(
					params.userId,
					params.selector.calendarSourceId,
					params.capability
				)),
				externalEventId: params.providerEventId
			};
		}

		try {
			return await this.targetService.resolveExternalEventTarget(
				params.userId,
				params.providerEventId,
				params.capability
			);
		} catch (error) {
			if (
				!(error instanceof GoogleCalendarTargetError) ||
				error.code !== 'CALENDAR_MAPPING_NOT_FOUND'
			) {
				throw error;
			}
		}

		// A non-primary legacy provider ID is safe only when exactly one owned source exposes it.
		// Never route an existing event through the current default merely because a caller said
		// "primary"; the default may have changed since the event was created.
		if (params.selector.calendarId && params.selector.calendarId !== 'primary') {
			return {
				...(await this.targetService.resolveLegacyCalendarId(
					params.userId,
					params.selector.calendarId,
					params.capability
				)),
				externalEventId: params.providerEventId
			};
		}

		throw new GoogleCalendarTargetError(
			'CALENDAR_EVENT_SOURCE_REQUIRED',
			'Choose the Google Calendar source that owns this existing event'
		);
	}

	private async apiForTarget(userId: string, target: CalendarTarget): Promise<CalendarApi> {
		const auth = await this.connectionService.getAuthenticatedClient(
			userId,
			target.connectionId
		);
		return this.createCalendarApi(auth);
	}

	private async recordOrphan(params: {
		userId: string;
		target: CalendarTarget;
		providerEventId: string;
		entityKind: 'onto_event' | 'task' | 'time_block';
		entityId: string;
		reasonCode: string;
	}): Promise<void> {
		const { error } = await this.admin.from('calendar_event_orphan_receipts').upsert(
			{
				user_id: params.userId,
				calendar_source_id: params.target.calendarSourceId,
				provider_event_id: params.providerEventId,
				entity_kind: params.entityKind,
				entity_id: params.entityId,
				operation: 'create_mapping',
				status: 'pending',
				reason_code: params.reasonCode,
				updated_at: this.now().toISOString()
			},
			{
				onConflict: 'user_id,calendar_source_id,provider_event_id,operation'
			}
		);
		if (error) throw error;
	}

	private async compensateCreatedEvent(params: {
		api: CalendarApi;
		userId: string;
		target: CalendarTarget;
		providerEventId: string;
		entityKind: 'onto_event' | 'task' | 'time_block';
		entityId: string;
	}): Promise<'deleted' | 'orphan_recorded'> {
		let timeout: ReturnType<typeof setTimeout> | undefined;
		try {
			await Promise.race([
				params.api.events.delete({
					calendarId: params.target.providerCalendarId,
					eventId: params.providerEventId,
					sendUpdates: 'none'
				}),
				new Promise((_, reject) => {
					timeout = setTimeout(
						() => reject(new Error('calendar_compensation_timeout')),
						this.compensationTimeoutMs
					);
				})
			]);
			return 'deleted';
		} catch {
			await this.recordOrphan({
				userId: params.userId,
				target: params.target,
				providerEventId: params.providerEventId,
				entityKind: params.entityKind,
				entityId: params.entityId,
				reasonCode: 'mapping_persist_and_compensation_failed'
			});
			return 'orphan_recorded';
		} finally {
			if (timeout) clearTimeout(timeout);
		}
	}

	async compensateUnmappedCreatedEvent(params: {
		userId: string;
		calendarSourceId: string;
		providerEventId: string;
		entityKind: 'onto_event' | 'task' | 'time_block';
		entityId: string;
	}): Promise<'deleted' | 'orphan_recorded'> {
		const target = await this.targetService.resolveExplicitSource(
			params.userId,
			params.calendarSourceId,
			'write'
		);
		return this.compensateCreatedEvent({
			api: await this.apiForTarget(params.userId, target),
			userId: params.userId,
			target,
			providerEventId: params.providerEventId,
			entityKind: params.entityKind,
			entityId: params.entityId
		});
	}

	private async persistOntologyMapping(params: {
		userId: string;
		ontoEventId: string;
		target: CalendarTarget;
		providerEventId: string;
	}): Promise<string> {
		const timestamp = this.now().toISOString();
		const { data, error } = await this.admin
			.from('onto_event_sync')
			.upsert(
				{
					event_id: params.ontoEventId,
					project_calendar_id: hasProjectCalendarId(params.target)
						? params.target.projectCalendarId
						: null,
					calendar_source_id: params.target.calendarSourceId,
					user_id: params.userId,
					provider: 'google',
					external_event_id: params.providerEventId,
					external_calendar_id: params.target.providerCalendarId,
					sync_status: 'synced',
					sync_error: null,
					last_synced_at: timestamp,
					updated_at: timestamp
				},
				{ onConflict: 'event_id,user_id,provider' }
			)
			.select('id')
			.single();
		if (error || !data?.id) throw error ?? new Error('calendar_mapping_missing_id');
		return data.id;
	}

	private async persistTaskMapping(params: {
		userId: string;
		target: CalendarTarget;
		providerEvent: calendar_v3.Schema$Event;
		tracking: GoogleCalendarTaskTracking;
	}): Promise<string> {
		if (!params.providerEvent.id) throw new Error('calendar_mapping_missing_provider_event_id');
		const timestamp = this.now().toISOString();
		const attendees = (params.providerEvent.attendees ?? [])
			.filter((attendee) => Boolean(attendee.email))
			.map((attendee) => ({
				email: attendee.email,
				displayName: attendee.displayName ?? undefined,
				organizer: attendee.organizer ?? undefined,
				self: attendee.self ?? undefined,
				responseStatus: attendee.responseStatus ?? 'needsAction',
				comment: attendee.comment ?? undefined,
				additionalGuests: attendee.additionalGuests ?? undefined
			}));
		const { data, error } = await this.admin
			.from('task_calendar_events')
			.upsert({
				user_id: params.userId,
				task_id: params.tracking.taskId,
				calendar_event_id: params.providerEvent.id,
				calendar_id: params.target.providerCalendarId,
				calendar_source_id: params.target.calendarSourceId,
				project_calendar_id: hasProjectCalendarId(params.target)
					? params.target.projectCalendarId
					: null,
				event_link: params.providerEvent.htmlLink ?? null,
				event_start: params.tracking.eventStart,
				event_end: params.tracking.eventEnd,
				event_title: params.tracking.eventTitle,
				is_master_event: params.tracking.isMasterEvent,
				recurrence_rule: params.tracking.recurrenceRule ?? null,
				last_synced_at: timestamp,
				sync_status: 'synced',
				sync_source: 'app',
				updated_at: timestamp,
				organizer_email: params.providerEvent.organizer?.email ?? null,
				organizer_display_name: params.providerEvent.organizer?.displayName ?? null,
				organizer_self: params.providerEvent.organizer?.self ?? null,
				attendees
			})
			.select('id')
			.single();
		if (error || !data?.id) throw error ?? new Error('calendar_mapping_missing_id');
		return data.id;
	}

	private async markTrackedEventUpdated(params: {
		userId: string;
		target: CalendarTarget;
		providerEventId: string;
		providerEvent: calendar_v3.Schema$Event;
	}): Promise<void> {
		const timestamp = this.now().toISOString();
		const results = await Promise.all([
			this.admin
				.from('task_calendar_events')
				.update({
					event_link: params.providerEvent.htmlLink ?? undefined,
					event_start:
						params.providerEvent.start?.dateTime ??
						params.providerEvent.start?.date ??
						undefined,
					event_end:
						params.providerEvent.end?.dateTime ??
						params.providerEvent.end?.date ??
						undefined,
					event_title: params.providerEvent.summary ?? undefined,
					last_synced_at: timestamp,
					sync_status: 'synced',
					sync_source: 'app',
					updated_at: timestamp
				})
				.eq('user_id', params.userId)
				.eq('calendar_source_id', params.target.calendarSourceId)
				.eq('calendar_event_id', params.providerEventId),
			this.admin
				.from('onto_event_sync')
				.update({
					last_synced_at: timestamp,
					sync_status: 'synced',
					sync_error: null,
					updated_at: timestamp
				})
				.eq('user_id', params.userId)
				.eq('calendar_source_id', params.target.calendarSourceId)
				.eq('external_event_id', params.providerEventId)
		]);
		const failed = results.find((result) => result.error);
		if (failed?.error) throw failed.error;
	}

	private async markTrackedEventDeleted(params: {
		userId: string;
		target: CalendarTarget;
		providerEventId: string;
	}): Promise<void> {
		const timestamp = this.now().toISOString();
		const results = await Promise.all([
			this.admin
				.from('task_calendar_events')
				.update({
					last_synced_at: timestamp,
					sync_status: 'cancelled',
					sync_source: 'app',
					updated_at: timestamp
				})
				.eq('user_id', params.userId)
				.eq('calendar_source_id', params.target.calendarSourceId)
				.eq('calendar_event_id', params.providerEventId),
			this.admin
				.from('onto_event_sync')
				.update({
					last_synced_at: timestamp,
					sync_status: 'cancelled',
					sync_error: null,
					updated_at: timestamp
				})
				.eq('user_id', params.userId)
				.eq('calendar_source_id', params.target.calendarSourceId)
				.eq('external_event_id', params.providerEventId),
			this.admin
				.from('recurring_task_instances')
				.update({ status: 'deleted', updated_at: timestamp })
				.eq('user_id', params.userId)
				.eq('calendar_source_id', params.target.calendarSourceId)
				.eq('calendar_event_id', params.providerEventId)
		]);
		const failed = results.find((result) => result.error);
		if (failed?.error) throw failed.error;
	}

	async createEvent(params: {
		userId: string;
		selector?: GoogleCalendarCreateSelector;
		requestBody: calendar_v3.Schema$Event;
		sendUpdates?: 'all' | 'externalOnly' | 'none';
		ontoEventId?: string;
		taskTracking?: GoogleCalendarTaskTracking;
	}): Promise<GoogleCalendarWriteResult> {
		if (params.ontoEventId && params.taskTracking) {
			throw new Error('A Calendar create can persist only one mapping kind');
		}
		const target = await this.resolveCreateTarget(params.userId, params.selector ?? {});
		const api = await this.apiForTarget(params.userId, target);
		const response = await api.events.insert({
			calendarId: target.providerCalendarId,
			requestBody: params.requestBody,
			sendUpdates: params.sendUpdates
		});
		const providerEventId = response.data.id;
		if (!providerEventId) {
			throw new GoogleCalendarWriteError(
				'CALENDAR_PROVIDER_EVENT_ID_MISSING',
				'Google Calendar did not return an event identity'
			);
		}

		let ontoEventSyncId: string | undefined;
		let taskCalendarEventId: string | undefined;
		if (params.ontoEventId) {
			try {
				ontoEventSyncId = await this.persistOntologyMapping({
					userId: params.userId,
					ontoEventId: params.ontoEventId,
					target,
					providerEventId
				});
			} catch (mappingError) {
				const compensation = await this.compensateCreatedEvent({
					api,
					userId: params.userId,
					target,
					providerEventId,
					entityKind: 'onto_event',
					entityId: params.ontoEventId
				});
				throw new GoogleCalendarWriteError(
					compensation === 'orphan_recorded'
						? 'CALENDAR_ORPHAN_RECORDED'
						: 'CALENDAR_MAPPING_PERSIST_FAILED',
					compensation === 'orphan_recorded'
						? 'Calendar event was created but its mapping needs repair'
						: 'Calendar event mapping failed and the provider event was removed',
					mappingError
				);
			}
		} else if (params.taskTracking) {
			try {
				taskCalendarEventId = await this.persistTaskMapping({
					userId: params.userId,
					target,
					providerEvent: response.data,
					tracking: params.taskTracking
				});
			} catch (mappingError) {
				const compensation = await this.compensateCreatedEvent({
					api,
					userId: params.userId,
					target,
					providerEventId,
					entityKind: 'task',
					entityId: params.taskTracking.taskId
				});
				throw new GoogleCalendarWriteError(
					compensation === 'orphan_recorded'
						? 'CALENDAR_ORPHAN_RECORDED'
						: 'CALENDAR_MAPPING_PERSIST_FAILED',
					compensation === 'orphan_recorded'
						? 'Calendar task event was created but its mapping needs repair'
						: 'Calendar task mapping failed and the provider event was removed',
					mappingError
				);
			}
		}

		return {
			calendarSourceId: target.calendarSourceId,
			connectionId: target.connectionId,
			providerCalendarId: target.providerCalendarId,
			providerEventId,
			event: response.data,
			ontoEventSyncId,
			taskCalendarEventId
		};
	}

	async createStandaloneEvent(params: {
		userId: string;
		selector?: GoogleCalendarCreateSelector;
		summary: string;
		description?: string;
		start: Date;
		end: Date;
		timeZone?: string;
		colorId?: string;
		recurrence?: string[];
		ontoEventId?: string;
	}): Promise<GoogleCalendarWriteResult> {
		return this.createEvent({
			userId: params.userId,
			selector: params.selector,
			ontoEventId: params.ontoEventId,
			requestBody: {
				summary: params.summary,
				description: params.description,
				start: { dateTime: params.start.toISOString(), timeZone: params.timeZone },
				end: { dateTime: params.end.toISOString(), timeZone: params.timeZone },
				colorId: params.colorId,
				recurrence: params.recurrence
			}
		});
	}

	async getEvent(params: {
		userId: string;
		providerEventId: string;
		selector?: GoogleCalendarMutationSelector;
	}): Promise<GoogleCalendarWriteResult> {
		const target = await this.resolveExistingTarget({
			userId: params.userId,
			providerEventId: params.providerEventId,
			selector: params.selector ?? {},
			capability: 'read'
		});
		const response = await (
			await this.apiForTarget(params.userId, target)
		).events.get({
			calendarId: target.providerCalendarId,
			eventId: target.externalEventId
		});
		return {
			calendarSourceId: target.calendarSourceId,
			connectionId: target.connectionId,
			providerCalendarId: target.providerCalendarId,
			providerEventId: target.externalEventId,
			event: response.data
		};
	}

	async updateEvent(params: {
		userId: string;
		providerEventId: string;
		selector?: GoogleCalendarMutationSelector;
		requestBody: calendar_v3.Schema$Event;
		sendUpdates?: 'all' | 'externalOnly' | 'none';
	}): Promise<GoogleCalendarWriteResult> {
		const target = await this.resolveExistingTarget({
			userId: params.userId,
			providerEventId: params.providerEventId,
			selector: params.selector ?? {},
			capability: 'write'
		});
		const response = await (
			await this.apiForTarget(params.userId, target)
		).events.patch({
			calendarId: target.providerCalendarId,
			eventId: target.externalEventId,
			requestBody: params.requestBody,
			sendUpdates: params.sendUpdates
		});
		await this.markTrackedEventUpdated({
			userId: params.userId,
			target,
			providerEventId: target.externalEventId,
			providerEvent: response.data
		});
		return {
			calendarSourceId: target.calendarSourceId,
			connectionId: target.connectionId,
			providerCalendarId: target.providerCalendarId,
			providerEventId: target.externalEventId,
			event: response.data
		};
	}

	async deleteEvent(params: {
		userId: string;
		providerEventId: string;
		selector?: GoogleCalendarMutationSelector;
		sendUpdates?: 'all' | 'externalOnly' | 'none';
	}): Promise<{
		deleted: true;
		alreadyMissing: boolean;
		calendarSourceId: string;
		connectionId: string;
		providerCalendarId: string;
		providerEventId: string;
	}> {
		const target = await this.resolveExistingTarget({
			userId: params.userId,
			providerEventId: params.providerEventId,
			selector: params.selector ?? {},
			capability: 'write'
		});
		let alreadyMissing = false;
		try {
			await (
				await this.apiForTarget(params.userId, target)
			).events.delete({
				calendarId: target.providerCalendarId,
				eventId: target.externalEventId,
				sendUpdates: params.sendUpdates
			});
		} catch (error) {
			if (!isNotFoundError(error)) throw error;
			alreadyMissing = true;
		}
		await this.markTrackedEventDeleted({
			userId: params.userId,
			target,
			providerEventId: target.externalEventId
		});

		return {
			deleted: true,
			alreadyMissing,
			calendarSourceId: target.calendarSourceId,
			connectionId: target.connectionId,
			providerCalendarId: target.providerCalendarId,
			providerEventId: target.externalEventId
		};
	}
}
