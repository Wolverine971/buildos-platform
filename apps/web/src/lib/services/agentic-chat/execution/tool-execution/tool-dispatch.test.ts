// apps/web/src/lib/services/agentic-chat/execution/tool-execution/tool-dispatch.test.ts
import { describe, expect, it, vi } from 'vitest';
import { GATEWAY_TOOL_DEFINITIONS } from '@buildos/agentic-chat-runtime/catalog';
import type { ServiceContext, ToolExecutionResult } from '../../shared/types';
import { dispatchToolExecution } from './execution-runner';

const context: ServiceContext = {
	sessionId: 'session_1',
	userId: 'user_1',
	contextType: 'project',
	conversationHistory: []
};

describe('tool lane dispatch', () => {
	it('returns the standard timeout envelope for a stalled gateway handler', async () => {
		const result = await dispatchToolExecution({
			toolCall: {
				id: 'call_gateway_timeout',
				name: 'tool_schema',
				arguments: { op: 'onto.task.update' }
			},
			toolName: 'tool_schema',
			args: { op: 'onto.task.update' },
			context,
			availableTools: [],
			validationTools: GATEWAY_TOOL_DEFINITIONS,
			toolExecutor: vi.fn(),
			timeoutOverride: 10,
			executeGateway: () => new Promise<ToolExecutionResult>(() => undefined)
		});

		expect(result).toMatchObject({
			lane: 'gateway',
			timeoutMs: 10,
			result: {
				success: false,
				errorType: 'timeout',
				toolName: 'tool_schema',
				toolCallId: 'call_gateway_timeout'
			}
		});
		expect(result.result.error).toEqual(expect.stringContaining('timeout'));
	});

	it('keeps the full virtual-handler contract and identity envelope', async () => {
		const virtualHandler = vi.fn().mockResolvedValue({
			success: true,
			data: { plan: 'draft' },
			toolName: 'ignored',
			toolCallId: 'ignored'
		});
		const toolCall = {
			id: 'call_virtual',
			name: 'agent_create_plan',
			arguments: { objective: 'Ship' }
		};

		const dispatched = await dispatchToolExecution({
			toolCall,
			toolName: 'agent_create_plan',
			args: { objective: 'Ship' },
			context,
			availableTools: [],
			validationTools: [],
			virtualHandler,
			toolExecutor: vi.fn(),
			timeoutOverride: 0
		});

		expect(dispatched.result).toEqual({
			success: true,
			data: { plan: 'draft' },
			toolName: 'agent_create_plan',
			toolCallId: 'call_virtual'
		});
		expect(virtualHandler).toHaveBeenCalledWith({
			toolCall,
			toolName: 'agent_create_plan',
			args: { objective: 'Ship' },
			context,
			availableTools: []
		});
	});

	it('adapts successful core output and exposes the cleaned state value', async () => {
		const streamEvents = [{ type: 'text' as const, content: 'done' }];
		const metadata = { tokensUsed: 9 };
		const dispatched = await dispatchToolExecution({
			toolCall: { id: 'call_core', name: 'list_onto_tasks', arguments: {} },
			toolName: 'list_onto_tasks',
			args: {},
			context,
			availableTools: [],
			validationTools: [
				{
					name: 'list_onto_tasks',
					description: 'List tasks',
					parameters: { type: 'object', properties: {} }
				}
			],
			toolExecutor: vi.fn().mockResolvedValue({
				data: { id: 'task_1', _internal: true },
				streamEvents,
				metadata
			}),
			timeoutOverride: 0
		});

		expect(dispatched.cleanedCoreData).toEqual({ id: 'task_1' });
		expect(dispatched.result).toMatchObject({
			success: true,
			data: { id: 'task_1' },
			entitiesAccessed: ['task_1'],
			streamEvents,
			tokensUsed: 9,
			metadata
		});
	});

	it('preserves tool-not-loaded classification before core execution', async () => {
		const toolExecutor = vi.fn();
		const dispatched = await dispatchToolExecution({
			toolCall: { id: 'call_unknown', name: 'unknown_tool', arguments: {} },
			toolName: 'unknown_tool',
			args: {},
			context,
			availableTools: [],
			validationTools: [],
			toolExecutor
		});

		expect(dispatched.result).toEqual({
			success: false,
			error: 'Unknown tool: unknown_tool',
			errorType: 'tool_not_loaded',
			toolName: 'unknown_tool',
			toolCallId: 'call_unknown'
		});
		expect(toolExecutor).not.toHaveBeenCalled();
	});
});
