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
				params: { short_code: 'abc123' },
				url: new URL('https://build-os.com/l/abc123')
			} as any)
		).rejects.toMatchObject({
			status: 302,
			location: '/onboarding'
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

	it.each([
		'https://evil.example/login',
		'https://build-os.com.evil.example/x',
		'javascript:alert(1)',
		'https://build-os.com//evil.example/x'
	])('never redirects off the app origin (%s)', async (destinationUrl) => {
		const link = {
			id: 'link-2',
			short_code: 'xyz789',
			destination_url: destinationUrl,
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
		createAdminSupabaseClientMock.mockReturnValue({
			from: vi.fn().mockReturnValueOnce(lookupQuery).mockReturnValueOnce(updateQuery)
		});

		const result = await Promise.resolve(
			GET({
				params: { short_code: 'xyz789' },
				url: new URL('https://build-os.com/l/xyz789')
			} as any)
		).catch((error: unknown) => error);

		expect(result).toMatchObject({ status: 302 });
		const location = (result as { location: string }).location;
		expect(location.startsWith('/')).toBe(true);
		expect(location.startsWith('//')).toBe(false);
		expect(location).not.toContain('evil.example/login');
		if (!destinationUrl.startsWith('https://build-os.com//')) {
			expect(location).toBe('/');
		}
	});
});
