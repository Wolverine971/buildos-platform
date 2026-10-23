// apps/worker/tests/ontologyBriefGenerator.othersActivity.test.ts
// "While you were away" end to end through the real brief assembly, with the database and
// model mocked: it lands above Project Details (the email cuts there), replaces the old
// "Recent Activity" list, and reaches the executive-summary prompt as a short block.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
	OntologyBriefData,
	OthersActivityBriefSection,
	ProjectBriefData
} from '../src/workers/brief/ontologyBriefTypes';

const mocks = vi.hoisted(() => ({
	from: vi.fn(),
	getJSONResponse: vi.fn(),
	generateText: vi.fn(),
	prepareBriefData: vi.fn(),
	loadOthersActivityBriefSection: vi.fn()
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
		loadOthersActivityBriefSection = mocks.loadOthersActivityBriefSection;
		prepareBriefData = mocks.prepareBriefData;
		calculateMetadata = () => ({});
	}
}));

import { generateOntologyDailyBrief } from '../src/workers/brief/ontologyBriefGenerator';

const othersActivity: OthersActivityBriefSection = {
	windowStart: '2026-10-22T07:00:00.000Z',
	windowLabel: 'since your last brief',
	projects: [
		{
			projectId: 'project-1',
			projectName: '9takes',
			isShared: false,
			isWorkspace: false,
			itemCount: 2,
			actors: [
				{
					key: 'person:user-sam',
					kind: 'person',
					label: 'Sam',
					isYourAgent: false,
					isProjectOwner: false,
					counts: { finished: { task: 1 } },
					itemCount: 1,
					items: [
						{
							kind: 'task',
							id: 'task-launch',
							title: 'Draft launch email',
							verb: 'finished',
							changedAt: '2026-10-22T15:00:00.000Z'
						}
					],
					lastChangedAt: '2026-10-22T15:00:00.000Z'
				},
				{
					key: 'agent:caller-codex',
					kind: 'agent',
					label: 'Your Codex',
					isYourAgent: true,
					isProjectOwner: false,
					counts: { updated: { document: 1 } },
					itemCount: 1,
					items: [
						{
							kind: 'document',
							id: 'doc-spec',
							title: 'Spec',
							verb: 'updated',
							changedAt: '2026-10-22T16:00:00.000Z'
						}
					],
					lastChangedAt: '2026-10-22T16:00:00.000Z'
				}
			]
		}
	]
};

function createBriefData(): OntologyBriefData {
	const project = {
		project: {
			id: 'project-1',
			name: '9takes',
			kind: 'project',
			state_key: 'active',
			created_by: 'actor-1',
			updated_at: '2026-10-22T12:00:00.000Z'
		},
		isShared: false,
		startHere: null,
		// Your own edit: the old "Recent Activity" list would have shown it.
		activityLogs: [
			{
				projectId: 'project-1',
				projectName: '9takes',
				isShared: false,
				actorId: 'actor-1',
				actorName: 'DJ',
				action: 'updated',
				entityType: 'task',
				entityId: 'task-mine',
				entityLabel: 'My own edit',
				createdAt: '2026-10-22T14:00:00.000Z'
			}
		],
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
		briefDate: '2026-10-23',
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
		// More than three updates: the old list's threshold.
		recentUpdates: {
			tasks: [1, 2, 3, 4].map((i) => ({ id: `t${i}`, state_key: 'todo' })),
			goals: [],
			documents: []
		} as unknown as OntologyBriefData['recentUpdates'],
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

describe('daily brief "While you were away"', () => {
	let savedSummaries: string[];

	beforeEach(() => {
		vi.clearAllMocks();
		savedSummaries = [];
		mocks.prepareBriefData.mockImplementation(() => createBriefData());
		mocks.generateText.mockResolvedValue('Mocked summary.');
		mocks.getJSONResponse.mockResolvedValue({ briefMarkdown: 'Project brief.' });
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
						savedSummaries.push(value.executive_summary);
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

	it('shows other people and agents above Project Details and drops the old list', async () => {
		mocks.loadOthersActivityBriefSection.mockResolvedValue(othersActivity);

		const result = await generateOntologyDailyBrief('user-1', '2026-10-23', undefined, 'UTC');

		expect(result.status).toBe('generated');
		expect(mocks.loadOthersActivityBriefSection).toHaveBeenCalledWith(
			'user-1',
			[{ tasks: [] }],
			'2026-10-23'
		);
		const brief = savedSummaries.at(-1)!;
		const section = brief.indexOf('## While you were away');
		expect(section).toBeGreaterThan(-1);
		expect(section).toBeLessThan(brief.indexOf('## Project Details'));
		expect(brief).toContain(
			'- **Sam** finished 1 task: ✅ [Draft launch email](/projects/project-1/tasks/task-launch)'
		);
		expect(brief).toContain(
			'- **Your Codex** updated 1 doc: [Spec](/projects/project-1/documents/doc-spec)'
		);
		expect(brief).not.toMatch(/^## Recent Activity/m);

		const summaryPrompt = mocks.generateText.mock.calls[0][0].prompt as string;
		expect(summaryPrompt).toContain(
			'## Changes by Other People and Agents (since your last brief)'
		);
		expect(summaryPrompt).toContain(
			'- 9takes: Sam finished 1 task (Draft launch email); Your Codex updated 1 doc (Spec)'
		);
	});

	it('leaves the section and the prompt block out when nobody else changed anything', async () => {
		mocks.loadOthersActivityBriefSection.mockResolvedValue(null);

		await generateOntologyDailyBrief('user-1', '2026-10-23', undefined, 'UTC');

		const brief = savedSummaries.at(-1)!;
		expect(brief).not.toContain('While you were away');
		expect(brief).not.toMatch(/^## Recent Activity/m);
		const summaryPrompt = mocks.generateText.mock.calls[0][0].prompt as string;
		expect(summaryPrompt).not.toContain('Changes by Other People and Agents');
	});
});
