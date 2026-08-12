// apps/web/src/routes/api/calendar/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	legacyUpdateMock,
	legacyDeleteMock,
	writeCreateMock,
	writeUpdateMock,
	writeDeleteMock,
	createAdminMock
} = vi.hoisted(() => ({
	legacyUpdateMock: vi.fn(),
	legacyDeleteMock: vi.fn(),
	writeCreateMock: vi.fn(),
	writeUpdateMock: vi.fn(),
	writeDeleteMock: vi.fn(),
	createAdminMock: vi.fn(() => ({}))
}));

vi.mock('$env/dynamic/private', () => ({
	env: {
		PRIVATE_MULTI_CALENDAR_CONNECTIONS_ENABLED: 'true',
		PRIVATE_MULTI_CALENDAR_CONNECTIONS_USER_IDS: 'user-1'
	}
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminMock
}));

vi.mock('$lib/services/calendar-service', () => ({
	CalendarService: vi.fn().mockImplementation(() => ({
		updateCalendarEvent: legacyUpdateMock,
		deleteCalendarEvent: legacyDeleteMock
	}))
}));

vi.mock('$lib/server/google-calendar-read.service', () => ({
	GoogleCalendarReadService: vi.fn()
}));

vi.mock('$lib/server/google-calendar-write.service', async (importOriginal) => {
	const original =
		await importOriginal<typeof import('$lib/server/google-calendar-write.service')>();
	return {
		...original,
		GoogleCalendarWriteService: vi.fn().mockImplementation(() => ({
			createEvent: writeCreateMock,
			updateEvent: writeUpdateMock,
			deleteEvent: writeDeleteMock
		}))
	};
});

import { POST } from './+server';

function eventFor(body: Record<string, unknown>, supabase: Record<string, unknown> = {}) {
	return {
		request: new Request('http://localhost/api/calendar', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		}),
		locals: {
			supabase,
			safeGetSession: vi.fn().mockResolvedValue({
				session: { user: { id: 'user-1' } },
				user: { id: 'user-1' }
			})
		}
	} as any;
}

describe('multi-account /api/calendar mutations', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('routes an update through the exact calendar source on the canary path', async () => {
		writeUpdateMock.mockResolvedValue({
			calendarSourceId: 'ca300000-0000-4000-8000-000000000001',
			connectionId: 'connection-a',
			providerCalendarId: 'work@example.com',
			providerEventId: 'provider-event-1',
			event: {
				id: 'provider-event-1',
				summary: 'Updated',
				htmlLink: 'https://calendar.google.com/event?eid=one'
			}
		});

		const response = await POST(
			eventFor({
				method: 'updateCalendarEvent',
				params: {
					event_id: 'provider-event-1',
					calendarSourceId: 'ca300000-0000-4000-8000-000000000001',
					summary: 'Updated'
				}
			})
		);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(writeUpdateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'user-1',
				providerEventId: 'provider-event-1',
				selector: expect.objectContaining({
					calendarSourceId: 'ca300000-0000-4000-8000-000000000001'
				}),
				requestBody: expect.objectContaining({ summary: 'Updated' })
			})
		);
		expect(legacyUpdateMock).not.toHaveBeenCalled();
		expect(payload.data).toMatchObject({
			success: true,
			calendarSourceId: 'ca300000-0000-4000-8000-000000000001',
			providerCalendarId: 'work@example.com'
		});
	});

	it('keeps idempotent source-aware delete results compatible with the legacy response', async () => {
		writeDeleteMock.mockResolvedValue({
			deleted: true,
			alreadyMissing: true,
			calendarSourceId: 'ca300000-0000-4000-8000-000000000001',
			connectionId: 'connection-a',
			providerCalendarId: 'work@example.com',
			providerEventId: 'provider-event-1'
		});

		const response = await POST(
			eventFor({
				method: 'deleteCalendarEvent',
				params: {
					event_id: 'provider-event-1',
					calendarSourceId: 'ca300000-0000-4000-8000-000000000001'
				}
			})
		);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data.message).toBe('Event already deleted or not found');
		expect(legacyDeleteMock).not.toHaveBeenCalled();
	});

	it('creates and tracks a scheduled task on the selected source', async () => {
		writeCreateMock.mockResolvedValue({
			calendarSourceId: 'ca300000-0000-4000-8000-000000000001',
			connectionId: 'connection-a',
			providerCalendarId: 'work@example.com',
			providerEventId: 'provider-event-1',
			taskCalendarEventId: 'task-event-1',
			event: {
				id: 'provider-event-1',
				summary: 'Write brief',
				htmlLink: 'https://calendar.google.com/event?eid=one',
				start: { dateTime: '2026-08-13T14:00:00.000Z' },
				end: { dateTime: '2026-08-13T15:00:00.000Z' }
			}
		});
		const query: any = {
			select: vi.fn(() => query),
			eq: vi.fn(() => query),
			is: vi.fn(() => query),
			single: vi.fn().mockResolvedValue({
				data: {
					id: 'ca400000-0000-4000-8000-000000000001',
					title: 'Write brief',
					description: 'Draft the brief',
					project_id: null,
					project: null,
					props: {}
				},
				error: null
			})
		};

		const response = await POST(
			eventFor(
				{
					method: 'scheduleTask',
					params: {
						task_id: 'ca400000-0000-4000-8000-000000000001',
						start_time: '2026-08-13T14:00:00.000Z',
						calendarSourceId: 'ca300000-0000-4000-8000-000000000001'
					}
				},
				{ from: vi.fn(() => query) }
			)
		);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(writeCreateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'user-1',
				selector: expect.objectContaining({
					calendarSourceId: 'ca300000-0000-4000-8000-000000000001'
				}),
				taskTracking: expect.objectContaining({
					taskId: 'ca400000-0000-4000-8000-000000000001'
				})
			})
		);
		expect(payload.data).toMatchObject({
			calendar_id: 'work@example.com',
			calendarSourceId: 'ca300000-0000-4000-8000-000000000001'
		});
	});
});
