// apps/web/src/lib/components/agent/agent-chat-session.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatSession } from '@buildos/shared-types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
import type { VoiceNote } from '$lib/types/voice-notes';
import {
	buildAgentChatSessionSnapshot,
	deriveSessionTitle,
	loadAgentChatSessionSnapshot,
	prewarmAgentContext,
	warmAgentChatStreamTransport
} from './agent-chat-session';

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
	return {
		id: 'session-1',
		user_id: 'user-1',
		context_type: 'global',
		entity_id: null,
		title: 'Agent Session',
		auto_title: null,
		summary: null,
		agent_metadata: null,
		...overrides
	} as ChatSession;
}

describe('agent-chat-session helpers', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('deriveSessionTitle prefers a non-placeholder manual title and falls back to auto title', () => {
		expect(
			deriveSessionTitle(
				makeSession({
					title: 'Weekly project review',
					auto_title: 'Auto title'
				})
			)
		).toBe('Weekly project review');

		expect(
			deriveSessionTitle(
				makeSession({
					title: 'Agent Session',
					auto_title: 'Plan review follow-up'
				})
			)
		).toBe('Plan review follow-up');
	});

	it('buildAgentChatSessionSnapshot restores project focus, filters messages, and sorts voice notes', () => {
		const focus: ProjectFocus = {
			focusType: 'task',
			focusEntityId: 'task-1',
			focusEntityName: 'Homepage cleanup',
			projectId: 'project-1',
			projectName: 'Website refresh'
		};
		const voiceNotes: VoiceNote[] = [
			{
				id: 'note-2',
				group_id: 'group-1',
				segment_index: 2,
				created_at: '2026-03-28T10:02:00.000Z'
			},
			{
				id: 'note-1',
				group_id: 'group-1',
				segment_index: 1,
				created_at: '2026-03-28T10:01:00.000Z'
			}
		] as VoiceNote[];

		const snapshot = buildAgentChatSessionSnapshot({
			session: makeSession({
				context_type: 'project',
				entity_id: 'project-1',
				title: 'Agent Session',
				auto_title: 'Website refresh thread',
				summary: 'You were reorganizing homepage tasks.',
				agent_metadata: { focus }
			}),
			messages: [
				{
					id: 'assistant-1',
					role: 'assistant',
					content: 'Here is the latest update.',
					created_at: '2026-03-28T10:00:00.000Z'
				},
				{
					id: 'tool-1',
					role: 'tool',
					content: 'hidden tool output',
					created_at: '2026-03-28T10:00:30.000Z'
				}
			] as any,
			truncated: true,
			voiceNotes
		});

		expect(snapshot.contextType).toBe('project');
		expect(snapshot.selectedContextLabel).toBe('Website refresh thread');
		expect(snapshot.selectedEntityId).toBe('project-1');
		expect(snapshot.projectFocus).toEqual(focus);
		expect(snapshot.messages).toHaveLength(2);
		expect(snapshot.messages[0]?.type).toBe('activity');
		expect(snapshot.messages[1]?.id).toBe('assistant-1');
		expect(snapshot.voiceNotesByGroupId['group-1']?.map((note) => note.id)).toEqual([
			'note-1',
			'note-2'
		]);
	});

	it('buildAgentChatSessionSnapshot restores persisted tool executions before assistant replies', () => {
		const snapshot = buildAgentChatSessionSnapshot({
			session: makeSession(),
			messages: [
				{
					id: 'user-1',
					role: 'user',
					content: 'Create a task for the history page fix.',
					created_at: '2026-03-28T10:00:00.000Z'
				},
				{
					id: 'assistant-1',
					role: 'assistant',
					content: 'Created the task.',
					created_at: '2026-03-28T10:01:00.000Z'
				}
			] as any,
			toolExecutions: [
				{
					id: 'exec-1',
					message_id: 'assistant-1',
					client_turn_id: 'turn-1',
					tool_name: 'create_onto_task',
					gateway_op: null,
					sequence_index: 1,
					arguments: { title: 'Fix restored chat tool calls' },
					result: { task: { id: 'task-1', title: 'Fix restored chat tool calls' } },
					execution_time_ms: 184,
					success: true,
					error_message: null,
					created_at: '2026-03-28T10:00:30.000Z'
				}
			] as any
		});

		expect(snapshot.messages.map((message) => message.type)).toEqual([
			'user',
			'thinking_block',
			'assistant'
		]);
		const block = snapshot.messages[1];
		expect(block?.type).toBe('thinking_block');
		expect((block as any).activities).toHaveLength(1);
		expect((block as any).activities[0]).toMatchObject({
			activityType: 'tool_call',
			status: 'completed',
			content: 'Created task: "Fix restored chat tool calls" (184ms)'
		});
	});

	it('buildAgentChatSessionSnapshot exposes active turn runs for restore polling', () => {
		const snapshot = buildAgentChatSessionSnapshot({
			session: makeSession(),
			messages: [
				{
					id: 'user-1',
					role: 'user',
					content: 'Continue the forecast.',
					created_at: '2026-03-28T10:00:00.000Z'
				}
			] as any,
			turnRuns: [
				{
					id: 'turn-run-1',
					session_id: 'session-1',
					stream_run_id: 'stream-1',
					status: 'running',
					request_message: 'Continue the forecast.',
					started_at: '2026-03-28T10:00:00.000Z'
				}
			]
		});

		expect(snapshot.activeTurnRun?.id).toBe('turn-run-1');
		expect(snapshot.turnRuns).toHaveLength(1);
		expect(snapshot.messages.map((message) => message.type)).toEqual(['user', 'activity']);
		expect(snapshot.messages[1]?.content).toContain('still finishing');
	});

	it('buildAgentChatSessionSnapshot dedupes tool executions matched by both message and turn id', () => {
		const snapshot = buildAgentChatSessionSnapshot({
			session: makeSession(),
			messages: [
				{
					id: 'assistant-1',
					role: 'assistant',
					content: 'Updated the task.',
					created_at: '2026-03-28T10:01:00.000Z',
					metadata: { client_turn_id: 'turn-1' }
				}
			] as any,
			toolExecutions: [
				{
					id: 'exec-1',
					message_id: 'assistant-1',
					client_turn_id: 'turn-1',
					tool_name: 'update_onto_task',
					gateway_op: null,
					sequence_index: 1,
					arguments: { title: 'Fix restored chat tool calls' },
					result: { task: { id: 'task-1', title: 'Fix restored chat tool calls' } },
					execution_time_ms: 91,
					success: true,
					error_message: null,
					created_at: '2026-03-28T10:00:30.000Z'
				}
			] as any
		});

		const block = snapshot.messages[0];
		expect(block?.type).toBe('thinking_block');
		expect((block as any).activities).toHaveLength(1);
		expect((block as any).activities.map((activity: any) => activity.id)).toEqual([
			'restored-tool-tool_execution-exec-1'
		]);
	});

	it('buildAgentChatSessionSnapshot falls back to compact assistant tool trace metadata', () => {
		const snapshot = buildAgentChatSessionSnapshot({
			session: makeSession(),
			messages: [
				{
					id: 'assistant-1',
					role: 'assistant',
					content: 'Updated the project.',
					created_at: '2026-03-28T10:01:00.000Z',
					metadata: {
						fastchat_tool_trace_v1: [
							{
								tool_call_id: 'call-1',
								tool_name: 'update_onto_project',
								success: true,
								arguments_preview: '{"project_name":"Website refresh"}'
							}
						]
					}
				}
			] as any
		});

		expect(snapshot.messages[0]?.type).toBe('thinking_block');
		expect((snapshot.messages[0] as any).activities[0]).toMatchObject({
			status: 'completed',
			content: 'Updated project: "Website refresh"'
		});
	});

	it('buildAgentChatSessionSnapshot restores project overview labels with project names', () => {
		const snapshot = buildAgentChatSessionSnapshot({
			session: makeSession(),
			messages: [
				{
					id: 'assistant-1',
					role: 'assistant',
					content: 'Here is the project overview.',
					created_at: '2026-03-28T10:01:00.000Z'
				}
			] as any,
			toolExecutions: [
				{
					id: 'exec-1',
					message_id: 'assistant-1',
					client_turn_id: 'turn-1',
					tool_name: 'get_project_overview',
					gateway_op: 'util.project.overview',
					sequence_index: 1,
					arguments: { project_id: '4cfdbed1-840a-4fe4-9751-77c7884daa70' },
					result: {
						project: {
							id: '4cfdbed1-840a-4fe4-9751-77c7884daa70',
							name: '9takes'
						}
					},
					execution_time_ms: 55,
					success: true,
					error_message: null,
					created_at: '2026-03-28T10:00:30.000Z'
				}
			] as any
		});

		expect(snapshot.messages[0]?.type).toBe('thinking_block');
		expect((snapshot.messages[0] as any).activities[0]).toMatchObject({
			status: 'completed',
			content: 'Loaded project overview: "9takes" (55ms)'
		});
	});

	it('prewarmAgentContext returns parsed session data from the v2 prewarm endpoint', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				success: true,
				data: {
					session: { id: 'session-2' },
					prewarmed_context: { key: 'global:none' }
				}
			})
		});
		vi.stubGlobal('fetch', fetchMock);

		const result = await prewarmAgentContext({
			context_type: 'global',
			ensure_session: true
		});

		expect(fetchMock).toHaveBeenCalledWith(
			'/api/agent/v2/prewarm',
			expect.objectContaining({
				method: 'POST'
			})
		);
		expect(result).toEqual({
			session: { id: 'session-2' },
			prewarmedContext: { key: 'global:none' },
			preparedPrompt: null
		});
	});

	it('warmAgentChatStreamTransport calls the stream route warmup endpoint', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true });
		vi.stubGlobal('fetch', fetchMock);

		const result = await warmAgentChatStreamTransport();

		expect(result).toBe(true);
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/agent/v2/stream?purpose=warmup',
			expect.objectContaining({
				method: 'GET',
				cache: 'no-store'
			})
		);
	});

	it('loadAgentChatSessionSnapshot throws the backend error when session restore fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				json: async () => ({ error: 'Session not found' })
			})
		);

		await expect(loadAgentChatSessionSnapshot('missing-session')).rejects.toThrow(
			'Session not found'
		);
	});
});
