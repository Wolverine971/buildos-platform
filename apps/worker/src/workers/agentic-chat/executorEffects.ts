// apps/worker/src/workers/agentic-chat/executorEffects.ts
//
// Best-effort side effects of a turn: observability, capture, billing, and
// terminal-control telemetry. None of them may change what the user sees or
// what the durable ledger says, so they share one error policy here: the
// port is attempted, a failure is handed to its reporter, and a reporter that
// throws is swallowed. Cancellation still propagates through the executor's
// own `throwIfAborted` after the attempt, exactly as before.

import { abortable, runWithAbortableDeadline } from './abortableDeadline';
import type { AgenticChatConsumptionBillingPortV1 } from './consumptionBilling';
import {
	AGENTIC_CHAT_EXECUTION_OBSERVATION_TIMEOUT_MS,
	type AgenticChatExecutionObservationInputV1,
	type AgenticChatExecutionObservationPortV1
} from './executionObservation';
import type { AgenticChatWorkerExecutionInputV1 } from './executionInput';
import type {
	AgenticChatPromptSnapshotPersistInputV1,
	AgenticChatPromptSnapshotPortV1
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
	constructor(private readonly ports: AgenticChatExecutorEffectPortsV1) {}

	/** Prompt snapshots are an evaluation artifact; a failure is telemetry, never turn truth. */
	persistPromptSnapshot(
		input: AgenticChatPromptSnapshotPersistInputV1,
		signal: AbortSignal
	): Promise<void> {
		const port = this.ports.promptSnapshots;
		if (!port) return Promise.resolve();
		return attempt(
			() => abortable(port.persist(input), signal),
			this.ports.onPromptSnapshotError
		);
	}

	/** Private tool-execution observations are bounded by their own deadline. */
	observeToolExecution(
		input: AgenticChatExecutionObservationInputV1,
		signal: AbortSignal
	): Promise<void> {
		const port = this.ports.executionObservations;
		if (!port) return Promise.resolve();
		return attempt(
			() =>
				runWithAbortableDeadline({
					parentSignal: signal,
					timeoutMs: AGENTIC_CHAT_EXECUTION_OBSERVATION_TIMEOUT_MS,
					createTimeoutError: () =>
						new Error('Agentic Chat tool execution observation timed out'),
					run: (deadlineSignal) => port.observe(input, deadlineSignal)
				}),
			this.ports.onExecutionObservationError
		);
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
