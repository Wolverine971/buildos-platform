// apps/worker/tests/projectNextStepGenerator.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OntoProjectWithRelations } from '../src/workers/brief/ontologyBriefTypes';

const mocks = vi.hoisted(() => ({
	getJSONResponse: vi.fn(),
	supabaseFrom: vi.fn()
}));

vi.mock('../src/lib/supabase.js', () => ({
	supabase: {
		from: mocks.supabaseFrom
	}
}));

vi.mock('../src/lib/services/smart-llm-service.js', () => ({
	SmartLLMService: vi.fn().mockImplementation(() => ({
		getJSONResponse: mocks.getJSONResponse
	}))
}));

import { generateProjectNextStepsForBrief } from '../src/workers/brief/projectNextStepGenerator';

function createProject(id: string, overrides: Partial<OntoProjectWithRelations> = {}) {
	return {
		project: {
			id,
			name: `Project ${id}`,
			state_key: 'active',
			type_key: 'project.test',
			description: null,
			next_step_short: null,
			next_step_long: null,
			next_step_source: null,
			next_step_updated_at: null,
			created_at: '2026-05-01T00:00:00.000Z',
			updated_at: `2026-05-0${id}T00:00:00.000Z`
		},
		isShared: false,
		activityLogs: [],
		tasks: [],
		goals: [],
		plans: [],
		milestones: [],
		risks: [],
		documents: [],
		requirements: [],
		edges: [],
		tasksByPlan: new Map(),
		taskDependencies: new Map(),
		goalProgress: new Map(),
		recentUpdates: { tasks: [], goals: [], documents: [] },
		...overrides
	} as OntoProjectWithRelations;
}

describe('generateProjectNextStepsForBrief', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getJSONResponse.mockResolvedValue({
			nextStepShort: 'Do the next useful thing',
			nextStepLong: 'Focus on the highest-leverage next action for this project.'
		});
		const updateQuery = {
			eq: vi.fn().mockReturnThis(),
			in: vi.fn().mockReturnThis(),
			is: vi.fn().mockReturnThis(),
			select: vi.fn().mockReturnThis(),
			maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'project-1' }, error: null })
		};
		mocks.supabaseFrom.mockReturnValue({
			update: vi.fn().mockReturnValue(updateQuery)
		});
	});

	it('caps next-step generation and reports progress for attempted projects', async () => {
		const progress: Array<{ completed: number; total: number; projectId: string }> = [];

		const result = await generateProjectNextStepsForBrief(
			[createProject('1'), createProject('2'), createProject('3')],
			{
				userId: 'user-1',
				briefDate: '2026-05-05',
				timezone: 'America/New_York',
				maxProjects: 2,
				concurrency: 1,
				perProjectTimeoutMs: 1000,
				onProgress: (item) => progress.push(item)
			}
		);

		expect(result.results).toHaveLength(2);
		expect(result.failed).toBe(0);
		expect(result.skipped).toBe(1);
		expect(mocks.getJSONResponse).toHaveBeenCalledTimes(2);
		expect(progress.map((item) => item.completed)).toEqual([1, 2]);
		expect(progress.every((item) => item.total === 2)).toBe(true);
	});

	it('fails a slow project instead of blocking the daily brief', async () => {
		mocks.getJSONResponse.mockImplementationOnce(
			() => new Promise(() => undefined) as Promise<unknown>
		);

		const result = await generateProjectNextStepsForBrief([createProject('1')], {
			userId: 'user-1',
			briefDate: '2026-05-05',
			timezone: 'America/New_York',
			maxProjects: 1,
			concurrency: 1,
			perProjectTimeoutMs: 5
		});

		expect(result.results).toHaveLength(0);
		expect(result.failed).toBe(1);
		expect(result.skipped).toBe(0);
	});

	it('skips paused projects instead of generating next steps', async () => {
		const result = await generateProjectNextStepsForBrief(
			[
				createProject('1', {
					project: { ...createProject('1').project, state_key: 'paused' }
				})
			],
			{
				userId: 'user-1',
				briefDate: '2026-05-05',
				timezone: 'America/New_York',
				maxProjects: 1,
				concurrency: 1,
				perProjectTimeoutMs: 1000
			}
		);

		expect(result.results).toHaveLength(0);
		expect(result.failed).toBe(0);
		expect(result.skipped).toBe(1);
		expect(mocks.getJSONResponse).not.toHaveBeenCalled();
	});
});
