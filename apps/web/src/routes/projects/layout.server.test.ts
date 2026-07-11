// apps/web/src/routes/projects/layout.server.test.ts
import { describe, expect, it, vi } from 'vitest';

import { load } from './+layout.server';

describe('projects layout authentication', () => {
	it('preserves a direct document destination when redirecting to login', async () => {
		const event = {
			locals: {
				safeGetSession: vi.fn().mockResolvedValue({ user: null })
			},
			url: new URL('https://buildos.test/projects/project-1/documents/document-1?from=email')
		} as any;

		await expect(load(event)).rejects.toMatchObject({
			status: 303,
			location:
				'/auth/login?redirect=%2Fprojects%2Fproject-1%2Fdocuments%2Fdocument-1%3Ffrom%3Demail'
		});
	});

	it('returns the signed-in email for project access messaging', async () => {
		const result = await load({
			locals: {
				safeGetSession: vi.fn().mockResolvedValue({
					user: { id: 'user-1', email: 'member@example.com', name: 'Member' }
				})
			},
			url: new URL('https://buildos.test/projects/project-1')
		} as any);

		expect(result.user).toEqual({
			id: 'user-1',
			email: 'member@example.com',
			name: 'Member',
			is_admin: false
		});
	});
});
