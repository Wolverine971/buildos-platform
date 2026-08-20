// apps/worker/src/workers/agentic-chat/stalledRecovery.ts
import { createHash } from 'node:crypto';
import {
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	type AgenticChatRecoveryFailureClassV1,
	type AgenticChatRecoveryRpcResultV1,
	type AgenticChatTerminalFinalizeRpcResultV1,
	type AgenticChatTurnClaimResultV1,
	type ChatTurnTerminalStatusV1
} from '@buildos/shared-types';
import {
	type AgenticChatExecutionControlPortV1,
	AgenticChatExecutionControlRpcError,
	AgenticChatExecutionIdentityV1,
	AgenticChatTerminalFinalizeInputV1
} from './executionControl';
import type { AgenticChatRecoverySnapshotPortV1 } from './recoverySnapshot';

type StalledQueryError = { code?: string; message: string };
type StalledQueryResult = PromiseLike<{ data: unknown; error: StalledQueryError | null }>;

export type AgenticChatStalledReadQuery = StalledQueryResult & {
	eq(column: string, value: unknown): AgenticChatStalledReadQuery;
	lt(column: string, value: unknown): AgenticChatStalledReadQuery;
	order(
		column: string,
		options?: { ascending?: boolean; nullsFirst?: boolean }
	): AgenticChatStalledReadQuery;
	limit(value: number): AgenticChatStalledReadQuery;
};

export type AgenticChatStalledReadClient = {
	from(table: 'queue_jobs'): {
		select(columns: string): AgenticChatStalledReadQuery;
	};
};

export type AgenticChatStalledCandidateV1 = AgenticChatExecutionIdentityV1 & {
	userId: string;
	correlationId: string;
	startedAt: string;
	stalledAt: string;
};

export type AgenticChatStalledCandidateSourcePortV1 = {
	list(input: { stalledBefore: string; limit: number }): Promise<AgenticChatStalledCandidateV1[]>;
};

export class AgenticChatStalledCandidateSourceError extends Error {
	constructor(message: string) {
		super(`Agentic Chat stalled candidate source failed: ${message}`);
		this.name = 'AgenticChatStalledCandidateSourceError';
	}
}

/** Strict read adapter; every actual state transition remains RPC-owned. */
export class SupabaseAgenticChatStalledCandidateSource
	implements AgenticChatStalledCandidateSourcePortV1
{
	constructor(
		private readonly client: AgenticChatStalledReadClient,
		private readonly onInvalidCandidate: (
			error: AgenticChatStalledCandidateSourceError,
			index: number
		) => void = () => undefined
	) {}

	async list(input: {
		stalledBefore: string;
		limit: number;
	}): Promise<AgenticChatStalledCandidateV1[]> {
		if (!isTimestamp(input.stalledBefore)) throw sourceError('stalled cutoff is invalid');
		if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 128) {
			throw sourceError('candidate limit must be between 1 and 128');
		}
		const { data, error } = await this.client
			.from('queue_jobs')
			.select('id, processing_token, user_id, started_at, updated_at, metadata')
			.eq('job_type', 'agentic_chat_turn')
			.eq('status', 'processing')
			.lt('updated_at', input.stalledBefore)
			.order('updated_at', { ascending: true, nullsFirst: false })
			.limit(input.limit);
		if (error) throw sourceError(error.message);
		if (!Array.isArray(data)) throw sourceError('candidate rows are not an array');

		const seen = new Set<string>();
		const candidates: AgenticChatStalledCandidateV1[] = [];
		for (const [index, value] of data.entries()) {
			try {
				candidates.push(parseCandidate(value, input.stalledBefore, seen));
			} catch (error) {
				const invalid =
					error instanceof AgenticChatStalledCandidateSourceError
						? error
						: sourceError(errorMessage(error));
				try {
					this.onInvalidCandidate(invalid, index);
				} catch {
					// Invalid-row telemetry cannot hide other recoverable candidates.
				}
			}
		}
		return candidates;
	}
}

type RecoveryControlPort = Pick<
	AgenticChatExecutionControlPortV1,
	'claim' | 'recover' | 'finalize'
>;

export type AgenticChatStalledRecoveryOutcomeV1 =
	| 'requeued'
	| 'terminal_reconciled'
	| 'effect_reconciliation_required'
	| 'stale_owner'
	| 'manual_recovery_required'
	| 'failed';

export type AgenticChatStalledRecoveryResultV1 = {
	turnRunId: string;
	queueJobId: string;
	startedAt: string;
	stalledAt: string;
	executionGeneration: number | null;
	outcome: AgenticChatStalledRecoveryOutcomeV1;
	error: string | null;
};

export type AgenticChatStalledRecoveryReportV1 = {
	startedAt: string;
	finishedAt: string;
	candidateCount: number;
	results: AgenticChatStalledRecoveryResultV1[];
};

export type AgenticChatStalledRecoveryHealthV1 = {
	healthy: boolean;
	state: 'idle' | 'running' | 'stopping' | 'stopped';
	reason?: 'not_started' | 'stopping' | 'stopped' | 'repeated_sweep_failures';
	lastSweepStartedAt: string | null;
	lastSweepFinishedAt: string | null;
	lastSuccessfulSweepAt: string | null;
	consecutiveSweepFailures: number;
	lastError: string | null;
	lastCandidateCount: number;
	lastAttentionRequiredCount: number;
};

export class AgenticChatStalledRecoverySweep {
	private readonly options: {
		stallTimeoutMs: number;
		intervalMs: number;
		batchSize: number;
		drainTimeoutMs: number;
		now: () => Date;
		onError: (error: unknown) => void;
		onReport: (report: AgenticChatStalledRecoveryReportV1) => void;
	};
	private timer: NodeJS.Timeout | null = null;
	private inFlight: Promise<AgenticChatStalledRecoveryReportV1> | null = null;
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

	constructor(
		private readonly ports: {
			candidates: AgenticChatStalledCandidateSourcePortV1;
			control: RecoveryControlPort;
			snapshots: AgenticChatRecoverySnapshotPortV1;
		},
		options: Partial<{
			stallTimeoutMs: number;
			intervalMs: number;
			batchSize: number;
			drainTimeoutMs: number;
			now: () => Date;
			onError: (error: unknown) => void;
			onReport: (report: AgenticChatStalledRecoveryReportV1) => void;
		}> = {}
	) {
		this.options = {
			stallTimeoutMs: options.stallTimeoutMs ?? 420_000,
			intervalMs: options.intervalMs ?? 60_000,
			batchSize: options.batchSize ?? 32,
			drainTimeoutMs: options.drainTimeoutMs ?? 25_000,
			now: options.now ?? (() => new Date()),
			onError: options.onError ?? (() => undefined),
			onReport: options.onReport ?? (() => undefined)
		};
		validatePositiveInteger(this.options.stallTimeoutMs, 'stallTimeoutMs', 1);
		validatePositiveInteger(this.options.intervalMs, 'intervalMs', 250);
		validatePositiveInteger(this.options.batchSize, 'batchSize', 1, 128);
		validatePositiveInteger(this.options.drainTimeoutMs, 'drainTimeoutMs', 1);
	}

	start(): void {
		if (this.stopping) throw new Error('Agentic Chat stalled recovery sweep is stopping');
		if (this.timer) return;
		this.started = true;
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
				if (this.inFlight === sweep) this.inFlight = null;
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
			lastAttentionRequiredCount: this.lastAttentionRequiredCount
		};
		if (state === 'idle') return { healthy: false, reason: 'not_started', ...base };
		if (state === 'stopping') return { healthy: true, reason: 'stopping', ...base };
		if (state === 'stopped') return { healthy: true, reason: 'stopped', ...base };
		if (this.consecutiveSweepFailures >= MAX_CONSECUTIVE_SWEEP_FAILURES) {
			return { healthy: false, reason: 'repeated_sweep_failures', ...base };
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
		const stalledBefore = new Date(
			started.getTime() - this.options.stallTimeoutMs
		).toISOString();
		const candidates = await this.ports.candidates.list({
			stalledBefore,
			limit: this.options.batchSize
		});
		if (candidates.length > this.options.batchSize) {
			throw new Error('Stalled candidate source exceeded the requested batch size');
		}
		const results: AgenticChatStalledRecoveryResultV1[] = [];
		for (const candidate of candidates) {
			results.push(await this.recoverCandidate(candidate));
		}
		return {
			startedAt: started.toISOString(),
			finishedAt: this.options.now().toISOString(),
			candidateCount: candidates.length,
			results
		};
	}

	private observeSweepSuccess(report: AgenticChatStalledRecoveryReportV1): void {
		this.lastSweepStartedAt = report.startedAt;
		this.lastSweepFinishedAt = report.finishedAt;
		this.lastSuccessfulSweepAt = report.finishedAt;
		this.consecutiveSweepFailures = 0;
		this.lastError = null;
		this.lastCandidateCount = report.candidateCount;
		this.lastAttentionRequiredCount = report.results.filter((result) =>
			ATTENTION_REQUIRED_OUTCOMES.has(result.outcome)
		).length;
	}

	private observeSweepFailure(error: unknown): void {
		this.lastSweepFinishedAt = this.options.now().toISOString();
		this.consecutiveSweepFailures += 1;
		this.lastError = errorMessage(error);
	}

	private async recoverCandidate(
		candidate: AgenticChatStalledCandidateV1
	): Promise<AgenticChatStalledRecoveryResultV1> {
		let generation: number | null = null;
		try {
			const claim = await this.ports.control.claim(candidate);
			validateClaimCandidate(claim, candidate);
			generation = claim.executionGeneration;
			if (generation < 1) {
				return recoveryResult(candidate, generation, 'manual_recovery_required');
			}
			const failureClass = claimFailureClass(claim);
			return await this.converge(candidate, claim, failureClass);
		} catch (error) {
			return recoveryResult(
				candidate,
				generation,
				isOwnershipLoss(error) ? 'stale_owner' : 'failed',
				errorMessage(error)
			);
		}
	}

	private async converge(
		candidate: AgenticChatStalledCandidateV1,
		claim: AgenticChatTurnClaimResultV1,
		initialFailureClass: AgenticChatRecoveryFailureClassV1
	): Promise<AgenticChatStalledRecoveryResultV1> {
		let failureClass = initialFailureClass;
		let lastConvergenceError: string | null = null;
		for (let attempt = 0; attempt < MAX_CONVERGENCE_STEPS; attempt += 1) {
			const recovery = await this.ports.control.recover({
				turnRunId: candidate.turnRunId,
				queueJobId: candidate.queueJobId,
				processingToken: candidate.processingToken,
				executionGeneration: claim.executionGeneration,
				failureClass,
				errorMessage: 'Agentic Chat worker interrupted while queue ownership was stalled'
			});
			const settled = settledRecoveryResult(candidate, claim.executionGeneration, recovery);
			if (settled) return settled;

			if (
				recovery.outcome !== 'finalize_failed' &&
				recovery.outcome !== 'finalize_cancelled'
			) {
				return recoveryResult(
					candidate,
					claim.executionGeneration,
					'manual_recovery_required',
					`Recovery returned unsupported outcome: ${recovery.outcome}`
				);
			}

			let snapshot;
			try {
				snapshot = await this.ports.snapshots.load({
					turnRunId: candidate.turnRunId,
					userId: candidate.userId,
					executionGeneration: claim.executionGeneration
				});
			} catch (error) {
				// Durable truth may have changed after the recovery decision. Re-run
				// the fenced recovery RPC before classifying this candidate as failed.
				lastConvergenceError = `Recovery snapshot failed: ${errorMessage(error)}`;
				continue;
			}
			if (isTerminalStatus(snapshot.status)) {
				failureClass = terminalFailureClass(snapshot.status);
				continue;
			}
			if (snapshot.status !== 'running') {
				return recoveryResult(
					candidate,
					claim.executionGeneration,
					'manual_recovery_required',
					`Recovery snapshot has unsupported status: ${snapshot.status}`
				);
			}

			const status = recovery.outcome === 'finalize_cancelled' ? 'cancelled' : 'failed';
			let terminal: AgenticChatTerminalFinalizeRpcResultV1;
			try {
				terminal = await this.ports.control.finalize(
					buildTerminalInput(candidate, snapshot, status, recovery.failure_code)
				);
			} catch (error) {
				// A lost finalize response is resolved by the next recovery call.
				lastConvergenceError = `Recovery finalization failed: ${errorMessage(error)}`;
				continue;
			}
			if (terminal.outcome === 'stale_generation') {
				return recoveryResult(candidate, claim.executionGeneration, 'stale_owner');
			}
			if (terminal.outcome === 'cancel_requested') {
				failureClass = 'cancelled';
				continue;
			}
			failureClass = terminalFailureClass(terminal.status);
		}
		return recoveryResult(
			candidate,
			claim.executionGeneration,
			'manual_recovery_required',
			lastConvergenceError ?? 'Recovery did not converge within the bounded retry window'
		);
	}
}

function settledRecoveryResult(
	candidate: AgenticChatStalledCandidateV1,
	generation: number,
	recovery: AgenticChatRecoveryRpcResultV1
): AgenticChatStalledRecoveryResultV1 | null {
	if (recovery.outcome === 'retry_scheduled' || recovery.outcome === 'already_requeued') {
		return recoveryResult(candidate, generation, 'requeued');
	}
	if (recovery.outcome === 'effect_reconciliation_required') {
		return recoveryResult(candidate, generation, 'effect_reconciliation_required');
	}
	if (recovery.outcome === 'stale_generation') {
		return recoveryResult(candidate, generation, 'stale_owner');
	}
	if (recovery.outcome === 'queue_reconciled' || recovery.outcome === 'already_reconciled') {
		return recoveryResult(candidate, generation, 'terminal_reconciled');
	}
	return null;
}

function buildTerminalInput(
	candidate: AgenticChatStalledCandidateV1,
	snapshot: Awaited<ReturnType<AgenticChatRecoverySnapshotPortV1['load']>>,
	status: Extract<ChatTurnTerminalStatusV1, 'failed' | 'cancelled'>,
	failureCode: AgenticChatRecoveryRpcResultV1['failure_code']
): AgenticChatTerminalFinalizeInputV1 {
	const normalizedFailureCode = failureCode ?? (status === 'cancelled' ? 'cancelled' : 'unknown');
	return {
		turnRunId: candidate.turnRunId,
		queueJobId: candidate.queueJobId,
		processingToken: candidate.processingToken,
		userId: candidate.userId,
		executionGeneration: snapshot.executionGeneration,
		status,
		finishedReason: status === 'cancelled' ? 'cancelled' : 'worker_interrupted',
		failureCode: normalizedFailureCode,
		assistantMessageId:
			status === 'cancelled' && snapshot.assistantText.length > 0
				? stableRecoveryMessageId(candidate.turnRunId, snapshot.executionGeneration)
				: null,
		assistantText: snapshot.assistantText,
		assistantMetadata: {
			transport_contract_version: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
			turn_run_id: candidate.turnRunId,
			execution_generation: snapshot.executionGeneration,
			recovered_from_stall: true
		},
		promptTokens: null,
		completionTokens: null,
		totalTokens: null,
		projection: snapshot.projection,
		eventPayload: {
			type: 'done',
			status,
			finished_reason: status === 'cancelled' ? 'cancelled' : 'worker_interrupted',
			failure_code: normalizedFailureCode,
			recovered_from_stall: true
		}
	};
}

function validateClaimCandidate(
	claim: AgenticChatTurnClaimResultV1,
	candidate: AgenticChatStalledCandidateV1
): void {
	if (
		claim.turnRunId !== candidate.turnRunId ||
		claim.queueJobId !== candidate.queueJobId ||
		claim.userId !== candidate.userId ||
		claim.correlationId !== candidate.correlationId
	) {
		throw new Error('Stalled claim receipt does not match the queue candidate');
	}
}

function claimFailureClass(claim: AgenticChatTurnClaimResultV1): AgenticChatRecoveryFailureClassV1 {
	if (claim.outcome === 'cancel_requested') return 'cancelled';
	if (claim.outcome === 'already_terminal') {
		if (!isTerminalStatus(claim.status)) throw new Error('Terminal claim status is invalid');
		return terminalFailureClass(claim.status);
	}
	return claim.executionMayStart ? 'timeout_pre_start' : 'timeout_post_start';
}

function terminalFailureClass(status: ChatTurnTerminalStatusV1): AgenticChatRecoveryFailureClassV1 {
	if (status === 'cancelled') return 'cancelled';
	if (status === 'failed') return 'permanent';
	return 'unknown';
}

function isTerminalStatus(value: unknown): value is ChatTurnTerminalStatusV1 {
	return value === 'completed' || value === 'failed' || value === 'cancelled';
}

function stableRecoveryMessageId(turnRunId: string, generation: number): string {
	const bytes = createHash('sha256')
		.update(`agentic-chat-stalled-message-v1:${turnRunId}:${generation}`, 'utf8')
		.digest()
		.subarray(0, 16);
	bytes[6] = (bytes[6] & 0x0f) | 0x50;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function recoveryResult(
	candidate: AgenticChatStalledCandidateV1,
	executionGeneration: number | null,
	outcome: AgenticChatStalledRecoveryOutcomeV1,
	error: string | null = null
): AgenticChatStalledRecoveryResultV1 {
	return {
		turnRunId: candidate.turnRunId,
		queueJobId: candidate.queueJobId,
		startedAt: candidate.startedAt,
		stalledAt: candidate.stalledAt,
		executionGeneration,
		outcome,
		error
	};
}

function parseCandidate(
	value: unknown,
	stalledBefore: string,
	seen: Set<string>
): AgenticChatStalledCandidateV1 {
	const row = requireRecord(value, 'candidate row');
	canonicalUuid(row.id, 'queue job id');
	canonicalUuid(row.processing_token, 'processing token');
	canonicalUuid(row.user_id, 'user id');
	if (!isTimestamp(row.started_at)) throw sourceError('candidate started_at is invalid');
	if (!isTimestamp(row.updated_at) || Date.parse(row.updated_at) >= Date.parse(stalledBefore)) {
		throw sourceError('candidate timestamp is not before the cutoff');
	}
	if (Date.parse(row.started_at) > Date.parse(row.updated_at)) {
		throw sourceError('candidate started_at is after its last progress timestamp');
	}
	const metadata = requireRecord(row.metadata, 'candidate metadata');
	canonicalUuid(metadata.turnRunId, 'metadata turnRunId');
	canonicalUuid(metadata.correlationId, 'metadata correlationId');
	if (seen.has(row.id)) throw sourceError('duplicate queue candidate identity');
	seen.add(row.id);
	return {
		turnRunId: metadata.turnRunId,
		queueJobId: row.id,
		processingToken: row.processing_token,
		userId: row.user_id,
		correlationId: metadata.correlationId,
		startedAt: row.started_at,
		stalledAt: row.updated_at
	};
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw sourceError(`${label} must be an object`);
	}
	return value as Record<string, unknown>;
}

function canonicalUuid(value: unknown, label: string): asserts value is string {
	if (typeof value !== 'string' || !UUID_PATTERN.test(value) || value !== value.toLowerCase()) {
		throw sourceError(`${label} is not a canonical UUID`);
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

function sourceError(message: string): AgenticChatStalledCandidateSourceError {
	return new AgenticChatStalledCandidateSourceError(message);
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
const ATTENTION_REQUIRED_OUTCOMES = new Set<AgenticChatStalledRecoveryOutcomeV1>([
	'effect_reconciliation_required',
	'manual_recovery_required',
	'failed'
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
