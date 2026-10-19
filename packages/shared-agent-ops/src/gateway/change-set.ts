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
	gatewayCreateId,
	type GatewayCreateTable
} from './op-execution-gateway.create-idempotency';
import {
	buildGatewayEntityUrl,
	buildGatewayProjectUrl,
	entityActionFromProposedChangeAction,
	runGatewayWriteOp,
	titleFromGatewayChange
} from './op-execution-gateway';
import {
	AGENT_RUN_CHANGE_SET_SELECT,
	ONTO_DOCUMENT_SELECT,
	ONTO_GOAL_SELECT,
	ONTO_MILESTONE_SELECT,
	ONTO_PLAN_SELECT,
	ONTO_PROJECT_SELECT,
	ONTO_RISK_SELECT,
	ONTO_TASK_SELECT
} from './op-execution-gateway.config';
import {
	START_HERE_DOCUMENT_TYPE_KEY,
	rebaseStartHereReviewedContent,
	stripStartHereManagedRegions
} from '../ontology/start-here';
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

// Receipts are the durable recovery log, not best-effort telemetry. Leave a
// claimed run running on any recording failure so recovery can safely retry.
async function recordCommitReceipt(
	admin: SupabaseClient<Database>,
	payload: Record<string, unknown>
): Promise<string | null> {
	try {
		const { error } = await admin.from('agent_tool_executions').insert(payload as never);
		return error ? `Failed to record change-set receipt: ${error.message}` : null;
	} catch (error) {
		return `Failed to record change-set receipt: ${error instanceof Error ? error.message : String(error)}`;
	}
}

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
		select: ONTO_PROJECT_SELECT
	},
	task: {
		table: 'onto_tasks',
		select: ONTO_TASK_SELECT
	},
	document: {
		table: 'onto_documents',
		select: ONTO_DOCUMENT_SELECT
	},
	goal: {
		table: 'onto_goals',
		select: ONTO_GOAL_SELECT
	},
	plan: {
		table: 'onto_plans',
		select: ONTO_PLAN_SELECT
	},
	milestone: {
		table: 'onto_milestones',
		select: ONTO_MILESTONE_SELECT
	},
	risk: {
		table: 'onto_risks',
		select: ONTO_RISK_SELECT
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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// Op arguments that rewrite a document's `content` column under another name.
const CONTENT_WRITE_ARGS = ['content', 'edits', 'section_edits'] as const;

/**
 * The before/current snapshots narrowed to what an update actually writes: the
 * argument keys that are columns of the row, `content` for any content edit, and
 * only the `props` keys the update sets. Drift elsewhere on the row (another
 * props key, the `children` column, a managed START HERE region) cannot be lost
 * by applying this change, so it must not block the approval. Updates with no
 * row-column writes (relationships/archive flags) have an empty write set.
 * Other actions (deletes, moves) still compare the whole reviewed snapshot.
 */
function stagedWriteSetSnapshots(
	change: ProposedChange,
	before: Record<string, unknown>,
	current: Record<string, unknown>
): [Record<string, unknown>, Record<string, unknown>] | null {
	if (change.action !== 'update' || !isPlainRecord(change.after)) return null;
	const after = change.after;
	const keys = new Set<string>();
	for (const key of Object.keys(after)) {
		if (key === 'id' || key === 'props') continue;
		if (Object.prototype.hasOwnProperty.call(before, key)) keys.add(key);
	}
	if (
		CONTENT_WRITE_ARGS.some((key) => after[key] !== undefined) &&
		Object.prototype.hasOwnProperty.call(before, 'content')
	) {
		keys.add('content');
	}
	const scopedBefore: Record<string, unknown> = {};
	const scopedCurrent: Record<string, unknown> = {};
	for (const key of keys) {
		scopedBefore[key] = before[key];
		scopedCurrent[key] = current[key];
	}
	if (isPlainRecord(after.props) && Object.prototype.hasOwnProperty.call(before, 'props')) {
		const beforeProps = isPlainRecord(before.props) ? before.props : {};
		const currentProps = isPlainRecord(current.props) ? current.props : {};
		const propsBefore: Record<string, unknown> = {};
		const propsCurrent: Record<string, unknown> = {};
		for (const key of Object.keys(after.props)) {
			propsBefore[key] = beforeProps[key];
			propsCurrent[key] = currentProps[key];
		}
		scopedBefore.props = propsBefore;
		scopedCurrent.props = propsCurrent;
	}
	return [scopedBefore, scopedCurrent];
}

/**
 * A staged START HERE rewrite whose document has moved on (later checkpoints
 * append lines): re-apply the reviewed sections on top of the current document
 * when no reviewed section was touched since staging. Every other written field
 * must still be fresh. Returns the rebased op arguments, or null on a conflict.
 */
function rebaseStaleStartHereChange(params: {
	change: ProposedChange;
	before: Record<string, unknown>;
	current: Record<string, unknown>;
	isStartHereDoc: boolean;
}): Record<string, unknown> | null {
	const { change, before, current } = params;
	const after = change.after;
	if (!params.isStartHereDoc || change.action !== 'update' || !isPlainRecord(after)) return null;
	if (typeof after.content !== 'string') return null;
	if (after.update_strategy !== undefined && after.update_strategy !== 'replace') return null;
	if (CONTENT_WRITE_ARGS.some((key) => key !== 'content' && after[key] !== undefined))
		return null;
	if (typeof before.content !== 'string' || typeof current.content !== 'string') return null;

	const scoped = stagedWriteSetSnapshots(change, before, current);
	if (scoped) {
		const [scopedBefore, scopedCurrent] = scoped;
		delete scopedBefore.content;
		delete scopedCurrent.content;
		if (!sameSnapshot(scopedCurrent, scopedBefore)) return null;
	}

	const rebased = rebaseStartHereReviewedContent({
		base: before.content,
		reviewed: after.content,
		current: current.content
	});
	return rebased === null ? null : { ...after, content: rebased };
}

async function verifyStagedChangeFreshness(params: {
	admin: SupabaseClient<Database>;
	change: ProposedChange;
	expectedSnapshot?: Record<string, unknown>;
}): Promise<{ ok: true; rebasedArgs?: Record<string, unknown> } | { ok: false; message: string }> {
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

	const before = params.expectedSnapshot ?? (change.before as Record<string, unknown>);
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

	const current = data as Record<string, unknown>;
	const isStartHereDoc =
		change.entity_type === 'document' && before.type_key === START_HERE_DOCUMENT_TYPE_KEY;
	// Compare what this change writes; fall back to the whole reviewed snapshot
	// when the written fields can't be identified.
	const [scopedBefore, scopedCurrent] = stagedWriteSetSnapshots(change, before, current) ?? [
		before,
		subsetToSnapshotKeys(current, before)
	];
	// Start Here documents have machine-owned managed regions (status/map) that the
	// snapshot worker refreshes independently of authored edits. Drift inside those
	// fences must not block an authored-section proposal, so compare only the
	// authored body for `document.context.project` docs.
	const [beforeForCompare, currentForCompare] = normalizeStartHereDriftSnapshots(
		isStartHereDoc,
		scopedBefore,
		scopedCurrent
	);
	if (
		sameSnapshot(
			omitVolatileSnapshotFields(currentForCompare),
			omitVolatileSnapshotFields(beforeForCompare)
		)
	) {
		return { ok: true };
	}

	const rebasedArgs = rebaseStaleStartHereChange({ change, before, current, isStartHereDoc });
	if (rebasedArgs) return { ok: true, rebasedArgs };

	return {
		ok: false,
		message: `Staged ${change.entity_type} change is stale: current data no longer matches the reviewed before snapshot`
	};
}

function normalizeStartHereDriftSnapshots(
	isStartHereDoc: boolean,
	before: Record<string, unknown>,
	current: Record<string, unknown>
): [Record<string, unknown>, Record<string, unknown>] {
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
	const staleCommitStartedAt = run.commit_started_at;
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
	let claimQuery = admin
		.from('agent_runs')
		.update(
			isStalledCommitReentry
				? { commit_started_at: commitHeartbeat }
				: { status: 'running', commit_started_at: commitHeartbeat }
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
		{ entityId: string | null; entityKind: string | null; result: unknown }
	>();
	if (isStalledCommitReentry) {
		const { data: priorExecs, error: priorExecsError } = await admin
			.from('agent_tool_executions')
			.select('proposed_change_id, entity_id, entity_kind, success, result')
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
					entityKind: (row as { entity_kind?: string | null }).entity_kind ?? null,
					result: row.result
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
	// Keep the actual saved values, but authorize drift only in fields this set
	// wrote. Adopting the entire saved row would bless unrelated human edits.
	const appliedWrites = new Map<string, Record<string, unknown>>();
	const entityKey = (change: ProposedChange) =>
		`${change.entity_type}:${change.entity_id ?? change.applied_entity_id}`;
	const mergeSnapshot = (base: Record<string, unknown>, patch: Record<string, unknown>) => ({
		...base,
		...patch,
		...(isPlainRecord(patch.props)
			? { props: { ...(isPlainRecord(base.props) ? base.props : {}), ...patch.props } }
			: {})
	});
	const rememberAppliedWrite = (change: ProposedChange, result: unknown) => {
		const row = isPlainRecord(result) ? result[change.entity_type] : null;
		if (!isPlainRecord(row)) return;
		const written =
			change.action === 'create' ? row : stagedWriteSetSnapshots(change, row, row)?.[1];
		if (!written) return;
		const key = entityKey(change);
		appliedWrites.set(key, mergeSnapshot(appliedWrites.get(key) ?? {}, written));
	};

	for (const change of changeSet.changes) {
		// D9b: a prior crashed commit already applied this change — count it, rebuild
		// its EntityTouch, and skip re-running the (non-idempotent) write.
		const priorApplied = alreadyAppliedByChangeId.get(change.id);
		if (priorApplied) {
			change.decision = 'approved';
			applied += 1;
			const appliedId = priorApplied.entityId ?? change.entity_id ?? undefined;
			change.applied_entity_id = appliedId;
			change.error = undefined;
			rememberAppliedWrite(change, priorApplied.result);
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

		const decision = decisionById.get(change.id) ?? defaultDecision;
		change.decision = decision;

		if (decision === 'rejected') {
			rejected += 1;
			continue;
		}

		// The op must still be within the run's granted scope (the change set is
		// worker-written, so this only fires on a genuine scope mismatch).
		if (!allowedOps.includes(change.op)) {
			failed += 1;
			change.error = `Op ${change.op} is outside the run's granted scope`;
			continue;
		}

		const priorWrites = appliedWrites.get(entityKey(change));
		const freshness = await verifyStagedChangeFreshness({
			admin,
			change,
			expectedSnapshot:
				priorWrites && isPlainRecord(change.before)
					? mergeSnapshot(change.before, priorWrites)
					: undefined
		});
		if (!freshness.ok) {
			failed += 1;
			change.error = freshness.message;
			const receiptError = await recordCommitReceipt(admin, {
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
			if (receiptError)
				return { ok: false, error: { code: 'INTERNAL', message: receiptError } };
			continue;
		}

		// A START HERE review whose document gained lines since staging applies the
		// reviewed sections on top of the current document (see rebaseStaleStartHereChange).
		const args =
			freshness.rebasedArgs ??
			(change.after && typeof change.after === 'object' && !Array.isArray(change.after)
				? (change.after as Record<string, unknown>)
				: {});

		const result = await runGatewayWriteOp({
			admin,
			userId,
			scope,
			op: change.op,
			args,
			downstreamIdempotencyKey: `agent-run:${runId}:${change.id}`
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
			rememberAppliedWrite(change, result.data);
			// Telemetry: record the actual commit, keyed to the proposed change.
			const receiptError = await recordCommitReceipt(admin, {
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
			if (receiptError)
				return { ok: false, error: { code: 'INTERNAL', message: receiptError } };
		} else {
			failed += 1;
			change.error = result.error?.message ?? 'Failed to apply change';
			const receiptError = await recordCommitReceipt(admin, {
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
			if (receiptError)
				return { ok: false, error: { code: 'INTERNAL', message: receiptError } };
		}

		// D9b: heartbeat progress after each applied change so a concurrent commit
		// request sees a fresh commit_started_at and stays out (CONFLICT) while this
		// commit is live — only a genuinely dead commit goes stale and is re-entered.
		await admin
			.from('agent_runs')
			.update({ commit_started_at: new Date().toISOString() })
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

const INTERRUPTED_COMMIT_CHANGE_ERROR =
	'Not applied: the approval was interrupted before this change ran, so nothing changed for it. Propose it again if you still want it.';

const RECOVERABLE_CREATE_OPS: Partial<
	Record<string, { table: GatewayCreateTable; entityKind: string }>
> = {
	'onto.document.create': { table: 'onto_documents', entityKind: 'document' },
	'onto.task.docs.create_or_attach': { table: 'onto_documents', entityKind: 'document' },
	'onto.goal.create': { table: 'onto_goals', entityKind: 'goal' },
	'onto.plan.create': { table: 'onto_plans', entityKind: 'plan' },
	'onto.milestone.create': { table: 'onto_milestones', entityKind: 'milestone' },
	'onto.risk.create': { table: 'onto_risks', entityKind: 'risk' }
};

export type StalledCommitRecovery =
	| { outcome: 'returned_to_review' }
	| {
			outcome: 'finalized';
			runStatus: 'completed' | 'partial';
			applied: number;
			notApplied: number;
	  }
	| { outcome: 'skipped'; reason: 'not_found' | 'not_stalled' | 'no_change_set' | 'raced' };

/**
 * Recover a commit that claimed its run (proposal_ready -> running) and died
 * before writing a terminal status, e.g. a web function killed mid-commit. The
 * Agent Run stranded sweep used to see a jobless 'running' run and finalize it
 * 'failed', which discarded the user's approval and left the Change Set pending
 * (production run aecfb6b1, 2026-09-04).
 *
 * This cannot finish the commit for the user. Per-change decisions live only in
 * the commit request and are saved with the terminal write, so a replay could
 * apply a change the user dismissed. Instead:
 * - Nothing applied (no success telemetry or durable create row): hand the proposal back
 *   to review (running -> proposal_ready) so the user can approve it again.
 * - Some changes applied: finalize with what landed, and mark the rest not
 *   applied. Returning it to review would re-run writes that already happened.
 *
 * Both transitions compare-and-swap on the stale commit_started_at, so a D9b
 * re-entry that re-claimed the run wins and this becomes a no-op. Creates can be
 * reconciled from their durable identity even when the success receipt was lost;
 * other operations still require success telemetry.
 */
export async function recoverStalledCommit(params: {
	admin: SupabaseClient<Database>;
	runId: string;
	now?: Date;
}): Promise<StalledCommitRecovery> {
	const { admin, runId } = params;
	const nowMs = (params.now ?? new Date()).getTime();

	const { data: run, error: runError } = await admin
		.from('agent_runs')
		.select(AGENT_RUN_CHANGE_SET_SELECT as '*')
		.eq('id', runId)
		.maybeSingle();
	if (runError) throw new Error(`Failed to load stalled commit ${runId}: ${runError.message}`);
	if (!run) return { outcome: 'skipped', reason: 'not_found' };

	const commitStartedAt = run.commit_started_at;
	const startedMs = commitStartedAt ? Date.parse(commitStartedAt) : Number.NaN;
	if (
		run.status !== 'running' ||
		!commitStartedAt ||
		!Number.isFinite(startedMs) ||
		nowMs - startedMs <= STALE_COMMIT_MS
	) {
		return { outcome: 'skipped', reason: 'not_stalled' };
	}
	const changeSet = asChangeSet(run.change_set, runId);
	if (!changeSet || changeSet.changes.length === 0) {
		return { outcome: 'skipped', reason: 'no_change_set' };
	}

	const { data: appliedRows, error: appliedError } = await admin
		.from('agent_tool_executions')
		.select('proposed_change_id, entity_id, entity_kind')
		.eq('agent_run_id', runId)
		.eq('user_id', run.user_id)
		.eq('mutation_mode', 'commit')
		.eq('success', true);
	if (appliedError) {
		throw new Error(`Failed to load applied changes for ${runId}: ${appliedError.message}`);
	}
	const appliedByChangeId = new Map<
		string,
		{ entityId: string | null; entityKind: string | null }
	>();
	for (const row of appliedRows ?? []) {
		const changeId = (row as { proposed_change_id?: unknown }).proposed_change_id;
		if (typeof changeId !== 'string') continue;
		appliedByChangeId.set(changeId, {
			entityId: (row as { entity_id?: string | null }).entity_id ?? null,
			entityKind: (row as { entity_kind?: string | null }).entity_kind ?? null
		});
	}

	// A create's primary row can outlive a failed telemetry insert. Look up only
	// identities bound to this run/change (and user for UUID creates), never titles
	// or other mutable fields. Batch by table so recovery needs at most one read
	// per entity kind. Archived/moved rows still prove that the create landed.
	const missingCreates = new Map<
		GatewayCreateTable,
		Map<string, { changeId: string; entityKind: string }>
	>();
	const missingTasks = new Map<string, string>();
	for (const change of changeSet.changes) {
		if (appliedByChangeId.has(change.id) || change.action !== 'create') continue;
		const key = `agent-run:${runId}:${change.id}`;
		if (change.op === 'onto.task.create') {
			missingTasks.set(key, change.id);
			continue;
		}
		const create = RECOVERABLE_CREATE_OPS[change.op];
		if (!create) continue;
		// An existing document alone says nothing about whether its attachment ran.
		if (
			change.op === 'onto.task.docs.create_or_attach' &&
			change.after?.document_id !== undefined
		)
			continue;
		const expected = missingCreates.get(create.table) ?? new Map();
		expected.set(gatewayCreateId(run.user_id, create.table, key), {
			changeId: change.id,
			entityKind: create.entityKind
		});
		missingCreates.set(create.table, expected);
	}
	for (const [table, expected] of missingCreates) {
		const { data: rows, error } = await admin
			.from(table)
			.select('id')
			.in('id', [...expected.keys()]);
		if (error) throw new Error(`Failed to reconcile creates for ${runId}: ${error.message}`);
		for (const row of rows ?? []) {
			const create = expected.get(row.id);
			if (create)
				appliedByChangeId.set(create.changeId, {
					entityId: row.id,
					entityKind: create.entityKind
				});
		}
	}
	if (missingTasks.size > 0) {
		const { data: rows, error } = await admin
			.from('onto_tasks')
			.select('id, idempotency_key')
			.in('idempotency_key', [...missingTasks.keys()]);
		if (error)
			throw new Error(`Failed to reconcile task creates for ${runId}: ${error.message}`);
		for (const row of rows ?? []) {
			const changeId = row.idempotency_key
				? missingTasks.get(row.idempotency_key)
				: undefined;
			if (changeId) appliedByChangeId.set(changeId, { entityId: row.id, entityKind: 'task' });
		}
	}

	if (appliedByChangeId.size === 0) {
		const { data: returned, error: returnError } = await admin
			.from('agent_runs')
			.update({ status: 'proposal_ready', commit_started_at: null })
			.eq('id', runId)
			.eq('status', 'running')
			.eq('commit_started_at', commitStartedAt)
			.select('id')
			.maybeSingle();
		if (returnError) {
			throw new Error(`Failed to return ${runId} to review: ${returnError.message}`);
		}
		if (!returned) return { outcome: 'skipped', reason: 'raced' };
		await syncRecoveredRunInbox(admin, runId);
		return { outcome: 'returned_to_review' };
	}

	let applied = 0;
	let notApplied = 0;
	const entitiesTouched: EntityTouch[] = [];
	for (const change of changeSet.changes) {
		const prior = appliedByChangeId.get(change.id);
		if (!prior) {
			notApplied += 1;
			change.error = INTERRUPTED_COMMIT_CHANGE_ERROR;
			continue;
		}
		applied += 1;
		change.decision = 'approved';
		change.error = undefined;
		const appliedId = prior.entityId ?? change.entity_id ?? undefined;
		change.applied_entity_id = appliedId;
		if (appliedId) {
			entitiesTouched.push(
				entityTouchFromAppliedChange(
					change,
					appliedId,
					prior.entityKind,
					run.project_id ?? null
				)
			);
		}
	}
	changeSet.status = notApplied === 0 ? 'applied' : 'partially_applied';
	const runStatus: 'completed' | 'partial' = notApplied === 0 ? 'completed' : 'partial';

	const priorResult =
		run.result && typeof run.result === 'object' && !Array.isArray(run.result)
			? (run.result as Record<string, unknown>)
			: {};
	const priorTouched = Array.isArray(priorResult.entities_touched)
		? (priorResult.entities_touched as EntityTouch[])
		: [];
	const { data: finalized, error: finalizeError } = await admin
		.from('agent_runs')
		.update({
			status: runStatus,
			change_set: changeSet as never,
			result: {
				...priorResult,
				entities_touched: [...priorTouched, ...entitiesTouched],
				proposed_changes: changeSet
			} as never,
			completed_at: new Date(nowMs).toISOString(),
			error:
				notApplied === 0
					? null
					: `commit interrupted: ${applied} of ${applied + notApplied} change(s) applied before the approval stopped`
		})
		.eq('id', runId)
		.eq('status', 'running')
		.eq('commit_started_at', commitStartedAt)
		.select('id')
		.maybeSingle();
	if (finalizeError) {
		throw new Error(`Failed to finalize stalled commit ${runId}: ${finalizeError.message}`);
	}
	if (!finalized) return { outcome: 'skipped', reason: 'raced' };
	await syncRecoveredRunInbox(admin, runId);
	return { outcome: 'finalized', runStatus, applied, notApplied };
}

async function syncRecoveredRunInbox(
	admin: SupabaseClient<Database>,
	runId: string
): Promise<void> {
	try {
		await syncInboxItemForAgentRun({ supabase: admin as any, runId });
	} catch (error) {
		console.warn('[AI Inbox] Failed to sync recovered stalled commit', {
			runId,
			error: error instanceof Error ? error.message : String(error)
		});
	}
}
