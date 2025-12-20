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
	getOutputStatus,
	getMilestoneStatus,
	calculatePlanProgress,
	findUnblockingTasks,
	getWorkMode
} from '../src/workers/brief/ontologyBriefDataLoader';
import type {
	OntoTask,
	OntoGoal,
	OntoOutput,
	OntoMilestone,
	OntoPlan,
	OntoEdge,
	OntoProject
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
		props: {},
		search_vector: null,
		...overrides
	} as OntoGoal;
}

function createMockOutput(overrides: Partial<OntoOutput> = {}): OntoOutput {
	return {
		id: 'output-1',
		project_id: 'project-1',
		name: 'Test Output',
		state_key: 'draft',
		type_key: 'document',
		facet_stage: null,
		source_document_id: null,
		source_event_id: null,
		created_by: 'actor-1',
		created_at: '2025-12-17T00:00:00Z',
		updated_at: '2025-12-17T00:00:00Z',
		props: {},
		search_vector: null,
		...overrides
	} as OntoOutput;
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
	it('should calculate 0% progress for goal with no supporting tasks', () => {
		const goal = createMockGoal();
		const edges: OntoEdge[] = [];
		const tasks: OntoTask[] = [];

		const result = calculateGoalProgress(goal, edges, tasks);

		expect(result.totalTasks).toBe(0);
		expect(result.completedTasks).toBe(0);
		expect(result.progressPercent).toBe(0);
		expect(result.status).toBe('behind');
	});

	it('should calculate correct progress percentage', () => {
		const goal = createMockGoal({ id: 'goal-1' });
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

		const result = calculateGoalProgress(goal, edges, tasks);

		expect(result.totalTasks).toBe(4);
		expect(result.completedTasks).toBe(2);
		expect(result.progressPercent).toBe(50);
		expect(result.status).toBe('at_risk'); // 50% is at_risk
	});

	it('should return on_track status for 70%+ progress', () => {
		const goal = createMockGoal({ id: 'goal-1' });
		const tasks = [
			createMockTask({ id: 'task-1', state_key: 'done' }),
			createMockTask({ id: 'task-2', state_key: 'done' }),
			createMockTask({ id: 'task-3', state_key: 'done' }),
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

		const result = calculateGoalProgress(goal, edges, tasks);

		expect(result.progressPercent).toBe(75);
		expect(result.status).toBe('on_track');
	});

	it('should return behind status for less than 40% progress', () => {
		const goal = createMockGoal({ id: 'goal-1' });
		const tasks = [
			createMockTask({ id: 'task-1', state_key: 'done' }),
			createMockTask({ id: 'task-2', state_key: 'todo' }),
			createMockTask({ id: 'task-3', state_key: 'todo' }),
			createMockTask({ id: 'task-4', state_key: 'todo' }),
			createMockTask({ id: 'task-5', state_key: 'todo' })
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

		const result = calculateGoalProgress(goal, edges, tasks);

		expect(result.progressPercent).toBe(20);
		expect(result.status).toBe('behind');
	});
});

// ============================================================================
// TESTS: getOutputStatus
// ============================================================================

describe('getOutputStatus', () => {
	it('should return output status with linked entities', () => {
		const output = createMockOutput({ id: 'output-1', state_key: 'review' });
		const edges = [
			createMockEdge({
				src_id: 'output-1',
				src_kind: 'output',
				dst_id: 'goal-1',
				dst_kind: 'goal',
				rel: 'delivers'
			}),
			createMockEdge({
				src_id: 'task-1',
				src_kind: 'task',
				dst_id: 'output-1',
				dst_kind: 'output',
				rel: 'produces'
			})
		];

		const result = getOutputStatus(output, edges);

		expect(result.state).toBe('review');
		expect(result.linkedGoals).toContain('goal-1');
		expect(result.linkedTasks).toContain('task-1');
	});

	it('should handle output with no linked entities', () => {
		const output = createMockOutput({ id: 'output-1', state_key: 'draft' });
		const edges: OntoEdge[] = [];

		const result = getOutputStatus(output, edges);

		expect(result.linkedGoals).toHaveLength(0);
		expect(result.linkedTasks).toHaveLength(0);
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
