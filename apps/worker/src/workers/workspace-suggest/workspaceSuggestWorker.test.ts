// apps/worker/src/workers/workspace-suggest/workspaceSuggestWorker.test.ts
// The person is the queue row owner; metadata cannot point the run at someone else.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../lib/services/smart-llm-service', () => ({ SmartLLMService: vi.fn() }));

import { processWorkspaceSuggestJob } from './workspaceSuggestWorker';

const OWNER = 'user-owner';
const OTHER = 'user-other';

function fakeDb() {
	const calls: string[] = [];
	const inserts: Array<Record<string, unknown>> = [];
	const updates: Array<{ table: string; values: unknown }> = [];
	const rows: Record<string, unknown> = {
		onto_projects: {
			id: 'ws-1',
			kind: 'workspace',
			created_by: 'actor-owner',
			deleted_at: null,
			doc_structure: null
		},
		onto_actors: { id: 'actor-owner', user_id: OWNER },
		queue_jobs: [],
		onto_documents: [
			{
				id: 'doc-1',
				title: 'Tomatoes',
				type_key: 'document.note',
				content: 'plant',
				created_at: '2026-11-01T00:00:00Z'
			},
			{
				id: 'doc-2',
				title: 'Compost',
				type_key: 'document.note',
				content: 'bins',
				created_at: '2026-11-02T00:00:00Z'
			}
		],
		onto_tasks: [],
		workspace_suggestions: []
	};
	const db = {
		from(table: string) {
			calls.push(table);
			const result = { data: rows[table] ?? null, error: null };
			const node: any = {};
			for (const method of ['select', 'eq', 'is', 'neq', 'in', 'gte', 'order', 'limit'])
				node[method] = () => node;
			node.maybeSingle = () => Promise.resolve(result);
			node.then = (resolve: (value: unknown) => unknown) =>
				Promise.resolve(result).then(resolve);
			node.insert = (row: Record<string, unknown>) => {
				inserts.push(row);
				return Promise.resolve({ error: null });
			};
			node.update = (values: unknown) => {
				updates.push({ table, values });
				return node;
			};
			return node;
		},
		rpc: () => Promise.resolve({ data: [], error: null })
	};
	return { db: db as never, calls, inserts, updates };
}

const job = (userId: string, metadataUserId: string | undefined = userId) =>
	({
		id: 'job-1',
		userId,
		data: { userId: metadataUserId, workspaceProjectId: 'ws-1', reason: 'requested' },
		attempts: 0,
		signal: new AbortController().signal,
		log: vi.fn(),
		updateProgress: vi.fn()
	}) as never;

const llm = () => ({
	getJSONResponse: vi.fn().mockResolvedValue({
		groups: [{ name: 'Garden', items: ['N1', 'N2'], why: 'both garden', confidence: 0.9 }],
		filings: []
	})
});

describe('processWorkspaceSuggestJob identity', () => {
	it('skips metadata that names a different user, before reading anything', async () => {
		const { db, calls, inserts } = fakeDb();
		const model = llm();
		const result = await processWorkspaceSuggestJob(job(OTHER, OWNER), {
			supabase: db,
			llm: model
		});
		expect(result).toMatchObject({
			outcome: 'skipped',
			reason: 'user mismatch',
			userId: OTHER
		});
		expect(calls).toEqual([]);
		expect(inserts).toEqual([]);
		expect(model.getJSONResponse).not.toHaveBeenCalled();
	});

	it('skips a queue owner who does not own the Workspace', async () => {
		const { db, inserts, updates } = fakeDb();
		const model = llm();
		const result = await processWorkspaceSuggestJob(job(OTHER), { supabase: db, llm: model });
		expect(result).toMatchObject({ outcome: 'skipped', reason: 'not the owner' });
		expect(inserts).toEqual([]);
		expect(updates).toEqual([]);
		expect(model.getJSONResponse).not.toHaveBeenCalled();
	});

	it('runs for the owner and writes suggestions under the queue row owner', async () => {
		const { db, inserts } = fakeDb();
		const model = llm();
		const result = await processWorkspaceSuggestJob(job(OWNER), { supabase: db, llm: model });
		expect(result).toMatchObject({ outcome: 'suggested', created: 1, userId: OWNER });
		expect(inserts[0]).toMatchObject({ user_id: OWNER, workspace_project_id: 'ws-1' });
	});

	it('runs for the owner when metadata omits userId', async () => {
		const { db } = fakeDb();
		const result = await processWorkspaceSuggestJob(job(OWNER, undefined), {
			supabase: db,
			llm: llm()
		});
		expect(result).toMatchObject({ outcome: 'suggested', userId: OWNER });
	});
});
