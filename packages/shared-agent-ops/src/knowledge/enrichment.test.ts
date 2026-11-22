// packages/shared-agent-ops/src/knowledge/enrichment.test.ts
// Find more at scale (tasker 164): per-kind fields, per-target instructions, batches of runs,
// cancelling, and the list's researched filter. A small in-memory client stands in for the
// service-role Supabase client.
import { describe, expect, it } from 'vitest';
import {
	cancelKnowledgeResearch,
	dailyEnrichBudgetFor,
	DEFAULT_ENRICH_FIELDS,
	enrichFieldsFor,
	enrichTargetInstructions,
	MAX_ENRICH_BATCH,
	MAX_ENRICH_TARGETS,
	startKnowledgeEnrichment,
	startKnowledgeEnrichmentBatches
} from './enrichment';
import { KnowledgeStore } from './knowledge-store';

type Row = Record<string, any>;

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

class Query {
	private op: 'select' | 'insert' | 'update' = 'select';
	private filters: Array<(r: Row) => boolean> = [];
	private payload: Row[] = [];
	private patch: Row = {};
	private max = Infinity;
	private maybe = false;
	constructor(
		private db: FakeDb,
		private table: string
	) {}
	select() {
		return this;
	}
	insert(rows: Row | Row[]) {
		this.op = 'insert';
		this.payload = Array.isArray(rows) ? rows : [rows];
		return this;
	}
	update(patch: Row) {
		this.op = 'update';
		this.patch = patch;
		return this;
	}
	eq(col: string, value: unknown) {
		this.filters.push((r) => r[col] === value);
		return this;
	}
	in(col: string, values: unknown[]) {
		this.filters.push((r) => values.includes(r[col]));
		return this;
	}
	or(expr: string) {
		const parts = expr.split(',').map((p) => p.split('.eq.'));
		this.filters.push((r) => parts.some(([col, value]) => String(r[col!]) === value));
		return this;
	}
	order() {
		return this;
	}
	limit(n: number) {
		this.max = n;
		return this;
	}
	maybeSingle() {
		this.maybe = true;
		return this;
	}
	then<A, B>(
		ok?: ((v: { data: any; error: any }) => A) | null,
		fail?: ((e: unknown) => B) | null
	) {
		return Promise.resolve(this.run()).then(ok, fail);
	}
	private run() {
		const rows = this.db.rows(this.table);
		if (this.op === 'insert') {
			const added = this.payload.map((r, i) => ({
				id: `${this.table}-${rows.length + i}`,
				...r
			}));
			rows.push(...added);
			return { data: added, error: null };
		}
		const hit = rows.filter((r) => this.filters.every((f) => f(r))).slice(0, this.max);
		if (this.op === 'update') for (const r of hit) Object.assign(r, this.patch);
		const data = hit.map((r) => ({ ...r }));
		return { data: this.maybe ? (data[0] ?? null) : data, error: null };
	}
}

class FakeDb {
	tables = new Map<string, Row[]>();
	calls: Array<{ fn: string; args: Row }> = [];
	reserve: (args: Row, call: number) => Row = (args) => ({
		id: uuid(
			900 + this.calls.filter((c) => c.fn === 'knowledge_reserve_enrichment_run').length
		),
		budget: args.p_requested_budget
	});
	rows(table: string) {
		if (!this.tables.has(table)) this.tables.set(table, []);
		return this.tables.get(table)!;
	}
	from(table: string) {
		return new Query(this, table);
	}
	async rpc(fn: string, args: Row) {
		this.calls.push({ fn, args });
		if (fn === 'knowledge_reserve_enrichment_run') {
			const n = this.calls.filter((c) => c.fn === fn).length;
			return { data: this.reserve(args, n), error: null };
		}
		if (fn === 'add_queue_job') return { data: 'job', error: null };
		if (fn === 'knowledge_list') return { data: { entities: [], total: 0 }, error: null };
		return { data: null, error: { message: `rpc ${fn} not faked` } };
	}
}

function entity(id: string, kind: string, name: string, extra: Row = {}): Row {
	return {
		id,
		kind,
		name,
		summary: null,
		scope: 'private',
		owner_user_id: USER,
		is_self: false,
		image_url: null,
		status: 'active',
		merged_into_id: null,
		...extra
	};
}

describe('enrichFieldsFor', () => {
	it('keeps only fields that fit the kind and never researches private details of people', () => {
		expect(
			enrichFieldsFor('person', ['homepage', 'address', 'works_at', 'url', 'birthday'])
		).toEqual(['homepage', 'works_at']);
		// Phone and email only when asked for ("Phone & email"), never by default.
		expect(enrichFieldsFor('person', ['phone', 'email', 'address'])).toEqual([
			'phone',
			'email'
		]);
		expect(dailyEnrichBudgetFor({ is_admin: true })).toBe(5);
		expect(dailyEnrichBudgetFor({ is_admin: false })).toBe(0.5);
		expect(dailyEnrichBudgetFor(null)).toBe(0.5);
		expect(enrichFieldsFor('org', ['address', 'homepage', 'headline'])).toEqual([
			'address',
			'homepage'
		]);
	});

	it("falls back to the kind's usual fields when nothing requested fits", () => {
		// The website defaults also list "owns", which only people and orgs can have: dropped.
		expect(enrichFieldsFor('website', ['headline', 'works_at'])).toEqual([
			'description',
			'about'
		]);
		expect(enrichFieldsFor('person')).toEqual(DEFAULT_ENRICH_FIELDS.person);
		expect(enrichFieldsFor('person')).not.toContain('phone');
	});
});

describe('enrichTargetInstructions', () => {
	it('puts the entry note before the batch text and drops blanks', () => {
		expect(enrichTargetInstructions('Find their HQ', 'Ignore the 2019 company')).toBe(
			'Ignore the 2019 company\nFind their HQ'
		);
		expect(enrichTargetInstructions('  ', null)).toBeNull();
		expect(enrichTargetInstructions('x'.repeat(2000), 'y'.repeat(2000))!.length).toBe(
			500 + 1 + 600
		);
	});
});

describe('startKnowledgeEnrichment', () => {
	it('gives every target its own fields and instructions', async () => {
		const db = new FakeDb();
		db.rows('knowledge_entities').push(
			entity(uuid(1), 'person', 'Sam Rivera'),
			entity(uuid(2), 'org', 'Acme'),
			entity(uuid(3), 'person', 'Not mine', { owner_user_id: OTHER })
		);
		const result = await startKnowledgeEnrichment(db, USER, {
			entityIds: [uuid(1), uuid(2), uuid(3)],
			fields: ['works_at', 'address', 'homepage'],
			instructions: 'Look for podcasts',
			entryInstructions: { [uuid(2)]: 'The Baltimore one' }
		});
		expect(result.skipped).toEqual([{ entity_id: uuid(3), reason: 'not found' }]);
		const targets = db.rows('knowledge_run_targets');
		expect(targets).toHaveLength(2);
		const sam = targets.find((t) => t.entity_id === uuid(1))!;
		const acme = targets.find((t) => t.entity_id === uuid(2))!;
		expect(sam.fields).toEqual(['works_at', 'homepage']);
		expect(sam.instructions).toBe('Look for podcasts');
		expect(acme.fields).toEqual(['address', 'homepage']);
		expect(acme.instructions).toBe('The Baltimore one\nLook for podcasts');
		const reserve = db.calls.find((c) => c.fn === 'knowledge_reserve_enrichment_run')!;
		expect(reserve.args.p_input.instructions).toBe('Look for podcasts');
		expect(reserve.args.p_requested_budget).toBeCloseTo(0.06);
	});
});

describe('startKnowledgeEnrichmentBatches', () => {
	function seeded(n: number) {
		const db = new FakeDb();
		for (let i = 1; i <= n; i++)
			db.rows('knowledge_entities').push(entity(uuid(i), 'org', `Org ${i}`));
		return db;
	}

	it('splits a big Enrich into runs of 25 and queues one job per run', async () => {
		const db = seeded(30);
		const ids = Array.from({ length: 30 }, (_, i) => uuid(i + 1));
		const result = await startKnowledgeEnrichmentBatches(db, USER, { entityIds: ids });
		expect(result.runs.map((r) => r.targets.length)).toEqual([MAX_ENRICH_TARGETS, 5]);
		expect(result.not_queued).toEqual([]);
		expect(db.calls.filter((c) => c.fn === 'add_queue_job')).toHaveLength(2);
	});

	it('keeps runs already started when a later one is refused, and lists the rest', async () => {
		const db = seeded(30);
		db.reserve = (args, call) =>
			call === 1 ? { id: uuid(901), budget: args.p_requested_budget } : { error: 'busy' };
		const ids = Array.from({ length: 30 }, (_, i) => uuid(i + 1));
		const result = await startKnowledgeEnrichmentBatches(db, USER, { entityIds: ids });
		expect(result.runs).toHaveLength(1);
		expect(result.not_queued).toEqual(ids.slice(25));
		expect(result.refused).toMatch(/research runs going/);
	});

	it('throws when nothing could start, and refuses more than one click allows', async () => {
		const db = seeded(2);
		db.reserve = () => ({ error: 'spent' });
		await expect(
			startKnowledgeEnrichmentBatches(db, USER, { entityIds: [uuid(1), uuid(2)] })
		).rejects.toThrow(/allowance/);
		const tooMany = Array.from({ length: MAX_ENRICH_BATCH + 1 }, (_, i) => uuid(i + 1));
		await expect(
			startKnowledgeEnrichmentBatches(db, USER, { entityIds: tooMany })
		).rejects.toThrow(/at most/);
	});
});

describe('cancelKnowledgeResearch', () => {
	function withRun(status: string, targets: Array<[string, string, string?]>) {
		const db = new FakeDb();
		db.rows('knowledge_runs').push({ id: 'run', owner_user_id: USER, status });
		for (const [id, targetStatus, owner] of targets) {
			db.rows('knowledge_run_targets').push({
				id,
				run_id: 'run',
				owner_user_id: owner ?? USER,
				status: targetStatus
			});
		}
		return db;
	}
	const status = (db: FakeDb, table: string, id: string) =>
		db.rows(table).find((r) => r.id === id)!.status;

	it('stops one waiting entry and closes a run the worker never started', async () => {
		const db = withRun('queued', [['t1', 'queued']]);
		expect(await cancelKnowledgeResearch(db, USER, { targetId: 't1' })).toEqual({
			cancelled: 1
		});
		expect(status(db, 'knowledge_run_targets', 't1')).toBe('cancelled');
		expect(status(db, 'knowledge_runs', 'run')).toBe('cancelled');
	});

	it('leaves a running run to the worker when other entries are still going', async () => {
		const db = withRun('running', [
			['t1', 'running'],
			['t2', 'queued']
		]);
		await cancelKnowledgeResearch(db, USER, { targetId: 't1' });
		expect(status(db, 'knowledge_run_targets', 't1')).toBe('cancelled');
		expect(status(db, 'knowledge_run_targets', 't2')).toBe('queued');
		expect(status(db, 'knowledge_runs', 'run')).toBe('running');
	});

	it("never touches another user's research or finished entries", async () => {
		const db = withRun('running', [
			['mine', 'done'],
			['theirs', 'queued', OTHER]
		]);
		expect(await cancelKnowledgeResearch(db, USER, { targetId: 'theirs' })).toEqual({
			cancelled: 0
		});
		expect(await cancelKnowledgeResearch(db, USER, { targetId: 'mine' })).toEqual({
			cancelled: 0
		});
		expect(status(db, 'knowledge_run_targets', 'theirs')).toBe('queued');
	});

	it('stops a whole run and its unfinished entries', async () => {
		const db = withRun('running', [
			['t1', 'done'],
			['t2', 'running'],
			['t3', 'queued']
		]);
		expect(await cancelKnowledgeResearch(db, USER, { runId: 'run' })).toEqual({ cancelled: 2 });
		expect(status(db, 'knowledge_runs', 'run')).toBe('cancelled');
		expect(status(db, 'knowledge_run_targets', 't1')).toBe('done');
		expect(status(db, 'knowledge_run_targets', 't3')).toBe('cancelled');
		expect(await cancelKnowledgeResearch(db, OTHER, { runId: 'run' })).toEqual({
			cancelled: 0
		});
	});
});

describe('KnowledgeStore.list research options', () => {
	it('sends the researched filter and sort only when set', async () => {
		const db = new FakeDb();
		const store = new KnowledgeStore(db, USER);
		await store.list();
		await store.list({ researched: 'no', sort: 'name' });
		const [plain, filtered] = db.calls.filter((c) => c.fn === 'knowledge_list');
		expect(plain!.args).not.toHaveProperty('p_researched');
		expect(plain!.args).not.toHaveProperty('p_sort');
		expect(filtered!.args).toMatchObject({
			p_researched: 'no',
			p_sort: 'name',
			p_viewer: USER
		});
	});

	it('sends a direction only when it flips the sort', async () => {
		const db = new FakeDb();
		const store = new KnowledgeStore(db, USER);
		await store.list({ sort: 'name', dir: 'asc' });
		await store.list({ sort: 'tasks', dir: 'desc' });
		await store.list({ dir: 'desc' });
		await store.list({ sort: 'name', dir: 'desc' });
		await store.list({ sort: 'tasks', dir: 'asc' });
		await store.list({ dir: 'asc' });
		const sent = db.calls
			.filter((c) => c.fn === 'knowledge_list')
			.map((c) => [c.args.p_sort ?? null, c.args.p_dir ?? null]);
		expect(sent).toEqual([
			['name', null],
			['tasks', null],
			[null, null],
			['name', 'desc'],
			['tasks', 'asc'],
			[null, 'asc']
		]);
	});
});
