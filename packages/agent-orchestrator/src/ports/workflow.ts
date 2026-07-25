import type {
	AgentResult,
	ArtifactEnvelope,
	PermissionGrant,
	StepSpec,
	WorkflowStateDigest
} from '../contracts';
import type { MeteredTextResponse, ModelUsageEvent } from './model-usage';

export interface AgentInputArtifact {
	artifactId: string;
	envelope: ArtifactEnvelope;
}

export interface AgentToolCall {
	operation: string;
	effect: 'read' | 'write';
	succeeded: boolean;
	error: string | null;
}

export interface AgentExecutionRequest {
	runId: string;
	stepId: string;
	step: StepSpec;
	inputArtifacts: AgentInputArtifact[];
	permissionGrant: PermissionGrant;
	maxCostUsd: number;
}

export interface AgentExecutionResponse {
	result: AgentResult;
	usage: ModelUsageEvent[];
	toolCostUsd: number;
	toolCalls: AgentToolCall[];
}

export interface AgentExecutorPort {
	execute(request: AgentExecutionRequest): Promise<AgentExecutionResponse>;
}

export interface TransitionModelCall {
	promptVersion: string;
	attempt: 1 | 2;
	systemPrompt: string;
	userPrompt: string;
	temperature: number;
	maxTokens: number;
	maxCostUsd: number;
}

export interface MeteredJsonResponse {
	value: unknown;
	usage: ModelUsageEvent[];
}

export interface TransitionModelPort {
	generateJson(call: TransitionModelCall): Promise<MeteredJsonResponse>;
}

export interface SynthesisModelCall {
	promptVersion: string;
	systemPrompt: string;
	userPrompt: string;
	temperature: number;
	maxTokens: number;
	maxCostUsd: number;
}

export interface SynthesisModelPort {
	generateText(call: SynthesisModelCall): Promise<MeteredTextResponse>;
}

export interface TransitionContext {
	digest: WorkflowStateDigest;
	hasContextPacket: boolean;
	hasResearchPacket: boolean;
}
