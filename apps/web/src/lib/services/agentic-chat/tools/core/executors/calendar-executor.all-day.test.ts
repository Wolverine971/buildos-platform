// apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.all-day.test.ts
import { describe, expect, it, vi } from 'vitest';
import { CalendarExecutor } from './calendar-executor';

const eventId = '33333333-3333-4333-8333-333333333333';

function setup(allDay = false) {
	const supabase = {} as any;
	const createEvent = vi.fn().mockResolvedValue({ event: { id: eventId } });
	const updateEvent = vi.fn().mockResolvedValue({ id: eventId });
	const executor = new CalendarExecutor({
		supabase,
		userId: 'user-1',
		sessionId: 'session-1',
		getActorId: async () => '11111111-1111-4111-8111-111111111111',
		getAdminSupabase: () => supabase
	} as any);
	(executor as any).resolveInputTimezone = async () => 'America/New_York';
	(executor as any).eventSyncService = {
		createEvent,
		updateEvent,
		getEvent: vi.fn().mockResolvedValue({
			id: eventId,
			all_day: allDay,
			start_at: '2026-10-31T04:00:00.000Z',
			end_at: '2026-11-02T05:00:00.000Z',
			timezone: 'America/New_York',
			owner_entity_type: 'actor'
		})
	};
	return { executor, createEvent, updateEvent };
}

describe('CalendarExecutor all-day events', () => {
	it.each(['2026-11-04', '2026-11-03', undefined])(
		'creates one all-day event with exclusive end from %s',
		async (endAt) => {
			const { executor, createEvent } = setup();
			await executor.createCalendarEvent({
				title: 'Birthday',
				start_at: '2026-11-03',
				end_at: endAt,
				all_day: true
			} as any);
			expect(createEvent).toHaveBeenCalledWith(
				'user-1',
				expect.objectContaining({
					allDay: true,
					startAt: '2026-11-03',
					endAt: '2026-11-04'
				})
			);
		}
	);

	it('defaults date-only creates to all-day', async () => {
		const { executor, createEvent } = setup();
		await executor.createCalendarEvent({ title: 'Birthday', start_at: '2026-11-03' });
		expect(createEvent).toHaveBeenCalledWith(
			'user-1',
			expect.objectContaining({
				allDay: true,
				startAt: '2026-11-03',
				endAt: '2026-11-04'
			})
		);
	});

	it('passes all-day update bounds without turning the end into the end of that day', async () => {
		const { executor, updateEvent } = setup();
		await executor.updateCalendarEvent({
			onto_event_id: eventId,
			start_at: '2026-11-03',
			end_at: '2026-11-04',
			all_day: true
		} as any);
		expect(updateEvent).toHaveBeenCalledWith(
			'user-1',
			expect.objectContaining({
				allDay: true,
				startAt: '2026-11-03',
				endAt: '2026-11-04'
			})
		);
	});

	it('preserves an existing all-day flag and lets shared sync move its calendar-day span', async () => {
		const { executor, updateEvent } = setup(true);
		await executor.updateCalendarEvent({ onto_event_id: eventId, start_at: '2026-11-07' });
		expect(updateEvent).toHaveBeenCalledWith(
			'user-1',
			expect.objectContaining({
				allDay: true,
				startAt: '2026-11-07',
				endAt: undefined
			})
		);
	});

	it('requires both bounds when changing all_day', async () => {
		const { executor, updateEvent } = setup();
		await expect(
			executor.updateCalendarEvent({
				onto_event_id: eventId,
				all_day: true,
				start_at: '2026-11-03'
			} as any)
		).rejects.toThrow('Changing all_day requires both start_at and end_at');
		expect(updateEvent).not.toHaveBeenCalled();
	});

	it('rejects all_day for Google-only updates instead of silently ignoring it', async () => {
		const { executor } = setup();
		await expect(
			executor.updateCalendarEvent({ event_id: 'google-id', all_day: true } as any)
		).rejects.toThrow('all_day updates require onto_event_id');
	});

	it('keeps an explicit false flag timed', async () => {
		const { executor, createEvent } = setup();
		await executor.createCalendarEvent({
			title: 'Timed',
			start_at: '2026-11-03',
			all_day: false
		} as any);
		expect(createEvent).toHaveBeenCalledWith(
			'user-1',
			expect.objectContaining({
				allDay: false,
				startAt: '2026-11-03T05:00:00.000Z'
			})
		);
	});
});
