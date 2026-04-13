// apps/worker/tests/ontologyBriefDataLoader.test.ts
/**
 * Unit tests for ontology brief data loader and utilities.
 *
 * Spec Reference: /docs/specs/DAILY_BRIEF_ONTOLOGY_MIGRATION_SPEC.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	categorizeTasks,
	calculateGoalProgress,
	getMilestoneStatus,
	calculatePlanProgress,
	findUnblockingTasks,
	getWorkMode,
	buildProjectAccessFilter,
	findMissingOwnerMembershipProjectIds,
	selectCalendarBriefItems,
	createEmptyCalendarBriefSection
} from '../src/workers/brief/ontologyBriefDataLoader';
import type {
	OntoTask,
	OntoGoal,
	OntoMilestone,
	OntoPlan,
	OntoEdge,
	OntoProject,
	CalendarBriefItem
} from '../src/workers/brief/ontologyBriefTypes';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createMockTask(overrides: Partial<OntoTask> = {}): OntoTask {
	return {
		id: 'task-1',
		project_id: 'project-1',
		title: 'Test Task',
		state_key: 'todo',
		type_key: 'execute',
		priority: 5,
		due_at: null,
		facet_scale: null,
		created_by: 'actor-1',
		created_at: '2025-12-17T00:00:00Z',
		updated_at: '2025-12-17T00:00:00Z',
		props: {},
		search_vector: null,
		...overrides
	} as OntoTask;
}

function createMockGoal(overrides: Partial<OntoGoal> = {}): OntoGoal {
	return {
		id: 'goal-1',
		project_id: 'project-1',
		name: 'Test Goal',
		state_key: 'active',
		type_key: null,
		created_by: 'actor-1',
		created_at: '2025-12-17T00:00:00Z',
		target_date: null,
		props: {},
		search_vector: null,
		...overrides
	} as OntoGoal;
}

function createMockMilestone(overrides: Partial<OntoMilestone> = {}): OntoMilestone {
	return {
		id: 'milestone-1',
		project_id: 'project-1',
		title: 'Test Milestone',
		state_key: 'pending',
		type_key: null,
		due_at: '2025-12-31T00:00:00Z',
		created_by: 'actor-1',
		created_at: '2025-12-17T00:00:00Z',
		props: {},
		search_vector: null,
		...overrides
	} as OntoMilestone;
}

function createMockPlan(overrides: Partial<OntoPlan> = {}): OntoPlan {
	return {
		id: 'plan-1',
		project_id: 'project-1',
		name: 'Test Plan',
		state_key: 'active',
		type_key: 'sprint',
		facet_context: null,
		facet_scale: null,
		facet_stage: null,
		created_by: 'actor-1',
		created_at: '2025-12-17T00:00:00Z',
		updated_at: '2025-12-17T00:00:00Z',
		props: {},
		search_vector: null,
		...overrides
	} as OntoPlan;
}

function createMockProject(overrides: Partial<OntoProject> = {}): OntoProject {
	return {
		id: 'project-1',
		name: 'Test Project',
		description: null,
		state_key: 'active',
		type_key: 'project',
		org_id: null,
		start_at: null,
		end_at: null,
		facet_context: null,
		facet_scale: null,
		facet_stage: null,
		next_step_short: null,
		next_step_long: null,
		next_step_source: null,
		next_step_updated_at: null,
		created_by: 'actor-1',
		created_at: '2025-12-17T00:00:00Z',
		updated_at: '2025-12-17T00:00:00Z',
		props: {},
		...overrides
	} as OntoProject;
}

function createMockEdge(overrides: Partial<OntoEdge> = {}): OntoEdge {
	return {
		id: 'edge-1',
		project_id: 'project-1',
		src_id: 'task-1',
		src_kind: 'task',
		dst_id: 'goal-1',
		dst_kind: 'goal',
		rel: 'supports_goal',
		created_at: '2025-12-17T00:00:00Z',
		props: {},
		...overrides
	} as OntoEdge;
}

function createMockCalendarItem(overrides: Partial<CalendarBriefItem> = {}): CalendarBriefItem {
	return {
		id: 'calendar-1',
		title: 'Calendar Item',
		startAt: '2025-12-17T15:00:00.000Z',
		endAt: '2025-12-17T16:00:00.000Z',
		allDay: false,
		timezone: 'America/New_York',
		projectId: 'project-1',
		projectName: 'Test Project',
		taskId: null,
		eventId: 'event-1',
		itemType: 'event',
		itemKind: 'event',
		stateKey: 'scheduled',
		source: 'internal',
		sourceLabel: 'Internal only',
		googleEventId: null,
		googleCalendarId: null,
		externalLink: null,
		displayTime: '10:00 AM-11:00 AM',
		displayDate: 'Wed Dec 17',
		...overrides
	};
}

// ============================================================================
// TESTS: getWorkMode
// ============================================================================

describe('getWorkMode', () => {
	it('should return null for null input', () => {
		expect(getWorkMode(null)).toBeNull();
	});

	it('should return execute for execute-related type keys', () => {
		// Must start with 'task.execute' OR include 'action'
		expect(getWorkMode('task.execute')).toBe('execute');
		expect(getWorkMode('task.execute.quick')).toBe('execute');
		expect(getWorkMode('action_item')).toBe('execute');
		expect(getWorkMode('take_action')).toBe('execute');
	});

	it('should return create for create-related type keys', () => {
		// Must start with 'task.create' OR include 'produce'
		expect(getWorkMode('task.create')).toBe('create');
		expect(getWorkMode('produce_document')).toBe('create');
	});

	it('should return refine for refine-related type keys', () => {
		// Must start with 'task.refine' OR include 'edit' or 'improve'
		expect(getWorkMode('task.refine')).toBe('refine');
		expect(getWorkMode('edit_content')).toBe('refine');
		expect(getWorkMode('improve_quality')).toBe('refine');
	});

	it('should return research for research-related type keys', () => {
		// Must start with 'task.research' OR include 'learn' or 'discover'
		expect(getWorkMode('task.research')).toBe('research');
		expect(getWorkMode('learn_new_skill')).toBe('research');
		expect(getWorkMode('discover_options')).toBe('research');
	});

	it('should return review for review-related type keys', () => {
		// Must start with 'task.review' OR include 'feedback' or 'assess'
		expect(getWorkMode('task.review')).toBe('review');
		expect(getWorkMode('get_feedback')).toBe('review');
		expect(getWorkMode('assess_progress')).toBe('review');
	});

	it('should return coordinate for coordination-related type keys', () => {
		// Must start with 'task.coordinate' OR include 'discuss' or 'meeting'
		expect(getWorkMode('task.coordinate')).toBe('coordinate');
		expect(getWorkMode('discuss_plan')).toBe('coordinate');
		expect(getWorkMode('meeting_prep')).toBe('coordinate');
	});

	it('should return admin for admin-related type keys', () => {
		// Must start with 'task.admin' OR include 'setup' or 'config'
		expect(getWorkMode('task.admin')).toBe('admin');
		expect(getWorkMode('setup_environment')).toBe('admin');
		expect(getWorkMode('config_settings')).toBe('admin');
	});

	it('should return plan for planning-related type keys', () => {
		// Must start with 'task.plan' OR include 'strategy' or 'define'
		expect(getWorkMode('task.plan')).toBe('plan');
		expect(getWorkMode('strategy_session')).toBe('plan');
		expect(getWorkMode('define_goals')).toBe('plan');
	});

	it('should return null for unknown type keys', () => {
		expect(getWorkMode('unknown_type')).toBeNull();
		expect(getWorkMode('random')).toBeNull();
	});
});

describe('buildProjectAccessFilter', () => {
	it('includes actor ownership, legacy user ownership, and memberships', () => {
		expect(
			buildProjectAccessFilter({
				actorId: 'actor-1',
				userId: 'user-1',
				memberProjectIds: ['project-1', 'project-2']
			})
		).toBe('created_by.eq.actor-1,created_by.eq.user-1,id.in.(project-1,project-2)');
	});

	it('omits membership clause when there are no memberships', () => {
		expect(
			buildProjectAccessFilter({
				actorId: 'actor-1',
				userId: 'user-1',
				memberProjectIds: []
			})
		).toBe('created_by.eq.actor-1,created_by.eq.user-1');
	});
});

describe('findMissingOwnerMembershipProjectIds', () => {
	it('flags owned projects missing membership rows for reconciliation', () => {
		const projects = [
			createMockProject({ id: 'project-1', created_by: 'actor-1' }),
			createMockProject({ id: 'project-2', created_by: 'user-1' }),
			createMockProject({ id: 'project-3', created_by: 'actor-2' }),
			createMockProject({ id: 'project-4', created_by: 'actor-1' })
		];

		expect(
			findMissingOwnerMembershipProjectIds({
				projects,
				actorId: 'actor-1',
				userId: 'user-1',
				memberProjectIds: ['project-4']
			})
		).toEqual(['project-1', 'project-2']);
	});

	it('ignores projects already covered by memberships or other owners', () => {
		const projects = [
			createMockProject({ id: 'project-1', created_by: 'actor-1' }),
			createMockProject({ id: 'project-2', created_by: 'actor-2' })
		];

		expect(
			findMissingOwnerMembershipProjectIds({
				projects,
				actorId: 'actor-1',
				userId: 'user-1',
				memberProjectIds: ['project-1']
			})
		).toEqual([]);
	});
});

describe('calendar brief selection', () => {
	const timezone = 'America/New_York';
	const briefDate = '2025-12-17';

	it('returns an empty calendar section when no items are provided', () => {
		expect(selectCalendarBriefItems([], briefDate, timezone)).toEqual(
			createEmptyCalendarBriefSection()
		);
	});

	it('caps today and upcoming items while preserving total counts', () => {
		const todayItems = Array.from({ length: 10 }, (_, index) =>
			createMockCalendarItem({
				id: `today-${index}`,
				eventId: `event-today-${index}`,
				title: `Today ${index}`,
				startAt: `2025-12-17T${String(13 + index).padStart(2, '0')}:00:00.000Z`,
				endAt: `2025-12-17T${String(14 + index).padStart(2, '0')}:00:00.000Z`
			})
		);
		const upcomingItems = Array.from({ length: 7 }, (_, index) =>
			createMockCalendarItem({
				id: `upcoming-${index}`,
				eventId: `event-upcoming-${index}`,
				title: `Upcoming ${index}`,
				startAt: `2025-12-${18 + index}T15:00:00.000Z`,
				endAt: `2025-12-${18 + index}T16:00:00.000Z`,
				displayDate: `Dec ${18 + index}`
			})
		);

		const result = selectCalendarBriefItems(
			[...todayItems, ...upcomingItems],
			briefDate,
			timezone
		);

		expect(result.today).toHaveLength(8);
		expect(result.upcoming).toHaveLength(5);
		expect(result.allItems).toHaveLength(17);
		expect(result.todayTotal).toBe(10);
		expect(result.upcomingTotal).toBe(7);
		expect(result.hiddenTodayCount).toBe(2);
		expect(result.hiddenUpcomingCount).toBe(2);
	});

	it('orders all-day items before timed items on the same local date', () => {
		const result = selectCalendarBriefItems(
			[
				createMockCalendarItem({
					id: 'all-day',
					eventId: 'event-all-day',
					title: 'All-day planning hold',
					startAt: '2025-12-17T05:00:00.000Z',
					endAt: '2025-12-18T05:00:00.000Z',
					allDay: true,
					displayTime: 'All day'
				}),
				createMockCalendarItem({
					id: 'timed',
					eventId: 'event-timed',
					title: 'Morning customer call',
					startAt: '2025-12-17T14:00:00.000Z',
					endAt: '2025-12-17T15:00:00.000Z',
					allDay: false,
					displayTime: '9:00 AM-10:00 AM'
				})
			],
			briefDate,
			timezone
		);

		expect(result.today.map((item) => item.id)).toEqual(['all-day', 'timed']);
	});

	it('keeps all-day events visible when today is capped', () => {
		const timedItems = Array.from({ length: 8 }, (_, index) =>
			createMockCalendarItem({
				id: `timed-${index}`,
				eventId: `event-timed-${index}`,
				title: `Timed ${index}`,
				startAt: `2025-12-17T${String(13 + index).padStart(2, '0')}:00:00.000Z`,
				endAt: `2025-12-17T${String(14 + index).padStart(2, '0')}:00:00.000Z`
			})
		);
		const allDay = createMockCalendarItem({
			id: 'all-day',
			eventId: 'event-all-day',
			title: 'Launch Window',
			startAt: '2025-12-17T05:00:00.000Z',
			endAt: '2025-12-18T05:00:00.000Z',
			allDay: true,
			displayTime: 'All day'
		});

		const result = selectCalendarBriefItems([...timedItems, allDay], briefDate, timezone);

		expect(result.today).toHaveLength(8);
		expect(result.today[0]?.id).toBe('all-day');
		expect(result.today.map((item) => item.id)).toContain('all-day');
		expect(result.hiddenTodayCount).toBe(1);
	});

	it('includes multi-day items that overlap the brief date', () => {
		const result = selectCalendarBriefItems(
			[
				createMockCalendarItem({
					id: 'overnight',
					eventId: 'event-overnight',
					title: 'Overnight launch window',
					startAt: '2025-12-17T01:00:00.000Z',
					endAt: '2025-12-17T15:00:00.000Z',
					displayTime: 'Tue Dec 16 8:00 PM-10:00 AM'
				})
			],
			briefDate,
			timezone
		);

		expect(result.today).toHaveLength(1);
		expect(result.today[0].id).toBe('overnight');
		expect(result.upcoming).toHaveLength(0);
	});

	it('tracks source label counts across today and upcoming windows', () => {
		const result = selectCalendarBriefItems(
			[
				createMockCalendarItem({
					id: 'google',
					eventId: 'event-google',
					source: 'google',
					sourceLabel: 'Google Calendar',
					googleEventId: 'google-1'
				}),
				createMockCalendarItem({
					id: 'internal',
					eventId: 'event-internal',
					source: 'internal',
					sourceLabel: 'Internal only'
				}),
				createMockCalendarItem({
					id: 'sync-issue',
					eventId: 'event-sync',
					source: 'sync_issue',
					sourceLabel: 'Google sync issue',
					googleEventId: 'google-2',
					startAt: '2025-12-18T15:00:00.000Z'
				})
			],
			briefDate,
			timezone
		);

		expect(result.counts.today.google).toBe(1);
		expect(result.counts.today.internal).toBe(1);
		expect(result.counts.upcoming.syncIssue).toBe(1);
		expect(result.counts.all.total).toBe(3);
	});

	it('deduplicates Google mapped items before applying caps', () => {
		const result = selectCalendarBriefItems(
			[
				createMockCalendarItem({
					id: 'internal-event',
					eventId: 'event-internal',
					taskId: 'task-1',
					source: 'internal',
					sourceLabel: 'Internal only'
				}),
				createMockCalendarItem({
					id: 'google-event',
					eventId: null,
					taskId: 'task-1',
					source: 'google',
					sourceLabel: 'Google Calendar',
					googleEventId: 'google-1'
				}),
				createMockCalendarItem({
					id: 'google-event-duplicate',
					eventId: null,
					taskId: 'task-1',
					source: 'sync_issue',
					sourceLabel: 'Google sync issue',
					googleEventId: 'google-1'
				})
			],
			briefDate,
			timezone
		);

		expect(result.today).toHaveLength(2);
		expect(result.today.some((item) => item.id === 'google-event-duplicate')).toBe(false);
		expect(result.today.some((item) => item.id === 'google-event')).toBe(true);
	});
});

// ============================================================================
// TESTS: categorizeTasks
// ============================================================================

describe('categorizeTasks', () => {
	const timezone = 'America/New_York';
	// briefDate should be a yyyy-MM-dd string representing the date in user's timezone
	const briefDate = '2025-12-17';

	it('should categorize tasks due today', () => {
		const tasks = [
			createMockTask({
				id: 'task-1',
				due_at: '2025-12-17T14:00:00Z',
				state_key: 'todo'
			})
		];

		const result = categorizeTasks(tasks, briefDate, timezone);
		expect(result.todaysTasks).toHaveLength(1);
		expect(result.todaysTasks[0].id).toBe('task-1');
	});

	it('should categorize overdue tasks', () => {
		const tasks = [
			createMockTask({
				id: 'task-1',
				due_at: '2025-12-15T14:00:00Z',
				state_key: 'todo'
			})
		];

		const result = categorizeTasks(tasks, briefDate, timezone);
		expect(result.overdueTasks).toHaveLength(1);
		expect(result.overdueTasks[0].id).toBe('task-1');
	});

	it('should categorize upcoming tasks (next 7 days)', () => {
		const tasks = [
			createMockTask({
				id: 'task-1',
				due_at: '2025-12-20T14:00:00Z',
				state_key: 'todo'
			})
		];

		const result = categorizeTasks(tasks, briefDate, timezone);
		expect(result.upcomingTasks).toHaveLength(1);
		expect(result.upcomingTasks[0].id).toBe('task-1');
	});

	it('should categorize recently completed tasks', () => {
		// Use a timestamp within the last 24 hours relative to now
		const recentTimestamp = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
		const tasks = [
			createMockTask({
				id: 'task-1',
				state_key: 'done',
				updated_at: recentTimestamp
			})
		];

		// Use today's date as briefDate for this test
		const today = new Date().toISOString().split('T')[0];
		const result = categorizeTasks(tasks, today, timezone);
		expect(result.recentlyCompleted).toHaveLength(1);
		expect(result.recentlyCompleted[0].id).toBe('task-1');
	});

	it('should categorize blocked tasks', () => {
		const tasks = [
			createMockTask({
				id: 'task-1',
				state_key: 'blocked'
			})
		];

		const result = categorizeTasks(tasks, briefDate, timezone);
		expect(result.blockedTasks).toHaveLength(1);
	});

	it('should categorize in-progress tasks', () => {
		const tasks = [
			createMockTask({
				id: 'task-1',
				state_key: 'in_progress'
			})
		];

		const result = categorizeTasks(tasks, briefDate, timezone);
		expect(result.inProgressTasks).toHaveLength(1);
	});

	it('should categorize tasks by work mode', () => {
		// type_key needs to match the patterns in categorizeTasks:
		// - task.execute* or includes 'action'
		// - task.create* or includes 'produce'
		// - task.research* or includes 'learn' or 'discover'
		const tasks = [
			createMockTask({ id: 'task-1', type_key: 'task.execute' }),
			createMockTask({ id: 'task-2', type_key: 'task.create' }),
			createMockTask({ id: 'task-3', type_key: 'task.research' })
		];

		const result = categorizeTasks(tasks, briefDate, timezone);
		expect(result.executeTasks).toHaveLength(1);
		expect(result.createTasks).toHaveLength(1);
		expect(result.researchTasks).toHaveLength(1);
	});

	it('should not include done tasks in overdue', () => {
		const tasks = [
			createMockTask({
				id: 'task-1',
				due_at: '2025-12-15T14:00:00Z',
				state_key: 'done'
			})
		];

		const result = categorizeTasks(tasks, briefDate, timezone);
		expect(result.overdueTasks).toHaveLength(0);
	});
});

// ============================================================================
// TESTS: calculateGoalProgress
// ============================================================================

describe('calculateGoalProgress', () => {
	const todayStr = '2025-12-17';
	const timezone = 'UTC';

	it('should default to on_track when target date is missing', () => {
		const goal = createMockGoal();
		const edges: OntoEdge[] = [];
		const tasks: OntoTask[] = [];

		const result = calculateGoalProgress(goal, edges, tasks, todayStr, timezone);

		expect(result.totalTasks).toBe(0);
		expect(result.completedTasks).toBe(0);
		expect(result.targetDate).toBeNull();
		expect(result.targetDaysAway).toBeNull();
		expect(result.status).toBe('on_track');
	});

	it('should mark goals at risk when target date is within 7 days', () => {
		const goal = createMockGoal({ id: 'goal-1', target_date: '2025-12-24T00:00:00Z' });
		const tasks = [
			createMockTask({ id: 'task-1', state_key: 'done' }),
			createMockTask({ id: 'task-2', state_key: 'done' }),
			createMockTask({ id: 'task-3', state_key: 'todo' }),
			createMockTask({ id: 'task-4', state_key: 'todo' })
		];
		const edges = tasks.map((t) =>
			createMockEdge({
				src_id: t.id,
				src_kind: 'task',
				dst_id: 'goal-1',
				dst_kind: 'goal',
				rel: 'supports_goal'
			})
		);

		const result = calculateGoalProgress(goal, edges, tasks, todayStr, timezone);

		expect(result.totalTasks).toBe(4);
		expect(result.completedTasks).toBe(2);
		expect(result.targetDate).toBe('2025-12-24');
		expect(result.targetDaysAway).toBe(7);
		expect(result.status).toBe('at_risk');
	});

	it('should mark goals on track when target date is more than 7 days away', () => {
		const goal = createMockGoal({ id: 'goal-1', target_date: '2025-12-26T00:00:00Z' });
		const tasks = [createMockTask({ id: 'task-1', state_key: 'done' })];
		const edges = tasks.map((t) =>
			createMockEdge({
				src_id: t.id,
				src_kind: 'task',
				dst_id: 'goal-1',
				dst_kind: 'goal',
				rel: 'supports_goal'
			})
		);

		const result = calculateGoalProgress(goal, edges, tasks, todayStr, timezone);

		expect(result.targetDate).toBe('2025-12-26');
		expect(result.targetDaysAway).toBe(9);
		expect(result.status).toBe('on_track');
	});

	it('should mark goals behind when target date has passed', () => {
		const goal = createMockGoal({ id: 'goal-1', target_date: '2025-12-15T00:00:00Z' });
		const tasks = [createMockTask({ id: 'task-1', state_key: 'todo' })];
		const edges = tasks.map((t) =>
			createMockEdge({
				src_id: t.id,
				src_kind: 'task',
				dst_id: 'goal-1',
				dst_kind: 'goal',
				rel: 'supports_goal'
			})
		);

		const result = calculateGoalProgress(goal, edges, tasks, todayStr, timezone);

		expect(result.targetDate).toBe('2025-12-15');
		expect(result.targetDaysAway).toBe(-2);
		expect(result.status).toBe('behind');
	});
});

// ============================================================================
// TESTS: getMilestoneStatus
// ============================================================================

describe('getMilestoneStatus', () => {
	const timezone = 'UTC';

	it('should calculate days away correctly', () => {
		const todayStr = '2025-12-17';
		const milestone = createMockMilestone({
			due_at: '2025-12-24T00:00:00Z', // Exactly 7 days later
			state_key: 'pending'
		});
		const project = createMockProject();

		const result = getMilestoneStatus(milestone, project, todayStr, timezone);

		expect(result.daysAway).toBe(7);
		expect(result.isAtRisk).toBe(true); // Within 7 days and not done
		expect(result.projectName).toBe('Test Project');
	});

	it('should not mark completed milestones as at risk', () => {
		const todayStr = '2025-12-17';
		const milestone = createMockMilestone({
			due_at: '2025-12-18T00:00:00Z',
			state_key: 'completed' // milestone_state uses 'completed' not 'done'
		});
		const project = createMockProject();

		const result = getMilestoneStatus(milestone, project, todayStr, timezone);

		expect(result.isAtRisk).toBe(false);
	});

	it('should not mark far-off milestones as at risk', () => {
		const todayStr = '2025-12-17';
		const milestone = createMockMilestone({
			due_at: '2025-12-31T00:00:00Z', // Exactly 14 days later
			state_key: 'pending'
		});
		const project = createMockProject();

		const result = getMilestoneStatus(milestone, project, todayStr, timezone);

		expect(result.daysAway).toBe(14);
		expect(result.isAtRisk).toBe(false);
	});

	it('should handle timezone differences correctly', () => {
		// User is in Pacific timezone (UTC-8)
		const pacificTimezone = 'America/Los_Angeles';
		const todayStr = '2025-12-17'; // Dec 17 in Pacific time

		// Milestone is due Dec 24 at 8 AM UTC, which is Dec 24 at midnight Pacific
		const milestone = createMockMilestone({
			due_at: '2025-12-24T08:00:00Z',
			state_key: 'pending'
		});
		const project = createMockProject();

		const result = getMilestoneStatus(milestone, project, todayStr, pacificTimezone);

		expect(result.daysAway).toBe(7); // Dec 17 to Dec 24 in Pacific = 7 days
		expect(result.isAtRisk).toBe(true);
	});
});

// ============================================================================
// TESTS: calculatePlanProgress
// ============================================================================

describe('calculatePlanProgress', () => {
	it('should calculate plan progress from tasks', () => {
		const plan = createMockPlan({ id: 'plan-1' });
		const tasks = [
			createMockTask({ id: 'task-1', state_key: 'done' }),
			createMockTask({ id: 'task-2', state_key: 'done' }),
			createMockTask({ id: 'task-3', state_key: 'in_progress' })
		];
		const edges = tasks.map((t) =>
			createMockEdge({
				src_id: 'plan-1',
				src_kind: 'plan',
				dst_id: t.id,
				dst_kind: 'task',
				rel: 'has_task'
			})
		);

		const result = calculatePlanProgress(plan, edges, tasks);

		expect(result.totalTasks).toBe(3);
		expect(result.completedTasks).toBe(2);
		expect(result.progressPercent).toBe(67);
	});

	it('should handle plan with no tasks', () => {
		const plan = createMockPlan({ id: 'plan-1' });
		const edges: OntoEdge[] = [];
		const tasks: OntoTask[] = [];

		const result = calculatePlanProgress(plan, edges, tasks);

		expect(result.totalTasks).toBe(0);
		expect(result.completedTasks).toBe(0);
		expect(result.progressPercent).toBe(0);
	});
});

// ============================================================================
// TESTS: findUnblockingTasks
// ============================================================================

describe('findUnblockingTasks', () => {
	it('should find tasks that block other tasks', () => {
		const tasks = [
			createMockTask({ id: 'blocker-1', title: 'Blocker Task', state_key: 'todo' }),
			createMockTask({ id: 'blocked-1', title: 'Blocked Task 1', state_key: 'blocked' }),
			createMockTask({ id: 'blocked-2', title: 'Blocked Task 2', state_key: 'blocked' })
		];
		const edges = [
			createMockEdge({
				src_id: 'blocked-1',
				src_kind: 'task',
				dst_id: 'blocker-1',
				dst_kind: 'task',
				rel: 'depends_on'
			}),
			createMockEdge({
				src_id: 'blocked-2',
				src_kind: 'task',
				dst_id: 'blocker-1',
				dst_kind: 'task',
				rel: 'depends_on'
			})
		];

		const result = findUnblockingTasks(tasks, edges);

		expect(result).toHaveLength(1);
		expect(result[0].task.id).toBe('blocker-1');
		expect(result[0].blockedTasks).toHaveLength(2);
	});

	it('should not include completed blocker tasks', () => {
		const tasks = [
			createMockTask({ id: 'blocker-1', title: 'Blocker Task', state_key: 'done' }),
			createMockTask({ id: 'blocked-1', title: 'Blocked Task', state_key: 'blocked' })
		];
		const edges = [
			createMockEdge({
				src_id: 'blocked-1',
				src_kind: 'task',
				dst_id: 'blocker-1',
				dst_kind: 'task',
				rel: 'depends_on'
			})
		];

		const result = findUnblockingTasks(tasks, edges);

		expect(result).toHaveLength(0);
	});

	it('should sort by number of blocked tasks', () => {
		const tasks = [
			createMockTask({ id: 'blocker-1', state_key: 'todo' }),
			createMockTask({ id: 'blocker-2', state_key: 'todo' }),
			createMockTask({ id: 'blocked-1', state_key: 'blocked' }),
			createMockTask({ id: 'blocked-2', state_key: 'blocked' }),
			createMockTask({ id: 'blocked-3', state_key: 'blocked' })
		];
		const edges = [
			// blocker-1 blocks 1 task
			createMockEdge({
				src_id: 'blocked-1',
				src_kind: 'task',
				dst_id: 'blocker-1',
				dst_kind: 'task',
				rel: 'depends_on'
			}),
			// blocker-2 blocks 2 tasks
			createMockEdge({
				src_id: 'blocked-2',
				src_kind: 'task',
				dst_id: 'blocker-2',
				dst_kind: 'task',
				rel: 'depends_on'
			}),
			createMockEdge({
				src_id: 'blocked-3',
				src_kind: 'task',
				dst_id: 'blocker-2',
				dst_kind: 'task',
				rel: 'depends_on'
			})
		];

		const result = findUnblockingTasks(tasks, edges);

		expect(result).toHaveLength(2);
		expect(result[0].task.id).toBe('blocker-2'); // Most impact first
		expect(result[0].blockedTasks).toHaveLength(2);
		expect(result[1].task.id).toBe('blocker-1');
		expect(result[1].blockedTasks).toHaveLength(1);
	});

	it('should return empty array when no dependencies exist', () => {
		const tasks = [
			createMockTask({ id: 'task-1', state_key: 'todo' }),
			createMockTask({ id: 'task-2', state_key: 'todo' })
		];
		const edges: OntoEdge[] = [];

		const result = findUnblockingTasks(tasks, edges);

		expect(result).toHaveLength(0);
	});
});
