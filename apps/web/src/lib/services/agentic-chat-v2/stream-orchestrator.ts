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
import { FASTCHAT_LIMITS } from './limits';
import { dev } from '$app/environment';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { isValidUUID } from '$lib/utils/operations/validation-utils';

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
	debugContext?: {
		gatewayEnabled?: boolean;
		historyStrategy?: string;
		historyCompressed?: boolean;
		rawHistoryCount?: number;
		historyForModelCount?: number;
		tailMessagesKept?: number;
		continuityHintUsed?: boolean;
	};
};

type ToolValidationIssue = {
	toolCall: ChatToolCall;
	toolName: string;
	errors: string[];
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

	// --- PROMPT DUMP (dev only) ---
	if (dev) {
		try {
			const dumpDir = join(process.cwd(), '.prompt-dumps');
			mkdirSync(dumpDir, { recursive: true });
			const ts = new Date().toISOString().replace(/[:.]/g, '-');
			const dumpPath = join(dumpDir, `fastchat-${ts}.txt`);

			const toolNames = (params.tools ?? []).map((t) => t.function?.name).filter(Boolean);

			const lines: string[] = [
				`========================================`,
				`FASTCHAT V2 PROMPT DUMP`,
				`Timestamp: ${new Date().toISOString()}`,
				`Session:   ${sessionId}`,
				`Context:   ${normalizedContext}`,
				`Entity ID: ${entityId ?? 'none'}`,
				`Project:   ${params.projectId ?? 'none'}`,
				`Tools (${toolNames.length}): ${toolNames.join(', ') || 'none'}`,
				`History messages: ${history.length}`,
				`Gateway mode: ${params.debugContext?.gatewayEnabled ? 'enabled' : 'disabled'}`,
				`History strategy: ${params.debugContext?.historyStrategy ?? 'raw_history'}`,
				`History compressed: ${params.debugContext?.historyCompressed ? 'yes' : 'no'}`,
				`History raw/model counts: ${
					typeof params.debugContext?.rawHistoryCount === 'number'
						? params.debugContext.rawHistoryCount
						: history.length
				}/${typeof params.debugContext?.historyForModelCount === 'number' ? params.debugContext.historyForModelCount : history.length}`,
				`History tail kept: ${
					typeof params.debugContext?.tailMessagesKept === 'number'
						? params.debugContext.tailMessagesKept
						: history.length
				}`,
				`Continuity hint used: ${params.debugContext?.continuityHintUsed ? 'yes' : 'no'}`,
				`User message length: ${message.length} chars`,
				`System prompt length: ${systemPrompt.length} chars (~${Math.ceil(systemPrompt.length / 4)} tokens)`,
				`========================================`,
				``,
				`────────────────────────────────────────`,
				`SYSTEM PROMPT`,
				`────────────────────────────────────────`,
				``,
				systemPrompt,
				``,
				`────────────────────────────────────────`,
				`CONVERSATION HISTORY (${history.length} messages)`,
				`────────────────────────────────────────`,
				``
			];

			for (const msg of history) {
				lines.push(`[${msg.role.toUpperCase()}]`);
				lines.push(msg.content);
				if (msg.tool_calls?.length) {
					lines.push(`  tool_calls: ${JSON.stringify(msg.tool_calls, null, 2)}`);
				}
				if (msg.tool_call_id) {
					lines.push(`  tool_call_id: ${msg.tool_call_id}`);
				}
				lines.push(``);
			}

			lines.push(`────────────────────────────────────────`);
			lines.push(`CURRENT USER MESSAGE`);
			lines.push(`────────────────────────────────────────`);
			lines.push(``);
			lines.push(message);
			lines.push(``);

			if (toolNames.length > 0) {
				lines.push(`────────────────────────────────────────`);
				lines.push(`TOOL DEFINITIONS (${toolNames.length})`);
				lines.push(`────────────────────────────────────────`);
				lines.push(``);
				lines.push(JSON.stringify(params.tools, null, 2));
				lines.push(``);
			}

			lines.push(`════════════════════════════════════════`);
			lines.push(`END OF DUMP`);
			lines.push(`════════════════════════════════════════`);

			writeFileSync(dumpPath, lines.join('\n'), 'utf-8');
			console.log(`[FastChat] Prompt dumped to ${dumpPath}`);
		} catch {
			// silent — don't break the stream for a debug dump
		}
	}
	// --- END PROMPT DUMP ---

	let assistantText = '';
	let usage: FastAgentStreamUsage | undefined;
	let finishedReason: string | undefined;
	const toolExecutions: FastToolExecution[] = [];
	const tools = params.tools ?? [];
	const hasTools = tools.length > 0;
	const allowedToolNames = new Set(
		tools.map((tool) => tool.function?.name).filter((name): name is string => Boolean(name))
	);
	const maxToolRounds = Math.max(1, params.maxToolRounds ?? FASTCHAT_LIMITS.MAX_TOOL_ROUNDS);
	const maxToolCalls = Math.max(1, params.maxToolCalls ?? FASTCHAT_LIMITS.MAX_TOOL_CALLS);
	let toolRounds = 0;
	let toolCallsMade = 0;
	let validationRetryUsed = false;
	let toolLimitNotice: string | null = null;

	const markToolLimitReached = (kind: 'round' | 'call'): void => {
		if (toolLimitNotice) return;
		finishedReason = kind === 'round' ? 'tool_round_limit' : 'tool_call_limit';
		toolLimitNotice =
			kind === 'round'
				? 'I hit a safety limit while coordinating tools. Please break the request into smaller steps and try again.'
				: 'I hit a safety limit on tool calls. Please clarify the exact item and update you want, then I can continue.';
	};

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
			temperature: hasTools ? 0.2 : undefined,
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
								(usage.completion_tokens ?? 0) +
								(event.usage.completion_tokens ?? 0);
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
			markToolLimitReached('round');
			break;
		}

		messages.push({
			role: 'assistant',
			content: assistantBuffer,
			tool_calls: pendingToolCalls
		});

		const validationIssues = validateToolCalls(pendingToolCalls, tools);
		if (validationIssues.length > 0) {
			let exceededToolCallLimit = false;
			for (const issue of validationIssues) {
				toolCallsMade += 1;
				if (toolCallsMade > maxToolCalls) {
					markToolLimitReached('call');
					exceededToolCallLimit = true;
					break;
				}

				const errorMessage = `Tool validation failed: ${issue.errors.join(' ')}`;
				const result: ChatToolResult = {
					tool_call_id: issue.toolCall.id,
					result: null,
					success: false,
					error: errorMessage
				};

				toolExecutions.push({ toolCall: issue.toolCall, result });
				if (params.onToolResult) {
					try {
						await params.onToolResult({ toolCall: issue.toolCall, result });
					} catch {
						// UI/logging callbacks must not crash tool orchestration.
					}
				}

				messages.push({
					role: 'tool',
					content: JSON.stringify({ error: errorMessage }),
					tool_call_id: issue.toolCall.id
				});
			}

			if (exceededToolCallLimit) {
				break;
			}

			if (!validationRetryUsed) {
				validationRetryUsed = true;
				messages.push({
					role: 'system',
					content: buildToolValidationRepairInstruction(validationIssues)
				});
				continue;
			}

			break;
		}

		for (const toolCall of pendingToolCalls) {
			if (signal?.aborted) {
				throw new Error('Request aborted');
			}

			toolCallsMade += 1;
			if (toolCallsMade > maxToolCalls) {
				markToolLimitReached('call');
				break;
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
					const message = error instanceof Error ? error.message : 'Tool execution failed';
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
				try {
					await params.onToolResult(execution);
				} catch {
					// UI/logging callbacks must not crash tool orchestration.
				}
			}

			const toolPayload = result.result ?? (result.error ? { error: result.error } : null);
			messages.push({
				role: 'tool',
				content: JSON.stringify(toolPayload),
				tool_call_id: toolCall.id
			});
		}

		if (toolLimitNotice) {
			break;
		}
	}

	if (toolLimitNotice) {
		const prefix = assistantText.trim().length > 0 ? '\n\n' : '';
		const noticeDelta = `${prefix}${toolLimitNotice}`;
		assistantText += noticeDelta;
		await onDelta(noticeDelta);
	}

	return { assistantText, usage, finishedReason, toolExecutions };
}

const UPDATE_TOOL_PREFIX = 'update_onto_';
const UUID_VALIDATED_TOOL_NAMES = new Set([
	'list_task_documents',
	'create_task_document',
	'get_entity_relationships',
	'get_linked_entities',
	'link_onto_entities',
	'unlink_onto_edge',
	'get_document_tree',
	'get_document_path',
	'move_document_in_tree',
	'reorganize_onto_project_graph'
]);
const UUID_ARG_KEYS = new Set([
	'project_id',
	'task_id',
	'goal_id',
	'plan_id',
	'document_id',
	'milestone_id',
	'risk_id',
	'requirement_id',
	'entity_id',
	'src_id',
	'dst_id',
	'edge_id',
	'parent_id',
	'parent_document_id',
	'new_parent_id',
	'supporting_milestone_id'
]);
const STRICT_UUID_ARG_KEYS = new Set([
	'task_id',
	'goal_id',
	'plan_id',
	'document_id',
	'milestone_id',
	'risk_id',
	'requirement_id',
	'entity_id',
	'src_id',
	'dst_id',
	'edge_id',
	'parent_id',
	'parent_document_id',
	'new_parent_id',
	'supporting_milestone_id'
]);

function parseToolArguments(rawArgs: unknown): { args: Record<string, any>; error?: string } {
	if (rawArgs === undefined || rawArgs === null) {
		return { args: {} };
	}

	if (typeof rawArgs === 'string') {
		const trimmed = rawArgs.trim();
		if (!trimmed) {
			return { args: {} };
		}
		try {
			const parsed = JSON.parse(trimmed);
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
				return { args: {}, error: 'Tool arguments must be a JSON object.' };
			}
			return { args: parsed as Record<string, any> };
		} catch (error) {
			return {
				args: {},
				error: `Invalid JSON in tool arguments: ${
					error instanceof Error ? error.message : String(error)
				}`
			};
		}
	}

	if (typeof rawArgs === 'object') {
		if (Array.isArray(rawArgs)) {
			return { args: {}, error: 'Tool arguments must be a JSON object.' };
		}
		return { args: rawArgs as Record<string, any> };
	}

	return { args: {}, error: 'Tool arguments must be a JSON object.' };
}

function getValueByPath(value: Record<string, any>, path: string): unknown {
	const parts = path.split('.');
	let cursor: any = value;
	for (const part of parts) {
		if (!cursor || typeof cursor !== 'object') {
			return undefined;
		}
		cursor = cursor[part];
	}
	return cursor;
}

function validateUpdateToolArgs(
	toolName: string,
	args: Record<string, any>,
	errors: string[]
): void {
	const entity = toolName.slice(UPDATE_TOOL_PREFIX.length);
	if (!entity) return;

	const idKey = `${entity}_id`;
	const rawId = args[idKey];
	const trimmedId = typeof rawId === 'string' ? rawId.trim() : rawId;
	if (!trimmedId || typeof trimmedId !== 'string') {
		errors.push(`Missing required parameter: ${idKey}`);
	} else if (!isValidUUID(trimmedId)) {
		errors.push(`Invalid ${idKey}: expected UUID`);
	}

	const ignoredKeys = new Set<string>([idKey, 'update_strategy', 'merge_instructions']);
	const hasUpdateField = Object.entries(args).some(([key, value]) => {
		if (ignoredKeys.has(key)) return false;
		if (value === undefined || value === null) return false;
		if (typeof value === 'string') {
			return value.trim().length > 0;
		}
		return true;
	});

	if (!hasUpdateField) {
		errors.push(
			`No update fields provided for ${toolName}. Include at least one field to change.`
		);
	}
}

function shouldValidateUuidArgs(toolName: string): boolean {
	if (!toolName) return false;
	return toolName.includes('_onto_') || UUID_VALIDATED_TOOL_NAMES.has(toolName);
}

function validateUuidArgs(toolName: string, args: Record<string, any>, errors: string[]): void {
	if (!shouldValidateUuidArgs(toolName)) return;

	const addErrorOnce = (message: string) => {
		if (!errors.includes(message)) {
			errors.push(message);
		}
	};

	for (const [key, value] of Object.entries(args)) {
		if (!UUID_ARG_KEYS.has(key)) continue;
		if (value === undefined || value === null) continue;
		if (typeof value !== 'string') continue;

		const trimmed = value.trim();
		if (!trimmed) continue;
		const looksTruncated = trimmed.includes('...') || /^[0-9a-f]{8}$/i.test(trimmed);
		const requiresStrictUuid = STRICT_UUID_ARG_KEYS.has(key);
		if (looksTruncated || (requiresStrictUuid && !isValidUUID(trimmed))) {
			addErrorOnce(`Invalid ${key}: expected UUID`);
		}
	}
}

function validateToolCalls(
	toolCalls: ChatToolCall[],
	toolDefs: ChatToolDefinition[]
): ToolValidationIssue[] {
	const issues: ToolValidationIssue[] = [];
	const toolMap = new Map<string, ChatToolDefinition>();
	for (const tool of toolDefs) {
		const name = tool.function?.name;
		if (name) {
			toolMap.set(name, tool);
		}
	}

	for (const toolCall of toolCalls) {
		const toolName = toolCall.function?.name?.trim() ?? '';
		const errors: string[] = [];

		if (!toolName) {
			errors.push('Tool call did not include a function name.');
		}

		const { args, error } = parseToolArguments(toolCall.function?.arguments);
		if (error) {
			errors.push(error);
		}

		const toolDef = toolMap.get(toolName);
		const paramSchema =
			toolDef && (toolDef as any).function?.parameters
				? (toolDef as any).function.parameters
				: (toolDef as any)?.parameters;
		const requiredParams = Array.isArray(paramSchema?.required) ? paramSchema.required : [];
		for (const required of requiredParams) {
			const value = getValueByPath(args, required);
			if (value === undefined || value === null) {
				errors.push(`Missing required parameter: ${required}`);
				continue;
			}
			if (typeof value === 'string' && value.trim().length === 0) {
				errors.push(`Missing required parameter: ${required}`);
			}
		}

		validateUuidArgs(toolName, args, errors);

		if (toolName.startsWith(UPDATE_TOOL_PREFIX)) {
			validateUpdateToolArgs(toolName, args, errors);
		}

		if (errors.length > 0) {
			issues.push({ toolCall, toolName, errors });
		}
	}

	return issues;
}

function buildToolValidationRepairInstruction(issues: ToolValidationIssue[]): string {
	const lines = [
		'One or more tool calls failed validation.',
		'Do not guess or fabricate IDs. Never use placeholders.',
		'Never truncate, abbreviate, or elide IDs (no "...", prefixes, or short forms).',
		'Return only corrected tool calls with arguments. Do not include prose.',
		'If a required value is missing, ask a clarifying question instead of calling a tool.'
	];

	for (const issue of issues) {
		lines.push(`Tool "${issue.toolName || 'unknown'}": ${issue.errors.join(' ')}`);
	}

	return lines.join(' ');
}
