// apps/worker/src/workers/agentic-chat/tools/knowledge-search.test.ts
//
// Guided search in chat (2026-11-22): the inside search and one outside hop, end to end with
// fakes for the database, the decision model, the page-reading model and the web. No network.
//
// What must hold:
//   - an outside hop saves only what a page actually says (quote on the page, leaders only)
//   - one reading model reads everything a search returned and answers the checks; the
//     decision model never touches web content
//   - the inside search covers every kind of entry, people first, and reports per kind
//   - what it saves is marked found on the web, never written onto someone the user knows
//   - hops are counted from the entries a search starts from, and a trail stops itself at 3
//   - a search that was not cleared never leaves, and nothing is spent on a refused hop
//   - the inside search never returns contact values, only whether they are on file
import { describe, expect, it } from 'vitest';
import type {
	GuidedEntry,
	IdentityDecider,
	KnowledgeEntityDetail,
	KnowledgeWriteBatch
} from '@buildos/shared-agent-ops/knowledge';
import {
	createWorkerKnowledgeSearchPort,
	type KnowledgeSearchCallContext,
	type KnowledgeSearchPortDeps
} from './knowledge-search';
import {
	EXPLORE_MAX_PAGES,
	buildExploreBatch,
	flagPossibleTwins,
	planExploreReading,
	validateExploreAnswer,
	type ExploreLane,
	type ExplorePage,
	type KnowledgeSearchStep
} from './knowledge-search-plan';

type Row = Record<string, any>;

const USER = '11111111-1111-4111-8111-111111111111';
const CHAT = '22222222-2222-4222-8222-222222222222';
const TURN = '33333333-3333-4333-8333-333333333333';
const TENABLE = '44444444-4444-4444-8444-444444444444';
const KNOWN_PAT = '55555555-5555-4555-8555-555555555555';

const ABOUT_URL = 'https://www.tenable.com/about-tenable/leadership';
const ABOUT_PAGE =
	'Tenable leadership. Steve Vintz, Co-Chief Executive Officer and Chief Financial Officer. ' +
	'Mark Thurmond, Co-Chief Executive Officer. Tenable is headquartered in Columbia, Maryland. ' +
	'Jordan Lee, Senior Account Executive, joined the sales team this year.';

// ---------------------------------------------------------------------------
// Fakes

class FakeDb {
	runs: Row[] = [];
	entities: Row[] = [];
	facts: Row[] = [];
	people: Row[] = [];
	connectionArgs: Row | null = null;
	reserve: Row = { id: 'run-1', budget: 0.03 };
	reserveCalls: Row[] = [];
	updates: Array<{ table: string; patch: Row; filters: Array<[string, unknown]> }> = [];

	from(table: string) {
		return new FakeQuery(this, table);
	}
	async rpc(fn: string, args: Row) {
		if (fn === 'knowledge_reserve_enrichment_run') {
			this.reserveCalls.push(args);
			if (this.reserve.id)
				this.runs.push({ id: this.reserve.id, input: args.p_input, stats: args.p_stats });
			return { data: this.reserve, error: null };
		}
		if (fn === 'knowledge_connections') {
			this.connectionArgs = args;
			return {
				data: {
					people: this.people,
					total: this.people.length,
					facets: {},
					coverage: {
						people: this.people.length,
						known: 0,
						with_company: 0,
						with_title: 0,
						with_place: 1,
						with_industry: 0,
						companies: 2,
						companies_with_place: 1,
						companies_with_industry: 0
					},
					gaps: { companies_without_place: [], companies_without_industry: [] }
				},
				error: null
			};
		}
		return { data: null, error: { message: `rpc ${fn} not faked` } };
	}
}

class FakeQuery implements PromiseLike<{ data: any; error: any }> {
	private filters: Array<[string, unknown]> = [];
	private patch: Row | null = null;
	private single = false;
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
	eq(column: string, value: unknown) {
		this.filters.push([column, value]);
		return this;
	}
	is(column: string, value: unknown) {
		this.filters.push([column, value]);
		return this;
	}
	in(column: string, values: unknown[]) {
		this.filters.push([column, values]);
		return this;
	}
	order() {
		return this;
	}
	limit() {
		return this;
	}
	maybeSingle() {
		this.single = true;
		return this;
	}
	private run(): { data: any; error: any } {
		if (this.patch) {
			this.db.updates.push({ table: this.table, patch: this.patch, filters: this.filters });
			if (this.table === 'knowledge_runs') {
				const id = this.filters.find(([column]) => column === 'id')?.[1];
				const row = this.db.runs.find((run) => run.id === id);
				if (row) Object.assign(row, this.patch);
			}
			return { data: null, error: null };
		}
		if (this.table === 'users') return { data: { is_admin: false }, error: null };
		if (this.table === 'knowledge_runs') return { data: this.db.runs, error: null };
		if (this.table === 'knowledge_entities') {
			const names = this.filters.find(([column]) => column === 'normalized_name')?.[1];
			const ids = this.filters.find(([column]) => column === 'id')?.[1];
			const rows = this.db.entities.filter((row) =>
				Array.isArray(names)
					? names.includes(row.normalized_name)
					: Array.isArray(ids) && ids.includes(row.id)
			);
			return { data: rows, error: null };
		}
		if (this.table === 'knowledge_facts') return { data: this.db.facts, error: null };
		return { data: this.single ? null : [], error: null };
	}
	then<A, B>(
		resolve?: ((value: { data: any; error: any }) => A | PromiseLike<A>) | null,
		reject?: ((reason: unknown) => B | PromiseLike<B>) | null
	): PromiseLike<A | B> {
		return Promise.resolve(this.run()).then(resolve, reject);
	}
}

class FakeStore {
	details = new Map<string, KnowledgeEntityDetail>();
	recorded: Array<{ batch: KnowledgeWriteBatch; options: Row }> = [];
	created: Row[] = [];
	mergeQuestions: Row[] = [];
	/** Names the store would match to an existing entry (lowercased name → id). */
	existingByName = new Map<string, string>();
	probes: KnowledgeWriteBatch[] = [];
	private next = 0;

	async getEntity(id: string) {
		return this.details.get(id) ?? null;
	}
	async createEntry(input: Row) {
		const id = `c0000000-0000-4000-8000-00000000000${this.created.length + 1}`;
		this.created.push({ id, ...input });
		return id;
	}
	async addMergeCandidate(a: string, b: string, options: Row) {
		this.mergeQuestions.push({ a, b, ...options });
	}
	async record(batch: KnowledgeWriteBatch, options: Row) {
		if (options.dryRun) {
			// What a real write would do, saving nothing: new entries get no real id.
			this.probes.push(batch);
			return {
				entities: batch.entities.map((entity) => {
					const id = this.existingByName.get(entity.name.toLowerCase());
					return {
						ref: entity.ref,
						id: id ?? `new:${entity.ref}`,
						kind: entity.kind,
						name: entity.name,
						matched: id ? 'name' : 'created'
					};
				}),
				facts: { added: 0, existing: 0, superseded: 0, suggested: 0 }
			} as never;
		}
		this.recorded.push({ batch, options });
		return {
			entities: batch.entities.map((entity) => ({
				ref: entity.ref,
				id: entity.id ?? `e0000000-0000-4000-8000-00000000000${++this.next}`,
				kind: entity.kind,
				name: entity.name,
				matched: entity.id ? 'id' : 'created'
			})),
			facts: { added: batch.facts.length, existing: 0, superseded: 0, suggested: 0 }
		} as never;
	}
}

function orgDetail(
	id: string,
	name: string,
	overrides: Partial<{ created_via: string; known: boolean }> = {}
): KnowledgeEntityDetail {
	return {
		entity: {
			id,
			kind: 'org',
			name,
			summary: 'Cybersecurity company',
			scope: 'private',
			is_self: false,
			image_url: null,
			status: 'active',
			created_via: overrides.created_via ?? 'enrichment'
		},
		facts: [
			{ status: 'active', predicate: 'industry', label: 'Industry', value: 'cybersecurity' },
			{ status: 'active', predicate: 'phone', label: 'Phone', value: '410-555-0100' }
		],
		incoming: [],
		links: [],
		enrichment: [],
		known_by_me: overrides.known ?? false
	} as never;
}

/** Answers every question with one choice, or per question key through `pick`. */
function decider(pick: (key: string, card: Row) => string = () => 'yes'): IdentityDecider & {
	questions: string[];
} {
	const questions: string[] = [];
	return {
		questions,
		async decide(req) {
			const entries = (req.state as { entries: Record<string, Row> }).entries;
			const answers: Row = {};
			for (const key of Object.keys(req.questions)) {
				questions.push(key);
				const ref = key.split('__')[0]!;
				const choice = pick(key, entries[ref]!);
				answers[key] = {
					type: 'choice',
					choice,
					probabilities: { [choice]: 0.95 },
					confidence: 0.95
				};
			}
			return { ok: true, answers, receipt: { costUsd: 0.0001 } } as never;
		}
	};
}

function harness(
	overrides: Partial<KnowledgeSearchPortDeps> & {
		answer?: unknown;
		searchResults?: Row[];
		pageText?: string | null;
	} = {}
) {
	const db = new FakeDb();
	const store = new FakeStore();
	const searches: string[] = [];
	const visits: string[] = [];
	const prompts: Array<{ systemPrompt: string; userPrompt: string }> = [];
	const steps: KnowledgeSearchStep[] = [];
	const authorized: string[] = [];
	const port = createWorkerKnowledgeSearchPort({
		client: db,
		decider: decider(),
		llm: {
			async getJSONResponse(options) {
				prompts.push({
					systemPrompt: options.systemPrompt,
					userPrompt: options.userPrompt
				});
				await options.onUsage?.({ totalCost: 0.002 } as never);
				return (overrides.answer ?? { entities: [] }) as never;
			}
		},
		makeSearchPort: () => ({
			async search(args) {
				searches.push(String(args.query));
				return {
					results: overrides.searchResults ?? [
						{ url: ABOUT_URL, title: 'Leadership | Tenable', snippet: 'Meet the team' }
					],
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
			async visit(args) {
				visits.push(String(args.url));
				if (overrides.pageText === null) throw new Error('blocked');
				return { content: overrides.pageText ?? ABOUT_PAGE, title: 'Leadership | Tenable' };
			}
		}),
		makeStore: () => store as never,
		now: () => new Date('2026-11-22T20:00:00Z'),
		...overrides
	});
	const context: KnowledgeSearchCallContext = {
		userId: USER,
		chatSessionId: CHAT,
		turnRunId: TURN,
		onStep: (step) => steps.push(step),
		authorizeQuery: async (query) => {
			authorized.push(query);
			return true;
		}
	};
	return { db, store, port, context, searches, visits, prompts, steps, authorized };
}

const LEADERSHIP_ANSWER = {
	entities: [
		{
			name: 'Steve Vintz',
			kind: 'person',
			summary: 'Co-CEO and CFO of Tenable',
			page: 1,
			quote: 'Steve Vintz, Co-Chief Executive Officer and Chief Financial Officer',
			search: 1,
			relation: 'leads',
			title: 'Co-Chief Executive Officer and Chief Financial Officer',
			role: 'executive',
			checks: { leader: 'yes' }
		},
		{
			name: 'Mark Thurmond',
			kind: 'person',
			summary: 'Co-CEO of Tenable',
			page: 1,
			quote: 'Mark Thurmond, Co-Chief Executive Officer',
			search: 1,
			relation: 'leads',
			title: 'Co-Chief Executive Officer',
			role: 'executive'
		},
		// On the page, but staff: not someone the company presents as running it.
		{
			name: 'Jordan Lee',
			kind: 'person',
			summary: 'Senior Account Executive at Tenable',
			page: 1,
			quote: 'Jordan Lee, Senior Account Executive',
			search: 1,
			relation: 'works_at',
			title: 'Senior Account Executive',
			role: 'other'
		},
		// Not on the page at all: the model's own knowledge.
		{
			name: 'Amit Yoran',
			kind: 'person',
			summary: 'Former CEO of Tenable',
			page: 1,
			quote: 'Amit Yoran served as chairman and chief executive officer',
			search: 1,
			relation: 'leads',
			title: 'Chief Executive Officer',
			role: 'executive'
		}
	],
	about: [
		{
			search: 1,
			facts: [
				{
					field: 'located_in',
					value: 'Columbia, Maryland',
					page: 1,
					quote: 'Tenable is headquartered in Columbia, Maryland'
				},
				{
					field: 'industry',
					value: 'exposure management',
					page: 1,
					quote: 'the exposure management company'
				}
			]
		}
	]
};

const EXPLORE_ARGS = {
	goal: 'Who runs the software companies near Baltimore',
	searches: [{ query: 'Tenable leadership team', about_entity_id: TENABLE }],
	kinds: ['person'],
	checks: [{ key: 'leader', question: 'Does this person run the company?' }]
};

// ---------------------------------------------------------------------------

describe('explore_knowledge: one hop outside', () => {
	it('saves only what the page says about who runs the company, marked found on the web', async () => {
		const h = harness({ answer: LEADERSHIP_ANSWER });
		h.store.details.set(TENABLE, orgDetail(TENABLE, 'Tenable'));
		// Tenable itself was found by an earlier hop of this chat.
		h.db.runs.push({
			id: 'run-0',
			input: { mode: 'explore', chat_session_id: CHAT, hop: 1, turn_run_id: 'earlier' },
			stats: { explore: { entities: [{ id: TENABLE }] } }
		});

		const result = await h.port.explore(EXPLORE_ARGS, h.context);
		const body = result.knowledge_explore as Row;

		expect(body.hop).toBe(2);
		expect(body.entities.map((entity: Row) => entity.name).sort()).toEqual([
			'Columbia, Maryland',
			'Mark Thurmond',
			'Steve Vintz'
		]);
		expect(body.dropped).toBe(2);
		const steve = body.entities.find((entity: Row) => entity.name === 'Steve Vintz');
		expect(steve).toMatchObject({
			kind: 'person',
			origin: 'web',
			hop: 2,
			is_new: true,
			from_entity_id: TENABLE,
			relation: 'leads',
			fit: { leader: 'yes' },
			sources: [ABOUT_URL]
		});

		// One cited write, tagged with the run, and nothing the page did not say.
		expect(h.store.recorded).toHaveLength(1);
		const { batch, options } = h.store.recorded[0]!;
		expect(options).toEqual({ via: 'enrichment', runId: 'run-1' });
		expect(batch.entities.map((entity) => entity.name)).not.toContain('Amit Yoran');
		expect(batch.entities.map((entity) => entity.name)).not.toContain('Jordan Lee');
		expect(batch.sources).toEqual([
			{ ref: 'p1', type: 'web', url: ABOUT_URL, title: 'Leadership | Tenable' }
		]);
		expect(batch.facts.every((fact) => fact.quote && fact.sources?.[0] === 'p1')).toBe(true);
		expect(batch.facts).toContainEqual(
			expect.objectContaining({
				predicate: 'works_at',
				object: TENABLE,
				qualifiers: {
					title: 'Co-Chief Executive Officer and Chief Financial Officer',
					current: true
				}
			})
		);
		// The quoted "about" fact is saved; the unquoted industry claim is not.
		expect(batch.facts).toContainEqual(
			expect.objectContaining({ subject: TENABLE, predicate: 'located_in' })
		);
		expect(batch.facts.some((fact) => fact.predicate === 'industry')).toBe(false);

		// New entries sit outside Your world until the user says otherwise.
		const circle = h.db.updates.find((update) => update.table === 'knowledge_entities');
		expect(circle?.patch).toMatchObject({ circle: 'public', circle_source: 'signals' });
		expect(circle?.filters).toContainEqual(['owner_user_id', USER]);

		// The run is closed with what it found, so the next hop can count from here.
		const run = h.db.runs.find((row) => row.id === 'run-1')!;
		expect(run.status).toBe('completed');
		expect(run.stats.explore.hop).toBe(2);
		expect(run.stats.explore.entities.map((entity: Row) => entity.name)).toContain(
			'Steve Vintz'
		);
		expect(run.cost_usd).toBeCloseTo(0.003, 5);
		expect(h.authorized).toEqual(['Tenable leadership team']);
		// The reader that saw the page answered the check; one it skipped reads as unknown.
		const mark = body.entities.find((entity: Row) => entity.name === 'Mark Thurmond');
		expect(mark.fit).toEqual({ leader: 'unknown' });
		expect(h.prompts[0]!.userPrompt).toContain('- leader: Does this person run the company?');
		expect(h.steps.map((step) => step.kind)).toEqual([
			'search',
			'read',
			'extract',
			'decide',
			'save'
		]);
	});

	it('has one model read everything the searches returned: the decision model never sees web results', async () => {
		const asked: string[] = [];
		const results = [
			{
				url: 'https://a.example/1',
				title: 'A one',
				snippet: 'First result about Baltimore software companies and who runs them.'
			},
			{
				url: 'https://www.spokeo.com/x',
				title: 'People finder',
				snippet: 'Find anyone, phone numbers and addresses for people near you today.'
			},
			{
				url: 'https://b.example/2',
				title: 'B two',
				snippet: 'Second result about Baltimore software companies and their founders.'
			},
			{
				url: 'https://c.example/3',
				title: 'C three',
				snippet: 'Third result, a directory of Baltimore technology firms and leaders.'
			},
			{
				url: 'https://d.example/4',
				title: 'D four',
				snippet: 'Fourth result, a news story on Baltimore startups raising money.'
			},
			{
				url: 'https://e.example/5',
				title: 'E five',
				snippet: 'Fifth result, a list of the largest software employers in Maryland.'
			},
			{
				url: 'https://f.example/6',
				title: 'F six',
				snippet: 'Sixth result, only its preview is read because five pages were opened.'
			}
		];
		const h = harness({
			searchResults: results,
			decider: {
				async decide(req) {
					asked.push(...Object.keys(req.questions));
					return { ok: true, answers: {}, receipt: { costUsd: 0 } } as never;
				}
			}
		});
		await h.port.explore(
			{
				goal: 'Software companies near Baltimore',
				searches: [{ query: 'software companies Baltimore' }],
				kinds: ['org'],
				checks: [{ key: 'near', question: 'Is it in the Baltimore area?' }]
			},
			h.context
		);
		// Nothing was picked by a decision: the first five usable results were opened, in
		// rank order, and the people-finder site was never opened or shown.
		expect(asked).toEqual([]);
		expect(h.visits).toEqual([
			'https://a.example/1',
			'https://b.example/2',
			'https://c.example/3',
			'https://d.example/4',
			'https://e.example/5'
		]);
		const prompt = h.prompts[0]!.userPrompt;
		expect(h.prompts).toHaveLength(1);
		for (const url of h.visits) expect(prompt).toContain(url);
		// The sixth result still reaches the reader, as the search engine's lines.
		expect(prompt).toContain('https://f.example/6');
		expect(prompt).toContain('search preview only');
		expect(prompt).toContain('Sixth result, only its preview is read');
		expect(prompt).not.toContain('spokeo');
		expect(h.steps.find((step) => step.kind === 'read')?.outcome).toBe('5 pages, 1 preview');
	});

	it("opens a company's own site before anything else a search returned", async () => {
		const h = harness({
			searchResults: [
				{
					url: 'https://news.example/tenable',
					title: 'News',
					snippet: 'A news story about Tenable and its leadership changes this year.'
				},
				{
					url: 'https://www.tenable.com/about',
					title: 'About',
					snippet: 'About Tenable, the exposure management company based in Maryland.'
				}
			]
		});
		const detail = orgDetail(TENABLE, 'Tenable');
		(detail.facts as Row[]).push({
			status: 'active',
			predicate: 'homepage',
			label: 'Website',
			value: 'https://www.tenable.com'
		});
		h.store.details.set(TENABLE, detail);
		await h.port.explore(EXPLORE_ARGS, h.context);
		const prompt = h.prompts[0]!.userPrompt;
		expect(prompt.indexOf('https://www.tenable.com/about')).toBeLessThan(
			prompt.indexOf('https://news.example/tenable')
		);
	});

	it("never sends the selected entry's contact details to the page-reading model", async () => {
		const h = harness({ answer: LEADERSHIP_ANSWER });
		h.store.details.set(TENABLE, orgDetail(TENABLE, 'Tenable'));
		await h.port.explore(EXPLORE_ARGS, h.context);
		expect(h.prompts[0]!.userPrompt).toContain('This search is about: Tenable (org)');
		expect(h.prompts[0]!.userPrompt).toContain('Industry: cybersecurity');
		expect(h.prompts[0]!.userPrompt).not.toContain('410-555-0100');
	});

	it('keeps a web find with the name of someone the user knows as a separate entry and asks', async () => {
		const h = harness({
			answer: {
				entities: [
					{ ...LEADERSHIP_ANSWER.entities[0], name: 'Steve Vintz' },
					LEADERSHIP_ANSWER.entities[1]
				]
			}
		});
		h.store.details.set(TENABLE, orgDetail(TENABLE, 'Tenable'));
		h.db.entities.push({
			id: KNOWN_PAT,
			name: 'Steve Vintz',
			normalized_name: 'steve vintz',
			circle: 'inner',
			created_via: 'import'
		});

		const result = await h.port.explore(EXPLORE_ARGS, h.context);
		const steve = (result.knowledge_explore as Row).entities.find(
			(entity: Row) => entity.name === 'Steve Vintz'
		);

		// Every found person gets an entry of their own, outside the user's world.
		expect(h.store.created).toEqual([
			expect.objectContaining({ kind: 'person', name: 'Steve Vintz', circle: 'public' }),
			expect.objectContaining({ kind: 'person', name: 'Mark Thurmond', circle: 'public' })
		]);
		// Facts go onto the new entry, never onto the person from the user's own world.
		expect(steve.id).toBe(h.store.created[0]!.id);
		expect(h.store.mergeQuestions).toHaveLength(1);
		expect(steve.id).not.toBe(KNOWN_PAT);
		expect(steve.maybe_same_as).toEqual({ id: KNOWN_PAT, name: 'Steve Vintz' });
		expect(h.store.mergeQuestions[0]).toMatchObject({ a: KNOWN_PAT, origin: 'identity' });
		const written = h.store.recorded[0]!.batch;
		expect(JSON.stringify(written)).not.toContain(KNOWN_PAT);
		expect(String(result.message)).toContain('Same name as someone the user already has');
	});

	it('reuses an earlier web find of the same name only with evidence it is the same person', async () => {
		const EARLIER = '66666666-6666-4666-8666-666666666666';
		const answer = { entities: [LEADERSHIP_ANSWER.entities[0]] };
		const earlier = {
			id: EARLIER,
			name: 'Steve Vintz',
			normalized_name: 'steve vintz',
			circle: 'public'
		};

		// Same name, found by some other research, nothing tying it to Tenable: a different
		// Steve Vintz until the user says otherwise.
		const stranger = harness({ answer });
		stranger.store.details.set(TENABLE, orgDetail(TENABLE, 'Tenable'));
		stranger.db.entities.push(earlier);
		const apart = await stranger.port.explore(EXPLORE_ARGS, stranger.context);
		const apartSteve = (apart.knowledge_explore as Row).entities.find(
			(entity: Row) => entity.name === 'Steve Vintz'
		);
		expect(apartSteve.id).not.toBe(EARLIER);
		expect(apartSteve.maybe_same_as).toEqual({ id: EARLIER, name: 'Steve Vintz' });
		expect(stranger.store.mergeQuestions[0]!.question).toContain('an earlier search found');
		expect(JSON.stringify(stranger.store.recorded[0]!.batch)).not.toContain(EARLIER);

		// Recorded at the same company: the same person, so the facts go onto that entry.
		const colleague = harness({ answer });
		colleague.store.details.set(TENABLE, orgDetail(TENABLE, 'Tenable'));
		colleague.db.entities.push(earlier, { id: TENABLE, name: 'Tenable' });
		colleague.db.facts.push({ entity_id: EARLIER, object_entity_id: TENABLE });
		const same = await colleague.port.explore(EXPLORE_ARGS, colleague.context);
		const sameSteve = (same.knowledge_explore as Row).entities.find(
			(entity: Row) => entity.name === 'Steve Vintz'
		);
		expect(sameSteve.id).toBe(EARLIER);
		expect(sameSteve.is_new).toBeUndefined();
		expect(colleague.store.created).toEqual([]);
		expect(colleague.store.mergeQuestions).toEqual([]);
	});

	it("saves what the web says about a company from the user's own world as suggestions, never as fact", async () => {
		const ACME = '77777777-7777-4777-8777-777777777777';
		const page =
			'Acme Robotics, a Baltimore robotics company (acmerobotics.example), builds warehouse arms. ' +
			'ZeroFox is a Baltimore cybersecurity company.';
		const h = harness({
			pageText: page,
			searchResults: [
				{
					url: 'https://list.example/baltimore',
					title: 'Baltimore companies',
					snippet: 'A list.'
				}
			],
			answer: {
				entities: [
					{
						name: 'Acme Robotics',
						kind: 'org',
						summary: 'Baltimore robotics company',
						page: 1,
						quote: 'Acme Robotics, a Baltimore robotics company',
						located_in: 'Baltimore',
						website: 'https://acmerobotics.example'
					},
					{
						name: 'ZeroFox',
						kind: 'org',
						summary: 'Baltimore cybersecurity company',
						page: 1,
						quote: 'ZeroFox is a Baltimore cybersecurity company',
						located_in: 'Baltimore'
					}
				]
			}
		});
		// Acme is a client the user already has; ZeroFox is new.
		h.store.existingByName.set('acme robotics', ACME);
		h.db.entities.push({ id: ACME, name: 'Acme Robotics', circle: 'inner' });

		const result = await h.port.explore(
			{
				goal: 'Robotics and security companies in Baltimore',
				searches: [{ query: 'Baltimore companies' }],
				kinds: ['org']
			},
			h.context
		);
		const body = result.knowledge_explore as Row;
		const batch = h.store.recorded[0]!.batch;
		const acmeRef = batch.entities.find((entity) => entity.name === 'Acme Robotics')!;
		const zeroRef = batch.entities.find((entity) => entity.name === 'ZeroFox')!;

		// The store was asked who these are before anything was written.
		expect(h.store.probes).toHaveLength(1);
		expect(acmeRef.id).toBe(ACME);
		// The user's own entry keeps its summary, and every web claim about it waits for them.
		expect(acmeRef.summary).toBeUndefined();
		const acmeFacts = batch.facts.filter((fact) => fact.subject === acmeRef.ref);
		expect(acmeFacts.length).toBeGreaterThan(0);
		expect(acmeFacts.every((fact) => fact.status === 'suggested')).toBe(true);
		// A company the search itself found is saved as stated.
		const zeroFacts = batch.facts.filter((fact) => fact.subject === zeroRef.ref);
		expect(zeroFacts.some((fact) => !fact.status)).toBe(true);
		// The chip for the user's own company is not "new", so it is never offered for removal.
		expect(body.entities.find((entity: Row) => entity.id === ACME).is_new).toBeUndefined();
		expect(body.entities.find((entity: Row) => entity.name === 'ZeroFox').is_new).toBe(true);
	});

	it("tells the page-reading model only public kinds of detail about an entry from the user's own world", async () => {
		const h = harness({ answer: { entities: [] } });
		const detail = orgDetail(TENABLE, 'Tenable', { created_via: 'manual' });
		(detail.entity as Row).summary = 'My biggest client, renewal at risk';
		(detail.facts as Row[]).push(
			{
				status: 'active',
				predicate: 'description',
				label: 'About',
				value: 'Hard to work with'
			},
			{ status: 'active', predicate: 'alias', label: 'Also known as', value: 'The whale' },
			{ status: 'active', predicate: 'founded', label: 'Founded', value: '2002' }
		);
		h.store.details.set(TENABLE, detail);
		await h.port.explore(EXPLORE_ARGS, h.context);
		const prompt = h.prompts[0]!.userPrompt;
		expect(prompt).toContain('This search is about: Tenable (org)');
		expect(prompt).toContain('Industry: cybersecurity');
		expect(prompt).toContain('Founded: 2002');
		expect(prompt).not.toContain('renewal at risk');
		expect(prompt).not.toContain('Hard to work with');
		expect(prompt).not.toContain('The whale');
	});

	it('counts a hop that names no entry from what the user ticked', async () => {
		const h = harness({ answer: { entities: [] } });
		h.db.runs.push({
			id: 'run-0',
			input: { mode: 'explore', chat_session_id: CHAT, hop: 3, turn_run_id: 'earlier' },
			stats: { explore: { entities: [{ id: TENABLE }] } }
		});
		// The model left about_entity_id out; the user had ticked Tenable, found at hop 3.
		const result = await h.port.explore(
			{ goal: 'g', searches: [{ query: 'Tenable leadership team' }] },
			{ ...h.context, selectedEntityIds: [TENABLE] }
		);
		expect((result.knowledge_explore as Row).stopped.reason).toBe('hop_limit');
		expect(h.searches).toEqual([]);
	});

	it('keeps the searches that worked when one fails, and says so', async () => {
		const h = harness({
			answer: { entities: [] },
			makeSearchPort: () => ({
				async search(args) {
					if (String(args.query).includes('broken'))
						throw new Error('search provider down');
					return {
						results: [
							{
								url: ABOUT_URL,
								title: 'Leadership | Tenable',
								snippet: 'Meet the team'
							}
						]
					};
				},
				async visit() {
					return { content: ABOUT_PAGE, title: 'Leadership | Tenable' };
				}
			})
		});
		const result = await h.port.explore(
			{
				goal: 'g',
				searches: [{ query: 'software companies Baltimore' }, { query: 'broken one' }]
			},
			h.context
		);
		expect(h.prompts).toHaveLength(1);
		expect(String(result.message)).toContain('1 search failed');
		expect(h.db.runs.find((row) => row.id === 'run-1')!.status).toBe('completed');
	});

	it('saves nothing when the turn was stopped while the pages were being read', async () => {
		const controller = new AbortController();
		const h = harness({
			llm: {
				async getJSONResponse() {
					controller.abort();
					return LEADERSHIP_ANSWER as never;
				}
			}
		});
		h.store.details.set(TENABLE, orgDetail(TENABLE, 'Tenable'));
		await expect(
			h.port.explore(EXPLORE_ARGS, { ...h.context, signal: controller.signal })
		).rejects.toThrow('Search stopped before saving');
		expect(h.store.created).toEqual([]);
		expect(h.store.recorded).toEqual([]);
		expect(h.db.runs.find((row) => row.id === 'run-1')!.status).toBe('failed');
	});

	it('runs the first three searches of a longer list and reports the rest as left out', async () => {
		const h = harness({ answer: { entities: [] } });
		const result = await h.port.explore(
			{
				goal: 'g',
				searches: ['a', 'b', 'c', 'd', 'e'].map((name) => ({
					query: `${name} leadership team`
				}))
			},
			h.context
		);
		expect(h.searches).toHaveLength(3);
		expect(String(result.message)).toContain('2 searches were left out');
	});

	it('stops a trail at three hops before spending anything, unless told to keep going', async () => {
		const h = harness({ answer: LEADERSHIP_ANSWER });
		h.store.details.set(TENABLE, orgDetail(TENABLE, 'Tenable'));
		h.db.runs.push({
			id: 'run-0',
			input: { mode: 'explore', chat_session_id: CHAT, hop: 3, turn_run_id: 'earlier' },
			stats: { explore: { entities: [{ id: TENABLE }] } }
		});

		const stopped = await h.port.explore(EXPLORE_ARGS, h.context);
		expect((stopped.knowledge_explore as Row).stopped.reason).toBe('hop_limit');
		expect((stopped.knowledge_explore as Row).hop).toBe(4);
		expect(h.searches).toEqual([]);
		expect(h.authorized).toEqual([]);
		expect(h.db.reserveCalls).toEqual([]);
		expect(h.store.recorded).toEqual([]);

		const further = await h.port.explore({ ...EXPLORE_ARGS, beyond_limit: true }, h.context);
		expect((further.knowledge_explore as Row).hop).toBe(4);
		expect(h.searches).toEqual(['Tenable leadership team']);
	});

	it('runs at most two outside searches per message', async () => {
		const h = harness({ answer: { entities: [] } });
		h.db.runs.push(
			{ id: 'a', input: { mode: 'explore', hop: 1, turn_run_id: TURN }, stats: {} },
			{ id: 'b', input: { mode: 'explore', hop: 1, turn_run_id: TURN }, stats: {} }
		);
		const result = await h.port.explore(
			{ goal: 'g', searches: [{ query: 'software companies Baltimore' }] },
			h.context
		);
		expect((result.knowledge_explore as Row).stopped.reason).toBe('turn_limit');
		expect(h.searches).toEqual([]);
	});

	it('searches nothing when no query is cleared to leave, and reserves nothing', async () => {
		const h = harness({ answer: LEADERSHIP_ANSWER });
		const result = await h.port.explore(
			{ goal: 'g', searches: [{ query: 'private codename Falcon revenue' }] },
			{ ...h.context, authorizeQuery: async () => false }
		);
		expect((result.knowledge_explore as Row).stopped.reason).toBe('not_allowed');
		expect(h.searches).toEqual([]);
		expect(h.db.reserveCalls).toEqual([]);
	});

	it('runs only the cleared searches when some are refused', async () => {
		const h = harness({ answer: { entities: [] } });
		await h.port.explore(
			{
				goal: 'g',
				searches: [{ query: 'software companies Baltimore' }, { query: 'secret thing' }]
			},
			{ ...h.context, authorizeQuery: async (query) => !query.includes('secret') }
		);
		expect(h.searches).toEqual(['software companies Baltimore']);
		expect(h.db.reserveCalls[0]!.p_input.queries).toEqual(['software companies Baltimore']);
	});

	it('reports the daily allowance or a busy queue without searching', async () => {
		const h = harness();
		h.db.reserve = { error: 'spent' };
		const spent = await h.port.explore(
			{ goal: 'g', searches: [{ query: 'software companies Baltimore' }] },
			h.context
		);
		expect((spent.knowledge_explore as Row).stopped.reason).toBe('allowance');
		h.db.reserve = { error: 'busy' };
		const busy = await h.port.explore(
			{ goal: 'g', searches: [{ query: 'software companies Baltimore' }] },
			h.context
		);
		expect((busy.knowledge_explore as Row).stopped.reason).toBe('busy');
		expect(h.searches).toEqual([]);
	});

	it('closes the run as failed when the page-reading model throws', async () => {
		const h = harness({
			llm: {
				async getJSONResponse() {
					throw new Error('model down');
				}
			}
		});
		await expect(
			h.port.explore(
				{ goal: 'g', searches: [{ query: 'software companies Baltimore' }] },
				h.context
			)
		).rejects.toThrow('model down');
		const run = h.db.runs.find((row) => row.id === 'run-1')!;
		expect(run.status).toBe('failed');
		expect(run.error).toBe('model down');
		expect(h.store.recorded).toEqual([]);
	});

	it('never reads a people-finder site, and stops when no page can be read', async () => {
		const h = harness({
			searchResults: [
				{ url: 'https://www.spokeo.com/Steve-Vintz', title: 'Steve Vintz', snippet: 'x' }
			]
		});
		const result = await h.port.explore(
			{ goal: 'g', searches: [{ query: 'Steve Vintz Tenable' }] },
			h.context
		);
		expect(h.visits).toEqual([]);
		expect((result.knowledge_explore as Row).stopped.reason).toBe('nothing_found');
		expect(h.prompts).toEqual([]);
		expect(h.db.runs.find((row) => row.id === 'run-1')!.status).toBe('completed');
	});

	it('refuses an about_entity_id the user does not have', async () => {
		const h = harness();
		await expect(h.port.explore(EXPLORE_ARGS, h.context)).rejects.toThrow(
			/about_entity_id not found/
		);
		expect(h.searches).toEqual([]);
	});
});

describe('find_in_knowledge: inside the graph', () => {
	const person = (id: string, name: string, extra: Row = {}): Row => ({
		id,
		name,
		known: false,
		jobs: [],
		places: [],
		industries: [],
		tasks: 0,
		documents: 0,
		projects: 0,
		...extra
	});

	it('judges each person, hides the ruled out, and says what is missing without the values', async () => {
		const judge = decider((key, card) =>
			key.endsWith('__near') ? (card.places.length ? 'yes' : 'unknown') : 'no'
		);
		const h = harness({
			decider: decider((key, card) => {
				if (key.endsWith('__software')) return card.name === 'Cy' ? 'no' : 'yes';
				return card.places.length ? 'yes' : 'unknown';
			})
		});
		void judge;
		h.db.people = [
			person('a0000000-0000-4000-8000-000000000001', 'Ann', {
				known: true,
				places: ['Baltimore, MD'],
				jobs: [{ org_id: 'o1', org: 'Murtech', title: 'Engineer', current: true }],
				phone: ['410-555-0111'],
				tasks: 3
			}),
			person('a0000000-0000-4000-8000-000000000002', 'Bo', {
				email: ['bo@example.com'],
				tasks: 9
			}),
			person('a0000000-0000-4000-8000-000000000003', 'Cy', { places: ['Towson, MD'] })
		];

		const result = await h.port.find(
			{
				goal: 'Who do I know near Baltimore who works in software',
				checks: [
					{ key: 'near', question: 'Near Baltimore?' },
					{ key: 'software', question: 'Works in software?' }
				],
				need: ['phone', 'email']
			},
			h.context
		);
		const body = result.knowledge_find as Row;

		expect(h.db.connectionArgs!.p_viewer).toBe(USER);
		expect(body.counts).toEqual({ pass_all: 1, cant_tell: 1, ruled_out: 1 });
		// Passing first; the ruled-out person is counted, not listed.
		expect(body.entities.map((entity: Row) => entity.name)).toEqual(['Ann', 'Bo']);
		expect(body.entities[0]).toMatchObject({
			origin: 'graph',
			hop: 0,
			known: true,
			fit: { near: 'yes', software: 'yes' },
			have: ['phone'],
			missing: ['email'],
			summary: 'Engineer, Murtech · Baltimore, MD'
		});
		expect(body.entities[1]).toMatchObject({ have: ['email'], missing: ['phone'] });
		// Presence only: no phone number or address leaves the tool.
		const serialized = JSON.stringify(result);
		expect(serialized).not.toContain('410-555-0111');
		expect(serialized).not.toContain('bo@example.com');
		expect(body.notes.join(' ')).toContain('A location');
		expect(h.steps.map((step) => step.kind)).toEqual(['lookup', 'decide', 'lookup']);
		expect(h.searches).toEqual([]);
	});

	it('passes exact filters through and flags a first-name entry that may be a longer one', async () => {
		const h = harness();
		h.db.people = [
			person('a0000000-0000-4000-8000-000000000001', 'Tom', {
				jobs: [{ org_id: 'murtech', org: 'Murtech', current: true }]
			}),
			person('a0000000-0000-4000-8000-000000000002', 'Tom Mann', {
				jobs: [{ org_id: 'murtech', org: 'Murtech', title: 'CEO', current: true }]
			})
		];
		const result = await h.port.find(
			{ goal: 'Who do we know at Murtech', where: { company: ['Murtech'] }, need: ['phone'] },
			h.context
		);
		expect(h.db.connectionArgs!.p_filters).toMatchObject({ company: ['Murtech'] });
		const body = result.knowledge_find as Row;
		const tom = body.entities.find((entity: Row) => entity.name === 'Tom');
		expect(tom.maybe_same_as).toEqual({
			id: 'a0000000-0000-4000-8000-000000000002',
			name: 'Tom Mann'
		});
		expect(body.notes.join(' ')).toContain('"Tom" and Tom Mann');
		// No checks asked: nothing is judged.
		expect(tom.fit).toBeUndefined();
	});

	const entry = (id: string, kind: string, name: string, extra: Row = {}): GuidedEntry =>
		({
			id,
			kind,
			name,
			industries: [],
			places: [],
			part_of: [],
			topics: [],
			owners: [],
			owned_by_user: false,
			people: [],
			people_total: 0,
			located_here: 0,
			on_file: { phone: false, email: false, website: false, social: false, address: false },
			platforms: [],
			records: { tasks: 0, documents: 0, projects: 0 },
			...extra
		}) as GuidedEntry;
	const MURTECH = 'b0000000-0000-4000-8000-000000000001';
	const ACME = 'b0000000-0000-4000-8000-000000000002';
	const CHANNEL = 'b0000000-0000-4000-8000-000000000003';

	it('searches companies and accounts, not only people, with what each kind records', async () => {
		const cards: Row[] = [];
		const poolCalls: Row[] = [];
		const h = harness({
			decider: decider((_key, card) => {
				cards.push(card);
				return card.industry?.includes('fintech') ? 'yes' : 'unknown';
			}),
			readEntryPool: async (userId, options) => {
				poolCalls.push({ userId, ...options });
				return {
					total: 3,
					entries: [
						entry(MURTECH, 'org', 'Murtech', {
							industries: ['fintech'],
							places: ['Baltimore, MD'],
							people: [{ id: 'p1', name: 'Tom Mann', title: 'CEO', current: true }],
							people_total: 1,
							on_file: {
								phone: true,
								email: false,
								website: true,
								social: false,
								address: false
							},
							records: { tasks: 4, documents: 0, projects: 1 }
						}),
						entry(ACME, 'org', 'Acme Logistics', { industries: ['freight'] }),
						entry(CHANNEL, 'channel', 'Fintech Weekly', {
							owners: ['Murtech'],
							on_file: {
								phone: false,
								email: false,
								website: true,
								social: false,
								address: false
							}
						})
					]
				};
			}
		});
		const result = await h.port.find(
			{
				goal: 'Which fintech companies and channels do I have, and what is missing',
				kinds: ['org', 'channel'],
				checks: [{ key: 'fintech', question: 'Is it in fintech?' }],
				need: ['website', 'social', 'people', 'title', 'phone']
			},
			h.context
		);
		const body = result.knowledge_find as Row;

		// People were not asked for: the people pool is never read.
		expect(h.db.connectionArgs).toBeNull();
		expect(poolCalls).toEqual([
			{ userId: USER, kinds: ['org', 'channel'], scope: 'world', limit: 150 }
		]);
		expect(body.kinds).toEqual(['org', 'channel']);
		expect(body.pool).toEqual({ total: 3, looked_at: 3, by_kind: { org: 2, channel: 1 } });
		expect(body.entities.map((entity: Row) => [entity.kind, entity.name])).toEqual([
			['org', 'Murtech'],
			['org', 'Acme Logistics'],
			['channel', 'Fintech Weekly']
		]);
		// A company is judged on what a company records: its industry, place and who is on file.
		const murtechCard = cards.find((card) => card.name === 'Murtech')!;
		expect(murtechCard).toMatchObject({
			kind: 'org',
			industry: ['fintech'],
			located_in: ['Baltimore, MD'],
			people_on_file_count: 1,
			people_the_user_has_on_file_there: [{ name: 'Tom Mann', title: 'CEO', current: true }]
		});
		// A detail that cannot exist for a kind is neither on file nor missing: no job title
		// for a company, no people or phone for a channel.
		expect(body.entities[0]).toMatchObject({
			summary: 'fintech · Baltimore, MD',
			fit: { fintech: 'yes' },
			have: ['website', 'people', 'phone'],
			missing: ['social']
		});
		expect(body.entities[2]).toMatchObject({ have: ['website'], missing: [] });
		expect(body.entities[2].known).toBeUndefined();
		expect(String(result.message)).toContain('entries (organizations and channels)');
	});

	it('narrows other kinds by the exact words that describe them, and mixes them with people', async () => {
		const h = harness({
			readEntryPool: async () => ({
				total: 2,
				entries: [
					entry(MURTECH, 'org', 'Murtech', { places: ['Baltimore, MD'] }),
					entry(ACME, 'org', 'Acme Logistics', { places: ['Denver, CO'] })
				]
			}),
			readEntryFacts: async () =>
				new Map([
					[
						'a0000000-0000-4000-8000-000000000001',
						{
							...entry('x', 'person', 'x'),
							on_file: {
								phone: false,
								email: false,
								website: false,
								social: true,
								address: false
							}
						}
					]
				])
		});
		h.db.people = [person('a0000000-0000-4000-8000-000000000001', 'Ann', { tasks: 2 })];
		const result = await h.port.find(
			{
				goal: 'Everyone and every company I have in Baltimore',
				kinds: ['person', 'org'],
				where: { place: ['baltimore'], title: ['engineer'] },
				need: ['social']
			},
			h.context
		);
		const body = result.knowledge_find as Row;
		// The place word went to the people pool as a filter and narrowed the companies here.
		expect(h.db.connectionArgs!.p_filters).toMatchObject({ place: ['baltimore'] });
		expect(body.entities.map((entity: Row) => entity.name)).toEqual(['Ann', 'Murtech']);
		// A person's accounts are read only because they were asked for.
		expect(body.entities[0]).toMatchObject({ kind: 'person', have: ['social'] });
		expect(body.entities[1]).toMatchObject({ kind: 'org', missing: ['social'] });
		expect(body.notes.join(' ')).toContain('where.title narrows people only');
		expect(body.pool.by_kind).toEqual({ person: 1, org: 1 });
	});
});

describe('what a page supports', () => {
	const lanes: ExploreLane[] = [
		{
			query: 'Tenable leadership team',
			about: {
				id: TENABLE,
				kind: 'org',
				name: 'Tenable',
				summary: null,
				facts: [],
				foundOnWeb: true
			}
		},
		{ query: 'software companies Baltimore' }
	];
	const pages: ExplorePage[] = [
		{ url: ABOUT_URL, title: 'Leadership', content: ABOUT_PAGE, search: 1 },
		{
			url: 'https://technical.ly/baltimore-software',
			title: 'Baltimore software companies',
			content:
				'ZeroFox, a Baltimore cybersecurity company, and Fearless (fearless.tech), a ' +
				'digital services firm in downtown Baltimore, lead the list.',
			search: 2
		}
	];
	const context = {
		kinds: ['person', 'org'] as const,
		lanes,
		pages,
		resultUrls: [
			ABOUT_URL,
			'https://technical.ly/baltimore-software',
			'https://www.zerofox.com/'
		]
	};

	it('keeps an entry only when its quote and name are on the cited page', () => {
		const out = validateExploreAnswer(
			{
				entities: [
					{
						name: 'ZeroFox',
						kind: 'org',
						summary: 'Baltimore cybersecurity company',
						page: 2,
						quote: 'ZeroFox, a Baltimore  cybersecurity company',
						website: 'https://www.zerofox.com/',
						located_in: 'Baltimore'
					},
					{
						name: 'Fearless',
						kind: 'org',
						page: 2,
						quote: 'Fearless (fearless.tech), a digital services firm',
						website: 'https://fearless.tech/',
						profiles: ['https://www.linkedin.com/company/fearless']
					},
					// The quote is real but sits on the other page.
					{ name: 'ZeroFox Two', kind: 'org', page: 1, quote: 'ZeroFox, a Baltimore' },
					// The quote is on the page; the name is not.
					{
						name: 'Catalyte',
						kind: 'org',
						page: 2,
						quote: 'a digital services firm in downtown Baltimore'
					},
					{ name: 'Baltimore', kind: 'place', page: 2, quote: 'in downtown Baltimore' },
					{ name: 'Too short', kind: 'org', page: 2, quote: 'lead' }
				]
			},
			context
		);
		expect(out.found.map((found) => found.name)).toEqual(['ZeroFox', 'Fearless']);
		expect(out.found[0]).toMatchObject({
			lane: 1,
			relation: 'none',
			website: 'https://www.zerofox.com/',
			locatedIn: 'Baltimore'
		});
		// A site printed on the page counts; a profile nobody saw does not.
		expect(out.found[1]!.website).toBe('https://fearless.tech/');
		expect(out.found[1]!.profiles).toEqual([]);
		expect(out.dropped.map((drop) => drop.reason)).toEqual([
			'quote is not on the page',
			'name is not on the page',
			'kind not asked for',
			'quote is not on the page'
		]);
	});

	it('keeps at most five leaders for a company and never the company itself', () => {
		const names = ['Ada', 'Ben', 'Cal', 'Dee', 'Eve', 'Fay', 'Gus'];
		const page: ExplorePage = {
			url: ABOUT_URL,
			title: null,
			content: `Tenable. ${names.map((name) => `${name} Stone, Vice President`).join('. ')}.`,
			search: 1
		};
		const out = validateExploreAnswer(
			{
				entities: [
					{ name: 'Tenable', kind: 'org', page: 1, quote: 'Tenable. Ada Stone' },
					...names.map((name) => ({
						name: `${name} Stone`,
						kind: 'person',
						page: 1,
						quote: `${name} Stone, Vice President`,
						search: 1,
						title: 'Vice President',
						role: 'executive',
						relation: 'leads'
					}))
				]
			},
			{ ...context, pages: [page] }
		);
		expect(out.found).toHaveLength(5);
		expect(out.found.some((found) => found.name === 'Tenable')).toBe(false);
		expect(out.dropped.filter((drop) => drop.reason.includes('kept per company'))).toHaveLength(
			2
		);
	});

	it("saves claims about someone from the user's own world as suggestions", () => {
		const ownLane: ExploreLane = {
			query: 'Tom Mann Murtech',
			about: {
				id: KNOWN_PAT,
				kind: 'person',
				name: 'Tom Mann',
				summary: null,
				facts: [],
				foundOnWeb: false
			}
		};
		const page: ExplorePage = {
			url: 'https://murtech.com/about',
			title: 'About',
			content: 'Tom Mann founded Murtech Consulting in Glen Burnie in 2003.',
			search: 1
		};
		const valid = validateExploreAnswer(
			{
				entities: [
					{
						name: 'Murtech Consulting',
						kind: 'org',
						summary: 'IT consulting firm',
						page: 1,
						quote: 'Tom Mann founded Murtech Consulting',
						search: 1,
						relation: 'founded'
					}
				],
				about: [
					{
						search: 1,
						facts: [
							{
								field: 'headline',
								value: 'Founder, Murtech Consulting',
								page: 1,
								quote: 'Tom Mann founded Murtech Consulting'
							}
						]
					}
				]
			},
			{ kinds: ['org'], lanes: [ownLane], pages: [page], resultUrls: [] }
		);
		const plan = buildExploreBatch({
			found: valid.found,
			about: valid.about,
			lanes: [ownLane],
			pages: [page],
			resolve: () => ({ mode: 'new' })
		});
		const aboutTom = plan.batch.facts.filter((fact) => fact.subject === KNOWN_PAT);
		expect(aboutTom.map((fact) => [fact.predicate, fact.status])).toEqual([
			['works_at', 'suggested'],
			['headline', 'suggested']
		]);
		expect(aboutTom[0]!.qualifiers).toEqual({ title: 'Founder' });
		// The new company's own description is stated plainly, with its quote.
		expect(plan.batch.facts[0]).toMatchObject({
			subject: 'n1',
			predicate: 'description',
			quote: 'Tom Mann founded Murtech Consulting'
		});
		expect(plan.batch.facts[0]!.status).toBeUndefined();
	});

	it('flags a first-name entry only when exactly one longer name shares its employer', () => {
		const twins = flagPossibleTwins([
			{ id: '1', name: 'Tom', orgIds: ['murtech'] },
			{ id: '2', name: 'Tom Mann', orgIds: ['murtech'] },
			{ id: '3', name: 'Tom Hale', orgIds: ['other'] },
			{ id: '4', name: 'Sam', orgIds: ['murtech'] },
			{ id: '5', name: 'Sam Ito', orgIds: ['murtech'] },
			{ id: '6', name: 'Sam Oz', orgIds: ['murtech'] }
		]);
		expect([...twins.entries()]).toEqual([['1', { id: '2', name: 'Tom Mann' }]]);
	});
});

describe('which search an entry belongs to', () => {
	const lanes: ExploreLane[] = ['Alpha', 'Beta'].map((name, index) => ({
		query: `${name} leadership team`,
		about: {
			id: `a000000${index}-0000-4000-8000-000000000000`,
			kind: 'org' as const,
			name,
			summary: null,
			facts: [],
			foundOnWeb: true
		}
	}));
	const pages: ExplorePage[] = [
		{
			url: 'https://alpha.example/team',
			title: 'Alpha team',
			content:
				'Alpha leadership: Dana Cruz, Chief Executive Officer. Alpha was founded in 2011.',
			search: 1
		},
		{
			url: 'https://beta.example/team',
			title: 'Beta team',
			content: 'Beta leadership page.',
			search: 2
		}
	];

	it('takes it from the page the entry was read on, never from what the model says', () => {
		const out = validateExploreAnswer(
			{
				entities: [
					{
						name: 'Dana Cruz',
						kind: 'person',
						page: 1,
						quote: 'Dana Cruz, Chief Executive Officer',
						// Wrong on purpose: the page came from the Alpha search.
						search: 2,
						title: 'Chief Executive Officer',
						role: 'executive'
					}
				],
				about: [
					{
						// A fact about Beta quoted from Alpha's page is not Beta's.
						search: 2,
						facts: [
							{
								field: 'founded',
								value: '2011',
								page: 1,
								quote: 'Alpha was founded in 2011'
							}
						]
					}
				]
			},
			{ kinds: ['person'], lanes, pages, resultUrls: [] }
		);
		expect(out.found).toHaveLength(1);
		expect(out.found[0]!.lane).toBe(0);
		expect(out.about).toEqual([]);
		const plan = buildExploreBatch({
			found: out.found,
			about: out.about,
			lanes,
			pages,
			resolve: () => ({ mode: 'new' })
		});
		const job = plan.batch.facts.find((fact) => fact.predicate === 'works_at')!;
		expect(job.object).toBe(lanes[0]!.about!.id);
	});

	it('reads a check answer of anything but yes or no as unknown', () => {
		const out = validateExploreAnswer(
			{
				entities: [
					{
						name: 'Dana Cruz',
						kind: 'person',
						page: 1,
						quote: 'Dana Cruz, Chief Executive Officer',
						title: 'Chief Executive Officer',
						role: 'executive',
						checks: { leader: 'YES', local: 'probably', extra: 'yes' }
					}
				]
			},
			{
				kinds: ['person'],
				lanes,
				pages,
				resultUrls: [],
				checks: [
					{ key: 'leader', question: 'Runs it?' },
					{ key: 'local', question: 'Local?' },
					{ key: 'missing', question: 'Not answered?' }
				]
			}
		);
		expect(out.found[0]!.fit).toEqual({ leader: 'yes', local: 'unknown', missing: 'unknown' });
	});
});

describe('what the reading model is given', () => {
	const result = (lane: number, n: number) => ({ url: `https://s${lane}.example/${n}`, lane });

	it('deals full pages out evenly between the searches and keeps every other result as a preview', () => {
		const ranked = [0, 1, 2].flatMap((lane) => [1, 2, 3, 4, 5].map((n) => result(lane, n)));
		// Search 2's second result would not open.
		const opened = new Map(
			ranked.filter((r) => r.url !== 'https://s1.example/2').map((r) => [r.url, 'text'])
		);
		const plan = planExploreReading(ranked, opened, () => 'preview lines', 3);
		expect(plan.full).toHaveLength(EXPLORE_MAX_PAGES);
		// Round one takes each search's best page before any search gets a second.
		expect(plan.full.slice(0, 3).map((r) => r.url)).toEqual([
			'https://s0.example/1',
			'https://s1.example/1',
			'https://s2.example/1'
		]);
		expect(plan.full.filter((r) => r.lane === 1).map((r) => r.url)).toEqual([
			'https://s1.example/1',
			'https://s1.example/3',
			'https://s1.example/4'
		]);
		// Nothing a search returned is dropped: the rest are previews, the unopened one included.
		expect(plan.full.length + plan.previews.length).toBe(ranked.length);
		expect(plan.previews.map((r) => r.url)).toContain('https://s1.example/2');
	});

	it('leaves out a result with nothing to read', () => {
		const ranked = [result(0, 1), result(0, 2)];
		const plan = planExploreReading(
			ranked,
			new Map(),
			(r) => (r.url.endsWith('/2') ? 'lines' : null),
			1
		);
		expect(plan.full).toEqual([]);
		expect(plan.previews).toEqual([ranked[1]]);
	});
});
