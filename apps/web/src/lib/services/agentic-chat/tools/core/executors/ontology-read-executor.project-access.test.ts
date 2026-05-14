// apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.project-access.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { OntologyReadExecutor } from './ontology-read-executor';
import type { ExecutorContext } from './types';

describe('OntologyReadExecutor project-scoped access', () => {
	let documentQuery: Record<string, any>;
	let mockSupabase: SupabaseClient<Database>;
	let context: ExecutorContext;

	beforeEach(() => {
		documentQuery = {
			select: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			in: vi.fn().mockReturnThis(),
			or: vi.fn().mockReturnThis(),
			is: vi.fn().mockReturnThis(),
			order: vi.fn().mockReturnThis(),
			limit: vi.fn().mockResolvedValue({
				data: [
					{
						id: 'doc-1',
						project_id: 'project-1',
						title: 'Shared project brief',
						type_key: 'document.context.project',
						state_key: 'draft',
						content: '# Brief\n\n## Notes',
						description: null,
						created_at: '2026-04-29T00:00:00.000Z',
						updated_at: '2026-04-29T00:00:00.000Z'
					}
				],
				count: 1,
				error: null
			})
		};

		mockSupabase = {
			from: vi.fn(() => documentQuery),
			rpc: vi.fn((fn: string) => {
				if (fn === 'current_actor_has_project_member_access') {
					return Promise.resolve({ data: true, error: null });
				}
				if (fn === 'ensure_actor_for_user') {
					return Promise.resolve({ data: 'collaborator-actor', error: null });
				}
				if (fn === 'get_onto_project_summaries_v1') {
					return Promise.resolve({
						data: [
							{
								id: 'project-1',
								name: 'Shared project',
								description: null,
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
								task_count: 0,
								goal_count: 0,
								plan_count: 0,
								document_count: 1,
								owner_actor_id: 'owner-actor',
								access_role: 'editor',
								access_level: 'write',
								is_shared: true,
								next_step_short: null,
								next_step_long: null,
								next_step_source: null,
								next_step_updated_at: null
							}
						],
						error: null
					});
				}
				return Promise.resolve({ data: null, error: null });
			}),
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

	it('allows contributors to list documents in a project they can read', async () => {
		const executor = new OntologyReadExecutor(context);

		const result = await executor.listOntoDocuments({
			project_id: 'project-1',
			limit: 10
		});

		expect(mockSupabase.rpc).toHaveBeenCalledWith('ensure_actor_for_user', {
			p_user_id: 'user-1'
		});
		expect(mockSupabase.rpc).toHaveBeenCalledWith('current_actor_has_project_member_access', {
			p_project_id: 'project-1',
			p_required_access: 'read'
		});
		expect(documentQuery.eq).toHaveBeenCalledWith('project_id', 'project-1');
		expect(documentQuery.eq).not.toHaveBeenCalledWith('created_by', expect.anything());
		expect(result.documents).toHaveLength(1);
		expect(result.documents[0].id).toBe('doc-1');
	});

	it('scopes unfiltered document listings to readable projects', async () => {
		const executor = new OntologyReadExecutor(context);

		await executor.listOntoDocuments({ limit: 10 });

		expect(mockSupabase.rpc).toHaveBeenCalledWith('ensure_actor_for_user', {
			p_user_id: 'user-1'
		});
		expect(mockSupabase.rpc).not.toHaveBeenCalledWith(
			'current_actor_has_project_member_access',
			{
				p_project_id: expect.anything(),
				p_required_access: 'read'
			}
		);
		expect(documentQuery.in).toHaveBeenCalledWith('project_id', ['project-1']);
		expect(documentQuery.eq).not.toHaveBeenCalledWith('created_by', expect.anything());
	});
});
