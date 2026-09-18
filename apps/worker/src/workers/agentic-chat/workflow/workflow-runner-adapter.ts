// apps/worker/src/workers/agentic-chat/workflow/workflow-runner-adapter.ts
import type {
	AgenticChatCommittedSemanticEventReceiptV1,
	AgenticChatRecoveryFailureClassV1,
	AgenticChatTerminalFinalizeRpcResultV1,
	AgenticChatTextBatchRpcResultV1,
	AgenticChatWorkflowTerminalOutcomeV1,
	ChatTurnTerminalStatusV1,
	JsonObject
} from '@buildos/shared-types';
import { AgenticChatCancellationError } from '../cancellationObserver';
import type {
	AgenticChatExecutionControlPortV1,
	AgenticChatTerminalFinalizeInputV1
} from '../executionControl';
import {
	AgenticChatPublisherOverloadError,
	type AgenticChatStreamPublisher
} from '../streamPublisher';
import type {
	AgenticChatTurnExecutionOutcomeV1,
	AgenticChatTurnExecutionResultV1
} from '../turn-executor';
import { parseAgenticChatWorkflowEventReceiptV1 } from './preparation-store';
import type {
	AgenticChatWorkflowRunner,
	AgenticChatWorkflowRunOutcomeV1,
	AgenticChatWorkflowRunResultV1
} from './workflow-runner';
import type {
	AgenticChatWorkflowPreparedTurnV1,
	AgenticChatWorkflowRunnerOutcomeV1,
	AgenticChatWorkflowRunnerPortV1
} from './workflow-runner-port';
import type {
	AgenticChatWorkflowFenceV1,
	AgenticChatWorkflowRunStateV1,
	AgenticChatWorkflowStorePortV1
} from './workflow-store';
import {
	type AgenticChatWorkflowTerminalDecisionV1,
	buildAgenticChatWorkflowTerminalInputV1,
	decideAgenticChatWorkflowTerminalFromDurableTruthV1
} from './workflow-terminal';

/**
 * Tasker 87 behind Tasker 86's runner port. Preparation hands over a claimed v4
 * turn with an accepted context; this adapter runs the durable runner, delivers its
 * already-committed events live, drains the stream, and then owns terminal truth:
 * one finalize (replayed once with identical input if its response is lost), or
 * workflow recovery for a requeue. `handled` is returned in every case.
 */

type PublisherPort = Pick<
	AgenticChatStreamPublisher,
	'publishCommittedSemantic' | 'publishCommittedText' | 'publishTerminal' | 'flushTurn'
>;

type ControlPort = Pick<AgenticChatExecutionControlPortV1, 'finalize'> &
	Required<Pick<AgenticChatExecutionControlPortV1, 'recoverWorkflow'>>;

export type AgenticChatWorkflowRunnerAdapterPortsV1 = {
	runner: Pick<AgenticChatWorkflowRunner, 'run'>;
	store: Pick<AgenticChatWorkflowStorePortV1, 'loadRun'>;
	control: ControlPort;
	publisher: PublisherPort;
	now?: () => number;
	/** One privacy-safe summary line per invocation: ids, counts, and outcomes only. */
	onRunSummary?: (summary: AgenticChatWorkflowRunSummaryV1) => void;
	onError?: (report: { stage: string; turnRunId: string; error: unknown }) => void;
};

export type AgenticChatWorkflowRunnerAdapterOptionsV1 = {
	/** Bound on waiting for live delivery of committed events before terminal truth. */
	deliveryDrainMs?: number;
};

export type AgenticChatWorkflowRunSummaryV1 = {
	event: 'agentic_chat_workflow_run';
	turnRunId: string;
	executionGeneration: number;
	runOutcome: AgenticChatWorkflowRunOutcomeV1['kind'];
	result: AgenticChatTurnExecutionOutcomeV1;
	failureCode: string | null;
	dispatches: number;
	settledMicroUsd: number;
	uncertainDispatches: number;
	settlementsDrained: boolean;
	resumed: boolean;
};

export class AgenticChatWorkflowRunnerAdapter implements AgenticChatWorkflowRunnerPortV1 {
	private readonly now: () => number;
	private readonly deliveryDrainMs: number;

	constructor(
		private readonly ports: AgenticChatWorkflowRunnerAdapterPortsV1,
		options: AgenticChatWorkflowRunnerAdapterOptionsV1 = {}
	) {
		this.now = ports.now ?? Date.now;
		this.deliveryDrainMs = options.deliveryDrainMs ?? 2_000;
	}

	async run(input: {
		prepared: AgenticChatWorkflowPreparedTurnV1;
		signal: AbortSignal;
	}): Promise<AgenticChatWorkflowRunnerOutcomeV1> {
		const { prepared, signal } = input;
		const claim = prepared.claim;
		const fence: AgenticChatWorkflowFenceV1 = {
			turnRunId: prepared.envelope.turnRunId,
			queueJobId: prepared.envelope.queueJobId,
			processingToken: prepared.envelope.processingToken,
			executionGeneration: claim.executionGeneration
		};
		const delivery = new WorkflowLiveDelivery(this.ports.publisher, prepared, fence);
		const result = await this.ports.runner.run({
			fence,
			userId: claim.userId,
			sessionId: claim.sessionId,
			streamRunId: prepared.command.streamRunId,
			clientTurnId: prepared.command.clientTurnId,
			projectId: prepared.request.request.context.projectId,
			modelInput: prepared.modelInput,
			resumeRequired: prepared.stream.resumeRequired,
			invocationDeadlineAtMs: prepared.deadlines.invocationDeadlineAtMs,
			signal,
			delivery
		});
		await delivery.drain(this.deliveryDrainMs);
		try {
			await this.ports.publisher.flushTurn(claim.turnRunId);
		} catch (error) {
			// Durable truth is committed; a blocked live stream reconciles on reconnect.
			this.report('flush', fence, error);
		}
		const terminal = new WorkflowTerminal(
			this.ports,
			prepared,
			fence,
			this.now,
			(stage, error) => this.report(stage, fence, error)
		);
		const handled = await terminal.settle(result.outcome, signal);
		this.summarize(fence, prepared, result, handled);
		return { kind: 'handled', result: handled.result };
	}

	private summarize(
		fence: AgenticChatWorkflowFenceV1,
		prepared: AgenticChatWorkflowPreparedTurnV1,
		run: AgenticChatWorkflowRunResultV1,
		handled: { result: AgenticChatTurnExecutionResultV1; failureCode: string | null }
	): void {
		if (!this.ports.onRunSummary) return;
		const final = new Map<string, { event: string; actual: number | null }>();
		for (const entry of run.ledger) {
			if (!entry.dispatchId) continue;
			if (['settled', 'uncertain', 'released', 'dispatching'].includes(entry.event)) {
				final.set(entry.dispatchId, { event: entry.event, actual: entry.actualMicroUsd });
			}
		}
		let settledMicroUsd = 0;
		let uncertainDispatches = 0;
		let dispatches = 0;
		for (const entry of final.values()) {
			if (entry.event !== 'released') dispatches += 1;
			if (entry.event === 'settled') settledMicroUsd += entry.actual ?? 0;
			if (entry.event === 'uncertain' || entry.event === 'dispatching')
				uncertainDispatches += 1;
		}
		try {
			this.ports.onRunSummary({
				event: 'agentic_chat_workflow_run',
				turnRunId: fence.turnRunId,
				executionGeneration: fence.executionGeneration,
				runOutcome: run.outcome.kind,
				result: handled.result.outcome,
				failureCode: handled.failureCode,
				dispatches,
				settledMicroUsd,
				uncertainDispatches,
				settlementsDrained: run.settlementsDrained,
				resumed: prepared.stream.resumeRequired
			});
		} catch {
			// Telemetry never alters terminal truth.
		}
	}

	private report(stage: string, fence: AgenticChatWorkflowFenceV1, error: unknown): void {
		try {
			this.ports.onError?.({ stage, turnRunId: fence.turnRunId, error });
		} catch {
			// Reporting is best effort.
		}
	}
}

/** Publishes already-durable workflow events in commit order, off the runner's path. */
class WorkflowLiveDelivery {
	private tail: Promise<void> = Promise.resolve();

	constructor(
		private readonly publisher: PublisherPort,
		private readonly prepared: AgenticChatWorkflowPreparedTurnV1,
		private readonly fence: AgenticChatWorkflowFenceV1
	) {}

	durableEvent(event: JsonObject): void {
		this.tail = this.tail.then(() => this.publish(event)).catch(() => undefined);
	}

	async drain(timeoutMs: number): Promise<void> {
		let timer: NodeJS.Timeout | undefined;
		await Promise.race([
			this.tail,
			new Promise<void>((resolve) => {
				timer = setTimeout(resolve, timeoutMs);
				timer.unref?.();
			})
		]);
		if (timer) clearTimeout(timer);
	}

	private async publish(event: JsonObject): Promise<void> {
		const turnRunId = this.fence.turnRunId;
		if (event.event_type === 'text_delta') {
			if (event.outcome !== 'persisted' && event.outcome !== 'already_persisted') return;
			await this.publisher.publishCommittedText(
				turnRunId,
				event as unknown as Extract<
					AgenticChatTextBatchRpcResultV1,
					{ outcome: 'persisted' | 'already_persisted' }
				>
			);
			return;
		}
		const parsed = parseAgenticChatWorkflowEventReceiptV1(event, this.fence);
		if (parsed.kind === 'none') return;
		const claim = this.prepared.claim;
		const receipt: AgenticChatCommittedSemanticEventReceiptV1 =
			parsed.kind === 'committed'
				? parsed.receipt
				: {
						// A replayed checkpoint returns durable coordinates only; the
						// publisher records the sequence and reconciles instead of resending.
						outcome: 'already_persisted',
						publish_allowed: false,
						turn_run_id: turnRunId,
						queue_job_id: this.fence.queueJobId,
						session_id: claim.sessionId,
						user_id: claim.userId,
						stream_run_id: this.prepared.command.streamRunId,
						client_turn_id: this.prepared.command.clientTurnId,
						execution_generation: parsed.executionGeneration,
						sequence_index: parsed.sequenceIndex,
						event_id: parsed.eventId,
						phase: 'llm',
						event_type: 'workflow_progress',
						durable: true,
						transition_id: '',
						event_payload: {}
					};
		await this.publisher.publishCommittedSemantic(turnRunId, receipt);
	}
}

type Handled = { result: AgenticChatTurnExecutionResultV1; failureCode: string | null };

/** Maps a runner outcome to exactly one terminal action. */
class WorkflowTerminal {
	constructor(
		private readonly ports: AgenticChatWorkflowRunnerAdapterPortsV1,
		private readonly prepared: AgenticChatWorkflowPreparedTurnV1,
		private readonly fence: AgenticChatWorkflowFenceV1,
		private readonly now: () => number,
		private readonly report: (stage: string, error: unknown) => void
	) {}

	async settle(outcome: AgenticChatWorkflowRunOutcomeV1, signal: AbortSignal): Promise<Handled> {
		switch (outcome.kind) {
			case 'completed':
				return this.finalize({
					status: 'completed',
					failureCode: null,
					assistantText: outcome.answerText,
					terminalOutcome:
						outcome.synthesisAccepted && outcome.quality === 'complete'
							? 'complete'
							: 'partial',
					coverageGap: outcome.coverageGap,
					activity: '',
					metadata: {
						workflow_quality: outcome.quality,
						workflow_answer_source: outcome.answerSource
					}
				});
			case 'failed':
				return this.fail(outcome.failureCode, outcome.publicMessage);
			case 'cancelled':
				return this.cancel();
			case 'requeue':
				return this.recover(outcome.failureClass, `Workflow requeue: ${outcome.reason}`);
			case 'fenced':
				if (outcome.reason === 'already_terminal') return this.reconciled();
				// The old owner stops without writing; the current owner holds truth.
				return this.done('stale_generation', null);
			case 'aborted': {
				const reason = signal.reason;
				if (reason instanceof AgenticChatCancellationError) return this.cancel();
				if (reason instanceof AgenticChatPublisherOverloadError) {
					return this.recover(
						'publisher_overload',
						'Workflow progress publication overloaded'
					);
				}
				return this.recover(
					'timeout_post_start',
					'Worker invocation ended during workflow execution'
				);
			}
		}
	}

	private async fail(failureCode: string, message: string): Promise<Handled> {
		return this.finalize({
			status: 'failed',
			failureCode,
			assistantText: '',
			terminalOutcome: 'failed',
			coverageGap: message,
			activity: message
		});
	}

	private async cancel(): Promise<Handled> {
		// A durable answer prefix stays the visible partial message; nothing is regenerated.
		const state = await this.load();
		return this.finalize({
			status: 'cancelled',
			failureCode: 'cancelled',
			assistantText: state?.answer.text ?? '',
			terminalOutcome: 'cancelled',
			coverageGap: 'Review stopped. Nothing was changed.',
			activity: 'Review stopped. Nothing was changed.',
			state
		});
	}

	private async decide(
		decision: AgenticChatWorkflowTerminalDecisionV1,
		state: AgenticChatWorkflowRunStateV1 | null
	) {
		if (decision.status === 'failed') return this.fail(decision.failureCode, decision.message);
		return this.finalize({
			status: 'completed',
			failureCode: null,
			assistantText: decision.assistantText,
			terminalOutcome:
				decision.answerSource === 'accepted_answer' && decision.quality === 'complete'
					? 'complete'
					: 'partial',
			coverageGap: decision.coverageGap,
			activity: '',
			state,
			metadata: {
				workflow_quality: decision.quality,
				workflow_answer_source: decision.answerSource
			}
		});
	}

	private async recover(
		failureClass: AgenticChatRecoveryFailureClassV1,
		message: string
	): Promise<Handled> {
		let receipt;
		try {
			receipt = await this.ports.control.recoverWorkflow({
				...this.fence,
				failureClass,
				errorMessage: message.slice(0, 2_000)
			});
		} catch (error) {
			this.report('recover', error);
			return this.done('recovery_required', null);
		}
		switch (receipt.outcome) {
			case 'retry_scheduled':
			case 'already_requeued':
				return this.done('requeued', null);
			case 'terminal_reconciled':
				return this.done(
					'terminal_reconciled',
					null,
					terminalStatus(receipt.raw.status),
					true
				);
			case 'stale_generation':
			case 'ownership_lost':
				return this.done('stale_generation', null);
			case 'cancel_requested':
				return this.cancel();
			case 'policy_denied':
				return this.fail(
					'workflow_recovery_denied',
					'The review could not safely resume. Nothing was changed.'
				);
			default: {
				// Deadline, budget, attempts, access, or a non-retryable class: decision (a).
				const state = await this.load();
				if (!state) {
					return this.fail(
						`workflow_${receipt.outcome}`,
						'The review stopped before it could finish. Nothing was changed.'
					);
				}
				return this.decide(
					decideAgenticChatWorkflowTerminalFromDurableTruthV1(state, receipt.outcome),
					state
				);
			}
		}
	}

	private async finalize(input: {
		status: 'completed' | 'failed' | 'cancelled';
		failureCode: string | null;
		assistantText: string;
		terminalOutcome: AgenticChatWorkflowTerminalOutcomeV1;
		coverageGap: string | null;
		activity: string;
		state?: AgenticChatWorkflowRunStateV1 | null;
		metadata?: JsonObject;
	}): Promise<Handled> {
		const state = input.state === undefined ? await this.load() : input.state;
		const request: AgenticChatTerminalFinalizeInputV1 = buildAgenticChatWorkflowTerminalInputV1(
			{
				fence: this.fence,
				userId: this.prepared.claim.userId,
				status: input.status,
				failureCode: input.failureCode,
				assistantText: input.assistantText,
				state,
				terminalOutcome: input.terminalOutcome,
				coverageGap: input.coverageGap,
				activity: input.activity,
				observedAt: new Date(this.now()).toISOString(),
				metadata: input.metadata
			}
		);
		let receipt: AgenticChatTerminalFinalizeRpcResultV1;
		try {
			receipt = await this.ports.control.finalize(request);
		} catch (first) {
			// A lost terminal response is replayed with identical input: the stable
			// message id makes a committed first attempt answer `already_terminal`.
			this.report('finalize', first);
			try {
				receipt = await this.ports.control.finalize(request);
			} catch (error) {
				this.report('finalize_replay', error);
				return this.done('recovery_required', request.failureCode);
			}
		}
		if (receipt.outcome === 'stale_generation') return this.done('stale_generation', null);
		if (receipt.outcome === 'cancel_requested') {
			return input.status === 'cancelled'
				? this.done('recovery_required', 'cancelled')
				: this.cancel();
		}
		if (receipt.outcome === 'finalized' || receipt.outcome === 'already_terminal') {
			try {
				await this.ports.publisher.publishTerminal(this.fence.turnRunId, receipt, {
					type: 'done',
					status: receipt.status,
					finished_reason: request.finishedReason,
					failure_code: request.failureCode
				});
			} catch (error) {
				// Terminal database truth is authoritative; reconnect reconciles it.
				this.report('publish_terminal', error);
			}
		}
		const queueReconciled = await this.reconcileQueue();
		const status = receipt.status as ChatTurnTerminalStatusV1;
		const outcome: AgenticChatTurnExecutionOutcomeV1 =
			receipt.outcome === 'finalized' || status === input.status
				? status
				: 'terminal_reconciled';
		return this.done(outcome, request.failureCode, status, queueReconciled);
	}

	private async reconciled(): Promise<Handled> {
		const queueReconciled = await this.reconcileQueue();
		return this.done('terminal_reconciled', null, null, queueReconciled);
	}

	private async reconcileQueue(): Promise<boolean> {
		try {
			const receipt = await this.ports.control.recoverWorkflow({
				...this.fence,
				failureClass: 'unknown',
				errorMessage: 'Reconcile terminal workflow queue state'
			});
			return receipt.outcome === 'terminal_reconciled';
		} catch (error) {
			this.report('reconcile', error);
			return false;
		}
	}

	private async load(): Promise<AgenticChatWorkflowRunStateV1 | null> {
		try {
			return await this.ports.store.loadRun(this.fence.turnRunId);
		} catch (error) {
			this.report('load_run', error);
			return null;
		}
	}

	private done(
		outcome: AgenticChatTurnExecutionOutcomeV1,
		failureCode: string | null,
		terminal: ChatTurnTerminalStatusV1 | null = null,
		queueReconciled = false
	): Handled {
		return {
			failureCode,
			result: {
				outcome,
				turnRunId: this.fence.turnRunId,
				executionGeneration: this.fence.executionGeneration,
				terminalStatus: terminal,
				queueReconciled
			}
		};
	}
}

function terminalStatus(value: unknown): ChatTurnTerminalStatusV1 | null {
	return value === 'completed' || value === 'failed' || value === 'cancelled' ? value : null;
}
