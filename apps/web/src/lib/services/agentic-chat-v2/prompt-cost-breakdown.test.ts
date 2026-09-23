// apps/web/src/lib/services/agentic-chat-v2/prompt-cost-breakdown.test.ts
import { requireTestValue } from '$lib/test-helpers/require-test-value';
import { describe, expect, it } from 'vitest';
import type { ChatToolDefinition } from '@buildos/shared-types';
import { buildLitePromptEnvelope } from '$lib/services/agentic-chat-lite/prompt';
import { buildPromptCostBreakdown } from './prompt-cost-breakdown';

describe('buildPromptCostBreakdown', () => {
	it('estimates costs for prompt sections and provider tool definitions', () => {
		const tools: ChatToolDefinition[] = [
			{
				type: 'function',
				function: {
					name: 'update_onto_project',
					description: 'Update a project',
					parameters: {
						type: 'object',
						properties: {
							project_id: { type: 'string' },
							end_at: { type: ['string', 'null'] }
						}
					}
				}
			}
		];
		const systemPrompt = [
			'<instructions>',
			'### Capabilities',
			'',
			'Project management.',
			'',
			'### Skill Catalog',
			'',
			'| Skill ID | Description |',
			'|---|---|',
			'| `project_update` | Update projects |',
			'',
			'### Tools',
			'',
			'Full tool schema text here.',
			'',
			'## Execution Protocol',
			'',
			'Use direct tools first.',
			'',
			'## Agent Behavior',
			'',
			'Send a lead-in before tools.',
			'',
			'## Data Rules',
			'',
			'Use exact IDs.',
			'</instructions>',
			'',
			'<context>',
			'<context_description>The assistant is working inside the current project.</context_description>',
			'{"project":{"id":"project-123","name":"Launch"}}',
			'</context>'
		].join('\n');

		const breakdown = buildPromptCostBreakdown({
			systemPrompt,
			history: [{ role: 'assistant', content: 'Previous answer' }],
			userMessage: 'Remove the project end date',
			tools
		});

		expect(requireTestValue(breakdown.sections.tools_text_block).chars).toBeGreaterThan(0);
		expect(requireTestValue(breakdown.sections.context_payload).chars).toBeGreaterThan(0);
		expect(breakdown.tool_definitions.chars).toBeGreaterThan(0);
		expect(breakdown.provider_payload_estimate.chars).toBeGreaterThan(
			breakdown.model_messages.chars
		);
	});

	it('estimates costs for current lite markdown prompt sections', () => {
		const tools: ChatToolDefinition[] = [
			{
				type: 'function',
				function: {
					name: 'get_project_overview',
					description: 'Get a compact project overview',
					parameters: {
						type: 'object',
						properties: {
							project_id: { type: 'string' }
						}
					}
				}
			}
		];
		const envelope = buildLitePromptEnvelope({
			contextType: 'project',
			projectId: 'project-123',
			entityId: 'project-123',
			projectName: 'Launch',
			data: {
				project: { id: 'project-123', name: 'Launch', state_key: 'active' },
				tasks: [{ id: 'task-1', project_id: 'project-123', title: 'Ship telemetry fix' }]
			},
			tools
		});

		const breakdown = buildPromptCostBreakdown({
			systemPrompt: envelope.systemPrompt,
			history: [],
			userMessage: 'What is the current prompt cost?',
			tools
		});

		expect(
			requireTestValue(breakdown.sections.capabilities_skills_tools).chars
		).toBeGreaterThan(0);
		expect(requireTestValue(breakdown.sections.operating_strategy).chars).toBeGreaterThan(0);
		expect(requireTestValue(breakdown.sections.safety_data_rules).chars).toBeGreaterThan(0);
		expect(requireTestValue(breakdown.sections.focus_purpose).chars).toBeGreaterThan(0);
		expect(requireTestValue(breakdown.sections.location_loaded_context).chars).toBeGreaterThan(
			0
		);
		// 2026-09-04: retrieval boundaries render inside location_loaded_context.
		expect(breakdown.sections).not.toHaveProperty('context_inventory_retrieval');
		expect(requireTestValue(breakdown.sections.final_response_contract).chars).toBeGreaterThan(
			0
		);
		expect(breakdown.sections).not.toHaveProperty('skill_catalog');
		expect(breakdown.sections).not.toHaveProperty('tools_text_block');
		expect(breakdown.sections).not.toHaveProperty('execution_protocol');
		expect(breakdown.sections).not.toHaveProperty('agent_behavior');
	});
});
