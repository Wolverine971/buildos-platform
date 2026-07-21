// apps/worker/src/workers/agent-run/agentRunStrandedSweep.ts
//
// SAFETY-CRITICAL liveness recovery for durable Agent Runs (Wave 4).
//
// A run can strand when the worker that owned it dies without finalizing it, or
// when a deep-research coordinator parks itself waiting for a wake that never
// arrives. Such a run holds a user's active capacity slot forever (and, for a
// deep-research root, all three slots). This bounded sweep detects those states
// and recovers them.
//
// Every action here is IDEMPOTENT and BOUNDED:
//   - re-enqueue uses the run's stable dedup key, so add_queue_job dedups against
//     any concurrently-created live job (pending/processing only);
//   - synthesis is re-driven through the DB guard RPC, which re-checks liveness;
//   - every finalize/cancel is a conditional UPDATE keyed on the still-non-terminal
//     status AND the scanned updated_at, so two overlapping sweeps — or a sweep
//     racing a live worker — cannot double-act.
//
// The sweep never touches a run that still has a live (pending/processing) queue
// job, and never re-drives a run parked waiting for the USER (paused /
// needs_input / proposal_ready): those legitimately have no queue job.

import type { Database, Json } from '@buildos/shared-types';
import { validateAgentRunMetadata } from '@buildos/shared-types';
import { supabase } from '../../lib/supabase';
import { queueConfig } from '../../config/queueConfig';
import {
	DEEP_RESEARCH_CHILD_COUNT,
	isRetryableDeepResearchState,
	parseDeepResearchState
} from './deepResearchOrchestrator';

type AgentRunRow = Database['public']['Tables']['agent_runs']['Row'];
type AgentRunStatus = AgentRunRow['status'];

const NON_TERMINAL_STATUSES: AgentRunStatus[] = [
	'queued',
	'running',
	'paused',
	'needs_input',
	'proposal_ready'
];
const TERMINAL_STATUSES = new Set<AgentRunStatus>(['completed', 'partial', 'failed', 'cancelled']);
// System-driven states the sweep may recover. paused/needs_input/proposal_ready
// are parked waiting for the user and are intentionally left alone.
const RECOVERABLE_STATUSES = new Set<AgentRunStatus>(['queued', 'running']);

const DEFAULT_WALL_CLOCK_MS = 600_000;
const SWEEP_LIMIT = 50;

export function agentRunStrandedSweepEnabled(): boolean {
	// Default ON; only an explicit 'false' disables it.
	return process.env.AGENT_RUN_STRANDED_SWEEP_ENABLED !== 'false';
}

export interface AgentRunStrandedSweepSummary {
	scanned: number;
	requeuedContinuations: number;
	synthesisWoken: number;
	childrenCancelled: number;
	finalizedFailed: number;
	finalizedPartial: number;
	errors: number;
}

export interface StrandedRunRow {
	id: string;
	user_id: string;
	status: AgentRunStatus;
	run_template: string;
	depth: number;
	parent_run_id: string | null;
	started_at: string | null;
	updated_at: string;
	budgets: Json;
	orchestration_state: Json;
	trigger: AgentRunRow['trigger'];
	context_type: string;
	project_id: string | null;
	scope_mode: string;
	effort: string;
	allowed_ops: string[] | null;
	review_required: boolean;
}

export interface StrandedParentRow {
	status: AgentRunStatus;
	completed_at: string | null;
}

export interface StrandedChildRow {
	id: string;
	status: AgentRunStatus;
}

// A narrow data-access port so the bounded control flow can run against a real
// database in integration tests (a psql-backed adapter) and against a fake in
// unit tests, while production uses the worker admin client.
export interface StrandedSweepStore {
	listStrandedCandidates(params: {
		statuses: AgentRunStatus[];
		updatedBefore: string;
		limit: number;
	}): Promise<StrandedRunRow[]>;
	listActiveDedupKeys(userId: string, dedupKeys: string[]): Promise<string[]>;
	loadParent(parentRunId: string): Promise<StrandedParentRow | null>;
	loadChildren(parentRunId: string): Promise<StrandedChildRow[]>;
	enqueueContinuation(
		userId: string,
		metadata: Record<string, unknown>,
		dedupKey: string
	): Promise<{ errorMessage?: string }>;
	wakeSynthesis(parentRunId: string): Promise<{ jobId: string | null; errorMessage?: string }>;
	// Conditional terminal transition. Only writes when the row is still in one of
	// `expectedStatuses` AND its updated_at still equals `expectedUpdatedAt`.
	finalizeRun(params: {
		runId: string;
		expectedStatuses: AgentRunStatus[];
		expectedUpdatedAt: string;
		status: AgentRunStatus;
		error: string;
	}): Promise<boolean>;
	// Best-effort idempotent: inserts a system cancel signal only when no
	// unconsumed cancel signal already exists for the run.
	ensureCancelSignal(runId: string): Promise<void>;
}

export interface AgentRunStrandedSweepOptions {
	store?: StrandedSweepStore;
	now?: () => Date;
	graceMs?: number;
	limit?: number;
}

export function createStrandedSweepStore(): StrandedSweepStore {
	return {
		async listStrandedCandidates({ statuses, updatedBefore, limit }) {
			const { data, error } = await supabase
				.from('agent_runs')
				.select(
					'id, user_id, status, run_template, depth, parent_run_id, started_at, updated_at, budgets, orchestration_state, trigger, context_type, project_id, scope_mode, effort, allowed_ops, review_required'
				)
				.in('status', statuses)
				.lt('updated_at', updatedBefore)
				.order('updated_at', { ascending: true })
				.limit(limit);
			if (error) throw new Error(`Failed to list stranded candidates: ${error.message}`);
			return (data ?? []) as unknown as StrandedRunRow[];
		},
		async listActiveDedupKeys(userId, dedupKeys) {
			if (dedupKeys.length === 0) return [];
			const { data, error } = await supabase
				.from('queue_jobs')
				.select('dedup_key')
				.eq('user_id', userId)
				.eq('job_type', 'agent_run')
				.in('status', ['pending', 'processing'])
				.in('dedup_key', dedupKeys);
			if (error) throw new Error(`Failed to check for live queue jobs: ${error.message}`);
			return (data ?? [])
				.map((row) => row.dedup_key)
				.filter((key): key is string => typeof key === 'string');
		},
		async loadParent(parentRunId) {
			const { data, error } = await supabase
				.from('agent_runs')
				.select('status, completed_at')
				.eq('id', parentRunId)
				.maybeSingle();
			if (error) throw new Error(`Failed to load parent run: ${error.message}`);
			return data ? { status: data.status, completed_at: data.completed_at } : null;
		},
		async loadChildren(parentRunId) {
			const { data, error } = await supabase
				.from('agent_runs')
				.select('id, status')
				.eq('parent_run_id', parentRunId);
			if (error) throw new Error(`Failed to load children: ${error.message}`);
			return (data ?? []) as StrandedChildRow[];
		},
		async enqueueContinuation(userId, metadata, dedupKey) {
			const { error } = await supabase.rpc('add_queue_job', {
				p_user_id: userId,
				p_job_type: 'agent_run',
				p_metadata: metadata as never,
				p_priority: 7,
				p_scheduled_for: new Date().toISOString(),
				p_dedup_key: dedupKey
			});
			return error ? { errorMessage: error.message } : {};
		},
		async wakeSynthesis(parentRunId) {
			const { data, error } = await (supabase as any).rpc('queue_deep_research_synthesis', {
				p_parent_run_id: parentRunId
			});
			if (error) return { jobId: null, errorMessage: error.message };
			return { jobId: typeof data === 'string' ? data : null };
		},
		async finalizeRun({ runId, expectedStatuses, expectedUpdatedAt, status, error }) {
			const { data, error: updateError } = await supabase
				.from('agent_runs')
				.update({
					status,
					error,
					completed_at: new Date().toISOString()
				} as never)
				.eq('id', runId)
				.eq('updated_at', expectedUpdatedAt)
				.in('status', expectedStatuses)
				.select('id');
			if (updateError)
				throw new Error(`Failed to finalize stranded run: ${updateError.message}`);
			return (data?.length ?? 0) > 0;
		},
		async ensureCancelSignal(runId) {
			const { data: existing, error: readError } = await supabase
				.from('agent_run_signals')
				.select('id')
				.eq('run_id', runId)
				.eq('kind', 'cancel')
				.is('consumed_at', null)
				.limit(1);
			if (readError) throw new Error(`Failed to read cancel signals: ${readError.message}`);
			if (existing && existing.length > 0) return;
			const { error: insertError } = await supabase
				.from('agent_run_signals')
				.insert({ run_id: runId, kind: 'cancel', source: 'system' });
			// A concurrent insert can win the race; the duplicate is harmless (the
			// worker consumes all pending signals together) so we swallow it.
			if (insertError) {
				console.warn(
					`[agentRunStrandedSweep] failed to insert cancel signal for ${runId}: ${insertError.message}`
				);
			}
		}
	};
}

function wallClockMs(budgets: Json): number {
	if (budgets && typeof budgets === 'object' && !Array.isArray(budgets)) {
		const value = (budgets as Record<string, unknown>).wall_clock_ms;
		if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
			return value;
		}
	}
	return DEFAULT_WALL_CLOCK_MS;
}

function isWithinDeadline(run: StrandedRunRow, now: Date): boolean {
	const startedAtMs = run.started_at ? Date.parse(run.started_at) : Number.NaN;
	// A run that never started (queued, no worker ever claimed it) has not begun
	// consuming its wall clock.
	if (!Number.isFinite(startedAtMs)) return true;
	return now.getTime() - startedAtMs < wallClockMs(run.budgets);
}

function isDeepResearchRoot(run: StrandedRunRow): boolean {
	return run.run_template === 'deep_research' && run.depth === 0;
}

function continuationDedupKeys(runId: string): string[] {
	return [`agent-run:${runId}`, `agent-run:${runId}:synthesis`, `agent-run-resume:${runId}`];
}

function buildOriginalMetadata(run: StrandedRunRow): Record<string, unknown> {
	return {
		run_id: run.id,
		trigger: run.trigger,
		context_type: run.context_type,
		project_id: run.project_id,
		parent_run_id: run.parent_run_id,
		depth: run.depth,
		scope_mode: run.scope_mode,
		effort: run.effort,
		run_template: run.run_template,
		allowed_ops: run.allowed_ops,
		review_required: run.review_required,
		budgets: run.budgets
	};
}

function buildDeepRootMetadata(
	run: StrandedRunRow,
	continuationFrom?: 'children'
): Record<string, unknown> {
	return {
		run_id: run.id,
		trigger: run.trigger,
		context_type: run.context_type,
		project_id: run.project_id,
		parent_run_id: null,
		depth: 0,
		...(continuationFrom ? { continuation_from: continuationFrom } : {}),
		scope_mode: 'read_only',
		effort: 'deep',
		run_template: 'deep_research',
		allowed_ops: null,
		review_required: false,
		budgets: run.budgets
	};
}

/**
 * Re-enqueue a continuation. Validation failures throw (counted as errors by the
 * caller); a queue error is surfaced but non-fatal. Returns whether a job was
 * (re-)enqueued so the caller can count it.
 */
async function reenqueue(
	store: StrandedSweepStore,
	run: StrandedRunRow,
	metadata: Record<string, unknown>,
	dedupKey: string
): Promise<boolean> {
	validateAgentRunMetadata(metadata);
	const { errorMessage } = await store.enqueueContinuation(run.user_id, metadata, dedupKey);
	if (errorMessage) {
		console.warn(
			`[agentRunStrandedSweep] failed to re-enqueue ${run.id} (${dedupKey}): ${errorMessage}`
		);
		return false;
	}
	return true;
}

async function handleDeepResearchRoot(
	store: StrandedSweepStore,
	run: StrandedRunRow,
	now: Date,
	summary: AgentRunStrandedSweepSummary
): Promise<void> {
	const withinDeadline = isWithinDeadline(run, now);
	const stage = parseDeepResearchState(run.orchestration_state)?.stage;

	if (stage === 'researching') {
		// Case 2: children all settled but no synthesis wake landed. The DB guard
		// re-checks liveness and only enqueues once (idempotent).
		const children = await store.loadChildren(run.id);
		const allChildrenTerminal =
			children.length >= DEEP_RESEARCH_CHILD_COUNT &&
			children.every((child) => TERMINAL_STATUSES.has(child.status));
		if (allChildrenTerminal) {
			const woke = await store.wakeSynthesis(run.id);
			if (woke.errorMessage) {
				throw new Error(`wake synthesis failed: ${woke.errorMessage}`);
			}
			if (woke.jobId) summary.synthesisWoken += 1;
		}
		// Otherwise the root is legitimately waiting on children; each stranded
		// child is recovered as its own candidate and will wake the root when it
		// settles. Nothing to do here.
		return;
	}

	if (isRetryableDeepResearchState(run.orchestration_state)) {
		// planning / dispatching / empty checkpoint — dispatch is idempotent
		// (stable child IDs + upsert ignoreDuplicates), so re-driving the root is
		// safe. Case 3 (dispatching with <2 children) is subsumed here.
		if (withinDeadline) {
			if (await reenqueue(store, run, buildDeepRootMetadata(run), `agent-run:${run.id}`)) {
				summary.requeuedContinuations += 1;
			}
		} else if (
			await store.finalizeRun({
				runId: run.id,
				expectedStatuses: ['running'],
				expectedUpdatedAt: run.updated_at,
				status: 'failed',
				error: 'stranded: wall-clock exceeded before dispatch, no active worker'
			})
		) {
			summary.finalizedFailed += 1;
		}
		return;
	}

	// synthesis_queued / synthesizing: a dead synthesis job. Re-running synthesis
	// re-reads the (terminal) children and finalizes; it is bounded by remaining
	// budget and money-honest (a retried job reserves fresh — see attempt ordinals).
	if (withinDeadline) {
		if (
			await reenqueue(
				store,
				run,
				buildDeepRootMetadata(run, 'children'),
				`agent-run:${run.id}:synthesis`
			)
		) {
			summary.requeuedContinuations += 1;
		}
		return;
	}
	// Past deadline: children hold their evidence packets (linked below), but
	// synthesis will not run. Finalize partial honestly rather than re-spending.
	const children = await store.loadChildren(run.id);
	const finalizedPartial = await store.finalizeRun({
		runId: run.id,
		expectedStatuses: ['running'],
		expectedUpdatedAt: run.updated_at,
		status: 'partial',
		error: 'stranded: wall-clock exceeded during synthesis, no active worker'
	});
	if (finalizedPartial) {
		summary.finalizedPartial += 1;
	}
	void children;
}

async function handleCandidate(
	store: StrandedSweepStore,
	run: StrandedRunRow,
	now: Date,
	graceMs: number,
	summary: AgentRunStrandedSweepSummary
): Promise<void> {
	// Case 4: a non-terminal child whose parent has gone terminal. The parent is
	// done, so the child's work is moot — signal it (in case a worker is somehow
	// still alive) and force-cancel once the parent has been terminal past grace.
	if (run.parent_run_id) {
		const parent = await store.loadParent(run.parent_run_id);
		if (parent && TERMINAL_STATUSES.has(parent.status)) {
			await store.ensureCancelSignal(run.id);
			const parentTerminalMs = parent.completed_at
				? Date.parse(parent.completed_at)
				: Number.NaN;
			const parentTerminalPastGrace =
				!Number.isFinite(parentTerminalMs) || now.getTime() - parentTerminalMs >= graceMs;
			if (parentTerminalPastGrace) {
				const cancelled = await store.finalizeRun({
					runId: run.id,
					expectedStatuses: NON_TERMINAL_STATUSES,
					expectedUpdatedAt: run.updated_at,
					status: 'cancelled',
					error: 'stranded: parent run terminal, no active worker'
				});
				if (cancelled) summary.childrenCancelled += 1;
			}
			return;
		}
		// Parent still active — fall through and treat the child as an ordinary
		// stranded run below.
	}

	// A live (pending/processing) continuation job means a worker is (or will be)
	// driving this run: it is NOT stranded.
	const activeKeys = await store.listActiveDedupKeys(run.user_id, continuationDedupKeys(run.id));
	if (activeKeys.length > 0) return;

	// Only recover system-driven states. paused/needs_input/proposal_ready are
	// parked on the user and legitimately have no queue job.
	if (!RECOVERABLE_STATUSES.has(run.status)) return;

	if (isDeepResearchRoot(run)) {
		await handleDeepResearchRoot(store, run, now, summary);
		return;
	}

	const withinDeadline = isWithinDeadline(run, now);

	// Ordinary run (or a child whose parent is still active). A never-started
	// 'queued' run has no side effects yet and is claimable as-is, so re-enqueue
	// it within deadline. A 'running' run whose worker vanished cannot be re-driven
	// safely (a fresh restart would re-charge and, for read_write runs, risk
	// duplicate mutations, and a plain re-enqueue is not claimable while status is
	// 'running'), so we finalize it honestly.
	if (run.status === 'queued' && withinDeadline) {
		if (await reenqueue(store, run, buildOriginalMetadata(run), `agent-run:${run.id}`)) {
			summary.requeuedContinuations += 1;
		}
		return;
	}

	const finalized = await store.finalizeRun({
		runId: run.id,
		expectedStatuses: NON_TERMINAL_STATUSES,
		expectedUpdatedAt: run.updated_at,
		status: 'failed',
		error: run.parent_run_id
			? 'stranded: wall-clock exceeded, no active worker'
			: 'stranded: no active worker'
	});
	if (finalized) summary.finalizedFailed += 1;
}

export async function runAgentRunStrandedSweep(
	options: AgentRunStrandedSweepOptions = {}
): Promise<AgentRunStrandedSweepSummary> {
	const summary: AgentRunStrandedSweepSummary = {
		scanned: 0,
		requeuedContinuations: 0,
		synthesisWoken: 0,
		childrenCancelled: 0,
		finalizedFailed: 0,
		finalizedPartial: 0,
		errors: 0
	};

	const store = options.store ?? createStrandedSweepStore();
	const now = (options.now ?? (() => new Date()))();
	// GRACE = 2 × stalledTimeout (~10 min): long enough that a live worker's
	// stalled job would already have been reset+reclaimed by SupabaseQueue.
	const graceMs =
		typeof options.graceMs === 'number' &&
		Number.isFinite(options.graceMs) &&
		options.graceMs > 0
			? options.graceMs
			: 2 * queueConfig.stalledTimeout;
	const limit = Math.min(
		SWEEP_LIMIT,
		Math.max(
			1,
			typeof options.limit === 'number' && Number.isInteger(options.limit)
				? options.limit
				: SWEEP_LIMIT
		)
	);
	const updatedBefore = new Date(now.getTime() - graceMs).toISOString();

	const candidates = await store.listStrandedCandidates({
		statuses: NON_TERMINAL_STATUSES,
		updatedBefore,
		limit
	});

	for (const candidate of candidates) {
		summary.scanned += 1;
		try {
			await handleCandidate(store, candidate, now, graceMs, summary);
		} catch (error) {
			summary.errors += 1;
			console.warn(
				`[agentRunStrandedSweep] error handling run ${candidate.id}:`,
				error instanceof Error ? error.message : error
			);
		}
	}

	return summary;
}
