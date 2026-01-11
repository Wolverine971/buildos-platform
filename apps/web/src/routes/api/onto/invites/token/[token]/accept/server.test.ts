// apps/web/src/routes/api/onto/invites/token/[token]/accept/server.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { createHash } from 'crypto';

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: vi.fn().mockResolvedValue('actor-1')
}));

vi.mock('../../../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { POST } from './+server';

const createEvent = (overrides?: Partial<RequestEvent>): RequestEvent => {
	const supabase = {
		rpc: vi.fn()
	};

	return {
		params: { token: 'invite-token' },
		locals: {
			supabase,
			safeGetSession: vi.fn().mockResolvedValue({
				user: { id: 'user-1', email: 'invitee@example.com' }
			})
		},
		...overrides
	} as unknown as RequestEvent;
};

describe('POST /api/onto/invites/token/[token]/accept', () => {
	it('returns unauthorized when no user session', async () => {
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

	it('returns bad request when token is missing', async () => {
		const event = createEvent({ params: { token: '   ' } } as Partial<RequestEvent>);

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toContain('Invite token');
	});

	it('returns bad request when user email is missing', async () => {
		const event = createEvent({
			locals: {
				supabase: { rpc: vi.fn() },
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as Partial<RequestEvent>);

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toContain('email');
	});

	it('returns error when invite acceptance fails', async () => {
		const event = createEvent();
		const supabase = event.locals.supabase as any;

		supabase.rpc.mockResolvedValue({ data: null, error: { message: 'Invite not found' } });

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toContain('Invite not found');
	});

	it('accepts invite and returns project info', async () => {
		const event = createEvent();
		const supabase = event.locals.supabase as any;
		const token = 'invite-token';
		const expectedHash = createHash('sha256').update(token).digest('hex');

		supabase.rpc.mockResolvedValue({
			data: { project_id: 'project-1', role_key: 'viewer', access: 'read' },
			error: null
		});

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.projectId).toBe('project-1');
		expect(payload.data.role_key).toBe('viewer');
		expect(payload.data.access).toBe('read');
		expect(ensureActorId).toHaveBeenCalledWith(supabase, 'user-1');
		expect(supabase.rpc).toHaveBeenCalledWith('accept_project_invite', {
			p_token_hash: expectedHash,
			p_actor_id: 'actor-1',
			p_user_email: 'invitee@example.com'
		});
	});
});
