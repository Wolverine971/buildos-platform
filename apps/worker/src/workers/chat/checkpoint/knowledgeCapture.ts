// apps/worker/src/workers/chat/checkpoint/knowledgeCapture.ts
//
// Chat wrap-up → knowledge graph (tasker 164). The third output of a chat checkpoint: the
// important things the chat taught us about named people and organizations, written to the
// user's private knowledge graph with the chat as the source, and undoable from the same
// receipt chip as the thinking log and START HERE.
//
//   1. Gate: one cheap structured decision ("any lasting facts about named people/orgs here?").
//      Most stretches have none and stop here.
//   2. Extract: one fast JSON call returns entities and facts, each with an exact quote.
//   3. Validate (knowledgePrompt.ts): quotes literally in the cited message, names literally in
//      the chat, web facts cite a page this chat's own search returned.
//   4. Identity: every entity passes the seam in knowledgeIdentity.ts; then what the chat says
//      about an entry the user already has goes through the shared identity check (same →
//      write, ask → a "same one?" question instead, different → a new entry). Web facts about
//      an entry nothing anchors are saved as suggestions.
//   5. Write through KnowledgeStore (via 'chat', private), then read back exactly what this
//      capture added or changed, for Undo.
//
// Web page text is never stored (chat tool results keep only URLs and titles), so a web fact's
// quote comes from the assistant message that reported it, and its source keeps the page URL.
import {
	type IdentityDecider,
	type KnowledgeDataClient,
	KnowledgeStore,
	type KnowledgeWriteBatch,
	type KnowledgeWriteFact,
	type KnowledgeWriteSource,
	getKnowledgePredicate,
	normalizeKnowledgeValue,
	recordIdentityQuestion
} from '@buildos/shared-agent-ops/knowledge';
import { knowledgeGrantValueKey } from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import type { JevDecider } from '@buildos/smart-llm';
import type { PromptMessage } from './capturePrompts';
import {
	CHAT_KNOWLEDGE_GATE_MIN_P,
	CHAT_KNOWLEDGE_GATE_QUESTIONS,
	CHAT_KNOWLEDGE_PROMPT_VERSION,
	CHAT_KNOWLEDGE_SYSTEM_PROMPT,
	type ChatKnowledgeDrop,
	type ChatWebPage,
	buildKnowledgeGateState,
	buildKnowledgeUserPrompt,
	labelMessages,
	validateChatKnowledge
} from './knowledgePrompt';
import {
	type ChatClaim,
	type LoadChatAnchors,
	type ResolveKnowledgeIdentity,
	checkChatClaims,
	resolveKnowledgeIdentity
} from './knowledgeIdentity';

export const CHAT_KNOWLEDGE_RECEIPT_VERSION = 1;

/**
 * Kill switch for the knowledge output alone (CHAT_CHECKPOINT_KNOWLEDGE_ENABLED=false). The
 * whole checkpoint has its own (CHAT_CHECKPOINT_CAPTURE_ENABLED), which also stops this.
 */
export function chatKnowledgeCaptureEnabled(
	value = process.env.CHAT_CHECKPOINT_KNOWLEDGE_ENABLED
): boolean {
	return value !== 'false';
}
const MAX_DROPS_IN_RECEIPT = 25;

/**
 * Stored in chat_capture_checkpoints.details.knowledge. Names, counts and question wording only:
 * no values, so a contact detail the user gave never lands in the receipt (or the job log);
 * personal details never raise a question.
 */
export type ChatKnowledgeReceipt = {
	version: typeof CHAT_KNOWLEDGE_RECEIPT_VERSION;
	capture_key: string;
	started_at: string;
	status: 'written' | 'nothing' | 'failed';
	gate: { ran: boolean; p_some: number | null; error: string | null };
	/** Entries this capture added facts to (or created), for the receipt chip. */
	entities: Array<{ id: string; name: string; kind: string; created: boolean; facts: number }>;
	/** Undo: facts this capture added (retracted on Undo). */
	fact_ids: string[];
	/**
	 * Undo: existing facts whose status this capture changed (`after`), with the status to put
	 * back (`status`). Undo touches one only while it still has the status this capture gave it.
	 */
	restore: Array<{ id: string; status: string; after: string }>;
	/** Undo: one-line summaries this capture changed (a new headline rewrites it). */
	summaries: Array<{ id: string; before: string | null; after: string | null }>;
	/** Undo: chat links this capture added. */
	link_ids: string[];
	/** Undo: the chat and web sources this capture recorded. */
	source_ids: string[];
	/**
	 * Undo: entries this capture created (deleted on Undo when nothing else uses them), including
	 * a "same one?" question's other entry (its pending question goes with it).
	 */
	created_entity_ids: string[];
	/** Facts saved to entries (the chip's "N details"); fact_ids also counts question details. */
	saved_facts: number;
	/** "Same one?" questions filed in the duplicates review instead of writing. */
	questions: Array<{
		entity_id: string;
		other_entity_id: string;
		name: string;
		question: string;
	}>;
	/** The identity check on claims about existing entries. */
	identity: {
		checked: number;
		asked: number;
		different: number;
		calls: number;
		cost_usd: number;
	};
	skipped_entities: Array<{ name: string; reason: string }>;
	dropped: ChatKnowledgeDrop[];
	error: string | null;
};

export type ChatKnowledgeCompleteJson = (params: {
	systemPrompt: string;
	userPrompt: string;
	userId: string;
	operation: 'knowledge';
	sessionId?: string;
	projectId?: string;
}) => Promise<unknown>;

export type ChatKnowledgePorts = {
	/** Service-role client (the store filters by user in code). */
	db: KnowledgeDataClient;
	/** The gate. Null (no key configured): go straight to extraction. */
	decider: JevDecider | null;
	completeJson: ChatKnowledgeCompleteJson;
	resolveIdentity?: ResolveKnowledgeIdentity;
	/** Tests: anchors per existing entry instead of reading the graph. */
	loadAnchors?: LoadChatAnchors;
	now?: () => Date;
};

export type ChatKnowledgeInput = {
	session: { id: string; userId: string; title: string | null };
	newMessages: readonly PromptMessage[];
	priorMessages: readonly PromptMessage[];
	webPages: readonly ChatWebPage[];
	throughMessageId: string;
	/**
	 * Content-free keys (knowledgeGrantValueKey) of values this chat only saw because another
	 * project member granted them (get_project_knowledge_lens, tasker 168). A candidate fact
	 * with the same normalized value is not copied into the user's own graph.
	 */
	grantedValueKeys?: ReadonlySet<string>;
};

type FactRow = {
	id: string;
	entity_id: string;
	predicate: string;
	object_entity_id: string | null;
	value_text: string | null;
	status: string;
	created_at?: string;
	created_via?: string;
};

function emptyReceipt(captureKey: string, startedAt: string): ChatKnowledgeReceipt {
	return {
		version: CHAT_KNOWLEDGE_RECEIPT_VERSION,
		capture_key: captureKey,
		started_at: startedAt,
		status: 'nothing',
		gate: { ran: false, p_some: null, error: null },
		entities: [],
		fact_ids: [],
		restore: [],
		summaries: [],
		link_ids: [],
		source_ids: [],
		created_entity_ids: [],
		saved_facts: 0,
		questions: [],
		identity: { checked: 0, asked: 0, different: 0, calls: 0, cost_usd: 0 },
		skipped_entities: [],
		dropped: [],
		error: null
	};
}

export function chatKnowledgeCaptureKey(sessionId: string, throughMessageId: string): string {
	return `chat:${sessionId}:${throughMessageId}`;
}

function factKey(
	entityId: string,
	predicate: string,
	objectId: string | null,
	value: string | null
) {
	return `${entityId}|${predicate}|${objectId ?? (value ?? '').trim().toLowerCase()}`;
}

async function selectFacts(db: KnowledgeDataClient, userId: string, entityIds: string[]) {
	if (!entityIds.length) return [] as FactRow[];
	const { data, error } = await db
		.from('knowledge_facts')
		.select(
			'id, entity_id, predicate, object_entity_id, value_text, status, created_at, created_via'
		)
		.eq('owner_user_id', userId)
		.in('entity_id', entityIds)
		.limit(2000);
	if (error) throw error;
	return (data ?? []) as FactRow[];
}

async function selectSummaries(db: KnowledgeDataClient, userId: string, entityIds: string[]) {
	if (!entityIds.length) return new Map<string, string | null>();
	const { data, error } = await db
		.from('knowledge_entities')
		.select('id, summary')
		.eq('owner_user_id', userId)
		.in('id', entityIds);
	if (error) throw error;
	return new Map(
		((data ?? []) as Array<{ id: string; summary: string | null }>).map((row) => [
			row.id,
			row.summary
		])
	);
}

async function selectSessionLinks(db: KnowledgeDataClient, userId: string, sessionId: string) {
	const { data, error } = await db
		.from('knowledge_record_links')
		.select('id, entity_id')
		.eq('owner_user_id', userId)
		.eq('record_kind', 'chat_session')
		.eq('record_id', sessionId);
	if (error) throw error;
	return (data ?? []) as Array<{ id: string; entity_id: string }>;
}

/**
 * Keep the finished receipt on this capture's chat source. If saving the checkpoint fails after
 * the knowledge was written, the retry returns this copy, with everything Undo needs (created
 * entries, links, restored statuses, summaries, questions), instead of a thinner rebuild.
 */
async function keepReceiptCopy(
	db: KnowledgeDataClient,
	userId: string,
	receipt: ChatKnowledgeReceipt
): Promise<void> {
	if (!receipt.source_ids.length) return;
	try {
		const { data } = await db
			.from('knowledge_sources')
			.select('id, source_type, meta')
			.eq('owner_user_id', userId)
			.in('id', receipt.source_ids);
		const chat = (
			(data ?? []) as Array<{ id: string; source_type: string; meta: unknown }>
		).find((row) => row.source_type === 'chat');
		if (!chat) return;
		await db
			.from('knowledge_sources')
			.update({ meta: { ...(asObject(chat.meta) ?? {}), receipt } })
			.eq('id', chat.id)
			.eq('owner_user_id', userId);
	} catch {
		// Best effort: a retry falls back to rebuilding from the facts.
	}
}

function asObject(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

/** The receipt an earlier attempt of this capture kept (see keepReceiptCopy). */
async function keptReceipt(
	db: KnowledgeDataClient,
	userId: string,
	captureKey: string
): Promise<ChatKnowledgeReceipt | null> {
	const { data, error } = await db
		.from('knowledge_sources')
		.select('meta')
		.eq('owner_user_id', userId)
		.eq('source_type', 'chat')
		.contains('meta', { capture_key: captureKey });
	if (error) throw error;
	for (const row of (data ?? []) as Array<{ meta: unknown }>) {
		const kept = asObject(asObject(row.meta)?.receipt);
		if (kept && kept.capture_key === captureKey) return kept as ChatKnowledgeReceipt;
	}
	return null;
}

/** The facts this capture's sources support that were created after the sources: its additions. */
async function addedFactsFor(
	db: KnowledgeDataClient,
	userId: string,
	captureKey: string
): Promise<{ sourceIds: string[]; facts: FactRow[] }> {
	const { data: sources, error } = await db
		.from('knowledge_sources')
		.select('id, created_at')
		.eq('owner_user_id', userId)
		.contains('meta', { capture_key: captureKey });
	if (error) throw error;
	const rows = (sources ?? []) as Array<{ id: string; created_at: string }>;
	if (!rows.length) return { sourceIds: [], facts: [] };
	const firstSource = rows.map((row) => row.created_at).sort()[0]!;
	const { data: citations, error: citationError } = await db
		.from('knowledge_fact_sources')
		.select('fact_id')
		.in(
			'source_id',
			rows.map((row) => row.id)
		);
	if (citationError) throw citationError;
	const factIds = [
		...new Set(((citations ?? []) as Array<{ fact_id: string }>).map((c) => c.fact_id))
	];
	if (!factIds.length) return { sourceIds: rows.map((row) => row.id), facts: [] };
	const { data: facts, error: factError } = await db
		.from('knowledge_facts')
		.select(
			'id, entity_id, predicate, object_entity_id, value_text, status, created_at, created_via'
		)
		.eq('owner_user_id', userId)
		.in('id', factIds);
	if (factError) throw factError;
	return {
		sourceIds: rows.map((row) => row.id),
		// Sources are inserted before facts, so anything this capture inserted is no older than
		// its first source; an existing fact that only gained a citation is older.
		facts: ((facts ?? []) as FactRow[]).filter(
			(fact) => fact.created_via === 'chat' && (fact.created_at ?? '') >= firstSource
		)
	};
}

export async function runChatKnowledgeCapture(
	ports: ChatKnowledgePorts,
	input: ChatKnowledgeInput
): Promise<ChatKnowledgeReceipt | null> {
	const userMessages = input.newMessages.filter(
		(message) => message.role === 'user' && message.content.trim()
	);
	if (!userMessages.length) return null;
	const { session } = input;
	const captureKey = chatKnowledgeCaptureKey(session.id, input.throughMessageId);
	const startedAt = (ports.now?.() ?? new Date()).toISOString();
	const receipt = emptyReceipt(captureKey, startedAt);
	const db = ports.db;

	try {
		// A retry of a checkpoint whose knowledge was already written: rebuild the receipt from
		// what that attempt recorded instead of writing (and paying) again.
		const kept = await keptReceipt(db, session.userId, captureKey);
		if (kept) return kept;
		const earlier = await addedFactsFor(db, session.userId, captureKey);
		if (earlier.sourceIds.length) {
			receipt.source_ids = earlier.sourceIds;
			receipt.fact_ids = earlier.facts.map((fact) => fact.id);
			const counts = new Map<string, number>();
			for (const fact of earlier.facts)
				counts.set(fact.entity_id, (counts.get(fact.entity_id) ?? 0) + 1);
			if (counts.size) {
				const { data } = await db
					.from('knowledge_entities')
					.select('id, name, kind, is_self')
					.eq('owner_user_id', session.userId)
					.in('id', [...counts.keys()]);
				receipt.entities = (
					(data ?? []) as Array<{
						id: string;
						name: string;
						kind: string;
						is_self: boolean;
					}>
				)
					.filter((row) => !row.is_self)
					.map((row) => ({
						id: row.id,
						name: row.name,
						kind: row.kind,
						created: false,
						facts: counts.get(row.id) ?? 0
					}));
			}
			receipt.status = receipt.fact_ids.length ? 'written' : 'nothing';
			return receipt;
		}

		// 1. Gate.
		if (ports.decider) {
			receipt.gate.ran = true;
			const decision = await ports.decider.decide(
				{
					state: buildKnowledgeGateState({
						newMessages: input.newMessages,
						webPages: input.webPages
					}),
					questions: CHAT_KNOWLEDGE_GATE_QUESTIONS
				},
				{
					usage: {
						operationType: 'chat_checkpoint_knowledge_gate',
						userId: session.userId,
						chatSessionId: session.id
					}
				}
			);
			if (decision.ok) {
				const p = decision.answers.entity_knowledge.probabilities.some ?? 0;
				receipt.gate.p_some = Math.round(p * 1000) / 1000;
				if (p < CHAT_KNOWLEDGE_GATE_MIN_P) return receipt;
			} else {
				// Fail open: the extraction call is the safeguard, and it costs a fraction of a cent.
				receipt.gate.error = decision.error;
			}
		}

		// 2. Extract.
		const newMessages = labelMessages(input.newMessages, 'm');
		const priorMessages = labelMessages(input.priorMessages, 'c');
		const raw = await ports.completeJson({
			systemPrompt: CHAT_KNOWLEDGE_SYSTEM_PROMPT,
			userPrompt: buildKnowledgeUserPrompt({
				chatTitle: session.title,
				newMessages,
				priorMessages,
				webPages: input.webPages
			}),
			userId: session.userId,
			operation: 'knowledge',
			sessionId: session.id
		});

		// 3. Validate.
		const validated = validateChatKnowledge(raw, {
			newMessages,
			priorMessages,
			webPages: input.webPages
		});
		// 3b. Never copy another member's granted value into the user's own graph: structured
		// comparison of the normalized value against the keys the lens reads left in storage.
		const granted = input.grantedValueKeys;
		if (granted?.size) {
			validated.facts = validated.facts.filter((fact) => {
				const key =
					fact.value !== undefined
						? knowledgeGrantValueKey(fact.predicate, fact.value)
						: null;
				if (!key || !granted.has(key)) return true;
				validated.dropped.push({
					predicate: fact.predicate,
					reason: 'shared_by_another_member'
				});
				return false;
			});
		}
		receipt.dropped = validated.dropped.slice(0, MAX_DROPS_IN_RECEIPT);
		if (!validated.facts.length) return receipt;

		// 4. Identity.
		const decisions = await (ports.resolveIdentity ?? resolveKnowledgeIdentity)({
			db,
			userId: session.userId,
			candidates: validated.entities
		});
		const decisionByRef = new Map(decisions.map((decision) => [decision.ref, decision]));
		const skippedRefs = new Set<string>();
		for (const entity of validated.entities) {
			const decision = decisionByRef.get(entity.ref);
			if (decision?.action === 'skip') {
				skippedRefs.add(entity.ref);
				receipt.skipped_entities.push({ name: entity.name, reason: decision.reason });
			}
		}
		const facts = validated.facts.filter(
			(fact) =>
				!skippedRefs.has(fact.subject) && !(fact.object && skippedRefs.has(fact.object))
		);
		const entities = validated.entities.filter(
			(entity) =>
				!skippedRefs.has(entity.ref) &&
				facts.some((fact) => fact.subject === entity.ref || fact.object === entity.ref)
		);
		if (!facts.length) return receipt;

		// 5. Write. First the entries, so the facts can be planned against what each one holds.
		const store = new KnowledgeStore(db, session.userId);
		const resolved = await store.record(
			{
				entities: entities.map((entity) => {
					const decision = decisionByRef.get(entity.ref);
					return {
						ref: entity.ref,
						kind: entity.kind,
						name: entity.name,
						...(decision?.action === 'use' ? { id: decision.entityId } : {})
					};
				}),
				facts: []
			},
			{ via: 'chat' }
		);
		const idByRef = new Map(resolved.entities.map((entity) => [entity.ref, entity]));
		receipt.created_entity_ids = resolved.entities
			.filter((entity) => entity.matched === 'created')
			.map((entity) => entity.id);
		const selfId = facts.some((fact) => fact.subject === 'me')
			? await store.ensureSelf()
			: null;
		const idOf = (ref: string) => (ref === 'me' ? selfId : (idByRef.get(ref)?.id ?? null));

		// 4b. What the chat says about entries the user already has: the shared identity check.
		const createdIds = new Set(receipt.created_entity_ids);
		const relationOf = (ref: string) => {
			const via = facts.find(
				(fact) => fact.subject === 'me' && fact.predicate === 'knows' && fact.object === ref
			)?.qualifiers?.via;
			return typeof via === 'string' && via.trim() ? `your ${via.trim().slice(0, 40)}` : null;
		};
		const claims: ChatClaim[] = facts.flatMap((fact, index) => {
			const entityId = fact.subject === 'me' ? null : idOf(fact.subject);
			if (!entityId || createdIds.has(entityId)) return [];
			const value = fact.object
				? (entities.find((entity) => entity.ref === fact.object)?.name ?? '')
				: (fact.value ?? '');
			return [{ index, entityId, predicate: fact.predicate, value, text: fact.quote }];
		});
		const decider = (ports.decider ?? null) as unknown as IdentityDecider | null;
		const identity = await checkChatClaims({
			store,
			db,
			userId: session.userId,
			decider,
			entries: entities.flatMap((entity) => {
				const id = idOf(entity.ref);
				return id
					? [
							{
								entityId: id,
								created: createdIds.has(id),
								relation: relationOf(entity.ref)
							}
						]
					: [];
			}),
			claims,
			...(ports.loadAnchors ? { loadAnchors: ports.loadAnchors } : {})
		});
		receipt.identity = {
			checked: identity.verdicts.size,
			asked: 0,
			different: 0,
			calls: identity.calls,
			cost_usd: Math.round(identity.costUsd * 1e6) / 1e6
		};
		// Entries the user just described in their own words are anchored by those words.
		const userStated = new Set(
			facts
				.filter((fact) => fact.from === 'user' && fact.subject !== 'me')
				.map((fact) => idOf(fact.subject))
		);
		const asks = new Map<string, number[]>();
		const elsewhere = new Map<string, string>();
		for (const [index, verdict] of identity.verdicts) {
			const entityId = idOf(facts[index]!.subject)!;
			if (verdict.verdict === 'ask') {
				asks.set(entityId, [...(asks.get(entityId) ?? []), index]);
				receipt.identity.asked++;
			} else if (verdict.verdict === 'different' && !elsewhere.has(entityId)) {
				// A different one that shares the name: its own new entry.
				const entity = resolved.entities.find((e) => e.id === entityId)!;
				const newId = await store.createEntry({
					kind: entity.kind,
					name: entity.name,
					via: 'chat'
				});
				elsewhere.set(entityId, newId);
				receipt.created_entity_ids.push(newId);
			}
		}
		// A chat name every checked claim placed on the new entry means that entry wherever the
		// chat names it, including as the object of other facts ("me knows X", "Y works at X").
		const twinForRef = new Map<string, string>();
		for (const entity of entities) {
			const matchedId = idOf(entity.ref);
			const twinId = matchedId ? elsewhere.get(matchedId) : undefined;
			if (!twinId) continue;
			const verdicts = facts.flatMap((fact, index) =>
				fact.subject === entity.ref && identity.verdicts.has(index)
					? [identity.verdicts.get(index)!.verdict]
					: []
			);
			if (verdicts.length && verdicts.every((verdict) => verdict === 'different'))
				twinForRef.set(entity.ref, twinId);
		}
		const entryOf = (ref: string) => twinForRef.get(ref) ?? idOf(ref);
		const subjectFor = (index: number, entityId: string) => {
			const verdict = identity.verdicts.get(index)?.verdict;
			if (verdict === 'different') return elsewhere.get(entityId) ?? entityId;
			if (verdict) return entityId;
			return entryOf(facts[index]!.subject) ?? entityId;
		};
		const held = new Set([...asks.values()].flat());
		receipt.identity.different = elsewhere.size;

		const subjectIds = [
			...new Set(
				facts
					.map((fact, index) => {
						const id = idOf(fact.subject);
						return id ? subjectFor(index, id) : null;
					})
					.filter((id): id is string => !!id)
			)
		];
		const [before, summariesBefore] = await Promise.all([
			selectFacts(db, session.userId, subjectIds),
			selectSummaries(db, session.userId, subjectIds)
		]);
		const beforeByKey = new Map(
			before.map((row) => [
				factKey(row.entity_id, row.predicate, row.object_entity_id, row.value_text),
				row
			])
		);

		const sources: KnowledgeWriteSource[] = [
			{
				ref: 'chat',
				type: 'chat',
				record_id: session.id,
				title: (session.title ?? 'Chat').slice(0, 500),
				meta: {
					capture_key: captureKey,
					through_message_id: input.throughMessageId,
					prompt_version: CHAT_KNOWLEDGE_PROMPT_VERSION
				}
			}
		];
		const webRefs = new Map<string, string>();
		const writeFacts: KnowledgeWriteFact[] = [];
		for (const [index, fact] of facts.entries()) {
			if (held.has(index)) continue;
			const matchedId = idOf(fact.subject);
			const subjectId = matchedId ? subjectFor(index, matchedId) : null;
			const objectId = fact.object ? entryOf(fact.object) : null;
			const def = getKnowledgePredicate(fact.predicate)!;
			if (!subjectId || (fact.object && !objectId)) continue;
			let normalized: string | null = null;
			if (!fact.object) {
				normalized = normalizeKnowledgeValue(def.valueType, fact.value ?? '');
				if (!normalized) {
					receipt.dropped.push({ predicate: fact.predicate, reason: 'invalid value' });
					continue;
				}
			}
			const prior = beforeByKey.get(factKey(subjectId, def.key, objectId, normalized));
			// The user marked this wrong before: a background capture never brings it back.
			if (prior?.status === 'retracted') {
				receipt.dropped.push({ predicate: fact.predicate, reason: 'marked wrong before' });
				continue;
			}
			let status = fact.status;
			// A web result about an entry nothing anchors can't be confirmed as the right one.
			if (
				status === 'active' &&
				fact.from === 'web' &&
				!identity.anchored.has(subjectId) &&
				!userStated.has(subjectId)
			)
				status = 'suggested';
			// A one-value field (headline, website…) a web result would overwrite stays a suggestion;
			// the user's own words replace it (and Undo puts the old value back).
			if (
				status === 'active' &&
				def.cardinality === 'one' &&
				!fact.object &&
				fact.from === 'web'
			) {
				const current = before.some(
					(row) =>
						row.entity_id === subjectId &&
						row.predicate === def.key &&
						row.status === 'active' &&
						row !== prior
				);
				if (current) status = 'suggested';
			}
			const factSources = ['chat'];
			if (fact.web) {
				let ref = webRefs.get(fact.web.url);
				if (!ref) {
					ref = `w${webRefs.size + 1}`;
					webRefs.set(fact.web.url, ref);
					sources.push({
						ref,
						type: 'web',
						url: fact.web.url,
						...(fact.web.title ? { title: fact.web.title } : {}),
						meta: { capture_key: captureKey, via_chat: session.id }
					});
				}
				factSources.unshift(ref);
			}
			writeFacts.push({
				subject: subjectId,
				predicate: def.key,
				...(objectId ? { object: objectId } : { value: fact.value }),
				...(fact.qualifiers ? { qualifiers: fact.qualifiers } : {}),
				confidence: fact.confidence,
				status,
				sources: factSources,
				quote: fact.quote
			});
		}
		// 5b. Claims the check couldn't settle: one "same one?" question per entry, holding the
		// claim's details as suggestions on the other identity, cited by this chat.
		for (const [entityId, indexes] of asks) {
			const entity = resolved.entities.find((e) => e.id === entityId)!;
			const first = identity.verdicts.get(indexes[0]!)!;
			const asked = indexes.map((index) => facts[index]!);
			const filed = await recordIdentityQuestion(store, {
				entityId,
				kind: entity.kind,
				question:
					first.question ?? `Is ${entity.name} the same one you mentioned in this chat?`,
				reason: first.reasonText,
				candidate: {
					name: entity.name,
					facts: asked.flatMap((fact) => {
						const objectId = fact.object ? entryOf(fact.object) : null;
						if (fact.object && !objectId) return [];
						return [
							{
								predicate: fact.predicate,
								...(objectId ? { object: objectId } : { value: fact.value }),
								...(fact.qualifiers ? { qualifiers: fact.qualifiers } : {}),
								confidence: fact.confidence,
								quote: fact.quote
							}
						];
					}),
					source: {
						type: 'chat',
						record_id: session.id,
						title: (session.title ?? 'Chat').slice(0, 500),
						meta: { capture_key: captureKey, identity_question: true }
					}
				},
				via: 'chat'
			});
			if (filed.created) receipt.created_entity_ids.push(filed.otherEntityId);
			receipt.questions.push({
				entity_id: entityId,
				other_entity_id: filed.otherEntityId,
				name: entity.name,
				question: (
					first.question ?? `Is ${entity.name} the same one you mentioned in this chat?`
				).slice(0, 300)
			});
		}

		if (!writeFacts.length && !receipt.questions.length) {
			// Every fact fell away: entries made a moment ago for them go too.
			for (const id of receipt.created_entity_ids)
				await store.deleteEntity(id).catch(() => undefined);
			receipt.created_entity_ids = [];
			return receipt;
		}

		const linkedBefore = new Set(
			(await selectSessionLinks(db, session.userId, session.id)).map((link) => link.entity_id)
		);
		const linkEntityIds = [
			...new Set(
				writeFacts
					.flatMap((fact) => [fact.subject, fact.object])
					.filter((id): id is string => Boolean(id) && id !== selfId)
			)
		];
		const quoteFor = (entityId: string) =>
			writeFacts.find((fact) => fact.subject === entityId || fact.object === entityId)?.quote;
		const batch: KnowledgeWriteBatch = {
			entities: [],
			facts: writeFacts,
			sources,
			links: linkEntityIds.map((entityId) => ({
				entity: entityId,
				record_kind: 'chat_session',
				record_id: session.id,
				...(quoteFor(entityId) ? { quote: quoteFor(entityId) } : {})
			}))
		};
		if (writeFacts.length) await store.record(batch, { via: 'chat' });

		// 6. Read back exactly what changed, for Undo.
		const added = await addedFactsFor(db, session.userId, captureKey);
		receipt.source_ids = added.sourceIds;
		receipt.fact_ids = added.facts.map((fact) => fact.id);
		const questionEntries = new Set(receipt.questions.map((q) => q.other_entity_id));
		receipt.saved_facts = added.facts.filter(
			(fact) => !questionEntries.has(fact.entity_id)
		).length;
		const addedIds = new Set(receipt.fact_ids);
		const after = await selectFacts(db, session.userId, subjectIds);
		const afterById = new Map(after.map((row) => [row.id, row]));
		receipt.restore = before.flatMap((row) => {
			const now = afterById.get(row.id);
			return now && !addedIds.has(row.id) && now.status !== row.status
				? [{ id: row.id, status: row.status, after: now.status }]
				: [];
		});
		const summariesAfter = await selectSummaries(db, session.userId, subjectIds);
		receipt.summaries = [...summariesBefore].flatMap(([id, summary]) =>
			summariesAfter.has(id) && summariesAfter.get(id) !== summary
				? [{ id, before: summary, after: summariesAfter.get(id) ?? null }]
				: []
		);
		receipt.link_ids = (await selectSessionLinks(db, session.userId, session.id))
			.filter((link) => !linkedBefore.has(link.entity_id))
			.map((link) => link.id);

		// An entry created a moment ago that ended up with nothing written about it is removed
		// now, so a no-op capture leaves no empty entries behind.
		const touched = new Set(
			added.facts.flatMap((fact) => [fact.entity_id, fact.object_entity_id ?? ''])
		);
		const empty = receipt.created_entity_ids.filter((id) => !touched.has(id));
		for (const id of empty) await store.deleteEntity(id).catch(() => undefined);
		receipt.created_entity_ids = receipt.created_entity_ids.filter((id) => touched.has(id));

		const created = new Set(receipt.created_entity_ids);
		const shown = new Map<string, ChatKnowledgeReceipt['entities'][number]>();
		const twins = [...elsewhere].flatMap(([matchedId, twinId]) => {
			const entity = resolved.entities.find((e) => e.id === matchedId);
			return entity ? [{ ...entity, id: twinId }] : [];
		});
		for (const entity of [...resolved.entities, ...twins]) {
			const count = added.facts.filter((fact) => fact.entity_id === entity.id).length;
			if (!count && !created.has(entity.id)) continue;
			const existing = shown.get(entity.id);
			if (existing) {
				existing.facts = Math.max(existing.facts, count);
				continue;
			}
			shown.set(entity.id, {
				id: entity.id,
				name: entity.name,
				kind: entity.kind,
				created: created.has(entity.id),
				facts: count
			});
		}
		// "Who you know" facts sit on the user's own entry; count them on the person they name.
		for (const fact of added.facts) {
			if (fact.entity_id !== selfId || !fact.object_entity_id) continue;
			const entry = shown.get(fact.object_entity_id);
			if (entry) entry.facts += 1;
		}
		receipt.entities = [...shown.values()].sort((a, b) => b.facts - a.facts);
		receipt.status = receipt.fact_ids.length ? 'written' : 'nothing';
		await keepReceiptCopy(db, session.userId, receipt);
		return receipt;
	} catch (error) {
		receipt.status = 'failed';
		receipt.error = (
			error instanceof Error
				? error.message
				: String((error as { message?: unknown })?.message ?? error)
		).slice(0, 500);
		// Whatever was written before the failure stays undoable.
		try {
			const added = await addedFactsFor(db, session.userId, captureKey);
			receipt.source_ids = added.sourceIds;
			receipt.fact_ids = added.facts.map((fact) => fact.id);
		} catch {
			// The receipt keeps the error; nothing more to recover.
		}
		await keepReceiptCopy(db, session.userId, receipt);
		return receipt;
	}
}
