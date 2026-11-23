// apps/web/src/lib/components/knowledge/knowledge-client.ts
// Browser-side calls and display helpers for the /knowledge page (tasker 160).

import type {
	KnowledgeEntityDetail,
	KnowledgeEntitySummary,
	KnowledgeFactView,
	KnowledgeKind,
	KnowledgeKindChange,
	KnowledgeListResult,
	KnowledgeListSort,
	KnowledgeMergePreview,
	KnowledgeMergePreviewEntry,
	KnowledgeMergeQuestion,
	KnowledgeReviewAbout,
	KnowledgeReviewEvidence,
	KnowledgeReviewList,
	KnowledgeSimilarPerson,
	KnowledgeSimilarSweep,
	KnowledgeSortDir
} from '@buildos/shared-agent-ops/knowledge';
import {
	KNOWLEDGE_KIND_DEFINITIONS,
	KNOWLEDGE_KINDS,
	knowledgeSortDefaultDir,
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
	KnowledgeListResult,
	KnowledgeListSort,
	KnowledgeSortDir
};
export { knowledgeSortDefaultDir };
export type KnowledgeMergeEntry = KnowledgeMergePreviewEntry;
export type {
	KnowledgeMergeQuestion,
	KnowledgeReviewAbout,
	KnowledgeReviewEvidence,
	KnowledgeReviewList,
	KnowledgeSimilarPerson,
	KnowledgeSimilarSweep
};

/** Where an entry came from, in the user's words. */
const ADDED_VIA: Record<string, string> = {
	import: 'your contacts',
	chat: 'a chat',
	mcp: 'an agent',
	enrichment: 'research',
	task: 'your tasks',
	backfill: 'your tasks',
	system: 'your docs',
	manual: 'you'
};

/** "Added Nov 22 from your contacts" (`withYear`: "Added Nov 22, 2026 from your contacts"). */
export function knowledgeAddedLine(
	createdAt: string,
	createdVia: string,
	withYear = false
): string {
	const date = new Date(createdAt).toLocaleDateString(undefined, {
		month: 'short',
		day: 'numeric',
		...(withYear ? { year: 'numeric' } : {})
	});
	const via = ADDED_VIA[createdVia];
	return via ? `Added ${date} from ${via}` : `Added ${date}`;
}
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

/** An entry opened up in the duplicates review. */
export type KnowledgeReviewDetail = KnowledgeEntityDetail & {
	records: KnowledgeLinkedRecord[];
	/** Where each detail came from, by fact id: "Imported LinkedIn connections". */
	origins: Record<string, string>;
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
	/** Job details that differ from what was already on record: saved as suggestions. */
	facts_suggested?: number;
	possible_duplicates?: number;
	/** This import can be taken back with Undo. */
	undoable?: boolean;
}

/** A preview's answer to "how does this file line up with who I already have?" */
export interface ImportMatchPreview {
	/** Contacts that land on a person already here. */
	will_match: number;
	will_create: number;
	/** "Same person?" questions the import will raise. */
	to_review: number;
	review_examples: Array<{ contact: string; existing: string; reason: string }>;
}

export interface RecentImport {
	id: string;
	title: string;
	file_name: string | null;
	created_at: string;
	contacts: number;
	people_created: number;
	undone: boolean;
	can_undo: boolean;
}

export interface ImportUndoReceipt {
	run_id: string;
	people_removed: number;
	orgs_removed: number;
	details_removed: number;
	/** Entries left in place because they were used after the import. */
	kept: number;
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

/** Every kind, in vocabulary order (the "what is this?" menu on a card). */
export const KIND_OPTIONS: readonly KnowledgeKind[] = KNOWLEDGE_KINDS;

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

/** Parsed contacts as the import endpoint takes them: gzipped JSON, never the raw file. */
async function contactUpload(parsed: ParsedContactFile, fileName: string): Promise<FormData> {
	const blob = new Blob([JSON.stringify(parsed)], { type: 'application/json' });
	const gzipped = await new Response(
		blob.stream().pipeThrough(new CompressionStream('gzip'))
	).blob();
	const form = new FormData();
	form.set('contacts', gzipped, 'contacts.json.gz');
	form.set('file_name', fileName.slice(0, 200));
	return form;
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
		sort?: KnowledgeListSort;
		dir?: KnowledgeSortDir;
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
		if (params.dir && params.dir !== knowledgeSortDefaultDir(params.sort ?? 'recent'))
			search.set('dir', params.dir);
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
			/** What the entry is ("organization" → "person"). */
			kind?: KnowledgeKind;
		}
	) {
		return call<{
			ok: true;
			kind_change?: KnowledgeKindChange;
			/** After a rename: tags grown to the new name, and entries that already had it. */
			rename?: {
				widened: number;
				records: number;
				same_name: Array<{ id: string; name: string }>;
			};
		}>(`/api/knowledge/entities/${id}`, {
			...json(body),
			method: 'PATCH'
		});
	},
	remove(id: string) {
		return call<{ ok: true }>(`/api/knowledge/entities/${id}`, { method: 'DELETE' });
	},
	/** "Don't save" on a web search's find: refused for anything already part of your world. */
	discardFound(id: string) {
		return call<{ ok: true }>(`/api/knowledge/entities/${id}?found=1`, { method: 'DELETE' });
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
	async importContacts(parsed: ParsedContactFile, fileName: string, runId?: string) {
		const form = await contactUpload(parsed, fileName);
		// A later batch of a large LinkedIn file joins the import its first batch started.
		if (runId) form.set('run_id', runId);
		return call<ImportSummary>(`/api/knowledge/import`, { method: 'POST', body: form });
	},
	/** How a phone or Google file lines up with who is already here. Saves nothing. */
	async previewContactMatches(parsed: ParsedContactFile, fileName: string) {
		const form = await contactUpload(parsed, fileName);
		form.set('preview', '1');
		return call<ImportSummary & Partial<ImportMatchPreview>>(`/api/knowledge/import`, {
			method: 'POST',
			body: form
		});
	},
	recentImports() {
		return call<{ imports: RecentImport[] }>(`/api/knowledge/import`);
	},
	undoImport(runId: string) {
		return call<ImportUndoReceipt>(
			`/api/knowledge/import?run_id=${encodeURIComponent(runId)}`,
			{ method: 'DELETE' }
		);
	},
	/** The duplicates review: same-name groups, "same one?" questions and what tells them apart. */
	mergeCandidates() {
		return call<KnowledgeReviewList>(`/api/knowledge/merge`);
	},
	/** One entry in full for the review: every detail, where each came from, tasks and docs. */
	reviewDetail(id: string) {
		return call<KnowledgeReviewDetail>(`/api/knowledge/merge?detail=${id}`);
	},
	merge(keep: string, merge: string) {
		return call<Record<string, unknown>>(`/api/knowledge/merge`, json({ keep, merge }));
	},
	/** What folding these entries together would move, and which one to keep. */
	mergePreview(ids: string[]) {
		return call<KnowledgeMergePreview>(
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
	/** "Might also be": people who may be this one under another spelling. */
	similarPeople(entityId: string) {
		return call<{ people: KnowledgeSimilarPerson[] }>(
			`/api/knowledge/entities/${entityId}/similar`
		);
	},
	/** Look through every person for look-alikes and add them to the duplicates review. */
	sweepDuplicates() {
		return call<KnowledgeSimilarSweep>(`/api/knowledge/merge/sweep`, { method: 'POST' });
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
 * import endpoint's write batch and returns the distinct org IDs that batch touched. Every
 * batch after the first joins the first one's import, so one Undo takes back the whole file.
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
	let runId: string | undefined;
	let undoable = false;
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
				fileName,
				runId
			);
			runId ??= batch.run_id;
			undoable = batch.undoable === true;
			totals.people_created += batch.people_created ?? 0;
			totals.people_matched += batch.people_matched ?? 0;
			totals.possible_duplicates += batch.possible_duplicates ?? 0;
			totals.facts_added += batch.facts_added ?? 0;
			for (const id of batch.org_ids ?? []) orgIds.add(id);
			offset += contacts.length;
			onProgress(offset);
		}
		return { ...summary, ...totals, orgs: orgIds.size, run_id: runId, undoable };
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
