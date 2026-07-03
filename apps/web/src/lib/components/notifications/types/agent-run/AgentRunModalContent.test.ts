// apps/web/src/lib/components/notifications/types/agent-run/AgentRunModalContent.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import AgentRunModalContent from './AgentRunModalContent.svelte';
import type { AgentRunNotification } from '$lib/types/notification.types';

const { toastErrorMock, notificationRemoveMock, notificationMinimizeMock } = vi.hoisted(() => ({
	toastErrorMock: vi.fn(),
	notificationRemoveMock: vi.fn(),
	notificationMinimizeMock: vi.fn()
}));

vi.mock('$lib/stores/toast.store', () => ({
	toastService: {
		error: toastErrorMock,
		info: vi.fn(),
		success: vi.fn(),
		warning: vi.fn()
	}
}));

vi.mock('$lib/stores/notification.store', () => ({
	notificationStore: {
		remove: notificationRemoveMock,
		minimize: notificationMinimizeMock
	}
}));

function notification(overrides: Partial<AgentRunNotification['data']> = {}): AgentRunNotification {
	return {
		id: 'notification-1',
		type: 'agent-run',
		status: 'warning',
		createdAt: Date.now(),
		updatedAt: Date.now(),
		isMinimized: false,
		isPersistent: false,
		autoCloseMs: null,
		data: {
			runId: 'run-1',
			label: 'Update project START HERE',
			goal: 'Review proposed Start Here updates captured from the completed chat.',
			runStatus: 'partial',
			trigger: 'chat',
			contextType: 'project',
			projectId: 'project-1',
			parentSessionId: null,
			scopeMode: 'read_write',
			reviewRequired: true,
			runCreatedAt: '2026-06-29T12:00:00.000Z',
			startedAt: '2026-06-29T12:00:00.000Z',
			completedAt: '2026-06-29T12:02:00.000Z',
			result: {
				run_id: 'run-1',
				label: 'Update project START HERE',
				status: 'partial',
				summary: 'Review proposed Start Here updates captured from the completed chat.',
				answer: 'A Start Here document update is staged for review.',
				entities_touched: [],
				metrics: {
					tokens: 0,
					cost_usd: 0,
					tool_calls: 0,
					duration_ms: 0
				}
			},
			metrics: {
				tokens: 0,
				cost_usd: 0,
				tool_calls: 0,
				duration_ms: 0
			},
			entityCount: 0,
			error: null,
			...overrides
		},
		progress: { type: 'indeterminate', message: 'Finished partially' },
		actions: {}
	};
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

describe('AgentRunModalContent Chat bridge', () => {
	beforeEach(() => {
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		});
		vi.stubGlobal('cancelAnimationFrame', vi.fn());
		vi.stubGlobal('scrollTo', vi.fn());
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('prepares the shared run chat session without minimizing the review modal', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url === '/api/agent-runs/run-1') {
				return jsonResponse(200, { success: true, data: { events: [] } });
			}
			if (url === '/api/agent-runs/run-1/chat-session') {
				return jsonResponse(200, {
					success: true,
					data: {
						chat_session_id: 'session-1',
						context_type: 'project',
						entity_id: 'project-1',
						project_id: 'project-1',
						session: {
							id: 'session-1',
							context_type: 'project',
							entity_id: 'project-1'
						}
					}
				});
			}
			return jsonResponse(404, { success: false, error: `Unexpected URL: ${url}` });
		});
		vi.stubGlobal('fetch', fetchMock);
		const opened = vi.fn();
		window.addEventListener('buildos:open-agent-chat', opened);

		render(AgentRunModalContent, {
			props: {
				notification: notification()
			}
		});

		const chatButton = screen.getByRole('button', { name: 'Chat' });
		await fireEvent.click(chatButton);

		await waitFor(() => expect(opened).toHaveBeenCalledTimes(1));
		const event = opened.mock.calls[0][0] as CustomEvent;
		expect(fetchMock).toHaveBeenCalledWith('/api/agent-runs/run-1/chat-session', {
			method: 'POST',
			headers: { accept: 'application/json' }
		});
		expect(event.detail).toEqual({
			sessionId: 'session-1',
			contextType: 'project',
			entityId: 'project-1',
			projectId: 'project-1',
			source: 'agent_run',
			runId: 'run-1'
		});
		expect(notificationMinimizeMock).not.toHaveBeenCalled();
		expect(notificationRemoveMock).not.toHaveBeenCalled();

		window.removeEventListener('buildos:open-agent-chat', opened);
	});

	it('shows an error and does not open chat when session preparation fails', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url === '/api/agent-runs/run-1') {
				return jsonResponse(200, { success: true, data: { events: [] } });
			}
			return jsonResponse(500, {
				success: false,
				error: 'Failed to load agent run'
			});
		});
		vi.stubGlobal('fetch', fetchMock);
		const opened = vi.fn();
		window.addEventListener('buildos:open-agent-chat', opened);

		render(AgentRunModalContent, {
			props: {
				notification: notification()
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Chat' }));

		await waitFor(() =>
			expect(toastErrorMock).toHaveBeenCalledWith('Failed to load agent run')
		);
		expect(opened).not.toHaveBeenCalled();

		window.removeEventListener('buildos:open-agent-chat', opened);
	});
});
