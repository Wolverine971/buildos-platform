// apps/web/src/lib/services/agentic-chat-v2/prompt-observability.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolCall, ChatToolDefinition, ChatToolResult } from '@buildos/shared-types';
import { LITE_PROMPT_VARIANT } from '$lib/services/agentic-chat-lite/prompt';
import {
	buildPromptSnapshotRow,
	buildPromptSnapshotSections,
	buildToolCallEventPayload,
	buildToolResultEventPayload,
	deriveFirstLane,
	extractFastChatToolCallMeta,
	FASTCHAT_PROMPT_SNAPSHOT_VERSION
} from './prompt-observability';
import { buildPromptCostBreakdown } from './prompt-cost-breakdown';
import { FASTCHAT_PROMPT_VARIANT } from './prompt-variant';

describe('prompt observability helpers', () => {
	it('builds a stable prompt snapshot row', () => {
		const tools: ChatToolDefinition[] = [
			{
				type: 'function',
				function: {
					name: 'tool_schema',
					description: 'Lookup tool schema',
					parameters: { type: 'object', properties: { op: { type: 'string' } } }
				}
			}
		];

		const row = buildPromptSnapshotRow({
			turnRunId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
			sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
			userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
			streamRunId: 'stream-run-1',
			contextType: 'project',
			entityId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
			projectId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
			systemPrompt: 'You are BuildOS.',
			history: [{ role: 'assistant', content: 'Previous answer' }],
			message: 'What is happening with my project?',
			tools,
			requestPayload: { client_turn_id: 'turn-1', context_type: 'project' },
			promptSections: buildPromptSnapshotSections({
				contextType: 'project',
				projectId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
				projectName: '9takes',
				data: { projects: [] }
			}),
			contextPayload: { projectName: '9takes', data: { projects: [] } }
		});

		expect(row.snapshot_version).toBe(FASTCHAT_PROMPT_SNAPSHOT_VERSION);
		expect(row.prompt_variant).toBe(FASTCHAT_PROMPT_VARIANT);
		expect(row.system_prompt).toBe('You are BuildOS.');
		expect(Array.isArray(row.model_messages)).toBe(true);
		expect(row.tools_sha256).toMatch(/^[a-f0-9]{64}$/);
		expect(row.system_prompt_sha256).toMatch(/^[a-f0-9]{64}$/);
		expect(row.messages_sha256).toMatch(/^[a-f0-9]{64}$/);
		expect(row.rendered_dump_text).toContain('FASTCHAT V2 PROMPT SNAPSHOT');
		expect(row.rendered_dump_text).toContain('Prompt variant: fastchat_prompt_v1');
		expect(row.rendered_dump_text).toContain('stream-run-1');
		expect(row.rendered_dump_text).toContain('tool_schema');
		expect(row.message_chars).toBeGreaterThan(0);
		expect(row.approx_prompt_tokens).toBeGreaterThan(0);
		expect((row.prompt_sections as Record<string, unknown>).cost_breakdown).toBeDefined();
		expect((row.prompt_sections as Record<string, unknown>).prompt_variant).toBe(
			FASTCHAT_PROMPT_VARIANT
		);
	});

	it('persists lite prompt variant and section metadata in prompt snapshots', () => {
		const row = buildPromptSnapshotRow({
			turnRunId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
			sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
			userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
			streamRunId: 'stream-run-lite',
			contextType: 'global',
			promptVariant: LITE_PROMPT_VARIANT,
			systemPrompt: 'Lite system prompt',
			history: [],
			message: 'Use the lite prompt.',
			requestPayload: { prompt_variant: LITE_PROMPT_VARIANT },
			promptSections: buildPromptSnapshotSections({
				contextType: 'global',
				promptVariant: LITE_PROMPT_VARIANT,
				data: { projects: [] },
				liteSections: [
					{
						id: 'identity_mission',
						title: 'Identity and Mission',
						kind: 'static',
						source: 'lite.static_frame',
						content: 'Who: BuildOS',
						chars: 12,
						estimatedTokens: 3
					}
				],
				liteContextInventory: {
					focus: { contextType: 'global' },
					dataSummary: { topLevelKeys: ['projects'] }
				},
				liteToolsSummary: {
					contextType: 'global',
					totalTools: 7
				},
				toolSurfaceReport: {
					profile: 'current_request',
					toolCount: 7
				}
			}),
			contextPayload: { data: { projects: [] } },
			liteSections: [
				{
					id: 'identity_mission',
					title: 'Identity and Mission',
					kind: 'static',
					source: 'lite.static_frame',
					content: 'Who: BuildOS',
					chars: 12,
					estimatedTokens: 3
				}
			],
			liteContextInventory: {
				focus: { contextType: 'global' },
				dataSummary: { topLevelKeys: ['projects'] }
			},
			liteToolsSummary: {
				contextType: 'global',
				totalTools: 7
			},
			toolSurfaceReport: {
				profile: 'current_request',
				toolCount: 7
			}
		});

		const promptSections = row.prompt_sections as Record<string, unknown>;

		expect(row.prompt_variant).toBe(LITE_PROMPT_VARIANT);
		expect(row.request_payload).toMatchObject({ prompt_variant: LITE_PROMPT_VARIANT });
		expect(promptSections.prompt_variant).toBe(LITE_PROMPT_VARIANT);
		expect(promptSections.lite_sections).toBeDefined();
		expect(promptSections.lite_context_inventory).toBeDefined();
		expect(promptSections.lite_tools_summary).toBeDefined();
		expect(promptSections.tool_surface_report).toBeDefined();
		expect(row.rendered_dump_text).toContain('Prompt variant: lite_seed_v1');
		expect(row.rendered_dump_text).toContain('LITE SECTION BREAKDOWN');
		expect(row.rendered_dump_text).toContain('identity_mission - Identity and Mission');
	});

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

		expect(breakdown.sections.tools_text_block.chars).toBeGreaterThan(0);
		expect(breakdown.sections.context_payload.chars).toBeGreaterThan(0);
		expect(breakdown.tool_definitions.chars).toBeGreaterThan(0);
		expect(breakdown.provider_payload_estimate.chars).toBeGreaterThan(
			breakdown.model_messages.chars
		);
	});

	it('extracts canonical tool metadata for schema and direct tool calls', () => {
		const schemaCall: ChatToolCall = {
			id: 'tool-1',
			type: 'function',
			function: {
				name: 'tool_schema',
				arguments: JSON.stringify({ op: 'get_document_tree' })
			}
		};
		const directCall: ChatToolCall = {
			id: 'tool-2',
			type: 'function',
			function: {
				name: 'get_document_tree',
				arguments: JSON.stringify({ project_id: 'project-1' })
			}
		};
		const documentCreateCall: ChatToolCall = {
			id: 'tool-3',
			type: 'function',
			function: {
				name: 'create_onto_document',
				arguments: JSON.stringify({
					project_id: 'project-1',
					title: 'Launch brief',
					description: 'A concise project launch brief.'
				})
			}
		};

		expect(extractFastChatToolCallMeta(schemaCall)).toMatchObject({
			toolName: 'tool_schema',
			helpPath: 'onto.document.tree.get',
			canonicalOp: 'onto.document.tree.get'
		});
		expect(extractFastChatToolCallMeta(directCall)).toMatchObject({
			toolName: 'get_document_tree',
			helpPath: null,
			canonicalOp: 'onto.document.tree.get'
		});
		expect(extractFastChatToolCallMeta(documentCreateCall)).toMatchObject({
			toolName: 'create_onto_document',
			helpPath: null,
			canonicalOp: 'onto.document.create'
		});
	});

	it('builds compact event payloads for tool calls and results', () => {
		const toolCall: ChatToolCall = {
			id: 'tool-3',
			type: 'function',
			function: {
				name: 'get_project_overview',
				arguments: JSON.stringify({ query: '9takes' })
			}
		};
		const directToolCall: ChatToolCall = {
			id: 'tool-4',
			type: 'function',
			function: {
				name: 'create_onto_document',
				arguments: JSON.stringify({
					project_id: 'project-1',
					title: 'Launch brief',
					description: 'A concise project launch brief.'
				})
			}
		};
		const result: ChatToolResult = {
			tool_call_id: 'tool-3',
			result: { ok: true },
			success: false,
			error: 'Tool validation failed: Missing required parameter: project_id'
		};

		expect(buildToolCallEventPayload(toolCall)).toMatchObject({
			tool_name: 'get_project_overview',
			canonical_op: 'util.project.overview'
		});
		expect(buildToolCallEventPayload(directToolCall)).toMatchObject({
			tool_name: 'create_onto_document',
			canonical_op: 'onto.document.create',
			args: {
				project_id: 'project-1',
				title: 'Launch brief',
				description: 'A concise project launch brief.'
			}
		});
		expect(buildToolResultEventPayload(toolCall, result)).toMatchObject({
			tool_name: 'get_project_overview',
			canonical_op: 'util.project.overview',
			success: false,
			error: 'Tool validation failed: Missing required parameter: project_id'
		});
	});

	it('derives the lane from first help, skill, and op markers', () => {
		expect(
			deriveFirstLane({
				firstCanonicalOp: 'util.workspace.overview',
				firstOpSequence: 2
			})
		).toBe('overview');

		expect(
			deriveFirstLane({
				firstSkillPath: 'cal.skill',
				firstSkillSequence: 1,
				firstCanonicalOp: 'cal.event.update',
				firstOpSequence: 3
			})
		).toBe('skill_first');

		expect(
			deriveFirstLane({
				firstHelpPath: 'onto.task.update',
				firstHelpSequence: 1,
				firstCanonicalOp: 'onto.task.update',
				firstOpSequence: 2
			})
		).toBe('direct_exact_op');

		expect(deriveFirstLane({})).toBe('unknown');
	});
});
