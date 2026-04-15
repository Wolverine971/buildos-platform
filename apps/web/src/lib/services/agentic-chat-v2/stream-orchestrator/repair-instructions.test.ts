// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import {
	buildGatewayMutationNoExecutionRepairInstruction,
	enforceMutationOutcomeIntegrity,
	shouldRepairGatewayMutationNoExecution,
	shouldRepairProjectCreateNoExecution
} from './repair-instructions';
import type { FastToolExecution } from './shared';

function createToolCall(name: string, args: Record<string, unknown>): ChatToolCall {
	return {
		id: `${name}:test`,
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

describe('repair instruction policy', () => {
	it('repairs schema-only write success claims even when the final text includes a question', () => {
		const toolExecutions = [
			createExecution({
				name: 'tool_schema',
				args: { op: 'onto.project.create', include_schema: true },
				result: {
					type: 'tool_schema',
					op: 'onto.project.create',
					tool_name: 'create_onto_project'
				}
			})
		];

		expect(
			shouldRepairGatewayMutationNoExecution({
				gatewayModeActive: true,
				contextType: 'global',
				finalText: 'Great, I have created the project. Which task should we tackle first?',
				toolExecutions,
				repairAlreadyInjected: false
			})
		).toBe(true);
		expect(buildGatewayMutationNoExecutionRepairInstruction(toolExecutions)).toContain(
			'Write ops already identified: onto.project.create'
		);
		expect(buildGatewayMutationNoExecutionRepairInstruction(toolExecutions)).toContain(
			'I was unable to <requested action>'
		);
	});

	it('allows pure clarifying questions after schema-only write discovery', () => {
		const toolExecutions = [
			createExecution({
				name: 'tool_schema',
				args: { op: 'onto.project.create', include_schema: true },
				result: {
					type: 'tool_schema',
					op: 'onto.project.create',
					tool_name: 'create_onto_project'
				}
			})
		];

		expect(
			shouldRepairGatewayMutationNoExecution({
				gatewayModeActive: true,
				contextType: 'global',
				finalText: 'What should we call this project?',
				toolExecutions,
				repairAlreadyInjected: false
			})
		).toBe(false);
	});

	it('does not force project_create repair when the assistant asks a pure clarification', () => {
		expect(
			shouldRepairProjectCreateNoExecution({
				contextType: 'project_create',
				finalText: 'What should we call this project?',
				toolExecutions: [],
				repairAlreadyInjected: false
			})
		).toBe(false);
	});

	it('blocks fake create success after tool_search only identified a write op', () => {
		const toolExecutions = [
			createExecution({
				name: 'tool_search',
				args: { query: 'create milestone', entity: 'milestone' },
				result: {
					type: 'tool_search_results',
					matches: [
						{
							op: 'onto.milestone.create',
							tool_name: 'create_onto_milestone'
						}
					]
				}
			})
		];

		expect(
			enforceMutationOutcomeIntegrity('I created the milestone.', {
				contextType: 'global',
				toolExecutions
			})
		).toBe(
			'I was unable to create that because no write call succeeded. Nothing changed yet; I need to retry with a valid payload.'
		);
	});

	it('blocks fake merge success after only discovering update tools', () => {
		const toolExecutions = [
			createExecution({
				name: 'tool_search',
				args: { query: 'update project state to archive old duplicate', entity: 'project' },
				result: {
					type: 'tool_search_results',
					matches: [
						{
							op: 'onto.project.update',
							tool_name: 'update_onto_project'
						}
					]
				}
			})
		];

		expect(
			enforceMutationOutcomeIntegrity('I merged the Ember projects.', {
				contextType: 'global',
				toolExecutions
			})
		).toBe(
			'I was unable to complete that update because no write call succeeded. Nothing changed yet; I need to retry with the exact ID and valid arguments.'
		);
	});
});
