// apps/web/src/lib/services/admin/chat-session-audit-tool-lifecycle.ts
import { formatDuration } from './chat-session-audit-formatters';
import { payloadField, stringValue, toNumericValue } from './chat-session-audit-payload';
import { eventTypeLabel, turnEventName } from './chat-session-audit-timeline';
import type { AuditTimelineEvent, ToolLifecycleDisplayState } from './chat-session-audit-types';

export function toolTracePayload(payload: Record<string, unknown>): Record<string, unknown> | null {
	const traceEntry = payloadField(payload, 'trace_entry');
	if (!traceEntry || typeof traceEntry !== 'object' || Array.isArray(traceEntry)) {
		return null;
	}
	return traceEntry as Record<string, unknown>;
}

export function preferredToolPayloadValue(
	payload: Record<string, unknown>,
	keys: string[]
): unknown {
	for (const key of keys) {
		const directValue = payloadField(payload, key);
		if (directValue !== undefined && directValue !== null && directValue !== '') {
			return directValue;
		}
	}

	const tracePayload = toolTracePayload(payload);
	if (!tracePayload) return undefined;

	for (const key of keys) {
		const traceValue = tracePayload[key];
		if (traceValue !== undefined && traceValue !== null && traceValue !== '') {
			return traceValue;
		}
	}

	return undefined;
}

export function toolDisplayName(payload: Record<string, unknown>): string {
	return (
		stringValue(preferredToolPayloadValue(payload, ['tool_name', 'op', 'gateway_op'])) || '-'
	);
}

export function toolDisplaySuccess(payload: Record<string, unknown>): boolean | null {
	const successValue = preferredToolPayloadValue(payload, ['success']);
	return typeof successValue === 'boolean' ? successValue : null;
}

export function toolDisplayDuration(payload: Record<string, unknown>): unknown {
	return preferredToolPayloadValue(payload, ['execution_time_ms', 'duration_ms']);
}

export function toolDisplayTokens(payload: Record<string, unknown>): number {
	return toNumericValue(preferredToolPayloadValue(payload, ['tokens_consumed'])) ?? 0;
}

export function toolDisplayArguments(payload: Record<string, unknown>): unknown {
	const argumentsValue = payloadField(payload, 'arguments');
	if (argumentsValue !== undefined) return argumentsValue;
	return preferredToolPayloadValue(payload, ['args', 'arguments']);
}

export function toolDisplayResult(payload: Record<string, unknown>): unknown {
	const resultValue = payloadField(payload, 'result');
	if (resultValue !== undefined) return resultValue;
	return preferredToolPayloadValue(payload, ['result']);
}

export function toolDisplayError(payload: Record<string, unknown>): string {
	return stringValue(preferredToolPayloadValue(payload, ['error_message', 'error'])) || '';
}

export function isTraceToolPayload(payload: Record<string, unknown>): boolean {
	return stringValue(payloadField(payload, 'source')) === 'assistant_message_metadata';
}

export function timelineEventToolCallId(event: AuditTimelineEvent): string {
	return stringValue(payloadField(event.payload ?? {}, 'tool_call_id'));
}

export function isToolCallEmittedEvent(event: AuditTimelineEvent): boolean {
	return event.type === 'turn_event' && turnEventName(event) === 'tool_call_emitted';
}

export function isToolOutcomeEvent(event: AuditTimelineEvent): boolean {
	if (event.type !== 'turn_event') return false;
	const eventName = turnEventName(event);
	return eventName === 'tool_result_received' || eventName === 'tool_call_validation_failed';
}

export function isToolDetailTurnEvent(event: AuditTimelineEvent): boolean {
	if (event.type !== 'turn_event') return false;
	const eventName = turnEventName(event);
	return (
		eventName === 'tool_call_emitted' ||
		eventName === 'tool_result_received' ||
		eventName === 'tool_call_validation_failed'
	);
}

export function findMatchingToolOutcomeEvent(
	events: AuditTimelineEvent[],
	emittedIndex: number
): AuditTimelineEvent | null {
	const emittedEvent = events[emittedIndex];
	if (!emittedEvent || !isToolCallEmittedEvent(emittedEvent)) return null;
	const toolCallId = timelineEventToolCallId(emittedEvent);
	if (!toolCallId) return null;

	for (let index = emittedIndex + 1; index < events.length; index += 1) {
		const candidate = events[index];
		if (!candidate || !isToolOutcomeEvent(candidate)) continue;
		if (timelineEventToolCallId(candidate) !== toolCallId) continue;
		return candidate;
	}

	return null;
}

export function shouldHideMergedToolOutcomeEvent(
	events: AuditTimelineEvent[],
	outcomeIndex: number
): boolean {
	const outcomeEvent = events[outcomeIndex];
	if (!outcomeEvent || !isToolOutcomeEvent(outcomeEvent)) return false;
	const toolCallId = timelineEventToolCallId(outcomeEvent);
	if (!toolCallId) return false;

	for (let index = outcomeIndex - 1; index >= 0; index -= 1) {
		const candidate = events[index];
		if (!candidate || !isToolCallEmittedEvent(candidate)) continue;
		if (timelineEventToolCallId(candidate) !== toolCallId) continue;
		return findMatchingToolOutcomeEvent(events, index)?.id === outcomeEvent.id;
	}

	return false;
}

export function mergeToolLifecyclePayload(
	emittedEvent: AuditTimelineEvent,
	outcomeEvent: AuditTimelineEvent | null
): Record<string, unknown> {
	const emittedPayload = (emittedEvent.payload ?? {}) as Record<string, unknown>;
	if (!outcomeEvent) {
		return emittedPayload;
	}

	const outcomePayload = (outcomeEvent.payload ?? {}) as Record<string, unknown>;
	return {
		...emittedPayload,
		...outcomePayload,
		arguments:
			payloadField(emittedPayload, 'arguments') ?? payloadField(outcomePayload, 'arguments'),
		result: payloadField(outcomePayload, 'result'),
		error: payloadField(outcomePayload, 'error'),
		success: payloadField(outcomePayload, 'success'),
		duration_ms: payloadField(outcomePayload, 'duration_ms'),
		tool_result_source: payloadField(outcomePayload, 'tool_result_source'),
		emitted_event_type: turnEventName(emittedEvent),
		outcome_event_type: turnEventName(outcomeEvent),
		emitted_sequence_index: payloadField(emittedPayload, 'sequence_index'),
		outcome_sequence_index: payloadField(outcomePayload, 'sequence_index'),
		emitted_phase: payloadField(emittedPayload, 'phase'),
		outcome_phase: payloadField(outcomePayload, 'phase'),
		emitted_at: emittedEvent.timestamp,
		outcome_at: outcomeEvent.timestamp
	};
}

export function mergeToolLifecycleRawPayload(
	emittedEvent: AuditTimelineEvent,
	outcomeEvent: AuditTimelineEvent | null
): Record<string, unknown> {
	return {
		tool_call_emitted: emittedEvent.payload ?? null,
		tool_outcome: outcomeEvent?.payload ?? null
	};
}

export function toolLifecycleTitle(
	payload: Record<string, unknown>,
	outcomeEvent: AuditTimelineEvent | null
): string {
	const toolName = toolDisplayName(payload);
	if (!outcomeEvent) {
		return `Tool Call: ${toolName}`;
	}

	const success = toolDisplaySuccess(payload);
	if (success === false) {
		return `Tool Call Failed: ${toolName}`;
	}

	if (success === true) {
		return `Tool Call Completed: ${toolName}`;
	}

	return `Tool Call: ${toolName}`;
}

export function toolLifecycleSummary(
	payload: Record<string, unknown>,
	outcomeEvent: AuditTimelineEvent | null
): string {
	const parts = [
		stringValue(payloadField(payload, 'canonical_op'))
			? `op=${stringValue(payloadField(payload, 'canonical_op'))}`
			: null,
		toolDisplaySuccess(payload) === true
			? 'completed'
			: toolDisplaySuccess(payload) === false
				? 'failed'
				: outcomeEvent
					? 'returned'
					: 'pending',
		toolDisplayDuration(payload) ? formatDuration(toolDisplayDuration(payload)) : null,
		toolDisplayError(payload) ? `error=${toolDisplayError(payload)}` : null
	]
		.filter(Boolean)
		.join(' • ');

	return parts || 'Tool call';
}

export function toolLifecycleDisplayState(
	events: AuditTimelineEvent[],
	index: number
): ToolLifecycleDisplayState {
	const event = events[index];
	const payload = (event?.payload ?? {}) as Record<string, unknown>;

	if (!event) {
		return {
			outcomeEvent: null,
			hideEvent: false,
			displayPayload: payload,
			displayRawPayload: payload,
			displayTitle: '',
			displaySummary: '',
			displaySeverity: 'info',
			displayTimestamp: '',
			displayBadgeLabel: 'Event',
			displayIconType: 'turn_event',
			displayEventId: ''
		};
	}

	if (shouldHideMergedToolOutcomeEvent(events, index)) {
		return {
			outcomeEvent: null,
			hideEvent: true,
			displayPayload: payload,
			displayRawPayload: payload,
			displayTitle: event.title,
			displaySummary: event.summary,
			displaySeverity: event.severity,
			displayTimestamp: event.timestamp,
			displayBadgeLabel: eventTypeLabel(event.type),
			displayIconType: event.type,
			displayEventId: event.id
		};
	}

	if (!isToolCallEmittedEvent(event)) {
		return {
			outcomeEvent: null,
			hideEvent: false,
			displayPayload: payload,
			displayRawPayload: payload,
			displayTitle: event.title,
			displaySummary: event.summary,
			displaySeverity: event.severity,
			displayTimestamp: event.timestamp,
			displayBadgeLabel: eventTypeLabel(event.type),
			displayIconType: event.type,
			displayEventId: event.id
		};
	}

	const outcomeEvent = findMatchingToolOutcomeEvent(events, index);
	const mergedPayload = mergeToolLifecyclePayload(event, outcomeEvent);

	return {
		outcomeEvent,
		hideEvent: false,
		displayPayload: mergedPayload,
		displayRawPayload: mergeToolLifecycleRawPayload(event, outcomeEvent),
		displayTitle: toolLifecycleTitle(mergedPayload, outcomeEvent),
		displaySummary: toolLifecycleSummary(mergedPayload, outcomeEvent),
		displaySeverity: outcomeEvent?.severity ?? event.severity,
		displayTimestamp: event.timestamp,
		displayBadgeLabel: 'Tool',
		displayIconType: 'tool_execution',
		displayEventId: outcomeEvent ? `tool-pair:${event.id}:${outcomeEvent.id}` : event.id
	};
}
