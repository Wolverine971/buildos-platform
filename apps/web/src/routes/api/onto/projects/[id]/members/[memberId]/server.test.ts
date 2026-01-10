// apps/web/src/routes/api/onto/projects/[id]/members/[memberId]/server.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: vi.fn().mockResolvedValue('actor-1')
}));

vi.mock('../../../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

import { PATCH, DELETE } from './+server';

const createEvent = (body?: Record<string, unknown>): RequestEvent => {
	const supabase = {
		rpc: vi.fn(),
		from: vi.fn()
	};

	return {
		params: { id: 'project-1', memberId: 'member-1' },
		request: {
			json: vi.fn().mockResolvedValue(body ?? {})
		},
		locals: {
			supabase,
			safeGetSession: vi.fn().mockResolvedValue({
				user: { id: 'user-1', email: 'owner@example.com' }
			})
		}
	} as unknown as RequestEvent;
};

describe('PATCH /api/onto/projects/[id]/members/[memberId]', () => {
	it('updates member role when admin access is granted', async () => {
		const event = createEvent({ role_key: 'editor' });
		const supabase = event.locals.supabase as any;

		supabase.rpc.mockResolvedValue({ data: true, error: null });

		const memberRow = {
			id: 'member-1',
			actor_id: 'actor-2',
			role_key: 'viewer',
			access: 'read',
			removed_at: null
		};

		const select = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
					maybeSingle: vi.fn().mockResolvedValue({ data: memberRow, error: null })
				})
			})
		});

		const update = vi.fn().mockReturnValue({
			eq: vi.fn().mockResolvedValue({ error: null })
		});

		const insert = vi.fn().mockResolvedValue({ error: null });

		supabase.from.mockImplementation((table: string) => {
			if (table === 'onto_project_members') {
				return { select, update };
			}
			if (table === 'onto_project_logs') {
				return { insert };
			}
			return {};
		});

		const response = await PATCH(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(update).toHaveBeenCalledWith({ role_key: 'editor', access: 'write' });
	});

	it('rejects invalid role updates', async () => {
		const event = createEvent({ role_key: 'owner' });
		const response = await PATCH(event);

		expect(response.status).toBe(400);
	});
});

describe('DELETE /api/onto/projects/[id]/members/[memberId]', () => {
	it('prevents removing the owner role', async () => {
		const event = createEvent();
		const supabase = event.locals.supabase as any;

		supabase.rpc.mockResolvedValue({ data: true, error: null });

		const memberRow = {
			id: 'member-1',
			actor_id: 'actor-1',
			role_key: 'owner',
			access: 'admin',
			removed_at: null
		};

		const select = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
					maybeSingle: vi.fn().mockResolvedValue({ data: memberRow, error: null })
				})
			})
		});

		supabase.from.mockImplementation((table: string) => {
			if (table === 'onto_project_members') {
				return { select };
			}
			return {};
		});

		const response = await DELETE(event);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toContain('Owner role cannot be removed');
	});

	it('marks member as removed when admin access is granted', async () => {
		const event = createEvent();
		const supabase = event.locals.supabase as any;

		supabase.rpc.mockResolvedValue({ data: true, error: null });

		const memberRow = {
			id: 'member-1',
			actor_id: 'actor-2',
			role_key: 'editor',
			access: 'write',
			removed_at: null
		};

		const select = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
					maybeSingle: vi.fn().mockResolvedValue({ data: memberRow, error: null })
				})
			})
		});

		const update = vi.fn().mockReturnValue({
			eq: vi.fn().mockResolvedValue({ error: null })
		});

		const insert = vi.fn().mockResolvedValue({ error: null });

		supabase.from.mockImplementation((table: string) => {
			if (table === 'onto_project_members') {
				return { select, update };
			}
			if (table === 'onto_project_logs') {
				return { insert };
			}
			return {};
		});

		const response = await DELETE(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);

		const updatePayload = update.mock.calls[0][0];
		expect(updatePayload.removed_by_actor_id).toBe('actor-1');
		expect(typeof updatePayload.removed_at).toBe('string');
	});
});
