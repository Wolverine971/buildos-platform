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
});
