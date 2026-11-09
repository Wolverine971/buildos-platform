// apps/web/src/lib/services/calendar-webhook-recovery.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { calendar_v3 } from 'googleapis';
import { CalendarWebhookService } from './calendar-webhook-service';

vi.mock('@buildos/shared-agent-ops/calendar/calendar-change-ingest', () => ({
	ingestProjectCalendarChanges: vi.fn().mockResolvedValue({ notProjectCalendar: true })
}));

const USER_ID = '00000000-0000-4000-8000-000000000001';
const SOURCE_ID = '00000000-0000-4000-8000-000000000002';
const CREATED_AT = '2026-01-01T00:00:00.000Z';

function setup(
	options: { failedEventId?: string; syncToken?: string | null; mappedEventIds?: string[] } = {}
) {
	const requests: Array<{ url: URL; method: string; body: any }> = [];
	// Use the real PostgREST URL builder with an offline transport. Reject requests
	// over 8 KB, reproducing the plain-text 400 returned by the production proxy.
	const database = createClient('https://calendar.test', 'test-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const url = new URL(String(input));
				const method = init?.method ?? 'GET';
				const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
				requests.push({ url, method, body });
				const table = url.pathname.split('/').pop();
				const ids = url.searchParams.get('calendar_event_id');
				if (
					url.href.length > 8000 ||
					(options.failedEventId && ids?.includes(options.failedEventId))
				) {
					return new Response('Bad Request', { status: 400 });
				}
				let data: unknown = [];
				if (method === 'GET' && table === 'calendar_webhook_channels') {
					data = {
						user_id: USER_ID,
						calendar_id: 'primary',
						calendar_source_id: SOURCE_ID,
						expiration: Date.now() + 86_400_000,
						sync_token:
							options.syncToken === undefined ? 'old-token' : options.syncToken,
						webhook_token: 'channel-secret'
					};
				} else if (table === 'users') {
					data = { created_at: CREATED_AT, timezone: 'UTC' };
				} else if (method === 'GET' && table === 'time_blocks') {
					const queriedIds = ids?.slice(4, -1).split(',') ?? [];
					data = (options.mappedEventIds ?? [])
						.filter((id) => queriedIds.includes(id))
						.map((id) => ({
							id: `block-${id}`,
							calendar_event_id: id,
							user_id: USER_ID,
							sync_source: 'google',
							start_time: '2026-11-08T12:00:00Z',
							end_time: '2026-11-08T13:00:00Z'
						}));
				}
				return new Response(JSON.stringify(data), {
					headers: { 'Content-Type': 'application/json' }
				});
			}
		}
	});
	const list = vi.fn<
		(params: calendar_v3.Params$Resource$Events$List) => Promise<{
			data: calendar_v3.Schema$Events;
		}>
	>();
	const service = new CalendarWebhookService(database, {
		connectionService: { getAuthenticatedClient: vi.fn().mockResolvedValue({}) },
		targetService: {
			resolveExplicitSource: vi.fn().mockResolvedValue({
				connectionId: 'connection',
				calendarSourceId: SOURCE_ID,
				providerCalendarId: 'primary'
			})
		},
		createCalendarApi: () => ({ events: { list }, channels: {} }) as any
	});
	return {
		list,
		requests,
		notify: () =>
			service.handleWebhookNotification('channel', 'resource', 'channel-secret', {
				'x-goog-resource-state': 'exists'
			}),
		savedTokens: () =>
			requests
				.filter((request) => request.method === 'PATCH' && request.body?.sync_token)
				.map((request) => request.body.sync_token)
	};
}

describe('calendar webhook recovery', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});
	afterEach(() => vi.restoreAllMocks());

	it('keeps the sync token on every delta page and saves only the final cursor', async () => {
		const fixture = setup();
		fixture.list.mockImplementation(async (params) => {
			expect(fixture.savedTokens()).toEqual([]);
			expect(params.syncToken).toBe('old-token');
			expect(params).not.toHaveProperty('timeMin');
			return {
				data: params.pageToken
					? { items: [], nextSyncToken: 'new-token' }
					: { items: [], nextPageToken: 'page-2' }
			};
		});
		await expect(fixture.notify()).resolves.toMatchObject({ success: true });
		expect(fixture.list).toHaveBeenCalledTimes(2);
		expect(fixture.list.mock.calls[1]![0].pageToken).toBe('page-2');
		expect(fixture.savedTokens()).toEqual(['new-token']);
	});

	it('keeps timeMin on every page of a fresh listing', async () => {
		const fixture = setup({ syncToken: null });
		fixture.list
			.mockResolvedValueOnce({ data: { items: [], nextPageToken: 'page-2' } })
			.mockResolvedValueOnce({ data: { items: [], nextSyncToken: 'new-token' } });
		await expect(fixture.notify()).resolves.toMatchObject({ success: true });
		for (const [params] of fixture.list.mock.calls) {
			expect(params.timeMin).toBe(CREATED_AT);
			expect(params).not.toHaveProperty('syncToken');
		}
		expect(fixture.savedTokens()).toEqual(['new-token']);
	});

	it('recovers a 410 without expanding recurring series or logging a provider failure', async () => {
		const fixture = setup();
		fixture.list
			.mockRejectedValueOnce({ code: 410, message: 'Sync token is no longer valid' })
			.mockResolvedValueOnce({ data: { items: [], nextPageToken: 'resync-page-2' } })
			.mockResolvedValueOnce({ data: { items: [], nextSyncToken: 'recovered-token' } });
		await expect(fixture.notify()).resolves.toMatchObject({ success: true });
		for (const [params] of fixture.list.mock.calls.slice(1)) {
			expect(params).toMatchObject({ singleEvents: false, timeMin: CREATED_AT });
			expect(params).not.toHaveProperty('orderBy');
			expect(params).not.toHaveProperty('syncToken');
		}
		expect(fixture.savedTokens()).toEqual(['recovered-token']);
		expect(console.error).not.toHaveBeenCalled();
		expect(
			fixture.requests.filter((request) => request.url.pathname.endsWith('/error_logs'))
		).toEqual([]);
	});

	it('applies linked changes from different batches and combines their processed counts', async () => {
		const fixture = setup({ mappedEventIds: ['event5', 'event205'] });
		const events = Array.from({ length: 230 }, (_, index) => ({
			id: `event${index}`,
			start: { dateTime: '2026-11-08T14:00:00Z' },
			end: { dateTime: '2026-11-08T15:00:00Z' }
		}));
		fixture.list.mockResolvedValueOnce({ data: { items: events, nextSyncToken: 'new-token' } });
		await expect(fixture.notify()).resolves.toEqual({ success: true, processed: 2 });
		const updates = fixture.requests.filter(
			(request) => request.method === 'PATCH' && request.url.pathname.endsWith('/time_blocks')
		);
		expect(updates.map(({ url }) => url.searchParams.get('id'))).toEqual([
			'eq.block-event5',
			'eq.block-event205'
		]);
		expect(fixture.savedTokens()).toEqual(['new-token']);
	});

	it.each([false, true])(
		'bounds lookup URLs for large calendars (long IDs: %s)',
		async (longIds) => {
			const fixture = setup();
			const events = Array.from({ length: 1200 }, (_, index) => ({
				id: `${'a'.repeat(longIds ? 1000 : 25)}${index.toString().padStart(4, '0')}`
			}));
			fixture.list.mockRejectedValueOnce({ code: 410 }).mockResolvedValueOnce({
				data: { items: events, nextSyncToken: 'recovered-token' }
			});
			await expect(fixture.notify()).resolves.toMatchObject({ success: true });
			for (const table of ['task_calendar_events', 'time_blocks']) {
				const lookups = fixture.requests.filter((request) =>
					request.url.pathname.endsWith(`/${table}`)
				);
				expect(lookups.length).toBeGreaterThan(1);
				const queriedIds: string[] = [];
				for (const { url } of lookups) {
					expect(url.href.length).toBeLessThan(8000);
					expect(url.searchParams.get('user_id')).toBe(`eq.${USER_ID}`);
					expect(url.searchParams.get('calendar_source_id')).toBe(`eq.${SOURCE_ID}`);
					queriedIds.push(
						...url.searchParams.get('calendar_event_id')!.slice(4, -1).split(',')
					);
				}
				expect(queriedIds).toEqual(events.map((event) => event.id));
			}
			expect(fixture.savedTokens()).toEqual(['recovered-token']);
		}
	);

	it.each([false, true])(
		'does not advance the cursor when a later batch fails (resync: %s)',
		async (resync) => {
			const events = Array.from({ length: 230 }, (_, index) => ({ id: `event${index}` }));
			const fixture = setup({ failedEventId: 'event150' });
			if (resync) fixture.list.mockRejectedValueOnce({ code: 410 });
			fixture.list.mockResolvedValueOnce({
				data: { items: events, nextSyncToken: 'new-token' }
			});
			await fixture.notify();
			expect(fixture.savedTokens()).toEqual([]);
			expect(console.error).toHaveBeenCalledWith(
				'[BATCH_PROCESS] Error fetching task events:',
				expect.objectContaining({ message: 'Bad Request' })
			);
		}
	);

	it('reports provider errors other than token expiration', async () => {
		const fixture = setup();
		fixture.list.mockRejectedValueOnce({ code: 400, message: 'Invalid query' });
		await expect(fixture.notify()).resolves.toMatchObject({ success: false });
		expect(fixture.list).toHaveBeenCalledOnce();
		expect(fixture.savedTokens()).toEqual([]);
		expect(console.error).toHaveBeenCalledWith(
			'[SYNC] Error in request #1:',
			expect.objectContaining({ code: 400 })
		);
	});
});
