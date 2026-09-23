// apps/web/src/lib/components/agent/agent-chat-render-keys.test.ts
import { describe, expect, it } from 'vitest';
import { carryRenderKeys } from './agent-chat-render-keys';
import type { UIMessage } from './agent-chat.types';

function message(overrides: Partial<UIMessage>): UIMessage {
	return {
		id: 'message-1',
		type: 'assistant',
		role: 'assistant',
		content: '',
		timestamp: new Date('2026-09-22T00:00:00.000Z'),
		...overrides
	} as UIMessage;
}

describe('carryRenderKeys', () => {
	it('keeps the optimistic bubble identity when the persisted row replaces it', () => {
		const optimistic = message({
			id: 'client-uuid',
			type: 'user',
			role: 'user',
			renderKey: 'turn:ctid-1:user',
			metadata: { client_turn_id: 'ctid-1' }
		});
		const persisted = message({
			id: 'db-row-1',
			type: 'user',
			role: 'user',
			metadata: { client_turn_id: 'ctid-1' }
		});

		const [carried] = carryRenderKeys([optimistic], [persisted]);

		expect(carried).not.toBe(persisted);
		expect(carried).toMatchObject({ id: 'db-row-1', renderKey: 'turn:ctid-1:user' });
	});

	it('matches worker blocks by turn run id and falls back to the previous id as key', () => {
		const live = message({
			id: 'worker-thinking:run-1:1',
			type: 'thinking_block',
			metadata: { turn_run_id: 'run-1' }
		});
		const restored = message({
			id: 'restored-block',
			type: 'thinking_block',
			metadata: { turn_run_id: 'run-1' }
		});

		const [carried] = carryRenderKeys([live], [restored]);

		expect(carried?.renderKey).toBe('worker-thinking:run-1:1');
	});

	it('does not match across message types or hand one key to two messages', () => {
		const previous = [
			message({ id: 'a', type: 'user', role: 'user', metadata: { client_turn_id: 'ctid' } })
		];
		const next = [
			message({ id: 'b', type: 'assistant', metadata: { client_turn_id: 'ctid' } }),
			message({ id: 'c', type: 'user', role: 'user', metadata: { client_turn_id: 'ctid' } }),
			message({ id: 'd', type: 'user', role: 'user', metadata: { client_turn_id: 'ctid' } })
		];

		const result = carryRenderKeys(previous, next);

		expect(result[0]?.renderKey).toBeUndefined();
		expect(result[1]?.renderKey).toBe('a');
		expect(result[2]?.renderKey).toBeUndefined();
	});

	it('returns the incoming array untouched when nothing needs a key', () => {
		const same = message({ id: 'same' });
		const next = [same];

		expect(carryRenderKeys([message({ id: 'same' })], next)).toBe(next);
		expect(carryRenderKeys([], next)).toBe(next);
	});
});
