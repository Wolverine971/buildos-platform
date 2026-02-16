// apps/web/src/routes/api/onto/projects/[id]/members/me/role-profile/alternatives/server.test.ts
import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const { generateTextMock } = vi.hoisted(() => ({
	generateTextMock: vi.fn()
}));

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: vi.fn().mockResolvedValue('actor-1')
}));

vi.mock('$lib/services/smart-llm-service', () => ({
	SmartLLMService: vi.fn().mockImplementation(() => ({
		generateText: generateTextMock
	}))
}));

vi.mock('../../../../../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

import { POST } from './+server';

const createEvent = (body?: Record<string, unknown>): RequestEvent => {
	const supabase = {
		rpc: vi.fn(),
		from: vi.fn()
	};

	return {
		params: { id: 'project-1' },
		request: {
			headers: new Headers({ referer: 'https://localhost/projects/project-1' }),
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

beforeEach(() => {
	generateTextMock.mockReset();
});

describe('POST /api/onto/projects/[id]/members/me/role-profile/alternatives', () => {
	it('requires role_context', async () => {
		const event = createEvent({ role_context: '' });
		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toContain('role_context is required');
	});

	it('returns generated alternatives for the current member', async () => {
		const event = createEvent({
			role_context:
				'I coordinate launch execution, unblock dependencies, and keep timelines tight.',
			count: 3
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

		supabase.from.mockImplementation((table: string) => {
			if (table === 'onto_project_members') {
				return { select: selectMember };
			}
			if (table === 'onto_projects') {
				return { select: selectProject };
			}
			return {};
		});

		generateTextMock.mockResolvedValue(
			JSON.stringify({
				alternatives: [
					{
						role_name: 'Execution Lead',
						role_description:
							'Drives execution sequencing, unblocks dependencies, and keeps milestones on track.'
					},
					{
						role_name: 'Delivery Coordinator',
						role_description:
							'Orchestrates delivery handoffs, timeline integrity, and cross-functional follow-through.'
					},
					{
						role_name: 'Launch Operations Partner',
						role_description:
							'Keeps launch operations moving by clarifying ownership, risks, and immediate next actions.'
					}
				]
			})
		);

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.member_id).toBe('member-1');
		expect(payload.data.alternatives).toHaveLength(3);
		expect(payload.data.alternatives[0]).toMatchObject({
			role_name: 'Execution Lead'
		});
		expect(generateTextMock).toHaveBeenCalledTimes(1);
	});
});
