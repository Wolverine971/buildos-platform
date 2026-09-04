// packages/agentic-chat-runtime/src/tools/calendar-reads.test.ts
//
// Ports the read half of the legacy web calendar executor's suite
// (calendar-executor.multi-account.test.ts "multi-account reads" +
// "read coverage", calendar-executor.event-id-routing.test.ts read cases) onto
// the shared implementations. The web files keep their write cases untouched.
import { describe, expect, it, vi } from 'vitest';
import type {
	AgenticChatCalendarReadPortV1,
	AgenticChatCalendarSourceFailureV1
} from './external-ports';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';
import {
	describeCalendarCoverage,
	getCalendarEventDetails,
	getProjectCalendar,
	listCalendarEvents,
	resolveCalendarReadCoverage
} from './calendar-reads';

const PROJECT_ID = '40000000-0000-4000-8000-000000000004';
const OTHER_PROJECT_ID = '40000000-0000-4000-8000-000000000009';
const ONTO_EVENT_ID = '50000000-0000-4000-8000-000000000001';
const USER_ID = 'user-1';
const ACTOR_ID = 'actor-1';

type QueryResponse = { data: unknown; error: unknown };

type TableCall = {
	table: string;
	filters: Array<[string, ...unknown[]]>;
};

function createContext(
	options: {
		responses?: Record<string, QueryResponse[]>;
		calendar?: Partial<AgenticChatCalendarReadPortV1>;
		timezone?: string | null;
		deniedProjectIds?: string[];
	} = {}
) {
	const responses = options.responses ?? {};
	const calls: TableCall[] = [];
	const positions = new Map<string, number>();
	const client = {
		from: vi.fn((table: string) => {
			const index = positions.get(table) ?? 0;
			positions.set(table, index + 1);
			const response = responses[table]?.[index] ?? { data: [], error: null };
			const call: TableCall = { table, filters: [] };
			calls.push(call);
			const query: Record<string, any> = {};
			for (const method of ['select', 'eq', 'is', 'in', 'order', 'limit', 'gte', 'lte']) {
				query[method] = vi.fn((...args: unknown[]) => {
					call.filters.push([method, ...args]);
					return query;
				});
			}
			query.then = (resolve: (value: unknown) => unknown) =>
				Promise.resolve(response).then(resolve);
			query.maybeSingle = vi.fn(async () => ({
				data: Array.isArray(response.data) ? (response.data[0] ?? null) : response.data,
				error: response.error
			}));
			return query;
		})
	};
	const denied = new Set(options.deniedProjectIds ?? []);
	const access = {
		getActorId: vi.fn(async () => ACTOR_ID),
		resolveProjectSummaries: vi.fn(async () => []),
		assertProjectAccess: vi.fn(async (projectId: string) => {
			if (denied.has(projectId)) {
				throw new Error('Project not found or access denied');
			}
		}),
		assertEntityAccess: vi.fn(async () => {})
	};
	const calendar = options.calendar
		? ({
				listEvents: vi.fn(async () => {
					throw new Error('listEvents not stubbed');
				}),
				getEvent: vi.fn(async () => {
					throw new Error('getEvent not stubbed');
				}),
				getProjectCalendar: vi.fn(async () => null),
				...options.calendar
			} as AgenticChatCalendarReadPortV1)
		: undefined;

	return {
		context: {
			client,
			access,
			userId: USER_ID,
			timezone: options.timezone === undefined ? 'America/New_York' : options.timezone,
			calendar
		} as unknown as AgenticChatSharedReadContextV1,
		access,
		calendar,
		calls
	};
}

function sourceStatus(index: number, status: 'success' | 'error' | 'timeout', reasonCode?: string) {
	return {
		calendar: `calendar-${index}@example.com`,
		calendar_source_id: `source-${index}`,
		connection_id: `connection-${index}`,
		reason_code: reasonCode ?? 'provider_error'
	} satisfies AgenticChatCalendarSourceFailureV1 & Record<string, unknown>;
}

function listResult(
	overrides: Partial<Awaited<ReturnType<AgenticChatCalendarReadPortV1['listEvents']>>> = {}
) {
	const sourceCount = overrides.sourceCount ?? 1;
	const successfulSourceCount = overrides.successfulSourceCount ?? sourceCount;
	return {
		events: [],
		mode: 'source_aware' as const,
		sourceCount,
		successfulSourceCount,
		failedSourceCount: sourceCount - successfulSourceCount,
		partial: sourceCount !== successfulSourceCount,
		sourceFailures: [],
		coverage: resolveCalendarReadCoverage(sourceCount, successfulSourceCount),
		...overrides
	};
}

const RANGE = {
	time_min: '2026-09-03T10:00:00Z',
	time_max: '2026-09-03T18:00:00Z'
};

describe('resolveCalendarReadCoverage', () => {
	it('separates a vacuous read, a partial read, and a total outage', () => {
		expect(resolveCalendarReadCoverage(0, 0)).toBe('complete');
		expect(resolveCalendarReadCoverage(2, 2)).toBe('complete');
		expect(resolveCalendarReadCoverage(2, 1)).toBe('degraded');
		expect(resolveCalendarReadCoverage(2, 0)).toBe('unavailable');
	});

	it('describes a zero-source outage without claiming N sources failed', () => {
		const warning = describeCalendarCoverage({
			coverage: 'unavailable',
			source_count: 0,
			failed_source_count: 0,
			source_failures: [
				{
					calendar: '',
					calendar_source_id: '',
					connection_id: '',
					reason_code: 'not_connected'
				}
			]
		});
		expect(warning).toContain('not_connected');
		expect(warning).toContain('Do not assert availability');
		expect(warning).not.toContain('all 0 connected');
	});

	// The production regression: the model saw `provider_error` and told the user
	// this was "a transient OAuth/sync issue on Google's side" when in fact the
	// server had no calendar credentials.
	it('names a missing server credential as server configuration, not a Google outage', () => {
		const warning = describeCalendarCoverage({
			coverage: 'unavailable',
			source_count: 0,
			failed_source_count: 0,
			source_failures: [
				{
					calendar: '',
					calendar_source_id: '',
					connection_id: '',
					reason_code: 'credentials_not_configured'
				}
			]
		});
		expect(warning).toContain("This server's Google Calendar credentials are not configured");
		expect(warning).toContain('BuildOS server configuration problem');
		expect(warning).toContain('NOT a Google outage');
		expect(warning).toContain('reconnecting their calendar');
		expect(warning).toContain('Do not assert availability');
	});

	it('names key drift as an undecryptable stored credential', () => {
		const warning = describeCalendarCoverage({
			coverage: 'unavailable',
			source_count: 1,
			failed_source_count: 1,
			source_failures: [
				{
					calendar: 'calendar-1@example.com',
					calendar_source_id: 'source-1',
					connection_id: 'connection-1',
					reason_code: 'credentials_unreadable'
				}
			]
		});
		expect(warning).toContain('could not be decrypted on this server');
		expect(warning).toContain('BuildOS server configuration problem');
	});

	it('explains a read-disabled source without condemning the whole read', () => {
		const warning = describeCalendarCoverage({
			coverage: 'degraded',
			source_count: 2,
			failed_source_count: 1,
			source_failures: [
				{
					calendar: 'calendar-1@example.com',
					calendar_source_id: 'source-1',
					connection_id: 'connection-1',
					reason_code: 'source_not_readable'
				}
			]
		});
		expect(warning).toContain('not enabled for reading in BuildOS');
		expect(warning).toContain('/profile?tab=calendar');
		expect(warning).toContain('Calendar coverage is degraded');
	});
});

describe('shared list_calendar_events', () => {
	it('rejects an empty explicit range with the canonical argument names', async () => {
		const { context, calendar } = createContext({ calendar: {} });

		await expect(
			listCalendarEvents(context, {
				time_min: '2026-08-25T03:10:00Z',
				time_max: '2026-08-25T03:10:00Z',
				timezone: 'America/New_York'
			})
		).rejects.toThrow('time_max must be after time_min');
		expect(calendar?.listEvents).not.toHaveBeenCalled();
	});

	it.each([
		{ label: 'canonical snake_case range', range: RANGE },
		{
			label: 'legacy prompt-dump camelCase range',
			range: { timeMin: RANGE.time_min, timeMax: RANGE.time_max }
		}
	])(
		'fans out across every enabled source for an implicit user scope ($label)',
		async ({ range }) => {
			const listEvents = vi.fn(async () =>
				listResult({
					events: [
						{
							id: 'g1',
							providerEventId: 'g1',
							calendarSourceId: 'source-1',
							connectionId: 'connection-1',
							providerCalendarId: 'calendar-1@example.com',
							summary: 'Standup',
							start: { dateTime: '2026-09-03T11:00:00Z' },
							end: { dateTime: '2026-09-03T11:30:00Z' },
							raw: { id: 'g1', summary: 'Standup', kind: 'calendar#event' }
						}
					],
					sourceCount: 2
				})
			);
			const { context } = createContext({ calendar: { listEvents } });

			const result = await listCalendarEvents(context, range);

			expect(listEvents).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: USER_ID,
					// An implicit user scope must not pin one calendar id.
					calendarId: undefined,
					timeMin: '2026-09-03T10:00:00.000Z',
					timeMax: '2026-09-03T18:00:00.000Z',
					budgetMs: 20_000
				})
			);
			expect(result.google_event_count).toBe(1);
			expect(result.events[0]).toMatchObject({
				source: 'google',
				external_event_id: 'g1',
				calendar_source_id: 'source-1',
				connection_id: 'connection-1',
				// The untouched provider payload is what the model sees.
				event: { id: 'g1', kind: 'calendar#event' }
			});
			expect(result.google_read.coverage).toBe('complete');
		}
	);

	it('routes a project calendar through its exact source and gates on membership', async () => {
		const listEvents = vi.fn(async () => listResult());
		const { context, access, calls } = createContext({
			calendar: { listEvents },
			responses: {
				project_calendars: [
					{
						data: [
							{
								id: 'pc-1',
								calendar_id: 'project-calendar@example.com',
								calendar_source_id: 'source-9',
								sync_enabled: true
							}
						],
						error: null
					}
				]
			}
		});

		await listCalendarEvents(context, { project_id: PROJECT_ID, ...RANGE });

		expect(access.assertProjectAccess).toHaveBeenCalledWith(PROJECT_ID, 'read');
		expect(listEvents).toHaveBeenCalledWith(
			expect.objectContaining({
				calendarSourceId: 'source-9',
				calendarId: 'project-calendar@example.com'
			})
		);
		const mappingRead = calls.find((call) => call.table === 'project_calendars');
		// The mapping row is per member: a service-role client must scope it.
		expect(mappingRead?.filters).toContainEqual(['eq', 'user_id', USER_ID]);
	});

	it('refuses a project scope the actor is not a member of', async () => {
		const listEvents = vi.fn(async () => listResult());
		const { context } = createContext({
			calendar: { listEvents },
			deniedProjectIds: [OTHER_PROJECT_ID]
		});

		await expect(
			listCalendarEvents(context, { project_id: OTHER_PROJECT_ID, ...RANGE })
		).rejects.toThrow('access denied');
		expect(listEvents).not.toHaveBeenCalled();
	});

	it('scopes a user-scope ontology read to the acting actor', async () => {
		const { context, calls } = createContext({
			calendar: { listEvents: vi.fn(async () => listResult()) },
			responses: {
				onto_events: [
					{
						data: [
							{
								id: ONTO_EVENT_ID,
								title: 'Personal block',
								start_at: '2026-09-03T12:00:00Z',
								end_at: '2026-09-03T13:00:00Z',
								project_id: null,
								owner_entity_type: null,
								owner_entity_id: null,
								onto_event_sync: [
									{ user_id: USER_ID, external_event_id: 'g-mine' },
									{ user_id: 'someone-else', external_event_id: 'g-theirs' }
								]
							}
						],
						error: null
					}
				]
			}
		});

		const result = await listCalendarEvents(context, RANGE);

		const eventRead = calls.find((call) => call.table === 'onto_events');
		expect(eventRead?.filters).toContainEqual(['eq', 'created_by', ACTOR_ID]);
		// Another member's sync row never reaches the payload.
		expect(result.events[0].event.onto_event_sync).toEqual([
			{ user_id: USER_ID, external_event_id: 'g-mine' }
		]);
		expect(result.events[0]).toMatchObject({
			source: 'ontology',
			is_synced: true,
			external_event_id: 'g-mine',
			onto_event_id: ONTO_EVENT_ID
		});
	});

	it('merges an ontology event onto its Google twin without mixing source metadata', async () => {
		const listEvents = vi.fn(async () =>
			listResult({
				events: [
					{
						id: 'g1',
						providerEventId: 'ext-1',
						calendarSourceId: 'source-1',
						connectionId: 'connection-1',
						providerCalendarId: 'calendar-1@example.com',
						summary: 'Design review',
						start: { dateTime: '2026-09-03T11:00:00Z' },
						end: { dateTime: '2026-09-03T12:00:00Z' }
					}
				]
			})
		);
		const { context } = createContext({
			calendar: { listEvents },
			responses: {
				onto_events: [
					{
						data: [
							{
								id: ONTO_EVENT_ID,
								title: 'Design review',
								start_at: '2026-09-03T11:00:00Z',
								end_at: '2026-09-03T12:00:00Z',
								project_id: PROJECT_ID,
								owner_entity_type: null,
								owner_entity_id: null,
								onto_event_sync: [
									{
										user_id: USER_ID,
										external_event_id: 'ext-1',
										calendar_source_id: 'source-1'
									}
								]
							}
						],
						error: null
					}
				]
			}
		});

		const result = await listCalendarEvents(context, RANGE);

		expect(result.merged_event_count).toBe(1);
		expect(result.events[0]).toMatchObject({
			source: 'ontology',
			is_synced: true,
			external_event_id: 'ext-1',
			calendar_source_id: 'source-1',
			connection_id: 'connection-1',
			provider_calendar_id: 'calendar-1@example.com'
		});
	});

	it('rejects offsets outside the bounded merged-event window', async () => {
		const { context } = createContext({ calendar: {} });

		await expect(listCalendarEvents(context, { offset: 300, ...RANGE })).rejects.toThrow(
			'offset must be between 0 and 299'
		);
	});

	it('reports complete coverage when 2 of 2 sources succeed', async () => {
		const { context } = createContext({
			calendar: {
				listEvents: vi.fn(async () => listResult({ sourceCount: 2 }))
			}
		});

		const result = await listCalendarEvents(context, {
			...RANGE,
			timezone: 'America/New_York'
		});

		expect(result.google_read).toMatchObject({
			coverage: 'complete',
			source_count: 2,
			successful_source_count: 2,
			failed_source_count: 0,
			source_failures: []
		});
		expect(result.warnings).not.toContainEqual(expect.stringContaining('coverage'));
	});

	it('reports degraded coverage when 1 of 2 sources succeeds', async () => {
		const { context } = createContext({
			calendar: {
				listEvents: vi.fn(async () =>
					listResult({
						sourceCount: 2,
						successfulSourceCount: 1,
						sourceFailures: [sourceStatus(2, 'error', 'rate_limited')]
					})
				)
			}
		});

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
					reason_code: 'rate_limited'
				}
			]
		});
		const warning = result.warnings.find((entry: string) =>
			entry.includes('Calendar coverage is degraded')
		);
		expect(warning).toContain('1 of 2');
		expect(warning).toContain('rate_limited');
	});

	it('reports unavailable coverage and reconnect guidance when 0 of 2 sources succeed', async () => {
		const { context } = createContext({
			calendar: {
				listEvents: vi.fn(async () =>
					listResult({
						sourceCount: 2,
						successfulSourceCount: 0,
						sourceFailures: [
							sourceStatus(1, 'error', 'reconnect_required'),
							sourceStatus(2, 'error', 'reconnect_required')
						]
					})
				)
			}
		});

		const result = await listCalendarEvents(context, RANGE);

		expect(result.google_read).toMatchObject({
			coverage: 'unavailable',
			source_count: 2,
			successful_source_count: 0,
			failed_source_count: 2
		});
		const warning = result.warnings.find((entry: string) =>
			entry.includes('No calendar data was read')
		);
		expect(warning).toContain('Do not assert availability');
		expect(warning).toContain('reconnect');
		expect(warning).toContain('calendar-1@example.com');
		expect(warning).toContain('calendar-2@example.com');
	});

	it('marks coverage unavailable when the provider read throws outright', async () => {
		const { context } = createContext({
			calendar: {
				listEvents: vi.fn(async () => {
					throw new Error('read exploded');
				})
			}
		});

		const result = await listCalendarEvents(context, RANGE);

		expect(result.google_read.coverage).toBe('unavailable');
		expect(
			result.warnings.some((entry: string) => entry.includes('No calendar data was read'))
		).toBe(true);
	});

	it('reports unavailable coverage when the host injected no calendar port', async () => {
		const { context } = createContext({
			responses: { onto_events: [{ data: [], error: null }] }
		});

		const result = await listCalendarEvents(context, RANGE);

		expect(result.google_read).toMatchObject({
			coverage: 'unavailable',
			mode: 'none',
			source_failures: [expect.objectContaining({ reason_code: 'calendar_port_unavailable' })]
		});
		expect(
			result.warnings.some((entry: string) => entry.includes('No calendar data was read'))
		).toBe(true);
	});

	it('reads a date-only window in the context timezone and falls back to UTC', async () => {
		const zoned = createContext({
			calendar: { listEvents: vi.fn(async () => listResult()) },
			timezone: 'America/New_York'
		});
		const zonedResult = await listCalendarEvents(zoned.context, {
			time_min: '2026-09-03',
			time_max: '2026-09-04'
		});
		expect(zonedResult.queried_range).toMatchObject({
			time_min: '2026-09-03T04:00:00.000Z',
			time_max: '2026-09-05T03:59:59.000Z',
			timezone: 'America/New_York'
		});

		const utc = createContext({
			calendar: { listEvents: vi.fn(async () => listResult()) },
			timezone: null
		});
		const utcResult = await listCalendarEvents(utc.context, {
			time_min: '2026-09-03',
			time_max: '2026-09-04'
		});
		expect(utcResult.queried_range).toMatchObject({
			time_min: '2026-09-03T00:00:00.000Z',
			time_max: '2026-09-04T23:59:59.000Z',
			timezone: 'UTC'
		});
	});

	it('applies the default window and says so', async () => {
		const { context } = createContext({
			calendar: { listEvents: vi.fn(async () => listResult()) }
		});

		const result = await listCalendarEvents(context, {});

		expect(result.queried_range.default_time_min_applied).toBe(true);
		expect(result.queried_range.default_time_max_applied).toBe(true);
		expect(
			result.warnings.some((entry: string) => entry.includes('Applied default event window'))
		).toBe(true);
	});
});

describe('shared get_calendar_event_details', () => {
	function ontoEventContext(row: Record<string, unknown> | null, denied: string[] = []) {
		return createContext({
			calendar: {
				getEvent: vi.fn(async () => ({
					event: null,
					calendarSourceId: null,
					connectionId: null,
					providerCalendarId: null
				}))
			},
			deniedProjectIds: denied,
			responses: { onto_events: [{ data: row ? [row] : [], error: null }] }
		});
	}

	it('routes a UUID onto_event_id to the ontology lookup after asserting project access', async () => {
		const { context, access, calendar } = ontoEventContext({
			id: ONTO_EVENT_ID,
			project_id: PROJECT_ID,
			title: 'Kickoff',
			onto_event_sync: [
				{ user_id: USER_ID, external_event_id: 'g-mine' },
				{ user_id: 'someone-else', external_event_id: 'g-theirs' }
			]
		});

		const result = await getCalendarEventDetails(context, { onto_event_id: ONTO_EVENT_ID });

		expect(access.assertProjectAccess).toHaveBeenCalledWith(PROJECT_ID, 'read');
		expect(result.source).toBe('ontology');
		expect(result.event.onto_event_sync).toEqual([
			{ user_id: USER_ID, external_event_id: 'g-mine' }
		]);
		expect(calendar?.getEvent).not.toHaveBeenCalled();
	});

	it('refuses an ontology event in a project the actor cannot read', async () => {
		const { context } = ontoEventContext(
			{ id: ONTO_EVENT_ID, project_id: OTHER_PROJECT_ID, onto_event_sync: [] },
			[OTHER_PROJECT_ID]
		);

		await expect(
			getCalendarEventDetails(context, { onto_event_id: ONTO_EVENT_ID })
		).rejects.toThrow('access denied');
	});

	it('hides a projectless event created by another actor', async () => {
		const { context } = ontoEventContext({
			id: ONTO_EVENT_ID,
			project_id: null,
			created_by: 'someone-elses-actor',
			onto_event_sync: []
		});

		await expect(
			getCalendarEventDetails(context, { onto_event_id: ONTO_EVENT_ID })
		).rejects.toThrow('Event not found');
	});

	it('routes a non-UUID onto_event_id to the Google lookup instead of throwing', async () => {
		const getEvent = vi.fn(async () => ({
			event: {
				id: 'google-event-id',
				providerEventId: 'google-event-id',
				calendarSourceId: 'source-1',
				connectionId: 'connection-1',
				providerCalendarId: 'calendar-1@example.com',
				raw: { id: 'google-event-id', summary: 'Lunch' }
			},
			calendarSourceId: 'source-1',
			connectionId: 'connection-1',
			providerCalendarId: 'calendar-1@example.com'
		}));
		const { context } = createContext({ calendar: { getEvent } });

		const result = await getCalendarEventDetails(context, {
			onto_event_id: 'google-event-id'
		});

		expect(getEvent).toHaveBeenCalledWith(
			expect.objectContaining({ userId: USER_ID, providerEventId: 'google-event-id' })
		);
		expect(result).toMatchObject({
			source: 'google',
			calendar_source_id: 'source-1',
			external_event_id: 'google-event-id',
			event: { id: 'google-event-id', summary: 'Lunch' }
		});
	});

	it('prefers an explicit event_id over a non-UUID onto_event_id', async () => {
		const getEvent = vi.fn(async () => ({
			event: {
				id: 'explicit',
				providerEventId: 'explicit',
				calendarSourceId: null,
				connectionId: null,
				providerCalendarId: null
			},
			calendarSourceId: null,
			connectionId: null,
			providerCalendarId: null
		}));
		const { context } = createContext({ calendar: { getEvent } });

		await getCalendarEventDetails(context, {
			onto_event_id: 'from-onto-arg',
			event_id: 'explicit'
		});

		expect(getEvent).toHaveBeenCalledWith(
			expect.objectContaining({ providerEventId: 'explicit' })
		);
	});

	it('throws an actionable error when no id is provided', async () => {
		const { context } = createContext({ calendar: {} });

		await expect(getCalendarEventDetails(context, {})).rejects.toThrow(
			/onto_event_id.*list_calendar_events.*event_id/
		);
	});

	it('reports coverage unavailable instead of an event when nothing is connected', async () => {
		const { context } = createContext({
			calendar: {
				getEvent: vi.fn(async () => ({
					event: null,
					calendarSourceId: null,
					connectionId: null,
					providerCalendarId: null,
					reasonCode: 'not_connected'
				}))
			}
		});

		const result = await getCalendarEventDetails(context, { event_id: 'google-event-id' });

		expect(result).toMatchObject({
			source: 'google',
			coverage: 'unavailable',
			reason_code: 'not_connected',
			event: null
		});
	});

	it('reports coverage unavailable when the host injected no calendar port', async () => {
		const { context } = createContext({});

		const result = await getCalendarEventDetails(context, { event_id: 'google-event-id' });

		expect(result).toMatchObject({
			coverage: 'unavailable',
			reason_code: 'calendar_port_unavailable',
			event: null
		});
	});
});

describe('shared get_project_calendar', () => {
	it('asserts project access and returns the stored mapping row', async () => {
		const row = {
			id: 'pc-1',
			project_id: PROJECT_ID,
			user_id: USER_ID,
			calendar_id: 'project-calendar@example.com',
			calendar_name: 'BuildOS',
			sync_enabled: true,
			sync_status: 'active',
			sync_mode: 'actor_projection'
		};
		const getProjectCalendarPort = vi.fn(async () => ({
			id: 'pc-1',
			projectId: PROJECT_ID,
			calendarId: 'project-calendar@example.com',
			calendarSourceId: null,
			calendarName: 'BuildOS',
			syncEnabled: true,
			syncMode: 'actor_projection' as const,
			raw: row
		}));
		const { context, access } = createContext({
			calendar: { getProjectCalendar: getProjectCalendarPort }
		});

		const result = await getProjectCalendar(context, { project_id: PROJECT_ID });

		expect(access.assertProjectAccess).toHaveBeenCalledWith(PROJECT_ID, 'read');
		expect(getProjectCalendarPort).toHaveBeenCalledWith({
			userId: USER_ID,
			projectId: PROJECT_ID
		});
		expect(result.project_calendar).toEqual(row);
	});

	it('reports an absent mapping as a null field, never a null result', async () => {
		const { context } = createContext({
			calendar: { getProjectCalendar: vi.fn(async () => null) }
		});

		const result = await getProjectCalendar(context, { project_id: PROJECT_ID });

		expect(result).toMatchObject({ project_id: PROJECT_ID, project_calendar: null });
		expect(result.message).toContain('set_project_calendar');
	});

	it('refuses a project the actor is not a member of', async () => {
		const getProjectCalendarPort = vi.fn(async () => null);
		const { context } = createContext({
			calendar: { getProjectCalendar: getProjectCalendarPort },
			deniedProjectIds: [OTHER_PROJECT_ID]
		});

		await expect(getProjectCalendar(context, { project_id: OTHER_PROJECT_ID })).rejects.toThrow(
			'access denied'
		);
		expect(getProjectCalendarPort).not.toHaveBeenCalled();
	});

	it('rejects a non-UUID project id', async () => {
		const { context } = createContext({ calendar: {} });

		await expect(getProjectCalendar(context, { project_id: 'not-a-uuid' })).rejects.toThrow(
			'Invalid project_id: expected UUID'
		);
	});
});
