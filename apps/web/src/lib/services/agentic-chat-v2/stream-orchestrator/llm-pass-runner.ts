// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/llm-pass-runner.ts
import type { ChatContextType, ChatToolCall, ChatToolDefinition } from '@buildos/shared-types';
import type { OpenRouterContentPart } from '$lib/services/openrouter-v2/types';
import type { SmartLLMService } from '$lib/services/smart-llm-service';
import { FASTCHAT_LIMITS } from '../limits';
import type { FastChatLlmPassRole, FastChatPassModelRouting } from '../model-tiering';
import type { FastAgentStreamUsage, FastChatHistoryMessage } from '../types';
import type { TurnSupervisorObservation } from '../turn-supervisor';
import { parseToolArguments as parseSupervisorToolArguments } from '../turn-supervisor/digest';
import type {
	LLMStreamAttemptRoute,
	LLMStreamPassMetadata,
	LLMStreamPassTerminalMeasurements,
	LLMStreamPassTerminalOutcome
} from './shared';
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

const MAX_LLM_STREAM_ATTEMPTS = 2;
const LLM_PASS_TIMEOUT_MS = 60_000;
const LLM_STREAM_RETRY_BASE_DELAY_MS = 250;
const LLM_STREAM_RETRY_JITTER_MS = 250;
const MAX_RETRY_ERROR_METADATA_LENGTH = 240;

export type LlmStreamPassResult = {
	assistantBuffer: string;
	assistantReasoningForReplay: string;
	assistantReasoningDetailsForReplay: unknown[];
	pendingToolCalls: ChatToolCall[];
	suppressedNoToolSynthesisToolCallCount: number;
	metadata: LLMStreamPassMetadata;
	usage?: FastAgentStreamUsage;
	finishedReason?: string;
	terminal: LlmStreamPassTerminal;
};

export type LlmStreamPassTerminalOutcome = LLMStreamPassTerminalOutcome;
export type LlmStreamPassTerminalMeasurements = LLMStreamPassTerminalMeasurements;

export type LlmStreamPassTerminal = {
	outcome: LlmStreamPassTerminalOutcome;
	measurements: LlmStreamPassTerminalMeasurements;
};

/**
 * Typed terminal failure for a logical LLM pass. The phase-1 recovery boundary
 * can inspect this value without parsing provider/error prose, while the
 * original message remains intact for existing logs and cancellation handling.
 */
export class LlmStreamPassTerminalError extends Error {
	override name = 'LlmStreamPassTerminalError';

	constructor(
		message: string,
		readonly outcome: Exclude<LlmStreamPassTerminalOutcome, 'completed'>,
		readonly measurements: LlmStreamPassTerminalMeasurements,
		readonly originalError?: Error,
		readonly partialAssistantText = ''
	) {
		super(message);
	}
}

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
	onStreamRetry?: (error: Error, attempt: number) => Promise<void> | void;
	retryDelayMs?: (attempt: number) => number;
	passTimeoutMs?: number;
	modelRouting?: FastChatPassModelRouting;
}): Promise<LlmStreamPassResult> {
	const maxAttempts = MAX_LLM_STREAM_ATTEMPTS;
	let lastRetryError: Error | null = null;
	const modelProfile = params.modelRouting?.profile ?? 'balanced';
	const modelCandidates =
		params.modelRouting?.models && params.modelRouting.models.length > 0
			? params.modelRouting.models
			: undefined;
	const maxTokens = params.modelRouting?.maxTokens ?? FASTCHAT_LIMITS.SYNTHESIS_MAX_TOKENS;
	const startedAtMs = Date.now();
	let attemptsStarted = 0;
	let assistantTextCharsReceived = 0;
	let reasoningCharsReceived = 0;
	let toolCallsReceived = 0;
	let bestPartialAssistantText = '';
	const attemptRoutes: LLMStreamAttemptRoute[] = [];

	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		attemptsStarted = attempt;
		let assistantBuffer = '';
		let assistantReasoningForReplay = '';
		const assistantReasoningDetailsForReplay: unknown[] = [];
		const pendingToolCalls: ChatToolCall[] = [];
		let suppressedNoToolSynthesisToolCallCount = 0;
		const suppressedNoToolSynthesisToolCallDetails: Array<{
			name: string;
			argumentsPreview: string;
		}> = [];
		let usage = params.usage;
		let finishedReason: string | undefined;
		let llmDoneReceived = false;
		let firstTokenAtMs: number | null = null;
		const metadata = createPassMetadata(
			params.passNumber,
			params.noToolSynthesisPass,
			params.modelRouting
		);
		const attemptModelCandidates = resolveAttemptModelCandidates(
			modelCandidates,
			attempt,
			params.modelRouting?.retryModelRotation === true
		);
		attemptRoutes.push({
			attempt,
			...(attemptModelCandidates?.length ? { models: [...attemptModelCandidates] } : {}),
			...(params.modelRouting?.ignoredProviderSlugs?.length
				? { ignoredProviderSlugs: [...params.modelRouting.ignoredProviderSlugs] }
				: {}),
			maxTokens
		});
		metadata.attemptRoutes = cloneAttemptRoutes(attemptRoutes);
		metadata.startedAtMs = startedAtMs;
		if (attempt > 1) {
			metadata.attempts = attempt;
			metadata.streamRetryCount = attempt - 1;
			if (lastRetryError) {
				metadata.lastStreamRetryError = truncateRetryError(lastRetryError.message);
			}
		}

		const passAbortSignal = createLlmPassAbortSignal(
			params.signal,
			params.passTimeoutMs ?? LLM_PASS_TIMEOUT_MS
		);
		const clearLlmHeartbeat = params.startLlmHeartbeat();
		let heartbeatCleared = false;
		const clearLlmHeartbeatOnce = (): void => {
			if (heartbeatCleared) return;
			heartbeatCleared = true;
			clearLlmHeartbeat();
		};
		try {
			for await (const event of params.llm.streamText({
				messages: params.passMessages,
				tools: params.noToolSynthesisPass
					? undefined
					: params.hasTools
						? params.tools
						: undefined,
				tool_choice: params.noToolSynthesisPass
					? 'none'
					: params.hasTools
						? 'auto'
						: undefined,
				temperature: params.noToolSynthesisPass ? 0.1 : params.hasTools ? 0.2 : undefined,
				userId: params.userId,
				sessionId: params.sessionId,
				chatSessionId: params.sessionId,
				turnRunId: params.turnRunId ?? undefined,
				streamRunId: params.streamRunId ?? undefined,
				clientTurnId: params.clientTurnId ?? undefined,
				profile: modelProfile,
				models: attemptModelCandidates,
				providerRouting: params.modelRouting?.ignoredProviderSlugs?.length
					? { ignore: params.modelRouting.ignoredProviderSlugs }
					: undefined,
				// Keep the per-pass output cap above the service default so long
				// answers and tool-call argument payloads are not cut mid-stream.
				maxTokens,
				operationType: 'agentic_chat_v2_stream',
				contextType: params.normalizedContext,
				entityId: params.entityId ?? undefined,
				projectId: params.projectId ?? undefined,
				signal: passAbortSignal.signal
			})) {
				if (event.type === 'text' && event.content) {
					assistantTextCharsReceived += event.content.length;
					if (firstTokenAtMs === null) firstTokenAtMs = Date.now();
					assistantBuffer += event.content;
					if (assistantBuffer.trim().length >= bestPartialAssistantText.trim().length) {
						bestPartialAssistantText = assistantBuffer;
					}
					params.onAssistantBufferChange(assistantBuffer);
					// Forced synthesis may be retried. Do not expose a complete-looking
					// sentence from an attempt that can still fail and be replaced by a
					// different retry; terminal finalization emits the chosen buffer once.
					if (!params.noToolSynthesisPass) {
						await params.tryEmitEarlyAssistantLeadIn(assistantBuffer);
					}
				} else if (event.type === 'reasoning') {
					reasoningCharsReceived += measureReasoningEventChars(event);
					if (firstTokenAtMs === null) firstTokenAtMs = Date.now();
					const reasoningEvent = event as SmartLlmStreamEvent & {
						reasoning?: string;
						reasoning_details?: unknown[];
					};
					if (typeof reasoningEvent.reasoning === 'string') {
						assistantReasoningForReplay += reasoningEvent.reasoning;
					}
					if (Array.isArray(reasoningEvent.reasoning_details)) {
						assistantReasoningDetailsForReplay.push(
							...reasoningEvent.reasoning_details
						);
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
					toolCallsReceived += 1;
					if (firstTokenAtMs === null) firstTokenAtMs = Date.now();
					const normalizedToolCall = normalizeToolCallDefaults(
						event.tool_call,
						params.projectId ?? undefined
					);
					if (params.noToolSynthesisPass) {
						suppressedNoToolSynthesisToolCallCount += 1;
						metadata.suppressedNoToolSynthesisToolCalls =
							suppressedNoToolSynthesisToolCallCount;
						if (suppressedNoToolSynthesisToolCallDetails.length < 4) {
							suppressedNoToolSynthesisToolCallDetails.push({
								name: normalizedToolCall.function.name,
								argumentsPreview: JSON.stringify(
									parseSupervisorToolArguments(normalizedToolCall)
								).slice(0, 800)
							});
							metadata.suppressedNoToolSynthesisToolCallDetails =
								suppressedNoToolSynthesisToolCallDetails;
						}
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
					throw new LlmStreamPassAttemptError(event.error || 'LLM stream error');
				}
			}
		} catch (error) {
			const normalizedError = normalizeStreamAttemptError(
				passAbortSignal.timedOut() && !params.signal?.aborted
					? createLlmPassTimeoutError(passAbortSignal.timeoutMs)
					: error
			);
			if (shouldRetryStreamAttempt(normalizedError, params.signal, attempt, maxAttempts)) {
				lastRetryError = normalizedError;
				clearLlmHeartbeatOnce();
				await prepareForStreamRetry(params, attempt, maxAttempts, normalizedError);
				continue;
			}
			throw createLlmStreamPassTerminalError({
				error: normalizedError,
				params,
				attemptsStarted,
				maxAttempts,
				startedAtMs,
				terminalEventReceived: llmDoneReceived,
				assistantTextCharsReceived,
				reasoningCharsReceived,
				toolCallsReceived,
				partialAssistantText: bestPartialAssistantText,
				attemptRoutes
			});
		} finally {
			passAbortSignal.dispose();
			clearLlmHeartbeatOnce();
		}

		if (!llmDoneReceived) {
			const missingDoneError = new LlmStreamPassAttemptError(
				params.signal?.aborted
					? 'Request aborted'
					: passAbortSignal.timedOut()
						? createLlmPassTimeoutMessage(passAbortSignal.timeoutMs)
						: 'LLM stream ended without a completion event'
			);
			if (shouldRetryStreamAttempt(missingDoneError, params.signal, attempt, maxAttempts)) {
				lastRetryError = missingDoneError;
				await prepareForStreamRetry(params, attempt, maxAttempts, missingDoneError);
				continue;
			}
			throw createLlmStreamPassTerminalError({
				error: missingDoneError,
				params,
				attemptsStarted,
				maxAttempts,
				startedAtMs,
				terminalEventReceived: false,
				assistantTextCharsReceived,
				reasoningCharsReceived,
				toolCallsReceived,
				partialAssistantText: bestPartialAssistantText,
				attemptRoutes
			});
		}

		metadata.firstTokenAtMs = firstTokenAtMs;
		metadata.timeToFirstTokenMs = firstTokenAtMs !== null ? firstTokenAtMs - startedAtMs : null;
		metadata.durationMs = Date.now() - startedAtMs;
		metadata.terminalOutcome = 'completed';
		metadata.terminalEventReceived = true;
		metadata.assistantTextCharsReceived = assistantTextCharsReceived;
		metadata.reasoningCharsReceived = reasoningCharsReceived;
		metadata.toolCallsReceived = toolCallsReceived;
		metadata.attemptsExhausted = false;
		metadata.attemptRoutes = cloneAttemptRoutes(attemptRoutes);

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
			finishedReason,
			terminal: {
				outcome: 'completed',
				measurements: buildTerminalMeasurements({
					params,
					attemptsStarted,
					maxAttempts,
					startedAtMs,
					terminalEventReceived: true,
					assistantTextCharsReceived,
					reasoningCharsReceived,
					toolCallsReceived,
					retryable: false,
					attemptsExhausted: false,
					lastError: lastRetryError,
					attemptRoutes
				})
			}
		};
	}

	throw lastRetryError ?? new Error('LLM stream failed');
}

function createLlmStreamPassTerminalError(params: {
	error: Error;
	params: Parameters<typeof runLlmStreamPass>[0];
	attemptsStarted: number;
	maxAttempts: number;
	startedAtMs: number;
	terminalEventReceived: boolean;
	assistantTextCharsReceived: number;
	reasoningCharsReceived: number;
	toolCallsReceived: number;
	partialAssistantText: string;
	attemptRoutes: LLMStreamAttemptRoute[];
}): LlmStreamPassTerminalError {
	const outcome = classifyTerminalOutcome(params.error, params.params.signal);
	return new LlmStreamPassTerminalError(
		params.error.message,
		outcome,
		buildTerminalMeasurements({
			params: params.params,
			attemptsStarted: params.attemptsStarted,
			maxAttempts: params.maxAttempts,
			startedAtMs: params.startedAtMs,
			terminalEventReceived: params.terminalEventReceived,
			assistantTextCharsReceived: params.assistantTextCharsReceived,
			reasoningCharsReceived: params.reasoningCharsReceived,
			toolCallsReceived: params.toolCallsReceived,
			retryable: outcome !== 'aborted' && isRetryableLlmStreamError(params.error),
			attemptsExhausted: params.attemptsStarted >= params.maxAttempts,
			lastError: params.error,
			attemptRoutes: params.attemptRoutes
		}),
		params.error,
		params.partialAssistantText
	);
}

function buildTerminalMeasurements(params: {
	params: Parameters<typeof runLlmStreamPass>[0];
	attemptsStarted: number;
	maxAttempts: number;
	startedAtMs: number;
	terminalEventReceived: boolean;
	assistantTextCharsReceived: number;
	reasoningCharsReceived: number;
	toolCallsReceived: number;
	retryable: boolean;
	attemptsExhausted: boolean;
	lastError?: Error | null;
	attemptRoutes: LLMStreamAttemptRoute[];
}): LlmStreamPassTerminalMeasurements {
	return {
		pass: params.params.passNumber,
		...(params.params.modelRouting?.passRole
			? { passRole: params.params.modelRouting.passRole }
			: {}),
		forcedNoToolSynthesis: params.params.noToolSynthesisPass,
		attempts: params.attemptsStarted,
		maxAttempts: params.maxAttempts,
		retryCount: Math.max(0, params.attemptsStarted - 1),
		timeoutMs: params.params.passTimeoutMs ?? LLM_PASS_TIMEOUT_MS,
		durationMs: Math.max(0, Date.now() - params.startedAtMs),
		terminalEventReceived: params.terminalEventReceived,
		assistantTextCharsReceived: params.assistantTextCharsReceived,
		reasoningCharsReceived: params.reasoningCharsReceived,
		toolCallsReceived: params.toolCallsReceived,
		retryable: params.retryable,
		attemptsExhausted: params.attemptsExhausted,
		attemptRoutes: cloneAttemptRoutes(params.attemptRoutes),
		...(params.lastError
			? { lastErrorMessage: truncateRetryError(params.lastError.message) }
			: {})
	};
}

function classifyTerminalOutcome(
	error: Error,
	parentSignal: AbortSignal | undefined
): Exclude<LlmStreamPassTerminalOutcome, 'completed'> {
	if (parentSignal?.aborted || /^Request aborted$/i.test(error.message)) return 'aborted';
	if (/timed out|timeout/i.test(error.message)) return 'timed_out';
	if (/without a completion event/i.test(error.message)) return 'missing_completion_event';
	if (/OpenRouter|provider|upstream|HTTP\s*[45]\d\d|\b[45]\d\d\b/i.test(error.message)) {
		return 'provider_error';
	}
	return 'stream_error';
}

function measureReasoningEventChars(event: SmartLlmStreamEvent): number {
	if (event.type !== 'reasoning') return 0;
	const reasoningChars = typeof event.reasoning === 'string' ? event.reasoning.length : 0;
	const detailChars = Array.isArray(event.reasoning_details)
		? event.reasoning_details.reduce<number>((total: number, detail: unknown) => {
				if (!detail || typeof detail !== 'object') return total;
				const text = (detail as { text?: unknown }).text;
				return total + (typeof text === 'string' ? text.length : 0);
			}, 0)
		: 0;
	return reasoningChars + detailChars;
}

class LlmStreamPassAttemptError extends Error {
	override name = 'LlmStreamPassAttemptError';
}

type LlmPassAbortSignal = {
	signal: AbortSignal | undefined;
	timeoutMs: number;
	timedOut: () => boolean;
	dispose: () => void;
};

function createLlmPassAbortSignal(
	parentSignal: AbortSignal | undefined,
	timeoutMs: number
): LlmPassAbortSignal {
	const normalizedTimeoutMs = Math.max(0, Math.floor(timeoutMs));
	if (normalizedTimeoutMs <= 0) {
		return {
			signal: parentSignal,
			timeoutMs: normalizedTimeoutMs,
			timedOut: () => false,
			dispose: () => {}
		};
	}

	const controller = new AbortController();
	let timeout: ReturnType<typeof setTimeout> | null = null;
	let timedOut = false;
	const cleanup = (): void => {
		if (timeout) {
			clearTimeout(timeout);
			timeout = null;
		}
		parentSignal?.removeEventListener('abort', abortFromParent);
	};
	const abortFromParent = (): void => {
		controller.abort(parentSignal?.reason);
	};

	if (parentSignal?.aborted) {
		abortFromParent();
	} else {
		parentSignal?.addEventListener('abort', abortFromParent, { once: true });
		timeout = setTimeout(() => {
			timedOut = true;
			controller.abort(createLlmPassTimeoutError(normalizedTimeoutMs));
		}, normalizedTimeoutMs);
	}

	return {
		signal: controller.signal,
		timeoutMs: normalizedTimeoutMs,
		timedOut: () => timedOut,
		dispose: cleanup
	};
}

function createLlmPassTimeoutMessage(timeoutMs: number): string {
	return `LLM stream pass timed out after ${timeoutMs}ms`;
}

function createLlmPassTimeoutError(timeoutMs: number): LlmStreamPassAttemptError {
	return new LlmStreamPassAttemptError(createLlmPassTimeoutMessage(timeoutMs));
}

function createPassMetadata(
	passNumber: number,
	noToolSynthesisPass: boolean,
	modelRouting?: FastChatPassModelRouting
): LLMStreamPassMetadata {
	const metadata: LLMStreamPassMetadata = {
		pass: passNumber
	};
	if (modelRouting) {
		metadata.passRole = modelRouting.passRole;
		metadata.requestedProfile = modelRouting.profile;
		if (modelRouting.models?.length) {
			metadata.requestedModels = [...modelRouting.models];
		}
		if (modelRouting.modelTieringVariant) {
			metadata.modelTieringVariant = modelRouting.modelTieringVariant;
		}
		if (modelRouting.forcedSynthesisRoutingVariant) {
			metadata.forcedSynthesisRoutingVariant = modelRouting.forcedSynthesisRoutingVariant;
		}
		if (modelRouting.ignoredProviderSlugs?.length) {
			metadata.ignoredProviderSlugs = [...modelRouting.ignoredProviderSlugs];
		}
		if (modelRouting.maxTokens !== undefined) {
			metadata.maxTokens = modelRouting.maxTokens;
		}
		if (modelRouting.retryModelRotation === true) {
			metadata.retryModelRotation = true;
		}
	}
	if (noToolSynthesisPass) {
		metadata.forcedNoToolSynthesis = true;
	}
	return metadata;
}

function normalizeStreamAttemptError(error: unknown): Error {
	if (error instanceof Error) {
		return error;
	}
	if (typeof error === 'string') {
		return new Error(error);
	}
	return new Error('LLM stream error');
}

function shouldRetryStreamAttempt(
	error: Error,
	signal: AbortSignal | undefined,
	attempt: number,
	maxAttempts: number
): boolean {
	if (signal?.aborted) return false;
	if (attempt >= maxAttempts) return false;
	return isRetryableLlmStreamError(error);
}

function isRetryableLlmStreamError(error: Error): boolean {
	const status = readHttpStatusFromError(error);
	if (status === 408 || status === 409 || status === 425 || status === 429) {
		return true;
	}
	if (status && status >= 400 && status < 500) {
		return false;
	}
	if (status && status >= 500 && status < 600) {
		return true;
	}

	const errorRecord = error as Error & { code?: unknown };
	const code = typeof errorRecord.code === 'string' ? errorRecord.code.toUpperCase() : '';
	if (
		code === 'ETIMEDOUT' ||
		code === 'ECONNRESET' ||
		code === 'ECONNREFUSED' ||
		code === 'EAI_AGAIN' ||
		code === 'UND_ERR_CONNECT_TIMEOUT' ||
		code === 'UND_ERR_HEADERS_TIMEOUT' ||
		code === 'UND_ERR_SOCKET' ||
		code === 'UND_ERR_ABORTED'
	) {
		return true;
	}
	if (error.name === 'AbortError') {
		return true;
	}

	const message = error.message.toLowerCase();
	if (
		message.includes('invalid request') ||
		message.includes('authentication') ||
		message.includes('unauthorized') ||
		message.includes('forbidden') ||
		message.includes('api key') ||
		message.includes('context length') ||
		message.includes('maximum context') ||
		message.includes('payload too large')
	) {
		return false;
	}
	if (
		message.includes('llm stream ended without a completion event') ||
		message.includes('no response stream available') ||
		message.includes('stream failed') ||
		message.includes('timeout') ||
		message.includes('timed out') ||
		message.includes('rate limit') ||
		message.includes('too many requests') ||
		message.includes('terminated') ||
		message.includes('aborted') ||
		message.includes('connection reset') ||
		message.includes('socket hang up') ||
		message.includes('fetch failed') ||
		message.includes('network error')
	) {
		return true;
	}
	return /\b(?:econnreset|econnrefused|etimedout|eai_again|socket)\b/i.test(error.message);
}

function readHttpStatusFromError(error: Error): number | null {
	const record = error as Error & {
		status?: unknown;
		statusCode?: unknown;
		response?: { status?: unknown };
	};
	const directStatus =
		typeof record.status === 'number'
			? record.status
			: typeof record.statusCode === 'number'
				? record.statusCode
				: typeof record.response?.status === 'number'
					? record.response.status
					: null;
	if (directStatus && Number.isInteger(directStatus)) {
		return directStatus;
	}
	const statusMatch = error.message.match(/\b([45]\d{2})\b/);
	return statusMatch ? Number(statusMatch[1]) : null;
}

async function prepareForStreamRetry(
	params: {
		onAssistantBufferChange: (assistantBuffer: string) => void;
		onPendingToolCallCountChange: (count: number) => void;
		signal?: AbortSignal;
		retryDelayMs?: (attempt: number) => number;
		onStreamRetry?: (error: Error, attempt: number) => Promise<void> | void;
		passNumber: number;
	},
	attempt: number,
	maxAttempts: number,
	error: Error
): Promise<void> {
	if (params.onStreamRetry) {
		try {
			await params.onStreamRetry(error, attempt);
		} catch {
			// Progress callbacks must not interfere with transport recovery.
		}
	}
	params.onAssistantBufferChange('');
	params.onPendingToolCallCountChange(0);
	console.warn('[llm-pass-runner] retrying LLM stream pass after transient error', {
		pass: params.passNumber,
		attempt,
		maxAttempts,
		error: error.message
	});
	const delayMs = Math.max(
		0,
		Math.floor(params.retryDelayMs?.(attempt) ?? defaultStreamRetryDelayMs(attempt))
	);
	await abortableDelay(delayMs, params.signal);
}

function defaultStreamRetryDelayMs(attempt: number): number {
	const exponentialDelay = LLM_STREAM_RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1);
	const jitter = Math.floor(Math.random() * LLM_STREAM_RETRY_JITTER_MS);
	return exponentialDelay + jitter;
}

function abortableDelay(ms: number, signal: AbortSignal | undefined): Promise<void> {
	if (signal?.aborted) {
		return Promise.reject(new Error('Request aborted'));
	}
	if (ms <= 0) {
		return Promise.resolve();
	}
	return new Promise((resolve, reject) => {
		let timeout: ReturnType<typeof setTimeout> | null = null;
		const cleanup = (): void => {
			if (timeout) {
				clearTimeout(timeout);
				timeout = null;
			}
			signal?.removeEventListener('abort', onAbort);
		};
		const onAbort = (): void => {
			cleanup();
			reject(new Error('Request aborted'));
		};
		timeout = setTimeout(() => {
			cleanup();
			resolve();
		}, ms);
		signal?.addEventListener('abort', onAbort, { once: true });
	});
}

function truncateRetryError(message: string): string {
	if (message.length <= MAX_RETRY_ERROR_METADATA_LENGTH) {
		return message;
	}
	return `${message.slice(0, MAX_RETRY_ERROR_METADATA_LENGTH - 3)}...`;
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
	const providerRaw = readStringMeta(eventRecord.provider_raw);
	const providerSlug = readStringMeta(eventRecord.provider_slug);
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
	if (providerRaw) metadata.providerRaw = providerRaw;
	if (providerSlug) metadata.providerSlug = providerSlug;
	if (requestId) metadata.requestId = requestId;
	if (systemFingerprint) metadata.systemFingerprint = systemFingerprint;
	if (cacheStatus) metadata.cacheStatus = cacheStatus;
	if (typeof reasoningTokens === 'number') {
		metadata.reasoningTokens = reasoningTokens;
	}
}

function resolveAttemptModelCandidates(
	models: string[] | undefined,
	attempt: number,
	rotateOnRetry: boolean
): string[] | undefined {
	if (!models?.length) return undefined;
	if (!rotateOnRetry || attempt <= 1 || models.length <= 1) return [...models];
	const offset = (attempt - 1) % models.length;
	return [...models.slice(offset), ...models.slice(0, offset)];
}

function cloneAttemptRoutes(routes: LLMStreamAttemptRoute[]): LLMStreamAttemptRoute[] {
	return routes.map((route) => ({
		...route,
		...(route.models ? { models: [...route.models] } : {}),
		...(route.ignoredProviderSlugs
			? { ignoredProviderSlugs: [...route.ignoredProviderSlugs] }
			: {})
	}));
}

function readStringMeta(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function readNumberMeta(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
