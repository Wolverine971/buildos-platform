// apps/web/src/lib/components/knowledge/knowledge-client.ts
// Browser-side calls and display helpers for the /knowledge page (tasker 160).

import type {
	KnowledgeEntityDetail,
	KnowledgeEntitySummary,
	KnowledgeFactView,
	KnowledgeKind,
	KnowledgeListResult,
	KnowledgeMergePreviewEntry
} from '@buildos/shared-agent-ops/knowledge';
import {
	KNOWLEDGE_KIND_DEFINITIONS,
	type ContactFileSummary,
	type ParsedContactFile
} from '@buildos/shared-agent-ops/knowledge';
import { requireApiData } from '$lib/utils/api-client-helpers';
import type { ResearchTrayPayload } from './research-tray';
import type { EntityShares } from './sharing-types';
import {
	BookUser,
	Building,
	CalendarDays,
	Globe,
	Hash,
	MapPin,
	Package,
	User,
	Video,
	Youtube
} from '$lib/icons/lucide';

export type {
	KnowledgeEntityDetail,
	KnowledgeEntitySummary,
	KnowledgeFactView,
	KnowledgeKind,
	KnowledgeListResult
};
export type KnowledgeMergeEntry = KnowledgeMergePreviewEntry;
export { MERGE_MAX } from '@buildos/shared-agent-ops/knowledge';

export interface KnowledgeLinkedRecord {
	id: string;
	record_kind: 'task' | 'document' | 'project' | 'goal' | 'chat_session';
	record_id: string;
	title: string;
	project_id: string | null;
	project_name: string | null;
	state: string | null;
	href: string | null;
	quote: string | null;
}

export type KnowledgeEntityPayload = KnowledgeEntityDetail & {
	records: KnowledgeLinkedRecord[];
	/** Your own entry in shared projects: who sees it, asks and grants (tasker 168). */
	sharing?: EntityShares | null;
};

export interface KnowledgeRun {
	id: string;
	run_type: 'import' | 'enrichment' | 'backfill';
	status: 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled';
	title: string;
	stats: Record<string, number>;
	error: string | null;
	cost_usd: number;
	created_at: string;
	finished_at: string | null;
}

export interface ImportSummary extends ContactFileSummary {
	preview?: boolean;
	run_id?: string;
	people_created?: number;
	people_matched?: number;
	orgs?: number;
	org_ids?: string[];
	facts_added?: number;
	possible_duplicates?: number;
}

export const KIND_ORDER: KnowledgeKind[] = [
	'person',
	'org',
	'website',
	'channel',
	'video',
	'topic',
	'product',
	'place',
	'event'
];

export const KIND_LABEL = Object.fromEntries(
	Object.values(KNOWLEDGE_KIND_DEFINITIONS).map((d) => [
		d.key,
		{ one: d.label, many: d.pluralLabel }
	])
) as Record<KnowledgeKind, { one: string; many: string }>;

export const KIND_ICON = {
	person: User,
	org: Building,
	website: Globe,
	channel: Youtube,
	video: Video,
	place: MapPin,
	topic: Hash,
	product: Package,
	event: CalendarDays
} as const;

export const KNOWN_ICON = BookUser;

/** Predicates shown as contact rows (with Call / Email / Open actions). */
export const CONTACT_PREDICATES = ['email', 'phone', 'homepage', 'url', 'profile_url', 'address'];
/** Predicates shown as plain details. */
export const DETAIL_PREDICATES = [
	'headline',
	'description',
	'industry',
	'founded',
	'published_at',
	'duration_seconds',
	'connected_on',
	'birthday',
	'alias'
];

async function call<T>(input: string, init?: RequestInit): Promise<T> {
	return requireApiData<T>(await fetch(input, init));
}

const json = (body: unknown): RequestInit => ({
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(body)
});

export const knowledgeApi = {
	list(params: {
		kind?: KnowledgeKind | null;
		filter?: string;
		q?: string;
		researched?: 'any' | 'yes' | 'no';
		sort?: 'recent' | 'name' | 'researched' | 'connected';
		view?: 'all' | 'world' | 'reference' | 'dropped';
		place?: string | null;
		limit?: number;
		offset?: number;
	}) {
		const search = new URLSearchParams();
		if (params.kind) search.set('kind', params.kind);
		if (params.filter) search.set('filter', params.filter);
		if (params.q) search.set('q', params.q);
		if (params.researched && params.researched !== 'any')
			search.set('researched', params.researched);
		if (params.sort && params.sort !== 'recent') search.set('sort', params.sort);
		if (params.view && params.view !== 'all') search.set('view', params.view);
		if (params.place) search.set('place', params.place);
		search.set('limit', String(params.limit ?? 60));
		if (params.offset) search.set('offset', String(params.offset));
		return call<KnowledgeListResult>(`/api/knowledge/entities?${search}`);
	},
	get(id: string) {
		return call<KnowledgeEntityPayload>(`/api/knowledge/entities/${id}`);
	},
	create(body: {
		kind: KnowledgeKind;
		name: string;
		summary?: string;
		know?: boolean;
		own?: boolean;
		facts?: unknown[];
	}) {
		return call<{ entity_id: string; matched: string }>(`/api/knowledge/entities`, json(body));
	},
	update(
		id: string,
		body: {
			name?: string;
			summary?: string | null;
			status?: 'active' | 'hidden';
			circle?: 'inner' | 'public';
		}
	) {
		return call<{ ok: true }>(`/api/knowledge/entities/${id}`, {
			...json(body),
			method: 'PATCH'
		});
	},
	remove(id: string) {
		return call<{ ok: true }>(`/api/knowledge/entities/${id}`, { method: 'DELETE' });
	},
	addFacts(
		id: string,
		facts: Array<{
			predicate: string;
			value?: string;
			object_id?: string;
			object_new?: { kind: KnowledgeKind; name: string };
			qualifiers?: Record<string, unknown>;
		}>
	) {
		return call<{ facts: { added: number; existing: number } }>(
			`/api/knowledge/entities/${id}/facts`,
			json({ facts })
		);
	},
	setFactStatus(id: string, status: 'active' | 'retracted' | 'disputed') {
		return call<{ ok: true }>(`/api/knowledge/facts/${id}`, {
			...json({ status }),
			method: 'PATCH'
		});
	},
	deleteFact(id: string) {
		return call<{ ok: true }>(`/api/knowledge/facts/${id}`, { method: 'DELETE' });
	},
	addYouTube(urls: string[], own: boolean) {
		return call<{
			videos: Array<{ id: string; name: string; new: boolean }>;
			channels: number;
			not_found: number;
			skipped: number;
		}>(`/api/knowledge/youtube`, json({ urls, own }));
	},
	enrich(body: {
		entity_ids: string[];
		fields?: string[];
		instructions?: string;
		entry_instructions?: Record<string, string>;
	}) {
		return call<{
			runs: Array<{ runId: string; budget_usd: number; targets: number }>;
			queued: number;
			budget_usd: number;
			skipped: Array<{ entity_id: string; reason: string }>;
			not_queued: string[];
			refused: string | null;
		}>(`/api/knowledge/enrich`, json(body));
	},
	research() {
		return call<ResearchTrayPayload>(`/api/knowledge/research`);
	},
	cancelResearch(target: { target_id: string } | { run_id: string }) {
		return call<{ cancelled: number }>(`/api/knowledge/research/cancel`, json(target));
	},
	run(id: string) {
		return call<{
			run: KnowledgeRun;
			targets: Array<{
				entity_id: string;
				status: string;
				facts_added: number;
				summary: string | null;
				error: string | null;
			}>;
		}>(`/api/knowledge/runs?id=${id}`);
	},
	runs(limit = 10) {
		return call<{ runs: KnowledgeRun[] }>(`/api/knowledge/runs?limit=${limit}`);
	},
	/**
	 * Import contacts the browser already parsed. Only the contacts go up, gzipped: a phone
	 * export's photos never leave the device and big files stay under the upload limit.
	 */
	async importContacts(parsed: ParsedContactFile, fileName: string) {
		const json = new Blob([JSON.stringify(parsed)], { type: 'application/json' });
		const gzipped = await new Response(
			json.stream().pipeThrough(new CompressionStream('gzip'))
		).blob();
		const form = new FormData();
		form.set('contacts', gzipped, 'contacts.json.gz');
		form.set('file_name', fileName.slice(0, 200));
		return call<ImportSummary>(`/api/knowledge/import`, { method: 'POST', body: form });
	},
	mergeCandidates() {
		return call<{
			candidates: Array<{
				id: string;
				reason: string;
				a: KnowledgeEntitySummary;
				b: KnowledgeEntitySummary;
				/** Set when an identity check asked ("Is Jev, your friend, the same person as…?"). */
				question?: string | null;
				origin?: 'name' | 'identity';
				/** The entry the user already had: kept when they answer "Same". */
				keep_id?: string | null;
			}>;
			/** Your own entries with the same kind and exact name, oldest first. */
			twins?: Array<{ kind: KnowledgeKind; name: string; ids: string[] }>;
		}>(`/api/knowledge/merge`);
	},
	merge(keep: string, merge: string) {
		return call<Record<string, unknown>>(`/api/knowledge/merge`, json({ keep, merge }));
	},
	/** What folding these entries together would move, and which one to keep. */
	mergePreview(ids: string[]) {
		return call<{ entries: KnowledgeMergeEntry[]; suggested_keep: string | null }>(
			`/api/knowledge/merge?ids=${ids.map(encodeURIComponent).join(',')}`
		);
	},
	mergeMany(keep: string, merge: string[]) {
		return call<{
			kept: string;
			merged: string[];
			failed: Array<{ id: string; error: string }>;
		}>(`/api/knowledge/merge`, json({ keep, merge }));
	},
	/** "Not this one": retract a research run's details and remember what the entry is not. */
	rejectResearch(entityId: string, runId: string) {
		return call<{ retracted: number; hidden: number; hint: { label: string } | null }>(
			`/api/knowledge/entities/${entityId}/not-this-one`,
			json({ run_id: runId })
		);
	},
	/** "Different people" for a same-name group. */
	markDifferent(entityIds: string[]) {
		return call<{ ok: true }>(`/api/knowledge/merge`, {
			...json({ entity_ids: entityIds }),
			method: 'PATCH'
		});
	},
	rejectCandidate(candidateId: string) {
		return call<{ ok: true }>(`/api/knowledge/merge`, {
			...json({ candidate_id: candidateId }),
			method: 'PATCH'
		});
	}
};

/**
 * Keep acknowledged batches when retrying a large LinkedIn export. Each request fits the
 * import endpoint's write batch and returns the distinct org IDs that batch touched.
 */
export function prepareContactImport(
	parsed: ParsedContactFile,
	fileName: string,
	summary: ContactFileSummary
) {
	const batchSize = 1_500;
	let offset = 0;
	const orgIds = new Set<string>();
	const totals = { people_created: 0, people_matched: 0, possible_duplicates: 0, facts_added: 0 };
	return async (onProgress: (saved: number) => void): Promise<ImportSummary> => {
		if (parsed.format !== 'linkedin_csv' || parsed.contacts.length <= batchSize) {
			return knowledgeApi.importContacts(parsed, fileName);
		}
		while (offset < parsed.contacts.length) {
			const contacts = parsed.contacts.slice(offset, offset + batchSize);
			const batch = await knowledgeApi.importContacts(
				{
					format: parsed.format,
					contacts,
					skipped: offset === 0 ? parsed.skipped : 0
				},
				fileName
			);
			totals.people_created += batch.people_created ?? 0;
			totals.people_matched += batch.people_matched ?? 0;
			totals.possible_duplicates += batch.possible_duplicates ?? 0;
			totals.facts_added += batch.facts_added ?? 0;
			for (const id of batch.org_ids ?? []) orgIds.add(id);
			offset += contacts.length;
			onProgress(offset);
		}
		return { ...summary, ...totals, orgs: orgIds.size };
	};
}

export function contactHref(predicate: string, value: string): string | null {
	if (predicate === 'email') return `mailto:${value}`;
	if (predicate === 'phone') return `tel:${value}`;
	if (predicate === 'address')
		return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`;
	if (/^https?:\/\//i.test(value)) return value;
	return null;
}

export function contactAction(predicate: string): string {
	if (predicate === 'email') return 'Email';
	if (predicate === 'phone') return 'Call';
	if (predicate === 'address') return 'Map';
	return 'Open';
}

/** "+14105550101" → "(410) 555-0101"; other numbers unchanged. */
export function displayPhone(value: string): string {
	const us = value.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
	return us ? `(${us[1]}) ${us[2]}-${us[3]}` : value;
}

export function displayUrl(value: string): string {
	return value.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export function displayValue(fact: KnowledgeFactView): string {
	const value = fact.value ?? '';
	if (fact.predicate === 'phone') return displayPhone(value);
	if (['homepage', 'url', 'profile_url', 'thumbnail_url'].includes(fact.predicate))
		return displayUrl(value);
	if (fact.predicate === 'duration_seconds') {
		const total = Number(value);
		if (Number.isFinite(total)) {
			const m = Math.floor(total / 60);
			const s = Math.round(total % 60);
			return m >= 60
				? `${Math.floor(m / 60)}h ${m % 60}m`
				: `${m}:${String(s).padStart(2, '0')}`;
		}
	}
	if (fact.predicate === 'birthday' && value.startsWith('--')) {
		const [, month, day] = value.match(/^--(\d{2})-(\d{2})$/) ?? [];
		if (month && day) {
			return new Date(2000, Number(month) - 1, Number(day)).toLocaleDateString(undefined, {
				month: 'long',
				day: 'numeric'
			});
		}
	}
	return value;
}

/** Short text for qualifiers worth showing: a job title, how you know someone, a label. */
export function qualifierNote(fact: KnowledgeFactView): string | null {
	const q = fact.qualifiers ?? {};
	const parts: string[] = [];
	if (typeof q.title === 'string') parts.push(q.title);
	if (typeof q.label === 'string') parts.push(q.label);
	if (typeof q.platform === 'string') parts.push(q.platform);
	if (typeof q.role === 'string') parts.push(q.role);
	if (q.current === false || fact.valid_to) parts.push('past');
	return parts.length ? parts.join(' · ') : null;
}

export function knownVia(fact: KnowledgeFactView): string {
	const q = fact.qualifiers ?? {};
	const via = typeof q.via === 'string' ? q.via : null;
	const since = typeof q.since === 'string' ? q.since : null;
	const how =
		via === 'linkedin'
			? 'Connected on LinkedIn'
			: via === 'phone'
				? 'In your phone contacts'
				: via === 'client'
					? 'A client'
					: via
						? `Via ${via}`
						: 'You know them';
	if (!since) return how;
	const date = new Date(`${since}T00:00:00`);
	return Number.isNaN(date.getTime())
		? how
		: `${how} since ${date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
}

/** Which predicates a person can add by hand for this kind (value predicates first). */
export function addablePredicates(
	kind: KnowledgeKind
): Array<{ key: string; label: string; entity: KnowledgeKind[] | null }> {
	const all: Array<{
		key: string;
		label: string;
		kinds: KnowledgeKind[];
		entity: KnowledgeKind[] | null;
	}> = [
		{ key: 'email', label: 'Email', kinds: ['person', 'org'], entity: null },
		{ key: 'phone', label: 'Phone', kinds: ['person', 'org', 'place'], entity: null },
		{ key: 'homepage', label: 'Website', kinds: ['person', 'org'], entity: null },
		{
			key: 'url',
			label: 'Link',
			kinds: ['website', 'channel', 'video', 'product', 'event'],
			entity: null
		},
		{ key: 'profile_url', label: 'Profile link', kinds: ['person', 'org'], entity: null },
		{ key: 'headline', label: 'Headline', kinds: ['person'], entity: null },
		{
			key: 'description',
			label: 'Description',
			kinds: ['org', 'website', 'channel', 'video', 'place', 'topic', 'product', 'event'],
			entity: null
		},
		{ key: 'address', label: 'Address', kinds: ['person', 'org', 'place'], entity: null },
		{ key: 'alias', label: 'Also known as', kinds: KIND_ORDER, entity: null },
		{ key: 'note', label: 'Note', kinds: KIND_ORDER, entity: null },
		{ key: 'works_at', label: 'Works at', kinds: ['person'], entity: ['org'] },
		{
			key: 'owns',
			label: 'Owns',
			kinds: ['person', 'org'],
			entity: ['website', 'channel', 'video', 'product', 'org']
		},
		{ key: 'published_by', label: 'Published by', kinds: ['video'], entity: ['channel'] },
		{
			key: 'features',
			label: 'Features',
			kinds: ['video', 'channel'],
			entity: ['person', 'org', 'product', 'topic']
		},
		{
			key: 'about',
			label: 'About',
			kinds: ['video', 'channel', 'website', 'product', 'event', 'org'],
			entity: ['topic']
		},
		{
			key: 'located_in',
			label: 'Located in',
			kinds: ['person', 'org', 'event', 'website'],
			entity: ['place']
		},
		{ key: 'part_of', label: 'Part of', kinds: ['org', 'place'], entity: ['org', 'place'] },
		{ key: 'knows', label: 'Knows', kinds: ['person'], entity: ['person'] }
	];
	return all
		.filter((p) => p.kinds.includes(kind))
		.map(({ key, label, entity }) => ({ key, label, entity }));
}
