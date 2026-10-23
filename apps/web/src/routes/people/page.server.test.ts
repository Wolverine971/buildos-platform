// apps/web/src/routes/people/page.server.test.ts
import { describe, expect, it } from 'vitest';
import { load } from './+page.server';

describe('/people', () => {
	it('sends old links to Profile > People & agents', async () => {
		await expect((load as any)({})).rejects.toMatchObject({
			status: 308,
			location: '/profile?tab=people'
		});
	});
});
