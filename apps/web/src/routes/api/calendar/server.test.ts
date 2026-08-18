// apps/web/src/routes/api/calendar/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	legacyUpdateMock,
	legacyDeleteMock,
	legacyDisconnectMock,
	legacyShareMock,
	legacyUnshareMock,
	writeCreateMock,
	writeUpdateMock,
	writeDeleteMock,
	recurrenceBuildMock,
	createAdminMock,
	adminClient
} = vi.hoisted(() => {
	const adminClient = { role: 'service' };
	return {
		legacyUpdateMock: vi.fn(),
		legacyDeleteMock: vi.fn(),
		legacyDisconnectMock: vi.fn(),
		legacyShareMock: vi.fn(),
		legacyUnshareMock: vi.fn(),
		writeCreateMock: vi.fn(),
		writeUpdateMock: vi.fn(),
		writeDeleteMock: vi.fn(),
		recurrenceBuildMock: vi.fn(),
		createAdminMock: vi.fn(() => adminClient),
		adminClient
	};
});

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
	CalendarService: vi.fn().mockImplementation((client) => ({
		client,
		updateCalendarEvent: legacyUpdateMock,
		deleteCalendarEvent: legacyDeleteMock,
		disconnectCalendar: legacyDisconnectMock,
		shareCalendar: legacyShareMock,
		unshareCalendar: legacyUnshareMock
	}))
}));

vi.mock('$lib/services/recurrence-pattern.service', () => ({
	recurrencePatternBuilder: {
		buildRRule: recurrenceBuildMock
	}
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
import { CalendarService } from '$lib/services/calendar-service';
import { GoogleCalendarWriteError } from '$lib/server/google-calendar-write.service';

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
		expect(payload.data).toEqual({
			success: true,
			event_id: 'provider-event-1',
			event_link: 'https://calendar.google.com/event?eid=one',
			summary: 'Updated',
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
		expect(payload.data).toEqual({
			success: true,
			event_id: 'provider-event-1',
			message: 'Event already deleted or not found',
			calendarSourceId: 'ca300000-0000-4000-8000-000000000001',
			providerCalendarId: 'work@example.com'
		});
		expect(legacyDeleteMock).not.toHaveBeenCalled();
	});

	it('uses the service client for legacy disconnect cleanup', async () => {
		legacyDisconnectMock.mockResolvedValue(undefined);

		const response = await POST(eventFor({ method: 'disconnectCalendar' }));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(createAdminMock).toHaveBeenCalledTimes(1);
		expect(CalendarService).toHaveBeenCalledWith(adminClient);
		expect(legacyDisconnectMock).toHaveBeenCalledWith('user-1');
		expect(payload.data).toEqual({ disconnected: true });
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
		expect(payload.data).toEqual({
			success: true,
			event_id: 'provider-event-1',
			event_link: 'https://calendar.google.com/event?eid=one',
			calendar_id: 'work@example.com',
			calendarSourceId: 'ca300000-0000-4000-8000-000000000001',
			task_id: 'ca400000-0000-4000-8000-000000000001',
			summary: 'Write brief',
			start: { dateTime: '2026-08-13T14:00:00.000Z' },
			end: { dateTime: '2026-08-13T15:00:00.000Z' }
		});
	});

	it.each([
		{
			method: 'scheduleTask',
			params: { task_id: 'not-a-uuid', start_time: 'not-a-date' },
			message: 'Invalid task scheduling parameters',
			fields: ['task_id', 'start_time'],
			formErrors: []
		},
		{
			method: 'updateCalendarEvent',
			params: { event_id: '' },
			message: 'Invalid calendar event update',
			fields: ['event_id'],
			formErrors: []
		},
		{
			method: 'deleteCalendarEvent',
			params: { event_id: '', unexpected: true },
			message: 'Invalid calendar event deletion',
			fields: ['event_id'],
			formErrors: ["Unrecognized key(s) in object: 'unexpected'"]
		}
	])('preserves the $method validation-failure response shape', async (testCase) => {
		const response = await POST(eventFor({ method: testCase.method, params: testCase.params }));
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload).toMatchObject({
			success: false,
			error: testCase.message,
			message: testCase.message,
			code: 'INVALID_REQUEST',
			details: {
				formErrors: testCase.formErrors,
				fieldErrors: expect.any(Object)
			}
		});
		expect(Object.keys(payload.details.fieldErrors)).toEqual(testCase.fields);
	});

	it('builds and tracks recurrence when scheduling a recurring task', async () => {
		recurrenceBuildMock.mockReturnValue('RRULE:FREQ=WEEKLY;UNTIL=20261001T000000Z');
		writeCreateMock.mockResolvedValue({
			calendarSourceId: 'ca300000-0000-4000-8000-000000000001',
			connectionId: 'connection-a',
			providerCalendarId: 'work@example.com',
			providerEventId: 'provider-recurring-event',
			taskCalendarEventId: 'task-event-1',
			event: {
				id: 'provider-recurring-event',
				summary: 'Weekly planning',
				recurrence: ['RRULE:FREQ=WEEKLY;UNTIL=20261001T000000Z'],
				start: { dateTime: '2026-08-13T14:00:00.000Z' },
				end: { dateTime: '2026-08-13T14:45:00.000Z' }
			}
		});
		const query: any = {
			select: vi.fn(() => query),
			eq: vi.fn(() => query),
			is: vi.fn(() => query),
			single: vi.fn().mockResolvedValue({
				data: {
					id: 'ca400000-0000-4000-8000-000000000001',
					title: 'Weekly planning',
					description: null,
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
						duration_minutes: 45,
						calendarSourceId: 'ca300000-0000-4000-8000-000000000001',
						timeZone: 'America/New_York',
						recurrence_pattern: 'weekly',
						recurrence_ends: '2026-10-01'
					}
				},
				{ from: vi.fn(() => query) }
			)
		);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(recurrenceBuildMock).toHaveBeenCalledWith({
			pattern: { type: 'weekly' },
			endOption: { type: 'date', value: '2026-10-01' },
			startDate: '2026-08-13T14:00:00.000Z'
		});
		expect(writeCreateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				requestBody: expect.objectContaining({
					recurrence: ['RRULE:FREQ=WEEKLY;UNTIL=20261001T000000Z']
				}),
				taskTracking: expect.objectContaining({
					isMasterEvent: true,
					recurrenceRule: 'RRULE:FREQ=WEEKLY;UNTIL=20261001T000000Z'
				})
			})
		);
		expect(payload.data).toEqual({
			success: true,
			event_id: 'provider-recurring-event',
			calendar_id: 'work@example.com',
			calendarSourceId: 'ca300000-0000-4000-8000-000000000001',
			task_id: 'ca400000-0000-4000-8000-000000000001',
			summary: 'Weekly planning',
			start: { dateTime: '2026-08-13T14:00:00.000Z' },
			end: { dateTime: '2026-08-13T14:45:00.000Z' },
			recurrence: ['RRULE:FREQ=WEEKLY;UNTIL=20261001T000000Z'],
			timeZone: 'America/New_York'
		});
	});

	it('formats a recurring-instance provider event ID for a single update', async () => {
		writeUpdateMock.mockResolvedValue({
			calendarSourceId: 'ca300000-0000-4000-8000-000000000001',
			connectionId: 'connection-a',
			providerCalendarId: 'work@example.com',
			providerEventId: 'master-event_20260813T143045Z',
			event: { id: 'master-event_20260813T143045Z', summary: 'One occurrence' }
		});

		const response = await POST(
			eventFor({
				method: 'updateCalendarEvent',
				params: {
					event_id: 'master-event',
					calendarSourceId: 'ca300000-0000-4000-8000-000000000001',
					update_scope: 'single',
					instance_date: '2026-08-13T14:30:45.123Z',
					summary: 'One occurrence'
				}
			})
		);

		expect(response.status).toBe(200);
		expect(writeUpdateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				providerEventId: 'master-event_20260813T143045Z'
			})
		);
	});

	it('keeps Google Calendar runtime errors on the shared route error path', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		writeUpdateMock.mockRejectedValue(
			new GoogleCalendarWriteError(
				'CALENDAR_PROVIDER_EVENT_ID_MISSING',
				'Google did not return an event ID'
			)
		);

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

		expect(response.status).toBe(502);
		expect(payload).toMatchObject({
			success: false,
			error: 'Google did not return an event ID',
			message: 'Google did not return an event ID',
			code: 'CALENDAR_PROVIDER_EVENT_ID_MISSING'
		});
		consoleError.mockRestore();
	});

	it('passes calendar sharing through the legacy service response contract', async () => {
		legacyShareMock.mockResolvedValue({ success: true });

		const response = await POST(
			eventFor({
				method: 'shareCalendar',
				params: {
					calendarId: 'project-calendar@example.com',
					shares: [{ email: 'reader@example.com', role: 'reader' }]
				}
			})
		);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(legacyShareMock).toHaveBeenCalledWith('user-1', 'project-calendar@example.com', [
			{ email: 'reader@example.com', role: 'reader' }
		]);
		expect(payload.data).toEqual({ success: true });
	});

	it.each([
		{ result: { success: true } },
		{ result: { success: false, error: 'Failed to remove ACL rule' } }
	])('passes through the unshareCalendar branch result $result', async ({ result }) => {
		legacyUnshareMock.mockResolvedValue(result);

		const response = await POST(
			eventFor({
				method: 'unshareCalendar',
				params: {
					calendarId: 'project-calendar@example.com',
					emails: ['reader@example.com']
				}
			})
		);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(legacyUnshareMock).toHaveBeenCalledWith('user-1', 'project-calendar@example.com', [
			'reader@example.com'
		]);
		expect(payload.data).toEqual(result);
	});
});
