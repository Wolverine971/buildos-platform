// apps/worker/src/workers/knowledge/knowledgeEnrichWorker.test.ts
// The research worker's queue behaviour (tasker 164): each target uses its own instructions
// (falling back to the run's), reports its phase, and stops before the next paid step when it is
// cancelled from the tray. No network or model: search, model and store are fakes.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnowledgeEntityDetail } from '@buildos/shared-agent-ops/knowledge';

const store = vi.hoisted(() => ({
	details: new Map<string, unknown>(),
	recorded: [] as Array<{ facts: unknown[] }>
}));

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../lib/services/smart-llm-service', () => ({ SmartLLMService: vi.fn() }));
vi.mock('../agent-run/webResearchPort', async (importOriginal) => ({
	...(await importOriginal<typeof import('../agent-run/webResearchPort')>()),
	createAgentRunWebResearchPort: vi.fn()
}));
vi.mock('@buildos/shared-agent-ops/knowledge', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@buildos/shared-agent-ops/knowledge')>();
	class FakeStore {
		async getEntity(id: string) {
			return store.details.get(id) ?? null;
		}
		async record(batch: { facts: unknown[] }) {
			store.recorded.push(batch);
			return { facts: { added: batch.facts.length, suggested: 0 } };
		}
		async updateEntity() {}
		async listResearchHints() {
			return [];
		}
	}
	return { ...actual, KnowledgeStore: FakeStore };
});

import { processKnowledgeEnrichJob, type KnowledgeEnrichDeps } from './knowledgeEnrichWorker';
import { KNOWLEDGE_PLAN_OPERATION } from './knowledgeEnrichPlan';

type Row = Record<string, any>;
const USER = '22222222-2222-4222-8222-222222222222';
const RUN = '33333333-3333-4333-8333-333333333333';
const ACME = '44444444-4444-4444-8444-444444444444';
const BETA = '55555555-5555-4555-8555-555555555555';
const GAMMA = '66666666-6666-4666-8666-666666666666';
const PAGE = 'Acme makes industrial widgets in Baltimore and ships them worldwide.';

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
	eq(col: string, value: unknown) {
		this.filters.push((r) => r[col] === value);
		return this;
	}
	in(col: string, values: unknown[]) {
		this.filters.push((r) => values.includes(r[col]));
		return this;
	}
	lt(col: string, value: string) {
		this.filters.push((r) => r[col] !== undefined && String(r[col]) < value);
		return this;
	}
	order() {
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
		if (this.patch) {
			for (const r of hit) {
				Object.assign(r, this.patch);
				this.db.history.push({ table: this.table, id: r.id, patch: { ...this.patch } });
			}
		}
		const data = hit.map((r) => ({ ...r }));
		return { data: this.maybe ? (data[0] ?? null) : data, error: null };
	}
}

class FakeDb {
	tables = new Map<string, Row[]>();
	history: Array<{ table: string; id: string; patch: Row }> = [];
	rows(table: string) {
		if (!this.tables.has(table)) this.tables.set(table, []);
		return this.tables.get(table)!;
	}
	from(table: string) {
		return new Query(this, table);
	}
	async rpc() {
		return { data: null, error: null };
	}
	target(id: string) {
		return this.rows('knowledge_run_targets').find((t) => t.id === id)!;
	}
	phases(id: string) {
		return this.history
			.filter((h) => h.table === 'knowledge_run_targets' && h.id === id && h.patch.phase)
			.map((h) => h.patch.phase);
	}
}

function detail(id: string, name: string): KnowledgeEntityDetail {
	return {
		entity: {
			id,
			kind: 'org',
			name,
			summary: null,
			scope: 'private',
			is_self: false,
			image_url: null,
			status: 'active',
			created_via: 'task',
			enriched_at: null,
			created_at: '',
			updated_at: ''
		},
		facts: [],
		incoming: [],
		incoming_truncated: false,
		links: [],
		enrichment: [],
		known_by_me: false
	};
}

function seed(targets: Array<{ id: string; entity: string; instructions?: string | null }>) {
	const db = new FakeDb();
	db.rows('knowledge_runs').push({
		id: RUN,
		owner_user_id: USER,
		status: 'queued',
		budget_usd: 0.09,
		cost_usd: 0,
		input: { instructions: 'Where is their headquarters?' }
	});
	for (const t of targets) {
		db.rows('knowledge_run_targets').push({
			id: t.id,
			run_id: RUN,
			entity_id: t.entity,
			fields: ['description'],
			status: 'queued',
			instructions: t.instructions ?? null
		});
	}
	for (const id of [ACME, BETA, GAMMA])
		db.rows('knowledge_entities').push({ id, owner_user_id: USER });
	return db;
}

function deps(db: FakeDb, onSearch?: (query: string) => void) {
	const queries: string[] = [];
	const prompts: string[] = [];
	/** Set `plan.next` to make the planner return a kind and searches. */
	const plan: { next: unknown } = { next: null };
	const llm = {
		getJSONResponse: vi.fn(async (options: any) => {
			// The planning call (what is this, which searches): by default it plans nothing,
			// so the fixed search recipe runs. `prompts` holds the extraction prompts only.
			if (options.operationType === KNOWLEDGE_PLAN_OPERATION) return plan.next ?? {};
			prompts.push(options.userPrompt);
			options.onUsage?.({ totalCost: 0.001 });
			return {
				pages: [{ page: 1, about_entity: true }],
				facts: [
					{
						predicate: 'description',
						value: 'Acme makes industrial widgets in Baltimore',
						page: 1,
						quote: 'Acme makes industrial widgets in Baltimore',
						confidence: 0.9
					}
				]
			};
		})
	};
	const makePort = (onCharge: (c: { cost_usd: number }) => void) => ({
		search: async (args: Record<string, unknown>) => {
			const query = String(args.query);
			queries.push(query);
			onCharge({ cost_usd: 0.008 });
			onSearch?.(query);
			return {
				results: [{ url: 'https://acme.example/about', title: 'About', page_content: PAGE }]
			};
		}
	});
	return {
		queries,
		prompts,
		plan,
		llm,
		deps: {
			db,
			llm: llm as unknown as KnowledgeEnrichDeps['llm'],
			makePort: makePort as unknown as KnowledgeEnrichDeps['makePort'],
			fetchFn: vi.fn() as unknown as typeof fetch,
			now: () => new Date('2026-11-17T12:00:00Z'),
			decider: null
		} satisfies Partial<KnowledgeEnrichDeps>
	};
}

const job = {
	id: 'job',
	correlationId: null,
	userId: USER,
	data: { runId: RUN, userId: USER }
} as any;

beforeEach(() => {
	store.details.clear();
	store.recorded.length = 0;
	store.details.set(ACME, detail(ACME, 'Acme'));
	store.details.set(BETA, detail(BETA, 'Beta Labs'));
	store.details.set(GAMMA, detail(GAMMA, 'Gamma Works'));
});

describe('processKnowledgeEnrichJob queue behaviour', () => {
	it('a retry leaves a target a live attempt is researching, and resumes one that went quiet', async () => {
		const db = seed([
			{ id: 't-acme', entity: ACME },
			{ id: 't-beta', entity: BETA }
		]);
		db.rows('knowledge_runs')[0]!.status = 'running';
		// Acme: moved 1 minute ago (live). Beta: silent for an hour (its attempt died).
		Object.assign(db.target('t-acme'), {
			status: 'running',
			phase: 'reading',
			updated_at: '2026-11-17T11:59:00.000Z'
		});
		Object.assign(db.target('t-beta'), {
			status: 'running',
			phase: 'searching',
			updated_at: '2026-11-17T11:00:00.000Z'
		});
		const run = deps(db);
		await processKnowledgeEnrichJob(job, run.deps);
		expect(run.queries.some((q) => q.includes('Acme'))).toBe(false);
		expect(run.queries.some((q) => q.includes('Beta Labs'))).toBe(true);
		expect(db.target('t-beta').status).toBe('done');
	});

	it('does not reopen a run cancelled after it was loaded', async () => {
		const db = seed([{ id: 't-acme', entity: ACME }]);
		const from = db.from.bind(db);
		let loaded = false;
		db.from = (table: string) => {
			// The cancel lands right after the job read the run.
			if (table === 'knowledge_runs' && loaded)
				db.rows('knowledge_runs')[0]!.status = 'cancelled';
			if (table === 'knowledge_runs') loaded = true;
			return from(table);
		};
		await processKnowledgeEnrichJob(job, deps(db).deps);
		expect(db.rows('knowledge_runs')[0]!.status).toBe('cancelled');
		// Never flipped back to running, not even briefly (the tray would show it running).
		expect(
			db.history.filter((h) => h.table === 'knowledge_runs' && h.patch.status === 'running')
		).toEqual([]);
	});

	it("uses each target's own instructions, else the run's, and reports its phases", async () => {
		const db = seed([
			{ id: 't-acme', entity: ACME, instructions: 'Which podcasts?' },
			{ id: 't-beta', entity: BETA }
		]);
		const run = deps(db);
		const result = await processKnowledgeEnrichJob(job, run.deps);

		expect(result).toMatchObject({ status: 'completed', done: 2, cancelled: 0 });
		expect(run.queries.find((q) => q.includes('Acme'))).toContain('Which podcasts?');
		expect(run.queries.find((q) => q.includes('Beta Labs'))).toContain(
			'Where is their headquarters?'
		);
		expect(run.prompts.find((p) => p.includes('Name: Acme'))).toContain('"Which podcasts?"');
		expect(db.phases('t-acme')).toEqual(['searching', 'reading', 'extracting', 'saving']);
		expect(db.target('t-acme')).toMatchObject({ status: 'done', phase: null, facts_added: 1 });
	});

	it('stops a target cancelled mid-research before the model call', async () => {
		const db = seed([{ id: 't-acme', entity: ACME }]);
		// The user presses Stop in the tray while the search is in flight.
		const run = deps(db, () => Object.assign(db.target('t-acme'), { status: 'cancelled' }));
		const result = await processKnowledgeEnrichJob(job, run.deps);

		// Only the free-of-search planning call ran: nothing was extracted.
		expect(run.prompts).toHaveLength(0);
		expect(store.recorded).toHaveLength(0);
		expect(db.target('t-acme')).toMatchObject({ status: 'cancelled', cost_usd: 0.008 });
		expect(result).toMatchObject({ status: 'cancelled', cancelled: 1, done: 0 });
		expect(db.rows('knowledge_runs')[0]).toMatchObject({
			status: 'cancelled',
			cost_usd: 0.008
		});
	});

	it('never claims a target cancelled while it waited, and finishes the rest', async () => {
		const db = seed([
			{ id: 't-acme', entity: ACME },
			{ id: 't-beta', entity: BETA },
			{ id: 't-gamma', entity: GAMMA }
		]);
		// Two at a time: Gamma waits in line. The user stops it while Acme is searching.
		const run = deps(db, (query) => {
			if (query.includes('Acme'))
				Object.assign(db.target('t-gamma'), { status: 'cancelled' });
		});
		const result = await processKnowledgeEnrichJob(job, run.deps);

		expect(result).toMatchObject({ status: 'partial', done: 2, cancelled: 1 });
		expect(db.target('t-gamma').status).toBe('cancelled');
		expect(run.queries.some((q) => q.includes('Gamma'))).toBe(false);
	});
});

describe('processKnowledgeEnrichJob with Serper results', () => {
	const PANEL = {
		title: 'Acme',
		type: 'Manufacturing company',
		website: 'https://acme.example/',
		description: 'Acme is a widget maker founded in 1999.',
		descriptionSource: 'Wikipedia',
		attributes: { Headquarters: 'Baltimore, MD' }
	};

	function serperDeps(db: FakeDb, answer: unknown, kind: 'org' | 'person' = 'org') {
		const visited: string[] = [];
		const prompts: string[] = [];
		if (kind === 'person') {
			const d = detail(ACME, 'Acme');
			store.details.set(ACME, { ...d, entity: { ...d.entity, kind: 'person' } });
		}
		const makePort = (onCharge: (c: { cost_usd: number }) => void) => ({
			search: async () => {
				onCharge({ cost_usd: 0.008 }); // reserved at the Tavily price
				return {
					// Serper: snippets only, no page text.
					results: [{ url: 'https://news.example/acme', title: 'News', snippet: 'x' }],
					knowledge_panel: PANEL,
					info: {
						billing: {
							provider: 'serper',
							credits: 1,
							unit_cost_usd: 0.001,
							cost_usd: 0.001,
							source: 'provider_reported'
						}
					}
				};
			},
			visit: async (args: Record<string, unknown>) => {
				visited.push(String(args.url));
				return { content: PAGE, title: 'Page' };
			}
		});
		return {
			visited,
			prompts,
			deps: {
				db,
				llm: {
					getJSONResponse: async (options: any) => {
						if (options.operationType === KNOWLEDGE_PLAN_OPERATION) return {};
						prompts.push(options.userPrompt);
						options.onUsage?.({ totalCost: 0.0004 });
						return answer;
					}
				} as unknown as KnowledgeEnrichDeps['llm'],
				makePort: makePort as unknown as KnowledgeEnrichDeps['makePort'],
				fetchFn: vi.fn() as unknown as typeof fetch,
				now: () => new Date('2026-11-17T12:00:00Z'),
				decider: null
			} satisfies Partial<KnowledgeEnrichDeps>
		};
	}

	it("reads the panel's website first, settles the search to Serper's price, and keeps only verbatim panel quotes", async () => {
		const db = seed([{ id: 't-acme', entity: ACME }]);
		const run = serperDeps(db, {
			pages: [
				{ page: 1, about_entity: true },
				{ page: 3, about_entity: true }
			],
			facts: [
				{
					predicate: 'description',
					value: 'Acme is a widget maker founded in 1999.',
					page: 3,
					quote: 'Acme is a widget maker founded in 1999.',
					confidence: 0.9
				},
				{
					predicate: 'description',
					value: 'Acme makes the best widgets anywhere',
					page: 3,
					quote: 'Acme makes the best widgets anywhere',
					confidence: 0.9
				}
			]
		});
		await processKnowledgeEnrichJob(job, run.deps);

		expect(run.visited).toEqual(['https://acme.example/', 'https://news.example/acme']);
		expect(run.prompts[0]).toContain('title="Google knowledge panel: Acme"');
		expect(run.prompts[0]).toContain('Headquarters: Baltimore, MD');
		expect(store.recorded).toHaveLength(1);
		expect(store.recorded[0]!.facts).toHaveLength(1);
		expect(store.recorded[0]!.facts[0]).toMatchObject({
			quote: 'Acme is a widget maker founded in 1999.'
		});
		// $0.008 reserved, settled to $0.001, plus $0.0004 of model.
		expect(db.target('t-acme')).toMatchObject({
			status: 'done',
			cost_usd: 0.0014,
			summary: expect.stringMatching(/^2 pages read, 1 new detail, 1 unsupported dropped/)
		});
	});

	it("never offers a person's panel attributes to the model", async () => {
		const db = seed([{ id: 't-acme', entity: ACME }]);
		const run = serperDeps(db, { pages: [], facts: [] }, 'person');
		await processKnowledgeEnrichJob(job, run.deps);

		expect(run.prompts[0]).toContain('Google knowledge panel: Acme');
		expect(run.prompts[0]).toContain('Acme is a widget maker founded in 1999.');
		expect(run.prompts[0]).not.toContain('Headquarters');
	});
});

describe('planned research (the Griffin run, 2026-11-21)', () => {
	it('runs the searches the planner chose, records what it did, and says what it searched', async () => {
		const db = seed([{ id: 't-acme', entity: ACME }]);
		const run = deps(db);
		run.plan.next = {
			kind: 'org',
			queries: ['"Acme" widgets Baltimore', '"Acme" site:acme.example', 'acme@acme.example']
		};
		const result = await processKnowledgeEnrichJob(job, run.deps);

		// The planned searches ran (the one carrying an email address never left); the fixed
		// recipe ("Acme" company) did not.
		expect(run.queries.slice(0, 2)).toEqual([
			'"Acme" widgets Baltimore',
			'"Acme" site:acme.example'
		]);
		expect(run.queries.some((q) => q.includes('@'))).toBe(false);
		expect(run.queries).not.toContain('"Acme" company');
		expect(result).toMatchObject({ status: 'completed', done: 1 });
		// What it did is kept: on the entry's line for the card, and on the run for chat.
		expect(db.target('t-acme').summary).toContain('Searched: “"Acme" widgets Baltimore”');
		const trace = (db.rows('knowledge_runs')[0]!.stats as any).trace[ACME];
		expect(trace.queries).toContain('"Acme" widgets Baltimore');
		expect(trace.pages[0]).toMatchObject({ url: 'https://acme.example/about' });
		expect(trace.saved_on).toBe(ACME);
	});

	it('only reports a wrong type on a run where the user said nothing', async () => {
		const db = seed([{ id: 't-acme', entity: ACME }]);
		const run = deps(db);
		run.plan.next = { kind: 'person', queries: ['"Acme" founder'] };
		// A bulk run with no note: nobody said what this entry is.
		db.rows('knowledge_runs')[0]!.input = {};
		db.target('t-acme').instructions = null;
		await processKnowledgeEnrichJob(job, run.deps);
		// No note from the user: the type is left alone and the line says what to do.
		expect(store.details.get(ACME)!.entity.kind).toBe('org');
		expect(db.target('t-acme').status).toBe('done');
		expect(db.target('t-acme').summary).toContain('change its type on the card');
	});
});
