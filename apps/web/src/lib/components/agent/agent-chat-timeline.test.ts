// apps/web/src/lib/components/agent/agent-chat-timeline.test.ts
import { describe, expect, it } from 'vitest';
import type { AgentTimelineItem } from './agent-chat.types';
import { buildAgentTimeline, buildTimelineItemQuestionDraft } from './agent-chat-timeline';

function timelineItem(overrides: Partial<AgentTimelineItem> = {}): AgentTimelineItem {
	return {
		id: 'tool_execution:exec-1',
		sessionId: 'session-1',
		source: 'tool_execution',
		kind: 'tool',
		status: 'completed',
		timestamp: '2026-06-20T12:00:00.000Z',
		title: 'Updated launch notes',
		summary: 'The document was updated with the latest launch copy.',
		tool: {
			name: 'update_onto_document',
			gatewayOp: 'onto.document.update'
		},
		projectRef: {
			kind: 'project',
			id: 'project-1',
			title: 'Launch Project',
			url: '/projects/project-1'
		},
		entityRefs: [
			{
				kind: 'document',
				id: 'doc-1',
				title: 'Launch Notes',
				projectId: 'project-1',
				url: '/projects/project-1?doc=doc-1',
				operation: 'updated'
			}
		],
		...overrides
	};
}

describe('agent-chat-timeline ask draft', () => {
	it('builds a concise question with tool and entity context', () => {
		const draft = buildTimelineItemQuestionDraft(timelineItem());

		expect(draft).toContain('Can you explain this tool and what I should do next?');
		expect(draft).toContain('Timeline item: Updated launch notes');
		expect(draft).toContain('Status: completed');
		expect(draft).toContain('Summary: The document was updated with the latest launch copy.');
		expect(draft).toContain('Tool: update_onto_document (onto.document.update)');
		expect(draft).toContain('project: Launch Project (project-1)');
		expect(draft).toContain('document: Launch Notes (doc-1, updated)');
		expect(draft).toContain('Timeline item id: tool_execution:exec-1');
	});

	it('includes failure context when a timeline item has a tool error', () => {
		const draft = buildTimelineItemQuestionDraft(
			timelineItem({
				status: 'failed',
				title: 'Calendar write failed',
				summary: null,
				tool: {
					name: 'update_calendar_event',
					gatewayOp: 'calendar.event.update',
					errorMessage: 'Missing Google credentials'
				},
				entityRefs: []
			})
		);

		expect(draft).toContain('Timeline item: Calendar write failed');
		expect(draft).toContain('Status: failed');
		expect(draft).toContain('Tool: update_calendar_event (calendar.event.update)');
		expect(draft).toContain('Error: Missing Google credentials');
	});
});

describe('agent-chat-timeline safe JSON expansion', () => {
	it('includes pretty full JSON for safe tool args and results', () => {
		const items = buildAgentTimeline({
			sessionId: 'session-1',
			toolExecutions: [
				{
					id: 'exec-1',
					tool_name: 'update_onto_task',
					arguments: {
						task_id: 'task-1',
						title: 'Ship launch copy'
					},
					result: {
						task: {
							id: 'task-1',
							title: 'Ship launch copy'
						}
					},
					success: true,
					created_at: '2026-06-20T12:00:00.000Z'
				}
			]
		});

		const toolItem = items.find((item) => item.kind === 'tool');

		expect(toolItem?.tool?.argsPreview).toBe('{"task_id":"task-1","title":"Ship launch copy"}');
		expect(toolItem?.tool?.argsFullJson).toContain('"task_id": "task-1"');
		expect(toolItem?.tool?.resultFullJson).toContain('"title": "Ship launch copy"');
		expect(toolItem?.redaction?.argsRedacted).toBe(false);
	});

	it('redacts sensitive tool payloads and withholds full JSON', () => {
		const items = buildAgentTimeline({
			sessionId: 'session-1',
			toolExecutions: [
				{
					id: 'exec-1',
					tool_name: 'call_corsair_mcp_tool',
					arguments: {
						name: 'private_tool',
						authorization: 'Bearer secret-token'
					},
					result: {
						ok: true,
						refresh_token: 'secret-refresh-token'
					},
					success: true,
					created_at: '2026-06-20T12:00:00.000Z'
				}
			]
		});

		const toolItem = items.find((item) => item.kind === 'tool');

		expect(toolItem?.tool?.argsPreview).toBe('[redacted sensitive fields]');
		expect(toolItem?.tool?.resultPreview).toBe('[redacted sensitive fields]');
		expect(toolItem?.tool?.argsFullJson).toBeNull();
		expect(toolItem?.tool?.resultFullJson).toBeNull();
		expect(toolItem?.redaction?.argsRedacted).toBe(true);
		expect(toolItem?.redaction?.resultRedacted).toBe(true);
	});
});
