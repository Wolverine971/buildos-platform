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
});
