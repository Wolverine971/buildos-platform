// apps/web/src/lib/components/agent/agent-chat-sse-handler.ts
//
// SSE event handler for AgentChatModal.
// Extracts ~350 LOC of switch/case logic out of the modal into a factory
// that takes state getters/setters + helpers as deps. Pure sub-helpers
// (state-display text, clarifying-question count, tool-call activity
// builder, tool-result metadata) are exported for standalone testing.
//
// See: apps/web/docs/features/agentic-chat/PROPOSAL_2026-04-18_GOD-COMPONENT-DECOMPOSITION.md
//
// Usage:
//   const handleSSEMessage = createSSEHandler({ presenter, thinking, state, … });
//   handleSSEMessage(event);

import type {
	AgentSSEMessage,
	AgentTimingSummary,
	ChatContextType,
	ChatSession,
	ContextShiftPayload,
	ContextUsageSnapshot,
	SkillActivityEvent
} from '@buildos/shared-types';
import type { LastTurnContext, ProjectFocus } from '$lib/types/agent-chat-enhancement';
import type {
	ActivityEntry,
	ActivityType,
	AgentLoopState,
	ThinkingBlockMessage,
	UIMessage
} from './agent-chat.types';
import type { OntologyEntityKind, ToolPresenter } from './agent-chat-tool-presenter';
import { CONTEXT_DESCRIPTORS } from './agent-chat.constants';
import { buildProjectWideFocus, isProjectContext } from './agent-chat-session';
import { buildSkillLoadActivityEvent } from './agent-chat-skill-activity';
import { deriveContextOverheadTokens } from './agent-chat-formatters';

// ---------------------------------------------------------------------------
// Pure helpers — testable standalone
// ---------------------------------------------------------------------------

/** Compute the user-visible `currentActivity` label for an `agent_state` event. */
export function computeAgentStateActivity(state: AgentLoopState, details?: string): string {
	switch (state) {
		case 'waiting_on_user':
			return 'Waiting on your direction...';
		case 'thinking':
		default:
			return details ?? 'Analyzing request...';
	}
}

/** Count valid clarifying questions (trimmed non-empty strings) in a payload. */
export function computeClarifyingQuestionsCount(questions: unknown): number {
	if (!Array.isArray(questions)) return 0;
	return questions.filter(
		(question: unknown) => typeof question === 'string' && question.trim().length > 0
	).length;
}

/** Normalize the `new_context` field from a context-shift payload. Treats 'general' as 'global'. */
export function normalizeContextShiftContext(
	newContext: ContextShiftPayload['new_context']
): ChatContextType {
	return (newContext === 'general' ? 'global' : newContext) as ChatContextType;
}

export interface ToolCallActivityBuildResult {
	/** Null if the tool_call is hidden and should not produce a visible activity. */
	activity: ActivityEntry | null;
	hidden: boolean;
	toolCallId: string | undefined;
}

/**
 * Build an `ActivityEntry` from a `tool_call` SSE event.
 * Delegates display formatting and tool-name normalization to the presenter.
 */
export function buildToolCallActivity(
	event: Extract<AgentSSEMessage, { type: 'tool_call' }>,
	presenter: ToolPresenter
): ToolCallActivityBuildResult {
	const rawToolName = event.tool_call?.function?.name || 'unknown';
	const toolCallId = event.tool_call?.id;
	const args = event.tool_call?.function?.arguments || '';
	const displayPayload = presenter.normalizeToolDisplayPayload(rawToolName, args);

	if (displayPayload.hidden) {
		return { activity: null, hidden: true, toolCallId };
	}

	const displayMessage = presenter.formatToolMessage(
		displayPayload.toolName,
		displayPayload.args,
		'pending'
	);
	const skillActivity =
		displayPayload.toolName === 'skill_load'
			? buildSkillLoadActivityEvent('requested', displayPayload.args)
			: null;

	const activity: ActivityEntry = {
		id: crypto.randomUUID(),
		content: displayMessage,
		timestamp: new Date(),
		activityType: 'tool_call',
		status: 'pending',
		toolCallId,
		metadata: {
			toolName: displayPayload.toolName,
			originalToolName: displayPayload.originalToolName,
			gatewayOp: displayPayload.gatewayOp,
			toolCallId,
			arguments: displayPayload.args,
			rawArguments: args,
			status: 'pending',
			toolCall: event.tool_call,
			...(skillActivity
				? {
						skillActivity,
						skillPath: skillActivity.path,
						skillVia: skillActivity.via,
						skillAction: skillActivity.action
					}
				: {})
		}
	};

	return { activity, hidden: false, toolCallId };
}

export interface ToolResultInfo {
	resultToolCallId: string | undefined;
	rawResultToolName: string | undefined;
	success: boolean;
	toolError: unknown;
	toolErrorMessage: string | undefined;
}

/** Extract the routing metadata from a tool_result payload. */
export function computeToolResultInfo(
	toolResult: Record<string, any> | undefined,
	presenter: ToolPresenter
): ToolResultInfo {
	const resultToolCallId = toolResult?.toolCallId ?? toolResult?.tool_call_id;
	const rawResultToolName =
		(typeof toolResult?.toolName === 'string' && toolResult.toolName) ||
		(typeof toolResult?.tool_name === 'string' && toolResult.tool_name) ||
		undefined;
	const success = toolResult?.success ?? true;
	const toolError = toolResult?.error;
	const toolErrorMessage = success ? undefined : presenter.formatErrorMessage(toolError);
	return { resultToolCallId, rawResultToolName, success, toolError, toolErrorMessage };
}

// ---------------------------------------------------------------------------
// Handler factory
// ---------------------------------------------------------------------------

export interface ActivityUpdateResult {
	matched: boolean;
	toolName?: string;
	args?: string | Record<string, unknown>;
}

export interface PendingToolStatus {
	status: 'completed' | 'failed';
	errorMessage?: string;
}

/** Thinking block manipulation surface the handler needs. */
export interface ThinkingBlockDeps {
	ensure(): string;
	update(
		blockId: string | null,
		updater: (block: ThinkingBlockMessage) => ThinkingBlockMessage | null | undefined
	): void;
	addActivity(
		content: string,
		activityType: ActivityType,
		metadata?: Record<string, any>,
		status?: ActivityEntry['status']
	): void;
	updateState(state: AgentLoopState, details?: string): void;
	upsertSkillActivity(event: SkillActivityEvent): void;
	upsertOperationActivity(
		operation: Record<string, unknown>,
		format: { message: string; activityStatus: ActivityEntry['status'] }
	): void;
	updateActivityStatus(
		toolCallId: string,
		status: 'completed' | 'failed',
		errorMessage?: string
	): ActivityUpdateResult;
	finalize(status?: 'completed' | 'interrupted' | 'cancelled' | 'error', note?: string): void;
	getCurrentBlockId(): string | null;
}

/** Reactive modal state that the handler reads from and writes to. */
export interface ModalStateDeps {
	// Reads
	getMessages(): UIMessage[];
	getInputValue(): string;
	getCurrentSession(): ChatSession | null;
	getSelectedContextLabel(): string | null;
	getActiveStreamRunId(): number;
	isAgentToAgentMode(): boolean;
	getAgentLoopActive(): boolean;
	getAgentTurnsRemaining(): number;

	// Writes
	setContextUsage(usage: ContextUsageSnapshot | null, overheadTokens: number): void;
	setLastTurnContext(ctx: LastTurnContext | null): void;
	setProjectFocus(focus: ProjectFocus | null): void;
	setCurrentActivity(label: string): void;
	setIsStreaming(value: boolean): void;
	setError(message: string | null): void;
	setSelectedContext(params: {
		contextType: ChatContextType;
		entityId: string | undefined;
		label: string | null;
	}): void;
	setShowFocusSelector(value: boolean): void;
	setShowProjectActionSelector(value: boolean): void;
	setCurrentSession(session: ChatSession | null): void;
	setAgentLoopActive(value: boolean): void;
	setAgentTurnsRemaining(value: number): void;
}

export interface SSEHandlerDeps {
	presenter: ToolPresenter;
	thinking: ThinkingBlockDeps;
	state: ModalStateDeps;

	// Session + timing
	hydrateSessionFromEvent(session: ChatSession): void;
	attachServerTiming(runId: number, timing: AgentTimingSummary): void;

	// Assistant text streaming
	bufferAssistantText(content: unknown): void;
	flushAssistantText(): void;
	finalizeAssistantMessage(): void;

	// Pending tool state (mutable, owned by caller)
	hiddenToolCallIds: Set<string>;
	pendingToolResults: Map<string, PendingToolStatus>;

	// Clarifications
	addClarifyingQuestionsMessage(questions: unknown): void;

	// Focus logging
	logFocusActivity(action: string, focus: ProjectFocus | null): void;

	isDev?: boolean;
}

export function createSSEHandler(deps: SSEHandlerDeps): (event: AgentSSEMessage) => void {
	const { presenter, thinking, state } = deps;
	const isDev = deps.isDev ?? false;

	function handleContextShift(shift: ContextShiftPayload): void {
		const normalizedContext = normalizeContextShiftContext(shift.new_context);
		const existingLabel = state.getSelectedContextLabel();
		const nextLabel =
			shift.entity_name ?? CONTEXT_DESCRIPTORS[normalizedContext]?.title ?? existingLabel;

		state.setSelectedContext({
			contextType: normalizedContext,
			entityId: shift.entity_id ?? undefined,
			label: nextLabel
		});

		if (shift.entity_id && shift.entity_name && shift.entity_type !== 'workspace') {
			presenter.cacheEntityName(
				(shift.entity_type as OntologyEntityKind) ??
					(isProjectContext(normalizedContext) ? 'project' : 'entity'),
				shift.entity_id,
				shift.entity_name
			);
		}

		if (isProjectContext(normalizedContext) && shift.entity_id) {
			state.setProjectFocus(
				buildProjectWideFocus(shift.entity_id, shift.entity_name ?? nextLabel)
			);
		} else {
			state.setProjectFocus(null);
			state.setShowFocusSelector(false);
		}
		state.setShowProjectActionSelector(false);

		const currentSession = state.getCurrentSession();
		if (currentSession) {
			state.setCurrentSession({
				...currentSession,
				context_type: normalizedContext,
				entity_id: shift.entity_id ?? null
			});
		}

		const activityMessage =
			shift.message ?? `Context updated to ${nextLabel ?? normalizedContext}`;
		thinking.addActivity(activityMessage, 'context_shift', { contextShift: shift });
	}

	function handleToolCall(event: Extract<AgentSSEMessage, { type: 'tool_call' }>): void {
		const result = buildToolCallActivity(event, presenter);

		if (result.hidden) {
			if (result.toolCallId) {
				deps.hiddenToolCallIds.add(result.toolCallId);
			}
			return;
		}

		if (isDev) {
			const rawToolName = event.tool_call?.function?.name || 'unknown';
			const rawArgs = event.tool_call?.function?.arguments || '';
			// eslint-disable-next-line no-console
			console.log('[AgentChat] Tool call:', {
				toolName: rawToolName,
				toolCallId: result.toolCallId,
				args:
					typeof rawArgs === 'string'
						? rawArgs.substring(0, 100)
						: JSON.stringify(rawArgs).slice(0, 100)
			});
		}

		if (!result.activity) return;

		const blockId = thinking.ensure();
		thinking.update(blockId, (block) => ({
			...block,
			activities: [...block.activities, result.activity!]
		}));

		if (result.toolCallId && deps.pendingToolResults.has(result.toolCallId)) {
			const pendingStatus = deps.pendingToolResults.get(result.toolCallId);
			if (pendingStatus) {
				thinking.updateActivityStatus(
					result.toolCallId,
					pendingStatus.status,
					pendingStatus.errorMessage
				);
			}
			deps.pendingToolResults.delete(result.toolCallId);
		}
	}

	function handleToolResult(event: Extract<AgentSSEMessage, { type: 'tool_result' }>): void {
		const toolResult = event.result;
		const info = computeToolResultInfo(toolResult, presenter);

		if (isDev) {
			// eslint-disable-next-line no-console
			console.log('[AgentChat] Tool result:', {
				resultToolCallId: info.resultToolCallId,
				success: info.success,
				hasError: !!info.toolError
			});
		}

		presenter.indexEntitiesFromToolResult(toolResult);

		if (info.resultToolCallId && deps.hiddenToolCallIds.has(info.resultToolCallId)) {
			deps.hiddenToolCallIds.delete(info.resultToolCallId);
			deps.pendingToolResults.delete(info.resultToolCallId);
			return;
		}

		let resolvedToolName: string | undefined;
		let resolvedArgs: string | Record<string, unknown> | undefined;

		if (info.resultToolCallId) {
			const result = thinking.updateActivityStatus(
				info.resultToolCallId,
				info.success ? 'completed' : 'failed',
				info.toolErrorMessage
			);

			if (!result.matched) {
				deps.pendingToolResults.set(info.resultToolCallId, {
					status: info.success ? 'completed' : 'failed',
					errorMessage: info.toolErrorMessage
				});
			} else if (result.toolName && result.args !== undefined) {
				presenter.showToolResultToast(result.toolName, result.args, info.success);
				resolvedToolName = result.toolName;
				resolvedArgs = result.args;
			}
			resolvedToolName = resolvedToolName ?? info.rawResultToolName;
		} else {
			if (isDev) {
				// eslint-disable-next-line no-console
				console.warn('[AgentChat] Tool result without matching tool_call_id:', event);
			}
			resolvedToolName = info.rawResultToolName;
		}

		presenter.recordDataMutation(resolvedToolName, resolvedArgs, info.success, toolResult);
	}

	function handleDone(): void {
		state.setCurrentActivity('');
		deps.finalizeAssistantMessage();
		thinking.finalize();
		// Note: isStreaming is also set to false by onComplete; this is for immediate UI response
		state.setIsStreaming(false);
		if (state.isAgentToAgentMode() && state.getAgentLoopActive()) {
			const remaining = state.getAgentTurnsRemaining();
			if (remaining > 0) {
				state.setAgentTurnsRemaining(Math.max(0, remaining - 1));
			}
			if (state.getAgentTurnsRemaining() <= 0) {
				state.setAgentLoopActive(false);
				state.setCurrentActivity('Turn limit reached');
			}
		}
	}

	function handleError(event: Extract<AgentSSEMessage, { type: 'error' }>): void {
		const streamErrorMessage = event.error || 'An error occurred';
		state.setError(streamErrorMessage);
		state.setIsStreaming(false);
		state.setCurrentActivity('');
		if (thinking.getCurrentBlockId()) {
			thinking.addActivity(
				streamErrorMessage,
				'general',
				{ error: streamErrorMessage },
				'failed'
			);
			thinking.finalize('error');
		}
	}

	return function handleSSEMessage(event: AgentSSEMessage): void {
		if (event.type !== 'text' && event.type !== 'text_delta') {
			deps.flushAssistantText();
		}

		switch (event.type) {
			case 'session':
				if (event.session) {
					deps.hydrateSessionFromEvent(event.session);
				}
				return;

			case 'context_usage': {
				const usage = event.usage ?? null;
				if (!usage) {
					state.setContextUsage(null, 0);
					return;
				}
				const overheadTokens = deriveContextOverheadTokens({
					serverSnapshot: usage,
					messages: state.getMessages(),
					draft: state.getInputValue()
				});
				state.setContextUsage(usage, overheadTokens);
				return;
			}

			case 'timing':
				deps.attachServerTiming(state.getActiveStreamRunId(), event.timing);
				return;

			case 'last_turn_context':
				state.setLastTurnContext(event.context);
				if (isDev) {
					// eslint-disable-next-line no-console
					console.debug('[AgentChat] Stored last turn context:', event.context);
				}
				return;

			case 'focus_active':
				state.setProjectFocus(event.focus);
				return;

			case 'focus_changed':
				state.setProjectFocus(event.focus);
				deps.logFocusActivity('Focus changed', event.focus);
				return;

			case 'agent_state': {
				const agentState = event.state as AgentLoopState;
				thinking.updateState(agentState, event.details);
				if (event.details) {
					thinking.addActivity(event.details, 'state_change', {
						state: agentState,
						details: event.details
					});
				}
				state.setCurrentActivity(computeAgentStateActivity(agentState, event.details));
				return;
			}

			case 'clarifying_questions': {
				deps.addClarifyingQuestionsMessage(event.questions);
				const questionCount = computeClarifyingQuestionsCount(event.questions);
				if (questionCount > 0) {
					thinking.addActivity(
						`Clarifying questions requested (${questionCount})`,
						'clarification',
						{ questionCount, questions: event.questions }
					);
					state.setCurrentActivity('Waiting on your clarifications to continue...');
					thinking.updateState(
						'waiting_on_user',
						'Waiting on your clarifications to continue...'
					);
				}
				return;
			}

			case 'text_delta':
			case 'text':
				if (event.content) {
					deps.bufferAssistantText(event.content);
				}
				return;

			case 'tool_call':
				handleToolCall(event);
				return;

			case 'tool_result':
				handleToolResult(event);
				return;

			case 'skill_activity':
				thinking.upsertSkillActivity(event);
				return;

			case 'operation': {
				const operationPayload =
					'operation' in event && (event as any).operation
						? (event as any).operation
						: event;
				const format = presenter.formatOperationEvent(
					operationPayload as Record<string, any>
				);
				thinking.upsertOperationActivity(
					operationPayload as Record<string, unknown>,
					format
				);
				return;
			}

			case 'context_shift':
				if (event.context_shift) {
					handleContextShift(event.context_shift);
				}
				return;

			case 'done':
				handleDone();
				return;

			case 'error':
				handleError(event);
				return;

			default:
				// Unhandled/legacy event types — silently ignore.
				return;
		}
	};
}
