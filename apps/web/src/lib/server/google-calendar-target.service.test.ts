// apps/web/src/lib/server/google-calendar-target.service.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	GoogleCalendarTargetError,
	GoogleCalendarTargetService
} from './google-calendar-target.service';

type QueryResult = { data: any; error: any };

function createQuery(result: QueryResult) {
	const query: any = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		in: vi.fn(() => query),
		is: vi.fn(() => query),
		maybeSingle: vi.fn().mockResolvedValue(result),
		then: (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) =>
			Promise.resolve(result).then(resolve, reject)
	};
	return query;
}

function createAdmin(results: Record<string, QueryResult | QueryResult[]>) {
	const queues = new Map(
		Object.entries(results).map(([table, result]) => [
			table,
			Array.isArray(result) ? [...result] : [result]
		])
	);
	return {
		from: vi.fn((table: string) => {
			const queue = queues.get(table);
			if (!queue?.length) throw new Error(`No query result configured for ${table}`);
			return createQuery(queue.length > 1 ? queue.shift()! : queue[0]!);
		})
	} as any;
}

const connections = [
	{
		id: 'connection-a',
		user_id: 'user-1',
		account_label: 'Personal',
		status: 'active',
		connected_at: '2026-08-10T10:00:00.000Z',
		deleted_at: null
	},
	{
		id: 'connection-b',
		user_id: 'user-1',
		account_label: 'Work',
		status: 'active',
		connected_at: '2026-08-11T10:00:00.000Z',
		deleted_at: null
	}
];

function source(overrides: Record<string, unknown> = {}) {
	return {
		id: 'source-a',
		user_id: 'user-1',
		connection_id: 'connection-a',
		provider_calendar_id: 'personal@example.com',
		summary: 'Personal',
		access_role: 'owner',
		is_primary: true,
		read_enabled: true,
		availability_enabled: true,
		analysis_enabled: true,
		sync_enabled: true,
		provider_deleted_at: null,
		created_at: '2026-08-10T10:01:00.000Z',
		deleted_at: null,
		...overrides
	};
}

describe('GoogleCalendarTargetService', () => {
	it('returns only sources enabled for the requested capability on active connections', async () => {
		const admin = createAdmin({
			user_calendar_sources: {
				data: [
					source(),
					source({
						id: 'source-b',
						connection_id: 'connection-b',
						provider_calendar_id: 'work@example.com',
						summary: 'Work',
						read_enabled: false,
						created_at: '2026-08-11T10:01:00.000Z'
					})
				],
				error: null
			},
			user_calendar_connections: { data: connections, error: null }
		});
		const service = new GoogleCalendarTargetService(admin, {
			connectionService: { reconcileDefaultWriteSource: vi.fn() }
		});

		await expect(service.listEnabledReadTargets('user-1')).resolves.toEqual([
			expect.objectContaining({
				calendarSourceId: 'source-a',
				connectionId: 'connection-a',
				providerCalendarId: 'personal@example.com'
			})
		]);
	});

	it('rejects two-way sync for a read-only source even if stale data says it is enabled', async () => {
		const admin = createAdmin({
			user_calendar_sources: {
				data: [source({ access_role: 'reader', sync_enabled: true })],
				error: null
			},
			user_calendar_connections: { data: connections.slice(0, 1), error: null }
		});
		const service = new GoogleCalendarTargetService(admin, {
			connectionService: { reconcileDefaultWriteSource: vi.fn() }
		});

		await expect(
			service.resolveExplicitSource('user-1', 'source-a', 'sync')
		).rejects.toMatchObject({
			code: 'CALENDAR_SOURCE_NOT_CAPABLE'
		});
	});

	it('never guesses when a provider calendar ID is visible through multiple accounts', async () => {
		const admin = createAdmin({
			user_calendar_sources: {
				data: [
					source({ provider_calendar_id: 'shared@example.com' }),
					source({
						id: 'source-b',
						connection_id: 'connection-b',
						provider_calendar_id: 'shared@example.com',
						created_at: '2026-08-11T10:01:00.000Z'
					})
				],
				error: null
			},
			user_calendar_connections: { data: connections, error: null }
		});
		const service = new GoogleCalendarTargetService(admin, {
			connectionService: { reconcileDefaultWriteSource: vi.fn() }
		});

		await expect(
			service.resolveLegacyCalendarId('user-1', 'shared@example.com', 'read')
		).rejects.toBeInstanceOf(GoogleCalendarTargetError);
		await expect(
			service.resolveLegacyCalendarId('user-1', 'shared@example.com', 'read')
		).rejects.toMatchObject({ code: 'CALENDAR_SOURCE_AMBIGUOUS' });
	});

	it('resolves the legacy primary alias through the reconciled default source', async () => {
		const reconcileDefaultWriteSource = vi.fn().mockResolvedValue('source-a');
		const admin = createAdmin({
			user_calendar_sources: [
				{ data: [source()], error: null },
				{ data: [source()], error: null }
			],
			user_calendar_connections: [
				{ data: connections.slice(0, 1), error: null },
				{ data: connections.slice(0, 1), error: null }
			]
		});
		const service = new GoogleCalendarTargetService(admin, {
			connectionService: { reconcileDefaultWriteSource }
		});

		await expect(
			service.resolveLegacyCalendarId('user-1', 'primary', 'read')
		).resolves.toMatchObject({ calendarSourceId: 'source-a' });
		expect(reconcileDefaultWriteSource).toHaveBeenCalledWith('user-1');
	});

	it('resolves project and event mappings through source identity', async () => {
		const admin = createAdmin({
			project_calendars: {
				data: {
					id: 'project-calendar-1',
					calendar_source_id: 'source-a',
					calendar_id: 'personal@example.com'
				},
				error: null
			},
			onto_event_sync: {
				data: {
					id: 'sync-1',
					calendar_source_id: 'source-a',
					project_calendar_id: 'project-calendar-1',
					external_calendar_id: 'personal@example.com',
					external_event_id: 'google-event-1'
				},
				error: null
			},
			user_calendar_sources: [
				{ data: [source()], error: null },
				{ data: [source()], error: null }
			],
			user_calendar_connections: [
				{ data: connections.slice(0, 1), error: null },
				{ data: connections.slice(0, 1), error: null }
			]
		});
		const service = new GoogleCalendarTargetService(admin, {
			connectionService: { reconcileDefaultWriteSource: vi.fn() }
		});

		await expect(
			service.resolveProjectTarget('user-1', 'project-1', 'write')
		).resolves.toMatchObject({
			calendarSourceId: 'source-a',
			projectCalendarId: 'project-calendar-1'
		});
		await expect(service.resolveEventTarget('user-1', 'onto-event-1')).resolves.toMatchObject({
			calendarSourceId: 'source-a',
			externalEventId: 'google-event-1',
			ontoEventSyncId: 'sync-1'
		});
	});

	it('resolves a provider event ID through its stored source-qualified mappings', async () => {
		const admin = createAdmin({
			onto_event_sync: { data: [], error: null },
			task_calendar_events: {
				data: [{ calendar_source_id: 'source-a' }],
				error: null
			},
			time_blocks: { data: [], error: null },
			recurring_task_instances: { data: [], error: null },
			user_calendar_sources: { data: [source()], error: null },
			user_calendar_connections: { data: connections.slice(0, 1), error: null }
		});
		const service = new GoogleCalendarTargetService(admin, {
			connectionService: { reconcileDefaultWriteSource: vi.fn() }
		});

		await expect(
			service.resolveExternalEventTarget('user-1', 'provider-event-1')
		).resolves.toMatchObject({
			calendarSourceId: 'source-a',
			externalEventId: 'provider-event-1'
		});
	});

	it('rejects an external event ID that maps to more than one source', async () => {
		const admin = createAdmin({
			onto_event_sync: {
				data: [{ calendar_source_id: 'source-a' }],
				error: null
			},
			task_calendar_events: {
				data: [{ calendar_source_id: 'source-b' }],
				error: null
			},
			time_blocks: { data: [], error: null },
			recurring_task_instances: { data: [], error: null }
		});
		const service = new GoogleCalendarTargetService(admin, {
			connectionService: { reconcileDefaultWriteSource: vi.fn() }
		});

		await expect(
			service.resolveExternalEventTarget('user-1', 'provider-event-1')
		).rejects.toMatchObject({ code: 'CALENDAR_SOURCE_AMBIGUOUS' });
	});
});
