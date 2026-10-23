// apps/worker/tests/ontologyBriefGenerator.usage.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSONRequestOptions, JSONUsageEvent } from '@buildos/smart-llm';
import type { OntologyBriefData, ProjectBriefData } from '../src/workers/brief/ontologyBriefTypes';

const mocks = vi.hoisted(() => ({
	from: vi.fn(),
	getJSONResponse: vi.fn(),
	generateText: vi.fn(),
	prepareBriefData: vi.fn()
}));

// Exercise the real brief orchestration while keeping every model/database
// boundary offline. Assertions inspect the metadata actually saved by it.
vi.mock('../src/lib/supabase.js', () => ({ supabase: { from: mocks.from } }));
vi.mock('../src/lib/services/smart-llm-service.js', () => ({
	SmartLLMService: class {
		getJSONResponse = mocks.getJSONResponse;
		generateText = mocks.generateText;
	}
}));
vi.mock('../src/workers/brief/ontologyBriefDataLoader.js', () => ({
	getWorkMode: () => null,
	OntologyBriefDataLoader: class {
		getActorIdForUser = async () => 'actor-1';
		loadUserOntologyData = async () => [{ tasks: [] }];
		loadRecentlyPausedProjects = async () => [];
		loadCalendarBriefData = async () => undefined;
		prepareBriefData = mocks.prepareBriefData;
		calculateMetadata = () => ({});
	}
}));

import { generateOntologyDailyBrief } from '../src/workers/brief/ontologyBriefGenerator';

function createBriefData(): OntologyBriefData {
	const project: ProjectBriefData = {
		project: {
			id: 'project-1',
			name: 'Project 1',
			kind: 'project',
			state_key: 'active',
			type_key: 'project.test',
			description: null,
			next_step_short: null,
			next_step_long: null,
			next_step_source: null,
			next_step_updated_at: null,
			archived_at: null,
			created_at: '2026-10-01T12:00:00.000Z',
			created_by: 'actor-1',
			deleted_at: null,
			doc_structure: null,
			end_at: null,
			external_agent_access: 'private',
			facet_context: null,
			facet_scale: null,
			facet_stage: null,
			icon_concept: null,
			icon_emoji: null,
			icon_generated_at: null,
			icon_generation_prompt: null,
			icon_generation_source: null,
			icon_svg: null,
			is_public: false,
			merged_into_project_id: null,
			org_id: null,
			parent_project_id: null,
			props: {},
			search_vector: null,
			shared_folder_document_id: null,
			start_at: null,
			updated_at: '2026-10-18T12:00:00.000Z'
		},
		isShared: false,
		startHere: null,
		activityLogs: [],
		// Three distinct changes select the LLM using the existing structured policy.
		recentChanges: [1, 2, 3].map((index) => ({
			kind: 'task',
			id: `task-${index}`,
			title: `Task ${index}`,
			action: 'updated',
			changedAt: '2026-10-18T12:00:00.000Z',
			actorName: null,
			source: 'updated_at'
		})),
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
		upcomingTasks: []
	};
	const counts = {
		total: 0,
		google: 0,
		internal: 0,
		syncIssue: 0,
		unconfirmedGoogle: 0,
		staleGoogle: 0
	};
	return {
		briefDate: '2026-10-18',
		timezone: 'UTC',
		projects: [project],
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
		recentlyUpdatedTasks: [],
		upcomingTasks: [],
		calendar: {
			allItems: [],
			today: [],
			upcoming: [],
			todayTotal: 0,
			upcomingTotal: 0,
			hiddenTodayCount: 0,
			hiddenUpcomingCount: 0,
			counts: { today: counts, upcoming: counts, all: counts }
		}
	};
}

function usage(model: string, totalCost: number): JSONUsageEvent {
	return {
		model,
		totalCost,
		inputCost: totalCost,
		outputCost: 0,
		promptTokens: 10,
		completionTokens: 5,
		totalTokens: 15,
		providerRequestId: `generation-${model}`,
		costSource: 'provider_reported',
		billingDisposition: 'settled'
	};
}

describe('project brief billed-attempt accounting', () => {
	let savedProjects: Array<{ metadata: Record<string, unknown>; brief_content: string }>;

	beforeEach(() => {
		vi.clearAllMocks();
		savedProjects = [];
		mocks.prepareBriefData.mockReturnValue(createBriefData());
		mocks.generateText.mockResolvedValue('Mocked summary.');
		mocks.from.mockImplementation((table: string) => {
			let row: Record<string, unknown> = {};
			const query = {
				select: () => query,
				eq: () => query,
				update: (value: Record<string, unknown>) => {
					row = value;
					return query;
				},
				upsert: (value: typeof row) => {
					row = value;
					if (table === 'ontology_project_briefs')
						savedProjects.push(value as (typeof savedProjects)[number]);
					return query;
				},
				maybeSingle: async () => ({ data: null, error: null }),
				single: async () => ({ data: { id: `${table}-1`, ...row }, error: null })
			};
			return query;
		});
	});

	it.each([
		{
			scenario: 'billed malformed response then successful repair',
			costs: [0.002, 0.003],
			fails: false
		},
		{
			scenario: 'two billed failures then a free success',
			costs: [0.002, 0.003, 0],
			fails: false
		},
		{
			scenario: 'billed failures then deterministic fallback',
			costs: [0.002, 0.003],
			fails: true
		}
	])('persists the sum and final model for $scenario', async ({ costs, fails }) => {
		const events = costs.map((cost, index) => usage(`attempt-${index + 1}`, cost));
		mocks.getJSONResponse.mockImplementation(async (options: JSONRequestOptions) => {
			for (const event of events) await options.onUsage?.(event);
			if (fails) throw new Error('No valid JSON after billed attempts');
			return { briefMarkdown: 'Recovered project brief.' };
		});

		const result = await generateOntologyDailyBrief('user-1', '2026-10-18', undefined, 'UTC');

		expect(result.status).toBe('generated');
		expect(mocks.getJSONResponse).toHaveBeenCalledOnce();
		expect(savedProjects).toHaveLength(1);
		expect(savedProjects[0].metadata).toMatchObject({
			generationMode: fails ? 'deterministic_fallback' : 'llm',
			llmModelUsed: events[events.length - 1].model
		});
		expect(savedProjects[0].metadata.llmCost).toBeCloseTo(0.005, 8);
	});

	it('keeps cost and model unknown when no usage callback arrives', async () => {
		mocks.getJSONResponse.mockResolvedValue({ briefMarkdown: 'Project brief without usage.' });
		await generateOntologyDailyBrief('user-1', '2026-10-18', undefined, 'UTC');
		expect(savedProjects).toHaveLength(1);
		expect(savedProjects[0].metadata).toMatchObject({ llmCost: null, llmModelUsed: null });
	});
});
