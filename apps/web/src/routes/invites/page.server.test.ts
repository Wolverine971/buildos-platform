// apps/web/src/routes/invites/page.server.test.ts
import { describe, expect, it, vi } from 'vitest';

const logErrorMock = vi.fn();

vi.mock('$lib/services/errorLogger.service', () => ({
	ErrorLoggerService: {
		getInstance: vi.fn(() => ({
			logError: logErrorMock
		}))
	}
}));

describe('/invites +page.server', () => {
	it('redirects unauthenticated users to login with the invites redirect preserved', async () => {
		const { load } = await import('./+page.server');

		await expect(
			load({
				locals: {
					safeGetSession: vi.fn().mockResolvedValue({ user: null })
				},
				url: new URL('http://localhost/invites')
			} as any)
		).rejects.toMatchObject({
			status: 303,
			location: '/auth/login?redirect=%2Finvites'
		});
	});

	it('returns pending invites for authenticated users', async () => {
		const { load } = await import('./+page.server');
		const invites = [
			{
				invite_id: 'invite-1',
				project_id: 'project-1',
				project_name: 'Project Alpha'
			}
		];

		const result = await load({
			locals: {
				safeGetSession: vi.fn().mockResolvedValue({
					user: { id: 'user-1', email: 'invitee@example.com' }
				}),
				supabase: {
					rpc: vi.fn().mockResolvedValue({
						data: invites,
						error: null
					})
				}
			},
			url: new URL('http://localhost/invites')
		} as any);

		expect(result).toEqual({
			status: 'ready',
			invites
		});
	});
});
