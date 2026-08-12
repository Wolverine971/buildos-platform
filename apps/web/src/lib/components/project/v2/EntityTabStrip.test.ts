// apps/web/src/lib/components/project/v2/EntityTabStrip.test.ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import EntityTabStrip from './EntityTabStrip.svelte';
import type { Goal } from '$lib/types/onto';

const { fetchCalendarItemsMock, fetchProjectBriefsMock, fetchGoalConnectionsMock } = vi.hoisted(
	() => ({
		fetchCalendarItemsMock: vi.fn(),
		fetchProjectBriefsMock: vi.fn(),
		fetchGoalConnectionsMock: vi.fn()
	})
);

vi.mock('$lib/services/calendar-items.service', () => ({
	fetchCalendarItems: fetchCalendarItemsMock
}));

vi.mock('$lib/components/project/project-page-data-controller', () => ({
	fetchProjectBriefs: fetchProjectBriefsMock,
	fetchProjectGoalConnectionOverview: fetchGoalConnectionsMock
}));

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const GOAL_ID = '22222222-2222-4222-8222-222222222222';

const goal: Goal = {
	id: GOAL_ID,
	project_id: PROJECT_ID,
	name: 'Validate family demand',
	type_key: null,
	state_key: 'active',
	goal: 'Confirm enough families genuinely want the school',
	description: null,
	target_date: null,
	completed_at: null,
	deleted_at: null,
	props: {},
	created_by: '33333333-3333-4333-8333-333333333333',
	created_at: '2026-08-01T12:00:00.000Z',
	updated_at: '2026-08-02T12:00:00.000Z'
};

function renderEntityTabStrip(overrides: Partial<ComponentProps<typeof EntityTabStrip>> = {}) {
	return render(EntityTabStrip, {
		props: {
			projectId: PROJECT_ID,
			projectName: 'Launch Plan',
			canEdit: true,
			goals: [],
			milestones: [],
			plans: [],
			risks: [],
			events: [],
			milestonesByGoalId: new Map(),
			loadInboxPreview: false,
			onEditGoal: vi.fn(),
			onEditMilestone: vi.fn(),
			onEditPlan: vi.fn(),
			onEditRisk: vi.fn(),
			onEntityClick: vi.fn(),
			onOpenGraph: vi.fn(),
			onOpenRecentChats: vi.fn(),
			onOpenEvents: vi.fn(),
			...overrides
		}
	});
}

describe('EntityTabStrip', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Element.prototype.animate = vi.fn(() => {
			const animation: Partial<Animation> = {
				finished: Promise.resolve(),
				cancel: vi.fn(),
				play: vi.fn(),
				pause: vi.fn(),
				currentTime: 0
			};
			return animation as Animation;
		});
		fetchCalendarItemsMock.mockResolvedValue([]);
		fetchProjectBriefsMock.mockResolvedValue({
			briefs: [],
			hasMore: false,
			total: 0
		});
		fetchGoalConnectionsMock.mockResolvedValue({
			project_id: PROJECT_ID,
			goals: [],
			tasks: { total: 0, connected: 0, project_level: 0 }
		});
	});

	it('shows Calendar as the first chip before Briefs', () => {
		renderEntityTabStrip();

		const strip = screen.getByRole('region', { name: 'Project context tabs' });
		const chips = within(strip).getAllByRole('button');

		expect(chips[0]).toHaveTextContent('Calendar');
		expect(chips[1]).toHaveTextContent('Briefs');
	});

	it('expands the Calendar chip and loads only the current project calendar', async () => {
		renderEntityTabStrip();

		const calendarChip = screen.getByRole('button', { name: 'Calendar' });
		await fireEvent.click(calendarChip);

		expect(calendarChip).toHaveAttribute('aria-expanded', 'true');
		await screen.findByRole('button', { name: 'Refresh calendar' }, { timeout: 5000 });

		await waitFor(() => {
			expect(fetchCalendarItemsMock).toHaveBeenCalledWith(
				expect.objectContaining({ projectIds: [PROJECT_ID] })
			);
		});
	});

	it('replaces the active tag with factual task and tracking metadata', async () => {
		fetchGoalConnectionsMock.mockResolvedValue({
			project_id: PROJECT_ID,
			goals: [
				{
					goal_id: GOAL_ID,
					created_at: '2026-08-01T12:00:00.000Z',
					updated_at: '2026-08-02T12:00:00.000Z',
					last_activity_at: '2026-08-03T12:00:00.000Z',
					tasks: { total: 4, todo: 4, in_progress: 0, blocked: 0, done: 0 },
					plans: { total: 0, draft: 0, active: 0, completed: 0 },
					milestones: {
						total: 0,
						pending: 0,
						in_progress: 0,
						completed: 0,
						missed: 0,
						overdue: 0,
						next_due_at: null
					},
					tracking: { source: 'none', completed: 0, total: 0, percent: null }
				}
			],
			tasks: { total: 9, connected: 4, project_level: 5 }
		});
		renderEntityTabStrip({ goals: [goal], onDiscussGoal: vi.fn() });

		await fireEvent.click(screen.getByRole('button', { name: /^Goals\b/ }));

		expect(
			await screen.findByText('4 connected tasks · 5 project-level tasks')
		).toBeInTheDocument();
		expect(screen.getByText('4 linked tasks · none started')).toBeInTheDocument();
		expect(screen.getByText('Tracking not set · No plan · No target date')).toBeInTheDocument();
		expect(screen.queryByText(/^active$/i)).not.toBeInTheDocument();
		expect(
			screen.getByRole('button', { name: `Discuss ${goal.name} with chat` })
		).toBeInTheDocument();
	});

	it('calls out an unstructured goal and opens a review-first chat draft', async () => {
		const onDiscussGoal = vi.fn();
		fetchGoalConnectionsMock.mockResolvedValue({
			project_id: PROJECT_ID,
			goals: [
				{
					goal_id: GOAL_ID,
					created_at: goal.created_at,
					updated_at: goal.updated_at,
					last_activity_at: goal.updated_at,
					tasks: { total: 0, todo: 0, in_progress: 0, blocked: 0, done: 0 },
					plans: { total: 0, draft: 0, active: 0, completed: 0 },
					milestones: {
						total: 0,
						pending: 0,
						in_progress: 0,
						completed: 0,
						missed: 0,
						overdue: 0,
						next_due_at: null
					},
					tracking: { source: 'none', completed: 0, total: 0, percent: null }
				}
			],
			tasks: { total: 3, connected: 0, project_level: 3 }
		});
		renderEntityTabStrip({ goals: [goal], onDiscussGoal });

		await fireEvent.click(screen.getByRole('button', { name: /^Goals\b/ }));
		expect(await screen.findByText('No supporting work is connected yet.')).toBeInTheDocument();

		await fireEvent.click(
			screen.getByRole('button', { name: `Structure ${goal.name} with chat` })
		);
		expect(onDiscussGoal).toHaveBeenCalledWith(
			goal,
			expect.stringMatching(/Do not create or link anything until I approve\.$/)
		);
	});

	it('keeps chat available when connected-work metadata cannot be loaded', async () => {
		const onDiscussGoal = vi.fn();
		fetchGoalConnectionsMock.mockRejectedValue(new Error('offline'));
		renderEntityTabStrip({ goals: [goal], onDiscussGoal });

		await fireEvent.click(screen.getByRole('button', { name: /^Goals\b/ }));

		expect(await screen.findAllByText('Connected work unavailable')).not.toHaveLength(0);
		expect(
			screen.getByRole('button', { name: `Discuss ${goal.name} with chat` })
		).toBeInTheDocument();
	});
});
