// packages/shared-agent-ops/src/knowledge/knowledge-store.ts
//
// One user's view of the knowledge graph. Every read is filtered to public rows plus the
// user's private rows IN CODE, because chat and MCP run with the service-role client where RLS
// does not apply. Every write is private to the user. Database triggers enforce the same
// privacy rules for every writer as a second line.

import type { KnowledgeCircle, KnowledgeCircleSource, KnowledgeResearchHint } from './anchors';
import {
	domainOf,
	isSpecificPersonName,
	KNOWLEDGE_UUID_PATTERN,
	keysForKnowledgeValue,
	normalizeKnowledgeKey,
	normalizeKnowledgeName,
	normalizeKnowledgeValue,
	type KnowledgeKey
} from './normalize';
import {
	checkKnowledgeFactShape,
	getKnowledgePredicate,
	isKnowledgeKind,
	KNOWLEDGE_KIND_DEFINITIONS,
	type KnowledgeKind
} from './vocabulary';
import { knowledgeSortDefaultDir } from './types';
import type {
	KnowledgeCreatedVia,
	KnowledgeDataClient,
	KnowledgeEntityDetail,
	KnowledgeEntityMatch,
	KnowledgeEntitySummary,
	KnowledgeFactStatus,
	KnowledgeFactView,
	KnowledgeKindChange,
	KnowledgeListOptions,
	KnowledgeListResult,
	KnowledgeMergePreview,
	KnowledgeMergePreviewEntry,
	KnowledgeNameTwins,
	KnowledgeQueryPathStep,
	KnowledgeQueryResult,
	KnowledgeQueryRow,
	KnowledgeQuerySpec,
	KnowledgeScope,
	KnowledgeSourceView,
	KnowledgeWriteBatch,
	KnowledgeWriteOptions,
	KnowledgeWriteReceipt
} from './types';

const UUID = KNOWLEDGE_UUID_PATTERN;
/** Stay under PostgREST's 1,000-row default and keep `in (...)` URLs short. */
const PAGE = 500;
const ID_CHUNK = 150;
/** Entries folded into one in a single merge. */
export const MERGE_MAX = 25;
const MAX_BATCH_ENTITIES = 12_000;
const MAX_BATCH_FACTS = 60_000;
const MAX_INCOMING = 200;
const MAX_QUERY_ROWS = 200;
const MAX_FRONTIER = 500;

const ENTITY_COLUMNS =
	'id, kind, name, summary, scope, is_self, image_url, status, merged_into_id, owner_user_id';
const FACT_COLUMNS =
	'id, entity_id, predicate, object_entity_id, value_text, qualifiers, scope, owner_user_id, status, confidence, valid_from, valid_to, observed_at, created_via, run_id';
const VISIBLE_FACT_STATUSES: KnowledgeFactStatus[] = ['active', 'suggested', 'disputed'];
/** Writers a later automated run must not silently override. */
const HUMAN_VIA = new Set<KnowledgeCreatedVia>(['manual', 'import', 'chat', 'mcp']);

export class KnowledgeStoreError extends Error {
	constructor(
		message: string,
		readonly code: 'INVALID' | 'NOT_FOUND' | 'DB' = 'DB',
		readonly cause?: unknown
	) {
		super(message);
		this.name = 'KnowledgeStoreError';
	}
}

interface EntityRow {
	id: string;
	kind: KnowledgeKind;
	name: string;
	summary: string | null;
	scope: KnowledgeScope;
	is_self: boolean;
	image_url: string | null;
	status: string;
	merged_into_id: string | null;
	owner_user_id: string | null;
	/** Present on rows loaded for name matching. */
	created_via?: KnowledgeCreatedVia;
}

interface FactRow {
	id: string;
	entity_id: string;
	predicate: string;
	object_entity_id: string | null;
	value_text: string | null;
	qualifiers: Record<string, unknown> | null;
	scope: KnowledgeScope;
	owner_user_id: string | null;
	status: KnowledgeFactStatus;
	confidence: number;
	valid_from: string | null;
	valid_to: string | null;
	observed_at: string;
	created_via: KnowledgeCreatedVia;
	run_id: string | null;
}

function chunk<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

function unique<T>(items: Iterable<T>): T[] {
	return [...new Set(items)];
}

/** Run a chunked read a few chunks at a time and flatten the results. */
async function mapChunks<T, R>(
	items: T[],
	size: number,
	fn: (group: T[]) => Promise<R[]>,
	width = 4
): Promise<R[]> {
	const groups = chunk(items, size);
	const out: R[] = [];
	for (let i = 0; i < groups.length; i += width) {
		const results = await Promise.all(groups.slice(i, i + width).map(fn));
		for (const rows of results) out.push(...rows);
	}
	return out;
}

/** Identifiers that belong to exactly one entity: two different values mean two entities. */
const STRONG_KEY_TYPES = new Set<KnowledgeKey['type']>([
	'linkedin',
	'youtube_video',
	'youtube_channel',
	'domain'
]);

/**
 * Whether an identity key shared by two names can mean the same holder. Emails and phones are
 * often shared (a family landline, a team inbox), so for people they count only when the first
 * names agree or one side has no real name (a bare email or number).
 */
function sameHolder(kind: string, keyType: string, a: string, b: string): boolean {
	if (kind !== 'person' || (keyType !== 'email' && keyType !== 'phone')) return true;
	const first = (name: string) => normalizeKnowledgeName(name).split(' ')[0] ?? '';
	const nameless = (name: string) => name.includes('@') || !/\p{L}/u.test(name);
	return nameless(a) || nameless(b) || first(a) === first(b);
}

function summarize(row: EntityRow): KnowledgeEntitySummary {
	return {
		id: row.id,
		kind: row.kind,
		name: row.name,
		summary: row.summary,
		scope: row.scope,
		is_self: row.is_self,
		image_url: row.image_url
	};
}

function dbError(context: string, error: unknown): KnowledgeStoreError {
	const message =
		error && typeof error === 'object' && 'message' in error
			? String((error as { message: unknown }).message)
			: String(error);
	return new KnowledgeStoreError(`${context}: ${message}`, 'DB', error);
}

/** Fact identity used for deduplication (mirrors the generated dedupe_key column). */
function factIdentity(
	entityId: string,
	predicate: string,
	objectId: string | null,
	value: string | null
): string {
	return `${entityId}|${predicate}|${objectId ?? (value ?? '').trim().toLowerCase()}`;
}

export class KnowledgeStore {
	private readonly visible: string;

	constructor(
		private readonly db: KnowledgeDataClient,
		readonly userId: string
	) {
		if (!UUID.test(userId)) throw new KnowledgeStoreError('Invalid user id', 'INVALID');
		this.visible = `scope.eq.public,owner_user_id.eq.${userId}`;
	}

	// -------------------------------------------------------------------------
	// Self

	private selfId: string | null = null;

	/** The user's own person entity, created on first use. */
	async ensureSelf(): Promise<string> {
		if (this.selfId) return this.selfId;
		const { data, error } = await this.db
			.from('knowledge_entities')
			.select('id')
			.eq('owner_user_id', this.userId)
			.eq('is_self', true)
			.maybeSingle();
		if (error) throw dbError('Load self', error);
		if (data?.id) {
			this.selfId = data.id as string;
			return this.selfId;
		}
		const { data: user } = await this.db
			.from('users')
			.select('name')
			.eq('id', this.userId)
			.maybeSingle();
		const name = (user?.name as string | null)?.trim() || 'Me';
		const { data: created, error: insertError } = await this.db
			.from('knowledge_entities')
			.insert({
				kind: 'person',
				name,
				scope: 'private',
				owner_user_id: this.userId,
				is_self: true,
				created_via: 'system'
			})
			.select('id')
			.single();
		if (insertError) {
			// Lost a race with another request: read the winner.
			const retry = await this.db
				.from('knowledge_entities')
				.select('id')
				.eq('owner_user_id', this.userId)
				.eq('is_self', true)
				.maybeSingle();
			if (retry.data?.id) {
				this.selfId = retry.data.id as string;
				return this.selfId;
			}
			throw dbError('Create self', insertError);
		}
		this.selfId = created.id as string;
		return this.selfId;
	}

	// -------------------------------------------------------------------------
	// Entity loading

	/** The user's own entity id if it exists (never creates it). */
	private async findSelfId(): Promise<string | null> {
		if (this.selfId) return this.selfId;
		const { data, error } = await this.db
			.from('knowledge_entities')
			.select('id')
			.eq('owner_user_id', this.userId)
			.eq('is_self', true)
			.maybeSingle();
		if (error) throw dbError('Load self', error);
		this.selfId = (data?.id as string | undefined) ?? null;
		return this.selfId;
	}

	/** Visible entities by id, following merges (up to three in a chain) to the survivor. */
	async loadEntities(ids: string[], depth = 0): Promise<Map<string, EntityRow>> {
		const out = new Map<string, EntityRow>();
		const rows = await mapChunks(
			unique(ids.filter((id) => UUID.test(id))),
			ID_CHUNK,
			async (group) => {
				const { data, error } = await this.db
					.from('knowledge_entities')
					.select(ENTITY_COLUMNS)
					.in('id', group)
					.or(this.visible);
				if (error) throw dbError('Load entities', error);
				return (data ?? []) as EntityRow[];
			}
		);
		const redirects = new Map<string, string>();
		for (const row of rows) {
			if (row.status === 'merged' && row.merged_into_id)
				redirects.set(row.id, row.merged_into_id);
			else if (row.status !== 'hidden' || row.owner_user_id === this.userId)
				out.set(row.id, row);
		}
		if (redirects.size && depth < 3) {
			const targets = await this.loadEntities([...redirects.values()], depth + 1);
			for (const [from, to] of redirects) {
				const target = targets.get(to);
				if (target) out.set(from, target);
			}
		}
		return out;
	}

	async getSummaries(ids: string[]): Promise<Map<string, KnowledgeEntitySummary>> {
		const rows = await this.loadEntities(ids);
		return new Map([...rows].map(([id, row]) => [id, summarize(row)]));
	}

	// -------------------------------------------------------------------------
	// Writes

	async record(
		batch: KnowledgeWriteBatch,
		options: KnowledgeWriteOptions
	): Promise<KnowledgeWriteReceipt> {
		const receipt: KnowledgeWriteReceipt = {
			entities: [],
			facts: { added: 0, existing: 0, superseded: 0, suggested: 0 },
			sources: 0,
			links: 0,
			merge_candidates: 0,
			problems: []
		};
		const entities = batch.entities ?? [];
		const facts = batch.facts ?? [];
		if (entities.length > MAX_BATCH_ENTITIES || facts.length > MAX_BATCH_FACTS) {
			throw new KnowledgeStoreError(
				`Batch too large (max ${MAX_BATCH_ENTITIES} entities, ${MAX_BATCH_FACTS} facts).`,
				'INVALID'
			);
		}

		const refs = new Set<string>();
		for (const entity of entities) {
			if (!entity.ref || refs.has(entity.ref)) {
				throw new KnowledgeStoreError(
					`Entity refs must be present and unique ("${entity.ref}").`,
					'INVALID'
				);
			}
			refs.add(entity.ref);
		}

		const resolved = await serializePerUser(this.userId, () =>
			this.resolveEntities(batch, options, receipt)
		);
		const sourceIds = await this.insertSources(batch, receipt);
		// Entities created by this batch can't have facts yet: skip loading theirs.
		const created = new Set(
			receipt.entities.filter((e) => e.matched === 'created').map((e) => e.id)
		);
		await this.writeFacts(batch, options, resolved, sourceIds, receipt, created);
		await this.writeLinks(batch, options, resolved, receipt);
		return receipt;
	}

	/** Map every batch ref to an entity id: by id, self, identity key, name, or a new row. */
	private async resolveEntities(
		batch: KnowledgeWriteBatch,
		options: KnowledgeWriteOptions,
		receipt: KnowledgeWriteReceipt
	): Promise<Map<string, EntityRow>> {
		const byRef = new Map<string, EntityRow>();
		const match = new Map<string, KnowledgeEntityMatch>();
		const entities = batch.entities ?? [];

		// 1. Explicit ids and self.
		const explicit = entities.filter((e) => e.id);
		if (explicit.length) {
			const rows = await this.loadEntities(explicit.map((e) => e.id!));
			for (const e of explicit) {
				const row = rows.get(e.id!);
				if (row) {
					byRef.set(e.ref, row);
					match.set(e.ref, 'id');
				} else {
					receipt.problems.push({ ref: e.ref, message: `Entity ${e.id} not found.` });
				}
			}
		}
		if (entities.some((e) => e.self && !e.id)) {
			const selfId = await this.ensureSelf();
			const self = (await this.loadEntities([selfId])).get(selfId)!;
			for (const e of entities.filter((x) => x.self && !x.id)) {
				byRef.set(e.ref, self);
				match.set(e.ref, 'self');
			}
		}

		// 2. Identity keys.
		const keysByRef = new Map<string, KnowledgeKey[]>();
		for (const e of entities) {
			if (byRef.has(e.ref) || (e.id && !byRef.has(e.ref))) continue;
			if (!isKnowledgeKind(e.kind)) {
				receipt.problems.push({ ref: e.ref, message: `Unknown kind "${e.kind}".` });
				continue;
			}
			const keys = (e.keys ?? [])
				.map((k) => normalizeKnowledgeKey(k))
				.filter((k): k is KnowledgeKey => Boolean(k));
			if (keys.length) keysByRef.set(e.ref, keys);
		}
		const entityByRef = new Map(entities.map((e) => [e.ref, e]));
		const candidatePairs: Array<{ ref: string; existing: string }> = [];
		const keyOwners = await this.lookupKeys([...keysByRef.values()].flat());
		const keyEntityIds = unique([...keyOwners.values()]);
		const keyEntities = keyEntityIds.length ? await this.loadEntities(keyEntityIds) : new Map();
		for (const [ref, keys] of keysByRef) {
			const incoming = entityByRef.get(ref)!;
			for (const key of keys) {
				const id = keyOwners.get(`${key.type}:${key.value}`);
				const row = id ? keyEntities.get(id) : undefined;
				if (!row || row.kind !== incoming.kind) continue;
				// A household phone or shared inbox can belong to several people: those keys
				// identify a person only when the names agree. Otherwise ask "same person?".
				if (!sameHolder(incoming.kind, key.type, incoming.name, row.name)) {
					candidatePairs.push({ ref, existing: row.id });
					continue;
				}
				byRef.set(ref, row);
				match.set(ref, 'key');
				break;
			}
		}

		// Refs in one batch that share an identity key are one entity (the same contact twice in a
		// file). Later refs alias the first.
		const aliasOf = new Map<string, string>();
		const firstByKey = new Map<string, string>();
		for (const [ref, keys] of keysByRef) {
			if (byRef.has(ref)) continue;
			const incoming = entityByRef.get(ref)!;
			const seenAs = keys
				.map((key) => firstByKey.get(`${incoming.kind}|${key.type}:${key.value}`))
				.find(
					(first, i) =>
						first &&
						sameHolder(
							incoming.kind,
							keys[i]!.type,
							incoming.name,
							entityByRef.get(first)!.name
						)
				);
			if (seenAs) {
				aliasOf.set(ref, seenAs);
				continue;
			}
			for (const key of keys) {
				const id = `${incoming.kind}|${key.type}:${key.value}`;
				if (!firstByKey.has(id)) firstByKey.set(id, ref);
			}
		}

		// 3. Names, within the user's own private entities. A one-word person name ("Louis") is
		// reused only for the user's own notes (tasks, backfill), where it almost always means
		// the same person, or when an earlier import made it (re-importing the same contact book);
		// elsewhere it becomes a "same person?" suggestion. A name never matches an entry that
		// already holds a different identifier of the same kind (two LinkedIn "John Smith"s).
		// 'system' is the document re-reader (tasker 167): the user's own notes, same rule as tasks.
		// Before it was included here, every re-read of a doc made another "Craig".
		const ownNotes =
			options.via === 'task' || options.via === 'backfill' || options.via === 'system';
		const singleNamesOk = ownNotes;
		const unresolved = entities.filter(
			(e) => !byRef.has(e.ref) && !aliasOf.has(e.ref) && !e.id && isKnowledgeKind(e.kind)
		);
		const nameMatches = await this.lookupPrivateNames(unresolved.map((e) => e.name));
		const heldKeys = await this.loadPrivateKeyTypes(
			unique([...nameMatches.values()].flat().map((row) => row.id))
		);
		for (const e of unresolved) {
			const ownKeys = keysByRef.get(e.ref) ?? [];
			const existing = (nameMatches.get(normalizeKnowledgeName(e.name)) ?? []).filter(
				(row) =>
					row.kind === e.kind &&
					!row.is_self &&
					!ownKeys.some((key) => {
						const held = heldKeys.get(row.id)?.get(key.type);
						return STRONG_KEY_TYPES.has(key.type) && held && !held.has(key.value);
					})
			);
			if (!existing.length) continue;
			// The user's own notes naming someone who already has several same-name entries (two
			// "Craig"s waiting in the duplicates review): file under the oldest one rather than
			// making yet another. Contact imports (with their own identifiers) keep the old rule.
			if (ownNotes && existing.length > 1 && !ownKeys.length) {
				const oldest = [...existing].sort((a, b) =>
					String((a as { created_at?: string }).created_at ?? '').localeCompare(
						String((b as { created_at?: string }).created_at ?? '')
					)
				)[0]!;
				byRef.set(e.ref, oldest);
				match.set(e.ref, 'name');
				continue;
			}
			const reusable =
				e.kind !== 'person' ||
				isSpecificPersonName(e.name) ||
				singleNamesOk ||
				(options.via === 'import' && existing[0]!.created_via === 'import');
			if (reusable && existing.length === 1) {
				// Within this batch, the first ref to claim an entry fixes its strong keys.
				const claimed = heldKeys.get(existing[0]!.id) ?? new Map<string, Set<string>>();
				const clash = ownKeys.some((key) => {
					const held = claimed.get(key.type);
					return STRONG_KEY_TYPES.has(key.type) && held && !held.has(key.value);
				});
				if (clash) continue;
				for (const key of ownKeys) {
					if (STRONG_KEY_TYPES.has(key.type) && !claimed.has(key.type))
						claimed.set(key.type, new Set([key.value]));
				}
				heldKeys.set(existing[0]!.id, claimed);
				byRef.set(e.ref, existing[0]!);
				match.set(e.ref, 'name');
			} else {
				candidatePairs.push({ ref: e.ref, existing: existing[0]!.id });
			}
		}

		// Two refs in one batch with the same kind + name (and no key) share one entity.
		const batchNames = new Map<string, string>();
		for (const e of entities) {
			if (byRef.has(e.ref) || aliasOf.has(e.ref) || e.id || !isKnowledgeKind(e.kind))
				continue;
			const reusable = e.kind !== 'person' || isSpecificPersonName(e.name) || singleNamesOk;
			if (!reusable || keysByRef.has(e.ref)) continue;
			const key = `${e.kind}|${normalizeKnowledgeName(e.name)}`;
			const first = batchNames.get(key);
			if (first) aliasOf.set(e.ref, first);
			else batchNames.set(key, e.ref);
		}

		// 4. Create the rest.
		const toCreate = entities.filter(
			(e) =>
				!byRef.has(e.ref) &&
				!e.id &&
				isKnowledgeKind(e.kind) &&
				!aliasOf.has(e.ref) &&
				e.name?.trim()
		);
		for (const group of chunk(toCreate, PAGE)) {
			const { data, error } = await this.db
				.from('knowledge_entities')
				.insert(
					group.map((e) => ({
						kind: e.kind,
						name: e.name.trim().slice(0, 300),
						summary: e.summary?.trim().slice(0, 300) || null,
						image_url: e.image_url ?? null,
						scope: 'private',
						owner_user_id: this.userId,
						created_via: options.via
					}))
				)
				.select(ENTITY_COLUMNS);
			if (error) throw dbError('Create entities', error);
			((data ?? []) as EntityRow[]).forEach((row, i) => {
				byRef.set(group[i]!.ref, row);
				match.set(group[i]!.ref, 'created');
			});
		}
		for (const [ref, first] of aliasOf) {
			const row = byRef.get(first);
			if (row) {
				byRef.set(ref, row);
				match.set(ref, match.get(first) ?? 'created');
			}
		}

		// Fill an empty summary on the user's own entities.
		const summaryUpdates = entities.filter((e) => {
			const row = byRef.get(e.ref);
			return (
				e.summary &&
				row &&
				row.owner_user_id === this.userId &&
				!row.summary &&
				match.get(e.ref) !== 'created'
			);
		});
		await inParallel(summaryUpdates, async (e) => {
			const row = byRef.get(e.ref)!;
			const summary = e.summary!.trim().slice(0, 300);
			await this.db
				.from('knowledge_entities')
				.update({ summary })
				.eq('id', row.id)
				.eq('owner_user_id', this.userId);
			row.summary = summary;
		});

		// Keys for everything resolved (private to the user; public entities get private keys).
		const keyRows: Array<Record<string, unknown>> = [];
		for (const [ref, keys] of keysByRef) {
			const row = byRef.get(ref);
			if (!row) continue;
			for (const key of keys) {
				if (keyOwners.has(`${key.type}:${key.value}`)) continue;
				keyRows.push({
					entity_id: row.id,
					key_type: key.type,
					key_value: key.value,
					scope: 'private',
					owner_user_id: this.userId
				});
			}
		}
		await this.insertKeys(keyRows);

		// Same-name people that were not merged automatically.
		const mergeRows = candidatePairs
			.map(({ ref, existing }) => {
				const row = byRef.get(ref);
				if (!row || row.id === existing) return null;
				// Pairs are stored in a fixed order so one unique constraint covers both ways.
				const [a, b] = existing < row.id ? [existing, row.id] : [row.id, existing];
				return {
					owner_user_id: this.userId,
					entity_a: a,
					entity_b: b,
					reason: `Same name: "${row.name}"`,
					score: 0.6
				};
			})
			.filter(Boolean) as Array<Record<string, unknown>>;
		const pairs = [
			...new Map(mergeRows.map((r) => [`${r.entity_a}|${r.entity_b}`, r])).values()
		];
		for (const group of chunk(pairs, PAGE)) {
			const { error } = await this.db.from('knowledge_merge_candidates').upsert(group, {
				onConflict: 'owner_user_id,entity_a,entity_b',
				ignoreDuplicates: true
			});
			if (error) throw dbError('Save merge candidates', error);
			receipt.merge_candidates += group.length;
		}

		for (const e of entities) {
			const row = byRef.get(e.ref);
			if (row) {
				receipt.entities.push({
					ref: e.ref,
					id: row.id,
					kind: row.kind,
					name: row.name,
					matched: match.get(e.ref) ?? 'created'
				});
			}
		}
		return byRef;
	}

	/** key "type:value" → entity id; the user's private key wins over a public one. */
	private async lookupKeys(keys: KnowledgeKey[]): Promise<Map<string, string>> {
		const out = new Map<string, string>();
		type KeyRow = { entity_id: string; key_type: string; key_value: string; scope: string };
		const rows = await mapChunks(unique(keys.map((k) => k.value)), ID_CHUNK, async (group) => {
			const { data, error } = await this.db
				.from('knowledge_entity_keys')
				.select('entity_id, key_type, key_value, scope')
				.in('key_value', group)
				.or(this.visible);
			if (error) throw dbError('Look up keys', error);
			return (data ?? []) as KeyRow[];
		});
		for (const row of rows) {
			const id = `${row.key_type}:${row.key_value}`;
			if (!out.has(id) || row.scope === 'private') out.set(id, row.entity_id);
		}
		return out;
	}

	private async lookupPrivateNames(names: string[]): Promise<Map<string, EntityRow[]>> {
		const out = new Map<string, EntityRow[]>();
		const normalized = unique(names.map(normalizeKnowledgeName).filter(Boolean));
		const rows = await mapChunks(normalized, ID_CHUNK, async (group) => {
			const { data, error } = await this.db
				.from('knowledge_entities')
				.select(ENTITY_COLUMNS + ', normalized_name, created_via, created_at')
				.eq('owner_user_id', this.userId)
				.in('status', ['active', 'merged'])
				.in('normalized_name', group);
			if (error) throw dbError('Look up names', error);
			return (data ?? []) as Array<EntityRow & { normalized_name: string }>;
		});
		for (const row of rows) {
			if (row.status !== 'active') continue;
			out.set(row.normalized_name, [...(out.get(row.normalized_name) ?? []), row]);
		}
		// A name that was folded into another entry ("Phil Valeo" merged into "Phillip Velayo",
		// tasker 167) resolves to the survivor, so re-reading the old spelling never brings the
		// old entry back. An active entry with the exact name still wins.
		const merged = rows.filter(
			(row) => row.status === 'merged' && row.merged_into_id && !out.has(row.normalized_name)
		);
		if (merged.length) {
			const targets = await this.loadEntities(merged.map((row) => row.id));
			for (const row of merged) {
				const target = targets.get(row.id);
				if (!target || target.owner_user_id !== this.userId || target.status !== 'active')
					continue;
				const list = out.get(row.normalized_name) ?? [];
				if (!list.some((r) => r.id === target.id))
					out.set(row.normalized_name, [
						...list,
						{ ...target, created_via: row.created_via }
					]);
			}
		}
		return out;
	}

	/** For the user's own entities: key type → the values each one holds. */
	private async loadPrivateKeyTypes(
		entityIds: string[]
	): Promise<Map<string, Map<string, Set<string>>>> {
		const out = new Map<string, Map<string, Set<string>>>();
		type Row = { entity_id: string; key_type: string; key_value: string };
		const rows = await mapChunks(entityIds, ID_CHUNK, async (group) => {
			const { data, error } = await this.db
				.from('knowledge_entity_keys')
				.select('entity_id, key_type, key_value')
				.in('entity_id', group)
				.eq('owner_user_id', this.userId);
			if (error) throw dbError('Load keys', error);
			return (data ?? []) as Row[];
		});
		for (const row of rows) {
			const byType = out.get(row.entity_id) ?? new Map<string, Set<string>>();
			byType.set(row.key_type, (byType.get(row.key_type) ?? new Set()).add(row.key_value));
			out.set(row.entity_id, byType);
		}
		return out;
	}

	/** Save identity keys; a key someone (or a concurrent write) already holds is skipped. */
	private async insertKeys(rows: Array<Record<string, unknown>>): Promise<void> {
		const seen = new Set<string>();
		const deduped = rows.filter((row) => {
			const id = `${row.key_type}:${row.key_value}`;
			if (seen.has(id)) return false;
			seen.add(id);
			return true;
		});
		for (const group of chunk(deduped, PAGE)) {
			const { error } = await this.db.from('knowledge_entity_keys').upsert(group, {
				onConflict: 'key_type,key_value,scope,owner_user_id',
				ignoreDuplicates: true
			});
			if (error) throw dbError('Save keys', error);
		}
	}

	private async insertSources(
		batch: KnowledgeWriteBatch,
		receipt: KnowledgeWriteReceipt
	): Promise<Map<string, string>> {
		const out = new Map<string, string>();
		let sources = batch.sources ?? [];
		// A BuildOS record (a task re-read after every edit) is one source, not one per write.
		const recordIds = unique(
			sources
				.filter((s) => s.type === 'task' && s.record_id && UUID.test(s.record_id))
				.map((s) => s.record_id!)
		);
		if (recordIds.length) {
			const { data, error } = await this.db
				.from('knowledge_sources')
				.select('id, record_id')
				.eq('owner_user_id', this.userId)
				.eq('source_type', 'task')
				.in('record_id', recordIds);
			if (error) throw dbError('Load sources', error);
			const existing = new Map(
				((data ?? []) as Array<{ id: string; record_id: string }>).map((r) => [
					r.record_id,
					r.id
				])
			);
			sources = sources.filter((s) => {
				const id = s.type === 'task' && s.record_id ? existing.get(s.record_id) : undefined;
				if (id) out.set(s.ref, id);
				return !id;
			});
		}
		for (const group of chunk(sources, PAGE)) {
			const { data, error } = await this.db
				.from('knowledge_sources')
				.insert(
					group.map((s) => ({
						scope: 'private',
						owner_user_id: this.userId,
						source_type: s.type,
						url: s.url?.slice(0, 2000) ?? null,
						title: s.title?.slice(0, 500) ?? null,
						record_id: s.record_id && UUID.test(s.record_id) ? s.record_id : null,
						published_at: s.published_at ?? null,
						content_hash: s.content_hash ?? null,
						meta: s.meta ?? {}
					}))
				)
				.select('id');
			if (error) throw dbError('Save sources', error);
			((data ?? []) as Array<{ id: string }>).forEach((row, i) =>
				out.set(group[i]!.ref, row.id)
			);
			receipt.sources += group.length;
		}
		return out;
	}

	private async writeFacts(
		batch: KnowledgeWriteBatch,
		options: KnowledgeWriteOptions,
		byRef: Map<string, EntityRow>,
		sourceIds: Map<string, string>,
		receipt: KnowledgeWriteReceipt,
		created: Set<string> = new Set()
	): Promise<void> {
		const facts = batch.facts ?? [];
		// Facts may name existing entity ids directly instead of refs.
		const directIds = unique(
			facts.flatMap((f) =>
				[f.subject, f.object].filter((x): x is string =>
					Boolean(x && !byRef.has(x) && UUID.test(x))
				)
			)
		);
		const direct = directIds.length
			? await this.loadEntities(directIds)
			: new Map<string, EntityRow>();
		const entityFor = (refOrId: string | undefined) =>
			refOrId ? (byRef.get(refOrId) ?? direct.get(refOrId) ?? null) : null;

		interface Planned {
			index: number;
			row: Record<string, unknown>;
			identity: string;
			sources: string[];
			quote: string | null;
			cardinalityOne: boolean;
		}
		const planned: Planned[] = [];
		const seen = new Set<string>();
		const derivedKeys: Array<Record<string, unknown>> = [];

		facts.forEach((fact, index) => {
			const subject = entityFor(fact.subject);
			if (!subject) {
				receipt.problems.push({
					fact: index,
					message: `Unknown subject "${fact.subject}".`
				});
				return;
			}
			const def = getKnowledgePredicate(fact.predicate);
			const object = fact.object ? entityFor(fact.object) : null;
			if (fact.object && !object) {
				receipt.problems.push({ fact: index, message: `Unknown object "${fact.object}".` });
				return;
			}
			const hasValue =
				fact.value !== undefined && fact.value !== null && String(fact.value).trim() !== '';
			const shapeProblem = checkKnowledgeFactShape({
				predicate: fact.predicate,
				subjectKind: subject.kind,
				objectKind: object?.kind ?? null,
				hasValue
			});
			if (shapeProblem || !def) {
				receipt.problems.push({
					fact: index,
					message: shapeProblem ?? 'Unknown predicate.'
				});
				return;
			}
			if (object && object.id === subject.id) return;
			if (subject.scope === 'private' && subject.owner_user_id !== this.userId) return;
			if (object && object.scope === 'private' && object.owner_user_id !== this.userId)
				return;

			let valueText: string | null = null;
			if (!object) {
				valueText = normalizeKnowledgeValue(def.valueType, fact.value as string | number);
				if (!valueText) {
					receipt.problems.push({
						fact: index,
						message: `"${String(fact.value).slice(0, 80)}" is not a valid ${def.valueType} for ${def.key}.`
					});
					return;
				}
				for (const key of keysForKnowledgeValue(def.key, valueText)) {
					derivedKeys.push({
						entity_id: subject.id,
						key_type: key.type,
						key_value: key.value,
						scope: 'private',
						owner_user_id: this.userId
					});
				}
			}
			const identity = factIdentity(subject.id, def.key, object?.id ?? null, valueText);
			if (seen.has(identity)) return;
			seen.add(identity);

			const confidence =
				typeof fact.confidence === 'number' && fact.confidence >= 0 && fact.confidence <= 1
					? fact.confidence
					: undefined;
			planned.push({
				index,
				identity,
				cardinalityOne: def.cardinality === 'one' && !object,
				sources: (fact.sources ?? [])
					.map((ref) => sourceIds.get(ref))
					.filter((id): id is string => Boolean(id)),
				quote: fact.quote?.trim().slice(0, 1000) || null,
				row: {
					entity_id: subject.id,
					predicate: def.key,
					object_entity_id: object?.id ?? null,
					value_text: valueText,
					qualifiers: sanitizeQualifiers(fact.qualifiers, def.qualifierKeys),
					scope: 'private',
					owner_user_id: this.userId,
					status: fact.status === 'suggested' ? 'suggested' : 'active',
					...(confidence !== undefined ? { confidence } : {}),
					valid_from: isoDateOrNull(fact.valid_from),
					valid_to: isoDateOrNull(fact.valid_to),
					created_via: options.via,
					run_id: options.runId ?? null
				}
			});
		});

		if (!planned.length) {
			await this.insertKeys(derivedKeys);
			return;
		}

		// Existing private facts for the touched subjects (not ones this batch just created).
		const subjectIds = unique(planned.map((p) => p.row.entity_id as string)).filter(
			(id) => !created.has(id)
		);
		const existing = new Map<string, FactRow>();
		const singleValued = new Map<string, FactRow[]>();
		const existingRows = await mapChunks(subjectIds, ID_CHUNK, async (group) => {
			const rows: FactRow[] = [];
			for (let from = 0; ; from += 1000) {
				const { data, error } = await this.db
					.from('knowledge_facts')
					.select(FACT_COLUMNS)
					.in('entity_id', group)
					.eq('owner_user_id', this.userId)
					.order('id')
					.range(from, from + PAGE - 1);
				if (error) throw dbError('Load existing facts', error);
				rows.push(...((data ?? []) as FactRow[]));
				if ((data ?? []).length < 1000) break;
			}
			return rows;
		});
		for (const row of existingRows) {
			existing.set(
				factIdentity(row.entity_id, row.predicate, row.object_entity_id, row.value_text),
				row
			);
			if (!row.object_entity_id && row.status === 'active') {
				const key = `${row.entity_id}|${row.predicate}`;
				singleValued.set(key, [...(singleValued.get(key) ?? []), row]);
			}
		}

		// A single-valued predicate ("headline") can arrive several times in one batch (research
		// found three headlines). The most confident one becomes current; the rest are suggestions.
		const singleKey = (plan: Planned) => `${plan.row.entity_id}|${plan.row.predicate}`;
		const confidenceOf = (plan: Planned) => Number(plan.row.confidence ?? 0.5);
		const bestSingle = new Map<string, Planned>();
		for (const plan of planned) {
			if (!plan.cardinalityOne || plan.row.status !== 'active') continue;
			const best = bestSingle.get(singleKey(plan));
			if (!best || confidenceOf(plan) > confidenceOf(best))
				bestSingle.set(singleKey(plan), plan);
		}

		const toInsert: Planned[] = [];
		const factIdFor = new Map<number, string>();
		// Values a new one-value fact replaces, retired only once the new row is saved (a failed
		// insert must not leave the field empty).
		const supersedeFor = new Map<number, string[]>();
		// Values a reactivated old fact replaces ("A, then B, then A again" keeps one current).
		const supersedeAfterReactivation: string[] = [];
		const newSummaries: Array<{ entityId: string; value: string }> = [];
		const priorUpdates: Array<{ id: string; patch: Record<string, unknown> }> = [];
		const activeOthers = (entityId: string, predicate: string, exceptId?: string) =>
			(singleValued.get(`${entityId}|${predicate}`) ?? [])
				.filter((row) => row.status === 'active' && row.id !== exceptId)
				.map((row) => row.id);
		for (const plan of planned) {
			const prior = existing.get(plan.identity);
			if (prior) {
				receipt.facts.existing++;
				factIdFor.set(plan.index, prior.id);
				const merged = {
					...(prior.qualifiers ?? {}),
					...(plan.row.qualifiers as Record<string, unknown>)
				};
				const reactivate = prior.status === 'superseded' || prior.status === 'retracted';
				const nowActive = reactivate && HUMAN_VIA.has(options.via);
				if (
					reactivate ||
					JSON.stringify(merged) !== JSON.stringify(prior.qualifiers ?? {})
				) {
					priorUpdates.push({
						id: prior.id,
						patch: {
							qualifiers: merged,
							observed_at: new Date().toISOString(),
							...(nowActive ? { status: 'active' } : {})
						}
					});
				}
				if (nowActive && plan.cardinalityOne) {
					supersedeAfterReactivation.push(
						...activeOthers(prior.entity_id, prior.predicate, prior.id)
					);
					if (prior.predicate === 'headline' && prior.value_text)
						newSummaries.push({ entityId: prior.entity_id, value: prior.value_text });
				}
				continue;
			}
			if (
				plan.cardinalityOne &&
				plan.row.status === 'active' &&
				bestSingle.get(singleKey(plan)) !== plan
			) {
				plan.row.status = 'suggested';
				receipt.facts.suggested++;
			}
			if (plan.cardinalityOne && plan.row.status === 'active') {
				const current = (
					singleValued.get(`${plan.row.entity_id}|${plan.row.predicate}`) ?? []
				).filter((row) => row.status === 'active');
				if (current.length) {
					const protectedByHuman = current.some((row) => HUMAN_VIA.has(row.created_via));
					if (options.via === 'enrichment' && protectedByHuman) {
						plan.row.status = 'suggested';
						receipt.facts.suggested++;
					} else {
						supersedeFor.set(
							plan.index,
							current.map((row) => row.id)
						);
					}
				}
			}
			toInsert.push(plan);
		}

		const supersedeIds = async (ids: string[]) => {
			const distinct = unique(ids);
			for (const group of chunk(distinct, ID_CHUNK)) {
				const { error } = await this.db
					.from('knowledge_facts')
					.update({ status: 'superseded', valid_to: null })
					.in('id', group)
					.eq('owner_user_id', this.userId);
				if (error) throw dbError('Supersede facts', error);
			}
			receipt.facts.superseded += distinct.length;
		};

		await inParallel(priorUpdates, async ({ id, patch }) => {
			const { error } = await this.db
				.from('knowledge_facts')
				.update(patch)
				.eq('id', id)
				.eq('owner_user_id', this.userId);
			if (error) throw dbError('Update facts', error);
		});

		await supersedeIds(supersedeAfterReactivation);

		for (const group of chunk(toInsert, PAGE)) {
			const { data, error } = await this.db
				.from('knowledge_facts')
				.insert(group.map((p) => p.row))
				.select('id');
			if (!error) {
				((data ?? []) as Array<{ id: string }>).forEach((row, i) =>
					factIdFor.set(group[i]!.index, row.id)
				);
				receipt.facts.added += group.length;
				continue;
			}
			// One bad or duplicate row fails the whole insert: retry one by one.
			for (const plan of group) {
				const single = await this.db
					.from('knowledge_facts')
					.insert(plan.row)
					.select('id')
					.single();
				if (single.error) {
					if (single.error.code === '23505') {
						receipt.facts.existing++;
					} else {
						receipt.problems.push({ fact: plan.index, message: single.error.message });
					}
					continue;
				}
				factIdFor.set(plan.index, single.data.id as string);
				receipt.facts.added++;
			}
		}

		// Retire replaced values only for new values that were actually saved.
		await supersedeIds(
			toInsert.flatMap((plan) =>
				factIdFor.has(plan.index) ? (supersedeFor.get(plan.index) ?? []) : []
			)
		);

		const citations: Array<Record<string, unknown>> = [];
		for (const plan of planned) {
			const factId = factIdFor.get(plan.index);
			if (!factId) continue;
			for (const sourceId of plan.sources)
				citations.push({ fact_id: factId, source_id: sourceId, quote: plan.quote });
		}
		for (const group of chunk(citations, PAGE)) {
			const { error } = await this.db
				.from('knowledge_fact_sources')
				.upsert(group, { onConflict: 'fact_id,source_id', ignoreDuplicates: true });
			if (error) throw dbError('Save citations', error);
		}

		// Keys implied by values (an email identifies its person); keys already held are skipped.
		await this.insertKeys(derivedKeys);

		// Keep a person's one-line summary in step with their headline.
		const rowsById = new Map(
			[...byRef.values(), ...direct.values()].map((row) => [row.id, row])
		);
		for (const plan of toInsert) {
			if (
				plan.row.predicate === 'headline' &&
				plan.row.status === 'active' &&
				factIdFor.has(plan.index)
			)
				newSummaries.push({
					entityId: plan.row.entity_id as string,
					value: String(plan.row.value_text)
				});
		}
		const headlineUpdates = newSummaries.filter(({ entityId, value }) => {
			const subject = rowsById.get(entityId);
			return Boolean(
				subject && subject.owner_user_id === this.userId && subject.summary !== value
			);
		});
		await inParallel(headlineUpdates, async ({ entityId, value }) => {
			const summary = value.slice(0, 300);
			await this.db
				.from('knowledge_entities')
				.update({ summary })
				.eq('id', entityId)
				.eq('owner_user_id', this.userId);
			const subject = rowsById.get(entityId);
			if (subject) subject.summary = summary;
		});
	}

	private async writeLinks(
		batch: KnowledgeWriteBatch,
		options: KnowledgeWriteOptions,
		byRef: Map<string, EntityRow>,
		receipt: KnowledgeWriteReceipt
	): Promise<void> {
		const links = batch.links ?? [];
		if (!links.length) return;
		const directIds = links.map((l) => l.entity).filter((x) => !byRef.has(x) && UUID.test(x));
		const direct = directIds.length
			? await this.loadEntities(directIds)
			: new Map<string, EntityRow>();
		const rows = links
			.map((link) => {
				const entity = byRef.get(link.entity) ?? direct.get(link.entity);
				if (!entity || !UUID.test(link.record_id)) return null;
				return {
					entity_id: entity.id,
					owner_user_id: this.userId,
					record_kind: link.record_kind,
					record_id: link.record_id,
					quote: link.quote?.slice(0, 1000) ?? null,
					created_via: options.via
				};
			})
			.filter(Boolean) as Array<Record<string, unknown>>;
		for (const group of chunk(rows, PAGE)) {
			const { error } = await this.db.from('knowledge_record_links').upsert(group, {
				onConflict: 'entity_id,owner_user_id,record_kind,record_id',
				ignoreDuplicates: true
			});
			if (error) throw dbError('Save links', error);
			receipt.links += group.length;
		}
	}

	// -------------------------------------------------------------------------
	// Edits

	async updateEntity(
		id: string,
		patch: {
			name?: string;
			summary?: string | null;
			status?: 'active' | 'hidden';
			/** The user's own answer: inner = part of my world, public = just mentioned. */
			circle?: 'inner' | 'public';
		}
	): Promise<void> {
		const update: Record<string, unknown> = {};
		if (patch.circle !== undefined) {
			if (patch.circle !== 'inner' && patch.circle !== 'public')
				throw new KnowledgeStoreError('Pick inner or public.', 'INVALID');
			update.circle = patch.circle;
			update.circle_source = 'user';
			update.circle_set_at = new Date().toISOString();
		}
		if (patch.name !== undefined) {
			const name = patch.name.trim();
			if (!name || name.length > 300)
				throw new KnowledgeStoreError('Name must be 1–300 characters.', 'INVALID');
			update.name = name;
		}
		if (patch.summary !== undefined)
			update.summary = patch.summary?.trim().slice(0, 300) || null;
		if (patch.status !== undefined) update.status = patch.status;
		if (!Object.keys(update).length) return;
		// Showing an entry again (or hiding it on purpose) clears "hidden as an orphan"
		// (tasker 167); before migration 20261118200000 the column doesn't exist.
		const write = (values: Record<string, unknown>) =>
			this.db
				.from('knowledge_entities')
				.update(values)
				.eq('id', id)
				.eq('owner_user_id', this.userId)
				.select('id');
		let { data, error } = await write(
			patch.status !== undefined ? { ...update, hidden_reason: null } : update
		);
		if (error && (error as { code?: string }).code === '42703' && patch.status !== undefined)
			({ data, error } = await write(update));
		if (error) throw dbError('Update entity', error);
		if (!data?.length)
			throw new KnowledgeStoreError('You can only edit your own entities.', 'NOT_FOUND');
	}

	/**
	 * Change what an entry is (an "organization" that is really a person). Own entries only, never
	 * the user's own entry. Details that only fit the old kind (a company's "founded", someone
	 * "works at" it) are retracted first, so the per-kind rules in the database keep holding. The
	 * entry counts as not researched again: what research looked for depended on its kind.
	 * Entries of the new kind with the same name are filed as possible duplicates and returned.
	 */
	async changeEntityKind(id: string, kind: KnowledgeKind): Promise<KnowledgeKindChange> {
		if (!UUID.test(id)) throw new KnowledgeStoreError('Entity not found.', 'NOT_FOUND');
		if (!isKnowledgeKind(kind)) throw new KnowledgeStoreError('Unknown kind.', 'INVALID');
		const { data: found, error: loadError } = await this.db
			.from('knowledge_entities')
			.select('id, kind, name, normalized_name, is_self, status')
			.eq('id', id)
			.eq('owner_user_id', this.userId)
			.maybeSingle();
		if (loadError) throw dbError('Load entity', loadError);
		const row = found as {
			id: string;
			kind: KnowledgeKind;
			name: string;
			normalized_name: string;
			is_self: boolean;
			status: string;
		} | null;
		if (!row || row.status === 'merged')
			throw new KnowledgeStoreError('You can only edit your own entities.', 'NOT_FOUND');
		if (row.is_self)
			throw new KnowledgeStoreError('Your own entry is always a person.', 'INVALID');
		const result: KnowledgeKindChange = {
			entity_id: id,
			kind,
			previous_kind: row.kind,
			retracted: 0,
			same_name: []
		};
		if (row.kind === kind) return result;

		// Facts that no longer fit, both ways: this entry as subject, and as someone else's object.
		const [outgoing, incoming] = await Promise.all(
			(['entity_id', 'object_entity_id'] as const).map(async (column) => {
				const { data, error } = await this.db
					.from('knowledge_facts')
					.select('id, predicate')
					.eq(column, id)
					.eq('owner_user_id', this.userId)
					.neq('status', 'retracted')
					.limit(PAGE);
				if (error) throw dbError('Load facts', error);
				return (data ?? []) as Array<{ id: string; predicate: string }>;
			})
		);
		const misfit = [
			...outgoing!.filter((fact) => {
				const kinds = getKnowledgePredicate(fact.predicate)?.subjectKinds ?? [];
				return kinds.length > 0 && !kinds.includes(kind);
			}),
			...incoming!.filter((fact) => {
				const kinds = getKnowledgePredicate(fact.predicate)?.objectKinds ?? [];
				return kinds.length > 0 && !kinds.includes(kind);
			})
		].map((fact) => fact.id);
		await mapChunks(unique(misfit), ID_CHUNK, async (group) => {
			const { error } = await this.db
				.from('knowledge_facts')
				.update({ status: 'retracted' })
				.in('id', group)
				.eq('owner_user_id', this.userId);
			if (error) throw dbError('Retract details', error);
			return [];
		});
		result.retracted = unique(misfit).length;

		const { data: updated, error } = await this.db
			.from('knowledge_entities')
			.update({ kind, enriched_at: null })
			.eq('id', id)
			.eq('owner_user_id', this.userId)
			.select('id');
		if (error) throw dbError('Change kind', error);
		if (!updated?.length)
			throw new KnowledgeStoreError('You can only edit your own entities.', 'NOT_FOUND');

		// The same name already exists as the new kind: almost always the same one, saved twice.
		const { data: twins } = await this.db
			.from('knowledge_entities')
			.select('id, name')
			.eq('owner_user_id', this.userId)
			.eq('status', 'active')
			.eq('kind', kind)
			.eq('normalized_name', row.normalized_name)
			.neq('id', id)
			.limit(5);
		for (const twin of (twins ?? []) as Array<{ id: string; name: string }>) {
			result.same_name.push({ id: twin.id, name: twin.name });
			await this.addMergeCandidate(id, twin.id, {
				reason: `Same name, and both are now a ${KNOWLEDGE_KIND_DEFINITIONS[kind].label.toLowerCase()}`,
				origin: 'name',
				score: 0.9
			}).catch(() => undefined); // the question is a convenience; the change already happened
		}
		return result;
	}

	async deleteEntity(id: string): Promise<void> {
		const { data, error } = await this.db
			.from('knowledge_entities')
			.delete()
			.eq('id', id)
			.eq('owner_user_id', this.userId)
			.eq('is_self', false)
			.select('id');
		if (error) throw dbError('Delete entity', error);
		if (!data?.length) throw new KnowledgeStoreError('Entity not found.', 'NOT_FOUND');
	}

	async setFactStatus(factId: string, status: KnowledgeFactStatus): Promise<void> {
		const { data, error } = await this.db
			.from('knowledge_facts')
			.update({ status })
			.eq('id', factId)
			.eq('owner_user_id', this.userId)
			.select('id, entity_id, predicate, object_entity_id');
		if (error) throw dbError('Update fact', error);
		const fact = (data ?? [])[0] as
			| { id: string; entity_id: string; predicate: string; object_entity_id: string | null }
			| undefined;
		if (!fact) throw new KnowledgeStoreError('Fact not found.', 'NOT_FOUND');
		// Keeping a value for a one-value field (birthday, headline…) retires the one it replaces.
		if (
			status === 'active' &&
			!fact.object_entity_id &&
			getKnowledgePredicate(fact.predicate)?.cardinality === 'one'
		) {
			const { error: retireError } = await this.db
				.from('knowledge_facts')
				.update({ status: 'superseded' })
				.eq('entity_id', fact.entity_id)
				.eq('predicate', fact.predicate)
				.eq('owner_user_id', this.userId)
				.eq('status', 'active')
				.neq('id', fact.id);
			if (retireError) throw dbError('Retire replaced value', retireError);
		}
	}

	async deleteFact(factId: string): Promise<void> {
		const { data, error } = await this.db
			.from('knowledge_facts')
			.delete()
			.eq('id', factId)
			.eq('owner_user_id', this.userId)
			.select('id');
		if (error) throw dbError('Delete fact', error);
		if (!data?.length) throw new KnowledgeStoreError('Fact not found.', 'NOT_FOUND');
	}

	async merge(keepId: string, mergeId: string): Promise<Record<string, unknown>> {
		const { data, error } = await this.db.rpc('knowledge_merge_entities', {
			p_keep: keepId,
			p_merge: mergeId,
			p_viewer: this.userId
		});
		if (error) throw dbError('Merge', error);
		return (data ?? {}) as Record<string, unknown>;
	}

	/** Fold several entries into one, one at a time; a failure doesn't stop the rest. */
	async mergeMany(
		keepId: string,
		mergeIds: string[]
	): Promise<{ kept: string; merged: string[]; failed: Array<{ id: string; error: string }> }> {
		const merged: string[] = [];
		const failed: Array<{ id: string; error: string }> = [];
		for (const id of unique(mergeIds)) {
			if (id === keepId) continue;
			try {
				await this.merge(keepId, id);
				merged.push(id);
			} catch (error) {
				failed.push({ id, error: error instanceof Error ? error.message : String(error) });
			}
		}
		return { kept: keepId, merged, failed };
	}

	/**
	 * What merging these entries would move: each one's links, tags and details, plus which one
	 * to keep (a shared entry if there is one, since only your own can be folded away; else the
	 * one with the most attached, then the oldest).
	 */
	async mergePreview(ids: string[]): Promise<KnowledgeMergePreview> {
		const wanted = unique(ids).slice(0, MERGE_MAX + 1);
		if (!wanted.length) return { entries: [], suggested_keep: null };
		const { data, error } = await this.db
			.from('knowledge_entities')
			.select(ENTITY_COLUMNS + ', created_at, created_via, circle')
			.in('id', wanted)
			.eq('status', 'active');
		if (error) throw dbError('Load entries to merge', error);
		const rows = (
			(data ?? []) as Array<
				EntityRow & { created_at: string; created_via: string; circle?: string | null }
			>
		).filter((r) => r.scope === 'public' || r.owner_user_id === this.userId);
		const found = rows.map((r) => r.id);
		const countBy = async (table: string, liveFactsOnly = false) => {
			const counts = new Map<string, number>();
			if (!found.length) return counts;
			const base = this.db
				.from(table)
				.select('entity_id')
				.eq('owner_user_id', this.userId)
				.in('entity_id', found);
			const res = await (
				liveFactsOnly ? base.in('status', ['active', 'suggested', 'disputed']) : base
			).limit(5000);
			if (res.error) throw dbError(`Count ${table}`, res.error);
			for (const row of (res.data ?? []) as Array<{ entity_id: string }>)
				counts.set(row.entity_id, (counts.get(row.entity_id) ?? 0) + 1);
			return counts;
		};
		const [facts, links, mentions] = await Promise.all([
			countBy('knowledge_facts', true),
			countBy('knowledge_record_links'),
			countBy('knowledge_mentions')
		]);
		const entries: KnowledgeMergePreviewEntry[] = rows
			.map((r) => ({
				...summarize(r),
				created_at: r.created_at,
				created_via: r.created_via,
				circle: r.circle ?? null,
				mergeable: r.scope === 'private' && r.owner_user_id === this.userId && !r.is_self,
				facts: facts.get(r.id) ?? 0,
				links: links.get(r.id) ?? 0,
				mentions: mentions.get(r.id) ?? 0
			}))
			.sort((a, b) => wanted.indexOf(a.id) - wanted.indexOf(b.id));
		const weight = (e: KnowledgeMergePreviewEntry) =>
			// A shared entry can only be kept; "you" never absorbs someone else.
			(e.is_self ? -1e10 : e.mergeable ? 0 : 1e9) + e.links + e.mentions + e.facts;
		const best = [...entries].sort(
			(a, b) => weight(b) - weight(a) || a.created_at.localeCompare(b.created_at)
		)[0];
		return { entries, suggested_keep: best?.id ?? null };
	}

	/**
	 * Your own entries that share a kind and exact name ("Craig" ×2): the duplicates review offers
	 * each group as one merge. A pair you already answered "Different" never comes back.
	 */
	async listNameTwins(limit = 50): Promise<KnowledgeNameTwins[]> {
		type TwinRow = {
			id: string;
			kind: KnowledgeKind;
			name: string;
			normalized_name: string;
			created_at: string;
		};
		const rows: TwinRow[] = [];
		for (let from = 0; from < 20_000; from += PAGE) {
			const { data, error } = await this.db
				.from('knowledge_entities')
				.select('id, kind, name, normalized_name, created_at')
				.eq('owner_user_id', this.userId)
				.eq('status', 'active')
				.eq('scope', 'private')
				.eq('is_self', false)
				.order('created_at', { ascending: true })
				.range(from, from + PAGE - 1);
			if (error) throw dbError('Load names', error);
			const page = (data ?? []) as TwinRow[];
			rows.push(...page);
			if (page.length < PAGE) break;
		}
		const groups = new Map<string, TwinRow[]>();
		for (const row of rows) {
			if (!row.normalized_name) continue;
			const key = `${row.kind}|${row.normalized_name}`;
			groups.set(key, [...(groups.get(key) ?? []), row]);
		}
		const twins = [...groups.values()].filter((g) => g.length > 1);
		if (!twins.length) return [];
		const ids = twins.flat().map((r) => r.id);
		const rejected = new Set<string>();
		await mapChunks(ids, ID_CHUNK, async (group) => {
			const { data, error } = await this.db
				.from('knowledge_merge_candidates')
				.select('entity_a, entity_b')
				.eq('owner_user_id', this.userId)
				.eq('status', 'rejected')
				.in('entity_a', group);
			if (error) throw dbError('Load answered pairs', error);
			for (const r of (data ?? []) as Array<{ entity_a: string; entity_b: string }>) {
				rejected.add(`${r.entity_a}|${r.entity_b}`);
				rejected.add(`${r.entity_b}|${r.entity_a}`);
			}
			return [];
		});
		return twins
			.filter((g) => {
				// Hidden only when every pair in the group was answered "Different".
				for (let i = 0; i < g.length; i++)
					for (let j = i + 1; j < g.length; j++)
						if (!rejected.has(`${g[i]!.id}|${g[j]!.id}`)) return true;
				return false;
			})
			.sort((a, b) => b.length - a.length || a[0]!.name.localeCompare(b[0]!.name))
			.slice(0, limit)
			.map((g) => ({ kind: g[0]!.kind, name: g[0]!.name, ids: g.map((r) => r.id) }));
	}

	/**
	 * A new private entry, never matched to an existing one by name (identity questions need a
	 * separate entry for "the other Jev"). Returns its id.
	 */
	async createEntry(input: {
		kind: KnowledgeKind;
		name: string;
		via: KnowledgeCreatedVia;
		summary?: string | null;
		circle?: KnowledgeCircle;
	}): Promise<string> {
		if (!isKnowledgeKind(input.kind)) throw new KnowledgeStoreError('Unknown kind.', 'INVALID');
		const name = input.name.trim();
		if (!name || name.length > 300)
			throw new KnowledgeStoreError('Name must be 1–300 characters.', 'INVALID');
		const row: Record<string, unknown> = {
			kind: input.kind,
			name,
			summary: input.summary?.trim().slice(0, 300) || null,
			scope: 'private',
			owner_user_id: this.userId,
			created_via: input.via
		};
		const circle = input.circle
			? {
					circle: input.circle,
					circle_source: 'signals',
					circle_set_at: new Date().toISOString()
				}
			: {};
		let res = await this.db
			.from('knowledge_entities')
			.insert({ ...row, ...circle })
			.select('id')
			.single();
		// Before the circles migration (20261118100000): create without the circle.
		if (res.error && input.circle && (res.error as { code?: string }).code === '42703')
			res = await this.db.from('knowledge_entities').insert(row).select('id').single();
		if (res.error) throw dbError('Create entry', res.error);
		return res.data.id as string;
	}

	/**
	 * Ask the user whether two entries are the same (the duplicates review on /knowledge). An
	 * existing pending question for the pair is left as it is.
	 */
	async addMergeCandidate(
		a: string,
		b: string,
		options: {
			reason: string;
			question?: string | null;
			origin?: 'name' | 'identity';
			score?: number;
		}
	): Promise<void> {
		if (!UUID.test(a) || !UUID.test(b) || a === b)
			throw new KnowledgeStoreError('Pick two different entries.', 'INVALID');
		const rows = await this.loadEntities([a, b]);
		if (!rows.get(a) || !rows.get(b))
			throw new KnowledgeStoreError('Entry not found.', 'NOT_FOUND');
		const [first, second] = a < b ? [a, b] : [b, a];
		const base = {
			owner_user_id: this.userId,
			entity_a: first,
			entity_b: second,
			reason: options.reason.trim().slice(0, 500) || 'Same one?',
			score: Math.min(Math.max(options.score ?? 0.5, 0), 1)
		};
		const extra = {
			...(options.question?.trim()
				? { question: options.question.trim().slice(0, 300) }
				: {}),
			origin: options.origin ?? 'name'
		};
		let { error } = await this.db.from('knowledge_merge_candidates').upsert(
			{ ...base, ...extra },
			{
				onConflict: 'owner_user_id,entity_a,entity_b',
				ignoreDuplicates: true
			}
		);
		if (error && (error as { code?: string }).code === '42703') {
			({ error } = await this.db.from('knowledge_merge_candidates').upsert(base, {
				onConflict: 'owner_user_id,entity_a,entity_b',
				ignoreDuplicates: true
			}));
		}
		if (error) throw dbError('Save merge candidate', error);
	}

	/** "Not this one" hints for an entry (and for entries merged into it). Newest first. */
	async listResearchHints(entityId: string): Promise<KnowledgeResearchHint[]> {
		if (!UUID.test(entityId)) return [];
		const { data: merged } = await this.db
			.from('knowledge_entities')
			.select('id')
			.eq('merged_into_id', entityId)
			.eq('owner_user_id', this.userId);
		const ids = [entityId, ...((merged ?? []) as Array<{ id: string }>).map((r) => r.id)];
		const { data, error } = await this.db
			.from('knowledge_research_hints')
			.select('id, label, domains, urls, run_id, created_at')
			.in('entity_id', ids)
			.eq('owner_user_id', this.userId)
			.order('created_at', { ascending: false })
			.limit(20);
		if (error) {
			// Before the migration (20261118100000) there are no hints.
			if ((error as { code?: string }).code === '42P01') return [];
			throw dbError('Load research hints', error);
		}
		return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
			id: row.id as string,
			label: row.label as string,
			domains: (row.domains as string[] | null) ?? [],
			urls: (row.urls as string[] | null) ?? [],
			run_id: (row.run_id as string | null) ?? null,
			created_at: row.created_at as string
		}));
	}

	/**
	 * "Not this one": retract every fact one research run added to this entry, hide entries that
	 * run created which nothing else uses, and remember what the entry is not (a label from the
	 * retracted place and website, the run's website domain, and the pages it read) so the next
	 * research skips it. Returns what changed.
	 */
	async rejectResearchRun(
		entityId: string,
		runId: string
	): Promise<{ retracted: number; hidden: number; hint: KnowledgeResearchHint | null }> {
		if (!UUID.test(entityId) || !UUID.test(runId))
			throw new KnowledgeStoreError('Invalid id.', 'INVALID');
		const entity = (await this.loadEntities([entityId])).get(entityId);
		if (!entity) throw new KnowledgeStoreError('Entry not found.', 'NOT_FOUND');
		const { data: factData, error } = await this.db
			.from('knowledge_facts')
			.select('id, predicate, object_entity_id, value_text, status')
			.eq('entity_id', entity.id)
			.eq('run_id', runId)
			.eq('owner_user_id', this.userId);
		if (error) throw dbError('Load research facts', error);
		const facts = (
			(factData ?? []) as Array<{
				id: string;
				predicate: string;
				object_entity_id: string | null;
				value_text: string | null;
				status: KnowledgeFactStatus;
			}>
		).filter((f) => f.status !== 'retracted');

		const sources = await this.loadCitations(facts.map((f) => f.id));
		const objectIds = unique(
			facts.map((f) => f.object_entity_id).filter((x): x is string => Boolean(x))
		);
		const objects = await this.loadEntities(objectIds);
		let place: string | null = null;
		let homepage: string | null = null;
		for (const fact of facts) {
			if (fact.predicate === 'located_in' && fact.object_entity_id && !place)
				place = objects.get(fact.object_entity_id)?.name ?? null;
			if (fact.predicate === 'homepage' && fact.value_text && !homepage)
				homepage = domainOf(fact.value_text);
		}
		const pageUrls = unique(
			[...sources.values()]
				.flat()
				.map((s) => s.url)
				.filter((u): u is string => Boolean(u))
		).filter((u) => !u.startsWith('https://www.google.com/search'));
		if (!homepage && !place && !pageUrls.length && !facts.length)
			return { retracted: 0, hidden: 0, hint: null };

		if (facts.length) {
			for (const group of chunk(
				facts.map((f) => f.id),
				ID_CHUNK
			)) {
				const { error: retractError } = await this.db
					.from('knowledge_facts')
					.update({ status: 'retracted' })
					.in('id', group)
					.eq('owner_user_id', this.userId);
				if (retractError) throw dbError('Retract research', retractError);
			}
			await this.restoreReplacedValues(entity, facts);
		}

		// Entries this run created (e.g. the wrong company's town) that nothing else uses.
		let hidden = 0;
		if (objectIds.length) {
			const { data: ownRows } = await this.db
				.from('knowledge_entities')
				.select('id, created_via, status')
				.in('id', objectIds)
				.eq('owner_user_id', this.userId);
			const candidates = (
				(ownRows ?? []) as Array<{ id: string; created_via: string; status: string }>
			)
				.filter((r) => r.created_via === 'enrichment' && r.status === 'active')
				.map((r) => r.id);
			for (const id of candidates) {
				const [asSubject, asObject, links] = await Promise.all([
					this.db
						.from('knowledge_facts')
						.select('id')
						.eq('entity_id', id)
						.in('status', VISIBLE_FACT_STATUSES)
						.limit(1),
					this.db
						.from('knowledge_facts')
						.select('id')
						.eq('object_entity_id', id)
						.in('status', VISIBLE_FACT_STATUSES)
						.limit(1),
					this.db.from('knowledge_record_links').select('id').eq('entity_id', id).limit(1)
				]);
				const used = [asSubject, asObject, links].some(
					(r) => ((r.data ?? []) as unknown[]).length > 0
				);
				if (used) continue;
				const { error: hideError } = await this.db
					.from('knowledge_entities')
					.update({ status: 'hidden' })
					.eq('id', id)
					.eq('owner_user_id', this.userId);
				if (!hideError) hidden++;
			}
		}

		const label =
			`not the ${entity.name}${place ? ` in ${place}` : ''}${homepage ? ` (${homepage})` : ''}`.slice(
				0,
				300
			);
		const hintRow = {
			owner_user_id: this.userId,
			entity_id: entity.id,
			label,
			// A whole domain only when the run claimed it as the entry's website; the pages it read
			// are excluded one by one (a directory or LinkedIn page must not block the whole site).
			domains: homepage ? [homepage] : [],
			urls: pageUrls.slice(0, 20),
			run_id: runId
		};
		const { data: hintData, error: hintError } = await this.db
			.from('knowledge_research_hints')
			.insert(hintRow)
			.select('id, label, domains, urls, run_id, created_at')
			.single();
		if (hintError) {
			if ((hintError as { code?: string }).code === '42P01')
				return { retracted: facts.length, hidden, hint: null };
			throw dbError('Save research hint', hintError);
		}
		return {
			retracted: facts.length,
			hidden,
			hint: {
				id: hintData.id,
				label: hintData.label,
				domains: hintData.domains ?? [],
				urls: hintData.urls ?? [],
				run_id: hintData.run_id ?? null,
				created_at: hintData.created_at
			}
		};
	}

	/**
	 * After wrong research is retracted, bring back what it replaced: for each one-value field
	 * (headline, birthday…) the run had made current, the newest earlier value becomes current
	 * again, and the card summary follows the headline.
	 */
	private async restoreReplacedValues(
		entity: EntityRow,
		retracted: Array<{
			id: string;
			predicate: string;
			object_entity_id: string | null;
			value_text: string | null;
			status: KnowledgeFactStatus;
		}>
	): Promise<void> {
		const retractedIds = new Set(retracted.map((f) => f.id));
		const predicates = unique(
			retracted
				.filter(
					(f) =>
						f.status === 'active' &&
						!f.object_entity_id &&
						getKnowledgePredicate(f.predicate)?.cardinality === 'one'
				)
				.map((f) => f.predicate)
		);
		for (const predicate of predicates) {
			const { data, error } = await this.db
				.from('knowledge_facts')
				.select('id, value_text, status')
				.eq('entity_id', entity.id)
				.eq('predicate', predicate)
				.eq('owner_user_id', this.userId)
				.in('status', ['active', 'superseded'])
				.order('created_at', { ascending: false })
				.limit(20);
			if (error) throw dbError('Load replaced values', error);
			const rows = (
				(data ?? []) as Array<{
					id: string;
					value_text: string | null;
					status: KnowledgeFactStatus;
				}>
			).filter((row) => !retractedIds.has(row.id));
			let current = rows.find((row) => row.status === 'active') ?? null;
			if (!current) {
				const previous = rows.find((row) => row.status === 'superseded') ?? null;
				if (previous) {
					const { error: restoreError } = await this.db
						.from('knowledge_facts')
						.update({ status: 'active' })
						.eq('id', previous.id)
						.eq('owner_user_id', this.userId);
					if (restoreError) throw dbError('Restore replaced value', restoreError);
					current = previous;
				}
			}
			if (predicate !== 'headline' || entity.owner_user_id !== this.userId) continue;
			const summary = current?.value_text?.slice(0, 300) ?? null;
			const wrongSummary = retracted.some(
				(f) => f.predicate === 'headline' && f.value_text?.slice(0, 300) === entity.summary
			);
			// Only undo a summary the wrong headline wrote; a hand-edited one stays.
			if (!wrongSummary || summary === entity.summary) continue;
			const { error: summaryError } = await this.db
				.from('knowledge_entities')
				.update({ summary })
				.eq('id', entity.id)
				.eq('owner_user_id', this.userId);
			if (summaryError) throw dbError('Restore summary', summaryError);
			entity.summary = summary;
		}
	}

	/** "Different people" for a same-name group: every pair is answered, so none comes back. */
	async markDifferent(ids: string[]): Promise<void> {
		const list = unique(ids).filter((id) => UUID.test(id));
		if (list.length < 2 || list.length > MERGE_MAX + 1)
			throw new KnowledgeStoreError('Pick two or more entries.', 'INVALID');
		const own = await this.loadEntities(list);
		if (list.some((id) => own.get(id)?.owner_user_id !== this.userId))
			throw new KnowledgeStoreError('Entry not found.', 'NOT_FOUND');
		const now = new Date().toISOString();
		const rows: Array<Record<string, unknown>> = [];
		for (let i = 0; i < list.length; i++)
			for (let j = i + 1; j < list.length; j++) {
				const [a, b] = list[i]! < list[j]! ? [list[i]!, list[j]!] : [list[j]!, list[i]!];
				rows.push({
					owner_user_id: this.userId,
					entity_a: a,
					entity_b: b,
					reason: 'Same name',
					score: 0.5,
					status: 'rejected',
					resolved_at: now
				});
			}
		const { error } = await this.db
			.from('knowledge_merge_candidates')
			.upsert(rows, { onConflict: 'owner_user_id,entity_a,entity_b' });
		if (error) throw dbError('Save answer', error);
	}

	async resolveMergeCandidate(id: string, status: 'rejected'): Promise<void> {
		const { error } = await this.db
			.from('knowledge_merge_candidates')
			.update({ status, resolved_at: new Date().toISOString() })
			.eq('id', id)
			.eq('owner_user_id', this.userId);
		if (error) throw dbError('Resolve merge candidate', error);
	}

	// -------------------------------------------------------------------------
	// Reads

	async search(
		query: string,
		options: { kinds?: KnowledgeKind[]; limit?: number } = {}
	): Promise<Array<KnowledgeEntitySummary & { matched_on: string; score: number }>> {
		const { data, error } = await this.db.rpc('knowledge_search', {
			p_query: query,
			p_kinds: options.kinds?.length ? options.kinds : null,
			p_limit: Math.min(Math.max(options.limit ?? 20, 1), 100),
			p_viewer: this.userId
		});
		if (error) throw dbError('Search', error);
		return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
			id: row.entity_id as string,
			kind: row.kind as KnowledgeKind,
			name: row.name as string,
			summary: (row.summary as string | null) ?? null,
			scope: row.scope as KnowledgeScope,
			is_self: Boolean(row.is_self),
			image_url: null,
			matched_on: row.matched_on as string,
			score: Number(row.score)
		}));
	}

	/** Ids of entities the user's own entity points at with a predicate (knows, owns). */
	private async selfObjects(predicate: 'knows' | 'owns'): Promise<Set<string>> {
		const selfId = await this.findSelfId();
		const ids = new Set<string>();
		if (!selfId) return ids;
		for (let from = 0; ; from += 1000) {
			const { data, error } = await this.db
				.from('knowledge_facts')
				.select('object_entity_id')
				.eq('entity_id', selfId)
				.eq('predicate', predicate)
				.eq('owner_user_id', this.userId)
				.in('status', VISIBLE_FACT_STATUSES)
				.order('id')
				.range(from, from + PAGE - 1);
			if (error) throw dbError('Load self relationships', error);
			for (const row of (data ?? []) as Array<{ object_entity_id: string | null }>) {
				if (row.object_entity_id) ids.add(row.object_entity_id);
			}
			if ((data ?? []).length < 1000) break;
		}
		return ids;
	}

	/**
	 * Browse the user's graph: their private entities plus public entities they have recorded
	 * something about, newest first, with per-kind counts and how many people they know. One
	 * database call (knowledge_list).
	 */
	async list(options: KnowledgeListOptions = {}): Promise<KnowledgeListResult> {
		const kinds = options.kinds?.filter(isKnowledgeKind);
		const { data, error } = await this.db.rpc('knowledge_list', {
			p_kinds: kinds?.length ? kinds : null,
			p_filter: options.filter ?? 'all',
			p_query: options.query?.trim() || null,
			p_limit: Math.min(Math.max(options.limit ?? 50, 1), 500),
			p_offset: Math.max(options.offset ?? 0, 0),
			p_viewer: this.userId,
			// Sent only when set, so the list keeps working against a database without the
			// research filter yet (20261117100000).
			...(options.researched && options.researched !== 'any'
				? { p_researched: options.researched }
				: {}),
			...(options.sort && options.sort !== 'recent' ? { p_sort: options.sort } : {}),
			// Sent only when it flips the sort, so the usual directions keep working against a
			// database without p_dir yet (20261122004500).
			...(options.dir && options.dir !== knowledgeSortDefaultDir(options.sort ?? 'recent')
				? { p_dir: options.dir }
				: {}),
			// Same for views and places (20261118400000).
			...(options.view && options.view !== 'all' ? { p_view: options.view } : {}),
			...(options.place && UUID.test(options.place) ? { p_place: options.place } : {})
		});
		if (error) throw dbError('List entities', error);
		const result = (data ?? {}) as Partial<KnowledgeListResult>;
		return {
			entities: result.entities ?? [],
			total: Number(result.total ?? 0),
			counts: result.counts ?? {},
			known_count: Number(result.known_count ?? 0),
			...(result.views
				? {
						views: {
							world: Number(result.views.world ?? 0),
							reference: Number(result.views.reference ?? 0),
							dropped: Number(result.views.dropped ?? 0)
						}
					}
				: {}),
			...(result.places ? { places: result.places } : {}),
			...(result.researched
				? {
						researched: {
							yes: Number(result.researched.yes ?? 0),
							no: Number(result.researched.no ?? 0)
						}
					}
				: {})
		};
	}

	async getEntity(id: string): Promise<KnowledgeEntityDetail | null> {
		if (!UUID.test(id)) return null;
		const { data: entityRow, error } = await this.db
			.from('knowledge_entities')
			.select(
				ENTITY_COLUMNS +
					', created_via, enriched_at, created_at, updated_at, circle, circle_source, hidden_reason'
			)
			.eq('id', id)
			.or(this.visible)
			.maybeSingle();
		if (error) throw dbError('Load entity', error);
		if (!entityRow) return null;
		const row = entityRow as EntityRow & {
			created_via: KnowledgeCreatedVia;
			enriched_at: string | null;
			created_at: string;
			updated_at: string;
			circle?: KnowledgeCircle;
			circle_source?: KnowledgeCircleSource | null;
			hidden_reason?: string | null;
		};
		const own = row.owner_user_id === this.userId;
		if (row.status === 'merged' && row.merged_into_id)
			return this.getEntity(row.merged_into_id);
		if (row.status === 'hidden' && row.owner_user_id !== this.userId) return null;

		const selfId = row.kind === 'person' ? await this.findSelfId() : null;
		const [outgoing, incoming, links, targets, known] = await Promise.all([
			this.db
				.from('knowledge_facts')
				.select(FACT_COLUMNS)
				.eq('entity_id', id)
				.or(this.visible)
				.neq('status', 'retracted')
				.order('observed_at', { ascending: false })
				.limit(1000),
			this.db
				.from('knowledge_facts')
				.select(FACT_COLUMNS)
				.eq('object_entity_id', id)
				.or(this.visible)
				.in('status', VISIBLE_FACT_STATUSES)
				.order('observed_at', { ascending: false })
				.limit(MAX_INCOMING + 1),
			this.db
				.from('knowledge_record_links')
				.select('id, record_kind, record_id, quote, created_via, created_at')
				.eq('entity_id', id)
				.eq('owner_user_id', this.userId)
				.order('created_at', { ascending: false })
				.limit(100),
			this.db
				.from('knowledge_run_targets')
				.select(
					'run_id, status, fields, summary, facts_added, error, created_at, finished_at'
				)
				.eq('entity_id', id)
				.eq('owner_user_id', this.userId)
				.order('created_at', { ascending: false })
				.limit(10),
			selfId
				? this.db
						.from('knowledge_facts')
						.select('id')
						.eq('entity_id', selfId)
						.eq('predicate', 'knows')
						.eq('object_entity_id', id)
						.eq('owner_user_id', this.userId)
						.in('status', VISIBLE_FACT_STATUSES)
						.limit(1)
				: Promise.resolve({ data: [], error: null })
		]);
		for (const result of [outgoing, incoming, links, targets, known]) {
			if (result.error) throw dbError('Load entity detail', result.error);
		}
		const outRows = (outgoing.data ?? []) as FactRow[];
		const inRowsAll = (incoming.data ?? []) as FactRow[];
		const inRows = inRowsAll.slice(0, MAX_INCOMING);

		const [related, sources] = await Promise.all([
			this.getSummaries(
				unique([
					...outRows
						.map((f) => f.object_entity_id)
						.filter((x): x is string => Boolean(x)),
					...inRows.map((f) => f.entity_id)
				])
			),
			this.loadCitations([...outRows, ...inRows].map((f) => f.id))
		]);

		const view = (fact: FactRow, other: string | null): KnowledgeFactView => {
			const def = getKnowledgePredicate(fact.predicate);
			return {
				id: fact.id,
				predicate: fact.predicate,
				label:
					other && fact.object_entity_id !== other
						? (def?.inverseLabel ?? def?.label ?? fact.predicate)
						: (def?.label ?? fact.predicate),
				value: fact.value_text,
				entity: other ? (related.get(other) ?? null) : null,
				qualifiers: fact.qualifiers ?? {},
				scope: fact.scope,
				status: fact.status,
				confidence: fact.confidence,
				valid_from: fact.valid_from,
				valid_to: fact.valid_to,
				observed_at: fact.observed_at,
				created_via: fact.created_via,
				run_id: fact.run_id,
				sources: sources.get(fact.id) ?? []
			};
		};

		return {
			entity: {
				...summarize(row),
				status: row.status,
				created_via: row.created_via,
				enriched_at: row.enriched_at,
				created_at: row.created_at,
				updated_at: row.updated_at,
				// The viewer's own entries only: what the sorter (or they) decided.
				...(own && row.circle
					? {
							circle: row.circle,
							circle_source: row.circle_source ?? null,
							hidden_reason: row.hidden_reason ?? null
						}
					: {})
			},
			facts: outRows
				.filter((f) => !f.object_entity_id || related.has(f.object_entity_id))
				.map((f) => view(f, f.object_entity_id)),
			incoming: inRows
				.filter((f) => related.has(f.entity_id))
				.map((f) => view(f, f.entity_id)),
			incoming_truncated: inRowsAll.length > MAX_INCOMING,
			links: (links.data ?? []) as KnowledgeEntityDetail['links'],
			enrichment: (targets.data ?? []) as KnowledgeEntityDetail['enrichment'],
			known_by_me: ((known.data ?? []) as unknown[]).length > 0
		};
	}

	private async loadCitations(factIds: string[]): Promise<Map<string, KnowledgeSourceView[]>> {
		const out = new Map<string, KnowledgeSourceView[]>();
		type CitationRow = {
			fact_id: string;
			quote: string | null;
			source: {
				id: string;
				source_type: string;
				url: string | null;
				title: string | null;
				captured_at: string;
				scope: KnowledgeScope;
				owner_user_id: string | null;
			} | null;
		};
		const rows = await mapChunks(unique(factIds), ID_CHUNK, async (group) => {
			const { data, error } = await this.db
				.from('knowledge_fact_sources')
				.select(
					'fact_id, quote, source:knowledge_sources(id, source_type, url, title, captured_at, scope, owner_user_id)'
				)
				.in('fact_id', group);
			if (error) throw dbError('Load sources', error);
			return (data ?? []) as CitationRow[];
		});
		{
			for (const row of rows) {
				const s = row.source;
				if (!s || (s.scope === 'private' && s.owner_user_id !== this.userId)) continue;
				out.set(row.fact_id, [
					...(out.get(row.fact_id) ?? []),
					{
						id: s.id,
						type: s.source_type as KnowledgeSourceView['type'],
						url: s.url,
						title: s.title,
						quote: row.quote,
						captured_at: s.captured_at,
						scope: s.scope
					}
				]);
			}
		}
		return out;
	}

	async listMergeCandidates(limit = 50): Promise<
		Array<{
			id: string;
			reason: string;
			score: number;
			a: KnowledgeEntitySummary;
			b: KnowledgeEntitySummary;
			/** The question to show, when an identity check asked it. */
			question: string | null;
			origin: 'name' | 'identity';
			/** For identity questions: the entry the user already had (keep it on "Same"). */
			keep_id: string | null;
		}>
	> {
		type Row = {
			id: string;
			entity_a: string;
			entity_b: string;
			reason: string;
			score: number;
			question?: string | null;
			origin?: 'name' | 'identity';
		};
		const read = (columns: string) =>
			this.db
				.from('knowledge_merge_candidates')
				.select(columns)
				.eq('owner_user_id', this.userId)
				.eq('status', 'pending')
				.order('created_at', { ascending: false })
				.limit(Math.min(limit, 200));
		let res = await read('id, entity_a, entity_b, reason, score, question, origin');
		// Before 20261118100000 there is no question/origin.
		if (res.error && (res.error as { code?: string }).code === '42703')
			res = await read('id, entity_a, entity_b, reason, score');
		if (res.error) throw dbError('Load merge candidates', res.error);
		const rows = (res.data ?? []) as Row[];
		const ids = rows.flatMap((r) => [r.entity_a, r.entity_b]);
		const summaries = await this.getSummaries(ids);
		// Which side is the original: not the public identity the check created, else the older.
		const created = new Map<string, string>();
		if (rows.some((r) => r.origin === 'identity')) {
			const { data } = await this.db
				.from('knowledge_entities')
				.select('id, created_at, circle')
				.in('id', unique(ids));
			for (const row of (data ?? []) as Array<{
				id: string;
				created_at: string;
				circle?: string;
			}>)
				created.set(row.id, `${row.circle === 'public' ? '1' : '0'}|${row.created_at}`);
		}
		return rows
			.filter(
				(r) =>
					summaries.has(r.entity_a) &&
					summaries.has(r.entity_b) &&
					summaries.get(r.entity_a)!.id !== summaries.get(r.entity_b)!.id
			)
			.map((r) => {
				const a = summaries.get(r.entity_a)!;
				const b = summaries.get(r.entity_b)!;
				const origin = r.origin ?? 'name';
				const keep =
					origin === 'identity'
						? (created.get(r.entity_a) ?? '') <= (created.get(r.entity_b) ?? '')
							? a.id
							: b.id
						: null;
				return {
					id: r.id,
					reason: r.reason,
					score: r.score,
					a,
					b,
					question: r.question ?? null,
					origin,
					keep_id: keep
				};
			});
	}

	// -------------------------------------------------------------------------
	// Structured query

	async query(spec: KnowledgeQuerySpec): Promise<KnowledgeQueryResult> {
		const notes: string[] = [];
		const limit = Math.min(Math.max(spec.limit ?? 50, 1), MAX_QUERY_ROWS);
		const follow = (spec.follow ?? []).slice(0, 2);
		if ((spec.follow ?? []).length > 2) notes.push('Only the first two steps were followed.');
		for (const step of follow) {
			const def = getKnowledgePredicate(step.predicate);
			if (!def || def.valueType !== 'entity') {
				throw new KnowledgeStoreError(
					`"${step.predicate}" is not a relationship that can be followed.`,
					'INVALID'
				);
			}
		}
		const fields = unique(
			(spec.fields ?? []).filter((f) => {
				const def = getKnowledgePredicate(f);
				if (!def) notes.push(`Unknown field "${f}" was skipped.`);
				return Boolean(def);
			})
		).slice(0, 12);

		// Start set.
		let startIds: string[] = [];
		const startKinds = spec.start.kinds?.filter(isKnowledgeKind);
		if (spec.start.entity_ids?.length) {
			startIds = spec.start.entity_ids.filter((id) => UUID.test(id)).slice(0, MAX_FRONTIER);
		} else if (spec.start.search?.trim()) {
			const hits = await this.search(spec.start.search, {
				...(startKinds ? { kinds: startKinds } : {}),
				limit: 10
			});
			// A name search seeds from the best match(es): the top hit plus any equally strong ones.
			const top = hits[0]?.score ?? 0;
			startIds = hits
				.filter((h) => h.score >= top - 0.05)
				.slice(0, 5)
				.map((h) => h.id);
			if (!startIds.length)
				notes.push(`Nothing in your knowledge matched "${spec.start.search}".`);
		} else if (spec.start.known_by_me || spec.start.owned_by_me) {
			const set = spec.start.known_by_me
				? await this.selfObjects('knows')
				: await this.selfObjects('owns');
			startIds = [...set];
		} else if (startKinds?.length) {
			const listed = await this.list({ kinds: startKinds, limit: MAX_FRONTIER });
			startIds = listed.entities.map((e) => e.id);
		} else {
			throw new KnowledgeStoreError(
				'Start needs entity_ids, search, kinds, known_by_me or owned_by_me.',
				'INVALID'
			);
		}
		const startRows = await this.loadEntities(startIds);
		let frontier = new Map<string, KnowledgeQueryPathStep[]>();
		for (const id of startIds) {
			const row = startRows.get(id);
			if (!row) continue;
			if (
				startKinds?.length &&
				!spec.start.entity_ids?.length &&
				!startKinds.includes(row.kind)
			)
				continue;
			frontier.set(row.id, []);
		}
		const startCount = frontier.size;
		let truncated = false;

		// Hops.
		for (const step of follow) {
			const direction = step.direction ?? 'out';
			const next = new Map<string, KnowledgeQueryPathStep[]>();
			const ids = [...frontier.keys()];
			const edges: FactRow[] = [];
			for (const group of chunk(ids, ID_CHUNK)) {
				const { data, error } = await this.db
					.from('knowledge_facts')
					.select(FACT_COLUMNS)
					.eq('predicate', step.predicate)
					.in(direction === 'out' ? 'entity_id' : 'object_entity_id', group)
					.or(this.visible)
					.in('status', VISIBLE_FACT_STATUSES)
					.limit(1000);
				if (error) throw dbError('Follow relationships', error);
				edges.push(...((data ?? []) as FactRow[]));
				if ((data ?? []).length >= 1000) truncated = true;
			}
			const otherIds = unique(
				edges.map((e) => (direction === 'out' ? e.object_entity_id! : e.entity_id))
			);
			const others = await this.loadEntities(otherIds);
			for (const edge of edges) {
				const from = direction === 'out' ? edge.entity_id : edge.object_entity_id!;
				const to = others.get(
					direction === 'out' ? edge.object_entity_id! : edge.entity_id
				);
				if (!to || to.is_self || (step.kinds?.length && !step.kinds.includes(to.kind)))
					continue;
				if (next.has(to.id) || frontier.has(to.id)) continue;
				const fromPath = frontier.get(from) ?? [];
				next.set(to.id, [
					...fromPath,
					{
						predicate: step.predicate,
						direction,
						entity: summarize(to),
						qualifiers: edge.qualifiers ?? {}
					}
				]);
				if (next.size >= MAX_FRONTIER) {
					truncated = true;
					break;
				}
			}
			frontier = next;
		}

		// Filters.
		if (spec.where?.known_by_me) {
			const known = await this.selfObjects('knows');
			frontier = new Map([...frontier].filter(([id]) => known.has(id)));
		}
		if (spec.where?.owned_by_me) {
			const owned = await this.selfObjects('owns');
			frontier = new Map([...frontier].filter(([id]) => owned.has(id)));
		}

		const ids = [...frontier.keys()];
		if (ids.length > limit) truncated = true;
		const pageIds = ids.slice(0, limit);
		const rows = await this.loadEntities(pageIds);

		// Fields.
		const fieldValues = new Map<string, KnowledgeQueryRow['fields']>();
		if (fields.length && pageIds.length) {
			const factRows: FactRow[] = [];
			for (const group of chunk(pageIds, ID_CHUNK)) {
				const { data, error } = await this.db
					.from('knowledge_facts')
					.select(FACT_COLUMNS)
					.in('entity_id', group)
					.in('predicate', fields)
					.or(this.visible)
					.in('status', VISIBLE_FACT_STATUSES)
					.limit(1000);
				if (error) throw dbError('Load fields', error);
				factRows.push(...((data ?? []) as FactRow[]));
			}
			const objectNames = await this.getSummaries(
				factRows.map((f) => f.object_entity_id).filter((x): x is string => Boolean(x))
			);
			const citationCounts = await this.loadCitations(factRows.map((f) => f.id));
			for (const fact of factRows) {
				const value =
					fact.value_text ??
					(fact.object_entity_id ? objectNames.get(fact.object_entity_id)?.name : null);
				if (!value) continue;
				const entry = fieldValues.get(fact.entity_id) ?? {};
				entry[fact.predicate] = [
					...(entry[fact.predicate] ?? []),
					{
						value,
						qualifiers: fact.qualifiers ?? {},
						status: fact.status,
						source_count: citationCounts.get(fact.id)?.length ?? 0
					}
				];
				fieldValues.set(fact.entity_id, entry);
			}
		}

		const resultRows: KnowledgeQueryRow[] = pageIds
			.map((id) => rows.get(id))
			.filter((row): row is EntityRow => Boolean(row))
			.map((row) => ({
				entity: summarize(row),
				path: frontier.get(row.id) ?? [],
				fields: fieldValues.get(row.id) ?? {}
			}));
		const coverage: KnowledgeQueryResult['coverage'] = {};
		for (const field of fields) {
			const known = resultRows.filter((r) => (r.fields[field]?.length ?? 0) > 0).length;
			coverage[field] = { known, missing: resultRows.length - known };
		}
		return { rows: resultRows, coverage, start_count: startCount, truncated, notes };
	}
}

/** Run small independent writes a few at a time. */
/**
 * Entity resolution is lookup-then-insert across several requests, so two writes for the same
 * user at once (a brain dump queues one task-entity job per task, and the queue runs several
 * jobs in parallel) would each miss the other's new "Louis Arnette" and create a twin. Writes
 * for one user take turns within this process. Writers in other processes (web, chat worker)
 * can still race; a database-side resolve would close that gap.
 */
const resolveTurns = new Map<string, Promise<unknown>>();
async function serializePerUser<T>(userId: string, run: () => Promise<T>): Promise<T> {
	const previous = resolveTurns.get(userId) ?? Promise.resolve();
	const turn = previous.then(run, run);
	const settled = turn.then(
		() => undefined,
		() => undefined
	);
	resolveTurns.set(userId, settled);
	try {
		return await turn;
	} finally {
		if (resolveTurns.get(userId) === settled) resolveTurns.delete(userId);
	}
}

async function inParallel<T>(
	items: T[],
	fn: (item: T) => Promise<void>,
	width = 20
): Promise<void> {
	for (const group of chunk(items, width)) await Promise.all(group.map(fn));
}

function sanitizeQualifiers(
	input: Record<string, unknown> | undefined,
	allowed: readonly string[]
): Record<string, unknown> {
	if (!input || typeof input !== 'object') return {};
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(input)) {
		if (!allowed.includes(key)) continue;
		if (value === null || value === undefined || value === '') continue;
		if (typeof value === 'string') out[key] = value.slice(0, 300);
		else if (typeof value === 'number' || typeof value === 'boolean') out[key] = value;
	}
	return out;
}

function isoDateOrNull(value: string | undefined): string | null {
	if (!value) return null;
	return /^\d{4}-\d{2}-\d{2}$/.test(value)
		? value
		: /^\d{4}-\d{2}$/.test(value)
			? `${value}-01`
			: /^\d{4}$/.test(value)
				? `${value}-01-01`
				: null;
}
