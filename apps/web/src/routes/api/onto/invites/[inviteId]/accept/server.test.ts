// apps/web/src/routes/api/onto/invites/[inviteId]/accept/server.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { RequestEvent } from './$types';

vi.mock('../../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

import { POST } from './+server';

function createEvent(overrides?: Partial<RequestEvent>): RequestEvent {
	const supabase = {
		rpc: vi.fn(),
		from: vi.fn()
	};

	return {
		params: { inviteId: 'invite-1' },
		locals: {
			supabase,
			safeGetSession: vi.fn().mockResolvedValue({
				user: {
					id: 'user-1',
					email: 'invitee@example.com',
					name: 'Invitee'
				}
			})
		},
		...overrides
	} as unknown as RequestEvent;
}

describe('POST /api/onto/invites/[inviteId]/accept', () => {
	it('returns unauthorized when there is no user session', async () => {
		const event = createEvent({
			locals: {
				supabase: { rpc: vi.fn(), from: vi.fn() },
				safeGetSession: vi.fn().mockResolvedValue({ user: null })
			}
		} as unknown as Partial<RequestEvent>);

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

	it.each(['joined', 'rejoined', 'already_member'])(
		'returns actual membership for %s with one transactional RPC',
		async (status) => {
			const event = createEvent();
			const supabase = event.locals.supabase as any;
			supabase.rpc.mockResolvedValue({
				data: [
					{
						project_id: 'project-1',
						project_name: '9takes',
						role_key: 'editor',
						access: 'write',
						agent_access: 'off',
						status
					}
				],
				error: null
			});
			const response = await POST(event);
			expect(response.status).toBe(200);
			expect((await response.json()).data).toEqual({
				projectId: 'project-1',
				project_name: '9takes',
				role_key: 'editor',
				access: 'write',
				agent_access: 'off',
				status
			});
			expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith('accept_project_invite_by_id', {
				p_invite_id: 'invite-1'
			});
			// No RLS-unsafe owner writes, duplicate notices, or preference overwrites in HTTP followups.
			expect(supabase.from).not.toHaveBeenCalled();
		}
	);

	it('returns a 400 when invite acceptance fails', async () => {
		const event = createEvent();
		const supabase = event.locals.supabase as any;

		supabase.rpc.mockImplementation((fn: string) => {
			if (fn === 'accept_project_invite_by_id') {
				return Promise.resolve({ data: null, error: { message: 'Invite not found' } });
			}

			throw new Error(`Unexpected RPC: ${fn}`);
		});

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toContain('Invite not found');
	});
});
