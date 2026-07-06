// apps/web/src/routes/api/email-tracking/[tracking_id]/click/server.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminSupabaseClientMock, loggerMock } = vi.hoisted(() => ({
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
	});
});
