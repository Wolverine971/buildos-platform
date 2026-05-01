// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/round-analysis.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import {
	buildRoundToolPattern,
	extractGatewayRequiredFieldFailures,
	extractGatewayRequiredFieldFailuresFromValidationIssues
} from './round-analysis';
import type { FastToolExecution } from './shared';
import type { ToolValidationIssue } from './tool-validation';

function createToolCall(name: string, args: Record<string, unknown>): ChatToolCall {
	return {
		id: `${name}:${JSON.stringify(args)}`,
		type: 'function',
		function: {
			name,
			arguments: JSON.stringify(args)
		}
	};
}

function createExecution(params: {
	name: string;
	args: Record<string, unknown>;
	result?: unknown;
	success?: boolean;
	error?: string;
}): FastToolExecution {
	const toolCall = createToolCall(params.name, params.args);
	const result: ChatToolResult = {
		tool_call_id: toolCall.id,
		result: params.result ?? null,
		success: params.success ?? true,
		error: params.error
	};
	return { toolCall, result };
}

describe('round analysis helpers', () => {
	it('detects read-only and write direct tools in one round pattern', () => {
		const pattern = buildRoundToolPattern([
			createToolCall('list_onto_tasks', { limit: 10 }),
			createToolCall('create_onto_task', {
				project_id: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
				title: 'Draft chapter outline'
			})
		]);

		expect(pattern).toEqual({
			readOps: ['onto.task.list'],
			hasWriteOps: true
		});
	});

	it('treats web visits as read-like operations for repeated-read detection', () => {
		const pattern = buildRoundToolPattern([
			createToolCall('web_visit', { url: 'https://example.com/classes' })
		]);

		expect(pattern).toEqual({
			readOps: ['util.web.visit'],
			hasWriteOps: false
		});
	});

	it('aggregates required-field failures from validation issues', () => {
		const toolCall = createToolCall('update_onto_task', {});
		const issues: ToolValidationIssue[] = [
			{
				toolCall,
				toolName: 'update_onto_task',
				op: 'onto.task.update',
				errors: ['Missing required parameter: task_id']
			},
			{
				toolCall,
				toolName: 'update_onto_task',
				op: 'onto.task.update',
				errors: ['Missing required parameter: task_id']
			}
		];

		expect(extractGatewayRequiredFieldFailuresFromValidationIssues(issues)).toEqual([
			{ op: 'onto.task.update', field: 'task_id', occurrences: 2 }
		]);
	});

	it('extracts required-field failures from direct tool errors', () => {
		const failures = extractGatewayRequiredFieldFailures([
			createExecution({
				name: 'move_document_in_tree',
				args: { project_id: '05c40ed8-9dbe-4893-bd64-8aeec90eab40' },
				success: false,
				error: 'Missing required parameter: document_id'
			})
		]);

		expect(failures).toEqual([
			{ op: 'onto.document.tree.move', field: 'document_id', occurrences: 1 }
		]);
	});
});
