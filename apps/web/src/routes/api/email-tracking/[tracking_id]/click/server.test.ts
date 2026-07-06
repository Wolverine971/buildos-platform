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
});
