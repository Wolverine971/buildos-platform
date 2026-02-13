// apps/web/src/routes/api/onto/projects/[id]/members/server.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: vi.fn().mockResolvedValue('actor-current')
}));

vi.mock('../../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

import { GET } from './+server';

const createEvent = (): RequestEvent => {
	const supabase = {
		rpc: vi.fn(),
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

describe('GET /api/onto/projects/[id]/members', () => {
	it('returns active members sorted by role and created_at', async () => {
		const event = createEvent();
		const supabase = event.locals.supabase as any;

		supabase.rpc.mockResolvedValue({ data: true, error: null });

		const rows = [
			{
				id: 'm-viewer',
				project_id: 'project-1',
				actor_id: 'actor-viewer',
				role_key: 'viewer',
				access: 'read',
				role_name: 'Observer',
				role_description: 'Observes project progress.',
				created_at: '2026-01-01T00:00:00.000Z'
			},
			{
				id: 'm-owner-late',
				project_id: 'project-1',
				actor_id: 'actor-owner-2',
				role_key: 'owner',
				access: 'admin',
				role_name: 'Project Owner',
				role_description: 'Owns direction.',
				created_at: '2026-01-03T00:00:00.000Z'
			},
			{
				id: 'm-editor-late',
				project_id: 'project-1',
				actor_id: 'actor-editor-2',
				role_key: 'editor',
				access: 'write',
				role_name: 'Collaborator',
				role_description: 'Contributes delivery.',
				created_at: '2026-01-02T00:00:00.000Z'
			},
			{
				id: 'm-owner-early',
				project_id: 'project-1',
				actor_id: 'actor-owner-1',
				role_key: 'owner',
				access: 'admin',
				role_name: 'Project Owner',
				role_description: 'Owns decisions.',
				created_at: '2026-01-01T00:00:00.000Z'
			},
			{
				id: 'm-editor-early',
				project_id: 'project-1',
				actor_id: 'actor-editor-1',
				role_key: 'editor',
				access: 'write',
				role_name: 'Collaborator',
				role_description: 'Executes workstreams.',
				created_at: '2026-01-01T12:00:00.000Z'
			}
		];

		const select = vi.fn().mockReturnValue({
			eq: vi.fn().mockReturnValue({
				is: vi.fn().mockReturnValue({
					order: vi.fn().mockResolvedValue({ data: rows, error: null })
				})
			})
		});

		supabase.from.mockImplementation((table: string) => {
			if (table === 'onto_project_members') {
				return { select };
			}
			return {};
		});

		const response = await GET(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.actorId).toBe('actor-current');
		expect(payload.data.members.map((m: { id: string }) => m.id)).toEqual([
			'm-owner-early',
			'm-owner-late',
			'm-editor-early',
			'm-editor-late',
			'm-viewer'
		]);
		expect(payload.data.members[0]).toMatchObject({
			role_name: 'Project Owner',
			role_description: 'Owns decisions.'
		});
	});
});
