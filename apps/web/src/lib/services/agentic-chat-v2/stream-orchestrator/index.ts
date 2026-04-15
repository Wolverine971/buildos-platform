// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts
import type {
	ChatContextType,
	ChatToolCall,
	ChatToolDefinition,
	ChatToolResult
} from '@buildos/shared-types';
import type { SmartLLMService } from '$lib/services/smart-llm-service';
import type { FastChatHistoryMessage, FastAgentStreamUsage } from '../types';
import { normalizeFastContextType } from '../prompt-builder';
import { buildMasterPrompt } from '../master-prompt-builder';
import { FASTCHAT_LIMITS } from '../limits';
import {
	extractGatewayMaterializedToolNames,
	materializeGatewayTools
} from '$lib/services/agentic-chat/tools/core/gateway-surface';
import { normalizeGatewayOpName } from '$lib/services/agentic-chat/tools/registry/gateway-op-aliases';
import { getToolRegistry } from '$lib/services/agentic-chat/tools/registry/tool-registry';
import { dev } from '$app/environment';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { sanitizeAssistantFinalText, sanitizeToolPassLeadIn } from './assistant-text-sanitization';
import { appendRuntimeMetadataToPromptDump, writeInitialPromptDump } from './prompt-dump-debug';
import type {
	FastChatDebugContext,
	FastToolExecution,
	GatewayRequiredFieldFailure,
	LLMStreamPassMetadata
} from './shared';
import { buildToolPayloadForModel } from './tool-payload-compaction';
import {
	parseToolArguments,
	normalizeToolCallDefaults,
	inspectToolArgumentAnomaly,
	logToolArgumentAnomaly,
	sanitizeToolCallsForReplay
} from './tool-arguments';
import {
	buildConsolidatedRepairInstruction,
	buildGatewayCreateFieldNoProgressRepairInstruction,
	buildGatewayMutationNoExecutionRepairInstruction,
	buildGatewayRequiredFieldRepairInstruction,
	buildProjectCreateNoExecutionRepairInstruction,
	buildReadLoopRepairInstruction,
	buildToolValidationRepairInstruction,
	enforceMutationOutcomeIntegrity,
	hasGatewayCreateFieldNoProgressFailure,
	shouldRepairGatewayMutationNoExecution,
	shouldRepairProjectCreateNoExecution
} from './repair-instructions';
import {
	buildRoundToolPattern,
	buildToolRoundFingerprint,
	extractGatewayExecResultData,
	extractGatewayRequiredFieldFailures,
	extractGatewayRequiredFieldFailuresFromValidationIssues,
	extractUnlinkedDocumentIds,
	getDocumentTreeRootCount,
	hasDocumentOrganizationFailureSignal,
	hasDocumentOrganizationValidationIssue
} from './round-analysis';
import { validateToolCalls } from './tool-validation';

type StreamFastChatParams = {
	llm: SmartLLMService;
	userId: string;
	sessionId: string;
	contextType: ChatContextType;
	entityId?: string | null;
	projectId?: string | null;
	turnRunId?: string | null;
	streamRunId?: string | null;
	clientTurnId?: string | null;
	history: FastChatHistoryMessage[];
	message: string;
	signal?: AbortSignal;
	onDelta: (delta: string) => Promise<void> | void;
	systemPrompt?: string;
	tools?: ChatToolDefinition[];
	toolExecutor?: (
		toolCall: ChatToolCall,
		availableTools?: ChatToolDefinition[]
	) => Promise<ChatToolResult>;
	onToolCall?: (toolCall: ChatToolCall) => Promise<void> | void;
	onToolResult?: (execution: FastToolExecution) => Promise<void> | void;
	maxToolRounds?: number;
	maxToolCalls?: number;
	allowAutonomousRecovery?: boolean;
	debugContext?: FastChatDebugContext;
};

export async function streamFastChat(params: StreamFastChatParams): Promise<{
	assistantText: string;
	finalAssistantText: string;
	usage?: FastAgentStreamUsage;
	finishedReason?: string;
	toolExecutions?: FastToolExecution[];
	llmPasses?: LLMStreamPassMetadata[];
	toolRounds?: number;
	toolCallsMade?: number;
	cancelled?: boolean;
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
	let finalAssistantText = '';

	promptDumpPath = writeInitialPromptDump({
		dev,
		sessionId,
		normalizedContext,
		entityId,
		projectId: params.projectId,
		history,
		message,
		systemPrompt,
		tools: params.tools,
		debugContext: params.debugContext
	});

	let assistantText = '';
	let usage: FastAgentStreamUsage | undefined;
	let finishedReason: string | undefined;
	const toolExecutions: FastToolExecution[] = [];
	const llmStreamPasses: LLMStreamPassMetadata[] = [];
	let tools = params.tools ?? [];
	let hasTools = tools.length > 0;
	let allowedToolNames = new Set(
		tools.map((tool) => tool.function?.name).filter((name): name is string => Boolean(name))
	);
	const gatewayModeActive =
		allowedToolNames.has('tool_search') ||
		allowedToolNames.has('tool_schema') ||
		allowedToolNames.has('skill_load');
	const maxToolRounds = Math.max(1, params.maxToolRounds ?? FASTCHAT_LIMITS.MAX_TOOL_ROUNDS);
	const maxToolCalls = Math.max(1, params.maxToolCalls ?? FASTCHAT_LIMITS.MAX_TOOL_CALLS);
	const maxValidationRepairRounds = gatewayModeActive ? 3 : 2;
	const allowAutonomousRecovery = Boolean(params.allowAutonomousRecovery);
	let toolRounds = 0;
	let toolCallsMade = 0;
	let consecutiveValidationIssueRounds = 0;
	let toolLimitNotice: string | null = null;
	let hasWriteAttempt = false;
	let projectCreateStopRepairInjected = false;
	let gatewayMutationStopRepairInjected = false;
	let readOnlyRoundCount = 0;
	let lastReadOpSetKey: string | null = null;
	let repeatedReadOpSetCount = 0;
	let readLoopRepairInjected = false;
	const gatewayRequiredFieldFailureCounts = new Map<string, number>();
	let docOrganizationRecoveryEligible = false;
	let gatewaySchemaRepairInjected = false;
	let gatewayCreateFieldNoProgressRepairInjected = false;
	let lastRoundFingerprint: string | null = null;
	let repeatedRoundCount = 0;
	const repetitionLimit = gatewayModeActive ? 3 : 4;
	let docOrganizationRecoveryAttempted = false;
	let toolLeadInEmitted = false;
	let activeAssistantBuffer = '';
	let activePendingToolCallCount = 0;
	const pendingRepairInstructions: string[] = [];
	const isAbortLikeError = (error: unknown): boolean => {
		if (!error || typeof error !== 'object') return false;
		const maybeError = error as { name?: string; message?: string };
		const name = maybeError.name?.toLowerCase() ?? '';
		const message = maybeError.message?.toLowerCase() ?? '';
		return (
			name === 'aborterror' ||
			message.includes('aborted') ||
			message.includes('request aborted') ||
			message.includes('stream closed')
		);
	};

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
	const markValidationLimitReached = (): void => {
		if (toolLimitNotice) return;
		finishedReason = 'tool_repetition_limit';
		toolLimitNotice =
			'I stopped because tool calls kept failing validation. Please restate the exact operation and required IDs, then try again.';
	};
	const queueRepairInstruction = (instruction: string | null | undefined): void => {
		const normalized = typeof instruction === 'string' ? instruction.trim() : '';
		if (!normalized) return;
		if (!pendingRepairInstructions.includes(normalized)) {
			pendingRepairInstructions.push(normalized);
		}
	};
	const flushRepairInstructions = (): void => {
		if (pendingRepairInstructions.length === 0) return;
		const combined = buildConsolidatedRepairInstruction(pendingRepairInstructions);
		pendingRepairInstructions.length = 0;
		if (!combined) return;
		messages.push({
			role: 'system',
			content: combined
		});
	};
	const materializeDirectTools = (toolNames: string[], reason: string): string[] => {
		const materialized = materializeGatewayTools(tools, toolNames);
		if (materialized.addedToolNames.length === 0) {
			return [];
		}
		tools = materialized.tools;
		hasTools = tools.length > 0;
		allowedToolNames = new Set(
			tools.map((tool) => tool.function?.name).filter((name): name is string => Boolean(name))
		);
		messages.push({
			role: 'system',
			content: `${reason} Direct tools now available for the rest of this turn: ${materialized.addedToolNames.join(', ')}. Call them directly by name.`
		});
		return materialized.addedToolNames;
	};
	const recordGatewayRequiredFieldFailures = (
		failures: GatewayRequiredFieldFailure[]
	): (GatewayRequiredFieldFailure & { count: number }) | null => {
		let maxRequiredFieldFailure: (GatewayRequiredFieldFailure & { count: number }) | null =
			null;
		for (const failure of failures) {
			const key = `${failure.op}|${failure.field}`;
			const nextCount =
				(gatewayRequiredFieldFailureCounts.get(key) ?? 0) +
				Math.max(1, failure.occurrences || 1);
			gatewayRequiredFieldFailureCounts.set(key, nextCount);
			if (!maxRequiredFieldFailure || nextCount > maxRequiredFieldFailure.count) {
				maxRequiredFieldFailure = { ...failure, count: nextCount };
			}
		}
		return maxRequiredFieldFailure;
	};

	const executeSyntheticDirectTool = async (
		op: string,
		args: Record<string, any>
	): Promise<FastToolExecution | null> => {
		if (!allowAutonomousRecovery || !params.toolExecutor) return null;

		toolCallsMade += 1;
		if (toolCallsMade > maxToolCalls) {
			markToolLimitReached('call');
			return null;
		}

		const registryEntry = getToolRegistry().ops[normalizeGatewayOpName(op)];
		const directToolName = registryEntry?.tool_name;
		if (!directToolName) {
			return null;
		}
		materializeDirectTools([directToolName], 'Autonomous recovery loaded required tool.');
		const toolCall: ChatToolCall = {
			id: `auto_tool_${toolCallsMade}`,
			type: 'function',
			function: {
				name: directToolName,
				arguments: JSON.stringify(args)
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
			result = await params.toolExecutor(toolCall, tools);
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
			!allowAutonomousRecovery ||
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

		const treeExecution = await executeSyntheticDirectTool('onto.document.tree.get', {
			project_id: candidateProjectId,
			include_documents: true,
			include_content: false
		});
		if (!treeExecution?.result?.success) {
			return false;
		}

		const treeResult = extractGatewayExecResultData(treeExecution.result.result);
		if (treeResult && treeResult.ok === false) {
			return false;
		}

		const documentTree = treeResult ? treeResult.result : treeExecution.result.result;
		const rootCount = getDocumentTreeRootCount(documentTree);
		const unlinkedDocIds = extractUnlinkedDocumentIds(documentTree);
		if (unlinkedDocIds.length === 0) {
			return false;
		}

		let movedCount = 0;
		let failedMoves = 0;
		for (let index = 0; index < unlinkedDocIds.length; index += 1) {
			const documentId = unlinkedDocIds[index];
			const moveExecution = await executeSyntheticDirectTool('onto.document.tree.move', {
				project_id: candidateProjectId,
				document_id: documentId,
				new_position: rootCount + index
			});
			if (moveExecution?.result?.success) {
				const moveResult = extractGatewayExecResultData(moveExecution.result.result);
				if (!moveResult || moveResult.ok === true) {
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
		finalAssistantText = summary;
		await onDelta(delta);
		return true;
	};

	const emitAssistantDelta = async (content: string): Promise<void> => {
		const normalized = content.trim();
		if (!normalized) return;
		const prefix = assistantText.trim().length > 0 ? '\n\n' : '';
		const delta = `${prefix}${normalized}`;
		assistantText += delta;
		await onDelta(delta);
	};

	const emitAssistantRemainder = async (content: string): Promise<void> => {
		const normalized = content.trim();
		if (!normalized) return;

		const alreadyEmitted = assistantText.trim();
		if (!alreadyEmitted) {
			await emitAssistantDelta(normalized);
			return;
		}

		if (normalized === alreadyEmitted) {
			return;
		}

		if (normalized.startsWith(alreadyEmitted)) {
			const remainder = normalized.slice(alreadyEmitted.length);
			if (!remainder.trim()) return;
			assistantText += remainder;
			await onDelta(remainder);
			return;
		}

		await emitAssistantDelta(normalized);
	};

	const tryEmitEarlyAssistantLeadIn = async (content: string): Promise<void> => {
		if (toolLeadInEmitted) return;

		const candidate = sanitizeToolPassLeadIn(content, message).trim();
		if (!candidate || !/[.!?]$/.test(candidate)) return;

		const normalizedBuffer = content.replace(/\s+/g, ' ').trim();
		const normalizedCandidate = candidate.replace(/\s+/g, ' ').trim();
		if (!normalizedBuffer.includes(normalizedCandidate)) return;

		await emitAssistantDelta(candidate);
		toolLeadInEmitted = true;
	};

	try {
		while (true) {
			if (signal?.aborted) {
				throw new Error('Request aborted');
			}

			let assistantBuffer = '';
			const pendingToolCalls: ChatToolCall[] = [];
			activeAssistantBuffer = '';
			activePendingToolCallCount = 0;
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
				turnRunId: params.turnRunId ?? undefined,
				streamRunId: params.streamRunId ?? undefined,
				clientTurnId: params.clientTurnId ?? undefined,
				profile: 'balanced',
				operationType: 'agentic_chat_v2_stream',
				contextType: normalizedContext,
				entityId: entityId ?? undefined,
				projectId: params.projectId ?? undefined,
				signal
			})) {
				if (event.type === 'text' && event.content) {
					assistantBuffer += event.content;
					activeAssistantBuffer = assistantBuffer;
					await tryEmitEarlyAssistantLeadIn(assistantBuffer);
				} else if (event.type === 'tool_call' && event.tool_call) {
					const normalizedToolCall = normalizeToolCallDefaults(
						event.tool_call,
						params.projectId ?? undefined
					);
					pendingToolCalls.push(normalizedToolCall);
					activePendingToolCallCount = pendingToolCalls.length;
					if (params.onToolCall) {
						await params.onToolCall(normalizedToolCall);
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
					llmPassMeta.finishedReason =
						event.finished_reason ?? llmPassMeta.finishedReason;
					const eventRecord = event as Record<string, unknown>;
					const model = readStringMeta(eventRecord.model);
					const provider = readStringMeta(eventRecord.provider);
					const requestId =
						readStringMeta(eventRecord.request_id) ??
						readStringMeta(eventRecord.requestId);
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

			if (pendingToolCalls.length === 0) {
				const candidateFinalText = sanitizeAssistantFinalText(assistantBuffer);
				if (
					shouldRepairProjectCreateNoExecution({
						contextType: normalizedContext,
						finalText: candidateFinalText,
						toolExecutions,
						repairAlreadyInjected: projectCreateStopRepairInjected
					})
				) {
					projectCreateStopRepairInjected = true;
					queueRepairInstruction(buildProjectCreateNoExecutionRepairInstruction());
					flushRepairInstructions();
					continue;
				}
				if (
					shouldRepairGatewayMutationNoExecution({
						gatewayModeActive,
						contextType: normalizedContext,
						finalText: candidateFinalText,
						toolExecutions,
						repairAlreadyInjected: gatewayMutationStopRepairInjected
					})
				) {
					gatewayMutationStopRepairInjected = true;
					queueRepairInstruction(
						buildGatewayMutationNoExecutionRepairInstruction(toolExecutions)
					);
					flushRepairInstructions();
					continue;
				}

				finalAssistantText = enforceMutationOutcomeIntegrity(candidateFinalText, {
					contextType: normalizedContext,
					toolExecutions
				});
				if (finalAssistantText && finalAssistantText !== assistantText.trim()) {
					await emitAssistantRemainder(finalAssistantText);
				}
				activeAssistantBuffer = '';
				activePendingToolCallCount = 0;
				break;
			}

			const replayAssistantContent = toolLeadInEmitted
				? ''
				: sanitizeToolPassLeadIn(assistantBuffer, message);
			if (replayAssistantContent) {
				await emitAssistantDelta(replayAssistantContent);
				toolLeadInEmitted = true;
			}

			if (!params.toolExecutor) {
				throw new Error('Tool executor is not configured');
			}

			toolRounds += 1;
			if (toolRounds > maxToolRounds) {
				markToolLimitReached('round');
				break;
			}

			const replayToolCalls = sanitizeToolCallsForReplay(pendingToolCalls);
			messages.push({
				role: 'assistant',
				content: replayAssistantContent,
				tool_calls: replayToolCalls
			});
			activeAssistantBuffer = '';
			activePendingToolCallCount = 0;

			for (const toolCall of pendingToolCalls) {
				const anomaly = inspectToolArgumentAnomaly(toolCall);
				if (anomaly) {
					logToolArgumentAnomaly({
						sessionId,
						anomaly
					});
				}
			}

			const validationProjectId =
				typeof params.projectId === 'string' && isValidUUID(params.projectId)
					? params.projectId
					: typeof entityId === 'string' &&
						  isValidUUID(entityId) &&
						  normalizedContext === 'project'
						? entityId
						: null;
			const validationIssues = validateToolCalls(pendingToolCalls, tools, {
				projectId: validationProjectId
			});
			const validationIssueByToolCallId = new Map(
				validationIssues.map((issue) => [issue.toolCall.id, issue])
			);
			const executableToolCalls = sanitizeToolCallsForReplay(pendingToolCalls);
			const roundExecutions: FastToolExecution[] = [];
			const toolCallsToExecute: Array<{ original: ChatToolCall; executable: ChatToolCall }> =
				[];
			if (validationIssues.length > 0) {
				if (hasDocumentOrganizationValidationIssue(validationIssues)) {
					docOrganizationRecoveryEligible = true;
				}
				for (let index = 0; index < pendingToolCalls.length; index += 1) {
					const toolCall = pendingToolCalls[index];
					if (!toolCall) {
						continue;
					}
					const validationIssue = validationIssueByToolCallId.get(toolCall.id);
					const errorMessage = validationIssue
						? `Tool validation failed: ${validationIssue.errors.join(' ')}`
						: null;
					if (errorMessage) {
						const result: ChatToolResult = {
							tool_call_id: toolCall.id,
							result: null,
							success: false,
							error: errorMessage
						};

						toolExecutions.push({ toolCall, result });
						roundExecutions.push({ toolCall, result });
						if (params.onToolResult) {
							try {
								await params.onToolResult({ toolCall, result });
							} catch {
								// UI/logging callbacks must not crash tool orchestration.
							}
						}

						const validationPayload: Record<string, unknown> = {
							error: errorMessage
						};
						if (validationIssue?.op) {
							validationPayload.op = validationIssue.op;
							validationPayload.help_path = validationIssue.op;
						}
						if (validationIssue?.errors?.length) {
							validationPayload.details = { field_errors: validationIssue.errors };
						}
						messages.push({
							role: 'tool',
							content: JSON.stringify(validationPayload),
							tool_call_id: toolCall.id
						});
						continue;
					}
					const executable = executableToolCalls[index] ?? toolCall;
					toolCallsToExecute.push({ original: toolCall, executable });
				}

				if (toolCallsToExecute.length === 0) {
					consecutiveValidationIssueRounds += 1;
					const requiredFieldFailures =
						extractGatewayRequiredFieldFailuresFromValidationIssues(validationIssues);
					const maxRequiredFieldFailure =
						recordGatewayRequiredFieldFailures(requiredFieldFailures);
					if (
						gatewayModeActive &&
						allowAutonomousRecovery &&
						hasDocumentOrganizationValidationIssue(validationIssues) &&
						consecutiveValidationIssueRounds >= 2 &&
						(await attemptDocOrganizationRecovery())
					) {
						break;
					}
					if (consecutiveValidationIssueRounds <= maxValidationRepairRounds) {
						if (
							gatewayModeActive &&
							maxRequiredFieldFailure &&
							maxRequiredFieldFailure.count >= 2 &&
							!gatewaySchemaRepairInjected
						) {
							queueRepairInstruction(
								buildGatewayRequiredFieldRepairInstruction(requiredFieldFailures)
							);
							gatewaySchemaRepairInjected = true;
						}
						if (
							gatewayModeActive &&
							maxRequiredFieldFailure &&
							maxRequiredFieldFailure.count >= 2 &&
							!gatewayCreateFieldNoProgressRepairInjected &&
							hasGatewayCreateFieldNoProgressFailure(requiredFieldFailures)
						) {
							queueRepairInstruction(
								buildGatewayCreateFieldNoProgressRepairInstruction(
									requiredFieldFailures
								)
							);
							gatewayCreateFieldNoProgressRepairInjected = true;
						}
						queueRepairInstruction(
							buildToolValidationRepairInstruction(
								validationIssues,
								gatewayModeActive
							)
						);
						flushRepairInstructions();
						continue;
					}

					markValidationLimitReached();
					break;
				}

				consecutiveValidationIssueRounds = 0;
				queueRepairInstruction(
					buildToolValidationRepairInstruction(validationIssues, gatewayModeActive)
				);
			} else {
				consecutiveValidationIssueRounds = 0;
				for (let index = 0; index < pendingToolCalls.length; index += 1) {
					const toolCall = pendingToolCalls[index];
					if (!toolCall) {
						continue;
					}
					const executable = executableToolCalls[index] ?? toolCall;
					toolCallsToExecute.push({ original: toolCall, executable });
				}
			}

			for (const { original: originalToolCall, executable: toolCall } of toolCallsToExecute) {
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
					const addedToolNames = gatewayModeActive
						? materializeDirectTools(
								[toolCall.function.name],
								`The tool "${toolCall.function.name}" was not preloaded.`
							)
						: [];
					result = {
						tool_call_id: originalToolCall.id,
						result: null,
						success: false,
						error:
							addedToolNames.length > 0
								? `Tool "${toolCall.function.name}" is now loaded for this turn. Retry with the direct tool and exact arguments.`
								: 'Tool not available in this context'
					};
				} else {
					try {
						result = await params.toolExecutor(toolCall, tools);
						if (result.tool_call_id !== originalToolCall.id) {
							result = {
								...result,
								tool_call_id: originalToolCall.id
							};
						}
					} catch (error) {
						const message =
							error instanceof Error ? error.message : 'Tool execution failed';
						result = {
							tool_call_id: originalToolCall.id,
							result: null,
							success: false,
							error: message
						};
					}
				}

				const execution: FastToolExecution = { toolCall: originalToolCall, result };
				toolExecutions.push(execution);
				roundExecutions.push(execution);
				if (gatewayModeActive && result.success) {
					materializeDirectTools(
						extractGatewayMaterializedToolNames(result.result),
						'Discovery loaded additional tools.'
					);
				}
				if (params.onToolResult) {
					try {
						await params.onToolResult(execution);
					} catch {
						// UI/logging callbacks must not crash tool orchestration.
					}
				}

				const toolPayload = buildToolPayloadForModel(
					originalToolCall,
					result,
					parseToolArguments
				);
				messages.push({
					role: 'tool',
					content: JSON.stringify(toolPayload),
					tool_call_id: originalToolCall.id
				});
			}

			if (toolLimitNotice) {
				break;
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
				queueRepairInstruction(buildReadLoopRepairInstruction(roundPattern.readOps));
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
			const maxRequiredFieldFailure =
				recordGatewayRequiredFieldFailures(requiredFieldFailures);

			if (
				gatewayModeActive &&
				maxRequiredFieldFailure &&
				maxRequiredFieldFailure.count >= 2 &&
				!gatewaySchemaRepairInjected
			) {
				queueRepairInstruction(
					buildGatewayRequiredFieldRepairInstruction(requiredFieldFailures)
				);
				gatewaySchemaRepairInjected = true;
			}
			if (
				gatewayModeActive &&
				maxRequiredFieldFailure &&
				maxRequiredFieldFailure.count >= 2 &&
				!gatewayCreateFieldNoProgressRepairInjected &&
				hasGatewayCreateFieldNoProgressFailure(requiredFieldFailures)
			) {
				queueRepairInstruction(
					buildGatewayCreateFieldNoProgressRepairInstruction(requiredFieldFailures)
				);
				gatewayCreateFieldNoProgressRepairInjected = true;
			}

			if (
				gatewayModeActive &&
				maxRequiredFieldFailure &&
				maxRequiredFieldFailure.count >= 2 &&
				(await attemptDocOrganizationRecovery())
			) {
				break;
			}

			if (
				gatewayModeActive &&
				maxRequiredFieldFailure &&
				maxRequiredFieldFailure.count >= 3
			) {
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
			flushRepairInstructions();

			if (toolLimitNotice) {
				break;
			}
		}
	} catch (error) {
		if (signal?.aborted || isAbortLikeError(error)) {
			finishedReason = 'cancelled';
			if (activePendingToolCallCount === 0) {
				const partialAssistantText = sanitizeAssistantFinalText(activeAssistantBuffer);
				if (partialAssistantText && partialAssistantText !== assistantText.trim()) {
					await emitAssistantRemainder(partialAssistantText);
					if (!finalAssistantText) {
						finalAssistantText = partialAssistantText;
					}
				}
			}
			if (dev) {
				appendRuntimeMetadataToPromptDump(promptDumpPath, {
					llmPasses: llmStreamPasses,
					finishedReason,
					toolRounds,
					toolCallsMade,
					toolExecutions,
					cancelled: true
				});
			}
			return {
				assistantText,
				finalAssistantText: finalAssistantText || assistantText.trim(),
				usage,
				finishedReason,
				toolExecutions,
				llmPasses: llmStreamPasses,
				toolRounds,
				toolCallsMade,
				cancelled: true
			};
		}
		throw error;
	}

	if (toolLimitNotice) {
		const prefix = assistantText.trim().length > 0 ? '\n\n' : '';
		const noticeDelta = `${prefix}${toolLimitNotice}`;
		assistantText += noticeDelta;
		finalAssistantText = toolLimitNotice;
		await onDelta(noticeDelta);
	}

	if (dev) {
		appendRuntimeMetadataToPromptDump(promptDumpPath, {
			llmPasses: llmStreamPasses,
			finishedReason,
			toolRounds,
			toolCallsMade,
			toolExecutions
		});
	}

	return {
		assistantText,
		finalAssistantText: finalAssistantText || assistantText.trim(),
		usage,
		finishedReason,
		toolExecutions,
		llmPasses: llmStreamPasses,
		toolRounds,
		toolCallsMade
	};
}

function readStringMeta(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function readNumberMeta(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
