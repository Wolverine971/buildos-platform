// apps/worker/src/workers/freshness-radar/drafts.ts
//
// Stage [5c]: the draft bundle (plan section 5). One project_suggestions row of
// kind 'freshness_update' per scan with at least one draft; it is the project's
// single AI Inbox item. Built in order: verify (fail closed) -> supersede the
// previous pending bundle, carrying forward still-valid drafts -> insert (the
// unique index is the backstop) -> sync the inbox item -> attention budget.
// Operations are code-authored and labeled with the exact entity title; the
// bundle never quotes chat (privacy): evidence_refs carry entity ids only.

import {
	FRESHNESS_UPDATE_SUGGESTION_KIND,
	type Json,
	type LoopOperation,
	type ProjectSuggestionEvidenceRef,
	type ProjectSuggestionEvidenceType,
	type ProjectSuggestionPreview
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

const KIND_PLURAL: Record<DraftItem['entityKind'], [string, string]> = {
	task: ['task', 'tasks'],
	goal: ['goal', 'goals'],
	milestone: ['milestone', 'milestones']
};

export function bundleTitle(count: number): string {
	return `Update ${count} out-of-date item${count === 1 ? '' : 's'}`;
}

/** "From your update on 2026-09-18 · 2 tasks, 1 milestone" (no chat quotes). */
export function bundleSummary(items: readonly DraftItem[], civilDate: string): string {
	const counts = new Map<DraftItem['entityKind'], number>();
	for (const item of items) counts.set(item.entityKind, (counts.get(item.entityKind) ?? 0) + 1);
	const parts = (['task', 'milestone', 'goal'] as const)
		.filter((kind) => counts.get(kind))
		.map((kind) => {
			const count = counts.get(kind)!;
			return `${count} ${KIND_PLURAL[kind][count === 1 ? 0 : 1]}`;
		});
	return `From your update on ${civilDate} · ${parts.join(', ')}`;
}

type PendingBundle = {
	id: string;
	operations: unknown;
	created_at: string;
};

async function loadPendingBundle(
	db: FreshnessDb,
	projectId: string
): Promise<PendingBundle | null> {
	const result = await db
		.from('project_suggestions')
		.select('id, operations, created_at')
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
	isUnchanged: (flag: CarriedFlagRow) => boolean;
	now: Date;
	policy: FreshnessPolicyV1;
}): Promise<DraftBundleResult> {
	const { db, deps, policy } = params;
	if (!params.drafts.length) return { status: 'none' };
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

	const operations = included.map((item) => item.operation);
	const title = bundleTitle(operations.length);
	const preview: ProjectSuggestionPreview = {
		kind: 'generic',
		summary: title,
		after: included.map((item) => item.operation.label ?? item.title)
	};
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
	const sourceFingerprint = await deps.fingerprint(db, params.projectId, operations);

	// Supersede the previous pending bundle (conditional on still pending).
	const supersededIds: string[] = [];
	if (previous) {
		const superseded = await db
			.from('project_suggestions')
			.update({
				status: 'superseded',
				decided_at: nowIso,
				result: {
					ok: false,
					superseded_by_freshness_scan: params.scanId
				} as unknown as Json
			})
			.eq('id', previous.id)
			.eq('status', 'pending')
			.select('*');
		if (superseded.error)
			throw new Error(`freshness bundle supersede failed: ${superseded.error.message}`);
		for (const row of (superseded.data ?? []) as Array<Record<string, unknown>>) {
			supersededIds.push(String(row.id));
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
	}

	const evidenceRefs: ProjectSuggestionEvidenceRef[] = included.map((item) => ({
		entity_type: item.entityKind as ProjectSuggestionEvidenceType,
		entity_id: item.entityId,
		title: item.title
	}));
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
			rationale: null,
			why_now: bundleSummary(included, params.today),
			confidence: Math.max(...included.map((item) => item.probability)),
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
	const linked = await db
		.from('freshness_flags')
		.update({ suggestion_id: suggestionId })
		.in('id', includedIds);
	if (linked.error) throw new Error(`freshness bundle link failed: ${linked.error.message}`);

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
