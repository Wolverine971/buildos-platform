// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-round-runner.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import type { FastToolExecution } from './shared';
import {
	executeToolCallPair,
	prepareToolRound,
	recordToolExecutionForRound
} from './tool-round-runner';
import type { KnownEntity } from './entity-kind-repair';
import type { ToolValidationIssue } from './tool-validation';

function toolCall(name: string, args: Record<string, unknown> = {}, id = name): ChatToolCall {
	return {
		id,
		type: 'function',
		function: {
			name,
			arguments: JSON.stringify(args)
		}
	};
}

function execution(params: {
	call: ChatToolCall;
	result?: unknown;
	success?: boolean;
	error?: string;
}): FastToolExecution {
	const result: ChatToolResult = {
		tool_call_id: params.call.id,
		result: params.result ?? null,
		success: params.success ?? true,
		error: params.error
	};
	return { toolCall: params.call, result };
}

describe('prepareToolRound', () => {
	it('records validation and blocked-retry terminal results before returning executable calls', async () => {
		const invalidCall = toolCall('update_onto_task', { state_key: 'done' }, 'invalid');
		const blockedCall = toolCall('update_onto_task', { task_id: 'task-1' }, 'blocked');
		const validCall = toolCall('search_project', { query: 'milestones' }, 'valid');
		const toolExecutions: FastToolExecution[] = [];
		const roundExecutions: FastToolExecution[] = [];
		const observeSupervisor = vi.fn();
		const onToolResult = vi.fn();
		const validationIssues: ToolValidationIssue[] = [
			{
				toolCall: invalidCall,
				toolName: 'update_onto_task',
				op: 'onto.task.update',
				errors: ['Missing required parameter: task_id']
			}
		];

		const prepared = await prepareToolRound({
			pendingToolCalls: [invalidCall, blockedCall, validCall],
			executableToolCalls: [invalidCall, blockedCall, validCall],
			validationIssues,
			blockedRetryCallIdsInRound: new Set([blockedCall.id]),
			toolExecutions,
			roundExecutions,
			observeSupervisor,
			onToolResult
		});

		expect(prepared.handledToolCallDelta).toBe(2);
		expect(prepared.modelPayloadChars).toBe(
			prepared.toolMessages.reduce((sum, message) => sum + message.content.length, 0)
		);
		expect(prepared.toolCallsToExecute).toEqual([
			{ original: validCall, executable: validCall }
		]);
		expect(prepared.toolMessages.map((message) => message.tool_call_id)).toEqual([
			'invalid',
			'blocked'
		]);
		expect(JSON.parse(prepared.toolMessages[0]?.content ?? '{}')).toMatchObject({
			op: 'onto.task.update',
			error: expect.stringContaining('Missing required parameter: task_id')
		});
		expect(JSON.parse(prepared.toolMessages[1]?.content ?? '{}')).toMatchObject({
			supervisor_recovery: { blocked_exact_retry: true }
		});
		expect(toolExecutions).toHaveLength(2);
		expect(roundExecutions).toHaveLength(2);
		expect(observeSupervisor).toHaveBeenCalledTimes(2);
		expect(onToolResult).toHaveBeenCalledTimes(2);
	});
});

describe('executeToolCallPair', () => {
	it('executes available direct tools and normalizes the returned tool call id', async () => {
		const call = toolCall('search_project', { query: 'timeline' }, 'original-call');
		const clearHeartbeat = vi.fn();
		const toolExecutor = vi.fn(async (): Promise<ChatToolResult> => {
			return {
				tool_call_id: 'executor-id',
				success: true,
				result: { results: [] }
			};
		});

		const dispatched = await executeToolCallPair({
			originalToolCall: call,
			toolCall: call,
			getTools: () => [],
			getAllowedToolNames: () => new Set(['search_project']),
			allowedToolNamesAtRoundStart: new Set(['search_project']),
			gatewayModeActive: false,
			validationProjectId: null,
			knownEntitiesById: new Map(),
			toolExecutor,
			materializeDirectTools: vi.fn(() => []),
			findDuplicateSuccessfulWrite: vi.fn(),
			startToolExecutionHeartbeat: vi.fn(() => clearHeartbeat)
		});

		expect(dispatched.executedToolCallDelta).toBe(1);
		expect(dispatched.execution.toolCall).toEqual(call);
		expect(dispatched.execution.result).toMatchObject({
			tool_call_id: 'original-call',
			success: true
		});
		expect(toolExecutor).toHaveBeenCalledWith(call, []);
		expect(clearHeartbeat).toHaveBeenCalledTimes(1);
	});

	it('skips duplicate writes with a compact previous-result summary', async () => {
		const call = toolCall(
			'update_onto_task',
			{ task_id: 'task-1', title: 'Updated title' },
			'duplicate-call'
		);
		const priorCall = toolCall(
			'update_onto_task',
			{ task_id: 'task-1', title: 'Updated title' },
			'prior-call'
		);
		const priorExecution = execution({
			call: priorCall,
			result: {
				status: 'updated',
				message: 'Updated the task.',
				task: {
					id: 'task-1',
					title: 'Updated title',
					state_key: 'todo'
				},
				large_payload: 'x'.repeat(1_000)
			}
		});
		const toolExecutor = vi.fn();

		const dispatched = await executeToolCallPair({
			originalToolCall: call,
			toolCall: call,
			getTools: () => [],
			getAllowedToolNames: () => new Set(['update_onto_task']),
			allowedToolNamesAtRoundStart: new Set(['update_onto_task']),
			gatewayModeActive: false,
			validationProjectId: null,
			knownEntitiesById: new Map(),
			toolExecutor,
			materializeDirectTools: vi.fn(() => []),
			findDuplicateSuccessfulWrite: vi.fn(() => priorExecution),
			startToolExecutionHeartbeat: vi.fn(() => vi.fn())
		});

		expect(dispatched.executedToolCallDelta).toBe(0);
		expect(toolExecutor).not.toHaveBeenCalled();
		expect(dispatched.execution.result).toMatchObject({
			tool_call_id: 'duplicate-call',
			success: true,
			result: {
				status: 'duplicate_write_skipped',
				skipped_duplicate_write: true,
				previous_tool_call_id: 'prior-call',
				previous_result_summary: {
					tool_call_id: 'prior-call',
					tool_name: 'update_onto_task',
					status: 'updated',
					entity: {
						id: 'task-1',
						type: 'task',
						title: 'Updated title',
						state_key: 'todo'
					}
				}
			}
		});
		expect(JSON.stringify(dispatched.execution.result.result)).not.toContain('large_payload');
	});
});

describe('recordToolExecutionForRound', () => {
	it('records ordered execution side effects and returns model replay metadata', async () => {
		const originalToolCall = toolCall(
			'update_onto_task',
			{ task_id: 'task-1', title: 'Updated title' },
			'original-call'
		);
		const recordedExecution = execution({
			call: originalToolCall,
			result: {
				task: {
					id: 'task-1',
					title: 'Updated title',
					state_key: 'todo'
				},
				materialized_tools: ['get_onto_task_details']
			}
		});
		const toolExecutions: FastToolExecution[] = [];
		const roundExecutions: FastToolExecution[] = [];
		const knownEntitiesById = new Map<string, KnownEntity>();
		const rememberSuccessfulWriteForDedup = vi.fn();
		const materializeDirectTools = vi.fn(() => []);
		const observeSupervisor = vi.fn();
		const onToolResult = vi.fn();

		const recorded = await recordToolExecutionForRound({
			originalToolCall,
			execution: recordedExecution,
			toolExecutions,
			roundExecutions,
			gatewayModeActive: true,
			knownEntitiesById,
			rememberSuccessfulWriteForDedup,
			materializeDirectTools,
			observeSupervisor,
			onToolResult
		});

		expect(recorded.handledToolCallDelta).toBe(1);
		expect(recorded.modelPayloadChars).toBe(recorded.toolMessage.content.length);
		expect(recorded.toolMessage).toMatchObject({
			role: 'tool',
			tool_call_id: 'original-call'
		});
		expect(recorded.toolMessage.content).toContain('model_context_notice');
		expect(toolExecutions).toEqual([recordedExecution]);
		expect(roundExecutions).toEqual([recordedExecution]);
		expect(rememberSuccessfulWriteForDedup).toHaveBeenCalledWith(recordedExecution);
		expect(materializeDirectTools).toHaveBeenCalledWith(
			expect.arrayContaining(['get_onto_task_details']),
			'Discovery loaded additional tools.'
		);
		expect(knownEntitiesById.get('task-1')).toMatchObject({
			id: 'task-1',
			kind: 'task',
			title: 'Updated title',
			stateKey: 'todo'
		});
		expect(observeSupervisor).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'tool_result_received',
				toolName: 'update_onto_task',
				toolCallId: 'original-call',
				success: true
			})
		);
		expect(onToolResult).toHaveBeenCalledWith(recordedExecution);
	});

	it('reports gateway ok:false as failed without throwing callback errors', async () => {
		const originalToolCall = toolCall(
			'update_onto_task',
			{ task_id: 'task-1', state_key: 'done' },
			'original-call'
		);
		const recordedExecution = execution({
			call: originalToolCall,
			result: { op: 'onto.task.update', ok: false },
			success: true
		});
		const observeSupervisor = vi.fn();

		await recordToolExecutionForRound({
			originalToolCall,
			execution: recordedExecution,
			toolExecutions: [],
			roundExecutions: [],
			gatewayModeActive: false,
			knownEntitiesById: new Map(),
			rememberSuccessfulWriteForDedup: vi.fn(),
			materializeDirectTools: vi.fn(() => []),
			observeSupervisor,
			onToolResult: vi.fn(() => {
				throw new Error('callback failed');
			})
		});

		expect(observeSupervisor).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'tool_result_received',
				success: false
			})
		);
	});
});
