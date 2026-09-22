// apps/web/src/lib/components/notifications/types/agent-run/AgentRunModalContent.test.ts
// @vitest-environment jsdom
import { requireTestValue } from '$lib/test-helpers/require-test-value';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import AgentRunModalContent from './AgentRunModalContent.svelte';
import NotificationModal from '../../NotificationModal.svelte';
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

vi.mock('$lib/stores/aiInboxCount.store', () => ({ loadAiInboxCount: vi.fn() }));
vi.mock('$lib/stores/projectDataMutations', () => ({ notifyDataMutation: vi.fn() }));

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
			projectName: 'Author Training',
			activityLabel: 'Update document',
			targetLabel: 'START HERE',
			preview: 'Capture durable decisions and open questions from the chat.',
			entityType: 'document',
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

function reviewNotification(): AgentRunNotification {
	const item = notification({ runStatus: 'proposal_ready' });
	item.data.result!.proposed_changes = {
		run_id: 'run-1',
		status: 'pending',
		created_at: '2026-09-21T12:00:00Z',
		changes: [
			{
				id: 'change-1',
				op: 'onto.task.update',
				action: 'update',
				entity_type: 'task',
				before: { title: 'Previous title' },
				after: { title: 'Reviewed title' },
				rationale: 'Apply the reviewed title.'
			}
		]
	};
	return item;
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

	it('keeps project, action, target, source, and access visible in the detail view', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => jsonResponse(200, { success: true, data: { events: [] } }))
		);

		render(AgentRunModalContent, {
			props: {
				notification: notification()
			}
		});

		await waitFor(() =>
			expect(
				screen.getByRole('heading', { name: 'Update document · START HERE' })
			).toBeInTheDocument()
		);
		expect(screen.getByRole('link', { name: 'Author Training' })).toHaveAttribute(
			'href',
			'/projects/project-1'
		);
		expect(screen.getByText('Partly complete')).toBeInTheDocument();
		expect(screen.getByText('From chat')).toBeInTheDocument();
		expect(screen.getByText('Ask before applying')).toBeInTheDocument();
		expect(
			screen.getByText('Capture durable decisions and open questions from the chat.')
		).toBeInTheDocument();
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
		const event = requireTestValue(opened.mock.calls[0])[0] as CustomEvent;
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
	it('opens the actual review immediately without a fallback modal or activity fetch', async () => {
		const fetchMock = vi.fn(async () => jsonResponse(200, { data: { events: [] } }));
		vi.stubGlobal('fetch', fetchMock);
		render(NotificationModal, { props: { notification: reviewNotification() } });
		expect(screen.getByRole('button', { name: 'Accept 1 change' })).toBeInTheDocument();
		expect(screen.getAllByRole('dialog')).toHaveLength(1);
		expect(screen.getAllByRole('button', { name: 'Chat' })).toHaveLength(1);
		expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
		expect(fetchMock).not.toHaveBeenCalled();
		const details = screen.getByText('Review context and activity').closest('details')!;
		details.open = true;
		await fireEvent(details, new Event('toggle'));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
	});

	it('keeps the same review mounted through realtime commit status updates', async () => {
		let resolveCommit!: (response: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(
				() =>
					new Promise<Response>((resolve) => {
						resolveCommit = resolve;
					})
			)
		);
		const onClose = vi.fn();
		const item = reviewNotification();
		const { rerender } = render(AgentRunModalContent, {
			props: { notification: item, onClose }
		});
		const originalDialog = screen.getByRole('dialog');
		await fireEvent.click(screen.getByRole('button', { name: 'Accept 1 change' }));
		await rerender({
			notification: { ...item, data: { ...item.data, runStatus: 'running' } },
			onClose
		});
		expect(screen.getByRole('dialog')).toBe(originalDialog);
		expect(screen.getByText('Reviewed title')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Applying…' })).toBeDisabled();
		expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
		await rerender({
			notification: { ...item, data: { ...item.data, runStatus: 'completed' } },
			onClose
		});
		expect(screen.getByRole('dialog')).toBe(originalDialog);
		expect(onClose).not.toHaveBeenCalled();
		resolveCommit(jsonResponse(200, { data: { applied: 1, failed: 0, rejected: 0 } }));
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
	});
	it('does not close the next notification when the previous review finishes saving', async () => {
		let resolveCommit!: (response: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(
				() =>
					new Promise<Response>((resolve) => {
						resolveCommit = resolve;
					})
			)
		);
		const { rerender } = render(NotificationModal, {
			props: { notification: reviewNotification() }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Accept 1 change' }));
		const next = reviewNotification();
		next.id = 'notification-2';
		next.data.runId = 'run-2';
		await rerender({ notification: next });
		expect(screen.getByRole('button', { name: 'Accept 1 change' })).toBeEnabled();
		resolveCommit(jsonResponse(200, { data: { applied: 1, failed: 0, rejected: 0 } }));
		await waitFor(() => expect(notificationRemoveMock).toHaveBeenCalledWith('notification-1'));
		expect(notificationRemoveMock).not.toHaveBeenCalledWith('notification-2');
		expect(screen.getByRole('button', { name: 'Accept 1 change' })).toBeEnabled();
	});
	it('keeps the proposal visible when reopened while the server reports running', async () => {
		let resolveCommit!: (response: Response) => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(
				() =>
					new Promise<Response>((resolve) => {
						resolveCommit = resolve;
					})
			)
		);
		const item = reviewNotification();
		const view = render(NotificationModal, { props: { notification: item } });
		await fireEvent.click(screen.getByRole('button', { name: 'Accept 1 change' }));
		view.unmount();
		render(NotificationModal, {
			props: { notification: { ...item, data: { ...item.data, runStatus: 'running' } } }
		});
		try {
			expect(screen.getByText('Reviewed title')).toBeInTheDocument();
			expect(screen.getByRole('button', { name: 'Applying…' })).toBeDisabled();
			expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
		} finally {
			resolveCommit(jsonResponse(503, { error: 'Please retry' }));
		}
		expect(await screen.findByRole('alert')).toHaveTextContent('Please retry');
	});

	it('shows an activity fetch error and allows retry without reopening the review', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(503, { error: 'Unavailable' }))
			.mockResolvedValueOnce(jsonResponse(200, { data: { events: [] } }));
		vi.stubGlobal('fetch', fetchMock);
		render(AgentRunModalContent, { props: { notification: reviewNotification() } });
		const details = screen.getByText('Review context and activity').closest('details')!;
		details.open = true;
		await fireEvent(details, new Event('toggle'));
		expect(await screen.findByRole('alert')).toHaveTextContent('Could not load activity');
		await fireEvent.click(screen.getByRole('button', { name: 'Retry activity' }));
		await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
