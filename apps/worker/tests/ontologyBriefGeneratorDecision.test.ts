// apps/worker/tests/ontologyBriefGeneratorDecision.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ProjectBriefData } from '../src/workers/brief/ontologyBriefTypes';

vi.mock('../src/lib/supabase.js', () => ({
	supabase: {
		from: vi.fn()
	}
}));

vi.mock('../src/lib/services/smart-llm-service.js', () => ({
	SmartLLMService: vi.fn()
}));

import { getProjectLlmBriefDecision } from '../src/workers/brief/ontologyBriefGenerator';

function createProjectBriefData(overrides: Partial<ProjectBriefData> = {}): ProjectBriefData {
	return {
		project: {
			id: 'project-1',
			name: 'Project 1',
			state_key: 'active',
			type_key: 'project.test',
			description: null,
			next_step_short: null,
			next_step_long: null,
			next_step_source: null,
			next_step_updated_at: null,
			created_at: '2026-05-01T00:00:00.000Z',
			updated_at: '2026-05-01T00:00:00.000Z'
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
		blockedTasks: [],
		unblockingTasks: [],
		recentlyUpdatedTasks: [],
		upcomingTasks: [],
		...overrides
	} as ProjectBriefData;
}

describe('getProjectLlmBriefDecision', () => {
	it('deduplicates overlapping recent-change signals for the same entity', () => {
		const decision = getProjectLlmBriefDecision(
			createProjectBriefData({
				recentChanges: [
					{
						kind: 'task',
						id: 'task-1',
						title: 'Follow up',
						action: 'updated',
						changedAt: '2026-05-19T12:00:00.000Z',
						actorName: 'Dana',
						source: 'activity_log'
					}
				],
				recentlyUpdatedTasks: [
					{
						id: 'task-1',
						project_id: 'project-1',
						title: 'Follow up',
						state_key: 'todo',
						type_key: 'task.execute',
						priority: null,
						due_at: null,
						start_at: null,
						updated_at: '2026-05-19T12:00:00.000Z',
						created_at: '2026-05-19T12:00:00.000Z'
					}
				],
				activityLogs: [
					{
						projectId: 'project-1',
						projectName: 'Project 1',
						isShared: false,
						actorId: 'actor-1',
						actorName: 'Dana',
						action: 'updated',
						entityType: 'onto_tasks',
						entityId: 'task-1',
						entityLabel: 'Follow up',
						createdAt: '2026-05-19T12:00:00.000Z'
					}
				]
			})
		);

		expect(decision.changeCount).toBe(1);
		expect(decision.rawChangeSignalCount).toBe(3);
		expect(decision.shouldUseLlm).toBe(false);
	});

	it('uses the LLM for multiple distinct recent changed entities', () => {
		const decision = getProjectLlmBriefDecision(
			createProjectBriefData({
				recentChanges: [
					{
						kind: 'task',
						id: 'task-1',
						title: 'Follow up',
						action: 'updated',
						changedAt: '2026-05-19T12:00:00.000Z',
						actorName: null,
						source: 'updated_at'
					},
					{
						kind: 'document',
						id: 'doc-1',
						title: 'Brief',
						action: 'created',
						changedAt: '2026-05-19T13:00:00.000Z',
						actorName: null,
						source: 'created_at'
					},
					{
						kind: 'plan',
						id: 'plan-1',
						title: 'Launch Plan',
						action: 'updated',
						changedAt: '2026-05-19T14:00:00.000Z',
						actorName: null,
						source: 'updated_at'
					}
				]
			})
		);

		expect(decision.changeCount).toBe(3);
		expect(decision.shouldUseLlm).toBe(true);
		expect(decision.reasons).toContain('high_recent_change_volume');
	});

	it('keeps a single upcoming commitment deterministic when there is no movement', () => {
		const decision = getProjectLlmBriefDecision(
			createProjectBriefData({
				upcomingTasks: [
					{
						id: 'task-1',
						project_id: 'project-1',
						title: 'Review notes',
						state_key: 'todo',
						type_key: 'task.review',
						priority: null,
						due_at: '2026-05-21T15:00:00.000Z',
						start_at: null,
						updated_at: '2026-05-01T12:00:00.000Z',
						created_at: '2026-05-01T12:00:00.000Z'
					}
				]
			})
		);

		expect(decision.weeklyCommitmentCount).toBe(1);
		expect(decision.shouldUseLlm).toBe(false);
	});
});
