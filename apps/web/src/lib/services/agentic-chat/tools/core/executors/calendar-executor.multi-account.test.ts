import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

const mocks = vi.hoisted(() => ({
	listEvents: vi.fn(),
	multiCalendarAllowed: vi.fn()
}));

vi.mock('$lib/server/google-calendar-feature', () => ({
	isMultiCalendarUserAllowed: mocks.multiCalendarAllowed
}));

vi.mock('$lib/server/google-calendar-read.service', () => ({
	GoogleCalendarReadService: class {
		listEvents = mocks.listEvents;
	}
}));

import { CalendarExecutor } from './calendar-executor';

function emptyQuery() {
	const query: any = {};
	for (const method of ['select', 'eq', 'is', 'in', 'order', 'limit', 'gte', 'lte']) {
		query[method] = vi.fn(() => query);
	}
	query.then = (resolve: (value: unknown) => unknown) =>
		Promise.resolve({ data: [], error: null }).then(resolve);
	return query;
}

describe('CalendarExecutor multi-account reads', () => {
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
				partial: false
			});
			expect(result.events).toEqual([
				expect.objectContaining({ source: 'google', external_event_id: 'provider-event-1' })
			]);
		}
	);
});
