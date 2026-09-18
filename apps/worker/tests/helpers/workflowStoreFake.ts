// apps/worker/tests/helpers/workflowStoreFake.ts
import { createHash, randomUUID } from 'node:crypto';
import {
	AGENTIC_CHAT_WORKFLOW_MAX_OUTPUT_TOKENS,
	AGENTIC_CHAT_WORKFLOW_POLICY_V1,
	type AgenticChatWorkflowEvidenceVersionV1,
	type AgenticChatWorkflowStepKeyV1,
	type JsonObject,
	canonicalizeAgenticChatJson
} from '@buildos/shared-types';
import {
	AgenticChatWorkflowStoreError,
	type AgenticChatWorkflowDispatchRowV1,
	type AgenticChatWorkflowFenceV1,
	type AgenticChatWorkflowRunStateV1,
	type AgenticChatWorkflowStepRowV1,
	type AgenticChatWorkflowStorePortV1
} from '../../src/workers/agentic-chat/workflow/workflow-store';

/**
 * In-memory model of Tasker 85's workflow RPCs, written branch-for-branch from
 * migrations 20260914203007/20260914203008. Each method body runs synchronously, so it
 * is atomic like the SQL transaction. The Postgres-backed test checks the same runner
 * against the real functions; this fake exists for deterministic fault injection.
 */

type Op = keyof AgenticChatWorkflowStorePortV1;
type Fault = {
	op: Op;
	mode: 'fail_before' | 'lose_response';
	when?: (args: any) => boolean;
	remaining: number;
};
type Dispatch = AgenticChatWorkflowDispatchRowV1 & {
	settlementToken: string;
	providerRequestId: string | null;
	pricing: JsonObject;
	serializedRequestBytes: number;
	maxOutputTokens: number;
};
type WorkflowEvent = {
	generation: number;
	sequence: number;
	transitionId: string;
	phase: string;
	kind: 'workflow_progress' | 'text';
	projection: JsonObject | null;
};

const PLAN_STEPS = [
	{ key: 'planner', capability: 'plan_review', dependsOn: [] },
	{ key: 'project_analyst', capability: 'project_analysis', dependsOn: ['planner'] },
	{ key: 'risk_reviewer', capability: 'risk_and_alternatives', dependsOn: ['planner'] },
	{
		key: 'editor',
		capability: 'synthesize_review',
		dependsOn: ['project_analyst', 'risk_reviewer']
	}
];
const RETRYABLE_CLASSES = new Set([
	'transient_infra',
	'provider_throttle',
	'timeout_pre_start',
	'timeout_post_start',
	'publisher_overload'
]);

export const FAKE_EVIDENCE: AgenticChatWorkflowEvidenceVersionV1[] = [
	{ kind: 'project', id: 'project-1', version: 'v3', observedAt: '2026-09-18T12:00:00.000Z' },
	{ kind: 'task', id: 'task-1', version: 'v7', observedAt: '2026-09-18T12:00:00.000Z' },
	{ kind: 'task', id: 'task-2', version: 'v2', observedAt: '2026-09-18T12:00:00.000Z' }
];
export const FAKE_CONTEXT_PAYLOAD: JsonObject = {
	data: {
		project: { id: 'project-1', name: 'Workshop launch' },
		tasks: [
			{ id: 'task-1', title: 'Book the venue' },
			{ id: 'task-2', title: 'Confirm the caterer' }
		]
	}
};

export class WorkflowStoreFake implements AgenticChatWorkflowStorePortV1 {
	nowMs: number;
	readonly turnRunId: string;
	generation = 1;
	turnStatus: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' = 'running';
	jobStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' = 'processing';
	processingToken: string;
	queueJobId: string;
	queueAttempts = 0;
	queueMaxAttempts = 3;
	cancelRequested = false;
	projectAccess = true;
	effects = false;
	workerStartedAtMs: number;
	streamText = '';
	readonly events: WorkflowEvent[] = [];
	readonly calls: Array<{ op: Op; args: unknown }> = [];
	readonly dispatches = new Map<string, Dispatch>();
	private readonly faults: Fault[] = [];
	private readonly sequences = new Map<number, number>();
	before?: (op: Op, args: any) => void | Promise<void>;
	run: {
		phase: AgenticChatWorkflowRunStateV1['phase'];
		terminalOutcome: AgenticChatWorkflowRunStateV1['terminalOutcome'];
		deadlineAtMs: number | null;
		recoveryCount: number;
		context: AgenticChatWorkflowRunStateV1['context'];
		plan: { planHash: string; plan: JsonObject } | null;
		answer: {
			answerId: string | null;
			editorStepAttemptId: string | null;
			text: string;
			textSha256: string | null;
			lastBatchId: string | null;
			status: 'not_started' | 'streaming' | 'accepted';
			quality: 'complete' | 'partial' | null;
			acceptedAt: string | null;
		};
		steps: Partial<Record<AgenticChatWorkflowStepKeyV1, AgenticChatWorkflowStepRowV1>>;
	};
	readonly limits: {
		maxSpendMicroUsd: number;
		synthesisHeadroomMicroUsd: number;
		maxPhysicalDispatches: number;
		maxStepAttempts: number;
		wholeRunLifetimeMs: number;
	} = {
		maxSpendMicroUsd: AGENTIC_CHAT_WORKFLOW_POLICY_V1.maxSpendMicroUsd,
		synthesisHeadroomMicroUsd: AGENTIC_CHAT_WORKFLOW_POLICY_V1.synthesisHeadroomMicroUsd,
		maxPhysicalDispatches: AGENTIC_CHAT_WORKFLOW_POLICY_V1.maxPhysicalDispatches,
		maxStepAttempts: AGENTIC_CHAT_WORKFLOW_POLICY_V1.maxStepAttempts,
		wholeRunLifetimeMs: AGENTIC_CHAT_WORKFLOW_POLICY_V1.wholeRunLifetimeMs
	};

	constructor(options: { nowMs?: number; turnRunId?: string } = {}) {
		this.nowMs = options.nowMs ?? Date.parse('2026-09-18T12:00:00.000Z');
		this.workerStartedAtMs = this.nowMs;
		this.turnRunId = options.turnRunId ?? '30000000-0000-4000-8000-000000000003';
		this.processingToken = randomUUID();
		this.queueJobId = '40000000-0000-4000-8000-000000000004';
		this.run = {
			phase: 'preparing',
			terminalOutcome: null,
			deadlineAtMs: null,
			recoveryCount: 0,
			context: null,
			plan: null,
			answer: {
				answerId: null,
				editorStepAttemptId: null,
				text: '',
				textSha256: null,
				lastBatchId: null,
				status: 'not_started',
				quality: null,
				acceptedAt: null
			},
			steps: {}
		};
	}

	get fence(): AgenticChatWorkflowFenceV1 {
		return {
			turnRunId: this.turnRunId,
			queueJobId: this.queueJobId,
			processingToken: this.processingToken,
			executionGeneration: this.generation
		};
	}

	/** Accepts context directly, as Tasker 86's preparation would. */
	seedAcceptedContext(
		evidence: AgenticChatWorkflowEvidenceVersionV1[] = FAKE_EVIDENCE,
		payload: JsonObject = FAKE_CONTEXT_PAYLOAD
	): void {
		this.run.deadlineAtMs ??= this.workerStartedAtMs + this.limits.wholeRunLifetimeMs;
		this.run.context = {
			contextId: '61000000-0000-4000-8000-000000000001',
			contextHash: sha256('context'),
			evidenceVersions: evidence,
			payload,
			acceptedGeneration: this.generation
		};
		this.run.phase = 'assessing';
		this.run.steps.planner = step('planner', {});
	}

	/** The unchanged `claim_agentic_chat_turn` for a new worker after requeue. */
	claimNewGeneration(): AgenticChatWorkflowFenceV1 {
		if (this.turnStatus !== 'queued' || this.jobStatus !== 'pending') {
			throw new Error('claim requires a queued turn and pending job');
		}
		this.generation += 1;
		this.turnStatus = 'running';
		this.jobStatus = 'processing';
		this.processingToken = randomUUID();
		// The ordinary claim resets the per-generation stream cursor and text.
		this.streamText = '';
		return this.fence;
	}

	/** The single terminal writer plus `trg_chat_turn_runs_workflow_terminal`. */
	terminalize(status: 'completed' | 'failed' | 'cancelled'): void {
		this.turnStatus = status;
		this.jobStatus = status;
		this.run.phase = 'finished';
		this.run.terminalOutcome =
			status === 'completed'
				? this.run.answer.status === 'accepted' && this.run.answer.quality === 'complete'
					? 'complete'
					: 'partial'
				: status;
		for (const dispatch of this.dispatches.values()) {
			if (dispatch.state === 'reserved') dispatch.state = 'released';
			else if (dispatch.state === 'dispatching') dispatch.state = 'uncertain';
		}
	}

	inject(op: Op, mode: Fault['mode'], when?: (args: any) => boolean, times = 1): void {
		this.faults.push({ op, mode, when, remaining: times });
	}

	exposureMicroUsd(): number {
		let total = 0;
		for (const dispatch of this.dispatches.values()) {
			if (dispatch.state === 'settled') total += dispatch.actualMicroUsd ?? 0;
			else if (dispatch.state !== 'released') total += dispatch.reservedMicroUsd;
		}
		return total;
	}

	progressEvents(generation = this.generation): WorkflowEvent[] {
		return this.events.filter(
			(event) => event.generation === generation && event.kind === 'workflow_progress'
		);
	}

	// -------------------------------------------------------------------------
	// Port
	// -------------------------------------------------------------------------

	loadRun(turnRunId: string) {
		return this.guard('loadRun', { turnRunId }, () => {
			if (turnRunId !== this.turnRunId) return null;
			const answer = this.run.answer;
			return {
				turnRunId: this.turnRunId,
				sessionId: '20000000-0000-4000-8000-000000000002',
				userId: '10000000-0000-4000-8000-000000000001',
				projectId: 'project-1',
				requestArtifactId: '60000000-0000-4000-8000-000000000006',
				requestHash: sha256('request'),
				phase: this.run.phase,
				terminalOutcome: this.run.terminalOutcome,
				limits: { ...this.limits },
				deadlineAt:
					this.run.deadlineAtMs === null
						? null
						: new Date(this.run.deadlineAtMs).toISOString(),
				recoveryCount: this.run.recoveryCount,
				context: this.run.context,
				plan: this.run.plan,
				answer: {
					answerId: answer.answerId,
					editorStepAttemptId: answer.editorStepAttemptId,
					text: answer.text,
					textSha256: answer.textSha256,
					status: answer.status,
					quality: answer.quality,
					acceptedAt: answer.acceptedAt
				},
				steps: this.run.steps,
				dispatches: [...this.dispatches.values()].map((dispatch) => ({
					dispatchId: dispatch.dispatchId,
					stepKey: dispatch.stepKey,
					stepAttemptId: dispatch.stepAttemptId,
					physicalAttempt: dispatch.physicalAttempt,
					kind: dispatch.kind,
					state: dispatch.state,
					reservedMicroUsd: dispatch.reservedMicroUsd,
					actualMicroUsd: dispatch.actualMicroUsd,
					reservedGeneration: dispatch.reservedGeneration
				}))
			} satisfies AgenticChatWorkflowRunStateV1;
		});
	}

	resume(fence: AgenticChatWorkflowFenceV1, checkpoint: any) {
		return this.guard('resume', { fence, checkpoint }, () => {
			const fenced = this.checkFence(fence);
			if (fenced) return { outcome: fenced, event: null };
			if (this.run.phase === 'finished') return { outcome: 'already_terminal', event: null };
			if (!this.run.answer.text.startsWith(this.streamText))
				throw sqlError('agentic_chat_workflow_resume_stream_diverged');
			const event = this.publish(fence, checkpoint, this.run.phase);
			this.streamText = this.run.answer.text;
			return { outcome: 'resumed', event };
		}) as any;
	}

	acceptContext(fence: AgenticChatWorkflowFenceV1, input: any) {
		return this.guard('acceptContext', { fence, input }, () => {
			const fenced = this.checkFence(fence);
			if (fenced) return { outcome: fenced, event: null };
			if (this.run.context) {
				return {
					outcome:
						this.run.context.contextId === input.contextId &&
						this.run.context.contextHash === input.contextHash
							? 'already_accepted'
							: 'context_conflict',
					event: null
				};
			}
			const deadline =
				this.run.deadlineAtMs ?? this.workerStartedAtMs + this.limits.wholeRunLifetimeMs;
			if (deadline <= this.nowMs) return { outcome: 'deadline_expired', event: null };
			if (!this.projectAccess) return { outcome: 'access_revoked', event: null };
			this.run.deadlineAtMs = deadline;
			this.run.context = {
				contextId: input.contextId,
				contextHash: input.contextHash,
				evidenceVersions: input.evidenceVersions,
				payload: input.payload,
				acceptedGeneration: fence.executionGeneration
			};
			this.run.phase = 'assessing';
			this.run.steps.planner = step('planner', {});
			return { outcome: 'accepted', event: this.publish(fence, input, 'assessing') };
		}) as any;
	}

	installPlan(fence: AgenticChatWorkflowFenceV1, input: any) {
		return this.guard('installPlan', { fence, input }, () => {
			const plan = input.plan as JsonObject;
			if (JSON.stringify(plan.steps) !== JSON.stringify(PLAN_STEPS))
				throw sqlError('agentic_chat_workflow_plan_invalid');
			const fenced = this.checkFence(fence);
			if (fenced) return { outcome: fenced, event: null };
			if (!this.run.context || this.run.context.contextId !== input.contextId) {
				return { outcome: 'context_required', event: null };
			}
			if (this.run.plan) {
				return {
					outcome:
						this.run.plan.planHash === input.planHash &&
						canonicalizeAgenticChatJson(this.run.plan.plan) ===
							canonicalizeAgenticChatJson(plan)
							? 'already_installed'
							: 'plan_conflict',
					event: null
				};
			}
			if (this.run.deadlineAtMs! <= this.nowMs)
				return { outcome: 'deadline_expired', event: null };
			const planner = this.run.steps.planner;
			if (!planner || (planner.status !== 'accepted' && planner.status !== 'failed')) {
				return { outcome: 'not_ready', event: null };
			}
			const binding = plan.planner as JsonObject;
			const assignments = plan.assignments as JsonObject;
			if (
				(planner.status === 'accepted' &&
					(binding.outcome !== 'accepted' ||
						binding.stepAttemptId !== planner.acceptedAttemptId ||
						binding.resultHash !== planner.resultHash ||
						canonicalizeAgenticChatJson(assignments.project_analyst as JsonObject) !==
							canonicalizeAgenticChatJson(
								(planner.result!.assignments as JsonObject)
									.project_analyst as JsonObject
							))) ||
				(planner.status === 'failed' &&
					(binding.outcome !== 'fixed_fallback' ||
						binding.stepAttemptId !== null ||
						binding.resultHash !== null))
			) {
				throw sqlError('agentic_chat_workflow_plan_planner_binding_mismatch');
			}
			this.run.plan = { planHash: input.planHash, plan };
			this.run.phase = 'executing';
			for (const key of ['project_analyst', 'risk_reviewer', 'editor'] as const) {
				this.run.steps[key] = step(key, assignments[key] as JsonObject);
			}
			return { outcome: 'installed', event: this.publish(fence, input, 'executing') };
		}) as any;
	}

	claimStep(fence: AgenticChatWorkflowFenceV1, input: any) {
		return this.guard('claimStep', { fence, input }, () => {
			const empty = {
				stepAttemptId: null,
				attemptNumber: null,
				assignment: null,
				deadlineAt: null,
				replayed: false
			};
			const fenced = this.checkFence(fence);
			if (fenced) return { outcome: fenced, ...empty };
			const key = input.stepKey as AgenticChatWorkflowStepKeyV1;
			if (
				input.planHash !== (this.run.plan?.planHash ?? null) &&
				!(key === 'planner' && input.planHash === null)
			) {
				return { outcome: this.run.plan ? 'plan_conflict' : 'not_ready', ...empty };
			}
			const current = this.run.steps[key];
			if (!current) return { outcome: 'not_ready', ...empty };
			if (current.status === 'accepted') return { outcome: 'already_accepted', ...empty };
			if (current.status === 'skipped') return { outcome: 'dependency_failed', ...empty };
			if (current.status === 'failed') return { outcome: 'attempts_exhausted', ...empty };
			if (
				current.status === 'claimed' &&
				current.currentAttemptGeneration === fence.executionGeneration
			) {
				return {
					outcome:
						current.currentAttemptId === input.stepAttemptId
							? 'claimed'
							: 'claim_conflict',
					stepAttemptId: current.currentAttemptId,
					attemptNumber: current.attemptsUsed,
					assignment: current.assignment,
					deadlineAt: this.deadlineIso(),
					replayed: true
				};
			}
			if (current.attemptIds.includes(input.stepAttemptId))
				throw sqlError('agentic_chat_workflow_step_attempt_id_reused');
			if (this.run.deadlineAtMs === null || this.run.deadlineAtMs <= this.nowMs) {
				return { outcome: 'deadline_expired', ...empty };
			}
			if (key === 'editor') {
				const specialists = (['project_analyst', 'risk_reviewer'] as const).map(
					(k) => this.run.steps[k]!
				);
				if (specialists.filter((s) => terminal(s.status)).length < 2)
					return { outcome: 'not_ready', ...empty };
				if (!specialists.some((s) => s.status === 'accepted')) {
					this.skipEditorIfUnsatisfiable();
					return { outcome: 'dependency_failed', ...empty };
				}
			}
			if (current.attemptsUsed >= this.limits.maxStepAttempts) {
				current.status = 'failed';
				current.failureCode = 'attempts_exhausted';
				if (key === 'project_analyst' || key === 'risk_reviewer')
					this.skipEditorIfUnsatisfiable();
				return { outcome: 'attempts_exhausted', ...empty };
			}
			if (this.exposureMicroUsd() >= this.limits.maxSpendMicroUsd)
				return { outcome: 'budget_exhausted', ...empty };
			current.status = 'claimed';
			current.attemptsUsed += 1;
			current.attemptIds = [...current.attemptIds, input.stepAttemptId];
			current.currentAttemptId = input.stepAttemptId;
			current.currentAttemptGeneration = fence.executionGeneration;
			current.failureCode = null;
			if (key === 'editor' && this.run.phase === 'executing') this.run.phase = 'synthesizing';
			return {
				outcome: 'claimed',
				stepAttemptId: input.stepAttemptId,
				attemptNumber: current.attemptsUsed,
				assignment: current.assignment,
				deadlineAt: this.deadlineIso(),
				replayed: false
			};
		}) as any;
	}

	acceptStepResult(fence: AgenticChatWorkflowFenceV1, input: any) {
		return this.guard('acceptStepResult', { fence, input }, () => {
			if (
				input.stepKey === 'editor' ||
				(input.stepKey === 'planner' && input.quality !== 'complete')
			) {
				throw sqlError('agentic_chat_workflow_step_result_invalid');
			}
			const fenced = this.checkFence(fence);
			if (fenced) return { outcome: fenced, event: null };
			const current = this.run.steps[input.stepKey as AgenticChatWorkflowStepKeyV1]!;
			if (current.status === 'accepted') {
				return {
					outcome:
						current.acceptedAttemptId === input.stepAttemptId &&
						current.resultHash === input.resultHash
							? 'already_accepted'
							: 'result_conflict',
					event: null
				};
			}
			if (
				current.status !== 'claimed' ||
				current.currentAttemptId !== input.stepAttemptId ||
				current.currentAttemptGeneration !== fence.executionGeneration ||
				input.planHash !== (this.run.plan?.planHash ?? null)
			) {
				return { outcome: 'stale_claim', event: null };
			}
			if (!this.resultValid(input.stepKey, input.result))
				throw sqlError('agentic_chat_workflow_step_result_unverified');
			if (sha256(canonicalizeAgenticChatJson(input.result)) !== input.resultHash) {
				throw new Error('fake: result hash does not bind the result');
			}
			Object.assign(current, {
				status: 'accepted',
				quality: input.quality,
				result: input.result,
				resultHash: input.resultHash,
				acceptedAttemptId: input.stepAttemptId,
				failureCode: null
			});
			return { outcome: 'accepted', event: this.publish(fence, input, this.run.phase) };
		}) as any;
	}

	failStepAttempt(fence: AgenticChatWorkflowFenceV1, input: any) {
		return this.guard('failStepAttempt', { fence, input }, () => {
			if (!/^[a-z][a-z0-9_]{0,63}$/.test(input.failureCode))
				throw sqlError('agentic_chat_workflow_step_failure_invalid');
			const fenced = this.checkFence(fence);
			if (fenced) return { outcome: fenced, editorSkipped: false, event: null };
			const current = this.run.steps[input.stepKey as AgenticChatWorkflowStepKeyV1]!;
			if (current.status === 'accepted')
				return { outcome: 'already_accepted', editorSkipped: false, event: null };
			if (
				(current.status === 'failed' || current.status === 'skipped') &&
				current.failureCode === input.failureCode &&
				current.attemptIds.includes(input.stepAttemptId)
			) {
				return { outcome: current.status, editorSkipped: false, event: null };
			}
			if (
				current.status === 'pending' &&
				current.failureCode === input.failureCode &&
				current.attemptIds.at(-1) === input.stepAttemptId
			) {
				return { outcome: 'retry_scheduled', editorSkipped: false, event: null };
			}
			if (
				current.status !== 'claimed' ||
				current.currentAttemptId !== input.stepAttemptId ||
				current.currentAttemptGeneration !== fence.executionGeneration ||
				input.planHash !== (this.run.plan?.planHash ?? null)
			) {
				return { outcome: 'stale_claim', editorSkipped: false, event: null };
			}
			let outcome: string;
			let editorSkipped = false;
			if (
				input.retryable &&
				current.attemptsUsed < this.limits.maxStepAttempts &&
				this.run.deadlineAtMs! > this.nowMs
			) {
				current.status = 'pending';
				current.currentAttemptId = null;
				current.failureCode = input.failureCode;
				outcome = 'retry_scheduled';
			} else {
				current.status = 'failed';
				current.failureCode = input.failureCode;
				outcome = 'failed';
				if (input.stepKey === 'project_analyst' || input.stepKey === 'risk_reviewer') {
					editorSkipped = this.skipEditorIfUnsatisfiable();
				}
			}
			return { outcome, editorSkipped, event: this.publish(fence, input, this.run.phase) };
		}) as any;
	}

	reserveDispatch(fence: AgenticChatWorkflowFenceV1, input: any) {
		return this.guard('reserveDispatch', { fence, input }, () => {
			const empty = { settlementToken: null, reservedMicroUsd: null, exposureMicroUsd: null };
			const key = input.stepKey as AgenticChatWorkflowStepKeyV1;
			if (
				input.physicalAttempt < 1 ||
				input.physicalAttempt > 2 ||
				input.serializedRequestBytes < 1 ||
				input.serializedRequestBytes > 131_072 ||
				input.maxOutputTokens < 1 ||
				input.maxOutputTokens > AGENTIC_CHAT_WORKFLOW_MAX_OUTPUT_TOKENS[key] ||
				(input.kind === 'planner' && key !== 'planner') ||
				(input.kind === 'specialist' &&
					key !== 'project_analyst' &&
					key !== 'risk_reviewer') ||
				(input.kind === 'editor' && key !== 'editor')
			) {
				throw sqlError('agentic_chat_workflow_dispatch_reserve_invalid');
			}
			const fenced = this.checkFence(fence);
			if (fenced) return { outcome: fenced, ...empty };
			const existing = this.dispatches.get(input.dispatchId);
			if (existing) {
				return {
					outcome:
						existing.stepKey === key &&
						existing.stepAttemptId === input.stepAttemptId &&
						existing.physicalAttempt === input.physicalAttempt &&
						existing.serializedRequestBytes === input.serializedRequestBytes
							? 'already_reserved'
							: 'reservation_conflict',
					settlementToken: existing.settlementToken,
					reservedMicroUsd: existing.reservedMicroUsd,
					exposureMicroUsd: this.exposureMicroUsd()
				};
			}
			if (input.kind === 'paid_tool' || input.pricing?.model !== input.modelRequested) {
				return { outcome: 'pricing_unavailable', ...empty };
			}
			const current = this.run.steps[key];
			if (
				!current ||
				current.status !== 'claimed' ||
				current.currentAttemptId !== input.stepAttemptId ||
				current.currentAttemptGeneration !== fence.executionGeneration
			) {
				return { outcome: 'stale_claim', ...empty };
			}
			if (
				[...this.dispatches.values()].some(
					(d) =>
						d.stepKey === key &&
						d.stepAttemptId === input.stepAttemptId &&
						d.physicalAttempt === input.physicalAttempt
				)
			) {
				return { outcome: 'reservation_conflict', ...empty };
			}
			if (this.run.deadlineAtMs === null || this.run.deadlineAtMs <= this.nowMs) {
				return { outcome: 'deadline_expired', ...empty };
			}
			if (this.dispatches.size >= this.limits.maxPhysicalDispatches)
				return { outcome: 'dispatch_limit', ...empty };
			const reservation = Math.floor(
				((input.serializedRequestBytes + 1024) * 3 + input.maxOutputTokens * 12 + 9) / 10
			);
			const exposure = this.exposureMicroUsd();
			if (exposure + reservation > this.limits.maxSpendMicroUsd)
				return { outcome: 'budget_exhausted', ...empty };
			if (
				key !== 'editor' &&
				this.limits.maxSpendMicroUsd - (exposure + reservation) <
					this.limits.synthesisHeadroomMicroUsd
			) {
				return { outcome: 'synthesis_headroom_required', ...empty };
			}
			const token = randomUUID();
			this.dispatches.set(input.dispatchId, {
				dispatchId: input.dispatchId,
				stepKey: key,
				stepAttemptId: input.stepAttemptId,
				physicalAttempt: input.physicalAttempt,
				kind: input.kind,
				state: 'reserved',
				reservedMicroUsd: reservation,
				actualMicroUsd: null,
				reservedGeneration: fence.executionGeneration,
				settlementToken: token,
				providerRequestId: null,
				pricing: input.pricing,
				serializedRequestBytes: input.serializedRequestBytes,
				maxOutputTokens: input.maxOutputTokens
			});
			return {
				outcome: 'reserved',
				settlementToken: token,
				reservedMicroUsd: reservation,
				exposureMicroUsd: exposure + reservation
			};
		}) as any;
	}

	beginDispatch(fence: AgenticChatWorkflowFenceV1, input: { dispatchId: string }) {
		return this.guard('beginDispatch', { fence, input }, () => {
			const fenced = this.checkFence(fence);
			if (fenced) return { outcome: fenced, dispatchPermitted: false };
			const dispatch = this.dispatches.get(input.dispatchId);
			if (
				!dispatch ||
				dispatch.state === 'released' ||
				dispatch.reservedGeneration !== fence.executionGeneration
			) {
				return { outcome: 'reservation_required', dispatchPermitted: false };
			}
			if (dispatch.state !== 'reserved')
				return { outcome: 'already_started', dispatchPermitted: false };
			const current = this.run.steps[dispatch.stepKey]!;
			if (
				current.status !== 'claimed' ||
				current.currentAttemptId !== dispatch.stepAttemptId ||
				current.currentAttemptGeneration !== fence.executionGeneration
			) {
				return { outcome: 'stale_claim', dispatchPermitted: false };
			}
			if (this.run.deadlineAtMs! <= this.nowMs)
				return { outcome: 'deadline_expired', dispatchPermitted: false };
			dispatch.state = 'dispatching';
			return { outcome: 'dispatching', dispatchPermitted: true };
		}) as any;
	}

	settleDispatch(input: any) {
		return this.guard('settleDispatch', { input }, () => {
			if (
				!['settled', 'uncertain', 'released'].includes(input.outcome) ||
				(input.outcome === 'settled' &&
					(input.actualMicroUsd === null || input.actualMicroUsd < 0)) ||
				(input.outcome !== 'settled' && input.actualMicroUsd !== null)
			) {
				throw sqlError('agentic_chat_workflow_dispatch_settle_invalid');
			}
			const dispatch = this.dispatches.get(input.dispatchId);
			if (!dispatch)
				return {
					outcome: 'unknown_dispatch',
					state: null,
					actualMicroUsd: null,
					exposureMicroUsd: null
				};
			if (dispatch.settlementToken !== input.settlementToken) {
				throw sqlError('agentic_chat_workflow_dispatch_settlement_token_invalid', '42501');
			}
			if (dispatch.state === input.outcome) {
				return {
					outcome:
						input.outcome === 'uncertain' ||
						(dispatch.actualMicroUsd === input.actualMicroUsd &&
							dispatch.providerRequestId === input.providerRequestId)
							? 'already_settled'
							: 'settlement_conflict',
					state: dispatch.state,
					actualMicroUsd: dispatch.actualMicroUsd,
					exposureMicroUsd: this.exposureMicroUsd()
				};
			}
			if (
				!(
					(dispatch.state === 'dispatching' &&
						(input.outcome === 'settled' || input.outcome === 'uncertain')) ||
					(dispatch.state === 'reserved' && input.outcome === 'released')
				)
			) {
				return {
					outcome: 'settlement_conflict',
					state: dispatch.state,
					actualMicroUsd: dispatch.actualMicroUsd,
					exposureMicroUsd: null
				};
			}
			dispatch.state = input.outcome;
			dispatch.actualMicroUsd = input.actualMicroUsd;
			dispatch.providerRequestId = input.providerRequestId;
			return {
				outcome: input.outcome === 'uncertain' ? 'uncertain' : 'settled',
				state: dispatch.state,
				actualMicroUsd: dispatch.actualMicroUsd,
				exposureMicroUsd: this.exposureMicroUsd()
			};
		}) as any;
	}

	persistTextBatch(fence: AgenticChatWorkflowFenceV1, input: any) {
		return this.guard('persistTextBatch', { fence, input }, () => {
			if (
				!input.textDelta ||
				input.deltaSha256 !== sha256(input.textDelta) ||
				input.completeTextSha256 !== sha256(input.assistantText)
			) {
				throw sqlError('agentic_chat_workflow_text_batch_invalid');
			}
			const fenced = this.checkFence(fence);
			if (fenced) return { outcome: fenced, durableBytes: null, event: null };
			const answer = this.run.answer;
			const bytes = () => Buffer.byteLength(answer.text, 'utf8');
			if (answer.lastBatchId === input.batchId) {
				if (answer.answerId !== input.answerId || answer.text !== input.assistantText) {
					return { outcome: 'answer_conflict', durableBytes: bytes(), event: null };
				}
				return { outcome: 'already_persisted', durableBytes: bytes(), event: null };
			}
			const editor = this.run.steps.editor!;
			if (
				editor.status !== 'claimed' ||
				editor.currentAttemptId !== input.editorStepAttemptId ||
				editor.currentAttemptGeneration !== fence.executionGeneration
			) {
				return { outcome: 'stale_claim', durableBytes: null, event: null };
			}
			if (
				answer.status === 'accepted' ||
				(answer.answerId !== null &&
					(answer.answerId !== input.answerId ||
						answer.editorStepAttemptId !== input.editorStepAttemptId))
			) {
				return { outcome: 'answer_conflict', durableBytes: bytes(), event: null };
			}
			if (input.startByte !== bytes())
				return { outcome: 'offset_conflict', durableBytes: bytes(), event: null };
			if (input.assistantText !== answer.text + input.textDelta) {
				return { outcome: 'answer_conflict', durableBytes: bytes(), event: null };
			}
			if (this.streamText !== answer.text)
				return { outcome: 'stream_reseed_required', durableBytes: bytes(), event: null };
			this.streamText = input.assistantText;
			this.events.push({
				generation: fence.executionGeneration,
				sequence: this.nextSequence(fence.executionGeneration),
				transitionId: input.batchId,
				phase: 'stream',
				kind: 'text',
				projection: null
			});
			Object.assign(answer, {
				answerId: input.answerId,
				editorStepAttemptId: input.editorStepAttemptId,
				text: input.assistantText,
				textSha256: input.completeTextSha256,
				lastBatchId: input.batchId,
				status: 'streaming'
			});
			return { outcome: 'persisted', durableBytes: bytes(), event: { outcome: 'persisted' } };
		}) as any;
	}

	acceptSynthesis(fence: AgenticChatWorkflowFenceV1, input: any) {
		return this.guard('acceptSynthesis', { fence, input }, () => {
			const fenced = this.checkFence(fence);
			if (fenced) return { outcome: fenced, event: null };
			const answer = this.run.answer;
			if (answer.status === 'accepted') {
				return {
					outcome:
						answer.answerId === input.answerId &&
						answer.textSha256 === input.textSha256 &&
						answer.quality === input.quality
							? 'already_accepted'
							: 'answer_conflict',
					event: null
				};
			}
			const editor = this.run.steps.editor!;
			if (
				editor.status !== 'claimed' ||
				editor.currentAttemptId !== input.editorStepAttemptId ||
				editor.currentAttemptGeneration !== fence.executionGeneration
			) {
				return { outcome: 'stale_claim', event: null };
			}
			if (
				answer.answerId !== input.answerId ||
				answer.editorStepAttemptId !== input.editorStepAttemptId ||
				Buffer.byteLength(answer.text, 'utf8') !== input.textBytes ||
				answer.textSha256 !== input.textSha256
			) {
				return { outcome: 'answer_conflict', event: null };
			}
			const specialists = (['project_analyst', 'risk_reviewer'] as const).map(
				(k) => this.run.steps[k]!
			);
			const accepted = specialists.filter((s) => s.status === 'accepted');
			if (
				!accepted.length ||
				(input.quality === 'complete' &&
					(accepted.length < 2 || specialists.some((s) => s.quality === 'partial')))
			) {
				throw sqlError('agentic_chat_workflow_synthesis_quality_overstated');
			}
			Object.assign(answer, {
				status: 'accepted',
				quality: input.quality,
				acceptedAt: new Date(this.nowMs).toISOString()
			});
			const result = {
				version: 'agentic_chat_workflow_synthesis_result_v1',
				answerId: input.answerId,
				textBytes: input.textBytes,
				textSha256: input.textSha256,
				quality: input.quality
			};
			Object.assign(editor, {
				status: 'accepted',
				quality: input.quality,
				result,
				resultHash: sha256(canonicalizeAgenticChatJson(result)),
				acceptedAttemptId: input.editorStepAttemptId,
				failureCode: null
			});
			return { outcome: 'accepted', event: this.publish(fence, input, 'synthesizing') };
		}) as any;
	}

	recoverTurn(fence: AgenticChatWorkflowFenceV1, input: any) {
		return this.guard('recoverTurn', { fence, input }, () => {
			const receipt = (outcome: string, extra: Record<string, unknown> = {}) => ({
				outcome,
				executionMayRetry: outcome === 'retry_scheduled',
				reason: (extra.reason as string) ?? null,
				uncertainCostHeld: extra.uncertainCostHeld === true,
				raw: { outcome, turn_run_id: this.turnRunId, ...extra } as JsonObject
			});
			if (['completed', 'failed', 'cancelled'].includes(this.turnStatus))
				return receipt('terminal_reconciled');
			if (this.generation !== fence.executionGeneration) return receipt('stale_generation');
			if (this.effects) return receipt('policy_denied', { reason: 'domain_effect_boundary' });
			if (this.turnStatus === 'queued' && this.jobStatus === 'pending')
				return receipt('already_requeued');
			if (
				this.turnStatus !== 'running' ||
				this.jobStatus !== 'processing' ||
				this.processingToken !== fence.processingToken
			) {
				return receipt('ownership_lost');
			}
			if (this.cancelRequested) return receipt('cancel_requested');
			const deadline =
				this.run.deadlineAtMs ?? this.workerStartedAtMs + this.limits.wholeRunLifetimeMs;
			this.run.deadlineAtMs ??= deadline;
			if (deadline <= this.nowMs) return receipt('deadline_expired');
			if (!RETRYABLE_CLASSES.has(input.failureClass)) return receipt('finalize_failed');
			if (!this.projectAccess) return receipt('access_revoked');
			if (this.queueAttempts + 1 >= this.queueMaxAttempts)
				return receipt('attempts_exhausted');
			if (
				this.exposureMicroUsd() >= this.limits.maxSpendMicroUsd ||
				this.dispatches.size >= this.limits.maxPhysicalDispatches
			) {
				return receipt('budget_exhausted');
			}
			let released = 0;
			let uncertain = 0;
			for (const dispatch of this.dispatches.values()) {
				if (dispatch.state === 'reserved') {
					dispatch.state = 'released';
					released += 1;
				} else if (dispatch.state === 'dispatching') {
					dispatch.state = 'uncertain';
					uncertain += 1;
				}
			}
			this.run.recoveryCount += 1;
			this.turnStatus = 'queued';
			this.jobStatus = 'pending';
			this.processingToken = '';
			this.queueAttempts += 1;
			return receipt('retry_scheduled', {
				released_dispatch_count: released,
				uncertain_dispatch_count: uncertain,
				uncertainCostHeld: [...this.dispatches.values()].some(
					(d) => d.state === 'uncertain'
				)
			});
		}) as any;
	}

	// -------------------------------------------------------------------------

	private async guard<T>(op: Op, args: unknown, impl: () => T): Promise<T> {
		this.calls.push({ op, args });
		await this.before?.(op, args);
		const index = this.faults.findIndex(
			(fault) => fault.op === op && fault.remaining > 0 && (!fault.when || fault.when(args))
		);
		const fault = index >= 0 ? this.faults[index]! : null;
		if (fault) fault.remaining -= 1;
		if (fault?.mode === 'fail_before')
			throw new AgenticChatWorkflowStoreError(op, '', 'injected network failure');
		const result = impl();
		if (fault?.mode === 'lose_response')
			throw new AgenticChatWorkflowStoreError(op, '', 'injected lost response');
		return structuredClone(result);
	}

	private checkFence(fence: AgenticChatWorkflowFenceV1): string | null {
		if (fence.turnRunId !== this.turnRunId || fence.queueJobId !== this.queueJobId) {
			throw sqlError('agentic_chat_workflow_relationship_mismatch');
		}
		if (['completed', 'failed', 'cancelled'].includes(this.turnStatus))
			return 'already_terminal';
		if (fence.executionGeneration !== this.generation) return 'stale_generation';
		if (this.turnStatus !== 'running') return 'ownership_lost';
		if (this.jobStatus !== 'processing' || fence.processingToken !== this.processingToken)
			return 'ownership_lost';
		if (this.cancelRequested) return 'cancel_requested';
		return null;
	}

	private publish(fence: AgenticChatWorkflowFenceV1, checkpoint: any, phase: string): JsonObject {
		const workflow = checkpoint.projection?.workflow;
		if (
			workflow?.version !== 'agentic_chat_workflow_projection_v1' ||
			workflow?.phase !== phase ||
			checkpoint.eventPayload?.type !== 'workflow_progress' ||
			checkpoint.eventPayload?.workflow?.phase !== phase
		) {
			throw sqlError('agentic_chat_workflow_invalid_progress_projection');
		}
		const existing = this.events.find(
			(event) =>
				event.generation === fence.executionGeneration &&
				event.transitionId === checkpoint.transitionId
		);
		if (existing) return { outcome: 'already_persisted', sequence_index: existing.sequence };
		const sequence = this.nextSequence(fence.executionGeneration);
		this.events.push({
			generation: fence.executionGeneration,
			sequence,
			transitionId: checkpoint.transitionId,
			phase,
			kind: 'workflow_progress',
			projection: workflow
		});
		return {
			outcome: 'persisted',
			sequence_index: sequence,
			execution_generation: fence.executionGeneration
		};
	}

	private nextSequence(generation: number): number {
		const next = (this.sequences.get(generation) ?? 0) + 1;
		this.sequences.set(generation, next);
		return next;
	}

	private deadlineIso(): string | null {
		return this.run.deadlineAtMs === null
			? null
			: new Date(this.run.deadlineAtMs).toISOString();
	}

	private skipEditorIfUnsatisfiable(): boolean {
		const specialists = (['project_analyst', 'risk_reviewer'] as const).map(
			(k) => this.run.steps[k]!
		);
		if (
			specialists.every((s) => terminal(s.status)) &&
			!specialists.some((s) => s.status === 'accepted')
		) {
			const editor = this.run.steps.editor!;
			if (editor.status === 'pending' || editor.status === 'claimed') {
				editor.status = 'skipped';
				editor.failureCode = 'dependency_failed';
				editor.currentAttemptId = null;
				return true;
			}
		}
		return false;
	}

	private resultValid(key: string, result: any): boolean {
		if (key === 'planner') {
			return (
				result?.version === 'agentic_chat_workflow_planner_result_v1' &&
				typeof result.assignments?.project_analyst === 'object' &&
				typeof result.assignments?.risk_reviewer === 'object' &&
				Object.keys(result).sort().join() === 'assignments,version'
			);
		}
		const evidence = this.run.context?.evidenceVersions ?? [];
		const refsValid = (refs: any[], min: number) =>
			Array.isArray(refs) &&
			refs.length >= min &&
			refs.length <= 4 &&
			refs.every(
				(ref) =>
					ref.kind === 'project_record' &&
					Object.keys(ref).sort().join() === 'id,kind,label,version' &&
					typeof ref.label === 'string' &&
					Array.from(ref.label).length >= 1 &&
					Array.from(ref.label).length <= 80 &&
					evidence.some((entry) => entry.id === ref.id && entry.version === ref.version)
			);
		return (
			result?.version === 'chat_workflow_role_report_v1' &&
			result.role === key &&
			Object.keys(result).length === 9 &&
			Array.isArray(result.findings) &&
			result.findings.length >= 1 &&
			result.findings.length <= 5 &&
			result.findings.every((finding: any) => refsValid(finding.evidence, 1)) &&
			result.risks.every((risk: any) => refsValid(risk.evidence, 0))
		);
	}
}

function step(
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

function terminal(status: string): boolean {
	return status === 'accepted' || status === 'failed' || status === 'skipped';
}

function sqlError(message: string, code = 'P0001'): AgenticChatWorkflowStoreError {
	return new AgenticChatWorkflowStoreError('rpc', code, message);
}

export function sha256(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}
