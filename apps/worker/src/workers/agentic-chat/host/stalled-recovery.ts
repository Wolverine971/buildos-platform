// apps/worker/src/workers/agentic-chat/host/stalled-recovery.ts
import {
	AGENTIC_CHAT_TURN_LEASE_POLICY_V1,
	type AgenticChatDeadTurnRecoveryOutcomeV1,
	type AgenticChatRecoveryFailureClassV1,
	type AgenticChatRecoveryRpcResultV1,
	type AgenticChatTerminalFinalizeRpcResultV1,
	type ChatTurnTerminalStatusV1
} from '@buildos/shared-types';
import {
	type AgenticChatExecutionControlPortV1,
	AgenticChatExecutionControlRpcError,
	type AgenticChatTerminalFinalizeInputV1
} from '../turn/execution-control';
import type { AgenticChatWorkflowStorePortV1 } from '../workflow/workflow-store';
import {
	buildAgenticChatWorkflowStalledCancelInputV1,
	buildAgenticChatWorkflowStalledTerminalInputV1
} from '../workflow/workflow-terminal';

/**
 * Dead-turn recovery (docs/architecture/AGENTIC_CHAT_TURN_LEASES_2026-09-23.md).
 * Every 15 s this sweep calls `recover_dead_agentic_chat_turns`, the same
 * function the per-minute web cron calls, which decides and settles every dead
 * turn in SQL, so the worker and the cron cannot disagree. Only a workflow turn
 * that must end comes back here, handed off with a freshly rotated processing
 * token and its workflow outcome, so it can be rendered from durable workflow
 * truth. A handoff this sweep cannot converge is simply handed off again on a
 * later sweep until the database ends the run itself.
 */
export type AgenticChatDeadTurnHandoffV1 = {
	turnRunId: string;
	queueJobId: string;
	/** The rotated token: this sweep now holds the turn. */
	processingToken: string;
	userId: string;
	correlationId: string;
	executionGeneration: number;
	startedAt: string;
	silentSince: string;
	/** recover_agentic_chat_workflow_turn_v1's decision; `cancel_requested` ends it as cancelled. */
	workflowOutcome: string;
};

export type AgenticChatDeadTurnRecoveryReportRowV1 = {
	turnRunId: string;
	queueJobId: string | null;
	executionGeneration: number | null;
	startedAt: string | null;
	silentSince: string | null;
	outcome: Exclude<AgenticChatDeadTurnRecoveryOutcomeV1, 'workflow_handoff'>;
	error: string | null;
};

export type AgenticChatDeadTurnRecoveryBatchV1 = {
	candidateCount: number;
	hasMore: boolean;
	/** Turns whose recovery failed so often the database stopped trying. */
	parkedCount: number;
	/** Settled in SQL (handoffs excluded). */
	results: AgenticChatDeadTurnRecoveryReportRowV1[];
	/** Workflow turns this caller now holds, with their rotated tokens. */
	handoffs: AgenticChatDeadTurnHandoffV1[];
	/** Rows that could not be read; never retried here (the database sees them again). */
	invalidRows: Array<{ turnRunId: string | null; error: string }>;
};

export type AgenticChatDeadTurnRecoveryPortV1 = {
	recover(input: {
		batchSize: number;
		workflowHandoff: boolean;
		signal: AbortSignal;
	}): Promise<AgenticChatDeadTurnRecoveryBatchV1>;
};

export class AgenticChatDeadTurnRecoveryProtocolError extends Error {
	constructor(message: string) {
		super(`Agentic Chat dead-turn recovery receipt is invalid: ${message}`);
		this.name = 'AgenticChatDeadTurnRecoveryProtocolError';
	}
}

type RecoveryRpcError = { code?: string; message: string };

export type AgenticChatDeadTurnRecoveryRpcClient = {
	rpc(
		name: 'recover_dead_agentic_chat_turns',
		args: { p_batch_size: number; p_workflow_handoff: boolean }
	): {
		abortSignal(
			signal: AbortSignal
		): PromiseLike<{ data: unknown; error: RecoveryRpcError | null }>;
	};
};

/** The one recovery RPC; every state transition stays inside it. */
export class SupabaseAgenticChatDeadTurnRecoveryAdapter
	implements AgenticChatDeadTurnRecoveryPortV1
{
	constructor(private readonly client: AgenticChatDeadTurnRecoveryRpcClient) {}

	async recover(input: {
		batchSize: number;
		workflowHandoff: boolean;
		signal: AbortSignal;
	}): Promise<AgenticChatDeadTurnRecoveryBatchV1> {
		validatePositiveInteger(input.batchSize, 'batchSize', 1, 100);
		const { data, error } = await this.client
			.rpc('recover_dead_agentic_chat_turns', {
				p_batch_size: input.batchSize,
				p_workflow_handoff: input.workflowHandoff
			})
			.abortSignal(input.signal);
		if (error) {
			throw new Error(
				`recover_dead_agentic_chat_turns failed${error.code ? ` (${error.code})` : ''}: ${error.message}`
			);
		}
		return parseRecoveryBatch(data);
	}
}

type RecoveryControlPort = Pick<AgenticChatExecutionControlPortV1, 'recover' | 'finalize'>;

export type AgenticChatStalledRecoveryOutcomeV1 =
	| 'requeued'
	/** Finalized in SQL: failed or cancelled, partial text kept. */
	| 'finalized'
	| 'terminal_reconciled'
	/** A workflow turn left for a live worker's sweep (web cron only). */
	| 'deferred'
	/** Alive after all when re-checked under its lock (it renewed in between). */
	| 'not_dead'
	/** Held by a live worker or another sweep right now; seen again next sweep. */
	| 'skipped'
	/** A handed-off turn another recoverer moved on first. */
	| 'stale_owner'
	| 'manual_recovery_required'
	| 'failed';

export type AgenticChatStalledRecoveryResultV1 = {
	turnRunId: string;
	queueJobId: string | null;
	startedAt: string | null;
	/** When the worker last proved it was alive (lease renewal or queue heartbeat). */
	stalledAt: string | null;
	executionGeneration: number | null;
	outcome: AgenticChatStalledRecoveryOutcomeV1;
	error: string | null;
};

export type AgenticChatStalledRecoveryReportV1 = {
	startedAt: string;
	finishedAt: string;
	candidateCount: number;
	parkedCount: number;
	results: AgenticChatStalledRecoveryResultV1[];
};

export type AgenticChatStalledRecoveryHealthV1 = {
	healthy: boolean;
	state: 'idle' | 'running' | 'stopping' | 'stopped';
	reason?:
		| 'not_started'
		| 'awaiting_first_sweep'
		| 'sweep_overdue'
		| 'stopping'
		| 'stopped'
		| 'repeated_sweep_failures';
	lastSweepStartedAt: string | null;
	lastSweepFinishedAt: string | null;
	lastSuccessfulSweepAt: string | null;
	consecutiveSweepFailures: number;
	lastError: string | null;
	lastCandidateCount: number;
	lastAttentionRequiredCount: number;
	lastParkedCount: number;
};

export class AgenticChatStalledRecoverySweep {
	private readonly options: {
		intervalMs: number;
		batchSize: number;
		maxBatchesPerSweep: number;
		rpcTimeoutMs: number;
		drainTimeoutMs: number;
		now: () => Date;
		onError: (error: unknown) => void;
		onReport: (report: AgenticChatStalledRecoveryReportV1) => void;
	};
	private timer: NodeJS.Timeout | null = null;
	private inFlight: Promise<AgenticChatStalledRecoveryReportV1> | null = null;
	private inFlightStartedAtMs: number | null = null;
	private started = false;
	private stopping = false;
	private stopped = false;
	private lastSweepStartedAt: string | null = null;
	private lastSweepFinishedAt: string | null = null;
	private lastSuccessfulSweepAt: string | null = null;
	private consecutiveSweepFailures = 0;
	private lastError: string | null = null;
	private lastCandidateCount = 0;
	private lastAttentionRequiredCount = 0;
	private lastParkedCount = 0;

	constructor(
		private readonly ports: {
			/** `recover_dead_agentic_chat_turns`: decides and settles in one transaction per turn. */
			recovery: AgenticChatDeadTurnRecoveryPortV1;
			control: RecoveryControlPort;
			/**
			 * Durable workflow truth (Tasker 87 slice C). With it, workflow turns that must
			 * end are handed to this sweep and rendered from durable truth; without it, the
			 * database ends them generically after a further lease period.
			 */
			workflowRuns?: Pick<AgenticChatWorkflowStorePortV1, 'loadRun'>;
		},
		options: Partial<{
			intervalMs: number;
			batchSize: number;
			/** `has_more` is followed within one sweep, at most this many calls and one interval. */
			maxBatchesPerSweep: number;
			rpcTimeoutMs: number;
			drainTimeoutMs: number;
			now: () => Date;
			onError: (error: unknown) => void;
			onReport: (report: AgenticChatStalledRecoveryReportV1) => void;
		}> = {}
	) {
		this.options = {
			intervalMs:
				options.intervalMs ?? AGENTIC_CHAT_TURN_LEASE_POLICY_V1.recoverySweepIntervalMs,
			batchSize: options.batchSize ?? 16,
			maxBatchesPerSweep: options.maxBatchesPerSweep ?? 4,
			rpcTimeoutMs: options.rpcTimeoutMs ?? AGENTIC_CHAT_TURN_LEASE_POLICY_V1.rpcTimeoutMs,
			drainTimeoutMs: options.drainTimeoutMs ?? 25_000,
			now: options.now ?? (() => new Date()),
			onError: options.onError ?? (() => undefined),
			onReport: options.onReport ?? (() => undefined)
		};
		validatePositiveInteger(this.options.intervalMs, 'intervalMs', 250);
		validatePositiveInteger(this.options.batchSize, 'batchSize', 1, 100);
		validatePositiveInteger(this.options.maxBatchesPerSweep, 'maxBatchesPerSweep', 1, 16);
		validatePositiveInteger(this.options.rpcTimeoutMs, 'rpcTimeoutMs', 1);
		validatePositiveInteger(this.options.drainTimeoutMs, 'drainTimeoutMs', 1);
	}

	start(): void {
		if (this.stopping) throw new Error('Agentic Chat stalled recovery sweep is stopping');
		if (this.timer) return;
		this.started = true;
		// The first sweep runs at boot: health stays unhealthy until one succeeds,
		// so a worker deployed without the recovery RPC never passes its healthcheck.
		void this.runOnce().catch((error) => this.reportError(error));
		this.timer = setInterval(() => {
			void this.runOnce().catch((error) => this.reportError(error));
		}, this.options.intervalMs);
		this.timer.unref();
	}

	async stop(): Promise<boolean> {
		this.stopping = true;
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
		const active = this.inFlight;
		if (!active) {
			this.stopped = true;
			return true;
		}
		let timer: NodeJS.Timeout | null = null;
		try {
			const drained = await Promise.race([
				active.then(
					() => true,
					() => true
				),
				new Promise<boolean>((resolve) => {
					timer = setTimeout(() => resolve(false), this.options.drainTimeoutMs);
				})
			]);
			if (drained) this.stopped = true;
			return drained;
		} finally {
			if (timer) clearTimeout(timer);
		}
	}

	runOnce(): Promise<AgenticChatStalledRecoveryReportV1> {
		if (this.stopping) {
			return Promise.reject(new Error('Agentic Chat stalled recovery sweep is stopping'));
		}
		if (this.inFlight) return this.inFlight;
		this.inFlightStartedAtMs = this.options.now().getTime();
		const sweep = this.executeSweep()
			.then(
				(report) => {
					this.observeSweepSuccess(report);
					this.reportSweep(report);
					return report;
				},
				(error: unknown) => {
					this.observeSweepFailure(error);
					throw error;
				}
			)
			.finally(() => {
				if (this.inFlight === sweep) {
					this.inFlight = null;
					this.inFlightStartedAtMs = null;
				}
				if (this.stopping) this.stopped = true;
			});
		this.inFlight = sweep;
		return sweep;
	}

	getHealth(): AgenticChatStalledRecoveryHealthV1 {
		const state: AgenticChatStalledRecoveryHealthV1['state'] = this.stopped
			? 'stopped'
			: this.stopping
				? 'stopping'
				: this.started
					? 'running'
					: 'idle';
		const base = {
			state,
			lastSweepStartedAt: this.lastSweepStartedAt,
			lastSweepFinishedAt: this.lastSweepFinishedAt,
			lastSuccessfulSweepAt: this.lastSuccessfulSweepAt,
			consecutiveSweepFailures: this.consecutiveSweepFailures,
			lastError: this.lastError,
			lastCandidateCount: this.lastCandidateCount,
			lastAttentionRequiredCount: this.lastAttentionRequiredCount,
			lastParkedCount: this.lastParkedCount
		};
		if (state === 'idle') return { healthy: false, reason: 'not_started', ...base };
		if (state === 'stopping') return { healthy: true, reason: 'stopping', ...base };
		if (state === 'stopped') return { healthy: true, reason: 'stopped', ...base };
		if (
			this.inFlightStartedAtMs !== null &&
			this.options.now().getTime() - this.inFlightStartedAtMs >
				MAX_IN_FLIGHT_INTERVALS * this.options.intervalMs
		) {
			return { healthy: false, reason: 'sweep_overdue', ...base };
		}
		if (this.consecutiveSweepFailures >= MAX_CONSECUTIVE_SWEEP_FAILURES) {
			return { healthy: false, reason: 'repeated_sweep_failures', ...base };
		}
		if (this.lastSuccessfulSweepAt === null) {
			return { healthy: false, reason: 'awaiting_first_sweep', ...base };
		}
		return { healthy: true, ...base };
	}

	private reportError(error: unknown): void {
		try {
			this.options.onError(error);
		} catch {
			// Optional telemetry must never create an unhandled rejection from the timer.
		}
	}

	private reportSweep(report: AgenticChatStalledRecoveryReportV1): void {
		try {
			this.options.onReport(report);
		} catch {
			// Operational reporting cannot change a fenced recovery decision.
		}
	}

	private async executeSweep(): Promise<AgenticChatStalledRecoveryReportV1> {
		const started = this.options.now();
		this.lastSweepStartedAt = started.toISOString();
		const results: AgenticChatStalledRecoveryResultV1[] = [];
		let candidateCount = 0;
		let parkedCount = 0;
		for (let call = 0; call < this.options.maxBatchesPerSweep; call += 1) {
			const batch = await this.recoverBatch();
			candidateCount += batch.candidateCount;
			parkedCount = batch.parkedCount;
			for (const row of batch.results) results.push(settledSqlResult(row));
			for (const invalid of batch.invalidRows) {
				results.push({
					turnRunId: invalid.turnRunId ?? 'unknown',
					queueJobId: null,
					startedAt: null,
					stalledAt: null,
					executionGeneration: null,
					outcome: 'failed',
					error: invalid.error
				});
			}
			// A handed-off workflow turn is held by this sweep until the database
			// sees it again; if rendering fails here it is handed off again later.
			for (const handoff of batch.handoffs) {
				results.push(await this.recoverHandoff(handoff));
			}
			const elapsedMs = this.options.now().getTime() - started.getTime();
			if (!batch.hasMore || this.stopping || elapsedMs >= this.options.intervalMs) break;
		}
		return {
			startedAt: started.toISOString(),
			finishedAt: this.options.now().toISOString(),
			candidateCount,
			parkedCount,
			results
		};
	}

	/** One bounded RPC: a hung socket fails this sweep, never the next one. */
	private async recoverBatch(): Promise<AgenticChatDeadTurnRecoveryBatchV1> {
		const call = new AbortController();
		let timer: NodeJS.Timeout | null = null;
		const timeout = new Promise<never>((_resolve, reject) => {
			timer = setTimeout(() => {
				const error = new Error(
					`recover_dead_agentic_chat_turns did not settle within ${this.options.rpcTimeoutMs}ms`
				);
				call.abort(error);
				reject(error);
			}, this.options.rpcTimeoutMs);
			timer.unref?.();
		});
		try {
			return await Promise.race([
				this.ports.recovery.recover({
					batchSize: this.options.batchSize,
					workflowHandoff: Boolean(this.ports.workflowRuns),
					signal: call.signal
				}),
				timeout
			]);
		} finally {
			if (timer) clearTimeout(timer);
		}
	}

	private observeSweepSuccess(report: AgenticChatStalledRecoveryReportV1): void {
		this.lastSweepStartedAt = report.startedAt;
		this.lastSweepFinishedAt = report.finishedAt;
		this.lastSuccessfulSweepAt = report.finishedAt;
		this.consecutiveSweepFailures = 0;
		this.lastError = null;
		this.lastCandidateCount = report.candidateCount;
		this.lastParkedCount = report.parkedCount;
		this.lastAttentionRequiredCount =
			report.parkedCount +
			report.results.filter((result) => ATTENTION_REQUIRED_OUTCOMES.has(result.outcome))
				.length;
	}

	private observeSweepFailure(error: unknown): void {
		this.lastSweepFinishedAt = this.options.now().toISOString();
		this.consecutiveSweepFailures += 1;
		this.lastError = errorMessage(error);
	}

	/**
	 * A workflow turn that must end, rendered from durable workflow truth (an
	 * accepted answer, a kept durable prefix, a model-free partial built from
	 * accepted reports, or a failure when none was accepted), with no model call.
	 * The database already decided (`workflowOutcome`); this never retries a
	 * workflow turn or falls back to the ordinary pre-start path.
	 */
	private async recoverHandoff(
		handoff: AgenticChatDeadTurnHandoffV1
	): Promise<AgenticChatStalledRecoveryResultV1> {
		if (!this.ports.workflowRuns) {
			return recoveryResult(
				handoff,
				'failed',
				'A workflow handoff arrived without a durable workflow reader'
			);
		}
		const terminal: WorkflowTerminalRecovery =
			handoff.workflowOutcome === 'cancel_requested'
				? { failureClass: 'cancelled', reason: null }
				: { failureClass: 'permanent', reason: handoff.workflowOutcome };
		try {
			return await this.converge(handoff, terminal);
		} catch (error) {
			return recoveryResult(
				handoff,
				isOwnershipLoss(error) ? 'stale_owner' : 'failed',
				errorMessage(error)
			);
		}
	}

	private async converge(
		handoff: AgenticChatDeadTurnHandoffV1,
		terminal: WorkflowTerminalRecovery
	): Promise<AgenticChatStalledRecoveryResultV1> {
		let failureClass: AgenticChatRecoveryFailureClassV1 = terminal.failureClass;
		let lastConvergenceError: string | null = null;
		for (let attempt = 0; attempt < MAX_CONVERGENCE_STEPS; attempt += 1) {
			const recovery = await this.ports.control.recover({
				turnRunId: handoff.turnRunId,
				queueJobId: handoff.queueJobId,
				processingToken: handoff.processingToken,
				executionGeneration: handoff.executionGeneration,
				failureClass,
				errorMessage: 'Agentic Chat worker lease expired'
			});
			const settled = settledRecoveryResult(handoff, recovery);
			if (settled) return settled;

			if (
				recovery.outcome !== 'finalize_failed' &&
				recovery.outcome !== 'finalize_cancelled'
			) {
				return recoveryResult(
					handoff,
					'manual_recovery_required',
					`Recovery returned unsupported outcome: ${recovery.outcome}`
				);
			}

			const status = recovery.outcome === 'finalize_cancelled' ? 'cancelled' : 'failed';
			let request: AgenticChatTerminalFinalizeInputV1;
			// A workflow turn is terminalized from durable workflow truth, never from the
			// ordinary stream snapshot: answer batches take stream sequences without event
			// rows, so that snapshot cannot represent a generation with a durable answer
			// prefix. The finalize below stays fenced by token and generation, and answers
			// `already_terminal` or `stale_generation` if the turn moved on meanwhile.
			try {
				request = await this.workflowTerminalInput(
					handoff,
					status,
					terminal.reason ?? 'finalize_failed'
				);
			} catch (error) {
				// A partial answer needs durable workflow truth. Re-run the fenced recovery
				// within the bounded window rather than failing a turn that may have content.
				lastConvergenceError = `Workflow truth read failed: ${errorMessage(error)}`;
				continue;
			}
			let finalized: AgenticChatTerminalFinalizeRpcResultV1;
			try {
				finalized = await this.ports.control.finalize(request);
			} catch (error) {
				// A lost finalize response is resolved by the next recovery call.
				lastConvergenceError = `Recovery finalization failed: ${errorMessage(error)}`;
				continue;
			}
			if (finalized.outcome === 'stale_generation') {
				return recoveryResult(handoff, 'stale_owner');
			}
			if (finalized.outcome === 'cancel_requested') {
				failureClass = 'cancelled';
				continue;
			}
			failureClass = terminalFailureClass(finalized.status);
		}
		return recoveryResult(
			handoff,
			'manual_recovery_required',
			lastConvergenceError ?? 'Recovery did not converge within the bounded retry window'
		);
	}

	/**
	 * The workflow's terminal write from durable truth: three service-role reads and a
	 * pure decision. A retried call rebuilds the same text and the same stable message id.
	 */
	private async workflowTerminalInput(
		handoff: AgenticChatDeadTurnHandoffV1,
		status: 'failed' | 'cancelled',
		reason: string
	): Promise<AgenticChatTerminalFinalizeInputV1> {
		const loaded = await this.ports.workflowRuns!.loadRun(handoff.turnRunId);
		// Truth that names another turn or owner cannot authorize showing any content.
		const state =
			loaded && loaded.turnRunId === handoff.turnRunId && loaded.userId === handoff.userId
				? loaded
				: null;
		const input = {
			fence: {
				turnRunId: handoff.turnRunId,
				queueJobId: handoff.queueJobId,
				processingToken: handoff.processingToken,
				executionGeneration: handoff.executionGeneration
			},
			userId: handoff.userId,
			state,
			observedAt: this.options.now().toISOString()
		};
		return status === 'cancelled'
			? buildAgenticChatWorkflowStalledCancelInputV1(input)
			: buildAgenticChatWorkflowStalledTerminalInputV1({ ...input, reason }).request;
	}
}

/** A workflow turn to terminalize now; `reason` is null for a durable Stop. */
type WorkflowTerminalRecovery = {
	failureClass: Extract<AgenticChatRecoveryFailureClassV1, 'cancelled' | 'permanent'>;
	reason: string | null;
};

function settledRecoveryResult(
	handoff: AgenticChatDeadTurnHandoffV1,
	recovery: AgenticChatRecoveryRpcResultV1
): AgenticChatStalledRecoveryResultV1 | null {
	if (recovery.outcome === 'retry_scheduled' || recovery.outcome === 'already_requeued') {
		return recoveryResult(handoff, 'requeued');
	}
	if (recovery.outcome === 'stale_generation') {
		return recoveryResult(handoff, 'stale_owner');
	}
	if (recovery.outcome === 'queue_reconciled' || recovery.outcome === 'already_reconciled') {
		return recoveryResult(handoff, 'terminal_reconciled');
	}
	return null;
}

function terminalFailureClass(status: ChatTurnTerminalStatusV1): AgenticChatRecoveryFailureClassV1 {
	if (status === 'cancelled') return 'cancelled';
	if (status === 'failed') return 'permanent';
	return 'unknown';
}

function recoveryResult(
	handoff: AgenticChatDeadTurnHandoffV1,
	outcome: AgenticChatStalledRecoveryOutcomeV1,
	error: string | null = null
): AgenticChatStalledRecoveryResultV1 {
	return {
		turnRunId: handoff.turnRunId,
		queueJobId: handoff.queueJobId,
		startedAt: handoff.startedAt,
		stalledAt: handoff.silentSince,
		executionGeneration: handoff.executionGeneration,
		outcome,
		error
	};
}

/** How a turn the database settled appears in the sweep report. */
function settledSqlResult(
	row: AgenticChatDeadTurnRecoveryReportRowV1
): AgenticChatStalledRecoveryResultV1 {
	return {
		turnRunId: row.turnRunId,
		queueJobId: row.queueJobId,
		startedAt: row.startedAt,
		stalledAt: row.silentSince,
		executionGeneration: row.executionGeneration,
		outcome: SQL_OUTCOMES[row.outcome],
		error: row.error
	};
}

const SQL_OUTCOMES: Record<
	AgenticChatDeadTurnRecoveryReportRowV1['outcome'],
	AgenticChatStalledRecoveryOutcomeV1
> = {
	requeued: 'requeued',
	finalized: 'finalized',
	terminal_reconciled: 'terminal_reconciled',
	workflow_deferred: 'deferred',
	not_dead: 'not_dead',
	skipped: 'skipped',
	failed: 'failed'
};

/**
 * Reads what it can: only a report that is not an object at all is rejected.
 * An unreadable row is reported, never allowed to hide the others, and a
 * handoff is parsed on its own so its rotated token is never dropped because a
 * sibling row was malformed.
 */
function parseRecoveryBatch(value: unknown): AgenticChatDeadTurnRecoveryBatchV1 {
	const report = requireRecord(value, 'recovery report');
	const results: AgenticChatDeadTurnRecoveryReportRowV1[] = [];
	const handoffs: AgenticChatDeadTurnHandoffV1[] = [];
	const invalidRows: AgenticChatDeadTurnRecoveryBatchV1['invalidRows'] = [];
	const seen = new Set<string>();
	for (const item of Array.isArray(report.handoffs) ? report.handoffs : []) {
		const turnRunId = rowTurnRunId(item);
		try {
			const row = requireRecord(item, 'handoff row');
			if (row.outcome !== 'workflow_handoff')
				throw protocolError('handoff outcome is invalid');
			canonicalUuid(row.turn_run_id, 'handoff turn_run_id');
			canonicalUuid(row.queue_job_id, 'handoff queue_job_id');
			canonicalUuid(row.processing_token, 'handoff processing_token');
			canonicalUuid(row.user_id, 'handoff user_id');
			canonicalUuid(row.correlation_id, 'handoff correlation_id');
			if (
				!Number.isSafeInteger(row.execution_generation) ||
				(row.execution_generation as number) < 1
			) {
				throw protocolError('handoff execution_generation is invalid');
			}
			if (!isTimestamp(row.started_at) || !isTimestamp(row.silent_since)) {
				throw protocolError('handoff timestamps are invalid');
			}
			if (typeof row.workflow_outcome !== 'string' || !row.workflow_outcome.trim()) {
				throw protocolError('handoff workflow_outcome is invalid');
			}
			if (seen.has(row.turn_run_id)) throw protocolError('duplicate handoff');
			seen.add(row.turn_run_id);
			handoffs.push({
				turnRunId: row.turn_run_id,
				queueJobId: row.queue_job_id,
				processingToken: row.processing_token,
				userId: row.user_id,
				correlationId: row.correlation_id,
				executionGeneration: row.execution_generation as number,
				startedAt: row.started_at,
				silentSince: row.silent_since,
				workflowOutcome: row.workflow_outcome.slice(0, 128)
			});
		} catch (error) {
			invalidRows.push({ turnRunId, error: errorMessage(error) });
		}
	}
	for (const item of Array.isArray(report.results) ? report.results : []) {
		const turnRunId = rowTurnRunId(item);
		try {
			const row = requireRecord(item, 'result row');
			canonicalUuid(row.turn_run_id, 'result turn_run_id');
			// The tokenless summary of a handoff; the handoff itself is above.
			if (row.outcome === 'workflow_handoff') continue;
			if (
				typeof row.outcome !== 'string' ||
				!Object.prototype.hasOwnProperty.call(SQL_OUTCOMES, row.outcome)
			) {
				throw protocolError('result outcome is invalid');
			}
			results.push({
				turnRunId: row.turn_run_id,
				queueJobId: optionalUuid(row.queue_job_id),
				executionGeneration: Number.isSafeInteger(row.execution_generation)
					? (row.execution_generation as number)
					: null,
				startedAt: isTimestamp(row.started_at) ? row.started_at : null,
				silentSince: isTimestamp(row.silent_since) ? row.silent_since : null,
				outcome: row.outcome as AgenticChatDeadTurnRecoveryReportRowV1['outcome'],
				error: typeof row.error === 'string' ? row.error.slice(0, 2_000) : null
			});
		} catch (error) {
			invalidRows.push({ turnRunId, error: errorMessage(error) });
		}
	}
	if (!Array.isArray(report.results) || !Array.isArray(report.handoffs)) {
		invalidRows.push({ turnRunId: null, error: 'results or handoffs are not arrays' });
	}
	return {
		candidateCount: isCount(report.candidate_count)
			? report.candidate_count
			: results.length + handoffs.length,
		// An unreadable flag never makes the sweep loop.
		hasMore: report.has_more === true,
		parkedCount: isCount(report.parked_count) ? report.parked_count : 0,
		results,
		handoffs,
		invalidRows
	};
}

function rowTurnRunId(value: unknown): string | null {
	const id =
		value !== null && typeof value === 'object' && !Array.isArray(value)
			? (value as Record<string, unknown>).turn_run_id
			: null;
	return typeof id === 'string' && UUID_PATTERN.test(id) ? id : null;
}

function isCount(value: unknown): value is number {
	return Number.isSafeInteger(value) && (value as number) >= 0;
}

function optionalUuid(value: unknown): string | null {
	return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw protocolError(`${label} must be an object`);
	}
	return value as Record<string, unknown>;
}

function canonicalUuid(value: unknown, label: string): asserts value is string {
	if (typeof value !== 'string' || !UUID_PATTERN.test(value) || value !== value.toLowerCase()) {
		throw protocolError(`${label} is not a canonical UUID`);
	}
}

function isTimestamp(value: unknown): value is string {
	return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validatePositiveInteger(
	value: number,
	label: string,
	minimum: number,
	maximum = Number.MAX_SAFE_INTEGER
): void {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
		throw new Error(`${label} must be between ${minimum} and ${maximum}`);
	}
}

function protocolError(message: string): AgenticChatDeadTurnRecoveryProtocolError {
	return new AgenticChatDeadTurnRecoveryProtocolError(message);
}

function errorMessage(error: unknown): string {
	return (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
}

function isOwnershipLoss(error: unknown): boolean {
	return (
		error instanceof AgenticChatExecutionControlRpcError &&
		/(?:ownership|fence|compare_and_set)_lost/.test(error.message)
	);
}

const MAX_CONVERGENCE_STEPS = 4;
const MAX_CONSECUTIVE_SWEEP_FAILURES = 3;
/** A sweep still running after this many intervals is stuck, not slow. */
const MAX_IN_FLIGHT_INTERVALS = 3;
const ATTENTION_REQUIRED_OUTCOMES = new Set<AgenticChatStalledRecoveryOutcomeV1>([
	'manual_recovery_required',
	'failed'
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
