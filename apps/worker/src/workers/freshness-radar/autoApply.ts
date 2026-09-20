// apps/worker/src/workers/freshness-radar/autoApply.ts
//
// Stage [5a]: auto-apply (plan section 4 "Write path" and "Races"). Tasks only.
//   1. claim the flag (conditional update, one row),
//   2. re-read the task; if it changed since the snapshot, skip (never draft),
//   3. write through runGatewayWriteOp (the gateway still enforces access),
//   4. store applied_after_updated_at and the undo payload in the same update
//      that flips the disposition (the DB check rejects auto_applied without undo).
// A crash between the gateway write and step 4 leaves a claimed flag; the next
// scan of the project reconciles it.
//
// Amendment: the plan names an 'auto_applying' disposition, but the frozen
// freshness_flags CHECK has no such value. The claim is therefore recorded in
// disposition_reason: 'auto_apply_ready' -> 'auto_applying', while disposition
// stays 'auto_apply_pending' until the final update.

import type { FreshnessUndoPayload, LoopOperation } from '@buildos/shared-types';
import type { runGatewayWriteOp } from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import { storedCivilDate } from './dates';
import type { FreshnessDb } from './dataPort';
import { updateFlag } from './ledger';

export const AUTO_APPLY_READY_REASON = 'auto_apply_ready';
export const AUTO_APPLYING_REASON = 'auto_applying';

export type GatewayRunner = typeof runGatewayWriteOp;

export type AutoApplyCandidate = {
	flagId: string;
	taskId: string;
	title: string;
	/** updated_at of the task when the context was read. */
	snapshotUpdatedAt: string | null;
	field: 'state_key' | 'due_at';
	/** Proposed value: state key or civil YYYY-MM-DD. */
	to: string;
	/** Previous raw value (state key, full ISO timestamp, or null). */
	previousRaw: string | null;
	summary: string;
};

export type AutoApplyOutcome =
	| { flagId: string; status: 'applied'; appliedAt: string; appliedAfterUpdatedAt: string }
	| { flagId: string; status: 'skipped'; reason: string }
	| { flagId: string; status: 'demoted'; reason: string }
	| { flagId: string; status: 'not_claimed' };

type TaskRow = {
	id: string;
	project_id: string;
	state_key: string;
	due_at: string | null;
	updated_at: string | null;
	created_at: string | null;
	archived_at: string | null;
	deleted_at: string | null;
};

async function readTask(db: FreshnessDb, taskId: string): Promise<TaskRow | null> {
	const result = await db
		.from('onto_tasks')
		.select(
			'id, project_id, state_key, due_at, updated_at, created_at, archived_at, deleted_at'
		)
		.eq('id', taskId)
		.maybeSingle();
	if (result.error)
		throw new Error(`freshness radar task re-read failed: ${result.error.message}`);
	return (result.data ?? null) as TaskRow | null;
}

function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
	if (!a || !b) return !a && !b;
	const left = Date.parse(a);
	const right = Date.parse(b);
	return Number.isFinite(left) && Number.isFinite(right) ? left === right : a === b;
}

export function undoPayloadFor(params: {
	projectId: string;
	taskId: string;
	title: string;
	field: 'state_key' | 'due_at';
	previousRaw: string | null;
	expectAfterUpdatedAt: string;
}): FreshnessUndoPayload {
	const operation: LoopOperation = {
		tool: 'update_onto_task',
		args: {
			task_id: params.taskId,
			project_id: params.projectId,
			[params.field]: params.previousRaw
		},
		label:
			params.field === 'state_key'
				? `Restore "${params.title}" to ${params.previousRaw ?? 'its previous state'}`
				: `Restore the due date of "${params.title}"`
	};
	return { kind: 'entity_field', operation, expectAfterUpdatedAt: params.expectAfterUpdatedAt };
}

function currentMatches(task: TaskRow, candidate: AutoApplyCandidate, timeZone: string | null) {
	return candidate.field === 'state_key'
		? task.state_key === candidate.to
		: storedCivilDate(task.due_at, timeZone) === candidate.to;
}

/**
 * Rule 8: immediately before writing, no turn of the trigger session may be
 * queued or running; otherwise every candidate is demoted to a draft.
 */
export async function sessionHasActiveTurn(
	db: FreshnessDb,
	sessionId: string | null
): Promise<boolean> {
	if (!sessionId) return false;
	const result = await db
		.from('chat_turn_runs')
		.select('id')
		.eq('session_id', sessionId)
		.in('status', ['queued', 'running'])
		.limit(1);
	if (result.error) return true; // fail closed: treat as active
	return Array.isArray(result.data) && result.data.length > 0;
}

export async function runAutoApply(params: {
	db: FreshnessDb;
	userId: string;
	projectId: string;
	triggerSessionId: string | null;
	timeZone: string | null;
	candidates: readonly AutoApplyCandidate[];
	runGateway: GatewayRunner;
	now: () => Date;
	signal?: AbortSignal;
}): Promise<AutoApplyOutcome[]> {
	const { db } = params;
	if (!params.candidates.length) return [];

	if (await sessionHasActiveTurn(db, params.triggerSessionId)) {
		const outcomes: AutoApplyOutcome[] = [];
		for (const candidate of params.candidates) {
			await updateFlag(
				db,
				candidate.flagId,
				{ disposition: 'drafted', disposition_reason: 'draft_turn_running' },
				{ disposition: 'auto_apply_pending', disposition_reason: AUTO_APPLY_READY_REASON }
			);
			outcomes.push({ flagId: candidate.flagId, status: 'demoted', reason: 'turn_running' });
		}
		return outcomes;
	}

	const outcomes: AutoApplyOutcome[] = [];
	for (const candidate of params.candidates) {
		if (params.signal?.aborted) {
			// We no longer own the work: leave unclaimed flags as drafts.
			await updateFlag(
				db,
				candidate.flagId,
				{ disposition: 'drafted', disposition_reason: 'draft_scan_aborted' },
				{ disposition: 'auto_apply_pending', disposition_reason: AUTO_APPLY_READY_REASON }
			);
			outcomes.push({ flagId: candidate.flagId, status: 'demoted', reason: 'aborted' });
			continue;
		}
		const claimed = await updateFlag(
			db,
			candidate.flagId,
			{ disposition_reason: AUTO_APPLYING_REASON },
			{ disposition: 'auto_apply_pending', disposition_reason: AUTO_APPLY_READY_REASON }
		);
		if (!claimed) {
			outcomes.push({ flagId: candidate.flagId, status: 'not_claimed' });
			continue;
		}

		const task = await readTask(db, candidate.taskId);
		if (
			!task ||
			task.project_id !== params.projectId ||
			task.archived_at ||
			task.deleted_at ||
			!sameInstant(task.updated_at ?? task.created_at, candidate.snapshotUpdatedAt)
		) {
			await updateFlag(db, candidate.flagId, {
				disposition: 'auto_apply_skipped',
				disposition_reason: 'changed_since_snapshot',
				status: 'resolved_by_change'
			});
			outcomes.push({
				flagId: candidate.flagId,
				status: 'skipped',
				reason: 'changed_since_snapshot'
			});
			continue;
		}

		const result = await params.runGateway({
			admin: db as never,
			userId: params.userId,
			scope: {
				mode: 'read_write',
				project_ids: [params.projectId],
				allowed_ops: ['onto.task.update']
			},
			op: 'onto.task.update',
			args: {
				task_id: candidate.taskId,
				[candidate.field]: candidate.to,
				calendar_sync: 'none'
			},
			chatSessionId: params.triggerSessionId ?? undefined
		});
		const written = (result.data?.task ?? null) as { updated_at?: unknown } | null;
		const afterUpdatedAt = typeof written?.updated_at === 'string' ? written.updated_at : null;
		if (!result.ok || !afterUpdatedAt) {
			const reason = `gateway_${result.error?.code?.toLowerCase() ?? 'no_row'}`;
			await updateFlag(db, candidate.flagId, {
				disposition: 'auto_apply_skipped',
				disposition_reason: reason
			});
			outcomes.push({ flagId: candidate.flagId, status: 'skipped', reason });
			continue;
		}

		const appliedAt = params.now().toISOString();
		await updateFlag(db, candidate.flagId, {
			disposition: 'auto_applied',
			disposition_reason: 'auto_applied',
			applied_via: 'auto',
			applied_at: appliedAt,
			applied_after_updated_at: afterUpdatedAt,
			undo_operation: undoPayloadFor({
				projectId: params.projectId,
				taskId: candidate.taskId,
				title: candidate.title,
				field: candidate.field,
				previousRaw: candidate.previousRaw,
				expectAfterUpdatedAt: afterUpdatedAt
			})
		});
		outcomes.push({
			flagId: candidate.flagId,
			status: 'applied',
			appliedAt,
			appliedAfterUpdatedAt: afterUpdatedAt
		});
	}
	return outcomes;
}

/**
 * Crash reconciliation (section 4 "Races"): a flag still claimed
 * ('auto_applying') whose task now holds the proposed value was written; mark it
 * auto_applied with the task's current updated_at and a full undo payload.
 * Otherwise the write never happened: skip it, fail closed.
 */
export async function reconcileClaimedAutoApplies(params: {
	db: FreshnessDb;
	projectId: string;
	timeZone: string | null;
	now: () => Date;
}): Promise<{ reconciled: number; released: number }> {
	const result = await params.db
		.from('freshness_flags')
		.select('id, subject_id, subject_title, subject_snapshot, proposed_operation, created_at')
		.eq('project_id', params.projectId)
		.eq('subject_kind', 'task')
		.eq('disposition', 'auto_apply_pending')
		.eq('disposition_reason', AUTO_APPLYING_REASON)
		.limit(50);
	if (result.error)
		throw new Error(`freshness radar reconcile read failed: ${result.error.message}`);
	let reconciled = 0;
	let released = 0;
	for (const row of (result.data ?? []) as Array<{
		id: unknown;
		subject_id: unknown;
		subject_title?: unknown;
		subject_snapshot?: Record<string, unknown> | null;
		proposed_operation?: { args?: Record<string, unknown> } | null;
	}>) {
		const args = (row.proposed_operation?.args ?? {}) as Record<string, unknown>;
		const field: 'state_key' | 'due_at' | null =
			typeof args.state_key === 'string'
				? 'state_key'
				: typeof args.due_at === 'string'
					? 'due_at'
					: null;
		const snapshot = (row.subject_snapshot ?? {}) as Record<string, unknown>;
		const task = field ? await readTask(params.db, String(row.subject_id)) : null;
		const candidate: AutoApplyCandidate | null = field
			? {
					flagId: String(row.id),
					taskId: String(row.subject_id),
					title: String(row.subject_title ?? ''),
					snapshotUpdatedAt: null,
					field,
					to: String(args[field]),
					previousRaw:
						field === 'state_key'
							? ((snapshot.state_key as string | null) ?? null)
							: ((snapshot.due_at as string | null) ?? null),
					summary: ''
				}
			: null;
		const afterUpdatedAt = task ? (task.updated_at ?? task.created_at) : null;
		if (
			candidate &&
			task &&
			afterUpdatedAt &&
			currentMatches(task, candidate, params.timeZone)
		) {
			await updateFlag(
				params.db,
				candidate.flagId,
				{
					disposition: 'auto_applied',
					disposition_reason: 'auto_applied_reconciled',
					applied_via: 'auto',
					applied_at: params.now().toISOString(),
					applied_after_updated_at: afterUpdatedAt,
					undo_operation: undoPayloadFor({
						projectId: params.projectId,
						taskId: candidate.taskId,
						title: candidate.title,
						field: candidate.field,
						previousRaw: candidate.previousRaw,
						expectAfterUpdatedAt: afterUpdatedAt
					})
				},
				{ disposition_reason: AUTO_APPLYING_REASON }
			);
			reconciled += 1;
		} else {
			await updateFlag(
				params.db,
				String(row.id),
				{
					disposition: 'auto_apply_skipped',
					disposition_reason: 'interrupted_before_write'
				},
				{ disposition_reason: AUTO_APPLYING_REASON }
			);
			released += 1;
		}
	}
	return { reconciled, released };
}
