// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts
import type {
	ChatContextType,
	ChatToolCall,
	ChatToolDefinition,
	ChatToolResult
} from '@buildos/shared-types';
import type { SmartLLMService } from '$lib/services/smart-llm-service';
import type { FastChatHistoryMessage, FastAgentStreamUsage } from './types';
import { normalizeFastContextType } from './prompt-builder';
import { buildMasterPrompt } from './master-prompt-builder';

type FastToolExecution = {
	toolCall: ChatToolCall;
	result: ChatToolResult;
};

type StreamFastChatParams = {
	llm: SmartLLMService;
	userId: string;
	sessionId: string;
	contextType: ChatContextType;
	entityId?: string | null;
	projectId?: string | null;
	history: FastChatHistoryMessage[];
	message: string;
	signal?: AbortSignal;
	onDelta: (delta: string) => Promise<void> | void;
	systemPrompt?: string;
	tools?: ChatToolDefinition[];
	toolExecutor?: (toolCall: ChatToolCall) => Promise<ChatToolResult>;
	onToolCall?: (toolCall: ChatToolCall) => Promise<void> | void;
	onToolResult?: (execution: FastToolExecution) => Promise<void> | void;
	maxToolRounds?: number;
	maxToolCalls?: number;
};

export async function streamFastChat(params: StreamFastChatParams): Promise<{
	assistantText: string;
	usage?: FastAgentStreamUsage;
	finishedReason?: string;
	toolExecutions?: FastToolExecution[];
}> {
	const { llm, userId, sessionId, contextType, entityId, history, message, signal, onDelta } =
		params;

	const normalizedContext = normalizeFastContextType(contextType);
	const systemPrompt =
		params.systemPrompt ??
		buildMasterPrompt({
			contextType: normalizedContext,
			entityId
		});

	const messages: FastChatHistoryMessage[] = [
		{ role: 'system', content: systemPrompt },
		...history,
		{ role: 'user', content: message }
	];

	let assistantText = '';
	let usage: FastAgentStreamUsage | undefined;
	let finishedReason: string | undefined;
	const toolExecutions: FastToolExecution[] = [];
	const tools = params.tools ?? [];
	const hasTools = tools.length > 0;
	const allowedToolNames = new Set(
		tools.map((tool) => tool.function?.name).filter((name): name is string => Boolean(name))
	);
	const maxToolRounds = Math.max(1, params.maxToolRounds ?? 4);
	const maxToolCalls = Math.max(1, params.maxToolCalls ?? 10);
	let toolRounds = 0;
	let toolCallsMade = 0;

	while (true) {
		if (signal?.aborted) {
			throw new Error('Request aborted');
		}

		let assistantBuffer = '';
		const pendingToolCalls: ChatToolCall[] = [];

		for await (const event of llm.streamText({
			messages,
			tools: hasTools ? tools : undefined,
			tool_choice: hasTools ? 'auto' : undefined,
			userId,
			sessionId,
			chatSessionId: sessionId,
			profile: 'balanced',
			operationType: 'agentic_chat_v2_stream',
			contextType: normalizedContext,
			entityId: entityId ?? undefined,
			projectId: params.projectId ?? undefined,
			signal
		})) {
			if (event.type === 'text' && event.content) {
				assistantBuffer += event.content;
				await onDelta(event.content);
			} else if (event.type === 'tool_call' && event.tool_call) {
				pendingToolCalls.push(event.tool_call);
				if (params.onToolCall) {
					await params.onToolCall(event.tool_call);
				}
			} else if (event.type === 'done') {
				if (event.usage) {
					if (!usage) {
						usage = { ...event.usage };
					} else {
						if (event.usage.total_tokens !== undefined) {
							usage.total_tokens =
								(usage.total_tokens ?? 0) + (event.usage.total_tokens ?? 0);
						}
						if (event.usage.prompt_tokens !== undefined) {
							usage.prompt_tokens =
								(usage.prompt_tokens ?? 0) + (event.usage.prompt_tokens ?? 0);
						}
						if (event.usage.completion_tokens !== undefined) {
							usage.completion_tokens =
								(usage.completion_tokens ?? 0) + (event.usage.completion_tokens ?? 0);
						}
					}
				}
				finishedReason = event.finished_reason ?? finishedReason;
			} else if (event.type === 'error') {
				throw new Error(event.error || 'LLM stream error');
			}
		}

		assistantText += assistantBuffer;

		if (pendingToolCalls.length === 0) {
			break;
		}

		if (!params.toolExecutor) {
			throw new Error('Tool executor is not configured');
		}

		toolRounds += 1;
		if (toolRounds > maxToolRounds) {
			throw new Error('FastChat exceeded tool round limit');
		}

		messages.push({
			role: 'assistant',
			content: assistantBuffer,
			tool_calls: pendingToolCalls
		});

		for (const toolCall of pendingToolCalls) {
			if (signal?.aborted) {
				throw new Error('Request aborted');
			}

			toolCallsMade += 1;
			if (toolCallsMade > maxToolCalls) {
				throw new Error('FastChat exceeded tool call limit');
			}

			let result: ChatToolResult;
			if (!allowedToolNames.has(toolCall.function.name)) {
				result = {
					tool_call_id: toolCall.id,
					result: null,
					success: false,
					error: 'Tool not available in this context'
				};
			} else {
				try {
					result = await params.toolExecutor(toolCall);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : 'Tool execution failed';
					result = {
						tool_call_id: toolCall.id,
						result: null,
						success: false,
						error: message
					};
				}
			}

			const execution: FastToolExecution = { toolCall, result };
			toolExecutions.push(execution);
			if (params.onToolResult) {
				await params.onToolResult(execution);
			}

			const toolPayload = result.result ?? (result.error ? { error: result.error } : null);
			messages.push({
				role: 'tool',
				content: JSON.stringify(toolPayload),
				tool_call_id: toolCall.id
			});
		}
	}

	return { assistantText, usage, finishedReason, toolExecutions };
}
