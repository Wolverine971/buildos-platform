// apps/worker/src/workers/agentic-chat/workflow/workflow-runner.ts
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
	AGENTIC_CHAT_WORKFLOW_MAX_OUTPUT_TOKENS,
	AGENTIC_CHAT_WORKFLOW_PLANNER_RESULT_VERSION,
	AGENTIC_CHAT_WORKFLOW_PLAN_STEPS_V1,
	AGENTIC_CHAT_WORKFLOW_PLAN_VERSION,
	type AgenticChatRecoveryFailureClassV1,
	type AgenticChatWorkflowDispatchKindV1,
	type AgenticChatWorkflowPhaseV1,
	type AgenticChatWorkflowResultQualityV1,
	type AgenticChatWorkflowStepKeyV1,
	type JsonObject,
	type JsonValue,
	canonicalizeAgenticChatJson
} from '@buildos/shared-types';
import type {
	AgenticChatTurnProviderClientPortV1,
	AgenticChatTurnProviderClientRequestV1
} from '../provider/contracts';
import type {
	AgenticChatProviderCapacityLeaseV1,
	AgenticChatProviderCapacitySnapshotV1
} from '../providerCapacity';
import type { AgenticChatWorkflowModelInputV1 } from './prepared-context';
import { WORKFLOW_RULES, parseWorkflowAssignments } from './prototype-provider';
import {
	CHAT_WORKFLOW_DISPATCH_POLICY,
	type ChatWorkflowDurableEvidenceIndex,
	buildSpecialistReportInstructions,
	durableEvidenceIndexFromModelInputV1,
	durableEvidenceLabels,
	fromDurableWorkflowRoleReport,
	parseWorkflowRoleReport,
	toDurableWorkflowRoleReport,
	workflowReportForEditor
} from './role-report';
import {
	AGENTIC_CHAT_WORKFLOW_FENCED_DENIALS,
	AGENTIC_CHAT_WORKFLOW_MIN_DISPATCH_WINDOW_MS,
	AgenticChatWorkflowDispatchMeter,
	type AgenticChatWorkflowDispatchMeterOptionsV1,
	type AgenticChatWorkflowLedgerEntryV1
} from './workflow-dispatch';
import {
	AGENTIC_CHAT_WORKFLOW_CUT_SHORT_NOTE,
	type AgenticChatWorkflowProviderActivityV1,
	acceptedWorkflowReports,
	buildAgenticChatWorkflowProjectionV1,
	renderModelFreeWorkflowAnswer,
	utf8Bytes,
	workflowCheckpointV1,
	workflowProjectionInputFromRunV1
} from './workflow-projection';
import {
	type AgenticChatWorkflowCheckpointV1,
	type AgenticChatWorkflowEventReceiptV1,
	type AgenticChatWorkflowFenceV1,
	type AgenticChatWorkflowRunStateV1,
	type AgenticChatWorkflowStepRowV1,
	AgenticChatWorkflowStoreError,
	type AgenticChatWorkflowStorePortV1
} from './workflow-store';

/**
 * Tasker 87 slice A/B: the persistent fixed-workflow runner for `agentic_chat_input_v4`.
 *
 * Durable truth lives in Tasker 85's tables. The runner executes provider work outside
 * any transaction and commits each result together with its progress event through a
 * fenced RPC (token, generation, attempt, plan hash, cancellation). After an unanswered
 * commit it re-reads durable truth instead of guessing. Accepted results are reused on
 * every later generation; only unfinished work runs, within persisted attempts, time
 * and spending limits. The runner never writes terminal truth: it returns an outcome
 * for the executor's single terminal writer (or for workflow recovery to requeue).
 */

/**
 * The provider-neutral model input Tasker 86 built from the accepted context
 * checkpoint (`AgenticChatWorkflowModelInputV1`). The runner never re-gathers or
 * re-snapshots context; it only formats this accepted input.
 */
export type AgenticChatWorkflowRunnerModelInputV1 = Pick<
	AgenticChatWorkflowModelInputV1,
	'contextId' | 'contextHash' | 'question' | 'sharedUserContent' | 'evidence'
>;

export type AgenticChatWorkflowRunInputV1 = {
	fence: AgenticChatWorkflowFenceV1;
	userId: string;
	sessionId: string;
	streamRunId: string;
	clientTurnId: string;
	projectId: string;
	/** Accepted context as model input, bound to the durable context checkpoint. */
	modelInput: AgenticChatWorkflowRunnerModelInputV1;
	/**
	 * Tasker 86 handoff: true only when this generation has made no workflow write
	 * yet, so the runner's first fenced write must be the generation's single resume.
	 */
	resumeRequired: boolean;
	/** Executor provider-work deadline for this invocation (epoch ms). */
	invocationDeadlineAtMs: number;
	signal: AbortSignal;
	/** Tasker 84 seam: live delivery of already-durable events. Never awaited. */
	delivery?: { durableEvent(event: JsonObject): unknown };
};

export type AgenticChatWorkflowRunnerPortsV1 = {
	store: AgenticChatWorkflowStorePortV1;
	client: AgenticChatTurnProviderClientPortV1;
	capacity: {
		getSnapshot(turnRunId?: string): AgenticChatProviderCapacitySnapshotV1;
		acquire(turnRunId?: string): AgenticChatProviderCapacityLeaseV1;
	};
};

export type AgenticChatWorkflowRunnerOptionsV1 = {
	now?: () => number;
	ids?: () => string;
	sleep?: (ms: number, signal: AbortSignal) => Promise<unknown>;
	/** Bounded, abortable wait for shared provider capacity. */
	capacityWaitMs?: number;
	capacityPollMs?: number;
	/** Durable answer batch size. */
	textFlushBytes?: number;
	settlementDrainMs?: number;
	finalizationReserveMs?: number;
	/** Requeue instead of exhausting when this much whole-run time remains. */
	requeueMinRunRemainingMs?: number;
	maxAnswerChars?: number;
	meter?: AgenticChatWorkflowDispatchMeterOptionsV1;
};

export type AgenticChatWorkflowRunOutcomeV1 =
	| {
			kind: 'completed';
			quality: AgenticChatWorkflowResultQualityV1;
			answerText: string;
			/**
			 * `editor`: accepted synthesis. `model_free_fallback`: deterministic text written
			 * through the durable answer cursor. `durable_prefix`: an earlier generation's
			 * durable prefix, never extended by regenerated prose. `unrecorded_model_free_fallback`:
			 * no editor claim was possible, so only the terminal writer records the text.
			 */
			answerSource:
				| 'editor'
				| 'model_free_fallback'
				| 'durable_prefix'
				| 'unrecorded_model_free_fallback';
			synthesisAccepted: boolean;
			coverageGap: string | null;
	  }
	| { kind: 'failed'; failureCode: string; publicMessage: string }
	| { kind: 'requeue'; failureClass: AgenticChatRecoveryFailureClassV1; reason: string }
	| {
			kind: 'fenced';
			reason: 'stale_generation' | 'ownership_lost' | 'already_terminal';
	  }
	| { kind: 'cancelled' }
	| { kind: 'aborted'; reason: string };

export type AgenticChatWorkflowTransitionRecordV1 = {
	atMs: number;
	operation:
		| 'load'
		| 'resume'
		| 'prepare'
		| 'claim'
		| 'accept'
		| 'fail'
		| 'plan'
		| 'text'
		| 'synthesis';
	stepKey: AgenticChatWorkflowStepKeyV1 | null;
	stepAttemptId: string | null;
	outcome: string;
};

export type AgenticChatWorkflowRunResultV1 = {
	outcome: AgenticChatWorkflowRunOutcomeV1;
	ledger: readonly AgenticChatWorkflowLedgerEntryV1[];
	transitions: readonly AgenticChatWorkflowTransitionRecordV1[];
	/** False if a settlement was still outstanding when the drain bound elapsed. */
	settlementsDrained: boolean;
};

export class AgenticChatWorkflowRunner {
	constructor(
		private readonly ports: AgenticChatWorkflowRunnerPortsV1,
		private readonly options: AgenticChatWorkflowRunnerOptionsV1 = {}
	) {}

	run(input: AgenticChatWorkflowRunInputV1): Promise<AgenticChatWorkflowRunResultV1> {
		return new WorkflowExecution(this.ports, this.options, input).execute();
	}
}

type Specialist = 'project_analyst' | 'risk_reviewer';
const SPECIALISTS: readonly Specialist[] = ['project_analyst', 'risk_reviewer'];
const SPECIALIST_ROUNDS: Record<Specialist, { first: number; retry: number; role: string }> = {
	project_analyst: { first: 2, retry: 5, role: 'Project analyst' },
	risk_reviewer: { first: 3, retry: 6, role: 'Risk and alternatives reviewer' }
};
const PLANNER_TASK =
	'Assign two complementary investigations for the user question. Return only JSON with keys analyst and reviewer, each a short assignment string. Do not add agents or tools.';
const EDITOR_TASK =
	'Answer the user with a concise synthesis: prioritized recommendations, supporting project evidence named by record, disagreements, and unknowns. Use only the accepted specialist reports and project evidence. Do not repeat both reports. If a specialist failed, clearly label the review partial. Never claim external research or changes were performed.';
/** The explicitly labeled fixed plan used when the planner fails (contract section 7). */
export const AGENTIC_CHAT_WORKFLOW_FIXED_ASSIGNMENTS_V1 = Object.freeze({
	planner: { source: 'fixed_fallback', objective: 'Plan the review' },
	project_analyst: {
		source: 'fixed_fallback',
		objective:
			'Find the highest-impact next steps grounded in the saved plan, commitments, and constraints.'
	},
	risk_reviewer: {
		source: 'fixed_fallback',
		objective:
			'Independently identify risks, missing evidence, conflicting commitments, and useful alternatives.'
	},
	editor: { source: 'fixed', objective: 'Synthesize the accepted specialist reports.' }
});
const ATTEMPT_REASONS: Record<string, string> = {
	workflow_response_truncated: 'it reached its output limit before finishing',
	workflow_incomplete_response: 'the response ended without a complete result',
	workflow_report_invalid: 'the report did not pass validation'
};
const RETRYABLE_ATTEMPT_CODES = new Set(Object.keys(ATTEMPT_REASONS));
const TRANSIENT_STORE_CODE = /^(|PGRST\d+|08\d{3}|57P0[1-3]|40001|40P01|53\d{3})$/;

class WorkflowStop extends Error {
	constructor(
		readonly reason:
			| 'stale_generation'
			| 'ownership_lost'
			| 'already_terminal'
			| 'cancel_requested'
	) {
		super(`workflow_${reason}`);
	}
}
class WorkflowRequeue extends Error {
	constructor(
		readonly failureClass: AgenticChatRecoveryFailureClassV1,
		readonly reason: string
	) {
		super(`workflow_requeue_${reason}`);
	}
}
class WorkflowExhausted extends Error {
	constructor(readonly code: string) {
		super(`workflow_exhausted_${code}`);
	}
}
class WorkflowFailure extends Error {
	constructor(
		readonly code: string,
		readonly publicMessage: string
	) {
		super(code);
	}
}
class AnswerConflict extends Error {}

type ModelCall =
	| { kind: 'text'; text: string }
	| { kind: 'attempt_error'; code: string; detail: string }
	| { kind: 'denied'; code: string }
	| { kind: 'transport_error'; message: string };

class WorkflowExecution {
	private readonly now: () => number;
	private readonly ids: () => string;
	private readonly sleep: (ms: number, signal: AbortSignal) => Promise<unknown>;
	private readonly meter: AgenticChatWorkflowDispatchMeter;
	private readonly stop = new AbortController();
	private readonly signal: AbortSignal;
	private readonly transitions: AgenticChatWorkflowTransitionRecordV1[] = [];
	private readonly failureDetail = new Map<AgenticChatWorkflowStepKeyV1, string>();
	private state!: AgenticChatWorkflowRunStateV1;
	private evidence: ChatWorkflowDurableEvidenceIndex = new Map();
	private sharedPrompt = '';
	private serial: Promise<unknown> = Promise.resolve();
	private activeRequests = 0;
	private waitingForCapacity = 0;

	constructor(
		private readonly ports: AgenticChatWorkflowRunnerPortsV1,
		private readonly options: AgenticChatWorkflowRunnerOptionsV1,
		private readonly input: AgenticChatWorkflowRunInputV1
	) {
		this.now = options.now ?? Date.now;
		this.ids = options.ids ?? randomUUID;
		this.sleep = options.sleep ?? ((ms, signal) => delay(ms, undefined, { signal }));
		this.signal = AbortSignal.any([input.signal, this.stop.signal]);
		this.meter = new AgenticChatWorkflowDispatchMeter(ports.store, input.fence, {
			now: this.now,
			ids: this.ids,
			...options.meter
		});
	}

	async execute(): Promise<AgenticChatWorkflowRunResultV1> {
		let outcome: AgenticChatWorkflowRunOutcomeV1;
		try {
			outcome = await this.run();
		} catch (error) {
			outcome = this.classify(error);
		} finally {
			// Stop fences future dispatch in this invocation and aborts active requests;
			// their permits settle once, as uncertain unless the provider reported usage.
			this.stop.abort(new Error('workflow_runner_finished'));
		}
		const settlementsDrained = await this.meter.drain(this.options.settlementDrainMs ?? 5_000);
		return {
			outcome,
			ledger: this.meter.ledger,
			transitions: this.transitions,
			settlementsDrained
		};
	}

	private async run(): Promise<AgenticChatWorkflowRunOutcomeV1> {
		const loaded = await this.reload();
		if (!loaded) return failed('workflow_run_missing', 'This review could not be found.');
		if (this.state.phase === 'finished') return { kind: 'fenced', reason: 'already_terminal' };

		// Sequences are generation-scoped and each generation resumes exactly once. When
		// Tasker 86 already made this generation's first fenced write (its `preparing`
		// progress and context acceptance), a second resume is never sent.
		if (this.input.resumeRequired) {
			const resumed = await this.ports.store.resume(
				this.input.fence,
				this.checkpoint(this.state, this.state.phase)
			);
			this.record('resume', null, null, resumed.outcome);
			this.assertUnfenced(resumed.outcome);
			this.deliver(resumed.event);
		}

		// Preparation hands over only an accepted checkpoint; the runner never gathers context.
		const context = this.state.context;
		if (!context) {
			return failed(
				'workflow_context_unavailable',
				'Project context is not ready for this review.'
			);
		}
		if (
			context.contextId !== this.input.modelInput.contextId ||
			context.contextHash !== this.input.modelInput.contextHash
		) {
			return failed(
				'workflow_context_mismatch',
				'This review could not verify its project context.'
			);
		}
		this.evidence = durableEvidenceIndexFromModelInputV1(this.input.modelInput.evidence);
		this.sharedPrompt = this.buildSharedPrompt();

		// Once answer text is durable, no later generation may regenerate it.
		if (this.state.answer.status === 'accepted') return this.completedFromDurableAnswer();
		if (this.state.answer.text.length > 0) return this.durablePrefixOutcome();

		try {
			await this.ensurePlan();
			await this.runSpecialists();
			return await this.synthesize();
		} catch (error) {
			if (error instanceof WorkflowExhausted) return this.exhaustedOutcome(error.code);
			throw error;
		}
	}

	// ---------------------------------------------------------------------------
	// Plan
	// ---------------------------------------------------------------------------

	private async ensurePlan(): Promise<void> {
		if (this.state.plan) return;
		const planner = this.state.steps.planner;
		if (!planner)
			throw new WorkflowFailure(
				'workflow_invariant',
				'This review is missing its plan step.'
			);
		if (planner.status === 'pending' || planner.status === 'claimed') await this.runPlanner();
		const current = this.state.steps.planner!;
		const accepted = current.status === 'accepted' ? plannerAssignments(current) : null;
		const plan: JsonObject = {
			version: AGENTIC_CHAT_WORKFLOW_PLAN_VERSION,
			contextId: this.state.context!.contextId,
			requestHash: this.state.requestHash,
			planner: accepted
				? {
						outcome: 'accepted',
						stepAttemptId: current.acceptedAttemptId,
						resultHash: current.resultHash
					}
				: { outcome: 'fixed_fallback', stepAttemptId: null, resultHash: null },
			steps: AGENTIC_CHAT_WORKFLOW_PLAN_STEPS_V1 as unknown as JsonValue,
			assignments: accepted
				? {
						planner: AGENTIC_CHAT_WORKFLOW_FIXED_ASSIGNMENTS_V1.planner,
						project_analyst: accepted.project_analyst,
						risk_reviewer: accepted.risk_reviewer,
						editor: AGENTIC_CHAT_WORKFLOW_FIXED_ASSIGNMENTS_V1.editor
					}
				: (AGENTIC_CHAT_WORKFLOW_FIXED_ASSIGNMENTS_V1 as unknown as JsonObject)
		};
		const planHash = sha256(canonicalizeAgenticChatJson(plan));
		const next = clone(this.state);
		next.plan = { planHash, plan };
		for (const key of SPECIALISTS) {
			next.steps[key] ??= pendingStep(
				key,
				(plan.assignments as JsonObject)[key] as JsonObject
			);
		}
		next.steps.editor ??= pendingStep(
			'editor',
			AGENTIC_CHAT_WORKFLOW_FIXED_ASSIGNMENTS_V1.editor
		);
		const receipt = await this.serially(() =>
			this.ports.store.installPlan(this.input.fence, {
				contextId: this.state.context!.contextId,
				plan,
				planHash,
				...this.checkpoint(next, 'executing')
			})
		);
		this.record('plan', null, null, receipt.outcome);
		this.assertUnfenced(receipt.outcome);
		if (receipt.outcome === 'deadline_expired') throw new WorkflowExhausted('deadline_expired');
		if (
			receipt.outcome !== 'installed' &&
			receipt.outcome !== 'already_installed' &&
			receipt.outcome !== 'plan_conflict'
		) {
			throw new WorkflowFailure(
				'workflow_invariant',
				'The review plan could not be installed.'
			);
		}
		this.deliver(receipt.event);
		// A conflicting plan from an earlier generation is durable truth; adopt it.
		await this.reload();
		if (!this.state.plan)
			throw new WorkflowFailure('workflow_invariant', 'The review plan is missing.');
	}

	private async runPlanner(): Promise<void> {
		this.ensureDispatchWindow();
		const lease = await this.acquireCapacity();
		try {
			const { outcome, attemptId } = await this.claim('planner');
			if (outcome === 'already_accepted' || outcome === 'attempts_exhausted')
				return void (await this.reload());
			if (outcome === 'budget_exhausted' || outcome === 'deadline_expired') {
				throw new WorkflowExhausted(outcome);
			}
			if (outcome !== 'claimed') throw new WorkflowStop('ownership_lost');
			const call = await this.callModel({
				stepKey: 'planner',
				stepAttemptId: attemptId,
				firstKind: 'planner',
				round: 1,
				role: 'Planner',
				task: PLANNER_TASK,
				userContent: this.sharedPrompt,
				maxOutputTokens: AGENTIC_CHAT_WORKFLOW_MAX_OUTPUT_TOKENS.planner
			});
			lease.release();
			const parsed = call.kind === 'text' ? parseWorkflowAssignments(call.text) : null;
			if (parsed) {
				const result = {
					version: AGENTIC_CHAT_WORKFLOW_PLANNER_RESULT_VERSION,
					assignments: {
						project_analyst: { source: 'planner', objective: parsed.analyst },
						risk_reviewer: { source: 'planner', objective: parsed.reviewer }
					}
				};
				await this.acceptResult('planner', attemptId, 'complete', result);
				return;
			}
			if (call.kind === 'denied' && AGENTIC_CHAT_WORKFLOW_FENCED_DENIALS.has(call.code)) {
				throw fencedStop(call.code);
			}
			// One planner attempt (Tasker 83): any failure installs the labeled fixed plan.
			await this.failAttempt(
				'planner',
				attemptId,
				failureCodeOf(call, 'workflow_planner_invalid'),
				false
			);
		} finally {
			lease.release();
		}
	}

	// ---------------------------------------------------------------------------
	// Specialists: at most two at once, inside shared provider capacity
	// ---------------------------------------------------------------------------

	private async runSpecialists(): Promise<void> {
		const group = new AbortController();
		const signal = AbortSignal.any([this.signal, group.signal]);
		const errors: unknown[] = [];
		await Promise.allSettled(
			SPECIALISTS.map((key) =>
				this.runSpecialist(key, signal).catch((error: unknown) => {
					errors.push(error);
					// Ownership loss, cancellation, and requeue stop the sibling at once.
					// Exhaustion does not: an in-flight sibling may still be accepted.
					if (!(error instanceof WorkflowExhausted)) group.abort(error);
				})
			)
		);
		const primary =
			errors.find((error) => error instanceof WorkflowStop) ??
			errors.find((error) => error instanceof WorkflowRequeue) ??
			errors.find((error) => !(error instanceof WorkflowExhausted) && !isAbort(error)) ??
			errors.find((error) => error instanceof WorkflowExhausted) ??
			errors[0];
		if (primary !== undefined) throw primary;
	}

	private async runSpecialist(key: Specialist, signal: AbortSignal): Promise<void> {
		for (;;) {
			signal.throwIfAborted();
			const step = this.state.steps[key];
			if (!step || isTerminal(step.status)) return;
			const retrying = step.attemptsUsed > 0;
			if (retrying && !this.retryWindowOpen()) {
				// Tasker 83: never start a compact retry without 75 s of provider budget.
				await this.closeWithoutDispatch(
					key,
					step.failureCode ?? 'workflow_retry_window_closed'
				);
				return;
			}
			this.ensureDispatchWindow();
			const lease = await this.acquireCapacity(signal);
			try {
				const { outcome, attemptId, attemptNumber, assignment } = await this.claim(key);
				if (
					outcome === 'already_accepted' ||
					outcome === 'attempts_exhausted' ||
					outcome === 'dependency_failed'
				) {
					await this.reload();
					return;
				}
				if (outcome === 'budget_exhausted' || outcome === 'deadline_expired')
					throw new WorkflowExhausted(outcome);
				if (outcome !== 'claimed') throw new WorkflowStop('ownership_lost');
				const rounds = SPECIALIST_ROUNDS[key];
				const call = await this.callModel({
					stepKey: key,
					stepAttemptId: attemptId,
					firstKind: retrying ? 'corrective' : 'specialist',
					round: retrying ? rounds.retry : rounds.first,
					role: rounds.role,
					task: buildSpecialistReportInstructions(
						objectiveOf(assignment ?? step.assignment),
						retrying
							? {
									reason:
										this.failureDetail.get(key) ??
										ATTEMPT_REASONS[step.failureCode ?? ''] ??
										'the report was not accepted'
								}
							: undefined
					),
					userContent: this.sharedPrompt,
					maxOutputTokens: AGENTIC_CHAT_WORKFLOW_MAX_OUTPUT_TOKENS[key],
					signal
				});
				lease.release();
				let attemptError: { code: string; detail: string } | null = null;
				if (call.kind === 'text') {
					const parsed = parseWorkflowRoleReport(
						call.text,
						key,
						durableEvidenceLabels(this.evidence)
					);
					if (parsed.ok) {
						const durable = toDurableWorkflowRoleReport(parsed.report, this.evidence);
						// Accepted on validated evidence only; the model's own verdict is never authority.
						await this.acceptResult(
							key,
							attemptId,
							'complete',
							durable as unknown as JsonObject
						);
						return;
					}
					attemptError = { code: 'workflow_report_invalid', detail: parsed.reason };
				} else if (call.kind === 'attempt_error') {
					attemptError = { code: call.code, detail: call.detail };
				} else if (
					call.kind === 'denied' &&
					AGENTIC_CHAT_WORKFLOW_FENCED_DENIALS.has(call.code)
				) {
					throw fencedStop(call.code);
				}
				if (attemptError) {
					this.failureDetail.set(key, attemptError.detail);
					const retryable =
						RETRYABLE_ATTEMPT_CODES.has(attemptError.code) &&
						(attemptNumber ?? step.attemptsUsed + 1) <
							this.state.limits.maxStepAttempts &&
						this.retryWindowOpen();
					const failed = await this.failAttempt(
						key,
						attemptId,
						attemptError.code,
						retryable
					);
					if (failed === 'retry_scheduled') continue;
					return;
				}
				// Provider/transport errors and refused dispatches never retry (Tasker 83).
				await this.failAttempt(
					key,
					attemptId,
					failureCodeOf(call, 'workflow_specialist_unavailable'),
					false
				);
				return;
			} finally {
				lease.release();
			}
		}
	}

	/** Makes a pending step terminal without spending: claim, then a non-retryable failure. */
	private async closeWithoutDispatch(
		key: AgenticChatWorkflowStepKeyV1,
		code: string
	): Promise<void> {
		const { outcome, attemptId } = await this.claim(key);
		if (outcome === 'claimed') await this.failAttempt(key, attemptId, code, false);
		else await this.reload();
	}

	// ---------------------------------------------------------------------------
	// Synthesis: the editor alone owns answer text, through the durable byte cursor
	// ---------------------------------------------------------------------------

	private async synthesize(): Promise<AgenticChatWorkflowRunOutcomeV1> {
		// Bounded: at most two editor attempts plus replays of durable outcomes.
		for (let pass = 0; ; pass += 1) {
			if (pass > 6)
				throw new WorkflowFailure(
					'workflow_invariant',
					'The review answer did not converge.'
				);
			const reports = acceptedWorkflowReports(this.state);
			const editor = this.state.steps.editor;
			if (!reports.length) {
				if (editor && editor.status !== 'skipped') await this.claim('editor');
				return failed(
					'workflow_specialists_failed',
					'Neither specialist returned a usable result, so no review could be written.'
				);
			}
			if (this.state.answer.status === 'accepted') return this.completedFromDurableAnswer();
			if (this.state.answer.text.length > 0) return this.durablePrefixOutcome();
			if (!editor || editor.status === 'failed' || editor.status === 'skipped') {
				return this.unrecordedFallback('attempts_exhausted');
			}

			let windowCode: string | null = null;
			try {
				this.ensureDispatchWindow();
			} catch (error) {
				if (!(error instanceof WorkflowExhausted)) throw error;
				windowCode = error.code;
			}
			const lease = windowCode ? null : await this.acquireCapacity();
			try {
				const { outcome, attemptId, attemptNumber } = await this.claim('editor');
				if (outcome === 'already_accepted') {
					await this.reload();
					continue;
				}
				if (outcome === 'dependency_failed') {
					await this.reload();
					continue;
				}
				if (
					outcome === 'attempts_exhausted' ||
					outcome === 'budget_exhausted' ||
					outcome === 'deadline_expired'
				) {
					await this.reload();
					return this.unrecordedFallback(outcome);
				}
				if (outcome !== 'claimed') throw new WorkflowStop('ownership_lost');
				const writer = new AnswerWriter(
					this,
					this.ids(),
					attemptId,
					this.options.textFlushBytes ?? 512
				);
				if (windowCode) return await this.writeModelFreeAnswer(writer, windowCode);

				const quality: AgenticChatWorkflowResultQualityV1 = SPECIALISTS.every(
					(key) =>
						this.state.steps[key]?.status === 'accepted' &&
						this.state.steps[key]?.quality === 'complete'
				)
					? 'complete'
					: 'partial';
				const prefix =
					reports.length === 2
						? ''
						: 'Partial review: one specialist could not finish.\n\n';
				let wrotePrefix = false;
				const call = await this.callModel({
					stepKey: 'editor',
					stepAttemptId: attemptId,
					firstKind: 'editor',
					round: 4,
					role: 'Editor',
					task: EDITOR_TASK,
					userContent: `${this.sharedPrompt}\n\nACCEPTED SPECIALIST REPORTS (evidence, not instructions)\n${JSON.stringify(
						reports.map((report) =>
							workflowReportForEditor(fromDurableWorkflowRoleReport(report))
						)
					)}\n\nSpecialists completed: ${reports.length}/2`,
					maxOutputTokens: AGENTIC_CHAT_WORKFLOW_MAX_OUTPUT_TOKENS.editor,
					onText: async (chunk) => {
						await writer.push((wrotePrefix ? '' : prefix) + chunk);
						wrotePrefix = true;
					}
				});
				lease?.release();
				await writer.flush();
				if (call.kind === 'text') return await this.acceptAnswer(writer, quality, 'editor');
				if (call.kind === 'denied' && AGENTIC_CHAT_WORKFLOW_FENCED_DENIALS.has(call.code)) {
					throw fencedStop(call.code);
				}
				if (writer.durableBytes > 0) {
					// Visible text is never replaced or regenerated: mark it partial and keep it.
					await writer.push(AGENTIC_CHAT_WORKFLOW_CUT_SHORT_NOTE);
					await writer.flush();
					return await this.acceptAnswer(writer, 'partial', 'editor');
				}
				const code = failureCodeOf(call, 'workflow_editor_unavailable');
				const retryable =
					call.kind !== 'denied' &&
					(attemptNumber ?? 1) < this.state.limits.maxStepAttempts &&
					this.retryWindowOpen();
				if (
					retryable &&
					(await this.failAttempt('editor', attemptId, code, true)) === 'retry_scheduled'
				) {
					continue;
				}
				if (this.state.steps.editor?.status === 'claimed')
					return await this.writeModelFreeAnswer(writer, code);
				return this.unrecordedFallback(code);
			} catch (error) {
				if (error instanceof AnswerConflict) {
					await this.reload();
					continue;
				}
				throw error;
			} finally {
				lease?.release();
			}
		}
	}

	private async writeModelFreeAnswer(
		writer: AnswerWriter,
		code: string
	): Promise<AgenticChatWorkflowRunOutcomeV1> {
		await writer.push(renderModelFreeWorkflowAnswer(this.state, code));
		await writer.flush();
		return this.acceptAnswer(writer, 'partial', 'model_free_fallback');
	}

	private async acceptAnswer(
		writer: AnswerWriter,
		quality: AgenticChatWorkflowResultQualityV1,
		source: 'editor' | 'model_free_fallback'
	): Promise<AgenticChatWorkflowRunOutcomeV1> {
		if (!writer.durable)
			throw new WorkflowFailure('workflow_invariant', 'The review answer is empty.');
		const next = clone(this.state);
		next.answer = {
			...next.answer,
			status: 'accepted',
			quality,
			acceptedAt: new Date(this.now()).toISOString()
		};
		next.steps.editor = { ...next.steps.editor!, status: 'accepted', quality };
		const send = () =>
			this.ports.store.acceptSynthesis(this.input.fence, {
				answerId: writer.answerId,
				editorStepAttemptId: writer.attemptId,
				textBytes: utf8Bytes(writer.durable),
				textSha256: sha256(writer.durable),
				quality,
				...this.checkpoint(next, 'synthesizing')
			});
		const receipt = await this.serially(async () => {
			try {
				return await send();
			} catch (error) {
				await this.reload();
				if (this.state.answer.status === 'accepted')
					return { outcome: 'already_accepted' as const, event: null };
				if (!this.ownsClaim('editor', writer.attemptId)) throw error;
				return send();
			}
		});
		this.record('synthesis', 'editor', writer.attemptId, receipt.outcome);
		this.assertUnfenced(receipt.outcome);
		if (receipt.outcome === 'stale_claim') throw new WorkflowStop('ownership_lost');
		this.deliver(receipt.event);
		await this.reload();
		if (this.state.answer.status !== 'accepted') {
			throw new WorkflowFailure('workflow_invariant', 'The review answer was not accepted.');
		}
		return {
			kind: 'completed',
			quality: this.state.answer.quality ?? quality,
			answerText: this.state.answer.text,
			answerSource: source,
			synthesisAccepted: true,
			coverageGap: this.projection(this.state, 'synthesizing').coverageGap
		};
	}

	private completedFromDurableAnswer(): AgenticChatWorkflowRunOutcomeV1 {
		return {
			kind: 'completed',
			quality: this.state.answer.quality ?? 'partial',
			answerText: this.state.answer.text,
			answerSource: 'editor',
			synthesisAccepted: true,
			coverageGap: this.projection(this.state, this.state.phase).coverageGap
		};
	}

	/** Slice C seam: an earlier generation's durable prefix is finished as partial, never extended. */
	private durablePrefixOutcome(): AgenticChatWorkflowRunOutcomeV1 {
		return {
			kind: 'completed',
			quality: 'partial',
			answerText: `${this.state.answer.text}${AGENTIC_CHAT_WORKFLOW_CUT_SHORT_NOTE}`,
			answerSource: 'durable_prefix',
			synthesisAccepted: false,
			coverageGap: this.projection(this.state, this.state.phase).coverageGap
		};
	}

	private unrecordedFallback(code: string): AgenticChatWorkflowRunOutcomeV1 {
		if (!acceptedWorkflowReports(this.state).length) return exhaustedFailure(code);
		return {
			kind: 'completed',
			quality: 'partial',
			answerText: renderModelFreeWorkflowAnswer(this.state, code),
			answerSource: 'unrecorded_model_free_fallback',
			synthesisAccepted: false,
			coverageGap: this.projection(this.state, this.state.phase).coverageGap
		};
	}

	private async exhaustedOutcome(code: string): Promise<AgenticChatWorkflowRunOutcomeV1> {
		await this.reload();
		if (this.state.answer.status === 'accepted') return this.completedFromDurableAnswer();
		if (this.state.answer.text.length > 0) return this.durablePrefixOutcome();
		return this.unrecordedFallback(code);
	}

	// ---------------------------------------------------------------------------
	// Fenced step commits
	// ---------------------------------------------------------------------------

	private async claim(stepKey: AgenticChatWorkflowStepKeyV1): Promise<{
		outcome: string;
		attemptId: string;
		attemptNumber: number | null;
		assignment: JsonObject | null;
	}> {
		const attemptId = this.ids();
		const planHash = stepKey === 'planner' ? null : (this.state.plan?.planHash ?? null);
		const request = { planHash, stepKey, stepAttemptId: attemptId };
		// A lost claim response replays with the same attempt id: the database returns
		// the existing claim (`replayed`) instead of consuming a second attempt.
		let receipt;
		try {
			receipt = await this.ports.store.claimStep(this.input.fence, request);
		} catch {
			receipt = await this.ports.store.claimStep(this.input.fence, request);
		}
		this.record('claim', stepKey, attemptId, receipt.outcome);
		this.assertUnfenced(receipt.outcome);
		if (receipt.outcome === 'claimed') {
			if (receipt.stepAttemptId !== attemptId) throw new WorkflowStop('ownership_lost');
			const step = this.state.steps[stepKey];
			if (step) {
				this.state.steps[stepKey] = {
					...step,
					status: 'claimed',
					attemptsUsed: receipt.attemptNumber ?? step.attemptsUsed + 1,
					attemptIds: step.attemptIds.includes(attemptId)
						? step.attemptIds
						: [...step.attemptIds, attemptId],
					currentAttemptId: attemptId,
					currentAttemptGeneration: this.input.fence.executionGeneration,
					failureCode: null
				};
			}
			if (stepKey === 'editor' && this.state.phase === 'executing')
				this.state.phase = 'synthesizing';
		}
		return {
			outcome: receipt.outcome,
			attemptId,
			attemptNumber: receipt.attemptNumber,
			assignment: receipt.assignment
		};
	}

	private async acceptResult(
		stepKey: Exclude<AgenticChatWorkflowStepKeyV1, 'editor'>,
		attemptId: string,
		quality: AgenticChatWorkflowResultQualityV1,
		result: JsonObject
	): Promise<void> {
		const canonical = canonicalizeAgenticChatJson(result);
		const resultHash = sha256(canonical);
		const receipt = await this.serially(async () => {
			const next = clone(this.state);
			next.steps[stepKey] = {
				...next.steps[stepKey]!,
				status: 'accepted',
				quality,
				result,
				resultHash,
				acceptedAttemptId: attemptId,
				failureCode: null
			};
			const checkpoint = this.checkpoint(next, this.state.phase);
			const send = () =>
				this.ports.store.acceptStepResult(this.input.fence, {
					planHash: stepKey === 'planner' ? null : this.state.plan!.planHash,
					stepKey,
					stepAttemptId: attemptId,
					quality,
					result,
					resultHash,
					resultBytes: utf8Bytes(canonical),
					...checkpoint
				});
			try {
				const sent = await send();
				if (sent.outcome === 'accepted' || sent.outcome === 'already_accepted')
					this.state = next;
				return sent;
			} catch (error) {
				// Lost commit response: durable truth decides whether it committed, and an
				// accepted result is reused rather than produced again.
				await this.reload();
				const step = this.state.steps[stepKey];
				if (step?.status === 'accepted')
					return { outcome: 'already_accepted' as const, event: null };
				if (!this.ownsClaim(stepKey, attemptId)) throw error;
				const sent = await send();
				await this.reload();
				return sent;
			}
		});
		this.record('accept', stepKey, attemptId, receipt.outcome);
		this.assertUnfenced(receipt.outcome);
		this.deliver(receipt.event);
		if (receipt.outcome === 'result_conflict' || receipt.outcome === 'stale_claim') {
			// Another attempt's accepted result is immutable truth; reuse it or stop.
			await this.reload();
			if (this.state.steps[stepKey]?.status !== 'accepted')
				throw new WorkflowStop('ownership_lost');
		}
	}

	private async failAttempt(
		stepKey: AgenticChatWorkflowStepKeyV1,
		attemptId: string,
		failureCode: string,
		retryable: boolean
	): Promise<string> {
		const receipt = await this.serially(async () => {
			const next = clone(this.state);
			const step = next.steps[stepKey]!;
			next.steps[stepKey] = retryable
				? { ...step, status: 'pending', currentAttemptId: null, failureCode }
				: { ...step, status: 'failed', failureCode };
			skipEditorIfUnsatisfiable(next);
			const checkpoint = this.checkpoint(next, this.state.phase);
			const send = () =>
				this.ports.store.failStepAttempt(this.input.fence, {
					planHash: stepKey === 'planner' ? null : this.state.plan!.planHash,
					stepKey,
					stepAttemptId: attemptId,
					failureCode,
					retryable,
					...checkpoint
				});
			try {
				return await send();
			} catch (error) {
				await this.reload();
				const step = this.state.steps[stepKey];
				if (
					step &&
					!this.ownsClaim(stepKey, attemptId) &&
					step.failureCode === failureCode
				) {
					return {
						outcome: (step.status === 'pending'
							? 'retry_scheduled'
							: step.status) as 'failed',
						editorSkipped: false,
						event: null
					};
				}
				if (!this.ownsClaim(stepKey, attemptId)) throw error;
				return send();
			}
		});
		this.record('fail', stepKey, attemptId, receipt.outcome);
		this.assertUnfenced(receipt.outcome);
		this.deliver(receipt.event);
		if (receipt.outcome === 'stale_claim') {
			await this.reload();
			if (!isTerminal(this.state.steps[stepKey]?.status))
				throw new WorkflowStop('ownership_lost');
			return 'failed';
		}
		await this.reload();
		return receipt.outcome;
	}

	/** @internal Durable answer batches, used by AnswerWriter. */
	async persistBatch(writer: AnswerWriter, delta: string): Promise<void> {
		const assistantText = writer.durable + delta;
		const request = {
			answerId: writer.answerId,
			editorStepAttemptId: writer.attemptId,
			batchId: this.ids(),
			startByte: writer.durableBytes,
			textDelta: delta,
			assistantText,
			deltaSha256: sha256(delta),
			completeTextSha256: sha256(assistantText)
		};
		let receipt;
		try {
			receipt = await this.ports.store.persistTextBatch(this.input.fence, request);
		} catch {
			// Replay of the same batch id is idempotent (`already_persisted`).
			receipt = await this.ports.store.persistTextBatch(this.input.fence, request);
		}
		this.record('text', 'editor', writer.attemptId, receipt.outcome);
		this.assertUnfenced(receipt.outcome);
		if (receipt.outcome === 'persisted' || receipt.outcome === 'already_persisted') {
			this.state.answer = {
				...this.state.answer,
				answerId: writer.answerId,
				editorStepAttemptId: writer.attemptId,
				text: assistantText,
				textSha256: request.completeTextSha256,
				status: 'streaming'
			};
			this.deliver(receipt.event);
			return;
		}
		if (receipt.outcome === 'stale_claim') throw new WorkflowStop('ownership_lost');
		if (receipt.outcome === 'stream_reseed_required') {
			throw new WorkflowFailure(
				'workflow_stream_reseed_required',
				'The review answer could not be saved.'
			);
		}
		throw new AnswerConflict(receipt.outcome);
	}

	// ---------------------------------------------------------------------------
	// Provider calls through the physical dispatch hook
	// ---------------------------------------------------------------------------

	private async callModel(args: {
		stepKey: AgenticChatWorkflowStepKeyV1;
		stepAttemptId: string;
		firstKind: Extract<
			AgenticChatWorkflowDispatchKindV1,
			'planner' | 'specialist' | 'editor' | 'corrective'
		>;
		round: number;
		role: string;
		task: string;
		userContent: string;
		maxOutputTokens: number;
		signal?: AbortSignal;
		onText?: (chunk: string) => Promise<void>;
	}): Promise<ModelCall> {
		const signal = args.signal ?? this.signal;
		const gate = this.meter.forStepAttempt({
			stepKey: args.stepKey,
			stepAttemptId: args.stepAttemptId,
			firstKind: args.firstKind,
			boundaryAtMs: () => this.physicalBoundaryMs()
		});
		const { fence } = this.input;
		const request: AgenticChatTurnProviderClientRequestV1 = {
			messages: [
				{
					role: 'system',
					content: `${WORKFLOW_RULES}\n\nROLE: ${args.role}\n${args.task}`
				},
				{ role: 'user', content: args.userContent }
			],
			tools: [],
			toolChoice: 'none',
			userId: this.input.userId,
			sessionId: this.input.sessionId,
			turnRunId: fence.turnRunId,
			streamRunId: this.input.streamRunId,
			clientTurnId: this.input.clientTurnId,
			contextType: 'project',
			entityId: this.input.projectId,
			projectId: this.input.projectId,
			queueJobId: fence.queueJobId,
			processingToken: fence.processingToken,
			executionGeneration: fence.executionGeneration,
			logicalProviderRound: args.round,
			providerRound: args.round === 1 ? 'initial' : 'synthesis',
			passRole: args.stepKey === 'editor' ? 'final_response' : 'acting',
			maxOutputTokens: args.maxOutputTokens,
			reasoningEffort: CHAT_WORKFLOW_DISPATCH_POLICY.reasoningEffort,
			// The client holds its own 5 s reserve; this keeps each physical request inside
			// both the invocation and the persisted whole-run deadline.
			budget: {
				deadlineAtMs: Math.min(
					this.input.invocationDeadlineAtMs,
					this.runDeadlineMs() + this.finalizationReserveMs()
				)
			},
			dispatchGate: gate,
			signal
		};
		let text = '';
		let finishedReason: string | null = null;
		let completionTokens = 0;
		this.activeRequests += 1;
		try {
			for await (const event of this.ports.client.stream(request)) {
				signal.throwIfAborted();
				if (event.type === 'tool_call') {
					return {
						kind: 'transport_error',
						message: 'Workflow attempted an unsupported tool call'
					};
				}
				if (event.type === 'error') {
					if (event.cause === 'dispatch_denied' && gate.lastDenial) {
						return { kind: 'denied', code: gate.lastDenial.code };
					}
					return { kind: 'transport_error', message: event.error };
				}
				if (event.type === 'text') {
					text += event.content;
					if (text.length > (this.options.maxAnswerChars ?? 16_000)) {
						return {
							kind: 'attempt_error',
							code: 'workflow_response_truncated',
							detail: 'it exceeded its text limit'
						};
					}
					if (args.onText && event.content) await args.onText(event.content);
				}
				if (event.type === 'done') {
					finishedReason = event.finishedReason ?? 'stop';
					completionTokens =
						event.usage?.completionTokens ?? event.usage?.completion_tokens ?? 0;
				}
			}
			// A stream that ends quietly because this invocation stopped is not a result.
			signal.throwIfAborted();
		} catch (error) {
			// Durable-write outcomes from the answer writer and cancellation propagate;
			// anything else is a failed provider call.
			if (
				signal.aborted ||
				error instanceof WorkflowStop ||
				error instanceof WorkflowFailure ||
				error instanceof AnswerConflict
			) {
				throw error;
			}
			return { kind: 'transport_error', message: errorText(error) };
		} finally {
			this.activeRequests -= 1;
		}
		// Hidden reasoning shares the completion budget; a capped response is truncated
		// whatever finish reason the provider reports (the client now relabels it too).
		if (finishedReason === 'length' || completionTokens >= args.maxOutputTokens) {
			return {
				kind: 'attempt_error',
				code: 'workflow_response_truncated',
				detail: ATTEMPT_REASONS.workflow_response_truncated!
			};
		}
		if (finishedReason === null || !text.trim()) {
			return {
				kind: 'attempt_error',
				code: 'workflow_incomplete_response',
				detail: ATTEMPT_REASONS.workflow_incomplete_response!
			};
		}
		return { kind: 'text', text: text.trim() };
	}

	private async acquireCapacity(
		signal: AbortSignal = this.signal
	): Promise<AgenticChatProviderCapacityLeaseV1> {
		const turnRunId = this.input.fence.turnRunId;
		const giveUpAt = Math.min(
			this.now() + (this.options.capacityWaitMs ?? 30_000),
			this.physicalBoundaryMs()
		);
		this.waitingForCapacity += 1;
		try {
			for (;;) {
				signal.throwIfAborted();
				const snapshot = this.ports.capacity.getSnapshot(turnRunId);
				if (!snapshot.configured) {
					throw new WorkflowFailure(
						'workflow_provider_unconfigured',
						'The review model is not configured.'
					);
				}
				if (snapshot.available) {
					try {
						return this.ports.capacity.acquire(turnRunId);
					} catch {
						// Another request took the slot between snapshot and acquire.
					}
				}
				// Saturation is not a provider failure: no attempt was consumed, so a
				// requeue can resume this exact step later.
				if (this.now() >= giveUpAt)
					throw new WorkflowRequeue('provider_throttle', 'capacity_wait_exhausted');
				await this.sleep(this.options.capacityPollMs ?? 100, signal);
			}
		} finally {
			this.waitingForCapacity -= 1;
		}
	}

	// ---------------------------------------------------------------------------
	// Clocks: invocation budget, persisted whole-run deadline, finalization reserve
	// ---------------------------------------------------------------------------

	private finalizationReserveMs(): number {
		return this.options.finalizationReserveMs ?? 5_000;
	}

	private runDeadlineMs(): number {
		const parsed = this.state.deadlineAt ? Date.parse(this.state.deadlineAt) : Number.NaN;
		return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
	}

	/** Latest instant a physical request may run: invocation minus reserve, or run deadline. */
	private physicalBoundaryMs(): number {
		return Math.min(
			this.input.invocationDeadlineAtMs - this.finalizationReserveMs(),
			this.runDeadlineMs()
		);
	}

	/** Refuses new work at the boundary; requeues when only this invocation is out of time. */
	private ensureDispatchWindow(): void {
		const now = this.now();
		if (this.physicalBoundaryMs() - now >= AGENTIC_CHAT_WORKFLOW_MIN_DISPATCH_WINDOW_MS) return;
		if (this.runDeadlineMs() - now >= (this.options.requeueMinRunRemainingMs ?? 30_000)) {
			throw new WorkflowRequeue('timeout_post_start', 'invocation_budget_exhausted');
		}
		throw new WorkflowExhausted('deadline_expired');
	}

	private retryWindowOpen(): boolean {
		return (
			this.physicalBoundaryMs() - this.now() >=
			CHAT_WORKFLOW_DISPATCH_POLICY.retryMinRemainingMs
		);
	}

	// ---------------------------------------------------------------------------
	// Durable state helpers
	// ---------------------------------------------------------------------------

	private async reload(): Promise<boolean> {
		const loaded = await this.ports.store.loadRun(this.input.fence.turnRunId);
		this.record('load', null, null, loaded ? loaded.phase : 'missing');
		if (!loaded) return false;
		this.state = loaded;
		return true;
	}

	private ownsClaim(stepKey: AgenticChatWorkflowStepKeyV1, attemptId: string): boolean {
		const step = this.state.steps[stepKey];
		return (
			step?.status === 'claimed' &&
			step.currentAttemptId === attemptId &&
			step.currentAttemptGeneration === this.input.fence.executionGeneration
		);
	}

	/** Checkpoints commit one at a time so each projection reflects every earlier commit. */
	private serially<T>(operation: () => Promise<T>): Promise<T> {
		const run = this.serial.then(operation, operation);
		this.serial = run.catch(() => undefined);
		return run;
	}

	private projection(state: AgenticChatWorkflowRunStateV1, phase: AgenticChatWorkflowPhaseV1) {
		const activity: AgenticChatWorkflowProviderActivityV1 =
			this.activeRequests > 0
				? 'request_active'
				: this.waitingForCapacity > 0
					? 'waiting_for_capacity'
					: 'idle';
		return buildAgenticChatWorkflowProjectionV1(
			workflowProjectionInputFromRunV1(state, {
				phase,
				providerActivity: activity,
				observedAt: new Date(this.now()).toISOString()
			})
		);
	}

	private checkpoint(
		state: AgenticChatWorkflowRunStateV1,
		phase: AgenticChatWorkflowPhaseV1
	): AgenticChatWorkflowCheckpointV1 {
		return workflowCheckpointV1(this.ids(), this.projection(state, phase));
	}

	private assertUnfenced(outcome: string): void {
		if (AGENTIC_CHAT_WORKFLOW_FENCED_DENIALS.has(outcome)) throw fencedStop(outcome);
	}

	private deliver(event: AgenticChatWorkflowEventReceiptV1): void {
		if (!event || !this.input.delivery) return;
		try {
			const pending = this.input.delivery.durableEvent(event);
			if (pending && typeof (pending as Promise<unknown>).catch === 'function') {
				void (pending as Promise<unknown>).catch(() => undefined);
			}
		} catch {
			// Delivery is best-effort; durable truth is already committed.
		}
	}

	private record(
		operation: AgenticChatWorkflowTransitionRecordV1['operation'],
		stepKey: AgenticChatWorkflowStepKeyV1 | null,
		stepAttemptId: string | null,
		outcome: string
	): void {
		this.transitions.push({ atMs: this.now(), operation, stepKey, stepAttemptId, outcome });
	}

	/** Tasker 86's shared content verbatim, plus the citable accepted records. */
	private buildSharedPrompt(): string {
		const records = [...this.evidence].map(
			([id, entry]) => `${id} | ${entry.kind} | ${entry.label}`
		);
		return `${this.input.modelInput.sharedUserContent}\n\nCITABLE RECORDS (id | kind | label)\n${records.join('\n')}`;
	}

	private classify(error: unknown): AgenticChatWorkflowRunOutcomeV1 {
		if (error instanceof WorkflowStop) {
			return error.reason === 'cancel_requested'
				? { kind: 'cancelled' }
				: { kind: 'fenced', reason: error.reason };
		}
		if (error instanceof WorkflowRequeue) {
			return { kind: 'requeue', failureClass: error.failureClass, reason: error.reason };
		}
		if (error instanceof WorkflowFailure) return failed(error.code, error.publicMessage);
		if (error instanceof WorkflowExhausted) return exhaustedFailure(error.code);
		if (this.input.signal.aborted)
			return { kind: 'aborted', reason: errorText(this.input.signal.reason) };
		if (
			error instanceof AgenticChatWorkflowStoreError &&
			TRANSIENT_STORE_CODE.test(error.code)
		) {
			return { kind: 'requeue', failureClass: 'transient_infra', reason: error.operation };
		}
		return failed(
			'workflow_internal_error',
			'This review stopped because of an internal error.'
		);
	}
}

/** Buffers editor text into durable batches that start exactly at the byte cursor. */
class AnswerWriter {
	durable = '';
	private pending = '';

	constructor(
		private readonly execution: WorkflowExecution,
		readonly answerId: string,
		readonly attemptId: string,
		private readonly flushBytes: number
	) {}

	get durableBytes(): number {
		return utf8Bytes(this.durable);
	}

	async push(text: string): Promise<void> {
		this.pending += text;
		if (utf8Bytes(this.pending) >= this.flushBytes) await this.flush(true);
	}

	async flush(keepTrailingSurrogate = false): Promise<void> {
		let delta = this.pending;
		// Never split a surrogate pair across batches: each batch must be valid UTF-8.
		if (keepTrailingSurrogate && /[\ud800-\udbff]$/.test(delta)) delta = delta.slice(0, -1);
		if (!delta) return;
		await this.execution.persistBatch(this, delta);
		this.durable += delta;
		this.pending = this.pending.slice(delta.length);
	}
}

function plannerAssignments(
	step: AgenticChatWorkflowStepRowV1
): { project_analyst: JsonObject; risk_reviewer: JsonObject } | null {
	const assignments = step.result?.assignments as JsonObject | undefined;
	const analyst = assignments?.project_analyst;
	const reviewer = assignments?.risk_reviewer;
	return isObject(analyst) && isObject(reviewer)
		? { project_analyst: analyst as JsonObject, risk_reviewer: reviewer as JsonObject }
		: null;
}

function objectiveOf(assignment: JsonObject): string {
	const objective = assignment.objective;
	return typeof objective === 'string' && objective.trim()
		? objective.trim()
		: AGENTIC_CHAT_WORKFLOW_FIXED_ASSIGNMENTS_V1.project_analyst.objective;
}

function pendingStep(
	key: AgenticChatWorkflowStepKeyV1,
	assignment: JsonObject
): AgenticChatWorkflowStepRowV1 {
	return {
		key,
		status: 'pending',
		attemptsUsed: 0,
		attemptIds: [],
		currentAttemptId: null,
		currentAttemptGeneration: null,
		assignment,
		quality: null,
		result: null,
		resultHash: null,
		acceptedAttemptId: null,
		failureCode: null
	};
}

/** Mirrors the SQL rule so the committed projection shows the skip in the same event. */
function skipEditorIfUnsatisfiable(state: AgenticChatWorkflowRunStateV1): void {
	const terminal = SPECIALISTS.filter((key) => isTerminal(state.steps[key]?.status));
	const accepted = SPECIALISTS.filter((key) => state.steps[key]?.status === 'accepted');
	const editor = state.steps.editor;
	if (
		terminal.length === 2 &&
		accepted.length === 0 &&
		editor &&
		(editor.status === 'pending' || editor.status === 'claimed')
	) {
		state.steps.editor = {
			...editor,
			status: 'skipped',
			failureCode: 'dependency_failed',
			currentAttemptId: null
		};
	}
}

function failureCodeOf(call: ModelCall, fallback: string): string {
	if (call.kind === 'attempt_error') return call.code;
	if (call.kind === 'denied') {
		return (call.code.startsWith('dispatch_') ? call.code : `dispatch_${call.code}`).slice(
			0,
			64
		);
	}
	return fallback;
}

function fencedStop(code: string): WorkflowStop {
	return new WorkflowStop(code as WorkflowStop['reason']);
}

function failed(failureCode: string, publicMessage: string): AgenticChatWorkflowRunOutcomeV1 {
	return { kind: 'failed', failureCode, publicMessage };
}

function exhaustedFailure(code: string): AgenticChatWorkflowRunOutcomeV1 {
	const clean = code.replace(/^dispatch_/, '');
	const messages: Record<string, string> = {
		deadline_expired: 'This review ran out of time before any specialist finished.',
		budget_exhausted: 'This review reached its spending limit before any specialist finished.',
		attempts_exhausted: 'This review used all of its attempts before any specialist finished.'
	};
	return failed(
		`workflow_${clean}`.slice(0, 64),
		messages[clean] ?? 'This review stopped before any specialist finished.'
	);
}

function isTerminal(status: string | undefined): boolean {
	return status === 'accepted' || status === 'failed' || status === 'skipped';
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isAbort(error: unknown): boolean {
	return (
		error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(error.message))
	);
}

function clone<T>(value: T): T {
	return structuredClone(value);
}

function sha256(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}

function errorText(value: unknown): string {
	return (value instanceof Error ? value.message : String(value ?? '')).slice(0, 500);
}
