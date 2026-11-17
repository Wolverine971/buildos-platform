// packages/shared-agent-ops/src/knowledge/types.ts

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
}

export interface KnowledgeListResult {
	entities: Array<KnowledgeEntitySummary & { updated_at: string }>;
	total: number;
	counts: Partial<Record<KnowledgeKind, number>>;
	/** How many people the user knows, whatever the filters. */
	known_count: number;
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
