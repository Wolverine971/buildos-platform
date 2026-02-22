// apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.gateway.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ToolExecutionService } from './tool-execution-service';
import type { ChatToolCall } from '@buildos/shared-types';
import type { ServiceContext, ToolExecutorResponse } from '../shared/types';

const PROJECT_ID = '31021625-1377-4715-9fb4-f93102974628';
const PLAN_ID = '5489a6f8-f997-44e2-8c8c-e1a4e4f00a97';

function buildToolCall(args: Record<string, any>): ChatToolCall {
	return {
		id: 'call_test',
		type: 'function',
		function: {
			name: 'tool_exec',
			arguments: JSON.stringify(args)
		}
	};
}

function buildGatewayToolCall(
	name: 'tool_help' | 'tool_exec' | 'tool_batch',
	args: Record<string, any>
): ChatToolCall {
	return {
		id: 'call_test',
		type: 'function',
		function: {
			name,
			arguments: JSON.stringify(args)
		}
	};
}

function buildContext(): ServiceContext {
	return {
		sessionId: 'session_123',
		userId: 'user_123',
		contextType: 'project',
		entityId: PROJECT_ID,
		conversationHistory: []
	};
}

describe('ToolExecutionService gateway fallback', () => {
	it('falls back onto.plan.get without plan_id to list_onto_plans', async () => {
		const toolExecutor = vi.fn().mockResolvedValue({
			data: {
				plans: [{ id: PLAN_ID, name: 'Execution Plan' }]
			}
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({ op: 'onto.plan.get', args: {} }),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'list_onto_plans',
			expect.objectContaining({
				project_id: PROJECT_ID
			}),
			expect.any(Object)
		);
		expect((result.data as any)?.op).toBe('onto.plan.get');
		expect((result.data as any)?.result?._fallback?.reason).toBe('missing_required_id');
		expect((result.data as any)?.meta?.executed_op).toBe('onto.plan.list');
	});

	it('executes onto.plan.get directly when plan_id is provided', async () => {
		const toolExecutor = vi.fn().mockResolvedValue({
			data: {
				plan: { id: PLAN_ID, name: 'Execution Plan' }
			}
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'onto.plan.get',
				args: { plan_id: PLAN_ID }
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'get_onto_plan_details',
			expect.objectContaining({
				plan_id: PLAN_ID
			}),
			expect.any(Object)
		);
		expect((result.data as any)?.meta?.executed_op).toBeUndefined();
		expect((result.data as any)?.result?._fallback).toBeUndefined();
	});

	it('accepts legacy search arg alias and normalizes to query for onto.*.search ops', async () => {
		const toolExecutor = vi.fn().mockResolvedValue({
			data: {
				tasks: []
			}
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'onto.task.search',
				args: { search: 'launch checklist' }
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'search_onto_tasks',
			expect.objectContaining({
				query: 'launch checklist'
			}),
			expect.any(Object)
		);
	});

	it('normalizes legacy onto_projects.move_document_in_tree to gateway op alias', async () => {
		const documentId = '823f2215-f0c3-40b8-b468-8f1a592384f2';
		const toolExecutor = vi.fn().mockResolvedValue({
			data: {
				moved: true,
				document_id: documentId
			}
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'onto_projects.move_document_in_tree',
				args: { document_id: documentId }
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'move_document_in_tree',
			expect.objectContaining({
				project_id: PROJECT_ID,
				document_id: documentId
			}),
			expect.any(Object)
		);
		expect((result.data as any)?.op).toBe('onto_projects.move_document_in_tree');
		expect((result.data as any)?.meta?.executed_op).toBe('onto.document.tree.move');
		expect((result.data as any)?.meta?.warnings).toEqual(
			expect.arrayContaining([
				expect.stringContaining(
					'Normalized legacy op "onto_projects.move_document_in_tree" to "onto.document.tree.move".'
				)
			])
		);
	});

	it('normalizes bare legacy move_document_in_tree op to gateway canonical op', async () => {
		const documentId = '823f2215-f0c3-40b8-b468-8f1a592384f2';
		const toolExecutor = vi.fn().mockResolvedValue({
			data: {
				moved: true,
				document_id: documentId
			}
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'move_document_in_tree',
				args: { document_id: documentId }
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'move_document_in_tree',
			expect.objectContaining({
				project_id: PROJECT_ID,
				document_id: documentId
			}),
			expect.any(Object)
		);
		expect((result.data as any)?.op).toBe('move_document_in_tree');
		expect((result.data as any)?.meta?.executed_op).toBe('onto.document.tree.move');
		expect((result.data as any)?.meta?.warnings).toEqual(
			expect.arrayContaining([
				expect.stringContaining(
					'Normalized legacy op "move_document_in_tree" to "onto.document.tree.move".'
				)
			])
		);
	});

	it('allows null new_parent_id for onto.document.tree.move root placement', async () => {
		const documentId = '823f2215-f0c3-40b8-b468-8f1a592384f2';
		const toolExecutor = vi.fn().mockResolvedValue({
			data: {
				moved: true,
				document_id: documentId
			}
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'onto.document.tree.move',
				args: {
					document_id: documentId,
					new_parent_id: null,
					new_position: 0
				}
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'move_document_in_tree',
			expect.objectContaining({
				project_id: PROJECT_ID,
				document_id: documentId,
				new_parent_id: null,
				new_position: 0
			}),
			expect.any(Object)
		);
	});

	it('allows null clearing fields for onto.task.update', async () => {
		const taskId = '3f4c1f6f-77c6-45ab-9159-686dc2d92bc5';
		const toolExecutor = vi.fn().mockResolvedValue({
			data: {
				task: {
					id: taskId,
					title: 'Task'
				}
			}
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'onto.task.update',
				args: {
					task_id: taskId,
					goal_id: null,
					due_at: null
				}
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'update_onto_task',
			expect.objectContaining({
				task_id: taskId,
				goal_id: null,
				due_at: null
			}),
			expect.any(Object)
		);
	});

	it('normalizes onto_projects.doc_structure.tree.get and injects project_id', async () => {
		const toolExecutor = vi.fn().mockResolvedValue({
			data: {
				structure: { root: [] },
				documents: {},
				unlinked: []
			}
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'onto_projects.doc_structure.tree.get',
				args: {}
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'get_document_tree',
			expect.objectContaining({
				project_id: PROJECT_ID,
				include_documents: true
			}),
			expect.any(Object)
		);
		expect((result.data as any)?.op).toBe('onto_projects.doc_structure.tree.get');
		expect((result.data as any)?.meta?.executed_op).toBe('onto.document.tree.get');
		expect((result.data as any)?.meta?.warnings).toEqual(
			expect.arrayContaining([
				expect.stringContaining(
					'defaulted include_documents=true to expose unlinked documents'
				)
			])
		);
	});

	it('normalizes legacy tool_help paths for doc structure groups', async () => {
		const toolExecutor = vi.fn();
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildGatewayToolCall('tool_help', { path: 'onto_projects.doc_structure.tree' }),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect((result.data as any)?.type).toBe('directory');
		expect((result.data as any)?.path).toBe('onto.document.tree');
	});

	it('sanitizes malformed op wrappers and still executes canonical op', async () => {
		const taskId = '3f4c1f6f-77c6-45ab-9159-686dc2d92bc5';
		const toolExecutor = vi.fn().mockResolvedValue({
			data: { task: { id: taskId, title: 'Updated title' } }
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'tool_exec"> <parameter name="op">onto.task.update',
				args: { task_id: taskId, title: 'Updated title' }
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'update_onto_task',
			expect.objectContaining({
				task_id: taskId,
				title: 'Updated title'
			}),
			expect.any(Object)
		);
		expect((result.data as any)?.meta?.warnings).toEqual(
			expect.arrayContaining([expect.stringContaining('Sanitized malformed op')])
		);
	});

	it('maps create task name aliases to title', async () => {
		const toolExecutor = vi.fn().mockResolvedValue({
			data: { task: { id: 'task-1', title: 'Reach out to vendor' } }
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'onto.task.create',
				args: {
					name: 'Reach out to vendor'
				}
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'create_onto_task',
			expect.objectContaining({
				project_id: PROJECT_ID,
				title: 'Reach out to vendor'
			}),
			expect.any(Object)
		);
	});

	it('maps nested task.name alias to title for create task', async () => {
		const toolExecutor = vi.fn().mockResolvedValue({
			data: { task: { id: 'task-2', title: 'Call Small Business Bureau' } }
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'onto.task.create',
				args: {
					task: { name: 'Call Small Business Bureau' }
				}
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'create_onto_task',
			expect.objectContaining({
				project_id: PROJECT_ID,
				title: 'Call Small Business Bureau'
			}),
			expect.any(Object)
		);
	});

	it('maps update plan aliases to canonical update fields', async () => {
		const toolExecutor = vi.fn().mockResolvedValue({
			data: { plan: { id: PLAN_ID, name: 'Updated plan' } }
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'onto.plan.update',
				args: {
					plan_id: PLAN_ID,
					plan_name: 'Updated plan',
					plan_description: 'Expanded execution details'
				}
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'update_onto_plan',
			expect.objectContaining({
				plan_id: PLAN_ID,
				name: 'Updated plan',
				description: 'Expanded execution details'
			}),
			expect.any(Object)
		);
	});

	it('maps link aliases from from/to/relationship payloads', async () => {
		const toolExecutor = vi.fn().mockResolvedValue({
			data: { edge: { id: 'edge-1' } }
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'onto.edge.link',
				args: {
					from: { kind: 'plan', id: PLAN_ID },
					to: { kind: 'task', id: '3f4c1f6f-77c6-45ab-9159-686dc2d92bc5' },
					relationship: 'has_task'
				}
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'link_onto_entities',
			expect.objectContaining({
				src_kind: 'plan',
				src_id: PLAN_ID,
				dst_kind: 'task',
				dst_id: '3f4c1f6f-77c6-45ab-9159-686dc2d92bc5',
				rel: 'has_task'
			}),
			expect.any(Object)
		);
	});

	it('maps link aliases from src/dst objects and relation', async () => {
		const toolExecutor = vi.fn().mockResolvedValue({
			data: { edge: { id: 'edge-2' } }
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'onto.edge.link',
				args: {
					src: { kind: 'plan', id: PLAN_ID },
					dst: { kind: 'task', id: '3f4c1f6f-77c6-45ab-9159-686dc2d92bc5' },
					relation: 'has_task'
				}
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'link_onto_entities',
			expect.objectContaining({
				src_kind: 'plan',
				src_id: PLAN_ID,
				dst_kind: 'task',
				dst_id: '3f4c1f6f-77c6-45ab-9159-686dc2d92bc5',
				rel: 'has_task'
			}),
			expect.any(Object)
		);
	});
});
