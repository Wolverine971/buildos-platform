import { describe, expect, it, vi } from 'vitest';
import type { AgentRunNotification } from '$lib/types/notification.types';
import { prepareAgentRunChatEventDetail } from './agent-run-chat-session.client';

function notificationData(
	overrides: Partial<AgentRunNotification['data']> = {}
): AgentRunNotification['data'] {
	return {
		runId: 'run-1',
		label: 'Update project START HERE',
		goal: 'Review proposed updates',
		runStatus: 'partial',
		trigger: 'chat',
		contextType: 'project',
		projectId: 'project-from-notification',
		parentSessionId: 'parent-session-1',
		scopeMode: 'read_write',
		reviewRequired: true,
		runCreatedAt: '2026-06-29T12:00:00.000Z',
		startedAt: null,
		completedAt: null,
		result: null,
		metrics: null,
		entityCount: 0,
		error: null,
		...overrides
	};
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

describe('prepareAgentRunChatEventDetail', () => {
	it('calls the agent-run chat-session endpoint and returns the server context', async () => {
		const fetchFn = vi.fn(async () =>
			jsonResponse(200, {
				success: true,
				data: {
					chat_session_id: 'session-1',
					context_type: 'project',
					entity_id: 'project-1',
					project_id: 'project-1',
					session: { id: 'session-1', context_type: 'project', entity_id: 'project-1' }
				}
			})
		);

		const detail = await prepareAgentRunChatEventDetail({
			runId: 'run-1',
			notificationData: notificationData(),
			fetchFn
		});

		expect(fetchFn).toHaveBeenCalledWith('/api/agent-runs/run-1/chat-session', {
			method: 'POST',
			headers: { accept: 'application/json' }
		});
		expect(detail).toEqual({
			sessionId: 'session-1',
			contextType: 'project',
			entityId: 'project-1',
			projectId: 'project-1',
			source: 'agent_run',
			runId: 'run-1'
		});
	});

	it('falls back to session and notification fields when the response is compact', async () => {
		const fetchFn = vi.fn(async () =>
			jsonResponse(201, {
				success: true,
				data: {
					session: { id: 'session-from-row', context_type: 'global' }
				}
			})
		);

		const detail = await prepareAgentRunChatEventDetail({
			runId: 'run-2',
			notificationData: notificationData({
				contextType: 'project',
				projectId: 'project-from-notification'
			}),
			fetchFn
		});

		expect(detail).toMatchObject({
			sessionId: 'session-from-row',
			contextType: 'global',
			entityId: 'project-from-notification',
			projectId: 'project-from-notification',
			source: 'agent_run',
			runId: 'run-2'
		});
	});

	it('throws the backend error when session preparation fails', async () => {
		const fetchFn = vi.fn(async () =>
			jsonResponse(500, {
				success: false,
				error: 'Failed to load agent run'
			})
		);

		await expect(
			prepareAgentRunChatEventDetail({
				runId: 'run-1',
				notificationData: notificationData(),
				fetchFn
			})
		).rejects.toThrow('Failed to load agent run');
	});
});
