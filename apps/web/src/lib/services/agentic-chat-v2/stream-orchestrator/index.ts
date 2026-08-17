// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts
import type {
	AgentTurnPhase,
	ChatContextType,
	ChatToolCall,
	ChatToolDefinition,
	ChatToolResult,
	ContextUsageSnapshot
} from '@buildos/shared-types';
import type { OpenRouterContentPart } from '$lib/services/openrouter-v2/types';
import type { SmartLLMService } from '$lib/services/smart-llm-service';
import type { FastChatHistoryMessage, FastAgentStreamUsage } from '../types';
import { normalizeFastContextType } from '../scope';
import {
	resolveFastChatPassModelRouting,
	type FastChatForcedSynthesisRoutingConfig,
	type FastChatModelTieringConfig,
	type FastChatPassModelRouting
} from '../model-tiering';
import {
	buildLitePromptEnvelope,
	buildMidTurnSituationalNotice
} from '$lib/services/agentic-chat-lite/prompt';
import { FASTCHAT_LIMITS } from '../limits';
import { buildLiveSnapshotFromTokens, FASTCHAT_TOKEN_BUDGETS } from '../context-usage';
import {
	getWriteToolNamesForTurnIntent,
	turnIntentRequestsTaskScheduling,
	type FastChatTurnIntent
} from '../turn-intent';
import { materializeGatewayTools } from '$lib/services/agentic-chat/tools/core/gateway-surface';
import { normalizeGatewayOpName } from '$lib/services/agentic-chat/tools/registry/gateway-op-aliases';
import { getToolRegistry } from '$lib/services/agentic-chat/tools/registry/tool-registry';
import { dev } from '$app/environment';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { sanitizeAssistantFinalText, sanitizeToolPassLeadIn } from './assistant-text-sanitization';
import { appendRuntimeMetadataToPromptDump, writeInitialPromptDump } from './prompt-dump-debug';
import type {
	FastChatDebugContext,
	FastChatCompletionOutcome,
	FastChatOrchestrationInterventions,
	FastToolExecution,
	GatewayRequiredFieldFailure,
	LLMStreamPassMetadata
} from './shared';
import {
	parseToolArguments,
	inspectToolArgumentAnomaly,
	logToolArgumentAnomaly,
	sanitizeToolCallsForReplay
} from './tool-arguments';
import {
	buildTurnSupervisorEntityIndexFromContextData,
	type TurnSupervisorEntityIndexEntry,
	createDeterministicTurnSupervisor,
	type FinalizationGuardResult,
	type TurnSupervisor,
	type TurnSupervisorDecisionRecord,
	type TurnSupervisorDecisionTrigger,
	type TurnSupervisorObservation
} from '../turn-supervisor';
import { summarizeToolResult } from '../turn-supervisor/digest';
import {
	buildConsolidatedRepairInstruction,
	buildGatewayCreateFieldNoProgressRepairInstruction,
	buildGatewayRequiredFieldRepairInstruction,
	buildReadLoopRepairInstruction,
	buildToolRoundBudgetSynthesisInstruction,
	countWebResearchCalls,
	buildToolValidationRepairInstruction,
	collectDocumentInventoryFromReads,
	collectGatewayWriteIntentOps,
	countDistinctSuccessfulWriteTargets,
	enforceMutationOutcomeIntegrity,
	hasGatewayCreateFieldNoProgressFailure
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
import {
	classifyToolExecution,
	doesToolExecutionRequireUserAction,
	didGatewayExecSucceed,
	didToolExecutionReachWriteExecutor,
	getGatewayExecOp,
	isDuplicateWriteSkippedExecution,
	isPureReadToolName,
	isWriteLikeOperation
} from './tool-classification';
import { buildMemoServedResult, buildReadMemoKey, shouldMemoizeReadResult } from './read-memo';
import { toolCallProvidesTaskScheduleField, validateToolCalls } from './tool-validation';
import { buildWriteLedgerMessage } from './write-ledger';
import {
	buildForcedSynthesisMessages,
	collectForcedSynthesisDirectives
} from './synthesis-context';
import { buildWrongEntityKindRepairResult, type KnownEntity } from './entity-kind-repair';
import { ContextGatheringLedger } from './context-gathering-ledger';
import {
	executeToolCallPair,
	prepareToolRound,
	recordToolExecutionForRound
} from './tool-round-runner';
import {
	LlmStreamPassTerminalError,
	runLlmStreamPass,
	type FastChatModelMessage
} from './llm-pass-runner';
import {
	applyTurnRouteHealth,
	createTurnRouteHealth,
	observeTurnRouteHealth
} from './turn-route-health';
import {
	resolveLengthContinuation,
	runCancellationFinalization,
	runNoToolCallFinalization,
	runNoToolSynthesisFinalization,
	runTerminalFinalization
} from './finalization-runner';
import * as readLoopEscalation from './read-loop-escalation';
import type { ReadLoopRepairEscalation as ReadLoopRepairEscalationLevel } from './read-loop-escalation';
import {
	getSafeWriteToolNamesForTurnContract,
	resolveTurnContractFromExecutions,
	resolveTurnContractOutcome,
	type TurnContract,
	type TurnContractResolution
} from '@buildos/agentic-chat-runtime/loop';

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
	batchToolExecutor?: (
		toolCalls: ChatToolCall[],
		availableTools?: ChatToolDefinition[]
	) => Promise<ChatToolResult[]>;
	onToolCall?: (toolCall: ChatToolCall) => Promise<void> | void;
	onToolResult?: (execution: FastToolExecution) => Promise<void> | void;
	onContextUsageUpdate?: (snapshot: ContextUsageSnapshot) => Promise<void> | void;
	turnSupervisor?: TurnSupervisor;
	supervisorContextData?: Record<string, unknown> | string | null;
	onSupervisorDecision?: (record: TurnSupervisorDecisionRecord) => Promise<void> | void;
	onPhase?: (
		phase: Extract<AgentTurnPhase, 'planning' | 'gathering' | 'synthesizing' | 'recovering'>
	) => Promise<void> | void;
	orchestrationTokenBudget?: number;
	maxToolRounds?: number;
	maxToolCalls?: number;
	allowAutonomousRecovery?: boolean;
	/** Disable soft supervisor/read-loop forced-synthesis interventions for ablation runs. */
	allowForcedSynthesis?: boolean;
	modelTiering?: FastChatModelTieringConfig | null;
	forcedSynthesisRouting?: FastChatForcedSynthesisRoutingConfig | null;
	/** Server-only eval override. When set, every pass uses this ordered model list. */
	pinnedModels?: string[];
	turnIntent?: FastChatTurnIntent | null;
	initialTurnContract?: TurnContract | null;
	/**
	 * Trusted, server-derived write alternatives for an implicit durable-capture
	 * commission. Unlike explicit turn intent, this requires at least one
	 * successful write from the set rather than every listed tool.
	 */
	commissionedWriteToolNames?: string[];
	/** Minimum successful calls needed to fulfill the server-owned commission. */
	commissionedWriteMinimumCount?: number;
	debugContext?: FastChatDebugContext;
	/**
	 * Deterministic skill-load enforcement (2026-07-02). When domain sensing
	 * marked the turn skill-covered (`required`), the first finalization attempt
	 * with no relevant skill_load this turn — and no relevant skill in the
	 * loaded-skills ledger — gets one repair round demanding the load.
	 */
	skillGate?: {
		required: boolean;
		recommendedSkillIds: string[];
		acceptableSkillIds: string[];
		historyLoadedSkillIds: string[];
	} | null;
};

function buildRuntimeToolBudgetMessage(params: {
	toolRounds: number;
	maxToolRounds: number;
	toolCallsMade: number;
	maxToolCalls: number;
	noToolSynthesisPass: boolean;
	writeToolOnlyPassToolNames?: string[];
}): string {
	const roundsRemaining = Math.max(0, params.maxToolRounds - params.toolRounds);
	const callsRemaining = Math.max(0, params.maxToolCalls - params.toolCallsMade);
	if (params.writeToolOnlyPassToolNames?.length) {
		return [
			`Runtime tool budget: ${roundsRemaining} of ${params.maxToolRounds} tool rounds remain; ${callsRemaining} of ${params.maxToolCalls} tool calls remain.`,
			`The supervisor is allowing one near-budget write-intent pass. Only these write tools are available: ${params.writeToolOnlyPassToolNames.join(', ')}.`,
			'Call one of those write tools only if the required arguments are known. If a required target or field is missing, ask one concise clarifying question instead of guessing. Do not call reads, searches, schemas, or skills.'
		].join(' ');
	}
	if (params.noToolSynthesisPass) {
		return [
			`Runtime tool budget: tools are unavailable for this synthesis pass. ${roundsRemaining} of ${params.maxToolRounds} tool rounds remain in the turn budget, but the supervisor has asked for an answer from loaded evidence.`,
			'Do not request tools in this response. Write the final user-facing answer from the tool results already loaded.'
		].join(' ');
	}

	const pressureLine =
		roundsRemaining <= 2
			? 'With two or fewer tool rounds remaining, answer from loaded evidence unless one specific missing fact is required.'
			: 'Before calling tools, choose the smallest set of tool calls needed to answer and avoid broad keyword probes.';
	return [
		`Runtime tool budget: ${roundsRemaining} of ${params.maxToolRounds} tool rounds remain; ${callsRemaining} of ${params.maxToolCalls} tool calls remain.`,
		'A tool round is one assistant response that emits one or more tool calls. Batch independent read calls in the same response when all are needed.',
		pressureLine
	].join(' ');
}

type ForcedWriteIntentToolPass = {
	toolNames: string[];
	instruction: string;
	/** Calls reserved beyond the ordinary call cap for this write-only pass. */
	reservedToolCalls?: number;
};

function collectSuccessfulCommissionedDocumentIds(
	toolExecutions: FastToolExecution[]
): Set<string> {
	const ids = new Set<string>();
	for (const execution of toolExecutions) {
		if (execution.toolCall.function?.name !== 'update_onto_document') continue;
		if (!didGatewayExecSucceed(execution) || isDuplicateWriteSkippedExecution(execution)) {
			continue;
		}
		const { args } = parseToolArguments(execution.toolCall.function.arguments);
		const documentId =
			typeof args.document_id === 'string' ? args.document_id.trim().toLowerCase() : '';
		if (documentId) ids.add(documentId);
	}
	return ids;
}

function buildMentionedDocumentTargetHint(params: {
	entityIndex: TurnSupervisorEntityIndexEntry[];
	message: string;
	excludedDocumentIds: ReadonlySet<string>;
}): string | null {
	const normalizedMessage = params.message.normalize('NFKC').toLocaleLowerCase();
	const candidates = params.entityIndex
		.filter(
			(entry) =>
				entry.kind === 'document' &&
				Boolean(entry.label?.trim()) &&
				!params.excludedDocumentIds.has(entry.id.toLowerCase())
		)
		.map((entry) => {
			const label = entry.label?.trim() ?? '';
			const normalizedLabel = label.normalize('NFKC').toLocaleLowerCase();
			const labelWords = normalizedLabel
				.split(/[^\p{L}\p{N}]+/u)
				.filter((word) => word.length >= 4);
			const exactIndex = normalizedMessage.indexOf(normalizedLabel);
			const wordIndexes = labelWords
				.map((word) => normalizedMessage.indexOf(word))
				.filter((index) => index >= 0);
			const mentionIndex = exactIndex >= 0 ? exactIndex : Math.min(...wordIndexes);
			return { entry, label, mentionIndex };
		})
		.filter((candidate) => Number.isFinite(candidate.mentionIndex))
		.sort((left, right) => left.mentionIndex - right.mentionIndex)
		.slice(0, 4);

	if (candidates.length === 0) return null;
	return `Affected document candidates named in the current message, in mention order: ${candidates
		.map(({ entry, label }) => `"${label}" (document_id ${entry.id})`)
		.join('; ')}. Choose the first one whose reference facts actually changed.`;
}

function buildCommissionedDistinctTargetInstruction(params: {
	deficit: number;
	successfulDocumentIds: ReadonlySet<string>;
	entityIndex: TurnSupervisorEntityIndexEntry[];
	message: string;
}): string {
	const candidateHint = buildMentionedDocumentTargetHint({
		entityIndex: params.entityIndex,
		message: params.message,
		excludedDocumentIds: params.successfulDocumentIds
	});
	return [
		`Make ${params.deficit} additional durable document write call${params.deficit === 1 ? '' : 's'} to distinct affected reference documents.`,
		params.successfulDocumentIds.size > 0
			? `Do not write these already-successful document_ids again: ${Array.from(params.successfulDocumentIds).join(', ')}. A repeat target does not satisfy this commission.`
			: null,
		candidateHint,
		'Do not repeat an already-successful update to the same document, even with different content.'
	]
		.filter((line): line is string => Boolean(line))
		.join(' ');
}

const RESEARCH_PERSISTENCE_OPT_OUT =
	/\b(?:(?:do\s+not|don'?t|never)\s+(?:save|persist|record|write|create|update)|no\s+need\s+to\s+(?:save|persist|record))\b/i;

const VAGUE_PROJECT_CREATE_REQUEST =
	/^(?:(?:hi|hello|hey)[,!. ]*)?(?:(?:please\s+)?(?:help\s+me\s+)?|i\s+(?:want|need|would\s+like)\s+to\s+)?(?:create|start|set\s+up|make)?\s*(?:me\s+)?(?:a\s+)?(?:new\s+)?project(?:\s+please)?[?!. ]*$/i;

function hasActionableProjectCreateInput(message: string | null | undefined): boolean {
	const normalized = typeof message === 'string' ? message.trim().replace(/\s+/g, ' ') : '';
	if (normalized.length < 8 || VAGUE_PROJECT_CREATE_REQUEST.test(normalized)) return false;
	const isInformationQuestion =
		normalized.endsWith('?') &&
		/^(?:what|which|how|why|when|where|who|can|could|would|should|do|does|is|are)\b/i.test(
			normalized
		);
	const isDirectCreateQuestion =
		/^(?:can|could|would)\s+you\s+(?:please\s+)?(?:create|start|set\s+up|make)\b/i.test(
			normalized
		);
	return !isInformationQuestion || isDirectCreateQuestion;
}

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
	skillGateViolationRepaired?: boolean;
	completionOutcome?: FastChatCompletionOutcome;
	turnContract?: TurnContract | null;
	turnContractResolution?: TurnContractResolution;
	orchestrationInterventions: FastChatOrchestrationInterventions;
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
	// Within-turn cache of successful pure-read results (WP-12): identical
	// repeat reads are served from here with a nudge instead of re-executing.
	// Cleared whenever an execution reaches the write executor — see read-memo.ts.
	const turnReadMemo = new Map<string, ChatToolResult>();
	const llmStreamPasses: LLMStreamPassMetadata[] = [];
	const turnRouteHealth = createTurnRouteHealth();
	let tools = params.tools ?? [];
	let allowedToolNames = new Set(
		tools.map((tool) => tool.function?.name).filter((name): name is string => Boolean(name))
	);
	const commissionedWriteToolNames = Array.from(
		new Set(
			(params.commissionedWriteToolNames ?? [])
				.map((name) => name.trim())
				.filter((name) => name.length > 0 && allowedToolNames.has(name))
		)
	);
	const commissionedWriteMinimumCount =
		commissionedWriteToolNames.length > 0
			? Math.max(1, Math.floor(params.commissionedWriteMinimumCount ?? 1))
			: 0;
	// Count distinct durable targets, not raw successful calls: two updates to
	// the same document are one projection and must not satisfy a 2-write floor.
	const countSuccessfulCommissionedWrites = (): number =>
		countDistinctSuccessfulWriteTargets(toolExecutions, commissionedWriteToolNames);
	const initialTurnContract = params.initialTurnContract ?? null;
	// Semantic contracts own completion. The lexical intent remains a conservative
	// legacy-path safety floor for transport recovery and no-op schedule validation:
	// it may demand disclosure or a repair, but it cannot satisfy a write outcome.
	const lexicalMutationSafetyFloor = params.turnIntent?.requiresWrite === true;
	const lexicalExpectedWriteToolNames = params.turnIntent
		? getWriteToolNamesForTurnIntent(params.turnIntent)
		: [];
	const lexicalTaskSchedulingSafetyFloor = params.turnIntent
		? turnIntentRequestsTaskScheduling(params.turnIntent)
		: false;
	let turnContract: TurnContract | null = initialTurnContract;
	let mutationRequested = lexicalMutationSafetyFloor || commissionedWriteToolNames.length > 0;
	let taskSchedulingRequested = lexicalTaskSchedulingSafetyFloor;
	let expectedWriteToolNames = Array.from(
		new Set([...lexicalExpectedWriteToolNames, ...commissionedWriteToolNames])
	);
	const refreshTurnContract = (): void => {
		turnContract = resolveTurnContractFromExecutions(toolExecutions, initialTurnContract);
		if (!turnContract) {
			mutationRequested = lexicalMutationSafetyFloor || commissionedWriteToolNames.length > 0;
			expectedWriteToolNames = Array.from(
				new Set([...lexicalExpectedWriteToolNames, ...commissionedWriteToolNames])
			);
			taskSchedulingRequested = lexicalTaskSchedulingSafetyFloor;
			return;
		}
		mutationRequested = true;
		expectedWriteToolNames = getSafeWriteToolNamesForTurnContract(turnContract);
		taskSchedulingRequested =
			lexicalTaskSchedulingSafetyFloor ||
			turnContract.outcomes.some(
				(outcome) =>
					outcome.action === 'schedule' ||
					(outcome.entityKind === 'task' &&
						outcome.requiredFields.some((field) =>
							['due_at', 'start_at', 'end_at'].includes(field)
						))
			);
	};
	const requiredSuccessfulContractEffects = (): number =>
		turnContract?.outcomes.reduce(
			(total, outcome) => total + outcome.minimumSuccessfulEffects,
			0
		) ?? 0;
	refreshTurnContract();
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
	const allowForcedSynthesis = params.allowForcedSynthesis !== false;
	const commissionWriteToolNames = (): string[] => {
		const resolution = resolveTurnContractOutcome({
			contract: turnContract,
			toolExecutions,
			finishedReason
		});
		if (resolution.fulfilled) return [];
		return getSafeWriteToolNamesForTurnContract(turnContract).filter((name) =>
			allowedToolNames.has(name)
		);
	};
	let toolRounds = 0;
	let toolCallsMade = 0;
	let toolCallsExecuted = 0;
	let consecutiveValidationIssueRounds = 0;
	let validationRepairRounds = 0;
	let toolLimitNotice: string | null = null;
	let hasWriteAttempt = false;
	let projectCreateStopRepairInjected = false;
	let gatewayMutationStopRepairInjected = false;
	let skillGateStopRepairInjected = false;
	let researchNoPersistStopRepairInjected = false;
	let statedFutureStopRepairInjected = false;
	let organizeCommissionStopRepairInjected = false;
	let readOnlyRoundCount = 0;
	let researchRoundCount = 0;
	let researchPayloadChars = 0;
	let lastReadOpSetKey: string | null = null;
	let repeatedReadOpSetCount = 0;
	let readLoopRepairRank = 0;
	let forceNoToolSynthesisPass = false;
	let forceWriteIntentToolPass: ForcedWriteIntentToolPass | null = null;
	let writeIntentCarveOutUsed = false;
	let noToolSynthesisRetryCount = 0;
	// D8: recovery state for answers that hit the output-token cap
	// (finish_reason === 'length'). `lengthContinuationCount` bounds how many
	// times we ask the model to keep going; `carriedTruncatedText` accumulates the
	// confirmed partial text from earlier truncated passes so the final answer is
	// the whole thing, not just the last continuation; `answerTruncated` flags the
	// turn when we exhaust continuations so we never present a cut-off answer as a
	// clean `stop`.
	let lengthContinuationCount = 0;
	let carriedTruncatedText = '';
	let answerTruncated = false;
	const gatewayRequiredFieldFailureCounts = new Map<string, number>();
	let docOrganizationRecoveryEligible = false;
	let gatewaySchemaRepairInjected = false;
	let gatewayCreateFieldNoProgressRepairInjected = false;
	const repetitionLimit = gatewayModeActive ? 3 : 4;
	let lastRoundFingerprint: string | null = null;
	let consecutiveRoundFingerprintCount = 0;
	const recentRoundFingerprintWindow: string[] = [];
	const roundFingerprintWindowSize = Math.max(6, repetitionLimit * 2);
	let docOrganizationRecoveryAttempted = false;
	let toolLeadInEmitted = false;
	let activeAssistantBuffer = '';
	let activePendingToolCallCount = 0;
	let supervisorStopRequested = false;
	const supervisorBlockedToolCallIds = new Set<string>();
	let finalizationGuardResult: FinalizationGuardResult | undefined;
	let synthesisTransportRecovery: FastChatCompletionOutcome['recovery'] | undefined;
	let currentTurnPhase: AgentTurnPhase | null = null;
	const pendingRepairInstructions: string[] = [];
	const pendingMaterializationNotices: string[] = [];
	const contextGatheringLedger = new ContextGatheringLedger();
	const knownEntitiesById = new Map<string, KnownEntity>();
	const successfulWriteExecutionsByKey = new Map<string, FastToolExecution>();
	const supervisorEntityIndex = buildTurnSupervisorEntityIndexFromContextData(
		params.supervisorContextData
	);
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
			entityIndex: supervisorEntityIndex,
			config: {
				maxToolRounds
			}
		});
	const supervisorDecisions: TurnSupervisorDecisionRecord[] = [];
	const buildOrchestrationInterventions = (): FastChatOrchestrationInterventions => ({
		projectCreateStopRepair: projectCreateStopRepairInjected,
		gatewayMutationStopRepair: gatewayMutationStopRepairInjected,
		skillGateStopRepair: skillGateStopRepairInjected,
		researchNoPersistRepair: researchNoPersistStopRepairInjected,
		statedFutureRepair: statedFutureStopRepairInjected,
		organizeCommissionRepair: organizeCommissionStopRepairInjected,
		gatewaySchemaRepair: gatewaySchemaRepairInjected,
		gatewayCreateFieldRepair: gatewayCreateFieldNoProgressRepairInjected,
		validationRepairRounds,
		readLoopRepairRank,
		forcedSynthesisPasses: llmStreamPasses.filter(
			(pass) => pass.passRole === 'forced_synthesis'
		).length,
		writeIntentCarveOut: writeIntentCarveOutUsed,
		lengthContinuations: lengthContinuationCount,
		documentOrganizationRecovery: docOrganizationRecoveryAttempted,
		finalizationGuard: finalizationGuardResult?.applied === true,
		supervisorRecoveryDecisions: supervisorDecisions.filter(
			(record) =>
				record.decision.action === 'force_synthesis' ||
				record.decision.action === 'inject_recovery_instruction'
		).length,
		streamRetries: llmStreamPasses.reduce(
			(total, pass) => total + (pass.streamRetryCount ?? 0),
			0
		),
		synthesisTransportRecovery: synthesisTransportRecovery !== undefined
	});
	let observeSupervisor: (
		observation: TurnSupervisorObservation
	) => Promise<void> = async () => {};
	const notifyTurnPhase = async (
		phase: Extract<AgentTurnPhase, 'planning' | 'gathering' | 'synthesizing' | 'recovering'>
	): Promise<void> => {
		if (currentTurnPhase === phase) return;
		currentTurnPhase = phase;
		if (!params.onPhase) return;
		try {
			await params.onPhase(phase);
		} catch {
			// Progress reporting must not crash orchestration.
		}
	};

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
	// O8: A turn is only a *user cancellation* when the abort signal actually
	// fired. Message-substring matches like "The operation was aborted"
	// (provider timeouts) or "stream closed" (socket drops) also occur on real
	// failures — classifying those as cancellations silently swallows the error
	// and presents an incomplete turn as if the user stopped it. So we require
	// `signal.aborted === true` (which is set synchronously by the AbortController
	// before the AbortError ever reaches us) rather than trusting the message.
	const isUserCancellation = (): boolean => {
		// A user cancellation is defined solely by the abort signal firing. An
		// AbortError with no aborted signal (e.g. a provider-internal timeout
		// implemented via its own AbortController) is NOT a user cancellation and
		// must surface as a real error.
		return signal?.aborted === true;
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
		roundsRemaining: number,
		framing: 'read_loop' | 'research_budget' = 'read_loop'
	): void => {
		if (level === 'must_synthesize' && !allowForcedSynthesis) return;
		const nextRank = readLoopEscalation.READ_LOOP_REPAIR_RANK[level];
		if (nextRank <= readLoopRepairRank) return;
		readLoopRepairRank = nextRank;
		const commissionToolNames =
			framing === 'read_loop' && !hasWriteAttempt ? commissionWriteToolNames() : [];
		queueRepairInstruction(
			buildReadLoopRepairInstruction(readOps, {
				level,
				roundsRemaining,
				framing,
				pendingWriteCommission:
					commissionToolNames.length > 0 ? { toolNames: commissionToolNames } : undefined
			})
		);
		if (level === 'must_synthesize') {
			const writeIntentToolPass = buildNearBudgetWriteIntentToolPass();
			if (writeIntentToolPass) {
				writeIntentCarveOutUsed = true;
				forceWriteIntentToolPass = writeIntentToolPass;
				queueRepairInstruction(writeIntentToolPass.instruction);
			} else {
				forceNoToolSynthesisPass = true;
			}
		}
	};
	const flushMaterializationNotices = (): void => {
		if (pendingMaterializationNotices.length === 0) return;
		for (const content of pendingMaterializationNotices) {
			messages.push({
				role: 'system',
				content
			});
		}
		pendingMaterializationNotices.length = 0;
	};
	const flushRepairInstructions = (): void => {
		flushMaterializationNotices();
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
		allowedToolNames = new Set(
			tools.map((tool) => tool.function?.name).filter((name): name is string => Boolean(name))
		);
		// tasker/39 stage 3: write/web rules moved out of the always-on strategy
		// list into situational blocks. When those tools materialize mid-turn,
		// their rules ride the same notice so they arrive exactly when the
		// situation becomes live, in the recency position.
		const situationalNotice = buildMidTurnSituationalNotice(materialized.addedToolNames);
		const notice = `${reason} Additional tools now available for the rest of this turn: ${materialized.addedToolNames.join(', ')}. Call them directly by name.${
			situationalNotice ? `\n\n${situationalNotice}` : ''
		}`;
		if (!pendingMaterializationNotices.includes(notice)) {
			pendingMaterializationNotices.push(notice);
		}
		return materialized.addedToolNames;
	};
	function buildResearchCaptureToolPass(): ForcedWriteIntentToolPass | null {
		if (writeIntentCarveOutUsed || countWebResearchCalls(toolExecutions) < 2) return null;
		if (RESEARCH_PERSISTENCE_OPT_OUT.test(message ?? '')) return null;
		const effectiveProjectId =
			params.projectId ?? (normalizedContext === 'project' ? entityId : null);
		if (!effectiveProjectId || !isValidUUID(effectiveProjectId)) return null;
		const requestedToolNames = ['update_onto_document', 'create_onto_document'];
		materializeDirectTools(
			requestedToolNames,
			'Research completed without a durable project record.'
		);
		const toolNames = requestedToolNames.filter((name) => allowedToolNames.has(name));
		if (toolNames.length === 0) return null;
		return {
			toolNames,
			reservedToolCalls: 1,
			instruction: [
				'Supervisor note: web research is complete, but none of its findings has been persisted.',
				`For the next response, use exactly one of these document write tools: ${toolNames.join(', ')}.`,
				'Append to the project document this research was for, or create one if no existing document fits.',
				'Include the useful findings and a Sources section with the URLs already gathered.',
				'Do not call more searches, page visits, reads, schemas, skills, or discovery tools in this pass.'
			].join(' ')
		};
	}
	function buildNearBudgetWriteIntentToolPass(): ForcedWriteIntentToolPass | null {
		if (!gatewayModeActive || writeIntentCarveOutUsed) return null;
		const writeIntentOps = collectGatewayWriteIntentOps(toolExecutions).filter((op) => {
			const normalizedOp = normalizeGatewayOpName(op);
			if (isDestructiveWriteOperation(normalizedOp)) return false;
			let latestDirectAttemptSucceeded: boolean | null = null;
			for (const execution of toolExecutions) {
				if (getGatewayExecOp(execution) !== normalizedOp) continue;
				latestDirectAttemptSucceeded = didGatewayExecSucceed(execution);
			}
			return latestDirectAttemptSucceeded !== true;
		});
		const registry = getToolRegistry();
		const writeToolNames = new Set<string>();
		for (const op of writeIntentOps) {
			const toolName = registry.ops[normalizeGatewayOpName(op)]?.tool_name;
			if (!toolName) continue;
			materializeDirectTools([toolName], `Near-budget write intent ${op} was identified.`);
			if (allowedToolNames.has(toolName)) {
				writeToolNames.add(toolName);
			}
		}
		for (const toolName of getSafeWriteToolNamesForTurnContract(turnContract)) {
			const latestMatchingAttempt = [...toolExecutions]
				.reverse()
				.find((execution) => execution.toolCall.function?.name === toolName);
			if (latestMatchingAttempt && didGatewayExecSucceed(latestMatchingAttempt)) continue;
			materializeDirectTools(
				[toolName],
				'A declared semantic turn outcome is still pending.'
			);
			if (allowedToolNames.has(toolName)) writeToolNames.add(toolName);
		}
		const commissionedWriteDeficit = Math.max(
			0,
			commissionedWriteMinimumCount - countSuccessfulCommissionedWrites()
		);
		if (commissionedWriteDeficit > 0) {
			for (const toolName of commissionedWriteToolNames) {
				if (allowedToolNames.has(toolName)) writeToolNames.add(toolName);
			}
		}
		if (writeToolNames.size === 0) {
			const researchCapturePass = buildResearchCaptureToolPass();
			if (researchCapturePass) return researchCapturePass;

			// Third source: a commissioned document reorganization with the doc surface mounted
			// but no write op attempted yet. Without this, the toolless synthesis pass fires and
			// the system confiscates the tools at exactly the moment the writes would start.
			const organizeToolNames = commissionWriteToolNames();
			if (organizeToolNames.length === 0) return null;
			for (const toolName of organizeToolNames) writeToolNames.add(toolName);
			const toolNames = Array.from(writeToolNames);
			const inventory = collectDocumentInventoryFromReads(toolExecutions);
			return {
				toolNames,
				instruction: [
					'Supervisor note: the user commissioned a document reorganization and no write has happened yet.',
					`For the next response, use only these write tools: ${toolNames.join(', ')}.`,
					'Execute the reorganization now — call move_document_in_tree once per document that needs a new parent; multiple calls in this one response are expected.',
					'For each move, set new_parent_title to a short category name (e.g. "Pricing", "Meeting notes") — the server reuses the existing document with that title or creates the parent. A move with neither parent field goes to the root and organizes nothing.',
					'Group related documents under the SAME parent: reuse the exact same new_parent_title string for every document in a category (e.g. "meeting 3-14 raw" and "meeting 4-02 raw" both get new_parent_title "Meeting notes"). Giving every document its own distinct parent is filing, not organizing — prefer a few shared categories over one folder per document.',
					inventory.length > 0
						? `The ONLY valid document ids in this project are: ${inventory
								.map((doc) => `${doc.id} ("${doc.title}")`)
								.join(
									'; '
								)}. Use new_parent_id only for a UUID from that list — NEVER invent one.`
						: null,
					'Do not call reads, searches, schemas, skills, or any other discovery tools in this pass.'
				]
					.filter((line): line is string => Boolean(line))
					.join(' ')
			};
		}

		const toolNames = Array.from(writeToolNames);
		const commissionedInstruction =
			commissionedWriteDeficit > 0
				? buildCommissionedDistinctTargetInstruction({
						deficit: commissionedWriteDeficit,
						successfulDocumentIds:
							collectSuccessfulCommissionedDocumentIds(toolExecutions),
						entityIndex: supervisorEntityIndex,
						message
					})
				: null;
		return {
			toolNames,
			instruction: [
				'Supervisor note: a requested mutation is still pending after context gathering.',
				`For the next response, you may use only these write tools: ${toolNames.join(', ')}.`,
				commissionedInstruction ??
					'Make at most one attempt per required write tool if the target and fields are known.',
				'If required arguments are missing, ask one concise clarifying question instead of guessing.',
				'Do not call reads, searches, schemas, skills, or any other discovery tools in this pass.'
			].join(' ')
		};
	}
	const consumeForcedWriteIntentToolPass = (): ForcedWriteIntentToolPass | null => {
		const nextPass = forceWriteIntentToolPass;
		forceWriteIntentToolPass = null;
		return nextPass;
	};
	const findDuplicateSuccessfulWrite = (
		toolCall: ChatToolCall
	): FastToolExecution | undefined => {
		const key = buildWriteDedupKey(toolCall);
		return key ? successfulWriteExecutionsByKey.get(key) : undefined;
	};
	const rememberSuccessfulWriteForDedup = (execution: FastToolExecution): void => {
		if (isDuplicateWriteSkippedExecution(execution)) return;
		if (!didGatewayExecSucceed(execution)) return;
		const key = buildWriteDedupKey(execution.toolCall);
		if (!key || successfulWriteExecutionsByKey.has(key)) return;
		successfulWriteExecutionsByKey.set(key, execution);
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
		// Stop issuing synthetic tool calls (which commit writes) once the turn is cancelled.
		if (signal?.aborted) return null;

		if (toolCallsMade >= maxToolCalls) {
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
			id: `auto_tool_${toolCallsExecuted + 1}`,
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
			toolCallsExecuted += 1;
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
		toolCallsMade += 1;
		toolExecutions.push(execution);
		rememberSuccessfulWriteForDedup(execution);
		await observeSupervisor({
			type: 'tool_result_received',
			toolName: toolCall.function.name,
			toolCallId: toolCall.id,
			// ok-aware: a gateway envelope with `ok: false` rides in on `success: true`,
			// so judge on didGatewayExecSucceed to keep the supervisor's write/failure
			// counts honest. Falls back to raw success for non-gateway tools.
			success: didGatewayExecSucceed(execution),
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
			docOrganizationRecoveryAttempted ||
			toolLimitNotice ||
			// Never start recovery writes on a cancelled turn.
			signal?.aborted
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
			// Stop mid-loop the moment the turn is cancelled or a safety limit fires
			// so recovery cannot continue committing writes after orchestration stops.
			if (signal?.aborted || toolLimitNotice) break;
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

		if (toolLimitNotice) {
			return false;
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
		if (decision.action === 'inject_recovery_instruction') {
			return 'failed_write_recovery';
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
			if (!allowForcedSynthesis) return;
			const writeIntentToolPass = buildNearBudgetWriteIntentToolPass();
			if (writeIntentToolPass) {
				writeIntentCarveOutUsed = true;
				forceWriteIntentToolPass = writeIntentToolPass;
				queueRepairInstruction(writeIntentToolPass.instruction);
				return;
			}
			queueRepairInstruction(decision.instruction);
			forceNoToolSynthesisPass = true;
			return;
		}
		if (decision.action === 'inject_recovery_instruction') {
			queueRepairInstruction(decision.instruction);
			if (decision.blockToolCall && decision.toolCallId) {
				supervisorBlockedToolCallIds.add(decision.toolCallId);
			}
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
		await notifyTurnPhase('planning');
		await observeSupervisor({ type: 'turn_started' });
		while (true) {
			if (signal?.aborted) {
				throw new Error('Request aborted');
			}
			if (supervisorStopRequested) {
				break;
			}

			const writeIntentToolPass = consumeForcedWriteIntentToolPass();
			let reservedWriteToolCallsUsed = 0;
			const writeIntentToolNameSet = writeIntentToolPass
				? new Set<string>(writeIntentToolPass.toolNames)
				: null;
			const passTools = writeIntentToolNameSet
				? tools.filter((tool) => {
						const name = tool.function?.name;
						return Boolean(name && writeIntentToolNameSet.has(name));
					})
				: tools;
			const getPassTools = (): ChatToolDefinition[] =>
				writeIntentToolNameSet ? passTools : tools;
			const getPassAllowedToolNames = (): Set<string> =>
				writeIntentToolNameSet ?? allowedToolNames;
			const passGatewayModeActive = writeIntentToolNameSet ? false : gatewayModeActive;
			const noToolSynthesisPass = writeIntentToolPass ? false : forceNoToolSynthesisPass;
			forceNoToolSynthesisPass = false;
			const passNumber = llmStreamPasses.length + 1;
			const forceProjectCreateToolCall =
				normalizedContext === 'project_create' &&
				passNumber === 1 &&
				toolRounds === 0 &&
				passTools.length === 1 &&
				passTools[0]?.function?.name === 'create_onto_project' &&
				hasActionableProjectCreateInput(message);
			const modelRouting = applyTurnRouteHealth(
				resolveFastChatPassModelRouting({
					passNumber,
					hasTools: passTools.length > 0,
					noToolSynthesisPass,
					writeIntentToolPass: Boolean(writeIntentToolPass),
					noToolSynthesisRetryCount,
					modelTiering: params.modelTiering ?? null,
					forcedSynthesisRouting: params.forcedSynthesisRouting ?? null,
					pinnedModels: params.pinnedModels
				}),
				turnRouteHealth,
				{ preserveModelOrder: Boolean(params.pinnedModels?.length) }
			);
			activeAssistantBuffer = '';
			activePendingToolCallCount = 0;
			const runtimeBudgetMessage = buildRuntimeToolBudgetMessage({
				toolRounds,
				maxToolRounds,
				toolCallsMade,
				maxToolCalls,
				noToolSynthesisPass,
				writeToolOnlyPassToolNames: writeIntentToolPass?.toolNames
			});
			const passMessages: FastChatModelMessage[] = noToolSynthesisPass
				? buildForcedSynthesisMessages({
						latestUserText: message,
						// Lexical intent remains telemetry-only. The write ledger and
						// semantic turn contract are the completion authority.
						turnIntent: null,
						toolExecutions,
						recoveryDirectives: collectForcedSynthesisDirectives(messages),
						retryCount: noToolSynthesisRetryCount,
						runtimeBudgetMessage
					})
				: [...messages, { role: 'system', content: runtimeBudgetMessage }];
			if (noToolSynthesisPass) {
				await notifyTurnPhase('synthesizing');
			}

			let llmPassResult;
			try {
				llmPassResult = await runLlmStreamPass({
					llm,
					passMessages,
					tools: passTools,
					hasTools: passTools.length > 0,
					forcedToolChoice:
						writeIntentToolPass || forceProjectCreateToolCall ? 'required' : undefined,
					noToolSynthesisPass,
					passNumber,
					usage,
					userId,
					sessionId,
					turnRunId: params.turnRunId,
					streamRunId: params.streamRunId,
					clientTurnId: params.clientTurnId,
					normalizedContext,
					entityId,
					projectId: params.projectId,
					commissionedDocumentUpdateFallbackContent: commissionedWriteToolNames.includes(
						'update_onto_document'
					)
						? message
						: undefined,
					signal,
					onAssistantBufferChange: (nextBuffer) => {
						activeAssistantBuffer = nextBuffer;
					},
					onPendingToolCallCountChange: (count) => {
						activePendingToolCallCount = count;
					},
					tryEmitEarlyAssistantLeadIn,
					updateLiveContextUsage,
					startLlmHeartbeat: () => startLongRunningOperationHeartbeat('llm_stream'),
					observeSupervisor,
					onToolCall: params.onToolCall,
					onStreamRetry: noToolSynthesisPass
						? async () => notifyTurnPhase('recovering')
						: undefined,
					onRouteHealthObservation: (observation) => {
						observeTurnRouteHealth(turnRouteHealth, observation);
					},
					modelRouting
				});
			} catch (error) {
				if (error instanceof LlmStreamPassTerminalError) {
					// The route's error path persists these; without them a failed
					// turn records 0 calls / 0 rounds even after successful tools ran
					// (observed 2026-07-31: seven reads, counters said zero).
					error.turnProgress = {
						toolRounds,
						toolCallsMade,
						toolExecutionCount: toolExecutions.length
					};
				}
				if (!(error instanceof LlmStreamPassTerminalError) || error.outcome === 'aborted') {
					throw error;
				}

				const recoveredPartialCandidate = sanitizeAssistantFinalText(
					error.partialAssistantText || activeAssistantBuffer
				).trim();
				// A mutation-requested turn may recover a transport partial only while
				// nothing has been written: with zero successful writes the partial
				// cannot describe a change that must be double-checked, and
				// enforceMutationOutcomeIntegrity rewrites any claim of a write that
				// never executed before the text is finalized. Once a write has
				// succeeded, keep failing loudly — a partial that under- or
				// mis-reports an executed mutation is worse than an error.
				const hasSuccessfulWriteExecution = toolExecutions.some(
					(execution) =>
						classifyToolExecution(execution) === 'write' &&
						didGatewayExecSucceed(execution)
				);
				const canRecoverReadOnlyToolPass =
					!noToolSynthesisPass &&
					(!mutationRequested || !hasSuccessfulWriteExecution) &&
					activePendingToolCallCount === 0 &&
					isUsableReadOnlyTransportPartial(recoveredPartialCandidate) &&
					toolExecutions.some(
						(execution) =>
							execution.result.success &&
							isPureReadToolName(execution.toolCall.function.name)
					);
				if (!noToolSynthesisPass && !canRecoverReadOnlyToolPass) {
					error.discardedPartialChars = recoveredPartialCandidate.length;
					error.recoveryBlockedReason =
						mutationRequested && hasSuccessfulWriteExecution
							? 'mutation_write_executed'
							: activePendingToolCallCount > 0
								? 'pending_tool_calls'
								: !isUsableReadOnlyTransportPartial(recoveredPartialCandidate)
									? 'partial_below_threshold'
									: 'no_successful_reads';
					throw error;
				}
				const recoveredPartialText = isUsableSynthesisPartial(recoveredPartialCandidate)
					? recoveredPartialCandidate
					: '';
				activeAssistantBuffer = recoveredPartialText;
				if (recoveredPartialText) {
					finalAssistantText = recoveredPartialText;
				}
				finishedReason = undefined;
				await notifyTurnPhase('recovering');
				synthesisTransportRecovery = {
					outcome: error.outcome,
					measurements: error.measurements,
					evidenceToolExecutionCount: toolExecutions.length
				};
				llmStreamPasses.push(buildRecoveredSynthesisPassMetadata({ error, modelRouting }));
				break;
			}
			const {
				assistantBuffer,
				assistantReasoningForReplay,
				assistantReasoningDetailsForReplay,
				pendingToolCalls,
				suppressedNoToolSynthesisToolCallCount
			} = llmPassResult;
			const llmPassMeta = llmPassResult.metadata;
			usage = llmPassResult.usage;
			if (llmPassResult.finishedReason !== undefined) {
				finishedReason = llmPassResult.finishedReason;
			}
			llmStreamPasses.push(llmPassMeta);
			if (supervisorStopRequested) {
				break;
			}

			// D8: A pass that ended because it hit the output-token cap
			// (finish_reason === 'length') has a truncated buffer — never finalize
			// it as a complete answer. Ask the model to continue from exactly where
			// it stopped (bounded by MAX_LENGTH_CONTINUATIONS), carrying the
			// confirmed partial text forward so the assembled answer is whole. When
			// continuations are exhausted, keep the accumulated text but flag the
			// turn as truncated so it is not presented as a clean `stop`.
			const lengthContinuationDecision = resolveLengthContinuation({
				llmPassMeta,
				pendingToolCallCount: pendingToolCalls.length,
				assistantBuffer,
				carriedTruncatedText,
				lengthContinuationCount,
				maxLengthContinuations: FASTCHAT_LIMITS.MAX_LENGTH_CONTINUATIONS,
				noToolSynthesisPass
			});
			if (lengthContinuationDecision.action === 'continue') {
				lengthContinuationCount = lengthContinuationDecision.nextLengthContinuationCount;
				carriedTruncatedText = lengthContinuationDecision.nextCarriedTruncatedText;
				console.warn(
					'[stream-orchestrator] answer hit output-token cap; requesting continuation',
					{
						pass: llmPassMeta.pass,
						continuation: lengthContinuationCount,
						maxContinuations: FASTCHAT_LIMITS.MAX_LENGTH_CONTINUATIONS,
						noToolSynthesisPass
					}
				);
				if (lengthContinuationDecision.partialAssistantText) {
					messages.push({
						role: 'assistant',
						content: lengthContinuationDecision.partialAssistantText
					});
				}
				messages.push({
					role: 'system',
					content: lengthContinuationDecision.systemMessage
				});
				if (lengthContinuationDecision.forceNoToolSynthesisPass) {
					forceNoToolSynthesisPass = true;
				}
				continue;
			}
			if (lengthContinuationDecision.action === 'exhausted') {
				console.warn(
					'[stream-orchestrator] answer still truncated after continuation budget; flagging turn',
					{
						pass: llmPassMeta.pass,
						continuations: lengthContinuationCount
					}
				);
				answerTruncated = true;
			}

			if (noToolSynthesisPass) {
				const noToolFinalization = await runNoToolSynthesisFinalization({
					assistantBuffer,
					carriedTruncatedText,
					suppressedNoToolSynthesisToolCallCount,
					noToolSynthesisRetryCount,
					contextType: normalizedContext,
					toolExecutions,
					latestUserText: message,
					mutationRequested,
					expectedWriteToolNames,
					assistantText,
					emitAssistantRemainder,
					observeSupervisor
				});
				if (noToolFinalization.action === 'retry') {
					noToolSynthesisRetryCount = noToolFinalization.nextRetryCount;
					messages.push({ role: 'system', content: noToolFinalization.systemMessage });
					forceNoToolSynthesisPass = true;
					continue;
				}
				if (noToolFinalization.action === 'finalized') {
					finalAssistantText = noToolFinalization.finalAssistantText;
					finishedReason = noToolFinalization.finishedReason;
					activeAssistantBuffer = '';
					activePendingToolCallCount = 0;
					break;
				}
				finishedReason = noToolFinalization.finishedReason;
				break;
			}

			if (pendingToolCalls.length === 0) {
				const noToolCallFinalization = await runNoToolCallFinalization({
					assistantBuffer,
					carriedTruncatedText,
					contextType: normalizedContext,
					toolExecutions,
					latestUserText: message,
					mutationRequested,
					expectedWriteToolNames,
					allowClarifyingQuestionWithoutWrite:
						commissionedWriteToolNames.length === 0 && turnContract === null,
					minimumSuccessfulWrites: Math.max(
						commissionedWriteMinimumCount,
						requiredSuccessfulContractEffects()
					),
					commissionedWriteToolNames: Array.from(
						new Set([...commissionedWriteToolNames, ...commissionWriteToolNames()])
					),
					gatewayModeActive,
					projectCreateStopRepairInjected,
					gatewayMutationStopRepairInjected,
					skillGateStopRepairInjected,
					researchNoPersistStopRepairInjected,
					statedFutureStopRepairInjected,
					organizeCommissionStopRepairInjected,
					skillGate: params.skillGate,
					assistantText,
					finishedReason,
					emitAssistantRemainder,
					observeSupervisor
				});
				if (noToolCallFinalization.action === 'repair') {
					if (noToolCallFinalization.kind === 'project_create') {
						projectCreateStopRepairInjected = true;
					} else if (noToolCallFinalization.kind === 'gateway_mutation') {
						gatewayMutationStopRepairInjected = true;
						// A prose-only stop cannot satisfy a server-owned mutation commission.
						// Restrict the repair pass to the pending write alternatives and require
						// a tool call, just as the near-budget write carve-out does. Only
						// commission turns get the forced no-prose pass; an ordinary mutation
						// stop keeps the instruction-only repair so the model can still ask a
						// blocker question instead of being forced into a guessed write.
						if (commissionedWriteToolNames.length > 0) {
							const mutationPass = buildNearBudgetWriteIntentToolPass();
							if (mutationPass) {
								writeIntentCarveOutUsed = true;
								forceWriteIntentToolPass = mutationPass;
								queueRepairInstruction(mutationPass.instruction);
							}
						}
					} else if (noToolCallFinalization.kind === 'research_no_persist') {
						researchNoPersistStopRepairInjected = true;
						const researchCapturePass = buildResearchCaptureToolPass();
						if (researchCapturePass) {
							writeIntentCarveOutUsed = true;
							forceWriteIntentToolPass = researchCapturePass;
							queueRepairInstruction(researchCapturePass.instruction);
						}
					} else if (noToolCallFinalization.kind === 'stated_future') {
						statedFutureStopRepairInjected = true;
					} else if (noToolCallFinalization.kind === 'organize_commission') {
						organizeCommissionStopRepairInjected = true;
						// Restrict the repair pass to the commissioned write tools so it cannot
						// be satisfied with more reading or another prose proposal.
						const organizePass = buildNearBudgetWriteIntentToolPass();
						if (organizePass) {
							writeIntentCarveOutUsed = true;
							forceWriteIntentToolPass = organizePass;
							queueRepairInstruction(organizePass.instruction);
						}
					} else {
						skillGateStopRepairInjected = true;
					}
					if (noToolCallFinalization.kind === 'skill_gate') {
						console.info(
							'[stream-orchestrator] skill-load gate active with no matching skill loaded; injecting repair round',
							{
								recommendedSkillIds: params.skillGate?.recommendedSkillIds ?? []
							}
						);
					}
					if (noToolCallFinalization.kind === 'research_no_persist') {
						console.info(
							'[stream-orchestrator] research ran with no durable write; injecting capture repair round',
							{
								researchCalls: countWebResearchCalls(toolExecutions)
							}
						);
					}
					queueRepairInstruction(noToolCallFinalization.instruction);
					flushRepairInstructions();
					continue;
				}
				finalAssistantText = noToolCallFinalization.finalAssistantText;
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
			await notifyTurnPhase('gathering');

			toolRounds += 1;
			// A forced write pass is the one reserved persistence slot after the
			// ordinary research/read budget. It is write-only and can cross the round
			// cap once; writeIntentCarveOutUsed prevents a second over-budget pass.
			if (toolRounds > maxToolRounds && !writeIntentToolPass) {
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
			const allowedToolNamesAtRoundStart = new Set(getPassAllowedToolNames());
			// The scheduling floor is round-atomic: if any call in this round (or a
			// prior successful execution) carries due_at/start_at, sibling calls
			// (a rename, a state change) pass — the turn's scheduling obligation is
			// already covered and flagging them would only cause repair ping-pong.
			const providesTaskScheduleField = (toolCall: ChatToolCall): boolean => {
				if (toolCall.function?.name !== 'update_onto_task') return false;
				const { args } = parseToolArguments(toolCall.function.arguments);
				return toolCallProvidesTaskScheduleField('update_onto_task', args);
			};
			const taskScheduleFieldRequired =
				taskSchedulingRequested &&
				!pendingToolCalls.some(providesTaskScheduleField) &&
				!toolExecutions.some(
					(execution) =>
						execution.result.success && providesTaskScheduleField(execution.toolCall)
				);
			const validationIssues = validateToolCalls(pendingToolCalls, getPassTools(), {
				projectId: validationProjectId,
				taskScheduleFieldRequired
			});
			if (writeIntentToolPass && commissionedWriteMinimumCount > 1) {
				const seenDocumentIds = collectSuccessfulCommissionedDocumentIds(toolExecutions);
				const candidateHint = buildMentionedDocumentTargetHint({
					entityIndex: supervisorEntityIndex,
					message,
					excludedDocumentIds: seenDocumentIds
				});
				for (const toolCall of pendingToolCalls) {
					if (toolCall.function?.name !== 'update_onto_document') continue;
					const { args } = parseToolArguments(toolCall.function.arguments);
					const documentId =
						typeof args.document_id === 'string'
							? args.document_id.trim().toLowerCase()
							: '';
					if (!documentId) continue;
					if (seenDocumentIds.has(documentId)) {
						const error = [
							'Duplicate commissioned target skipped:',
							`This multi-document commission already has a successful projection to document_id ${documentId}.`,
							'Repeating that target does not satisfy the remaining distinct-document write.',
							candidateHint ||
								'Choose a different affected document_id from project context.'
						].join(' ');
						const existingIssue = validationIssues.find(
							(issue) => issue.toolCall.id === toolCall.id
						);
						if (existingIssue) existingIssue.errors.push(error);
						else {
							validationIssues.push({
								toolCall,
								toolName: toolCall.function.name,
								errors: [error]
							});
						}
						continue;
					}
					seenDocumentIds.add(documentId);
				}
			}
			const executableToolCalls = sanitizeToolCallsForReplay(pendingToolCalls);
			const roundExecutions: FastToolExecution[] = [];
			let roundModelPayloadChars = 0;
			const blockedRetryCallIdsInRound = new Set(
				pendingToolCalls
					.filter((toolCall) => supervisorBlockedToolCallIds.has(toolCall.id))
					.map((toolCall) => toolCall.id)
			);
			if (hasDocumentOrganizationValidationIssue(validationIssues)) {
				docOrganizationRecoveryEligible = true;
			}
			const preparedToolRound = await prepareToolRound({
				pendingToolCalls,
				executableToolCalls,
				validationIssues,
				blockedRetryCallIdsInRound,
				toolExecutions,
				roundExecutions,
				observeSupervisor,
				onToolResult: params.onToolResult
			});
			toolCallsMade += preparedToolRound.handledToolCallDelta;
			roundModelPayloadChars += preparedToolRound.modelPayloadChars;
			messages.push(...preparedToolRound.toolMessages);
			const toolCallsToExecute = preparedToolRound.toolCallsToExecute;

			if (validationIssues.length > 0 || blockedRetryCallIdsInRound.size > 0) {
				if (toolCallsToExecute.length === 0) {
					if (validationIssues.length > 0) {
						consecutiveValidationIssueRounds += 1;
					}
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
					if (validationIssues.length === 0) {
						flushRepairInstructions();
						continue;
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
					if (toolLimitNotice) {
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
						validationRepairRounds += 1;
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
				validationRepairRounds += 1;
			} else {
				consecutiveValidationIssueRounds = 0;
			}

			const recordToolExecutionInOrder = async (
				originalToolCall: ChatToolCall,
				execution: FastToolExecution
			): Promise<void> => {
				const recorded = await recordToolExecutionForRound({
					originalToolCall,
					execution,
					toolExecutions,
					roundExecutions,
					gatewayModeActive: passGatewayModeActive,
					knownEntitiesById,
					rememberSuccessfulWriteForDedup,
					materializeDirectTools,
					observeSupervisor,
					onToolResult: params.onToolResult
				});
				toolCallsMade += recorded.handledToolCallDelta;
				roundModelPayloadChars += recorded.modelPayloadChars;
				messages.push(recorded.toolMessage);
				refreshTurnContract();
			};

			const isDispatchablePureReadPair = (pair: {
				original: ChatToolCall;
				executable: ChatToolCall;
			}): boolean => {
				const toolName = pair.executable.function.name;
				if (!getPassAllowedToolNames().has(toolName)) return false;
				if (!allowedToolNamesAtRoundStart.has(toolName)) return false;
				if (!isPureReadToolName(toolName)) return false;
				return !buildWrongEntityKindRepairResult({
					toolCall: pair.original,
					knownEntitiesById
				});
			};

			const canBatchPureReadPair = (pair: {
				original: ChatToolCall;
				executable: ChatToolCall;
			}): boolean => {
				if (!params.batchToolExecutor) return false;
				return isDispatchablePureReadPair(pair);
			};

			for (
				let executionIndex = 0;
				executionIndex < toolCallsToExecute.length;
				executionIndex += 1
			) {
				const pair = toolCallsToExecute[executionIndex];
				if (!pair) continue;
				const { original: originalToolCall, executable: toolCall } = pair;
				if (signal?.aborted) {
					throw new Error('Request aborted');
				}

				const canUseReservedWriteCall = Boolean(
					writeIntentToolPass &&
						reservedWriteToolCallsUsed < (writeIntentToolPass.reservedToolCalls ?? 0)
				);
				if (toolCallsMade >= maxToolCalls && !canUseReservedWriteCall) {
					markToolLimitReached('call');
					const skippedCalls = toolCallsToExecute
						.slice(executionIndex)
						.map(({ original }) => original);
					for (const skippedToolCall of skippedCalls) {
						const skippedResult = buildToolCallLimitSkippedResult(skippedToolCall);
						const skippedExecution: FastToolExecution = {
							toolCall: skippedToolCall,
							result: skippedResult
						};
						await recordToolExecutionInOrder(skippedToolCall, skippedExecution);
					}
					break;
				}
				if (toolCallsMade >= maxToolCalls && canUseReservedWriteCall) {
					reservedWriteToolCallsUsed += 1;
				}

				// WP-12 read memo: an identical pure read already executed this
				// turn is served from cache with a nudge — zero execution cost,
				// and the model learns it is looping.
				if (turnReadMemo.size > 0 && isDispatchablePureReadPair(pair)) {
					const memoKey = buildReadMemoKey(toolCall);
					const cachedReadResult = memoKey ? turnReadMemo.get(memoKey) : undefined;
					if (cachedReadResult) {
						if (dev) {
							console.info('[stream-orchestrator] read_memo_served', {
								toolName: toolCall.function.name,
								toolCallId: originalToolCall.id
							});
						}
						await recordToolExecutionInOrder(originalToolCall, {
							toolCall: originalToolCall,
							result: buildMemoServedResult(cachedReadResult, originalToolCall.id)
						});
						continue;
					}
				}

				if (params.batchToolExecutor && canBatchPureReadPair(pair)) {
					const batchPairs: Array<{
						original: ChatToolCall;
						executable: ChatToolCall;
					}> = [pair];
					const remainingBatchSlots = maxToolCalls - toolCallsMade;
					for (
						let lookaheadIndex = executionIndex + 1;
						lookaheadIndex < toolCallsToExecute.length &&
						batchPairs.length < remainingBatchSlots;
						lookaheadIndex += 1
					) {
						const candidate = toolCallsToExecute[lookaheadIndex];
						if (!candidate || !canBatchPureReadPair(candidate)) {
							break;
						}
						batchPairs.push(candidate);
					}

					if (batchPairs.length > 1) {
						const batchToolCalls = batchPairs.map(({ executable }) => executable);
						const clearBatchToolStatusTimers = batchPairs.map(({ original }) =>
							startLongRunningOperationHeartbeat('tool_execution', {
								toolName: original.function.name,
								toolCallId: original.id
							})
						);
						const batchStartedAt = Date.now();
						if (dev) {
							console.info('[stream-orchestrator] read_tool_batch_started', {
								count: batchPairs.length,
								toolNames: batchPairs.map(
									({ executable }) => executable.function.name
								)
							});
						}

						let batchResults: ChatToolResult[];
						try {
							toolCallsExecuted += batchPairs.length;
							batchResults = await params.batchToolExecutor(
								batchToolCalls,
								getPassTools()
							);
						} catch (error) {
							const message =
								error instanceof Error ? error.message : 'Tool execution failed';
							batchResults = batchPairs.map(({ original }) => ({
								tool_call_id: original.id,
								result: null,
								success: false,
								error: message
							}));
						} finally {
							for (const clearStatusTimer of clearBatchToolStatusTimers) {
								clearStatusTimer();
							}
						}

						if (dev) {
							console.info('[stream-orchestrator] read_tool_batch_completed', {
								count: batchPairs.length,
								durationMs: Date.now() - batchStartedAt,
								successCount: batchResults.filter((result) => result?.success)
									.length,
								failureCount: batchResults.filter((result) => !result?.success)
									.length
							});
						}

						for (let batchIndex = 0; batchIndex < batchPairs.length; batchIndex += 1) {
							const batchPair = batchPairs[batchIndex];
							if (!batchPair) continue;
							const batchResult = batchResults[batchIndex] ?? {
								tool_call_id: batchPair.original.id,
								result: null,
								success: false,
								error: `No result found for tool call ${batchPair.original.id}`
							};
							const normalizedResult =
								batchResult.tool_call_id === batchPair.original.id
									? batchResult
									: { ...batchResult, tool_call_id: batchPair.original.id };
							if (shouldMemoizeReadResult(normalizedResult)) {
								const memoKey = buildReadMemoKey(batchPair.executable);
								if (memoKey) turnReadMemo.set(memoKey, normalizedResult);
							}
							await recordToolExecutionInOrder(batchPair.original, {
								toolCall: batchPair.original,
								result: normalizedResult
							});
						}

						executionIndex += batchPairs.length - 1;
						continue;
					}
				}

				const dispatchResult = await executeToolCallPair({
					originalToolCall,
					toolCall,
					getTools: getPassTools,
					getAllowedToolNames: getPassAllowedToolNames,
					allowedToolNamesAtRoundStart,
					gatewayModeActive: passGatewayModeActive,
					validationProjectId,
					knownEntitiesById,
					toolExecutor: params.toolExecutor,
					materializeDirectTools,
					findDuplicateSuccessfulWrite,
					startToolExecutionHeartbeat: (details) =>
						startLongRunningOperationHeartbeat('tool_execution', details)
				});
				toolCallsExecuted += dispatchResult.executedToolCallDelta;
				if (
					isPureReadToolName(toolCall.function.name) &&
					shouldMemoizeReadResult(dispatchResult.execution.result)
				) {
					const memoKey = buildReadMemoKey(toolCall);
					if (memoKey) turnReadMemo.set(memoKey, dispatchResult.execution.result);
				} else if (didToolExecutionReachWriteExecutor(dispatchResult.execution)) {
					// A write (successful or not) may have changed what any read
					// returns — post-write re-reads must hit the source.
					turnReadMemo.clear();
				}
				await recordToolExecutionInOrder(originalToolCall, dispatchResult.execution);
			}

			flushMaterializationNotices();
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

			if (roundExecutions.some(doesToolExecutionRequireUserAction)) {
				messages.push({
					role: 'system',
					content:
						'Supervisor note: A tool returned requires_user_action. Do not call that tool again or perform additional writes in this turn. Explain the preview or blocker, ask for the required user decision, and wait for a later user turn.'
				});
				forceNoToolSynthesisPass = true;
				continue;
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

			// Project creation has a single legitimate write. Once it succeeds,
			// finish on a tool-free synthesis pass so the model cannot repeat the
			// creation call and transport recovery can safely retry the final text.
			if (
				normalizedContext === 'project_create' &&
				roundExecutions.some(
					(execution) =>
						execution.toolCall.function.name === 'create_onto_project' &&
						didGatewayExecSucceed(execution)
				)
			) {
				forceNoToolSynthesisPass = true;
			}

			const roundPattern = buildRoundToolPattern(pendingToolCalls);
			const roundReachedWriteExecutor = roundExecutions.some(
				didToolExecutionReachWriteExecutor
			);

			if (roundReachedWriteExecutor) {
				hasWriteAttempt = true;
				readOnlyRoundCount = 0;
				researchRoundCount = 0;
				researchPayloadChars = 0;
				lastReadOpSetKey = null;
				repeatedReadOpSetCount = 0;
				readLoopRepairRank = 0;
			} else if (roundPattern.readOps.length > 0 && roundPattern.researchOps.length === 0) {
				// Rounds that include web research ride the research budget below
				// instead of the stuck-read ladder — a mixed round (web_visit +
				// read_document_section to cross-reference) is making progress,
				// not looping.
				readOnlyRoundCount += 1;
				const readOpSetKey = roundPattern.readOps.join('|');
				if (readOpSetKey && readOpSetKey === lastReadOpSetKey) {
					repeatedReadOpSetCount += 1;
				} else if (readOpSetKey) {
					repeatedReadOpSetCount = 1;
					lastReadOpSetKey = readOpSetKey;
				}
			}
			if (!roundReachedWriteExecutor && roundPattern.researchOps.length > 0) {
				researchRoundCount += 1;
				researchPayloadChars += roundModelPayloadChars;
			}

			if (
				gatewayModeActive &&
				!hasWriteAttempt &&
				roundPattern.readOps.length > 0 &&
				roundPattern.researchOps.length === 0
			) {
				const ledgerObservation = contextGatheringLedger.observeToolRound({
					roundExecutions,
					roundPattern,
					roundReachedWriteExecutor,
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

			// Rounds with web research (pure or mixed with ontology reads) are
			// exempt from the read-loop escalation ladder — every web call
			// gathers new external evidence — but they wind down on their own
			// research budget: near the hard round cap, after 8 research rounds
			// (a healthy research turn finishes in 3-4; 8 marks a degenerate
			// loop such as re-fetching the same page), or once accumulated web
			// payloads reach 60k chars (~17k tokens of tool results).
			if (gatewayModeActive && !hasWriteAttempt && roundPattern.researchOps.length > 0) {
				const roundsRemaining = maxToolRounds - toolRounds;
				if (
					roundsRemaining <= 2 ||
					researchRoundCount >= 8 ||
					researchPayloadChars >= 60_000
				) {
					queueReadLoopRepairInstruction(
						'must_synthesize',
						roundPattern.researchOps,
						roundsRemaining,
						'research_budget'
					);
				}
			}

			if (
				gatewayModeActive &&
				!hasWriteAttempt &&
				roundPattern.readOps.length > 0 &&
				roundPattern.researchOps.length === 0 &&
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
			let recentRoundFingerprintCount = 0;
			if (roundFingerprint && roundFingerprint === lastRoundFingerprint) {
				consecutiveRoundFingerprintCount += 1;
			} else if (roundFingerprint) {
				consecutiveRoundFingerprintCount = 1;
				lastRoundFingerprint = roundFingerprint;
			}
			if (roundFingerprint) {
				recentRoundFingerprintWindow.push(roundFingerprint);
				while (recentRoundFingerprintWindow.length > roundFingerprintWindowSize) {
					recentRoundFingerprintWindow.shift();
				}
				recentRoundFingerprintCount = recentRoundFingerprintWindow.filter(
					(fingerprint) => fingerprint === roundFingerprint
				).length;
			}

			const windowedRoundRepetitionApplies =
				!gatewayModeActive ||
				(roundPattern.readOps.length === 0 && roundPattern.researchOps.length === 0);
			if (
				consecutiveRoundFingerprintCount >= repetitionLimit ||
				(windowedRoundRepetitionApplies && recentRoundFingerprintCount >= repetitionLimit)
			) {
				if (await attemptDocOrganizationRecovery()) {
					break;
				}
				markToolLimitReached('repetition');
				break;
			}
			if (gatewayModeActive && toolRounds >= maxToolRounds && !forceWriteIntentToolPass) {
				const researchCapturePass = buildResearchCaptureToolPass();
				if (researchCapturePass) {
					writeIntentCarveOutUsed = true;
					forceWriteIntentToolPass = researchCapturePass;
					queueRepairInstruction(researchCapturePass.instruction);
				} else {
					queueRepairInstruction(buildToolRoundBudgetSynthesisInstruction());
					forceNoToolSynthesisPass = true;
				}
			}
			flushRepairInstructions();

			if (toolLimitNotice) {
				break;
			}
		}
	} catch (error) {
		if (isUserCancellation()) {
			finishedReason = 'cancelled';
			const cancellationFinalization = await runCancellationFinalization({
				activePendingToolCallCount,
				activeAssistantBuffer,
				assistantText,
				finalAssistantText,
				emitAssistantRemainder
			});
			finalAssistantText = cancellationFinalization.finalAssistantText;
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
				finalContextUsage: liveContextUsage,
				skillGateViolationRepaired: skillGateStopRepairInjected,
				orchestrationInterventions: buildOrchestrationInterventions()
			};
		}
		// Terminal errors previously left the prompt dump without any runtime
		// metadata, so the failed traces from the 2026-07-31 gate had to be
		// reconstructed from console output. Dev-only, mirrors the normal return.
		if (dev) {
			appendRuntimeMetadataToPromptDump(promptDumpPath, {
				llmPasses: llmStreamPasses,
				finishedReason: 'error',
				toolRounds,
				toolCallsMade,
				toolExecutions
			});
		}
		throw error;
	}

	const terminalFinalization = await runTerminalFinalization({
		assistantText,
		finalAssistantText,
		finishedReason,
		toolLimitNotice,
		answerTruncated,
		latestUserText: message,
		mutationRequested,
		expectedWriteToolNames,
		synthesisTransportFailure: synthesisTransportRecovery !== undefined,
		toolExecutions,
		emitAssistantDelta,
		emitAssistantRemainder,
		observeSupervisor
	});
	finalAssistantText = terminalFinalization.finalAssistantText;
	finishedReason = terminalFinalization.finishedReason;
	finalizationGuardResult =
		terminalFinalization.finalizationGuardResult ?? finalizationGuardResult;

	let completionOutcome: FastChatCompletionOutcome = {
		status: 'completed',
		answerSource: 'model'
	};
	if (synthesisTransportRecovery) {
		if (finalAssistantText.trim()) {
			// A recovered partial from a mutation-requested turn must not read as
			// a completed write: no write executed in the failed pass (the
			// recovery predicate guarantees it), so any success claim in the
			// partial is rewritten and the unfulfilled intent is disclosed.
			finalAssistantText = enforceMutationOutcomeIntegrity(finalAssistantText, {
				contextType: normalizedContext,
				toolExecutions,
				latestUserText: message,
				explicitMutationRequested: mutationRequested,
				expectedWriteToolNames
			});
		}
		if (!finalAssistantText.trim()) {
			finalAssistantText =
				'The response stalled before I could produce an answer, and I did not collect usable evidence for this request. Please retry.';
			await emitAssistantRemainder(finalAssistantText);
			finishedReason = 'synthesis_empty';
		} else if (finalAssistantText !== assistantText.trim()) {
			await emitAssistantRemainder(finalAssistantText);
		}

		const answerSource: FastChatCompletionOutcome['answerSource'] =
			finalizationGuardResult?.applied === true
				? finalizationGuardResult.finishedReason === 'synthesis_empty'
					? 'precise_no_evidence'
					: 'deterministic_evidence'
				: finalAssistantText.trim()
					? 'partial_model'
					: 'precise_no_evidence';
		completionOutcome = {
			status: 'completed_degraded',
			answerSource,
			recovery: synthesisTransportRecovery
		};
		finishedReason = finishedReason ?? 'synthesis_recovered';
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
		finalContextUsage: liveContextUsage,
		skillGateViolationRepaired: skillGateStopRepairInjected,
		completionOutcome,
		turnContract,
		turnContractResolution: resolveTurnContractOutcome({
			contract: turnContract,
			toolExecutions,
			finishedReason
		}),
		orchestrationInterventions: buildOrchestrationInterventions()
	};
}

function buildRecoveredSynthesisPassMetadata(params: {
	error: LlmStreamPassTerminalError;
	modelRouting: FastChatPassModelRouting;
}): LLMStreamPassMetadata {
	const { error, modelRouting } = params;
	const measurements = error.measurements;
	return {
		pass: measurements.pass,
		passRole: measurements.passRole ?? modelRouting.passRole,
		requestedProfile: modelRouting.profile,
		...(modelRouting.models?.length ? { requestedModels: [...modelRouting.models] } : {}),
		...(modelRouting.modelTieringVariant
			? { modelTieringVariant: modelRouting.modelTieringVariant }
			: {}),
		...(modelRouting.forcedSynthesisRoutingVariant
			? { forcedSynthesisRoutingVariant: modelRouting.forcedSynthesisRoutingVariant }
			: {}),
		...(modelRouting.ignoredProviderSlugs?.length
			? { ignoredProviderSlugs: [...modelRouting.ignoredProviderSlugs] }
			: {}),
		...(modelRouting.maxTokens !== undefined ? { maxTokens: modelRouting.maxTokens } : {}),
		...(modelRouting.retryModelRotation === true ? { retryModelRotation: true } : {}),
		...(measurements.attemptRoutes?.length
			? {
					attemptRoutes: measurements.attemptRoutes.map((route) => ({
						...route,
						...(route.models ? { models: [...route.models] } : {}),
						...(route.ignoredProviderSlugs
							? { ignoredProviderSlugs: [...route.ignoredProviderSlugs] }
							: {})
					}))
				}
			: {}),
		forcedNoToolSynthesis: measurements.forcedNoToolSynthesis,
		attempts: measurements.attempts,
		streamRetryCount: measurements.retryCount,
		lastStreamRetryError: measurements.lastErrorMessage,
		startedAtMs: Math.max(0, Date.now() - measurements.durationMs),
		durationMs: measurements.durationMs,
		terminalOutcome: error.outcome,
		terminalEventReceived: measurements.terminalEventReceived,
		assistantTextCharsReceived: measurements.assistantTextCharsReceived,
		reasoningCharsReceived: measurements.reasoningCharsReceived,
		toolCallsReceived: measurements.toolCallsReceived,
		attemptsExhausted: measurements.attemptsExhausted,
		recoveredAsDegradedCompletion: true
	};
}

function isUsableSynthesisPartial(text: string): boolean {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (normalized.length < 20) return false;
	return normalized.split(' ').filter(Boolean).length >= 3;
}

/**
 * A tool-enabled pass can contain the complete user-facing answer even when a
 * provider never sends its terminal `done` event. Recover that text only for a
 * read-only turn after evidence has already been loaded (checked by the caller),
 * and keep the threshold well above a disposable lead-in such as “Let me check”.
 */
function isUsableReadOnlyTransportPartial(text: string): boolean {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (normalized.length < 120) return false;
	return normalized.split(' ').filter(Boolean).length >= 18;
}

function isDestructiveWriteOperation(operation: string): boolean {
	const normalized = operation.trim().toLowerCase();
	return (
		normalized.startsWith('delete_') ||
		normalized.startsWith('unlink_') ||
		normalized.endsWith('.delete') ||
		normalized.endsWith('.unlink')
	);
}

function buildWriteDedupKey(toolCall: ChatToolCall): string | null {
	const toolName = toolCall.function?.name?.trim() ?? '';
	if (!toolName) return null;

	const registryOp = getToolRegistry().byToolName[toolName]?.op;
	const normalizedName = normalizeGatewayOpName(toolName);
	const op = registryOp ?? normalizedName;
	if (!isWriteLikeOperation(op)) return null;

	const { args } = parseToolArguments(toolCall.function?.arguments);
	return `${op}|${stableStringifyForDedup(args)}`;
}

function buildToolCallLimitSkippedResult(toolCall: ChatToolCall): ChatToolResult {
	const message =
		'Tool call skipped because the turn reached the tool-call safety limit before this call could run.';
	return {
		tool_call_id: toolCall.id,
		success: false,
		result: {
			ok: false,
			status: 'tool_call_limit_skipped',
			error: message
		},
		error: message
	};
}

function stableStringifyForDedup(value: unknown): string {
	if (value === undefined) return 'undefined';
	if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? String(value);
	if (Array.isArray(value)) {
		return `[${value.map((item) => stableStringifyForDedup(item)).join(',')}]`;
	}

	const record = value as Record<string, unknown>;
	return `{${Object.keys(record)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableStringifyForDedup(record[key])}`)
		.join(',')}}`;
}
