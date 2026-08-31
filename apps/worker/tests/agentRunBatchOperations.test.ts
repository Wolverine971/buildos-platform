// apps/worker/tests/agentRunBatchOperations.test.ts
import { describe, expect, it } from 'vitest';
import { resolveAgentTurnOperationCalls } from '../src/workers/agent-run/agentRunWorker';

describe('Agent Run bounded operation batches', () => {
	it('keeps a normal single operation compatible', () => {
		expect(
			resolveAgentTurnOperationCalls({
				action: 'call_op',
				op: 'onto.task.get',
				args: { task_id: 'task-1' }
			})
		).toEqual([{ op: 'onto.task.get', args: { task_id: 'task-1' } }]);
	});

	it('normalizes an ordered batch and drops malformed entries', () => {
		expect(
			resolveAgentTurnOperationCalls({
				action: 'call_ops',
				ops: [
					{ op: ' onto.document.get ', args: { document_id: 'doc-1' } },
					{ op: '', args: { ignored: true } },
					{ op: 'onto.goal.get' }
				]
			})
		).toEqual([
			{ op: 'onto.document.get', args: { document_id: 'doc-1' } },
			{ op: 'onto.goal.get', args: {} }
		]);
	});

	it('caps one model turn at eight operations', () => {
		const calls = resolveAgentTurnOperationCalls({
			action: 'call_ops',
			ops: Array.from({ length: 12 }, (_, index) => ({
				op: 'onto.task.get',
				args: { index }
			}))
		});

		expect(calls).toHaveLength(8);
		expect(calls.at(-1)?.args).toEqual({ index: 7 });
	});

	it('does not turn submit_result into an operation', () => {
		expect(
			resolveAgentTurnOperationCalls({
				action: 'submit_result',
				status: 'completed',
				summary: 'done'
			})
		).toEqual([]);
	});
});
