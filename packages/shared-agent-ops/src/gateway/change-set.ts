// packages/shared-agent-ops/src/gateway/change-set.ts
//
// Commit a staged Change Set. Applies the approved ProposedChanges
// through the SAME worker-safe write path used for direct-commit runs
// (runGatewayWriteOp), so there is one mutation path, not two. Per-change result
// is recorded (applied_entity_id / error); applied changes are promoted into the
// run's entities_touched; the run is flipped to a terminal status.
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	AgentCallScope,
	ChangeSet,
	ChangeSetDecision,
	ChangeSetStatus,
	Database,
	EntityTouch,
	ProposedChange
} from '@buildos/shared-types';
import { defaultAllowedOpsForMode } from '../policy';
import {
	buildGatewayEntityUrl,
	buildGatewayProjectUrl,
	entityActionFromProposedChangeAction,
	runGatewayWriteOp,
	titleFromGatewayChange
} from './op-execution-gateway';
import { AGENT_RUN_CHANGE_SET_SELECT } from './op-execution-gateway.config';
import { START_HERE_DOCUMENT_TYPE_KEY, stripStartHereManagedRegions } from '../ontology/start-here';
import { syncInboxItemForAgentRun } from '../inbox-index';

export interface CommitChangeSetResult {
	change_set_status: ChangeSetStatus;
	run_status: 'completed' | 'partial';
	applied: number;
	rejected: number;
	failed: number;
	change_set: ChangeSet;
	entities_touched: EntityTouch[];
}

export type CommitChangeSetOutcome =
	| { ok: true; result: CommitChangeSetResult }
	| {
			ok: false;
			error: {
				code: 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_ERROR' | 'INTERNAL';
				message: string;
			};
	  };

function summarizeCommittedChangeSet(params: {
	changeSet: ChangeSet;
	runStatus: 'completed' | 'partial';
	result: Record<string, unknown>;
}): CommitChangeSetResult {
	const entitiesTouched = Array.isArray(params.result.entities_touched)
		? (params.result.entities_touched as EntityTouch[])
		: [];
	let applied = 0;
	let rejected = 0;
	let failed = 0;

	for (const change of params.changeSet.changes) {
		if (change.decision === 'rejected') {
			rejected += 1;
		} else if (change.error) {
			failed += 1;
		} else {
			applied += 1;
		}
	}

	return {
		change_set_status: params.changeSet.status,
		run_status: params.runStatus,
		applied,
		rejected,
		failed,
		change_set: params.changeSet,
		entities_touched: entitiesTouched
	};
}

const CHANGE_SET_DRIFT_ENTITY_CONFIG: Record<
	string,
	{
		table: string;
		select: string;
	}
> = {
	project: {
		table: 'onto_projects',
		select: 'id, name, description, type_key, state_key, props, start_at, end_at, created_by, created_at, updated_at, archived_at, deleted_at'
	},
	task: {
		table: 'onto_tasks',
		select: 'id, project_id, title, description, type_key, state_key, priority, start_at, due_at, completed_at, props, created_at, updated_at, archived_at, deleted_at'
	},
	document: {
		table: 'onto_documents',
		select: 'id, project_id, title, description, type_key, state_key, content, props, children, created_at, updated_at, archived_at, deleted_at'
	},
	goal: {
		table: 'onto_goals',
		select: 'id, project_id, name, goal, description, type_key, state_key, target_date, completed_at, props, created_at, updated_at, archived_at, deleted_at'
	},
	plan: {
		table: 'onto_plans',
		select: 'id, project_id, name, description, plan, type_key, state_key, props, created_at, updated_at, archived_at, deleted_at'
	},
	milestone: {
		table: 'onto_milestones',
		select: 'id, project_id, title, description, type_key, state_key, target_date, completed_at, props, created_at, updated_at, archived_at, deleted_at'
	},
	risk: {
		table: 'onto_risks',
		select: 'id, project_id, title, description, type_key, state_key, probability, impact, mitigation, owner_actor_id, resolved_at, props, created_at, updated_at, archived_at, deleted_at'
	}
};

function asChangeSet(value: unknown, runId: string): ChangeSet | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const v = value as Record<string, unknown>;
	if (!Array.isArray(v.changes)) return null;
	return {
		run_id: typeof v.run_id === 'string' ? v.run_id : runId,
		status: (v.status as ChangeSetStatus) ?? 'pending',
		changes: v.changes as ProposedChange[],
		created_at: typeof v.created_at === 'string' ? v.created_at : new Date().toISOString()
	};
}

function normalizeForComparison(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((entry) => normalizeForComparison(entry));
	}
	if (!value || typeof value !== 'object') {
		return value;
	}

	const sorted: Record<string, unknown> = {};
	for (const key of Object.keys(value as Record<string, unknown>).sort()) {
		const entry = (value as Record<string, unknown>)[key];
		if (entry !== undefined) {
			sorted[key] = normalizeForComparison(entry);
		}
	}
	return sorted;
}

function sameSnapshot(left: unknown, right: unknown): boolean {
	return (
		JSON.stringify(normalizeForComparison(left)) ===
		JSON.stringify(normalizeForComparison(right))
	);
}

function subsetToSnapshotKeys(
	current: Record<string, unknown>,
	before: Record<string, unknown>
): Record<string, unknown> {
	const subset: Record<string, unknown> = {};
	for (const key of Object.keys(before)) {
		subset[key] = current[key];
	}
	return subset;
}

function omitVolatileSnapshotFields(snapshot: Record<string, unknown>): Record<string, unknown> {
	const stableSnapshot = { ...snapshot };
	delete stableSnapshot.updated_at;
	return stableSnapshot;
}

async function verifyStagedChangeFreshness(params: {
	admin: SupabaseClient<Database>;
	change: ProposedChange;
}): Promise<{ ok: true } | { ok: false; message: string }> {
	const { admin, change } = params;
	if (change.action === 'create') {
		return { ok: true };
	}
	if (!change.before || typeof change.before !== 'object' || Array.isArray(change.before)) {
		return { ok: true };
	}
	if (!change.entity_id) {
		return { ok: true };
	}

	const config = CHANGE_SET_DRIFT_ENTITY_CONFIG[change.entity_type];
	if (!config) {
		return { ok: true };
	}

	const before = change.before as Record<string, unknown>;
	const { data, error } = await (admin as any)
		.from(config.table)
		.select(config.select)
		.eq('id', change.entity_id)
		.maybeSingle();

	if (error) {
		return {
			ok: false,
			message: `Failed to verify staged ${change.entity_type} freshness: ${error.message}`
		};
	}
	if (!data) {
		return {
			ok: false,
			message: `Staged ${change.entity_type} change is stale: the reviewed entity no longer exists`
		};
	}

	const currentSubset = subsetToSnapshotKeys(data as Record<string, unknown>, before);
	// Start Here documents have machine-owned managed regions (status/map) that the
	// snapshot worker refreshes independently of authored edits. Drift inside those
	// fences must not block an authored-section proposal, so compare only the
	// authored body for `document.context.project` docs.
	const [beforeForCompare, currentForCompare] = normalizeStartHereDriftSnapshots(
		change.entity_type,
		before,
		currentSubset
	);
	if (
		!sameSnapshot(
			omitVolatileSnapshotFields(currentForCompare),
			omitVolatileSnapshotFields(beforeForCompare)
		)
	) {
		return {
			ok: false,
			message: `Staged ${change.entity_type} change is stale: current data no longer matches the reviewed before snapshot`
		};
	}

	return { ok: true };
}

function normalizeStartHereDriftSnapshots(
	entityType: string,
	before: Record<string, unknown>,
	current: Record<string, unknown>
): [Record<string, unknown>, Record<string, unknown>] {
	const isStartHereDoc =
		entityType === 'document' && before.type_key === START_HERE_DOCUMENT_TYPE_KEY;
	if (!isStartHereDoc) {
		return [before, current];
	}

	const stripContent = (snapshot: Record<string, unknown>): Record<string, unknown> => {
		const next = { ...snapshot };
		if (typeof next.content === 'string') {
			next.content = stripStartHereManagedRegions(next.content);
		}
		if (next.props && typeof next.props === 'object' && !Array.isArray(next.props)) {
			const props = { ...(next.props as Record<string, unknown>) };
			if (typeof props.body_markdown === 'string') {
				props.body_markdown = stripStartHereManagedRegions(props.body_markdown);
			}
			next.props = props;
		}
		return next;
	};

	return [stripContent(before), stripContent(current)];
}

// D9b: a commit that claimed proposal_ready -> running but never wrote a terminal
// status (crash / lambda kill between claim and final update) is considered stalled
// once its commit_started_at heartbeat is older than this. A live commit heartbeats
// after every applied change, so this threshold only ever fires on a genuinely dead
// commit — a concurrent live commit keeps the timestamp fresh and stays protected.
const STALE_COMMIT_MS = 2 * 60 * 1000;

function readCommitStartedAt(run: unknown): string | null {
	if (!run || typeof run !== 'object') return null;
	const value = (run as { commit_started_at?: unknown }).commit_started_at;
	return typeof value === 'string' ? value : null;
}

// Rebuild an EntityTouch for a change we know applied in a prior (crashed) commit
// attempt, from the change + the entity_id recorded on its agent_tool_executions row.
// Mirrors the fallback branch of the live apply loop (which prefers the gateway
// result but falls back to change-derived values).
function entityTouchFromAppliedChange(
	change: ProposedChange,
	appliedEntityId: string,
	entityKind: string | null,
	runProjectId: string | null
): EntityTouch {
	const projectId =
		(typeof change.after?.project_id === 'string' ? change.after.project_id : null) ??
		(typeof change.before?.project_id === 'string' ? change.before.project_id : null) ??
		runProjectId ??
		null;
	const touchType = entityKind ?? change.entity_type;
	return {
		type: touchType,
		id: appliedEntityId,
		action: entityActionFromProposedChangeAction(change.action),
		description: change.rationale,
		project_id: projectId,
		title: titleFromGatewayChange(change),
		url: buildGatewayEntityUrl(touchType, appliedEntityId, projectId),
		project_url: buildGatewayProjectUrl(projectId)
	};
}

/**
 * Apply a run's staged Change Set. `decisions` carries per-change approve/reject;
 * any change not named defaults to `defaultDecision` ('approved' unless set). The
 * run must currently be 'proposal_ready' (the caller should gate on this; we also
 * verify to avoid double-apply).
 *
 * Crash recovery (D9b): the claim (proposal_ready -> running) records
 * commit_started_at, heartbeated after each applied change. If a commit crashes
 * mid-apply the run stays 'running'; a later commit whose commit_started_at is stale
 * re-enters via an atomic compare-and-swap on commit_started_at, then skips changes
 * that already have a successful agent_tool_executions row so applied writes are not
 * duplicated. The atomic claim / CAS keeps two concurrent commits from both applying.
 */
export async function commitChangeSet(params: {
	admin: SupabaseClient<Database>;
	runId: string;
	userId: string;
	decisions?: ChangeSetDecision[];
	defaultDecision?: 'approved' | 'rejected';
}): Promise<CommitChangeSetOutcome> {
	const { admin, runId, userId } = params;
	const defaultDecision = params.defaultDecision ?? 'approved';

	const { data: run, error: runError } = await admin
		.from('agent_runs')
		.select(AGENT_RUN_CHANGE_SET_SELECT as '*')
		.eq('id', runId)
		.eq('user_id', userId)
		.maybeSingle();

	if (runError) {
		return { ok: false, error: { code: 'INTERNAL', message: runError.message } };
	}
	if (!run) {
		return { ok: false, error: { code: 'NOT_FOUND', message: 'Agent run not found' } };
	}
	// D9b: distinguish a fresh commit (proposal_ready) from re-entering a stalled
	// commit (running with a stale commit_started_at). A run that is 'running' for any
	// other reason — an in-flight commit whose heartbeat is still fresh, or original
	// run execution (which never sets commit_started_at) — stays protected.
	let isStalledCommitReentry = false;
	const staleCommitStartedAt = readCommitStartedAt(run);
	if (run.status !== 'proposal_ready') {
		if (run.status === 'completed' || run.status === 'partial') {
			const committedChangeSet = asChangeSet(run.change_set, runId);
			if (committedChangeSet && committedChangeSet.status !== 'pending') {
				try {
					await syncInboxItemForAgentRun({ supabase: admin as any, run: run as any });
				} catch (error) {
					console.warn('[AI Inbox] Failed to sync committed change set', {
						runId,
						error: error instanceof Error ? error.message : String(error)
					});
				}
				const result =
					run.result && typeof run.result === 'object' && !Array.isArray(run.result)
						? (run.result as Record<string, unknown>)
						: {};
				return {
					ok: true,
					result: summarizeCommittedChangeSet({
						changeSet: committedChangeSet,
						runStatus: run.status,
						result
					})
				};
			}
		}
		const startedAtMs = staleCommitStartedAt ? Date.parse(staleCommitStartedAt) : NaN;
		const isStalled =
			run.status === 'running' &&
			Number.isFinite(startedAtMs) &&
			Date.now() - startedAtMs > STALE_COMMIT_MS;
		if (!isStalled) {
			return {
				ok: false,
				error: {
					code: 'CONFLICT',
					message: `Run is ${run.status}, not awaiting proposal review`
				}
			};
		}
		isStalledCommitReentry = true;
	}

	const changeSet = asChangeSet(run.change_set, runId);
	if (!changeSet || changeSet.changes.length === 0) {
		return {
			ok: false,
			error: { code: 'VALIDATION_ERROR', message: 'Run has no staged changes to commit' }
		};
	}

	const commitHeartbeat = new Date().toISOString();

	// Atomically CLAIM the run before applying anything. Two concurrent commit
	// requests would otherwise both pass the status check above and both apply
	// the (non-idempotent) writes, duplicating creates. Flipping
	// proposal_ready -> running here means the loser's claim affects 0 rows. A
	// stalled-commit re-entry instead compare-and-swaps on commit_started_at so two
	// concurrent re-entries can't both proceed.
	// Typed as any so the commit_started_at CAS filters (a column absent from the
	// generated types until gen:types runs) don't trip the compiler.
	let claimQuery: any = admin
		.from('agent_runs')
		.update(
			(isStalledCommitReentry
				? { commit_started_at: commitHeartbeat }
				: { status: 'running', commit_started_at: commitHeartbeat }) as never
		)
		.eq('id', runId)
		.eq('user_id', userId)
		.eq('status', isStalledCommitReentry ? 'running' : 'proposal_ready');
	if (isStalledCommitReentry) {
		// CAS: only re-claim if commit_started_at is still the stale value we read.
		claimQuery = staleCommitStartedAt
			? claimQuery.eq('commit_started_at', staleCommitStartedAt)
			: claimQuery.is('commit_started_at', null);
	}
	const { data: claimed, error: claimError } = await claimQuery.select('id').maybeSingle();
	if (claimError) {
		return { ok: false, error: { code: 'INTERNAL', message: claimError.message } };
	}
	if (!claimed) {
		return {
			ok: false,
			error: { code: 'CONFLICT', message: 'Change set is already being committed' }
		};
	}

	// On re-entry, load the changes a prior (crashed) attempt already applied so we
	// never re-run a non-idempotent write. agent_tool_executions is written per change
	// right after the mutation, so a success row is the durable "already applied"
	// signal.
	const alreadyAppliedByChangeId = new Map<
		string,
		{ entityId: string | null; entityKind: string | null }
	>();
	if (isStalledCommitReentry) {
		const { data: priorExecs, error: priorExecsError } = await admin
			.from('agent_tool_executions')
			.select('proposed_change_id, entity_id, entity_kind, success')
			.eq('agent_run_id', runId)
			.eq('user_id', userId)
			.eq('mutation_mode', 'commit')
			.eq('success', true);
		if (priorExecsError) {
			return { ok: false, error: { code: 'INTERNAL', message: priorExecsError.message } };
		}
		for (const row of priorExecs ?? []) {
			const changeId = (row as { proposed_change_id?: unknown }).proposed_change_id;
			if (typeof changeId === 'string') {
				alreadyAppliedByChangeId.set(changeId, {
					entityId: (row as { entity_id?: string | null }).entity_id ?? null,
					entityKind: (row as { entity_kind?: string | null }).entity_kind ?? null
				});
			}
		}
	}

	// Defense-in-depth: a staged op must still be within the run's granted scope.
	const allowedOps = run.allowed_ops ?? defaultAllowedOpsForMode('read_write');

	const decisionById = new Map<string, 'approved' | 'rejected'>();
	for (const d of params.decisions ?? []) {
		if (d && typeof d.change_id === 'string') {
			decisionById.set(d.change_id, d.decision === 'rejected' ? 'rejected' : 'approved');
		}
	}

	const scope: AgentCallScope = {
		mode: 'read_write',
		allowed_ops: (run.allowed_ops ?? undefined) as AgentCallScope['allowed_ops'],
		project_ids: run.context_type === 'project' && run.project_id ? [run.project_id] : undefined
	};

	const entitiesTouched: EntityTouch[] = [];
	let applied = 0;
	let rejected = 0;
	let failed = 0;

	const committedAt = new Date().toISOString();

	for (const change of changeSet.changes) {
		const decision = decisionById.get(change.id) ?? defaultDecision;
		change.decision = decision;

		if (decision === 'rejected') {
			rejected += 1;
			continue;
		}

		// D9b: a prior crashed commit already applied this change — count it, rebuild
		// its EntityTouch, and skip re-running the (non-idempotent) write.
		const priorApplied = alreadyAppliedByChangeId.get(change.id);
		if (priorApplied) {
			applied += 1;
			const appliedId = priorApplied.entityId ?? change.entity_id ?? undefined;
			change.applied_entity_id = appliedId;
			change.error = undefined;
			if (appliedId) {
				entitiesTouched.push(
					entityTouchFromAppliedChange(
						change,
						appliedId,
						priorApplied.entityKind,
						run.project_id ?? null
					)
				);
			}
			continue;
		}

		// The op must still be within the run's granted scope (the change set is
		// worker-written, so this only fires on a genuine scope mismatch).
		if (!allowedOps.includes(change.op)) {
			failed += 1;
			change.error = `Op ${change.op} is outside the run's granted scope`;
			continue;
		}

		const freshness = await verifyStagedChangeFreshness({ admin, change });
		if (!freshness.ok) {
			failed += 1;
			change.error = freshness.message;
			await admin.from('agent_tool_executions').insert({
				agent_run_id: runId,
				user_id: userId,
				tool_name: change.op,
				gateway_op: change.op,
				tool_category: 'write',
				arguments: (change.after ?? null) as never,
				result: null as never,
				success: false,
				error_message: change.error,
				mutation_mode: 'commit',
				proposed_change_id: change.id,
				entity_kind: change.entity_type,
				entity_id: change.entity_id ?? null
			});
			continue;
		}

		const args =
			change.after && typeof change.after === 'object' && !Array.isArray(change.after)
				? (change.after as Record<string, unknown>)
				: {};

		const result = await runGatewayWriteOp({
			admin,
			userId,
			scope,
			op: change.op,
			args
		});

		if (result.ok) {
			applied += 1;
			const appliedId = result.entityId ?? change.entity_id ?? undefined;
			const projectId =
				result.entityProjectId ??
				(typeof change.after?.project_id === 'string' ? change.after.project_id : null) ??
				(typeof change.before?.project_id === 'string' ? change.before.project_id : null) ??
				run.project_id ??
				null;
			const touchType = result.entityKind ?? change.entity_type;
			change.applied_entity_id = appliedId;
			change.error = undefined;
			if (appliedId) {
				entitiesTouched.push({
					type: touchType,
					id: appliedId,
					action: entityActionFromProposedChangeAction(change.action),
					description: change.rationale,
					project_id: projectId,
					title: result.entityTitle ?? titleFromGatewayChange(change),
					url: buildGatewayEntityUrl(touchType, appliedId, projectId),
					project_url: buildGatewayProjectUrl(projectId)
				});
			}
			// Telemetry: record the actual commit, keyed to the proposed change.
			await admin.from('agent_tool_executions').insert({
				agent_run_id: runId,
				user_id: userId,
				tool_name: change.op,
				gateway_op: change.op,
				tool_category: 'write',
				arguments: args as never,
				result: (result.data ?? null) as never,
				success: true,
				mutation_mode: 'commit',
				proposed_change_id: change.id,
				entity_kind: result.entityKind ?? change.entity_type,
				entity_id: appliedId ?? null
			});
		} else {
			failed += 1;
			change.error = result.error?.message ?? 'Failed to apply change';
			await admin.from('agent_tool_executions').insert({
				agent_run_id: runId,
				user_id: userId,
				tool_name: change.op,
				gateway_op: change.op,
				tool_category: 'write',
				arguments: args as never,
				result: null as never,
				success: false,
				error_message: change.error,
				mutation_mode: 'commit',
				proposed_change_id: change.id,
				entity_kind: change.entity_type
			});
		}

		// D9b: heartbeat progress after each applied change so a concurrent commit
		// request sees a fresh commit_started_at and stays out (CONFLICT) while this
		// commit is live — only a genuinely dead commit goes stale and is re-entered.
		await admin
			.from('agent_runs')
			.update({ commit_started_at: new Date().toISOString() } as never)
			.eq('id', runId)
			.eq('user_id', userId)
			.eq('status', 'running');
	}

	const approved = applied + failed;
	let changeSetStatus: ChangeSetStatus;
	if (approved === 0) {
		changeSetStatus = 'rejected';
	} else if (failed === 0 && rejected === 0) {
		changeSetStatus = 'applied';
	} else {
		changeSetStatus = 'partially_applied';
	}
	changeSet.status = changeSetStatus;

	// Any approved change that failed to apply makes the run 'partial' — an
	// approved-but-failed write must not be hidden behind a 'completed' status.
	// Rejections are a normal review outcome and do not downgrade the status.
	const runStatus: 'completed' | 'partial' = failed > 0 ? 'partial' : 'completed';

	// Merge the newly-applied entities into the run's result envelope.
	const priorResult =
		run.result && typeof run.result === 'object' && !Array.isArray(run.result)
			? (run.result as Record<string, unknown>)
			: {};
	const priorTouched = Array.isArray(priorResult.entities_touched)
		? (priorResult.entities_touched as EntityTouch[])
		: [];
	const mergedResult = {
		...priorResult,
		entities_touched: [...priorTouched, ...entitiesTouched],
		proposed_changes: changeSet
	};

	const { error: updateError } = await admin
		.from('agent_runs')
		.update({
			status: runStatus,
			change_set: changeSet as never,
			result: mergedResult as never,
			completed_at: committedAt
		})
		.eq('id', runId)
		.eq('user_id', userId)
		.eq('status', 'running');

	if (updateError) {
		return { ok: false, error: { code: 'INTERNAL', message: updateError.message } };
	}

	try {
		await syncInboxItemForAgentRun({
			supabase: admin as any,
			run: {
				...(run as Record<string, unknown>),
				status: runStatus,
				change_set: changeSet,
				result: mergedResult,
				completed_at: committedAt
			}
		});
	} catch (error) {
		console.warn('[AI Inbox] Failed to sync committed change set', {
			runId,
			error: error instanceof Error ? error.message : String(error)
		});
	}

	return {
		ok: true,
		result: {
			change_set_status: changeSetStatus,
			run_status: runStatus,
			applied,
			rejected,
			failed,
			change_set: changeSet,
			entities_touched: entitiesTouched
		}
	};
}
