// apps/worker/src/workers/chat/checkpoint/knowledgeIdentity.ts
//
// The identity seam for chat knowledge capture (tasker 164). Before a chat checkpoint writes what
// it learned, each named person or organization goes through `resolveKnowledgeIdentity`: is this
// an entry the user already has, a new one, or one to ask about?
//
// Today's default is the store's own matching (identity keys, then exact private names), plus the
// rule the store already applies to the user's own notes for one-word person names: reuse the one
// private entry with that name, otherwise skip rather than create another "Sam".
//
// Then, once each candidate has landed on an entry, `checkChatClaims` puts what the chat says
// about an EXISTING entry through the shared identity check (shared-agent-ops identity.ts:
// circles, anchors, Jev same / different / ask). Its verdicts drive the write:
//   same      → written as usual
//   ask       → not written; filed as a "same one?" question in the duplicates review
//   different → written to a new entry (store.createEntry), not the matched one
// It also reports which entries have anchors: a web fact about an entry nothing anchors is
// saved as a suggestion. A model failure never blocks capture (claims pass, per identity.ts).
//
// The name-level `resolveKnowledgeIdentity` below stays a separate swap point (store matching
// by default).
import {
	type IdentityCheckResult,
	type IdentityClaimCandidate,
	type IdentityDecider,
	type KnowledgeAnchors,
	type KnowledgeCircle,
	type KnowledgeDataClient,
	type KnowledgeKind,
	type KnowledgeStore,
	checkIdentityBatch,
	gatherKnowledgeAnchors,
	hasKnowledgeAnchors,
	isSpecificPersonName,
	normalizeKnowledgeName,
	resolveCircles
} from '@buildos/shared-agent-ops/knowledge';

export type KnowledgeIdentityCandidate = {
	ref: string;
	kind: KnowledgeKind;
	name: string;
	/** Exact quotes about it from this chat (what the user said, what the search found). */
	evidence: string[];
};

export type KnowledgeIdentityDecision =
	/** Let the store match it (identity keys, then exact private name) or create it. */
	| { ref: string; action: 'default' }
	/** It is this existing entry. */
	| { ref: string; action: 'use'; entityId: string }
	/** Don't write anything about it this time (unsure who it is). */
	| { ref: string; action: 'skip'; reason: string };

export type ResolveKnowledgeIdentity = (input: {
	db: KnowledgeDataClient;
	userId: string;
	candidates: readonly KnowledgeIdentityCandidate[];
}) => Promise<KnowledgeIdentityDecision[]>;

/**
 * Current behaviour: the store decides, except one-word person names (see above), and any name
 * the user already has on two or more entries: the store would add yet another twin, so the
 * chat skips it rather than guess which one it means.
 */
export const storeKnowledgeIdentity: ResolveKnowledgeIdentity = async ({
	db,
	userId,
	candidates
}) => {
	const keyOf = (kind: string, name: string) => `${kind}|${normalizeKnowledgeName(name)}`;
	const matches = new Map<string, string[]>();
	if (candidates.length) {
		const { data, error } = await db
			.from('knowledge_entities')
			.select('id, kind, normalized_name')
			.eq('owner_user_id', userId)
			.in('kind', [...new Set(candidates.map((candidate) => candidate.kind))])
			.eq('status', 'active')
			.eq('is_self', false)
			.in('normalized_name', [
				...new Set(candidates.map((candidate) => normalizeKnowledgeName(candidate.name)))
			]);
		if (error) throw error;
		for (const row of (data ?? []) as Array<{
			id: string;
			kind: string;
			normalized_name: string;
		}>) {
			const key = keyOf(row.kind, row.normalized_name);
			matches.set(key, [...(matches.get(key) ?? []), row.id]);
		}
	}
	return candidates.map((candidate): KnowledgeIdentityDecision => {
		const ids = matches.get(keyOf(candidate.kind, candidate.name)) ?? [];
		const vague = candidate.kind === 'person' && !isSpecificPersonName(candidate.name);
		if (ids.length > 1)
			return {
				ref: candidate.ref,
				action: 'skip',
				reason: vague ? 'several people with this name' : 'several entries with this name'
			};
		if (!vague) return { ref: candidate.ref, action: 'default' };
		return ids.length === 1
			? { ref: candidate.ref, action: 'use', entityId: ids[0]! }
			: { ref: candidate.ref, action: 'skip', reason: 'first name only' };
	});
};

/** The resolver chat capture uses. Swap in the identity check here. */
export const resolveKnowledgeIdentity: ResolveKnowledgeIdentity = storeKnowledgeIdentity;

// ---------------------------------------------------------------------------
// Claims about existing entries

/** One fact the chat states about an entry, as a claim for the identity check. */
export type ChatClaim = {
	/** The fact's index in the capture (results are keyed by it). */
	index: number;
	entityId: string;
	predicate: string;
	/** The value, or the related entry's name. */
	value: string;
	/** The exact words the fact was quoted from. */
	text: string;
};

export type ChatClaimEntry = {
	entityId: string;
	/** Created by this capture: nothing to check it against. */
	created: boolean;
	/** How the user relates to them, in the user's words ("your friend"). */
	relation: string | null;
};

export type ChatClaimCheck = {
	/** Per fact index; absent = no check ran (new entry, or anchors unavailable): write as usual. */
	verdicts: Map<number, IdentityCheckResult>;
	/** Entries whose anchors say who they are (website, employer, places, linked work…). */
	anchored: Set<string>;
	costUsd: number;
	calls: number;
};

export type LoadChatAnchors = (input: {
	store: KnowledgeStore;
	db: KnowledgeDataClient;
	userId: string;
	entityIds: string[];
	decider: IdentityDecider | null;
}) => Promise<Map<string, KnowledgeAnchors>>;

/** Circle (signals first, the model only when ambiguous; not saved) + anchors, per entry. */
export const loadChatAnchors: LoadChatAnchors = async ({
	store,
	db,
	userId,
	entityIds,
	decider
}) => {
	const out = new Map<string, KnowledgeAnchors>();
	if (!entityIds.length) return out;
	let circles = new Map<string, KnowledgeCircle>();
	try {
		const resolved = await resolveCircles(db, userId, entityIds, { decider, save: false });
		circles = new Map(resolved.decisions.map((d) => [d.entityId, d.circle]));
	} catch {
		// circles are context; the check goes on without one
	}
	for (const entityId of entityIds) {
		try {
			const detail = await store.getEntity(entityId);
			if (!detail) continue;
			out.set(
				entityId,
				await gatherKnowledgeAnchors(store, db, detail, {
					circle: circles.get(entityId) ?? 'unknown'
				})
			);
		} catch {
			// no anchors for this one: its claims pass, its web facts become suggestions
		}
	}
	return out;
};

/**
 * Check the claims about existing entries, one identity call per entry (batched by identity.ts).
 * Never throws: a failure leaves claims unchecked (written as usual).
 */
export async function checkChatClaims(input: {
	store: KnowledgeStore;
	db: KnowledgeDataClient;
	userId: string;
	decider: IdentityDecider | null;
	entries: readonly ChatClaimEntry[];
	claims: readonly ChatClaim[];
	loadAnchors?: LoadChatAnchors;
}): Promise<ChatClaimCheck> {
	const result: ChatClaimCheck = {
		verdicts: new Map(),
		anchored: new Set(),
		costUsd: 0,
		calls: 0
	};
	const existing = input.entries.filter((entry) => !entry.created);
	let anchors = new Map<string, KnowledgeAnchors>();
	try {
		anchors = await (input.loadAnchors ?? loadChatAnchors)({
			store: input.store,
			db: input.db,
			userId: input.userId,
			entityIds: existing.map((entry) => entry.entityId),
			decider: input.decider
		});
	} catch {
		return result;
	}
	for (const entry of existing) {
		const entryAnchors = anchors.get(entry.entityId);
		if (!entryAnchors) continue;
		if (hasKnowledgeAnchors(entryAnchors)) result.anchored.add(entry.entityId);
		const claims = input.claims.filter((claim) => claim.entityId === entry.entityId);
		if (!claims.length) continue;
		const candidates: IdentityClaimCandidate[] = claims.map((claim) => ({
			type: 'claim',
			id: String(claim.index),
			via: 'chat',
			text: claim.text,
			predicate: claim.predicate,
			value: claim.value
		}));
		try {
			const checked = await checkIdentityBatch(
				{ anchors: entryAnchors, relation: entry.relation },
				candidates,
				{ decider: input.decider, userId: input.userId }
			);
			result.costUsd += checked.costUsd;
			result.calls += checked.calls;
			for (const verdict of checked.results)
				result.verdicts.set(Number(verdict.candidateId), verdict);
		} catch {
			// unchecked: written as usual
		}
	}
	return result;
}
