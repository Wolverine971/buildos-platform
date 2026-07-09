// apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.event-id-routing.test.ts
/**
 * Event-id routing between ontology and Google lookups.
 *
 * Production telemetry (speed audit 2026-07-08) showed models passing the Google
 * event id from list_calendar_events' external_event_id as onto_event_id, which
 * failed UUID validation 5/5 times and burned tool rounds on blind retries.
 * Reads now route a non-UUID onto_event_id to the Google lookup; mutations stay
 * strict but return a corrective error naming the right field.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { CalendarExecutor } from './calendar-executor';

const ONTO_EVENT_UUID = '33333333-3333-4333-8333-333333333333';
const GOOGLE_EVENT_ID = 'd1i1mtjng24b62lai4gqoohpqc';

describe('CalendarExecutor event-id routing', () => {
	let getEventSpy: ReturnType<typeof vi.fn>;
	let getCalendarEventSpy: ReturnType<typeof vi.fn>;

	const buildExecutor = () => {
		const mockSupabase = {
			from: vi.fn(),
			rpc: vi.fn().mockResolvedValue({ data: 'actor-1', error: null })
		} as unknown as SupabaseClient<Database>;
		const executor = new CalendarExecutor({
			supabase: mockSupabase,
			userId: 'user-1',
			sessionId: 'session-1',
			fetchFn: vi.fn() as unknown as typeof fetch,
			getActorId: async () => 'actor-1',
			getAdminSupabase: () => mockSupabase as any,
			getAuthHeaders: async () => ({})
		});
		getEventSpy = vi.fn().mockResolvedValue({ id: ONTO_EVENT_UUID, title: 'Onto event' });
		getCalendarEventSpy = vi.fn().mockResolvedValue({ id: GOOGLE_EVENT_ID, summary: 'Google event' });
		(executor as any).eventSyncService = { getEvent: getEventSpy };
		(executor as any).calendarService = { getCalendarEvent: getCalendarEventSpy };
		(executor as any).resolveCalendarIdForScope = async () => 'primary';
		return executor;
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('routes a UUID onto_event_id to the ontology lookup', async () => {
		const executor = buildExecutor();

		const result: any = await executor.getCalendarEventDetails({
			onto_event_id: ONTO_EVENT_UUID
		});

		expect(result.source).toBe('ontology');
		expect(getEventSpy).toHaveBeenCalledWith(ONTO_EVENT_UUID, 'user-1');
		expect(getCalendarEventSpy).not.toHaveBeenCalled();
	});

	it('routes a non-UUID onto_event_id to the Google lookup instead of throwing', async () => {
		const executor = buildExecutor();

		const result: any = await executor.getCalendarEventDetails({
			onto_event_id: GOOGLE_EVENT_ID
		});

		expect(result.source).toBe('google');
		expect(getEventSpy).not.toHaveBeenCalled();
		expect(getCalendarEventSpy).toHaveBeenCalledWith('user-1', {
			event_id: GOOGLE_EVENT_ID,
			calendar_id: 'primary'
		});
	});

	it('prefers an explicit event_id over a non-UUID onto_event_id', async () => {
		const executor = buildExecutor();

		await executor.getCalendarEventDetails({
			onto_event_id: GOOGLE_EVENT_ID,
			event_id: 'explicit-google-id'
		});

		expect(getCalendarEventSpy).toHaveBeenCalledWith('user-1', {
			event_id: 'explicit-google-id',
			calendar_id: 'primary'
		});
	});

	it('throws an actionable error when no id is provided', async () => {
		const executor = buildExecutor();

		await expect(executor.getCalendarEventDetails({})).rejects.toThrow(
			/onto_event_id.*list_calendar_events.*event_id/
		);
	});

	it('update rejects a non-UUID onto_event_id with a corrective error', async () => {
		const executor = buildExecutor();

		await expect(
			executor.updateCalendarEvent({ onto_event_id: GOOGLE_EVENT_ID, title: 'New title' })
		).rejects.toThrow(/looks like a Google Calendar event id.*pass it as event_id/);
		expect(getEventSpy).not.toHaveBeenCalled();
	});

	it('delete rejects a non-UUID onto_event_id with a corrective error', async () => {
		const executor = buildExecutor();

		await expect(
			executor.deleteCalendarEvent({ onto_event_id: GOOGLE_EVENT_ID })
		).rejects.toThrow(/looks like a Google Calendar event id.*pass it as event_id/);
	});
});
