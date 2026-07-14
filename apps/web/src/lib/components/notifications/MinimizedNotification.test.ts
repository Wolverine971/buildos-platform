// apps/web/src/lib/components/notifications/MinimizedNotification.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import MinimizedNotification from './MinimizedNotification.svelte';
import type { AgentRunNotification, ChatSessionNotification } from '$lib/types/notification.types';

function agentRunNotification(): AgentRunNotification {
	return {
		id: 'notification-1',
		type: 'agent-run',
		status: 'processing',
		createdAt: Date.now(),
		updatedAt: Date.now(),
		isMinimized: true,
		isPersistent: true,
		autoCloseMs: null,
		data: {
			runId: 'run-1',
			label: 'Update project START HERE',
			goal: 'Review proposed Start Here updates captured from the completed chat.',
			runStatus: 'proposal_ready',
			trigger: 'chat',
			contextType: 'project',
			projectId: 'project-1',
			projectName: 'Author Training',
			activityLabel: 'Update document',
			targetLabel: 'START HERE',
			preview: 'Capture durable decisions and open questions from the chat.',
			entityType: 'document',
			parentSessionId: 'session-1',
			scopeMode: 'read_write',
			reviewRequired: true,
			runCreatedAt: '2026-07-14T12:00:00.000Z',
			startedAt: '2026-07-14T12:00:01.000Z',
			completedAt: null,
			result: null,
			metrics: null,
			entityCount: 0,
			error: null
		},
		progress: { type: 'indeterminate', message: 'Changes proposed — review' },
		actions: {}
	};
}

function chatSessionNotification(view = vi.fn(), dismiss = vi.fn()): ChatSessionNotification {
	return {
		id: 'chat-notification-1',
		type: 'chat-session',
		status: 'success',
		createdAt: Date.now(),
		updatedAt: Date.now(),
		isMinimized: true,
		isPersistent: true,
		autoCloseMs: null,
		data: {
			sessionId: 'session-1',
			title: 'Launch planning',
			contextType: 'project',
			entityId: 'project-1',
			projectId: 'project-1',
			contextLabel: 'Author Training',
			hasActiveTurn: false,
			responsePreview: 'I drafted the next three launch steps.',
			hasSentMessage: true,
			error: null
		},
		progress: { type: 'indeterminate', message: 'Response ready — tap to review' },
		actions: { view, dismiss }
	};
}

describe('MinimizedNotification', () => {
	afterEach(cleanup);

	it('includes project, action, target, and preview in the agent-run accessible name', () => {
		render(MinimizedNotification, { props: { notification: agentRunNotification() } });

		expect(
			screen.getByRole('button', {
				name: 'Open Author Training agent work: Update document — START HERE. Capture durable decisions and open questions from the chat.'
			})
		).toBeTruthy();
	});

	it('renders parked chat actions as sibling buttons inside a labeled group', async () => {
		const view = vi.fn();
		const dismiss = vi.fn();
		render(MinimizedNotification, {
			props: { notification: chatSessionNotification(view, dismiss) }
		});

		expect(
			await screen.findByRole('group', { name: 'Parked chat in Author Training' })
		).toBeInTheDocument();
		const openButton = await screen.findByRole('button', {
			name: 'Open chat in Author Training: Launch planning. I drafted the next three launch steps.'
		});
		const endButton = screen.getByRole('button', { name: 'End chat: Launch planning' });

		await fireEvent.click(openButton);
		expect(view).toHaveBeenCalledOnce();
		expect(dismiss).not.toHaveBeenCalled();

		await fireEvent.click(endButton);
		expect(dismiss).toHaveBeenCalledOnce();
	});
});
