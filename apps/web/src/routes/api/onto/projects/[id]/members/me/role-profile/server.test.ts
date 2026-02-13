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

	it('rejects non-string role profile values', async () => {
		const event = createEvent({ role_description: 123 });
		const response = await PATCH(event);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toContain('role_description must be a string or null');
	});

	it('updates the current member role profile', async () => {
		const event = createEvent({
			role_name: 'Engineering Lead',
			role_description:
				'Owns technical direction, architecture decisions, and delivery outcomes.'
		});
		const supabase = event.locals.supabase as any;

		supabase.rpc.mockResolvedValue({ data: true, error: null });

		const selectMember = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
					is: vi.fn().mockReturnValue({
						maybeSingle: vi.fn().mockResolvedValue({
							data: {
								id: 'member-1',
								project_id: 'project-1',
								actor_id: 'actor-1',
								role_key: 'editor',
								role_name: 'Collaborator',
								role_description: 'Contributes across project workflows.',
								removed_at: null
							},
							error: null
						})
					})
				})
			})
		});

		const selectProject = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				is: vi.fn().mockReturnValue({
					maybeSingle: vi.fn().mockResolvedValue({
						data: { name: 'Project Alpha' },
						error: null
					})
				})
			})
		});

		const update = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				eq: vi.fn().mockReturnValue({
					eq: vi.fn().mockReturnValue({
						is: vi.fn().mockResolvedValue({ error: null })
					})
				})
			})
		});

		const insert = vi.fn().mockResolvedValue({ error: null });

		supabase.from.mockImplementation((table: string) => {
			if (table === 'onto_project_members') {
				return { select: selectMember, update };
			}
			if (table === 'onto_projects') {
				return { select: selectProject };
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
		expect(payload.data.role_name).toBe('Engineering Lead');
		expect(payload.data.role_description).toBe(
			'Owns technical direction, architecture decisions, and delivery outcomes.'
		);
		expect(update).toHaveBeenCalledWith({
			role_name: 'Engineering Lead',
			role_description:
				'Owns technical direction, architecture decisions, and delivery outcomes.'
		});
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
