// apps/worker/src/workers/agentic-chat/tools/knowledge-search.ts
//
// Guided search for Agentic Chat (2026-11-22): `find_in_knowledge` and `explore_knowledge`.
//
//   find_in_knowledge   Inside the user's graph. People are the main case: one structured read
//                       pulls the people in their world (optionally narrowed by exact
//                       filters). Any other kind (companies, channels, websites, places…) is
//                       pulled from the entry pool, which records different things per kind.
//                       A decision model then answers each check about each entry from that
//                       entry's structured card, and code reports which asked-for details are
//                       on file. Free apart from the decisions.
//
//   explore_knowledge   One hop outside. Web searches (each one cleared by the same review a
//                       web_search gets) → every usable result is opened with our own fetcher
//                       (free; a company's own site first) → ONE reading model gets all of it:
//                       the opened pages in full and the search engine's lines for the rest.
//                       It decides which pages matter, lists the entries they name with an
//                       exact quote each, and answers the checks for each → code keeps only
//                       what the quoted page says → entries are saved to the graph marked
//                       "found on the web" (outside Your world).
//
// Who decides what (DJ, 2026-11-22): the decision model (Jev) only ever judges structured
// cards from the user's own graph, many at a time, which is what it is for. It never touches
// web content: what a paid search returned is read by the reading model, start to finish.
//
// Hops are counted per chat on knowledge_runs (guided-search.ts): a search that starts from
// entries an earlier hop found is one hop further out, and a trail stops itself at three.
// The user steers every hop: the page shows the entries as chips, the user ticks some, and
// the next message arrives with their ids.
//
// The reading model reads public pages and answers in a fixed JSON shape; it never sees the
// user's private graph beyond the selected entry's public-facing facts.

import {
	EXPLORE_KNOWLEDGE_TOOL_NAME,
	EXPLORE_REFUSAL_MESSAGES,
	FIND_ENTRY_POOL_LIMIT,
	FIND_NEED_APPLIES,
	FIND_POOL_LIMIT,
	FIND_RESULT_LIMIT,
	GUIDED_SEARCH_HOP_LIMIT,
	GuidedSearchError,
	KNOWLEDGE_KIND_DEFINITIONS,
	KNOWLEDGE_UUID_PATTERN,
	KnowledgeStore,
	exploreRefusal,
	finishExploreRun,
	judgeGuidedChecks,
	knowledgeSelectionEntry,
	loadSearchTrail,
	nextHop,
	normalizeKnowledgeName,
	parseExploreArgs,
	parseFindArgs,
	rankByFit,
	readKnowledgeConnections,
	readKnowledgeEntryFacts,
	readKnowledgeEntryPool,
	reserveExploreRun,
	type ExploreRefusal,
	type FindNeedKey,
	type FindWhere,
	type GuidedCheck,
	type GuidedEntity,
	type GuidedEntry,
	type GuidedEntryFacts,
	type GuidedEntryPool,
	type GuidedFit,
	type IdentityDecider,
	type KnowledgeConnectionFilters,
	type KnowledgeConnectionPerson,
	type KnowledgeDataClient,
	type KnowledgeKind
} from '@buildos/shared-agent-ops/knowledge';
import { choosePages } from '../../knowledge/knowledgeEnrichPlan';
import type { JsonCaller, SearchPort } from '../../knowledge/knowledgeResearch';
import { readPaidToolCharge } from '../../agent-run/webResearchPort';
import { type TavilyUsageLogger, logTavilyCharge } from './tavily-usage';
import {
	EXPLORE_OPEN_PER_SEARCH,
	EXPLORE_PAGE_CHARS,
	EXPLORE_PREVIEW_CHARS,
	KNOWLEDGE_EXPLORE_OPERATION,
	KNOWLEDGE_EXPLORE_SYSTEM_PROMPT,
	buildExploreBatch,
	exploreUserPrompt,
	flagPossibleTwins,
	planExploreReading,
	siteOf,
	validateExploreAnswer,
	type ExploreFound,
	type ExploreLane,
	type ExplorePage,
	type ExploreResolution,
	type KnowledgeSearchStep
} from './knowledge-search-plan';

export const KNOWLEDGE_SEARCH_TOOL_NAMES = [
	'find_in_knowledge',
	EXPLORE_KNOWLEDGE_TOOL_NAME
] as const;

const PAGE_VISIT_TIMEOUT_MS = 6_000;
const EXTRACT_TIMEOUT_MS = 25_000;
/** The reading step never starts with less than this, and never runs past the hop's deadline. */
const EXTRACT_MIN_TIMEOUT_MS = 8_000;
const HOP_WORK_BUDGET_MS = 54_000;
/**
 * What may be said about a selected entry to the model that reads web pages: only the kinds
 * of detail that are public by nature. The user's own notes, description, aliases and how
 * they know someone stay in the graph.
 */
const ABOUT_PUBLIC_PREDICATES = new Set([
	'headline',
	'homepage',
	'located_in',
	'industry',
	'founded',
	'works_at'
]);
const MAX_LLM_COST_USD = 0.015;
const MIN_PREVIEW_CHARS = 60;

export interface KnowledgeSearchCallContext {
	userId: string;
	chatSessionId: string;
	turnRunId: string | null;
	signal?: AbortSignal;
	onStep?: (step: KnowledgeSearchStep) => void;
	/**
	 * The host's check that a web search may leave the worker (the same review web_search
	 * gets). Undefined → every query is allowed (tests).
	 */
	authorizeQuery?: (query: string) => Promise<boolean>;
	/**
	 * The entries the user ticked for this message (from the app, not the model). A hop that
	 * names no starting entry is counted from these, so leaving about_entity_id out cannot
	 * reset how far out a trail is.
	 */
	selectedEntityIds?: readonly string[];
	usageMetadata?: Record<string, unknown>;
}

export interface KnowledgeSearchPort {
	find(
		args: Record<string, unknown>,
		context: KnowledgeSearchCallContext
	): Promise<Record<string, unknown>>;
	explore(
		args: Record<string, unknown>,
		context: KnowledgeSearchCallContext
	): Promise<Record<string, unknown>>;
}

export interface KnowledgeSearchPortDeps {
	/** Service-role client; every read and write is scoped to the call's userId in code. */
	client: KnowledgeDataClient;
	/**
	 * The decision model (Jev): judges entries from the user's own graph against the checks.
	 * Null → those checks read "unknown". It plays no part in an outside search.
	 */
	decider: IdentityDecider | null;
	/** The model that reads everything a web search returned (structured JSON only). */
	llm: JsonCaller;
	/** Web search and page fetch. */
	makeSearchPort: () => SearchPort;
	/** Records each paid search under the user and turn (llm_usage_logs). */
	usage?: TavilyUsageLogger;
	/** The user's knowledge store. Injectable for tests; production builds it on `client`. */
	makeStore?: (userId: string) => KnowledgeSearchStore;
	/** The pool of entries that are not people. Injectable for tests. */
	readEntryPool?: (
		userId: string,
		options: { kinds: KnowledgeKind[]; scope: 'known' | 'world' | 'all'; limit: number }
	) => Promise<GuidedEntryPool>;
	/** What is on file for these entries (website, accounts…). Injectable for tests. */
	readEntryFacts?: (userId: string, ids: string[]) => Promise<Map<string, GuidedEntryFacts>>;
	now?: () => Date;
}

/** The parts of the knowledge store an outside hop uses. */
export type KnowledgeSearchStore = Pick<
	KnowledgeStore,
	'getEntity' | 'createEntry' | 'addMergeCandidate' | 'record' | 'list'
>;

export function createWorkerKnowledgeSearchPort(
	deps: KnowledgeSearchPortDeps
): KnowledgeSearchPort {
	return {
		find: (args, context) => runFind(deps, args, context),
		explore: (args, context) => runExplore(deps, args, context)
	};
}

function plural(count: number, one: string, many: string): string {
	return `${count} ${count === 1 ? one : many}`;
}

function fitCounts(entities: Array<{ fit?: Record<string, GuidedFit> }>) {
	let passAll = 0;
	let cantTell = 0;
	let ruledOut = 0;
	for (const entity of entities) {
		const values = Object.values(entity.fit ?? {});
		if (values.some((v) => v === 'no')) ruledOut++;
		else if (values.length && values.every((v) => v === 'yes')) passAll++;
		else cantTell++;
	}
	return { pass_all: passAll, cant_tell: cantTell, ruled_out: ruledOut };
}

// ---------------------------------------------------------------------------
// find_in_knowledge

function personLine(person: KnowledgeConnectionPerson): string | undefined {
	const job = person.jobs.find((j) => j.current) ?? person.jobs[0];
	const work = job ? [job.title, job.org].filter(Boolean).join(', ') : '';
	const line = [work, person.places[0]].filter(Boolean).join(' · ');
	return line || person.summary || undefined;
}

function personCard(person: KnowledgeConnectionPerson): Record<string, unknown> {
	return {
		name: person.name,
		kind: 'person',
		...(person.summary ? { about: person.summary } : {}),
		jobs: person.jobs.slice(0, 4).map((job) => ({
			company: job.org,
			...(job.title ? { title: job.title } : {}),
			current: job.current
		})),
		places: person.places.slice(0, 4),
		company_industries: person.industries.slice(0, 4),
		the_user_knows_them: person.known,
		named_in_the_users_work: {
			tasks: person.tasks,
			documents: person.documents,
			projects: person.projects
		}
	};
}

/** A person's details the connections pool reports. Website and accounts are read separately. */
const PERSON_ON_FILE: Partial<Record<FindNeedKey, (person: KnowledgeConnectionPerson) => boolean>> =
	{
		phone: (p) => Boolean(p.phone?.length),
		email: (p) => Boolean(p.email?.length),
		company: (p) => p.jobs.length > 0,
		title: (p) => p.jobs.some((job) => Boolean(job.title)),
		place: (p) => p.places.length > 0
	};

/** The same question for every other kind, from what the entry records. */
const ENTRY_ON_FILE: Partial<Record<FindNeedKey, (entry: GuidedEntryFacts) => boolean>> = {
	phone: (e) => e.on_file.phone,
	email: (e) => e.on_file.email,
	place: (e) => e.places.length > 0 || e.on_file.address,
	website: (e) => e.on_file.website,
	social: (e) => e.on_file.social,
	people: (e) => e.people_total > 0,
	industry: (e) => e.industries.length > 0
};

/** What a company, channel, website or place card says: different things matter per kind. */
function entryCard(entry: GuidedEntry): Record<string, unknown> {
	return {
		name: entry.name,
		kind: entry.kind,
		...(entry.summary ? { about: entry.summary } : {}),
		...(entry.industries.length ? { industry: entry.industries.slice(0, 4) } : {}),
		...(entry.places.length ? { located_in: entry.places.slice(0, 4) } : {}),
		...(entry.part_of.length ? { part_of: entry.part_of.slice(0, 3) } : {}),
		...(entry.topics.length ? { topics: entry.topics.slice(0, 4) } : {}),
		...(entry.owners.length ? { owned_or_run_by: entry.owners.slice(0, 3) } : {}),
		...(entry.owned_by_user ? { the_user_owns_it: true } : {}),
		...(entry.kind === 'org'
			? {
					people_the_user_has_on_file_there: entry.people.map((person) => ({
						name: person.name,
						...(person.title ? { title: person.title } : {}),
						current: person.current
					})),
					people_on_file_count: entry.people_total
				}
			: {}),
		...(entry.kind === 'place' ? { entries_recorded_there: entry.located_here } : {}),
		...(entry.platforms.length ? { accounts_on_file: entry.platforms } : {}),
		website_on_file: entry.on_file.website,
		named_in_the_users_work: entry.records
	};
}

function entryLine(entry: GuidedEntry): string | undefined {
	if (entry.kind === 'org') {
		const line = [entry.industries[0], entry.places[0]].filter(Boolean).join(' · ');
		if (line) return line;
	}
	return entry.summary || entry.places[0] || entry.owners[0] || undefined;
}

/**
 * Exact-word narrowing for entries that are not people, against structured fields only (a
 * name, a place name, an industry value): never against prose. A filter narrows only the
 * kinds it can describe: `company` is a company's name (or who owns a channel or website),
 * `place` is where something is, `industry` is a company's. Title and employment are about
 * people and leave other kinds alone.
 */
function entryMatchesWhere(entry: GuidedEntry, where: FindWhere): boolean {
	const any = (values: readonly string[], words: readonly string[]) =>
		words.some((word) =>
			values.some((value) => value.toLowerCase().includes(word.toLowerCase()))
		);
	if (where.company) {
		if (entry.kind === 'org') {
			if (!any([entry.name, ...entry.part_of], where.company)) return false;
		} else if (['website', 'channel', 'video', 'product'].includes(entry.kind)) {
			if (!any(entry.owners, where.company)) return false;
		}
	}
	if (where.place) {
		if (entry.kind === 'place') {
			if (!any([entry.name, ...entry.places], where.place)) return false;
		} else if (['org', 'event', 'website'].includes(entry.kind)) {
			if (!any(entry.places, where.place)) return false;
		}
	}
	if (where.industry && entry.kind === 'org' && !any(entry.industries, where.industry))
		return false;
	return true;
}

function kindWords(kinds: readonly KnowledgeKind[]): string {
	const words = kinds.map((kind) => KNOWLEDGE_KIND_DEFINITIONS[kind].pluralLabel.toLowerCase());
	return words.length > 1
		? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
		: (words[0] ?? 'entries');
}

interface FindRow {
	entity: GuidedEntity;
	card: Record<string, unknown>;
	/** Tasks, documents and projects that name it: most-present first. */
	records: number;
	onFile: (key: FindNeedKey) => boolean;
}

async function runFind(
	deps: KnowledgeSearchPortDeps,
	rawArgs: Record<string, unknown>,
	context: KnowledgeSearchCallContext
): Promise<Record<string, unknown>> {
	const args = parseFindArgs(rawArgs);
	const scope = args.where.scope ?? 'world';
	const wantsPeople = args.kinds.includes('person');
	const otherKinds = args.kinds.filter((kind) => kind !== 'person');
	const narrowed = Object.keys(args.where).filter((key) => key !== 'scope');
	const rows: FindRow[] = [];
	const notes: string[] = [];
	const byKind: Partial<Record<KnowledgeKind, number>> = {};
	let total = 0;

	// People: the connections pool (jobs, places, how the user knows them).
	let twins = new Map<string, { id: string; name: string }>();
	if (wantsPeople) {
		const filters: KnowledgeConnectionFilters = {
			scope,
			...(args.where.company ? { company: args.where.company } : {}),
			...(args.where.place ? { place: args.where.place } : {}),
			...(args.where.title ? { title: args.where.title } : {}),
			...(args.where.industry ? { industry: args.where.industry } : {}),
			...(args.where.employment ? { employment: args.where.employment } : {})
		};
		const read = await readKnowledgeConnections(deps.client, context.userId, filters, {
			limit: FIND_POOL_LIMIT,
			// Presence only: the values never leave this function.
			contacts: true
		});
		const people = read.people;
		total += read.total;
		byKind.person = people.length;
		context.onStep?.({
			kind: 'lookup',
			verb: 'Pulled',
			target: narrowed.length
				? `people matching ${narrowed.join(', ')}`
				: 'people in your world',
			outcome: `${read.total}`
		});
		// A person's website and accounts are not in the connections pool: read them only
		// when asked for.
		const extraKeys = args.need.filter((key) => key === 'website' || key === 'social');
		const extra = extraKeys.length
			? await (deps.readEntryFacts
					? deps.readEntryFacts(
							context.userId,
							people.map((p) => p.id)
						)
					: readKnowledgeEntryFacts(
							deps.client,
							context.userId,
							people.map((p) => p.id)
						))
			: new Map<string, GuidedEntryFacts>();
		twins = flagPossibleTwins(
			people.map((person) => ({
				id: person.id,
				name: person.name,
				orgIds: person.jobs.map((job) => job.org_id)
			}))
		);
		for (const person of people) {
			const summary = personLine(person);
			const twin = twins.get(person.id);
			rows.push({
				entity: {
					id: person.id,
					kind: 'person',
					name: person.name,
					...(summary ? { summary } : {}),
					origin: 'graph',
					hop: 0,
					...(person.known ? { known: true } : {}),
					...(twin ? { maybe_same_as: twin } : {})
				},
				card: personCard(person),
				records: person.tasks + person.documents + person.projects,
				onFile: (key) =>
					key === 'website' || key === 'social'
						? Boolean(extra.get(person.id)?.on_file[key])
						: Boolean(PERSON_ON_FILE[key]?.(person))
			});
		}
		if (read.total > people.length)
			notes.push(
				`Only the first ${people.length} of ${read.total} people were looked at. Narrow with where (a company, a title word or a place) to cover the rest.`
			);
		const coverage = read.coverage;
		if (coverage.people > 0 && coverage.with_place < coverage.people)
			notes.push(
				`A location (their own or their employer's) is recorded for ${coverage.with_place} of ${coverage.people} people.`
			);
		if (coverage.companies > 0 && coverage.companies_with_industry < coverage.companies)
			notes.push(
				`An industry is recorded for ${coverage.companies_with_industry} of ${coverage.companies} of their employers.`
			);
	}

	// Every other kind: the entry pool, narrowed by the exact words that describe that kind.
	if (otherKinds.length) {
		const options = { kinds: otherKinds, scope, limit: FIND_ENTRY_POOL_LIMIT };
		const pool = deps.readEntryPool
			? await deps.readEntryPool(context.userId, options)
			: await readKnowledgeEntryPool(
					deps.client,
					deps.makeStore?.(context.userId) ??
						new KnowledgeStore(deps.client, context.userId),
					context.userId,
					options
				);
		const matching = pool.entries.filter((entry) => entryMatchesWhere(entry, args.where));
		total += pool.total;
		for (const entry of matching) byKind[entry.kind] = (byKind[entry.kind] ?? 0) + 1;
		context.onStep?.({
			kind: 'lookup',
			verb: 'Pulled',
			target: `${kindWords(otherKinds)} ${scope === 'all' ? 'in your graph' : 'in your world'}`,
			outcome:
				matching.length === pool.entries.length
					? `${pool.total}`
					: `${matching.length} of ${pool.entries.length} match`
		});
		for (const entry of matching) {
			const summary = entryLine(entry);
			rows.push({
				entity: {
					id: entry.id,
					kind: entry.kind,
					name: entry.name,
					...(summary ? { summary } : {}),
					origin: 'graph',
					hop: 0
				},
				card: entryCard(entry),
				records: entry.records.tasks + entry.records.documents + entry.records.projects,
				onFile: (key) => Boolean(ENTRY_ON_FILE[key]?.(entry))
			});
		}
		if (pool.total > pool.entries.length)
			notes.push(
				`Only the newest ${pool.entries.length} of ${pool.total} ${kindWords(otherKinds)} were looked at.`
			);
		const peopleOnly = (['title', 'employment'] as const).filter((key) => args.where[key]);
		if (peopleOnly.length)
			notes.push(
				`where.${peopleOnly.join(' and where.')} narrow${peopleOnly.length === 1 ? 's' : ''} people only; ${kindWords(otherKinds)} were not narrowed by ${peopleOnly.length === 1 ? 'it' : 'them'}.`
			);
	}

	// The decision model's job: many structured cards from the user's own graph, one answer
	// per check per card.
	const judged = await judgeGuidedChecks(
		deps.decider,
		rows.map((row) => ({ id: row.entity.id, card: row.card })),
		args.checks,
		{
			goal: args.goal,
			userId: context.userId,
			...(context.signal ? { signal: context.signal } : {}),
			metadata: { ...(context.usageMetadata ?? {}), tool: 'find_in_knowledge' }
		}
	);
	for (const row of rows) {
		if (args.checks.length) row.entity.fit = judged.fits.get(row.entity.id);
		// A detail that cannot exist for this kind is neither on file nor missing.
		const applicable = args.need.filter((key) =>
			FIND_NEED_APPLIES[key].includes(row.entity.kind)
		);
		if (applicable.length) {
			row.entity.have = applicable.filter((key) => row.onFile(key));
			row.entity.missing = applicable.filter((key) => !row.onFile(key));
		}
	}
	const counts = fitCounts(rows.map((row) => row.entity));
	if (args.checks.length) {
		context.onStep?.({
			kind: 'decide',
			verb: 'Judged',
			target: `each of ${rows.length} against: ${args.checks.map((c) => c.key).join(', ')}`,
			outcome: `${counts.pass_all} pass, ${counts.cant_tell} can't tell`
		});
	}
	// Ruled-out entries are counted, not listed. Most-present in the user's work first.
	const entities: GuidedEntity[] = rankByFit(
		rows
			.filter((row) => !Object.values(row.entity.fit ?? {}).some((v) => v === 'no'))
			.sort((a, b) => b.records - a.records)
			.map((row) => row.entity)
	).slice(0, FIND_RESULT_LIMIT);
	const withNeed = entities.filter((entity) => entity.have || entity.missing);
	const complete = withNeed.filter((entity) => !entity.missing?.length).length;
	if (args.need.length) {
		context.onStep?.({
			kind: 'lookup',
			verb: 'Checked',
			target: `${args.need.join(' and ')} on each`,
			outcome: `${complete} of ${withNeed.length} have ${args.need.length === 1 ? 'it' : 'them'}`
		});
	}

	if (judged.failed)
		notes.push(
			`${plural(judged.failed, 'entry', 'entries')} could not be judged just now and read as "can't tell".`
		);
	const possibleTwins = entities.filter((entity) => entity.maybe_same_as);
	if (possibleTwins.length)
		notes.push(
			`Possibly the same person, ask the user: ${possibleTwins
				.map((entity) => `"${entity.name}" and ${entity.maybe_same_as!.name}`)
				.join('; ')}.`
		);

	const one = otherKinds.length ? 'entry' : 'person';
	const many = otherKinds.length ? 'entries' : 'people';
	const what = otherKinds.length ? `(${kindWords(args.kinds)}) ` : '';
	const parts: string[] = [];
	if (args.checks.length)
		parts.push(
			`Looked at ${plural(rows.length, one, many)} ${what}in the user's graph: ${counts.pass_all} pass every check, ${counts.cant_tell} could fit but the entry does not say, ${counts.ruled_out} ruled out.`
		);
	else parts.push(`${plural(entities.length, one, many)} ${what}in the user's graph match.`);
	if (args.need.length)
		parts.push(
			`${complete} of ${withNeed.length} have ${args.need.join(' and ')} on file; values are not in this result (get_knowledge_entity returns them).`
		);
	parts.push(
		`The user sees these ${many} as selectable chips under your reply, each marked with the checks, so do not list them all. Say what the graph holds and what it is missing. If that does not answer the question, offer two or three ways to look outside BuildOS and ask which one; start explore_knowledge only when the user asked for an outside search or picks one.`
	);

	return {
		knowledge_find: {
			goal: args.goal,
			hop: 0,
			kinds: args.kinds,
			checks: args.checks,
			need: args.need,
			pool: { total, looked_at: rows.length, by_kind: byKind },
			counts,
			entities,
			...(notes.length ? { notes } : {})
		},
		message: parts.join(' ')
	};
}

// ---------------------------------------------------------------------------
// explore_knowledge

interface SearchResult {
	url: string;
	title: string;
	content: string | null;
	preview: string | null;
	lane: number;
}

function stopped(
	reason: ExploreRefusal | 'not_allowed' | 'nothing_found',
	message: string,
	hop: number,
	args: { goal: string; checks: GuidedCheck[] }
): Record<string, unknown> {
	return {
		knowledge_explore: {
			goal: args.goal,
			hop,
			hop_limit: GUIDED_SEARCH_HOP_LIMIT,
			checks: args.checks,
			entities: [],
			stopped: { reason, message }
		},
		message
	};
}

async function visitPage(
	port: SearchPort,
	url: string,
	parent: AbortSignal | undefined
): Promise<{ content: string | null; title: string | null }> {
	if (!port.visit) return { content: null, title: null };
	const controller = new AbortController();
	const onAbort = () => controller.abort();
	parent?.addEventListener('abort', onAbort, { once: true });
	const timer = setTimeout(() => controller.abort(), PAGE_VISIT_TIMEOUT_MS);
	try {
		const page = (await port.visit(
			{ url, max_chars: EXPLORE_PAGE_CHARS },
			controller.signal
		)) as { content?: string; title?: string };
		return { content: page.content?.trim() || null, title: page.title ?? null };
	} catch {
		return { content: null, title: null };
	} finally {
		clearTimeout(timer);
		parent?.removeEventListener('abort', onAbort);
	}
}

/** The companies each of these people is recorded at (the user's own facts only). */
async function loadEmployers(
	client: KnowledgeDataClient,
	userId: string,
	personIds: string[]
): Promise<Map<string, Array<{ id: string; name: string }>>> {
	const out = new Map<string, Array<{ id: string; name: string }>>();
	if (!personIds.length) return out;
	const { data: facts } = await client
		.from('knowledge_facts')
		.select('entity_id, object_entity_id')
		.in('entity_id', personIds)
		.eq('predicate', 'works_at')
		.eq('owner_user_id', userId)
		.eq('status', 'active');
	const rows = (
		(facts ?? []) as Array<{ entity_id: string; object_entity_id: string | null }>
	).filter((row): row is { entity_id: string; object_entity_id: string } =>
		Boolean(row.object_entity_id)
	);
	if (!rows.length) return out;
	const { data: orgs } = await client
		.from('knowledge_entities')
		.select('id, name')
		.in('id', [...new Set(rows.map((row) => row.object_entity_id))]);
	const names = new Map(
		((orgs ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name])
	);
	for (const row of rows) {
		const name = names.get(row.object_entity_id);
		if (!name) continue;
		out.set(row.entity_id, [
			...(out.get(row.entity_id) ?? []),
			{ id: row.object_entity_id, name }
		]);
	}
	return out;
}

async function runExplore(
	deps: KnowledgeSearchPortDeps,
	rawArgs: Record<string, unknown>,
	context: KnowledgeSearchCallContext
): Promise<Record<string, unknown>> {
	const args = parseExploreArgs(rawArgs);
	const now = deps.now ?? (() => new Date());
	const startedAt = Date.now();
	const store: KnowledgeSearchStore =
		deps.makeStore?.(context.userId) ?? new KnowledgeStore(deps.client, context.userId);
	const fromIds = [
		...new Set(
			args.searches.map((s) => s.about_entity_id).filter((id): id is string => Boolean(id))
		)
	];

	// 1. How far out is this, and may it start? Decided before anything is spent.
	const trail = await loadSearchTrail(deps.client, context.userId, context.chatSessionId);
	// A hop that names no starting entry is counted from what the user ticked.
	const hop = nextHop(trail, fromIds.length ? fromIds : (context.selectedEntityIds ?? []));
	const refusal = exploreRefusal({
		trail,
		hop,
		turnRunId: context.turnRunId,
		beyondLimit: args.beyondLimit
	});
	if (refusal) {
		context.onStep?.({
			kind: 'stop',
			verb: 'Stopped',
			target:
				refusal === 'hop_limit'
					? `${GUIDED_SEARCH_HOP_LIMIT} hops is the limit for one trail`
					: 'this message has used its outside searches'
		});
		return stopped(refusal, EXPLORE_REFUSAL_MESSAGES[refusal], hop, args);
	}

	// 2. The entries this hop starts from (the user's own, or found by an earlier hop).
	const aboutById = new Map<string, NonNullable<ExploreLane['about']>>();
	await Promise.all(
		fromIds.map(async (id) => {
			const detail = await store.getEntity(id);
			if (!detail || detail.entity.is_self) return;
			const entry = knowledgeSelectionEntry(detail);
			aboutById.set(id, {
				// The entry as it is now: an id that was merged away resolves to the kept one.
				id: detail.entity.id,
				kind: entry.kind,
				name: entry.name,
				// A summary the web wrote may go back to the web reader; one from the user's
				// own world may be their private note about someone, so it stays here.
				summary: entry.found_on_web ? entry.summary : null,
				facts: detail.facts
					.filter(
						(fact) =>
							fact.status === 'active' && ABOUT_PUBLIC_PREDICATES.has(fact.predicate)
					)
					.slice(0, 6)
					.map((fact) =>
						`${fact.label}: ${fact.entity ? fact.entity.name : (fact.value ?? '')}`.slice(
							0,
							200
						)
					),
				foundOnWeb: entry.found_on_web,
				// Its own website is public and decides which results are opened first.
				homepage:
					detail.facts.find(
						(fact) => fact.status === 'active' && fact.predicate === 'homepage'
					)?.value ?? null
			});
		})
	);
	const missingFrom = fromIds.filter((id) => !aboutById.has(id));
	if (missingFrom.length)
		throw new GuidedSearchError(
			`about_entity_id not found in the user's knowledge graph: ${missingFrom.join(', ')}. Use an id from the selected entries or an earlier search result.`
		);

	// 3. Each query is cleared before it leaves, like any web search in chat.
	const allowed = await Promise.all(
		args.searches.map((search) =>
			context.authorizeQuery ? context.authorizeQuery(search.query) : Promise.resolve(true)
		)
	);
	const searches = args.searches.filter((_, index) => allowed[index]);
	if (!searches.length) {
		context.onStep?.({ kind: 'stop', verb: 'Stopped', target: 'no search was allowed out' });
		return stopped(
			'not_allowed',
			'None of these searches was allowed to leave BuildOS (a search must serve what the user asked for). Nothing was searched. Say so, and ask the user what to search for.',
			hop,
			args
		);
	}
	const lanes: ExploreLane[] = searches.map((search) => ({
		query: search.query,
		...(search.about_entity_id ? { about: aboutById.get(search.about_entity_id)! } : {})
	}));

	// 4. Reserve it under the user's research caps.
	const reserved = await reserveExploreRun(
		deps.client,
		context.userId,
		{
			chatSessionId: context.chatSessionId,
			turnRunId: context.turnRunId,
			hop,
			goal: args.goal,
			fromEntityIds: fromIds,
			queries: searches.map((s) => s.query)
		},
		now
	);
	if ('refused' in reserved) {
		context.onStep?.({ kind: 'stop', verb: 'Stopped', target: 'research allowance' });
		return stopped(reserved.refused, EXPLORE_REFUSAL_MESSAGES[reserved.refused], hop, args);
	}
	const runId = reserved.runId;
	let costUsd = 0;
	const pagesRead: Array<{ url: string; title: string | null }> = [];
	const entities: GuidedEntity[] = [];
	let factsSaved = 0;
	let status: 'completed' | 'partial' | 'failed' = 'failed';
	let failure: string | null = null;

	try {
		const port = deps.makeSearchPort();
		// 5. Search.
		const results: SearchResult[] = [];
		let searchFailures = 0;
		await Promise.all(
			searches.map(async (search, lane) => {
				if (!port.search) return;
				const searchStartedAt = Date.now();
				type SearchResponse = {
					results?: Array<{
						url: string;
						title: string;
						snippet?: string;
						page_content?: string;
					}>;
				};
				let response: SearchResponse;
				try {
					response = (await port.search(
						{ query: search.query, max_results: 6, search_depth: 'basic' },
						context.signal
					)) as SearchResponse;
				} catch (error) {
					// One search failing must not throw away the others, which are paid for.
					if (context.signal?.aborted) throw error;
					searchFailures++;
					context.onStep?.({
						kind: 'search',
						verb: 'Searched',
						target: search.query,
						outcome: 'failed'
					});
					return;
				}
				const charge = readPaidToolCharge(response);
				costUsd += charge?.cost_usd ?? 0;
				if (charge) {
					void logTavilyCharge(
						deps.usage,
						{
							model:
								charge.provider === 'serper'
									? 'serper/search'
									: `tavily/search-${charge.credits === 1 ? 'basic' : 'advanced'}`,
							provider: charge.provider,
							credits: charge.credits,
							costUsd: charge.cost_usd,
							providerRequestId: charge.provider_request_id ?? null,
							source: charge.source
						},
						{
							operationType: 'knowledge_explore_search',
							userId: context.userId,
							chatSessionId: context.chatSessionId,
							turnRunId: context.turnRunId ?? undefined,
							startedAt: searchStartedAt,
							metadata: { ...(context.usageMetadata ?? {}) }
						}
					);
				}
				const found = response.results ?? [];
				for (const r of found) {
					results.push({
						url: r.url,
						title: r.title,
						content: r.page_content?.trim() || null,
						preview: r.snippet?.trim() ? `${r.title}\n${r.snippet.trim()}` : null,
						lane
					});
				}
				context.onStep?.({
					kind: 'search',
					verb: 'Searched',
					target: search.query,
					outcome: plural(found.length, 'result', 'results')
				});
			})
		);

		if (searchFailures === searches.length) throw new Error('Web search failed');

		// 6. Open every usable result. The searches are what cost money; opening a page is
		// free (our own fetcher). So nothing is filtered by a guess at what a result holds:
		// each search's results are opened in rank order (a company's own site first,
		// people-finder sites never), and the reading model decides what matters.
		const usable: SearchResult[] = [];
		const seenUrls = new Set<string>();
		lanes.forEach((lane, index) => {
			const ranked = choosePages(
				results.filter((r) => r.lane === index),
				lane.about?.homepage ?? null,
				12
			);
			for (const result of ranked) {
				if (seenUrls.has(result.url)) continue;
				seenUrls.add(result.url);
				usable.push(result);
			}
		});
		// Addresses the reader may cite: people-finder sites are not among them.
		const resultUrls = usable.map((r) => r.url);
		const rankOf = new Map(usable.map((r, index) => [r.url, index]));
		const toOpen = lanes.flatMap((_, lane) =>
			usable.filter((r) => r.lane === lane).slice(0, EXPLORE_OPEN_PER_SEARCH)
		);
		const opened = new Map<string, string>();
		const openedTitle = new Map<string, string>();
		await Promise.all(
			toOpen.map(async (result) => {
				let content = result.content;
				if (!content) {
					const visited = await visitPage(port, result.url, context.signal);
					content = visited.content;
					if (visited.title) openedTitle.set(result.url, visited.title);
				}
				if (content) opened.set(result.url, content);
			})
		);

		// 7. What the reading model gets: opened pages in full, dealt out evenly between the
		// searches, and the search engine's lines for every other result.
		const previewOf = (result: SearchResult) =>
			result.preview && result.preview.length >= MIN_PREVIEW_CHARS ? result.preview : null;
		const reading = planExploreReading(usable, opened, previewOf, lanes.length);
		const pages: ExplorePage[] = [
			...reading.full.map((result) => ({
				url: result.url,
				title: openedTitle.get(result.url) ?? (result.title || null),
				content: opened.get(result.url)!.slice(0, EXPLORE_PAGE_CHARS),
				search: result.lane + 1
			})),
			...reading.previews.map((result) => ({
				url: result.url,
				title: result.title || null,
				content: previewOf(result)!.slice(0, EXPLORE_PREVIEW_CHARS),
				search: result.lane + 1,
				preview: true
			}))
		];
		// Stable order for the prompt, the page indexes and the trace: full pages first, then
		// each search's results in the order they ranked (a company's own site leads).
		pages.sort(
			(a, b) =>
				Number(Boolean(a.preview)) - Number(Boolean(b.preview)) ||
				a.search - b.search ||
				(rankOf.get(a.url) ?? 0) - (rankOf.get(b.url) ?? 0)
		);
		const fullPages = pages.filter((page) => !page.preview);
		pagesRead.push(...fullPages.map((page) => ({ url: page.url, title: page.title })));
		if (pages.length) {
			const previewCount = pages.length - fullPages.length;
			context.onStep?.({
				kind: 'read',
				verb: 'Read',
				target:
					[...new Set(fullPages.map((page) => siteOf(page.url)))].join(', ') ||
					'search previews',
				outcome: `${plural(fullPages.length, 'page', 'pages')}${previewCount ? `, ${plural(previewCount, 'preview', 'previews')}` : ''}`
			});
		}
		if (!pages.length) {
			status = 'completed';
			context.onStep?.({ kind: 'stop', verb: 'Stopped', target: 'no page could be read' });
			return stopped(
				'nothing_found',
				'The searches returned nothing that could be read. Nothing was saved. Tell the user, and suggest a different search.',
				hop,
				args
			);
		}

		// 8. One reading model reads all of it: which pages matter, the entries they name
		// (each with an exact quote), and the answer to each check for each entry.
		const raw = await deps.llm.getJSONResponse<unknown>({
			systemPrompt: KNOWLEDGE_EXPLORE_SYSTEM_PROMPT,
			userPrompt: exploreUserPrompt({
				goal: args.goal,
				kinds: args.kinds,
				lanes,
				pages,
				resultUrls,
				checks: args.checks
			}),
			userId: context.userId,
			profile: 'balanced',
			temperature: 0.1,
			reasoning: { enabled: false },
			maxTokens: 3_000,
			// What is left of the hop's time, so reading never runs past the tool deadline.
			timeoutMs: Math.max(
				EXTRACT_MIN_TIMEOUT_MS,
				Math.min(EXTRACT_TIMEOUT_MS, HOP_WORK_BUDGET_MS - (Date.now() - startedAt))
			),
			operationType: KNOWLEDGE_EXPLORE_OPERATION,
			chatSessionId: context.chatSessionId,
			...(context.turnRunId ? { turnRunId: context.turnRunId } : {}),
			...(context.signal ? { signal: context.signal } : {}),
			spendLimit: {
				maxCostUsd: Math.max(
					0.001,
					Math.min(MAX_LLM_COST_USD, reserved.budgetUsd - costUsd)
				)
			},
			onUsage: (usage: { totalCost?: number | null }) => {
				costUsd += usage.totalCost ?? 0;
			}
		} as Parameters<JsonCaller['getJSONResponse']>[0]);
		const valid = validateExploreAnswer(raw, {
			kinds: args.kinds,
			lanes,
			pages,
			resultUrls,
			checks: args.checks
		});
		// A result that was only previewed counts as read when an entry came from it.
		const cited = new Set([
			...valid.found.map((f) => f.page),
			...valid.about.map((f) => f.page)
		]);
		pages.forEach((page, index) => {
			if (page.preview && cited.has(index))
				pagesRead.push({ url: page.url, title: page.title });
		});
		context.onStep?.({
			kind: 'extract',
			verb: 'Pulled out',
			target: 'the entries those pages name',
			outcome: `${valid.found.length} kept${valid.dropped.length ? `, ${valid.dropped.length} dropped` : ''}`
		});

		// The turn was stopped or timed out while reading: save nothing. Past this point the
		// user would get entries in their graph with no chips to see or discard them.
		if (context.signal?.aborted) throw new Error('Search stopped before saving');

		// 9. Who is each find? Decided before anything is written, so a fact read off the web
		// never lands on an entry of the user's own just because a name matched.
		const sameNameAs = new Map<string, { id: string; name: string }>();
		const resolution = new Map<string, ExploreResolution>();
		const madeHere = new Set<string>();

		// People are never matched on a name alone. A research entry with the same name is
		// reused only with evidence it is the same person (this chat's own trail found it, or
		// it is recorded at the same company). Anyone else gets their own entry, and when the
		// name is already in the graph the user is asked whether they are the same.
		const people = valid.found.filter((found) => found.kind === 'person');
		if (people.length) {
			type PersonRow = {
				id: string;
				name: string;
				normalized_name: string | null;
				circle: string | null;
			};
			const { data } = await deps.client
				.from('knowledge_entities')
				.select('id, name, normalized_name, circle')
				.eq('owner_user_id', context.userId)
				.eq('kind', 'person')
				.eq('status', 'active')
				.is('merged_into_id', null)
				// The store's own name rule, so this sees exactly the rows a write would match.
				.in('normalized_name', [
					...new Set(people.map((p) => normalizeKnowledgeName(p.name)))
				]);
			const byName = new Map<string, PersonRow[]>();
			for (const row of (data ?? []) as PersonRow[]) {
				const key = row.normalized_name ?? normalizeKnowledgeName(row.name);
				byName.set(key, [...(byName.get(key) ?? []), row]);
			}
			const researchIds = [...byName.values()]
				.flat()
				.filter((row) => row.circle === 'public')
				.map((row) => row.id);
			const employers = await loadEmployers(deps.client, context.userId, researchIds);
			await Promise.all(
				people.map(async (found: ExploreFound) => {
					const same = byName.get(normalizeKnowledgeName(found.name)) ?? [];
					const about = lanes[found.lane]?.about;
					const employer = found.employer ? normalizeKnowledgeName(found.employer) : null;
					const reuse = same.find(
						(row) =>
							row.circle === 'public' &&
							(trail.depth.has(row.id) ||
								(employers.get(row.id) ?? []).some(
									(org) =>
										(about?.kind === 'org' && org.id === about.id) ||
										(employer !== null &&
											normalizeKnowledgeName(org.name) === employer)
								))
					);
					if (reuse) {
						resolution.set(found.key, { mode: 'existing', id: reuse.id });
						return;
					}
					const id = await store.createEntry({
						kind: 'person',
						name: found.name,
						via: 'enrichment',
						summary: found.summary || null,
						circle: 'public'
					});
					madeHere.add(id);
					resolution.set(found.key, { mode: 'existing', id });
					// Someone from the user's own world first; else an earlier web find.
					const other = same.find((row) => row.circle !== 'public') ?? same[0];
					if (!other) return;
					sameNameAs.set(found.key, { id: other.id, name: other.name });
					const who =
						other.circle === 'public'
							? `the ${other.name} an earlier search found`
							: `${other.name} in your world`;
					await store
						.addMergeCandidate(other.id, id, {
							reason: 'A web search found someone with the same name.',
							question: `A web search found ${found.name}${found.summary ? ` (${found.summary})` : ''}. Is that the same person as ${who}?`,
							origin: 'identity'
						})
						.catch(() => undefined);
				})
			);
		}

		// Companies, places, accounts: one entry per name is right, so these do match an
		// existing entry (the store's own matching, asked without saving). When that entry is
		// part of the user's own world, what the web says about it is saved as a suggestion.
		const things = valid.found.filter((found) => found.kind !== 'person');
		if (things.length) {
			const probe = await store.record(
				{
					entities: things.map((found, index) => ({
						ref: `q${index + 1}`,
						kind: found.kind,
						name: found.name
					})),
					facts: [],
					sources: []
				},
				{ via: 'enrichment', dryRun: true }
			);
			const matched = new Map<string, string>();
			for (const entity of probe.entities) {
				if (entity.matched !== 'created' && KNOWLEDGE_UUID_PATTERN.test(entity.id))
					matched.set(entity.ref, entity.id);
			}
			if (matched.size) {
				const { data } = await deps.client
					.from('knowledge_entities')
					.select('id, circle')
					.eq('owner_user_id', context.userId)
					.in('id', [...new Set(matched.values())]);
				const circles = new Map(
					((data ?? []) as Array<{ id: string; circle: string | null }>).map((row) => [
						row.id,
						row.circle
					])
				);
				things.forEach((found, index) => {
					const id = matched.get(`q${index + 1}`);
					if (!id) return;
					resolution.set(found.key, {
						mode: 'existing',
						id,
						// The user's own entry unless research made it and it is still outside
						// their world.
						own: circles.has(id) && circles.get(id) !== 'public'
					});
				});
			}
		}
		const plan = buildExploreBatch({
			found: valid.found,
			about: valid.about,
			lanes,
			pages,
			resolve: (found) => resolution.get(found.key) ?? { mode: 'new' }
		});
		const idByRef = new Map<string, string>();
		const createdIds = new Set<string>();
		if (plan.batch.entities.length || plan.batch.facts.length) {
			const receipt = await store.record(plan.batch, { via: 'enrichment', runId });
			for (const entity of receipt.entities) {
				idByRef.set(entity.ref, entity.id);
				if (entity.matched === 'created') createdIds.add(entity.id);
			}
			factsSaved = receipt.facts.added + receipt.facts.suggested + receipt.facts.superseded;
			if (createdIds.size) {
				// Found on the web, not part of the user's world until they say so.
				await deps.client
					.from('knowledge_entities')
					.update({
						circle: 'public',
						circle_source: 'signals',
						circle_set_at: now().toISOString()
					})
					.in('id', [...createdIds])
					.eq('owner_user_id', context.userId)
					.then(
						() => undefined,
						() => undefined
					);
			}
		}

		// 10. The checks were answered by the model that read the pages (step 8).
		const withIds = valid.found
			.map((found, index) => ({ found, id: idByRef.get(`n${index + 1}`) }))
			.filter((row): row is { found: ExploreFound; id: string } => Boolean(row.id));
		for (const { found, id } of withIds) {
			const about = lanes[found.lane]?.about;
			const twin = sameNameAs.get(found.key);
			const links = [found.website, ...found.profiles].filter((url): url is string =>
				Boolean(url)
			);
			entities.push({
				id,
				kind: found.kind,
				name: found.name,
				...(found.summary ? { summary: found.summary } : {}),
				origin: 'web',
				hop,
				...(createdIds.has(id) || madeHere.has(id) ? { is_new: true } : {}),
				...(args.checks.length ? { fit: found.fit } : {}),
				...(about ? { from_entity_id: about.id } : {}),
				...(about && found.relation !== 'none' ? { relation: found.relation } : {}),
				...(found.title ? { title: found.title } : {}),
				sources: [pages[found.page]!.url],
				...(links.length ? { links } : {}),
				...(found.caution ? { note: found.caution } : {}),
				...(twin ? { maybe_same_as: twin } : {})
			});
		}
		for (const extra of [...plan.places, ...plan.employers]) {
			const id = idByRef.get(extra.ref);
			if (!id || entities.some((entity) => entity.id === id)) continue;
			entities.push({
				id,
				kind: plan.places.includes(extra) ? 'place' : 'org',
				name: extra.name,
				origin: 'web',
				hop,
				...(createdIds.has(id) ? { is_new: true } : {})
			});
		}
		const ranked = rankByFit(entities);
		entities.length = 0;
		entities.push(...ranked);
		if (args.checks.length && withIds.length) {
			const counts = fitCounts(withIds.map(({ found }) => ({ fit: found.fit })));
			context.onStep?.({
				kind: 'decide',
				verb: 'Checked',
				target: `each against: ${args.checks.map((c) => c.key).join(', ')}`,
				outcome: `${counts.pass_all} pass, ${counts.cant_tell} can't tell`
			});
		}
		const newCount = entities.filter((entity) => entity.is_new).length;
		context.onStep?.({
			kind: 'save',
			verb: 'Saved',
			target: 'to your graph, marked found on the web',
			outcome: `${newCount} new, ${entities.length - newCount} already there`
		});
		status = 'completed';

		const atLimit = hop >= GUIDED_SEARCH_HOP_LIMIT;
		const twinNote = entities.filter((entity) => entity.maybe_same_as);
		const message = [
			entities.length
				? `Hop ${hop} of ${GUIDED_SEARCH_HOP_LIMIT}. Found ${plural(entities.length, 'entry', 'entries')} (${newCount} new) on ${plural(pagesRead.length, 'page', 'pages')} and saved ${entities.length === 1 ? 'it' : 'them'} to the user's graph, marked as found on the web and kept outside "Your world" until the user says they know someone.`
				: `Hop ${hop} of ${GUIDED_SEARCH_HOP_LIMIT}. The pages named nothing that fits. Nothing was saved.`,
			twinNote.length
				? `Same name as someone the user already has, saved as a separate entry and the user was asked whether they are the same: ${twinNote.map((entity) => entity.name).join(', ')}.`
				: '',
			args.skippedSearches
				? `Only the first ${searches.length} searches ran (one hop runs ${searches.length}); ${plural(args.skippedSearches, 'search was', 'searches were')} left out. Tell the user which selected entries were not searched yet.`
				: '',
			searchFailures
				? `${plural(searchFailures, 'search', 'searches')} failed and returned nothing.`
				: '',
			'The user sees each entry as a selectable chip under your reply with its checks and source, so do not list every detail. In two or three sentences say what came back and what it means for their question, mention anything marked with a note, then offer the next step or two.',
			atLimit
				? `This trail is now ${GUIDED_SEARCH_HOP_LIMIT} hops out, the limit: say the search stopped here and ask before going further.`
				: 'Do not search again in this turn: the user selects entries and says where to go next.'
		]
			.filter(Boolean)
			.join(' ');

		return {
			knowledge_explore: {
				run_id: runId,
				goal: args.goal,
				hop,
				hop_limit: GUIDED_SEARCH_HOP_LIMIT,
				checks: args.checks,
				queries: searches.map((s) => s.query),
				pages: pagesRead,
				entities,
				saved: { new: newCount, facts: factsSaved },
				...(valid.dropped.length ? { dropped: valid.dropped.length } : {}),
				cost_usd: Number(costUsd.toFixed(5)),
				...(atLimit
					? {
							stopped: {
								reason: 'hop_limit',
								message: `Stopped at hop ${hop}, the limit for one trail.`
							}
						}
					: {})
			},
			message
		};
	} catch (error) {
		failure = error instanceof Error ? error.message.slice(0, 300) : 'Search failed';
		status = entities.length ? 'partial' : 'failed';
		throw error;
	} finally {
		await finishExploreRun(
			deps.client,
			context.userId,
			runId,
			{
				status,
				costUsd,
				facts: factsSaved,
				error: failure,
				explore: {
					hop,
					goal: args.goal,
					queries: searches.map((s) => s.query),
					pages: pagesRead,
					entities: entities.map((entity) => ({
						id: entity.id,
						kind: entity.kind,
						name: entity.name
					}))
				}
			},
			now
		);
	}
}
