// apps/web/src/routes/api/onto/projects/[id]/members/me/server.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: vi.fn().mockResolvedValue('actor-1')
}));

vi.mock('../../../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

import { DELETE } from './+server';

const createEvent = (): RequestEvent => {
	const supabase = {
		from: vi.fn()
	};

	return {
		params: { id: 'project-1' },
		locals: {
			supabase,
			safeGetSession: vi.fn().mockResolvedValue({
				user: { id: 'user-1', email: 'member@example.com' }
			})
		}
	} as unknown as RequestEvent;
};

describe('DELETE /api/onto/projects/[id]/members/me', () => {
	it('prevents owners from leaving their own project', async () => {
		const event = createEvent();
		const supabase = event.locals.supabase as any;

		const projectSelect = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				is: vi.fn().mockReturnValue({
					maybeSingle: vi.fn().mockResolvedValue({
						data: { id: 'project-1', created_by: 'actor-1' },
						error: null
					})
				})
			})
		});

		supabase.from.mockImplementation((table: string) => {
			if (table === 'onto_projects') {
				return { select: projectSelect };
			}
			return {};
		});

		const response = await DELETE(event);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toContain('Project owners cannot leave');
	});

	it('lets non-owner members leave a shared project', async () => {
		const event = createEvent();
		const supabase = event.locals.supabase as any;

		const projectSelect = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				is: vi.fn().mockReturnValue({
					maybeSingle: vi.fn().mockResolvedValue({
						data: { id: 'project-1', created_by: 'actor-owner' },
						error: null
					})
				})
			})
		});

		const memberSelect = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
					is: vi.fn().mockReturnValue({
						maybeSingle: vi.fn().mockResolvedValue({
							data: {
								id: 'member-1',
								actor_id: 'actor-1',
								role_key: 'editor',
								access: 'write',
								removed_at: null
							},
							error: null
						})
					})
				})
			})
		});

		const update = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
					eq: vi.fn().mockReturnValue({
						is: vi.fn().mockReturnValue({
							select: vi.fn().mockReturnValue({
								maybeSingle: vi.fn().mockResolvedValue({
									data: {
										id: 'member-1',
										actor_id: 'actor-1',
										role_key: 'editor',
										access: 'write'
									},
									error: null
								})
							})
						})
					})
				})
			})
		});

		const insert = vi.fn().mockResolvedValue({ error: null });

		supabase.from.mockImplementation((table: string) => {
			if (table === 'onto_projects') {
				return { select: projectSelect };
			}
			if (table === 'onto_project_members') {
				return { select: memberSelect, update };
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
