// apps/worker/src/workers/knowledge/knowledgeLocateWorker.test.ts
//
// The company lookup job (tasker 170). What a user would see go wrong, and the trigger:
//   - a guess saved as fact → only a "placed" verdict is saved as known; "unconfirmed" is a
//     suggestion; an "ask" saves nothing and files a question
//   - the same town twice in the Place filter → a town already saved under another spelling,
//     or created earlier in the same run, is reused
//   - Stop does nothing → a cancelled run stops before the next company
//   - a big import never finishes → the job hands the rest to a continuation, and the
//     continuation starts where the last one stopped
// No network, no real database: the store, the lookup and the tables are fakes.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
	CompanyOption,
	CompanyVerdict,
	KnowledgeEntityDetail,
	KnowledgeWriteBatch
} from '@buildos/shared-agent-ops/knowledge';

const store = vi.hoisted(() => ({
	details: new Map<string, unknown>(),
	recorded: [] as Array<{ batch: unknown; options: unknown }>,
	nextPlace: 0
}));
const verdicts = vi.hoisted(() => ({
	byName: new Map<string, unknown>(),
	asked: [] as Array<{ name: string; ownDomain: string | null }>,
	onLookup: null as null | ((name: string) => void | Promise<void>)
}));

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('@buildos/shared-agent-ops/knowledge', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@buildos/shared-agent-ops/knowledge')>();
	class FakeStore {
		getEntity(id: string) {
			return Promise.resolve(store.details.get(id) ?? null);
		}
		record(batch: KnowledgeWriteBatch, options: unknown) {
			store.recorded.push({ batch, options });
			return Promise.resolve({
				entities: batch.entities.map((entity) => ({
					ref: entity.ref,
					id: entity.id ?? `new-place-${++store.nextPlace}`,
					kind: entity.kind,
					name: entity.name,
					matched: entity.id ? 'id' : 'created'
				})),
				facts: { added: batch.facts.length, existing: 0, superseded: 0, suggested: 0 }
			});
		}
	}
	return { ...actual, KnowledgeStore: FakeStore };
});
vi.mock('./companyLocate', async (importOriginal) => ({
	...(await importOriginal<typeof import('./companyLocate')>()),
	locateCompany: vi.fn(async (name: string, ownDomain: string | null) => {
		verdicts.asked.push({ name, ownDomain });
		await verdicts.onLookup?.(name);
		return {
			verdict: verdicts.byName.get(name) ?? {
				outcome: 'none',
				chosen: null,
				options: [],
				total: 0
			},
			sources: {}
		};
	})
}));

import { canonicalPlace } from '@buildos/shared-agent-ops/knowledge';
import { processKnowledgeLocateJob } from './knowledgeLocateWorker';

type Row = Record<string, any>;
const USER = '22222222-2222-4222-8222-222222222222';
const RUN = '33333333-3333-4333-8333-333333333333';
const id = (n: number) => `4444444${n}-4444-4444-8444-444444444444`;

class Query {
	private filters: Array<(r: Row) => boolean> = [];
	private patch: Row | null = null;
	private maybe = false;
	constructor(
		private db: FakeDb,
		private table: string
	) {}
	select() {
		return this;
	}
	update(patch: Row) {
		this.patch = patch;
		return this;
	}
	upsert(row: Row) {
		const rows = this.db.rows(this.table);
		const existing = rows.find(
			(r) => r.owner_user_id === row.owner_user_id && r.entity_id === row.entity_id
		);
		if (existing) Object.assign(existing, row);
		else rows.push({ ...row });
		return Promise.resolve({ data: null, error: null });
	}
	eq(col: string, value: unknown) {
		this.filters.push((r) => r[col] === value);
		return this;
	}
	in(col: string, values: unknown[]) {
		this.filters.push((r) => values.includes(r[col]));
		return this;
	}
	like(col: string, pattern: string) {
		const prefix = pattern.replace(/%$/, '');
		this.filters.push((r) => String(r[col] ?? '').startsWith(prefix));
		return this;
	}
	order() {
		return this;
	}
	limit() {
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
		const hit = this.db.rows(this.table).filter((r) => this.filters.every((f) => f(r)));
		if (this.patch) for (const r of hit) Object.assign(r, structuredClone(this.patch));
		const data = hit.map((r) => ({ ...r }));
		return { data: this.maybe ? (data[0] ?? null) : data, error: null };
	}
}

class FakeDb {
	tables = new Map<string, Row[]>();
	queued: Row[] = [];
	rows(table: string) {
		if (!this.tables.has(table)) this.tables.set(table, []);
		return this.tables.get(table)!;
	}
	from(table: string) {
		return new Query(this, table);
	}
	rpc(name: string, args: Row) {
		if (name === 'add_queue_job') this.queued.push(args);
		return Promise.resolve({ data: null, error: null });
	}
	get run() {
		return this.rows('knowledge_runs')[0]!;
	}
	lookup(entityId: string) {
		return this.rows('knowledge_company_lookups').find((r) => r.entity_id === entityId);
	}
}

function org(
	entityId: string,
	name: string,
	facts: Array<{ predicate: string; status?: string; value?: string }> = []
): KnowledgeEntityDetail {
	return {
		entity: {
			id: entityId,
			kind: 'org',
			name,
			summary: null,
			scope: 'private',
			is_self: false,
			image_url: null,
			status: 'active',
			created_via: 'import',
			enriched_at: null,
			created_at: '',
			updated_at: ''
		},
		facts: facts.map((f, i) => ({
			id: `f${i}`,
			predicate: f.predicate,
			label: f.predicate,
			value: f.value ?? null,
			entity: null,
			qualifiers: {},
			scope: 'private',
			status: (f.status ?? 'active') as never,
			confidence: 0.8,
			valid_from: null,
			valid_to: null,
			observed_at: '',
			created_via: 'import',
			run_id: null,
			sources: []
		})),
		incoming: [],
		incoming_truncated: false,
		links: [],
		enrichment: [],
		known_by_me: false
	};
}

function option(city: string, state: string, domain: string | null): CompanyOption {
	return {
		key: domain ?? `${city}-${state}`,
		name: 'Company',
		domain,
		place: canonicalPlace({ city, region: state, country: 'US' }),
		street: null,
		industry: 'Consulting',
		size: null,
		founded: null,
		linkedin: null,
		description: null,
		sources: [{ source: 'directory', label: 'Directory', url: 'https://example.org/d' }],
		agreed: true
	};
}

const placed = (o: CompanyOption): CompanyVerdict => ({
	outcome: 'placed',
	chosen: o,
	options: [],
	total: 1
});

function seed(orgs: KnowledgeEntityDetail[], stats: Row = {}) {
	const db = new FakeDb();
	db.rows('knowledge_runs').push({
		id: RUN,
		owner_user_id: USER,
		run_type: 'locate',
		status: 'queued',
		input: { entity_ids: orgs.map((o) => o.entity.id), origin: 'import' },
		stats: { total: orgs.length, ...stats }
	});
	for (const o of orgs) store.details.set(o.entity.id, o);
	return db;
}

function job(): any {
	return { data: { runId: RUN, userId: USER }, signal: new AbortController().signal };
}

const run = (db: FakeDb, over: Record<string, unknown> = {}) =>
	processKnowledgeLocateJob(job(), {
		db: db as never,
		lookup: {} as never,
		now: () => new Date('2026-11-24T12:00:00Z'),
		...over
	});

const factsOf = (index: number) => (store.recorded[index]!.batch as KnowledgeWriteBatch).facts;

beforeEach(() => {
	store.details.clear();
	store.recorded.length = 0;
	store.nextPlace = 0;
	verdicts.byName.clear();
	verdicts.asked.length = 0;
	verdicts.onLookup = null;
});

describe('processKnowledgeLocateJob', () => {
	it('saves a placed company as known, as research of this run', async () => {
		const db = seed([org(id(1), 'Booz Allen Hamilton')]);
		verdicts.byName.set('Booz Allen Hamilton', placed(option('McLean', 'VA', 'boozallen.com')));

		const result = await run(db);

		expect(result.status).toBe('completed');
		expect(store.recorded).toHaveLength(1);
		expect(store.recorded[0]!.options).toEqual({ via: 'enrichment', runId: RUN });
		expect(factsOf(0).map((f) => [f.predicate, f.status])).toEqual([
			['located_in', 'active'],
			['homepage', 'active'],
			['industry', 'active']
		]);
		expect(db.lookup(id(1))).toMatchObject({
			outcome: 'placed',
			question_status: null,
			run_id: RUN,
			options: []
		});
		expect(db.run).toMatchObject({ status: 'completed' });
		expect(db.run.stats).toMatchObject({
			total: 1,
			done: 1,
			placed: 1,
			unconfirmed: 0,
			ask: 0,
			failed: 0
		});
	});

	it('saves an unconfirmed company as suggestions only', async () => {
		const db = seed([org(id(1), 'Summit Consulting')]);
		verdicts.byName.set('Summit Consulting', {
			outcome: 'unconfirmed',
			chosen: option('Washington', 'DC', 'summitllc.com'),
			options: [],
			total: 1
		});

		await run(db);

		expect(factsOf(0).map((f) => [f.predicate, f.status])).toEqual([
			['located_in', 'suggested'],
			['homepage', 'suggested']
		]);
		expect(db.lookup(id(1))).toMatchObject({ outcome: 'unconfirmed', question_status: null });
		expect(db.run.stats).toMatchObject({ unconfirmed: 1, placed: 0 });
	});

	it('saves nothing for a shared name and files a "Which one?" question', async () => {
		const db = seed([org(id(1), 'Summit Consulting')]);
		const options = [
			option('Washington', 'DC', 'summitllc.com'),
			option('Denver', 'CO', 'summitcg.com')
		];
		verdicts.byName.set('Summit Consulting', {
			outcome: 'ask',
			chosen: null,
			options,
			total: 2
		});

		await run(db);

		expect(store.recorded).toEqual([]);
		const row = db.lookup(id(1))!;
		expect(row).toMatchObject({
			outcome: 'ask',
			question_status: 'open',
			options_total: 2,
			chosen_key: null
		});
		expect(row.options.map((o: CompanyOption) => o.key)).toEqual([
			'summitllc.com',
			'summitcg.com'
		]);
		expect(db.run.stats).toMatchObject({ ask: 1 });
	});

	it('records "not found" so the company is not looked up again, and keeps a website lead as a suggestion', async () => {
		const db = seed([org(id(1), 'Obscure Co'), org(id(2), 'Lead Only')]);
		verdicts.byName.set('Lead Only', {
			outcome: 'none',
			chosen: { ...option('X', 'VA', 'leadonly.com'), place: null },
			options: [],
			total: 1
		});

		await run(db);

		expect(db.lookup(id(1))).toMatchObject({ outcome: 'none' });
		expect(db.lookup(id(2))).toMatchObject({ outcome: 'none' });
		expect(store.recorded).toHaveLength(1);
		expect(factsOf(0).map((f) => [f.predicate, f.status, f.value])).toEqual([
			['homepage', 'suggested', 'https://leadonly.com']
		]);
		expect(db.run.stats).toMatchObject({ none: 2, done: 2 });
	});

	it('skips an organization that already has a place, without asking any source', async () => {
		const db = seed([
			org(id(1), 'Already Placed', [{ predicate: 'located_in' }]),
			org(id(2), 'Suggested Place', [{ predicate: 'located_in', status: 'suggested' }])
		]);

		await run(db);

		expect(verdicts.asked).toEqual([]);
		expect(db.rows('knowledge_company_lookups')).toEqual([]);
		expect(db.run.stats).toMatchObject({ skipped: 2, done: 2 });
	});

	it("passes the entry's own website to the lookup", async () => {
		const db = seed([
			org(id(1), 'Summit Consulting', [
				{ predicate: 'homepage', value: 'https://www.summitcg.com/' }
			])
		]);

		await run(db);

		expect(verdicts.asked).toEqual([{ name: 'Summit Consulting', ownDomain: 'summitcg.com' }]);
	});

	it('reuses a town saved under another spelling, and a town created earlier in the run', async () => {
		const db = seed([
			org(id(1), 'First'),
			org(id(2), 'Second'),
			org(id(3), 'Third'),
			org(id(4), 'Fourth')
		]);
		db.rows('knowledge_entities').push({
			id: 'place-annapolis',
			owner_user_id: USER,
			scope: 'private',
			kind: 'place',
			status: 'active',
			name: 'Annapolis, Maryland'
		});
		verdicts.byName.set('First', placed(option('Annapolis', 'MD', 'first.example')));
		verdicts.byName.set('Second', placed(option('McLean', 'VA', 'second.example')));
		verdicts.byName.set('Third', placed(option('McLean', 'VA', 'third.example')));
		// The fourth is in a later chunk, after the second's new place is known.
		verdicts.byName.set('Fourth', placed(option('MCLEAN', 'VA', 'fourth.example')));

		await run(db);

		const placeOf = (name: string) => {
			const index = verdicts.asked.findIndex((a) => a.name === name);
			return (store.recorded[index]!.batch as KnowledgeWriteBatch).entities[0]!;
		};
		expect(store.recorded).toHaveLength(4);
		expect(placeOf('First')).toMatchObject({ id: 'place-annapolis' });
		expect(placeOf('Second').id).toBeUndefined();
		expect(placeOf('Fourth').id).toMatch(/^new-place-/);
	});

	it('stops before the next companies when the run is cancelled', async () => {
		const orgs = [1, 2, 3, 4, 5, 6].map((n) => org(id(n), `Company ${n}`));
		const db = seed(orgs);
		verdicts.onLookup = () => {
			db.run.status = 'cancelled';
		};

		const result = await run(db);

		expect(result.status).toBe('cancelled');
		// The first three were already under way; the next three are never started.
		expect(verdicts.asked.map((a) => a.name)).toEqual(['Company 1', 'Company 2', 'Company 3']);
		expect(db.run.status).toBe('cancelled');
		expect(db.queued).toEqual([]);
	});

	it('hands the rest to a continuation when its time is up, and the continuation resumes there', async () => {
		const orgs = [1, 2, 3, 4, 5, 6, 7].map((n) => org(id(n), `Company ${n}`));
		const db = seed(orgs);
		let clock = Date.parse('2026-11-24T12:00:00Z');
		verdicts.onLookup = () => {
			clock += 60_000;
		};

		const first = await run(db, { now: () => new Date(clock), timeBudgetMs: 2 * 60_000 });

		expect(first.status).toBe('continued');
		expect(verdicts.asked).toHaveLength(3);
		expect(db.run).toMatchObject({ status: 'running' });
		expect(db.run.stats).toMatchObject({ cursor: 3, done: 3, none: 3, total: 7 });
		expect(db.queued).toEqual([
			expect.objectContaining({
				p_job_type: 'knowledge_locate',
				p_metadata: { userId: USER, runId: RUN },
				p_dedup_key: `knowledge_locate:${RUN}:3`
			})
		]);

		verdicts.onLookup = null;
		const second = await run(db, { now: () => new Date(clock) });

		expect(second.status).toBe('completed');
		expect(verdicts.asked.map((a) => a.name)).toEqual([
			'Company 1',
			'Company 2',
			'Company 3',
			'Company 4',
			'Company 5',
			'Company 6',
			'Company 7'
		]);
		expect(db.run).toMatchObject({ status: 'completed' });
		expect(db.run.stats).toMatchObject({ cursor: 7, done: 7, none: 7, total: 7 });
	});

	it('keeps going when one company cannot be saved', async () => {
		const db = seed([org(id(1), 'Broken'), org(id(2), 'Fine')]);
		store.details.delete(id(1));
		store.details.set(id(1), {
			get entity() {
				throw new Error('boom');
			}
		});
		verdicts.byName.set('Fine', placed(option('McLean', 'VA', 'fine.example')));

		const result = await run(db);

		expect(result.status).toBe('completed');
		expect(db.run.stats).toMatchObject({ failed: 1, placed: 1, done: 2 });
		expect(db.run.status).toBe('completed');
	});

	it('does nothing for a run that already finished or belongs to someone else', async () => {
		const db = seed([org(id(1), 'Company 1')]);
		db.run.status = 'completed';
		expect((await run(db)).status).toBe('skipped');

		db.run.status = 'queued';
		db.run.owner_user_id = '99999999-9999-4999-8999-999999999999';
		expect((await run(db)).status).toBe('skipped');
		expect(verdicts.asked).toEqual([]);
	});
});
