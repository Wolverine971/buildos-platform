// apps/worker/tests/ontologyBriefGenerator.statusLines.test.ts
// The template lines a brief prints without a model: the day line under the Executive
// Brief, the status line on a template project write-up, and the fallback summary.
import { describe, expect, it, vi } from 'vitest';
import type {
	GoalProgress,
	OntoTask,
	OntologyBriefData,
	ProjectBriefData
} from '../src/workers/brief/ontologyBriefTypes';

vi.mock('../src/lib/supabase.js', () => ({
	supabase: {
		from: vi.fn()
	}
}));

vi.mock('../src/lib/services/smart-llm-service.js', () => ({
	SmartLLMService: vi.fn()
}));

import {
	buildFallbackExecutiveSummary,
	formatDayLine,
	formatProjectStatusLine,
	generateMainBriefMarkdown
} from '../src/workers/brief/ontologyBriefGenerator';
import { createEmptyCalendarBriefSection } from '../src/workers/brief/ontologyBriefDataLoader';

function tasks(count: number, prefix: string): OntoTask[] {
	return Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}` }) as OntoTask);
}

function projects(count: number): ProjectBriefData[] {
	return Array.from(
		{ length: count },
		(_, index) => ({ project: { id: `project-${index}` } }) as ProjectBriefData
	);
}

function day(counts: { today?: number; overdue?: number; blocked?: number; projects?: number }) {
	return {
		todaysTasks: tasks(counts.today ?? 0, 'today'),
		overdueTasks: tasks(counts.overdue ?? 0, 'overdue'),
		blockedTasks: tasks(counts.blocked ?? 0, 'blocked'),
		projects: projects(counts.projects ?? 1)
	};
}

function createProjectBriefData(overrides: Partial<ProjectBriefData> = {}): ProjectBriefData {
	return {
		project: {
			id: 'project-1',
			name: 'Project 1',
			state_key: 'active'
		},
		isShared: false,
		activityLogs: [],
		recentChanges: [],
		goals: [],
		plans: [],
		requirements: [],
		documents: [],
		nextSteps: [],
		nextMilestone: null,
		activePlan: null,
		calendarToday: [],
		calendarUpcoming: [],
		todaysTasks: [],
		overdueTasks: [],
		thisWeekTasks: [],
		openTaskCount: 0,
		blockedTasks: [],
		unblockingTasks: [],
		recentlyUpdatedTasks: [],
		upcomingTasks: [],
		...overrides
	} as ProjectBriefData;
}

describe('formatDayLine', () => {
	it('says clear day only when nothing is scheduled, overdue or blocked', () => {
		expect(formatDayLine(day({}))).toBe('📭 **Clear day** — no tasks scheduled');
	});

	it('never says clear day while overdue work is open, and gives no overdue total', () => {
		// The 2026-11-13 brief: nothing dated today, 58 overdue.
		const line = formatDayLine(day({ overdue: 58 }));

		expect(line).toBe('📌 **Nothing scheduled today** — overdue work is still open');
		expect(line).not.toContain('Clear day');
		expect(line).not.toMatch(/\d/);
	});

	it('never says clear day while blocked work is open', () => {
		expect(formatDayLine(day({ blocked: 2 }))).toBe(
			'📌 **Nothing scheduled today** — blocked work is still open'
		);
		expect(formatDayLine(day({ overdue: 1, blocked: 1 }))).toBe(
			'📌 **Nothing scheduled today** — overdue and blocked work is still open'
		);
	});

	it('names overdue work on a busy day without adding it up', () => {
		const line = formatDayLine(day({ today: 4, overdue: 58, blocked: 2, projects: 3 }));

		expect(line).toBe(
			'🔴 **Overdue and blocked work needs attention** — 4 tasks across 3 projects'
		);
		expect(line).not.toContain('58');
		expect(line).not.toContain('60');
		expect(formatDayLine(day({ today: 4, overdue: 3, projects: 3 }))).toBe(
			'🔴 **Overdue work needs attention** — 4 tasks across 3 projects'
		);
	});

	it('keeps the existing lines when nothing is overdue', () => {
		expect(formatDayLine(day({ today: 2, blocked: 3, projects: 2 }))).toBe(
			'🔴 **3 items need attention** — 2 tasks across 2 projects'
		);
		expect(formatDayLine(day({ today: 12, projects: 4 }))).toBe(
			'📋 **Full day** — 12 tasks across 4 projects'
		);
		expect(formatDayLine(day({ today: 6, projects: 2 }))).toBe(
			'🎯 **Solid workload** — 6 tasks across 2 projects'
		);
		expect(formatDayLine(day({ today: 2 }))).toBe(
			'✨ **Light day** — 2 tasks, good for deep work'
		);
	});
});

describe('formatProjectStatusLine', () => {
	it('says how many tasks are open when none are dated this week', () => {
		expect(formatProjectStatusLine(createProjectBriefData({ openTaskCount: 12 }))).toBe(
			'📋 **12 open tasks** — none dated this week'
		);
		expect(formatProjectStatusLine(createProjectBriefData({ openTaskCount: 1 }))).toBe(
			'📋 **1 open task** — none dated this week'
		);
	});

	it('keeps the planning line for a project with no open tasks at all', () => {
		expect(formatProjectStatusLine(createProjectBriefData({ openTaskCount: 0 }))).toBe(
			'📭 **No active tasks** — project may need planning'
		);
	});

	it('still leads with dated work when there is some', () => {
		expect(
			formatProjectStatusLine(
				createProjectBriefData({ openTaskCount: 12, thisWeekTasks: tasks(2, 'week') })
			)
		).toBe('📅 **2 tasks this week** — nothing urgent today');
		expect(
			formatProjectStatusLine(
				createProjectBriefData({
					openTaskCount: 12,
					todaysTasks: tasks(1, 'today'),
					thisWeekTasks: tasks(1, 'today')
				})
			)
		).toBe('✅ **On track** — 1 task today');
	});
});

describe('buildFallbackExecutiveSummary', () => {
	const atRisk = { status: 'at_risk' } as GoalProgress;

	it('uses the singular for one project, task or goal', () => {
		expect(
			buildFallbackExecutiveSummary({
				projects: projects(1),
				todaysTasks: tasks(1, 'today'),
				blockedTasks: tasks(1, 'blocked'),
				overdueTasks: [],
				goals: [atRisk]
			})
		).toBe(
			'You have **1 active project** with **1 task** starting today. **1 task** is blocked. **1 goal** needs attention.'
		);
	});

	it('keeps the plural wording for more than one', () => {
		expect(
			buildFallbackExecutiveSummary({
				projects: projects(3),
				todaysTasks: tasks(5, 'today'),
				blockedTasks: tasks(2, 'blocked'),
				overdueTasks: [],
				goals: [atRisk, atRisk]
			})
		).toBe(
			'You have **3 active projects** with **5 tasks** starting today. **2 tasks** are blocked. **2 goals** need attention.'
		);
	});
});

describe('Recent Wins', () => {
	function doneTask(id: string, title: string, completedAt: string, updatedAt: string): OntoTask {
		return {
			id,
			project_id: 'project-0',
			title,
			state_key: 'done',
			priority: null,
			completed_at: completedAt,
			updated_at: updatedAt
		} as OntoTask;
	}

	function briefData(overrides: Partial<OntologyBriefData>): OntologyBriefData {
		return {
			briefDate: '2026-11-14',
			timezone: 'UTC',
			goals: [],
			risks: [],
			requirements: [],
			todaysTasks: [],
			blockedTasks: [],
			overdueTasks: [],
			inProgressTasks: [],
			staleInProgressTasks: [],
			highPriorityCount: 0,
			recentUpdates: { tasks: [], goals: [], documents: [] },
			recentlyPausedProjects: [],
			tasksByWorkMode: {},
			projects: [
				{ project: { id: 'project-0', name: 'Alpha' } } as unknown as ProjectBriefData
			],
			workspace: null,
			calendar: createEmptyCalendarBriefSection(),
			recentlyUpdatedTasks: [],
			upcomingTasks: [],
			...overrides
		} as OntologyBriefData;
	}

	it('lists tasks finished in the last 24 hours, not old finished tasks edited yesterday', () => {
		const finishedToday = doneTask(
			'task-new',
			'Ship the pricing page',
			'2026-11-14T09:00:00.000Z',
			'2026-11-14T09:00:00.000Z'
		);
		const finishedLastMonth = doneTask(
			'task-old',
			'Write the old launch post',
			'2026-10-02T09:00:00.000Z',
			'2026-11-13T20:00:00.000Z'
		);

		const markdown = generateMainBriefMarkdown(
			briefData({
				// The 24-hour updated_at window holds both; only one was finished in it.
				recentUpdates: {
					tasks: [finishedToday, finishedLastMonth],
					goals: [],
					documents: []
				},
				recentlyCompletedTasks: [finishedToday]
			}),
			[],
			'',
			null,
			[]
		);

		expect(markdown).toContain('## ✅ Recent Wins');
		expect(markdown).toContain('**1 task completed** in the last 24h');
		expect(markdown).toContain('Ship the pricing page');
		expect(markdown).not.toContain('Write the old launch post');
	});

	it('leaves the section out when nothing was finished in the last 24 hours', () => {
		const finishedLastMonth = doneTask(
			'task-old',
			'Write the old launch post',
			'2026-10-02T09:00:00.000Z',
			'2026-11-13T20:00:00.000Z'
		);

		const markdown = generateMainBriefMarkdown(
			briefData({
				recentUpdates: { tasks: [finishedLastMonth], goals: [], documents: [] },
				recentlyCompletedTasks: []
			}),
			[],
			'',
			null,
			[]
		);

		expect(markdown).not.toContain('Recent Wins');
		expect(markdown).not.toContain('Write the old launch post');
	});
});
