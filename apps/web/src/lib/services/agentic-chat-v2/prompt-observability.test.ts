// apps/web/src/lib/services/agentic-chat-v2/prompt-observability.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolCall, ChatToolDefinition, ChatToolResult } from '@buildos/shared-types';
import {
	buildPromptSnapshotRow,
	buildPromptSnapshotSections,
	buildToolCallEventPayload,
	buildToolResultEventPayload,
	deriveFirstLane,
	extractFastChatToolCallMeta,
	FASTCHAT_PROMPT_SNAPSHOT_VERSION
} from './prompt-observability';

describe('prompt observability helpers', () => {
	it('builds a stable prompt snapshot row', () => {
		const tools: ChatToolDefinition[] = [
			{
				type: 'function',
				function: {
					name: 'tool_help',
					description: 'Lookup tool help',
					parameters: { type: 'object', properties: { path: { type: 'string' } } }
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
		expect(row.system_prompt).toBe('You are BuildOS.');
		expect(Array.isArray(row.model_messages)).toBe(true);
		expect(row.tools_sha256).toMatch(/^[a-f0-9]{64}$/);
		expect(row.system_prompt_sha256).toMatch(/^[a-f0-9]{64}$/);
		expect(row.messages_sha256).toMatch(/^[a-f0-9]{64}$/);
		expect(row.rendered_dump_text).toContain('FASTCHAT V2 PROMPT SNAPSHOT');
		expect(row.rendered_dump_text).toContain('stream-run-1');
		expect(row.rendered_dump_text).toContain('tool_help');
		expect(row.message_chars).toBeGreaterThan(0);
		expect(row.approx_prompt_tokens).toBeGreaterThan(0);
	});

	it('extracts canonical tool metadata for gateway calls', () => {
		const helpCall: ChatToolCall = {
			id: 'tool-1',
			type: 'function',
			function: {
				name: 'tool_help',
				arguments: JSON.stringify({ path: 'calendar.skill', format: 'full' })
			}
		};
		const execCall: ChatToolCall = {
			id: 'tool-2',
			type: 'function',
			function: {
				name: 'tool_exec',
				arguments: JSON.stringify({
					op: 'get_document_tree',
					args: { project_id: 'project-1' }
				})
			}
		};

		expect(extractFastChatToolCallMeta(helpCall)).toMatchObject({
			toolName: 'tool_help',
			helpPath: 'cal.skill',
			canonicalOp: null
		});
		expect(extractFastChatToolCallMeta(execCall)).toMatchObject({
			toolName: 'tool_exec',
			helpPath: null,
			canonicalOp: 'onto.document.tree.get'
		});
	});

	it('builds compact event payloads for tool calls and results', () => {
		const toolCall: ChatToolCall = {
			id: 'tool-3',
			type: 'function',
			function: {
				name: 'tool_exec',
				arguments: JSON.stringify({
					op: 'util.project.overview',
					args: { query: '9takes' }
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
			tool_name: 'tool_exec',
			canonical_op: 'util.project.overview'
		});
		expect(buildToolResultEventPayload(toolCall, result)).toMatchObject({
			tool_name: 'tool_exec',
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
