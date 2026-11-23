// packages/shared-agent-ops/src/knowledge/types.ts

import type { KnowledgeCircle, KnowledgeCircleSource } from './anchors';
import type { KnowledgeKey } from './normalize';
import type { KnowledgeKind } from './vocabulary';

/** Any Supabase client (typed or not), user-scoped or service-role. */
export interface KnowledgeDataClient {
	from(relation: any): any;
	rpc(fn: any, args?: any, options?: any): any;
}

export type KnowledgeScope = 'public' | 'private';
export type KnowledgeCreatedVia =
	| 'import'
	| 'chat'
	| 'mcp'
	| 'enrichment'
	| 'task'
	| 'manual'
	| 'backfill'
	| 'system';
export type KnowledgeFactStatus = 'active' | 'suggested' | 'disputed' | 'superseded' | 'retracted';
export type KnowledgeSourceType =
	| 'web'
	| 'import'
	| 'user'
	| 'task'
	| 'document'
	| 'chat'
	| 'youtube'
	| 'agent';
export type KnowledgeRecordKind = 'task' | 'document' | 'project' | 'goal' | 'chat_session';

// ---------------------------------------------------------------------------
// Writes

export interface KnowledgeWriteEntity {
	/** Reference used by facts and links in the same batch. */
	ref: string;
	/** An existing entity id the caller can see. */
	id?: string;
	/** The caller's own person entity. */
	self?: boolean;
	kind: KnowledgeKind;
	name: string;
	summary?: string;
	image_url?: string;
	/** Deterministic identifiers: email, phone, LinkedIn, domain, YouTube id, URL. */
	keys?: KnowledgeKey[];
}

export interface KnowledgeWriteSource {
	ref: string;
	type: KnowledgeSourceType;
	url?: string;
	title?: string;
	record_id?: string;
	published_at?: string;
	content_hash?: string;
	meta?: Record<string, unknown>;
}

export interface KnowledgeWriteFact {
	/** Entity ref from this batch, or an existing entity id. */
	subject: string;
	predicate: string;
	/** For relationships: entity ref or id. */
	object?: string;
	/** For properties. */
	value?: string | number;
	qualifiers?: Record<string, unknown>;
	valid_from?: string;
	valid_to?: string;
	confidence?: number;
	status?: 'active' | 'suggested';
	/** Source refs from this batch. */
	sources?: string[];
	/** Exact supporting words from the source(s). */
	quote?: string;
}

export interface KnowledgeWriteLink {
	entity: string;
	record_kind: KnowledgeRecordKind;
	record_id: string;
	quote?: string;
}

export interface KnowledgeWriteBatch {
	entities: KnowledgeWriteEntity[];
	facts: KnowledgeWriteFact[];
	sources?: KnowledgeWriteSource[];
	links?: KnowledgeWriteLink[];
}

export interface KnowledgeWriteOptions {
	via: KnowledgeCreatedVia;
	runId?: string;
	/**
	 * Work out who each entity would be (existing or new) and save nothing. The receipt's
	 * entities and merge_candidates say what a real write would do; new entities get no id.
	 */
	dryRun?: boolean;
	/**
	 * Stamp new entities and identity keys with runId, so the run can be undone later
	 * (knowledge_undo_import). Needs the run_id columns from migration 20261122230000.
	 */
	trackRun?: boolean;
	/**
	 * The incoming data may be older than what is already here (a phone's address book next to
	 * a LinkedIn export): a one-value detail or an employer that would replace or sit beside a
	 * current one is saved as a suggestion instead.
	 */
	fillOnly?: boolean;
}

export type KnowledgeEntityMatch = 'id' | 'self' | 'key' | 'name' | 'created';

export interface KnowledgeWriteReceipt {
	entities: Array<{
		ref: string;
		id: string;
		kind: KnowledgeKind;
		name: string;
		matched: KnowledgeEntityMatch;
	}>;
	facts: { added: number; existing: number; superseded: number; suggested: number };
	sources: number;
	links: number;
	merge_candidates: number;
	problems: Array<{ ref?: string; fact?: number; message: string }>;
}

// ---------------------------------------------------------------------------
// Reads

export interface KnowledgeEntitySummary {
	id: string;
	kind: KnowledgeKind;
	name: string;
	summary: string | null;
	scope: KnowledgeScope;
	is_self: boolean;
	image_url: string | null;
}

/** One entry in a merge preview: what folding it into another would carry over. */
export interface KnowledgeMergePreviewEntry extends KnowledgeEntitySummary {
	created_at: string;
	created_via: string;
	circle: string | null;
	/** Your own private entry (only those can be folded away; a shared one can only be kept). */
	mergeable: boolean;
	facts: number;
	/** Tasks, docs and other records it's attached to. */
	links: number;
	/** Highlighted names in your tasks and docs. */
	mentions: number;
	/** Short lines that tell it apart: job, LinkedIn, phone, email, place. */
	details: string[];
}

/** What tells one entry from another in the duplicates review (KnowledgeStore.describeForReview). */
export interface KnowledgeReviewAbout {
	summary: string | null;
	created_at: string;
	created_via: string;
	/** Tasks, docs and other records it's attached to. */
	links: number;
	/** Short lines that tell it apart: job, LinkedIn, phone, email, place. Four at most. */
	details: string[];
}

/** What changing an entry's kind did (KnowledgeStore.changeEntityKind). */
export interface KnowledgeKindChange {
	entity_id: string;
	kind: KnowledgeKind;
	previous_kind: KnowledgeKind;
	/** Details that only fit the old kind and were retracted. */
	retracted: number;
	/** Entries of the new kind with the same name: probably the same one, saved twice. */
	same_name: Array<{ id: string; name: string }>;
}

export interface KnowledgeMergePreview {
	entries: KnowledgeMergePreviewEntry[];
	suggested_keep: string | null;
	/** What the entries share and where they differ. */
	evidence: KnowledgeReviewEvidence;
}

/** Your own entries with the same kind and exact name. */
export interface KnowledgeNameTwins {
	kind: KnowledgeKind;
	name: string;
	/** Oldest first. */
	ids: string[];
}

/**
 * Why two (or more) entries might be the same, from what is saved on them: contact details,
 * LinkedIn profile, employer and the tasks and docs they are on. Short phrases that follow
 * "In common:" and "Different:" on screen.
 */
export interface KnowledgeReviewEvidence {
	/** "email maya@example.com", "employer Northwind", "2 tasks & docs". */
	same: string[];
	/** "LinkedIn profiles", "employers (Acme vs Globex)". */
	different: string[];
}

/** One "same one?" question in the duplicates review. */
export interface KnowledgeMergeQuestion {
	id: string;
	/** Why it was asked: "Same last name, similar first name". */
	reason: string;
	score: number;
	a: KnowledgeEntitySummary;
	b: KnowledgeEntitySummary;
	/** The question to show, when an identity check asked it. */
	question: string | null;
	origin: 'name' | 'identity';
	/** The entry that stays when the answer is "Same" (the other folds into it). */
	keep_id: string | null;
	evidence?: KnowledgeReviewEvidence;
}

/** Everything the duplicates review shows (KnowledgeStore.reviewList). */
export interface KnowledgeReviewList {
	candidates: KnowledgeMergeQuestion[];
	twins: Array<KnowledgeNameTwins & { evidence: KnowledgeReviewEvidence }>;
	/** What tells each entry apart, by id. */
	about: Record<string, KnowledgeReviewAbout>;
}

/** A merge that did not happen, and why, in words the user can act on. */
export interface KnowledgeMergeFailure {
	id: string;
	error: string;
}

export interface KnowledgeSourceView {
	id: string;
	type: KnowledgeSourceType;
	url: string | null;
	title: string | null;
	quote: string | null;
	captured_at: string;
	scope: KnowledgeScope;
}

export interface KnowledgeFactView {
	id: string;
	predicate: string;
	label: string;
	/** Display value for properties. */
	value: string | null;
	/** The other entity for relationships (object when outgoing, subject when incoming). */
	entity: KnowledgeEntitySummary | null;
	qualifiers: Record<string, unknown>;
	scope: KnowledgeScope;
	status: KnowledgeFactStatus;
	confidence: number;
	valid_from: string | null;
	valid_to: string | null;
	observed_at: string;
	created_via: KnowledgeCreatedVia;
	run_id: string | null;
	sources: KnowledgeSourceView[];
}

export interface KnowledgeRecordLinkView {
	id: string;
	record_kind: KnowledgeRecordKind;
	record_id: string;
	quote: string | null;
	created_via: KnowledgeCreatedVia;
	created_at: string;
}

export interface KnowledgeRunTargetView {
	run_id: string;
	status: string;
	fields: string[];
	summary: string | null;
	facts_added: number;
	error: string | null;
	created_at: string;
	finished_at: string | null;
}

export interface KnowledgeEntityDetail {
	entity: KnowledgeEntitySummary & {
		status: string;
		created_via: KnowledgeCreatedVia;
		enriched_at: string | null;
		created_at: string;
		updated_at: string;
		/** Own entries: inner = your world, public = just mentioned (tasker 169). */
		circle?: KnowledgeCircle;
		circle_source?: KnowledgeCircleSource | null;
		/** Why a hidden entry is hidden: orphan, not_a_name (the sorter), or null (the user). */
		hidden_reason?: string | null;
	};
	/** Facts where this entity is the subject (properties and outgoing relationships). */
	facts: KnowledgeFactView[];
	/** Relationships pointing at this entity from others. */
	incoming: KnowledgeFactView[];
	incoming_truncated: boolean;
	links: KnowledgeRecordLinkView[];
	enrichment: KnowledgeRunTargetView[];
	/** True when the caller knows this person (self → knows → entity). */
	known_by_me: boolean;
}

export interface KnowledgeListOptions {
	kinds?: KnowledgeKind[];
	/** all = my graph; known = people I know; owned = things I own. */
	filter?: 'all' | 'known' | 'owned';
	query?: string;
	limit?: number;
	offset?: number;
	/** yes = researched by this user (Find more finished, or enriched_at on their entry). */
	researched?: KnowledgeResearchedFilter;
	/**
	 * recent = last updated (default); name = A–Z; researched = last researched first;
	 * connected = latest LinkedIn connection first; projects / tasks / documents = how many of
	 * each name the entry, most first (needs migration 20261122004500).
	 */
	sort?: KnowledgeListSort;
	/** Flips the sort. Left out, each sort keeps its usual direction (knowledgeSortDefaultDir). */
	dir?: KnowledgeSortDir;
	/**
	 * all = everything active (default); world = what matters to the user (no places, no "just
	 * mentioned" names unless searching); reference = "just mentioned"; dropped = hidden by the
	 * sorter as not a name.
	 */
	view?: KnowledgeListView;
	/** Only entries located in this place (a place entity id). */
	place?: string;
}

export type KnowledgeListView = 'all' | 'world' | 'reference' | 'dropped';

export type KnowledgeResearchedFilter = 'any' | 'yes' | 'no';
export type KnowledgeListSort =
	| 'recent'
	| 'name'
	| 'researched'
	| 'connected'
	| 'projects'
	| 'tasks'
	| 'documents';
export type KnowledgeSortDir = 'asc' | 'desc';

export const KNOWLEDGE_LIST_SORTS: readonly KnowledgeListSort[] = [
	'recent',
	'name',
	'researched',
	'connected',
	'projects',
	'tasks',
	'documents'
];

/** Names read A–Z; every other sort leads with the newest or the most. */
export function knowledgeSortDefaultDir(sort: KnowledgeListSort): KnowledgeSortDir {
	return sort === 'name' ? 'asc' : 'desc';
}

export interface KnowledgeListResult {
	entities: Array<
		KnowledgeEntitySummary & {
			updated_at: string;
			researched_at?: string | null;
			/** The viewer's own entries only: inner = your world, public = just mentioned. */
			circle?: KnowledgeCircle | null;
		}
	>;
	total: number;
	counts: Partial<Record<KnowledgeKind, number>>;
	/** Researched / not researched among the current kind and filter. */
	researched?: { yes: number; no: number };
	/** How many people the user knows, whatever the filters. */
	known_count: number;
	/** Whole-graph totals per view (after migration 20261118400000). */
	views?: { world: number; reference: number; dropped: number };
	/** Places the user's people and orgs are in, most first: the place filter's choices. */
	places?: Array<{ id: string; name: string; count: number }>;
}

export interface KnowledgeQueryStep {
	predicate: string;
	/** out: subject → object (Sam works_at → Palantir). in: object ← subject (Palantir ← people). */
	direction?: 'out' | 'in';
	kinds?: KnowledgeKind[];
}

export interface KnowledgeQuerySpec {
	start: {
		entity_ids?: string[];
		search?: string;
		kinds?: KnowledgeKind[];
		known_by_me?: boolean;
		owned_by_me?: boolean;
	};
	/** Up to two hops. */
	follow?: KnowledgeQueryStep[];
	/** Keep only results the caller knows (people) or owns (things). */
	where?: { known_by_me?: boolean; owned_by_me?: boolean };
	/** Property predicates to return for each result. */
	fields?: string[];
	limit?: number;
}

export interface KnowledgeQueryPathStep {
	predicate: string;
	direction: 'out' | 'in';
	entity: KnowledgeEntitySummary;
	qualifiers: Record<string, unknown>;
}

export interface KnowledgeQueryRow {
	entity: KnowledgeEntitySummary;
	/** How this row was reached from the start entity (empty when it is a start entity). */
	path: KnowledgeQueryPathStep[];
	fields: Record<
		string,
		Array<{
			value: string;
			qualifiers: Record<string, unknown>;
			status: KnowledgeFactStatus;
			source_count: number;
		}>
	>;
}

export interface KnowledgeQueryResult {
	rows: KnowledgeQueryRow[];
	/** Per requested field: how many rows have at least one value, and how many have none. */
	coverage: Record<string, { known: number; missing: number }>;
	start_count: number;
	truncated: boolean;
	notes: string[];
}
