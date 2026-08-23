// apps/web/src/routes/l/[short_code]/server.test.ts

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

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

vi.mock('@buildos/shared-utils', () => ({
	createLogger: vi.fn(() => loggerMock)
}));

import { GET } from './+server';

describe('/l/[short_code]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('preserves a successful destination redirect without logging an error', async () => {
		const link = {
			id: 'link-1',
			short_code: 'abc123',
			destination_url: 'https://build-os.com/onboarding',
			delivery_id: null,
			first_clicked_at: null,
			click_count: 0
		};
		const lookupQuery: any = {
			select: vi.fn(() => lookupQuery),
			eq: vi.fn(() => lookupQuery),
			maybeSingle: vi.fn().mockResolvedValue({ data: link, error: null })
		};
		const updateQuery: any = {
			update: vi.fn(() => updateQuery),
			eq: vi.fn().mockResolvedValue({ error: null })
		};
		const supabase = {
			from: vi.fn().mockReturnValueOnce(lookupQuery).mockReturnValueOnce(updateQuery)
		};
		createAdminSupabaseClientMock.mockReturnValue(supabase);

		await expect(
			GET({
				params: { short_code: 'abc123' }
			} as any)
		).rejects.toMatchObject({
			status: 302,
			location: 'https://build-os.com/onboarding'
		});

		expect(updateQuery.update).toHaveBeenCalledWith(
			expect.objectContaining({
				first_clicked_at: expect.any(String),
				last_clicked_at: expect.any(String),
				click_count: 1
			})
		);
		expect(loggerMock.error).not.toHaveBeenCalled();
	});
});
