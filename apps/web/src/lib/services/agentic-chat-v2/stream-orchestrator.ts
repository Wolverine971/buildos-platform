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
import { normalizeGatewayOpName } from '$lib/services/agentic-chat/tools/registry/gateway-op-aliases';
import { dev } from '$app/environment';
import { appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
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

type GatewayRequiredFieldFailure = {
	op: string;
	field: string;
};

type LLMStreamPassMetadata = {
	pass: number;
	finishedReason?: string;
	model?: string;
	provider?: string;
	requestId?: string;
	systemFingerprint?: string;
	cacheStatus?: string;
	reasoningTokens?: number;
	promptTokens?: number;
	completionTokens?: number;
	totalTokens?: number;
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
	let promptDumpPath: string | null = null;

	// --- PROMPT DUMP (dev only) ---
	if (dev) {
		try {
			const dumpDir = join(process.cwd(), '.prompt-dumps');
			mkdirSync(dumpDir, { recursive: true });
			const ts = new Date().toISOString().replace(/[:.]/g, '-');
			const dumpPath = join(dumpDir, `fastchat-${ts}.txt`);
			promptDumpPath = dumpPath;

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
	const llmStreamPasses: LLMStreamPassMetadata[] = [];
	const tools = params.tools ?? [];
	const hasTools = tools.length > 0;
	const allowedToolNames = new Set(
		tools.map((tool) => tool.function?.name).filter((name): name is string => Boolean(name))
	);
	const gatewayModeActive =
		allowedToolNames.has('tool_help') && allowedToolNames.has('tool_exec');
	const maxToolRounds = Math.max(1, params.maxToolRounds ?? FASTCHAT_LIMITS.MAX_TOOL_ROUNDS);
	const maxToolCalls = Math.max(1, params.maxToolCalls ?? FASTCHAT_LIMITS.MAX_TOOL_CALLS);
	let toolRounds = 0;
	let toolCallsMade = 0;
	let validationRetryUsed = false;
	let toolLimitNotice: string | null = null;
	let hasWriteAttempt = false;
	let readOnlyRoundCount = 0;
	let lastReadOpSetKey: string | null = null;
	let repeatedReadOpSetCount = 0;
	let readLoopRepairInjected = false;
	const gatewayRequiredFieldFailureCounts = new Map<string, number>();
	let docOrganizationRecoveryEligible = false;
	let gatewaySchemaRepairInjected = false;
	let lastRoundFingerprint: string | null = null;
	let repeatedRoundCount = 0;
	const repetitionLimit = gatewayModeActive ? 3 : 4;
	let docOrganizationRecoveryAttempted = false;

	const markToolLimitReached = (kind: 'round' | 'call' | 'repetition'): void => {
		if (toolLimitNotice) return;
		finishedReason =
			kind === 'round'
				? 'tool_round_limit'
				: kind === 'call'
					? 'tool_call_limit'
					: 'tool_repetition_limit';
		toolLimitNotice =
			kind === 'round'
				? 'I hit a safety limit while coordinating tools. Please break the request into smaller steps and try again.'
				: kind === 'call'
					? 'I hit a safety limit on tool calls. Please clarify the exact item and update you want, then I can continue.'
					: 'I stopped because the same tool sequence kept repeating without progress. Please clarify the exact action you want next.';
	};

	const executeSyntheticGatewayExec = async (
		op: string,
		args: Record<string, any>
	): Promise<FastToolExecution | null> => {
		if (!params.toolExecutor) return null;

		toolCallsMade += 1;
		if (toolCallsMade > maxToolCalls) {
			markToolLimitReached('call');
			return null;
		}

		const toolCall: ChatToolCall = {
			id: `auto_gateway_${toolCallsMade}`,
			type: 'function',
			function: {
				name: 'tool_exec',
				arguments: JSON.stringify({ op, args })
			}
		};

		if (params.onToolCall) {
			try {
				await params.onToolCall(toolCall);
			} catch {
				// UI/logging callbacks must not crash tool orchestration.
			}
		}

		let result: ChatToolResult;
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

		const execution: FastToolExecution = { toolCall, result };
		toolExecutions.push(execution);
		if (params.onToolResult) {
			try {
				await params.onToolResult(execution);
			} catch {
				// UI/logging callbacks must not crash tool orchestration.
			}
		}

		return execution;
	};

	const attemptDocOrganizationRecovery = async (): Promise<boolean> => {
		if (
			!gatewayModeActive ||
			typeof params.toolExecutor !== 'function' ||
			!docOrganizationRecoveryEligible ||
			docOrganizationRecoveryAttempted
		) {
			return false;
		}
		docOrganizationRecoveryAttempted = true;

		const candidateProjectId =
			typeof params.projectId === 'string' && isValidUUID(params.projectId)
				? params.projectId
				: typeof entityId === 'string' && isValidUUID(entityId)
					? entityId
					: undefined;
		if (!candidateProjectId) {
			return false;
		}

		const treeExecution = await executeSyntheticGatewayExec('onto.document.tree.get', {
			project_id: candidateProjectId,
			include_documents: true,
			include_content: false
		});
		if (!treeExecution?.result?.success) {
			return false;
		}

		const treeResult = extractGatewayExecResultData(treeExecution.result.result);
		if (!treeResult || treeResult.ok !== true) {
			return false;
		}

		const rootCount = getDocumentTreeRootCount(treeResult.result);
		const unlinkedDocIds = extractUnlinkedDocumentIds(treeResult.result);
		if (unlinkedDocIds.length === 0) {
			return false;
		}

		let movedCount = 0;
		let failedMoves = 0;
		for (let index = 0; index < unlinkedDocIds.length; index += 1) {
			const documentId = unlinkedDocIds[index];
			const moveExecution = await executeSyntheticGatewayExec('onto.document.tree.move', {
				project_id: candidateProjectId,
				document_id: documentId,
				new_position: rootCount + index
			});
			if (moveExecution?.result?.success) {
				const moveResult = extractGatewayExecResultData(moveExecution.result.result);
				if (moveResult?.ok === true) {
					movedCount += 1;
					continue;
				}
			}
			failedMoves += 1;
		}

		if (movedCount === 0) {
			return false;
		}

		finishedReason = 'stop';
		const summary =
			failedMoves > 0
				? `I organized ${movedCount} unlinked document${movedCount === 1 ? '' : 's'}, but ${failedMoves} move${failedMoves === 1 ? '' : 's'} failed.`
				: `I organized ${movedCount} unlinked document${movedCount === 1 ? '' : 's'} into the project document tree.`;
		const prefix = assistantText.trim().length > 0 ? '\n\n' : '';
		const delta = `${prefix}${summary}`;
		assistantText += delta;
		await onDelta(delta);
		return true;
	};

	while (true) {
		if (signal?.aborted) {
			throw new Error('Request aborted');
		}

		let assistantBuffer = '';
		const pendingToolCalls: ChatToolCall[] = [];
		const llmPassMeta: LLMStreamPassMetadata = {
			pass: llmStreamPasses.length + 1
		};
		let llmDoneReceived = false;

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
				if (toolRounds === 0) {
					assistantText += event.content;
					await onDelta(event.content);
				}
			} else if (event.type === 'tool_call' && event.tool_call) {
				pendingToolCalls.push(event.tool_call);
				if (params.onToolCall) {
					await params.onToolCall(event.tool_call);
				}
			} else if (event.type === 'done') {
				llmDoneReceived = true;
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

					if (typeof event.usage.prompt_tokens === 'number') {
						llmPassMeta.promptTokens = event.usage.prompt_tokens;
					}
					if (typeof event.usage.completion_tokens === 'number') {
						llmPassMeta.completionTokens = event.usage.completion_tokens;
					}
					if (typeof event.usage.total_tokens === 'number') {
						llmPassMeta.totalTokens = event.usage.total_tokens;
					}
					const usageRecord = event.usage as Record<string, unknown>;
					const completionTokenDetails =
						usageRecord.completion_tokens_details &&
						typeof usageRecord.completion_tokens_details === 'object'
							? (usageRecord.completion_tokens_details as Record<string, unknown>)
							: null;
					const usageReasoningTokens =
						completionTokenDetails &&
						typeof completionTokenDetails.reasoning_tokens === 'number'
							? completionTokenDetails.reasoning_tokens
							: undefined;
					if (typeof usageReasoningTokens === 'number') {
						llmPassMeta.reasoningTokens = usageReasoningTokens;
					}
				}
				finishedReason = event.finished_reason ?? finishedReason;
				llmPassMeta.finishedReason = event.finished_reason ?? llmPassMeta.finishedReason;
				const eventRecord = event as Record<string, unknown>;
				const model = readStringMeta(eventRecord.model);
				const provider = readStringMeta(eventRecord.provider);
				const requestId =
					readStringMeta(eventRecord.request_id) ?? readStringMeta(eventRecord.requestId);
				const systemFingerprint =
					readStringMeta(eventRecord.system_fingerprint) ??
					readStringMeta(eventRecord.systemFingerprint);
				const cacheStatus =
					readStringMeta(eventRecord.cache_status) ??
					readStringMeta(eventRecord.cacheStatus);
				const reasoningTokens =
					readNumberMeta(eventRecord.reasoning_tokens) ??
					readNumberMeta(eventRecord.reasoningTokens);

				if (model) llmPassMeta.model = model;
				if (provider) llmPassMeta.provider = provider;
				if (requestId) llmPassMeta.requestId = requestId;
				if (systemFingerprint) llmPassMeta.systemFingerprint = systemFingerprint;
				if (cacheStatus) llmPassMeta.cacheStatus = cacheStatus;
				if (typeof reasoningTokens === 'number') {
					llmPassMeta.reasoningTokens = reasoningTokens;
				}
			} else if (event.type === 'error') {
				throw new Error(event.error || 'LLM stream error');
			}
		}
		if (llmDoneReceived) {
			llmStreamPasses.push(llmPassMeta);
		}

		if (toolRounds > 0 && assistantBuffer && pendingToolCalls.length === 0) {
			assistantText += assistantBuffer;
			await onDelta(assistantBuffer);
		}

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
					content: buildToolValidationRepairInstruction(
						validationIssues,
						gatewayModeActive
					)
				});
				continue;
			}

			break;
		}

		const roundExecutions: FastToolExecution[] = [];
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
			roundExecutions.push(execution);
			if (params.onToolResult) {
				try {
					await params.onToolResult(execution);
				} catch {
					// UI/logging callbacks must not crash tool orchestration.
				}
			}

			const toolPayload = buildToolPayloadForModel(toolCall, result);
			messages.push({
				role: 'tool',
				content: JSON.stringify(toolPayload),
				tool_call_id: toolCall.id
			});
		}

		const roundPattern = buildRoundToolPattern(pendingToolCalls);
		if (roundPattern.hasWriteOps) {
			hasWriteAttempt = true;
			readOnlyRoundCount = 0;
			lastReadOpSetKey = null;
			repeatedReadOpSetCount = 0;
		} else if (roundPattern.readOps.length > 0) {
			readOnlyRoundCount += 1;
			const readOpSetKey = roundPattern.readOps.join('|');
			if (readOpSetKey && readOpSetKey === lastReadOpSetKey) {
				repeatedReadOpSetCount += 1;
			} else if (readOpSetKey) {
				repeatedReadOpSetCount = 1;
				lastReadOpSetKey = readOpSetKey;
			}
		}

		if (
			gatewayModeActive &&
			!hasWriteAttempt &&
			roundPattern.readOps.length > 0 &&
			readOnlyRoundCount >= 2 &&
			!readLoopRepairInjected
		) {
			messages.push({
				role: 'system',
				content: buildReadLoopRepairInstruction(roundPattern.readOps)
			});
			readLoopRepairInjected = true;
		}

		if (
			gatewayModeActive &&
			!hasWriteAttempt &&
			roundPattern.readOps.length > 0 &&
			repeatedReadOpSetCount >= 3
		) {
			if (await attemptDocOrganizationRecovery()) {
				break;
			}
			markToolLimitReached('repetition');
			break;
		}

		const requiredFieldFailures = extractGatewayRequiredFieldFailures(roundExecutions);
		if (hasDocumentOrganizationFailureSignal(requiredFieldFailures)) {
			docOrganizationRecoveryEligible = true;
		}
		let maxRequiredFieldFailure: (GatewayRequiredFieldFailure & { count: number }) | null =
			null;
		for (const failure of requiredFieldFailures) {
			const key = `${failure.op}|${failure.field}`;
			const nextCount = (gatewayRequiredFieldFailureCounts.get(key) ?? 0) + 1;
			gatewayRequiredFieldFailureCounts.set(key, nextCount);
			if (!maxRequiredFieldFailure || nextCount > maxRequiredFieldFailure.count) {
				maxRequiredFieldFailure = { ...failure, count: nextCount };
			}
		}

		if (
			gatewayModeActive &&
			maxRequiredFieldFailure &&
			maxRequiredFieldFailure.count >= 2 &&
			!gatewaySchemaRepairInjected
		) {
			messages.push({
				role: 'system',
				content: buildGatewayRequiredFieldRepairInstruction(requiredFieldFailures)
			});
			gatewaySchemaRepairInjected = true;
		}

		if (
			gatewayModeActive &&
			maxRequiredFieldFailure &&
			maxRequiredFieldFailure.count >= 2 &&
			(await attemptDocOrganizationRecovery())
		) {
			break;
		}

		if (gatewayModeActive && maxRequiredFieldFailure && maxRequiredFieldFailure.count >= 3) {
			if (await attemptDocOrganizationRecovery()) {
				break;
			}
			markToolLimitReached('repetition');
			break;
		}

		const roundFingerprint = buildToolRoundFingerprint(roundExecutions);
		if (roundFingerprint && roundFingerprint === lastRoundFingerprint) {
			repeatedRoundCount += 1;
		} else if (roundFingerprint) {
			repeatedRoundCount = 1;
			lastRoundFingerprint = roundFingerprint;
		}

		if (repeatedRoundCount >= repetitionLimit) {
			if (await attemptDocOrganizationRecovery()) {
				break;
			}
			markToolLimitReached('repetition');
			break;
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

	if (dev) {
		appendRuntimeMetadataToPromptDump(promptDumpPath, {
			llmPasses: llmStreamPasses,
			finishedReason,
			toolRounds,
			toolCallsMade
		});
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
		if (value === undefined) return false;
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

function buildToolValidationRepairInstruction(
	issues: ToolValidationIssue[],
	gatewayModeActive = false
): string {
	const hasGatewayExecIssue =
		gatewayModeActive && issues.some((issue) => issue.toolName === 'tool_exec');
	const lines = [
		'One or more tool calls failed validation.',
		'Do not guess or fabricate IDs. Never use placeholders.',
		'Never truncate, abbreviate, or elide IDs (no "...", prefixes, or short forms).',
		'Return only corrected tool calls with arguments. Do not include prose.',
		'If a required value is missing, ask a clarifying question instead of calling a tool.'
	];
	if (hasGatewayExecIssue) {
		lines.push(
			'Gateway pattern: use targeted tool_help("<group/entity>") first; use tool_help("root") only when namespace is unknown.'
		);
		lines.push(
			'Canonical ontology family: onto.<entity>.create|list|get|update|delete|search (entities: project, task, goal, plan, document, milestone, risk).'
		);
		lines.push('In tool_exec.op, use only canonical ops; never legacy names like get_document_tree.');
		lines.push(
			'For any onto.*.search op (including onto.search), always pass args.query and include args.project_id when known.'
		);
		lines.push('Calendar events are under cal.event.* (not onto.event.*).');
		lines.push('If a tool_exec result has _fallback for missing *_id, use list/tree candidates and retry with exact *_id.');
		lines.push(
			'For first-time or complex writes, call tool_help("<exact op>", { format: "full", include_schemas: true }) before retrying tool_exec.'
		);
	}

	for (const issue of issues) {
		lines.push(`Tool "${issue.toolName || 'unknown'}": ${issue.errors.join(' ')}`);
	}

	return lines.join(' ');
}

function buildToolRoundFingerprint(roundExecutions: FastToolExecution[]): string {
	if (!Array.isArray(roundExecutions) || roundExecutions.length === 0) return '';
	const entries = roundExecutions.map(({ toolCall, result }) => {
		const parsed = parseToolArguments(toolCall.function?.arguments);
		return {
			tool: toolCall.function?.name ?? '',
			args: parsed.args,
			success: result.success === true,
			error: typeof result.error === 'string' ? result.error.trim() : null
		};
	});
	return stableStringify(entries);
}

const MAX_MODEL_TOOL_PAYLOAD_CHARS = 6000;
const MAX_TOOL_LIST_ITEMS = 20;

function buildToolPayloadForModel(toolCall: ChatToolCall, result: ChatToolResult): unknown {
	const basePayload = result.result ?? (result.error ? { error: result.error } : null);
	if (basePayload === null || basePayload === undefined) {
		return null;
	}

	const toolName = toolCall.function?.name?.trim();
	if (toolName === 'tool_exec') {
		const parsed = parseToolArguments(toolCall.function?.arguments);
		const op = typeof parsed.args.op === 'string' ? parsed.args.op.trim() : '';
		return compactGatewayExecPayload(op, basePayload);
	}

	if (toolName === 'tool_batch') {
		return compactGatewayBatchPayload(basePayload);
	}

	return applyToolPayloadSizeGuard(basePayload);
}

function compactGatewayExecPayload(op: string, payload: unknown): unknown {
	const normalizedOp = normalizeGatewayOpName(op).toLowerCase();
	if (normalizedOp === 'onto.document.tree.get') {
		return compactDocumentTreeGatewayPayload(payload);
	}
	if (normalizedOp === 'onto.document.list' || normalizedOp === 'onto.document.search') {
		return compactDocumentCollectionGatewayPayload(payload);
	}
	return applyToolPayloadSizeGuard(payload);
}

function compactGatewayBatchPayload(payload: unknown): unknown {
	if (!payload || typeof payload !== 'object') {
		return payload;
	}
	const record = payload as Record<string, any>;
	const results = Array.isArray(record.results) ? record.results : [];
	const compactResults = results.slice(0, MAX_TOOL_LIST_ITEMS).map((entry) => {
		if (!entry || typeof entry !== 'object') {
			return entry;
		}
		const op =
			typeof (entry as Record<string, any>).op === 'string'
				? (entry as Record<string, any>).op
				: undefined;
		const compact: Record<string, unknown> = {
			type:
				typeof (entry as Record<string, any>).type === 'string'
					? (entry as Record<string, any>).type
					: undefined,
			path:
				typeof (entry as Record<string, any>).path === 'string'
					? (entry as Record<string, any>).path
					: undefined,
			op,
			ok: (entry as Record<string, any>).ok
		};
		if (typeof (entry as Record<string, any>).error === 'string') {
			compact.error = (entry as Record<string, any>).error;
		}
		if ((entry as Record<string, any>).result !== undefined) {
			compact.result = op
				? compactGatewayExecPayload(op, (entry as Record<string, any>).result)
				: applyToolPayloadSizeGuard((entry as Record<string, any>).result);
		}
		return compact;
	});

	const output: Record<string, unknown> = {
		ok: record.ok,
		summary: record.summary,
		results: compactResults
	};
	if (results.length > compactResults.length) {
		output.results_truncated = results.length - compactResults.length;
	}
	return applyToolPayloadSizeGuard(output);
}

function compactDocumentTreeGatewayPayload(payload: unknown): unknown {
	if (!payload || typeof payload !== 'object') {
		return payload;
	}
	const record = payload as Record<string, any>;
	const treeResult = record.result && typeof record.result === 'object' ? record.result : null;
	if (!treeResult) {
		return applyToolPayloadSizeGuard(payload);
	}

	const structure =
		treeResult.structure && typeof treeResult.structure === 'object'
			? treeResult.structure
			: {};
	const root = Array.isArray((structure as Record<string, any>).root)
		? ((structure as Record<string, any>).root as Array<Record<string, any>>)
		: [];
	const documents =
		treeResult.documents && typeof treeResult.documents === 'object'
			? (treeResult.documents as Record<string, any>)
			: {};
	const unlinkedRaw = Array.isArray(treeResult.unlinked) ? treeResult.unlinked : [];

	const rootSummary = root.slice(0, MAX_TOOL_LIST_ITEMS).map((node) => ({
		id: typeof node?.id === 'string' ? node.id : null,
		title: typeof node?.title === 'string' ? node.title : null,
		children_count: Array.isArray(node?.children) ? node.children.length : 0
	}));

	const unlinkedSummary = unlinkedRaw.slice(0, MAX_TOOL_LIST_ITEMS).map((item: any) => {
		if (typeof item === 'string') {
			const doc = documents[item];
			return {
				id: item,
				title: typeof doc?.title === 'string' ? doc.title : null
			};
		}
		if (item && typeof item === 'object') {
			return {
				id: typeof item.id === 'string' ? item.id : null,
				title: typeof item.title === 'string' ? item.title : null
			};
		}
		return { id: null, title: null };
	});

	const compactPayload: Record<string, unknown> = {
		op: record.op,
		ok: record.ok,
		result: {
			message: typeof treeResult.message === 'string' ? treeResult.message : null,
			counts: {
				root_count: root.length,
				document_count: Object.keys(documents).length,
				unlinked_count: unlinkedRaw.length
			},
			root: rootSummary,
			unlinked: unlinkedSummary
		},
		meta: record.meta
	};
	if (root.length > rootSummary.length) {
		(compactPayload.result as Record<string, unknown>).root_truncated =
			root.length - rootSummary.length;
	}
	if (unlinkedRaw.length > unlinkedSummary.length) {
		(compactPayload.result as Record<string, unknown>).unlinked_truncated =
			unlinkedRaw.length - unlinkedSummary.length;
	}

	return applyToolPayloadSizeGuard(compactPayload);
}

function compactDocumentCollectionGatewayPayload(payload: unknown): unknown {
	if (!payload || typeof payload !== 'object') {
		return payload;
	}
	const record = payload as Record<string, any>;
	const listResult = record.result && typeof record.result === 'object' ? record.result : null;
	if (!listResult) {
		return applyToolPayloadSizeGuard(payload);
	}

	const documentsRaw = Array.isArray(listResult.documents) ? listResult.documents : [];
	const summary = documentsRaw.slice(0, MAX_TOOL_LIST_ITEMS).map((doc: any) => ({
		id: typeof doc?.id === 'string' ? doc.id : null,
		title: typeof doc?.title === 'string' ? doc.title : null,
		type_key: typeof doc?.type_key === 'string' ? doc.type_key : null,
		state_key: typeof doc?.state_key === 'string' ? doc.state_key : null,
		updated_at: typeof doc?.updated_at === 'string' ? doc.updated_at : null,
		content_length:
			typeof doc?.content_length === 'number'
				? doc.content_length
				: typeof doc?.content === 'string'
					? doc.content.length
					: 0,
		description_preview: toTextPreview(doc?.description, 180),
		markdown_outline: compactMarkdownOutline(doc?.markdown_outline)
	}));
	const total =
		typeof listResult.total === 'number' ? listResult.total : Math.max(documentsRaw.length, 0);

	const compactPayload: Record<string, unknown> = {
		op: record.op,
		ok: record.ok,
		result: {
			message: typeof listResult.message === 'string' ? listResult.message : null,
			total,
			documents: summary
		},
		meta: record.meta
	};
	if (documentsRaw.length > summary.length) {
		(compactPayload.result as Record<string, unknown>).documents_truncated =
			documentsRaw.length - summary.length;
	}

	return applyToolPayloadSizeGuard(compactPayload);
}

function toTextPreview(value: unknown, maxLength: number): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (trimmed.length <= maxLength) return trimmed;
	return `${trimmed.slice(0, Math.max(0, maxLength - 3))}...`;
}

function compactMarkdownOutline(outline: unknown): unknown {
	if (!outline || typeof outline !== 'object') return null;
	const record = outline as Record<string, any>;
	const counts =
		record.counts && typeof record.counts === 'object'
			? {
					total:
						typeof (record.counts as Record<string, any>).total === 'number'
							? (record.counts as Record<string, any>).total
							: 0,
					h1:
						typeof (record.counts as Record<string, any>).h1 === 'number'
							? (record.counts as Record<string, any>).h1
							: 0,
					h2:
						typeof (record.counts as Record<string, any>).h2 === 'number'
							? (record.counts as Record<string, any>).h2
							: 0,
					h3:
						typeof (record.counts as Record<string, any>).h3 === 'number'
							? (record.counts as Record<string, any>).h3
							: 0
				}
			: { total: 0, h1: 0, h2: 0, h3: 0 };
	const headings = Array.isArray(record.headings) ? record.headings : [];
	return {
		counts,
		headings: headings.slice(0, 24),
		truncated: Boolean(record.truncated) || headings.length > 24
	};
}

function applyToolPayloadSizeGuard(payload: unknown): unknown {
	try {
		const serialized = JSON.stringify(payload);
		if (serialized.length <= MAX_MODEL_TOOL_PAYLOAD_CHARS) {
			return payload;
		}
		return {
			truncated: true,
			original_length: serialized.length,
			preview: `${serialized.slice(0, MAX_MODEL_TOOL_PAYLOAD_CHARS)}...`
		};
	} catch {
		return payload;
	}
}

function extractGatewayRequiredFieldFailures(
	roundExecutions: FastToolExecution[]
): GatewayRequiredFieldFailure[] {
	const failures = new Map<string, GatewayRequiredFieldFailure>();
	const requiredFieldPattern = /Missing required parameter:\s*([a-zA-Z0-9_.-]+)/i;

	const addFailure = (op: unknown, errorMessage: unknown): void => {
		const opName =
			typeof op === 'string' && op.trim().length > 0 ? normalizeGatewayOpName(op) : '';
		const errorText = typeof errorMessage === 'string' ? errorMessage : '';
		if (!opName || !errorText) return;
		const match = errorText.match(requiredFieldPattern);
		if (!match || !match[1]) return;
		const field = match[1];
		const key = `${opName}|${field}`;
		if (!failures.has(key)) {
			failures.set(key, { op: opName, field });
		}
	};

	for (const { toolCall, result } of roundExecutions) {
		const toolName = toolCall.function?.name?.trim();
		if (!toolName) continue;

		if (toolName === 'tool_exec') {
			const parsed = parseToolArguments(toolCall.function?.arguments);
			addFailure(parsed.args.op, result.error);
			continue;
		}

		if (toolName === 'tool_batch') {
			const payload = result.result;
			const entries =
				payload &&
				typeof payload === 'object' &&
				Array.isArray((payload as Record<string, any>).results)
					? ((payload as Record<string, any>).results as Array<Record<string, any>>)
					: [];
			for (const entry of entries) {
				if (!entry || typeof entry !== 'object') continue;
				if (entry.type !== 'exec') continue;
				addFailure(entry.op, entry.error);
			}
		}
	}

	return Array.from(failures.values());
}

function buildGatewayRequiredFieldRepairInstruction(
	failures: GatewayRequiredFieldFailure[]
): string {
	const labels = failures.map((failure) => `${failure.op} -> ${failure.field}`).join(', ');
	return [
		`Repeated required-field validation failures detected: ${labels}.`,
		'Do not call write ops with args:{}.',
		'For document organization, get IDs from onto.document.tree.get result.unlinked/documents and pass exact args.document_id for delete/move.',
		'If IDs are still unclear, ask one concise clarifying question instead of repeating failed writes.'
	].join(' ');
}

type RoundToolPattern = {
	readOps: string[];
	hasWriteOps: boolean;
};

function buildRoundToolPattern(toolCalls: ChatToolCall[]): RoundToolPattern {
	const readOps = new Set<string>();
	let hasWriteOps = false;

	for (const toolCall of toolCalls) {
		const toolName = toolCall.function?.name?.trim();
		if (!toolName) continue;

		if (toolName === 'tool_exec') {
			const parsed = parseToolArguments(toolCall.function?.arguments);
			const op = typeof parsed.args.op === 'string' ? parsed.args.op.trim() : '';
			if (!op) continue;
			const normalizedOp = normalizeGatewayOpName(op);
			if (isWriteLikeOperation(normalizedOp)) {
				hasWriteOps = true;
			} else {
				readOps.add(normalizedOp.toLowerCase());
			}
			continue;
		}

		if (toolName === 'tool_batch') {
			const parsed = parseToolArguments(toolCall.function?.arguments);
			const ops = Array.isArray(parsed.args.ops) ? parsed.args.ops : [];
			for (const entry of ops) {
				if (!entry || typeof entry !== 'object') continue;
				if ((entry as Record<string, any>).type !== 'exec') continue;
				const op =
					typeof (entry as Record<string, any>).op === 'string'
						? (entry as Record<string, any>).op.trim()
						: '';
				if (!op) continue;
				const normalizedOp = normalizeGatewayOpName(op);
				if (isWriteLikeOperation(normalizedOp)) {
					hasWriteOps = true;
				} else {
					readOps.add(normalizedOp.toLowerCase());
				}
			}
			continue;
		}

		if (isWriteLikeOperation(toolName)) {
			hasWriteOps = true;
			continue;
		}

		if (isReadLikeOperation(toolName)) {
			readOps.add(toolName.toLowerCase());
		}
	}

	return {
		readOps: Array.from(readOps).sort(),
		hasWriteOps
	};
}

function hasDocumentOrganizationFailureSignal(failures: GatewayRequiredFieldFailure[]): boolean {
	return failures.some((failure) => {
		const op = normalizeGatewayOpName(failure.op).toLowerCase();
		const field = failure.field.trim().toLowerCase();
		return op.startsWith('onto.document.') && field === 'document_id';
	});
}

type GatewayExecResultData = {
	op?: string;
	ok?: boolean;
	result?: unknown;
	meta?: unknown;
};

function extractGatewayExecResultData(payload: unknown): GatewayExecResultData | null {
	if (!payload || typeof payload !== 'object') return null;
	const record = payload as Record<string, unknown>;
	const hasGatewayShape =
		'op' in record || 'ok' in record || 'result' in record || 'meta' in record;
	if (!hasGatewayShape) return null;
	return {
		op: typeof record.op === 'string' ? record.op : undefined,
		ok: typeof record.ok === 'boolean' ? record.ok : undefined,
		result: record.result,
		meta: record.meta
	};
}

function getDocumentTreeRootCount(treeResult: unknown): number {
	if (!treeResult || typeof treeResult !== 'object') return 0;
	const structure =
		(treeResult as Record<string, unknown>).structure &&
		typeof (treeResult as Record<string, unknown>).structure === 'object'
			? ((treeResult as Record<string, unknown>).structure as Record<string, unknown>)
			: null;
	const root = structure && Array.isArray(structure.root) ? structure.root : [];
	return root.length;
}

function extractUnlinkedDocumentIds(treeResult: unknown): string[] {
	if (!treeResult || typeof treeResult !== 'object') return [];
	const record = treeResult as Record<string, unknown>;
	const unlinkedRaw = Array.isArray(record.unlinked) ? record.unlinked : [];
	const unlinkedFromField = unlinkedRaw
		.map((entry) => {
			if (typeof entry === 'string') return entry.trim();
			if (entry && typeof entry === 'object') {
				const id = (entry as Record<string, unknown>).id;
				return typeof id === 'string' ? id.trim() : '';
			}
			return '';
		})
		.filter((value) => value.length > 0);
	if (unlinkedFromField.length > 0) {
		return Array.from(new Set(unlinkedFromField));
	}

	const documents =
		record.documents && typeof record.documents === 'object'
			? (record.documents as Record<string, unknown>)
			: null;
	if (!documents) {
		return [];
	}

	const linkedIds = new Set<string>();
	const structure =
		record.structure && typeof record.structure === 'object'
			? (record.structure as Record<string, unknown>)
			: null;
	const root = structure && Array.isArray(structure.root) ? structure.root : [];
	collectDocumentTreeNodeIds(root, linkedIds);

	return Object.keys(documents)
		.map((id) => id.trim())
		.filter((id) => id.length > 0 && !linkedIds.has(id));
}

function collectDocumentTreeNodeIds(nodes: unknown, output: Set<string>): void {
	if (!Array.isArray(nodes)) return;
	for (const node of nodes) {
		if (!node || typeof node !== 'object') continue;
		const record = node as Record<string, unknown>;
		const id = record.id;
		if (typeof id === 'string' && id.trim().length > 0) {
			output.add(id.trim());
		}
		const children = record.children;
		if (Array.isArray(children)) {
			collectDocumentTreeNodeIds(children, output);
		}
	}
}

function isReadLikeOperation(name: string): boolean {
	const normalized = name.trim().toLowerCase();
	if (!normalized) return false;
	return (
		normalized === 'tool_help' ||
		normalized.startsWith('get_') ||
		normalized.startsWith('list_') ||
		normalized.startsWith('search_') ||
		normalized.startsWith('find_') ||
		normalized.endsWith('.get') ||
		normalized.endsWith('.list') ||
		normalized.endsWith('.search')
	);
}

function isWriteLikeOperation(name: string): boolean {
	const normalized = name.trim().toLowerCase();
	if (!normalized) return false;
	return (
		normalized.startsWith('create_') ||
		normalized.startsWith('update_') ||
		normalized.startsWith('delete_') ||
		normalized.startsWith('move_') ||
		normalized.startsWith('link_') ||
		normalized.startsWith('unlink_') ||
		normalized.startsWith('reorganize_') ||
		normalized.startsWith('set_') ||
		normalized.startsWith('assign_') ||
		normalized.startsWith('complete_') ||
		normalized.startsWith('archive_') ||
		normalized.startsWith('restore_') ||
		normalized.endsWith('.create') ||
		normalized.endsWith('.update') ||
		normalized.endsWith('.delete') ||
		normalized.endsWith('.move') ||
		normalized.endsWith('.link') ||
		normalized.endsWith('.unlink') ||
		normalized.endsWith('.reorganize') ||
		normalized.endsWith('.set') ||
		normalized.endsWith('.assign') ||
		normalized.endsWith('.complete') ||
		normalized.endsWith('.archive') ||
		normalized.endsWith('.restore')
	);
}

function buildReadLoopRepairInstruction(readOps: string[]): string {
	const opsLabel = readOps.length > 0 ? readOps.join(', ') : 'read-only ops';
	return [
		'You are repeating read-only tool calls without making progress.',
		`Repeated ops: ${opsLabel}.`,
		'Stop reloading the same data. Use the existing results to answer, or perform the next required action.',
		'If required IDs are still missing, ask one concise clarification question instead of repeating the same reads.'
	].join(' ');
}

function stableStringify(value: unknown): string {
	const seen = new WeakSet<object>();

	const normalize = (input: unknown): unknown => {
		if (input === null || input === undefined) return input;
		if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
			return input;
		}
		if (Array.isArray(input)) {
			return input.map((item) => normalize(item));
		}
		if (typeof input === 'object') {
			if (seen.has(input as object)) return '[Circular]';
			seen.add(input as object);
			const output: Record<string, unknown> = {};
			for (const key of Object.keys(input as Record<string, unknown>).sort()) {
				output[key] = normalize((input as Record<string, unknown>)[key]);
			}
			return output;
		}
		return String(input);
	};

	return JSON.stringify(normalize(value));
}

function readStringMeta(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function readNumberMeta(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function appendRuntimeMetadataToPromptDump(
	promptDumpPath: string | null,
	params: {
		llmPasses: LLMStreamPassMetadata[];
		finishedReason?: string;
		toolRounds: number;
		toolCallsMade: number;
	}
): void {
	if (!promptDumpPath) return;

	try {
		const lines: string[] = [
			'',
			'────────────────────────────────────────',
			'LLM ROUTING (ACTUAL)',
			'────────────────────────────────────────'
		];

		if (params.llmPasses.length === 0) {
			lines.push('No stream completion metadata captured.');
		} else {
			for (const pass of params.llmPasses) {
				lines.push(
					`Pass ${pass.pass}: model=${pass.model ?? 'unknown'}, provider=${pass.provider ?? 'unknown'}, request_id=${pass.requestId ?? 'unknown'}`
				);
				lines.push(
					`  finish_reason=${pass.finishedReason ?? 'unknown'}, cache_status=${pass.cacheStatus ?? 'unknown'}, reasoning_tokens=${pass.reasoningTokens ?? 'unknown'}`
				);
				lines.push(
					`  usage: prompt=${pass.promptTokens ?? 'unknown'}, completion=${pass.completionTokens ?? 'unknown'}, total=${pass.totalTokens ?? 'unknown'}`
				);
				lines.push(`  system_fingerprint=${pass.systemFingerprint ?? 'unknown'}`);
			}
		}

		lines.push('');
		lines.push(
			`Run summary: finished_reason=${params.finishedReason ?? 'unknown'}, tool_rounds=${params.toolRounds}, tool_calls=${params.toolCallsMade}`
		);
		lines.push('');
		appendFileSync(promptDumpPath, `${lines.join('\n')}\n`, 'utf-8');
	} catch {
		// Ignore dump append failures.
	}
}
