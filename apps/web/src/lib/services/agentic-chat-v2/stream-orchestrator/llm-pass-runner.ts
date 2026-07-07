// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/llm-pass-runner.ts
import type { ChatContextType, ChatToolCall, ChatToolDefinition } from '@buildos/shared-types';
import type { OpenRouterContentPart } from '$lib/services/openrouter-v2/types';
import type { SmartLLMService } from '$lib/services/smart-llm-service';
import { FASTCHAT_LIMITS } from '../limits';
import type { FastAgentStreamUsage, FastChatHistoryMessage } from '../types';
import type { TurnSupervisorObservation } from '../turn-supervisor';
import { parseToolArguments as parseSupervisorToolArguments } from '../turn-supervisor/digest';
import type { LLMStreamPassMetadata } from './shared';
import { normalizeToolCallDefaults } from './tool-arguments';

export type FastChatModelMessage = Omit<FastChatHistoryMessage, 'content'> & {
	content: string | OpenRouterContentPart[];
	reasoning?: string;
	reasoning_content?: string;
	reasoning_details?: unknown[];
};

type SmartLlmStreamTextResult = ReturnType<SmartLLMService['streamText']>;
type SmartLlmStreamEvent =
	SmartLlmStreamTextResult extends AsyncGenerator<infer Event, unknown, unknown> ? Event : never;

export type LlmStreamPassResult = {
	assistantBuffer: string;
	assistantReasoningForReplay: string;
	assistantReasoningDetailsForReplay: unknown[];
	pendingToolCalls: ChatToolCall[];
	suppressedNoToolSynthesisToolCallCount: number;
	metadata: LLMStreamPassMetadata;
	usage?: FastAgentStreamUsage;
	finishedReason?: string;
};

export async function runLlmStreamPass(params: {
	llm: SmartLLMService;
	passMessages: FastChatModelMessage[];
	tools: ChatToolDefinition[];
	hasTools: boolean;
	noToolSynthesisPass: boolean;
	passNumber: number;
	usage?: FastAgentStreamUsage;
	userId: string;
	sessionId: string;
	turnRunId?: string | null;
	streamRunId?: string | null;
	clientTurnId?: string | null;
	normalizedContext: ChatContextType;
	entityId?: string | null;
	projectId?: string | null;
	signal?: AbortSignal;
	onAssistantBufferChange: (assistantBuffer: string) => void;
	onPendingToolCallCountChange: (count: number) => void;
	tryEmitEarlyAssistantLeadIn: (assistantBuffer: string) => Promise<void>;
	updateLiveContextUsage: (promptTokens: number | undefined) => Promise<void>;
	startLlmHeartbeat: () => () => void;
	observeSupervisor: (observation: TurnSupervisorObservation) => Promise<void>;
	onToolCall?: (toolCall: ChatToolCall) => Promise<void> | void;
}): Promise<LlmStreamPassResult> {
	let assistantBuffer = '';
	let assistantReasoningForReplay = '';
	const assistantReasoningDetailsForReplay: unknown[] = [];
	const pendingToolCalls: ChatToolCall[] = [];
	let suppressedNoToolSynthesisToolCallCount = 0;
	let usage = params.usage;
	let finishedReason: string | undefined;
	let llmDoneReceived = false;
	const metadata: LLMStreamPassMetadata = {
		pass: params.passNumber
	};
	if (params.noToolSynthesisPass) {
		metadata.forcedNoToolSynthesis = true;
	}

	const clearLlmHeartbeat = params.startLlmHeartbeat();
	try {
		for await (const event of params.llm.streamText({
			messages: params.passMessages,
			tools: params.noToolSynthesisPass
				? undefined
				: params.hasTools
					? params.tools
					: undefined,
			tool_choice: params.noToolSynthesisPass
				? undefined
				: params.hasTools
					? 'auto'
					: undefined,
			temperature: params.noToolSynthesisPass ? undefined : params.hasTools ? 0.2 : undefined,
			userId: params.userId,
			sessionId: params.sessionId,
			chatSessionId: params.sessionId,
			turnRunId: params.turnRunId ?? undefined,
			streamRunId: params.streamRunId ?? undefined,
			clientTurnId: params.clientTurnId ?? undefined,
			profile: 'balanced',
			// Keep the per-pass output cap above the service default so long
			// answers and tool-call argument payloads are not cut mid-stream.
			maxTokens: FASTCHAT_LIMITS.SYNTHESIS_MAX_TOKENS,
			operationType: 'agentic_chat_v2_stream',
			contextType: params.normalizedContext,
			entityId: params.entityId ?? undefined,
			projectId: params.projectId ?? undefined,
			signal: params.signal
		})) {
			if (event.type === 'text' && event.content) {
				assistantBuffer += event.content;
				params.onAssistantBufferChange(assistantBuffer);
				await params.tryEmitEarlyAssistantLeadIn(assistantBuffer);
			} else if (event.type === 'reasoning') {
				const reasoningEvent = event as SmartLlmStreamEvent & {
					reasoning?: string;
					reasoning_details?: unknown[];
				};
				if (typeof reasoningEvent.reasoning === 'string') {
					assistantReasoningForReplay += reasoningEvent.reasoning;
				}
				if (Array.isArray(reasoningEvent.reasoning_details)) {
					assistantReasoningDetailsForReplay.push(...reasoningEvent.reasoning_details);
				}
				const reasoningLen =
					(typeof reasoningEvent.reasoning === 'string'
						? reasoningEvent.reasoning.length
						: 0) +
					(Array.isArray(reasoningEvent.reasoning_details)
						? reasoningEvent.reasoning_details.reduce<number>((acc, part) => {
								if (!part || typeof part !== 'object') return acc;
								const text = (part as { text?: unknown }).text;
								return acc + (typeof text === 'string' ? text.length : 0);
							}, 0)
						: 0);
				metadata.reasoningChannelChunks = (metadata.reasoningChannelChunks ?? 0) + 1;
				metadata.reasoningChannelChars =
					(metadata.reasoningChannelChars ?? 0) + reasoningLen;
			} else if (event.type === 'tool_call' && event.tool_call) {
				const normalizedToolCall = normalizeToolCallDefaults(
					event.tool_call,
					params.projectId ?? undefined
				);
				if (params.noToolSynthesisPass) {
					suppressedNoToolSynthesisToolCallCount += 1;
					metadata.suppressedNoToolSynthesisToolCalls =
						suppressedNoToolSynthesisToolCallCount;
					continue;
				}
				pendingToolCalls.push(normalizedToolCall);
				params.onPendingToolCallCountChange(pendingToolCalls.length);
				await params.observeSupervisor({
					type: 'tool_call_emitted',
					toolName: normalizedToolCall.function.name,
					toolCallId: normalizedToolCall.id,
					argsPreview: parseSupervisorToolArguments(normalizedToolCall)
				});
				if (params.onToolCall) {
					try {
						await params.onToolCall(normalizedToolCall);
					} catch {
						// UI/logging callbacks must not crash tool orchestration.
					}
				}
			} else if (event.type === 'done') {
				llmDoneReceived = true;
				if (event.usage) {
					usage = mergeStreamUsage(usage, event.usage);
					populateUsageMetadata(metadata, event.usage);
					await params.updateLiveContextUsage(event.usage.prompt_tokens);
				}
				finishedReason = event.finished_reason;
				if (event.finished_reason !== undefined) {
					metadata.finishedReason = event.finished_reason;
				}
				populateDoneEventMetadata(metadata, event);
			} else if (event.type === 'error') {
				throw new Error(event.error || 'LLM stream error');
			}
		}
	} finally {
		clearLlmHeartbeat();
	}

	if (!llmDoneReceived) {
		throw new Error(
			params.signal?.aborted
				? 'Request aborted'
				: 'LLM stream ended without a completion event'
		);
	}

	await params.observeSupervisor({
		type: 'llm_pass_completed',
		pass: metadata.pass,
		finishedReason: metadata.finishedReason,
		usage:
			metadata.totalTokens !== undefined ||
			metadata.promptTokens !== undefined ||
			metadata.completionTokens !== undefined
				? {
						total_tokens: metadata.totalTokens,
						prompt_tokens: metadata.promptTokens,
						completion_tokens: metadata.completionTokens
					}
				: undefined
	});

	return {
		assistantBuffer,
		assistantReasoningForReplay,
		assistantReasoningDetailsForReplay,
		pendingToolCalls,
		suppressedNoToolSynthesisToolCallCount,
		metadata,
		usage,
		finishedReason
	};
}

function mergeStreamUsage(
	currentUsage: FastAgentStreamUsage | undefined,
	eventUsage: FastAgentStreamUsage
): FastAgentStreamUsage {
	if (!currentUsage) {
		return { ...eventUsage };
	}

	const nextUsage: FastAgentStreamUsage = { ...currentUsage };
	if (eventUsage.total_tokens !== undefined) {
		nextUsage.total_tokens = (nextUsage.total_tokens ?? 0) + (eventUsage.total_tokens ?? 0);
	}
	if (eventUsage.prompt_tokens !== undefined) {
		nextUsage.prompt_tokens = (nextUsage.prompt_tokens ?? 0) + (eventUsage.prompt_tokens ?? 0);
	}
	if (eventUsage.completion_tokens !== undefined) {
		nextUsage.completion_tokens =
			(nextUsage.completion_tokens ?? 0) + (eventUsage.completion_tokens ?? 0);
	}
	return nextUsage;
}

function populateUsageMetadata(
	metadata: LLMStreamPassMetadata,
	eventUsage: FastAgentStreamUsage
): void {
	if (typeof eventUsage.prompt_tokens === 'number') {
		metadata.promptTokens = eventUsage.prompt_tokens;
	}
	if (typeof eventUsage.completion_tokens === 'number') {
		metadata.completionTokens = eventUsage.completion_tokens;
	}
	if (typeof eventUsage.total_tokens === 'number') {
		metadata.totalTokens = eventUsage.total_tokens;
	}

	const usageRecord = eventUsage as Record<string, unknown>;
	const completionTokenDetails =
		usageRecord.completion_tokens_details &&
		typeof usageRecord.completion_tokens_details === 'object'
			? (usageRecord.completion_tokens_details as Record<string, unknown>)
			: null;
	const usageReasoningTokens =
		completionTokenDetails && typeof completionTokenDetails.reasoning_tokens === 'number'
			? completionTokenDetails.reasoning_tokens
			: undefined;
	if (typeof usageReasoningTokens === 'number') {
		metadata.reasoningTokens = usageReasoningTokens;
	}
}

function populateDoneEventMetadata(
	metadata: LLMStreamPassMetadata,
	event: SmartLlmStreamEvent
): void {
	const eventRecord = event as Record<string, unknown>;
	const model = readStringMeta(eventRecord.model);
	const provider = readStringMeta(eventRecord.provider);
	const requestId =
		readStringMeta(eventRecord.request_id) ?? readStringMeta(eventRecord.requestId);
	const systemFingerprint =
		readStringMeta(eventRecord.system_fingerprint) ??
		readStringMeta(eventRecord.systemFingerprint);
	const cacheStatus =
		readStringMeta(eventRecord.cache_status) ?? readStringMeta(eventRecord.cacheStatus);
	const reasoningTokens =
		readNumberMeta(eventRecord.reasoning_tokens) ?? readNumberMeta(eventRecord.reasoningTokens);

	if (model) metadata.model = model;
	if (provider) metadata.provider = provider;
	if (requestId) metadata.requestId = requestId;
	if (systemFingerprint) metadata.systemFingerprint = systemFingerprint;
	if (cacheStatus) metadata.cacheStatus = cacheStatus;
	if (typeof reasoningTokens === 'number') {
		metadata.reasoningTokens = reasoningTokens;
	}
}

function readStringMeta(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function readNumberMeta(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
