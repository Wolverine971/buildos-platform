// apps/worker/tests/ontologyBriefGenerator.startHere.test.ts
// The real brief assembly with the database and model mocked: the summary is told the
// same "Start Here" list the brief prints, the day line never says "Clear day" over
// overdue work, and the summary and analysis calls run side by side with their own
// fallbacks.
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OntologyBriefData, ProjectBriefData } from '../src/workers/brief/ontologyBriefTypes';

const mocks = vi.hoisted(() => ({
	from: vi.fn(),
	getJSONResponse: vi.fn(),
	generateText: vi.fn(),
	prepareBriefData: vi.fn()
}));

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
		loadBuilderFollowsBriefSection = async () => null;
		loadOthersActivityBriefSection = async () => null;
		prepareBriefData = mocks.prepareBriefData;
		calculateMetadata = () => ({});
	}
}));

import { generateOntologyDailyBrief } from '../src/workers/brief/ontologyBriefGenerator';

type TextCallOptions = { prompt: string; operationType: string };

/** Nothing dated today; one overdue P1 task, which is the only priority action. */
function createBriefData(): OntologyBriefData {
	const overdueTask = {
		id: 'task-invoice',
		project_id: 'project-1',
		title: 'Send the invoice',
		priority: 1,
		due_at: '2026-11-10T12:00:00.000Z',
		state_key: 'todo'
	};
	const project = {
		project: {
			id: 'project-1',
			name: 'Client Site',
			kind: 'project',
			state_key: 'active',
			created_by: 'actor-1',
			updated_at: '2026-11-10T12:00:00.000Z'
		},
		isShared: false,
		startHere: null,
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
		overdueTasks: [overdueTask],
		thisWeekTasks: [],
		openTaskCount: 1,
		blockedTasks: [],
		unblockingTasks: [],
		recentlyUpdatedTasks: [],
		upcomingTasks: []
	} as unknown as ProjectBriefData;
	const counts = {
		total: 0,
		google: 0,
		internal: 0,
		syncIssue: 0,
		unconfirmedGoogle: 0,
		staleGoogle: 0
	};
	return {
		briefDate: '2026-11-14',
		timezone: 'UTC',
		projects: [project],
		goals: [],
		risks: [],
		requirements: [],
		todaysTasks: [],
		blockedTasks: [],
		overdueTasks: [overdueTask],
		inProgressTasks: [],
		staleInProgressTasks: [],
		highPriorityCount: 1,
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
	} as unknown as OntologyBriefData;
}

describe('daily brief summary, Start Here and day line', () => {
	let savedBriefs: Array<{ executive_summary: string; llm_analysis: string | null }>;
	let consoleSpies: Array<MockInstance<typeof console.error>>;

	beforeEach(() => {
		vi.clearAllMocks();
		savedBriefs = [];
		// The mocked database has no delete/insert, so the follow-up saves log and move on.
		consoleSpies = [
			vi.spyOn(console, 'error').mockImplementation(() => undefined),
			vi.spyOn(console, 'warn').mockImplementation(() => undefined),
			vi.spyOn(console, 'log').mockImplementation(() => undefined)
		];
		mocks.prepareBriefData.mockImplementation(() => createBriefData());
		mocks.getJSONResponse.mockResolvedValue({ briefMarkdown: 'Project brief.' });
		mocks.generateText.mockImplementation(async (options: TextCallOptions) =>
			options.operationType === 'daily_brief_executive_summary'
				? 'Mocked summary.'
				: 'Mocked analysis.'
		);
		mocks.from.mockImplementation((table: string) => {
			let row: Record<string, unknown> = {};
			const query = {
				select: () => query,
				eq: () => query,
				update: (value: Record<string, unknown>) => {
					row = value;
					if (
						table === 'ontology_daily_briefs' &&
						typeof value.executive_summary === 'string'
					)
						savedBriefs.push(value as (typeof savedBriefs)[number]);
					return query;
				},
				upsert: (value: typeof row) => {
					row = value;
					return query;
				},
				maybeSingle: async () => ({ data: null, error: null }),
				single: async () => ({ data: { id: `${table}-1`, ...row }, error: null })
			};
			return query;
		});
	});

	afterEach(() => {
		for (const spy of consoleSpies) spy.mockRestore();
	});

	const textCalls = () => mocks.generateText.mock.calls.map((call) => call[0] as TextCallOptions);

	it('gives the summary the same Start Here list the brief prints', async () => {
		const result = await generateOntologyDailyBrief('user-1', '2026-11-14', undefined, 'UTC');

		expect(result.status).toBe('generated');
		const summaryCall = textCalls().find(
			(call) => call.operationType === 'daily_brief_executive_summary'
		)!;
		expect(summaryCall.prompt).toContain('## Start Here List');
		expect(summaryCall.prompt).toContain('1. Send the invoice\n');
		expect(summaryCall.prompt).toContain(
			'That ONE thing must come from the Start Here List above.'
		);

		const brief = savedBriefs.at(-1)!.executive_summary;
		expect(brief).toContain(
			'## Start Here\n\n- **[Send the invoice](/projects/project-1/tasks/task-invoice)**\n'
		);
		if (result.status === 'generated') {
			expect(result.priorityActions).toEqual(['Send the invoice']);
		}
	});

	it('does not print "Clear day" under a summary about overdue work', async () => {
		await generateOntologyDailyBrief('user-1', '2026-11-14', undefined, 'UTC');

		const brief = savedBriefs.at(-1)!.executive_summary;
		expect(brief).toContain('## Executive Brief\n\nMocked summary.');
		expect(brief).not.toContain('Clear day');
		expect(brief).toContain('📌 **Nothing scheduled today** — overdue work is still open');
	});

	it('starts the summary and the analysis together', async () => {
		const release: Array<(text: string) => void> = [];
		mocks.generateText.mockImplementation(
			() => new Promise<string>((resolve) => release.push(resolve))
		);

		const run = generateOntologyDailyBrief('user-1', '2026-11-14', undefined, 'UTC');

		// Neither call has answered yet. One after the other, this would stay at one call.
		await vi.waitFor(() => expect(mocks.generateText).toHaveBeenCalledTimes(2));
		expect(textCalls().map((call) => call.operationType)).toEqual([
			'daily_brief_executive_summary',
			'daily_brief_analysis'
		]);

		release[0]('Summary text.');
		release[1]('Analysis text.');
		const result = await run;

		expect(result.status).toBe('generated');
		expect(savedBriefs.at(-1)!.executive_summary).toContain('Summary text.');
		expect(savedBriefs.at(-1)!.llm_analysis).toBe('Analysis text.');
	});

	it('keeps the analysis when the summary call fails, and the other way round', async () => {
		mocks.generateText.mockImplementation(async (options: TextCallOptions) => {
			if (options.operationType === 'daily_brief_executive_summary') {
				throw new Error('summary model down');
			}
			return 'Analysis text.';
		});
		await generateOntologyDailyBrief('user-1', '2026-11-14', undefined, 'UTC');

		expect(savedBriefs.at(-1)!.executive_summary).toContain(
			'You have **1 active project** with **0 tasks** starting today.'
		);
		expect(savedBriefs.at(-1)!.llm_analysis).toBe('Analysis text.');

		mocks.generateText.mockImplementation(async (options: TextCallOptions) => {
			if (options.operationType === 'daily_brief_analysis') {
				throw new Error('analysis model down');
			}
			return 'Summary text.';
		});
		await generateOntologyDailyBrief('user-1', '2026-11-14', undefined, 'UTC');

		expect(savedBriefs.at(-1)!.executive_summary).toContain('Summary text.');
		// The analysis fallback is the existing fixed bullet list.
		expect(savedBriefs.at(-1)!.llm_analysis).toContain('tasks are overdue');
	});
});
