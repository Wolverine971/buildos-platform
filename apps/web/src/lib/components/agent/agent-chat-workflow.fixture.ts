// apps/web/src/lib/components/agent/agent-chat-workflow.fixture.ts
import {
	AGENTIC_CHAT_WORKFLOW_CONTRACT_VERSION,
	AGENTIC_CHAT_WORKFLOW_PROJECTION_VERSION,
	type AgenticChatWorkflowProjectionV1
} from '@buildos/shared-types';

export function workflowProjectionFixture(
	overrides: Partial<AgenticChatWorkflowProjectionV1> = {}
): AgenticChatWorkflowProjectionV1 {
	return {
		version: AGENTIC_CHAT_WORKFLOW_PROJECTION_VERSION,
		workflowVersion: AGENTIC_CHAT_WORKFLOW_CONTRACT_VERSION,
		reviewIntent: 'project_review',
		phase: 'preparing',
		terminalOutcome: null,
		steps: [
			{ key: 'planner', label: 'Plan the review' },
			{ key: 'project_analyst', label: 'Project analyst' },
			{ key: 'risk_reviewer', label: 'Risk and alternatives reviewer' },
			{ key: 'editor', label: 'Combine recommendations' }
		].map((step) => ({
			...step,
			key: step.key as AgenticChatWorkflowProjectionV1['steps'][number]['key'],
			status: 'pending',
			quality: null,
			attemptsUsed: 0,
			acceptedFinding: null,
			failureCode: null
		})),
		answer: {
			answerId: null,
			status: 'not_started',
			durableBytes: 0,
			textSha256: null,
			editorStepAttemptId: null,
			acceptedAt: null
		},
		transport: {
			executionState: 'active',
			lastDurableProgressAt: null,
			providerActivity: { state: 'idle', lastObservedAt: null },
			delivery: { state: 'connected', lastObservedAt: null }
		},
		coverageGap: null,
		...overrides
	};
}
