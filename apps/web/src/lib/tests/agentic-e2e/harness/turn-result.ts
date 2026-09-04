// apps/web/src/lib/tests/agentic-e2e/harness/turn-result.ts
//
// Transport-agnostic folding of an agentic-chat event stream into a TurnResult.
// The harness drives the production worker path (`worker-client.ts`); this file
// owns only the shaping of what that path emits — client timings, the payload-
// free event timeline retained by Phase 0, and the per-event reducer. Frames
// carry a `type` discriminator plus envelope metadata (stream_run_id,
// sequence_index, phase, ...); a turn is terminal at `type === 'done'`.
import type { AgentTimingSummary, ChatToolCall, LastTurnContext } from '@buildos/shared-types';
import type { HarnessContextType, TurnEventTiming, TurnResult, TurnTiming } from './types';

export interface RunTurnParams {
	message: string;
	contextType: HarnessContextType;
	/** Project/entity id for project-scoped turns. */
	entityId?: string;
	/** Reuse a session id for multi-turn context; omit on the first turn. */
	sessionId?: string;
	/** Continuity context emitted by the preceding turn. */
	lastTurnContext?: LastTurnContext | null;
}

export function createTurnTiming(requestStartedAt = new Date().toISOString()): TurnTiming {
	return {
		requestStartedAt,
		responseHeadersMs: null,
		firstSseEventMs: null,
		ttftMs: null,
		terminalEventMs: null,
		totalDurationMs: null
	};
}

/** Record one event against the request start; the first text event defines TTFT. */
export function recordTurnEventTiming(
	timing: TurnTiming,
	eventType: unknown,
	elapsedMs: number
): void {
	const observedMs = Math.max(0, elapsedMs);
	timing.firstSseEventMs ??= observedMs;
	if ((eventType === 'text' || eventType === 'text_delta') && timing.ttftMs === null) {
		timing.ttftMs = observedMs;
	}
	if (eventType === 'done' && timing.terminalEventMs === null) {
		timing.terminalEventMs = observedMs;
	}
}

/** Build a payload-free event observation for the retained Phase 0 timing artifact. */
export function createTurnEventTiming(
	event: Record<string, unknown>,
	elapsedMs: number
): TurnEventTiming {
	return {
		type: typeof event.type === 'string' ? event.type : 'unknown',
		phase: typeof event.phase === 'string' ? event.phase : null,
		sequenceIndex:
			typeof event.sequence_index === 'number' && Number.isFinite(event.sequence_index)
				? event.sequence_index
				: null,
		observedMs: Math.max(0, elapsedMs)
	};
}

export function readServerTiming(event: Record<string, unknown>): AgentTimingSummary | null {
	if (event.type !== 'timing' || !event.timing || typeof event.timing !== 'object') return null;
	const timing = event.timing as Partial<AgentTimingSummary>;
	if (typeof timing.request_started_at !== 'string' || !timing.phases) return null;
	return timing as AgentTimingSummary;
}

export function createEmptyTurnResult(
	streamRunId: string,
	clientTurnId: string,
	timing: TurnTiming
): TurnResult {
	return {
		sessionId: null,
		streamRunId,
		clientTurnId,
		lastTurnContext: null,
		assistantText: '',
		toolCalls: [],
		toolResults: [],
		skillActivity: [],
		errors: [],
		finishedReason: null,
		usage: null,
		completed: false,
		rawEvents: [],
		timing,
		serverTiming: null,
		eventTimings: []
	};
}

export function applyTurnEvent(result: TurnResult, ev: Record<string, unknown>): void {
	result.rawEvents.push(ev);

	switch (ev.type) {
		case 'session': {
			const session = ev.session as { id?: string } | undefined;
			result.sessionId =
				session?.id ?? (ev.sessionId as string | undefined) ?? result.sessionId;
			break;
		}
		case 'last_turn_context': {
			result.lastTurnContext = (ev.context as LastTurnContext | undefined) ?? null;
			break;
		}
		case 'text':
		case 'text_delta': {
			if (typeof ev.content === 'string') result.assistantText += ev.content;
			break;
		}
		case 'tool_call': {
			if (ev.tool_call) result.toolCalls.push(ev.tool_call as ChatToolCall);
			break;
		}
		case 'tool_result': {
			if (ev.result) result.toolResults.push(ev.result as Record<string, unknown>);
			break;
		}
		case 'skill_activity': {
			result.skillActivity.push(ev);
			break;
		}
		case 'timing': {
			result.serverTiming = readServerTiming(ev);
			break;
		}
		case 'error': {
			result.errors.push({
				error: typeof ev.error === 'string' ? ev.error : 'unknown stream error',
				turn_rejected: ev.turn_rejected === true
			});
			break;
		}
		case 'done': {
			result.completed = true;
			result.finishedReason = (ev.finished_reason as string | undefined) ?? null;
			result.usage = (ev.usage as Record<string, unknown> | undefined) ?? null;
			break;
		}
		default:
			break;
	}
}
