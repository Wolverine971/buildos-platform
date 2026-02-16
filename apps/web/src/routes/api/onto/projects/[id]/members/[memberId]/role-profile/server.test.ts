// apps/web/src/routes/api/onto/projects/[id]/members/[memberId]/role-profile/server.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: vi.fn().mockResolvedValue('actor-admin')
}));

vi.mock('../../../../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

import { PATCH } from './+server';

const createEvent = (body?: Record<string, unknown>): RequestEvent => {
	const supabase = {
		rpc: vi.fn(),
		from: vi.fn()
	};

	return {
		params: { id: 'project-1', memberId: 'member-2' },
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

describe('PATCH /api/onto/projects/[id]/members/[memberId]/role-profile', () => {
	it('requires at least one role profile field', async () => {
		const event = createEvent({});
		const response = await PATCH(event);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toContain('Provide role_name and/or role_description');
	});

	it('updates another member role profile with admin access', async () => {
		const event = createEvent({
			role_name: 'Execution Lead',
			role_description:
				'Leads execution sequencing, delivery follow-through, and dependencies.'
		});
		const supabase = event.locals.supabase as any;

		supabase.rpc.mockResolvedValue({ data: true, error: null });

		const select = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
					maybeSingle: vi.fn().mockResolvedValue({
						data: {
							id: 'member-2',
							actor_id: 'actor-target',
							role_name: 'Collaborator',
							role_description: 'Contributes across project workflows.',
							removed_at: null
						},
						error: null
					})
				})
			})
		});

		const update = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
					is: vi.fn().mockReturnValue({
						select: vi.fn().mockReturnValue({
							maybeSingle: vi.fn().mockResolvedValue({
								data: {
									id: 'member-2',
									actor_id: 'actor-target',
									role_name: 'Execution Lead',
									role_description:
										'Leads execution sequencing, delivery follow-through, and dependencies.',
									removed_at: null
								},
								error: null
							})
						})
					})
				})
			})
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
		expect(payload.data.member_id).toBe('member-2');
		expect(payload.data.role_name).toBe('Execution Lead');
		expect(update).toHaveBeenCalledWith({
			role_name: 'Execution Lead',
			role_description:
				'Leads execution sequencing, delivery follow-through, and dependencies.'
		});
	});
});
