// apps/web/src/lib/tests/agentic-e2e/harness/sse-client.ts
//
// Drives a single chat turn over the real POST /api/agent/v2/stream SSE endpoint
// and folds the event stream into a TurnResult. Frames are `data: {json}\n\n`
// where the JSON carries a `type` discriminator plus envelope metadata
// (stream_run_id, sequence_index, phase, ...). We read until `type === 'done'`.
import { randomUUID } from 'node:crypto';
import type { ChatToolCall, LastTurnContext } from '@buildos/shared-types';
import { buildFastAgentStreamRequestBody } from '$lib/services/agentic-chat-v2/stream-request-client';
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
	if (typeof ev.stream_run_id === 'string') result.streamRunId = ev.stream_run_id;

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

/** Parse a raw SSE frame (may hold multiple `data:` lines) into one JSON object. */
function parseFrame(frame: string): Record<string, unknown> | null {
	const dataLines: string[] = [];
	for (const line of frame.split('\n')) {
		if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
		// `id:` lines and `:` heartbeat comments are ignored.
	}
	if (dataLines.length === 0) return null;
	const payload = dataLines.join('\n');
	try {
		return JSON.parse(payload) as Record<string, unknown>;
	} catch {
		return null;
	}
}

/**
 * POST a message and drive the turn to completion. Resolves once a `done` event
 * arrives (or the stream closes). Never throws on model/tool errors — those are
 * captured in `result.errors` for assertions to inspect.
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

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	// IMPORTANT: do not cancel the reader on `done`. The server emits `done` and
	// THEN finalizes the turn (writing chat_turn_runs.status = 'completed').
	// Cancelling aborts the HTTP request mid-finalization and leaves the row
	// stuck at 'running'. Instead we read until the server closes the stream
	// naturally, with a short grace timeout after `done` as a safety net in case
	// it lingers on heartbeats.
	const POST_DONE_GRACE_MS = 5000;
	for (;;) {
		const readPromise = reader.read();
		const raced = result.completed
			? await Promise.race([
					readPromise,
					new Promise<'grace-timeout'>((r) =>
						setTimeout(() => r('grace-timeout'), POST_DONE_GRACE_MS)
					)
				])
			: await readPromise;

		if (raced === 'grace-timeout') {
			await reader.cancel().catch(() => {});
			break;
		}

		const { done, value } = raced;
		if (done) break;
		buffer += decoder.decode(value, { stream: true });

		let sep: number;
		while ((sep = buffer.indexOf('\n\n')) !== -1) {
			const frame = buffer.slice(0, sep);
			buffer = buffer.slice(sep + 2);
			const ev = parseFrame(frame);
			if (ev) applyEvent(result, ev);
		}
	}

	// Flush any trailing frame without a terminator.
	const tail = parseFrame(buffer);
	if (tail) applyEvent(result, tail);

	return result;
}
