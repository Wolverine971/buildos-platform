// apps/web/src/lib/services/ontology-context-loader.global-access.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { OntologyContextLoader } from './ontology-context-loader';
import { fetchProjectSummaries } from '$lib/services/ontology/ontology-projects.service';

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	fetchProjectSummaries: vi.fn()
}));

const mockFetchProjectSummaries = vi.mocked(fetchProjectSummaries);

describe('OntologyContextLoader global access', () => {
	let mockSupabase: SupabaseClient<Database>;

	beforeEach(() => {
		mockFetchProjectSummaries.mockResolvedValue([
			{
				id: 'shared-project',
				name: 'Shared Launch',
				description: 'Visible through membership',
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
			from: vi.fn(() => ({
				select: vi.fn().mockReturnValue({
					in: vi.fn().mockResolvedValue({ count: 0, error: null })
				})
			}))
		} as unknown as SupabaseClient<Database>;
	});

	it('includes shared projects in global context', async () => {
		const loader = new OntologyContextLoader(mockSupabase, 'collaborator-actor');

		const context = await loader.loadGlobalContext();

		expect(mockFetchProjectSummaries).toHaveBeenCalledWith(mockSupabase, 'collaborator-actor');
		expect(context.entities.projects).toHaveLength(1);
		expect(context.entities.projects?.[0]?.id).toBe('shared-project');
		expect(context.entities.projects?.[0]?.is_shared).toBe(true);
		expect(context.metadata.total_projects).toBe(1);
	});
});
