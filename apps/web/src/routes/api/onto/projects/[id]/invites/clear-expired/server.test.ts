// apps/web/src/routes/api/onto/projects/[id]/invites/clear-expired/server.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { RequestEvent } from './$types';

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: vi.fn().mockResolvedValue('actor-1')
}));

vi.mock('../../../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

import { POST } from './+server';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

function createEvent(origin: string | null = null) {
	const invites: Record<string, any> = {};
	for (const method of ['update', 'eq', 'lt']) invites[method] = vi.fn(() => invites);
	invites.select = vi.fn().mockResolvedValue({ data: [{ id: 'i1' }, { id: 'i2' }], error: null });
	const logs = { insert: vi.fn().mockResolvedValue({ error: null }) };
	const supabase = {
		rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
		from: vi.fn((table: string) => (table === 'onto_project_logs' ? logs : invites))
	};
	const event = {
		params: { id: PROJECT_ID },
		url: new URL('http://localhost:5173/api'),
		request: { headers: new Headers(origin ? { origin } : {}) },
		locals: {
			supabase,
			safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
		}
	} as unknown as RequestEvent;
	return { event, supabase, invites, logs };
}

describe('POST /api/onto/projects/[id]/invites/clear-expired', () => {
	it('marks only pending invites past their date as expired, and says how many', async () => {
		const { event, supabase, invites, logs } = createEvent();

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data).toEqual({ cleared: 2 });
		expect(supabase.rpc).toHaveBeenCalledWith('current_actor_has_project_member_access', {
			p_project_id: PROJECT_ID,
			p_required_access: 'admin'
		});
		expect(invites.update).toHaveBeenCalledWith({ status: 'expired' });
		expect(invites.eq).toHaveBeenCalledWith('project_id', PROJECT_ID);
		expect(invites.eq).toHaveBeenCalledWith('status', 'pending');
		expect(invites.lt).toHaveBeenCalledWith('expires_at', expect.any(String));
		expect(logs.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				after_data: { event: 'invites_cleared_expired', count: 2 }
			})
		);
	});

	it('is owner-only', async () => {
		const { event, supabase, invites } = createEvent();
		supabase.rpc.mockResolvedValue({ data: false, error: null });

		const response = await POST(event);

		expect(response.status).toBe(403);
		expect(invites.update).not.toHaveBeenCalled();
	});

	it('refuses a cross-site request', async () => {
		const { event, invites } = createEvent('https://evil.example');

		const response = await POST(event);

		expect(response.status).toBe(403);
		expect(invites.update).not.toHaveBeenCalled();
	});
});
