// apps/web/src/lib/services/admin/chat-session-audit-conversation.ts
import {
	firstNonEmptyString,
	payloadField,
	recordFromUnknown,
	stringValue,
	toNumericValue
} from './chat-session-audit-payload';
import { compareTimelineEvents, isSupervisorTimelineEvent } from './chat-session-audit-timeline';
import {
	isToolCallEmittedEvent,
	isToolDetailTurnEvent,
	isTraceToolPayload,
	toolDisplayArguments,
	toolDisplayDuration,
	toolDisplayError,
	toolDisplayName,
	toolDisplayResult,
	toolDisplaySuccess,
	toolLifecycleDisplayState
} from './chat-session-audit-tool-lifecycle';
import type {
	AuditTimelineEvent,
	ChatSessionAuditPayload,
	ConversationMessage,
	ConversationMessageRole,
	ConversationToolCall,
	ConversationTurn,
	SessionTurnRun,
	ToolLifecycleDisplayState
} from './chat-session-audit-types';

export function normalizeConversationRole(value: unknown): ConversationMessageRole {
	const role = stringValue(value).toLowerCase();
	if (role === 'user') return 'user';
	if (role === 'assistant') return 'assistant';
	if (role === 'tool') return 'tool';
	if (role === 'system') return 'system';
	return 'other';
}

export function conversationRoleLabel(role: ConversationMessageRole): string {
	switch (role) {
		case 'user':
			return 'You';
		case 'assistant':
			return 'BuildOS';
		case 'tool':
			return 'Tool';
		case 'system':
			return 'System';
		default:
			return 'Message';
	}
}

function messageCreatedAt(message: Record<string, unknown>, fallback: string): string {
	return stringValue(payloadField(message, 'created_at')) || fallback;
}

export function buildConversationMessage(params: {
	message: Record<string, unknown>;
	turnIndex: number | null;
	fallbackTimestamp: string;
}): ConversationMessage {
	const role = normalizeConversationRole(payloadField(params.message, 'role'));
	const id =
		stringValue(payloadField(params.message, 'id')) ||
		`message:${role}:${params.turnIndex ?? 'standalone'}:${messageCreatedAt(
			params.message,
			params.fallbackTimestamp
		)}`;
	return {
		id,
		role,
		roleLabel: conversationRoleLabel(role),
		content: stringValue(payloadField(params.message, 'content')),
		timestamp: messageCreatedAt(params.message, params.fallbackTimestamp),
		turnIndex: params.turnIndex,
		totalTokens: toNumericValue(payloadField(params.message, 'total_tokens')) ?? 0,
		errorMessage: stringValue(payloadField(params.message, 'error_message'))
	};
}

function messageSortValue(message: Record<string, unknown>, fallback: string): string {
	return messageCreatedAt(message, fallback) || fallback;
}

function timelineMessageId(event: AuditTimelineEvent): string {
	return stringValue(payloadField(event.payload ?? {}, 'id'));
}

function createConversationTurn(
	turnIndex: number | null,
	run: SessionTurnRun | null,
	fallbackTimestamp: string
): ConversationTurn {
	return {
		id: turnIndex === null ? 'standalone' : `turn:${turnIndex}`,
		turnIndex,
		run,
		userMessages: [],
		assistantMessages: [],
		otherMessages: [],
		toolCalls: [],
		llmCalls: [],
		promptSnapshots: [],
		operations: [],
		evalRuns: [],
		supervisorEvents: [],
		auditEvents: [],
		startedAt: run?.started_at ?? fallbackTimestamp,
		finishedAt: run?.finished_at ?? null,
		status: run?.status ?? 'recorded',
		errors: 0
	};
}

function addMessageToConversationTurn(turn: ConversationTurn, message: ConversationMessage): void {
	if (message.role === 'user') {
		turn.userMessages.push(message);
		return;
	}
	if (message.role === 'assistant') {
		turn.assistantMessages.push(message);
		return;
	}
	turn.otherMessages.push(message);
}

function assignAuditEventToConversationTurn(
	turn: ConversationTurn,
	event: AuditTimelineEvent
): void {
	turn.auditEvents.push(event);
	if (event.severity === 'error') {
		turn.errors += 1;
	}
	if (isSupervisorTimelineEvent(event)) {
		turn.supervisorEvents.push(event);
	}
	switch (event.type) {
		case 'llm_call':
			turn.llmCalls.push(event);
			break;
		case 'prompt_snapshot':
			turn.promptSnapshots.push(event);
			break;
		case 'operation':
			turn.operations.push(event);
			break;
		case 'eval_run':
			turn.evalRuns.push(event);
			break;
	}
}

function linkedToolExecutionFromPayload(
	payload: Record<string, unknown>
): Record<string, unknown> | null {
	return recordFromUnknown(payloadField(payload, 'linked_tool_execution'));
}

function linkedToolMessageFromPayload(
	payload: Record<string, unknown>
): Record<string, unknown> | null {
	return recordFromUnknown(payloadField(payload, 'linked_tool_message'));
}

function toolMetadataFromPayload(params: {
	event: AuditTimelineEvent;
	lifecycleState: ToolLifecycleDisplayState;
	payload: Record<string, unknown>;
	linkedToolExecution: Record<string, unknown> | null;
	linkedToolMessage: Record<string, unknown> | null;
}): Record<string, unknown> {
	const { event, lifecycleState, payload, linkedToolExecution, linkedToolMessage } = params;
	const toolExecutionId =
		stringValue(payloadField(linkedToolExecution ?? {}, 'id')) ||
		(event.type === 'tool_execution' ? stringValue(payloadField(payload, 'id')) : '');

	return {
		event_id: event.id,
		outcome_event_id: lifecycleState.outcomeEvent?.id ?? null,
		tool_call_id: stringValue(payloadField(payload, 'tool_call_id')) || null,
		tool_execution_id: toolExecutionId || null,
		tool_message_id:
			stringValue(payloadField(linkedToolMessage ?? {}, 'id')) ||
			stringValue(payloadField(payload, 'tool_message_id')) ||
			null,
		turn_run_id: firstNonEmptyString(
			payloadField(payload, 'turn_run_id'),
			payloadField(linkedToolExecution ?? {}, 'turn_run_id')
		),
		stream_run_id: firstNonEmptyString(
			payloadField(payload, 'stream_run_id'),
			payloadField(linkedToolExecution ?? {}, 'stream_run_id')
		),
		client_turn_id: firstNonEmptyString(
			payloadField(payload, 'client_turn_id'),
			payloadField(linkedToolExecution ?? {}, 'client_turn_id')
		),
		sequence_index:
			toNumericValue(payloadField(payload, 'sequence_index')) ??
			toNumericValue(payloadField(payload, 'emitted_sequence_index')) ??
			toNumericValue(payloadField(linkedToolExecution ?? {}, 'sequence_index')),
		outcome_sequence_index: toNumericValue(payloadField(payload, 'outcome_sequence_index')),
		tool_category: firstNonEmptyString(
			payloadField(payload, 'tool_category'),
			payloadField(linkedToolExecution ?? {}, 'tool_category')
		),
		canonical_op: firstNonEmptyString(
			payloadField(payload, 'canonical_op'),
			payloadField(linkedToolExecution ?? {}, 'gateway_op')
		),
		help_path: firstNonEmptyString(
			payloadField(payload, 'help_path'),
			payloadField(linkedToolExecution ?? {}, 'help_path')
		),
		gateway_op: firstNonEmptyString(
			payloadField(payload, 'gateway_op'),
			payloadField(linkedToolExecution ?? {}, 'gateway_op')
		),
		tool_result_source: stringValue(payloadField(payload, 'tool_result_source')) || null,
		emitted_at: stringValue(payloadField(payload, 'emitted_at')) || null,
		outcome_at: stringValue(payloadField(payload, 'outcome_at')) || null
	};
}

function sourceLabelForToolEvent(
	event: AuditTimelineEvent,
	payload: Record<string, unknown>,
	isMergedToolLifecycle: boolean
): string {
	if (isMergedToolLifecycle) return 'Streamed tool lifecycle';
	if (event.type === 'tool_execution') {
		return isTraceToolPayload(payload) ? 'Assistant tool trace' : 'Tool execution row';
	}
	return 'Turn event';
}

function toolStatusLabel(success: boolean | null, outcomeEvent: AuditTimelineEvent | null): string {
	if (success === true) return 'completed';
	if (success === false) return 'failed';
	if (outcomeEvent) return 'returned';
	return 'pending';
}

function toolQualityRank(sourceLabel: string): number {
	if (sourceLabel === 'Streamed tool lifecycle') return 4;
	if (sourceLabel === 'Turn event') return 3;
	if (sourceLabel === 'Tool execution row') return 2;
	return 1;
}

export function conversationToolCallFromEvent(
	events: AuditTimelineEvent[],
	eventIndex: number
): ConversationToolCall | null {
	const event = events[eventIndex];
	if (!event) return null;
	const lifecycleState = toolLifecycleDisplayState(events, eventIndex);
	if (lifecycleState.hideEvent) return null;

	const isMergedToolLifecycle = isToolCallEmittedEvent(event) && !!lifecycleState.outcomeEvent;
	const isStandaloneToolTurnEvent = isToolDetailTurnEvent(event) && !isMergedToolLifecycle;
	const isToolDisplay =
		event.type === 'tool_execution' || isMergedToolLifecycle || isStandaloneToolTurnEvent;
	if (!isToolDisplay) return null;

	const payload = lifecycleState.displayPayload;
	const linkedToolExecution = linkedToolExecutionFromPayload(payload);
	const linkedToolMessage = linkedToolMessageFromPayload(payload);
	const success = toolDisplaySuccess(payload);
	const sourceLabel = sourceLabelForToolEvent(event, payload, isMergedToolLifecycle);
	const metadata = toolMetadataFromPayload({
		event,
		lifecycleState,
		payload,
		linkedToolExecution,
		linkedToolMessage
	});
	const toolCallId = stringValue(payloadField(payload, 'tool_call_id'));
	const toolExecutionId = stringValue(payloadField(metadata, 'tool_execution_id'));
	const canonicalOp = firstNonEmptyString(
		payloadField(payload, 'canonical_op'),
		payloadField(payload, 'gateway_op'),
		payloadField(linkedToolExecution ?? {}, 'gateway_op')
	);

	return {
		id: toolCallId || toolExecutionId || lifecycleState.displayEventId,
		toolName: toolDisplayName(payload),
		title: lifecycleState.displayTitle,
		summary: lifecycleState.displaySummary,
		statusLabel: toolStatusLabel(success, lifecycleState.outcomeEvent),
		success,
		severity: lifecycleState.displaySeverity,
		sourceLabel,
		timestamp:
			stringValue(payloadField(payload, 'emitted_at')) ||
			lifecycleState.displayTimestamp ||
			event.timestamp,
		completedAt:
			stringValue(payloadField(payload, 'outcome_at')) ||
			stringValue(payloadField(linkedToolExecution ?? {}, 'created_at')) ||
			null,
		duration: toolDisplayDuration(payload),
		toolCallId,
		canonicalOp,
		resultSource: stringValue(payloadField(payload, 'tool_result_source')),
		arguments: toolDisplayArguments(payload),
		result: toolDisplayResult(payload),
		error: toolDisplayError(payload),
		metadata,
		linkedToolExecution,
		linkedToolMessage,
		rawPayload: lifecycleState.displayRawPayload,
		qualityRank: toolQualityRank(sourceLabel)
	};
}

function toolDedupKey(tool: ConversationToolCall): string {
	return (
		tool.toolCallId ||
		stringValue(payloadField(tool.metadata, 'tool_execution_id')) ||
		`${tool.toolName}:${payloadField(tool.metadata, 'sequence_index') ?? ''}:${tool.timestamp}`
	);
}

export function buildConversationToolCalls(events: AuditTimelineEvent[]): ConversationToolCall[] {
	const byKey = new Map<string, ConversationToolCall>();
	events.forEach((_event, eventIndex) => {
		const tool = conversationToolCallFromEvent(events, eventIndex);
		if (!tool) return;
		const key = toolDedupKey(tool);
		const existing = byKey.get(key);
		if (!existing || tool.qualityRank > existing.qualityRank) {
			byKey.set(key, tool);
		}
	});

	return [...byKey.values()].sort((a, b) => {
		const aSequence = toNumericValue(payloadField(a.metadata, 'sequence_index'));
		const bSequence = toNumericValue(payloadField(b.metadata, 'sequence_index'));
		if (aSequence !== null && bSequence !== null && aSequence !== bSequence) {
			return aSequence - bSequence;
		}
		if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? -1 : 1;
		return a.id.localeCompare(b.id);
	});
}

export function conversationMessageIsLong(message: ConversationMessage): boolean {
	const content = message.content.trim();
	return content.length > 900 || content.split(/\r\n|\r|\n/).length > 10;
}

export function buildConversationTurns(params: {
	detail: ChatSessionAuditPayload;
	replayTimeline: AuditTimelineEvent[];
}): ConversationTurn[] {
	const { detail, replayTimeline } = params;
	const fallbackTimestamp = detail.session.created_at;
	const turnRunByIndex = new Map<number, SessionTurnRun>(
		detail.turn_runs.map((run) => [run.turn_index, run])
	);
	const turnByIndex = new Map<number, ConversationTurn>();
	let standaloneTurn: ConversationTurn | null = null;

	const ensureTurn = (turnIndex: number | null, run: SessionTurnRun | null = null) => {
		if (turnIndex === null) {
			standaloneTurn ??= createConversationTurn(null, null, fallbackTimestamp);
			return standaloneTurn;
		}
		const existing = turnByIndex.get(turnIndex);
		if (existing) {
			if (!existing.run && run) {
				existing.run = run;
				existing.startedAt = run.started_at;
				existing.finishedAt = run.finished_at;
				existing.status = run.status;
			}
			return existing;
		}
		const next = createConversationTurn(
			turnIndex,
			run ?? turnRunByIndex.get(turnIndex) ?? null,
			fallbackTimestamp
		);
		turnByIndex.set(turnIndex, next);
		return next;
	};

	for (const run of detail.turn_runs) {
		ensureTurn(run.turn_index, run);
	}

	const messageTurnIndexById = new Map<string, number>();
	for (const run of detail.turn_runs) {
		if (run.user_message_id) messageTurnIndexById.set(run.user_message_id, run.turn_index);
		if (run.assistant_message_id) {
			messageTurnIndexById.set(run.assistant_message_id, run.turn_index);
		}
	}
	for (const event of replayTimeline) {
		if (event.type !== 'message' || event.turn_index === null) continue;
		const id = timelineMessageId(event);
		if (id) messageTurnIndexById.set(id, event.turn_index);
	}

	let fallbackTurnIndex = 0;
	const sortedMessages = [...(detail.messages ?? [])]
		.filter((message): message is Record<string, unknown> => {
			return !!message && typeof message === 'object' && !Array.isArray(message);
		})
		.sort((a, b) =>
			messageSortValue(a, fallbackTimestamp).localeCompare(
				messageSortValue(b, fallbackTimestamp)
			)
		);

	for (const message of sortedMessages) {
		const id = stringValue(payloadField(message, 'id'));
		const role = normalizeConversationRole(payloadField(message, 'role'));
		const explicitTurnIndex = id ? (messageTurnIndexById.get(id) ?? null) : null;
		if (role === 'user') {
			fallbackTurnIndex =
				explicitTurnIndex ?? Math.max(fallbackTurnIndex + 1, fallbackTurnIndex);
		} else if (fallbackTurnIndex === 0 && explicitTurnIndex === null) {
			fallbackTurnIndex = 1;
		}
		const turnIndex = explicitTurnIndex ?? (fallbackTurnIndex > 0 ? fallbackTurnIndex : null);
		const turn = ensureTurn(turnIndex);
		addMessageToConversationTurn(
			turn,
			buildConversationMessage({
				message,
				turnIndex,
				fallbackTimestamp
			})
		);
	}

	for (const event of [...replayTimeline].sort(compareTimelineEvents)) {
		const turn = ensureTurn(event.turn_index);
		assignAuditEventToConversationTurn(turn, event);
	}

	for (const turn of turnByIndex.values()) {
		if (turn.run?.request_message && turn.userMessages.length === 0) {
			addMessageToConversationTurn(
				turn,
				buildConversationMessage({
					message: {
						id: `request:${turn.run.id}`,
						role: 'user',
						content: turn.run.request_message,
						created_at: turn.run.started_at,
						total_tokens: 0
					},
					turnIndex: turn.turnIndex,
					fallbackTimestamp
				})
			);
		}
		turn.toolCalls = buildConversationToolCalls(turn.auditEvents);
		turn.auditEvents.sort(compareTimelineEvents);
		turn.llmCalls.sort(compareTimelineEvents);
		turn.promptSnapshots.sort(compareTimelineEvents);
		turn.operations.sort(compareTimelineEvents);
		turn.evalRuns.sort(compareTimelineEvents);
		turn.supervisorEvents.sort(compareTimelineEvents);
	}

	const finalStandaloneTurn = standaloneTurn as ConversationTurn | null;

	if (finalStandaloneTurn) {
		finalStandaloneTurn.toolCalls = buildConversationToolCalls(finalStandaloneTurn.auditEvents);
		finalStandaloneTurn.auditEvents.sort(compareTimelineEvents);
		finalStandaloneTurn.supervisorEvents.sort(compareTimelineEvents);
	}

	return [
		...Array.from(turnByIndex.values()).sort((a, b) => {
			if (a.turnIndex === null && b.turnIndex !== null) return -1;
			if (a.turnIndex !== null && b.turnIndex === null) return 1;
			return (a.turnIndex ?? 0) - (b.turnIndex ?? 0);
		}),
		...(finalStandaloneTurn ? [finalStandaloneTurn] : [])
	].filter((turn) => {
		return (
			turn.userMessages.length > 0 ||
			turn.assistantMessages.length > 0 ||
			turn.otherMessages.length > 0 ||
			turn.auditEvents.length > 0 ||
			!!turn.run
		);
	});
}
