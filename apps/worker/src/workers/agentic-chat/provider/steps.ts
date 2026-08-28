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
import type { AgenticChatSupervisorBlockedToolCallV1 } from '../workerSupervisorDecisions';
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
	turnRunId: string,
	call: CompletedProviderToolCall,
	memoServed: AgenticChatReadToolExecutionV1 | null = null
): Extract<AgenticChatProviderStepV1, { type: 'read_tool' }> {
	const base = buildReadToolStepBase(turnRunId, call);
	return memoServed ? { ...base, memoServed } : base;
}

export function normalizeCompletedProviderCalls(
	request: AgenticChatTurnProviderRequestV1,
	calls: readonly CompletedProviderToolCall[],
	blockedToolCalls: ReadonlyMap<string, AgenticChatSupervisorBlockedToolCallV1> = new Map()
): AgenticChatFeedbackToolCall[] {
	return calls.map((call, index) => {
		const supervisorFailure = blockedToolCalls.get(call.id);
		if (isAgenticChatProductionReadToolNameV1(call.name)) {
			const decidedBy =
				call.decidedBy ??
				(isAgenticChatControlToolNameV1(call.name) ? ('acting_model' as const) : undefined);
			return {
				...call,
				kind: 'read',
				...(decidedBy ? { decidedBy } : {}),
				...(supervisorFailure ? { supervisorFailure } : {})
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
				downstreamIdempotencySupported: spec.downstreamIdempotencySupported,
				...(supervisorFailure ? { supervisorFailure } : {})
			};
		}
		throw providerToolNotAllowlistedError(call.name, request.tools);
	});
}

export function buildProviderToolStep(
	turnRunId: string,
	call: AgenticChatFeedbackToolCall,
	context: ProviderToolStepContext
): AgenticChatProviderStepV1 {
	const scheduling = call.scheduling ? { scheduling: call.scheduling } : {};
	if (call.supervisorFailure) {
		return {
			...scheduling,
			type: 'pre_execution_tool_failure',
			callTransitionId: createStableAgenticChatReadToolTransitionIdV1({
				turnRunId,
				providerToolCallId: call.id,
				stage: 'call'
			}),
			resultTransitionId: createStableAgenticChatReadToolTransitionIdV1({
				turnRunId,
				providerToolCallId: call.id,
				stage: 'result'
			}),
			providerToolCallId: call.id,
			toolName: call.name,
			arguments: call.arguments,
			failure: {
				kind: 'supervisor_block',
				error: call.supervisorFailure.error,
				toolCategory: TOOL_METADATA[call.name]?.category ?? null,
				modelPayload: call.supervisorFailure.modelPayload
			}
		};
	}
	if (call.kind === 'read') {
		return buildReadToolStep(turnRunId, call, context.resolveMemoServed(call));
	}
	return {
		...scheduling,
		type: 'mutating_tool',
		callTransitionId: createStableAgenticChatReadToolTransitionIdV1({
			turnRunId,
			providerToolCallId: call.id,
			stage: 'call'
		}),
		resultTransitionId: createStableAgenticChatReadToolTransitionIdV1({
			turnRunId,
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
	turnRunId: string,
	call: CompletedProviderToolCall,
	issues: ToolValidationIssue[]
): Extract<AgenticChatProviderStepV1, { type: 'read_tool' }> {
	return {
		...buildReadToolStepBase(turnRunId, call),
		validationFailure: {
			error: validationFailureError(issues),
			toolCategory: TOOL_METADATA[call.name]?.category ?? null
		}
	};
}

function buildReadToolStepBase(turnRunId: string, call: CompletedProviderToolCall) {
	return {
		...(call.scheduling ? { scheduling: call.scheduling } : {}),
		type: 'read_tool',
		callTransitionId: createStableAgenticChatReadToolTransitionIdV1({
			turnRunId,
			providerToolCallId: call.id,
			stage: 'call'
		}),
		resultTransitionId: createStableAgenticChatReadToolTransitionIdV1({
			turnRunId,
			providerToolCallId: call.id,
			stage: 'result'
		}),
		providerToolCallId: call.id,
		toolName: call.name,
		arguments: call.arguments,
		...(call.decidedBy ? { decidedBy: call.decidedBy } : {})
	} as const;
}
