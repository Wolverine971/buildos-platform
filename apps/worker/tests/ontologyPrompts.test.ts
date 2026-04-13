// apps/worker/tests/ontologyPrompts.test.ts
import { describe, expect, it } from 'vitest';

import {
	OntologyAnalysisPrompt,
	OntologyProjectBriefPrompt
} from '../src/workers/brief/ontologyPrompts';
import type {
	CalendarBriefItem,
	CalendarBriefSection,
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
		googleEventId: `google-${id}`,
		googleCalendarId: 'primary',
		externalLink: null,
		displayTime: '10:00 AM-11:00 AM',
		displayDate: 'Wed Dec 17',
		...overrides
	};
}

function createBriefData(calendar: CalendarBriefSection): OntologyBriefData {
	return {
		briefDate: '2025-12-17',
		timezone: 'America/New_York',
		goals: [],
		risks: [],
		requirements: [],
		todaysTasks: [],
		blockedTasks: [],
		overdueTasks: [],
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
		upcomingTasks: []
	};
}

describe('OntologyAnalysisPrompt calendar summary', () => {
	it('keeps prompt calendar context compact while preserving counts', () => {
		const today = Array.from({ length: 4 }, (_, index) =>
			createCalendarItem(`today-${index}`, `Today Event ${index}`)
		);
		const upcoming = Array.from({ length: 4 }, (_, index) =>
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
				upcomingTotal: 7,
				hiddenTodayCount: 6,
				hiddenUpcomingCount: 3,
				counts: {
					today: {
						total: 10,
						google: 7,
						internal: 2,
						syncIssue: 1
					},
					upcoming: {
						total: 7,
						google: 3,
						internal: 4,
						syncIssue: 0
					},
					all: {
						total: 17,
						google: 10,
						internal: 6,
						syncIssue: 1
					}
				}
			})
		});

		expect(prompt).toContain('- Calendar Today: 10');
		expect(prompt).toContain('- Calendar Upcoming: 7');
		expect(prompt).toContain('## Calendar Summary');
		expect(prompt).toContain('- Today: 10 items (7 Google, 2 internal, 1 sync issue)');
		expect(prompt).toContain(
			'- Upcoming next 7 days: 7 items (3 Google, 4 internal, 0 sync issues)'
		);
		expect(prompt).toContain('Today Event 0');
		expect(prompt).toContain('Today Event 1');
		expect(prompt).toContain('Upcoming Event 0');
		expect(prompt).toContain('Upcoming Event 1');
		expect(prompt).toContain('- Hidden from prompt: 13 additional calendar items');
		expect(prompt).not.toContain('Today Event 2');
		expect(prompt).not.toContain('Today Event 3');
		expect(prompt).not.toContain('Upcoming Event 2');
		expect(prompt).not.toContain('Upcoming Event 3');
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
				todaysTasks: [],
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
		expect(prompt.toLowerCase()).not.toContain('time block');
		expect(prompt.toLowerCase()).not.toContain('timeblock');
	});
});
