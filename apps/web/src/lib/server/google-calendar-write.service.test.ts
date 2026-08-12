// apps/web/src/lib/server/google-calendar-write.service.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	GoogleCalendarWriteError,
	GoogleCalendarWriteService
} from './google-calendar-write.service';
import { GoogleCalendarTargetError, type CalendarTarget } from './google-calendar-target.service';

function target(overrides: Partial<CalendarTarget> = {}): CalendarTarget {
	return {
		userId: 'user-1',
		connectionId: 'connection-a',
		calendarSourceId: 'source-a',
		providerCalendarId: 'personal@example.com',
		accessRole: 'owner',
		accountLabel: 'Personal',
		sourceSummary: 'Personal calendar',
		isPrimary: true,
		connectionConnectedAt: '2026-08-10T10:00:00.000Z',
		sourceCreatedAt: '2026-08-10T10:01:00.000Z',
		...overrides
	};
}

function targetService(overrides: Record<string, unknown> = {}) {
	const defaultTarget = target();
	return {
		resolveDefaultWriteTarget: vi.fn().mockResolvedValue(defaultTarget),
		resolveExplicitSource: vi.fn().mockResolvedValue(defaultTarget),
		resolveProjectTarget: vi.fn().mockResolvedValue({
			...defaultTarget,
			projectCalendarId: 'project-calendar-1'
		}),
		resolveEventTarget: vi.fn(),
		resolveExternalEventTarget: vi.fn(),
		resolveLegacyCalendarId: vi.fn(),
		...overrides
	};
}

function createAdmin(results: Record<string, { data?: any; error?: any }> = {}) {
	const upserts: Array<{ table: string; value: any; options: any }> = [];
	const updates: Array<{ table: string; value: any }> = [];
	const eqs: Array<{ table: string; column: string; value: any }> = [];
	const from = vi.fn((table: string) => {
		const result = results[table] ?? { data: null, error: null };
		const query: any = {
			upsert: vi.fn((value: any, options: any) => {
				upserts.push({ table, value, options });
				return query;
			}),
			select: vi.fn(() => query),
			update: vi.fn((value: any) => {
				updates.push({ table, value });
				return query;
			}),
			delete: vi.fn(() => query),
			eq: vi.fn((column: string, value: any) => {
				eqs.push({ table, column, value });
				return query;
			}),
			single: vi.fn().mockResolvedValue(result),
			then: (resolve: (value: any) => unknown, reject: (reason: unknown) => unknown) =>
				Promise.resolve(result).then(resolve, reject)
		};
		return query;
	});
	return { admin: { from } as any, from, upserts, updates, eqs };
}

function createProvider() {
	return {
		insert: vi.fn().mockResolvedValue({
			data: {
				id: 'provider-event-1',
				summary: 'Planning',
				htmlLink: 'https://calendar.google.com/event?eid=one'
			}
		}),
		get: vi.fn().mockResolvedValue({ data: { id: 'provider-event-1' } }),
		patch: vi.fn().mockResolvedValue({
			data: { id: 'provider-event-1', summary: 'Updated' }
		}),
		delete: vi.fn().mockResolvedValue({ data: {} })
	};
}

describe('GoogleCalendarWriteService', () => {
	it('uses the default source for a create and persists a source-qualified ontology mapping', async () => {
		const targets = targetService();
		const provider = createProvider();
		const { admin, upserts } = createAdmin({
			onto_event_sync: { data: { id: 'sync-1' }, error: null }
		});
		const getAuthenticatedClient = vi.fn().mockResolvedValue({ auth: true });
		const service = new GoogleCalendarWriteService(admin, {
			targetService: targets as any,
			connectionService: { getAuthenticatedClient },
			createCalendarApi: () => ({ events: provider }) as any,
			now: () => new Date('2026-08-12T12:00:00.000Z')
		});

		const result = await service.createEvent({
			userId: 'user-1',
			ontoEventId: 'onto-event-1',
			requestBody: { summary: 'Planning' }
		});

		expect(targets.resolveDefaultWriteTarget).toHaveBeenCalledWith('user-1');
		expect(getAuthenticatedClient).toHaveBeenCalledWith('user-1', 'connection-a');
		expect(provider.insert).toHaveBeenCalledWith(
			expect.objectContaining({ calendarId: 'personal@example.com' })
		);
		expect(upserts).toContainEqual(
			expect.objectContaining({
				table: 'onto_event_sync',
				value: expect.objectContaining({
					event_id: 'onto-event-1',
					calendar_source_id: 'source-a',
					external_calendar_id: 'personal@example.com',
					external_event_id: 'provider-event-1',
					project_calendar_id: null
				})
			})
		);
		expect(result).toMatchObject({
			calendarSourceId: 'source-a',
			providerEventId: 'provider-event-1',
			ontoEventSyncId: 'sync-1'
		});
	});

	it('updates through the event mapping source and never consults the current default', async () => {
		const mappedTarget = target({
			connectionId: 'connection-b',
			calendarSourceId: 'source-b',
			providerCalendarId: 'work@example.com'
		});
		const targets = targetService({
			resolveExternalEventTarget: vi.fn().mockResolvedValue({
				...mappedTarget,
				externalEventId: 'provider-event-1'
			})
		});
		const provider = createProvider();
		const { admin, updates, eqs } = createAdmin();
		const getAuthenticatedClient = vi.fn().mockResolvedValue({ auth: true });
		const service = new GoogleCalendarWriteService(admin, {
			targetService: targets as any,
			connectionService: { getAuthenticatedClient },
			createCalendarApi: () => ({ events: provider }) as any
		});

		await service.updateEvent({
			userId: 'user-1',
			providerEventId: 'provider-event-1',
			requestBody: { summary: 'Updated' }
		});

		expect(targets.resolveDefaultWriteTarget).not.toHaveBeenCalled();
		expect(getAuthenticatedClient).toHaveBeenCalledWith('user-1', 'connection-b');
		expect(provider.patch).toHaveBeenCalledWith(
			expect.objectContaining({
				calendarId: 'work@example.com',
				eventId: 'provider-event-1'
			})
		);
		expect(updates).toContainEqual(
			expect.objectContaining({
				table: 'task_calendar_events',
				value: expect.objectContaining({ sync_status: 'synced' })
			})
		);
		expect(eqs).toContainEqual({
			table: 'task_calendar_events',
			column: 'calendar_source_id',
			value: 'source-b'
		});
	});

	it('persists task tracking with the same source used for provider creation', async () => {
		const targets = targetService();
		const provider = createProvider();
		const { admin, upserts } = createAdmin({
			task_calendar_events: { data: { id: 'task-event-1' }, error: null }
		});
		const service = new GoogleCalendarWriteService(admin, {
			targetService: targets as any,
			connectionService: { getAuthenticatedClient: vi.fn().mockResolvedValue({}) },
			createCalendarApi: () => ({ events: provider }) as any
		});

		const result = await service.createEvent({
			userId: 'user-1',
			selector: { calendarSourceId: 'source-a' },
			requestBody: { summary: 'Task block' },
			taskTracking: {
				taskId: 'task-1',
				eventStart: '2026-08-12T14:00:00.000Z',
				eventEnd: '2026-08-12T15:00:00.000Z',
				eventTitle: 'Task block',
				isMasterEvent: false
			}
		});

		expect(targets.resolveExplicitSource).toHaveBeenCalledWith('user-1', 'source-a', 'write');
		expect(upserts).toContainEqual(
			expect.objectContaining({
				table: 'task_calendar_events',
				value: expect.objectContaining({
					calendar_source_id: 'source-a',
					calendar_id: 'personal@example.com',
					calendar_event_id: 'provider-event-1',
					task_id: 'task-1'
				})
			})
		);
		expect(result.taskCalendarEventId).toBe('task-event-1');
	});

	it('rejects an unmapped primary mutation before loading credentials', async () => {
		const targets = targetService({
			resolveExternalEventTarget: vi
				.fn()
				.mockRejectedValue(
					new GoogleCalendarTargetError('CALENDAR_MAPPING_NOT_FOUND', 'Mapping not found')
				)
		});
		const getAuthenticatedClient = vi.fn();
		const { admin } = createAdmin();
		const service = new GoogleCalendarWriteService(admin, {
			targetService: targets as any,
			connectionService: { getAuthenticatedClient }
		});

		await expect(
			service.deleteEvent({
				userId: 'user-1',
				providerEventId: 'provider-event-1',
				selector: { calendarId: 'primary' }
			})
		).rejects.toMatchObject({ code: 'CALENDAR_EVENT_SOURCE_REQUIRED' });
		expect(getAuthenticatedClient).not.toHaveBeenCalled();
	});

	it('removes a newly created provider event when its local mapping fails', async () => {
		const provider = createProvider();
		const { admin, from } = createAdmin({
			onto_event_sync: { data: null, error: new Error('database unavailable') }
		});
		const service = new GoogleCalendarWriteService(admin, {
			targetService: targetService() as any,
			connectionService: { getAuthenticatedClient: vi.fn().mockResolvedValue({}) },
			createCalendarApi: () => ({ events: provider }) as any
		});

		await expect(
			service.createEvent({
				userId: 'user-1',
				ontoEventId: 'onto-event-1',
				requestBody: { summary: 'Planning' }
			})
		).rejects.toMatchObject({ code: 'CALENDAR_MAPPING_PERSIST_FAILED' });
		expect(provider.delete).toHaveBeenCalledWith({
			calendarId: 'personal@example.com',
			eventId: 'provider-event-1',
			sendUpdates: 'none'
		});
		expect(from).not.toHaveBeenCalledWith('calendar_event_orphan_receipts');
	});

	it('records a repairable orphan when mapping and compensation both fail', async () => {
		const provider = createProvider();
		provider.delete.mockRejectedValue(new Error('provider unavailable'));
		const { admin, upserts } = createAdmin({
			onto_event_sync: { data: null, error: new Error('database unavailable') },
			calendar_event_orphan_receipts: { data: null, error: null }
		});
		const service = new GoogleCalendarWriteService(admin, {
			targetService: targetService() as any,
			connectionService: { getAuthenticatedClient: vi.fn().mockResolvedValue({}) },
			createCalendarApi: () => ({ events: provider }) as any
		});

		await expect(
			service.createEvent({
				userId: 'user-1',
				ontoEventId: 'onto-event-1',
				requestBody: { summary: 'Planning' }
			})
		).rejects.toBeInstanceOf(GoogleCalendarWriteError);
		expect(upserts).toContainEqual(
			expect.objectContaining({
				table: 'calendar_event_orphan_receipts',
				value: expect.objectContaining({
					calendar_source_id: 'source-a',
					provider_event_id: 'provider-event-1',
					entity_kind: 'onto_event',
					entity_id: 'onto-event-1'
				})
			})
		);
	});

	it('compensates an unmapped time-block event on its exact source', async () => {
		const targets = targetService();
		const provider = createProvider();
		const { admin } = createAdmin();
		const service = new GoogleCalendarWriteService(admin, {
			targetService: targets as any,
			connectionService: { getAuthenticatedClient: vi.fn().mockResolvedValue({}) },
			createCalendarApi: () => ({ events: provider }) as any
		});

		await expect(
			service.compensateUnmappedCreatedEvent({
				userId: 'user-1',
				calendarSourceId: 'source-a',
				providerEventId: 'provider-event-1',
				entityKind: 'time_block',
				entityId: 'time-block-1'
			})
		).resolves.toBe('deleted');
		expect(targets.resolveExplicitSource).toHaveBeenCalledWith('user-1', 'source-a', 'write');
		expect(provider.delete).toHaveBeenCalledWith({
			calendarId: 'personal@example.com',
			eventId: 'provider-event-1',
			sendUpdates: 'none'
		});
	});

	it('treats provider 404 deletion as idempotent success on the resolved source', async () => {
		const mappedTarget = { ...target(), externalEventId: 'provider-event-1' };
		const provider = createProvider();
		provider.delete.mockRejectedValue({ response: { status: 404 } });
		const { admin, updates, eqs } = createAdmin();
		const service = new GoogleCalendarWriteService(admin, {
			targetService: targetService({
				resolveExternalEventTarget: vi.fn().mockResolvedValue(mappedTarget)
			}) as any,
			connectionService: { getAuthenticatedClient: vi.fn().mockResolvedValue({}) },
			createCalendarApi: () => ({ events: provider }) as any
		});

		await expect(
			service.deleteEvent({
				userId: 'user-1',
				providerEventId: 'provider-event-1'
			})
		).resolves.toMatchObject({ deleted: true, alreadyMissing: true });
		expect(updates).toContainEqual(
			expect.objectContaining({
				table: 'task_calendar_events',
				value: expect.objectContaining({ sync_status: 'cancelled' })
			})
		);
		expect(eqs).toContainEqual({
			table: 'task_calendar_events',
			column: 'calendar_source_id',
			value: 'source-a'
		});
	});
});
