// apps/worker/src/workers/agentic-chat/workflow/raw-turn-preparation.ts
import { randomUUID } from 'node:crypto';
import {
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	type AgenticChatCommittedSemanticEventReceiptV1,
	type AgenticChatPreparedWorkflowContextV1,
	type AgenticChatRecoveryFailureClassV1,
	type AgenticChatTerminalFinalizeRpcResultV1,
	type AgenticChatTurnClaimResultV1,
	type ChatTurnTerminalStatusV1,
	type JsonObject
} from '@buildos/shared-types';
import { abortable, runWithAbortableDeadline } from '../abortableDeadline';
import { AgenticChatCancellationError } from '../cancellationObserver';
import type {
	AgenticChatExecutionControlPortV1,
	AgenticChatExecutionIdentityV1
} from '../executionControl';
import {
	AgenticChatExecutionInputError,
	type AgenticChatRawWorkflowExecutionInputV1
} from '../executionInput';
import {
	AgenticChatPublisherOverloadError,
	type AgenticChatStreamPublisher
} from '../streamPublisher';
import type {
	AgenticChatTurnExecutionOutcomeV1,
	AgenticChatTurnExecutionResultV1
} from '../turn-executor';
import type { AgenticChatWorkflowPreparationContextLoaderV1 } from './context-loader';
import {
	AgenticChatWorkflowContextError,
	type BuiltAgenticChatWorkflowContextV1,
	buildAgenticChatWorkflowContextV1,
	buildAgenticChatWorkflowModelInputV1
} from './prepared-context';
import {
	type AgenticChatWorkflowDurableRunV1,
	type AgenticChatWorkflowEventReceiptV1,
	type AgenticChatWorkflowFenceV1,
	type AgenticChatWorkflowPreparationStorePortV1,
	AgenticChatWorkflowStoreRpcError
} from './preparation-store';
import {
	buildAgenticChatWorkflowProgressEventV1,
	buildAgenticChatWorkflowProjectionV1,
	buildAgenticChatWorkflowStreamProjectionV1
} from './workflow-projection';
import type {
	AgenticChatWorkflowPreparationTimingV1,
	AgenticChatWorkflowPreparedTurnV1,
	AgenticChatWorkflowRunnerPortV1
} from './workflow-runner-port';

type ExecutableClaim = Extract<
	AgenticChatTurnClaimResultV1,
	{ outcome: 'claimed' | 'matching_current_claim' }
>;

export type AgenticChatRawWorkflowTurnInputV1 = {
	envelope: AgenticChatExecutionIdentityV1;
	claim: ExecutableClaim;
	/** The executor's combined job, cancellation, and overload signal. */
	signal: AbortSignal;
	/** The executor's conservative pre-start invocation deadline (epoch ms). */
	invocationDeadlineAtMs: number;
};

/** The only seam the ordinary executor calls for an `agentic_chat_input_v4` turn. */
export type AgenticChatRawWorkflowTurnPortV1 = {
	execute(input: AgenticChatRawWorkflowTurnInputV1): Promise<AgenticChatTurnExecutionResultV1>;
};

type PublisherPort = Pick<
	AgenticChatStreamPublisher,
	| 'registerTurn'
	| 'publishReconcileHint'
	| 'publishCommittedSemantic'
	| 'publishTerminal'
	| 'getSnapshot'
	| 'unregisterTurn'
	| 'abandonTurn'
>;

export type AgenticChatWorkflowTurnPreparerPortsV1 = {
	input: {
		loadRawWorkflowInput(
			claim: ExecutableClaim
		): Promise<AgenticChatRawWorkflowExecutionInputV1>;
	};
	store: AgenticChatWorkflowPreparationStorePortV1;
	loadContext: AgenticChatWorkflowPreparationContextLoaderV1;
	publisher: PublisherPort;
	control: Pick<AgenticChatExecutionControlPortV1, 'finalize'>;
	runner: AgenticChatWorkflowRunnerPortV1;
	/** The existing internal workflow cohort; the web admission gate applies it too. */
	allowedUserIds: readonly string[];
	createId?: () => string;
	now?: () => number;
	monotonicNow?: () => number;
	onTiming?: (timing: AgenticChatWorkflowPreparationTimingV1) => void;
	onError?: (report: { stage: string; turnRunId: string; error: unknown }) => void;
};

export type AgenticChatWorkflowTurnPreparerOptionsV1 = {
	/** Per database round trip, like the executor's overhead deadline. */
	overheadTimeoutMs?: number;
	/** Contract section 3: context-read timeout. */
	contextTimeoutMs?: number;
	/** Contract section 3: finalization time held from an invocation. */
	finalizationReserveMs?: number;
	/** Bound on waiting for a prior live delivery before the next committed event. */
	deliveryWaitMs?: number;
};

/** User-readable terminal reasons, carried in `workflow.coverageGap` and the activity line. */
export const AGENTIC_CHAT_WORKFLOW_PREPARATION_FAILURES = {
	workflow_not_enabled: 'Project review is not enabled for this account. Nothing was changed.',
	workflow_input_invalid:
		'This review request could not be verified, so it did not start. Nothing was changed.',
	workflow_access_revoked:
		'You no longer have access to this project, so the review stopped before reading it. Nothing was changed.',
	workflow_deadline_expired:
		'The review ran out of time before it could start. Nothing was changed; please try again.',
	workflow_context_unavailable:
		'Project context could not be loaded for this review. Nothing was changed; please try again.',
	workflow_context_too_large:
		'This project is too large to review right now. Nothing was changed.',
	workflow_context_timeout:
		'Project context took too long to load. Nothing was changed; please try again.',
	workflow_budget_exhausted: 'The review reached its safety limit. Nothing was changed.',
	workflow_recovery_denied: 'The review could not safely resume. Nothing was changed.',
	workflow_preparation_failed:
		'The review could not be prepared. Nothing was changed; please try again.',
	workflow_execution_not_enabled:
		'Project context is ready, but review execution is not enabled yet. Nothing was changed.'
} as const;

export type AgenticChatWorkflowPreparationFailureCodeV1 =
	keyof typeof AGENTIC_CHAT_WORKFLOW_PREPARATION_FAILURES;

class WorkflowContextTimeoutError extends Error {
	constructor(timeoutMs: number) {
		super(`Workflow context preparation exceeded its ${timeoutMs}ms bound`);
		this.name = 'WorkflowContextTimeoutError';
	}
}

type TraceState = {
	startedAtMono: number;
	startedAtWallMs: number;
	dbRoundTrips: number;
	inputLoadMs: number | null;
	progressPublishMs: number | null;
	accessCheckMs: number | null;
	contextLoadMs: number | null;
	checkpointMs: number | null;
	checkpointOutcome: string | null;
	checkpointReplayed: boolean;
	contextSource: 'fresh_load' | 'reused_durable' | null;
	built: BuiltAgenticChatWorkflowContextV1 | null;
	acceptedBytes: number | null;
	acceptedEvidence: number | null;
	emitted: boolean;
};

type PreparationState = {
	envelope: AgenticChatExecutionIdentityV1;
	claim: ExecutableClaim;
	fence: AgenticChatWorkflowFenceV1;
	signal: AbortSignal;
	invocationDeadlineAtMs: number;
	raw: AgenticChatRawWorkflowExecutionInputV1 | null;
	publisherRegistered: boolean;
	delivery: Promise<unknown> | null;
	trace: TraceState;
};

/**
 * Tasker 86 worker preparation for raw `agentic_chat_input_v4` requests.
 *
 * After the ordinary claim: verify cohort and the immutable request, publish a
 * durable `preparing` progress checkpoint (the generation's first fenced write),
 * recheck current project access, load bounded context, and accept one immutable
 * request-bound checkpoint. A lost acceptance response is replayed with the same
 * identity and then read back; a later generation reuses durable truth. Only then
 * is the provider-neutral model input built and handed to the workflow runner.
 * No provider is called here.
 */
export class AgenticChatWorkflowTurnPreparer implements AgenticChatRawWorkflowTurnPortV1 {
	private readonly overheadTimeoutMs: number;
	private readonly contextTimeoutMs: number;
	private readonly finalizationReserveMs: number;
	private readonly deliveryWaitMs: number;

	constructor(
		private readonly ports: AgenticChatWorkflowTurnPreparerPortsV1,
		options: AgenticChatWorkflowTurnPreparerOptionsV1 = {}
	) {
		this.overheadTimeoutMs = positive(options.overheadTimeoutMs ?? 10_000, 'overheadTimeoutMs');
		this.contextTimeoutMs = positive(options.contextTimeoutMs ?? 20_000, 'contextTimeoutMs');
		this.finalizationReserveMs = positive(
			options.finalizationReserveMs ?? 5_000,
			'finalizationReserveMs'
		);
		this.deliveryWaitMs = positive(options.deliveryWaitMs ?? 2_000, 'deliveryWaitMs');
	}

	async execute(
		input: AgenticChatRawWorkflowTurnInputV1
	): Promise<AgenticChatTurnExecutionResultV1> {
		const local = new AbortController();
		const state: PreparationState = {
			envelope: input.envelope,
			claim: input.claim,
			fence: { ...input.envelope, executionGeneration: input.claim.executionGeneration },
			signal: AbortSignal.any([input.signal, local.signal]),
			invocationDeadlineAtMs: input.invocationDeadlineAtMs,
			raw: null,
			publisherRegistered: false,
			delivery: null,
			trace: {
				startedAtMono: this.mono(),
				startedAtWallMs: this.now(),
				dbRoundTrips: 0,
				inputLoadMs: null,
				progressPublishMs: null,
				accessCheckMs: null,
				contextLoadMs: null,
				checkpointMs: null,
				checkpointOutcome: null,
				checkpointReplayed: false,
				contextSource: null,
				built: null,
				acceptedBytes: null,
				acceptedEvidence: null,
				emitted: false
			}
		};
		try {
			return await this.prepare(state, (error) => local.abort(error));
		} catch (error) {
			return await this.handleThrown(state, error);
		} finally {
			this.releasePublisher(state);
		}
	}

	private async prepare(
		state: PreparationState,
		onOverload: (error: AgenticChatPublisherOverloadError) => void
	): Promise<AgenticChatTurnExecutionResultV1> {
		const { claim } = state;
		// Defense in depth: web admission applies the same cohort before writing v4.
		if (!this.ports.allowedUserIds.includes(claim.userId)) {
			return this.failTerminal(state, 'workflow_not_enabled');
		}

		const inputStartedAt = this.mono();
		try {
			state.raw = await this.overhead(state.signal, () =>
				this.ports.input.loadRawWorkflowInput(claim)
			);
		} catch (error) {
			state.trace.dbRoundTrips += 2;
			if (state.signal.aborted) throw error;
			if (
				error instanceof AgenticChatExecutionInputError &&
				error.code !== 'database_error'
			) {
				return this.failTerminal(state, 'workflow_input_invalid');
			}
			throw error;
		}
		state.trace.dbRoundTrips += 2;
		state.trace.inputLoadMs = this.mono() - inputStartedAt;
		const raw = state.raw;
		const projectId = raw.input.request.context.projectId;

		this.ports.publisher.registerTurn({
			turnRunId: claim.turnRunId,
			queueJobId: claim.queueJobId,
			processingToken: state.envelope.processingToken,
			userId: claim.userId,
			sessionId: claim.sessionId,
			streamRunId: raw.streamRunId,
			clientTurnId: raw.clientTurnId,
			executionGeneration: claim.executionGeneration,
			acceptedAt: raw.timingBaseline.admittedAt,
			onOverload
		});
		state.publisherRegistered = true;
		void this.ports.publisher.publishReconcileHint(claim.turnRunId).catch(() => undefined);

		let run = await this.store(state, 'read run', () =>
			this.ports.store.readRun({ turnRunId: claim.turnRunId, userId: claim.userId })
		);
		if (
			!run ||
			run.projectId !== projectId ||
			run.requestArtifactId !== claim.inputArtifactId ||
			run.requestHash !== raw.input.requestHash
		) {
			return this.failTerminal(state, 'workflow_input_invalid');
		}
		if (run.phase === 'finished') return this.reconcileTerminal(state);

		let accepted: AgenticChatPreparedWorkflowContextV1;
		let resumeRequired: boolean;
		if (run.context) {
			// Recovery reuses the accepted checkpoint and never re-snapshots it,
			// but current access still gates any further work.
			const allowed = await this.timedAccessCheck(state, state.signal, projectId);
			if (!allowed) return this.failTerminal(state, 'workflow_access_revoked');
			accepted = run.context;
			resumeRequired = true;
			state.trace.contextSource = 'reused_durable';
		} else {
			const prepared = await this.prepareFreshContext(state, run, projectId);
			if ('result' in prepared) return prepared.result;
			accepted = prepared.context;
			run = prepared.run;
			resumeRequired = false;
		}

		const modelInput = buildAgenticChatWorkflowModelInputV1({
			request: raw.input,
			context: accepted
		});
		state.trace.acceptedBytes = accepted.payloadBytes;
		state.trace.acceptedEvidence = accepted.evidenceVersions.length;
		await this.settleDelivery(state);
		const timing = this.emitTiming(state, 'provider_ready', null);
		const prepared: AgenticChatWorkflowPreparedTurnV1 = {
			version: 'agentic_chat_workflow_prepared_turn_v1',
			envelope: state.envelope,
			claim,
			command: {
				streamRunId: raw.streamRunId,
				clientTurnId: raw.clientTurnId,
				requestPayload: raw.requestPayload,
				timingBaseline: raw.timingBaseline
			},
			request: raw.input,
			context: accepted,
			contextSource:
				state.trace.contextSource === 'fresh_load' ? 'accepted_now' : 'reused_durable',
			durableRun: {
				phase: run.phase,
				recoveryCount: run.recoveryCount,
				contextAcceptedGeneration: run.contextAcceptedGeneration,
				deadlineAt: run.deadlineAt
			},
			modelInput,
			deadlines: {
				workflowDeadlineAt: run.deadlineAt,
				invocationDeadlineAtMs: state.invocationDeadlineAtMs
			},
			stream: {
				resumeRequired,
				durableSequence: this.ports.publisher.getSnapshot(claim.turnRunId).durableSequence
			},
			timing
		};
		const outcome = await this.ports.runner.run({ prepared, signal: state.signal });
		if (outcome.kind === 'handled') return outcome.result;
		return this.failTerminal(state, 'workflow_execution_not_enabled');
	}

	private async prepareFreshContext(
		state: PreparationState,
		run: AgenticChatWorkflowDurableRunV1,
		projectId: string
	): Promise<
		| { context: AgenticChatPreparedWorkflowContextV1; run: AgenticChatWorkflowDurableRunV1 }
		| { result: AgenticChatTurnExecutionResultV1 }
	> {
		const { claim } = state;
		const raw = state.raw!;

		// 1. Truthful "gathering context" progress. Resume is the contract's first
		//    fenced write of every generation and commits exactly one event.
		const preparing = buildAgenticChatWorkflowProjectionV1({ phase: 'preparing' });
		const resumeTransitionId = this.createId();
		const progressStartedAt = this.mono();
		const resumed = await this.store(
			state,
			'resume preparing progress',
			() =>
				this.ports.store.resume({
					fence: state.fence,
					transitionId: resumeTransitionId,
					projection: buildAgenticChatWorkflowStreamProjectionV1(
						preparing,
						'Gathering project context'
					),
					eventPayload: buildAgenticChatWorkflowProgressEventV1(preparing)
				}),
			{ replay: true }
		);
		state.trace.progressPublishMs = this.mono() - progressStartedAt;
		if (resumed.outcome !== 'resumed')
			return { result: await this.fenced(state, resumed.outcome) };
		this.publishCommitted(state, resumed.event);

		// 2. Bounded context: the earliest of now + 20 s, the invocation deadline
		//    less its finalization reserve, and the whole-run deadline.
		const nowMs = this.now();
		const workflowDeadlineAtMs = run.deadlineAt
			? Date.parse(run.deadlineAt)
			: Date.parse(raw.timingBaseline.workerStartedAt) + run.wholeRunLifetimeMs;
		if (!Number.isFinite(workflowDeadlineAtMs) || workflowDeadlineAtMs <= nowMs) {
			return { result: await this.failTerminal(state, 'workflow_deadline_expired') };
		}
		const boundaryMs = Math.min(
			nowMs + this.contextTimeoutMs,
			state.invocationDeadlineAtMs - this.finalizationReserveMs,
			workflowDeadlineAtMs
		);
		if (boundaryMs <= nowMs) {
			return {
				result: await this.recoverOrFail(
					state,
					'timeout_pre_start',
					'Worker invocation has no time left for context preparation',
					'workflow_context_timeout'
				)
			};
		}
		const contextBound = new AbortController();
		const timer = setTimeout(
			() => contextBound.abort(new WorkflowContextTimeoutError(boundaryMs - nowMs)),
			boundaryMs - nowMs
		);
		timer.unref?.();
		const contextSignal = AbortSignal.any([state.signal, contextBound.signal]);
		let built: BuiltAgenticChatWorkflowContextV1;
		try {
			const allowed = await this.timedAccessCheck(state, contextSignal, projectId);
			if (!allowed)
				return { result: await this.failTerminal(state, 'workflow_access_revoked') };
			const accessCheckedAt = new Date(this.now()).toISOString();
			const loadStartedAt = this.mono();
			// Raced here as well, so a loader that ignores its signal still
			// cannot deliver a late result into this preparation.
			const context = await abortable(
				this.ports.loadContext({ userId: claim.userId, projectId, signal: contextSignal }),
				contextSignal
			);
			state.trace.contextLoadMs = this.mono() - loadStartedAt;
			contextSignal.throwIfAborted();
			if (context.contextLoadSource === 'rpc_error_fallback') {
				throw new AgenticChatWorkflowStoreRpcError(
					'load_fastchat_context',
					'',
					'Project context RPC failed'
				);
			}
			built = buildAgenticChatWorkflowContextV1({
				context,
				userId: claim.userId,
				projectId,
				accessCheckedAt,
				contextLoadedAt: new Date(this.now()).toISOString()
			});
		} catch (error) {
			if (error instanceof AgenticChatWorkflowContextError) {
				return {
					result: await this.failTerminal(
						state,
						error.code === 'context_too_large'
							? 'workflow_context_too_large'
							: 'workflow_context_unavailable'
					)
				};
			}
			if (contextBound.signal.aborted && !state.signal.aborted) {
				throw contextBound.signal.reason;
			}
			throw error;
		} finally {
			clearTimeout(timer);
		}
		state.trace.built = built;
		state.trace.contextSource = 'fresh_load';

		// 3. Accept exactly one immutable checkpoint. No late result reaches this
		//    point: every await above observed the bounded signal.
		await this.settleDelivery(state);
		state.signal.throwIfAborted();
		const assessing = buildAgenticChatWorkflowProjectionV1({ phase: 'assessing' });
		const contextId = this.createId();
		const transitionId = this.createId();
		const checkpointStartedAt = this.mono();
		const accept = () =>
			this.ports.store.acceptContext({
				fence: state.fence,
				contextId,
				requestArtifactId: claim.inputArtifactId,
				requestHash: raw.input.requestHash,
				context: built,
				transitionId,
				projection: buildAgenticChatWorkflowStreamProjectionV1(
					assessing,
					'Project context ready'
				),
				eventPayload: buildAgenticChatWorkflowProgressEventV1(assessing)
			});
		// One lost response is replayed with identical arguments and answers
		// `already_accepted`. If the replay is lost too, the error propagates to
		// `transient_infra` recovery: this generation's live sequence is then
		// unknowable, so the next generation resumes and reuses whatever
		// checkpoint durably won.
		const receipt = await this.store(state, 'accept context', accept, { replay: true });
		state.trace.checkpointMs = this.mono() - checkpointStartedAt;
		state.trace.checkpointOutcome = receipt.outcome;
		switch (receipt.outcome) {
			case 'accepted': {
				this.publishCommitted(state, receipt.event);
				if (!receipt.acceptedAt) {
					return {
						result: await this.failTerminal(state, 'workflow_preparation_failed')
					};
				}
				return {
					context: {
						version: 'agentic_chat_prepared_context_v1',
						contextId,
						turnRunId: claim.turnRunId,
						requestId: claim.inputArtifactId,
						requestHash: raw.input.requestHash,
						preparationVersion: built.preparationVersion,
						contextIdentity: built.contextIdentity,
						evidenceVersions: built.evidenceVersions,
						payload: built.payload,
						payloadBytes: built.payloadBytes,
						contextHash: built.contextHash,
						acceptedAt: receipt.acceptedAt
					},
					run: {
						...run,
						phase: 'assessing',
						deadlineAt: receipt.deadlineAt ?? run.deadlineAt,
						contextAcceptedGeneration: claim.executionGeneration
					}
				};
			}
			case 'already_accepted':
			case 'context_conflict': {
				// `already_accepted`: our replay found our own earlier commit (its
				// response was lost). `context_conflict`: another checkpoint won.
				// Either way the durable row is the immutable truth to hand on.
				if (receipt.outcome === 'already_accepted')
					this.publishCommitted(state, receipt.event);
				const durable = await this.store(state, 'read accepted context', () =>
					this.ports.store.readRun({ turnRunId: claim.turnRunId, userId: claim.userId })
				);
				if (!durable?.context || durable.context.contextId !== receipt.contextId) {
					return {
						result: await this.failTerminal(state, 'workflow_preparation_failed')
					};
				}
				if (receipt.outcome === 'context_conflict')
					state.trace.contextSource = 'reused_durable';
				return { context: durable.context, run: durable };
			}
			case 'deadline_expired':
				return { result: await this.failTerminal(state, 'workflow_deadline_expired') };
			case 'access_revoked':
				return { result: await this.failTerminal(state, 'workflow_access_revoked') };
			default:
				return { result: await this.fenced(state, receipt.outcome) };
		}
	}

	private async timedAccessCheck(
		state: PreparationState,
		signal: AbortSignal,
		projectId: string
	): Promise<boolean> {
		const startedAt = this.mono();
		try {
			return await this.store(
				state,
				'project access',
				() => this.ports.store.hasProjectAccess({ userId: state.claim.userId, projectId }),
				{ signal }
			);
		} finally {
			state.trace.accessCheckMs = this.mono() - startedAt;
		}
	}

	private async handleThrown(
		state: PreparationState,
		error: unknown
	): Promise<AgenticChatTurnExecutionResultV1> {
		const reason = state.signal.aborted ? state.signal.reason : error;
		this.report('preparation', state, error);
		if (reason instanceof AgenticChatCancellationError) return this.cancelTerminal(state);
		if (reason instanceof AgenticChatPublisherOverloadError) {
			return this.recoverOrFail(
				state,
				'publisher_overload',
				'Workflow progress publication overloaded',
				'workflow_preparation_failed'
			);
		}
		if (error instanceof WorkflowContextTimeoutError) {
			return this.recoverOrFail(
				state,
				'timeout_pre_start',
				error.message,
				'workflow_context_timeout'
			);
		}
		if (state.signal.aborted) {
			return this.recoverOrFail(
				state,
				'timeout_pre_start',
				'Worker invocation ended during workflow preparation',
				'workflow_preparation_failed'
			);
		}
		if (
			isUncertain(error) ||
			(error instanceof AgenticChatExecutionInputError && error.code === 'database_error')
		) {
			return this.recoverOrFail(
				state,
				'transient_infra',
				errorMessage(error),
				'workflow_preparation_failed'
			);
		}
		// Unknown failures never retry indefinitely: workflow recovery answers
		// finalize_failed for `unknown`, after its cancel/deadline checks.
		return this.recoverOrFail(
			state,
			'unknown',
			errorMessage(error),
			'workflow_preparation_failed'
		);
	}

	/** Workflow-only recovery; ordinary `recover_agentic_chat_turn` is never used for v4. */
	private async recoverOrFail(
		state: PreparationState,
		failureClass: AgenticChatRecoveryFailureClassV1,
		message: string,
		fallbackCode: AgenticChatWorkflowPreparationFailureCodeV1
	): Promise<AgenticChatTurnExecutionResultV1> {
		let receipt;
		try {
			receipt = await this.terminalStep(state, () =>
				this.ports.store.recover({
					fence: state.fence,
					failureClass,
					errorMessage: canonicalMessage(message)
				})
			);
		} catch (error) {
			this.report('recover', state, error);
			return this.finish(state, 'recovery_required', fallbackCode);
		}
		switch (receipt.outcome) {
			case 'retry_scheduled':
			case 'already_requeued':
				return this.finish(state, 'requeued', fallbackCode);
			case 'terminal_reconciled':
				return this.finish(
					state,
					'terminal_reconciled',
					null,
					terminalStatus(receipt.status),
					true
				);
			case 'stale_generation':
			case 'ownership_lost':
				return this.finish(state, 'stale_generation', null);
			case 'cancel_requested':
				return this.cancelTerminal(state);
			case 'deadline_expired':
				return this.failTerminal(state, 'workflow_deadline_expired');
			case 'access_revoked':
				return this.failTerminal(state, 'workflow_access_revoked');
			case 'budget_exhausted':
				return this.failTerminal(state, 'workflow_budget_exhausted');
			case 'policy_denied':
				return this.failTerminal(state, 'workflow_recovery_denied');
			default:
				return this.failTerminal(state, fallbackCode);
		}
	}

	private async failTerminal(
		state: PreparationState,
		code: AgenticChatWorkflowPreparationFailureCodeV1
	): Promise<AgenticChatTurnExecutionResultV1> {
		return this.finalizeTerminal(state, 'failed', code);
	}

	private async cancelTerminal(
		state: PreparationState
	): Promise<AgenticChatTurnExecutionResultV1> {
		return this.finalizeTerminal(state, 'cancelled', null);
	}

	private async finalizeTerminal(
		state: PreparationState,
		status: 'failed' | 'cancelled',
		code: AgenticChatWorkflowPreparationFailureCodeV1 | null
	): Promise<AgenticChatTurnExecutionResultV1> {
		const { claim } = state;
		const message =
			status === 'cancelled'
				? 'Review stopped. Nothing was changed.'
				: AGENTIC_CHAT_WORKFLOW_PREPARATION_FAILURES[code!];
		const failureCode = status === 'cancelled' ? 'cancelled' : code!;
		const finishedReason = status === 'cancelled' ? 'cancelled' : 'error';
		const workflow = buildAgenticChatWorkflowProjectionV1({
			phase: 'finished',
			terminalOutcome: status,
			coverageGap: message
		});
		await this.settleDelivery(state);
		let finalized: AgenticChatTerminalFinalizeRpcResultV1;
		try {
			finalized = await this.terminalStep(state, () =>
				this.ports.control.finalize({
					...state.envelope,
					userId: claim.userId,
					executionGeneration: claim.executionGeneration,
					status,
					finishedReason,
					failureCode,
					assistantMessageId: null,
					assistantText: '',
					assistantMetadata: {
						transport_contract_version: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
						turn_run_id: claim.turnRunId,
						execution_generation: claim.executionGeneration,
						worker_runtime: 'agentic_chat_v1',
						tool_round_count: 0,
						tool_call_count: 0
					},
					promptTokens: null,
					completionTokens: null,
					totalTokens: null,
					projection: buildAgenticChatWorkflowStreamProjectionV1(workflow, message),
					eventPayload: {
						type: 'done',
						workflow: workflow as unknown as JsonObject,
						status,
						finished_reason: finishedReason,
						failure_code: failureCode,
						usage: status === 'failed' ? { total_tokens: 0 } : null
					}
				})
			);
		} catch (error) {
			this.report('finalize', state, error);
			return this.finish(state, 'recovery_required', code);
		}
		const receipt = finalized;
		if (receipt.outcome === 'stale_generation')
			return this.finish(state, 'stale_generation', code);
		if (receipt.outcome === 'cancel_requested') {
			return status === 'cancelled'
				? this.finish(state, 'recovery_required', code)
				: this.cancelTerminal(state);
		}
		if (receipt.outcome === 'finalized' && state.publisherRegistered) {
			try {
				await this.terminalStep(state, () =>
					this.ports.publisher.publishTerminal(claim.turnRunId, receipt, {
						type: 'done',
						workflow: workflow as unknown as JsonObject,
						status,
						finished_reason: finishedReason,
						failure_code: failureCode
					})
				);
			} catch {
				// Terminal database truth is authoritative; reconnect reconciles it.
			}
		}
		const queueReconciled = await this.reconcileQueue(state);
		const terminal = receipt.status as ChatTurnTerminalStatusV1;
		return this.finish(state, terminal, code, terminal, queueReconciled);
	}

	private async reconcileTerminal(
		state: PreparationState
	): Promise<AgenticChatTurnExecutionResultV1> {
		let status: ChatTurnTerminalStatusV1 | null = null;
		let reconciled = false;
		try {
			const receipt = await this.terminalStep(state, () =>
				this.ports.store.recover({
					fence: state.fence,
					failureClass: 'unknown',
					errorMessage: 'Reconcile terminal workflow queue state'
				})
			);
			reconciled = receipt.outcome === 'terminal_reconciled';
			status = terminalStatus(receipt.status);
		} catch (error) {
			this.report('reconcile', state, error);
		}
		return this.finish(state, 'terminal_reconciled', null, status, reconciled);
	}

	private async reconcileQueue(state: PreparationState): Promise<boolean> {
		try {
			const receipt = await this.terminalStep(state, () =>
				this.ports.store.recover({
					fence: state.fence,
					failureClass: 'unknown',
					errorMessage: 'Reconcile terminal workflow queue state'
				})
			);
			return receipt.outcome === 'terminal_reconciled';
		} catch (error) {
			this.report('reconcile', state, error);
			return false;
		}
	}

	private async fenced(
		state: PreparationState,
		outcome: 'stale_generation' | 'ownership_lost' | 'cancel_requested' | 'already_terminal'
	): Promise<AgenticChatTurnExecutionResultV1> {
		if (outcome === 'cancel_requested') return this.cancelTerminal(state);
		if (outcome === 'already_terminal') return this.reconcileTerminal(state);
		// The old owner stops without writing; the current owner holds truth.
		return this.finish(state, 'stale_generation', null);
	}

	private finish(
		state: PreparationState,
		outcome: AgenticChatTurnExecutionOutcomeV1,
		failureCode: string | null,
		terminal: ChatTurnTerminalStatusV1 | null = null,
		queueReconciled = false
	): AgenticChatTurnExecutionResultV1 {
		this.emitTiming(state, timingOutcome(outcome), failureCode);
		return {
			outcome,
			turnRunId: state.claim.turnRunId,
			executionGeneration: state.claim.executionGeneration,
			terminalStatus: terminal,
			queueReconciled
		};
	}

	private publishCommitted(
		state: PreparationState,
		event: AgenticChatWorkflowEventReceiptV1
	): void {
		if (!state.publisherRegistered || event.kind === 'none' || !state.raw) return;
		const { claim } = state;
		const receipt: AgenticChatCommittedSemanticEventReceiptV1 =
			event.kind === 'committed'
				? event.receipt
				: {
						// A replayed checkpoint returns durable coordinates only. Its
						// scope is ours by fence; the publisher records the sequence and
						// switches this turn to reconcile-only delivery.
						outcome: 'already_persisted',
						publish_allowed: false,
						turn_run_id: claim.turnRunId,
						queue_job_id: claim.queueJobId,
						session_id: claim.sessionId,
						user_id: claim.userId,
						stream_run_id: state.raw.streamRunId,
						client_turn_id: state.raw.clientTurnId,
						execution_generation: event.executionGeneration,
						sequence_index: event.sequenceIndex,
						event_id: event.eventId,
						phase: 'llm',
						event_type: 'workflow_progress',
						durable: true,
						transition_id: '',
						event_payload: {}
					};
		try {
			state.delivery = this.ports.publisher
				.publishCommittedSemantic(claim.turnRunId, receipt)
				.catch(() => undefined);
		} catch (error) {
			// Durable truth is committed; reconciliation converges without Broadcast.
			this.report('publish committed', state, error);
		}
	}

	private async settleDelivery(state: PreparationState): Promise<void> {
		const pending = state.delivery;
		if (!pending) return;
		let timer: NodeJS.Timeout | undefined;
		await Promise.race([
			pending,
			new Promise<void>((resolve) => {
				timer = setTimeout(resolve, this.deliveryWaitMs);
				timer.unref?.();
			})
		]);
		if (timer) clearTimeout(timer);
		state.delivery = null;
	}

	private releasePublisher(state: PreparationState): void {
		if (!state.publisherRegistered) return;
		const turnRunId = state.claim.turnRunId;
		try {
			const snapshot = this.ports.publisher.getSnapshot(turnRunId);
			if (snapshot.pendingEvents > 0 || snapshot.busy) {
				this.ports.publisher.abandonTurn(turnRunId, 'workflow_preparation_cleanup');
			} else {
				this.ports.publisher.unregisterTurn(turnRunId);
			}
		} catch {
			// Already abandoned or unregistered.
		}
		state.publisherRegistered = false;
	}

	/**
	 * One database round trip under the overhead deadline. With `replay`, an
	 * uncertain failure (commit status unknown) is retried once with identical
	 * arguments; every replayed routine here is idempotent by its transition id.
	 */
	private async store<T>(
		state: PreparationState,
		stage: string,
		call: () => Promise<T>,
		options: { replay?: boolean; signal?: AbortSignal } = {}
	): Promise<T> {
		const signal = options.signal ?? state.signal;
		state.trace.dbRoundTrips += 1;
		try {
			return await this.overhead(signal, call);
		} catch (error) {
			if (!options.replay || signal.aborted || !isUncertain(error)) throw error;
			this.report(`${stage} (replaying)`, state, error);
			state.trace.checkpointReplayed = true;
			state.trace.dbRoundTrips += 1;
			return this.overhead(signal, call);
		}
	}

	private overhead<T>(signal: AbortSignal, call: () => PromiseLike<T>): Promise<T> {
		return runWithAbortableDeadline({
			parentSignal: signal,
			timeoutMs: this.overheadTimeoutMs,
			createTimeoutError: () =>
				new AgenticChatWorkflowStoreRpcError(
					'workflow_preparation',
					'',
					`Workflow preparation step exceeded its ${this.overheadTimeoutMs}ms deadline`
				),
			run: () => call()
		});
	}

	/** Terminal control runs even after the job signal aborted. */
	private terminalStep<T>(state: PreparationState, call: () => PromiseLike<T>): Promise<T> {
		state.trace.dbRoundTrips += 1;
		return this.overhead(new AbortController().signal, call);
	}

	private emitTiming(
		state: PreparationState,
		outcome: AgenticChatWorkflowPreparationTimingV1['outcome'],
		failureCode: string | null
	): AgenticChatWorkflowPreparationTimingV1 {
		const trace = state.trace;
		const baseline = state.raw?.timingBaseline ?? null;
		const admittedMs = baseline ? Date.parse(baseline.admittedAt) : Number.NaN;
		const workerStartedMs = baseline ? Date.parse(baseline.workerStartedAt) : Number.NaN;
		const preparationMs = this.mono() - trace.startedAtMono;
		const timing: AgenticChatWorkflowPreparationTimingV1 = {
			event: 'agentic_chat_workflow_preparation_timing',
			turnRunId: state.claim.turnRunId,
			executionGeneration: state.claim.executionGeneration,
			outcome,
			failureCode,
			contextSource: trace.contextSource,
			admittedAt: baseline?.admittedAt ?? null,
			workerStartedAt: baseline?.workerStartedAt ?? null,
			admissionToClaimMs: finiteDiff(workerStartedMs, admittedMs),
			admissionToPreparationStartMs: finiteDiff(trace.startedAtWallMs, admittedMs),
			admissionToProviderReadyMs:
				outcome === 'provider_ready'
					? finiteDiff(trace.startedAtWallMs + preparationMs, admittedMs)
					: null,
			inputLoadMs: round(trace.inputLoadMs),
			progressPublishMs: round(trace.progressPublishMs),
			accessCheckMs: round(trace.accessCheckMs),
			contextLoadMs: round(trace.contextLoadMs),
			checkpointMs: round(trace.checkpointMs),
			preparationMs: round(preparationMs) ?? 0,
			checkpointOutcome: trace.checkpointOutcome,
			checkpointReplayed: trace.checkpointReplayed,
			contextBytes: trace.acceptedBytes ?? trace.built?.payloadBytes ?? null,
			evidenceCount: trace.acceptedEvidence ?? trace.built?.evidenceVersions.length ?? null,
			omittedRecords: trace.built?.coverage.omittedRecords ?? null,
			truncatedStrings: trace.built?.coverage.truncatedStrings ?? null,
			dbRoundTrips: trace.dbRoundTrips
		};
		if (!trace.emitted) {
			trace.emitted = true;
			try {
				(this.ports.onTiming ?? reportWorkflowPreparationTiming)(timing);
			} catch {
				// Observability never changes the turn outcome.
			}
		}
		return timing;
	}

	private report(stage: string, state: PreparationState, error: unknown): void {
		try {
			this.ports.onError?.({ stage, turnRunId: state.claim.turnRunId, error });
		} catch {
			// Reporting never changes the turn outcome.
		}
	}

	private createId(): string {
		return this.ports.createId?.() ?? randomUUID();
	}

	private now(): number {
		return this.ports.now?.() ?? Date.now();
	}

	private mono(): number {
		return this.ports.monotonicNow?.() ?? performance.now();
	}
}

export function reportWorkflowPreparationTiming(
	timing: AgenticChatWorkflowPreparationTimingV1
): void {
	console.info('Agentic Chat workflow preparation timing', JSON.stringify(timing));
}

function isUncertain(error: unknown): boolean {
	return error instanceof AgenticChatWorkflowStoreRpcError && !error.deterministic;
}

function timingOutcome(
	outcome: AgenticChatTurnExecutionOutcomeV1
): AgenticChatWorkflowPreparationTimingV1['outcome'] {
	switch (outcome) {
		case 'failed':
			return 'failed';
		case 'cancelled':
			return 'cancelled';
		case 'requeued':
			return 'requeued';
		case 'stale_generation':
			return 'stale';
		case 'terminal_reconciled':
			return 'terminal_reconciled';
		default:
			return 'recovery_required';
	}
}

function terminalStatus(value: string | null): ChatTurnTerminalStatusV1 | null {
	return value === 'completed' || value === 'failed' || value === 'cancelled' ? value : null;
}

function finiteDiff(later: number, earlier: number): number | null {
	const value = later - earlier;
	return Number.isFinite(value) ? Math.round(value) : null;
}

function round(value: number | null): number | null {
	return value === null ? null : Math.round(value * 10) / 10;
}

function positive(value: number, name: string): number {
	if (!Number.isSafeInteger(value) || value < 1) {
		throw new Error(`${name} must be a positive safe integer`);
	}
	return value;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error ?? 'Unknown error');
}

function canonicalMessage(value: string): string | null {
	const trimmed = value.trim().slice(0, 2_000).trim();
	return trimmed.length > 0 ? trimmed : null;
}
