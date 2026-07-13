// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-classification.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import type { FastToolExecution } from './shared';
import {
	classifyToolExecution,
	classifyToolTraceName,
	doesToolExecutionRequireUserAction,
	didGatewayExecSucceed,
	didToolExecutionReachWriteExecutor,
	extractCanonicalOp,
	isDuplicateWriteSkippedExecution,
	isLikelyReadToolName,
	isLikelyWriteToolName,
	isPureReadToolName,
	isWriteLedgerToolExecution
} from './tool-classification';

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
	name: string;
	args?: Record<string, unknown>;
	result?: unknown;
	success?: boolean;
	error?: string;
}): FastToolExecution {
	const call = toolCall(params.name, params.args ?? {});
	const result: ChatToolResult = {
		tool_call_id: call.id,
		result: params.result ?? null,
		success: params.success ?? true,
		error: params.error
	};
	return { toolCall: call, result };
}

describe('tool classification', () => {
	it('classifies direct write, read, and discovery tool executions', () => {
		expect(
			classifyToolExecution(
				execution({
					name: 'update_onto_task',
					args: { task_id: 'task-1', state_key: 'done' }
				})
			)
		).toBe('write');
		expect(classifyToolExecution(execution({ name: 'search_project' }))).toBe('read_discovery');
		expect(
			classifyToolExecution(
				execution({
					name: 'tool_schema',
					args: { op: 'onto.task.update', include_schema: true }
				})
			)
		).toBe('read_discovery');
	});

	it('separates write intent from discovery tool execution', () => {
		const call = toolCall('tool_schema', {
			op: 'onto.task.update',
			include_schema: true
		});

		expect(extractCanonicalOp(call)).toBe('onto.task.update');
		expect(isLikelyWriteToolName(call.function.name, extractCanonicalOp(call))).toBe(true);
		const schemaExecution = {
			toolCall: call,
			result: { tool_call_id: call.id, result: null, success: true }
		};
		expect(classifyToolExecution(schemaExecution)).toBe('read_discovery');
		expect(isWriteLedgerToolExecution(schemaExecution)).toBe(false);
	});

	it('keeps pure read batching narrower than discovery/read classification', () => {
		expect(isLikelyReadToolName('skill_load')).toBe(true);
		expect(isPureReadToolName('skill_load')).toBe(false);
		expect(isPureReadToolName('search_project')).toBe(true);
	});

	it('keeps persisted trace classification compatible with existing summaries', () => {
		expect(classifyToolTraceName('tool_schema')).toBe('read_discovery');
		expect(classifyToolTraceName('change_chat_context')).toBe('write');
		expect(classifyToolTraceName('get_onto_project')).toBe('other');
	});

	it('detects gateway ok:false failures and duplicate skipped writes', () => {
		const failedGatewayWrite = execution({
			name: 'update_onto_task',
			result: { op: 'onto.task.update', ok: false }
		});
		const duplicate = execution({
			name: 'update_onto_task',
			result: {
				ok: true,
				result: {
					status: 'duplicate_write_skipped',
					skipped_duplicate_write: true
				}
			}
		});

		expect(didGatewayExecSucceed(failedGatewayWrite)).toBe(false);
		expect(isDuplicateWriteSkippedExecution(duplicate)).toBe(true);
		expect(isWriteLedgerToolExecution(duplicate)).toBe(false);
	});

	it('records a completed task move but not its confirmation preview', () => {
		const preview = execution({
			name: 'move_onto_task',
			result: { status: 'confirmation_required', requires_user_action: true }
		});
		const moved = execution({
			name: 'move_onto_task',
			result: { status: 'moved', task: { id: 'task-1' } }
		});
		const alreadyMoved = execution({
			name: 'move_onto_task',
			result: { status: 'already_moved', task: { id: 'task-1' } }
		});

		expect(isWriteLedgerToolExecution(preview)).toBe(false);
		expect(isWriteLedgerToolExecution(moved)).toBe(true);
		expect(isWriteLedgerToolExecution(alreadyMoved)).toBe(false);
		expect(doesToolExecutionRequireUserAction(preview)).toBe(true);
		expect(doesToolExecutionRequireUserAction(moved)).toBe(false);
	});

	it('distinguishes writes that reached execution from validation-only results', () => {
		expect(
			didToolExecutionReachWriteExecutor(
				execution({
					name: 'update_onto_task',
					error: 'Tool validation failed: Missing required parameter: task_id',
					success: false
				})
			)
		).toBe(false);
		expect(
			didToolExecutionReachWriteExecutor(
				execution({
					name: 'update_onto_task',
					result: { task: { id: 'task-1' } }
				})
			)
		).toBe(true);
	});
});
