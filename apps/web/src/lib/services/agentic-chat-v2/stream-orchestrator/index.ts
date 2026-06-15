// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts
import type {
	ChatContextType,
	ChatToolCall,
	ChatToolDefinition,
	ChatToolResult,
	ContextUsageSnapshot
} from '@buildos/shared-types';
import type { OpenRouterContentPart } from '$lib/services/openrouter-v2/types';
import type { SmartLLMService } from '$lib/services/smart-llm-service';
import type { FastChatHistoryMessage, FastAgentStreamUsage } from '../types';
import { normalizeFastContextType } from '../prompt-builder';
import { buildLitePromptEnvelope } from '$lib/services/agentic-chat-lite/prompt';
import { FASTCHAT_LIMITS } from '../limits';
import { buildLiveSnapshotFromTokens, FASTCHAT_TOKEN_BUDGETS } from '../context-usage';
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
	applyFinalizationGuard,
	createDeterministicTurnSupervisor,
	type FinalizationGuardResult,
	type TurnSupervisor,
	type TurnSupervisorDecisionRecord,
	type TurnSupervisorDecisionTrigger,
	type TurnSupervisorObservation
} from '../turn-supervisor';
import {
	parseToolArguments as parseSupervisorToolArguments,
	summarizeToolResult
} from '../turn-supervisor/digest';
import {
	buildConsolidatedRepairInstruction,
	buildGatewayCreateFieldNoProgressRepairInstruction,
	buildGatewayMutationNoExecutionRepairInstruction,
	buildGatewayRequiredFieldRepairInstruction,
	buildProjectCreateNoExecutionRepairInstruction,
	buildReadLoopRepairInstruction,
	buildToolRoundBudgetSynthesisInstruction,
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
import { buildWriteLedgerMessage } from './write-ledger';
import { ContextGatheringLedger } from './context-gathering-ledger';
import * as readLoopEscalation from './read-loop-escalation';
import type { ReadLoopRepairEscalation as ReadLoopRepairEscalationLevel } from './read-loop-escalation';

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
	currentTurnContent?: string | OpenRouterContentPart[];
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
	onContextUsageUpdate?: (snapshot: ContextUsageSnapshot) => Promise<void> | void;
	turnSupervisor?: TurnSupervisor;
	onSupervisorDecision?: (record: TurnSupervisorDecisionRecord) => Promise<void> | void;
	orchestrationTokenBudget?: number;
	maxToolRounds?: number;
	maxToolCalls?: number;
	allowAutonomousRecovery?: boolean;
	debugContext?: FastChatDebugContext;
};

type FastChatModelMessage = Omit<FastChatHistoryMessage, 'content'> & {
	content: string | OpenRouterContentPart[];
	reasoning?: string;
	reasoning_content?: string;
	reasoning_details?: unknown[];
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
	supervisorDecisions?: TurnSupervisorDecisionRecord[];
	finalizationGuard?: FinalizationGuardResult;
	cancelled?: boolean;
	peakPromptTokens?: number;
	finalContextUsage?: ContextUsageSnapshot;
}> {
	const { llm, userId, sessionId, contextType, entityId, history, message, signal, onDelta } =
		params;

	const normalizedContext = normalizeFastContextType(contextType);
	const systemPrompt =
		params.systemPrompt ??
		buildLitePromptEnvelope({
			contextType: normalizedContext,
			entityId: entityId ?? null,
			currentUserMessage: message
		}).systemPrompt;

	const messages: FastChatModelMessage[] = [
		{ role: 'system', content: systemPrompt },
		...history,
		{ role: 'user', content: params.currentTurnContent ?? message }
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
	// "Gateway mode" arms on-demand tool materialization (on-miss + discover-then-load)
	// and the gateway recovery/repair machinery. It must key off discovery tools that
	// actually remain on the launch surface. Under lean discovery (Tier 2 item 4) only
	// skill_search + domain_search mount at launch, so recognize those too — otherwise
	// removing tool_search/tool_schema/skill_load from launch would silently disable
	// on-demand loading. Behavior-identical when lean discovery is off, because those
	// entry tools co-mount with the full discovery set today.
	const gatewayModeActive =
		allowedToolNames.has('tool_search') ||
		allowedToolNames.has('tool_schema') ||
		allowedToolNames.has('skill_load') ||
		allowedToolNames.has('skill_search') ||
		allowedToolNames.has('domain_search');
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
	let readLoopRepairRank = 0;
	let forceNoToolSynthesisPass = false;
	let noToolSynthesisRetryCount = 0;
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
	let supervisorStopRequested = false;
	let finalizationGuardResult: FinalizationGuardResult | undefined;
	const pendingRepairInstructions: string[] = [];
	const contextGatheringLedger = new ContextGatheringLedger();
	const supervisor =
		params.turnSupervisor ??
		createDeterministicTurnSupervisor({
			turnRunId: params.turnRunId ?? null,
			sessionId,
			userId,
			contextType: normalizedContext,
			entityId: entityId ?? null,
			projectId: params.projectId ?? null,
			userMessage: message,
			config: {
				maxToolRounds
			}
		});
	const supervisorDecisions: TurnSupervisorDecisionRecord[] = [];
	let observeSupervisor: (
		observation: TurnSupervisorObservation
	) => Promise<void> = async () => {};

	// Live context-usage snapshot. Updated after every LLM `done` event using
	// the provider-reported prompt_tokens (ground truth) so saturation logic
	// has a current view of context-window load as tool results accumulate.
	// Separate budget from the UI badge — see context-usage.ts and
	// docs/specs/agent-token-tracking-investigation-2026-05-12.md.
	const orchestrationTokenBudget = Math.max(
		1,
		params.orchestrationTokenBudget ?? FASTCHAT_TOKEN_BUDGETS.ORCHESTRATION
	);
	let liveContextUsage: ContextUsageSnapshot | undefined;
	let peakPromptTokens = 0;
	const updateLiveContextUsage = async (promptTokens: number | undefined): Promise<void> => {
		if (
			typeof promptTokens !== 'number' ||
			!Number.isFinite(promptTokens) ||
			promptTokens <= 0
		) {
			return;
		}
		if (promptTokens > peakPromptTokens) {
			peakPromptTokens = promptTokens;
		}
		liveContextUsage = buildLiveSnapshotFromTokens({
			estimatedTokens: promptTokens,
			tokenBudget: orchestrationTokenBudget
		});
		if (params.onContextUsageUpdate) {
			try {
				await params.onContextUsageUpdate(liveContextUsage);
			} catch {
				// Telemetry callbacks must not crash orchestration.
			}
		}
	};
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
	const queueReadLoopRepairInstruction = (
		level: ReadLoopRepairEscalationLevel,
		readOps: string[],
		roundsRemaining: number
	): void => {
		const nextRank = readLoopEscalation.READ_LOOP_REPAIR_RANK[level];
		if (nextRank <= readLoopRepairRank) return;
		readLoopRepairRank = nextRank;
		queueRepairInstruction(
			buildReadLoopRepairInstruction(readOps, {
				level,
				roundsRemaining
			})
		);
		if (level === 'must_synthesize') {
			forceNoToolSynthesisPass = true;
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
			content: `${reason} Additional tools now available for the rest of this turn: ${materialized.addedToolNames.join(', ')}. Call them directly by name.`
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
		await observeSupervisor({
			type: 'tool_call_emitted',
			toolName: toolCall.function.name,
			toolCallId: toolCall.id,
			argsPreview: args
		});

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
		await observeSupervisor({
			type: 'tool_result_received',
			toolName: toolCall.function.name,
			toolCallId: toolCall.id,
			success: result.success === true,
			error: result.error ?? null,
			resultSummary: summarizeToolResult(result)
		});
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
		await observeSupervisor({ type: 'assistant_text_delta', chars: delta.length });
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
			await observeSupervisor({ type: 'assistant_text_delta', chars: remainder.length });
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

	// Classifies a supervisor decision for telemetry (recorded as `trigger` on
	// chat_turn_events). Originally fed the LLM judge, which was removed
	// 2026-06-11 — the classification stayed because it's useful on its own.
	const resolveSupervisorDecisionTrigger = (
		record: TurnSupervisorDecisionRecord,
		observation: TurnSupervisorObservation
	): TurnSupervisorDecisionTrigger | null => {
		const { decision, digest } = record;
		if (decision.action === 'emit_status') {
			return decision.reason === 'long_running_operation'
				? 'long_running_operation'
				: 'long_silence';
		}
		if (decision.reason === 'repeated_validation_failures') {
			return 'repeated_failures';
		}
		if (decision.action === 'force_synthesis') {
			if (decision.reason === 'low_novelty_reads') return 'low_novelty_reads';
			if (decision.reason === 'near_tool_budget') return 'near_tool_budget';
			return 'many_tool_calls';
		}
		if (
			decision.action === 'flag_eval' &&
			decision.reason === 'empty_final_candidate_after_tool_work'
		) {
			return 'empty_final_candidate';
		}
		if (observation.type === 'tool_round_completed') {
			if (digest.risks.includes('repeated_failures')) return 'repeated_failures';
			if (digest.risks.includes('near_tool_budget')) return 'near_tool_budget';
			if (digest.risks.includes('many_tool_calls')) return 'many_tool_calls';
		}
		return null;
	};

	const handleSupervisorDecisionRecord = async (
		record: TurnSupervisorDecisionRecord
	): Promise<void> => {
		supervisorDecisions.push(record);
		if (params.onSupervisorDecision) {
			try {
				await params.onSupervisorDecision(record);
			} catch {
				// Supervisor telemetry/status callbacks must not crash orchestration.
			}
		}

		const { decision } = record;
		if (decision.action === 'force_synthesis') {
			queueRepairInstruction(decision.instruction);
			forceNoToolSynthesisPass = true;
			return;
		}
		if (decision.action === 'ask_user') {
			finalAssistantText = decision.question;
			finishedReason = 'supervisor_question';
			supervisorStopRequested = true;
			await emitAssistantRemainder(decision.question);
			return;
		}
		if (decision.action === 'stop_with_message') {
			finalAssistantText = decision.message;
			finishedReason = decision.finishedReason;
			supervisorStopRequested = true;
			await emitAssistantRemainder(decision.message);
		}
	};

	observeSupervisor = async (observation: TurnSupervisorObservation): Promise<void> => {
		let decisions;
		try {
			decisions = supervisor.observe(observation);
		} catch {
			return;
		}
		for (const decision of decisions) {
			if (decision.action === 'continue') continue;
			let digest;
			try {
				digest = supervisor.getDigest();
			} catch {
				continue;
			}
			const monitorRecord: TurnSupervisorDecisionRecord = {
				decision,
				digest,
				at: new Date().toISOString(),
				source: 'monitor'
			};
			const monitorTrigger = resolveSupervisorDecisionTrigger(monitorRecord, observation);
			if (monitorTrigger) {
				monitorRecord.trigger = monitorTrigger;
			}

			await handleSupervisorDecisionRecord(monitorRecord);
		}
	};

	const startLongRunningOperationHeartbeat = (
		operation: 'tool_execution' | 'llm_stream',
		options: { toolName?: string; toolCallId?: string } = {}
	): (() => void) => {
		const startedAt = Date.now();
		let stopped = false;
		let timer: ReturnType<typeof setTimeout> | null = null;
		const tick = (): void => {
			if (stopped) return;
			void observeSupervisor({
				type: 'long_running_operation',
				operation,
				toolName: options.toolName,
				toolCallId: options.toolCallId,
				elapsedMs: Date.now() - startedAt
			});
			timer = setTimeout(tick, 15_000);
		};
		timer = setTimeout(tick, 12_000);
		return () => {
			stopped = true;
			if (timer) clearTimeout(timer);
		};
	};

	try {
		await observeSupervisor({ type: 'turn_started' });
		while (true) {
			if (signal?.aborted) {
				throw new Error('Request aborted');
			}
			if (supervisorStopRequested) {
				break;
			}

			let assistantBuffer = '';
			let assistantReasoningForReplay = '';
			const assistantReasoningDetailsForReplay: unknown[] = [];
			const pendingToolCalls: ChatToolCall[] = [];
			const noToolSynthesisPass = forceNoToolSynthesisPass;
			forceNoToolSynthesisPass = false;
			activeAssistantBuffer = '';
			activePendingToolCallCount = 0;
			const llmPassMeta: LLMStreamPassMetadata = {
				pass: llmStreamPasses.length + 1
			};
			if (noToolSynthesisPass) {
				llmPassMeta.forcedNoToolSynthesis = true;
			}
			let llmDoneReceived = false;

			const clearLlmHeartbeat = startLongRunningOperationHeartbeat('llm_stream');
			try {
				for await (const event of llm.streamText({
					messages,
					tools: noToolSynthesisPass ? undefined : hasTools ? tools : undefined,
					tool_choice: noToolSynthesisPass ? undefined : hasTools ? 'auto' : undefined,
					temperature: noToolSynthesisPass ? undefined : hasTools ? 0.2 : undefined,
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
					} else if (event.type === 'reasoning') {
						// Reasoning stays out of the user-visible content buffer.
						// Track per-pass counters and preserve blocks for tool-call
						// continuity when the next request sends tool results.
						// If a model emits reasoning via delta.content instead, we
						// will see content tokens climb while these counters stay
						// at zero, a clear signal to switch models or add a
						// targeted sanitizer for that provider.
						const reasoningEvent = event as {
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
								? reasoningEvent.reasoning_details.reduce<number>(
										(acc: number, part: unknown) => {
											if (!part || typeof part !== 'object') return acc;
											const text = (part as { text?: unknown }).text;
											return (
												acc + (typeof text === 'string' ? text.length : 0)
											);
										},
										0
									)
								: 0);
						llmPassMeta.reasoningChannelChunks =
							(llmPassMeta.reasoningChannelChunks ?? 0) + 1;
						llmPassMeta.reasoningChannelChars =
							(llmPassMeta.reasoningChannelChars ?? 0) + reasoningLen;
					} else if (event.type === 'tool_call' && event.tool_call) {
						const normalizedToolCall = normalizeToolCallDefaults(
							event.tool_call,
							params.projectId ?? undefined
						);
						pendingToolCalls.push(normalizedToolCall);
						activePendingToolCallCount = pendingToolCalls.length;
						await observeSupervisor({
							type: 'tool_call_emitted',
							toolName: normalizedToolCall.function.name,
							toolCallId: normalizedToolCall.id,
							argsPreview: parseSupervisorToolArguments(normalizedToolCall)
						});
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
										(usage.prompt_tokens ?? 0) +
										(event.usage.prompt_tokens ?? 0);
								}
								if (event.usage.completion_tokens !== undefined) {
									usage.completion_tokens =
										(usage.completion_tokens ?? 0) +
										(event.usage.completion_tokens ?? 0);
								}
							}

							if (typeof event.usage.prompt_tokens === 'number') {
								llmPassMeta.promptTokens = event.usage.prompt_tokens;
								// Update live context-usage snapshot from provider ground truth
								// so saturation logic and the UI badge can react to real
								// context-window load mid-turn.
								await updateLiveContextUsage(event.usage.prompt_tokens);
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
									? (usageRecord.completion_tokens_details as Record<
											string,
											unknown
										>)
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
			} finally {
				clearLlmHeartbeat();
			}
			if (llmDoneReceived) {
				llmStreamPasses.push(llmPassMeta);
				await observeSupervisor({
					type: 'llm_pass_completed',
					pass: llmPassMeta.pass,
					finishedReason: llmPassMeta.finishedReason,
					usage:
						llmPassMeta.totalTokens !== undefined ||
						llmPassMeta.promptTokens !== undefined ||
						llmPassMeta.completionTokens !== undefined
							? {
									total_tokens: llmPassMeta.totalTokens,
									prompt_tokens: llmPassMeta.promptTokens,
									completion_tokens: llmPassMeta.completionTokens
								}
							: undefined
				});
			}
			if (supervisorStopRequested) {
				break;
			}

			if (noToolSynthesisPass) {
				const candidateFinalText = sanitizeAssistantFinalText(assistantBuffer);
				const noToolPassStillRequestedTools =
					pendingToolCalls.length > 0 ||
					(llmPassMeta.finishedReason === 'tool_calls' && !candidateFinalText);
				if (noToolPassStillRequestedTools && noToolSynthesisRetryCount < 1) {
					noToolSynthesisRetryCount += 1;
					messages.push({
						role: 'system',
						content:
							'The previous synthesis attempt still requested tool calls even though tools are unavailable. Ignore all pending or implied tool calls and write the final user-facing answer now from the existing tool results. Do not say you will check, search, pull up, inspect, load, or update anything else.'
					});
					forceNoToolSynthesisPass = true;
					continue;
				}
				if (candidateFinalText && pendingToolCalls.length === 0) {
					finalAssistantText = enforceMutationOutcomeIntegrity(candidateFinalText, {
						contextType: normalizedContext,
						toolExecutions
					});
					await observeSupervisor({
						type: 'final_candidate',
						text: finalAssistantText,
						finishedReason: 'stop'
					});
					if (finalAssistantText && finalAssistantText !== assistantText.trim()) {
						await emitAssistantRemainder(finalAssistantText);
					}
					finishedReason = 'stop';
					activeAssistantBuffer = '';
					activePendingToolCallCount = 0;
					break;
				}
				markToolLimitReached('round');
				break;
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
				await observeSupervisor({
					type: 'final_candidate',
					text: finalAssistantText,
					finishedReason
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

			const replayToolCalls = sanitizeToolCallsForReplay(pendingToolCalls, {
				redactInvalidDurableText: true
			});
			const assistantReplayMessage: FastChatModelMessage = {
				role: 'assistant',
				content: replayAssistantContent,
				tool_calls: replayToolCalls
			};
			if (assistantReasoningDetailsForReplay.length > 0) {
				assistantReplayMessage.reasoning_details = assistantReasoningDetailsForReplay;
			} else if (assistantReasoningForReplay.trim()) {
				assistantReplayMessage.reasoning = assistantReasoningForReplay;
			}
			messages.push(assistantReplayMessage);
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
			let roundModelPayloadChars = 0;
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
						await observeSupervisor({
							type: 'tool_result_received',
							toolName: toolCall.function.name,
							toolCallId: toolCall.id,
							success: false,
							error: result.error ?? null,
							resultSummary: summarizeToolResult(result)
						});
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
						const validationToolContent = JSON.stringify(validationPayload);
						roundModelPayloadChars += validationToolContent.length;
						messages.push({
							role: 'tool',
							content: validationToolContent,
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
					await observeSupervisor({
						type: 'tool_round_completed',
						round: toolRounds,
						toolCallsMade
					});
					if (supervisorStopRequested) {
						break;
					}
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
					const requestedName = toolCall.function.name;
					let addedToolNames = gatewayModeActive
						? materializeDirectTools(
								[requestedName],
								`The tool "${requestedName}" was not preloaded.`
							)
						: [];
					// The model sometimes calls a canonical op name (e.g. "onto.task.update")
					// instead of the callable tool name surfaced as a skill's related op.
					// Resolve op -> tool and materialize the callable tool so the next round
					// can succeed, instead of dead-ending on "tool not available".
					let resolvedOpToolName: string | null = null;
					if (gatewayModeActive && addedToolNames.length === 0) {
						const opToolName =
							getToolRegistry().ops[normalizeGatewayOpName(requestedName)]?.tool_name;
						if (opToolName && opToolName !== requestedName) {
							addedToolNames = materializeDirectTools(
								[opToolName],
								`"${requestedName}" is an op reference, not a callable tool.`
							);
							if (addedToolNames.length > 0) {
								resolvedOpToolName = opToolName;
							}
						}
					}
					result = {
						tool_call_id: originalToolCall.id,
						result: null,
						success: false,
						error: resolvedOpToolName
							? `"${requestedName}" is an op name. Call "${resolvedOpToolName}" instead with the exact arguments.`
							: addedToolNames.length > 0
								? `Tool "${requestedName}" is now loaded for this turn. Retry with the direct tool and exact arguments.`
								: 'Tool not available in this context'
					};
				} else {
					const clearToolStatusTimer = startLongRunningOperationHeartbeat(
						'tool_execution',
						{
							toolName: originalToolCall.function.name,
							toolCallId: originalToolCall.id
						}
					);
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
					} finally {
						clearToolStatusTimer();
					}
				}

				const execution: FastToolExecution = { toolCall: originalToolCall, result };
				toolExecutions.push(execution);
				roundExecutions.push(execution);
				await observeSupervisor({
					type: 'tool_result_received',
					toolName: originalToolCall.function.name,
					toolCallId: originalToolCall.id,
					success: result.success === true,
					error: result.error ?? null,
					resultSummary: summarizeToolResult(result)
				});
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
				const toolPayloadContent = JSON.stringify(toolPayload);
				roundModelPayloadChars += toolPayloadContent.length;
				messages.push({
					role: 'tool',
					content: toolPayloadContent,
					tool_call_id: originalToolCall.id
				});
			}

			if (toolLimitNotice) {
				break;
			}
			await observeSupervisor({
				type: 'tool_round_completed',
				round: toolRounds,
				toolCallsMade
			});
			if (supervisorStopRequested) {
				break;
			}

			// Write-outcome ledger: after each tool round, surface the cumulative
			// set of durable writes (successes + failures) as a system message so
			// the model can ground its next response — including the eventual
			// final user-facing summary — in actual tool results rather than
			// planned intent. Skipped when the round has no writes to report.
			const writeLedgerMessage = buildWriteLedgerMessage(toolExecutions);
			if (writeLedgerMessage) {
				messages.push({ role: 'system', content: writeLedgerMessage });
			}

			const roundPattern = buildRoundToolPattern(pendingToolCalls);

			if (roundPattern.hasWriteOps) {
				hasWriteAttempt = true;
				readOnlyRoundCount = 0;
				lastReadOpSetKey = null;
				repeatedReadOpSetCount = 0;
				readLoopRepairRank = 0;
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

			if (gatewayModeActive && !hasWriteAttempt && roundPattern.readOps.length > 0) {
				const ledgerObservation = contextGatheringLedger.observeToolRound({
					roundExecutions,
					roundPattern,
					toolRounds,
					maxToolRounds,
					modelPayloadChars: roundModelPayloadChars,
					liveContextUsage
				});
				if (ledgerObservation.message) {
					messages.push({ role: 'system', content: ledgerObservation.message });
				}
				if (ledgerObservation.forceSynthesis) {
					queueReadLoopRepairInstruction(
						'must_synthesize',
						roundPattern.readOps,
						ledgerObservation.status.roundsRemaining
					);
				}

				const roundsRemaining = maxToolRounds - toolRounds;
				const escalation = readLoopEscalation.selectReadLoopRepairEscalation({
					readOnlyRoundCount,
					roundsRemaining
				});
				if (escalation) {
					queueReadLoopRepairInstruction(
						escalation,
						roundPattern.readOps,
						roundsRemaining
					);
				}
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
				queueReadLoopRepairInstruction(
					'must_synthesize',
					roundPattern.readOps,
					maxToolRounds - toolRounds
				);
				flushRepairInstructions();
				continue;
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
			if (gatewayModeActive && toolRounds >= maxToolRounds) {
				queueRepairInstruction(buildToolRoundBudgetSynthesisInstruction());
				forceNoToolSynthesisPass = true;
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
				supervisorDecisions,
				finalizationGuard: finalizationGuardResult,
				cancelled: true,
				peakPromptTokens: peakPromptTokens > 0 ? peakPromptTokens : undefined,
				finalContextUsage: liveContextUsage
			};
		}
		throw error;
	}

	if (toolLimitNotice) {
		const toolLimitFinalizationGuard = applyFinalizationGuard({
			finalAssistantText: '',
			assistantText: '',
			toolExecutions
		});
		const finalToolLimitText = toolLimitFinalizationGuard.applied
			? toolLimitFinalizationGuard.text
			: toolLimitNotice;
		const prefix = assistantText.trim().length > 0 ? '\n\n' : '';
		const noticeDelta = `${prefix}${finalToolLimitText}`;
		assistantText += noticeDelta;
		finalAssistantText = finalToolLimitText;
		await onDelta(noticeDelta);
		await observeSupervisor({ type: 'assistant_text_delta', chars: noticeDelta.length });
		if (toolLimitFinalizationGuard.applied) {
			finalizationGuardResult = toolLimitFinalizationGuard;
			await observeSupervisor({
				type: 'final_candidate',
				text: finalAssistantText,
				finishedReason
			});
		}
	}

	const candidateFinalizationGuard = applyFinalizationGuard({
		finalAssistantText,
		assistantText,
		toolExecutions
	});
	if (candidateFinalizationGuard.applied) {
		finalizationGuardResult = candidateFinalizationGuard;
		finalAssistantText = finalizationGuardResult.text;
		await observeSupervisor({
			type: 'final_candidate',
			text: finalAssistantText,
			finishedReason
		});
		if (finalAssistantText && finalAssistantText !== assistantText.trim()) {
			await emitAssistantRemainder(finalAssistantText);
		}
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
		toolCallsMade,
		supervisorDecisions,
		finalizationGuard: finalizationGuardResult,
		peakPromptTokens: peakPromptTokens > 0 ? peakPromptTokens : undefined,
		finalContextUsage: liveContextUsage
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
