// apps/worker/tests/agenticChatToolExecutionPolicy.test.ts
import { describe, expect, it } from 'vitest';
import type { JsonObject } from '@buildos/shared-types';
import { compileAgenticChatToolExecutionGraphV1 } from '../src/workers/agentic-chat/tools/execution-graph';
import { resolveAgenticChatToolExecutionPolicyV1 } from '../src/workers/agentic-chat/tools/execution-policy';

describe('Agentic Chat tool execution policy', () => {
	it('orders reviewed archives and document creates by their shared project tree', () => {
		const project = '10000000-0000-4000-8000-000000000001';
		const otherProject = '10000000-0000-4000-8000-000000000002';
		const docs = [3, 4, 5, 6].map((id) => `10000000-0000-4000-8000-00000000000${id}`);
		const archive = (documentId: string, projectId: string, children: string[] = []) => ({
			toolName: 'update_onto_document',
			arguments: {
				document_id: documentId,
				state_key: 'archived',
				archive_mode: 'archive_children',
				_archive_review: {
					project_id: projectId,
					document_id: documentId,
					archive_mode: 'archive_children',
					target_updated_at: '2026-09-29T00:00:00Z',
					tree_fingerprint: 'reviewed',
					archived_document_ids: [documentId, ...children],
					documents: [documentId, ...children].map((id) => ({
						id,
						title: 'Doc',
						effect: 'archive'
					})),
					public_pages: []
				}
			} as JsonObject
		});
		const calls = [
			archive(docs[0]!, project, [docs[3]!]),
			archive(docs[1]!, project),
			archive(docs[2]!, otherProject),
			{
				toolName: 'update_onto_plan',
				arguments: { plan_id: 'plan', state_key: 'completed' }
			},
			{
				toolName: 'update_onto_document',
				arguments: { document_id: docs[3]!, title: 'Updated child' }
			},
			{
				toolName: 'create_onto_document',
				arguments: { project_id: project, title: 'New doc' }
			}
		];
		const graph = compileAgenticChatToolExecutionGraphV1({
			batchId: 'reviewed-mixed-cleanup',
			maxCalls: 8,
			calls: calls.map((call, providerCallIndex) => ({
				...call,
				kind: 'mutation' as const,
				providerCallIndex,
				providerToolCallId: `call-${providerCallIndex}`,
				...resolveAgenticChatToolExecutionPolicyV1({
					...call,
					kind: 'mutation',
					concurrentReadsEnabled: true,
					concurrentMutationsEnabled: true
				})
			}))
		});
		expect(graph.layers.map((layer) => layer.providerToolCallIds)).toEqual([
			['call-0', 'call-2', 'call-3'],
			['call-1', 'call-4'],
			['call-5']
		]);
	});

	it.each(['archived', 'archive'])(
		'keeps %s archives without server facts serial',
		(state_key) => {
			expect(
				resolveAgenticChatToolExecutionPolicyV1({
					toolName: 'update_onto_document',
					kind: 'mutation',
					arguments: { document_id: 'doc', state_key, project_id: 'actor-supplied' },
					concurrentReadsEnabled: true,
					concurrentMutationsEnabled: true
				})
			).toEqual({ executionPolicy: 'serial', resources: [] });
		}
	);
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

	it('lets goal, plan, milestone and risk creates share their project with task creates', () => {
		const mutation = (toolName: string, arguments_: Record<string, string>) => ({
			toolName,
			kind: 'mutation' as const,
			arguments: arguments_,
			...resolveAgenticChatToolExecutionPolicyV1({
				toolName,
				kind: 'mutation',
				arguments: arguments_,
				concurrentReadsEnabled: true,
				concurrentMutationsEnabled: true
			})
		});
		const calls = [
			mutation('create_onto_goal', { project_id: 'p1', name: 'Launch' }),
			mutation('create_onto_plan', { project_id: 'p1', name: 'Rollout' }),
			mutation('create_onto_milestone', { project_id: 'p1', title: 'Beta' }),
			mutation('create_onto_risk', { project_id: 'p1', title: 'Slip' }),
			mutation('create_onto_task', { project_id: 'p1', title: 'Ship' })
		];
		for (const call of calls) {
			expect(call.resources).toEqual([{ key: 'project:p1', access: 'read' }]);
		}

		const graph = compileAgenticChatToolExecutionGraphV1({
			batchId: 'mixed-creates',
			maxCalls: 40,
			calls: calls.map((call, index) => ({
				...call,
				providerCallIndex: index,
				providerToolCallId: `create-${index}`
			}))
		});
		expect(graph.layers.map((layer) => layer.providerToolCallIds.length)).toEqual([5]);
	});

	it('runs links together and orders them after an update of either endpoint', () => {
		const mutation = (toolName: string, arguments_: Record<string, string>) => ({
			toolName,
			kind: 'mutation' as const,
			arguments: arguments_,
			...resolveAgenticChatToolExecutionPolicyV1({
				toolName,
				kind: 'mutation',
				arguments: arguments_,
				concurrentReadsEnabled: true,
				concurrentMutationsEnabled: true
			})
		});
		const link = (src: string, dst: string) =>
			mutation('link_onto_entities', {
				src_kind: 'task',
				src_id: src,
				dst_kind: 'task',
				dst_id: dst,
				rel: 'depends_on'
			});
		expect(link('t2', 't1').resources).toEqual([
			{ key: 'task:t1', access: 'read' },
			{ key: 'task:t2', access: 'read' }
		]);

		// Tasker 101 case 2: three dependency links compile to one layer.
		const links = [link('t2', 't1'), link('t3', 't2'), link('t4', 't3')];
		const linkGraph = compileAgenticChatToolExecutionGraphV1({
			batchId: 'case-2-links',
			maxCalls: 40,
			calls: links.map((call, index) => ({
				...call,
				providerCallIndex: index,
				providerToolCallId: `link-${index}`
			}))
		});
		expect(linkGraph.layers.map((layer) => layer.providerToolCallIds.length)).toEqual([3]);

		const updateThenLink = [
			mutation('update_onto_task', { task_id: 't2', state_key: 'done' }),
			link('t2', 't1')
		];
		const orderedGraph = compileAgenticChatToolExecutionGraphV1({
			batchId: 'update-then-link',
			maxCalls: 40,
			calls: updateThenLink.map((call, index) => ({
				...call,
				providerCallIndex: index,
				providerToolCallId: `call-${index}`
			}))
		});
		expect(orderedGraph.layers.map((layer) => layer.providerToolCallIds)).toEqual([
			['call-0'],
			['call-1']
		]);

		expect(
			resolveAgenticChatToolExecutionPolicyV1({
				toolName: 'link_onto_entities',
				kind: 'mutation',
				arguments: { src_id: 't2', dst_kind: 'task', dst_id: 't1', rel: 'depends_on' },
				concurrentReadsEnabled: true,
				concurrentMutationsEnabled: true
			})
		).toEqual({ executionPolicy: 'serial', resources: [] });
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
