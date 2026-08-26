// apps/worker/src/workers/agentic-chat/provider/supervisor-runtime.ts
import { type JsonValue, canonicalizeAgenticChatJson } from '@buildos/shared-types';
import type { AgenticChatWorkerSupervisorPortV1 } from '../workerSupervisor';
import {
	type AgenticChatSupervisorBlockedToolCallV1,
	type AgenticChatSupervisorTerminalRequestV1,
	type AgenticChatWorkerSupervisorEffectsV1,
	reduceAgenticChatWorkerSupervisorDecisionsV1
} from '../workerSupervisorDecisions';
import type {
	AgenticChatProviderStepV1,
	AgenticChatProviderToolSynthesisInputV1,
	AgenticChatProviderUsageV1,
	AgenticChatTurnProviderRequestV1
} from './contracts';
import { type AgenticChatFeedbackToolCall, isFailedToolFeedback } from './feedback';
import { providerError } from './protocol';
import { appendSystemInstruction, forceToolFreeRequest } from './request-builders';
import type { CompletedProviderToolCall } from './stream-tool-calls';

type SupervisorState = {
	supervisor: AgenticChatProviderSupervisorRuntime | null;
};

type SupervisorToolRoundState = SupervisorState & {
	recordProviderToolCalls(count: number): void;
	getProviderToolCallCount(): number;
};

export class AgenticChatProviderSupervisorRuntime {
	private started = false;
	private readonly pendingSupervisorSteps: Extract<
		AgenticChatProviderStepV1,
		{ type: 'semantic' | 'supervisor_evaluation' }
	>[] = [];
	private readonly pendingProviderInstructions: string[] = [];
	private readonly blockedToolCalls = new Map<string, AgenticChatSupervisorBlockedToolCallV1>();
	private pendingTerminalRequest: AgenticChatSupervisorTerminalRequestV1 | null = null;
	private forceSynthesis = false;

	constructor(private readonly port: AgenticChatWorkerSupervisorPortV1) {}

	start(): void {
		if (this.started) {
			throw providerError('provider_supervisor_reused', 'unknown');
		}
		this.started = true;
		this.apply(reduceAgenticChatWorkerSupervisorDecisionsV1(this.port.start()));
	}

	observe(observation: Parameters<AgenticChatWorkerSupervisorPortV1['observe']>[0]): void {
		if (!this.started) {
			throw providerError('provider_supervisor_not_started', 'unknown');
		}
		this.apply(reduceAgenticChatWorkerSupervisorDecisionsV1(this.port.observe(observation)));
	}

	drainSteps(): Extract<
		AgenticChatProviderStepV1,
		{ type: 'semantic' | 'supervisor_evaluation' }
	>[] {
		return this.pendingSupervisorSteps.splice(0, this.pendingSupervisorSteps.length);
	}

	takeBlockedToolCalls(
		calls: readonly CompletedProviderToolCall[]
	): ReadonlyMap<string, AgenticChatSupervisorBlockedToolCallV1> {
		const callIds = new Set(calls.map((call) => call.id));
		for (const providerToolCallId of this.blockedToolCalls.keys()) {
			if (!callIds.has(providerToolCallId)) {
				throw providerError('provider_supervisor_block_identity_mismatch', 'permanent');
			}
		}
		const blocked = new Map(this.blockedToolCalls);
		this.blockedToolCalls.clear();
		return blocked;
	}

	takeSupervisorQuestion(): Extract<
		AgenticChatSupervisorTerminalRequestV1,
		{ kind: 'ask_user' }
	> | null {
		if (this.pendingTerminalRequest?.kind !== 'ask_user') return null;
		const terminal = this.pendingTerminalRequest;
		this.pendingTerminalRequest = null;
		return terminal;
	}

	applyProviderDirectives(request: AgenticChatTurnProviderRequestV1): {
		request: AgenticChatTurnProviderRequestV1;
		forceSynthesis: boolean;
	} {
		if (this.pendingTerminalRequest) {
			throw providerError('provider_supervisor_terminal_not_consumed', 'unknown');
		}
		let next = request;
		for (const instruction of this.pendingProviderInstructions.splice(
			0,
			this.pendingProviderInstructions.length
		)) {
			next = appendSystemInstruction(next, instruction);
		}
		const forceSynthesis = this.forceSynthesis;
		this.forceSynthesis = false;
		return {
			request: forceSynthesis ? forceToolFreeRequest(next) : next,
			forceSynthesis
		};
	}

	private apply(effects: AgenticChatWorkerSupervisorEffectsV1): void {
		this.pendingSupervisorSteps.push(...effects.semanticSteps, ...effects.evaluationFlags);
		this.pendingProviderInstructions.push(...effects.providerInstructions);
		this.forceSynthesis ||= effects.forceSynthesis;

		for (const blocked of effects.blockedToolCalls) {
			if (this.blockedToolCalls.has(blocked.providerToolCallId)) {
				throw providerError('provider_supervisor_duplicate_block', 'permanent');
			}
			this.blockedToolCalls.set(blocked.providerToolCallId, blocked);
		}
		if (effects.terminalRequest?.kind === 'ask_user') {
			if (this.pendingTerminalRequest) {
				throw providerError('provider_supervisor_duplicate_terminal', 'permanent');
			}
			this.pendingTerminalRequest = effects.terminalRequest;
		}
		if (effects.terminalRequest?.kind === 'stop') {
			throw providerError('provider_supervisor_stop_required', 'permanent');
		}
	}
}

export function drainSupervisorSteps(
	supervisor: AgenticChatProviderSupervisorRuntime | null
): readonly Extract<AgenticChatProviderStepV1, { type: 'semantic' | 'supervisor_evaluation' }>[] {
	return supervisor?.drainSteps() ?? [];
}

export function observeSupervisorToolCalls(
	state: SupervisorToolRoundState,
	calls: readonly CompletedProviderToolCall[]
): ReadonlyMap<string, AgenticChatSupervisorBlockedToolCallV1> {
	state.recordProviderToolCalls(calls.length);
	for (const call of calls) {
		state.supervisor?.observe({
			type: 'tool_call_emitted',
			toolName: call.name,
			toolCallId: call.id,
			argsPreview: call.arguments
		});
	}
	return state.supervisor?.takeBlockedToolCalls(calls) ?? new Map();
}

export function observeSupervisorPreExecutionFailure(
	state: SupervisorToolRoundState,
	call: CompletedProviderToolCall,
	error: string,
	round: number
): void {
	state.supervisor?.observe({
		type: 'tool_result_received',
		toolName: call.name,
		toolCallId: call.id,
		success: false,
		error,
		resultSummary: error
	});
	state.supervisor?.observe({
		type: 'tool_round_completed',
		round,
		toolCallsMade: state.getProviderToolCallCount()
	});
}

export function observeSupervisorDurableToolResults(
	state: SupervisorState,
	calls: readonly AgenticChatFeedbackToolCall[],
	feedback: readonly AgenticChatProviderToolSynthesisInputV1[]
): void {
	for (let index = 0; index < calls.length; index += 1) {
		const call = calls[index]!;
		const result = feedback[index]!;
		if (isFailedToolFeedback(result)) {
			state.supervisor?.observe({
				type: 'tool_result_received',
				toolName: call.name,
				toolCallId: call.id,
				success: false,
				error: result.failure.error,
				resultSummary: canonicalizeAgenticChatJson(result.failure.modelPayload as JsonValue)
			});
			continue;
		}
		state.supervisor?.observe({
			type: 'tool_result_received',
			toolName: call.name,
			toolCallId: call.id,
			success: true,
			resultSummary: canonicalizeAgenticChatJson(result.execution.result as JsonValue)
		});
	}
}

export function supervisorUsage(
	usage: AgenticChatProviderUsageV1 | null
): { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined {
	if (!usage) return undefined;
	return {
		prompt_tokens: usage.promptTokens,
		completion_tokens: usage.completionTokens,
		total_tokens: usage.totalTokens
	};
}
