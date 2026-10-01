// apps/web/src/routes/api/onto/projects/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ensureActorIdMock, fetchProjectSelectorSummariesMock, loadParentCandidateFactsMock } =
	vi.hoisted(() => ({
		ensureActorIdMock: vi.fn(),
		fetchProjectSelectorSummariesMock: vi.fn(),
		loadParentCandidateFactsMock: vi.fn()
	}));

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: ensureActorIdMock,
	fetchProjectSelectorSummaries: fetchProjectSelectorSummariesMock
}));
vi.mock('$lib/services/ontology/project-hierarchy.service', () => ({
	loadParentCandidateFacts: loadParentCandidateFactsMock
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

	it('adds nesting and access facts only when the picker asks for them', async () => {
		const request = (query: string) =>
			(
				GET({
					url: new URL(`http://localhost/api/onto/projects${query}`),
					locals: {
						supabase: {},
						serverTiming: undefined,
						safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
					}
				} as any) as Promise<Response>
			).then((response) => response.json());

		const plain = await request('?limit=12');
		expect(loadParentCandidateFactsMock).not.toHaveBeenCalled();
		expect(plain.data.projects[0]).not.toHaveProperty('access_level');

		loadParentCandidateFactsMock.mockResolvedValue(
			new Map([
				[
					'project-1',
					{
						parent_project_id: 'hub',
						parent_project_name: 'Wayne Strategies',
						has_children: false,
						access_level: 'admin'
					}
				]
			])
		);
		const withFacts = await request('?limit=12&include=hierarchy');
		expect(loadParentCandidateFactsMock).toHaveBeenCalledWith(
			{},
			'actor-1',
			expect.arrayContaining([expect.objectContaining({ id: 'project-1' })])
		);
		expect(withFacts.data.projects[0]).toMatchObject({
			id: 'project-1',
			parent_project_id: 'hub',
			parent_project_name: 'Wayne Strategies',
			access_level: 'admin'
		});
	});
});
