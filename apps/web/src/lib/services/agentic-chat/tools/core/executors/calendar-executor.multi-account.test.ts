// apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.multi-account.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

const mocks = vi.hoisted(() => ({
	listEvents: vi.fn(),
	multiCalendarAllowed: vi.fn(),
	getEvent: vi.fn(),
	updateEvent: vi.fn(),
	deleteEvent: vi.fn(),
	hasActiveTarget: vi.fn()
}));

vi.mock('$lib/server/google-calendar-feature', () => ({
	isMultiCalendarUserAllowed: mocks.multiCalendarAllowed
}));

vi.mock('$lib/server/google-calendar-read.service', () => ({
	GoogleCalendarReadService: class {
		listEvents = mocks.listEvents;
	}
}));

vi.mock('$lib/server/google-calendar-write.service', () => ({
	GoogleCalendarWriteService: class {
		getEvent = mocks.getEvent;
		updateEvent = mocks.updateEvent;
		deleteEvent = mocks.deleteEvent;
		hasActiveTarget = mocks.hasActiveTarget;
	}
}));

import { CalendarExecutor } from './calendar-executor';

function emptyQuery(rows: unknown[] = []) {
	const query: any = {};
	for (const method of ['select', 'eq', 'is', 'in', 'order', 'limit', 'gte', 'lte']) {
		query[method] = vi.fn(() => query);
	}
	query.then = (resolve: (value: unknown) => unknown) =>
		Promise.resolve({ data: rows, error: null }).then(resolve);
	query.maybeSingle = vi.fn(async () => ({ data: rows[0] ?? null, error: null }));
	return query;
}

describe('CalendarExecutor multi-account reads', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.hasActiveTarget.mockResolvedValue(false);
	});
	function createExecutor() {
		const query = emptyQuery();
		const supabase = {
			from: vi.fn(() => query)
		} as unknown as SupabaseClient<Database>;
		return new CalendarExecutor({
			supabase,
			userId: 'user-1',
			sessionId: 'session-1',
			fetchFn: vi.fn() as unknown as typeof fetch,
			getActorId: async () => 'actor-1',
			getAdminSupabase: () => supabase as any,
			getAuthHeaders: async () => ({})
		});
	}

	it('rejects an empty explicit range with the canonical argument names', async () => {
		const query = emptyQuery();
		const supabase = {
			from: vi.fn(() => query)
		} as unknown as SupabaseClient<Database>;
		const executor = new CalendarExecutor({
			supabase,
			userId: 'user-1',
			sessionId: 'session-1',
			fetchFn: vi.fn() as unknown as typeof fetch,
			getActorId: async () => 'actor-1',
			getAdminSupabase: () => supabase as any,
			getAuthHeaders: async () => ({})
		});

		await expect(
			executor.listCalendarEvents({
				time_min: '2026-08-25T03:10:00Z',
				time_max: '2026-08-25T03:10:00Z',
				timezone: 'America/New_York'
			})
		).rejects.toThrow('time_max must be after time_min');
		expect(mocks.listEvents).not.toHaveBeenCalled();
	});

	it.each([
		{
			label: 'canonical snake_case range',
			range: {
				time_min: '2026-08-25T03:10:00Z',
				time_max: '2026-08-25T03:11:00Z'
			}
		},
		{
			label: 'legacy prompt-dump camelCase range',
			range: {
				timeMin: '2026-08-25T03:10:00Z',
				timeMax: '2026-08-25T03:11:00Z'
			}
		}
	])(
		'uses the source-aware read service for an implicit user scope with $label',
		async ({ range }) => {
			mocks.multiCalendarAllowed.mockReturnValueOnce(false);
			mocks.listEvents.mockResolvedValueOnce({
				event_count: 1,
				time_range: {
					start: '2026-08-25T03:10:00.000Z',
					end: '2026-08-25T03:11:00.000Z',
					timeZone: 'America/New_York'
				},
				events: [
					{
						id: 'provider-event-1',
						summary: 'Bounded event',
						start: { dateTime: '2026-08-25T03:10:10.000Z' },
						end: { dateTime: '2026-08-25T03:10:40.000Z' },
						calendarSourceId: 'source-1',
						connectionId: 'connection-1',
						providerCalendarId: 'provider-calendar-1',
						providerEventId: 'provider-event-1',
						contributingCalendarSourceIds: ['source-1'],
						contributingSourceEvents: [],
						connectionLabel: 'Account',
						calendarSummary: 'Calendar'
					}
				],
				partial: false,
				warnings: [],
				sourceStatuses: [
					{
						calendarSourceId: 'source-1',
						connectionId: 'connection-1',
						providerCalendarId: 'provider-calendar-1',
						status: 'success',
						itemCount: 1
					}
				]
			});

			const query = emptyQuery();
			const supabase = {
				from: vi.fn(() => query)
			} as unknown as SupabaseClient<Database>;
			const executor = new CalendarExecutor({
				supabase,
				userId: 'user-1',
				sessionId: 'session-1',
				fetchFn: vi.fn() as unknown as typeof fetch,
				getActorId: async () => 'actor-1',
				getAdminSupabase: () => supabase as any,
				getAuthHeaders: async () => ({})
			});
			const legacyRead = vi.fn();
			(executor as any).calendarService = { getCalendarEvents: legacyRead };

			const result = await executor.listCalendarEvents({
				...range,
				timezone: 'America/New_York',
				limit: 1
			});

			expect(mocks.listEvents).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: 'user-1',
					calendarId: undefined,
					maxResults: 1,
					budgetMs: 20_000
				})
			);
			expect(legacyRead).not.toHaveBeenCalled();
			expect(result.google_event_count).toBe(1);
			expect(result.google_read).toEqual({
				mode: 'source_aware',
				source_count: 1,
				successful_source_count: 1,
				failed_source_count: 0,
				partial: false,
				coverage: 'complete',
				source_failures: []
			});
			expect(result.events).toEqual([
				expect.objectContaining({ source: 'google', external_event_id: 'provider-event-1' })
			]);
		}
	);

	it('routes a project calendar through its exact source when calendar ids collide', async () => {
		mocks.multiCalendarAllowed.mockReturnValueOnce(true);
		mocks.listEvents.mockResolvedValueOnce({
			event_count: 0,
			time_range: {
				start: '2026-08-25T03:10:00.000Z',
				end: '2026-08-25T04:10:00.000Z',
				timeZone: 'America/New_York'
			},
			events: [],
			partial: false,
			warnings: [],
			sourceStatuses: [
				{
					calendarSourceId: 'source-b',
					connectionId: 'connection-b',
					providerCalendarId: 'shared-calendar',
					status: 'success',
					itemCount: 0
				}
			]
		});
		const supabase = {
			from: vi.fn((table: string) =>
				emptyQuery(
					table === 'project_calendars'
						? [
								{
									id: 'project-calendar-1',
									calendar_id: 'shared-calendar',
									calendar_source_id: 'source-b',
									sync_enabled: true
								}
							]
						: []
				)
			)
		} as unknown as SupabaseClient<Database>;
		const executor = new CalendarExecutor({
			supabase,
			userId: 'user-1',
			sessionId: 'session-1',
			fetchFn: vi.fn() as unknown as typeof fetch,
			getActorId: async () => 'actor-1',
			getAdminSupabase: () => supabase as any,
			getAuthHeaders: async () => ({})
		});
		(executor as any).assertProjectAccess = vi.fn();

		await executor.listCalendarEvents({
			project_id: '11111111-1111-4111-8111-111111111111',
			calendar_scope: 'project',
			time_min: '2026-08-25T03:10:00.000Z',
			time_max: '2026-08-25T04:10:00.000Z',
			timezone: 'America/New_York'
		});

		expect(mocks.listEvents).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'user-1',
				calendarSourceId: 'source-b',
				calendarId: 'shared-calendar'
			})
		);
	});

	it('preserves source identity when provider event ids collide and routes follow-up reads and writes to the selected source', async () => {
		mocks.multiCalendarAllowed.mockReturnValueOnce(true);
		mocks.listEvents.mockResolvedValueOnce({
			event_count: 2,
			time_range: {
				start: '2026-08-25T03:10:00.000Z',
				end: '2026-08-25T04:10:00.000Z',
				timeZone: 'America/New_York'
			},
			events: [
				{
					id: 'same-provider-event',
					summary: 'Source A',
					start: { dateTime: '2026-08-25T03:20:00.000Z' },
					calendarSourceId: 'source-a',
					connectionId: 'connection-a',
					providerCalendarId: 'calendar-a',
					providerEventId: 'same-provider-event'
				},
				{
					id: 'same-provider-event',
					summary: 'Source B',
					start: { dateTime: '2026-08-25T03:30:00.000Z' },
					calendarSourceId: 'source-b',
					connectionId: 'connection-b',
					providerCalendarId: 'calendar-b',
					providerEventId: 'same-provider-event'
				}
			],
			partial: false,
			warnings: [],
			sourceStatuses: [
				{
					calendarSourceId: 'source-a',
					connectionId: 'connection-a',
					providerCalendarId: 'calendar-a',
					status: 'success',
					itemCount: 1
				},
				{
					calendarSourceId: 'source-b',
					connectionId: 'connection-b',
					providerCalendarId: 'calendar-b',
					status: 'success',
					itemCount: 1
				}
			]
		});
		const sourceBResult = {
			calendarSourceId: 'source-b',
			connectionId: 'connection-b',
			providerCalendarId: 'calendar-b',
			providerEventId: 'same-provider-event',
			event: { id: 'same-provider-event', summary: 'Source B' }
		};
		mocks.getEvent.mockResolvedValueOnce(sourceBResult);
		mocks.updateEvent.mockResolvedValueOnce(sourceBResult);
		mocks.deleteEvent.mockResolvedValueOnce({
			...sourceBResult,
			deleted: true,
			alreadyMissing: false
		});
		const executor = createExecutor();

		const listed = await executor.listCalendarEvents({
			time_min: '2026-08-25T03:10:00.000Z',
			time_max: '2026-08-25T04:10:00.000Z'
		});
		expect(listed.events).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					external_event_id: 'same-provider-event',
					calendar_source_id: 'source-a',
					connection_id: 'connection-a'
				}),
				expect.objectContaining({
					external_event_id: 'same-provider-event',
					calendar_source_id: 'source-b',
					connection_id: 'connection-b'
				})
			])
		);

		await executor.getCalendarEventDetails({
			event_id: 'same-provider-event',
			calendar_source_id: 'source-b'
		});
		await executor.updateCalendarEvent({
			event_id: 'same-provider-event',
			calendar_source_id: 'source-b',
			title: 'Updated on B'
		});
		await executor.deleteCalendarEvent({
			event_id: 'same-provider-event',
			calendar_source_id: 'source-b'
		});

		for (const call of [
			mocks.getEvent.mock.calls.at(-1)?.[0],
			mocks.updateEvent.mock.calls.at(-1)?.[0],
			mocks.deleteEvent.mock.calls.at(-1)?.[0]
		]) {
			expect(call).toEqual(
				expect.objectContaining({
					userId: 'user-1',
					providerEventId: 'same-provider-event',
					selector: { calendarSourceId: 'source-b' }
				})
			);
		}
	});

	it('rejects offsets outside the bounded merged-event window', async () => {
		const executor = createExecutor();
		await expect(
			executor.listCalendarEvents({
				time_min: '2026-08-25T03:10:00.000Z',
				time_max: '2026-08-25T04:10:00.000Z',
				timezone: 'America/New_York',
				offset: 300
			})
		).rejects.toThrow('offset must be between 0 and 299');
		expect(mocks.listEvents).not.toHaveBeenCalled();
	});

	it('lets the source-aware resolver fail closed on a missing source selector', async () => {
		mocks.multiCalendarAllowed.mockReturnValue(true);
		mocks.getEvent.mockRejectedValueOnce(
			new Error('Choose the Google Calendar source that owns this existing event')
		);
		const executor = createExecutor();

		await expect(
			executor.getCalendarEventDetails({ event_id: 'ambiguous-event' })
		).rejects.toThrow('Choose the Google Calendar source');
		expect(mocks.getEvent).toHaveBeenCalledWith({
			userId: 'user-1',
			providerEventId: 'ambiguous-event',
			selector: {}
		});
	});

	it('does not let a stale source row force source-aware routing', async () => {
		mocks.multiCalendarAllowed.mockReturnValue(false);
		mocks.hasActiveTarget.mockResolvedValueOnce(false);
		const executor = createExecutor();
		const legacyRead = vi.fn(async () => ({ id: 'legacy-event' }));
		(executor as any).calendarService = { getCalendarEvent: legacyRead };

		await expect(
			executor.getCalendarEventDetails({ event_id: 'legacy-event' })
		).resolves.toEqual({ source: 'google', event: { id: 'legacy-event' } });
		expect(legacyRead).toHaveBeenCalledWith('user-1', {
			event_id: 'legacy-event',
			calendar_id: 'primary'
		});
		expect(mocks.getEvent).not.toHaveBeenCalled();
	});

	it('merges an ontology event through a contributing source without mixing source metadata', async () => {
		mocks.multiCalendarAllowed.mockReturnValue(true);
		mocks.listEvents.mockResolvedValueOnce({
			event_count: 1,
			time_range: {
				start: '2026-08-25T03:10:00.000Z',
				end: '2026-08-25T04:10:00.000Z',
				timeZone: 'America/New_York'
			},
			events: [
				{
					id: 'provider-a',
					providerEventId: 'provider-a',
					summary: 'Shared meeting',
					start: { dateTime: '2026-08-25T03:20:00.000Z' },
					calendarSourceId: 'source-a',
					connectionId: 'connection-a',
					providerCalendarId: 'calendar-a',
					contributingSourceEvents: [
						{ calendarSourceId: 'source-a', providerEventId: 'provider-a' },
						{ calendarSourceId: 'source-b', providerEventId: 'provider-b' }
					]
				}
			],
			partial: false,
			warnings: [],
			sourceStatuses: [
				{
					calendarSourceId: 'source-a',
					connectionId: 'connection-a',
					providerCalendarId: 'calendar-a',
					status: 'success',
					itemCount: 1
				}
			]
		});
		const ontoEvent = {
			id: 'onto-event-1',
			title: 'Shared meeting',
			start_at: '2026-08-25T03:20:00.000Z',
			end_at: '2026-08-25T03:50:00.000Z',
			owner_entity_type: null,
			owner_entity_id: null,
			project_id: null,
			props: {},
			sync_status: 'synced',
			sync_error: null,
			onto_event_sync: [
				{
					user_id: 'user-1',
					calendar_source_id: 'source-b',
					external_event_id: 'provider-b'
				}
			]
		};
		const supabase = {
			from: vi.fn((table: string) => emptyQuery(table === 'onto_events' ? [ontoEvent] : []))
		} as unknown as SupabaseClient<Database>;
		const executor = new CalendarExecutor({
			supabase,
			userId: 'user-1',
			sessionId: 'session-1',
			fetchFn: vi.fn() as unknown as typeof fetch,
			getActorId: async () => 'actor-1',
			getAdminSupabase: () => supabase as any,
			getAuthHeaders: async () => ({})
		});

		const result = await executor.listCalendarEvents({
			time_min: '2026-08-25T03:10:00.000Z',
			time_max: '2026-08-25T04:10:00.000Z',
			timezone: 'America/New_York'
		});

		expect(result.events).toHaveLength(1);
		expect(result.events[0]).toMatchObject({
			source: 'ontology',
			external_event_id: 'provider-b',
			calendar_source_id: 'source-b',
			connection_id: null,
			provider_calendar_id: null,
			onto_event_id: 'onto-event-1'
		});
	});
});

describe('CalendarExecutor read coverage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.hasActiveTarget.mockResolvedValue(false);
	});

	function sourceStatus(
		index: number,
		status: 'success' | 'error' | 'timeout',
		reasonCode?: string
	) {
		return {
			calendarSourceId: `source-${index}`,
			connectionId: `connection-${index}`,
			providerCalendarId: `calendar-${index}@example.com`,
			status,
			itemCount: 0,
			...(reasonCode ? { reasonCode } : {})
		};
	}

	function mockRead(
		statuses: ReturnType<typeof sourceStatus>[],
		warnings: Array<Record<string, unknown>> = []
	) {
		mocks.multiCalendarAllowed.mockReturnValue(true);
		mocks.listEvents.mockResolvedValueOnce({
			event_count: 0,
			time_range: {
				start: '2026-09-03T10:00:00.000Z',
				end: '2026-09-03T18:00:00.000Z',
				timeZone: 'America/New_York'
			},
			events: [],
			partial: warnings.length > 0,
			warnings,
			sourceStatuses: statuses
		});
	}

	async function runList() {
		const query = emptyQuery();
		const supabase = {
			from: vi.fn(() => query)
		} as unknown as SupabaseClient<Database>;
		const executor = new CalendarExecutor({
			supabase,
			userId: 'user-1',
			sessionId: 'session-1',
			fetchFn: vi.fn() as unknown as typeof fetch,
			getActorId: async () => 'actor-1',
			getAdminSupabase: () => supabase as any,
			getAuthHeaders: async () => ({})
		});
		(executor as any).calendarService = { getCalendarEvents: vi.fn() };
		return executor.listCalendarEvents({
			time_min: '2026-09-03T10:00:00Z',
			time_max: '2026-09-03T18:00:00Z',
			timezone: 'America/New_York'
		});
	}

	it('reports complete coverage when 2 of 2 sources succeed', async () => {
		mockRead([sourceStatus(1, 'success'), sourceStatus(2, 'success')]);

		const result = await runList();

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
		mockRead(
			[sourceStatus(1, 'success'), sourceStatus(2, 'error', 'rate_limited')],
			[{ code: 'CALENDAR_SOURCE_READ_FAILED', message: 'Could not read calendar-2' }]
		);

		const result = await runList();

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
		mockRead(
			[
				sourceStatus(1, 'error', 'reconnect_required'),
				sourceStatus(2, 'error', 'reconnect_required')
			],
			[
				{ code: 'CALENDAR_SOURCE_READ_FAILED', message: 'a' },
				{ code: 'CALENDAR_SOURCE_READ_FAILED', message: 'b' }
			]
		);

		const result = await runList();

		expect(result.google_read).toMatchObject({
			coverage: 'unavailable',
			source_count: 2,
			successful_source_count: 0,
			failed_source_count: 2
		});
		expect(result.google_read.source_failures).toHaveLength(2);
		const warning = result.warnings.find((entry: string) =>
			entry.includes('No calendar data was read')
		);
		expect(warning).toContain('Do not assert availability');
		expect(warning).toContain('reconnect');
		expect(warning).toContain('calendar-1@example.com');
		expect(warning).toContain('calendar-2@example.com');
	});

	it('marks coverage unavailable when the source-aware read throws outright', async () => {
		mocks.multiCalendarAllowed.mockReturnValue(true);
		mocks.listEvents.mockRejectedValueOnce(new Error('read exploded'));

		const result = await runList();

		expect(result.google_read.coverage).toBe('unavailable');
		expect(
			result.warnings.some((entry: string) => entry.includes('No calendar data was read'))
		).toBe(true);
	});
});
