import {
	WorkflowStateDigestSchema,
	type PermissionGrant,
	type ProjectScope,
	type TransitionAction,
	type WorkflowStateDigest
} from '../../contracts';
import type { ExecutedStage, StoredArtifact } from '../../domain';

export interface WorkflowBudgetState {
	maxUsd: number;
	reservedUsd: number;
	spentUsd: number;
	startedAtMs: number;
	maxWallClockMs: number;
}

function estimateTokens(value: unknown): number {
	return Math.ceil(JSON.stringify(value).length / 4);
}

export function buildWorkflowStateDigest(params: {
	objective: string;
	currentStage: ExecutedStage;
	stages: ExecutedStage[];
	artifacts: StoredArtifact[];
	projectScope: ProjectScope[];
	permissionGrant: PermissionGrant;
	budget: WorkflowBudgetState;
	allowedTransitions: TransitionAction[];
	nowMs: number;
}): WorkflowStateDigest {
	const acceptanceFailures = params.stages.flatMap((stage) =>
		stage.steps.flatMap((step) =>
			step.result.acceptance_results.filter((result) => result.status === 'failed')
		)
	);
	const openQuestions = params.stages.flatMap((stage) =>
		stage.steps.flatMap((step) => step.result.open_questions)
	);
	const runtime = {
		schema_version: 1 as const,
		objective: params.objective,
		current_stage: {
			stage_id: params.currentStage.stageId,
			client_stage_key: params.currentStage.spec.client_stage_key,
			label: params.currentStage.spec.label,
			purpose: params.currentStage.spec.purpose,
			status: 'waiting_decision' as const
		},
		wake_reason:
			params.currentStage.status === 'failed'
				? ('stage_failed' as const)
				: ('stage_joined' as const),
		steps: params.stages
			.flatMap((stage) => stage.steps)
			.sort((left, right) => {
				const priority = { failed: 0, partial: 1, completed: 2 } as const;
				return priority[left.status] - priority[right.status];
			})
			.map((step) => ({
				step_id: step.stepId,
				client_step_key: step.spec.client_step_key,
				agent_id: step.spec.agent_id,
				label: step.spec.user_visible_label,
				status: step.status,
				summary: step.result.summary,
				artifact_ids: step.artifactIds
			})),
		artifacts: params.artifacts.map((artifact) => ({
			artifact_id: artifact.artifactId,
			artifact_type: artifact.envelope.artifact_type,
			summary: artifact.envelope.summary,
			producer_step_id: artifact.envelope.producer_step_id,
			content_trust: 'untrusted' as const
		})),
		acceptance_failures: acceptanceFailures,
		contradictions: [] as string[],
		open_questions: openQuestions,
		user_signals: [],
		project_scope: params.projectScope,
		budget: {
			max_usd: params.budget.maxUsd,
			reserved_usd: params.budget.reservedUsd,
			spent_usd: params.budget.spentUsd,
			remaining_usd: Math.max(
				0,
				params.budget.maxUsd - params.budget.reservedUsd - params.budget.spentUsd
			),
			elapsed_ms: Math.max(0, params.nowMs - params.budget.startedAtMs),
			remaining_wall_clock_ms: Math.max(
				0,
				params.budget.maxWallClockMs - (params.nowMs - params.budget.startedAtMs)
			)
		},
		permission_grant: params.permissionGrant,
		allowed_transitions: params.allowedTransitions,
		overflow: {
			truncated: false,
			omitted_item_count: 0,
			omitted_sections: [] as string[]
		},
		estimated_tokens: 0
	};

	const omit = (section: string): void => {
		runtime.overflow.truncated = true;
		runtime.overflow.omitted_item_count += 1;
		if (!runtime.overflow.omitted_sections.includes(section)) {
			runtime.overflow.omitted_sections.push(section);
		}
	};
	const tooLarge = (): boolean => estimateTokens(runtime) > 4_000;

	// Preserve failures, failed/partial steps, and recent artifacts before older successful detail.
	while (tooLarge() && runtime.artifacts.length > 4) {
		runtime.artifacts.shift();
		omit('older_artifacts');
	}
	while (tooLarge()) {
		let completedIndex = -1;
		for (let index = runtime.steps.length - 1; index >= 0; index -= 1) {
			if (runtime.steps[index]?.status === 'completed') {
				completedIndex = index;
				break;
			}
		}
		if (completedIndex < 0) break;
		runtime.steps.splice(completedIndex, 1);
		omit('completed_steps');
	}
	while (tooLarge() && runtime.open_questions.length > 0) {
		runtime.open_questions.pop();
		omit('open_questions');
	}
	while (tooLarge() && runtime.artifacts.length > 0) {
		runtime.artifacts.shift();
		omit('artifacts');
	}
	while (tooLarge() && runtime.steps.length > 0) {
		runtime.steps.pop();
		omit('steps');
	}
	while (tooLarge() && runtime.acceptance_failures.length > 0) {
		runtime.acceptance_failures.pop();
		omit('acceptance_failures');
	}

	runtime.estimated_tokens = estimateTokens(runtime);
	return WorkflowStateDigestSchema.parse(runtime);
}
