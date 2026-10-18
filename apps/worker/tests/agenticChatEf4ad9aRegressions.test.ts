// apps/worker/tests/agenticChatEf4ad9aRegressions.test.ts
//
// The ef4ad9a contract-review regressions retired with the contract lane
// (CHAT_MUTATION_BATCH_LANE removal); the receipt rule they pinned still
// closes batch-lane turns.
import { describe, expect, it } from 'vitest';
import { renderWriteReceiptFallback } from '../src/workers/agentic-chat/provider/repair-policy';

describe('deterministic saved-write receipt', () => {
	it('distinguishes confirmed writes, failures, and unfinished outcomes', () => {
		const text = renderWriteReceiptFallback(
			[
				{
					toolName: 'create_onto_task',
					action: 'create',
					entityKind: 'task',
					title: 'Order cabinets',
					status: 'success'
				},
				{
					toolName: 'link_onto_entities',
					action: 'link',
					entityKind: 'relationship',
					status: 'failure'
				}
			],
			['Create dependency on permit']
		);
		expect(text).toContain('Created task: Order cabinets');
		expect(text).toContain('These changes did not succeed:');
		expect(text).toContain('not confirmed complete');
		expect(text).not.toContain('create_onto_task');
	});
	it('cannot claim success from a failed or absent receipt', () => {
		expect(renderWriteReceiptFallback([], [])).toBeNull();
		expect(
			renderWriteReceiptFallback([{ toolName: 'create_onto_task', status: 'failure' }], [])
		).toBeNull();
	});
});
