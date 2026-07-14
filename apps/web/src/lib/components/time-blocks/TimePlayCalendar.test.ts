// apps/web/src/lib/components/time-blocks/TimePlayCalendar.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarEvent } from '$lib/services/calendar-service';
import TimePlayCalendarHarness from './TimePlayCalendar.test-harness.svelte';

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock('$lib/stores/toast.store', () => ({
	toastService: { error: toastError }
}));

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
}

interface PendingRequest {
	endpoint: 'events' | 'task-events';
	timeMin: string;
	signal: AbortSignal | undefined;
	response: Deferred<Response>;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

function calendarEvent(day: Date, id: string, summary: string): CalendarEvent {
	const start = new Date(day);
	start.setHours(9, 0, 0, 0);
	const end = new Date(day);
	end.setHours(10, 0, 0, 0);

	return {
		kind: 'calendar#event',
		etag: `etag-${id}`,
		id,
		status: 'confirmed',
		htmlLink: `https://calendar.test/${id}`,
		created: start.toISOString(),
		updated: start.toISOString(),
		summary,
		creator: { email: 'creator@example.com' },
		organizer: { email: 'organizer@example.com' },
		start: { dateTime: start.toISOString() },
		end: { dateTime: end.toISOString() },
		iCalUID: `${id}@example.com`,
		sequence: 0
	};
}

function successResponse<T>(data: T): Response {
	return new Response(JSON.stringify({ success: true, data }), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
}

function rangeStart(day: Date): string {
	const start = new Date(day);
	start.setHours(0, 0, 0, 0);
	return start.toISOString();
}

describe('TimePlayCalendar event loading', () => {
	let pendingRequests: PendingRequest[];

	beforeEach(() => {
		pendingRequests = [];
		vi.stubGlobal(
			'fetch',
			vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
				const url = new URL(String(input), 'http://localhost');
				const response = deferred<Response>();
				pendingRequests.push({
					endpoint: url.pathname.endsWith('/task-events') ? 'task-events' : 'events',
					timeMin: url.searchParams.get('timeMin') ?? '',
					signal: init?.signal ?? undefined,
					response
				});
				return response.promise;
			})
		);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	function requestsFor(day: Date): PendingRequest[] {
		return pendingRequests.filter((request) => request.timeMin === rangeStart(day));
	}

	function resolveRange(day: Date, events: CalendarEvent[]) {
		const requests = requestsFor(day);
		expect(requests).toHaveLength(2);
		for (const request of requests) {
			request.response.resolve(
				request.endpoint === 'events'
					? successResponse({ events })
					: successResponse({ calendar_event_ids: [] })
			);
		}
	}

	it('keeps the latest range when an aborted transport resolves the old range last', async () => {
		const firstDay = new Date(2026, 6, 13);
		const latestDay = new Date(2026, 6, 14);
		const view = render(TimePlayCalendarHarness, {
			props: { days: [firstDay], isCalendarConnected: true }
		});

		await waitFor(() => expect(requestsFor(firstDay)).toHaveLength(2));
		await view.rerender({ days: [latestDay], isCalendarConnected: true });
		await waitFor(() => expect(requestsFor(latestDay)).toHaveLength(2));
		expect(requestsFor(firstDay).every((request) => request.signal?.aborted)).toBe(true);

		resolveRange(latestDay, [calendarEvent(latestDay, 'latest', 'Latest range')]);
		await waitFor(() =>
			expect(screen.getByTestId('calendar-events-output')).toHaveTextContent('Latest range')
		);

		// Simulate a transport that ignores abort and resolves its obsolete requests late.
		resolveRange(firstDay, [calendarEvent(firstDay, 'obsolete', 'Obsolete range')]);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));

		expect(screen.getByTestId('calendar-events-output')).toHaveTextContent('Latest range');
		expect(screen.getByTestId('calendar-events-output')).not.toHaveTextContent(
			'Obsolete range'
		);
		expect(toastError).not.toHaveBeenCalled();
	});

	it('clears bound events on disconnect and ignores a late failed request', async () => {
		const firstDay = new Date(2026, 6, 13);
		const pendingDay = new Date(2026, 6, 14);
		const view = render(TimePlayCalendarHarness, {
			props: { days: [firstDay], isCalendarConnected: true }
		});

		await waitFor(() => expect(requestsFor(firstDay)).toHaveLength(2));
		resolveRange(firstDay, [calendarEvent(firstDay, 'initial', 'Initial range')]);
		await waitFor(() =>
			expect(screen.getByTestId('calendar-events-output')).toHaveTextContent('Initial range')
		);

		await view.rerender({ days: [pendingDay], isCalendarConnected: true });
		await waitFor(() => expect(requestsFor(pendingDay)).toHaveLength(2));
		const obsoleteRequests = requestsFor(pendingDay);

		await view.rerender({ days: [pendingDay], isCalendarConnected: false });
		await waitFor(() =>
			expect(screen.getByTestId('calendar-events-output')).toHaveTextContent(/^\s*$/)
		);
		expect(obsoleteRequests.every((request) => request.signal?.aborted)).toBe(true);

		for (const request of obsoleteRequests) {
			request.response.resolve(
				request.endpoint === 'events'
					? new Response(JSON.stringify({ success: false, error: 'Late failure' }), {
							status: 500,
							headers: { 'content-type': 'application/json' }
						})
					: successResponse({ calendar_event_ids: [] })
			);
		}
		await new Promise<void>((resolve) => setTimeout(resolve, 0));

		expect(screen.getByTestId('calendar-events-output')).toHaveTextContent(/^\s*$/);
		expect(toastError).not.toHaveBeenCalled();
	});

	it('clears bound events when the date range becomes empty', async () => {
		const day = new Date(2026, 6, 13);
		const view = render(TimePlayCalendarHarness, {
			props: { days: [day], isCalendarConnected: true }
		});

		await waitFor(() => expect(requestsFor(day)).toHaveLength(2));
		resolveRange(day, [calendarEvent(day, 'initial', 'Initial range')]);
		await waitFor(() =>
			expect(screen.getByTestId('calendar-events-output')).toHaveTextContent('Initial range')
		);

		await view.rerender({ days: [], isCalendarConnected: true });
		await waitFor(() =>
			expect(screen.getByTestId('calendar-events-output')).toHaveTextContent(/^\s*$/)
		);
	});

	it('filters with the latest blocks without refetching when the collection changes', async () => {
		const day = new Date(2026, 6, 13);
		render(TimePlayCalendarHarness, {
			props: { days: [day], isCalendarConnected: true }
		});

		await waitFor(() => expect(requestsFor(day)).toHaveLength(2));
		await fireEvent.click(screen.getByTestId('replace-blocks'));
		expect(requestsFor(day)).toHaveLength(2);

		resolveRange(day, [
			calendarEvent(day, 'buildos-event', 'BuildOS event'),
			calendarEvent(day, 'external-event', 'External event')
		]);
		await waitFor(() =>
			expect(screen.getByTestId('calendar-events-output')).toHaveTextContent('External event')
		);

		expect(screen.getByTestId('calendar-events-output')).not.toHaveTextContent('BuildOS event');
	});
});
