// apps/web/src/routes/dashboard/page.server.test.ts
import { describe, expect, it } from 'vitest';

describe('dashboard route', () => {
	it('sends visitors home to Today, keeping the query string', async () => {
		const { load } = await import('./+page.server');

		await expect(
			load({ url: new URL('https://build-os.com/dashboard?onboarding=true') } as any)
		).rejects.toMatchObject({
			status: 303,
			location: '/today?onboarding=true'
		});
	});
});
