// apps/worker/tests/consolidationCheck.test.ts
//
// Quick duplicate check (tasker 122): the check-mode survey path against an
// in-memory database and a mocked model, the worker start helper's scope and
// access rules, and the scope-aware survey prompts. No network, no model spend.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;

const { db, writes, fake, getJSONResponse } = vi.hoisted(() => {
	type Row = Record<string, any>;
	const db: Record<string, Row[]> = {};
	const writes: Array<{ table: string; op: string; payload: unknown }> = [];
	/** Just enough of the Supabase query builder for the consolidation worker's calls. */
	const fake = {
		from(table: string) {
			const filters: Array<(row: Row) => boolean> = [];
			let op: 'select' | 'update' | 'insert' | 'delete' = 'select';
			let payload: Row | null = null;
			const rows = () => (db[table] ??= []);
			const run = () => {
				if (op === 'insert') {
					const row = { id: `${table}-${rows().length + 1}`, ...payload };
					rows().push(row);
					writes.push({ table, op, payload });
					return [row];
				}
				const matched = rows().filter((row) => filters.every((test) => test(row)));
				if (op === 'update') {
					for (const row of matched) Object.assign(row, payload);
					writes.push({ table, op, payload });
				}
				if (op === 'delete') writes.push({ table, op, payload: null });
				return matched;
			};
			const builder: any = {
				select: () => builder,
				order: () => builder,
				limit: () => builder,
				gte: (column: string, value: string) => (
					filters.push((row) =>
						row[column] === undefined ? true : String(row[column]) >= value
					),
					builder
				),
				like: () => builder,
				not: () => builder,
				// JSON-path filters (llm_usage_logs metadata) match every row here.
				eq: (column: string, value: unknown) => (
					filters.push((row) => (column.includes('->>') ? true : row[column] === value)),
					builder
				),
				neq: (column: string, value: unknown) => (
					filters.push((row) => row[column] !== value),
					builder
				),
				in: (column: string, values: unknown[]) => (
					filters.push((row) => values.includes(row[column])),
					builder
				),
				is: (column: string, value: unknown) => (
					filters.push((row) => (row[column] ?? null) === value),
					builder
				),
				update: (patch: Row) => ((op = 'update'), (payload = patch), builder),
				insert: (row: Row) => ((op = 'insert'), (payload = row), builder),
				delete: () => ((op = 'delete'), builder),
				maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
				single: async () => ({ data: run()[0] ?? null, error: null }),
				then: (resolve: (value: unknown) => void, reject: (error: unknown) => void) =>
					Promise.resolve({ data: run(), error: null }).then(resolve, reject)
			};
			return builder;
		},
		rpc: vi.fn()
	};
	return { db, writes, fake, getJSONResponse: vi.fn() };
});

vi.mock('../src/lib/supabase', () => ({ supabase: fake }));
vi.mock('../src/lib/services/smart-llm-service', () => ({
	SmartLLMService: class {
		getJSONResponse = getJSONResponse;
	}
}));

import { processConsolidationRun } from '../src/workers/consolidation/consolidationJob';
import { startConsolidationCheck } from '../src/workers/consolidation/startCheck';
import {
	GROUPS_SYSTEM_PROMPT,
	type Inventory,
	decideSystemPrompt,
	groupsSystemPrompt,
	withAllTwins
} from '../src/workers/consolidation/survey';

const USER = 'user-1';
const RUN = '00000000-0000-4000-8000-0000000000aa';
const WAYNE = 'aaaaaaaa-0000-4000-8000-000000000001';
const CADRE = 'aaaaaaaa-0000-4000-8000-000000000002';
const P_STUDIO = 'aaaaaaaa-0000-4000-8000-000000000003';
const D = (n: number) => `dddddddd-0000-4000-8000-${String(n).padStart(12, '0')}`;
const T = (n: number) => `eeeeeeee-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SAME = '# Intake template\nPurpose: capture first impressions of every new client.';

function document(n: number, project_id: string, extra: Row = {}): Row {
	return {
		id: D(n),
		project_id,
		title: `Doc ${n}`,
		description: null,
		type_key: 'document.default',
		content: `Doc ${n} body`,
		content_hash: null,
		outline: null,
		props: {},
		created_at: `2026-10-0${n}T00:00:00Z`,
		updated_at: `2026-10-0${n}T00:00:00Z`,
		state_key: 'draft',
		deleted_at: null,
		archived_at: null,
		...extra
	};
}

function seed(overrides: { documents?: Row[]; tasks?: Row[] } = {}) {
	for (const key of Object.keys(db)) delete db[key];
	writes.length = 0;
	db.consolidation_runs = [
		{
			id: RUN,
			user_id: USER,
			root_project_id: WAYNE,
			project_ids: [WAYNE, CADRE],
			mode: 'check',
			request: null,
			status: 'surveying',
			plan: null,
			cost_usd: 0,
			created_at: '2026-10-17T00:00:00Z'
		}
	];
	// Cadre is not under Wayne: a check before nesting it there.
	db.onto_projects = [
		{
			id: WAYNE,
			name: 'Wayne Strategies',
			description: 'Agency',
			parent_project_id: null,
			shared_folder_document_id: null,
			doc_structure: null,
			deleted_at: null
		},
		{
			id: CADRE,
			name: 'Cadre',
			description: 'Client',
			parent_project_id: null,
			shared_folder_document_id: null,
			doc_structure: null,
			deleted_at: null
		}
	];
	db.onto_documents = overrides.documents ?? [
		document(1, WAYNE, { title: 'Intake template', content: SAME, content_hash: 'h1' }),
		document(2, CADRE, { title: 'Brief v1' }),
		document(3, CADRE, { title: 'Brief v2' }),
		document(4, CADRE, { title: 'Intake template copy', content: SAME, content_hash: 'h1' })
	];
	db.onto_tasks = overrides.tasks ?? [
		{
			id: T(1),
			project_id: WAYNE,
			title: 'Send invoice',
			description: null,
			state_key: 'todo',
			due_at: null,
			created_at: '2026-10-01T00:00:00Z',
			deleted_at: null,
			archived_at: null
		},
		{
			id: T(2),
			project_id: CADRE,
			title: 'Invoice Cadre',
			description: null,
			state_key: 'todo',
			due_at: null,
			created_at: '2026-10-02T00:00:00Z',
			deleted_at: null,
			archived_at: null
		}
	];
	db.llm_usage_logs = [{ total_cost_usd: 0.0062 }];
}

function job(action: 'survey' | 'replan' = 'survey') {
	return {
		id: 'job-1',
		correlationId: null,
		userId: USER,
		data: { runId: RUN, userId: USER, action, questionId: 'q1' },
		attempts: 0,
		maxAttempts: 3,
		signal: new AbortController().signal,
		updateProgress: vi.fn(async () => undefined),
		log: vi.fn(async () => undefined)
	} as any;
}

beforeEach(() => {
	getJSONResponse.mockReset();
	fake.rpc.mockReset();
	seed();
});

describe('check-mode survey', () => {
	it('makes one grouping call, stores the groups keep-only and ends checked', async () => {
		getJSONResponse.mockImplementation(async (params: any) => {
			await params.onUsage({ totalCost: 0.006 });
			return {
				groups: [
					{
						kind: 'duplicate_tasks',
						title: 'Invoice',
						tasks: ['T1', 'T2'],
						reason: 'Same work.'
					},
					{
						kind: 'versions',
						title: 'Brief',
						documents: ['D2', 'D3'],
						reason: 'Two versions.'
					}
				]
			};
		});

		const result = await processConsolidationRun(job());

		expect(getJSONResponse).toHaveBeenCalledTimes(1);
		const call = getJSONResponse.mock.calls[0]![0];
		expect(call.operationType).toBe('consolidation_check_groups');
		// Not a parent and its sub-projects: the set wording, with roles main and other.
		expect(call.systemPrompt).toContain('a set of related projects');
		expect(call.systemPrompt).not.toContain('sub-project');
		expect(JSON.parse(call.userPrompt).projects.map((p: Row) => p.role)).toEqual([
			'main',
			'other'
		]);

		const run = db.consolidation_runs![0]!;
		expect(run.status).toBe('checked');
		expect(run.finished_at).toEqual(expect.any(String));
		expect(run.cost_usd).toBe(0.0062);
		expect(run.progress).toMatchObject({ stage: 'done', documents: 4, tasks: 2, groups: 3 });
		expect(result).toEqual({ groups: 3, cost_usd: 0.0062 });
		// The model missed the identical copies; the free twin pass adds them.
		expect(run.plan.clusters.map((c: Row) => [c.kind, c.document_ids, c.task_ids])).toEqual([
			['duplicate_tasks', [], [T(1), T(2)]],
			['versions', [D(2), D(3)], undefined],
			['twins', [D(1), D(4)], undefined]
		]);
		for (const cluster of run.plan.clusters) {
			expect(cluster.question_id).toBeNull();
			expect(cluster.ops.every((op: Row) => op.op === 'keep')).toBe(true);
		}
		expect(Object.keys(run.plan.documents).sort()).toEqual([D(1), D(2), D(3), D(4)].sort());

		// It only ever wrote the run: no question cards, no user content.
		expect(new Set(writes.map((write) => write.table))).toEqual(
			new Set(['consolidation_runs'])
		);
	});

	it('passes the owner’s request to the grouping call', async () => {
		db.consolidation_runs![0]!.request = 'Look for Cadre docs that repeat Wayne ones';
		getJSONResponse.mockResolvedValue({ groups: [] });
		await processConsolidationRun(job());
		const call = getJSONResponse.mock.calls[0]![0];
		expect(JSON.parse(call.userPrompt).owner_request).toBe(
			'Look for Cadre docs that repeat Wayne ones'
		);
		expect(call.systemPrompt).toContain('`owner_request`');
	});

	it('skips the call when there is nothing to compare', async () => {
		seed({ documents: [document(1, WAYNE)], tasks: [] });
		await processConsolidationRun(job());
		expect(getJSONResponse).not.toHaveBeenCalled();
		expect(db.consolidation_runs![0]).toMatchObject({ status: 'checked' });
		expect(db.consolidation_runs![0]!.plan.clusters).toEqual([]);
	});

	it('never replans, merges or answers for a check run', async () => {
		for (const status of ['checked', 'review']) {
			db.consolidation_runs![0]!.status = status;
			expect(await processConsolidationRun(job('replan'))).toEqual({
				skipped: 'check runs only survey'
			});
		}
		expect(getJSONResponse).not.toHaveBeenCalled();
	});

	it('fails the run on its last attempt', async () => {
		getJSONResponse.mockRejectedValue(new Error('model down'));
		await expect(processConsolidationRun({ ...job(), attempts: 2 })).rejects.toThrow(
			'model down'
		);
		expect(db.consolidation_runs![0]).toMatchObject({ status: 'failed', error: 'model down' });
	});
});

describe('startConsolidationCheck', () => {
	const ACTOR = 'actor-1';
	function rpcWith(writable: Record<string, boolean>, queue: unknown = 'queue-row-1') {
		fake.rpc.mockImplementation(async (name: string, args: Row) => {
			if (name === 'ensure_actor_for_user') return { data: ACTOR, error: null };
			if (name === 'actor_has_project_member_access')
				return {
					data: args.p_actor_id === ACTOR && writable[args.p_project_id] === true,
					error: null
				};
			if (name === 'add_queue_job')
				return queue instanceof Error
					? { data: null, error: { message: queue.message } }
					: { data: queue, error: null };
			throw new Error(`unexpected rpc ${name}`);
		});
	}
	const start = (projectIds: string[], extra: Row = {}) =>
		startConsolidationCheck({ admin: fake as never, userId: USER, projectIds, ...extra });
	const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
	function checkRun(row: Row) {
		db.consolidation_runs!.push({
			user_id: USER,
			root_project_id: WAYNE,
			project_ids: [WAYNE, CADRE],
			mode: 'check',
			status: 'surveying',
			created_at: minutesAgo(1),
			finished_at: null,
			...row
		});
	}

	beforeEach(() => {
		db.consolidation_runs = [];
		db.onto_actors = [{ id: ACTOR, user_id: USER }];
		writes.length = 0;
	});

	it('dedupes the scope, inserts a check run and queues its survey', async () => {
		rpcWith({ [WAYNE]: true, [CADRE]: true });
		const result = await start([WAYNE, CADRE, WAYNE], { request: '  Cadre vs Wayne  ' });
		const run = db.consolidation_runs!.at(-1)!;
		expect(result).toEqual({ ok: true, run_id: run.id, existing: false });
		expect(run).toMatchObject({
			user_id: USER,
			root_project_id: WAYNE,
			project_ids: [WAYNE, CADRE],
			mode: 'check',
			request: 'Cadre vs Wayne'
		});
		const queued = fake.rpc.mock.calls.find(([name]) => name === 'add_queue_job')![1];
		expect(queued).toMatchObject({
			p_user_id: USER,
			p_job_type: 'consolidation_run',
			p_priority: 4,
			p_dedup_key: `consolidation:${run.id}:survey`,
			p_metadata: { runId: run.id, userId: USER, action: 'survey' }
		});
		expect(queued.p_metadata.correlationId).toEqual(expect.any(String));
	});

	it('hands back a running or just-finished check of the same projects, in any order', async () => {
		rpcWith({ [WAYNE]: true, [CADRE]: true });
		checkRun({ id: 'running' });
		expect(await start([CADRE, WAYNE])).toEqual({
			ok: true,
			run_id: 'running',
			existing: true
		});
		db.consolidation_runs = [];
		checkRun({
			id: 'done',
			status: 'checked',
			created_at: minutesAgo(20),
			finished_at: minutesAgo(14)
		});
		expect(await start([WAYNE, CADRE])).toEqual({ ok: true, run_id: 'done', existing: true });
		expect(writes).toEqual([]);
		expect(fake.rpc.mock.calls.some(([name]) => name === 'add_queue_job')).toBe(false);
	});

	it('pays for a new check when the last one is stale, failed, someone else’s or other projects', async () => {
		rpcWith({ [WAYNE]: true, [CADRE]: true, [P_STUDIO]: true });
		checkRun({
			id: 'stale',
			status: 'checked',
			created_at: minutesAgo(17),
			finished_at: minutesAgo(16)
		});
		checkRun({ id: 'failed', status: 'failed' });
		checkRun({ id: 'theirs', user_id: 'user-2' });
		checkRun({ id: 'wider', project_ids: [WAYNE, CADRE, P_STUDIO] });
		const result = await start([WAYNE, CADRE]);
		expect(result).toMatchObject({ ok: true, existing: false });
		expect(db.consolidation_runs).toHaveLength(5);
	});

	it('refuses when any project is not writable, even with a check to reuse', async () => {
		rpcWith({ [WAYNE]: true, [CADRE]: false });
		checkRun({ id: 'running' });
		expect(await start([WAYNE, CADRE])).toEqual({
			ok: false,
			code: 'forbidden',
			message: 'You need edit access to every project in the check.'
		});
		expect(writes).toEqual([]);
	});

	it('refuses more than 20 projects, or fewer than 2, without asking the database', async () => {
		rpcWith({});
		const many = Array.from(
			{ length: 21 },
			(_, i) => `bbbbbbbb-0000-4000-8000-${String(i).padStart(12, '0')}`
		);
		expect(await start(many)).toMatchObject({ ok: false, code: 'invalid_scope' });
		expect(await start([WAYNE, WAYNE])).toMatchObject({ ok: false, code: 'invalid_scope' });
		expect(fake.rpc).not.toHaveBeenCalled();
	});

	it('checks access as the user, never as an actor handed in for someone else', async () => {
		rpcWith({ [WAYNE]: true, [CADRE]: true });
		expect(await start([WAYNE, CADRE], { actorId: 'someone-elses-actor' })).toMatchObject({
			ok: false,
			code: 'forbidden'
		});
		expect(await start([WAYNE, CADRE], { actorId: ACTOR })).toMatchObject({
			ok: true,
			existing: false
		});
	});

	it('marks the run failed when the job cannot be queued', async () => {
		rpcWith({ [WAYNE]: true, [CADRE]: true }, new Error('queue down'));
		expect(await start([WAYNE, CADRE])).toEqual({
			ok: false,
			code: 'failed',
			message: 'Could not queue the duplicate check.'
		});
		expect(db.consolidation_runs!.at(-1)).toMatchObject({
			status: 'failed',
			error: 'Could not queue the check.'
		});
	});

	it('never throws into the chat tool, whatever breaks underneath', async () => {
		fake.rpc.mockImplementation(async () => {
			throw new Error('socket hang up');
		});
		const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		await expect(start([WAYNE, CADRE])).resolves.toEqual({
			ok: false,
			code: 'failed',
			message: 'Could not resolve your account.'
		});
		fake.rpc.mockImplementation(async (name: string) => {
			if (name === 'ensure_actor_for_user') return { data: ACTOR, error: null };
			throw new Error('socket hang up');
		});
		await expect(start([WAYNE, CADRE])).resolves.toEqual({
			ok: false,
			code: 'failed',
			message: 'Could not start the duplicate check.'
		});
		quiet.mockRestore();
	});
});

describe('survey prompts and twins', () => {
	it('keeps the family prompt the survey has always sent', () => {
		expect(groupsSystemPrompt('family')).toBe(GROUPS_SYSTEM_PROMPT);
		expect(GROUPS_SYSTEM_PROMPT).toContain(
			'You help someone tidy the documents and open tasks of one project family: a parent project and its sub-projects.'
		);
		expect(GROUPS_SYSTEM_PROMPT).not.toContain('owner_request');
	});

	it('words the decide prompts for any set of projects', () => {
		const tasks = decideSystemPrompt(
			{
				kind: 'sibling_tasks',
				title: 'x',
				document_ids: [],
				belongs_in: null,
				newer_id: null,
				reason: ''
			},
			'set'
		);
		expect(tasks).toContain('One new task in the main project');
		expect(tasks).not.toMatch(/family|sub-project/);
	});

	it('adds only the identical copies the model left out', () => {
		const inventory = {
			projects: [],
			documents: [
				{ id: 'a', title: 'A', content_hash: 'h', content: SAME, pinned: null },
				{ id: 'b', title: 'B', content_hash: 'h', content: SAME, pinned: null },
				{ id: 'c', title: 'C', content_hash: 'h', content: SAME, pinned: null },
				{ id: 'x', title: 'X', content_hash: 'k', content: SAME, pinned: null },
				{ id: 'y', title: 'Y', content_hash: 'k', content: SAME, pinned: null }
			]
		} as unknown as Inventory;
		const found = withAllTwins(
			[
				{
					kind: 'twins',
					title: 'X',
					document_ids: ['x', 'y'],
					belongs_in: null,
					newer_id: null,
					reason: ''
				},
				{
					kind: 'versions',
					title: 'A',
					document_ids: ['a'],
					belongs_in: null,
					newer_id: null,
					reason: ''
				}
			],
			inventory
		);
		expect(found.map((group) => group.document_ids)).toEqual([['x', 'y'], ['a'], ['b', 'c']]);
	});
});
