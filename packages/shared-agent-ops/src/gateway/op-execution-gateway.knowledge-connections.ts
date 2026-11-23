// packages/shared-agent-ops/src/gateway/op-execution-gateway.knowledge-connections.ts
//
// query_knowledge's people filters (tasker 166): "who do I know at / in / doing …", grouped by
// company, place or industry, and "who leads to someone at X". Same tool and op as the
// relationship query (knowledge.query); a call takes this path when it carries one of the
// people filters or group_by. One database call (knowledge_connections) answers it.
//
// Meaning arrives as tool arguments (company names, place names, title words). This file never
// reads the user's sentence. Results are compact on purpose: models read them, and the notes
// say what the graph is missing so the model relays that instead of guessing.
import {
	KNOWLEDGE_CONNECTION_FACETS,
	KNOWLEDGE_UUID_PATTERN,
	KnowledgeStore,
	describeKnowledgeConnectionGaps,
	isKnowledgeKind,
	readKnowledgeConnections,
	type KnowledgeConnectionFacet,
	type KnowledgeConnectionFilters,
	type KnowledgeConnectionGap,
	type KnowledgeConnectionPerson,
	type KnowledgeConnectionsResult,
	type KnowledgeDataClient,
	type KnowledgeKind
} from '../knowledge';
import { ExternalToolGatewayError } from './op-execution-gateway.responses';

/** People rows when the call does not group; groups when it does. */
export const KNOWLEDGE_CONNECTION_PEOPLE_DEFAULT = 25;
/** People who work at a bridge_to company now, listed beside the people who lead to them. */
const KNOWLEDGE_CONNECTION_DIRECT_MAX = 12;
export const KNOWLEDGE_CONNECTION_PEOPLE_MAX = 100;
export const KNOWLEDGE_CONNECTION_GROUPS_DEFAULT = 25;
export const KNOWLEDGE_CONNECTION_GROUPS_MAX = 50;

/** `where` keys that make query_knowledge a people query. */
export const KNOWLEDGE_CONNECTION_WHERE_KEYS = [
	'company',
	'employment',
	'title',
	'industry',
	'place',
	'place_of',
	'in_records',
	'via',
	'related_to',
	'bridge_to'
] as const;

type ReadOptions = { hideContacts?: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string): ExternalToolGatewayError {
	return new ExternalToolGatewayError('VALIDATION_ERROR', message);
}

function present(value: unknown): boolean {
	if (value === undefined || value === null || value === '') return false;
	return !(Array.isArray(value) && value.length === 0);
}

/** True when the call uses a people filter or asks for groups. */
export function isKnowledgeConnectionQuery(args: Record<string, unknown>): boolean {
	if (present(args.group_by)) return true;
	const where = args.where;
	return isRecord(where) && KNOWLEDGE_CONNECTION_WHERE_KEYS.some((key) => present(where[key]));
}

/** Models send "Acme" as often as ["Acme"]; both mean one value. */
function textList(value: unknown, field: string): string[] | undefined {
	if (!present(value)) return undefined;
	const list = Array.isArray(value) ? value : [value];
	if (list.some((entry) => typeof entry !== 'string'))
		throw invalid(`${field} must be text or a list of text`);
	return list as string[];
}

function text(value: unknown, field: string): string | undefined {
	if (!present(value)) return undefined;
	if (typeof value !== 'string') throw invalid(`${field} must be text`);
	return value;
}

interface ParsedConnectionQuery {
	filters: KnowledgeConnectionFilters;
	groupBy: KnowledgeConnectionFacet | null;
	limit: number | null;
	start: { entityIds: string[]; search: string | null; kinds: KnowledgeKind[] | null };
	ignoredFollow: boolean;
}

function parseConnectionQuery(args: Record<string, unknown>): ParsedConnectionQuery {
	const start = isRecord(args.start) ? args.start : {};
	const where = isRecord(args.where) ? args.where : {};
	const groupBy = text(args.group_by, 'group_by') ?? null;
	if (groupBy && !KNOWLEDGE_CONNECTION_FACETS.includes(groupBy as KnowledgeConnectionFacet))
		throw invalid(`group_by must be one of: ${KNOWLEDGE_CONNECTION_FACETS.join(', ')}`);

	const entityIds = (Array.isArray(start.entity_ids) ? start.entity_ids : []).map((id, index) => {
		if (typeof id !== 'string' || !KNOWLEDGE_UUID_PATTERN.test(id))
			throw invalid(`start.entity_ids[${index}] must be a UUID`);
		return id;
	});
	const kinds = Array.isArray(start.kinds)
		? start.kinds.filter(
				(kind): kind is KnowledgeKind => typeof kind === 'string' && isKnowledgeKind(kind)
			)
		: null;
	const relatedTo = text(where.related_to, 'where.related_to');
	if (relatedTo && !KNOWLEDGE_UUID_PATTERN.test(relatedTo))
		throw invalid('where.related_to must be a person id');

	let limit: number | null = null;
	if (args.limit !== undefined && args.limit !== null) {
		const parsed = Number(args.limit);
		if (!Number.isInteger(parsed) || parsed < 1)
			throw invalid('limit must be a positive integer');
		limit = parsed;
	}

	const filters: KnowledgeConnectionFilters = {
		scope: start.known_by_me === true || where.known_by_me === true ? 'known' : 'world',
		company: textList(where.company, 'where.company'),
		employment: text(where.employment, 'where.employment') as
			| KnowledgeConnectionFilters['employment']
			| undefined,
		title: textList(where.title, 'where.title'),
		industry: textList(where.industry, 'where.industry'),
		place: textList(where.place, 'where.place'),
		place_of: text(where.place_of, 'where.place_of') as
			| KnowledgeConnectionFilters['place_of']
			| undefined,
		in_records: textList(where.in_records, 'where.in_records') as
			| KnowledgeConnectionFilters['in_records']
			| undefined,
		via: text(where.via, 'where.via'),
		related_to: relatedTo,
		bridge_to: textList(where.bridge_to, 'where.bridge_to')
	};
	return {
		filters,
		groupBy: groupBy as KnowledgeConnectionFacet | null,
		limit,
		start: {
			entityIds,
			search: text(start.search, 'start.search')?.trim() || null,
			kinds: kinds?.length ? kinds : null
		},
		ignoredFollow: Array.isArray(args.follow) && args.follow.length > 0
	};
}

/**
 * start names entries (ids or a search): people narrow the people, an org is a company filter,
 * a place a place filter. Returns false when the start named something and nothing matched.
 */
async function applyStart(
	store: KnowledgeStore,
	parsed: ParsedConnectionQuery,
	notes: string[]
): Promise<boolean> {
	const { entityIds, search, kinds } = parsed.start;
	let named: Array<{ id: string; kind: KnowledgeKind; name: string }> = [];
	if (entityIds.length) {
		const summaries = await store.getSummaries(entityIds);
		named = entityIds
			.map((id) => summaries.get(id))
			.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
			.map((entry) => ({ id: entry.id, kind: entry.kind, name: entry.name }));
	} else if (search) {
		const hits = await store.search(search, { ...(kinds ? { kinds } : {}), limit: 10 });
		const top = hits[0]?.score ?? 0;
		named = hits
			.filter((hit) => hit.score >= top - 0.05)
			.slice(0, 5)
			.map((hit) => ({ id: hit.id, kind: hit.kind, name: hit.name }));
	} else {
		return true;
	}
	if (!named.length) {
		notes.push(
			search
				? `Nothing in your knowledge matched "${search}".`
				: 'None of those entries were found.'
		);
		return false;
	}
	const { filters } = parsed;
	const people = named.filter((entry) => entry.kind === 'person');
	const orgs = named.filter((entry) => entry.kind === 'org');
	const places = named.filter((entry) => entry.kind === 'place');
	if (people.length) filters.person_ids = people.map((entry) => entry.id);
	if (orgs.length) {
		filters.company_ids = orgs.map((entry) => entry.id);
		// The names too, so a second entry for the same company ("The Cadre") still counts.
		filters.company = [...(filters.company ?? []), ...orgs.map((entry) => entry.name)].slice(
			0,
			12
		);
	}
	if (places.length) filters.place_ids = places.map((entry) => entry.id);
	const other = named.length - people.length - orgs.length - places.length;
	if (other > 0)
		notes.push(
			'People filters start from people, organizations or places; other entries were skipped.'
		);
	return people.length + orgs.length + places.length > 0;
}

function compactPerson(person: KnowledgeConnectionPerson): Record<string, unknown> {
	return {
		id: person.id,
		name: person.name,
		...(person.summary ? { summary: person.summary } : {}),
		// Someone named in the user's work who is not recorded as a contact.
		...(person.known ? {} : { not_a_contact: true }),
		...(person.jobs.length
			? {
					jobs: person.jobs.map((job) => ({
						org: job.org,
						org_id: job.org_id,
						...(job.title ? { title: job.title } : {}),
						...(job.current ? {} : { former: true })
					}))
				}
			: {}),
		...(person.places.length ? { places: person.places } : {}),
		...(person.industries.length ? { industries: person.industries } : {}),
		...(person.connected_on ? { connected_on: person.connected_on } : {}),
		...(person.tasks ? { tasks: person.tasks } : {}),
		...(person.documents ? { documents: person.documents } : {}),
		...(person.projects ? { projects: person.projects } : {}),
		...(person.email ? { email: person.email } : {}),
		...(person.phone ? { phone: person.phone } : {}),
		...(person.bridge ? { leads_via: person.bridge } : {})
	};
}

/**
 * Why nobody is in the pool, in the terms the caller asked in, so the model says "nobody you
 * know is recorded at Curri" instead of a bare zero.
 */
function nobodyNote(filters: KnowledgeConnectionFilters): string {
	const who = filters.scope === 'known' ? 'Nobody the user knows' : "Nobody in the user's world";
	const jobs =
		filters.employment === 'former'
			? ' as a past job'
			: filters.employment === 'any'
				? ''
				: " as a current job (employment 'any' also checks past ones)";
	const asked: string[] = [];
	if (filters.company?.length || filters.company_ids?.length)
		asked.push(`is recorded at ${filters.company?.join(' or ') ?? 'that company'}${jobs}`);
	if (filters.title?.length) asked.push(`has a title with ${filters.title.join(' or ')}`);
	if (filters.via) asked.push(`is known via ${filters.via}`);
	if (filters.in_records?.length)
		asked.push(`is named in the user's ${filters.in_records.join(' and ')} records`);
	if (filters.related_to) asked.push('shares an employer or place with that person');
	if (filters.person_ids?.length) asked.push('matches those entries');
	if (!asked.length)
		return filters.scope === 'known'
			? 'No contacts are recorded yet. They arrive by importing contacts or saying who the user knows.'
			: 'No people are recorded yet.';
	return `${who} ${asked.join(' and ')}. It may simply not be recorded yet.`;
}

function emptyAnswer(notes: string[]): Record<string, unknown> {
	return { people: [], total: 0, notes };
}

/**
 * A way in to a company has two answers: the people who work there now, and the people who
 * lead to one of them. The second list never repeats the first, so the first is read on its
 * own; without it "who knows someone at Anduril" said nobody while three contacts work there.
 */
function bridgeNotes(
	filters: KnowledgeConnectionFilters,
	result: KnowledgeConnectionsResult,
	direct: KnowledgeConnectionsResult
): string[] {
	const who = filters.scope === 'known' ? 'the user knows' : "in the user's world";
	const there = filters.bridge_to?.length ? filters.bridge_to.join(' or ') : 'that company';
	const others =
		'shares another employer, a task, a document or a project with someone there, or is recorded there as a past job. Past jobs are often missing; research on a contact adds them.';
	if (direct.total > 0)
		return [
			`${direct.total} ${direct.total === 1 ? 'person' : 'people'} ${who} ${direct.total === 1 ? 'works' : 'work'} at ${there} now: they are in works_there_now and are the direct way in. people lists only others who lead to them.`,
			...(result.total === 0 ? [`Nobody else ${others}`] : [])
		];
	if (result.total > 0) return [];
	return [`Nobody ${who} is recorded at ${there} now, and nobody ${others}`];
}

function compactConnections(
	result: KnowledgeConnectionsResult,
	parsed: ParsedConnectionQuery,
	notes: string[],
	direct: KnowledgeConnectionsResult | null = null
): Record<string, unknown> {
	const { groupBy, filters } = parsed;
	const gapNotes = describeKnowledgeConnectionGaps(result, {
		filters,
		facets: groupBy ? [groupBy] : []
	});
	const research = new Map<string, KnowledgeConnectionGap>();
	for (const note of gapNotes) {
		notes.push(note.text);
		for (const gap of note.research ?? []) research.set(gap.id, gap);
	}
	if (research.size)
		notes.push(
			'Research can fill these gaps for the employers in research_candidates. It is paid and starts only when the user agrees: offer it, do not start it yourself.'
		);
	if (direct) notes.push(...bridgeNotes(filters, result, direct));
	else if (result.total === 0 && result.coverage.people > 0 && !gapNotes.length)
		notes.push('Nobody in the graph matches. It may simply not be recorded yet.');
	else if (result.coverage.people === 0) notes.push(nobodyNote(filters));
	const group = groupBy ? result.facets[groupBy] : undefined;
	return {
		...(groupBy
			? {
					group_by: groupBy,
					groups: (group?.groups ?? []).map((entry) => ({
						name: entry.name,
						people: entry.people,
						...(entry.id ? { id: entry.id } : {}),
						sample: entry.sample
					})),
					groups_total: group?.total ?? 0
				}
			: { people: result.people.map(compactPerson) }),
		total: result.total,
		...(!groupBy && result.total > result.people.length ? { truncated: true } : {}),
		...(direct?.total
			? { works_there_now: { total: direct.total, people: direct.people.map(compactPerson) } }
			: {}),
		coverage: result.coverage,
		...(research.size ? { research_candidates: [...research.values()].slice(0, 10) } : {}),
		...(notes.length ? { notes } : {})
	};
}

export async function runKnowledgeConnectionsQuery(
	client: KnowledgeDataClient,
	userId: string,
	args: Record<string, unknown>,
	options: ReadOptions = {}
): Promise<Record<string, unknown>> {
	const parsed = parseConnectionQuery(args);
	const notes: string[] = [];
	if (parsed.ignoredFollow)
		notes.push('follow is not used with people filters or group_by; it was skipped.');
	try {
		const store = new KnowledgeStore(client, userId);
		if (!(await applyStart(store, parsed, notes))) return emptyAnswer(notes);
		const { bridge_to: bridgeTo, bridge_to_ids: bridgeToIds, scope } = parsed.filters;
		const contacts = { contacts: !options.hideContacts, addresses: !options.hideContacts };
		const [result, direct] = await Promise.all([
			readKnowledgeConnections(client, userId, parsed.filters, {
				...(parsed.groupBy
					? {
							facets: [parsed.groupBy],
							limit: 0,
							facetLimit: Math.min(
								parsed.limit ?? KNOWLEDGE_CONNECTION_GROUPS_DEFAULT,
								KNOWLEDGE_CONNECTION_GROUPS_MAX
							)
						}
					: {
							limit: Math.min(
								parsed.limit ?? KNOWLEDGE_CONNECTION_PEOPLE_DEFAULT,
								KNOWLEDGE_CONNECTION_PEOPLE_MAX
							)
						}),
				...contacts
			}),
			// Who works there now: the people the bridge list leaves out on purpose.
			bridgeTo?.length || bridgeToIds?.length
				? readKnowledgeConnections(
						client,
						userId,
						{
							...(scope ? { scope } : {}),
							...(bridgeTo?.length ? { company: bridgeTo } : {}),
							...(bridgeToIds?.length ? { company_ids: bridgeToIds } : {})
						},
						{ limit: KNOWLEDGE_CONNECTION_DIRECT_MAX, ...contacts }
					)
				: null
		]);
		return compactConnections(result, parsed, notes, direct);
	} catch (error) {
		if (error instanceof ExternalToolGatewayError) throw error;
		if (error instanceof Error) {
			const code = (error as Error & { code?: string }).code;
			if (
				(error.name === 'KnowledgeConnectionsError' ||
					error.name === 'KnowledgeStoreError') &&
				code === 'INVALID'
			)
				throw invalid(error.message);
			if (error.name === 'KnowledgeConnectionsError' || error.name === 'KnowledgeStoreError')
				throw new ExternalToolGatewayError('INTERNAL', error.message);
		}
		throw error;
	}
}
