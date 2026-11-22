// packages/shared-agent-ops/src/knowledge/connections.ts
//
// Find connections (tasker 166): who the user knows at a company, in a place, in the same
// kind of company, across their tasks and docs, or one step away from a company. One database
// call (knowledge_connections, migration 20261122020000) answers from the graph as it is and
// reports how much of the pool lacks the data a filter needs, so chat, the Connections view
// and the card chips can all say "12 can't be placed yet" instead of guessing.
//
// Every filter is a structured value the chat model or the page supplies. Nothing here reads
// meaning out of a sentence.
import { KNOWLEDGE_UUID_PATTERN } from './normalize';
import type { KnowledgeDataClient } from './types';

export const KNOWLEDGE_CONNECTION_FACETS = [
	'company',
	'place',
	'region',
	'industry',
	'title'
] as const;
export type KnowledgeConnectionFacet = (typeof KNOWLEDGE_CONNECTION_FACETS)[number];

export const KNOWLEDGE_CONNECTION_SCOPES = ['known', 'world', 'all'] as const;
export type KnowledgeConnectionScope = (typeof KNOWLEDGE_CONNECTION_SCOPES)[number];

export const KNOWLEDGE_CONNECTION_EMPLOYMENT = ['current', 'former', 'any'] as const;
export type KnowledgeConnectionEmployment = (typeof KNOWLEDGE_CONNECTION_EMPLOYMENT)[number];

export const KNOWLEDGE_CONNECTION_PLACE_OF = ['any', 'person', 'company'] as const;
export type KnowledgeConnectionPlaceOf = (typeof KNOWLEDGE_CONNECTION_PLACE_OF)[number];

export const KNOWLEDGE_CONNECTION_RECORD_KINDS = ['task', 'document', 'project'] as const;
export type KnowledgeConnectionRecordKind = (typeof KNOWLEDGE_CONNECTION_RECORD_KINDS)[number];

/** Words per filter and characters per word a caller may send. */
export const KNOWLEDGE_CONNECTION_MAX_TERMS = 12;
export const KNOWLEDGE_CONNECTION_MAX_TERM_LENGTH = 120;
export const KNOWLEDGE_CONNECTION_MAX_IDS = 50;
export const KNOWLEDGE_CONNECTION_LIMIT_MAX = 200;
export const KNOWLEDGE_CONNECTION_FACET_LIMIT_MAX = 100;

export interface KnowledgeConnectionFilters {
	/**
	 * known = people the user knows; world (default) = those plus their own people who aren't
	 * "just mentioned"; all = every person they can see.
	 */
	scope?: KnowledgeConnectionScope;
	person_ids?: string[];
	/** How the user knows them: the knows fact's via ("linkedin"). */
	via?: string;
	/** Which jobs count for every company test. Default current. */
	employment?: KnowledgeConnectionEmployment;
	/** Employer names: a whole-word match, or the same name once "The" and punctuation fold. */
	company?: string[];
	company_ids?: string[];
	/** Job-title words; a word start matches ("engineer" finds "Engineering Manager"). */
	title?: string[];
	/** Employer industry words; a word start matches. */
	industry?: string[];
	/** City, state or country names ("Maryland", "MD", "Baltimore, MD"); any one matching. */
	place?: string[];
	place_ids?: string[];
	/** Whose location counts. Default any (the person's own or their employer's). */
	place_of?: KnowledgeConnectionPlaceOf;
	/** Named in at least one of each listed kind of record. */
	in_records?: KnowledgeConnectionRecordKind[];
	/** A person: people sharing an employer or a place with them. */
	related_to?: string;
	/**
	 * A company: people not there now who lead to it (worked there, share another employer
	 * with someone there, or are named in the same task, doc or project as someone there).
	 */
	bridge_to?: string[];
	bridge_to_ids?: string[];
}

export interface KnowledgeConnectionOptions {
	/** Groupings to return. None by default. */
	facets?: KnowledgeConnectionFacet[];
	/** People rows; 0 returns only counts and groups. Default 50. */
	limit?: number;
	offset?: number;
	/** Groups per facet. Default 12. */
	facetLimit?: number;
	/** Add email and phone values to each person. Only for callers allowed to see them. */
	contacts?: boolean;
	/** False keeps people's street addresses out of the place data. Default true. */
	addresses?: boolean;
}

export interface KnowledgeConnectionJob {
	org_id: string;
	org: string;
	title?: string;
	current: boolean;
}

export interface KnowledgeConnectionBridge {
	how: 'worked_there' | 'same_company' | 'same_task' | 'same_document' | 'same_project';
	person_id?: string;
	person?: string;
	through?: string;
}

export interface KnowledgeConnectionPerson {
	id: string;
	name: string;
	summary?: string;
	known: boolean;
	connected_on?: string;
	jobs: KnowledgeConnectionJob[];
	places: string[];
	industries: string[];
	tasks: number;
	documents: number;
	projects: number;
	email?: string[];
	phone?: string[];
	bridge?: KnowledgeConnectionBridge[];
}

export interface KnowledgeConnectionGroup {
	key: string;
	/** Company groups: one of the org entries behind the group. */
	id?: string;
	name: string;
	people: number;
	sample: string[];
}

export interface KnowledgeConnectionCoverage {
	/** The pool: everyone passing the filters that don't depend on place or industry data. */
	people: number;
	known: number;
	with_company: number;
	with_title: number;
	with_place: number;
	with_industry: number;
	companies: number;
	companies_with_place: number;
	companies_with_industry: number;
}

export interface KnowledgeConnectionGap {
	id: string;
	name: string;
	people: number;
}

export interface KnowledgeConnectionsResult {
	people: KnowledgeConnectionPerson[];
	total: number;
	facets: Partial<
		Record<KnowledgeConnectionFacet, { total: number; groups: KnowledgeConnectionGroup[] }>
	>;
	coverage: KnowledgeConnectionCoverage;
	/** Employers with the most of these people that lack a place or an industry. */
	gaps: {
		companies_without_place: KnowledgeConnectionGap[];
		companies_without_industry: KnowledgeConnectionGap[];
	};
	/** related_to only: the anchor person's employers and places. */
	anchor?: {
		/** key matches the company facet's group key (the folded name). */
		companies: Array<{ id: string; name: string; key: string }>;
		/** key matches the place facet's group key. */
		places: Array<{ key: string; name: string }>;
	};
}

export class KnowledgeConnectionsError extends Error {
	constructor(
		message: string,
		readonly code: 'INVALID' | 'UNAVAILABLE' | 'DB'
	) {
		super(message);
		this.name = 'KnowledgeConnectionsError';
	}
}

function terms(value: readonly string[] | undefined, field: string): string[] | undefined {
	if (!value?.length) return undefined;
	const cleaned = [
		...new Set(
			value
				.filter((entry): entry is string => typeof entry === 'string')
				.map((entry) => entry.replace(/\s+/g, ' ').trim())
				.filter(Boolean)
		)
	];
	if (cleaned.some((entry) => entry.length > KNOWLEDGE_CONNECTION_MAX_TERM_LENGTH))
		throw new KnowledgeConnectionsError(
			`${field}: each value is at most ${KNOWLEDGE_CONNECTION_MAX_TERM_LENGTH} characters.`,
			'INVALID'
		);
	if (cleaned.length > KNOWLEDGE_CONNECTION_MAX_TERMS)
		throw new KnowledgeConnectionsError(
			`${field}: at most ${KNOWLEDGE_CONNECTION_MAX_TERMS} values.`,
			'INVALID'
		);
	return cleaned.length ? cleaned : undefined;
}

function ids(value: readonly string[] | undefined, field: string): string[] | undefined {
	if (!value?.length) return undefined;
	const cleaned = [...new Set(value)];
	if (cleaned.some((entry) => typeof entry !== 'string' || !KNOWLEDGE_UUID_PATTERN.test(entry)))
		throw new KnowledgeConnectionsError(`${field}: not a valid id.`, 'INVALID');
	if (cleaned.length > KNOWLEDGE_CONNECTION_MAX_IDS)
		throw new KnowledgeConnectionsError(
			`${field}: at most ${KNOWLEDGE_CONNECTION_MAX_IDS} ids.`,
			'INVALID'
		);
	return cleaned;
}

function oneOf<T extends string>(
	value: unknown,
	allowed: readonly T[],
	field: string
): T | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value !== 'string' || !allowed.includes(value as T))
		throw new KnowledgeConnectionsError(
			`${field} must be one of: ${allowed.join(', ')}.`,
			'INVALID'
		);
	return value as T;
}

/** The filters as the database function reads them: validated, trimmed, empties dropped. */
export function knowledgeConnectionFilterPayload(
	filters: KnowledgeConnectionFilters,
	options: Pick<KnowledgeConnectionOptions, 'contacts' | 'addresses'> = {}
): Record<string, unknown> {
	const records = filters.in_records?.length
		? [
				...new Set(
					filters.in_records.map(
						(kind) => oneOf(kind, KNOWLEDGE_CONNECTION_RECORD_KINDS, 'in_records')!
					)
				)
			]
		: undefined;
	const via = filters.via?.trim().toLowerCase();
	if (via && via.length > 40)
		throw new KnowledgeConnectionsError('via: at most 40 characters.', 'INVALID');
	const related = filters.related_to ? ids([filters.related_to], 'related_to')![0] : undefined;
	const payload: Record<string, unknown> = {
		scope: oneOf(filters.scope, KNOWLEDGE_CONNECTION_SCOPES, 'scope'),
		person_ids: ids(filters.person_ids, 'person_ids'),
		via: via || undefined,
		employment: oneOf(filters.employment, KNOWLEDGE_CONNECTION_EMPLOYMENT, 'employment'),
		company: terms(filters.company, 'company'),
		company_ids: ids(filters.company_ids, 'company_ids'),
		title: terms(filters.title, 'title'),
		industry: terms(filters.industry, 'industry'),
		place: terms(filters.place, 'place'),
		place_ids: ids(filters.place_ids, 'place_ids'),
		place_of: oneOf(filters.place_of, KNOWLEDGE_CONNECTION_PLACE_OF, 'place_of'),
		in_records: records,
		related_to: related,
		bridge_to: terms(filters.bridge_to, 'bridge_to'),
		bridge_to_ids: ids(filters.bridge_to_ids, 'bridge_to_ids'),
		...(options.contacts ? { contacts: true } : {}),
		...(options.addresses === false ? { addresses: false } : {})
	};
	return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

type RawPerson = Partial<KnowledgeConnectionPerson> & { id: string; name: string };

function emptyCoverage(): KnowledgeConnectionCoverage {
	return {
		people: 0,
		known: 0,
		with_company: 0,
		with_title: 0,
		with_place: 0,
		with_industry: 0,
		companies: 0,
		companies_with_place: 0,
		companies_with_industry: 0
	};
}

/**
 * Read connections for one user. The client may be user-scoped (row security applies) or the
 * service role (the function filters by the viewer passed here), so `userId` must come from
 * the authenticated session, never from tool arguments.
 */
export async function readKnowledgeConnections(
	db: KnowledgeDataClient,
	userId: string,
	filters: KnowledgeConnectionFilters = {},
	options: KnowledgeConnectionOptions = {}
): Promise<KnowledgeConnectionsResult> {
	const facets = [...new Set(options.facets ?? [])].map(
		(facet) => oneOf(facet, KNOWLEDGE_CONNECTION_FACETS, 'facets')!
	);
	const { data, error } = await db.rpc('knowledge_connections', {
		p_filters: knowledgeConnectionFilterPayload(filters, options),
		p_facets: facets.length ? facets : null,
		p_limit: Math.min(Math.max(options.limit ?? 50, 0), KNOWLEDGE_CONNECTION_LIMIT_MAX),
		p_offset: Math.max(options.offset ?? 0, 0),
		p_facet_limit: Math.min(
			Math.max(options.facetLimit ?? 12, 1),
			KNOWLEDGE_CONNECTION_FACET_LIMIT_MAX
		),
		p_viewer: userId
	});
	if (error) {
		const code = (error as { code?: string }).code;
		// PGRST202 / 42883: the function isn't in this database yet (migration not applied).
		if (code === 'PGRST202' || code === '42883')
			throw new KnowledgeConnectionsError(
				'Connections are not switched on yet.',
				'UNAVAILABLE'
			);
		if (code === '22023' || code === '22P02')
			throw new KnowledgeConnectionsError(
				(error as { message?: string }).message ?? 'Invalid filter.',
				'INVALID'
			);
		throw new KnowledgeConnectionsError(
			`Find connections: ${(error as { message?: string }).message ?? 'failed'}`,
			'DB'
		);
	}
	const raw = (data ?? {}) as Partial<KnowledgeConnectionsResult> & { people?: RawPerson[] };
	return {
		people: (raw.people ?? []).map((person) => ({
			id: person.id,
			name: person.name,
			...(person.summary ? { summary: person.summary } : {}),
			known: person.known === true,
			...(person.connected_on ? { connected_on: person.connected_on } : {}),
			jobs: (person.jobs ?? []).map((job) => ({ ...job, current: job.current === true })),
			places: person.places ?? [],
			industries: person.industries ?? [],
			tasks: Number(person.tasks ?? 0),
			documents: Number(person.documents ?? 0),
			projects: Number(person.projects ?? 0),
			...(person.email?.length ? { email: person.email } : {}),
			...(person.phone?.length ? { phone: person.phone } : {}),
			...(person.bridge?.length ? { bridge: person.bridge } : {})
		})),
		total: Number(raw.total ?? 0),
		facets: Object.fromEntries(
			Object.entries(raw.facets ?? {}).map(([facet, body]) => [
				facet,
				{
					total: Number(body?.total ?? 0),
					groups: (body?.groups ?? []).map((group) => ({
						...group,
						people: Number(group.people ?? 0),
						sample: group.sample ?? []
					}))
				}
			])
		),
		coverage: { ...emptyCoverage(), ...(raw.coverage ?? {}) },
		gaps: {
			companies_without_place: raw.gaps?.companies_without_place ?? [],
			companies_without_industry: raw.gaps?.companies_without_industry ?? []
		},
		...(raw.anchor
			? {
					anchor: {
						companies: raw.anchor.companies ?? [],
						places: raw.anchor.places ?? []
					}
				}
			: {})
	};
}

export interface KnowledgeConnectionGapNote {
	/** What is thin: where people are, what their employers do, who they work for, their title. */
	about: 'place' | 'industry' | 'company' | 'title';
	/** One plain sentence for the answer. */
	text: string;
	/** The employers research would fill first (place and industry gaps only). */
	research?: KnowledgeConnectionGap[];
}

function plural(count: number, one: string, many: string): string {
	return `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;
}

/**
 * What the graph can't answer yet for this question, in plain sentences: a place filter over
 * people with no known location, an industry filter over employers with no industry. Empty
 * when the data the question needs is all there. Chat relays these; the page shows them.
 */
export function describeKnowledgeConnectionGaps(
	result: Pick<KnowledgeConnectionsResult, 'coverage' | 'gaps'>,
	asked: {
		filters?: KnowledgeConnectionFilters;
		facets?: readonly KnowledgeConnectionFacet[];
	} = {}
): KnowledgeConnectionGapNote[] {
	const { coverage, gaps } = result;
	const filters = asked.filters ?? {};
	const facets = asked.facets ?? [];
	const notes: KnowledgeConnectionGapNote[] = [];
	if (coverage.people === 0) return notes;

	const wantsPlace =
		Boolean(filters.place?.length || filters.place_ids?.length) ||
		facets.includes('place') ||
		facets.includes('region');
	const unplaced = coverage.people - coverage.with_place;
	if (wantsPlace && unplaced > 0) {
		const whose =
			filters.place_of === 'person'
				? 'their own'
				: filters.place_of === 'company'
					? "their employer's"
					: "their own or their employer's";
		notes.push({
			about: 'place',
			text: `A location (${whose}) is known for ${coverage.with_place.toLocaleString('en-US')} of ${plural(coverage.people, 'person', 'people')}; the other ${unplaced.toLocaleString('en-US')} can't be placed yet.`,
			...(gaps.companies_without_place.length
				? { research: gaps.companies_without_place }
				: {})
		});
	}

	const wantsIndustry = Boolean(filters.industry?.length) || facets.includes('industry');
	const noIndustry = coverage.companies - coverage.companies_with_industry;
	if (wantsIndustry && noIndustry > 0) {
		notes.push({
			about: 'industry',
			text: `An industry is known for ${coverage.companies_with_industry.toLocaleString('en-US')} of ${plural(coverage.companies, 'employer', 'employers')}; the other ${noIndustry.toLocaleString('en-US')} have none yet.`,
			...(gaps.companies_without_industry.length
				? { research: gaps.companies_without_industry }
				: {})
		});
	}

	const wantsCompany =
		Boolean(
			filters.company?.length ||
				filters.company_ids?.length ||
				filters.bridge_to?.length ||
				filters.bridge_to_ids?.length
		) || facets.includes('company');
	const noCompany = coverage.people - coverage.with_company;
	if ((wantsCompany || wantsPlace || wantsIndustry) && noCompany > 0) {
		notes.push({
			about: 'company',
			text: `${plural(noCompany, 'person has', 'people have')} no employer recorded.`
		});
	}

	const wantsTitle = Boolean(filters.title?.length) || facets.includes('title');
	const noTitle = coverage.people - coverage.with_title;
	if (wantsTitle && noTitle > 0) {
		notes.push({
			about: 'title',
			text: `${plural(noTitle, 'person has', 'people have')} no job title recorded.`
		});
	}
	return notes;
}
