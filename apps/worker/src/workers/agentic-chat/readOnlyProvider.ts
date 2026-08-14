// apps/worker/src/workers/agentic-chat/readOnlyProvider.ts

import { createHash } from 'node:crypto';
import {
	AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
	type ChatToolCall,
	type ChatToolDefinition,
	type ChatToolResult,
	type ContextUsageSnapshot,
	type JsonObject,
	type JsonValue,
	appendAgenticChatAttachmentContextV1,
	buildAgenticChatAttachmentDisplayTextV1,
	canonicalizeAgenticChatJson
} from '@buildos/shared-types';
import {
	ContextGatheringLedger,
	NO_TOOL_SYNTHESIS_EMPTY_RETRY_MESSAGE,
	NO_TOOL_SYNTHESIS_TOOL_RETRY_MESSAGE,
	READ_LOOP_REPAIR_RANK,
	TOOL_METADATA,
	type ToolValidationIssue,
	buildMemoServedResult,
	buildReadLoopRepairInstruction,
	buildReadMemoKey,
	buildRoundToolPattern,
	buildToolPayloadForModel,
	buildToolValidationRepairInstruction,
	isPureReadToolName,
	parseToolArguments,
	provideAgenticChatLoopToolCatalog,
	sanitizeAssistantFinalText,
	selectReadLoopRepairEscalation,
	shouldMemoizeReadResult,
	validateToolCalls
} from '@buildos/agentic-chat-runtime/loop';
import type { AgenticChatWorkerExecutionInputV1 } from './executionInput';
import {
	AGENTIC_CHAT_WORKER_PROMPT_SNAPSHOT_VERSION,
	type AgenticChatPreparedProviderInvocationV1,
	type AgenticChatProviderExecutionDiagnosticV1,
	AgenticChatProviderExecutionError,
	type AgenticChatProviderInputV1,
	type AgenticChatProviderMutationSynthesisInputV1,
	type AgenticChatProviderPortV1,
	type AgenticChatProviderReadSynthesisInputV1,
	type AgenticChatProviderStepV1,
	type AgenticChatProviderToolSynthesisInputV1,
	type AgenticChatProviderUsageV1
} from './providerContract';
import { AgenticChatProviderCapacity, AgenticChatProviderCapacityError } from './providerCapacity';
import { createStableAgenticChatMutationLogicalOperationIdV1 } from './effectIdentity';
import { createStableAgenticChatReadToolTransitionIdV1 } from './readToolIdentity';
import {
	AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1,
	isAgenticChatProductionReadToolNameV1
} from './readOnlyTool';
import type { AgenticChatReadToolExecutionV1 } from './toolExecution';
import type {
	AgenticChatLiveVisionResolveInputV1,
	AgenticChatLiveVisionResolverPortV1
} from './liveVision';
import type {
	AgenticChatWorkerSupervisorFactoryV1,
	AgenticChatWorkerSupervisorPortV1
} from './workerSupervisor';
import {
	type AgenticChatSupervisorBlockedToolCallV1,
	type AgenticChatSupervisorTerminalRequestV1,
	type AgenticChatWorkerSupervisorEffectsV1,
	reduceAgenticChatWorkerSupervisorDecisionsV1
} from './workerSupervisorDecisions';
import {
	AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1,
	type AgenticChatProviderMutationCapabilitiesV1,
	reviewedAgenticChatMutationSpecV1
} from './mutationToolCatalog';

const DEFAULT_MAX_PROVIDER_ROUNDS = 16;
const MAX_PROVIDER_TOOL_CALLS_PER_ROUND = 40;
const MAX_VALIDATION_REPAIR_ROUNDS = 2;
const MAX_FORCED_SYNTHESIS_RETRIES = 1;
const CANONICAL_UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const WORKER_READ_LOOP_CATALOG_ENTRIES = AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1.map(
	(toolName) => {
		const op = workerReadOpForToolName(toolName);
		return [toolName, { op, tool_name: toolName, kind: 'read' as const }] as const;
	}
);
const WORKER_MUTATION_LOOP_CATALOG_ENTRIES = Object.entries(
	AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1
).map(
	([toolName, spec]) =>
		[toolName, { op: spec.operationName, tool_name: toolName, kind: 'write' as const }] as const
);
const WORKER_LOOP_CATALOG = Object.freeze({
	ops: Object.freeze(
		Object.fromEntries(
			[...WORKER_READ_LOOP_CATALOG_ENTRIES, ...WORKER_MUTATION_LOOP_CATALOG_ENTRIES].map(
				([, entry]) => [entry.op, entry]
			)
		)
	),
	byToolName: Object.freeze(
		Object.fromEntries([
			...WORKER_READ_LOOP_CATALOG_ENTRIES,
			...WORKER_MUTATION_LOOP_CATALOG_ENTRIES
		])
	)
});

// Worker and web are separate hosts. Web installs its full registry; the
// worker installs reviewed reads plus capability-gated mutation identities.
provideAgenticChatLoopToolCatalog(() => WORKER_LOOP_CATALOG);

export type AgenticChatReadOnlyProviderContentPartV1 =
	| { type: 'text'; text: string }
	| {
			type: 'image_url';
			image_url: { url: string; detail: 'auto' | 'low' | 'high' };
	  };

export type AgenticChatReadOnlyProviderMessageV1 = {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string | AgenticChatReadOnlyProviderContentPartV1[];
	tool_calls?: JsonObject[];
	tool_call_id?: string;
};

export type AgenticChatReadOnlyProviderToolV1 = {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: JsonObject;
	};
};

export type AgenticChatReadOnlyProviderClientEventV1 =
	| { type: 'text'; content: string }
	| { type: 'reasoning'; reasoning?: string; reasoning_details?: unknown[] }
	| {
			type: 'done';
			finishedReason?: string;
			usage?: {
				promptTokens?: number;
				completionTokens?: number;
				totalTokens?: number;
				prompt_tokens?: number;
				completion_tokens?: number;
				total_tokens?: number;
			};
	  }
	| { type: 'tool_call'; toolCall: unknown }
	| { type: 'error'; error: string; retryable: boolean };

export type AgenticChatReadOnlyProviderClientPortV1 = {
	stream(input: {
		messages: readonly AgenticChatReadOnlyProviderMessageV1[];
		tools: readonly AgenticChatReadOnlyProviderToolV1[];
		toolChoice: 'none' | 'auto';
		userId: string;
		sessionId: string;
		turnRunId: string;
		streamRunId: string;
		clientTurnId: string;
		contextType: string;
		entityId: string | null;
		projectId: string | null;
		queueJobId: string;
		processingToken: string;
		executionGeneration: number;
		providerRound: 'initial' | 'synthesis';
		logicalProviderRound: number;
		signal: AbortSignal;
	}): AsyncIterable<AgenticChatReadOnlyProviderClientEventV1>;
};

type ClientRequest = Parameters<AgenticChatReadOnlyProviderClientPortV1['stream']>[0] & {
	liveVisionRequest?: Omit<AgenticChatLiveVisionResolveInputV1, 'signal'>;
};

type CompletedProviderToolCall = {
	id: string;
	name: string;
	arguments: JsonObject;
	canonicalArguments: string;
};

type NormalizedProviderToolCall = CompletedProviderToolCall &
	(
		| { kind: 'read'; supervisorFailure?: AgenticChatSupervisorBlockedToolCallV1 }
		| {
				kind: 'mutation';
				logicalOperationId: string;
				operationName: string;
				downstreamIdempotencySupported: boolean;
				supervisorFailure?: AgenticChatSupervisorBlockedToolCallV1;
		  }
	);

type PendingToolRound = {
	calls: readonly NormalizedProviderToolCall[];
	usage: AgenticChatProviderUsageV1 | null;
};

type ToolRoundStreamState = {
	supervisor: AgenticChatProviderSupervisorRuntime | null;
	release(): void;
	recordProviderToolCalls(count: number): void;
	getProviderToolCallCount(): number;
	setPendingToolRound(value: PendingToolRound): void;
	markToolRoundCompleted(): void;
	setCurrentRequest(value: ClientRequest): void;
	resolveMemoServed(call: CompletedProviderToolCall): AgenticChatReadToolExecutionV1 | null;
};

class AgenticChatProviderSupervisorRuntime {
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

	applyProviderDirectives(request: ClientRequest): {
		request: ClientRequest;
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

/**
 * Default-off Phase 3 provider boundary. Preparation validates the immutable
 * command and reserves local provider capacity; its returned stream performs
 * the first network call only after the executor wins execution-start.
 *
 * The reviewed surface is the immutable admission artifact intersected with
 * the worker's shared read allowlist and explicit mutation capabilities. The
 * default capability set is empty. Provider calls stay sequential and every
 * durable tool result crosses the shared payload and round policies before
 * another provider pass begins.
 */
export class AgenticChatReadOnlyProviderAdapter implements AgenticChatProviderPortV1 {
	constructor(
		private readonly ports: {
			client: AgenticChatReadOnlyProviderClientPortV1;
			capacity: AgenticChatProviderCapacity;
			liveVision?: AgenticChatLiveVisionResolverPortV1;
			supervisorFactory?: AgenticChatWorkerSupervisorFactoryV1;
		},
		private readonly retryableFailureCooldownMs = 2_000,
		private readonly maxProviderRounds = DEFAULT_MAX_PROVIDER_ROUNDS,
		private readonly mutationCapabilities: Readonly<
			Partial<AgenticChatProviderMutationCapabilitiesV1>
		> = {}
	) {
		if (
			!Number.isSafeInteger(retryableFailureCooldownMs) ||
			retryableFailureCooldownMs < 1 ||
			retryableFailureCooldownMs > 60_000
		) {
			throw new Error('Read-only provider cooldown must be between 1ms and 60000ms');
		}
		if (!Number.isSafeInteger(maxProviderRounds) || maxProviderRounds < 1) {
			throw new Error('Read-only provider round budget must be a positive safe integer');
		}
	}

	prepare(input: AgenticChatProviderInputV1): Promise<AgenticChatPreparedProviderInvocationV1> {
		return Promise.resolve().then(() => this.prepareInvocation(input));
	}

	private prepareInvocation(
		input: AgenticChatProviderInputV1
	): AgenticChatPreparedProviderInvocationV1 {
		throwIfAborted(input.signal);
		const executionInput = input.executionInput;
		const request = buildReadOnlyRequest(
			executionInput,
			input.processingToken,
			input.signal,
			this.mutationCapabilities,
			Boolean(this.ports.liveVision)
		);
		const promptSnapshot = buildPromptSnapshot(request.messages, request.tools);
		const supervisor = this.ports.supervisorFactory
			? new AgenticChatProviderSupervisorRuntime(this.ports.supervisorFactory(executionInput))
			: null;
		let lease;
		try {
			lease = this.ports.capacity.acquire();
		} catch (error) {
			if (error instanceof AgenticChatProviderCapacityError) {
				throw new AgenticChatProviderExecutionError(
					'provider_capacity_unavailable',
					'provider_throttle',
					error.message
				);
			}
			throw error;
		}

		let released = false;
		let streamed = false;
		let synthesized = false;
		let continued = false;
		let pendingToolRound: PendingToolRound | null = null;
		let toolRoundCompleted = false;
		let currentRequest = request;
		let nextProviderRound = 2;
		let readOnlyRoundCount = 0;
		let providerToolCallCount = 0;
		let readLoopRepairRank = 0;
		let mutationRoundReached = false;
		let organizeWriteCarveOutUsed = false;
		const readOps = new Set<string>();
		// The executor clears this memo as soon as any call reaches the write
		// boundary (successful or not), matching the legacy invalidation fence.
		const turnReadMemo = new Map<string, AgenticChatReadToolExecutionV1>();
		const contextGatheringLedger = new ContextGatheringLedger();
		const admissionContextUsage = getAdmissionContextUsage(executionInput);
		const release = () => {
			if (released) return;
			released = true;
			lease.release();
		};
		const buildStreamState = (): ToolRoundStreamState => ({
			supervisor,
			release,
			recordProviderToolCalls(count) {
				providerToolCallCount += count;
			},
			getProviderToolCallCount() {
				return providerToolCallCount;
			},
			setPendingToolRound(value) {
				pendingToolRound = value;
			},
			markToolRoundCompleted() {
				toolRoundCompleted = true;
			},
			setCurrentRequest(value) {
				currentRequest = value;
			},
			resolveMemoServed(call) {
				return resolveMemoServedExecution(turnReadMemo, call);
			}
		});
		return {
			promptSnapshot,
			stream: () => {
				if (released) {
					throw new AgenticChatProviderExecutionError(
						'provider_invocation_released',
						'unknown',
						'Agentic Chat provider invocation was released before streaming'
					);
				}
				if (streamed) {
					throw new AgenticChatProviderExecutionError(
						'provider_invocation_reused',
						'unknown',
						'Agentic Chat provider invocation is single-use'
					);
				}
				streamed = true;
				const state = buildStreamState();
				state.supervisor?.start();
				return this.streamInitial(request, state);
			},
			synthesize: (feedback) => {
				if (released) {
					throw providerError('provider_invocation_released', 'unknown');
				}
				if (!streamed || !pendingToolRound || !toolRoundCompleted) {
					throw providerError('provider_read_synthesis_not_ready', 'unknown');
				}
				if (synthesized) {
					throw providerError('provider_read_synthesis_reused', 'unknown');
				}
				if (continued) {
					throw providerError(
						'provider_read_synthesis_unavailable_after_continuation',
						'unknown'
					);
				}
				if (pendingToolRound.calls.length !== 1) {
					throw providerError('provider_read_synthesis_result_count_invalid', 'unknown');
				}
				const pendingCall = pendingToolRound.calls[0]!;
				if (pendingCall.kind !== 'read') {
					throw providerError('provider_mutating_tool_disabled', 'permanent');
				}
				validateReadFeedback(pendingCall, feedback);
				synthesized = true;
				const state = buildStreamState();
				observeSupervisorDurableToolResults(state, [pendingCall], [feedback]);
				state.supervisor?.observe({
					type: 'tool_round_completed',
					round: 1,
					toolCallsMade: state.getProviderToolCallCount()
				});
				const supervisorQuestion = state.supervisor?.takeSupervisorQuestion();
				if (supervisorQuestion) {
					return this.streamSupervisorQuestion(
						supervisorQuestion,
						pendingToolRound.usage,
						state
					);
				}
				const baseSynthesisRequest = buildSynthesisRequest(
					currentRequest,
					pendingCall,
					feedback
				);
				const directives = state.supervisor?.applyProviderDirectives(baseSynthesisRequest);
				const synthesisRequest = directives?.request ?? baseSynthesisRequest;
				return directives?.forceSynthesis
					? this.streamForcedSynthesis(synthesisRequest, pendingToolRound.usage, state)
					: this.streamSynthesis(synthesisRequest, pendingToolRound.usage, state);
			},
			continueWithToolResults: (input) => {
				if (released) {
					throw providerError('provider_invocation_released', 'unknown');
				}
				if (synthesized) {
					throw providerError('provider_read_continuation_reused', 'unknown');
				}
				if (!streamed || !pendingToolRound || !toolRoundCompleted) {
					throw providerError('provider_read_continuation_not_ready', 'unknown');
				}
				if (input.round !== nextProviderRound) {
					throw providerError('provider_read_continuation_round_mismatch', 'unknown');
				}
				if (input.results.length !== pendingToolRound.calls.length) {
					throw providerError(
						'provider_read_continuation_result_count_invalid',
						'unknown'
					);
				}

				continued = true;
				const completedToolRound = pendingToolRound;
				const roundContainsMutation = completedToolRound.calls.some(
					(call) => call.kind === 'mutation'
				);
				if (roundContainsMutation) {
					turnReadMemo.clear();
					mutationRoundReached = true;
				}
				const roundExecutions = completedToolRound.calls.map((call, index) => {
					const feedback = input.results[index]!;
					validateToolFeedback(call, feedback);
					if (
						!roundContainsMutation &&
						call.kind === 'read' &&
						!isMutationFeedback(feedback) &&
						!isFailedToolFeedback(feedback)
					) {
						memoizeCompletedRead(turnReadMemo, call, feedback.execution);
					}
					return {
						toolCall: completedProviderCallToChatToolCall(call),
						result: feedbackToChatToolResult(call.id, feedback)
					};
				});
				const state = buildStreamState();
				observeSupervisorDurableToolResults(state, completedToolRound.calls, input.results);
				state.supervisor?.observe({
					type: 'tool_round_completed',
					round: input.round - 1,
					toolCallsMade: state.getProviderToolCallCount()
				});
				const supervisorQuestion = state.supervisor?.takeSupervisorQuestion();
				if (supervisorQuestion) {
					pendingToolRound = null;
					toolRoundCompleted = false;
					return this.streamSupervisorQuestion(
						supervisorQuestion,
						completedToolRound.usage,
						state
					);
				}
				const completedToolCalls = roundExecutions.map(({ toolCall }) => toolCall);
				const pattern = buildRoundToolPattern(completedToolCalls);
				for (const op of pattern.readOps) readOps.add(op);
				if (pattern.readOps.length > 0) readOnlyRoundCount += 1;

				currentRequest = buildContinuationRequest(
					currentRequest,
					completedToolRound.calls,
					input.results
				);
				const ledgerObservation = contextGatheringLedger.observeToolRound({
					roundExecutions,
					roundPattern: pattern,
					toolRounds: readOnlyRoundCount,
					maxToolRounds: this.maxProviderRounds,
					modelPayloadChars: latestToolPayloadChars(currentRequest),
					liveContextUsage: admissionContextUsage
				});
				if (ledgerObservation.message) {
					currentRequest = appendSystemInstruction(
						currentRequest,
						ledgerObservation.message
					);
				}
				readLoopRepairRank = Math.max(
					readLoopRepairRank,
					contextSaturationRepairRank(ledgerObservation.status.status)
				);
				const roundsRemaining = Math.max(0, this.maxProviderRounds - readOnlyRoundCount);
				const escalation = selectReadLoopRepairEscalation({
					readOnlyRoundCount,
					roundsRemaining
				});
				if (escalation && READ_LOOP_REPAIR_RANK[escalation] > readLoopRepairRank) {
					readLoopRepairRank = READ_LOOP_REPAIR_RANK[escalation];
					currentRequest = appendSystemInstruction(
						currentRequest,
						buildReadLoopRepairInstruction([...readOps].sort(), {
							level: escalation,
							roundsRemaining
						})
					);
				}
				const supervisorDirectives =
					state.supervisor?.applyProviderDirectives(currentRequest);
				if (supervisorDirectives) currentRequest = supervisorDirectives.request;
				if (supervisorDirectives?.forceSynthesis) {
					readLoopRepairRank = Math.max(
						readLoopRepairRank,
						READ_LOOP_REPAIR_RANK.must_synthesize
					);
				}
				const forceNoToolSynthesis =
					ledgerObservation.forceSynthesis ||
					readLoopRepairRank >= READ_LOOP_REPAIR_RANK.must_synthesize;
				const organizeWriteCarveOut =
					forceNoToolSynthesis && !organizeWriteCarveOutUsed && !mutationRoundReached
						? buildOrganizeWriteCarveOutRequest(
								currentRequest,
								request.tools,
								executionInput
							)
						: null;
				if (organizeWriteCarveOut) {
					organizeWriteCarveOutUsed = true;
					currentRequest = organizeWriteCarveOut;
				} else if (forceNoToolSynthesis) {
					currentRequest = forceToolFreeRequest(currentRequest);
				}

				pendingToolRound = null;
				toolRoundCompleted = false;
				nextProviderRound += 1;
				return forceNoToolSynthesis && !organizeWriteCarveOut
					? this.streamForcedSynthesis(currentRequest, completedToolRound.usage, state)
					: this.streamContinuation(currentRequest, completedToolRound.usage, state);
			},
			invalidateReadMemo: () => turnReadMemo.clear(),
			release
		};
	}

	private async *streamInitial(
		request: ClientRequest,
		state: ToolRoundStreamState
	): AsyncGenerator<AgenticChatProviderStepV1> {
		let finished = false;
		let keepLeaseForSynthesis = false;
		let streamedText = false;
		let assistantCandidate = '';
		const toolCalls = createToolCallAccumulator();
		try {
			yield* drainSupervisorSteps(state.supervisor);
			request = await this.resolveLiveVision(request);
			state.setCurrentRequest(request);
			for await (const event of this.ports.client.stream(providerClientRequest(request))) {
				throwIfAborted(request.signal);
				if (finished) {
					throw providerError('provider_event_after_done', 'unknown');
				}
				if (event.type === 'text') {
					if (!event.content) throw providerError('provider_empty_text', 'unknown');
					streamedText = true;
					assistantCandidate += event.content;
					yield { type: 'text_delta', text: event.content };
					state.supervisor?.observe({
						type: 'assistant_text_delta',
						chars: event.content.length
					});
					yield* drainSupervisorSteps(state.supervisor);
					continue;
				}
				if (event.type === 'reasoning') {
					// Reasoning remains private and never enters assistant text or the
					// public event stream in the thin read-only slice.
					continue;
				}
				if (event.type === 'tool_call') {
					if (request.toolChoice === 'none') {
						throw providerError('provider_tool_call_disabled', 'permanent');
					}
					appendToolCallDelta(toolCalls, event.toolCall);
					continue;
				}
				if (event.type === 'error') {
					if (event.retryable) {
						this.ports.capacity.markTemporarilyUnavailable(
							this.retryableFailureCooldownMs
						);
					}
					throw new AgenticChatProviderExecutionError(
						'provider_stream_error',
						event.retryable ? 'provider_throttle' : 'unknown',
						canonicalError(event.error)
					);
				}

				const finishedReason = canonicalFinishedReason(event.finishedReason);
				const usage = normalizeUsage(event.usage);
				state.supervisor?.observe({
					type: 'llm_pass_completed',
					pass: request.logicalProviderRound,
					finishedReason,
					usage: supervisorUsage(usage)
				});
				yield* drainSupervisorSteps(state.supervisor);
				const calls = completeToolCalls(toolCalls);
				finished = true;
				if (calls.length > 0) {
					if (request.toolChoice !== 'auto') {
						throw providerError('provider_tool_call_disabled', 'permanent');
					}
					if (finishedReason !== 'tool_calls' && finishedReason !== 'function_call') {
						throw providerError('provider_tool_finish_reason_invalid', 'unknown');
					}
					for (const call of calls) assertAllowlistedCall(call, request.tools);
					const blockedToolCalls = observeSupervisorToolCalls(state, calls);
					yield* drainSupervisorSteps(state.supervisor);
					const validationIssues = validateCompletedProviderCalls(
						calls.filter((call) => !blockedToolCalls.has(call.id)),
						request
					);
					if (validationIssues.length > 0) {
						if (calls.length !== 1) {
							throw providerError(
								'provider_parallel_tool_validation_failed',
								'permanent'
							);
						}
						const call = calls[0]!;
						yield buildValidationFailureReadToolStep(
							request.turnRunId,
							call,
							validationIssues
						);
						observeSupervisorPreExecutionFailure(
							state,
							call,
							validationFailureError(validationIssues),
							request.logicalProviderRound
						);
						const supervisorQuestion = state.supervisor?.takeSupervisorQuestion();
						if (supervisorQuestion) {
							yield* this.streamSupervisorQuestion(supervisorQuestion, usage, state);
							continue;
						}
						let repairRequest = buildValidationRepairRequest(
							request,
							call,
							validationIssues
						);
						const directives = state.supervisor?.applyProviderDirectives(repairRequest);
						if (directives) repairRequest = directives.request;
						state.setCurrentRequest(repairRequest);
						keepLeaseForSynthesis = true;
						yield* directives?.forceSynthesis
							? this.streamForcedSynthesis(repairRequest, usage, state)
							: this.streamContinuation(repairRequest, usage, state, 1, true);
						continue;
					}
					const normalizedCalls = normalizeCompletedProviderCalls(
						request,
						calls,
						blockedToolCalls
					);
					state.setPendingToolRound({
						calls: normalizedCalls,
						usage
					});
					keepLeaseForSynthesis = true;
					yield buildPlanningStep(request, normalizedCalls[0]!.id);
					for (const call of normalizedCalls) {
						yield buildProviderToolStep(request.turnRunId, call, state);
					}
					state.markToolRoundCompleted();
					continue;
				}
				if (finishedReason === 'tool_calls' || finishedReason === 'function_call') {
					throw providerError(
						request.toolChoice === 'none'
							? 'provider_tool_call_disabled'
							: 'provider_missing_tool_call',
						request.toolChoice === 'none' ? 'permanent' : 'unknown'
					);
				}
				state.supervisor?.observe({
					type: 'final_candidate',
					text: assistantCandidate,
					finishedReason
				});
				yield* drainSupervisorSteps(state.supervisor);
				if (!streamedText) {
					throw providerError('provider_no_assistant_text', 'permanent');
				}
				this.ports.capacity.markAvailable();
				yield {
					type: 'finish',
					finishedReason,
					usage
				};
			}
			if (!finished) throw providerError('provider_missing_done', 'unknown');
		} finally {
			if (!keepLeaseForSynthesis) state.release();
		}
	}

	private async resolveLiveVision(request: ClientRequest): Promise<ClientRequest> {
		if (!request.liveVisionRequest || !this.ports.liveVision) return request;
		const result = await this.ports.liveVision.resolve({
			...request.liveVisionRequest,
			signal: request.signal
		});
		throwIfAborted(request.signal);
		if (result.images.length === 0) return request;

		const messages = request.messages.map((message) => ({ ...message }));
		const currentUserMessage = messages.at(-1);
		if (currentUserMessage?.role !== 'user' || typeof currentUserMessage.content !== 'string') {
			throw providerError('provider_live_vision_message_invalid', 'permanent');
		}
		currentUserMessage.content = [
			{ type: 'text', text: currentUserMessage.content },
			...result.images.map((image) => ({
				type: 'image_url' as const,
				image_url: { url: image.signedUrl, detail: image.detail }
			}))
		];
		return { ...request, messages };
	}

	private async *streamContinuation(
		request: ClientRequest,
		priorUsage: AgenticChatProviderUsageV1 | null,
		state: ToolRoundStreamState,
		validationRepairRounds = 0,
		emitPlanningSemantic = false
	): AsyncGenerator<AgenticChatProviderStepV1> {
		let finished = false;
		let keepLeaseForContinuation = false;
		let streamedText = false;
		let assistantCandidate = '';
		const toolCalls = createToolCallAccumulator();
		try {
			yield* drainSupervisorSteps(state.supervisor);
			for await (const event of this.ports.client.stream(providerClientRequest(request))) {
				throwIfAborted(request.signal);
				if (finished) throw providerError('provider_event_after_done', 'unknown');
				if (event.type === 'text') {
					if (!event.content) throw providerError('provider_empty_text', 'unknown');
					streamedText = true;
					assistantCandidate += event.content;
					yield { type: 'text_delta', text: event.content };
					state.supervisor?.observe({
						type: 'assistant_text_delta',
						chars: event.content.length
					});
					yield* drainSupervisorSteps(state.supervisor);
					continue;
				}
				if (event.type === 'reasoning') continue;
				if (event.type === 'tool_call') {
					if (request.toolChoice === 'none') {
						throw providerError('provider_tool_call_disabled', 'permanent');
					}
					appendToolCallDelta(toolCalls, event.toolCall);
					continue;
				}
				if (event.type === 'error') {
					if (event.retryable) {
						this.ports.capacity.markTemporarilyUnavailable(
							this.retryableFailureCooldownMs
						);
					}
					throw new AgenticChatProviderExecutionError(
						'provider_stream_error',
						event.retryable ? 'provider_throttle' : 'unknown',
						canonicalError(event.error)
					);
				}

				const finishedReason = canonicalFinishedReason(event.finishedReason);
				const calls = completeToolCalls(toolCalls);
				const passUsage = normalizeUsage(event.usage);
				const aggregateUsage = combineUsage(priorUsage, passUsage);
				state.supervisor?.observe({
					type: 'llm_pass_completed',
					pass: request.logicalProviderRound,
					finishedReason,
					usage: supervisorUsage(passUsage)
				});
				yield* drainSupervisorSteps(state.supervisor);
				finished = true;
				if (calls.length > 0) {
					if (request.toolChoice !== 'auto') {
						throw providerError('provider_tool_call_disabled', 'permanent');
					}
					if (finishedReason !== 'tool_calls' && finishedReason !== 'function_call') {
						throw providerError('provider_tool_finish_reason_invalid', 'unknown');
					}
					for (const call of calls) assertAllowlistedCall(call, request.tools);
					const blockedToolCalls = observeSupervisorToolCalls(state, calls);
					yield* drainSupervisorSteps(state.supervisor);
					const validationIssues = validateCompletedProviderCalls(
						calls.filter((call) => !blockedToolCalls.has(call.id)),
						request
					);
					if (validationIssues.length > 0) {
						if (calls.length !== 1) {
							throw providerError(
								'provider_parallel_tool_validation_failed',
								'permanent'
							);
						}
						const call = calls[0]!;
						yield buildValidationFailureReadToolStep(
							request.turnRunId,
							call,
							validationIssues
						);
						observeSupervisorPreExecutionFailure(
							state,
							call,
							validationFailureError(validationIssues),
							request.logicalProviderRound
						);
						const supervisorQuestion = state.supervisor?.takeSupervisorQuestion();
						if (supervisorQuestion) {
							yield* this.streamSupervisorQuestion(
								supervisorQuestion,
								aggregateUsage,
								state
							);
							continue;
						}
						if (validationRepairRounds >= MAX_VALIDATION_REPAIR_ROUNDS) {
							throw providerError(
								'provider_tool_validation_repair_exhausted',
								'permanent'
							);
						}
						let repairRequest = buildValidationRepairRequest(
							request,
							call,
							validationIssues
						);
						const directives = state.supervisor?.applyProviderDirectives(repairRequest);
						if (directives) repairRequest = directives.request;
						state.setCurrentRequest(repairRequest);
						keepLeaseForContinuation = true;
						yield* directives?.forceSynthesis
							? this.streamForcedSynthesis(repairRequest, aggregateUsage, state)
							: this.streamContinuation(
									repairRequest,
									aggregateUsage,
									state,
									validationRepairRounds + 1,
									emitPlanningSemantic
								);
						continue;
					}
					const normalizedCalls = normalizeCompletedProviderCalls(
						request,
						calls,
						blockedToolCalls
					);
					state.setPendingToolRound({ calls: normalizedCalls, usage: aggregateUsage });
					keepLeaseForContinuation = true;
					if (emitPlanningSemantic) {
						yield buildPlanningStep(request, normalizedCalls[0]!.id);
					}
					for (const call of normalizedCalls) {
						yield buildProviderToolStep(request.turnRunId, call, state);
					}
					state.markToolRoundCompleted();
					continue;
				}
				if (finishedReason === 'tool_calls' || finishedReason === 'function_call') {
					throw providerError(
						request.toolChoice === 'none'
							? 'provider_tool_call_disabled'
							: 'provider_missing_tool_call',
						request.toolChoice === 'none' ? 'permanent' : 'unknown'
					);
				}
				state.supervisor?.observe({
					type: 'final_candidate',
					text: assistantCandidate,
					finishedReason
				});
				yield* drainSupervisorSteps(state.supervisor);
				if (!streamedText) {
					throw providerError('provider_no_assistant_text', 'permanent');
				}
				this.ports.capacity.markAvailable();
				yield { type: 'finish', finishedReason, usage: aggregateUsage };
			}
			if (!finished) throw providerError('provider_missing_done', 'unknown');
		} finally {
			if (!keepLeaseForContinuation) state.release();
		}
	}

	private async *streamForcedSynthesis(
		request: ClientRequest,
		priorUsage: AgenticChatProviderUsageV1 | null,
		state: ToolRoundStreamState
	): AsyncGenerator<AgenticChatProviderStepV1> {
		let currentRequest = forceToolFreeRequest(request);
		let accumulatedUsage = priorUsage;
		try {
			yield* drainSupervisorSteps(state.supervisor);
			for (let retryCount = 0; retryCount <= MAX_FORCED_SYNTHESIS_RETRIES; retryCount += 1) {
				let finished = false;
				let requestedTools = false;
				let assistantCandidate = '';
				let finishedReason = 'stop';
				let passUsage: AgenticChatProviderUsageV1 | null = null;

				for await (const event of this.ports.client.stream(
					providerClientRequest(currentRequest)
				)) {
					throwIfAborted(currentRequest.signal);
					if (finished) throw providerError('provider_event_after_done', 'unknown');
					if (event.type === 'text') {
						if (!event.content) throw providerError('provider_empty_text', 'unknown');
						assistantCandidate += event.content;
						continue;
					}
					if (event.type === 'reasoning') continue;
					if (event.type === 'tool_call') {
						// This pass advertises no tools. Buffer and discard the entire
						// candidate, then give the provider one bounded tool-free retry.
						requestedTools = true;
						continue;
					}
					if (event.type === 'error') {
						if (event.retryable) {
							this.ports.capacity.markTemporarilyUnavailable(
								this.retryableFailureCooldownMs
							);
						}
						throw new AgenticChatProviderExecutionError(
							'provider_stream_error',
							event.retryable ? 'provider_throttle' : 'unknown',
							canonicalError(event.error)
						);
					}

					finishedReason = canonicalFinishedReason(event.finishedReason);
					requestedTools ||=
						finishedReason === 'tool_calls' || finishedReason === 'function_call';
					passUsage = normalizeUsage(event.usage);
					state.supervisor?.observe({
						type: 'llm_pass_completed',
						pass: currentRequest.logicalProviderRound + retryCount,
						finishedReason,
						usage: supervisorUsage(passUsage)
					});
					yield* drainSupervisorSteps(state.supervisor);
					finished = true;
				}
				if (!finished) throw providerError('provider_missing_done', 'unknown');

				accumulatedUsage = combineUsage(accumulatedUsage, passUsage);
				const finalText = sanitizeAssistantFinalText(assistantCandidate);
				if (!requestedTools) {
					if (finalText) {
						this.ports.capacity.markAvailable();
						yield { type: 'text_delta', text: finalText };
						state.supervisor?.observe({
							type: 'assistant_text_delta',
							chars: finalText.length
						});
					}
					state.supervisor?.observe({
						type: 'final_candidate',
						text: finalText,
						finishedReason
					});
					yield* drainSupervisorSteps(state.supervisor);
					if (finalText) {
						yield { type: 'finish', finishedReason, usage: accumulatedUsage };
						return;
					}
				}

				if (retryCount >= MAX_FORCED_SYNTHESIS_RETRIES) {
					throw providerError('provider_forced_synthesis_failed', 'permanent');
				}
				currentRequest = appendSystemInstruction(
					currentRequest,
					requestedTools
						? NO_TOOL_SYNTHESIS_TOOL_RETRY_MESSAGE
						: NO_TOOL_SYNTHESIS_EMPTY_RETRY_MESSAGE
				);
			}
		} finally {
			state.release();
		}
	}

	private async *streamSupervisorQuestion(
		terminal: Extract<AgenticChatSupervisorTerminalRequestV1, { kind: 'ask_user' }>,
		usage: AgenticChatProviderUsageV1 | null,
		state: ToolRoundStreamState
	): AsyncGenerator<AgenticChatProviderStepV1> {
		try {
			yield* drainSupervisorSteps(state.supervisor);
			this.ports.capacity.markAvailable();
			yield {
				type: 'supervisor_question',
				transitionId: terminal.transitionId,
				sequence: terminal.sequence,
				executionGeneration: terminal.executionGeneration,
				reason: terminal.reason,
				question: terminal.question,
				checkpoint: {
					digest: terminal.checkpoint.digest as unknown as JsonObject,
					resumeContext: terminal.checkpoint.resumeContext as JsonObject,
					supervisorDecision: terminal.supervisorDecision
				},
				finishedReason: terminal.finishedReason,
				usage
			};
		} finally {
			state.release();
		}
	}

	private async *streamSynthesis(
		request: ClientRequest,
		initialUsage: AgenticChatProviderUsageV1 | null,
		state: ToolRoundStreamState
	): AsyncGenerator<AgenticChatProviderStepV1> {
		let finished = false;
		let streamedText = false;
		let assistantCandidate = '';
		try {
			yield* drainSupervisorSteps(state.supervisor);
			for await (const event of this.ports.client.stream(providerClientRequest(request))) {
				throwIfAborted(request.signal);
				if (finished) throw providerError('provider_event_after_done', 'unknown');
				if (event.type === 'text') {
					if (!event.content) throw providerError('provider_empty_text', 'unknown');
					streamedText = true;
					assistantCandidate += event.content;
					yield { type: 'text_delta', text: event.content };
					state.supervisor?.observe({
						type: 'assistant_text_delta',
						chars: event.content.length
					});
					yield* drainSupervisorSteps(state.supervisor);
					continue;
				}
				if (event.type === 'reasoning') continue;
				if (event.type === 'tool_call') {
					throw providerError('provider_additional_tool_round_disabled', 'permanent');
				}
				if (event.type === 'error') {
					if (event.retryable) {
						this.ports.capacity.markTemporarilyUnavailable(
							this.retryableFailureCooldownMs
						);
					}
					throw new AgenticChatProviderExecutionError(
						'provider_stream_error',
						event.retryable ? 'provider_throttle' : 'unknown',
						canonicalError(event.error)
					);
				}
				const finishedReason = canonicalFinishedReason(event.finishedReason);
				const usage = normalizeUsage(event.usage);
				state.supervisor?.observe({
					type: 'llm_pass_completed',
					pass: request.logicalProviderRound,
					finishedReason,
					usage: supervisorUsage(usage)
				});
				yield* drainSupervisorSteps(state.supervisor);
				if (finishedReason === 'tool_calls' || finishedReason === 'function_call') {
					throw providerError('provider_additional_tool_round_disabled', 'permanent');
				}
				state.supervisor?.observe({
					type: 'final_candidate',
					text: assistantCandidate,
					finishedReason
				});
				yield* drainSupervisorSteps(state.supervisor);
				if (!streamedText) {
					throw providerError('provider_no_assistant_text', 'permanent');
				}
				finished = true;
				this.ports.capacity.markAvailable();
				yield {
					type: 'finish',
					finishedReason,
					usage: combineUsage(initialUsage, usage)
				};
			}
			if (!finished) throw providerError('provider_missing_done', 'unknown');
		} finally {
			state.release();
		}
	}
}

function drainSupervisorSteps(
	supervisor: AgenticChatProviderSupervisorRuntime | null
): readonly Extract<AgenticChatProviderStepV1, { type: 'semantic' | 'supervisor_evaluation' }>[] {
	return supervisor?.drainSteps() ?? [];
}

function observeSupervisorToolCalls(
	state: ToolRoundStreamState,
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

function observeSupervisorPreExecutionFailure(
	state: ToolRoundStreamState,
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

function observeSupervisorDurableToolResults(
	state: ToolRoundStreamState,
	calls: readonly NormalizedProviderToolCall[],
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

function supervisorUsage(
	usage: AgenticChatProviderUsageV1 | null
): { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined {
	if (!usage) return undefined;
	return {
		prompt_tokens: usage.promptTokens,
		completion_tokens: usage.completionTokens,
		total_tokens: usage.totalTokens
	};
}

type ProviderToolCallAccumulator = {
	seen: boolean;
	id: string;
	name: string;
	argumentsText: string;
};

function createToolCallAccumulator(): Map<number, ProviderToolCallAccumulator> {
	return new Map();
}

function appendToolCallDelta(
	state: ReturnType<typeof createToolCallAccumulator>,
	value: unknown
): void {
	if (!Array.isArray(value) || value.length === 0) {
		throw providerError('provider_tool_call_delta_invalid', 'permanent');
	}
	for (let position = 0; position < value.length; position += 1) {
		const delta = requireRecord(value[position], 'provider tool-call delta');
		const index = delta.index ?? (value.length === 1 ? 0 : position);
		if (
			!Number.isSafeInteger(index) ||
			(index as number) < 0 ||
			(index as number) >= MAX_PROVIDER_TOOL_CALLS_PER_ROUND
		) {
			throw providerError('provider_tool_call_count_exceeded', 'permanent');
		}
		const callIndex = index as number;
		const call = state.get(callIndex) ?? {
			seen: false,
			id: '',
			name: '',
			argumentsText: ''
		};
		call.seen = true;
		if (delta.id !== undefined) {
			const id = canonicalRequiredText(delta.id, 'provider tool-call id');
			if (id.length > 512 || (call.id && call.id !== id)) {
				throw providerError('provider_tool_call_id_invalid', 'permanent');
			}
			call.id = id;
		}
		if (delta.type !== undefined && delta.type !== 'function') {
			throw providerError('provider_tool_call_type_invalid', 'permanent');
		}
		if (delta.function !== undefined) {
			const fn = requireRecord(delta.function, 'provider tool-call function');
			if (fn.name !== undefined) {
				if (typeof fn.name !== 'string' || fn.name.length === 0) {
					throw providerError('provider_tool_name_invalid', 'permanent');
				}
				call.name += fn.name;
				if (call.name.length > 256) {
					throw providerError('provider_tool_name_invalid', 'permanent');
				}
			}
			if (fn.arguments !== undefined) {
				if (typeof fn.arguments !== 'string') {
					throw providerError('provider_tool_arguments_invalid', 'permanent');
				}
				call.argumentsText += fn.arguments;
				if (Buffer.byteLength(call.argumentsText, 'utf8') > 64 * 1024) {
					throw providerError('provider_tool_arguments_too_large', 'permanent');
				}
			}
		}
		state.set(callIndex, call);
	}
}

function completeToolCalls(
	state: ReturnType<typeof createToolCallAccumulator>
): CompletedProviderToolCall[] {
	if (state.size === 0) return [];
	const calls: CompletedProviderToolCall[] = [];
	const seenIds = new Set<string>();
	const entries = [...state.entries()].sort(([left], [right]) => left - right);
	for (let position = 0; position < entries.length; position += 1) {
		const [index, call] = entries[position]!;
		if (
			index !== position ||
			!call.seen ||
			!call.id ||
			!call.name ||
			call.name !== call.name.trim()
		) {
			throw providerError('provider_tool_call_incomplete', 'permanent');
		}
		if (seenIds.has(call.id)) {
			throw providerError('provider_tool_call_id_invalid', 'permanent');
		}
		seenIds.add(call.id);
		let parsed: unknown;
		try {
			parsed = JSON.parse(call.argumentsText || '{}');
		} catch {
			throw providerError('provider_tool_arguments_invalid', 'permanent');
		}
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw providerError('provider_tool_arguments_invalid', 'permanent');
		}
		const canonicalArguments = canonicalizeAgenticChatJson(parsed as JsonValue);
		calls.push({
			id: call.id,
			name: call.name,
			arguments: JSON.parse(canonicalArguments) as JsonObject,
			canonicalArguments
		});
	}
	return calls;
}

function assertAllowlistedCall(
	call: CompletedProviderToolCall,
	tools: readonly AgenticChatReadOnlyProviderToolV1[]
): void {
	if (!tools.some((tool) => tool.function.name === call.name)) {
		throw providerToolNotAllowlistedError(call.name, tools);
	}
}

function providerToolNotAllowlistedError(
	rejectedToolName: string,
	tools: readonly AgenticChatReadOnlyProviderToolV1[]
): AgenticChatProviderExecutionError {
	const repeated = tools
		.map((tool) => tool.function.name)
		.map((advertisedToolName) => {
			if (
				advertisedToolName.length === 0 ||
				rejectedToolName.length <= advertisedToolName.length ||
				rejectedToolName.length % advertisedToolName.length !== 0
			) {
				return null;
			}
			const count = rejectedToolName.length / advertisedToolName.length;
			return advertisedToolName.repeat(count) === rejectedToolName
				? { advertisedToolName, count }
				: null;
		})
		.find((value): value is { advertisedToolName: string; count: number } => value !== null);
	const diagnostic: AgenticChatProviderExecutionDiagnosticV1 = {
		kind: 'rejected_tool_name',
		rejectedToolName: /^[A-Za-z0-9_.:-]{1,256}$/.test(rejectedToolName)
			? rejectedToolName
			: null,
		rejectedToolNameLength: rejectedToolName.length,
		advertisedToolCount: tools.length,
		repeatedAdvertisedToolName: repeated?.advertisedToolName ?? null,
		repeatedToolNameCount: repeated?.count ?? null
	};
	return providerError('provider_tool_not_allowlisted', 'permanent', diagnostic);
}

function validateReadFeedback(
	call: CompletedProviderToolCall,
	feedback: AgenticChatProviderReadSynthesisInputV1
): void {
	if (
		feedback.providerToolCallId !== call.id ||
		feedback.toolName !== call.name ||
		canonicalizeAgenticChatJson(feedback.arguments as JsonValue) !== call.canonicalArguments
	) {
		throw providerError('provider_read_feedback_mismatch', 'unknown');
	}
	canonicalizeAgenticChatJson(feedback.execution.result as JsonValue);
}

function validateToolFeedback(
	call: NormalizedProviderToolCall,
	feedback: AgenticChatProviderToolSynthesisInputV1
): void {
	if (
		feedback.providerToolCallId !== call.id ||
		feedback.toolName !== call.name ||
		canonicalizeAgenticChatJson(feedback.arguments as JsonValue) !== call.canonicalArguments
	) {
		throw providerError('provider_read_feedback_mismatch', 'unknown');
	}
	if (call.supervisorFailure) {
		if (
			!isFailedToolFeedback(feedback) ||
			feedback.failure.kind !== 'supervisor_block' ||
			feedback.failure.error !== call.supervisorFailure.error ||
			feedback.failure.toolCategory !== (TOOL_METADATA[call.name]?.category ?? null) ||
			canonicalizeAgenticChatJson(feedback.failure.modelPayload as JsonValue) !==
				canonicalizeAgenticChatJson(call.supervisorFailure.modelPayload as JsonValue)
		) {
			throw providerError('provider_tool_feedback_kind_mismatch', 'unknown');
		}
		return;
	}
	if (isFailedToolFeedback(feedback)) {
		if (
			call.kind !== 'mutation' ||
			feedback.failure.kind !== 'known_execution_failure' ||
			!isCanonicalProviderText(feedback.failure.error, 4_000) ||
			(feedback.failure.toolCategory !== null &&
				!isCanonicalProviderText(feedback.failure.toolCategory, 128)) ||
			feedback.failure.modelPayload.error !== feedback.failure.error
		) {
			throw providerError('provider_tool_feedback_kind_mismatch', 'unknown');
		}
		canonicalizeAgenticChatJson(feedback.failure.modelPayload as JsonValue);
		return;
	}
	canonicalizeAgenticChatJson(feedback.execution.result as JsonValue);
	if (call.kind === 'read') {
		if (isMutationFeedback(feedback)) {
			throw providerError('provider_tool_feedback_kind_mismatch', 'unknown');
		}
		return;
	}
	if (
		!isMutationFeedback(feedback) ||
		feedback.mutation.logicalOperationId !== call.logicalOperationId ||
		feedback.mutation.operationName !== call.operationName
	) {
		throw providerError('provider_tool_feedback_kind_mismatch', 'unknown');
	}
}

function isMutationFeedback(
	feedback: AgenticChatProviderToolSynthesisInputV1
): feedback is Extract<AgenticChatProviderToolSynthesisInputV1, { mutation: unknown }> {
	return 'mutation' in feedback;
}

function isFailedToolFeedback(
	feedback: AgenticChatProviderToolSynthesisInputV1
): feedback is Extract<AgenticChatProviderToolSynthesisInputV1, { failure: unknown }> {
	return 'failure' in feedback;
}

function completedProviderCallToChatToolCall(call: CompletedProviderToolCall): ChatToolCall {
	return {
		id: call.id,
		type: 'function',
		function: { name: call.name, arguments: call.canonicalArguments }
	};
}

function executionToChatToolResult(
	toolCallId: string,
	execution:
		| AgenticChatProviderReadSynthesisInputV1['execution']
		| AgenticChatProviderMutationSynthesisInputV1['execution']
): ChatToolResult {
	return {
		tool_call_id: toolCallId,
		result: execution.result,
		success: true,
		...(execution.executionTimeMs !== null ? { duration_ms: execution.executionTimeMs } : {}),
		...(execution.tokensConsumed !== null ? { tokens_consumed: execution.tokensConsumed } : {}),
		...(execution.requiresUserAction !== null
			? { requires_user_action: execution.requiresUserAction }
			: {})
	};
}

function feedbackToChatToolResult(
	toolCallId: string,
	feedback: AgenticChatProviderToolSynthesisInputV1
): ChatToolResult {
	if (isFailedToolFeedback(feedback)) {
		return {
			tool_call_id: toolCallId,
			result: null,
			success: false,
			error: feedback.failure.error
		};
	}
	return executionToChatToolResult(toolCallId, feedback.execution);
}

function memoizeCompletedRead(
	memo: Map<string, AgenticChatReadToolExecutionV1>,
	call: CompletedProviderToolCall,
	execution: AgenticChatReadToolExecutionV1
): void {
	if (!isPureReadToolName(call.name)) return;
	const toolCall = completedProviderCallToChatToolCall(call);
	const key = buildReadMemoKey(toolCall);
	if (!key || memo.has(key)) return;
	const result = executionToChatToolResult(call.id, execution);
	if (!shouldMemoizeReadResult(result)) return;
	memo.set(key, execution);
}

function resolveMemoServedExecution(
	memo: Map<string, AgenticChatReadToolExecutionV1>,
	call: CompletedProviderToolCall
): AgenticChatReadToolExecutionV1 | null {
	if (!isPureReadToolName(call.name)) return null;
	const key = buildReadMemoKey(completedProviderCallToChatToolCall(call));
	const cached = key ? memo.get(key) : undefined;
	if (!cached) return null;
	const served = buildMemoServedResult(executionToChatToolResult(call.id, cached), call.id);
	const canonicalResult = canonicalizeAgenticChatJson(served.result as JsonValue);
	const result = JSON.parse(canonicalResult) as unknown;
	if (!result || typeof result !== 'object' || Array.isArray(result)) {
		throw providerError('provider_read_memo_result_invalid', 'unknown');
	}
	return {
		result: result as JsonObject,
		executionTimeMs: served.duration_ms ?? 0,
		tokensConsumed: served.tokens_consumed ?? null,
		affectedEntities: cached.affectedEntities,
		toolCategory: cached.toolCategory,
		resultCount: cached.resultCount,
		zeroResult: cached.zeroResult,
		requiresUserAction: served.requires_user_action ?? cached.requiresUserAction
	};
}

function getAdmissionContextUsage(
	input: AgenticChatWorkerExecutionInputV1
): ContextUsageSnapshot | undefined {
	if (input.artifact.artifactVersion !== AGENTIC_CHAT_INPUT_ARTIFACT_VERSION) {
		return undefined;
	}
	return input.artifact.prepared.contextUsageSnapshot;
}

function latestToolPayloadChars(request: ClientRequest): number {
	let total = 0;
	for (let index = request.messages.length - 1; index >= 0; index -= 1) {
		const message = request.messages[index];
		if (message?.role !== 'tool') break;
		total += message.content.length;
	}
	return total;
}

function forceToolFreeRequest(request: ClientRequest): ClientRequest {
	return { ...request, tools: [], toolChoice: 'none', providerRound: 'synthesis' };
}

function buildOrganizeWriteCarveOutRequest(
	request: ClientRequest,
	availableTools: readonly AgenticChatReadOnlyProviderToolV1[],
	executionInput: AgenticChatWorkerExecutionInputV1
): ClientRequest | null {
	const intent = executionInput.artifact.prepared.turnIntent;
	if (
		intent?.requiresWrite !== true ||
		intent.action !== 'organize' ||
		intent.entityKind !== 'document' ||
		!intent.expectedWriteToolNames.includes('move_document_in_tree')
	) {
		return null;
	}
	const moveTool = availableTools.find((tool) => tool.function.name === 'move_document_in_tree');
	if (!moveTool) return null;

	const next = appendSystemInstruction(
		request,
		[
			'Supervisor exception: the user commissioned a document reorganization and no mutation has reached execution yet.',
			'The earlier instruction to stop calling tools is superseded for exactly this one pass.',
			'Use only move_document_in_tree and execute the reorganization now; multiple move calls in this response are expected.',
			'Use only exact document UUIDs returned by the completed reads for both document_id and new_parent_id. Never invent a UUID.',
			'Choose a few existing documents as sensible category anchors and move related documents under the same anchor; at least two related source documents should share one parent.',
			'Do not call reads, searches, schemas, skills, or any other discovery tool in this pass.'
		].join(' ')
	);
	return {
		...next,
		tools: [moveTool],
		toolChoice: 'auto',
		providerRound: 'synthesis'
	};
}

function contextSaturationRepairRank(
	status: 'open' | 'narrowing' | 'saturated' | 'must_synthesize'
): number {
	if (status === 'narrowing') return READ_LOOP_REPAIR_RANK.nudge;
	if (status === 'saturated') return READ_LOOP_REPAIR_RANK.stop_and_answer;
	if (status === 'must_synthesize') return READ_LOOP_REPAIR_RANK.must_synthesize;
	return 0;
}

function buildPlanningStep(
	request: ClientRequest,
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
		currentActivity: 'Planning the first step...',
		eventPayload: {
			type: 'agent_state',
			state: 'thinking',
			contextType: request.contextType,
			details: 'Planning the first step...',
			activity_visibility: 'activity_log'
		}
	};
}

function buildReadToolStep(
	turnRunId: string,
	call: CompletedProviderToolCall,
	memoServed: AgenticChatReadToolExecutionV1 | null = null
): Extract<AgenticChatProviderStepV1, { type: 'read_tool' }> {
	const base = buildReadToolStepBase(turnRunId, call);
	return memoServed ? { ...base, memoServed } : base;
}

function normalizeCompletedProviderCalls(
	request: ClientRequest,
	calls: readonly CompletedProviderToolCall[],
	blockedToolCalls: ReadonlyMap<string, AgenticChatSupervisorBlockedToolCallV1> = new Map()
): NormalizedProviderToolCall[] {
	return calls.map((call, index) => {
		const supervisorFailure = blockedToolCalls.get(call.id);
		if (isAgenticChatProductionReadToolNameV1(call.name)) {
			return { ...call, kind: 'read', ...(supervisorFailure ? { supervisorFailure } : {}) };
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

function buildProviderToolStep(
	turnRunId: string,
	call: NormalizedProviderToolCall,
	state: ToolRoundStreamState
): AgenticChatProviderStepV1 {
	if (call.supervisorFailure) {
		return {
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
		return buildReadToolStep(turnRunId, call, state.resolveMemoServed(call));
	}
	return {
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

function buildReadToolStepBase(turnRunId: string, call: CompletedProviderToolCall) {
	return {
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
		arguments: call.arguments
	} as const;
}

function buildValidationFailureReadToolStep(
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

function buildContinuationRequest(
	request: ClientRequest,
	calls: readonly NormalizedProviderToolCall[],
	feedback: readonly AgenticChatProviderToolSynthesisInputV1[]
): ClientRequest {
	if (calls.length === 0 || calls.length !== feedback.length) {
		throw providerError('provider_read_continuation_result_count_invalid', 'unknown');
	}
	const toolMessages = calls.map((call, index): AgenticChatReadOnlyProviderMessageV1 => {
		const result = feedback[index]!;
		if (isFailedToolFeedback(result)) {
			return {
				role: 'tool',
				content: canonicalizeAgenticChatJson(result.failure.modelPayload as JsonValue),
				tool_call_id: call.id
			};
		}
		const execution = result.execution;
		const modelPayload = buildToolPayloadForModel(
			completedProviderCallToChatToolCall(call),
			{
				tool_call_id: call.id,
				result: execution.result,
				success: true,
				duration_ms: execution.executionTimeMs ?? undefined,
				tokens_consumed: execution.tokensConsumed ?? undefined,
				requires_user_action: execution.requiresUserAction ?? undefined
			},
			parseToolArguments
		);
		return {
			role: 'tool',
			content: canonicalizeAgenticChatJson(modelPayload as JsonValue),
			tool_call_id: call.id
		};
	});
	return {
		...request,
		logicalProviderRound: request.logicalProviderRound + 1,
		providerRound: 'synthesis',
		messages: [
			...request.messages,
			{
				role: 'assistant',
				content: '',
				tool_calls: calls.map((call) => ({
					id: call.id,
					type: 'function',
					function: { name: call.name, arguments: call.canonicalArguments }
				}))
			},
			...toolMessages
		],
		tools: request.tools,
		toolChoice: request.tools.length > 0 ? 'auto' : 'none'
	};
}

function validateCompletedProviderCalls(
	calls: readonly CompletedProviderToolCall[],
	request: ClientRequest
): ToolValidationIssue[] {
	return validateToolCalls(
		calls.map(completedProviderCallToChatToolCall),
		Array.from(request.tools) as unknown as ChatToolDefinition[],
		{
			projectId:
				typeof request.projectId === 'string' &&
				CANONICAL_UUID_PATTERN.test(request.projectId)
					? request.projectId
					: null
		}
	);
}

function buildValidationRepairRequest(
	request: ClientRequest,
	call: CompletedProviderToolCall,
	issues: ToolValidationIssue[]
): ClientRequest {
	const fieldErrors = issues.flatMap((issue) => issue.errors);
	const error = validationFailureError(issues);
	const issueOp = issues.find((issue) => issue.op)?.op;
	const validationPayload: JsonObject = {
		error,
		details: { field_errors: fieldErrors }
	};
	if (issueOp) {
		validationPayload.op = issueOp;
		validationPayload.help_path = issueOp;
	}
	return appendSystemInstruction(
		{
			...request,
			logicalProviderRound: request.logicalProviderRound + 1,
			providerRound: 'synthesis',
			messages: [
				...request.messages,
				{
					role: 'assistant',
					content: '',
					tool_calls: [
						{
							id: call.id,
							type: 'function',
							function: { name: call.name, arguments: call.canonicalArguments }
						}
					]
				},
				{
					role: 'tool',
					content: canonicalizeAgenticChatJson(validationPayload),
					tool_call_id: call.id
				}
			],
			tools: request.tools,
			toolChoice: request.tools.length > 0 ? 'auto' : 'none'
		},
		buildToolValidationRepairInstruction(issues, false)
	);
}

function validationFailureError(issues: ToolValidationIssue[]): string {
	return `Tool validation failed: ${issues.flatMap((issue) => issue.errors).join(' ')}`;
}

function appendSystemInstruction(request: ClientRequest, content: string): ClientRequest {
	return {
		...request,
		messages: [...request.messages, { role: 'system', content }]
	};
}

function buildSynthesisRequest(
	request: ClientRequest,
	call: CompletedProviderToolCall,
	feedback: AgenticChatProviderReadSynthesisInputV1
): ClientRequest {
	return {
		...request,
		providerRound: 'synthesis',
		messages: [
			...request.messages,
			{
				role: 'assistant',
				content: '',
				tool_calls: [
					{
						id: call.id,
						type: 'function',
						function: { name: call.name, arguments: call.canonicalArguments }
					}
				]
			},
			{
				role: 'tool',
				content: canonicalizeAgenticChatJson(feedback.execution.result as JsonValue),
				tool_call_id: call.id
			}
		],
		tools: [],
		toolChoice: 'none'
	};
}

function combineUsage(
	initial: AgenticChatProviderUsageV1 | null,
	synthesis: AgenticChatProviderUsageV1 | null
): AgenticChatProviderUsageV1 | null {
	if (!initial || !synthesis) return null;
	const promptTokens = initial.promptTokens + synthesis.promptTokens;
	const completionTokens = initial.completionTokens + synthesis.completionTokens;
	const totalTokens = initial.totalTokens + synthesis.totalTokens;
	if (![promptTokens, completionTokens, totalTokens].every(Number.isSafeInteger)) {
		throw providerError('provider_aggregate_usage_invalid', 'unknown');
	}
	return { promptTokens, completionTokens, totalTokens };
}

function buildPromptSnapshot(
	messages: readonly AgenticChatReadOnlyProviderMessageV1[],
	tools: readonly AgenticChatReadOnlyProviderToolV1[]
): NonNullable<AgenticChatPreparedProviderInvocationV1['promptSnapshot']> {
	const canonical = canonicalizeAgenticChatJson(messages as unknown as JsonValue);
	const modelMessages = JSON.parse(canonical) as JsonObject[];
	const canonicalTools = canonicalizeAgenticChatJson(tools as unknown as JsonValue);
	const toolDefinitions = JSON.parse(canonicalTools) as JsonObject[];
	const systemPrompt = modelMessages[0]?.content;
	if (typeof systemPrompt !== 'string' || systemPrompt.length === 0) {
		throw providerError('provider_snapshot_system_prompt_invalid', 'permanent');
	}
	return {
		snapshotVersion: AGENTIC_CHAT_WORKER_PROMPT_SNAPSHOT_VERSION,
		modelMessages,
		toolDefinitions,
		systemPromptSha256: sha256(systemPrompt),
		messagesSha256: sha256(canonical),
		toolsSha256: sha256(canonicalTools),
		systemPromptChars: systemPrompt.length,
		messageChars: modelMessages.reduce(
			(total, message) =>
				total + (typeof message.content === 'string' ? message.content.length : 0),
			0
		),
		approxPromptTokens: modelMessages.reduce(
			(total, message) =>
				total +
				(typeof message.content === 'string' ? Math.ceil(message.content.length / 4) : 0),
			0
		)
	};
}

function sha256(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}

function buildReadOnlyRequest(
	input: AgenticChatWorkerExecutionInputV1,
	processingToken: string,
	signal: AbortSignal,
	mutationCapabilities: Readonly<Partial<AgenticChatProviderMutationCapabilitiesV1>>,
	liveVisionEnabled: boolean
): ClientRequest {
	const systemPrompt = requiredContent(input.artifact.prepared.systemPrompt, 'system prompt');
	const requestMessage = requiredContent(input.requestPayload.message, 'user message');
	const requestAttachments = input.requestPayload.attachments;
	if (!Array.isArray(requestAttachments)) {
		throw providerError('attachment_contract_mismatch', 'permanent');
	}
	const currentTurn = input.artifact.prepared.currentTurn;
	let userMessage = requestMessage;
	if (currentTurn) {
		const expectedDisplayMessage =
			currentTurn.message ||
			buildAgenticChatAttachmentDisplayTextV1(currentTurn.attachments.length);
		const requestAttachmentEvidence = currentTurn.attachments.map((attachment) => ({
			attachment_kind: attachment.attachment_kind,
			media_type: attachment.media_type,
			asset_id: attachment.asset_id,
			temporary_attachment_id: attachment.temporary_attachment_id,
			project_id: attachment.project_id,
			role: attachment.role,
			display_order: attachment.display_order,
			file_name: attachment.file_name,
			content_type: attachment.content_type,
			file_size_bytes: attachment.file_size_bytes,
			width: attachment.width,
			height: attachment.height,
			checksum_sha256: attachment.checksum_sha256,
			ocr_status: attachment.ocr_status,
			extraction_summary: attachment.extraction_summary,
			extracted_text_preview: attachment.extracted_text_preview
		}));
		if (
			requestMessage !== expectedDisplayMessage ||
			canonicalizeAgenticChatJson(requestAttachments as JsonValue) !==
				canonicalizeAgenticChatJson(requestAttachmentEvidence as JsonValue)
		) {
			throw providerError('attachment_contract_mismatch', 'permanent');
		}
		userMessage = appendAgenticChatAttachmentContextV1(
			currentTurn.message,
			currentTurn.attachments,
			{
				maxChars: currentTurn.attachmentContextMaxChars,
				rawMediaPassedToModel:
					liveVisionEnabled && (currentTurn.liveVision?.requested ?? false)
			}
		);
	} else if (requestAttachments.length !== 0) {
		throw providerError('attachments_missing_artifact_evidence', 'permanent');
	}

	const messages: AgenticChatReadOnlyProviderMessageV1[] = [
		{ role: 'system', content: systemPrompt }
	];
	for (const history of input.artifact.history) {
		const message: AgenticChatReadOnlyProviderMessageV1 = {
			role: history.role,
			content: history.content
		};
		if (history.toolCalls.length > 0) message.tool_calls = history.toolCalls;
		if (history.toolCallId) message.tool_call_id = history.toolCallId;
		messages.push(message);
	}
	const resumeCheckpoint = input.artifact.prepared.resumeCheckpoint;
	if (resumeCheckpoint) {
		messages.push({ role: 'system', content: resumeCheckpoint.resumeMessage });
	}
	messages.push({ role: 'user', content: userMessage });

	const context = requireRecord(input.requestPayload.context, 'request context');
	const contextType = canonicalRequiredText(context.type, 'context type');
	const tools = productionToolsFor(input, mutationCapabilities);
	return {
		messages,
		tools,
		toolChoice: tools.length > 0 ? 'auto' : 'none',
		userId: input.claim.userId,
		sessionId: input.claim.sessionId,
		turnRunId: input.claim.turnRunId,
		streamRunId: input.streamRunId,
		clientTurnId: input.clientTurnId,
		contextType,
		entityId: nullableString(context.entityId, 'context entity id'),
		projectId: nullableString(context.projectId, 'context project id'),
		queueJobId: input.claim.queueJobId,
		processingToken,
		executionGeneration: input.claim.executionGeneration,
		logicalProviderRound: 1,
		providerRound: 'initial',
		signal,
		...(liveVisionEnabled && currentTurn?.liveVision?.requested
			? {
					liveVisionRequest: {
						turnRunId: input.claim.turnRunId,
						queueJobId: input.claim.queueJobId,
						processingToken,
						userId: input.claim.userId,
						executionGeneration: input.claim.executionGeneration,
						policy: currentTurn.liveVision,
						attachments: currentTurn.attachments
					}
				}
			: {})
	};
}

function providerClientRequest(
	request: ClientRequest
): Parameters<AgenticChatReadOnlyProviderClientPortV1['stream']>[0] {
	const { liveVisionRequest: _liveVisionRequest, ...clientRequest } = request;
	return clientRequest;
}

function productionToolsFor(
	input: AgenticChatWorkerExecutionInputV1,
	mutationCapabilities: Readonly<Partial<AgenticChatProviderMutationCapabilitiesV1>>
): readonly AgenticChatReadOnlyProviderToolV1[] {
	const surface = input.artifact.prepared.toolSurface;
	if (!surface || typeof surface !== 'object' || Array.isArray(surface)) return [];
	const record = surface as Record<string, unknown>;
	if (!Array.isArray(record.toolNames) || !Array.isArray(record.definitions)) return [];

	const selectedNames = new Set(
		record.toolNames.filter(
			(name): name is string =>
				typeof name === 'string' && name === name.trim() && name.length > 0
		)
	);
	const seen = new Set<string>();
	const tools: AgenticChatReadOnlyProviderToolV1[] = [];
	for (const definition of record.definitions) {
		const tool = readArtifactToolDefinition(definition);
		if (
			!tool ||
			!selectedNames.has(tool.function.name) ||
			(!isAgenticChatProductionReadToolNameV1(tool.function.name) &&
				!isEnabledMutationTool(tool.function.name, mutationCapabilities)) ||
			seen.has(tool.function.name)
		) {
			continue;
		}
		const reviewedTool = reviewedProviderToolDefinition(tool);
		if (!reviewedTool) continue;
		seen.add(tool.function.name);
		tools.push(reviewedTool);
	}
	return tools;
}

function reviewedProviderToolDefinition(
	tool: AgenticChatReadOnlyProviderToolV1
): AgenticChatReadOnlyProviderToolV1 | null {
	const spec = reviewedAgenticChatMutationSpecV1(tool.function.name);
	if (!spec) return tool;
	const parameters = tool.function.parameters as Record<string, JsonValue>;
	const properties = parameters.properties;
	if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
		return null;
	}
	if (!spec.requiredNames.every((name) => Object.hasOwn(properties, name))) return null;
	const reviewedArgumentNames = new Set(spec.reviewedArgumentNames);
	const reviewedProperties = Object.fromEntries(
		Object.entries(properties)
			.filter(([name]) => reviewedArgumentNames.has(name))
			.map(([name, schema]) => [
				name,
				spec.propertyOverrides?.[name]
					? { ...(schema as JsonObject), ...spec.propertyOverrides[name] }
					: schema
			])
	) as JsonObject;
	return {
		...tool,
		function: {
			...tool.function,
			...(spec.descriptionOverride ? { description: spec.descriptionOverride } : {}),
			parameters: {
				...tool.function.parameters,
				additionalProperties: false,
				properties: reviewedProperties,
				required: [...spec.requiredNames]
			}
		}
	};
}

function isEnabledMutationTool(
	toolName: string,
	capabilities: Readonly<Partial<AgenticChatProviderMutationCapabilitiesV1>>
): boolean {
	const spec = reviewedAgenticChatMutationSpecV1(toolName);
	return spec !== null && capabilities[spec.capability] === true;
}

function readArtifactToolDefinition(value: unknown): AgenticChatReadOnlyProviderToolV1 | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	if (record.type !== 'function' || !record.function || typeof record.function !== 'object') {
		return null;
	}
	const fn = record.function as Record<string, unknown>;
	if (
		typeof fn.name !== 'string' ||
		fn.name !== fn.name.trim() ||
		fn.name.length === 0 ||
		fn.name.length > 256 ||
		typeof fn.description !== 'string' ||
		fn.description.trim().length === 0 ||
		!fn.parameters ||
		typeof fn.parameters !== 'object' ||
		Array.isArray(fn.parameters) ||
		(fn.parameters as Record<string, unknown>).type !== 'object'
	) {
		return null;
	}
	try {
		const parameters = JSON.parse(
			canonicalizeAgenticChatJson(fn.parameters as JsonValue)
		) as JsonObject;
		return {
			type: 'function',
			function: {
				name: fn.name,
				description: fn.description,
				parameters
			}
		};
	} catch {
		return null;
	}
}

function normalizeUsage(
	value: Extract<AgenticChatReadOnlyProviderClientEventV1, { type: 'done' }>['usage']
): AgenticChatProviderUsageV1 | null {
	if (!value) return null;
	const promptTokens = value.promptTokens ?? value.prompt_tokens;
	const completionTokens = value.completionTokens ?? value.completion_tokens;
	const totalTokens = value.totalTokens ?? value.total_tokens;
	if (
		!nonnegativeInteger(promptTokens) ||
		!nonnegativeInteger(completionTokens) ||
		!nonnegativeInteger(totalTokens) ||
		totalTokens !== promptTokens + completionTokens
	) {
		throw providerError('provider_invalid_usage', 'unknown');
	}
	return { promptTokens, completionTokens, totalTokens };
}

function canonicalFinishedReason(value: string | undefined): string {
	if (value === undefined) return 'stop';
	return canonicalRequiredText(value, 'finished reason').slice(0, 256);
}

function canonicalRequiredText(value: unknown, label: string): string {
	if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
		throw new AgenticChatProviderExecutionError(
			`invalid_${label.replaceAll(' ', '_')}`,
			'permanent',
			`Agentic Chat ${label} is invalid`
		);
	}
	return value;
}

function requiredContent(value: unknown, label: string): string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new AgenticChatProviderExecutionError(
			`invalid_${label.replaceAll(' ', '_')}`,
			'permanent',
			`Agentic Chat ${label} is invalid`
		);
	}
	return value;
}

function nullableString(value: unknown, label: string): string | null {
	if (value === null || value === undefined) return null;
	return canonicalRequiredText(value, label);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new AgenticChatProviderExecutionError(
			`invalid_${label.replaceAll(' ', '_')}`,
			'permanent',
			`Agentic Chat ${label} is invalid`
		);
	}
	return value as Record<string, unknown>;
}

function nonnegativeInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isCanonicalProviderText(value: unknown, maximum: number): value is string {
	return (
		typeof value === 'string' &&
		value.length > 0 &&
		value.length <= maximum &&
		value === value.trim()
	);
}

function canonicalError(value: string): string {
	return value.trim().slice(0, 2_000) || 'Agentic Chat provider failed';
}

function providerError(
	code: string,
	failureClass: 'permanent' | 'unknown',
	diagnostic: AgenticChatProviderExecutionDiagnosticV1 | null = null
) {
	return new AgenticChatProviderExecutionError(
		code,
		failureClass,
		`Agentic Chat read-only provider protocol failed: ${code}`,
		diagnostic
	);
}

function workerReadOpForToolName(toolName: string): string {
	const exceptions: Readonly<Record<string, string>> = {
		search_all_projects: 'x.search.all_projects',
		search_project: 'x.search.project',
		search_ontology: 'onto.search',
		get_document_tree: 'onto.document.tree.get',
		get_document_path: 'onto.document.path.get',
		list_task_documents: 'onto.task.docs.list',
		get_onto_project_graph: 'onto.project.graph.get',
		get_field_info: 'util.schema.field_info',
		get_workspace_overview: 'util.workspace.overview',
		get_project_overview: 'util.project.overview'
	};
	const exception = exceptions[toolName];
	if (exception) return exception;

	const match = /^(list|search|get|create|update|delete)_(?:onto_)?(.+)$/.exec(toolName);
	if (!match) return `x.misc.${toolName}`;
	const action = match[1]!;
	const rawEntity = match[2]!.replace(/_details$/, '');
	const singularEntities: Readonly<Record<string, string>> = {
		projects: 'project',
		tasks: 'task',
		goals: 'goal',
		plans: 'plan',
		documents: 'document',
		milestones: 'milestone',
		risks: 'risk'
	};
	return `onto.${singularEntities[rawEntity] ?? rawEntity}.${action}`;
}

function throwIfAborted(signal: AbortSignal): void {
	if (!signal.aborted) return;
	throw signal.reason instanceof Error ? signal.reason : new Error('Execution aborted');
}
