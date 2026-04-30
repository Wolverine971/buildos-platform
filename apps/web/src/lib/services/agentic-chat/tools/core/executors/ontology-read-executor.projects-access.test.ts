// apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.projects-access.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { OntologyReadExecutor } from './ontology-read-executor';
import type { ExecutorContext } from './types';
import { fetchProjectSummaries } from '$lib/services/ontology/ontology-projects.service';

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: vi.fn().mockResolvedValue('actor-1'),
	fetchProjectSummaries: vi.fn()
}));

const mockFetchProjectSummaries = vi.mocked(fetchProjectSummaries);

describe('OntologyReadExecutor accessible project listing', () => {
	let mockSupabase: SupabaseClient<Database>;
	let context: ExecutorContext;

	beforeEach(() => {
		mockFetchProjectSummaries.mockResolvedValue([
			{
				id: 'owned-project',
				name: 'Owned Project',
				description: 'A private project',
				icon_svg: null,
				icon_concept: null,
				icon_generated_at: null,
				icon_generation_source: null,
				icon_generation_prompt: null,
				type_key: 'project.default',
				state_key: 'active',
				props: {},
				facet_context: null,
				facet_scale: null,
				facet_stage: null,
				created_at: '2026-04-28T00:00:00.000Z',
				updated_at: '2026-04-28T00:00:00.000Z',
				task_count: 1,
				goal_count: 0,
				plan_count: 0,
				document_count: 0,
				owner_actor_id: 'actor-1',
				access_role: 'owner',
				access_level: 'admin',
				is_shared: false,
				next_step_short: null,
				next_step_long: null,
				next_step_source: null,
				next_step_updated_at: null
			},
			{
				id: 'shared-project',
				name: 'Shared Launch',
				description: 'Collaborator workspace',
				icon_svg: null,
				icon_concept: null,
				icon_generated_at: null,
				icon_generation_source: null,
				icon_generation_prompt: null,
				type_key: 'project.default',
				state_key: 'active',
				props: {},
				facet_context: null,
				facet_scale: null,
				facet_stage: null,
				created_at: '2026-04-29T00:00:00.000Z',
				updated_at: '2026-04-29T00:00:00.000Z',
				task_count: 2,
				goal_count: 1,
				plan_count: 1,
				document_count: 3,
				owner_actor_id: 'owner-actor',
				access_role: 'editor',
				access_level: 'write',
				is_shared: true,
				next_step_short: null,
				next_step_long: null,
				next_step_source: null,
				next_step_updated_at: null
			}
		] as any);

		mockSupabase = {
			auth: {
				getSession: vi.fn().mockResolvedValue({
					data: { session: { access_token: 'test-token' } }
				})
			}
		} as unknown as SupabaseClient<Database>;

		context = {
			supabase: mockSupabase,
			userId: 'user-1',
			sessionId: 'session-1',
			fetchFn: vi.fn() as unknown as typeof fetch
		};
	});

	it('lists shared projects returned by the accessible project summary RPC', async () => {
		const executor = new OntologyReadExecutor(context);

		const result = await executor.listOntoProjects({ limit: 10 });

		expect(result.projects.map((project) => project.id)).toEqual([
			'shared-project',
			'owned-project'
		]);
		expect(result.projects[0].is_shared).toBe(true);
		expect(mockFetchProjectSummaries).toHaveBeenCalledWith(mockSupabase, 'actor-1');
	});

	it('searches shared projects by name or description', async () => {
		const executor = new OntologyReadExecutor(context);

		const result = await executor.searchOntoProjects({
			query: 'launch',
			limit: 10
		});

		expect(result.projects).toHaveLength(1);
		expect(result.projects[0].id).toBe('shared-project');
	});
});
