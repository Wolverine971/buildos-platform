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
				if (fn === 'current_actor_has_project_access') {
					return Promise.resolve({ data: true, error: null });
				}
				if (fn === 'ensure_actor_for_user') {
					return Promise.resolve({ data: 'collaborator-actor', error: null });
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

		expect(mockSupabase.rpc).toHaveBeenCalledWith('current_actor_has_project_access', {
			p_project_id: 'project-1',
			p_required_access: 'read'
		});
		expect(mockSupabase.rpc).not.toHaveBeenCalledWith(
			'ensure_actor_for_user',
			expect.anything()
		);
		expect(documentQuery.eq).toHaveBeenCalledWith('project_id', 'project-1');
		expect(documentQuery.eq).not.toHaveBeenCalledWith('created_by', expect.anything());
		expect(result.documents).toHaveLength(1);
		expect(result.documents[0].id).toBe('doc-1');
	});

	it('keeps owner-scoped listing when no project is provided', async () => {
		const executor = new OntologyReadExecutor(context);

		await executor.listOntoDocuments({ limit: 10 });

		expect(mockSupabase.rpc).toHaveBeenCalledWith('ensure_actor_for_user', {
			p_user_id: 'user-1'
		});
		expect(mockSupabase.rpc).not.toHaveBeenCalledWith('current_actor_has_project_access', {
			p_project_id: expect.anything(),
			p_required_access: 'read'
		});
		expect(documentQuery.eq).toHaveBeenCalledWith('created_by', 'collaborator-actor');
	});
});
