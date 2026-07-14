// apps/web/src/lib/components/notifications/types/agent-run/AgentRunMinimizedView.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import AgentRunMinimizedView from './AgentRunMinimizedView.svelte';
import type { AgentRunNotification } from '$lib/types/notification.types';

function notification(
	dataOverrides: Partial<AgentRunNotification['data']> = {}
): AgentRunNotification {
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
			completedAt: '2026-07-14T12:00:03.000Z',
			result: {
				run_id: 'run-1',
				label: 'Update project START HERE',
				status: 'proposal_ready',
				summary: 'Review proposed Start Here updates.',
				answer: 'A Start Here document update is staged for review.',
				entities_touched: [],
				proposed_changes: {
					run_id: 'run-1',
					status: 'pending',
					created_at: '2026-07-14T12:00:03.000Z',
					changes: [
						{
							id: 'change-1',
							op: 'onto.document.update',
							entity_type: 'document',
							entity_id: 'document-1',
							action: 'update',
							before: { title: 'START HERE' },
							after: { content: 'New orientation notes' },
							rationale: 'Capture durable decisions and open questions from the chat.'
						}
					]
				},
				metrics: { tokens: 0, cost_usd: 0, tool_calls: 0, duration_ms: 0 }
			},
			metrics: { tokens: 0, cost_usd: 0, tool_calls: 0, duration_ms: 0 },
			entityCount: 0,
			error: null,
			...dataOverrides
		},
		progress: { type: 'indeterminate', message: 'Changes proposed — review' },
		actions: {}
	};
}

describe('AgentRunMinimizedView', () => {
	afterEach(cleanup);

	it('shows the project, action, target, and proposal preview instead of generic status copy', () => {
		render(AgentRunMinimizedView, { props: { notification: notification() } });

		expect(screen.getByText('Author Training')).toBeTruthy();
		expect(screen.getByText('Update document')).toBeTruthy();
		expect(screen.getByText(/START HERE/)).toBeTruthy();
		expect(
			screen.getByText('Capture durable decisions and open questions from the chat.')
		).toBeTruthy();
		expect(screen.queryByText('Changes proposed — review')).toBeNull();
	});

	it('uses a calendar icon for calendar event work', () => {
		const { container } = render(AgentRunMinimizedView, {
			props: {
				notification: notification({
					activityLabel: 'Delete calendar event',
					targetLabel: 'Launch review',
					entityType: 'calendar_event'
				})
			}
		});

		expect(container.querySelector('.lucide-calendar-days')).toBeTruthy();
		expect(container.querySelector('.lucide-bot')).toBeNull();
	});
});
