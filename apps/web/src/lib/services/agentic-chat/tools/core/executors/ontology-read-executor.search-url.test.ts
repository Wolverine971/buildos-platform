// apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.search-url.test.ts
//
// Integration-style test that runs applyKeywordSearch against a REAL postgrest-js
// query builder (not a mock that returns `this`) and inspects the URL it generates.
// This is the decisive check that multi-token keyword search actually AND-combines:
// postgrest-js `.or()` APPENDS an `or=(...)` query param, and PostgREST combines
// repeated top-level `or=` params with AND. So N chained `.or()` calls => N tokens
// all required (AND across tokens), each matching any field (OR within the group).
import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { OntologyReadExecutor } from './ontology-read-executor';
import type { ExecutorContext } from './types';

function makeExecutor() {
	// Dummy URL/key — no request is ever sent; we only inspect the built URL.
	const supabase = createClient<Database>('http://localhost:54321', 'test-anon-key');
	const context: ExecutorContext = {
		supabase: supabase as any,
		userId: 'user-1',
		sessionId: 'session-1',
		fetchFn: (() => {
			throw new Error('fetch should not be called in this test');
		}) as unknown as typeof fetch
	};
	return { executor: new OntologyReadExecutor(context), supabase };
}

function orParamsFor(query: unknown): string[] {
	// PostgrestFilterBuilder exposes the in-progress URL; getAll preserves repeats.
	return (query as any).url.searchParams.getAll('or');
}

describe('applyKeywordSearch URL generation (real postgrest builder)', () => {
	it('AND-combines multi-word queries: one or= param per significant token', () => {
		const { executor, supabase } = makeExecutor();
		const base = supabase.from('onto_tasks').select('id');

		const q = (executor as any).applyKeywordSearch(base, 'ideas for blog posts', [
			'title',
			'description'
		]);

		// Three separate or= params => three AND-ed groups. "for" is dropped (stopword).
		expect(orParamsFor(q)).toEqual([
			'(title.ilike."%ideas%",description.ilike."%ideas%")',
			'(title.ilike."%blog%",description.ilike."%blog%")',
			'(title.ilike."%posts%",description.ilike."%posts%")'
		]);
	});

	it('single-word query produces exactly one or= group across fields', () => {
		const { executor, supabase } = makeExecutor();
		const base = supabase.from('onto_tasks').select('id');

		const q = (executor as any).applyKeywordSearch(base, 'roadmap', ['title', 'description']);

		expect(orParamsFor(q)).toEqual(['(title.ilike."%roadmap%",description.ilike."%roadmap%")']);
	});

	it('explicit OR query stays a single or= group (alternatives, not AND)', () => {
		const { executor, supabase } = makeExecutor();
		const base = supabase.from('onto_tasks').select('id');

		const q = (executor as any).applyKeywordSearch(base, 'blog OR instagram', [
			'title',
			'description'
		]);

		const params = orParamsFor(q);
		expect(params).toHaveLength(1);
		expect(params[0]).toContain('title.ilike."%blog%"');
		expect(params[0]).toContain('description.ilike."%blog%"');
		expect(params[0]).toContain('title.ilike."%instagram%"');
		expect(params[0]).toContain('description.ilike."%instagram%"');
	});

	it('document search targets title, description, and body content', () => {
		const { executor, supabase } = makeExecutor();
		const base = supabase.from('onto_documents').select('id');

		const q = (executor as any).applyKeywordSearch(base, 'launch', [
			'title',
			'description',
			'content'
		]);

		expect(orParamsFor(q)).toEqual([
			'(title.ilike."%launch%",description.ilike."%launch%",content.ilike."%launch%")'
		]);
	});

	it('all-stopword / too-short queries fall back to a single whole-term group', () => {
		const { executor, supabase } = makeExecutor();
		const base = supabase.from('onto_tasks').select('id');

		const q = (executor as any).applyKeywordSearch(base, 'to in', ['title', 'description']);

		// "to"/"in" are stopwords => no tokens survive => fall back to the raw term.
		expect(orParamsFor(q)).toEqual(['(title.ilike."%to in%",description.ilike."%to in%")']);
	});
});
