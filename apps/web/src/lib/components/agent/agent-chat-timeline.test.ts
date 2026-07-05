// apps/web/src/lib/components/agent/agent-chat-timeline.test.ts
import { describe, expect, it } from 'vitest';
import type { AgentTimelineItem } from './agent-chat.types';
import {
	buildAgentTimeline,
	buildTimelineItemQuestionDraft,
	timelineItemsFromMessages
} from './agent-chat-timeline';

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

describe('agent-chat-timeline live messages', () => {
	it('creates a live change item from completed tool result metadata', () => {
		const items = timelineItemsFromMessages('session-1', [
			{
				id: 'block-1',
				type: 'thinking_block',
				content: 'Complete',
				timestamp: new Date('2026-06-20T12:00:00.000Z'),
				status: 'completed',
				activities: [
					{
						id: 'activity-1',
						content: 'Created document',
						timestamp: new Date('2026-06-20T12:00:00.000Z'),
						activityType: 'tool_call',
						status: 'completed',
						toolCallId: 'call-1',
						metadata: {
							toolName: 'create_onto_document',
							gatewayOp: 'onto.document.create',
							arguments: {
								title: 'Video Script',
								project_id: 'project-1'
							},
							result: {
								document: {
									id: 'doc-1',
									title: 'Video Script',
									project_id: 'project-1'
								}
							}
						}
					}
				]
			} as any
		]);

		const changeItem = items.find((item) => item.kind === 'change');

		expect(changeItem?.title).toBe('Created Document');
		expect(changeItem?.summary).toBe('Video Script');
		expect(changeItem?.entityRefs[0]).toMatchObject({
			kind: 'document',
			id: 'doc-1',
			title: 'Video Script',
			projectId: 'project-1',
			operation: 'created'
		});
	});

	it('uses live created-entity card messages as a fallback change source', () => {
		const items = timelineItemsFromMessages('session-1', [
			{
				id: 'created-1',
				type: 'created_entities',
				content: '',
				timestamp: new Date('2026-06-20T12:00:01.000Z'),
				data: {
					entities: [
						{
							kind: 'task',
							id: 'task-1',
							name: 'Draft launch hook',
							projectId: 'project-1'
						}
					]
				}
			} as any
		]);

		const changeItem = items.find((item) => item.kind === 'change');

		expect(changeItem?.title).toBe('Created Task');
		expect(changeItem?.summary).toBe('Draft launch hook');
		expect(changeItem?.entityRefs[0]).toMatchObject({
			kind: 'task',
			id: 'task-1',
			projectId: 'project-1',
			operation: 'created'
		});
	});

	it('does not double-count a created entity from a tool result and its created card', () => {
		const items = timelineItemsFromMessages('session-1', [
			{
				id: 'block-1',
				type: 'thinking_block',
				content: 'Complete',
				timestamp: new Date('2026-06-20T12:00:00.000Z'),
				status: 'completed',
				activities: [
					{
						id: 'activity-1',
						content: 'Created document',
						timestamp: new Date('2026-06-20T12:00:00.000Z'),
						activityType: 'tool_call',
						status: 'completed',
						toolCallId: 'call-1',
						metadata: {
							toolName: 'create_onto_document',
							gatewayOp: 'onto.document.create',
							arguments: {
								title: 'Video Script',
								project_id: 'project-1'
							},
							result: {
								document: {
									id: 'doc-1',
									title: 'Video Script',
									project_id: 'project-1'
								}
							}
						}
					}
				]
			} as any,
			{
				id: 'created-1',
				type: 'created_entities',
				content: '',
				timestamp: new Date('2026-06-20T12:00:01.000Z'),
				data: {
					entities: [
						{
							kind: 'document',
							id: 'doc-1',
							name: 'Video Script',
							projectId: 'project-1'
						}
					]
				}
			} as any
		]);

		expect(items.filter((item) => item.kind === 'change')).toHaveLength(1);
	});

	it('preserves live tool telemetry metadata for the changes and tools views', () => {
		const items = timelineItemsFromMessages('session-1', [
			{
				id: 'block-1',
				type: 'thinking_block',
				content: 'Search finished',
				timestamp: new Date('2026-06-20T12:00:00.000Z'),
				status: 'completed',
				activities: [
					{
						id: 'activity-1',
						content: 'Searched project',
						timestamp: new Date('2026-06-20T12:00:00.000Z'),
						activityType: 'tool_call',
						status: 'completed',
						toolCallId: 'call-search',
						metadata: {
							toolName: 'search_project',
							toolCategory: 'ontology',
							gatewayOp: 'x.search.project',
							helpPath: 'help/search-project',
							arguments: {
								query: 'missing',
								project_id: 'project-1'
							},
							result: {
								results: []
							},
							durationMs: 123,
							tokensConsumed: 45,
							resultCount: 0,
							zeroResult: true,
							requiresUserAction: true
						}
					}
				]
			} as any
		]);

		const toolItem = items.find((item) => item.kind === 'tool');

		expect(toolItem?.status).toBe('needs_input');
		expect(toolItem?.summary).toBe('0 results');
		expect(toolItem?.tool).toMatchObject({
			name: 'search_project',
			category: 'ontology',
			gatewayOp: 'x.search.project',
			helpPath: 'help/search-project',
			durationMs: 123,
			tokensConsumed: 45,
			resultCount: 0,
			zeroResult: true
		});
	});

	it('maps live affected-entity metadata into the restored tool timeline shape', () => {
		const items = timelineItemsFromMessages('session-1', [
			{
				id: 'block-1',
				type: 'thinking_block',
				content: 'Created task',
				timestamp: new Date('2026-06-20T12:00:00.000Z'),
				status: 'completed',
				activities: [
					{
						id: 'activity-1',
						content: 'Created task',
						timestamp: new Date('2026-06-20T12:00:00.000Z'),
						activityType: 'tool_call',
						status: 'completed',
						toolCallId: 'call-create',
						metadata: {
							toolName: 'create_onto_task',
							toolCategory: 'ontology',
							gateway_op: 'onto.task.create',
							stream_run_id: 'stream-run-1',
							client_turn_id: 'client-turn-1',
							turn_run_id: 'turn-run-1',
							arguments: {
								title: 'Launch checklist',
								project_id: 'project-1'
							},
							result: {
								task: {
									id: 'task-1',
									title: 'Launch checklist',
									project_id: 'project-1'
								}
							},
							affected_entities: [
								{
									kind: 'task',
									id: 'task-1',
									title: 'Launch checklist',
									project_id: 'project-1',
									operation: 'created'
								}
							],
							duration_ms: 33,
							tokens_consumed: 12
						}
					}
				]
			} as any
		]);

		const toolItem = items.find((item) => item.kind === 'tool');
		const changeItem = items.find((item) => item.kind === 'change');

		expect(toolItem).toMatchObject({
			status: 'completed',
			turnRunId: 'turn-run-1',
			streamRunId: 'stream-run-1',
			clientTurnId: 'client-turn-1',
			summary: 'Created task: Launch checklist',
			tool: {
				name: 'create_onto_task',
				category: 'ontology',
				gatewayOp: 'onto.task.create',
				durationMs: 33,
				tokensConsumed: 12
			},
			entityRefs: [
				expect.objectContaining({
					kind: 'task',
					id: 'task-1',
					title: 'Launch checklist',
					projectId: 'project-1',
					operation: 'created',
					url: '/projects/project-1?entity=task&entity_id=task-1'
				})
			]
		});
		expect(changeItem).toMatchObject({
			kind: 'change',
			status: 'completed',
			summary: 'Launch checklist'
		});
	});
});
