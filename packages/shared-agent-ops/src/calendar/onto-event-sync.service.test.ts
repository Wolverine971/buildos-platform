// packages/shared-agent-ops/src/calendar/onto-event-sync.service.test.ts
// Moved from apps/web/src/lib/services/ontology/onto-event-sync.service.test.ts
// alongside the write half of the service. Two web-only seams became injection:
// the legacy singleton-OAuth client (`legacyCalendar`) and the Google connection
// gate (`hasStoredCalendarCredential`, which replaced safeGetCalendarStatus).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OntoEventSyncService } from './onto-event-sync.service';
import { OntoEventService } from './onto-event.service';
import type { LegacyOntoEventCalendarClient } from './legacy-google-calendar.port';

// Activity logging is exercised by its own suite; here it would only need a
// Supabase client the fan-out tests deliberately do not provide.
vi.mock('../ops/async-activity-logger', () => ({
	logActivityAsync: vi.fn(async () => undefined),
	logActivitiesAsync: vi.fn(async () => undefined),
	logCreateAsync: vi.fn(async () => undefined),
	logUpdateAsync: vi.fn(async () => undefined),
	logDeleteAsync: vi.fn(async () => undefined)
}));

afterEach(() => {
	vi.restoreAllMocks();
});

/** Stand-in for apps/web `CalendarService`, which cannot move (SvelteKit `$env`). */
function createLegacyCalendarStub() {
	return {
		createStandaloneEvent: vi.fn().mockResolvedValue({ eventId: 'legacy-event' }),
		updateCalendarEvent: vi.fn().mockResolvedValue({ success: true }),
		deleteCalendarEvent: vi.fn().mockResolvedValue({ success: true })
	} satisfies Record<keyof LegacyOntoEventCalendarClient, ReturnType<typeof vi.fn>>;
}

/** Web's runtime default for users who are not on the multi-calendar allowlist. */
function createLegacyService(supabase: unknown = {}) {
	const legacyCalendar = createLegacyCalendarStub();
	const service = new OntoEventSyncService(supabase as any, {
		legacyCalendar: legacyCalendar as unknown as LegacyOntoEventCalendarClient,
		sourceRoutingEnabled: () => false
	});
	return { service, legacyCalendar };
}

class GoogleOAuthConnectionError extends Error {
	public readonly requiresReconnection: boolean;

	constructor(message: string, requiresReconnection = false) {
		super(message);
		this.name = 'GoogleOAuthConnectionError';
		this.requiresReconnection = requiresReconnection;
	}
}

function createSupabaseMock(fixtures: {
	tasks?: Record<
		string,
		{
			id: string;
			title?: string | null;
			description?: string | null;
			project_id?: string | null;
		}
	>;
	projects?: Record<string, { id: string; name?: string | null }>;
}) {
	return {
		from: (table: string) => {
			const state: { id?: string } = {};

			const builder: any = {
				select: () => builder,
				eq: (column: string, value: string) => {
					if (column === 'id') state.id = value;
					return builder;
				},
				is: () => builder,
				maybeSingle: async () => {
					if (!state.id) return { data: null, error: null };

					if (table === 'onto_tasks') {
						const task = fixtures.tasks?.[state.id] ?? null;
						return { data: task, error: null };
					}

					if (table === 'onto_projects') {
						const project = fixtures.projects?.[state.id] ?? null;
						return { data: project, error: null };
					}

					return { data: null, error: null };
				}
			};

			return builder;
		}
	};
}

const APP_URL = 'https://build-os.com';

describe('OntoEventSyncService calendar descriptions', () => {
	it('includes BuildOS task + project links and task description', async () => {
		const supabase = createSupabaseMock({
			tasks: {
				task1: {
					id: 'task1',
					title: 'Write spec',
					description: 'Do the thing.',
					project_id: 'proj1'
				}
			},
			projects: {
				proj1: { id: 'proj1', name: 'Apollo' }
			}
		});
		const service = new OntoEventSyncService(supabase as any, { appBaseUrl: APP_URL });

		const description = await (service as any).buildCalendarEventDescription({
			id: 'event1',
			project_id: 'proj1',
			owner_entity_type: 'task',
			owner_entity_id: 'task1',
			description: 'Original notes',
			props: {}
		});

		expect(description).toContain(`Project: Apollo\n${APP_URL}/projects/proj1`);
		expect(description).toContain(`📋 View Task: Write spec`);
		expect(description).toContain(`${APP_URL}/projects/proj1/tasks/task1`);
		expect(description).toContain('[BuildOS Task #task1]');
		expect(description).toContain('Do the thing.');
		expect(description).toContain('Original notes');
	});

	it('drops migrated Google Calendar links stored as description', async () => {
		const supabase = createSupabaseMock({
			tasks: { task2: { id: 'task2', title: 'Ship it', project_id: 'proj2' } },
			projects: { proj2: { id: 'proj2', name: 'Zeus' } }
		});
		const service = new OntoEventSyncService(supabase as any, { appBaseUrl: APP_URL });

		const description = await (service as any).buildCalendarEventDescription({
			id: 'event2',
			project_id: 'proj2',
			owner_entity_type: 'task',
			owner_entity_id: 'task2',
			description: 'https://www.google.com/calendar/event?eid=abc',
			props: {}
		});

		expect(description).not.toContain('google.com/calendar/event');
		expect(description).toContain(`${APP_URL}/projects/proj2/tasks/task2`);
	});

	it('passes through non-task descriptions unchanged', async () => {
		const supabase = createSupabaseMock({});
		const service = new OntoEventSyncService(supabase as any, { appBaseUrl: APP_URL });

		const description = await (service as any).buildCalendarEventDescription({
			id: 'event3',
			project_id: null,
			owner_entity_type: 'standalone',
			owner_entity_id: null,
			description: 'Just a meeting',
			props: {}
		});

		expect(description).toBe('Just a meeting');
	});
});

describe('OntoEventSyncService deletion state', () => {
	it('marks a provider-backed delete as pending until external sync completes', async () => {
		let updatePatch: Record<string, unknown> = {};
		const existing = {
			id: 'event-provider-backed',
			project_id: null,
			updated_at: '2026-08-12T12:00:00.000Z',
			created_at: '2026-08-12T11:00:00.000Z',
			deleted_at: null,
			sync_status: 'synced',
			sync_error: null,
			props: {
				external_event_id: 'google-event-1',
				external_calendar_id: 'calendar@example.com'
			},
			external_link: null,
			onto_event_sync: []
		};
		const query: any = {
			update: vi.fn((patch: Record<string, unknown>) => {
				updatePatch = patch;
				return query;
			}),
			eq: vi.fn(() => query),
			select: vi.fn(() => query),
			single: vi.fn(async () => ({
				data: { ...existing, ...updatePatch },
				error: null
			}))
		};
		const service = new OntoEventSyncService({ from: vi.fn(() => query) } as any);
		vi.spyOn(service as any, 'getEvent').mockResolvedValue(existing);
		vi.spyOn(service as any, 'deleteCalendarEvent').mockResolvedValue(undefined);

		const result = await service.deleteEvent('user-1', {
			eventId: existing.id
		});

		expect(query.update).toHaveBeenCalledWith(
			expect.objectContaining({
				deleted_at: expect.any(String),
				sync_status: 'pending',
				sync_error: null
			})
		);
		expect(result.sync_status).toBe('pending');
	});
});

describe('OntoEventSyncService project event fan-out', () => {
	const projectEvent = {
		id: 'event-fanout',
		project_id: 'project-1',
		updated_at: '2026-08-12T12:00:00.000Z',
		created_at: '2026-08-12T11:00:00.000Z',
		deleted_at: null,
		props: {},
		external_link: null,
		onto_event_sync: []
	};

	it('routes project-scoped writes through the queue when an enqueue hook is supplied', async () => {
		const enqueueSync = vi.fn().mockResolvedValue({
			mode: 'actor_projection',
			targetUserIds: ['user-1'],
			enqueued: 1
		});
		const service = new OntoEventSyncService({} as any, { enqueueSync });
		const updated = { ...projectEvent, title: 'Updated' };
		vi.spyOn(service as any, 'getEvent').mockResolvedValue(projectEvent);
		vi.spyOn(service as any, 'syncTaskFromEvent').mockResolvedValue(undefined);
		const updateCalendarFromEvent = vi
			.spyOn(service as any, 'updateCalendarFromEvent')
			.mockResolvedValue(undefined);
		vi.spyOn(OntoEventService, 'updateEvent').mockResolvedValue(updated as any);

		await service.updateEvent('user-1', { eventId: projectEvent.id, title: 'Updated' });

		expect(enqueueSync).toHaveBeenCalledWith('user-1', updated, 'upsert');
		expect(updateCalendarFromEvent).not.toHaveBeenCalled();
	});

	it('writes to Google inline when no enqueue hook is supplied (worker runtime)', async () => {
		const service = new OntoEventSyncService({} as any);
		const updated = { ...projectEvent, title: 'Updated' };
		vi.spyOn(service as any, 'getEvent').mockResolvedValue(projectEvent);
		vi.spyOn(service as any, 'syncTaskFromEvent').mockResolvedValue(undefined);
		const updateCalendarFromEvent = vi
			.spyOn(service as any, 'updateCalendarFromEvent')
			.mockResolvedValue(undefined);
		vi.spyOn(OntoEventService, 'updateEvent').mockResolvedValue(updated as any);

		// deferCalendarSync must not short-circuit the project path on the worker:
		// the job has to finish the Google write before it reports success.
		await service.updateEvent('user-1', {
			eventId: projectEvent.id,
			title: 'Updated',
			deferCalendarSync: true
		});

		expect(updateCalendarFromEvent).toHaveBeenCalledWith('user-1', updated, []);
	});

	it('creates project events inline when no enqueue hook is supplied', async () => {
		const service = new OntoEventSyncService({} as any);
		const created = { ...projectEvent, id: 'event-created' };
		vi.spyOn(OntoEventService, 'createEvent').mockResolvedValue(created as any);
		const syncEventToCalendar = vi
			.spyOn(service as any, 'syncEventToCalendar')
			.mockResolvedValue({ event: created, sync: { success: true } });

		const result = await service.createEvent('user-1', {
			projectId: 'project-1',
			owner: { type: 'project', id: 'project-1' },
			title: 'Planning',
			startAt: '2026-08-12T14:00:00.000Z',
			createdBy: 'user-1'
		});

		expect(syncEventToCalendar).toHaveBeenCalledWith(
			'user-1',
			created,
			expect.objectContaining({ scope: 'project' })
		);
		expect(result.sync).toEqual({ success: true });
	});
});

describe('OntoEventSyncService project sync job version guards', () => {
	it('skips stale project sync jobs when event has newer update timestamp', async () => {
		const { service, legacyCalendar } = createLegacyService();
		vi.spyOn(service as any, 'getEvent').mockResolvedValue({
			id: 'event-1',
			project_id: 'project-1',
			updated_at: '2026-02-28T12:00:00.000Z',
			created_at: '2026-02-28T10:00:00.000Z',
			deleted_at: null,
			onto_event_sync: []
		});

		const syncEventToCalendarSpy = vi.spyOn(service as any, 'syncEventToCalendar');

		const result = await service.processProjectEventSyncJob({
			action: 'upsert',
			eventId: 'event-1',
			projectId: 'project-1',
			targetUserId: 'user-1',
			expectedEventUpdatedAt: '2026-02-28T11:00:00.000Z'
		});

		expect(result).toEqual({
			outcome: 'skipped',
			reason: 'stale_event_version'
		});
		expect(legacyCalendar.updateCalendarEvent).not.toHaveBeenCalled();
		expect(syncEventToCalendarSpy).not.toHaveBeenCalled();
	});

	it('retries a stale delete job when the event is still deleted', async () => {
		const { service, legacyCalendar } = createLegacyService();
		vi.spyOn(service as any, 'getEvent').mockResolvedValue({
			id: 'event-delete-retry',
			project_id: 'project-1',
			updated_at: '2026-02-28T12:05:00.000Z',
			created_at: '2026-02-28T10:00:00.000Z',
			deleted_at: '2026-02-28T12:00:00.000Z',
			props: {},
			onto_event_sync: []
		});
		vi.spyOn(service as any, 'resolveExternalMapping').mockResolvedValue({
			externalEventId: 'google-event-retry',
			calendarId: 'project@example.com'
		});
		vi.spyOn(service as any, 'markEventSynced').mockResolvedValue(undefined);

		await expect(
			service.processProjectEventSyncJob({
				action: 'delete',
				eventId: 'event-delete-retry',
				projectId: 'project-1',
				targetUserId: 'user-1',
				expectedEventUpdatedAt: '2026-02-28T12:00:00.000Z'
			})
		).resolves.toEqual({ outcome: 'deleted', reason: 'deleted_external_event' });
		expect(legacyCalendar.deleteCalendarEvent).toHaveBeenCalledWith(
			'user-1',
			expect.objectContaining({
				event_id: 'google-event-retry',
				calendar_id: 'project@example.com'
			})
		);
	});

	it('skips upsert when project mapping is missing but prior external reference exists', async () => {
		const { service } = createLegacyService();
		vi.spyOn(service as any, 'getEvent').mockResolvedValue({
			id: 'event-2',
			project_id: 'project-1',
			updated_at: '2026-03-01T12:00:00.000Z',
			created_at: '2026-03-01T10:00:00.000Z',
			deleted_at: null,
			external_link: null,
			sync_status: 'synced',
			props: {
				external_event_id: 'evt_existing',
				external_calendar_id: 'cal_existing'
			},
			onto_event_sync: []
		});
		vi.spyOn(service as any, 'resolveExternalMapping').mockResolvedValue(null);
		const markSyncErrorSpy = vi
			.spyOn(service as any, 'markEventSyncError')
			.mockResolvedValue(undefined);
		const syncEventToCalendarSpy = vi.spyOn(service as any, 'syncEventToCalendar');

		const result = await service.processProjectEventSyncJob({
			action: 'upsert',
			eventId: 'event-2',
			projectId: 'project-1',
			targetUserId: 'user-1'
		});

		expect(result).toEqual({
			outcome: 'skipped',
			reason: 'missing_project_sync_mapping'
		});
		expect(syncEventToCalendarSpy).not.toHaveBeenCalled();
		expect(markSyncErrorSpy).toHaveBeenCalledWith(
			'event-2',
			'missing_project_sync_mapping',
			undefined,
			'2026-03-01T12:00:00.000Z'
		);
	});

	it('skips project calendar creation when google calendar is not connected', async () => {
		const { service } = createLegacyService();
		vi.spyOn(service as any, 'getEvent').mockResolvedValue({
			id: 'event-no-google',
			project_id: 'project-1',
			updated_at: '2026-03-01T12:00:00.000Z',
			created_at: '2026-03-01T10:00:00.000Z',
			deleted_at: null,
			external_link: null,
			sync_status: null,
			props: {},
			onto_event_sync: []
		});
		vi.spyOn(service as any, 'resolveExternalMapping').mockResolvedValue(null);
		vi.spyOn(service as any, 'hasStoredCalendarCredential').mockResolvedValue(false);
		const resolveProjectCalendarSpy = vi.spyOn(service as any, 'resolveProjectCalendar');
		const syncEventToCalendarSpy = vi.spyOn(service as any, 'syncEventToCalendar');

		const result = await service.processProjectEventSyncJob({
			action: 'upsert',
			eventId: 'event-no-google',
			projectId: 'project-1',
			targetUserId: 'user-1',
			createCalendarIfMissing: true
		});

		expect(result).toEqual({
			outcome: 'skipped',
			reason: 'calendar_not_connected'
		});
		expect(resolveProjectCalendarSpy).not.toHaveBeenCalled();
		expect(syncEventToCalendarSpy).not.toHaveBeenCalled();
	});

	it('treats a missing credential row as "not connected"', async () => {
		const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
		const query: any = {
			select: vi.fn(() => query),
			eq: vi.fn(() => query),
			maybeSingle
		};
		const { service } = createLegacyService({ from: vi.fn(() => query) });

		await expect((service as any).hasStoredCalendarCredential('user-1')).resolves.toBe(false);
		expect(query.select).toHaveBeenCalledWith('access_token, refresh_token');
	});

	it('treats a stored access + refresh token pair as connected', async () => {
		const maybeSingle = vi.fn().mockResolvedValue({
			data: { access_token: 'enc:v1.aaa', refresh_token: 'enc:v1.bbb' },
			error: null
		});
		const query: any = {
			select: vi.fn(() => query),
			eq: vi.fn(() => query),
			maybeSingle
		};
		const { service } = createLegacyService({ from: vi.fn(() => query) });

		await expect((service as any).hasStoredCalendarCredential('user-1')).resolves.toBe(true);
	});

	it('does not recreate external events on google 404 during project updates', async () => {
		const { service, legacyCalendar } = createLegacyService();
		vi.spyOn(service as any, 'getEvent').mockResolvedValue({
			id: 'event-3',
			project_id: 'project-1',
			updated_at: '2026-03-02T12:00:00.000Z',
			created_at: '2026-03-02T10:00:00.000Z',
			deleted_at: null,
			external_link: null,
			props: {},
			onto_event_sync: [
				{
					id: 'sync-1',
					user_id: 'user-1'
				}
			]
		});
		vi.spyOn(service as any, 'resolveExternalMapping').mockResolvedValue({
			externalEventId: 'evt_404',
			calendarId: 'cal_1',
			syncRowId: 'sync-1'
		});
		vi.spyOn(service as any, 'buildCalendarEventDescription').mockResolvedValue('notes');
		legacyCalendar.updateCalendarEvent.mockRejectedValue(new Error('404 not found'));
		const syncEventToCalendarSpy = vi.spyOn(service as any, 'syncEventToCalendar');
		const markSyncErrorSpy = vi
			.spyOn(service as any, 'markEventSyncError')
			.mockResolvedValue(undefined);

		const result = await service.processProjectEventSyncJob({
			action: 'upsert',
			eventId: 'event-3',
			projectId: 'project-1',
			targetUserId: 'user-1'
		});

		expect(result).toEqual({
			outcome: 'skipped',
			reason: 'external_event_not_found'
		});
		expect(syncEventToCalendarSpy).not.toHaveBeenCalled();
		expect(markSyncErrorSpy).toHaveBeenCalledWith(
			'event-3',
			'external_event_not_found',
			'sync-1',
			'2026-03-02T12:00:00.000Z'
		);
	});

	it('skips project update jobs that need calendar reconnection', async () => {
		const { service, legacyCalendar } = createLegacyService();
		vi.spyOn(service as any, 'getEvent').mockResolvedValue({
			id: 'event-4',
			project_id: 'project-1',
			updated_at: '2026-03-03T12:00:00.000Z',
			created_at: '2026-03-03T10:00:00.000Z',
			deleted_at: null,
			external_link: null,
			props: {},
			onto_event_sync: [
				{
					id: 'sync-1',
					user_id: 'user-1'
				}
			]
		});
		vi.spyOn(service as any, 'resolveExternalMapping').mockResolvedValue({
			externalEventId: 'evt_1',
			calendarId: 'cal_1',
			syncRowId: 'sync-1'
		});
		vi.spyOn(service as any, 'buildCalendarEventDescription').mockResolvedValue('notes');
		legacyCalendar.updateCalendarEvent.mockRejectedValue(
			new GoogleOAuthConnectionError(
				'No calendar connection found. Please connect your Google Calendar.',
				true
			)
		);
		const markSyncErrorSpy = vi
			.spyOn(service as any, 'markEventSyncError')
			.mockResolvedValue(undefined);

		const result = await service.processProjectEventSyncJob({
			action: 'upsert',
			eventId: 'event-4',
			projectId: 'project-1',
			targetUserId: 'user-1'
		});

		expect(result).toEqual({
			outcome: 'skipped',
			reason: 'calendar_not_connected'
		});
		expect(markSyncErrorSpy).toHaveBeenCalledWith(
			'event-4',
			'No calendar connection found. Please connect your Google Calendar.',
			'sync-1',
			'2026-03-03T12:00:00.000Z'
		);
	});

	it('skips project delete jobs that need calendar reconnection', async () => {
		const { service, legacyCalendar } = createLegacyService();
		vi.spyOn(service as any, 'getEvent').mockResolvedValue({
			id: 'event-5',
			project_id: 'project-1',
			updated_at: '2026-03-04T12:00:00.000Z',
			created_at: '2026-03-04T10:00:00.000Z',
			deleted_at: '2026-03-04T12:00:00.000Z',
			external_link: null,
			props: {},
			onto_event_sync: [
				{
					id: 'sync-2',
					user_id: 'user-1'
				}
			]
		});
		vi.spyOn(service as any, 'resolveExternalMapping').mockResolvedValue({
			externalEventId: 'evt_2',
			calendarId: 'cal_1',
			syncRowId: 'sync-2'
		});
		legacyCalendar.deleteCalendarEvent.mockRejectedValue(
			new GoogleOAuthConnectionError(
				'No calendar connection found. Please connect your Google Calendar.',
				true
			)
		);
		const logDeleteFailureSpy = vi.spyOn(service as any, 'logGoogleDeleteFailure');
		const markSyncErrorSpy = vi
			.spyOn(service as any, 'markEventSyncError')
			.mockResolvedValue(undefined);

		const result = await service.processProjectEventSyncJob({
			action: 'delete',
			eventId: 'event-5',
			projectId: 'project-1',
			targetUserId: 'user-1'
		});

		expect(result).toEqual({
			outcome: 'skipped',
			reason: 'calendar_not_connected'
		});
		expect(markSyncErrorSpy).toHaveBeenCalledWith(
			'event-5',
			'No calendar connection found. Please connect your Google Calendar.',
			'sync-2',
			'2026-03-04T12:00:00.000Z'
		);
		expect(logDeleteFailureSpy).not.toHaveBeenCalled();
	});

	it('recovers project mapping from event props when sync row is missing', async () => {
		const { service } = createLegacyService();

		const mapping = await (service as any).resolveExternalMapping(
			'user-1',
			{
				id: 'event-4',
				project_id: 'project-1',
				props: {
					external_event_id: 'evt_recover',
					external_calendar_id: 'cal_recover'
				},
				external_link: null
			},
			[]
		);

		expect(mapping).toEqual({
			externalEventId: 'evt_recover',
			calendarId: 'cal_recover'
		});
	});
});

describe('OntoEventSyncService source-qualified routing', () => {
	function sourceWriter() {
		return {
			createStandaloneEvent: vi.fn().mockResolvedValue({
				calendarSourceId: 'source-1',
				connectionId: 'connection-1',
				providerCalendarId: 'project@example.com',
				providerEventId: 'google-event-1',
				ontoEventSyncId: 'sync-1',
				event: { id: 'google-event-1', htmlLink: 'https://calendar.google.com/event/1' }
			}),
			updateEvent: vi.fn().mockResolvedValue(undefined),
			deleteEvent: vi.fn().mockResolvedValue({ deleted: true })
		};
	}

	it('creates project events through the stored project source without checking legacy OAuth', async () => {
		const event = {
			id: 'event-1',
			project_id: 'project-1',
			title: 'Planning',
			start_at: '2026-08-12T14:00:00.000Z',
			end_at: '2026-08-12T14:30:00.000Z',
			timezone: 'America/New_York',
			recurrence: { rrule: 'RRULE:FREQ=WEEKLY;COUNT=3' },
			props: {},
			updated_at: '2026-08-12T12:00:00.000Z'
		};
		const query: any = {
			update: vi.fn(() => query),
			eq: vi.fn(() => query),
			select: vi.fn(() => query),
			single: vi.fn().mockResolvedValue({ data: event, error: null })
		};
		const writer = sourceWriter();
		const service = new OntoEventSyncService({ from: vi.fn(() => query) } as any, {
			calendarWriter: writer as any,
			sourceRoutingEnabled: () => true
		});
		vi.spyOn(service as any, 'resolveProjectCalendar').mockResolvedValue({
			id: 'project-calendar-1',
			calendar_id: 'project@example.com',
			calendar_source_id: 'source-1',
			color_id: '7',
			sync_enabled: true
		});
		vi.spyOn(service as any, 'buildCalendarEventDescription').mockResolvedValue('notes');
		const legacyStatus = vi.spyOn(service as any, 'hasStoredCalendarCredential');

		const result = await (service as any).syncEventToCalendar('user-1', event, {
			scope: 'project',
			calendarId: null,
			calendarSourceId: null,
			createProjectCalendarIfMissing: false
		});

		expect(result.sync).toMatchObject({
			success: true,
			externalEventId: 'google-event-1',
			calendarId: 'project-calendar-1'
		});
		expect(writer.createStandaloneEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'user-1',
				selector: { projectId: 'project-1' },
				recurrence: ['RRULE:FREQ=WEEKLY;COUNT=3'],
				ontoEventId: 'event-1'
			})
		);
		expect(legacyStatus).not.toHaveBeenCalled();
	});

	it('updates an existing event through its ontology source mapping', async () => {
		const writer = sourceWriter();
		const legacyCalendar = createLegacyCalendarStub();
		const service = new OntoEventSyncService({} as any, {
			calendarWriter: writer as any,
			legacyCalendar: legacyCalendar as unknown as LegacyOntoEventCalendarClient,
			sourceRoutingEnabled: () => true
		});
		vi.spyOn(service as any, 'getEvent').mockResolvedValue({
			id: 'event-2',
			project_id: 'project-1',
			title: 'Updated planning',
			start_at: '2026-08-12T15:00:00.000Z',
			end_at: '2026-08-12T15:30:00.000Z',
			updated_at: '2026-08-12T13:00:00.000Z',
			created_at: '2026-08-12T12:00:00.000Z',
			deleted_at: null,
			props: {},
			onto_event_sync: []
		});
		vi.spyOn(service as any, 'resolveExternalMapping').mockResolvedValue({
			externalEventId: 'google-event-2',
			calendarId: 'project@example.com',
			calendarSourceId: 'source-1',
			syncRowId: 'sync-2'
		});
		vi.spyOn(service as any, 'buildCalendarEventDescription').mockResolvedValue('notes');
		vi.spyOn(service as any, 'markEventSynced').mockResolvedValue(undefined);

		await expect(
			service.processProjectEventSyncJob({
				action: 'upsert',
				eventId: 'event-2',
				projectId: 'project-1',
				targetUserId: 'user-1'
			})
		).resolves.toEqual({ outcome: 'synced', reason: 'updated_external_event' });
		expect(writer.updateEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'user-1',
				providerEventId: 'google-event-2',
				selector: { ontoEventId: 'event-2' }
			})
		);
		expect(legacyCalendar.updateCalendarEvent).not.toHaveBeenCalled();
	});

	it('deletes an existing event through its ontology source mapping', async () => {
		const writer = sourceWriter();
		const legacyCalendar = createLegacyCalendarStub();
		const service = new OntoEventSyncService({} as any, {
			calendarWriter: writer as any,
			legacyCalendar: legacyCalendar as unknown as LegacyOntoEventCalendarClient,
			sourceRoutingEnabled: () => true
		});
		vi.spyOn(service as any, 'getEvent').mockResolvedValue({
			id: 'event-3',
			project_id: 'project-1',
			updated_at: '2026-08-12T13:00:00.000Z',
			created_at: '2026-08-12T12:00:00.000Z',
			deleted_at: '2026-08-12T13:00:00.000Z',
			props: {},
			onto_event_sync: []
		});
		vi.spyOn(service as any, 'resolveExternalMapping').mockResolvedValue({
			externalEventId: 'google-event-3',
			calendarId: 'project@example.com',
			calendarSourceId: 'source-1',
			syncRowId: 'sync-3'
		});
		vi.spyOn(service as any, 'markEventSynced').mockResolvedValue(undefined);

		await expect(
			service.processProjectEventSyncJob({
				action: 'delete',
				eventId: 'event-3',
				projectId: 'project-1',
				targetUserId: 'user-1'
			})
		).resolves.toEqual({ outcome: 'deleted', reason: 'deleted_external_event' });
		expect(writer.deleteEvent).toHaveBeenCalledWith({
			userId: 'user-1',
			providerEventId: 'google-event-3',
			selector: { ontoEventId: 'event-3' },
			sendUpdates: 'none'
		});
		expect(legacyCalendar.deleteCalendarEvent).not.toHaveBeenCalled();
	});

	it('deletes a legacy imported event through its exact provider calendar id', async () => {
		const writer = sourceWriter();
		const service = new OntoEventSyncService({} as any, {
			calendarWriter: writer as any,
			sourceRoutingEnabled: () => true
		});
		vi.spyOn(service as any, 'getEvent').mockResolvedValue({
			id: 'event-legacy',
			project_id: 'project-1',
			updated_at: '2026-08-12T13:00:00.000Z',
			created_at: '2026-08-12T12:00:00.000Z',
			deleted_at: '2026-08-12T13:00:00.000Z',
			props: {
				external_event_id: 'google-event-legacy',
				external_calendar_id: 'legacy-project@example.com'
			},
			external_link: null,
			onto_event_sync: []
		});
		vi.spyOn(service as any, 'resolveProjectCalendar').mockResolvedValue({
			id: 'project-calendar-legacy',
			calendar_id: 'legacy-project@example.com',
			calendar_source_id: null
		});
		vi.spyOn(service as any, 'markEventSynced').mockResolvedValue(undefined);

		await expect(
			service.processProjectEventSyncJob({
				action: 'delete',
				eventId: 'event-legacy',
				projectId: 'project-1',
				targetUserId: 'user-1'
			})
		).resolves.toEqual({ outcome: 'deleted', reason: 'deleted_external_event' });
		expect(writer.deleteEvent).toHaveBeenCalledWith({
			userId: 'user-1',
			providerEventId: 'google-event-legacy',
			selector: { calendarId: 'legacy-project@example.com' },
			sendUpdates: 'none'
		});
	});
});
