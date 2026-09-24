// apps/worker/tests/agenticChatToolExecutionPolicy.test.ts
import { describe, expect, it } from 'vitest';
import { compileAgenticChatToolExecutionGraphV1 } from '../src/workers/agentic-chat/tools/execution-graph';
import { resolveAgenticChatToolExecutionPolicyV1 } from '../src/workers/agentic-chat/tools/execution-policy';

describe('Agentic Chat tool execution policy', () => {
	it('allows independent row-local mutations to run concurrently', () => {
		expect(
			resolveAgenticChatToolExecutionPolicyV1({
				toolName: 'update_onto_task',
				kind: 'mutation',
				arguments: { task_id: 'task-a', state_key: 'done' },
				concurrentReadsEnabled: true,
				concurrentMutationsEnabled: true
			})
		).toEqual({
			executionPolicy: 'parallel_safe',
			resources: [{ key: 'task:task-a', access: 'write' }]
		});
	});

	it('derives matching read/write resource keys for conflict barriers', () => {
		const read = resolveAgenticChatToolExecutionPolicyV1({
			toolName: 'get_onto_task',
			kind: 'read',
			arguments: { task_id: 'task-a' },
			concurrentReadsEnabled: true,
			concurrentMutationsEnabled: true
		});
		const mutation = resolveAgenticChatToolExecutionPolicyV1({
			toolName: 'update_onto_task',
			kind: 'mutation',
			arguments: { task_id: 'task-a' },
			concurrentReadsEnabled: true,
			concurrentMutationsEnabled: true
		});
		expect(read.resources).toEqual([{ key: 'task:task-a', access: 'read' }]);
		expect(mutation.resources).toEqual([{ key: 'task:task-a', access: 'write' }]);
	});

	it('lets sibling task creates share their project while updates and document creates hold it', () => {
		const policy = (toolName: string, arguments_: Record<string, string>) =>
			resolveAgenticChatToolExecutionPolicyV1({
				toolName,
				kind: 'mutation',
				arguments: arguments_,
				concurrentReadsEnabled: true,
				concurrentMutationsEnabled: true
			});
		expect(policy('create_onto_task', { project_id: 'p1', title: 'A' })).toEqual({
			executionPolicy: 'parallel_safe',
			resources: [{ key: 'project:p1', access: 'read' }]
		});
		expect(policy('create_onto_document', { project_id: 'p1' }).resources).toEqual([
			{ key: 'project:p1', access: 'write' }
		]);
		expect(policy('update_onto_project', { project_id: 'p1' }).resources).toEqual([
			{ key: 'project:p1', access: 'write' }
		]);

		// Tasker 101 case 2: five creates in one project compile to one layer.
		const graph = compileAgenticChatToolExecutionGraphV1({
			batchId: 'case-2',
			maxCalls: 40,
			calls: ['a', 'b', 'c', 'd', 'e'].map((title, index) => ({
				providerCallIndex: index,
				providerToolCallId: `create-${title}`,
				toolName: 'create_onto_task',
				kind: 'mutation' as const,
				arguments: { project_id: 'p1', title },
				...policy('create_onto_task', { project_id: 'p1', title })
			}))
		});
		expect(graph.layers.map((layer) => layer.providerToolCallIds.length)).toEqual([5]);
	});

	it('keeps unknown-scope mutations serial even when mutation concurrency is enabled', () => {
		expect(
			resolveAgenticChatToolExecutionPolicyV1({
				toolName: 'create_onto_project',
				kind: 'mutation',
				arguments: { project: { name: 'Launch' } },
				concurrentReadsEnabled: true,
				concurrentMutationsEnabled: true
			})
		).toEqual({ executionPolicy: 'serial', resources: [] });
	});

	it('feature-gates read and mutation concurrency independently', () => {
		expect(
			resolveAgenticChatToolExecutionPolicyV1({
				toolName: 'get_onto_task',
				kind: 'read',
				arguments: { task_id: 'task-a' },
				concurrentReadsEnabled: false,
				concurrentMutationsEnabled: true
			}).executionPolicy
		).toBe('serial');
		expect(
			resolveAgenticChatToolExecutionPolicyV1({
				toolName: 'update_onto_task',
				kind: 'mutation',
				arguments: { task_id: 'task-a' },
				concurrentReadsEnabled: true,
				concurrentMutationsEnabled: false
			}).executionPolicy
		).toBe('serial');
	});
});
