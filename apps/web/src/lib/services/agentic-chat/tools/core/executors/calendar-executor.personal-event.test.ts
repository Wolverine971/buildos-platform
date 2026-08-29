import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { CalendarExecutor } from './calendar-executor';

describe('CalendarExecutor personal event ownership', () => {
	it('creates a projectless user-scope event owned and created by the authenticated actor', async () => {
		const supabase = {} as SupabaseClient<Database>;
		const createEvent = vi.fn().mockResolvedValue({
			event: { id: '33333333-3333-4333-8333-333333333333' }
		});
		const executor = new CalendarExecutor({
			supabase,
			userId: 'user-1',
			sessionId: 'session-1',
			fetchFn: vi.fn() as unknown as typeof fetch,
			getActorId: async () => '11111111-1111-4111-8111-111111111111',
			getAdminSupabase: () => supabase as any,
			getAuthHeaders: async () => ({})
		});

		(executor as any).resolveInputTimezone = async () => 'America/New_York';
		(executor as any).eventSyncService = { createEvent };

		await executor.createCalendarEvent({
			title: 'Personal calendar smoke',
			start_at: '2026-08-31T14:00:00-04:00',
			end_at: '2026-08-31T14:30:00-04:00',
			timezone: 'America/New_York',
			calendar_scope: 'user',
			calendar_id: 'primary',
			sync_to_calendar: true
		});

		expect(createEvent).toHaveBeenCalledOnce();
		expect(createEvent).toHaveBeenCalledWith(
			'user-1',
			expect.objectContaining({
				projectId: null,
				owner: {
					type: 'actor',
					id: '11111111-1111-4111-8111-111111111111'
				},
				createdBy: '11111111-1111-4111-8111-111111111111',
				calendarScope: 'user',
				calendarId: 'primary',
				syncToCalendar: true
			})
		);
	});
});
