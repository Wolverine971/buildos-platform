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

	it('uses registry kind so project search counts as a read operation', () => {
		const pattern = buildRoundToolPattern([
			createToolCall('search_project', {
				project_id: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
				query: 'Rod Chamberlin'
			})
		]);

		expect(pattern).toEqual({
			readOps: ['x.search.project'],
			hasWriteOps: false
		});
	});

	it('excludes pure gateway-discovery tools from read-op counting', () => {
		const pattern = buildRoundToolPattern([
			createToolCall('domain_search', { query: 'linkedin company page growth' }),
			createToolCall('domain_load', { domain: 'marketing.linkedin_company_page_growth' }),
			createToolCall('skill_search', { domain: 'marketing.youtube_growth', query: 'script' }),
			createToolCall('resource_search', {
				domain: 'product_and_design.ui_ux_quality',
				query: 'source map'
			}),
			createToolCall('resource_load', {
				resource: 'build_quality_ui_ux.source_map'
			}),
			createToolCall('tool_search', { query: 'search project' }),
			createToolCall('tool_schema', { op: 'x.search.project' }),
			createToolCall('skill_load', { id: 'plan_management' }),
			createToolCall('skill_reference_load', {
				skill: 'task_management',
				reference: 'task_management.state_coverage'
			})
		]);

		expect(pattern).toEqual({
			readOps: [],
			hasWriteOps: false
		});
	});

	it('still counts real reads in a round that mixes discovery and evidence reads', () => {
		const pattern = buildRoundToolPattern([
			createToolCall('tool_search', { query: 'document details' }),
			createToolCall('search_project', {
				project_id: '05c40ed8-9dbe-4893-bd64-8aeec90eab40',
				query: 'Rod Chamberlin'
			})
		]);

		expect(pattern).toEqual({
			readOps: ['x.search.project'],
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
