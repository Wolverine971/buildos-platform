// apps/worker/src/workers/freshness-radar/drafts.ts
//
// Stage [5c]: the draft bundle (plan section 5), since tasker 106 the roll-up's
// single AI Inbox item per project. One project_suggestions row of kind
// 'freshness_update' holds:
//   - operations: code-authored scalar drafts (approve applies them), and
//   - preview.review_items: surfaced roll-up concerns with no operation (stale
//     documents, details that need rewriting), each with a Fix-in-chat prompt.
// It is rebuilt only when its content signature changes, so an unchanged
// roll-up keeps its inbox item in place. Built in order: verify (fail closed;
// skipped when there are no operations) -> supersede the previous pending
// bundle, carrying forward still-valid drafts -> insert (the unique index is
// the backstop) -> sync the inbox item -> attention budget. The bundle never
// quotes chat (privacy): evidence_refs carry entity ids only, and review items
// cite section headings and recorded decisions, which are project content.

import { createHash } from 'node:crypto';
import {
	FRESHNESS_UPDATE_SUGGESTION_KIND,
	type Json,
	type LoopOperation,
	type ProjectSuggestionEvidenceRef,
	type ProjectSuggestionEvidenceType,
	type ProjectSuggestionPreview,
	type ProjectSuggestionReviewItem
} from '@buildos/shared-types';
import type { FreshnessDb } from './dataPort';
import type { FreshnessPolicyV1 } from './freshnessPolicy';

export type DraftBundleDeps = {
	verify: (
		db: FreshnessDb,
		input: {
			projectId: string;
			operations: LoopOperation[];
			title?: string | null;
			preview?: ProjectSuggestionPreview | null;
			checkModelAlignment?: boolean;
		}
	) => Promise<
		| { ok: true; summary: { operation_count: number } }
		| { ok: false; diagnostic: { code: string; message: string } }
	>;
	fingerprint: (
		db: FreshnessDb,
		projectId: string,
		operations: LoopOperation[]
	) => Promise<string | null>;
	syncInbox: (params: {
		supabase: FreshnessDb;
		suggestion: Record<string, unknown>;
	}) => Promise<unknown>;
	applyBudget: (params: { supabase: FreshnessDb; projectId: string }) => Promise<unknown>;
};

export type DraftItem = {
	flagId: string;
	entityKind: 'task' | 'goal' | 'milestone';
	entityId: string;
	title: string;
	probability: number;
	operation: LoopOperation;
	/** Reverse operation (previous raw value). */
	undo: LoopOperation;
	/** Carried from an earlier bundle (flag belongs to an older scan). */
	carried?: boolean;
};

export type DraftBundleResult =
	| { status: 'none' }
	| { status: 'unchanged'; suggestionId: string; operationCount: number }
	| {
			status: 'created';
			suggestionId: string;
			operationCount: number;
			includedFlagIds: string[];
			carriedFlagIds: string[];
			overCapFlagIds: string[];
			supersededIds: string[];
	  }
	| { status: 'failed'; reason: string; flagIds: string[] };

const KIND_PLURAL: Record<DraftItem['entityKind'] | 'document', [string, string]> = {
	task: ['task', 'tasks'],
	goal: ['goal', 'goals'],
	milestone: ['milestone', 'milestones'],
	document: ['document', 'documents']
};

export function bundleTitle(count: number): string {
	return `${count} thing${count === 1 ? ' looks' : 's look'} out of date`;
}

/** "From your update on 2026-09-18 · 2 tasks, 1 document" (no chat quotes). */
export function bundleSummary(
	items: ReadonlyArray<{ entityKind: DraftItem['entityKind'] | 'document' }>,
	civilDate: string
): string {
	const counts = new Map<string, number>();
	for (const item of items) counts.set(item.entityKind, (counts.get(item.entityKind) ?? 0) + 1);
	const parts = (['task', 'milestone', 'goal', 'document'] as const)
		.filter((kind) => counts.get(kind))
		.map((kind) => {
			const count = counts.get(kind)!;
			return `${count} ${KIND_PLURAL[kind][count === 1 ? 0 : 1]}`;
		});
	return `From your update on ${civilDate} · ${parts.join(', ')}`;
}

/** A surfaced roll-up concern with no operation: fixed in chat, never executed. */
export type ReviewItem = {
	concernId: string;
	entityKind: 'task' | 'goal' | 'milestone' | 'document';
	entityId: string;
	title: string;
	score: number;
	reason: string;
	fixInChatPrompt: string;
};

function reviewItemView(item: ReviewItem): ProjectSuggestionReviewItem {
	return {
		concern_id: item.concernId,
		entity_type: item.entityKind,
		entity_id: item.entityId,
		title: item.title,
		reason: item.reason,
		fix_in_chat_prompt: item.fixInChatPrompt
	};
}

export function bundleSignature(
	operations: readonly LoopOperation[],
	reviewItems: readonly ReviewItem[]
): string {
	return createHash('sha256')
		.update(
			JSON.stringify({
				o: operations.map((operation) => [operation.tool, operation.args]),
				r: reviewItems.map((item) => [item.concernId, item.reason, item.fixInChatPrompt])
			})
		)
		.digest('hex')
		.slice(0, 32);
}

/** Rationale in the inbox item and the Discuss chat's seed: what to fix and why. */
function bundleRationale(reviewItems: readonly ReviewItem[]): string | null {
	if (!reviewItems.length) return null;
	return [
		'To fix in chat (no automatic change is proposed for these):',
		...reviewItems.map(
			(item) => `- ${item.title}: ${item.reason} Suggested request: ${item.fixInChatPrompt}`
		)
	].join('\n');
}

type PendingBundle = {
	id: string;
	operations: unknown;
	preview: unknown;
	created_at: string;
};

async function loadPendingBundle(
	db: FreshnessDb,
	projectId: string
): Promise<PendingBundle | null> {
	const result = await db
		.from('project_suggestions')
		.select('id, operations, preview, created_at')
		.eq('project_id', projectId)
		.eq('kind', FRESHNESS_UPDATE_SUGGESTION_KIND)
		.eq('status', 'pending')
		.maybeSingle();
	if (result.error) throw new Error(`freshness bundle read failed: ${result.error.message}`);
	return (result.data ?? null) as PendingBundle | null;
}

export type CarriedFlagRow = {
	id: string;
	subject_kind: string;
	subject_id: string;
	subject_title: string;
	subject_snapshot: Record<string, unknown> | null;
	probability: number | string;
	proposed_operation: LoopOperation | null;
	undo_operation: unknown;
	created_at: string;
	features: Record<string, unknown> | null;
};

/**
 * Drafts of the previous pending bundle that are still valid: open, drafted,
 * younger than 7 days, and whose entity is unchanged since the flag (checked
 * with the caller's snapshot matcher). Entities re-flagged by this scan win.
 */
async function loadCarryForward(params: {
	db: FreshnessDb;
	previous: PendingBundle;
	excludeEntityKeys: ReadonlySet<string>;
	isUnchanged: (flag: CarriedFlagRow) => boolean;
	now: Date;
	policy: FreshnessPolicyV1;
}): Promise<{ carried: DraftItem[]; dropped: string[] }> {
	const floor = new Date(
		params.now.getTime() - params.policy.bundle.carryForwardDays * 86_400_000
	).toISOString();
	const result = await params.db
		.from('freshness_flags')
		.select(
			'id, subject_kind, subject_id, subject_title, subject_snapshot, probability, proposed_operation, undo_operation, created_at, features'
		)
		.eq('suggestion_id', params.previous.id)
		.eq('disposition', 'drafted')
		.eq('status', 'open');
	if (result.error)
		throw new Error(`freshness carry-forward read failed: ${result.error.message}`);
	const carried: DraftItem[] = [];
	const dropped: string[] = [];
	for (const row of (result.data ?? []) as CarriedFlagRow[]) {
		const key = `${row.subject_kind}:${row.subject_id}`;
		const undo = (row.features?.draft_undo ?? null) as LoopOperation | null;
		if (
			row.created_at < floor ||
			params.excludeEntityKeys.has(key) ||
			!row.proposed_operation ||
			!undo ||
			!params.isUnchanged(row)
		) {
			dropped.push(row.id);
			continue;
		}
		carried.push({
			flagId: row.id,
			entityKind: row.subject_kind as DraftItem['entityKind'],
			entityId: row.subject_id,
			title: row.subject_title,
			probability: Number(row.probability),
			operation: row.proposed_operation,
			undo,
			carried: true
		});
	}
	return { carried, dropped };
}

export async function buildDraftBundle(params: {
	db: FreshnessDb;
	deps: DraftBundleDeps;
	projectId: string;
	scanId: string;
	triggerSessionId: string | null;
	today: string;
	drafts: readonly DraftItem[];
	/** Surfaced roll-up concerns without an operation (tasker 106). */
	reviewItems?: readonly ReviewItem[];
	isUnchanged: (flag: CarriedFlagRow) => boolean;
	now: Date;
	policy: FreshnessPolicyV1;
}): Promise<DraftBundleResult> {
	const { db, deps, policy } = params;
	const nowIso = params.now.toISOString();

	const previous = await loadPendingBundle(db, params.projectId);
	const fresh = [...params.drafts].sort((a, b) => b.probability - a.probability);
	const excludeKeys = new Set(fresh.map((item) => `${item.entityKind}:${item.entityId}`));
	const carry = previous
		? await loadCarryForward({
				db,
				previous,
				excludeEntityKeys: excludeKeys,
				isUnchanged: params.isUnchanged,
				now: params.now,
				policy
			})
		: { carried: [], dropped: [] };
	const ordered = [...fresh, ...carry.carried.sort((a, b) => b.probability - a.probability)];
	const included = ordered.slice(0, policy.bundle.maxOperations);
	const overCap = ordered.slice(policy.bundle.maxOperations);
	const draftKeys = new Set(ordered.map((item) => `${item.entityKind}:${item.entityId}`));
	const reviewItems = [...(params.reviewItems ?? [])]
		.filter((item) => !draftKeys.has(`${item.entityKind}:${item.entityId}`))
		.sort((a, b) => b.score - a.score)
		.slice(0, policy.rollup.inboxMaxItems);

	const supersedePrevious = async (reason: string): Promise<string[]> => {
		if (!previous) return [];
		const ids: string[] = [];
		const superseded = await db
			.from('project_suggestions')
			.update({
				status: 'superseded',
				decided_at: nowIso,
				result: { ok: false, [reason]: params.scanId } as unknown as Json
			})
			.eq('id', previous.id)
			.eq('status', 'pending')
			.select('*');
		if (superseded.error)
			throw new Error(`freshness bundle supersede failed: ${superseded.error.message}`);
		for (const row of (superseded.data ?? []) as Array<Record<string, unknown>>) {
			ids.push(String(row.id));
			await deps.syncInbox({ supabase: db, suggestion: row }).catch(() => undefined);
		}
		if (carry.dropped.length) {
			const dropped = await db
				.from('freshness_flags')
				.update({ status: 'superseded' })
				.in('id', carry.dropped)
				.eq('status', 'open');
			if (dropped.error)
				throw new Error(`freshness carry-forward drop failed: ${dropped.error.message}`);
		}
		return ids;
	};

	if (!included.length && !reviewItems.length) {
		// Nothing left to ask: a pending roll-up item whose concerns all closed goes away.
		const previousPreview = (previous?.preview ?? null) as ProjectSuggestionPreview | null;
		if (previous && previousPreview?.review_items?.length) {
			await supersedePrevious('superseded_by_freshness_rollup');
		}
		return { status: 'none' };
	}

	const operations = included.map((item) => item.operation);
	const signature = bundleSignature(operations, reviewItems);
	const previousSignature = (previous?.preview as ProjectSuggestionPreview | null)?.signature;
	if (previous && previousSignature === signature) {
		return {
			status: 'unchanged',
			suggestionId: previous.id,
			operationCount: operations.length
		};
	}

	const total = operations.length + reviewItems.length;
	const title = bundleTitle(total);
	const preview: ProjectSuggestionPreview = {
		kind: 'generic',
		summary: title,
		after: [
			...included.map((item) => item.operation.label ?? item.title),
			...reviewItems.map((item) => `${item.title}: ${item.reason}`)
		],
		...(reviewItems.length ? { review_items: reviewItems.map(reviewItemView) } : {}),
		signature
	};
	if (operations.length) {
		const verification = await deps.verify(db, {
			projectId: params.projectId,
			operations,
			title,
			preview,
			checkModelAlignment: true
		});
		if (!verification.ok) {
			return {
				status: 'failed',
				reason: `verify_${verification.diagnostic.code.toLowerCase()}`,
				flagIds: included.filter((item) => !item.carried).map((item) => item.flagId)
			};
		}
		if (verification.summary.operation_count !== operations.length) {
			return {
				status: 'failed',
				reason: 'verify_count_mismatch',
				flagIds: included.filter((item) => !item.carried).map((item) => item.flagId)
			};
		}
	}
	const sourceFingerprint = operations.length
		? await deps.fingerprint(db, params.projectId, operations)
		: null;

	// Supersede the previous pending bundle (conditional on still pending).
	const supersededIds = await supersedePrevious('superseded_by_freshness_scan');

	const evidenceRefs: ProjectSuggestionEvidenceRef[] = [
		...included.map((item) => ({
			entity_type: item.entityKind as ProjectSuggestionEvidenceType,
			entity_id: item.entityId,
			title: item.title
		})),
		...reviewItems.map((item) => ({
			entity_type: item.entityKind as ProjectSuggestionEvidenceType,
			entity_id: item.entityId,
			title: item.title
		}))
	];
	const confidence = Math.max(
		...included.map((item) => item.probability),
		...reviewItems.map((item) => item.score)
	);
	const inserted = await db
		.from('project_suggestions')
		.insert({
			run_id: null,
			freshness_scan_id: params.scanId,
			project_id: params.projectId,
			chat_session_id: params.triggerSessionId,
			kind: FRESHNESS_UPDATE_SUGGESTION_KIND,
			risk_tier: 1,
			title,
			rationale: bundleRationale(reviewItems),
			why_now: bundleSummary([...included, ...reviewItems], params.today),
			confidence,
			evidence_refs: evidenceRefs as unknown as Json,
			preview: preview as unknown as Json,
			operations: operations as unknown as Json,
			freshness_state: 'fresh',
			reversible: true,
			undo_operations: included.map((item) => item.undo) as unknown as Json,
			source_fingerprint: sourceFingerprint,
			status: 'pending',
			sort_order: 0
		})
		.select('*')
		.single();
	if (inserted.error) {
		if (inserted.error.code === '23505') {
			return {
				status: 'failed',
				reason: 'bundle_race',
				flagIds: included.filter((item) => !item.carried).map((item) => item.flagId)
			};
		}
		throw new Error(`freshness bundle insert failed: ${inserted.error.message}`);
	}
	const suggestion = inserted.data as Record<string, unknown>;
	const suggestionId = String(suggestion.id);

	const includedIds = included.map((item) => item.flagId);
	if (includedIds.length) {
		const linked = await db
			.from('freshness_flags')
			.update({ suggestion_id: suggestionId })
			.in('id', includedIds);
		if (linked.error) throw new Error(`freshness bundle link failed: ${linked.error.message}`);
	}

	await deps.syncInbox({ supabase: db, suggestion });
	await deps.applyBudget({ supabase: db, projectId: params.projectId });

	return {
		status: 'created',
		suggestionId,
		operationCount: operations.length,
		includedFlagIds: includedIds,
		carriedFlagIds: included.filter((item) => item.carried).map((item) => item.flagId),
		overCapFlagIds: overCap.map((item) => item.flagId),
		supersededIds
	};
}
