// apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.search.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { OntologyReadExecutor } from './ontology-read-executor';
import type { ExecutorContext } from './types';

describe('OntologyReadExecutor searchOntoTasks', () => {
	let taskQuery: Record<string, any>;
	let mockSupabase: SupabaseClient<Database>;
	let context: ExecutorContext;

	beforeEach(() => {
		taskQuery = {
			select: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			is: vi.fn().mockReturnThis(),
			order: vi.fn().mockReturnThis(),
			or: vi.fn().mockReturnThis(),
			limit: vi.fn().mockResolvedValue({ data: [], count: 0, error: null })
		};

		mockSupabase = {
			from: vi.fn(() => taskQuery),
			rpc: vi.fn().mockResolvedValue({ data: 'actor-1', error: null }),
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

	it('treats explicit OR queries as alternative title or description matches', async () => {
		const executor = new OntologyReadExecutor(context);

		await executor.searchOntoTasks({
			query: 'content OR post OR Instagram OR blog OR Quora OR profile',
			limit: 20
		});

		const filter = taskQuery.or.mock.calls[0]?.[0] as string;

		expect(filter).toContain('title.ilike."%content%"');
		expect(filter).toContain('description.ilike."%content%"');
		expect(filter).toContain('title.ilike."%Instagram%"');
		expect(filter).toContain('description.ilike."%Instagram%"');
		expect(filter).toContain('title.ilike."%Quora%"');
		expect(filter).toContain('description.ilike."%Quora%"');
		expect(filter).not.toContain('content OR post OR Instagram');
	});
});
