// apps/web/src/lib/components/notifications/MinimizedNotification.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import MinimizedNotification from './MinimizedNotification.svelte';
import type {
	AgentRunNotification,
	ChatSessionNotification,
	DailyBriefNotification,
	ProjectSynthesisNotification
} from '$lib/types/notification.types';

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

function projectSynthesisNotification(): ProjectSynthesisNotification {
	return {
		id: 'synthesis-notification-1',
		type: 'project-synthesis',
		status: 'success',
		createdAt: Date.now(),
		updatedAt: Date.now(),
		isMinimized: true,
		isPersistent: true,
		autoCloseMs: null,
		data: {
			projectId: 'project-1',
			projectName: 'Author Training',
			options: { selectedModules: [], config: {} },
			requestPayload: {
				regenerate: false,
				includeDeleted: false,
				options: { selectedModules: [], config: {} }
			},
			taskCount: 12,
			selectedModules: ['project_analysis'],
			result: {
				synthesisId: 'synthesis-1',
				operations: [],
				insights: 'Three duplicate tasks can be combined.',
				comparison: [],
				summary: 'Consolidate overlapping onboarding work.',
				operationsCount: 3,
				consolidationCount: 2,
				newTasksCount: 1,
				deletionsCount: 0
			}
		},
		progress: { type: 'indeterminate', message: 'Complete' },
		actions: { reviewResults: vi.fn(), retry: vi.fn() }
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

	it('keeps synthesis actions out of the outer button-like card', async () => {
		render(MinimizedNotification, {
			props: { notification: projectSynthesisNotification() }
		});

		const card = await screen.findByRole('button', {
			name: 'Open Author Training: Review project synthesis — Analysis. Consolidate overlapping onboarding work.'
		});

		expect(card.querySelector('button')).toBeNull();
	});

	it('uses one in-bounds status border instead of a clipped outer ring', async () => {
		render(MinimizedNotification, {
			props: { notification: projectSynthesisNotification() }
		});

		const card = await screen.findByRole('button', {
			name: 'Open Author Training: Review project synthesis — Analysis. Consolidate overlapping onboarding work.'
		});

		expect(card).toHaveClass('border-success/50');
		expect(card).not.toHaveClass('border-border', 'ring-2', 'ring-success/50');
	});
});

function dailyBriefNotification(
	overrides: Partial<Pick<DailyBriefNotification, 'status' | 'data' | 'progress'>> = {},
	view = vi.fn(),
	dismiss = vi.fn()
): DailyBriefNotification {
	return {
		id: 'daily-brief-notification-1',
		type: 'daily-brief',
		status: 'processing',
		createdAt: Date.now(),
		updatedAt: Date.now(),
		isMinimized: true,
		isPersistent: true,
		autoCloseMs: null,
		data: {
			briefDate: '2026-10-29',
			dateLabel: 'Today',
			jobId: 'job-1',
			message: 'Generating project briefs...',
			error: null
		},
		progress: { type: 'percentage', percentage: 40, message: 'Generating project briefs...' },
		actions: { view, dismiss },
		...overrides
	};
}

describe('MinimizedNotification daily-brief card', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('shows progress and opens the brief from its own button instead of expanding', async () => {
		const view = vi.fn();
		const dismiss = vi.fn();
		render(MinimizedNotification, {
			props: { notification: dailyBriefNotification({}, view, dismiss) }
		});

		// The wrapper is a plain group — this card has no modal to expand into.
		expect(await screen.findByRole('group', { name: 'Daily brief for Today' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: /expand/i })).toBeNull();

		const open = await screen.findByRole('button', { name: /^Generating your brief/ });
		expect(open.getAttribute('aria-label')).toBe(
			'Generating your brief. Generating project briefs... · 40%'
		);
		expect(screen.getByText('Today')).toBeTruthy();

		await fireEvent.click(open);
		expect(view).toHaveBeenCalledTimes(1);

		await fireEvent.click(screen.getByRole('button', { name: 'Hide brief progress' }));
		expect(dismiss).toHaveBeenCalledTimes(1);
	});

	it('reads as ready once the brief lands and as failed with the error', async () => {
		const { unmount } = render(MinimizedNotification, {
			props: {
				notification: dailyBriefNotification({
					status: 'success',
					progress: { type: 'binary', message: 'Tap to read it' }
				})
			}
		});
		expect(await screen.findByText('Your brief is ready')).toBeTruthy();
		expect(screen.getByText('Tap to read it')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
		unmount();

		render(MinimizedNotification, {
			props: {
				notification: dailyBriefNotification({
					status: 'error',
					data: {
						briefDate: '2026-10-29',
						dateLabel: 'Today',
						jobId: 'job-1',
						message: null,
						error: 'LLM timed out'
					},
					progress: { type: 'binary', message: 'LLM timed out' }
				})
			}
		});
		expect(await screen.findByText('Brief generation failed')).toBeTruthy();
		expect(screen.getByText('LLM timed out')).toBeTruthy();
	});
});
