// apps/web/src/routes/api/people/find/server.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';
import { GET } from './+server';

function createEvent(handle: string | null, user: unknown = { id: 'user-1' }): RequestEvent {
	const url = new URL('http://localhost/api/people/find');
	if (handle !== null) url.searchParams.set('handle', handle);
	return {
		url,
		locals: {
			supabase: { rpc: vi.fn() },
			safeGetSession: vi.fn().mockResolvedValue({ user })
		}
	} as unknown as RequestEvent;
}

describe('GET /api/people/find', () => {
	it('requires a session', async () => {
		const response = await GET(createEvent('sam', null));
		expect(response.status).toBe(401);
	});

	it('rejects input that cannot be a handle without calling the RPC', async () => {
		const event = createEvent('no spaces allowed');
		const response = await GET(event);
		expect(response.status).toBe(400);
		expect((event.locals.supabase as any).rpc).not.toHaveBeenCalled();
	});

	it('normalizes the handle and returns the card', async () => {
		const event = createEvent(' @Sam ');
		const card = {
			found: true,
			is_self: false,
			handle: 'sam',
			name: 'Sam',
			bio: 'Builds things',
			accepts_agent_requests: true,
			relationship: { pending_request: false, projects_shared_with_you: 0 }
		};
		(event.locals.supabase as any).rpc.mockResolvedValue({ data: card, error: null });

		const response = await GET(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect((event.locals.supabase as any).rpc).toHaveBeenCalledWith('find_person_by_handle', {
			p_handle: 'sam'
		});
		expect(payload.data).toEqual(card);
	});

	it('answers not-found the same way whatever the reason', async () => {
		const event = createEvent('sam');
		(event.locals.supabase as any).rpc.mockResolvedValue({
			data: { found: false, handle: 'sam' },
			error: null
		});

		const payload = await (await GET(event)).json();
		expect(payload.data).toEqual({ found: false, handle: 'sam' });
	});
});
