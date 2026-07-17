// apps/web/src/routes/(app)/sms/monitoring/page.server.test.ts
import { describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';

describe('/sms/monitoring page server', () => {
	it('redirects unauthenticated users to login', async () => {
		await expect(
			load({
				locals: {
					safeGetSession: vi.fn().mockResolvedValue({ user: null })
				},
				url: new URL('https://build-os.com/sms/monitoring')
			} as any)
		).rejects.toMatchObject({
			status: 303,
			location: '/auth/login?redirect=%2Fsms%2Fmonitoring'
		});
	});

	it('redirects non-admin users to the dashboard', async () => {
		await expect(
			load({
				locals: {
					safeGetSession: vi
						.fn()
						.mockResolvedValue({ user: { id: 'user-1', is_admin: false } })
				},
				url: new URL('https://build-os.com/sms/monitoring')
			} as any)
		).rejects.toMatchObject({ status: 303, location: '/dashboard' });
	});

	it('loads for admin users', async () => {
		await expect(
			load({
				locals: {
					safeGetSession: vi
						.fn()
						.mockResolvedValue({ user: { id: 'admin-1', is_admin: true } })
				},
				url: new URL('https://build-os.com/sms/monitoring')
			} as any)
		).resolves.toEqual({});
	});
});
