// apps/web/src/lib/services/agentic-chat-v2/stream-protocol.test.ts
import { describe, expect, it } from 'vitest';
import { AgentStreamEventGuard } from './stream-protocol';

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
