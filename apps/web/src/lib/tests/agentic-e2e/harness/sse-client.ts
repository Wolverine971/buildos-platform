// apps/web/src/lib/tests/agentic-e2e/harness/sse-client.ts
//
// Drives a single chat turn over the real POST /api/agent/v2/stream SSE endpoint
// and folds the event stream into a TurnResult. Frames are `data: {json}\n\n`
// where the JSON carries a `type` discriminator plus envelope metadata
// (stream_run_id, sequence_index, phase, ...). We read until `type === 'done'`.
import { randomUUID } from 'node:crypto';
import type { AgentTimingSummary, ChatToolCall, LastTurnContext } from '@buildos/shared-types';
import { buildFastAgentStreamRequestBody } from '$lib/services/agentic-chat-v2/stream-request-client';
import { collectStrictAgentSse } from '$lib/services/agentic-chat-v2/strict-agent-sse';
import type { HarnessContextType, TurnEventTiming, TurnResult, TurnTiming } from './types';

const STREAM_PATH = '/api/agent/v2/stream';

export interface RunTurnParams {
	baseUrl: string;
	cookie: string;
	message: string;
	contextType: HarnessContextType;
	/** Project/entity id for project-scoped turns. */
	entityId?: string;
	/** Reuse a session id for multi-turn context; omit on the first turn. */
	sessionId?: string;
	/** Continuity context emitted by the preceding turn. */
	lastTurnContext?: LastTurnContext | null;
}

/** GET the stream path as a cheap auth + reachability warmup (expects 204). */
export async function warmupPing(params: { baseUrl: string; cookie: string }): Promise<void> {
	const res = await fetch(`${params.baseUrl}${STREAM_PATH}`, {
		method: 'GET',
		headers: { Cookie: params.cookie }
	});
	if (res.status !== 204 && !res.ok) {
		throw new Error(
			`[agentic-e2e] Warmup ping to ${STREAM_PATH} returned ${res.status}. ` +
				`Is the dev server running and the test user authorized?`
		);
	}
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

/**
 * POST a message and drive the turn to completion. Resolves once a `done` event
 * arrives and the stream closes. Model/tool errors are captured in
 * `result.errors`; malformed or incoherent protocol events throw.
 */
export async function runTurn(params: RunTurnParams): Promise<TurnResult> {
	const requestStartedAt = new Date().toISOString();
	const requestStartedMs = performance.now();
	const streamRunId = randomUUID();
	const clientTurnId = randomUUID();
	const result = createEmptyTurnResult(
		streamRunId,
		clientTurnId,
		createTurnTiming(requestStartedAt)
	);
	const body = buildFastAgentStreamRequestBody({
		message: params.message,
		sessionId: params.sessionId,
		contextType: params.contextType,
		entityId: params.entityId,
		projectFocus: null,
		lastTurnContext: params.lastTurnContext,
		streamRunId,
		clientTurnId
	});

	const response = await fetch(`${params.baseUrl}${STREAM_PATH}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'text/event-stream',
			'X-Skip-Project-Loop-Burst': 'true',
			Cookie: params.cookie
		},
		body: JSON.stringify(body)
	});
	result.timing.responseHeadersMs = performance.now() - requestStartedMs;

	if (!response.ok || !response.body) {
		const text = await response.text().catch(() => '');
		result.errors.push({
			error: `stream request failed (${response.status}): ${text.slice(0, 300)}`
		});
		result.timing.totalDurationMs = performance.now() - requestStartedMs;
		return result;
	}

	await collectStrictAgentSse(response, {
		streamRunId,
		clientTurnId,
		onEvent: (event) => {
			const elapsedMs = performance.now() - requestStartedMs;
			recordTurnEventTiming(result.timing, event.type, elapsedMs);
			result.eventTimings.push(createTurnEventTiming(event, elapsedMs));
			applyTurnEvent(result, event);
		}
	});
	result.timing.totalDurationMs = performance.now() - requestStartedMs;

	return result;
}
