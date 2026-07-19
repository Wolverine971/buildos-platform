// apps/web/src/lib/tests/agentic-e2e/harness/sse-client.ts
//
// Drives a single chat turn over the real POST /api/agent/v2/stream SSE endpoint
// and folds the event stream into a TurnResult. Frames are `data: {json}\n\n`
// where the JSON carries a `type` discriminator plus envelope metadata
// (stream_run_id, sequence_index, phase, ...). We read until `type === 'done'`.
import { randomUUID } from 'node:crypto';
import type { ChatToolCall, LastTurnContext } from '@buildos/shared-types';
import { buildFastAgentStreamRequestBody } from '$lib/services/agentic-chat-v2/stream-request-client';
import { collectStrictAgentSse } from '$lib/services/agentic-chat-v2/strict-agent-sse';
import type { HarnessContextType, TurnResult } from './types';

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

function emptyResult(streamRunId: string, clientTurnId: string): TurnResult {
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
		rawEvents: []
	};
}

function applyEvent(result: TurnResult, ev: Record<string, unknown>): void {
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
	const streamRunId = randomUUID();
	const clientTurnId = randomUUID();
	const result = emptyResult(streamRunId, clientTurnId);
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

	if (!response.ok || !response.body) {
		const text = await response.text().catch(() => '');
		result.errors.push({
			error: `stream request failed (${response.status}): ${text.slice(0, 300)}`
		});
		return result;
	}

	await collectStrictAgentSse(response, {
		streamRunId,
		clientTurnId,
		onEvent: (event) => applyEvent(result, event)
	});

	return result;
}
