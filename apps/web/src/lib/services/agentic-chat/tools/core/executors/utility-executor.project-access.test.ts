// apps/web/src/lib/services/agentic-chat/tools/core/executors/utility-executor.project-access.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { UtilityExecutor } from './utility-executor';
import type { ExecutorContext } from './types';

function createQuery(result: unknown) {
	return {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		maybeSingle: vi.fn().mockResolvedValue(result),
		limit: vi.fn().mockResolvedValue(result)
	};
}

describe('UtilityExecutor project-scoped entity access', () => {
	let mockSupabase: SupabaseClient<Database>;
	let context: ExecutorContext;
	let taskAccessQuery: ReturnType<typeof createQuery>;
	let outgoingEdgesQuery: ReturnType<typeof createQuery>;

	beforeEach(() => {
		taskAccessQuery = createQuery({
			data: { project_id: 'project-1', created_by: 'owner-actor' },
			error: null
		});
		outgoingEdgesQuery = createQuery({
			data: [
				{
					id: 'edge-1',
					project_id: 'project-1',
					src_id: 'task-1',
					src_kind: 'task',
					dst_id: 'doc-1',
					dst_kind: 'document',
					rel: 'has_document'
				}
			],
			error: null
		});

		let edgeQueryCount = 0;
		mockSupabase = {
			rpc: vi.fn((fn: string) => {
				if (fn === 'current_actor_has_project_access') {
					return Promise.resolve({ data: true, error: null });
				}
				if (fn === 'ensure_actor_for_user') {
					return Promise.resolve({ data: 'collaborator-actor', error: null });
				}
				return Promise.resolve({ data: null, error: null });
			}),
			from: vi.fn((table: string) => {
				if (table === 'onto_projects') {
					return createQuery({ data: null, error: null });
				}
				if (table === 'onto_tasks') {
					return taskAccessQuery;
				}
				if (table === 'onto_edges') {
					edgeQueryCount += 1;
					return edgeQueryCount === 1
						? outgoingEdgesQuery
						: createQuery({ data: [], error: null });
				}
				return createQuery({ data: null, error: null });
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

	it('allows read relationship tools for an entity in a readable shared project', async () => {
		const executor = new UtilityExecutor(context);

		const result = await executor.getEntityRelationships({
			entity_id: 'task-1',
			direction: 'both'
		});

		expect(mockSupabase.rpc).toHaveBeenCalledWith('current_actor_has_project_access', {
			p_project_id: 'project-1',
			p_required_access: 'read'
		});
		expect(taskAccessQuery.select).toHaveBeenCalledWith('project_id, created_by');
		expect(taskAccessQuery.eq).toHaveBeenCalledWith('id', 'task-1');
		expect(outgoingEdgesQuery.eq).toHaveBeenCalledWith('src_id', 'task-1');
		expect(result.relationships).toHaveLength(1);
		expect(result.relationships[0].direction).toBe('outgoing');
	});
});
