// apps/web/src/routes/api/onto/projects/[id]/members/me/role-profile/server.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: vi.fn().mockResolvedValue('actor-1')
}));

vi.mock('../../../../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

import { PATCH, POST } from './+server';

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
				user: { id: 'user-1', email: 'member@example.com' }
			})
		}
	} as unknown as RequestEvent;
};

describe('PATCH /api/onto/projects/[id]/members/me/role-profile', () => {
	it('requires at least one role profile field', async () => {
		const event = createEvent({});
		const response = await PATCH(event);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toContain('Provide role_name and/or role_description');
	});
});

describe('POST /api/onto/projects/[id]/members/me/role-profile', () => {
	it('requires role_context', async () => {
		const event = createEvent({ role_context: '' });
		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toContain('role_context is required');
	});
});
