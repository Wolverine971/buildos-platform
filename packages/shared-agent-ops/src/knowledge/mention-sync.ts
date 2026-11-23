// packages/shared-agent-ops/src/knowledge/mention-sync.ts
//
// Keeps one record's mentions (knowledge_mentions) and links (knowledge_record_links) in step
// with its text after every save (tasker 167). The readers call this after reading a task or
// document; the backfill calls it for every record DJ already has. No model and no search calls.
//
//   moved            offsets follow the text
//   edited in place  a spelling fix or rename: when the old entry was made by a reader only and
//                    the new name is a spelling of it, the old entry folds into the new one
//                    (merge; the old name stays as an alias). Otherwise a "same person?" question.
//   deleted          the tag goes; a reader-made link with no mention left and not in the new
//                    reading goes; an entry a reader made that has no link left and nothing the
//                    user added is hidden (reversible, revived when the name shows up again)
//   user-removed     a tag the user removed stays removed at that spot
//   widened          a reader tag on part of a longer name the owner has an entry for
//                    ("Strategies" inside "Wayne Strategies") grows to that name and entry; an
//                    entry whose every tag was absorbed loses its reader-made link
//
// Similar names (spelling variants) that end up as separate entries become one "same person?"
// question per pair, against one entry per group, never repeated once answered.
//
// Service-role callers: every query filters by owner here; RLS protects signed-in callers.
// `dryRun` reads everything and writes nothing; the report says what would have happened.

import { normalizeKnowledgeName } from './normalize';
import type { KnowledgeDataClient, KnowledgeCreatedVia } from './types';
import { KnowledgeStore } from './knowledge-store';
import {
	anchorFromQuote,
	findNameSpans,
	nameRelation,
	nameTokens,
	planRecordMentions,
	type MentionAnchor,
	type MentionDraft,
	type MentionFields,
	type MentionField,
	type MentionReaderName,
	type MentionRecordKind,
	type NameRelation,
	type StoredMention
} from './mentions';

export const MENTION_READER_VERSION = 1;

/** Entries and links a reader made (not the user, an import, chat or research). */
export const READER_VIA = new Set<string>(['task', 'backfill', 'system']);

const PEOPLE_AND_ORGS = new Set(['person', 'org']);
const ID_CHUNK = 150;

export interface MentionRecordRef {
	kind: MentionRecordKind;
	id: string;
	title: string;
	projectId: string | null;
}

export interface SyncRecordMentionsInput {
	record: MentionRecordRef;
	fields: MentionFields;
	/** Names the reader found this time, already filed (entry ids). */
	reader: MentionReaderName[];
	/**
	 * The reader read the whole text (tasks: the model reads title + description), so a
	 * reader-made link to a name it no longer reports goes. Documents keep a link while any
	 * mention is left or the reader still reports the name.
	 */
	readerComplete: boolean;
}

export interface MentionSyncOptions {
	via: Extract<KnowledgeCreatedVia, 'task' | 'backfill' | 'system'>;
	dryRun?: boolean;
	/** Ask "same person?" for similar names that end up as separate entries (default true). */
	askSimilar?: boolean;
	/**
	 * Record the read in knowledge_mention_reads (default true). Signed-in callers pass false:
	 * that table is written by the server's readers only, and skipping it just means the next
	 * scheduled read doesn't skip this record.
	 */
	rememberRead?: boolean;
}

type EntityInfo = {
	id: string;
	kind: string;
	name: string;
	status: string;
	created_via: string;
	is_self: boolean;
	enriched_at: string | null;
	circle?: string | null;
	circle_source?: string | null;
	merged_into_id: string | null;
};

export interface MentionCorrectionResult {
	from: { id: string; name: string };
	to: { id: string | null; name: string; created: boolean };
	action: 'fold' | 'ask' | 'retag';
	relation: NameRelation;
	why: string;
	question?: string;
}

export interface SimilarNameQuestion {
	keep: { id: string; name: string };
	other: { id: string; name: string };
	relation: NameRelation;
	why: string;
	question: string;
	/** A question for this pair already exists (pending, merged or answered "different"). */
	alreadyAsked?: string;
}

export interface MentionSyncReport {
	record: MentionRecordRef;
	counts: {
		same: number;
		moved: number;
		edited: number;
		deleted: number;
		added: number;
		widened: number;
	};
	mentions: Array<{
		entityId: string | null;
		name: string;
		text: string;
		field: MentionField;
		start: number;
		end: number;
		status: string;
	}>;
	corrections: MentionCorrectionResult[];
	deleted: Array<{ entityId: string; name: string; text: string }>;
	linksAdded: Array<{ entityId: string; name: string }>;
	linksRemoved: Array<{ entityId: string; name: string }>;
	hidden: Array<{ entityId: string; name: string }>;
	questions: SimilarNameQuestion[];
	dryRun: boolean;
}

// ---------------------------------------------------------------------------
// Small helpers

function chunk<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

async function inChunks<T>(ids: string[], run: (group: string[]) => Promise<T[]>): Promise<T[]> {
	const out: T[] = [];
	for (const group of chunk([...new Set(ids)], ID_CHUNK)) out.push(...(await run(group)));
	return out;
}

function fail(context: string, error: { message?: string } | null | undefined): never {
	throw new Error(`${context}: ${error?.message ?? 'unknown error'}`);
}

/** A short, stable, non-cryptographic hash (cyrb53) for "has this field changed". */
export function mentionTextHash(text: string): string {
	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;
	for (let i = 0; i < text.length; i++) {
		const ch = text.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** One hash over every field (the record's "content hash" for the skip check). */
export function mentionFieldsHash(fields: MentionFields): string {
	return mentionTextHash(
		(['title', 'description', 'content'] as MentionField[])
			.map((field) => `${field}:${fields[field] ?? ''}`)
			.join('\u001f')
	);
}

const ENTITY_SELECT =
	'id, kind, name, status, created_via, is_self, enriched_at, merged_into_id, circle, circle_source';

async function loadEntities(
	db: KnowledgeDataClient,
	userId: string,
	ids: string[]
): Promise<Map<string, EntityInfo>> {
	const rows = await inChunks(ids, async (group) => {
		let res = await db
			.from('knowledge_entities')
			.select(ENTITY_SELECT)
			.in('id', group)
			.eq('owner_user_id', userId);
		// Before the circles migration: no circle columns.
		if (res.error && res.error.code === '42703')
			res = await db
				.from('knowledge_entities')
				.select('id, kind, name, status, created_via, is_self, enriched_at, merged_into_id')
				.in('id', group)
				.eq('owner_user_id', userId);
		if (res.error) fail('Load entries', res.error);
		return (res.data ?? []) as EntityInfo[];
	});
	return new Map(rows.map((row) => [row.id, row]));
}

/** Follow merges to the entry a merged one lives on as (at most a few hops). */
async function resolveMerged(
	db: KnowledgeDataClient,
	userId: string,
	entities: Map<string, EntityInfo>
): Promise<Map<string, string>> {
	const target = new Map<string, string>();
	let pending = [...entities.values()].filter((e) => e.status === 'merged' && e.merged_into_id);
	for (let hop = 0; hop < 4 && pending.length; hop++) {
		const missing = pending.map((e) => e.merged_into_id!).filter((id) => !entities.has(id));
		if (missing.length)
			for (const [id, row] of await loadEntities(db, userId, missing)) entities.set(id, row);
		const next: EntityInfo[] = [];
		for (const e of pending) {
			const to = entities.get(e.merged_into_id!);
			if (!to) continue;
			if (to.status === 'merged' && to.merged_into_id)
				next.push({ ...e, merged_into_id: to.merged_into_id });
			else target.set(e.id, to.id);
		}
		pending = next;
	}
	return target;
}

async function aliasesFor(
	db: KnowledgeDataClient,
	userId: string,
	ids: string[]
): Promise<Map<string, string[]>> {
	const rows = await inChunks(ids, async (group) => {
		const { data, error } = await db
			.from('knowledge_facts')
			.select('entity_id, value_text')
			.in('entity_id', group)
			.eq('owner_user_id', userId)
			.eq('predicate', 'alias')
			.in('status', ['active']);
		if (error) fail('Load aliases', error);
		return (data ?? []) as Array<{ entity_id: string; value_text: string | null }>;
	});
	const out = new Map<string, string[]>();
	for (const row of rows) {
		if (!row.value_text?.trim()) continue;
		out.set(row.entity_id, [...(out.get(row.entity_id) ?? []), row.value_text.trim()]);
	}
	return out;
}

/** Entries the user invested in (facts from themselves, an import, chat, MCP or research). */
async function entriesWithUserFacts(
	db: KnowledgeDataClient,
	userId: string,
	ids: string[]
): Promise<Set<string>> {
	const rows = await inChunks(ids, async (group) => {
		const { data, error } = await db
			.from('knowledge_facts')
			.select('entity_id, created_via')
			.in('entity_id', group)
			.eq('owner_user_id', userId);
		if (error) fail('Load facts', error);
		return (data ?? []) as Array<{ entity_id: string; created_via: string }>;
	});
	return new Set(rows.filter((r) => !READER_VIA.has(r.created_via)).map((r) => r.entity_id));
}

function readerOnly(entity: EntityInfo, invested: Set<string>): boolean {
	return (
		READER_VIA.has(entity.created_via) &&
		!entity.is_self &&
		!entity.enriched_at &&
		entity.circle_source !== 'user' &&
		!invested.has(entity.id)
	);
}

/**
 * Which field an old quote came from: the one holding its surrounding words (a quote is cut
 * from one field), else the one holding the name, else the longest.
 */
function seedField(fields: MentionFields, anchor: MentionAnchor): MentionField | null {
	const fold = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
	const entries = (Object.keys(fields) as MentionField[]).filter((f) => (fields[f] ?? '').trim());
	if (!entries.length) return null;
	const keys = [fold(anchor.prefix).slice(-12), fold(anchor.suffix).slice(0, 12)].filter(
		(k) => k.length >= 5
	);
	const folded = new Map(entries.map((f) => [f, fold(fields[f]!)]));
	const byContext = entries.filter((f) => keys.some((k) => folded.get(f)!.includes(k)));
	if (byContext.length === 1) return byContext[0]!;
	const byName = (byContext.length ? byContext : entries).filter(
		(f) => findNameSpans(fields[f]!, anchor.text).length > 0
	);
	if (byName.length === 1) return byName[0]!;
	const pool = byName.length ? byName : byContext.length ? byContext : entries;
	return pool.sort((a, b) => (fields[b] ?? '').length - (fields[a] ?? '').length)[0]!;
}

export function sameEntryQuestion(kind: string, a: string, b: string): string {
	const noun = kind === 'person' ? 'person' : kind === 'org' ? 'organization' : 'one';
	return `Is ${a} the same ${noun} as ${b}?`.slice(0, 300);
}

function quoteFor(fields: MentionFields, draft: MentionDraft): string {
	return (
		`${draft.prefix}${draft.text}${draft.suffix}`.replace(/\s+/g, ' ').trim().slice(0, 1000) ||
		(fields[draft.field] ?? '').slice(draft.start_offset, draft.end_offset)
	);
}

// ---------------------------------------------------------------------------
// Reviving orphan-hidden entries

/**
 * Entries hidden only because they lost their last mention come back when a reader sees the
 * name again. Returns the revived ids. Before migration 20261118200000 this is a no-op.
 */
export async function reviveOrphanEntries(
	db: KnowledgeDataClient,
	userId: string,
	names: Array<{ kind: string; name: string }>,
	options: { dryRun?: boolean } = {}
): Promise<string[]> {
	const wanted = names.filter((n) => n.name?.trim());
	if (!wanted.length) return [];
	const keys = new Set(wanted.map((n) => `${n.kind}|${normalizeKnowledgeName(n.name)}`));
	const { data, error } = await db
		.from('knowledge_entities')
		.select('id, kind, normalized_name')
		.eq('owner_user_id', userId)
		.eq('status', 'hidden')
		.eq('hidden_reason', 'orphan')
		.in('normalized_name', [...new Set(wanted.map((n) => normalizeKnowledgeName(n.name)))]);
	if (error) return [];
	const ids = ((data ?? []) as Array<{ id: string; kind: string; normalized_name: string }>)
		.filter((row) => keys.has(`${row.kind}|${row.normalized_name}`))
		.map((row) => row.id);
	if (ids.length && !options.dryRun) {
		const { error: updateError } = await db
			.from('knowledge_entities')
			.update({ status: 'active', hidden_reason: null })
			.in('id', ids)
			.eq('owner_user_id', userId)
			.eq('hidden_reason', 'orphan');
		if (updateError) fail('Revive entries', updateError);
	}
	return ids;
}

// ---------------------------------------------------------------------------
// Fuller names

/** At most this many distinct words-to-complete are looked up per record. */
const MAX_FULLER_LOOKUPS = 40;

/** `needle` appears in `haystack` on word boundaries (both normalized). */
function hasWords(haystack: string, needle: string): boolean {
	const isWord = (c: string | undefined) => Boolean(c) && /[\p{L}\p{N}]/u.test(c!);
	for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
		if (!isWord(haystack[at - 1]) && !isWord(haystack[at + needle.length])) return true;
	}
	return false;
}

/**
 * The owner's active people and organizations whose name contains one of `texts` as whole words
 * and is longer ("Wayne Strategies" for "Strategies"), and that appears in the record's text.
 * One query. Matching is on stored names only; nothing reads the prose's meaning.
 */
export async function loadFullerNames(
	db: KnowledgeDataClient,
	userId: string,
	fields: MentionFields,
	texts: string[]
): Promise<Array<{ entityId: string; info: EntityInfo }>> {
	const parts = [
		...new Set(
			texts
				.map((t) => normalizeKnowledgeName(t))
				.filter((t) => t.replace(/[^\p{L}\p{N}]/gu, '').length >= 2)
		)
	].slice(0, MAX_FULLER_LOOKUPS);
	if (!parts.length) return [];
	// Quoted PostgREST values; `*` is the wildcard, so a literal one in a name is dropped.
	const contains = (part: string) => `"*${part.replace(/[*]/g, '').replace(/["\\]/g, '\\$&')}*"`;
	const { data, error } = await db
		.from('knowledge_entities')
		.select(ENTITY_SELECT.replace(', circle, circle_source', ''))
		.eq('owner_user_id', userId)
		.eq('status', 'active')
		.in('kind', ['person', 'org'])
		.or(parts.map((p) => `normalized_name.ilike.${contains(p)}`).join(','))
		.limit(200);
	if (error) return [];
	const all = Object.values(fields)
		.map((t) => normalizeKnowledgeName(t ?? ''))
		.join('\n');
	return ((data ?? []) as EntityInfo[])
		.filter((row) => {
			const name = normalizeKnowledgeName(row.name);
			return (
				parts.some((p) => name.length > p.length && hasWords(name, p)) && all.includes(name)
			);
		})
		.map((info) => ({ entityId: info.id, info }));
}

// ---------------------------------------------------------------------------
// The sync

export async function syncRecordMentions(
	db: KnowledgeDataClient,
	userId: string,
	input: SyncRecordMentionsInput,
	options: MentionSyncOptions
): Promise<MentionSyncReport> {
	const dryRun = Boolean(options.dryRun);
	const { record } = input;
	const report: MentionSyncReport = {
		record,
		counts: { same: 0, moved: 0, edited: 0, deleted: 0, added: 0, widened: 0 },
		mentions: [],
		corrections: [],
		deleted: [],
		linksAdded: [],
		linksRemoved: [],
		hidden: [],
		questions: [],
		dryRun
	};

	// 1. What's there: this owner's mentions and links on the record.
	const [mentionRes, linkRes] = await Promise.all([
		db
			.from('knowledge_mentions')
			.select(
				'id, entity_id, field, start_offset, end_offset, text, prefix, suffix, made_by, status'
			)
			.eq('owner_user_id', userId)
			.eq('record_kind', record.kind)
			.eq('record_id', record.id),
		db
			.from('knowledge_record_links')
			.select('entity_id, quote, created_via')
			.eq('owner_user_id', userId)
			.eq('record_kind', record.kind)
			.eq('record_id', record.id)
	]);
	if (mentionRes.error) fail('Load mentions', mentionRes.error);
	if (linkRes.error) fail('Load links', linkRes.error);
	const existing = (mentionRes.data ?? []) as StoredMention[];
	const links = (linkRes.data ?? []) as Array<{
		entity_id: string;
		quote: string | null;
		created_via: string;
	}>;

	const entities = await loadEntities(db, userId, [
		...existing.map((m) => m.entity_id),
		...links.map((l) => l.entity_id),
		...input.reader.map((r) => r.entityId)
	]);
	const mergedTo = await resolveMerged(db, userId, entities);
	const live = (id: string) => mergedTo.get(id) ?? id;
	const entity = (id: string) => entities.get(live(id));
	const aliases = await aliasesFor(db, userId, [...entities.keys()]);
	const namesOf = (id: string, extra: string[] = []) => {
		const e = entity(id);
		return [...extra, ...(e ? [e.name] : []), ...(aliases.get(live(id)) ?? [])];
	};

	// Reader names, with each entry's own name and aliases as extra spellings.
	const reader: MentionReaderName[] = [];
	const readerIds = new Set<string>();
	for (const r of input.reader) {
		const id = live(r.entityId);
		const e = entities.get(id);
		if (!e || e.status !== 'active') continue;
		readerIds.add(id);
		reader.push({ entityId: id, kind: e.kind, names: namesOf(id, r.names) });
	}
	// Linked entries the reader didn't report: their names are tagged wherever they appear.
	const linked: MentionReaderName[] = [];
	for (const link of links) {
		const id = live(link.entity_id);
		const e = entities.get(id);
		if (!e || e.status !== 'active' || !PEOPLE_AND_ORGS.has(e.kind) || readerIds.has(id))
			continue;
		if (linked.some((l) => l.entityId === id)) continue;
		linked.push({ entityId: id, kind: e.kind, names: namesOf(id) });
	}
	// First anchoring of this record: recover where names were from the links' quotes.
	const seeds: Array<{ entityId: string; anchor: MentionAnchor }> = [];
	if (!existing.length) {
		for (const link of links) {
			const e = entities.get(link.entity_id);
			if (!e || !link.quote || !PEOPLE_AND_ORGS.has(e.kind) || e.status === 'hidden')
				continue;
			const anchor = anchorFromQuote(link.quote, e.name, 'content');
			if (!anchor) continue;
			const field = seedField(input.fields, anchor);
			if (field) seeds.push({ entityId: link.entity_id, anchor: { ...anchor, field } });
		}
	}
	// Fuller names the owner already has around words tagged here ("Wayne Strategies" around a
	// tag on "Strategies"), so a tag the reader cut short grows to the whole name.
	const fuller = await loadFullerNames(db, userId, input.fields, [
		...existing
			.filter((m) => m.status === 'active' && m.made_by === 'reader')
			.map((m) => m.text),
		...reader.flatMap((r) => r.names),
		...linked.flatMap((l) => l.names)
	]);
	for (const f of fuller) if (!entities.has(f.entityId)) entities.set(f.entityId, f.info);
	const kinds = new Map([...entities.values()].map((e) => [e.id, e.kind]));

	const plan = planRecordMentions({
		fields: input.fields,
		existing: existing.map((m) => ({ ...m, entity_id: live(m.entity_id) })),
		seeds: seeds.map((s) => ({ ...s, entityId: live(s.entityId) })),
		reader,
		linked,
		fuller: fuller.map((f) => ({
			entityId: f.entityId,
			kind: f.info.kind,
			names: [f.info.name]
		})),
		kinds
	});
	report.counts = plan.counts;

	// 2. Corrections: fold a reader-made spelling into the corrected name, or ask.
	const store = new KnowledgeStore(db, userId);
	const oldIds = plan.corrections.map((c) => c.oldEntityId);
	const invested = await entriesWithUserFacts(db, userId, oldIds);
	const retag = new Map<string, string>(); // pending name key → entry id
	const folded = new Map<string, string>(); // old entry → new entry
	for (const correction of plan.corrections) {
		const old = entities.get(correction.oldEntityId);
		if (!old) continue;
		let newId = correction.newEntityId;
		let created = false;
		const key = `${old.kind}|${normalizeKnowledgeName(correction.to)}`;
		if (!newId) newId = retag.get(key) ?? null;
		if (!newId) {
			const lookup = (columns: string) =>
				db
					.from('knowledge_entities')
					.select(columns)
					.eq('owner_user_id', userId)
					.eq('kind', old.kind)
					.eq('normalized_name', normalizeKnowledgeName(correction.to))
					.in('status', ['active', 'hidden']);
			let found = await lookup('id, status, hidden_reason');
			// Before migration 20261118200000: no hidden_reason column.
			if (found.error?.code === '42703') found = await lookup('id, status');
			if (found.error) fail('Look up the corrected name', found.error);
			const rows = (found.data ?? []) as Array<{
				id: string;
				status: string;
				hidden_reason?: string | null;
			}>;
			const usable = rows.filter(
				(r) => r.status === 'active' || r.hidden_reason === 'orphan'
			);
			if (usable.length === 1) {
				newId = usable[0]!.id;
				if (usable[0]!.status === 'hidden' && !dryRun)
					await reviveOrphanEntries(db, userId, [
						{ kind: old.kind, name: correction.to }
					]);
			} else if (rows.some((r) => r.status === 'hidden' && r.hidden_reason !== 'orphan')) {
				// The user hid that name ("not a thing"): don't file it; the tag just goes.
				report.deleted.push({ entityId: old.id, name: old.name, text: correction.from });
				continue;
			} else if (!dryRun) {
				newId = await store.createEntry({
					kind: old.kind as 'person' | 'org',
					name: correction.to,
					via: options.via
				});
				created = true;
			} else {
				created = true;
			}
			if (newId) retag.set(key, newId);
		}
		const newEntity = newId ? entities.get(newId) : undefined;
		if (newId && !newEntity) {
			for (const [id, row] of await loadEntities(db, userId, [newId])) entities.set(id, row);
		}
		const newName = newId ? (entities.get(newId)?.name ?? correction.to) : correction.to;
		const strong = correction.relation === 'same' || correction.relation === 'spelling';
		const result: MentionCorrectionResult = {
			from: { id: old.id, name: old.name },
			to: { id: newId, name: newName, created },
			action: 'ask',
			relation: correction.relation,
			why: ''
		};
		if (newId === old.id) {
			result.action = 'retag';
			result.why = 'same entry';
		} else if (folded.get(old.id) === newId) {
			result.action = 'fold';
			result.why = 'already folded in this read';
		} else if (strong && readerOnly(old, invested)) {
			result.action = 'fold';
			result.why = `“${correction.from}” was corrected to “${correction.to}”; the old entry was only read from your work`;
			if (!dryRun && newId) await store.merge(newId, old.id);
			if (newId) folded.set(old.id, newId);
		} else {
			result.action = 'ask';
			result.question = sameEntryQuestion(old.kind, old.name, newName);
			result.why = strong
				? `“${correction.from}” was corrected to “${correction.to}”, but you added details to ${old.name} yourself`
				: `“${correction.from}” became “${correction.to}”: similar, not clearly a spelling fix`;
			if (!dryRun && newId) {
				await store.addMergeCandidate(newId, old.id, {
					reason: `Name changed in “${record.title.slice(0, 120)}”`,
					question: result.question,
					origin: 'name',
					score: strong ? 0.8 : 0.5
				});
			}
		}
		report.corrections.push(result);
		// The edited place now carries the new entry.
		for (const draft of plan.mentions) {
			if (
				draft.pending_name &&
				normalizeKnowledgeName(draft.pending_name) === normalizeKnowledgeName(correction.to)
			)
				draft.entity_id = newId;
		}
	}
	// Mentions of a folded entry now belong to the entry it folded into.
	for (const draft of plan.mentions) {
		if (draft.entity_id && folded.has(draft.entity_id))
			draft.entity_id = folded.get(draft.entity_id)!;
	}

	// 3. Write the record's mentions (replace the set; ids kept for re-anchored rows).
	const fieldHash = new Map(
		(Object.keys(input.fields) as MentionField[]).map((f) => [
			f,
			mentionTextHash(input.fields[f] ?? '')
		])
	);
	const rows = plan.mentions
		.filter((m) => m.entity_id || dryRun)
		.map((m) => ({
			...(m.id ? { id: m.id } : {}),
			owner_user_id: userId,
			entity_id: m.entity_id,
			record_kind: record.kind,
			record_id: record.id,
			field: m.field,
			start_offset: m.start_offset,
			end_offset: m.end_offset,
			text: m.text,
			prefix: m.prefix,
			suffix: m.suffix,
			content_hash: fieldHash.get(m.field) ?? null,
			made_by: m.made_by,
			status: m.status
		}));
	const present = new Set(
		plan.mentions.filter((m) => m.status === 'active' && m.entity_id).map((m) => m.entity_id!)
	);
	for (const m of plan.mentions) {
		const id = m.entity_id;
		report.mentions.push({
			entityId: id,
			name: id
				? (entities.get(id)?.name ?? m.pending_name ?? m.text)
				: (m.pending_name ?? m.text),
			text: m.text,
			field: m.field,
			start: m.start_offset,
			end: m.end_offset,
			status: m.status
		});
	}
	for (const d of plan.deleted) {
		if (report.deleted.some((x) => x.entityId === d.entityId && x.text === d.text)) continue;
		report.deleted.push({
			entityId: d.entityId,
			name: entity(d.entityId)?.name ?? d.text,
			text: d.text
		});
	}
	if (!dryRun) {
		// Replace the record's tags without a window where a failed write leaves it with none:
		// write the new rows first, then delete the old ones by id. If a write fails, the old
		// tags stay (the record keeps its highlights) and the next re-read tries again.
		const { data: oldRows, error: oldError } = await db
			.from('knowledge_mentions')
			.select('id')
			.eq('owner_user_id', userId)
			.eq('record_kind', record.kind)
			.eq('record_id', record.id);
		if (oldError) fail('Load mentions', oldError);
		const oldIds = ((oldRows ?? []) as Array<{ id: string }>).map((r) => r.id);
		// Re-anchored tags keep their row (updated in place); new tags are inserted without an
		// id. The two go in separate calls: a batch mixing rows with and without `id` sends
		// null ids, and inserting a kept id again collides with the row still there.
		const oldIdSet = new Set(oldIds);
		const kept = rows.filter((r) => 'id' in r && oldIdSet.has(r.id as string));
		const added = rows
			.filter((r) => !('id' in r && oldIdSet.has(r.id as string)))
			.map(({ id: _id, ...row }: Record<string, unknown>) => row);
		const keptIds = new Set(kept.map((r) => r.id as string));
		// New rows first: they can be undone, an in-place update can't, so a failure at either
		// step leaves the record's old tags as they were.
		const insertedIds: string[] = [];
		try {
			for (const group of chunk(added, 500)) {
				const { data, error } = await db
					.from('knowledge_mentions')
					.insert(group)
					.select('id');
				if (error) fail('Save mentions', error);
				insertedIds.push(...((data ?? []) as Array<{ id: string }>).map((r) => r.id));
			}
			for (const group of chunk(kept, 500)) {
				const { error } = await db
					.from('knowledge_mentions')
					.upsert(group, { onConflict: 'id' })
					.select('id');
				if (error) fail('Save mentions', error);
			}
		} catch (error) {
			// Undo new rows so the record doesn't end up with old + half of the new tags.
			for (const group of chunk(insertedIds, 500)) {
				await db.from('knowledge_mentions').delete().in('id', group);
			}
			throw error;
		}
		for (const group of chunk(
			oldIds.filter((id) => !keptIds.has(id)),
			500
		)) {
			const { error: deleteError } = await db
				.from('knowledge_mentions')
				.delete()
				.in('id', group);
			if (deleteError) fail('Clear old mentions', deleteError);
		}
	}

	// 4. Links: every tagged entry is linked; reader-made links with nothing left go.
	const linkedIds = new Set(links.map((l) => live(l.entity_id)));
	const toLink = [...present].filter((id) => !linkedIds.has(id));
	for (const id of toLink)
		report.linksAdded.push({ entityId: id, name: entities.get(id)?.name ?? id });
	if (!dryRun && toLink.length) {
		const firstMention = (id: string) =>
			plan.mentions.find((m) => m.entity_id === id && m.status === 'active')!;
		await store.record(
			{
				entities: [],
				facts: [],
				links: toLink.map((id) => ({
					entity: id,
					record_kind: record.kind,
					record_id: record.id,
					quote: quoteFor(input.fields, firstMention(id))
				}))
			},
			{ via: options.via }
		);
	}
	const hadMention = new Set([
		...existing.filter((m) => m.status === 'active').map((m) => live(m.entity_id)),
		...plan.deleted.map((d) => d.entityId),
		...plan.corrections.map((c) => c.oldEntityId)
	]);
	const removable = links.filter((link) => {
		const id = live(link.entity_id);
		if (!READER_VIA.has(link.created_via) || present.has(id)) return false;
		if (plan.removedByUser.has(id)) return true;
		// Every tag sat inside a fuller name: the reader only ever saw part of that name.
		if (plan.absorbed.has(id)) return true;
		if (readerIds.has(id)) return false;
		// A folded entry's link moved with the merge.
		if (folded.has(link.entity_id)) return false;
		return input.readerComplete || hadMention.has(id) || hadMention.has(link.entity_id);
	});
	for (const link of removable) {
		report.linksRemoved.push({
			entityId: link.entity_id,
			name: entity(link.entity_id)?.name ?? link.entity_id
		});
	}
	if (!dryRun && removable.length) {
		const { error } = await db
			.from('knowledge_record_links')
			.delete()
			.eq('owner_user_id', userId)
			.eq('record_kind', record.kind)
			.eq('record_id', record.id)
			.in(
				'entity_id',
				removable.map((l) => l.entity_id)
			);
		if (error) fail('Remove links', error);
	}

	// 5. Orphans: reader-made entries with no link left anywhere are hidden (reversible).
	const lost = [...new Set(removable.map((l) => live(l.entity_id)))].filter(
		(id) => !folded.has(id)
	);
	if (lost.length) {
		const investedLost = await entriesWithUserFacts(db, userId, lost);
		const stillLinked = new Set(
			(
				await inChunks(lost, async (group) => {
					const { data, error } = await db
						.from('knowledge_record_links')
						.select('entity_id, record_kind, record_id')
						.eq('owner_user_id', userId)
						.in('entity_id', group);
					if (error) fail('Check links', error);
					return (data ?? []) as Array<{
						entity_id: string;
						record_kind: string;
						record_id: string;
					}>;
				})
			)
				// In a dry run the links above are still there.
				.filter(
					(l) => !(dryRun && l.record_kind === record.kind && l.record_id === record.id)
				)
				.map((l) => l.entity_id)
		);
		const orphans = lost.filter((id) => {
			const e = entities.get(id);
			return (
				e && e.status === 'active' && !stillLinked.has(id) && readerOnly(e, investedLost)
			);
		});
		for (const id of orphans)
			report.hidden.push({ entityId: id, name: entities.get(id)!.name });
		if (!dryRun && orphans.length) {
			const { error } = await db
				.from('knowledge_entities')
				.update({ status: 'hidden', hidden_reason: 'orphan' })
				.in('id', orphans)
				.eq('owner_user_id', userId)
				.eq('status', 'active');
			if (error) fail('Hide orphans', error);
		}
	}

	// 6. Similar names for entries newly tagged here.
	if (options.askSimilar !== false) {
		const before = new Set(
			existing.filter((m) => m.status === 'active').map((m) => live(m.entity_id))
		);
		const fresh = [...present].filter(
			(id) => !before.has(id) && entities.get(id)?.kind === 'person'
		);
		const foldTargets = [...folded.values()];
		const focus = [...new Set([...fresh, ...foldTargets])];
		if (focus.length) {
			report.questions = await askSimilarNames(db, userId, {
				focus,
				dryRun,
				// A fold from this read already settled that pair; in a dry run the folded entry
				// still exists, so leave it out.
				skipPairs: [...folded].map(([a, b]) => [a, b] as [string, string]),
				exclude: dryRun ? [...folded.keys()] : []
			});
		}
	}

	// 7. Remember what was anchored.
	if (!dryRun && options.rememberRead !== false) {
		const { error } = await db.from('knowledge_mention_reads').upsert(
			{
				owner_user_id: userId,
				record_kind: record.kind,
				record_id: record.id,
				content_hash: mentionFieldsHash(input.fields),
				reader_version: MENTION_READER_VERSION,
				read_at: new Date().toISOString()
			},
			{ onConflict: 'owner_user_id,record_kind,record_id' }
		);
		if (error) fail('Save read', error);
	}
	return report;
}

// ---------------------------------------------------------------------------
// Similar names → "same person?" questions

interface PersonRow {
	id: string;
	name: string;
	circle: string | null;
	created_via: string;
}

/**
 * Spelling variants of one person filed as separate entries become questions. Rules:
 *   - two full names whose spelling is close ("Phil Velayo" / "Phillip Velayo") → always ask;
 *   - two full names that only might be the same ("Phil Vallejo" / "Phil Velayo") → ask when
 *     they share a project or an organization, or either is someone you know (inner circle);
 *   - a one-word name ("Phil") → ask only when every full name it could be that shares a project
 *     with it is the same group of variants.
 * Variants form groups; each member is asked about the group's fullest name, once. Pairs that
 * were already asked (pending, merged or answered "different") are never asked again.
 */
export async function askSimilarNames(
	db: KnowledgeDataClient,
	userId: string,
	options: {
		focus?: string[];
		dryRun?: boolean;
		skipPairs?: Array<[string, string]>;
		/** Entries treated as gone (folded away in a dry run). */
		exclude?: string[];
	} = {}
): Promise<SimilarNameQuestion[]> {
	const people: PersonRow[] = [];
	for (let from = 0; ; from += 1000) {
		let res = await db
			.from('knowledge_entities')
			.select('id, name, circle, created_via')
			.eq('owner_user_id', userId)
			.eq('kind', 'person')
			.eq('status', 'active')
			.eq('is_self', false)
			.range(from, from + 999);
		if (res.error && res.error.code === '42703')
			res = await db
				.from('knowledge_entities')
				.select('id, name, created_via')
				.eq('owner_user_id', userId)
				.eq('kind', 'person')
				.eq('status', 'active')
				.eq('is_self', false)
				.range(from, from + 999);
		if (res.error) fail('Load people', res.error);
		people.push(...((res.data ?? []) as PersonRow[]));
		if ((res.data ?? []).length < 1000) break;
	}
	const excluded = new Set(options.exclude ?? []);
	if (excluded.size)
		people.splice(0, people.length, ...people.filter((p) => !excluded.has(p.id)));
	const focus = options.focus ? new Set(options.focus) : null;
	const skip = new Set((options.skipPairs ?? []).map(([a, b]) => [a, b].sort().join('|')));
	const byId = new Map(people.map((p) => [p.id, p]));
	const multi = people.filter((p) => p.name.trim().includes(' '));
	const single = people.filter((p) => !p.name.trim().includes(' '));

	// Candidate pairs by spelling only (cheap), before loading any links.
	type Pair = { a: PersonRow; b: PersonRow; relation: NameRelation; score: number };
	const pairs: Pair[] = [];
	for (let i = 0; i < multi.length; i++) {
		for (let j = i + 1; j < multi.length; j++) {
			const { relation, score } = nameRelation('person', multi[i]!.name, multi[j]!.name);
			if (relation === 'spelling' || relation === 'possible' || relation === 'same')
				pairs.push({ a: multi[i]!, b: multi[j]!, relation, score });
		}
	}
	const shorts: Pair[] = [];
	for (const s of single) {
		for (const m of multi) {
			const { relation, score } = nameRelation('person', s.name, m.name);
			if (relation === 'short') shorts.push({ a: s, b: m, relation, score });
		}
	}
	if (!pairs.length && !shorts.length) return [];

	// Shared projects and organizations for the entries involved.
	const involved = [...new Set([...pairs, ...shorts].flatMap((p) => [p.a.id, p.b.id]))];
	const links = await inChunks(involved, async (group) => {
		const { data, error } = await db
			.from('knowledge_record_links')
			.select('entity_id, record_kind, record_id')
			.eq('owner_user_id', userId)
			.in('entity_id', group);
		if (error) fail('Load links', error);
		return (data ?? []) as Array<{ entity_id: string; record_kind: string; record_id: string }>;
	});
	const projectOf = new Map<string, string>();
	for (const [kind, table] of [
		['task', 'onto_tasks'],
		['document', 'onto_documents']
	] as const) {
		const ids = links.filter((l) => l.record_kind === kind).map((l) => l.record_id);
		const rows = await inChunks(ids, async (group) => {
			const { data, error } = await db.from(table).select('id, project_id').in('id', group);
			if (error) fail('Load records', error);
			return (data ?? []) as Array<{ id: string; project_id: string | null }>;
		});
		for (const row of rows) if (row.project_id) projectOf.set(row.id, row.project_id);
	}
	const projects = new Map<string, Set<string>>();
	const linkCount = new Map<string, number>();
	for (const link of links) {
		linkCount.set(link.entity_id, (linkCount.get(link.entity_id) ?? 0) + 1);
		const project = projectOf.get(link.record_id);
		if (!project) continue;
		const set = projects.get(link.entity_id) ?? new Set<string>();
		set.add(project);
		projects.set(link.entity_id, set);
	}
	const orgFacts = await inChunks(involved, async (group) => {
		const { data, error } = await db
			.from('knowledge_facts')
			.select('entity_id, object_entity_id')
			.eq('owner_user_id', userId)
			.eq('predicate', 'works_at')
			.in('entity_id', group)
			.in('status', ['active', 'suggested']);
		if (error) fail('Load employers', error);
		return (data ?? []) as Array<{ entity_id: string; object_entity_id: string | null }>;
	});
	const orgs = new Map<string, Set<string>>();
	for (const f of orgFacts) {
		if (!f.object_entity_id) continue;
		orgs.set(f.entity_id, (orgs.get(f.entity_id) ?? new Set()).add(f.object_entity_id));
	}
	const shares = (a: string, b: string, map: Map<string, Set<string>>) => {
		const x = map.get(a);
		const y = map.get(b);
		return Boolean(x && y && [...x].some((v) => y.has(v)));
	};
	const why = (pair: Pair): string | null => {
		const project = shares(pair.a.id, pair.b.id, projects);
		const org = shares(pair.a.id, pair.b.id, orgs);
		if (pair.relation === 'same' || pair.relation === 'spelling')
			return project ? 'Similar spelling, same project' : 'Similar spelling';
		if (project) return 'Similar names in the same project';
		if (org) return 'Similar names at the same organization';
		// Only with the same first name ("Phil Vallejo" / "Phil Velayo", not "Steve Baker" /
		// "Steven Bartlett").
		const sameFirst = nameTokens(pair.a.name)[0] === nameTokens(pair.b.name)[0];
		if (sameFirst && (pair.a.circle === 'inner' || pair.b.circle === 'inner'))
			return 'Similar names, someone you know';
		return null;
	};

	// Groups of variants (union-find over qualifying pairs).
	const parent = new Map<string, string>();
	const root = (id: string): string => {
		let at = id;
		while (parent.has(at) && parent.get(at) !== at) at = parent.get(at)!;
		return at;
	};
	const reasons = new Map<string, string>();
	for (const pair of pairs) {
		const reason = why(pair);
		if (!reason) continue;
		reasons.set([pair.a.id, pair.b.id].sort().join('|'), reason);
		const ra = root(pair.a.id);
		const rb = root(pair.b.id);
		parent.set(ra, ra);
		parent.set(rb, rb);
		if (ra !== rb) parent.set(rb, ra);
	}
	const groups = new Map<string, PersonRow[]>();
	for (const id of parent.keys()) {
		const r = root(id);
		groups.set(r, [...(groups.get(r) ?? []), byId.get(id)!]);
	}
	// The fullest name leads its group: longest first name, then most links, then longest name.
	const hubOf = new Map<string, PersonRow>();
	for (const [r, members] of groups) {
		const sorted = [...members].sort(
			(x, y) =>
				(y.name.split(/\s+/)[0]?.length ?? 0) - (x.name.split(/\s+/)[0]?.length ?? 0) ||
				(linkCount.get(y.id) ?? 0) - (linkCount.get(x.id) ?? 0) ||
				y.name.length - x.name.length
		);
		hubOf.set(r, sorted[0]!);
	}

	const proposed: Array<{
		keep: PersonRow;
		other: PersonRow;
		relation: NameRelation;
		why: string;
	}> = [];
	for (const [r, members] of groups) {
		const hub = hubOf.get(r)!;
		for (const member of members) {
			if (member.id === hub.id) continue;
			const rel = nameRelation('person', member.name, hub.name);
			const key = [member.id, hub.id].sort().join('|');
			proposed.push({
				keep: hub,
				other: member,
				relation: rel.relation === 'none' ? 'possible' : rel.relation,
				why: reasons.get(key) ?? 'Similar names in a group of spellings'
			});
		}
	}
	for (const s of single) {
		const options = shorts.filter((p) => p.a.id === s.id && shares(s.id, p.b.id, projects));
		if (!options.length) continue;
		const roots = new Set(options.map((p) => (parent.has(p.b.id) ? root(p.b.id) : p.b.id)));
		if (roots.size !== 1) continue;
		const only = [...roots][0]!;
		const hub = hubOf.get(only) ?? byId.get(only)!;
		proposed.push({
			keep: hub,
			other: s,
			relation: 'short',
			why: `One-word name in the same project as ${hub.name}`
		});
	}

	const wanted = proposed.filter(
		(p) =>
			(!focus || focus.has(p.keep.id) || focus.has(p.other.id)) &&
			!skip.has([p.keep.id, p.other.id].sort().join('|'))
	);
	if (!wanted.length) return [];

	// Already asked (any status) → never again.
	const asked = new Map<string, string>();
	const askedRows = await inChunks(
		[...new Set(wanted.flatMap((p) => [p.keep.id, p.other.id]))],
		async (group) => {
			const read = (column: 'entity_a' | 'entity_b') =>
				db
					.from('knowledge_merge_candidates')
					.select('entity_a, entity_b, status')
					.eq('owner_user_id', userId)
					.in(column, group);
			const [a, b] = await Promise.all([read('entity_a'), read('entity_b')]);
			if (a.error) fail('Load questions', a.error);
			if (b.error) fail('Load questions', b.error);
			return [...(a.data ?? []), ...(b.data ?? [])] as Array<{
				entity_a: string;
				entity_b: string;
				status: string;
			}>;
		}
	);
	for (const row of askedRows)
		asked.set([row.entity_a, row.entity_b].sort().join('|'), row.status);

	const store = new KnowledgeStore(db, userId);
	const out: SimilarNameQuestion[] = [];
	for (const p of wanted) {
		const question = sameEntryQuestion('person', p.other.name, p.keep.name);
		const status = asked.get([p.keep.id, p.other.id].sort().join('|'));
		const item: SimilarNameQuestion = {
			keep: { id: p.keep.id, name: p.keep.name },
			other: { id: p.other.id, name: p.other.name },
			relation: p.relation,
			why: p.why,
			question,
			...(status ? { alreadyAsked: status } : {})
		};
		out.push(item);
		if (status || options.dryRun) continue;
		await store.addMergeCandidate(p.keep.id, p.other.id, {
			reason: p.why,
			question,
			origin: 'name',
			score: p.relation === 'spelling' || p.relation === 'same' ? 0.8 : 0.5
		});
	}
	return out;
}

// ---------------------------------------------------------------------------
// The user's own tag actions

/**
 * "Remove tag" on one spot (status removed, remembered there: a re-read never re-tags it), or
 * Undo (active again). When the spot was the entry's last tag in the record, its link goes with
 * it (and comes back on Undo). The entry itself is never hidden here: the card has Hide for that.
 */
export async function setMentionTagStatus(
	db: KnowledgeDataClient,
	userId: string,
	mentionId: string,
	status: 'removed' | 'active'
): Promise<{
	entityId: string;
	recordKind: MentionRecordKind;
	recordId: string;
	linkRemoved: boolean;
	linkAdded: boolean;
}> {
	const { data, error } = await db
		.from('knowledge_mentions')
		.update({ status, made_by: 'user', updated_at: new Date().toISOString() })
		.eq('id', mentionId)
		.eq('owner_user_id', userId)
		.select('id, entity_id, record_kind, record_id, text, prefix, suffix');
	if (error) fail('Update tag', error);
	const row = (data ?? [])[0] as
		| {
				entity_id: string;
				record_kind: MentionRecordKind;
				record_id: string;
				text: string;
				prefix: string;
				suffix: string;
		  }
		| undefined;
	if (!row) throw new Error('Tag not found');
	const result = {
		entityId: row.entity_id,
		recordKind: row.record_kind,
		recordId: row.record_id,
		linkRemoved: false,
		linkAdded: false
	};
	const { data: others, error: othersError } = await db
		.from('knowledge_mentions')
		.select('id')
		.eq('owner_user_id', userId)
		.eq('entity_id', row.entity_id)
		.eq('record_kind', row.record_kind)
		.eq('record_id', row.record_id)
		.eq('status', 'active');
	if (othersError) fail('Count tags', othersError);
	const activeLeft = (others ?? []).length;
	if (status === 'removed' && activeLeft === 0) {
		const { data: removed, error: linkError } = await db
			.from('knowledge_record_links')
			.delete()
			.eq('owner_user_id', userId)
			.eq('entity_id', row.entity_id)
			.eq('record_kind', row.record_kind)
			.eq('record_id', row.record_id)
			.select('id');
		if (linkError) fail('Remove link', linkError);
		result.linkRemoved = (removed ?? []).length > 0;
	}
	if (status === 'active') {
		const { data: added, error: linkError } = await db
			.from('knowledge_record_links')
			.upsert(
				{
					entity_id: row.entity_id,
					owner_user_id: userId,
					record_kind: row.record_kind,
					record_id: row.record_id,
					quote: `${row.prefix}${row.text}${row.suffix}`
						.replace(/\s+/g, ' ')
						.trim()
						.slice(0, 1000),
					created_via: 'manual'
				},
				{
					onConflict: 'entity_id,owner_user_id,record_kind,record_id',
					ignoreDuplicates: true
				}
			)
			.select('id');
		if (linkError) fail('Restore link', linkError);
		result.linkAdded = (added ?? []).length > 0;
	}
	return result;
}
