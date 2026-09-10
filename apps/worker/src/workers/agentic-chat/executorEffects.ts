// apps/worker/src/workers/agentic-chat/executorEffects.ts
//
// Best-effort side effects of a turn: observability, capture, billing, and
// terminal-control telemetry. None of them may change what the user sees or
// what the durable ledger says, so they share one error policy here: the
// port is attempted, a failure is handed to its reporter, and a reporter that
// throws is swallowed. Cancellation still propagates through the executor's
// own `throwIfAborted` after the attempt, exactly as before.

import { runWithAbortableDeadline } from './abortableDeadline';
import type { AgenticChatConsumptionBillingPortV1 } from './consumptionBilling';
import {
	AGENTIC_CHAT_EXECUTION_OBSERVATION_TIMEOUT_MS,
	type AgenticChatExecutionObservationInputV1,
	type AgenticChatExecutionObservationPortV1
} from './executionObservation';
import type { AgenticChatWorkerExecutionInputV1 } from './executionInput';
import {
	AGENTIC_CHAT_PENDING_EFFECTS_REGISTRY,
	type AgenticChatPendingEffectsRegistry
} from './pendingEffects';
import {
	AGENTIC_CHAT_PROMPT_SNAPSHOT_TIMEOUT_MS,
	type AgenticChatPromptSnapshotPersistInputV1,
	type AgenticChatPromptSnapshotPortV1
} from './promptSnapshot';
import type { AgenticChatResearchCapturePortV1 } from './researchCapture';
import type {
	AgenticChatRuntimeTimingObserverV1,
	AgenticChatRuntimeTimingSnapshotV1
} from './runtimeTiming';
import type { AgenticChatStatedFutureCapturePortV1 } from './statedFutureCapture';

export type AgenticChatTerminalControlErrorReportV1 = {
	stage: 'finalize' | 'finalize_retry' | 'recover';
	turnRunId: string;
	executionGeneration: number;
	error: unknown;
};

/** The optional, never-fatal ports an executor may be composed with. */
export type AgenticChatExecutorEffectPortsV1 = {
	promptSnapshots?: AgenticChatPromptSnapshotPortV1;
	executionObservations?: AgenticChatExecutionObservationPortV1;
	/** Shared with the provider client; the executor drains a turn's set at the terminal fence. */
	pendingEffects?: Pick<AgenticChatPendingEffectsRegistry, 'forTurn' | 'drain'>;
	researchCapture?: AgenticChatResearchCapturePortV1;
	statedFutureCapture?: AgenticChatStatedFutureCapturePortV1;
	consumptionBilling?: AgenticChatConsumptionBillingPortV1;
	onTimingSnapshot?: AgenticChatRuntimeTimingObserverV1;
	onPromptSnapshotError?: (error: unknown) => void;
	onExecutionObservationError?: (error: unknown) => void;
	onResearchCaptureError?: (error: unknown) => void;
	onStatedFutureCaptureError?: (error: unknown) => void;
	onConsumptionBillingError?: (error: unknown) => void;
	onTerminalControlError?: (report: AgenticChatTerminalControlErrorReportV1) => void;
};

type CaptureInput = {
	executionInput: AgenticChatWorkerExecutionInputV1;
	processingToken: string;
	signal: AbortSignal;
};

export class AgenticChatExecutorEffects {
	private readonly pendingEffects: Pick<AgenticChatPendingEffectsRegistry, 'forTurn' | 'drain'>;

	constructor(private readonly ports: AgenticChatExecutorEffectPortsV1) {
		this.pendingEffects = ports.pendingEffects ?? AGENTIC_CHAT_PENDING_EFFECTS_REGISTRY;
	}

	/**
	 * Prompt snapshots are an evaluation artifact; a failure is telemetry, never
	 * turn truth. The write is detached into the turn's pending set so the
	 * already-buffered pass replays without waiting on it, bounded by its own
	 * deadline so a hung RPC is cancelled rather than orphaned, and joined by
	 * `drainPendingEffects` before the terminal fence
	 * (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F67).
	 */
	persistPromptSnapshot(
		input: AgenticChatPromptSnapshotPersistInputV1,
		signal: AbortSignal
	): void {
		const port = this.ports.promptSnapshots;
		if (!port) return;
		this.pendingEffects.forTurn(input.turnRunId).enqueue(
			attempt(
				() =>
					runWithAbortableDeadline({
						parentSignal: signal,
						timeoutMs: AGENTIC_CHAT_PROMPT_SNAPSHOT_TIMEOUT_MS,
						createTimeoutError: () =>
							new Error('Agentic Chat prompt snapshot persistence timed out'),
						run: (deadlineSignal) => port.persist(input, deadlineSignal)
					}),
				this.ports.onPromptSnapshotError
			)
		);
	}

	/**
	 * Private tool-execution observations are bounded by their own deadline and
	 * run detached from the tool critical path; the executor joins the turn's
	 * pending set once before the terminal fence so the rows still land inside
	 * the execution generation (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F50).
	 */
	observeToolExecution(input: AgenticChatExecutionObservationInputV1, signal: AbortSignal): void {
		const port = this.ports.executionObservations;
		if (!port) return;
		this.pendingEffects.forTurn(input.turnRunId).enqueue(
			attempt(
				() =>
					runWithAbortableDeadline({
						parentSignal: signal,
						timeoutMs: AGENTIC_CHAT_EXECUTION_OBSERVATION_TIMEOUT_MS,
						createTimeoutError: () =>
							new Error('Agentic Chat tool execution observation timed out'),
						run: (deadlineSignal) => port.observe(input, deadlineSignal)
					}),
				this.ports.onExecutionObservationError
			)
		);
	}

	/**
	 * Join the turn's detached effects (tool observations, provider attempt
	 * receipts, the prompt snapshot) before terminal truth is written, then
	 * forget the turn. Each effect already carries its own deadline; this only
	 * bounds the wait at the fence. A drain that times out is reported, never
	 * fatal.
	 */
	drainPendingEffects(turnRunId: string): Promise<void> {
		return attempt(async () => {
			const drained = await this.pendingEffects.drain(
				turnRunId,
				AGENTIC_CHAT_EXECUTION_OBSERVATION_TIMEOUT_MS
			);
			if (!drained) {
				throw new Error(
					'Agentic Chat detached effects were still pending at the terminal fence'
				);
			}
		}, this.ports.onExecutionObservationError);
	}

	captureResearch(input: CaptureInput): Promise<void> {
		const port = this.ports.researchCapture;
		if (!port) return Promise.resolve();
		return attempt(() => port.capture(input), this.ports.onResearchCaptureError);
	}

	captureStatedFuture(input: CaptureInput): Promise<void> {
		const port = this.ports.statedFutureCapture;
		if (!port) return Promise.resolve();
		return attempt(() => port.capture(input), this.ports.onStatedFutureCaptureError);
	}

	/** The executor bounds the evaluation with its terminal deadline through `run`. */
	evaluateConsumptionBilling(
		userId: string,
		run: (evaluate: () => PromiseLike<unknown>) => Promise<unknown>
	): Promise<void> {
		const port = this.ports.consumptionBilling;
		if (!port) return Promise.resolve();
		return attempt(
			() => run(() => port.evaluate(userId)),
			this.ports.onConsumptionBillingError
		);
	}

	timingSnapshot(snapshot: AgenticChatRuntimeTimingSnapshotV1): void {
		this.ports.onTimingSnapshot?.(snapshot);
	}

	reportTerminalControlError(report: AgenticChatTerminalControlErrorReportV1): void {
		try {
			this.ports.onTerminalControlError?.(report);
		} catch {
			// Terminal-control observability must never overturn terminal truth.
		}
	}
}

/** The one policy: attempt the effect, hand a failure to its reporter, never throw. */
async function attempt(run: () => PromiseLike<unknown>, report?: (error: unknown) => void) {
	try {
		await run();
	} catch (error) {
		try {
			report?.(error);
		} catch {
			// A reporter that fails cannot alter the turn either.
		}
	}
}
