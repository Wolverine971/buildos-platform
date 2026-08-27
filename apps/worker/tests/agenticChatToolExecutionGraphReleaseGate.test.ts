import { describe, expect, it, vi } from 'vitest';
import {
	compileAgenticChatToolExecutionGraphV1,
	executeAgenticChatToolExecutionGraphV1,
	type AgenticChatToolExecutionCallInputV1
} from '../src/workers/agentic-chat/toolExecutionGraph';

function call(
	providerCallIndex: number,
	providerToolCallId: string,
	options: Partial<AgenticChatToolExecutionCallInputV1> = {}
): AgenticChatToolExecutionCallInputV1 {
	return {
		providerCallIndex,
		providerToolCallId,
		toolName: options.toolName ?? 'update_onto_task',
		kind: options.kind ?? 'mutation',
		arguments: options.arguments ?? {},
		resources: options.resources ?? [],
		executionPolicy: options.executionPolicy
	};
}

function compile(calls: AgenticChatToolExecutionCallInputV1[]) {
	return compileAgenticChatToolExecutionGraphV1({
		batchId: 'production-release-gate',
		calls,
		maxCalls: 40
	});
}

function widths(calls: AgenticChatToolExecutionCallInputV1[]) {
	return compile(calls).layers.map((layer) => layer.providerToolCallIds.length);
}

describe('Agentic Chat tool graph production release matrix', () => {
	it('serializes conflicting same-entity mutations even when the model omits after', () => {
		expect(
			widths([
				call(0, 'rename-task', {
					resources: [{ key: 'task:task-1', access: 'write' }]
				}),
				call(1, 'finish-task', {
					resources: [{ key: 'task:task-1', access: 'write' }]
				})
			])
		).toEqual([1, 1]);
	});

	it('keeps create-then-update deterministic through an explicit same-batch dependency', () => {
		const graph = compile([
			call(0, 'create-task', {
				toolName: 'create_onto_task',
				arguments: { call_ref: 'created' },
				resources: [{ key: 'project:project-1', access: 'write' }]
			}),
			call(1, 'update-task', {
				arguments: { call_ref: 'updated', after: ['created'] },
				resources: [{ key: 'task:task-1', access: 'write' }]
			})
		]);

		expect(graph.layers.map((layer) => layer.providerToolCallIds)).toEqual([
			['create-task'],
			['update-task']
		]);
		expect(graph.edges).toContainEqual({
			fromProviderToolCallId: 'create-task',
			toProviderToolCallId: 'update-task',
			source: 'model_after'
		});
	});

	it('serializes a mixed read/write view of one resource but permits unrelated siblings', () => {
		const graph = compile([
			call(0, 'read-target', {
				toolName: 'get_task',
				kind: 'read',
				resources: [{ key: 'task:task-1', access: 'read' }]
			}),
			call(1, 'write-target', {
				resources: [{ key: 'task:task-1', access: 'write' }]
			}),
			call(2, 'write-sibling', {
				resources: [{ key: 'task:task-2', access: 'write' }]
			})
		]);

		expect(graph.layers.map((layer) => layer.providerToolCallIds)).toEqual([
			['read-target', 'write-sibling'],
			['write-target']
		]);
	});

	it('keeps a successful sibling attributable when another call fails or times out', async () => {
		const graph = compile([
			call(0, 'success', { resources: [{ key: 'task:a', access: 'write' }] }),
			call(1, 'timeout', { resources: [{ key: 'task:b', access: 'write' }] })
		]);
		const timeout = new Error('fixture timeout');
		const run = await executeAgenticChatToolExecutionGraphV1({
			graph,
			maxConcurrency: 2,
			signal: new AbortController().signal,
			executeCall: async (current) => {
				if (current.providerToolCallId === 'timeout') throw timeout;
				return { receipt: current.providerToolCallId };
			}
		});

		expect(run.results).toEqual([
			{
				providerToolCallId: 'success',
				status: 'fulfilled',
				value: { receipt: 'success' }
			},
			{ providerToolCallId: 'timeout', status: 'rejected', error: timeout }
		]);
	});

	it('cancels in-flight siblings and never dispatches a dependent layer', async () => {
		const graph = compile([
			call(0, 'a', { arguments: { call_ref: 'a' } }),
			call(1, 'b', { arguments: { call_ref: 'b' } }),
			call(2, 'dependent', {
				arguments: { call_ref: 'dependent', after: ['a', 'b'] }
			})
		]);
		const controller = new AbortController();
		const started: string[] = [];
		const run = executeAgenticChatToolExecutionGraphV1({
			graph,
			maxConcurrency: 2,
			signal: controller.signal,
			executeCall: (current, signal) =>
				new Promise((_resolve, reject) => {
					started.push(current.providerToolCallId);
					signal.addEventListener('abort', () => reject(signal.reason), { once: true });
				})
		});

		await vi.waitFor(() => expect(started).toHaveLength(2));
		controller.abort(new Error('fixture cancellation'));
		const result = await run;

		expect(started).toEqual(['a', 'b']);
		expect(result.results).toEqual([
			expect.objectContaining({ providerToolCallId: 'a', reason: 'cancelled' }),
			expect.objectContaining({ providerToolCallId: 'b', reason: 'cancelled' }),
			expect.objectContaining({ providerToolCallId: 'dependent', reason: 'cancelled' })
		]);
	});
});
