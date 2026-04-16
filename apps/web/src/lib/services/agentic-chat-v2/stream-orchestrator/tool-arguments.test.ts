// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-arguments.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolCall } from '@buildos/shared-types';
import { REDACTED_DURABLE_TEXT, sanitizeToolCallsForReplay } from './tool-arguments';

function toolCall(name: string, args: Record<string, unknown>): ChatToolCall {
	return {
		id: `call:${name}`,
		type: 'function',
		function: {
			name,
			arguments: JSON.stringify(args)
		}
	};
}

describe('sanitizeToolCallsForReplay', () => {
	it('redacts invalid durable text in nested args without relying on path parsing', () => {
		const originalArgs = {
			task_id: '881823a4-e74e-48d2-bf3e-b77db7e47b5f',
			props: {
				'chapter.notes': 'Keep the visible note\n<parameter name="update_strategy">replace'
			}
		};

		const [sanitizedCall] = sanitizeToolCallsForReplay(
			[toolCall('update_onto_task', originalArgs)],
			{
				redactInvalidDurableText: true
			}
		);

		const sanitizedArgs = JSON.parse(sanitizedCall?.function.arguments ?? '{}');
		expect(sanitizedArgs.props['chapter.notes']).toBe(REDACTED_DURABLE_TEXT);
		expect(JSON.stringify(sanitizedCall)).not.toContain('<parameter');
		expect(originalArgs.props['chapter.notes']).toContain('<parameter');
	});
});
