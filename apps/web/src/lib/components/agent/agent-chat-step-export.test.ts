// apps/web/src/lib/components/agent/agent-chat-step-export.test.ts
import { describe, expect, it } from 'vitest';
import type { AgentTimelineItem, ThinkingBlockMessage, UIMessage } from './agent-chat.types';
import { buildAgentChatStepsFilename, buildAgentChatStepsMarkdown } from './agent-chat-step-export';

const exportedAt = new Date('2026-06-20T12:00:00.000Z');

function userMessage(content: string): UIMessage {
	return {
		id: 'user-1',
		type: 'user',
		role: 'user',
		content,
		timestamp: new Date('2026-06-20T11:58:00.000Z')
	};
}

function assistantMessage(content: string): UIMessage {
	return {
		id: 'assistant-1',
		type: 'assistant',
		role: 'assistant',
		content,
		timestamp: new Date('2026-06-20T11:59:30.000Z')
	};
}

function thinkingBlock(): ThinkingBlockMessage {
	return {
		id: 'thinking-1',
		type: 'thinking_block',
		content: 'Complete',
		status: 'completed',
		agentState: 'thinking',
		activities: [
			{
				id: 'activity-1',
				content: 'Updating task Ship links',
				timestamp: new Date('2026-06-20T11:58:10.000Z'),
				activityType: 'tool_call',
				status: 'completed',
				toolCallId: 'tool-call-1',
				metadata: {
					toolName: 'onto.task.update',
					arguments: {
						id: 'task-1',
						title: 'Ship links'
					}
				}
			},
			{
				id: 'activity-2',
				content: 'Task updated',
				timestamp: new Date('2026-06-20T11:58:20.000Z'),
				activityType: 'operation',
				status: 'completed',
				metadata: {
					operationStatus: 'completed',
					operation: {
						action: 'update',
						entity_type: 'task',
						entity_id: 'task-1',
						status: 'completed'
					}
				}
			},
			{
				id: 'activity-3',
				content: 'Skill docs loaded',
				timestamp: new Date('2026-06-20T11:58:30.000Z'),
				activityType: 'general',
				status: 'completed',
				metadata: {
					skillPath: 'documents',
					skillAction: 'loaded',
					skillVia: 'skill_load'
				}
			}
		],
		timestamp: new Date('2026-06-20T11:58:05.000Z')
	};
}

describe('agent-chat-step-export', () => {
	it('exports the loaded chat timeline and all thinking block activities', () => {
		const markdown = buildAgentChatStepsMarkdown({
			messages: [
				userMessage('Please update the launch task.'),
				thinkingBlock(),
				assistantMessage('Done.')
			],
			sessionId: 'session-abc',
			contextLabel: 'Launch Plan',
			contextType: 'project',
			entityId: 'project-1',
			projectFocus: {
				projectId: 'project-1',
				projectName: 'Launch Plan',
				focusType: 'task',
				focusEntityId: 'task-1',
				focusEntityName: 'Ship assets'
			},
			exportedAt
		});

		expect(markdown).toContain('# BuildOS Agent Steps');
		expect(markdown).toContain('- Session ID: session-abc');
		expect(markdown).toContain('- Context: Launch Plan');
		expect(markdown).toContain(
			'- Project focus: project=Launch Plan, project_id=project-1, focus=task, focus_name=Ship assets, focus_id=task-1'
		);
		expect(markdown).toContain('- Messages exported: 3');
		expect(markdown).toContain('- Agent step blocks: 1');
		expect(markdown).toContain('- Activity entries: 3');
		expect(markdown).toContain('- Tool calls: 1');
		expect(markdown).toContain('## Turn 2 - Agent Steps');
		expect(markdown).toContain('1. **Tool Call** [completed]');
		expect(markdown).toContain('- Tool: `onto.task.update`');
		expect(markdown).toContain('- Tool call ID: `tool-call-1`');
		expect(markdown).toContain('- Arguments: `{"id":"task-1","title":"Ship links"}`');
		expect(markdown).toContain(
			'- Operation: `{"action":"update","entity_type":"task","entity_id":"task-1","status":"completed"}`'
		);
		expect(markdown).toContain('- Skill: `loaded documents via skill_load`');
	});

	it('keeps large metadata fields bounded', () => {
		const block = thinkingBlock();
		block.activities[0]!.metadata = {
			toolName: 'debug.large',
			arguments: {
				payload: 'x'.repeat(3_000)
			}
		};

		const markdown = buildAgentChatStepsMarkdown({
			messages: [block],
			contextLabel: 'Large Metadata',
			exportedAt
		});

		expect(markdown).toContain('[truncated');
		expect(markdown.length).toBeLessThan(5_000);
	});

	it('redacts obvious secrets in tool metadata', () => {
		const block = thinkingBlock();
		block.activities[0]!.metadata = {
			toolName: 'safe.export',
			arguments: {
				query: 'launch task',
				apiKey: 'secret-api-key',
				nested: {
					authorization: 'Bearer secret-token',
					password: 'secret-password'
				}
			}
		};

		const markdown = buildAgentChatStepsMarkdown({
			messages: [block],
			contextLabel: 'Secret Metadata',
			exportedAt
		});

		expect(markdown).toContain('"query":"launch task"');
		expect(markdown).toContain('"apiKey":"[redacted]"');
		expect(markdown).toContain('"authorization":"[redacted]"');
		expect(markdown).toContain('"password":"[redacted]"');
		expect(markdown).not.toContain('secret-api-key');
		expect(markdown).not.toContain('secret-token');
		expect(markdown).not.toContain('secret-password');
	});

	it('exports durable timeline sections when timeline items are available', () => {
		const timelineItems: AgentTimelineItem[] = [
			{
				id: 'turn_run:turn-1',
				sessionId: 'session-abc',
				source: 'turn_run',
				kind: 'status',
				status: 'completed',
				timestamp: '2026-06-20T11:58:00.000Z',
				title: 'Agent turn completed',
				summary: 'Create the launch task.',
				entityRefs: []
			},
			{
				id: 'tool_execution:exec-1',
				sessionId: 'session-abc',
				source: 'tool_execution',
				kind: 'tool',
				status: 'completed',
				timestamp: '2026-06-20T11:58:20.000Z',
				title: 'Ran Task Create',
				summary: 'Created task: Ship launch links',
				tool: {
					name: 'create_onto_task',
					gatewayOp: 'onto.task.create',
					argsPreview: '{"title":"Ship launch links"}',
					resultPreview: '[redacted sensitive fields]'
				},
				entityRefs: [
					{
						kind: 'task',
						id: 'task-1',
						title: 'Ship launch links',
						projectId: 'project-1',
						url: '/projects/project-1?entity=task&entity_id=task-1',
						operation: 'created'
					}
				],
				redaction: { resultRedacted: true, reason: 'sensitive fields' }
			},
			{
				id: 'entity_change:exec-1:task:task-1',
				sessionId: 'session-abc',
				source: 'entity_change',
				kind: 'change',
				status: 'completed',
				timestamp: '2026-06-20T11:58:20.000Z',
				title: 'Created Task',
				summary: 'Ship launch links',
				entityRefs: [
					{
						kind: 'task',
						id: 'task-1',
						title: 'Ship launch links',
						projectId: 'project-1',
						url: '/projects/project-1?entity=task&entity_id=task-1',
						operation: 'created'
					}
				]
			}
		];

		const markdown = buildAgentChatStepsMarkdown({
			messages: [userMessage('Create the launch task.'), assistantMessage('Done.')],
			timelineItems,
			sessionId: 'session-abc',
			contextLabel: 'Launch Plan',
			exportedAt
		});

		expect(markdown).toContain('- Timeline entries: 3');
		expect(markdown).toContain('## Steps');
		expect(markdown).toContain('## Tool Calls');
		expect(markdown).toContain('## Changes');
		expect(markdown).toContain('## Conversation');
		expect(markdown).toContain('- Tool: `create_onto_task`');
		expect(markdown).toContain('- Operation: `onto.task.create`');
		expect(markdown).toContain(
			'[created task: Ship launch links](/projects/project-1?entity=task&entity_id=task-1)'
		);
		expect(markdown).toContain('- Redaction: sensitive fields');
	});

	it('builds stable filenames from context and session', () => {
		expect(
			buildAgentChatStepsFilename({
				messages: [],
				contextLabel: 'Launch / Email Draft!',
				sessionId: 'abcdef123456',
				exportedAt
			})
		).toBe('buildos-agent-steps-launch-email-draft-abcdef12.md');
	});
});
