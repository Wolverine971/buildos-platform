// packages/agent-orchestrator/src/application/workflow-engine/workflow-engine.ts
import { createHash, randomUUID } from 'node:crypto';

import {
	AgentResultSchema,
	ArtifactEnvelopeSchema,
	PermissionGrantSchema,
	ProjectScopeSchema,
	RouteDecisionSchema,
	TransitionDecisionSchema,
	type AgentResult,
	type ModelUsageEvent,
	type PermissionGrant,
	type ProjectScope,
	type RouteDecision,
	type TransitionAction,
	type TransitionDecision,
	type WorkflowStageSpec
} from '../../contracts';
import type { ExecutedStage, ExecutedStep, StoredArtifact, WorkflowToolCall } from '../../domain';
import type { AgentExecutorPort, SynthesisModelPort, TransitionModelPort } from '../../ports';
import { buildWorkflowStateDigest, type WorkflowBudgetState } from './digest';
import {
	buildSynthesisPrompt,
	SYNTHESIS_MODEL_MAX_TOKENS,
	SYNTHESIS_MODEL_TEMPERATURE,
	SYNTHESIS_PROMPT_VERSION,
	SYNTHESIS_SYSTEM_PROMPT
} from './synthesis';
import {
	compileTransitionDecision,
	forcedTransitionProposal,
	requestTransitionProposal,
	type TransitionProposal
} from './transition';

export const PHASE_A_MAX_STAGES = 5;
export const PHASE_A_MAX_REPLANS = 2;
export const PHASE_A_DEFAULT_MAX_USD = 0.05;
export const PHASE_A_DEFAULT_MAX_WALL_CLOCK_MS = 300_000;

export class WorkflowSafetyViolation extends Error {
	readonly toolCalls: WorkflowToolCall[];

	constructor(toolCalls: WorkflowToolCall[]) {
		super(`Read-only workflow attempted ${toolCalls.length} write operation(s)`);
		this.name = 'WorkflowSafetyViolation';
		this.toolCalls = toolCalls;
	}
}

export interface WorkflowEngineInput {
	routeDecision: RouteDecision;
	permissionGrant: PermissionGrant;
	projectScope: ProjectScope[];
	agentExecutor: AgentExecutorPort;
	transitionModel: TransitionModelPort;
	synthesisModel: SynthesisModelPort;
	runId?: string;
	maxUsd?: number;
	maxWallClockMs?: number;
	initialUsage?: ModelUsageEvent[];
	initialToolCostUsd?: number;
	now?: () => number;
}

export interface WorkflowRunResult {
	runId: string;
	status: 'completed' | 'partial' | 'failed';
	output: string;
	routeDecision: RouteDecision;
	stages: ExecutedStage[];
	artifacts: StoredArtifact[];
	transitions: TransitionDecision[];
	usage: ModelUsageEvent[];
	toolCalls: WorkflowToolCall[];
	modelCostUsd: number;
	toolCostUsd: number;
	totalCostUsd: number;
	durationMs: number;
	stageCount: number;
	replanCount: number;
	/** Gates that reached the transition model because more than one action was legal. */
	transitionModelCalls: number;
	/** Gates decided in code because the policy left exactly one legal action. */
	forcedTransitions: number;
	budgetExceeded: boolean;
}

function usageCost(usage: ModelUsageEvent[]): number {
	return usage.reduce((total, event) => total + event.totalCostUsd, 0);
}

function deterministicUuid(namespace: string, value: string): string {
	const hex = createHash('sha256').update(`${namespace}\n${value}`).digest('hex').slice(0, 32);
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(
		17,
		20
	)}-${hex.slice(20)}`;
}

function failedAgentResult(message: string): AgentResult {
	return AgentResultSchema.parse({
		schema_version: 1,
		status: 'failed',
		summary: `Step failed: ${message}`.slice(0, 1_000),
		artifact_drafts: [],
		acceptance_results: [],
		open_questions: [],
		assumptions: [],
		residual_risks: [message.slice(0, 4_000)],
		confidence: 0,
		capability_gaps: []
	});
}

function assertReadOnlyPermission(permission: PermissionGrant): PermissionGrant {
	const parsed = PermissionGrantSchema.parse(permission);
	if (parsed.mode !== 'read_only') {
		throw new WorkflowSafetyViolation([
			{
				operation: `permission.mode.${parsed.mode}`,
				effect: 'write',
				succeeded: false,
				error: 'Phase A permits only read_only mode.'
			}
		]);
	}
	return parsed;
}

function terminalBudgetDecision(reason: 'budget_exhausted' | 'policy_limit_reached') {
	return TransitionDecisionSchema.parse({
		schema_version: 1,
		action: 'fail',
		reason_code: reason
	});
}

function remainingBudget(budget: WorkflowBudgetState): number {
	return Math.max(0, budget.maxUsd - budget.spentUsd - budget.reservedUsd);
}

function terminalStatus(decision: TransitionDecision): WorkflowRunResult['status'] {
	if (decision.action === 'complete') return 'completed';
	if (decision.action === 'complete_partial') return 'partial';
	return 'failed';
}

function finalIds(decision: TransitionDecision): string[] {
	return decision.action === 'complete' || decision.action === 'complete_partial'
		? decision.final_artifact_ids
		: [];
}

function transitionPolicy(params: { stage: ExecutedStage; artifacts: StoredArtifact[] }): {
	proposalActions: TransitionProposal['action'][];
	contractActions: TransitionAction[];
} {
	const hasResearch = params.artifacts.some(
		(artifact) => artifact.envelope.artifact_type === 'research_packet'
	);
	const hasContext = params.artifacts.some(
		(artifact) => artifact.envelope.artifact_type === 'context_packet'
	);
	if (params.stage.status === 'failed') {
		return params.artifacts.length > 0
			? {
					proposalActions: ['complete_partial', 'fail'],
					contractActions: ['complete_partial', 'fail']
				}
			: { proposalActions: ['fail'], contractActions: ['fail'] };
	}
	if (params.stage.status === 'partial') {
		return {
			proposalActions: ['complete_partial', 'fail'],
			contractActions: ['complete_partial', 'fail']
		};
	}
	if (hasContext && !hasResearch) {
		return { proposalActions: ['append_research'], contractActions: ['append_stage'] };
	}
	if (hasResearch) {
		return { proposalActions: ['complete'], contractActions: ['complete'] };
	}
	return { proposalActions: ['fail'], contractActions: ['fail'] };
}

function resultStatus(result: AgentResult): ExecutedStep['status'] {
	return result.status;
}

async function executeStage(params: {
	runId: string;
	stage: WorkflowStageSpec;
	stageIndex: number;
	permissionGrant: PermissionGrant;
	agentExecutor: AgentExecutorPort;
	artifacts: StoredArtifact[];
	budget: WorkflowBudgetState;
	now: () => number;
}): Promise<ExecutedStage> {
	const stageId = deterministicUuid(
		'phase-a.workflow.stage',
		`${params.runId}:${params.stageIndex}:${params.stage.client_stage_key}`
	);
	const completedByKey = new Map<string, ExecutedStep>();
	const pending = new Map(params.stage.steps.map((step) => [step.client_step_key, step]));
	const executed: ExecutedStep[] = [];

	while (pending.size > 0) {
		const ready = Array.from(pending.values()).filter((step) =>
			step.depends_on_step_keys.every((dependency) => completedByKey.has(dependency))
		);
		if (ready.length === 0) {
			throw new Error(
				`No executable dependency wave in stage ${params.stage.client_stage_key}`
			);
		}
		const allocation = remainingBudget(params.budget) / ready.length;
		const wave = await Promise.all(
			ready.map(async (step): Promise<ExecutedStep> => {
				const stepId = deterministicUuid(
					'phase-a.workflow.step',
					`${stageId}:${step.client_step_key}`
				);
				const dependencyArtifacts = step.depends_on_step_keys.flatMap(
					(dependency) => completedByKey.get(dependency)?.artifactIds ?? []
				);
				const inputIds = new Set([...step.input_artifact_ids, ...dependencyArtifacts]);
				const inputArtifacts = params.artifacts.filter((artifact) =>
					inputIds.has(artifact.artifactId)
				);
				try {
					const response = await params.agentExecutor.execute({
						runId: params.runId,
						stepId,
						step,
						inputArtifacts,
						permissionGrant: params.permissionGrant,
						maxCostUsd: allocation
					});
					const result = AgentResultSchema.parse(response.result);
					const toolCostUsd =
						Number.isFinite(response.toolCostUsd) && response.toolCostUsd >= 0
							? response.toolCostUsd
							: 0;
					return {
						spec: step,
						stepId,
						status: resultStatus(result),
						result,
						artifactIds: [],
						usage: response.usage,
						toolCostUsd,
						toolCalls: response.toolCalls
					};
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					return {
						spec: step,
						stepId,
						status: 'failed',
						result: failedAgentResult(message),
						artifactIds: [],
						usage: [],
						toolCostUsd: 0,
						toolCalls: []
					};
				}
			})
		);

		const writeCalls = wave
			.flatMap((step) => step.toolCalls)
			.filter((call) => call.effect === 'write');
		if (writeCalls.length > 0) throw new WorkflowSafetyViolation(writeCalls);

		for (const step of wave) {
			params.budget.spentUsd += usageCost(step.usage) + step.toolCostUsd;
			for (const [draftIndex, draft] of step.result.artifact_drafts.entries()) {
				const artifactId = deterministicUuid(
					'phase-a.workflow.artifact',
					`${step.stepId}:${draftIndex}:${draft.artifact_type}`
				);
				const envelope = ArtifactEnvelopeSchema.parse({
					schema_version: 1,
					artifact_type: draft.artifact_type,
					artifact_version: 1,
					run_id: params.runId,
					producer_step_id: step.stepId,
					supersedes_artifact_id: null,
					summary: draft.summary,
					payload: draft.payload,
					provenance: draft.provenance,
					created_at: new Date(params.now()).toISOString()
				});
				params.artifacts.push({ artifactId, envelope });
				step.artifactIds.push(artifactId);
			}
			executed.push(step);
			completedByKey.set(step.spec.client_step_key, step);
			pending.delete(step.spec.client_step_key);
		}
	}

	const failedCount = executed.filter((step) => step.status === 'failed').length;
	const partialCount = executed.filter((step) => step.status === 'partial').length;
	const artifactCount = executed.reduce((total, step) => total + step.artifactIds.length, 0);
	const status: ExecutedStage['status'] =
		failedCount === executed.length || (failedCount > 0 && artifactCount === 0)
			? 'failed'
			: failedCount > 0 || partialCount > 0
				? 'partial'
				: 'completed';

	return { spec: params.stage, stageId, status, steps: executed };
}

export async function executeWorkflow(input: WorkflowEngineInput): Promise<WorkflowRunResult> {
	const routeDecision = RouteDecisionSchema.parse(input.routeDecision);
	if (routeDecision.route !== 'workflow') {
		throw new Error(
			`Workflow engine requires a workflow route, received ${routeDecision.route}`
		);
	}
	const permissionGrant = assertReadOnlyPermission(input.permissionGrant);
	const projectScope = input.projectScope.map((scope) => ProjectScopeSchema.parse(scope));
	const runId = input.runId ?? randomUUID();
	const now = input.now ?? Date.now;
	const startedAtMs = now();
	const initialUsage = [...(input.initialUsage ?? [])];
	const initialToolCostUsd = Math.max(0, input.initialToolCostUsd ?? 0);
	const budget: WorkflowBudgetState = {
		maxUsd: Math.max(0, input.maxUsd ?? PHASE_A_DEFAULT_MAX_USD),
		reservedUsd: 0,
		spentUsd: usageCost(initialUsage) + initialToolCostUsd,
		startedAtMs,
		maxWallClockMs: Math.max(1, input.maxWallClockMs ?? PHASE_A_DEFAULT_MAX_WALL_CLOCK_MS)
	};
	const stages: ExecutedStage[] = [];
	const artifacts: StoredArtifact[] = [];
	const transitions: TransitionDecision[] = [];
	const usage: ModelUsageEvent[] = initialUsage;
	let stageSpec = routeDecision.initial_stage;
	let replanCount = 0;
	let transitionModelCalls = 0;
	let forcedTransitions = 0;
	let terminalDecision: TransitionDecision | null = null;

	while (!terminalDecision) {
		if (stages.length >= PHASE_A_MAX_STAGES) {
			terminalDecision = terminalBudgetDecision('policy_limit_reached');
			transitions.push(terminalDecision);
			break;
		}
		if (remainingBudget(budget) <= 0 || now() - startedAtMs >= budget.maxWallClockMs) {
			terminalDecision = terminalBudgetDecision('budget_exhausted');
			transitions.push(terminalDecision);
			break;
		}

		const stage = await executeStage({
			runId,
			stage: stageSpec,
			stageIndex: stages.length,
			permissionGrant,
			agentExecutor: input.agentExecutor,
			artifacts,
			budget,
			now
		});
		stages.push(stage);
		usage.push(...stage.steps.flatMap((step) => step.usage));
		if (budget.spentUsd > budget.maxUsd || now() - startedAtMs >= budget.maxWallClockMs) {
			terminalDecision = terminalBudgetDecision('budget_exhausted');
			transitions.push(terminalDecision);
			break;
		}

		const policy = transitionPolicy({ stage, artifacts });
		const digest = buildWorkflowStateDigest({
			objective: routeDecision.objective,
			currentStage: stage,
			stages,
			artifacts,
			projectScope,
			permissionGrant,
			budget,
			allowedTransitions: policy.contractActions,
			nowMs: now()
		});
		// A gate with one legal action is not a decision; skip the model and record it as forced.
		const transitionResponse =
			policy.proposalActions.length > 1
				? await requestTransitionProposal({
						digest,
						allowedProposalActions: policy.proposalActions,
						model: input.transitionModel,
						maxCostUsd: remainingBudget(budget)
					})
				: {
						proposal: forcedTransitionProposal(policy.proposalActions[0]!),
						usage: [] as ModelUsageEvent[]
					};
		if (transitionResponse.usage.length > 0) transitionModelCalls += 1;
		else forcedTransitions += 1;
		usage.push(...transitionResponse.usage);
		budget.spentUsd += usageCost(transitionResponse.usage);
		if (budget.spentUsd > budget.maxUsd) {
			terminalDecision = terminalBudgetDecision('budget_exhausted');
			transitions.push(terminalDecision);
			break;
		}

		const contextArtifact = [...artifacts]
			.reverse()
			.find((artifact) => artifact.envelope.artifact_type === 'context_packet');
		const researchArtifacts = artifacts.filter(
			(artifact) => artifact.envelope.artifact_type === 'research_packet'
		);
		const decision = compileTransitionDecision({
			proposal: transitionResponse.proposal,
			objective: routeDecision.objective,
			contextArtifactId: contextArtifact?.artifactId ?? null,
			finalArtifactIds:
				researchArtifacts.length > 0
					? researchArtifacts.map((artifact) => artifact.artifactId)
					: artifacts.map((artifact) => artifact.artifactId)
		});
		transitions.push(decision);

		if (decision.action === 'append_stage') {
			if (stage.status !== 'completed') replanCount += 1;
			if (replanCount > PHASE_A_MAX_REPLANS) {
				terminalDecision = terminalBudgetDecision('policy_limit_reached');
				transitions.push(terminalDecision);
				break;
			}
			stageSpec = decision.next_stage;
			continue;
		}
		terminalDecision = decision;
	}

	let output = '';
	if (
		(terminalDecision.action === 'complete' ||
			terminalDecision.action === 'complete_partial') &&
		terminalDecision.final_artifact_ids.length > 0 &&
		remainingBudget(budget) > 0
	) {
		const selected = new Set(finalIds(terminalDecision));
		const synthesisArtifacts = artifacts.filter((artifact) =>
			selected.has(artifact.artifactId)
		);
		const synthesis = await input.synthesisModel.generateText({
			promptVersion: SYNTHESIS_PROMPT_VERSION,
			systemPrompt: SYNTHESIS_SYSTEM_PROMPT,
			userPrompt: buildSynthesisPrompt({
				objective: routeDecision.objective,
				artifacts: synthesisArtifacts,
				partial: terminalDecision.action === 'complete_partial'
			}),
			temperature: SYNTHESIS_MODEL_TEMPERATURE,
			maxTokens: SYNTHESIS_MODEL_MAX_TOKENS,
			maxCostUsd: remainingBudget(budget)
		});
		usage.push(...synthesis.usage);
		budget.spentUsd += usageCost(synthesis.usage);
		output = synthesis.text.trim();
	}

	const toolCalls = stages.flatMap((stage) => stage.steps.flatMap((step) => step.toolCalls));
	const toolCostUsd =
		initialToolCostUsd +
		stages.reduce(
			(stageTotal, stage) =>
				stageTotal +
				stage.steps.reduce((stepTotal, step) => stepTotal + step.toolCostUsd, 0),
			0
		);
	const modelCostUsd = usageCost(usage);
	const budgetExceeded = modelCostUsd + toolCostUsd > budget.maxUsd;

	return {
		runId,
		status: budgetExceeded ? 'failed' : terminalStatus(terminalDecision),
		output: budgetExceeded ? '' : output,
		routeDecision,
		stages,
		artifacts,
		transitions,
		usage,
		toolCalls,
		modelCostUsd,
		toolCostUsd,
		totalCostUsd: modelCostUsd + toolCostUsd,
		durationMs: Math.max(0, now() - startedAtMs),
		stageCount: stages.length,
		replanCount,
		transitionModelCalls,
		forcedTransitions,
		budgetExceeded
	};
}
