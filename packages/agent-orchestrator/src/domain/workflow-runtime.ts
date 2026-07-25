import type {
	AgentResult,
	ArtifactEnvelope,
	ModelUsageEvent,
	StepSpec,
	WorkflowStageSpec
} from '../contracts';

export interface StoredArtifact {
	artifactId: string;
	envelope: ArtifactEnvelope;
}

export interface WorkflowToolCall {
	operation: string;
	effect: 'read' | 'write';
	succeeded: boolean;
	error: string | null;
}

export interface ExecutedStep {
	spec: StepSpec;
	stepId: string;
	status: 'completed' | 'partial' | 'failed';
	result: AgentResult;
	artifactIds: string[];
	usage: ModelUsageEvent[];
	toolCostUsd: number;
	toolCalls: WorkflowToolCall[];
}

export interface ExecutedStage {
	spec: WorkflowStageSpec;
	stageId: string;
	status: 'completed' | 'partial' | 'failed';
	steps: ExecutedStep[];
}
