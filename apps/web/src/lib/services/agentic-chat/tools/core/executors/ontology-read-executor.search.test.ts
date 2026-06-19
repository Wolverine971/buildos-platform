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

	it('requires each significant token to match so word order does not matter', async () => {
		const executor = new OntologyReadExecutor(context);

		await executor.searchOntoTasks({ query: 'ideas for blog posts', limit: 20 });

		// One .or() group per significant token (AND across tokens in PostgREST);
		// the stopword "for" is dropped. (Other .or() calls come from project-access
		// scoping, so isolate the task keyword filters by their title field.)
		const tokenCalls = taskQuery.or.mock.calls
			.map((call: any[]) => call[0] as string)
			.filter((filter: string) => filter.includes('title.ilike'));
		expect(tokenCalls).toEqual([
			'title.ilike."%ideas%",description.ilike."%ideas%"',
			'title.ilike."%blog%",description.ilike."%blog%"',
			'title.ilike."%posts%",description.ilike."%posts%"'
		]);
	});

	it('matches a single-word query across title and description', async () => {
		const executor = new OntologyReadExecutor(context);

		await executor.searchOntoTasks({ query: 'roadmap' });

		const tokenCalls = taskQuery.or.mock.calls
			.map((call: any[]) => call[0] as string)
			.filter((filter: string) => filter.includes('title.ilike'));
		expect(tokenCalls).toEqual(['title.ilike."%roadmap%",description.ilike."%roadmap%"']);
	});
});

describe('OntologyReadExecutor searchOntoDocuments', () => {
	let docQuery: Record<string, any>;
	let mockSupabase: SupabaseClient<Database>;
	let context: ExecutorContext;

	beforeEach(() => {
		docQuery = {
			select: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			is: vi.fn().mockReturnThis(),
			order: vi.fn().mockReturnThis(),
			or: vi.fn().mockReturnThis(),
			limit: vi.fn().mockResolvedValue({ data: [], count: 0, error: null })
		};

		mockSupabase = {
			from: vi.fn(() => docQuery),
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

	it('searches title, description, and body content (not title alone)', async () => {
		const executor = new OntologyReadExecutor(context);

		await executor.searchOntoDocuments({ query: 'launch' });

		const filter = docQuery.or.mock.calls[0]?.[0] as string;
		expect(filter).toContain('title.ilike."%launch%"');
		expect(filter).toContain('description.ilike."%launch%"');
		expect(filter).toContain('content.ilike."%launch%"');
	});
});
