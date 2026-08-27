// apps/worker/tests/agenticChatToolExecutionGraph.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { JsonObject } from '@buildos/shared-types';
import {
	AGENTIC_CHAT_TOOL_EXECUTION_PLAN_VERSION_V1,
	AgenticChatToolExecutionGraphError,
	compileAgenticChatToolExecutionGraphV1,
	executeAgenticChatToolExecutionGraphV1,
	type AgenticChatToolExecutionCallInputV1,
	type AgenticChatToolExecutionGraphV1
} from '../src/workers/agentic-chat/toolExecutionGraph';

function call(
	providerCallIndex: number,
	providerToolCallId: string,
	arguments_: JsonObject = {},
	overrides: Partial<AgenticChatToolExecutionCallInputV1> = {}
): AgenticChatToolExecutionCallInputV1 {
	return {
		providerCallIndex,
		providerToolCallId,
		toolName: 'fixture_read',
		kind: 'read',
		arguments: arguments_,
		resources: [],
		...overrides
	};
}

function compile(
	calls: readonly AgenticChatToolExecutionCallInputV1[],
	overrides: { batchId?: string; maxCalls?: number } = {}
) {
	return compileAgenticChatToolExecutionGraphV1({
		batchId: overrides.batchId ?? 'batch-1',
		calls,
		maxCalls: overrides.maxCalls ?? 40
	});
}

function layerIds(graph: AgenticChatToolExecutionGraphV1): string[][] {
	return graph.layers.map((layer) => [...layer.providerToolCallIds]);
}

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

async function waitForStarts(starts: readonly string[], count: number): Promise<void> {
	await vi.waitFor(() => expect(starts).toHaveLength(count));
}

describe('Agentic Chat tool execution graph compiler', () => {
	it('puts independent same-round calls in one parallel-ready layer by default', () => {
		const graph = compile([
			call(0, 'call-a', { task_id: 'task-a' }),
			call(1, 'call-b', { task_id: 'task-b' }),
			call(2, 'call-c', { project_id: 'project-c' })
		]);

		expect(graph).toMatchObject({
			version: AGENTIC_CHAT_TOOL_EXECUTION_PLAN_VERSION_V1,
			batchId: 'batch-1',
			edges: []
		});
		expect(layerIds(graph)).toEqual([['call-a', 'call-b', 'call-c']]);
	});

	it('strips call_ref and after before arguments cross the domain adapter boundary', () => {
		const graph = compile([
			call(0, 'call-a', {
				task_id: 'task-a',
				state_key: 'done',
				call_ref: 'finish_task',
				after: []
			})
		]);

		expect(graph.calls[0]).toMatchObject({
			providerToolCallId: 'call-a',
			callRef: 'finish_task',
			after: [],
			arguments: { task_id: 'task-a', state_key: 'done' }
		});
		expect(graph.calls[0]?.arguments).not.toHaveProperty('call_ref');
		expect(graph.calls[0]?.arguments).not.toHaveProperty('after');
	});

	it('compiles an explicit sequential chain from stable model-supplied references', () => {
		const graph = compile([
			call(0, 'provider-a', { call_ref: 'first' }),
			call(1, 'provider-b', { call_ref: 'second', after: ['first'] }),
			call(2, 'provider-c', { call_ref: 'third', after: ['second'] })
		]);

		expect(layerIds(graph)).toEqual([['provider-a'], ['provider-b'], ['provider-c']]);
		expect(graph.edges).toEqual([
			{
				fromProviderToolCallId: 'provider-a',
				toProviderToolCallId: 'provider-b',
				source: 'model_after'
			},
			{
				fromProviderToolCallId: 'provider-b',
				toProviderToolCallId: 'provider-c',
				source: 'model_after'
			}
		]);
	});

	it('compiles a mixed fan-in graph into deterministic parallel and sequential layers', () => {
		const graph = compile([
			call(0, 'update-a', { call_ref: 'update_a' }),
			call(1, 'update-b', { call_ref: 'update_b' }),
			call(2, 'write-summary', {
				call_ref: 'write_summary',
				after: ['update_a', 'update_b']
			}),
			call(3, 'notify-owner', { call_ref: 'notify_owner' }),
			call(4, 'archive-log', {
				call_ref: 'archive_log',
				after: ['write_summary']
			})
		]);

		expect(layerIds(graph)).toEqual([
			['update-a', 'update-b', 'notify-owner'],
			['write-summary'],
			['archive-log']
		]);
	});

	it('adds a deterministic provider-order barrier for calls with a write conflict', () => {
		const graph = compile([
			call(
				0,
				'update-task-first',
				{ task_id: 'task-1', state_key: 'in_progress' },
				{
					toolName: 'update_task',
					kind: 'mutation',
					resources: [{ key: 'task:task-1', access: 'write' }]
				}
			),
			call(
				1,
				'read-task-second',
				{ task_id: 'task-1' },
				{
					toolName: 'get_task',
					resources: [{ key: 'task:task-1', access: 'read' }]
				}
			)
		]);

		expect(layerIds(graph)).toEqual([['update-task-first'], ['read-task-second']]);
		expect(graph.edges).toContainEqual({
			fromProviderToolCallId: 'update-task-first',
			toProviderToolCallId: 'read-task-second',
			source: 'worker_conflict',
			conflictKey: 'task:task-1'
		});
	});

	it('keeps reads of the same resource parallel when neither call writes', () => {
		const graph = compile([
			call(0, 'read-a', {}, { resources: [{ key: 'project:p1', access: 'read' }] }),
			call(1, 'read-b', {}, { resources: [{ key: 'project:p1', access: 'read' }] })
		]);

		expect(layerIds(graph)).toEqual([['read-a', 'read-b']]);
		expect(graph.edges).toEqual([]);
	});

	it('serializes parent and child mutations that share a worker-derived ancestor scope', () => {
		const graph = compile([
			call(
				0,
				'update-project',
				{ project_id: 'p1' },
				{
					kind: 'mutation',
					resources: [{ key: 'project:p1', access: 'write' }]
				}
			),
			call(
				1,
				'update-child-task',
				{ task_id: 't1' },
				{
					kind: 'mutation',
					resources: [
						{ key: 'project:p1', access: 'write' },
						{ key: 'task:t1', access: 'write' }
					]
				}
			)
		]);

		expect(layerIds(graph)).toEqual([['update-project'], ['update-child-task']]);
		expect(graph.edges).toContainEqual({
			fromProviderToolCallId: 'update-project',
			toProviderToolCallId: 'update-child-task',
			source: 'worker_conflict',
			conflictKey: 'project:p1'
		});
	});

	it('places a conservative serial-policy call behind barriers on both sides', () => {
		const graph = compile([
			call(0, 'safe-before'),
			call(1, 'high-impact', {}, { kind: 'mutation', executionPolicy: 'serial' }),
			call(2, 'safe-after')
		]);

		expect(layerIds(graph)).toEqual([['safe-before'], ['high-impact'], ['safe-after']]);
	});

	it('does not reverse an explicit dependency when conflicting calls are already ordered', () => {
		const graph = compile([
			call(
				0,
				'provider-first',
				{ call_ref: 'runs_second', after: ['runs_first'] },
				{
					kind: 'mutation',
					resources: [{ key: 'task:t1', access: 'write' }]
				}
			),
			call(
				1,
				'provider-second',
				{ call_ref: 'runs_first' },
				{
					kind: 'mutation',
					resources: [{ key: 'task:t1', access: 'write' }]
				}
			)
		]);

		expect(layerIds(graph)).toEqual([['provider-second'], ['provider-first']]);
		expect(graph.edges).toEqual([
			{
				fromProviderToolCallId: 'provider-second',
				toProviderToolCallId: 'provider-first',
				source: 'model_after'
			}
		]);
	});

	it.each([
		{
			name: 'duplicate call refs',
			calls: [call(0, 'a', { call_ref: 'same' }), call(1, 'b', { call_ref: 'same' })],
			code: 'call_ref_duplicate'
		},
		{
			name: 'missing or cross-batch dependencies',
			calls: [call(0, 'a', { call_ref: 'a', after: ['other_batch/call'] })],
			code: 'dependency_missing'
		},
		{
			name: 'cycles',
			calls: [
				call(0, 'a', { call_ref: 'a', after: ['b'] }),
				call(1, 'b', { call_ref: 'b', after: ['a'] })
			],
			code: 'dependency_cycle'
		},
		{
			name: 'self dependencies',
			calls: [call(0, 'a', { call_ref: 'a', after: ['a'] })],
			code: 'dependency_cycle'
		},
		{
			name: 'duplicate provider ids',
			calls: [call(0, 'same'), call(1, 'same')],
			code: 'provider_tool_call_id_duplicate'
		},
		{
			name: 'non-contiguous provider indexes',
			calls: [call(0, 'a'), call(2, 'b')],
			code: 'provider_call_index_invalid'
		},
		{
			name: 'non-string call refs',
			calls: [call(0, 'a', { call_ref: 42 })],
			code: 'scheduling_metadata_invalid'
		},
		{
			name: 'non-array dependency lists',
			calls: [call(0, 'a', { call_ref: 'a', after: 'b' })],
			code: 'scheduling_metadata_invalid'
		},
		{
			name: 'duplicate dependencies',
			calls: [
				call(0, 'a', { call_ref: 'a' }),
				call(1, 'b', { call_ref: 'b', after: ['a', 'a'] })
			],
			code: 'scheduling_metadata_invalid'
		}
	])('rejects $name before dispatch', ({ calls, code }) => {
		let thrown: unknown;
		try {
			compile(calls);
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(AgenticChatToolExecutionGraphError);
		expect((thrown as AgenticChatToolExecutionGraphError).code).toBe(code);
	});

	it('rejects an oversized graph before dispatch', () => {
		expect(() => compile([call(0, 'a'), call(1, 'b')], { maxCalls: 1 })).toThrowError(
			expect.objectContaining<Partial<AgenticChatToolExecutionGraphError>>({
				code: 'call_count_exceeded'
			})
		);
	});

	it('produces a stable hash when domain argument key order changes', () => {
		const left = compile([
			call(0, 'a', { task_id: 'task-1', state_key: 'done', call_ref: 'finish' })
		]);
		const right = compile([
			call(0, 'a', { call_ref: 'finish', state_key: 'done', task_id: 'task-1' })
		]);

		expect(left.canonicalPlanSha256).toMatch(/^[a-f0-9]{64}$/);
		expect(right.canonicalPlanSha256).toBe(left.canonicalPlanSha256);
	});

	it('binds execution semantics into the canonical plan hash', () => {
		const parallel = compile([
			call(0, 'a', { call_ref: 'a' }),
			call(1, 'b', { call_ref: 'b' })
		]);
		const sequential = compile([
			call(0, 'a', { call_ref: 'a' }),
			call(1, 'b', { call_ref: 'b', after: ['a'] })
		]);

		expect(sequential.canonicalPlanSha256).not.toBe(parallel.canonicalPlanSha256);
	});
});

describe('Agentic Chat tool execution graph runner', () => {
	it('reduces a three-call fixture from serial-sum time to one parallel layer', async () => {
		vi.useFakeTimers();
		try {
			const graph = compile([call(0, 'a'), call(1, 'b'), call(2, 'c')]);
			const startedAt = Date.now();
			const run = executeAgenticChatToolExecutionGraphV1({
				graph,
				maxConcurrency: 3,
				signal: new AbortController().signal,
				executeCall: async (current) => {
					await new Promise((resolve) => setTimeout(resolve, 100));
					return current.providerToolCallId;
				}
			});

			await vi.advanceTimersByTimeAsync(100);
			await run;
			expect(Date.now() - startedAt).toBe(100);
		} finally {
			vi.useRealTimers();
		}
	});

	it('starts every independent call before waiting for the first one to finish', async () => {
		const graph = compile([call(0, 'a'), call(1, 'b'), call(2, 'c')]);
		const gates = new Map([
			['a', deferred<string>()],
			['b', deferred<string>()],
			['c', deferred<string>()]
		]);
		const starts: string[] = [];
		const run = executeAgenticChatToolExecutionGraphV1({
			graph,
			maxConcurrency: 3,
			signal: new AbortController().signal,
			executeCall: async (current) => {
				starts.push(current.providerToolCallId);
				return gates.get(current.providerToolCallId)!.promise;
			}
		});

		await waitForStarts(starts, 3);
		expect(starts).toEqual(['a', 'b', 'c']);
		gates.get('c')!.resolve('C');
		gates.get('b')!.resolve('B');
		gates.get('a')!.resolve('A');

		await expect(run).resolves.toEqual({
			maxObservedConcurrency: 3,
			results: [
				{ providerToolCallId: 'a', status: 'fulfilled', value: 'A' },
				{ providerToolCallId: 'b', status: 'fulfilled', value: 'B' },
				{ providerToolCallId: 'c', status: 'fulfilled', value: 'C' }
			]
		});
	});

	it('does not dispatch a dependent layer until every prerequisite is terminal', async () => {
		const graph = compile([
			call(0, 'a', { call_ref: 'a' }),
			call(1, 'b', { call_ref: 'b' }),
			call(2, 'c', { call_ref: 'c', after: ['a', 'b'] })
		]);
		const gates = new Map([
			['a', deferred<string>()],
			['b', deferred<string>()],
			['c', deferred<string>()]
		]);
		const starts: string[] = [];
		const run = executeAgenticChatToolExecutionGraphV1({
			graph,
			maxConcurrency: 3,
			signal: new AbortController().signal,
			executeCall: async (current) => {
				starts.push(current.providerToolCallId);
				return gates.get(current.providerToolCallId)!.promise;
			}
		});

		await waitForStarts(starts, 2);
		gates.get('a')!.resolve('A');
		await Promise.resolve();
		expect(starts).toEqual(['a', 'b']);
		gates.get('b')!.resolve('B');
		await waitForStarts(starts, 3);
		expect(starts).toEqual(['a', 'b', 'c']);
		gates.get('c')!.resolve('C');
		await run;
	});

	it('enforces bounded fan-out inside a wide ready layer', async () => {
		const graph = compile(['a', 'b', 'c', 'd'].map((id, index) => call(index, id)));
		const gates = new Map(['a', 'b', 'c', 'd'].map((id) => [id, deferred<string>()]));
		const starts: string[] = [];
		const run = executeAgenticChatToolExecutionGraphV1({
			graph,
			maxConcurrency: 2,
			signal: new AbortController().signal,
			executeCall: async (current) => {
				starts.push(current.providerToolCallId);
				return gates.get(current.providerToolCallId)!.promise;
			}
		});

		await waitForStarts(starts, 2);
		expect(starts).toEqual(['a', 'b']);
		gates.get('b')!.resolve('B');
		await waitForStarts(starts, 3);
		expect(starts[2]).toBe('c');
		gates.get('a')!.resolve('A');
		await waitForStarts(starts, 4);
		expect(starts[3]).toBe('d');
		gates.get('c')!.resolve('C');
		gates.get('d')!.resolve('D');

		await expect(run).resolves.toMatchObject({ maxObservedConcurrency: 2 });
	});

	it('retains successful sibling receipts and skips only failed dependency branches', async () => {
		const graph = compile([
			call(0, 'a', { call_ref: 'a' }),
			call(1, 'b', { call_ref: 'b' }),
			call(2, 'after-a', { call_ref: 'after_a', after: ['a'] }),
			call(3, 'after-b', { call_ref: 'after_b', after: ['b'] })
		]);
		const starts: string[] = [];
		const failure = new Error('fixture failure');
		const result = await executeAgenticChatToolExecutionGraphV1({
			graph,
			maxConcurrency: 4,
			signal: new AbortController().signal,
			executeCall: async (current) => {
				starts.push(current.providerToolCallId);
				if (current.providerToolCallId === 'b') throw failure;
				return current.providerToolCallId.toUpperCase();
			}
		});

		expect(starts).toEqual(['a', 'b', 'after-a']);
		expect(result.results).toEqual([
			{ providerToolCallId: 'a', status: 'fulfilled', value: 'A' },
			{ providerToolCallId: 'b', status: 'rejected', error: failure },
			{ providerToolCallId: 'after-a', status: 'fulfilled', value: 'AFTER-A' },
			{
				providerToolCallId: 'after-b',
				status: 'skipped',
				reason: 'dependency_failed',
				blockedBy: ['b']
			}
		]);
	});

	it('propagates a durable domain-failure value without losing its provider feedback', async () => {
		const graph = compile([
			call(0, 'a', { call_ref: 'first' }),
			call(1, 'b', { call_ref: 'second', after: ['first'] })
		]);
		const run = await executeAgenticChatToolExecutionGraphV1({
			graph,
			maxConcurrency: 2,
			signal: new AbortController().signal,
			executeCall: async (current) => ({
				ok: current.providerToolCallId !== 'a',
				feedback: current.providerToolCallId
			}),
			isSuccessfulResult: (value) => value.ok
		});

		expect(run.results).toEqual([
			{
				providerToolCallId: 'a',
				status: 'failed',
				value: { ok: false, feedback: 'a' }
			},
			{
				providerToolCallId: 'b',
				status: 'skipped',
				reason: 'dependency_failed',
				blockedBy: ['a']
			}
		]);
	});

	it('announces a mutation layer before dispatch so read memo invalidation can finish first', async () => {
		const graph = compile([
			call(0, 'read', {}, { resources: [{ key: 'task:a', access: 'read' }] }),
			call(
				1,
				'write',
				{},
				{
					kind: 'mutation',
					resources: [{ key: 'task:b', access: 'write' }]
				}
			)
		]);
		const log: string[] = [];

		await executeAgenticChatToolExecutionGraphV1({
			graph,
			maxConcurrency: 2,
			signal: new AbortController().signal,
			onBeforeLayer: async (layer) => {
				if (layer.containsMutation) log.push('memo-invalidated');
			},
			executeCall: async (current) => {
				log.push(`dispatch:${current.providerToolCallId}`);
				return current.providerToolCallId;
			}
		});

		expect(log[0]).toBe('memo-invalidated');
		expect(log.slice(1).sort()).toEqual(['dispatch:read', 'dispatch:write']);
	});

	it('propagates cancellation to in-flight calls and never dispatches later layers', async () => {
		const graph = compile([
			call(0, 'a', { call_ref: 'a' }),
			call(1, 'b', { call_ref: 'b' }),
			call(2, 'later', { call_ref: 'later', after: ['a', 'b'] })
		]);
		const controller = new AbortController();
		const starts: string[] = [];
		const run = executeAgenticChatToolExecutionGraphV1({
			graph,
			maxConcurrency: 2,
			signal: controller.signal,
			executeCall: (current, signal) =>
				new Promise<string>((_resolve, reject) => {
					starts.push(current.providerToolCallId);
					signal.addEventListener(
						'abort',
						() => reject(signal.reason ?? new DOMException('Aborted', 'AbortError')),
						{ once: true }
					);
				})
		});

		await waitForStarts(starts, 2);
		controller.abort(new DOMException('Cancelled by fixture', 'AbortError'));
		const result = await run;

		expect(starts).toEqual(['a', 'b']);
		expect(result.results).toEqual([
			{
				providerToolCallId: 'a',
				status: 'skipped',
				reason: 'cancelled',
				blockedBy: []
			},
			{
				providerToolCallId: 'b',
				status: 'skipped',
				reason: 'cancelled',
				blockedBy: []
			},
			{
				providerToolCallId: 'later',
				status: 'skipped',
				reason: 'cancelled',
				blockedBy: []
			}
		]);
	});
});
