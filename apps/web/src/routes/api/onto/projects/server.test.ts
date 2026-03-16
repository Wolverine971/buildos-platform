// apps/web/src/routes/api/onto/projects/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ensureActorIdMock, fetchProjectSelectorSummariesMock } = vi.hoisted(() => ({
	ensureActorIdMock: vi.fn(),
	fetchProjectSelectorSummariesMock: vi.fn()
}));

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: ensureActorIdMock,
	fetchProjectSelectorSummaries: fetchProjectSelectorSummariesMock
}));

import { GET } from './+server';

describe('GET /api/onto/projects', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		ensureActorIdMock.mockResolvedValue('actor-1');
		fetchProjectSelectorSummariesMock.mockResolvedValue([
			{
				id: 'project-1',
				name: 'Apollo',
				description: 'Mission control',
				type_key: 'project.product',
				state_key: 'active',
				facet_context: 'internal',
				facet_scale: 'team',
				facet_stage: 'build',
				created_at: '2026-03-10T00:00:00.000Z',
				updated_at: '2026-03-12T00:00:00.000Z',
				task_count: 4
			}
		]);
	});

	it('delegates project search and limit to the selector-specific service', async () => {
		const response = await GET({
			url: new URL('http://localhost/api/onto/projects?search=apollo&limit=12'),
			locals: {
				supabase: {},
				serverTiming: undefined,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(ensureActorIdMock).toHaveBeenCalledWith({}, 'user-1');
		expect(fetchProjectSelectorSummariesMock).toHaveBeenCalledWith(
			{},
			'actor-1',
			{ search: 'apollo', limit: 12 },
			undefined
		);
	});
});
