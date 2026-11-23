// packages/shared-agent-ops/src/knowledge/guided-search.test.ts
//
// Guided search's shared core: what the two chat tools accept, how hops are counted and capped,
// how each entry is judged, and what the model is told about entries the user ticked.
import { describe, expect, it } from 'vitest';
import type { IdentityDecider } from './identity';
import {
	EXPLORE_KNOWLEDGE_TOOL_NAME,
	EXPLORE_MAX_CALLS_PER_TURN,
	FIND_IN_KNOWLEDGE_TOOL_NAME,
	FIND_NEED_APPLIES,
	FIND_NEED_KEYS,
	GUIDED_SEARCH_HOP_LIMIT,
	GuidedSearchError,
	KNOWLEDGE_SELECTION_MAX,
	KNOWLEDGE_SELECTION_SECTION_ID,
	buildKnowledgeSelectionSection,
	emptySearchTrail,
	exploreRefusal,
	judgeGuidedChecks,
	loadKnowledgeSelection,
	loadSearchTrail,
	nextHop,
	parseExploreArgs,
	parseFindArgs,
	rankByFit,
	readGuidedSearchResult,
	readKnowledgeEntryFacts,
	readKnowledgeEntryPool,
	readKnowledgeSelectionSection,
	renderKnowledgeSelectionBlock,
	reserveExploreRun,
	type KnowledgeSelectionEntry,
	type SearchTrail
} from './guided-search';
import type { KnowledgeEntityDetail } from './types';

const USER = '11111111-1111-4111-8111-111111111111';
const CHAT = '22222222-2222-4222-8222-222222222222';
const TENABLE = '33333333-3333-4333-8333-333333333333';
const PERSON = '44444444-4444-4444-8444-444444444444';
const TURN = '55555555-5555-4555-8555-555555555555';

describe('explore_knowledge arguments', () => {
	it('keeps the goal, searches, kinds and checks, and defaults kinds to people and orgs', () => {
		const args = parseExploreArgs({
			goal: '  Software   companies near Baltimore ',
			searches: [
				{ query: 'software companies Baltimore Maryland' },
				{ query: 'Tenable leadership team', about_entity_id: TENABLE.toUpperCase() }
			],
			checks: [{ key: 'Near', question: 'Is it in the Baltimore area?' }]
		});
		expect(args.goal).toBe('Software companies near Baltimore');
		expect(args.kinds).toEqual(['person', 'org']);
		expect(args.searches[1]).toEqual({
			query: 'Tenable leadership team',
			about_entity_id: TENABLE
		});
		expect(args.checks).toEqual([{ key: 'near', question: 'Is it in the Baltimore area?' }]);
		expect(args.beyondLimit).toBe(false);
	});

	it('drops a repeated query and refuses a call with nothing to search', () => {
		const args = parseExploreArgs({
			goal: 'g',
			searches: [{ query: 'Acme leadership' }, { query: 'acme LEADERSHIP' }]
		});
		expect(args.searches).toHaveLength(1);
		expect(() => parseExploreArgs({ goal: 'g', searches: [] })).toThrow(GuidedSearchError);
		expect(() => parseExploreArgs({ searches: [{ query: 'x' }] })).toThrow(/goal is required/);
	});

	it('runs the first three of a longer list of searches and counts the rest as left out', () => {
		// The user can tick more entries than one hop searches: that must not fail the hop.
		const five = Array.from({ length: 5 }, (_, i) => ({ query: `q${i}` }));
		const args = parseExploreArgs({ goal: 'g', searches: five });
		expect(args.searches.map((search) => search.query)).toEqual(['q0', 'q1', 'q2']);
		expect(args.skippedSearches).toBe(2);
		expect(parseExploreArgs({ goal: 'g', searches: [{ query: 'q' }] }).skippedSearches).toBe(0);
	});

	it('refuses more checks than one hop allows, and unknown kinds', () => {
		expect(
			parseExploreArgs({ goal: 'g', searches: [{ query: 'q' }], kinds: ['channel'] }).kinds
		).toEqual(['channel']);
		expect(() =>
			parseExploreArgs({ goal: 'g', searches: [{ query: 'q' }], kinds: ['video'] })
		).toThrow(/kinds may hold only/);
		expect(() =>
			parseExploreArgs({
				goal: 'g',
				searches: [{ query: 'q' }],
				checks: [
					{ key: 'near', question: 'a?' },
					{ key: 'near', question: 'b?' }
				]
			})
		).toThrow(/repeats "near"/);
		expect(() =>
			parseExploreArgs({ goal: 'g', searches: [{ query: 'q', about_entity_id: 'tenable' }] })
		).toThrow(/knowledge entity id/);
	});

	it('goes past the hop limit only on an explicit true', () => {
		const base = { goal: 'g', searches: [{ query: 'q' }] };
		expect(parseExploreArgs({ ...base, beyond_limit: true }).beyondLimit).toBe(true);
		expect(parseExploreArgs({ ...base, beyond_limit: 'true' }).beyondLimit).toBe(false);
	});
});

describe('find_in_knowledge arguments', () => {
	it('reads filters, checks and the details to report', () => {
		const args = parseFindArgs({
			goal: 'Who do we have at Murtech and whose phone is missing',
			where: { company: ['Murtech'], employment: 'any', scope: 'known' },
			need: ['phone', 'email', 'phone']
		});
		expect(args.where).toEqual({ company: ['Murtech'], employment: 'any', scope: 'known' });
		expect(args.need).toEqual(['phone', 'email']);
		expect(args.checks).toEqual([]);
		// People are the main case and the default.
		expect(args.kinds).toEqual(['person']);
	});

	it('searches any kind of entry when asked, with the details that kind can have', () => {
		const args = parseFindArgs({
			goal: 'Which companies and channels do I have without a website',
			kinds: ['org', 'channel', 'org'],
			need: ['website', 'social', 'people', 'industry']
		});
		expect(args.kinds).toEqual(['org', 'channel']);
		expect(args.need).toEqual(['website', 'social', 'people', 'industry']);
		expect(() => parseFindArgs({ goal: 'g', kinds: ['spaceship'] })).toThrow(
			/kinds may hold only/
		);
		// A job title cannot be on file for a company; a list of people cannot be for a person.
		expect(FIND_NEED_APPLIES.title).toEqual(['person']);
		expect(FIND_NEED_APPLIES.people).toEqual(['org']);
		for (const key of FIND_NEED_KEYS) expect(FIND_NEED_APPLIES[key].length).toBeGreaterThan(0);
	});

	it('refuses a filter value or detail it does not know', () => {
		expect(() => parseFindArgs({ goal: 'g', where: { scope: 'everyone' } })).toThrow(
			/where.scope must be one of/
		);
		expect(() => parseFindArgs({ goal: 'g', need: ['salary'] })).toThrow(/need may hold only/);
		expect(() => parseFindArgs({ goal: 'g', where: 'Baltimore' })).toThrow(
			/where must be an object/
		);
	});
});

describe('hop accounting', () => {
	const trail = (): SearchTrail => ({
		depth: new Map([
			[TENABLE, 1],
			[PERSON, 2]
		]),
		runs: [
			{ id: 'r1', hop: 1, turnRunId: 'old-turn' },
			{ id: 'r2', hop: 2, turnRunId: 'old-turn-2' }
		]
	});

	it('starts at hop 1 and goes one further than the deepest entry it starts from', () => {
		expect(nextHop(emptySearchTrail(), [])).toBe(1);
		// An entry from the user's own graph was never found by a hop: it counts as the start.
		expect(nextHop(trail(), ['99999999-9999-4999-8999-999999999999'])).toBe(1);
		expect(nextHop(trail(), [TENABLE])).toBe(2);
		expect(nextHop(trail(), [TENABLE, PERSON])).toBe(3);
	});

	it('stops a trail past three hops unless the user said to keep going', () => {
		const four = GUIDED_SEARCH_HOP_LIMIT + 1;
		expect(
			exploreRefusal({ trail: trail(), hop: four, turnRunId: TURN, beyondLimit: false })
		).toBe('hop_limit');
		expect(
			exploreRefusal({ trail: trail(), hop: four, turnRunId: TURN, beyondLimit: true })
		).toBeNull();
		expect(
			exploreRefusal({
				trail: trail(),
				hop: GUIDED_SEARCH_HOP_LIMIT,
				turnRunId: TURN,
				beyondLimit: false
			})
		).toBeNull();
	});

	it('allows only a couple of outside searches per message', () => {
		const busy = trail();
		for (let i = 0; i < EXPLORE_MAX_CALLS_PER_TURN; i++)
			busy.runs.push({ id: `t${i}`, hop: 1, turnRunId: TURN });
		expect(exploreRefusal({ trail: busy, hop: 1, turnRunId: TURN, beyondLimit: true })).toBe(
			'turn_limit'
		);
		// Another message in the same chat starts fresh.
		expect(
			exploreRefusal({ trail: busy, hop: 1, turnRunId: 'next-turn', beyondLimit: false })
		).toBeNull();
	});

	it("reads the trail from this chat's runs: the shallowest hop that found each entry", async () => {
		const filters: Array<[string, unknown]> = [];
		const ordering: Array<[string, boolean]> = [];
		const limits: number[] = [];
		const rows = [
			{
				id: 'r1',
				input: { mode: 'explore', chat_session_id: CHAT, hop: 1, turn_run_id: 'a' },
				stats: { explore: { entities: [{ id: TENABLE }, { id: PERSON }] } }
			},
			{
				id: 'r2',
				input: { mode: 'explore', chat_session_id: CHAT, hop: 2, turn_run_id: 'b' },
				stats: { explore: { entities: [{ id: PERSON }, { name: 'no id' }] } }
			},
			{ id: 'r3', input: null, stats: null }
		];
		const query = {
			select: () => query,
			eq: (column: string, value: unknown) => {
				filters.push([column, value]);
				return query;
			},
			order: (column: string, options: { ascending: boolean }) => {
				ordering.push([column, options.ascending]);
				return query;
			},
			limit: async (count: number) => {
				limits.push(count);
				return { data: rows, error: null };
			}
		};
		const trail = await loadSearchTrail({ from: () => query, rpc: () => null }, USER, CHAT);
		expect(filters).toEqual([
			['owner_user_id', USER],
			['run_type', 'enrichment'],
			['input->>mode', 'explore'],
			['input->>chat_session_id', CHAT]
		]);
		// Newest first: in a long chat the latest hops and this message's runs are the ones
		// the limits must see.
		expect(ordering).toEqual([['created_at', false]]);
		expect(limits[0]).toBeGreaterThanOrEqual(200);
		expect(trail.depth.get(TENABLE)).toBe(1);
		expect(trail.depth.get(PERSON)).toBe(1);
		expect(trail.runs.map((run) => [run.hop, run.turnRunId])).toEqual([
			[1, 'a'],
			[2, 'b'],
			[1, null]
		]);
		// A chat id that is not an id reads nothing instead of matching every run.
		expect(
			(await loadSearchTrail({ from: () => query, rpc: () => null }, USER, 'nope')).runs
		).toEqual([]);
	});

	it('reserves a run under the research caps and reports a refusal instead of throwing', async () => {
		const calls: Array<Record<string, unknown>> = [];
		const updates: Array<Record<string, unknown>> = [];
		const client = (outcome: Record<string, unknown>) => ({
			from: (table: string) => {
				const query: Record<string, unknown> = {
					select: () => query,
					eq: () => query,
					maybeSingle: async () => ({ data: { is_admin: false }, error: null }),
					update: (patch: Record<string, unknown>) => {
						updates.push({ table, ...patch });
						return query;
					},
					then: (resolve: (value: unknown) => void) => resolve({ error: null })
				};
				return query;
			},
			rpc: async (_fn: string, args: Record<string, unknown>) => {
				calls.push(args);
				return { data: outcome, error: null };
			}
		});
		const input = {
			chatSessionId: CHAT,
			turnRunId: TURN,
			hop: 2,
			goal: 'Software companies near Baltimore',
			fromEntityIds: [TENABLE],
			queries: ['Tenable leadership team']
		};
		const ok = await reserveExploreRun(client({ id: 'run-1', budget: 0.03 }), USER, input);
		expect(ok).toEqual({ runId: 'run-1', budgetUsd: 0.03 });
		expect(calls[0]!.p_input).toMatchObject({
			mode: 'explore',
			chat_session_id: CHAT,
			turn_run_id: TURN,
			hop: 2,
			from_entity_ids: [TENABLE]
		});
		expect(updates[0]).toMatchObject({ table: 'knowledge_runs', status: 'running' });
		expect(await reserveExploreRun(client({ error: 'busy' }), USER, input)).toEqual({
			refused: 'busy'
		});
		expect(await reserveExploreRun(client({ error: 'spent' }), USER, input)).toEqual({
			refused: 'allowance'
		});
	});
});

describe('judging entries against checks', () => {
	const checks = [
		{ key: 'near', question: 'Is it in the Baltimore area?' },
		{ key: 'software', question: 'Does it work in software?' }
	];
	const items = [
		{ id: 'a', card: { name: 'Ann', places: ['Baltimore, MD'] } },
		{ id: 'b', card: { name: 'Bo', places: [] } }
	];
	const choice = (value: string, probability = 0.9) => ({
		type: 'choice',
		choice: value,
		probabilities: { [value]: probability },
		confidence: probability
	});

	it('asks one question per entry per check and maps the answers back', async () => {
		const seen: string[] = [];
		const decider: IdentityDecider = {
			async decide(req) {
				seen.push(...Object.keys(req.questions));
				expect((req.state as { looking_for: string }).looking_for).toBe('goal');
				return {
					ok: true,
					answers: {
						e1__near: choice('yes'),
						e1__software: choice('unknown'),
						e2__near: choice('no'),
						// Held too weakly to report either way.
						e2__software: choice('yes', 0.4)
					},
					receipt: { costUsd: 0.0002 }
				} as never;
			}
		};
		const result = await judgeGuidedChecks(decider, items, checks, { goal: 'goal' });
		expect(seen).toEqual(['e1__near', 'e1__software', 'e2__near', 'e2__software']);
		expect(result.fits.get('a')).toEqual({ near: 'yes', software: 'unknown' });
		expect(result.fits.get('b')).toEqual({ near: 'no', software: 'unknown' });
		expect(result.costUsd).toBeCloseTo(0.0002);
		expect(result.failed).toBe(0);
	});

	it('reads every check as unknown when the decision model fails, throws or is missing', async () => {
		const unknown = { near: 'unknown', software: 'unknown' };
		const failing: IdentityDecider = {
			async decide() {
				return { ok: false, error: 'jev_timeout', receipt: { costUsd: null } } as never;
			}
		};
		const failed = await judgeGuidedChecks(failing, items, checks, { goal: 'g' });
		expect(failed.fits.get('a')).toEqual(unknown);
		expect(failed.failed).toBe(2);
		const throwing: IdentityDecider = {
			async decide() {
				throw new Error('network');
			}
		};
		expect((await judgeGuidedChecks(throwing, items, checks, { goal: 'g' })).failed).toBe(2);
		const none = await judgeGuidedChecks(null, items, checks, { goal: 'g' });
		expect(none.fits.get('b')).toEqual(unknown);
		expect(none.calls).toBe(0);
	});

	it('puts entries that pass everything first and ruled-out ones last', () => {
		const ranked = rankByFit([
			{ name: 'out', fit: { near: 'no' as const, software: 'yes' as const } },
			{ name: 'maybe', fit: { near: 'unknown' as const, software: 'yes' as const } },
			{ name: 'pass', fit: { near: 'yes' as const, software: 'yes' as const } }
		]);
		expect(ranked.map((entry) => entry.name)).toEqual(['pass', 'maybe', 'out']);
	});
});

describe('entries the user selected', () => {
	const entry = (overrides: Partial<KnowledgeSelectionEntry> = {}): KnowledgeSelectionEntry => ({
		entity_id: TENABLE,
		name: 'Tenable',
		kind: 'org',
		summary: 'Cybersecurity company in Columbia, MD',
		found_on_web: true,
		known_by_me: false,
		facts: ['Industry: cybersecurity'],
		...overrides
	});

	it('tells the model who each entry is, where it came from, and how to go further', () => {
		const block = renderKnowledgeSelectionBlock([
			entry(),
			entry({
				entity_id: PERSON,
				name: 'Tom Mann',
				kind: 'person',
				summary: null,
				found_on_web: false,
				known_by_me: true,
				facts: []
			})
		]);
		expect(block).toContain('The user ticked these 2 entries');
		expect(block).toContain(`1. Tenable (Organization; id ${TENABLE}; found on the web`);
		expect(block).toContain(`2. Tom Mann (Person; id ${PERSON}; someone the user knows)`);
		expect(block).toContain('Nothing else is recorded yet.');
		expect(block).toContain(`call ${EXPLORE_KNOWLEDGE_TOOL_NAME} once`);
		expect(block).toContain('about_entity_id');
	});

	it('round-trips as a prompt section placed after the user message', () => {
		const section = buildKnowledgeSelectionSection([entry()]);
		expect(section.id).toBe(KNOWLEDGE_SELECTION_SECTION_ID);
		expect((section.slots as { placement: string }).placement).toBe('after_user_message');
		const read = readKnowledgeSelectionSection([{ id: 'other' }, section]);
		expect(read?.entities).toEqual([{ entity_id: TENABLE, name: 'Tenable', kind: 'org' }]);
		expect(read?.content).toContain('Tenable');
		expect(readKnowledgeSelectionSection([{ id: 'other' }])).toBeNull();
		// A section whose entries were tampered into nonsense is not a selection.
		expect(
			readKnowledgeSelectionSection([
				{ ...section, slots: { entities: [{ entity_id: 'x', name: 'y', kind: 'org' }] } }
			])
		).toBeNull();
	});

	it('loads only entries the user can see, in the order ticked, capped', async () => {
		const detail = (id: string, name: string): KnowledgeEntityDetail =>
			({
				entity: { id, kind: 'org', name, summary: null, created_via: 'enrichment' },
				facts: [
					{
						status: 'active',
						predicate: 'industry',
						label: 'Industry',
						value: 'software'
					},
					{ status: 'active', predicate: 'note', label: 'Note', value: 'private note' },
					{ status: 'suggested', predicate: 'founded', label: 'Founded', value: '2002' }
				],
				known_by_me: false
			}) as never;
		const asked: string[] = [];
		const store = {
			async getEntity(id: string) {
				asked.push(id);
				if (id === PERSON) return null;
				if (id === CHAT) throw new Error('boom');
				return detail(id, `Org ${id.slice(0, 2)}`);
			}
		};
		const loaded = await loadKnowledgeSelection(store, [
			TENABLE.toUpperCase(),
			'not-an-id',
			PERSON,
			CHAT,
			TENABLE
		]);
		expect(asked).toEqual([TENABLE, PERSON, CHAT]);
		expect(loaded).toHaveLength(1);
		// Suggested facts and private notes are not handed to the model as known.
		expect(loaded[0]!.facts).toEqual(['Industry: software']);
		expect(loaded[0]!.found_on_web).toBe(true);

		const many = Array.from(
			{ length: KNOWLEDGE_SELECTION_MAX + 5 },
			(_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`
		);
		asked.length = 0;
		await loadKnowledgeSelection(store, many);
		expect(asked).toHaveLength(KNOWLEDGE_SELECTION_MAX);
	});
});

describe('reading a search result back for the page', () => {
	it('reads an outside hop: entries, pages, hop and stop', () => {
		const view = readGuidedSearchResult(EXPLORE_KNOWLEDGE_TOOL_NAME, {
			knowledge_explore: {
				goal: 'g',
				hop: 3,
				checks: [{ key: 'near', question: 'Near?' }],
				queries: ['Tenable leadership team'],
				pages: [{ url: 'https://www.tenable.com/about', title: 'About' }, { title: 'x' }],
				entities: [
					{
						id: PERSON,
						kind: 'person',
						name: 'Pat Example',
						origin: 'web',
						hop: 3,
						is_new: true,
						fit: { near: 'yes', bogus: 'maybe' },
						from_entity_id: TENABLE,
						title: 'Co-CEO',
						sources: ['https://www.tenable.com/about']
					},
					{ id: 'nope', kind: 'person', name: 'Bad id' },
					{ id: TENABLE, kind: 'spaceship', name: 'Bad kind' }
				],
				stopped: { reason: 'hop_limit', message: 'Stopped at hop 3.' }
			}
		});
		expect(view?.tool).toBe(EXPLORE_KNOWLEDGE_TOOL_NAME);
		expect(view?.hop).toBe(3);
		expect(view?.entities).toHaveLength(1);
		expect(view?.entities[0]).toMatchObject({
			id: PERSON,
			origin: 'web',
			is_new: true,
			fit: { near: 'yes' },
			from_entity_id: TENABLE,
			title: 'Co-CEO'
		});
		expect(view?.pages).toEqual([{ url: 'https://www.tenable.com/about', title: 'About' }]);
		expect(view?.stopped).toBe('Stopped at hop 3.');
	});

	it('reads an inside search and ignores any other result', () => {
		const view = readGuidedSearchResult(FIND_IN_KNOWLEDGE_TOOL_NAME, {
			knowledge_find: {
				goal: 'g',
				hop: 0,
				need: ['phone'],
				entities: [
					{ id: PERSON, kind: 'person', name: 'Tom', known: true, missing: ['phone'] }
				]
			}
		});
		expect(view?.entities[0]).toMatchObject({ origin: 'graph', hop: 0, known: true });
		expect(view?.need).toEqual(['phone']);
		expect(readGuidedSearchResult('search_knowledge', { results: [] })).toBeNull();
		expect(
			readGuidedSearchResult(FIND_IN_KNOWLEDGE_TOOL_NAME, {
				knowledge_find: { entities: [] }
			})
		).toBeNull();
	});
});

describe('the entry pool: companies, channels and places inside the graph', () => {
	const MURTECH = 'a0000000-0000-4000-8000-000000000001';
	const CHANNEL = 'a0000000-0000-4000-8000-000000000002';
	const BALTIMORE = 'a0000000-0000-4000-8000-000000000003';
	const TOM = 'a0000000-0000-4000-8000-000000000004';
	const SELF = 'a0000000-0000-4000-8000-000000000005';
	const FINTECH = 'a0000000-0000-4000-8000-000000000006';

	/** A chainable fake: each table answers once per query, and every filter is recorded. */
	function fakeClient(tables: Record<string, (filters: Array<[string, unknown]>) => unknown[]>) {
		const queries: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
		return {
			queries,
			rpc: () => null,
			from(table: string) {
				const filters: Array<[string, unknown]> = [];
				queries.push({ table, filters });
				const query: any = {
					select: () => query,
					in: (column: string, value: unknown) => (filters.push([column, value]), query),
					eq: (column: string, value: unknown) => (filters.push([column, value]), query),
					or: (value: string) => (filters.push(['or', value]), query),
					limit: () => query,
					then: (resolve: (value: unknown) => unknown) =>
						Promise.resolve({ data: tables[table]?.(filters) ?? [], error: null }).then(
							resolve
						)
				};
				return query;
			}
		};
	}

	const facts = (filters: Array<[string, unknown]>) =>
		filters.some(([column]) => column === 'entity_id')
			? [
					{
						entity_id: MURTECH,
						predicate: 'industry',
						object_entity_id: null,
						value_text: 'Fintech',
						qualifiers: null
					},
					{
						entity_id: MURTECH,
						predicate: 'located_in',
						object_entity_id: BALTIMORE,
						value_text: null,
						qualifiers: null
					},
					{
						entity_id: MURTECH,
						predicate: 'homepage',
						object_entity_id: null,
						value_text: 'https://murtech.example',
						qualifiers: null
					},
					{
						entity_id: MURTECH,
						predicate: 'phone',
						object_entity_id: null,
						value_text: '410-555-0199',
						qualifiers: null
					},
					{
						entity_id: MURTECH,
						predicate: 'profile_url',
						object_entity_id: null,
						value_text: 'https://linkedin.com/company/murtech',
						qualifiers: { platform: 'linkedin' }
					},
					{
						entity_id: CHANNEL,
						predicate: 'url',
						object_entity_id: null,
						value_text: 'https://youtube.com/@fw',
						qualifiers: null
					},
					{
						entity_id: CHANNEL,
						predicate: 'about',
						object_entity_id: FINTECH,
						value_text: null,
						qualifiers: null
					}
				]
			: [
					{
						entity_id: TOM,
						predicate: 'works_at',
						object_entity_id: MURTECH,
						qualifiers: { title: 'CEO', current: true }
					},
					{
						entity_id: SELF,
						predicate: 'owns',
						object_entity_id: CHANNEL,
						qualifiers: null
					},
					{
						entity_id: MURTECH,
						predicate: 'owns',
						object_entity_id: CHANNEL,
						qualifiers: null
					},
					{
						entity_id: MURTECH,
						predicate: 'located_in',
						object_entity_id: BALTIMORE,
						qualifiers: null
					}
				];
	const tables = {
		knowledge_facts: facts,
		knowledge_record_links: () => [
			{ entity_id: MURTECH, record_kind: 'task' },
			{ entity_id: MURTECH, record_kind: 'task' },
			{ entity_id: MURTECH, record_kind: 'project' }
		],
		knowledge_entities: () => [
			{ id: BALTIMORE, name: 'Baltimore, MD', kind: 'place', is_self: false },
			{ id: TOM, name: 'Tom Mann', kind: 'person', is_self: false },
			{ id: SELF, name: 'Me', kind: 'person', is_self: true },
			{ id: MURTECH, name: 'Murtech', kind: 'org', is_self: false },
			{ id: FINTECH, name: 'Fintech', kind: 'topic', is_self: false }
		]
	};

	it('reports what each kind records, and contact details only as on file or not', async () => {
		const client = fakeClient(tables);
		const read = await readKnowledgeEntryFacts(client, USER, [MURTECH, CHANNEL, BALTIMORE]);

		expect(read.get(MURTECH)).toMatchObject({
			industries: ['Fintech'],
			places: ['Baltimore, MD'],
			people: [{ id: TOM, name: 'Tom Mann', title: 'CEO', current: true }],
			people_total: 1,
			on_file: { phone: true, email: false, website: true, social: true, address: false },
			platforms: ['linkedin'],
			records: { tasks: 2, documents: 0, projects: 1 }
		});
		// A channel: who runs it, what it is about, and that the user owns it.
		expect(read.get(CHANNEL)).toMatchObject({
			owners: ['Murtech'],
			owned_by_user: true,
			topics: ['Fintech'],
			on_file: { website: true }
		});
		// A place: how much is recorded there.
		expect(read.get(BALTIMORE)!.located_here).toBe(1);
		// Presence only: no phone number, address or account address leaves the read.
		const serialized = JSON.stringify([...read.values()]);
		expect(serialized).not.toContain('410-555-0199');
		expect(serialized).not.toContain('murtech.example');
		expect(serialized).not.toContain('linkedin.com');
		// Every read is held to this user's own facts plus public ones.
		for (const query of client.queries) {
			expect(
				query.filters.some(
					([column, value]) =>
						(column === 'or' && String(value).includes(`owner_user_id.eq.${USER}`)) ||
						(column === 'owner_user_id' && value === USER)
				)
			).toBe(true);
		}
	});

	it('refuses a user id that is not an id, and reads nothing for no entries', async () => {
		const client = fakeClient(tables);
		await expect(
			readKnowledgeEntryFacts(client, 'x,scope.eq.private', [MURTECH])
		).rejects.toThrow(GuidedSearchError);
		expect((await readKnowledgeEntryFacts(client, USER, [])).size).toBe(0);
		expect(client.queries).toEqual([]);
	});

	it("lists the asked kinds from the user's world, places from everything, and never people", async () => {
		const listed: unknown[] = [];
		const lister = {
			async list(options: Record<string, unknown>) {
				listed.push(options);
				const kinds = options.kinds as string[];
				return {
					entities: kinds.includes('place')
						? [
								{
									id: BALTIMORE,
									kind: 'place',
									name: 'Baltimore, MD',
									summary: null,
									is_self: false
								}
							]
						: [
								{
									id: MURTECH,
									kind: 'org',
									name: 'Murtech',
									summary: 'Payments software',
									is_self: false
								},
								{
									id: SELF,
									kind: 'org',
									name: 'Mine',
									summary: null,
									is_self: true
								}
							],
					total: kinds.includes('place') ? 1 : 7,
					counts: {},
					known_count: 0
				} as never;
			}
		};
		const pool = await readKnowledgeEntryPool(fakeClient(tables), lister, USER, {
			kinds: ['person', 'org', 'place'],
			scope: 'world'
		});
		expect(listed).toEqual([
			{ kinds: ['org'], view: 'world', limit: 150 },
			{ kinds: ['place'], view: 'all', limit: 150 }
		]);
		expect(pool.total).toBe(8);
		expect(pool.entries.map((entry) => [entry.kind, entry.name])).toEqual([
			['org', 'Murtech'],
			['place', 'Baltimore, MD']
		]);
		expect(pool.entries[0]).toMatchObject({
			summary: 'Payments software',
			industries: ['Fintech']
		});
		// Only people asked for: nothing is listed here (they come from the connections pool).
		expect(
			await readKnowledgeEntryPool(fakeClient(tables), lister, USER, {
				kinds: ['person'],
				scope: 'world'
			})
		).toEqual({ entries: [], total: 0 });
	});
});
