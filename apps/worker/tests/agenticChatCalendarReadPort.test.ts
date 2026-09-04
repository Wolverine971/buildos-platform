// apps/worker/tests/agenticChatCalendarReadPort.test.ts
//
// The worker half of the three shared calendar reads: the port adapter over the
// source-aware Google services, driven through the shared read dispatcher so the
// test covers what a real turn executes (arguments -> shared tool -> port ->
// provider services).
import { describe, expect, it, vi } from 'vitest';
import {
	GoogleCalendarConnectionError,
	GoogleCalendarTargetError
} from '@buildos/shared-agent-ops/calendar/google-calendar-runtime';
import {
	executeAgenticChatSharedReadToolV1,
	type AgenticChatSharedReadContextV1,
	type AgenticChatToolAccessPortV1
} from '@buildos/agentic-chat-runtime/tools';
import { createWorkerAgenticChatCalendarReadPort } from '../src/workers/agentic-chat/tools/calendar-read-port';

const USER_ID = 'user-1';
const ACTOR_ID = 'actor-1';
const PROJECT_ID = '40000000-0000-4000-8000-000000000004';
const OTHER_PROJECT_ID = '40000000-0000-4000-8000-000000000009';

const RANGE = { time_min: '2026-09-03T10:00:00Z', time_max: '2026-09-03T18:00:00Z' };

type QueryResponse = { data: unknown; error: unknown };

function createSupabaseStub(responses: Record<string, QueryResponse[]> = {}) {
	const positions = new Map<string, number>();
	return {
		from: vi.fn((table: string) => {
			const index = positions.get(table) ?? 0;
			positions.set(table, index + 1);
			const response = responses[table]?.[index] ?? { data: [], error: null };
			const query: Record<string, any> = {};
			for (const method of ['select', 'eq', 'is', 'in', 'order', 'limit', 'gte', 'lte']) {
				query[method] = vi.fn(() => query);
			}
			query.then = (resolve: (value: unknown) => unknown) =>
				Promise.resolve(response).then(resolve);
			query.maybeSingle = vi.fn(async () => ({
				data: Array.isArray(response.data) ? (response.data[0] ?? null) : response.data,
				error: response.error
			}));
			query.single = query.maybeSingle;
			return query;
		})
	} as any;
}

function sourceStatus(index: number, status: 'success' | 'error' | 'timeout', reasonCode?: string) {
	return {
		calendarSourceId: `source-${index}`,
		connectionId: `connection-${index}`,
		providerCalendarId: `calendar-${index}@example.com`,
		status,
		itemCount: 0,
		...(reasonCode ? { reasonCode } : {})
	};
}

type FakeServices = {
	read: { listEvents: ReturnType<typeof vi.fn> };
	write: { getEvent: ReturnType<typeof vi.fn> };
	targets: { hasActiveTarget: ReturnType<typeof vi.fn> };
};

function fakeServices(overrides: Partial<FakeServices> = {}): FakeServices {
	return {
		read: {
			listEvents: vi.fn(async () => ({
				event_count: 0,
				time_range: { start: RANGE.time_min, end: RANGE.time_max },
				events: [],
				partial: false,
				warnings: [],
				sourceStatuses: [sourceStatus(1, 'success')]
			}))
		},
		write: { getEvent: vi.fn(async () => ({})) },
		targets: { hasActiveTarget: vi.fn(async () => true) },
		...overrides
	};
}

function createContext(input: {
	services?: () => any;
	servicesFactory?: ReturnType<typeof vi.fn>;
	responses?: Record<string, QueryResponse[]>;
	timezone?: string | null;
	deniedProjectIds?: string[];
}) {
	const client = createSupabaseStub(input.responses);
	const denied = new Set(input.deniedProjectIds ?? []);
	const access: AgenticChatToolAccessPortV1 = {
		getActorId: vi.fn(async () => ACTOR_ID),
		resolveProjectSummaries: vi.fn(async () => []),
		assertProjectAccess: vi.fn(async (projectId: string) => {
			if (denied.has(projectId)) throw new Error('Project not found or access denied');
		}),
		assertEntityAccess: vi.fn(async () => {})
	};
	const calendar = createWorkerAgenticChatCalendarReadPort({
		client,
		userId: USER_ID,
		options: { services: input.services as any }
	});
	return {
		client,
		access,
		calendar,
		context: {
			client,
			access,
			userId: USER_ID,
			timezone: input.timezone === undefined ? 'America/New_York' : input.timezone,
			calendar
		} as unknown as AgenticChatSharedReadContextV1
	};
}

function listCalendarEvents(context: AgenticChatSharedReadContextV1, args: Record<string, any>) {
	return executeAgenticChatSharedReadToolV1({
		toolName: 'list_calendar_events',
		context,
		arguments: args as never
	}) as Promise<Record<string, any>>;
}

describe('worker calendar read port', () => {
	it('never composes provider services until a calendar read actually runs', () => {
		const services = vi.fn(() => fakeServices());
		createWorkerAgenticChatCalendarReadPort({
			client: createSupabaseStub(),
			userId: USER_ID,
			options: { services: services as any }
		});
		expect(services).not.toHaveBeenCalled();
	});

	it('refuses a userId outside the turn claim', async () => {
		const { calendar } = createContext({ services: () => fakeServices() });
		await expect(
			calendar.listEvents({ userId: 'someone-else', timeMin: RANGE.time_min })
		).rejects.toThrow('outside the turn claim');
	});

	it('reports complete coverage when every source succeeds', async () => {
		const services = fakeServices();
		services.read.listEvents = vi.fn(async () => ({
			events: [],
			partial: false,
			warnings: [],
			sourceStatuses: [sourceStatus(1, 'success'), sourceStatus(2, 'success')]
		}));
		const { context } = createContext({ services: () => services });

		const result = await listCalendarEvents(context, RANGE);

		expect(result.google_read).toMatchObject({
			mode: 'source_aware',
			coverage: 'complete',
			source_count: 2,
			successful_source_count: 2,
			failed_source_count: 0,
			source_failures: []
		});
	});

	it('reports degraded coverage and names the failing calendar', async () => {
		const services = fakeServices();
		services.read.listEvents = vi.fn(async () => ({
			events: [],
			partial: true,
			warnings: [{ code: 'CALENDAR_SOURCE_READ_FAILED' }],
			sourceStatuses: [
				sourceStatus(1, 'success'),
				sourceStatus(2, 'error', 'reconnect_required')
			]
		}));
		const { context } = createContext({ services: () => services });

		const result = await listCalendarEvents(context, RANGE);

		expect(result.google_read).toMatchObject({
			coverage: 'degraded',
			source_count: 2,
			successful_source_count: 1,
			failed_source_count: 1,
			source_failures: [
				{
					calendar: 'calendar-2@example.com',
					calendar_source_id: 'source-2',
					connection_id: 'connection-2',
					reason_code: 'reconnect_required'
				}
			]
		});
		const warning = result.warnings.find((entry: string) =>
			entry.includes('Calendar coverage is degraded')
		);
		expect(warning).toContain('calendar-2@example.com');
	});

	it('reports unavailable coverage when every source fails', async () => {
		const services = fakeServices();
		services.read.listEvents = vi.fn(async () => ({
			events: [],
			partial: true,
			warnings: [],
			sourceStatuses: [
				sourceStatus(1, 'error', 'provider_error'),
				sourceStatus(2, 'timeout', 'timeout')
			]
		}));
		const { context } = createContext({ services: () => services });

		const result = await listCalendarEvents(context, RANGE);

		expect(result.google_read.coverage).toBe('unavailable');
		expect(
			result.warnings.some((entry: string) => entry.includes('Do not assert availability'))
		).toBe(true);
	});

	it('reports not_connected — never a vacuously complete empty list — with zero read targets', async () => {
		const services = fakeServices();
		services.read.listEvents = vi.fn(async () => ({
			events: [],
			partial: false,
			warnings: [],
			sourceStatuses: []
		}));
		const { context } = createContext({ services: () => services });

		const result = await listCalendarEvents(context, RANGE);

		expect(result.google_read).toMatchObject({
			mode: 'none',
			coverage: 'unavailable',
			source_count: 0,
			source_failures: [expect.objectContaining({ reason_code: 'not_connected' })]
		});
		expect(result.events).toEqual([]);
	});

	it('surfaces missing OAuth configuration as unavailable coverage, not a tool failure', async () => {
		const services = fakeServices();
		services.read.listEvents = vi.fn(async () => {
			throw new GoogleCalendarConnectionError(
				'not_configured',
				'Google Calendar OAuth client credentials are not configured on this server for client kind google_calendar (missing PRIVATE_GOOGLE_CALENDAR_CLIENT_SECRET)'
			);
		});
		const { context } = createContext({ services: () => services });

		const result = await listCalendarEvents(context, RANGE);

		// The model must be handed the server-configuration reason, not a bare
		// `not_configured` it can paraphrase as a Google problem.
		expect(result.google_read).toMatchObject({
			coverage: 'unavailable',
			source_failures: [
				expect.objectContaining({ reason_code: 'credentials_not_configured' })
			]
		});
		expect(
			result.warnings.some((entry: string) => entry.includes('No calendar data was read'))
		).toBe(true);
		expect(
			result.warnings.some((entry: string) =>
				entry.includes("This server's Google Calendar credentials are not configured")
			)
		).toBe(true);
		expect(result.warnings.some((entry: string) => entry.includes('NOT a Google outage'))).toBe(
			true
		);
	});

	it('surfaces an undecryptable stored credential as key drift, not a database fault', async () => {
		const services = fakeServices();
		services.read.listEvents = vi.fn(async () => {
			throw new GoogleCalendarConnectionError(
				'database_error',
				"Stored Google Calendar credentials could not be decrypted with this server's calendar token encryption key"
			);
		});
		const { context } = createContext({ services: () => services });

		const result = await listCalendarEvents(context, RANGE);

		expect(result.google_read).toMatchObject({
			coverage: 'unavailable',
			source_failures: [expect.objectContaining({ reason_code: 'credentials_unreadable' })]
		});
		expect(
			result.warnings.some((entry: string) =>
				entry.includes('could not be decrypted on this server')
			)
		).toBe(true);
	});

	it('reports a read-disabled source instead of throwing the whole read away', async () => {
		const services = fakeServices();
		services.read.listEvents = vi.fn(async () => {
			throw new GoogleCalendarTargetError(
				'CALENDAR_SOURCE_NOT_CAPABLE',
				'Google Calendar source cannot be used for read'
			);
		});
		const { context } = createContext({ services: () => services });

		const result = await listCalendarEvents(context, RANGE);

		expect(result.google_read).toMatchObject({
			coverage: 'unavailable',
			source_failures: [expect.objectContaining({ reason_code: 'source_not_readable' })]
		});
		expect(
			result.warnings.some((entry: string) =>
				entry.includes('not enabled for reading in BuildOS')
			)
		).toBe(true);
	});

	it('lets a genuine provider failure fail the read instead of faking coverage', async () => {
		const services = fakeServices();
		services.read.listEvents = vi.fn(async () => {
			throw new Error('provider exploded');
		});
		const { calendar } = createContext({ services: () => services });

		await expect(calendar.listEvents({ userId: USER_ID })).rejects.toThrow('provider exploded');
	});

	it('refuses a project scope the actor is not a member of', async () => {
		const services = fakeServices();
		const { context } = createContext({
			services: () => services,
			deniedProjectIds: [OTHER_PROJECT_ID]
		});

		await expect(
			listCalendarEvents(context, { project_id: OTHER_PROJECT_ID, ...RANGE })
		).rejects.toThrow('access denied');
		expect(services.read.listEvents).not.toHaveBeenCalled();
	});

	it('resolves a date-only window in the turn timezone', async () => {
		const services = fakeServices();
		const { context } = createContext({ services: () => services, timezone: 'America/Denver' });

		const result = await listCalendarEvents(context, {
			time_min: '2026-09-03',
			time_max: '2026-09-03'
		});

		// The provider is queried in UTC; the model sees the same instants
		// rendered in the turn timezone (read-result projection, 2026-09-04).
		expect(result.queried_range).toMatchObject({
			time_min: '2026-09-03T00:00:00-06:00',
			time_max: '2026-09-03T23:59:59-06:00',
			timezone: 'America/Denver'
		});
		expect(services.read.listEvents).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: USER_ID,
				timeZone: 'America/Denver',
				timeMin: '2026-09-03T06:00:00.000Z'
			})
		);
	});

	it('reports not_connected for a single-event read with no active target', async () => {
		const services = fakeServices({
			targets: { hasActiveTarget: vi.fn(async () => false) }
		});
		const { context } = createContext({ services: () => services });

		const result = (await executeAgenticChatSharedReadToolV1({
			toolName: 'get_calendar_event_details',
			context,
			arguments: { event_id: 'google-event-id' } as never
		})) as Record<string, any>;

		expect(result).toMatchObject({
			source: 'google',
			coverage: 'unavailable',
			reason_code: 'not_connected',
			event: null
		});
		expect(services.write.getEvent).not.toHaveBeenCalled();
	});

	it('returns one Google event through the source-aware write service', async () => {
		const services = fakeServices({
			write: {
				getEvent: vi.fn(async () => ({
					calendarSourceId: 'source-1',
					connectionId: 'connection-1',
					providerCalendarId: 'calendar-1@example.com',
					providerEventId: 'google-event-id',
					event: { id: 'google-event-id', summary: 'Lunch' }
				}))
			}
		});
		const { context } = createContext({ services: () => services });

		const result = (await executeAgenticChatSharedReadToolV1({
			toolName: 'get_calendar_event_details',
			context,
			arguments: { event_id: 'google-event-id', calendar_source_id: 'source-1' } as never
		})) as Record<string, any>;

		expect(result).toMatchObject({
			source: 'google',
			calendar_source_id: 'source-1',
			connection_id: 'connection-1',
			provider_calendar_id: 'calendar-1@example.com',
			external_event_id: 'google-event-id'
		});
		expect(result.event).toMatchObject({ id: 'google-event-id', summary: 'Lunch' });
	});

	it('reads the project calendar mapping row scoped to the turn user', async () => {
		const row = {
			id: 'pc-1',
			project_id: PROJECT_ID,
			user_id: USER_ID,
			calendar_id: 'project-calendar@example.com',
			calendar_name: 'BuildOS',
			calendar_source_id: 'source-1',
			sync_enabled: true,
			sync_status: 'active'
		};
		const { context } = createContext({
			services: () => fakeServices(),
			responses: {
				project_calendars: [{ data: row, error: null }],
				onto_projects: [{ data: { props: {} }, error: null }]
			}
		});

		const result = (await executeAgenticChatSharedReadToolV1({
			toolName: 'get_project_calendar',
			context,
			arguments: { project_id: PROJECT_ID } as never
		})) as Record<string, any>;

		expect(result.project_calendar).toMatchObject({
			id: 'pc-1',
			calendar_id: 'project-calendar@example.com',
			sync_status: 'active',
			sync_mode: 'actor_projection'
		});
	});

	it('refuses a project calendar read for a foreign project before touching the row', async () => {
		const { context, client } = createContext({
			services: () => fakeServices(),
			deniedProjectIds: [OTHER_PROJECT_ID]
		});

		await expect(
			executeAgenticChatSharedReadToolV1({
				toolName: 'get_project_calendar',
				context,
				arguments: { project_id: OTHER_PROJECT_ID } as never
			})
		).rejects.toThrow('access denied');
		expect(client.from).not.toHaveBeenCalledWith('project_calendars');
	});
});
