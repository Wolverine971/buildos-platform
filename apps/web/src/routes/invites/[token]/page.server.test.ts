// apps/web/src/routes/invites/[token]/page.server.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';

const logErrorMock = vi.fn();

vi.mock('$lib/services/errorLogger.service', () => ({
	ErrorLoggerService: {
		getInstance: vi.fn(() => ({
			logError: logErrorMock
		}))
	}
}));

describe('/invites/[token] +page.server', () => {
	it('returns unauthenticated preview data and preserves the token path for auth redirects', async () => {
		const { load } = await import('./+page.server');
		const rpc = vi.fn().mockResolvedValue({
			data: {
				invite_id: 'invite-1',
				project_id: 'project-1',
				project_name: 'Project Alpha',
				role_key: 'editor',
				invited_by_name: 'Owner'
			},
			error: null
		});

		const result = await load({
			params: { token: 'invite-token' },
			locals: {
				supabase: { rpc },
				safeGetSession: vi.fn().mockResolvedValue({ user: null })
			},
			url: new URL('http://localhost/invites/invite-token')
		} as any);

		expect(rpc).toHaveBeenCalledWith('get_project_invite_preview', {
			p_token_hash: createHash('sha256').update('invite-token').digest('hex')
		});
		expect(result).toMatchObject({
			status: 'unauthenticated',
			redirectTo: '/invites/invite-token',
			invite: {
				invite_id: 'invite-1',
				project_name: 'Project Alpha'
			}
		});
	});

	it('returns ready data and flags email mismatches for authenticated users', async () => {
		const { load } = await import('./+page.server');
		const rpc = vi.fn().mockResolvedValue({
			data: {
				invite_id: 'invite-1',
				project_id: 'project-1',
				project_name: 'Project Alpha',
				role_key: 'viewer',
				invitee_email: 'other@example.com'
			},
			error: null
		});

		const result = await load({
			params: { token: 'invite-token' },
			locals: {
				supabase: { rpc },
				safeGetSession: vi.fn().mockResolvedValue({
					user: { id: 'user-1', email: 'invitee@example.com' }
				})
			},
			url: new URL('http://localhost/invites/invite-token')
		} as any);

		expect(result).toMatchObject({
			status: 'ready',
			redirectTo: '/invites/invite-token',
			userEmail: 'invitee@example.com',
			emailMatches: false
		});
	});
});
