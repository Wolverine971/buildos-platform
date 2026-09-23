// apps/web/src/lib/services/dashboard-calendar-cache.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarItem, DashboardCalendarMeta } from '$lib/types/calendar-items';

vi.mock('$app/environment', () => ({ browser: true }));

type CacheModule = typeof import('./dashboard-calendar-cache');

const meta: DashboardCalendarMeta = {
	preferences: {
		show_events: true,
		show_task_scheduled: true,
		show_task_start: false,
		show_task_due: true
	},
	connections: null,
	connectionsError: false
};

function item(id: string, startAt: string): CalendarItem {
	return {
		calendar_item_id: id,
		item_type: 'task',
		item_kind: 'due',
		source_table: 'onto_tasks',
		title: `Due: ${id}`,
		start_at: startAt,
		end_at: startAt,
		all_day: false,
		timezone: null,
		project_id: 'project-1',
		owner_entity_type: null,
		owner_entity_id: null,
		task_id: id,
		event_id: null,
		state_key: 'todo',
		type_key: null,
		props: null,
		created_at: startAt,
		updated_at: startAt
	};
}

function jsonResponse(data: unknown): Response {
	return new Response(JSON.stringify({ success: true, data }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => (resolve = res));
	return { promise, resolve };
}

const SEPT = new Date(2026, 8, 22, 12);

describe('dashboard calendar cache', () => {
	let cache: CacheModule;
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		vi.resetModules();
		localStorage.clear();
		fetchMock = vi.fn(async (url: string) => {
			const params = new URL(url, 'http://localhost').searchParams;
			return jsonResponse({
				items: [item('task-1', '2026-09-23T15:00:00.000Z')],
				...(params.get('meta') === '1' ? { meta } : {})
			});
		});
		vi.stubGlobal('fetch', fetchMock);
		cache = await import('./dashboard-calendar-cache');
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('paints the current and neighbouring months from one request', async () => {
		expect(cache.peekDashboardCalendarItems(SEPT, 'month')).toBeNull();

		await cache.loadDashboardCalendar(SEPT, 'month');

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/calendar/dashboard?');
		expect(String(fetchMock.mock.calls[0]?.[0])).toContain('meta=1');
		expect(cache.peekDashboardCalendarMeta()).toEqual(meta);

		const current = cache.peekDashboardCalendarItems(SEPT, 'month');
		expect(current).toMatchObject({ fresh: true, neighborsCached: true });
		expect(current?.items).toHaveLength(1);

		// Flipping a month either way is served from the same window.
		expect(cache.peekDashboardCalendarItems(new Date(2026, 7, 15), 'month')).not.toBeNull();
		expect(cache.peekDashboardCalendarItems(new Date(2026, 9, 15), 'month')).not.toBeNull();
		expect(
			cache.peekDashboardCalendarItems(new Date(2026, 9, 15), 'month')?.neighborsCached
		).toBe(false);
	});

	it('shares an in-flight request and skips meta once it is fresh', async () => {
		const first = cache.loadDashboardCalendar(SEPT, 'month');
		const second = cache.loadDashboardCalendar(SEPT, 'month');
		expect(second).toBe(first);
		await first;
		expect(fetchMock).toHaveBeenCalledTimes(1);

		await cache.loadDashboardCalendar(new Date(2026, 9, 15), 'month');
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(String(fetchMock.mock.calls[1]?.[0])).toContain('meta=0');
	});

	it('starts a new request when forced', async () => {
		const first = cache.loadDashboardCalendar(SEPT, 'month');
		const forced = cache.loadDashboardCalendar(SEPT, 'month', { force: true });
		expect(forced).not.toBe(first);
		await Promise.all([first, forced]);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('does not cache a response that started before an invalidation', async () => {
		const pending = deferred<Response>();
		fetchMock.mockImplementationOnce(() => pending.promise);

		const request = cache.loadDashboardCalendar(SEPT, 'month');
		cache.invalidateDashboardCalendar({ meta: true });
		pending.resolve(jsonResponse({ items: [item('stale', '2026-09-23T15:00:00.000Z')], meta }));
		await request;

		expect(cache.peekDashboardCalendarItems(SEPT, 'month')).toBeNull();
		expect(cache.peekDashboardCalendarMeta()).toBeNull();
	});

	it('keeps a toggle flipped in this tab over later server meta', async () => {
		await cache.loadDashboardCalendar(SEPT, 'month');
		const flipped = { ...meta.preferences, show_task_due: false };
		cache.updateDashboardCalendarPreferences(flipped);
		expect(cache.peekDashboardCalendarMeta()?.preferences).toEqual(flipped);

		const refreshed = await cache.loadDashboardCalendar(SEPT, 'month', { force: true });
		expect(refreshed.meta?.preferences).toEqual(flipped);
		expect(cache.peekDashboardCalendarMeta()?.preferences).toEqual(flipped);
	});

	it('prefetches the saved view and the Google read when calendars were connected', async () => {
		localStorage.setItem(
			'dashboard_calendar_state_v3',
			JSON.stringify({
				viewMode: 'week',
				hiddenCalendarSourceIds: [],
				hasConnectedSources: true
			})
		);

		cache.prefetchDashboardCalendar();
		cache.prefetchDashboardCalendar();

		const urls = fetchMock.mock.calls.map((call) => String(call[0]));
		expect(urls.filter((url) => url.startsWith('/api/calendar/dashboard?'))).toHaveLength(1);
		expect(urls.filter((url) => url.startsWith('/api/calendar/events?'))).toHaveLength(1);
	});

	it('restores view state defensively', () => {
		localStorage.setItem('dashboard_calendar_state_v3', '{not json');
		expect(cache.readSavedDashboardCalendarState()).toEqual({
			viewMode: 'month',
			hiddenCalendarSourceIds: [],
			hasConnectedSources: false
		});

		cache.saveDashboardCalendarState({ viewMode: 'day', hiddenCalendarSourceIds: ['a'] });
		expect(cache.readSavedDashboardCalendarState()).toMatchObject({
			viewMode: 'day',
			hiddenCalendarSourceIds: ['a']
		});
	});
});
