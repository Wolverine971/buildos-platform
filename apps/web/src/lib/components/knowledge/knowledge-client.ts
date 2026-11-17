// apps/web/src/lib/components/knowledge/knowledge-client.ts
// Browser-side calls and display helpers for the /knowledge page (tasker 160).

import type {
	KnowledgeEntityDetail,
	KnowledgeEntitySummary,
	KnowledgeFactView,
	KnowledgeKind,
	KnowledgeListResult
} from '@buildos/shared-agent-ops/knowledge';
import { KNOWLEDGE_KIND_DEFINITIONS } from '@buildos/shared-agent-ops/knowledge';
import { requireApiData } from '$lib/utils/api-client-helpers';
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

export type KnowledgeEntityPayload = KnowledgeEntityDetail & { records: KnowledgeLinkedRecord[] };

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

export interface ImportSummary {
	preview?: boolean;
	run_id?: string;
	format_label: string;
	contacts: number;
	skipped: number;
	with_email: number;
	with_phone: number;
	with_company: number;
	capped: boolean;
	sample: Array<{ name: string; detail: string | null }>;
	people_created?: number;
	people_matched?: number;
	orgs?: number;
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
		limit?: number;
		offset?: number;
	}) {
		const search = new URLSearchParams();
		if (params.kind) search.set('kind', params.kind);
		if (params.filter) search.set('filter', params.filter);
		if (params.q) search.set('q', params.q);
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
		body: { name?: string; summary?: string | null; status?: 'active' | 'hidden' }
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
	enrich(entityIds: string[], fields?: string[]) {
		return call<{ runId: string; targets: unknown[]; budget_usd: number }>(
			`/api/knowledge/enrich`,
			json({ entity_ids: entityIds, ...(fields?.length ? { fields } : {}) })
		);
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
	importFile(file: File, preview: boolean) {
		const form = new FormData();
		form.set('file', file);
		if (preview) form.set('preview', '1');
		return call<ImportSummary>(`/api/knowledge/import`, { method: 'POST', body: form });
	},
	mergeCandidates() {
		return call<{
			candidates: Array<{
				id: string;
				reason: string;
				a: KnowledgeEntitySummary;
				b: KnowledgeEntitySummary;
			}>;
		}>(`/api/knowledge/merge`);
	},
	merge(keep: string, merge: string) {
		return call<Record<string, unknown>>(`/api/knowledge/merge`, json({ keep, merge }));
	},
	rejectCandidate(candidateId: string) {
		return call<{ ok: true }>(`/api/knowledge/merge`, {
			...json({ candidate_id: candidateId }),
			method: 'PATCH'
		});
	}
};

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
