// apps/worker/src/workers/agentic-chat/provider/steps.ts
import { TOOL_METADATA } from '@buildos/agentic-chat-runtime/catalog';
import type { ToolValidationIssue } from '@buildos/agentic-chat-runtime/loop';
import { createStableAgenticChatMutationLogicalOperationIdV1 } from '../effectIdentity';
import { createStableAgenticChatReadToolTransitionIdV1 } from '../readToolIdentity';
import {
	isAgenticChatControlToolNameV1,
	isAgenticChatProductionReadToolNameV1
} from '../tools/execution-adapter';
import type { AgenticChatReadToolExecutionV1 } from '../toolExecution';
import { reviewedAgenticChatMutationSpecV1 } from '../mutationToolCatalog';
import type { AgenticChatProviderStepV1, AgenticChatTurnProviderRequestV1 } from './contracts';
import type { AgenticChatFeedbackToolCall } from './feedback';
import {
	type CompletedProviderToolCall,
	providerToolNotAllowlistedError
} from './stream-tool-calls';
import { validationFailureError } from './validation';

type ProviderToolStepContext = {
	resolveMemoServed(call: CompletedProviderToolCall): AgenticChatReadToolExecutionV1 | null;
};

export function buildPlanningStep(
	request: AgenticChatTurnProviderRequestV1,
	providerToolCallId: string
): Extract<AgenticChatProviderStepV1, { type: 'semantic' }> {
	return {
		type: 'semantic',
		transitionId: createStableAgenticChatReadToolTransitionIdV1({
			turnRunId: request.turnRunId,
			providerToolCallId,
			stage: 'planning'
		}),
		phase: 'stream',
		eventType: 'agent_state',
		currentActivity: 'Working...',
		eventPayload: {
			type: 'agent_state',
			state: 'thinking',
			contextType: request.contextType,
			details: 'Working...'
		}
	};
}

export function buildReadToolStep(
	request: AgenticChatTurnProviderRequestV1,
	call: CompletedProviderToolCall,
	memoServed: AgenticChatReadToolExecutionV1 | null = null
): Extract<AgenticChatProviderStepV1, { type: 'read_tool' }> {
	const base = buildReadToolStepBase(request, call);
	return memoServed ? { ...base, memoServed } : base;
}

export function normalizeCompletedProviderCalls(
	request: AgenticChatTurnProviderRequestV1,
	calls: readonly CompletedProviderToolCall[]
): AgenticChatFeedbackToolCall[] {
	return calls.map((call, index) => {
		if (isAgenticChatProductionReadToolNameV1(call.name)) {
			const decidedBy =
				call.decidedBy ??
				(isAgenticChatControlToolNameV1(call.name) ? ('acting_model' as const) : undefined);
			return {
				...call,
				kind: 'read',
				...(decidedBy ? { decidedBy } : {})
			};
		}
		const spec = reviewedAgenticChatMutationSpecV1(call.name);
		if (spec) {
			return {
				...call,
				kind: 'mutation',
				logicalOperationId: createStableAgenticChatMutationLogicalOperationIdV1({
					turnRunId: request.turnRunId,
					providerRound: request.logicalProviderRound,
					callIndex: index + 1
				}),
				operationName: spec.operationName,
				downstreamIdempotencySupported: spec.downstreamIdempotencySupported
			};
		}
		throw providerToolNotAllowlistedError(call.name, request.tools);
	});
}

export function buildProviderToolStep(
	request: AgenticChatTurnProviderRequestV1,
	call: AgenticChatFeedbackToolCall,
	context: ProviderToolStepContext
): AgenticChatProviderStepV1 {
	const scheduling = call.scheduling ? { scheduling: call.scheduling } : {};
	if (call.kind === 'read') {
		return buildReadToolStep(request, call, context.resolveMemoServed(call));
	}
	return {
		...scheduling,
		logicalProviderRound: request.logicalProviderRound,
		type: 'mutating_tool',
		callTransitionId: createStableAgenticChatReadToolTransitionIdV1({
			turnRunId: request.turnRunId,
			providerToolCallId: call.id,
			stage: 'call'
		}),
		resultTransitionId: createStableAgenticChatReadToolTransitionIdV1({
			turnRunId: request.turnRunId,
			providerToolCallId: call.id,
			stage: 'result'
		}),
		logicalOperationId: call.logicalOperationId,
		providerToolCallId: call.id,
		toolName: call.name,
		operationName: call.operationName,
		arguments: call.arguments,
		downstreamIdempotencySupported: call.downstreamIdempotencySupported
	};
}

export function buildValidationFailureReadToolStep(
	request: AgenticChatTurnProviderRequestV1,
	call: CompletedProviderToolCall,
	issues: ToolValidationIssue[]
): Extract<AgenticChatProviderStepV1, { type: 'read_tool' }> {
	return {
		...buildReadToolStepBase(request, call),
		validationFailure: {
			error: validationFailureError(issues),
			toolCategory: TOOL_METADATA[call.name]?.category ?? null
		}
	};
}

function buildReadToolStepBase(
	request: AgenticChatTurnProviderRequestV1,
	call: CompletedProviderToolCall
) {
	return {
		...(call.scheduling ? { scheduling: call.scheduling } : {}),
		logicalProviderRound: request.logicalProviderRound,
		type: 'read_tool',
		callTransitionId: createStableAgenticChatReadToolTransitionIdV1({
			turnRunId: request.turnRunId,
			providerToolCallId: call.id,
			stage: 'call'
		}),
		resultTransitionId: createStableAgenticChatReadToolTransitionIdV1({
			turnRunId: request.turnRunId,
			providerToolCallId: call.id,
			stage: 'result'
		}),
		providerToolCallId: call.id,
		toolName: call.name,
		arguments: call.arguments,
		...(call.decidedBy ? { decidedBy: call.decidedBy } : {})
	} as const;
}
