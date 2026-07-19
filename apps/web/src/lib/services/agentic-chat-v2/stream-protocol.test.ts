// apps/web/src/lib/services/agentic-chat-v2/stream-protocol.test.ts
import { describe, expect, it } from 'vitest';
import { collectStrictAgentSse } from './strict-agent-sse';
import { AgentStreamEventGuard, StrictAgentStreamValidator } from './stream-protocol';

function event(sequenceIndex: number, type = 'text_delta'): Record<string, unknown> {
	return {
		type,
		content: type === 'text_delta' ? 'hello' : undefined,
		stream_run_id: 'stream-1',
		client_turn_id: 'turn-1',
		event_id: `stream-1:${sequenceIndex}`,
		sequence_index: sequenceIndex
	};
}

function sseResponse(events: Array<Record<string, unknown> | string>): Response {
	return new Response(
		events
			.map((item) => `data: ${typeof item === 'string' ? item : JSON.stringify(item)}\n\n`)
			.join(''),
		{ headers: { 'content-type': 'text/event-stream' } }
	);
}

describe('StrictAgentStreamValidator', () => {
	it('accepts one contiguous stream ending in done', () => {
		const validator = new StrictAgentStreamValidator({
			streamRunId: 'stream-1',
			clientTurnId: 'turn-1'
		});
		validator.accept(event(1));
		validator.accept(event(2, 'done'));
		expect(() => validator.assertComplete()).not.toThrow();
	});

	it('rejects identity changes, gaps, duplicates, and post-terminal events', () => {
		const wrongIdentity = new StrictAgentStreamValidator({
			streamRunId: 'stream-1',
			clientTurnId: 'turn-1'
		});
		expect(() => wrongIdentity.accept({ ...event(1), stream_run_id: 'other-stream' })).toThrow(
			/stream_run_id mismatch/
		);

		const gap = new StrictAgentStreamValidator({
			streamRunId: 'stream-1',
			clientTurnId: 'turn-1'
		});
		expect(() => gap.accept(event(2))).toThrow(/non-contiguous/);

		const duplicate = new StrictAgentStreamValidator({
			streamRunId: 'stream-1',
			clientTurnId: 'turn-1'
		});
		duplicate.accept(event(1));
		expect(() => duplicate.accept(event(1))).toThrow(/duplicate sequence_index/);

		const terminal = new StrictAgentStreamValidator({
			streamRunId: 'stream-1',
			clientTurnId: 'turn-1'
		});
		terminal.accept(event(1, 'done'));
		expect(() => terminal.accept(event(2))).toThrow(/after terminal done/);
	});

	it('rejects closure without done', () => {
		const validator = new StrictAgentStreamValidator({
			streamRunId: 'stream-1',
			clientTurnId: 'turn-1'
		});
		validator.accept(event(1));
		expect(() => validator.assertComplete()).toThrow(/without a terminal done/);
	});
});

describe('AgentStreamEventGuard', () => {
	it('preserves lenient modal compatibility while rejecting stale and duplicate envelopes', () => {
		const guard = new AgentStreamEventGuard();
		const expected = { streamRunId: 'stream-1', clientTurnId: 'turn-1' };
		expect(guard.inspect({ type: 'text_delta', content: 'legacy' }, expected).accepted).toBe(
			true
		);
		expect(guard.inspect(event(1), expected).accepted).toBe(true);
		expect(guard.inspect(event(1), expected).reason).toBe('duplicate_event');
		expect(guard.inspect({ ...event(2), client_turn_id: 'other-turn' }, expected).reason).toBe(
			'stale_client_turn'
		);
	});
});

describe('collectStrictAgentSse', () => {
	it('uses the shared SSE decoder and returns validated events', async () => {
		const events = await collectStrictAgentSse(sseResponse([event(1), event(2, 'done')]), {
			streamRunId: 'stream-1',
			clientTurnId: 'turn-1'
		});
		expect(events.map((item) => item.type)).toEqual(['text_delta', 'done']);
	});

	it('keeps semantic error events in-band until terminal done', async () => {
		const events = await collectStrictAgentSse(
			sseResponse([{ ...event(1, 'error'), error: 'turn rejected' }, event(2, 'done')]),
			{ streamRunId: 'stream-1', clientTurnId: 'turn-1' }
		);
		expect(events.map((item) => item.type)).toEqual(['error', 'done']);
	});

	it('hard-fails malformed JSON frames', async () => {
		await expect(
			collectStrictAgentSse(sseResponse(['{"type":']), {
				streamRunId: 'stream-1',
				clientTurnId: 'turn-1'
			})
		).rejects.toThrow(/malformed JSON data frame/);
	});
});
