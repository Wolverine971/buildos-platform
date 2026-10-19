// apps/web/src/lib/services/calendar-service.move.test.ts
import { describe, expect, it, vi } from 'vitest';
import { google } from 'googleapis';
import { CalendarService } from './calendar-service';

vi.mock('googleapis', () => ({ google: { calendar: vi.fn() } }));

function setup() {
	const query = {
		update: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		select: vi.fn().mockReturnThis(),
		maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
		single: vi.fn().mockResolvedValue({ data: null, error: null }),
		then: (resolve: (value: unknown) => unknown) =>
			Promise.resolve({ data: null, error: null }).then(resolve)
	};
	const service = new CalendarService({ from: vi.fn(() => query) } as any);
	(service as any).oAuthService = { getAuthenticatedClient: vi.fn().mockResolvedValue({}) };
	const event = {
		id: 'meeting',
		start: { dateTime: '2026-11-03T14:00:00Z' },
		end: { dateTime: '2026-11-03T15:00:00Z' }
	};
	const api = {
		events: {
			get: vi.fn().mockResolvedValue({ data: event }),
			update: vi.fn().mockResolvedValue({ data: event })
		}
	};
	vi.mocked(google.calendar).mockReturnValue(api as never);
	return { service, api, query };
}

describe('CalendarService start-only moves', () => {
	it('keeps the duration in Google and the local tracking row', async () => {
		const { service, api, query } = setup();
		await service.updateCalendarEvent('user1', {
			event_id: 'meeting',
			start_time: '2026-11-03T14:30:00Z'
		});
		expect(api.events.update).toHaveBeenCalledWith(
			expect.objectContaining({
				requestBody: expect.objectContaining({
					start: expect.objectContaining({ dateTime: '2026-11-03T14:30:00.000Z' }),
					end: expect.objectContaining({ dateTime: '2026-11-03T15:30:00.000Z' })
				})
			})
		);
		expect(query.update).toHaveBeenCalledWith(
			expect.objectContaining({ event_end: '2026-11-03T15:30:00.000Z' })
		);
	});
	it('keeps an explicitly supplied end', async () => {
		const { service, api } = setup();
		await service.updateCalendarEvent('user1', {
			event_id: 'meeting',
			start_time: '2026-11-03T14:30:00Z',
			end_time: '2026-11-03T17:00:00Z'
		});
		expect(api.events.update).toHaveBeenCalledWith(
			expect.objectContaining({
				requestBody: expect.objectContaining({
					end: expect.objectContaining({ dateTime: '2026-11-03T17:00:00.000Z' })
				})
			})
		);
	});
});
