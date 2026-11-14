// apps/worker/tests/chatNextStepPrompt.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabase', () => ({ supabase: {} }));
vi.mock('../src/lib/services/smart-llm-service', () => ({ SmartLLMService: vi.fn() }));
vi.mock('../src/lib/errorLogger', () => ({ logWorkerError: vi.fn() }));

import {
	NEXT_STEP_SYSTEM_PROMPT,
	buildNextStepPrompt,
	projectSavedChanges
} from '../src/workers/chat/chatSessionActivityProcessor';

const TASK_ID = '11111111-1111-4111-8111-111111111111';
const DOC_ID = '22222222-2222-4222-8222-222222222222';
const GOAL_ID = '33333333-3333-4333-8333-333333333333';
const DONE_TASK_ID = '44444444-4444-4444-8444-444444444444';

const context = {
	projectId: 'project-1',
	projectName: '100-Day Nonfiction Book Project',
	projectDescription: 'Contract to self-published manuscript.',
	templateType: 'project.creative.book.nonfiction',
	goals: [],
	recentCompletedTasks: [],
	taskGoalLinks: [],
	recentActivity: [],
	previousNextStep: { short: 'Draft the one-page book overview.', long: null }
};

const savedTask = {
	tool: 'create_onto_task',
	kind: 'task',
	title: 'Outline chapter 3',
	id: TASK_ID,
	operation: 'created',
	projectId: 'project-1'
};
const savedDocument = {
	tool: 'update_onto_document',
	kind: 'document',
	title: 'Chapter blueprint',
	id: DOC_ID,
	operation: 'updated',
	projectId: 'project-1'
};

describe('buildNextStepPrompt', () => {
	it('puts START HERE ahead of the previous step and marks that step as possibly stale', () => {
		const prompt = buildNextStepPrompt(
			context,
			[],
			'## Current state\n- First-pass chapter outline written; filling gaps, starting with the AI pillar.'
		);
		const startHereAt = prompt.indexOf('## START HERE (current state and decisions)');
		const previousAt = prompt.indexOf('## Previous Next Step (may be out of date)');
		expect(startHereAt).toBeGreaterThan(-1);
		expect(previousAt).toBeGreaterThan(startHereAt);
		expect(prompt).toContain('starting with the AI pillar');
	});

	it('omits the START HERE block when the project has none', () => {
		const prompt = buildNextStepPrompt(context, [], null);
		expect(prompt).not.toContain('## START HERE');
		expect(prompt).toContain('Draft the one-page book overview.');
	});

	it('lists what the chat saved, each live record as a reference the model can copy', () => {
		const prompt = buildNextStepPrompt(context, [], null, [
			savedTask,
			savedDocument,
			{
				tool: 'delete_onto_task',
				kind: 'task',
				title: 'Old outline',
				id: DONE_TASK_ID,
				operation: 'deleted'
			},
			{ tool: 'create_calendar_event', kind: 'event', title: 'Writing block', id: 'evt-1' }
		]);

		const lines = prompt.split('\n');
		const start = lines.indexOf('## Recent Changes in This Session');
		expect(start).toBeGreaterThan(-1);
		expect(lines.slice(start + 1, start + 5)).toEqual([
			`- created [[task:${TASK_ID}|Outline chapter 3]]`,
			`- updated [[document:${DOC_ID}|Chapter blueprint]]`,
			// A deleted record and a kind that cannot be linked are named, never linked.
			'- deleted task: "Old outline"',
			'- saved event: "Writing block"'
		]);
		expect(prompt).not.toContain(DONE_TASK_ID);
	});

	it('has no changes block when the chat saved nothing', () => {
		expect(buildNextStepPrompt(context, [], null)).not.toContain(
			'## Recent Changes in This Session'
		);
	});

	it('shows the reference format with a record that is in the context', () => {
		// The newest thing the chat saved.
		expect(buildNextStepPrompt(context, [], null, [savedTask, savedDocument])).toContain(
			`For example, this record from above: [[document:${DOC_ID}|Chapter blueprint]]`
		);
		// Otherwise an active goal, then a recently completed task.
		const withGoal = {
			...context,
			goals: [
				{ id: 'goal-done', name: 'Sign the contract', props: { state: 'completed' } },
				{ id: GOAL_ID, name: 'Finish the manuscript', props: { state: 'active' } }
			],
			recentCompletedTasks: [{ id: DONE_TASK_ID, title: 'Draft the overview' }]
		};
		expect(buildNextStepPrompt(withGoal, [], null)).toContain(
			`For example, this record from above: [[goal:${GOAL_ID}|Finish the manuscript]]`
		);
		expect(buildNextStepPrompt({ ...withGoal, goals: [] }, [], null)).toContain(
			`For example, this record from above: [[task:${DONE_TASK_ID}|Draft the overview]]`
		);
	});

	it('shows no example at all when the context has no record to make one from', () => {
		const prompt = buildNextStepPrompt(context, [], null);
		expect(prompt).not.toContain('## Reference format');
		expect(prompt).not.toContain('[[');
	});
});

describe('next step system prompt', () => {
	it('carries no invented example for the model to imitate', () => {
		for (const invented of [
			'Sarah',
			'Friday',
			'slides 3-5',
			'abc-123',
			'def-456',
			'ghi-789',
			'brand guidelines',
			'Example short',
			'Example long'
		]) {
			expect(NEXT_STEP_SYSTEM_PROMPT).not.toContain(invented);
		}
		// The prompt never supplies user ids, so it no longer offers `user` as a link type.
		expect(NEXT_STEP_SYSTEM_PROMPT).toContain(
			'Valid types: task, document, goal, milestone, risk, plan.'
		);
		expect(NEXT_STEP_SYSTEM_PROMPT).toContain(
			'Never add a person, date, deadline, number or detail that is not written there.'
		);
	});
});

describe('projectSavedChanges', () => {
	it("keeps this project's changes and ones with no project, drops another project's", () => {
		const unscoped = { tool: 'update_onto_task', kind: 'task', title: 'No project on receipt' };
		const elsewhere = { ...savedTask, title: 'Other project task', projectId: 'project-2' };

		expect(projectSavedChanges([savedTask, unscoped, elsewhere], 'project-1')).toEqual([
			savedTask,
			unscoped
		]);
	});
});
