// apps/web/src/routes/api/onto/invites/[inviteId]/decline/server.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

vi.mock('../../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

import { POST } from './+server';

function createEvent(overrides?: Partial<RequestEvent>): RequestEvent {
	const supabase = {
		rpc: vi.fn()
	};

	return {
		params: { inviteId: 'invite-1' },
		locals: {
			supabase,
			safeGetSession: vi.fn().mockResolvedValue({
				user: {
					id: 'user-1',
					email: 'invitee@example.com'
				}
			})
		},
		...overrides
	} as unknown as RequestEvent;
}

describe('POST /api/onto/invites/[inviteId]/decline', () => {
	it('returns unauthorized when there is no user session', async () => {
		const event = createEvent({
			locals: {
				supabase: { rpc: vi.fn() },
				safeGetSession: vi.fn().mockResolvedValue({ user: null })
			}
		} as Partial<RequestEvent>);

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(401);
		expect(payload.error).toContain('Authentication');
	});

	it('returns bad request when invite id is missing', async () => {
		const event = createEvent({ params: { inviteId: '   ' } } as Partial<RequestEvent>);

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toContain('Invite ID');
	});

	it('declines a pending invite', async () => {
		const event = createEvent();
		const supabase = event.locals.supabase as any;

		supabase.rpc.mockResolvedValue({
			data: { invite_id: 'invite-1', status: 'declined' },
			error: null
		});

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data).toMatchObject({
			inviteId: 'invite-1',
			status: 'declined'
		});
		expect(supabase.rpc).toHaveBeenCalledWith('decline_project_invite', {
			p_invite_id: 'invite-1'
		});
	});

	it('returns a 400 when the decline RPC fails', async () => {
		const event = createEvent();
		const supabase = event.locals.supabase as any;

		supabase.rpc.mockResolvedValue({
			data: null,
			error: { message: 'Invite has expired' }
		});

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toContain('Invite has expired');
	});
});
