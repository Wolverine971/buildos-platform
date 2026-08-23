// apps/web/src/routes/api/email-tracking/[tracking_id]/click/server.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { captureServerEventMock, createAdminSupabaseClientMock, loggerMock } = vi.hoisted(() => ({
	captureServerEventMock: vi.fn().mockResolvedValue(undefined),
	createAdminSupabaseClientMock: vi.fn(),
	loggerMock: {
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
		child: vi.fn(() => ({
			error: vi.fn(),
			warn: vi.fn(),
			info: vi.fn(),
			debug: vi.fn()
		}))
	}
}));

vi.mock('$env/static/public', () => ({
	PUBLIC_APP_URL: 'https://build-os.com'
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

vi.mock('@buildos/shared-utils', () => ({
	createLogger: vi.fn(() => loggerMock)
}));

vi.mock('$lib/server/posthog', () => ({
	captureServerEvent: captureServerEventMock
}));

import { GET } from './+server';

describe('/api/email-tracking/[tracking_id]/click', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('blocks external redirect destinations before tracking the click', async () => {
		const supabase = {
			from: vi.fn()
		};
		createAdminSupabaseClientMock.mockReturnValue(supabase);

		await expect(
			GET({
				params: { tracking_id: 'tracking-1' },
				url: new URL(
					'https://build-os.com/api/email-tracking/tracking-1/click?url=https%3A%2F%2Fevil.example%2F'
				)
			} as any)
		).rejects.toMatchObject({
			status: 302,
			location: '/'
		});

		expect(supabase.from).not.toHaveBeenCalled();
		expect(loggerMock.warn).toHaveBeenCalledWith(
			'Blocked unsafe email click redirect destination',
			expect.objectContaining({
				trackingId: 'tracking-1'
			})
		);
	});

	it('redirects relative in-app destinations (brief links must keep working)', async () => {
		// Email lookup misses — tracking degrades gracefully but the redirect
		// must still land on the requested in-app path, not '/'.
		const query: any = {
			select: vi.fn(() => query),
			eq: vi.fn(() => query),
			maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
		};
		const supabase = { from: vi.fn(() => query) };
		createAdminSupabaseClientMock.mockReturnValue(supabase);

		await expect(
			GET({
				params: { tracking_id: 'tracking-1' },
				url: new URL(
					'https://build-os.com/api/email-tracking/tracking-1/click?url=%2Fprojects%2Fabc%2Ftasks%2Fdef'
				)
			} as any)
		).rejects.toMatchObject({
			status: 302,
			location: '/projects/abc/tasks/def'
		});

		expect(supabase.from).toHaveBeenCalledWith('emails');
		expect(loggerMock.error).not.toHaveBeenCalled();
	});

	it('records a click and redirects without logging the redirect as an error', async () => {
		const recipient = {
			id: 'recipient-1',
			recipient_id: 'user-1',
			recipient_email: 'person@example.com'
		};
		const emailLookupQuery: any = {
			select: vi.fn(() => emailLookupQuery),
			eq: vi.fn(() => emailLookupQuery),
			maybeSingle: vi.fn().mockResolvedValue({
				data: {
					id: 'email-1',
					subject: 'Welcome',
					template_data: {},
					email_recipients: [recipient]
				},
				error: null
			})
		};
		const priorClicksQuery: any = {
			select: vi.fn(() => priorClicksQuery),
			eq: vi.fn(() => priorClicksQuery),
			in: vi.fn().mockResolvedValue({ data: [], error: null })
		};
		const eventInsertQuery = {
			insert: vi.fn().mockResolvedValue({ error: null })
		};
		let trackingEventsQueryCount = 0;
		const supabase = {
			from: vi.fn((table: string) => {
				if (table === 'emails') return emailLookupQuery;
				if (table === 'email_tracking_events') {
					trackingEventsQueryCount += 1;
					return trackingEventsQueryCount === 1 ? priorClicksQuery : eventInsertQuery;
				}
				throw new Error(`Unexpected table: ${table}`);
			})
		};
		createAdminSupabaseClientMock.mockReturnValue(supabase);

		await expect(
			GET({
				params: { tracking_id: 'tracking-1' },
				url: new URL(
					'https://build-os.com/api/email-tracking/tracking-1/click?url=https%3A%2F%2Fbuild-os.com%2Fonboarding'
				)
			} as any)
		).rejects.toMatchObject({
			status: 302,
			location: 'https://build-os.com/onboarding'
		});

		expect(eventInsertQuery.insert).toHaveBeenCalledWith({
			email_id: 'email-1',
			recipient_id: 'recipient-1',
			event_type: 'clicked',
			event_data: {
				is_first_click: true,
				clicked_url: 'https://build-os.com/onboarding'
			},
			clicked_url: 'https://build-os.com/onboarding'
		});
		expect(captureServerEventMock).toHaveBeenCalledWith(
			'user-1',
			'email_clicked',
			expect.objectContaining({
				email_id: 'email-1',
				tracking_id: 'tracking-1',
				is_first_click: true,
				clicked_url: 'https://build-os.com/onboarding'
			})
		);
		expect(loggerMock.error).not.toHaveBeenCalled();
	});
});
