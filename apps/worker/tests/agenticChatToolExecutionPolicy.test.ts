// apps/worker/tests/agenticChatToolExecutionPolicy.test.ts
import { describe, expect, it } from 'vitest';
import { resolveAgenticChatToolExecutionPolicyV1 } from '../src/workers/agentic-chat/toolExecutionPolicy';

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
