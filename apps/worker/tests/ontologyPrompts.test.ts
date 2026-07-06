// apps/worker/tests/ontologyPrompts.test.ts
import { describe, expect, it } from 'vitest';

import {
	OntologyAnalysisPrompt,
	OntologyExecutiveSummaryPrompt,
	OntologyProjectBriefPrompt,
	getProjectPromptInclusionScore
} from '../src/workers/brief/ontologyPrompts';
import type {
	CalendarBriefItem,
	CalendarBriefSection,
	GoalProgress,
	OntoTask,
	OntologyBriefData
} from '../src/workers/brief/ontologyBriefTypes';

function createCalendarItem(
	id: string,
	title: string,
	overrides: Partial<CalendarBriefItem> = {}
): CalendarBriefItem {
	return {
		id,
		title,
		startAt: '2025-12-17T15:00:00.000Z',
		endAt: '2025-12-17T16:00:00.000Z',
		allDay: false,
		timezone: 'America/New_York',
		projectId: 'project-1',
		projectName: 'Launch Plan',
		taskId: null,
		eventId: id,
		itemType: 'event',
		itemKind: 'event',
		stateKey: 'scheduled',
		source: 'google',
		sourceLabel: 'Google Calendar',
		lastSyncedAt: '2025-12-17T14:30:00.000Z',
		syncAgeMinutes: 30,
		syncFreshness: 'fresh',
		googleEventId: `google-${id}`,
		googleCalendarId: 'primary',
		externalLink: null,
		displayTime: '10:00 AM-11:00 AM',
		displayDate: 'Wed Dec 17',
		...overrides
	};
}

function createTask(overrides: Partial<OntoTask> = {}): OntoTask {
	return {
		id: 'task-1',
		project_id: 'project-1',
		title: 'Task',
		state_key: 'todo',
		type_key: 'task.execute',
		priority: 3,
		due_at: null,
		start_at: null,
		completed_at: null,
		description: null,
		deleted_at: null,
		archived_at: null,
		facet_scale: null,
		created_by: 'actor-1',
		created_at: '2025-12-01T00:00:00.000Z',
		updated_at: '2025-12-16T00:00:00.000Z',
		props: {},
		search_vector: null,
		...overrides
	} as OntoTask;
}

function createBriefData(
	calendar: CalendarBriefSection,
	overrides: Partial<OntologyBriefData> = {}
): OntologyBriefData {
	return {
		briefDate: '2025-12-17',
		timezone: 'America/New_York',
		goals: [],
		risks: [],
		requirements: [],
		todaysTasks: [],
		blockedTasks: [],
		overdueTasks: [],
		inProgressTasks: [],
		staleInProgressTasks: [],
		highPriorityCount: 0,
		recentUpdates: {
			tasks: [],
			goals: [],
			documents: []
		},
		tasksByWorkMode: {},
		projects: [],
		calendar,
		recentlyUpdatedTasks: [],
		upcomingTasks: [],
		...overrides
	};
}

function createEmptyCalendarSection(): CalendarBriefSection {
	return {
		allItems: [],
		today: [],
		upcoming: [],
		todayTotal: 0,
		upcomingTotal: 0,
		hiddenTodayCount: 0,
		hiddenUpcomingCount: 0,
		counts: {
			today: {
				total: 0,
				google: 0,
				internal: 0,
				syncIssue: 0,
				unconfirmedGoogle: 0,
				staleGoogle: 0
			},
			upcoming: {
				total: 0,
				google: 0,
				internal: 0,
				syncIssue: 0,
				unconfirmedGoogle: 0,
				staleGoogle: 0
			},
			all: {
				total: 0,
				google: 0,
				internal: 0,
				syncIssue: 0,
				unconfirmedGoogle: 0,
				staleGoogle: 0
			}
		}
	};
}

describe('OntologyAnalysisPrompt calendar summary', () => {
	it('keeps prompt calendar context compact while preserving counts', () => {
		const today = Array.from({ length: 4 }, (_, index) =>
			createCalendarItem(`today-${index}`, `Today Event ${index}`)
		);
		const upcoming = Array.from({ length: 6 }, (_, index) =>
			createCalendarItem(`upcoming-${index}`, `Upcoming Event ${index}`, {
				startAt: `2025-12-${18 + index}T15:00:00.000Z`,
				endAt: `2025-12-${18 + index}T16:00:00.000Z`,
				displayDate: `Thu Dec ${18 + index}`
			})
		);
		const prompt = OntologyAnalysisPrompt.buildUserPrompt({
			date: '2025-12-17',
			timezone: 'America/New_York',
			briefData: createBriefData({
				allItems: [...today, ...upcoming],
				today,
				upcoming,
				todayTotal: 10,
				upcomingTotal: 9,
				hiddenTodayCount: 6,
				hiddenUpcomingCount: 3,
				counts: {
					today: {
						total: 10,
						google: 7,
						internal: 2,
						syncIssue: 1,
						unconfirmedGoogle: 0,
						staleGoogle: 1
					},
					upcoming: {
						total: 9,
						google: 3,
						internal: 6,
						syncIssue: 0,
						unconfirmedGoogle: 1,
						staleGoogle: 0
					},
					all: {
						total: 19,
						google: 10,
						internal: 8,
						syncIssue: 1,
						unconfirmedGoogle: 1,
						staleGoogle: 1
					}
				}
			})
		});

		expect(prompt).toContain('- Calendar Today: 10');
		expect(prompt).toContain('- Calendar Upcoming: 9');
		expect(prompt).toContain('## Calendar Summary');
		expect(prompt).toContain(
			'- Today: 10 items (7 Google, 2 internal, 1 sync issue, 1 stale Google)'
		);
		expect(prompt).toContain(
			'- Upcoming next 7 days: 9 items (3 Google, 1 unconfirmed Google, 6 internal, 0 sync issues)'
		);
		expect(prompt).toContain('Today Event 0');
		expect(prompt).toContain('Today Event 1');
		expect(prompt).toContain('Today Event 2');
		expect(prompt).toContain('Today Event 3');
		expect(prompt).toContain('Upcoming Event 0');
		expect(prompt).toContain('Upcoming Event 1');
		expect(prompt).toContain('Upcoming Event 2');
		expect(prompt).toContain('Upcoming Event 3');
		expect(prompt).toContain('Upcoming Event 4');
		expect(prompt).toContain('- Hidden from prompt: 10 additional calendar items');
		expect(prompt).not.toContain('Upcoming Event 5');
	});
});

describe('OntologyExecutiveSummaryPrompt', () => {
	it('includes goal task progress and yesterday continuity', () => {
		const goal: GoalProgress = {
			goal: {
				id: 'goal-1',
				name: 'Beta Launch',
				state_key: 'active',
				target_date: '2025-12-20T00:00:00.000Z'
			} as any,
			totalTasks: 7,
			completedTasks: 3,
			targetDate: '2025-12-20',
			targetDaysAway: 3,
			status: 'at_risk',
			contributingTasks: []
		};

		const prompt = OntologyExecutiveSummaryPrompt.buildUserPrompt({
			date: '2025-12-17',
			timezone: 'America/New_York',
			briefData: createBriefData(createEmptyCalendarSection(), {
				goals: [goal],
				projects: [
					{
						project: {
							id: 'project-1',
							name: 'Launch Plan',
							state_key: 'active'
						},
						todaysTasks: [],
						overdueTasks: [],
						blockedTasks: [],
						upcomingTasks: [],
						recentlyUpdatedTasks: [],
						calendarToday: [],
						calendarUpcoming: [],
						goals: [goal],
						nextMilestone: null
					} as any
				]
			}),
			yesterdayPlan: [
				{
					action: 'Ship launch page',
					status: 'still_open',
					taskTitle: 'Ship launch page',
					projectName: 'Launch Plan'
				}
			]
		});

		expect(prompt).toContain('3/7 tasks done');
		expect(prompt).toContain("## Yesterday's Plan");
		expect(prompt).toContain(
			'- Ship launch page [still_open | task: Ship launch page | project: Launch Plan]'
		);
	});

	it('scores overdue, at-risk goals, and calendar commitments for prompt inclusion', () => {
		const score = getProjectPromptInclusionScore({
			project: { name: 'Priority Project' },
			todaysTasks: [createTask({ id: 'today' })],
			overdueTasks: [createTask({ id: 'overdue' })],
			goals: [
				{
					status: 'behind',
					totalTasks: 1,
					completedTasks: 0,
					goal: { name: 'Behind goal' }
				}
			],
			calendarToday: [createCalendarItem('event-1', 'Review')],
			blockedTasks: [createTask({ id: 'blocked' })],
			upcomingTasks: [createTask({ id: 'upcoming' })],
			recentlyUpdatedTasks: [createTask({ id: 'recent' })]
		} as any);

		expect(score).toBe(15);
	});
});

describe('OntologyProjectBriefPrompt', () => {
	it('includes project calendar items and recent project changes without stale scheduling context', () => {
		const prompt = OntologyProjectBriefPrompt.buildUserPrompt({
			date: '2025-12-17',
			timezone: 'America/New_York',
			project: {
				project: {
					id: 'project-1',
					name: 'Launch Plan',
					state_key: 'active',
					type_key: 'project.launch',
					description: 'Launch the beta.',
					updated_at: '2025-12-17T12:00:00.000Z'
				},
				isShared: false,
				activityLogs: [],
				recentChanges: [
					{
						kind: 'document',
						id: 'doc-1',
						title: 'Launch Brief',
						action: 'updated',
						changedAt: '2025-12-17T14:00:00.000Z',
						actorName: 'Dana',
						source: 'activity_log'
					},
					{
						kind: 'plan',
						id: 'plan-1',
						title: 'Beta Rollout',
						action: 'updated',
						changedAt: '2025-12-17T13:00:00.000Z',
						actorName: null,
						source: 'updated_at'
					}
				],
				goals: [],
				plans: [
					{
						id: 'plan-1',
						name: 'Beta Rollout',
						state_key: 'active',
						type_key: 'plan.execution',
						description: 'Coordinate release steps.'
					}
				],
				requirements: [],
				documents: [
					{
						id: 'doc-1',
						title: 'Launch Brief',
						state_key: 'draft',
						description: 'Customer-facing launch notes.'
					}
				],
				nextSteps: ['Confirm launch owner'],
				nextMilestone: 'Beta launch',
				activePlan: null,
				calendarToday: [createCalendarItem('event-1', 'Launch review')],
				calendarUpcoming: [
					createCalendarItem('event-2', 'Beta kickoff', {
						startAt: '2025-12-18T15:00:00.000Z',
						displayDate: 'Thu Dec 18'
					})
				],
				todaysTasks: [
					createTask({
						id: 'task-1',
						title: 'Ship launch page',
						priority: 1,
						due_at: '2025-12-15T14:00:00.000Z',
						start_at: '2025-12-17T14:00:00.000Z',
						description: 'Publish the beta page after the final copy review.'
					})
				],
				overdueTasks: [
					createTask({
						id: 'task-2',
						title: 'Finalize pricing',
						due_at: '2025-12-14T14:00:00.000Z',
						description: 'Pick the beta price point.'
					})
				],
				thisWeekTasks: [],
				blockedTasks: [],
				unblockingTasks: [],
				recentlyUpdatedTasks: [],
				upcomingTasks: []
			} as any
		});

		expect(prompt).toContain('## Calendar Today (1)');
		expect(prompt).toContain('Launch review');
		expect(prompt).toContain('## Recent Changes');
		expect(prompt).toContain('document updated: Launch Brief by Dana');
		expect(prompt).toContain('## Recent Documents');
		expect(prompt).toContain('Launch Brief');
		expect(prompt).toContain('## Plans');
		expect(prompt).toContain('Beta Rollout');
		expect(prompt).toContain(
			'Ship launch page [P1] (execute) (due Dec 15 — 2 days overdue; starts Dec 17) — Publish the beta page after the final copy review.'
		);
		expect(prompt).toContain('## Overdue Tasks (1)');
		expect(prompt).toContain(
			'Finalize pricing (execute) (due Dec 14 — 3 days overdue) — Pick the beta price point.'
		);
		expect(prompt.toLowerCase()).not.toContain('time block');
		expect(prompt.toLowerCase()).not.toContain('timeblock');
	});
});
