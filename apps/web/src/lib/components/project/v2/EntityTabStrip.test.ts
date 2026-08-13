// apps/web/src/lib/components/project/v2/EntityTabStrip.test.ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import EntityTabStrip from './EntityTabStrip.svelte';
import type { Goal } from '$lib/types/onto';

const {
	fetchCalendarItemsMock,
	fetchProjectBriefsMock,
	fetchGoalConnectionsMock,
	fetchAvailableEntitiesMock,
	linkEntitiesMock
} = vi.hoisted(() => ({
	fetchCalendarItemsMock: vi.fn(),
	fetchProjectBriefsMock: vi.fn(),
	fetchGoalConnectionsMock: vi.fn(),
	fetchAvailableEntitiesMock: vi.fn(),
	linkEntitiesMock: vi.fn()
}));

vi.mock('$lib/services/calendar-items.service', () => ({
	fetchCalendarItems: fetchCalendarItemsMock
}));

vi.mock('$lib/components/project/project-page-data-controller', () => ({
	fetchProjectBriefs: fetchProjectBriefsMock,
	fetchProjectGoalConnectionOverview: fetchGoalConnectionsMock
}));

vi.mock('$lib/components/ontology/linked-entities/linked-entities.service', () => ({
	fetchAvailableEntities: fetchAvailableEntitiesMock,
	linkEntities: linkEntitiesMock,
	filterEntities: (entities: Array<{ title?: string }>, query: string) =>
		entities.filter((entity) =>
			(entity.title ?? '').toLowerCase().includes(query.toLowerCase())
		)
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
		Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });
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
		fetchAvailableEntitiesMock.mockResolvedValue([]);
		linkEntitiesMock.mockResolvedValue({ created: 0 });
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
					tasks: { total: 4, todo: 4, in_progress: 0, blocked: 0, done: 0, items: [] },
					plans: { total: 0, draft: 0, active: 0, completed: 0, items: [] },
					milestones: {
						total: 0,
						pending: 0,
						in_progress: 0,
						completed: 0,
						missed: 0,
						overdue: 0,
						next_due_at: null,
						items: []
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
		expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
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
					tasks: { total: 0, todo: 0, in_progress: 0, blocked: 0, done: 0, items: [] },
					plans: { total: 0, draft: 0, active: 0, completed: 0, items: [] },
					milestones: {
						total: 0,
						pending: 0,
						in_progress: 0,
						completed: 0,
						missed: 0,
						overdue: 0,
						next_due_at: null,
						items: []
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

	it('shows a progress bar only after the goal has an explicit tracking method', async () => {
		fetchGoalConnectionsMock.mockResolvedValue({
			project_id: PROJECT_ID,
			goals: [
				{
					goal_id: GOAL_ID,
					created_at: goal.created_at,
					updated_at: goal.updated_at,
					last_activity_at: goal.updated_at,
					tasks: {
						total: 4,
						todo: 1,
						in_progress: 1,
						blocked: 0,
						done: 2,
						items: []
					},
					plans: { total: 0, draft: 0, active: 0, completed: 0, items: [] },
					milestones: {
						total: 0,
						pending: 0,
						in_progress: 0,
						completed: 0,
						missed: 0,
						overdue: 0,
						next_due_at: null,
						items: []
					},
					tracking: { source: 'none', completed: 0, total: 0, percent: null }
				}
			],
			tasks: { total: 4, connected: 4, project_level: 0 }
		});
		renderEntityTabStrip({
			goals: [
				{
					...goal,
					props: {
						goal_tracking: { version: 1, method: 'tasks', updated_at: goal.updated_at }
					}
				}
			]
		});

		await fireEvent.click(screen.getByRole('button', { name: /^Goals\b/ }));
		const progress = await screen.findByRole('progressbar', { name: /Task progress: 50%/ });
		expect(progress).toHaveAttribute('aria-valuenow', '50');
		expect(
			screen.getByText('Task progress: 2/4 done · No plan · No target date')
		).toBeInTheDocument();
		expect(
			screen.getByRole('button', { name: `Edit progress tracking for ${goal.name}` })
		).toBeInTheDocument();
	});

	it('inspects connected work inline and offers goal-scoped create actions', async () => {
		const onAddTaskFromGoal = vi.fn();
		const onAddPlanFromGoal = vi.fn();
		const onAddMilestoneFromGoal = vi.fn();
		const onGoalConnectionsChanged = vi.fn();
		fetchAvailableEntitiesMock.mockResolvedValue([
			{
				id: 'task-2',
				title: 'Send the deposit survey',
				state_key: 'todo',
				isLinked: false
			}
		]);
		linkEntitiesMock.mockResolvedValue({ created: 1 });
		fetchGoalConnectionsMock.mockResolvedValue({
			project_id: PROJECT_ID,
			goals: [
				{
					goal_id: GOAL_ID,
					created_at: goal.created_at,
					updated_at: goal.updated_at,
					last_activity_at: '2026-08-04T12:00:00.000Z',
					tasks: {
						total: 1,
						todo: 0,
						in_progress: 1,
						blocked: 0,
						done: 0,
						items: [
							{
								id: 'task-1',
								title: 'Interview ten families',
								state_key: 'in_progress',
								due_at: null,
								updated_at: '2026-08-04T12:00:00.000Z'
							}
						]
					},
					plans: {
						total: 1,
						draft: 0,
						active: 1,
						completed: 0,
						items: [
							{
								id: 'plan-1',
								name: 'Demand validation plan',
								state_key: 'active',
								updated_at: '2026-08-03T12:00:00.000Z'
							}
						]
					},
					milestones: {
						total: 1,
						pending: 1,
						in_progress: 0,
						completed: 0,
						missed: 0,
						overdue: 0,
						next_due_at: '2026-08-20T12:00:00.000Z',
						items: [
							{
								id: 'milestone-1',
								title: 'Confirm twenty deposits',
								state_key: 'pending',
								due_at: '2026-08-20T12:00:00.000Z',
								updated_at: '2026-08-02T12:00:00.000Z'
							}
						]
					},
					tracking: { source: 'milestones', completed: 0, total: 1, percent: 0 }
				}
			],
			tasks: { total: 1, connected: 1, project_level: 0 }
		});
		renderEntityTabStrip({
			goals: [goal],
			onAddTaskFromGoal,
			onAddPlanFromGoal,
			onAddMilestoneFromGoal,
			onGoalConnectionsChanged
		});

		await fireEvent.click(screen.getByRole('button', { name: /^Goals\b/ }));
		await fireEvent.click(await screen.findByRole('button', { name: /Connected work · 3/ }));

		expect(screen.getByText('Interview ten families')).toBeInTheDocument();
		expect(screen.getByText('Demand validation plan')).toBeInTheDocument();
		expect(screen.getByText('Confirm twenty deposits')).toBeInTheDocument();
		expect(screen.getAllByText('Milestones')).not.toHaveLength(0);
		expect(screen.queryByText(/Checkpoint/i)).not.toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: `Create task for ${goal.name}` }));
		expect(onAddTaskFromGoal).toHaveBeenCalledWith(goal.id, goal.name);
		await fireEvent.click(
			screen.getByRole('button', { name: `Create milestone for ${goal.name}` })
		);
		expect(onAddMilestoneFromGoal).toHaveBeenCalledWith(goal.id, goal.name);

		await fireEvent.click(
			screen.getByRole('button', { name: `Link existing task to ${goal.name}` })
		);
		await fireEvent.click(
			await screen.findByRole('button', { name: /Send the deposit survey/ })
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Add Selected (1)' }));

		await waitFor(() => {
			expect(linkEntitiesMock).toHaveBeenCalledWith({
				sourceId: goal.id,
				sourceKind: 'goal',
				targetIds: ['task-2'],
				targetKind: 'task',
				projectId: PROJECT_ID
			});
			expect(onGoalConnectionsChanged).toHaveBeenCalledOnce();
		});
	});
});
