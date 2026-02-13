// apps/web/src/routes/api/onto/projects/[id]/invites/server.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: vi.fn().mockResolvedValue('actor-1')
}));

vi.mock('../../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

import { GET, POST } from './+server';

const createEvent = (body?: Record<string, unknown>): RequestEvent => {
	const supabase = {
		rpc: vi.fn(),
		from: vi.fn()
	};

	return {
		params: { id: 'project-1' },
		request: {
			json: vi.fn().mockResolvedValue(body ?? {})
		},
		locals: {
			supabase,
			safeGetSession: vi.fn().mockResolvedValue({
				user: { id: 'user-1', email: 'editor@example.com' }
			})
		}
	} as unknown as RequestEvent;
};

describe('/api/onto/projects/[id]/invites access checks', () => {
	it('GET returns forbidden when write access is missing', async () => {
		const event = createEvent();
		const supabase = event.locals.supabase as any;

		supabase.rpc.mockResolvedValue({ data: false, error: null });

		const response = await GET(event);
		expect(response.status).toBe(403);
		expect(supabase.rpc).toHaveBeenCalledWith('current_actor_has_project_access', {
			p_project_id: 'project-1',
			p_required_access: 'write'
		});
	});

	it('POST returns forbidden when write access is missing', async () => {
		const event = createEvent({ email: 'new-user@example.com', role_key: 'editor' });
		const supabase = event.locals.supabase as any;

		supabase.rpc.mockResolvedValue({ data: false, error: null });

		const response = await POST(event);
		expect(response.status).toBe(403);
		expect(supabase.rpc).toHaveBeenCalledWith('current_actor_has_project_access', {
			p_project_id: 'project-1',
			p_required_access: 'write'
		});
	});
});
