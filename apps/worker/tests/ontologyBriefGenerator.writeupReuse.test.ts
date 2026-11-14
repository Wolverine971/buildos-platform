// apps/worker/tests/ontologyBriefGenerator.writeupReuse.test.ts
// A project write-up is reused, with no model call and no next-step write, when
// nothing it is written from changed since the last one (projectWriteupReuse.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type {
	GoalProgress,
	OntoProject,
	OntoTask,
	ProjectBriefData
} from '../src/workers/brief/ontologyBriefTypes';

const mocks = vi.hoisted(() => ({
	from: vi.fn(),
	getJSONResponse: vi.fn()
}));

vi.mock('../src/lib/supabase.js', () => ({ supabase: { from: mocks.from } }));
vi.mock('../src/lib/services/smart-llm-service.js', () => ({
	SmartLLMService: class {
		getJSONResponse = mocks.getJSONResponse;
	}
}));

import { generateOntologyProjectBrief } from '../src/workers/brief/ontologyBriefGenerator';
import {
	categorizeTasks,
	getProjectLastChangedAt
} from '../src/workers/brief/ontologyBriefDataLoader';
import { OntologyProjectBriefPrompt } from '../src/workers/brief/ontologyPrompts';
import {
	PROJECT_WRITEUP_REUSE_MAX_DAYS,
	computeProjectWriteupInputHash,
	decideProjectWriteupReuse,
	loadPreviousProjectWriteups,
	readPreviousProjectWriteup,
	type PreviousProjectWriteup
} from '../src/workers/brief/projectWriteupReuse';

const TZ = 'UTC';
const DAY_1 = '2026-11-14';
const DAY_2 = '2026-11-15';

function task(overrides: Partial<OntoTask> & { id: string; title: string }): OntoTask {
	return {
		project_id: 'project-1',
		state_key: 'todo',
		type_key: 'task.execute',
		priority: 3,
		due_at: null,
		start_at: null,
		completed_at: null,
		description: null,
		deleted_at: null,
		archived_at: null,
		created_at: '2026-10-01T09:00:00.000Z',
		updated_at: '2026-10-20T09:00:00.000Z',
		props: {},
		...overrides
	} as OntoTask;
}

/** Nothing here changes between DAY_1 and DAY_2 except what the calendar does. */
function baseTasks(): OntoTask[] {
	return [
		// Due later this week on both days. Updated on Nov 7, so it is in the 7-day
		// "recently updated" list on DAY_1 and has aged out of it by DAY_2.
		task({
			id: 'task-draft',
			title: 'Draft launch email',
			due_at: '2026-11-17T17:00:00.000Z',
			updated_at: '2026-11-07T15:00:00.000Z'
		}),
		// Overdue on both days: the real prompt says "5 days overdue", then "6 days".
		task({ id: 'task-invoice', title: 'Send invoice', due_at: '2026-11-09T17:00:00.000Z' }),
		// A blocker, so the project qualifies for a model write-up.
		task({ id: 'task-api', title: 'Get API key', state_key: 'blocked' })
	];
}

function daysUntil(target: string, from: string): number {
	return Math.round(
		(Date.parse(`${target}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
	);
}

/**
 * Project data the way the loader builds it for `briefDate`, from the real task
 * categorisation and last-change stamp. Call with the system clock on that day.
 */
function buildProject(
	briefDate: string,
	tasks: OntoTask[],
	nextStep: { short: string | null; long: string | null } = { short: null, long: null }
): ProjectBriefData {
	const categorized = categorizeTasks(tasks, briefDate, TZ);
	const recentIds = new Set(categorized.recentlyUpdated.map((t) => t.id));
	const goal: GoalProgress = {
		goal: {
			id: 'goal-1',
			project_id: 'project-1',
			name: 'Ship the beta',
			state_key: 'active'
		} as GoalProgress['goal'],
		totalTasks: 4,
		completedTasks: 1,
		targetDate: '2026-12-10',
		targetDaysAway: daysUntil('2026-12-10', briefDate),
		status: 'on_track',
		contributingTasks: []
	};
	const milestoneDays = daysUntil('2026-12-01', briefDate);

	return {
		project: {
			id: 'project-1',
			name: 'Launch',
			state_key: 'active',
			type_key: 'project.test',
			description: 'Get the beta out',
			next_step_short: nextStep.short,
			next_step_long: nextStep.long,
			next_step_source: nextStep.short ? 'ai' : null,
			next_step_updated_at: null
		} as OntoProject,
		isShared: false,
		activityLogs: [],
		startHere: null,
		recentChanges: categorized.recentlyUpdated.map((t) => ({
			kind: 'task',
			id: t.id,
			title: t.title,
			action: 'updated',
			changedAt: t.updated_at,
			actorName: null,
			source: 'updated_at'
		})),
		goals: [goal],
		plans: [],
		requirements: [],
		documents: [],
		nextSteps: [nextStep.short, nextStep.long].filter((s): s is string => Boolean(s)),
		nextMilestone: `Beta — due Dec 1 (${milestoneDays}d)`,
		nextMilestoneStable: 'Beta — due Dec 1 (upcoming)',
		lastChangedAt: getProjectLastChangedAt({
			tasks,
			goals: [],
			plans: [],
			milestones: [],
			risks: [],
			documents: [],
			requirements: []
		}),
		activePlan: null,
		calendarToday: [],
		calendarUpcoming: [],
		todaysTasks: categorized.todaysTasks,
		overdueTasks: categorized.overdueTasks,
		thisWeekTasks: [...categorized.todaysTasks, ...categorized.upcomingTasks],
		openTaskCount: tasks.filter((t) => t.state_key !== 'done').length,
		blockedTasks: categorized.blockedTasks,
		unblockingTasks: [],
		recentlyUpdatedTasks: categorized.recentlyUpdated,
		upcomingTasks: categorized.upcomingTasks.filter((t) => !recentIds.has(t.id))
	};
}

/** Builds the project as the loader would on `briefDate`, with the clock on that day. */
function projectOn(
	briefDate: string,
	tasks: OntoTask[],
	nextStep?: { short: string | null; long: string | null }
): ProjectBriefData {
	vi.setSystemTime(new Date(`${briefDate}T12:00:00.000Z`));
	return buildProject(briefDate, tasks, nextStep);
}

function hashOn(
	briefDate: string,
	tasks: OntoTask[],
	nextStep?: { short: string | null; long: string | null }
): string {
	return computeProjectWriteupInputHash(projectOn(briefDate, tasks, nextStep), briefDate, TZ);
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.clearAllMocks();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('project write-up input hash', () => {
	it('stays the same across a day rollover when nothing really changed', () => {
		const day1 = projectOn(DAY_1, baseTasks());
		const day2 = projectOn(DAY_2, baseTasks());

		// The real prompts do differ: the date line, "5 days overdue" vs "6 days
		// overdue", the milestone day count, and the shrinking recently-updated list.
		const prompt1 = OntologyProjectBriefPrompt.buildUserPrompt({
			date: DAY_1,
			timezone: TZ,
			project: day1
		});
		const prompt2 = OntologyProjectBriefPrompt.buildUserPrompt({
			date: DAY_2,
			timezone: TZ,
			project: day2
		});
		expect(prompt1).not.toBe(prompt2);
		expect(day1.recentlyUpdatedTasks.map((t) => t.id)).toEqual(['task-draft']);
		expect(day2.recentlyUpdatedTasks).toEqual([]);

		expect(computeProjectWriteupInputHash(day1, DAY_1, TZ)).toBe(
			computeProjectWriteupInputHash(day2, DAY_2, TZ)
		);
	});

	it('changes when a task is added', () => {
		const added = task({
			id: 'task-new',
			title: 'Book the venue',
			created_at: '2026-11-14T20:00:00.000Z',
			updated_at: '2026-11-14T20:00:00.000Z'
		});

		expect(hashOn(DAY_2, [...baseTasks(), added])).not.toBe(hashOn(DAY_1, baseTasks()));
	});

	it('changes when a task is completed', () => {
		const completed = baseTasks().map(
			(t): OntoTask =>
				t.id === 'task-draft'
					? {
							...t,
							state_key: 'done',
							completed_at: '2026-11-14T20:00:00.000Z',
							updated_at: '2026-11-14T20:00:00.000Z'
						}
					: t
		);

		expect(hashOn(DAY_2, completed)).not.toBe(hashOn(DAY_1, baseTasks()));
	});

	it('changes when a task becomes overdue', () => {
		const tasks = [
			...baseTasks(),
			task({ id: 'task-today', title: 'Call Dana', due_at: '2026-11-14T17:00:00.000Z' })
		];

		const day1 = projectOn(DAY_1, tasks);
		const day2 = projectOn(DAY_2, tasks);
		expect(day1.todaysTasks.map((t) => t.id)).toContain('task-today');
		expect(day2.overdueTasks.map((t) => t.id)).toContain('task-today');

		expect(computeProjectWriteupInputHash(day2, DAY_2, TZ)).not.toBe(
			computeProjectWriteupInputHash(day1, DAY_1, TZ)
		);
	});

	it('changes when a task becomes due today', () => {
		const tasks = [
			...baseTasks(),
			task({ id: 'task-tomorrow', title: 'Pay hosting', due_at: '2026-11-15T17:00:00.000Z' })
		];

		expect(hashOn(DAY_2, tasks)).not.toBe(hashOn(DAY_1, tasks));
	});

	it('changes when the next step changes', () => {
		expect(hashOn(DAY_1, baseTasks(), { short: 'Ask Dana for the key', long: null })).not.toBe(
			hashOn(DAY_1, baseTasks())
		);
	});
});

describe('decideProjectWriteupReuse', () => {
	const previous = (overrides: Partial<PreviousProjectWriteup> = {}): PreviousProjectWriteup => ({
		briefDate: '2026-11-13',
		briefContent: '## [Launch](/projects/project-1)\n\nEarlier write-up.',
		inputHash: 'v1:same',
		modelWritten: true,
		writtenForDate: '2026-11-13',
		...overrides
	});

	it('reuses a matching model write-up', () => {
		expect(
			decideProjectWriteupReuse({
				inputHash: 'v1:same',
				briefDate: DAY_1,
				previous: previous()
			})
		).toEqual({
			reuse: true,
			briefContent: previous().briefContent,
			writtenForDate: '2026-11-13'
		});
	});

	it('caps reuse at seven days from when the text was written', () => {
		expect(PROJECT_WRITEUP_REUSE_MAX_DAYS).toBe(7);
		// Written Nov 8: reused through Nov 14 (day 6), rewritten on Nov 15 (day 7),
		// even though the stored row it is reused from is Nov 14's.
		const reusedRow = previous({ briefDate: DAY_1, writtenForDate: '2026-11-08' });
		expect(
			decideProjectWriteupReuse({
				inputHash: 'v1:same',
				briefDate: DAY_1,
				previous: reusedRow
			})
		).toMatchObject({ reuse: true, writtenForDate: '2026-11-08' });
		expect(
			decideProjectWriteupReuse({
				inputHash: 'v1:same',
				briefDate: DAY_2,
				previous: reusedRow
			})
		).toEqual({ reuse: false, reason: 'weekly_refresh' });
	});

	it('writes fresh when inputs changed, nothing was stored, or a template was stored', () => {
		expect(
			decideProjectWriteupReuse({
				inputHash: 'v1:new',
				briefDate: DAY_1,
				previous: previous()
			})
		).toEqual({ reuse: false, reason: 'inputs_changed' });
		expect(
			decideProjectWriteupReuse({ inputHash: 'v1:same', briefDate: DAY_1, previous: null })
		).toEqual({ reuse: false, reason: 'no_previous_writeup' });
		expect(
			decideProjectWriteupReuse({
				inputHash: 'v1:same',
				briefDate: DAY_1,
				previous: previous({ modelWritten: false })
			})
		).toEqual({ reuse: false, reason: 'previous_not_model_written' });
	});
});

describe('readPreviousProjectWriteup', () => {
	it('carries the original write date forward from a reused row', () => {
		expect(
			readPreviousProjectWriteup(
				{
					brief_content: 'Text',
					metadata: {
						generationMode: 'reused',
						writeupReusedFromDate: '2026-11-08',
						inputHash: 'v1:abc'
					}
				},
				'2026-11-13'
			)
		).toEqual({
			briefDate: '2026-11-13',
			briefContent: 'Text',
			inputHash: 'v1:abc',
			modelWritten: true,
			writtenForDate: '2026-11-08'
		});
	});

	it('treats template rows and rows from before the hash existed as not reusable', () => {
		const template = readPreviousProjectWriteup(
			{ brief_content: 'Template', metadata: { generationMode: 'deterministic_fallback' } },
			'2026-11-13'
		);
		expect(template.modelWritten).toBe(false);
		const legacy = readPreviousProjectWriteup(
			{ brief_content: 'Old', metadata: { generationMode: 'llm' } },
			'2026-11-13'
		);
		expect(legacy).toMatchObject({ modelWritten: true, inputHash: null });
		expect(
			decideProjectWriteupReuse({ inputHash: 'v1:x', briefDate: DAY_1, previous: legacy })
		).toEqual({ reuse: false, reason: 'inputs_changed' });
	});
});

describe('loadPreviousProjectWriteups', () => {
	function thenable<T>(result: T, record?: (method: string, args: unknown[]) => void) {
		const builder: Record<string, unknown> = {};
		for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'limit', 'in']) {
			builder[method] = (...args: unknown[]) => {
				record?.(method, args);
				return builder;
			};
		}
		builder.then = (resolve: (value: T) => unknown, reject: (reason: unknown) => unknown) =>
			Promise.resolve(result).then(resolve, reject);
		return builder;
	}

	it('returns each project’s most recent write-up from today’s or the previous brief', async () => {
		const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
		const client = {
			from: (table: string) =>
				thenable(
					table === 'ontology_daily_briefs'
						? {
								data: [
									{ id: 'brief-today', brief_date: DAY_1 },
									{ id: 'brief-yesterday', brief_date: '2026-11-13' }
								],
								error: null
							}
						: {
								data: [
									{
										daily_brief_id: 'brief-yesterday',
										project_id: 'project-1',
										brief_content: 'Yesterday',
										metadata: { generationMode: 'llm', inputHash: 'v1:old' }
									},
									{
										daily_brief_id: 'brief-today',
										project_id: 'project-1',
										brief_content: 'Earlier attempt today',
										metadata: { generationMode: 'llm', inputHash: 'v1:today' }
									},
									{
										daily_brief_id: 'brief-yesterday',
										project_id: 'project-2',
										brief_content: 'Project 2 yesterday',
										metadata: { generationMode: 'llm', inputHash: 'v1:p2' }
									}
								],
								error: null
							},
					(method, args) => calls.push({ table, method, args })
				)
		} as unknown as TypedSupabaseClient;

		const writeups = await loadPreviousProjectWriteups(client, {
			userId: 'user-1',
			projectIds: ['project-1', 'project-2'],
			briefDate: DAY_1
		});

		expect(writeups.get('project-1')).toMatchObject({
			briefDate: DAY_1,
			briefContent: 'Earlier attempt today',
			inputHash: 'v1:today'
		});
		expect(writeups.get('project-2')).toMatchObject({
			briefDate: '2026-11-13',
			inputHash: 'v1:p2'
		});
		// Nothing older than the reuse cap is looked at.
		expect(calls).toContainEqual({
			table: 'ontology_daily_briefs',
			method: 'gte',
			args: ['brief_date', '2026-11-07']
		});
	});

	it('returns no write-ups instead of throwing when the lookup fails', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const client = {
			from: () => thenable({ data: null, error: { message: 'down' } })
		} as unknown as TypedSupabaseClient;

		const writeups = await loadPreviousProjectWriteups(client, {
			userId: 'user-1',
			projectIds: ['project-1'],
			briefDate: DAY_1
		});

		expect(writeups.size).toBe(0);
		warn.mockRestore();
	});
});

describe('generateOntologyProjectBrief with a previous write-up', () => {
	type Write = { table: string; op: 'update' | 'upsert'; value: Record<string, unknown> };
	let writes: Write[];

	beforeEach(() => {
		writes = [];
		mocks.from.mockImplementation((table: string) => {
			let row: Record<string, unknown> = {};
			const query: Record<string, unknown> = {
				select: () => query,
				eq: () => query,
				in: () => query,
				is: () => query,
				update: (value: Record<string, unknown>) => {
					writes.push({ table, op: 'update', value });
					row = value;
					return query;
				},
				upsert: (value: Record<string, unknown>) => {
					writes.push({ table, op: 'upsert', value });
					row = value;
					return query;
				},
				maybeSingle: async () => ({
					data: table === 'onto_projects' ? { id: 'project-1' } : null,
					error: null
				}),
				single: async () => ({ data: { id: `${table}-row`, ...row }, error: null })
			};
			return query;
		});
	});

	const savedWriteup = () => {
		const saved = writes.filter(
			(write) => write.table === 'ontology_project_briefs' && write.op === 'upsert'
		);
		expect(saved).toHaveLength(1);
		return saved[0].value as { brief_content: string; metadata: Record<string, unknown> };
	};
	const nextStepWrites = () => writes.filter((write) => write.table === 'onto_projects');

	it('reuses the write-up with no model call and no next-step write', async () => {
		const inputHash = hashOn(DAY_1, baseTasks());
		const previous: PreviousProjectWriteup = {
			briefDate: DAY_1,
			briefContent: '## [Launch](/projects/project-1)\n\nWritten on Nov 14.',
			inputHash,
			modelWritten: true,
			writtenForDate: DAY_1
		};

		await generateOntologyProjectBrief(
			'daily-brief-2',
			projectOn(DAY_2, baseTasks()),
			TZ,
			'user-1',
			DAY_2,
			undefined,
			previous
		);

		expect(mocks.getJSONResponse).not.toHaveBeenCalled();
		expect(nextStepWrites()).toEqual([]);
		const saved = savedWriteup();
		expect(saved.brief_content).toBe(previous.briefContent);
		expect(saved.metadata).toMatchObject({
			generationMode: 'reused',
			writeupReused: true,
			writeupReusedFromDate: DAY_1,
			writeupReuse: 'reused',
			inputHash,
			llmSkippedReason: 'unchanged_since_last_writeup',
			nextStepPersisted: false
		});
	});

	it('writes fresh once the reused text is seven days old', async () => {
		const project = projectOn(DAY_2, baseTasks());
		const inputHash = computeProjectWriteupInputHash(project, DAY_2, TZ);
		mocks.getJSONResponse.mockResolvedValue({
			briefMarkdown: '## [Launch](/projects/project-1)\n\nFresh.'
		});

		await generateOntologyProjectBrief(
			'daily-brief-2',
			project,
			TZ,
			'user-1',
			DAY_2,
			undefined,
			{
				briefDate: DAY_1,
				briefContent: 'Week-old text',
				inputHash,
				modelWritten: true,
				writtenForDate: '2026-11-08'
			}
		);

		expect(mocks.getJSONResponse).toHaveBeenCalledOnce();
		expect(savedWriteup().metadata).toMatchObject({
			generationMode: 'llm',
			writeupReuse: 'weekly_refresh',
			writeupReused: false
		});
	});

	it('stores the hash tomorrow will compute after saving a new next step', async () => {
		mocks.getJSONResponse.mockResolvedValue({
			briefMarkdown: '## [Launch](/projects/project-1)\n\nFresh.',
			nextStepShort: 'Ask Dana for the API key',
			nextStepLong: 'The key blocks the launch email. Ask Dana today.'
		});

		await generateOntologyProjectBrief(
			'daily-brief-1',
			projectOn(DAY_1, baseTasks()),
			TZ,
			'user-1',
			DAY_1,
			undefined,
			null
		);

		expect(nextStepWrites()).toHaveLength(1);
		expect(nextStepWrites()[0].value).toMatchObject({
			next_step_short: 'Ask Dana for the API key',
			next_step_long: 'The key blocks the launch email. Ask Dana today.'
		});
		const metadata = savedWriteup().metadata;
		expect(metadata).toMatchObject({ writeupReuse: 'no_previous_writeup' });
		// Tomorrow the loader reads the saved step back from the project.
		expect(metadata.inputHash).toBe(
			hashOn(DAY_2, baseTasks(), {
				short: 'Ask Dana for the API key',
				long: 'The key blocks the launch email. Ask Dana today.'
			})
		);
	});

	it('leaves the next step alone when the model returns it unchanged', async () => {
		const current = {
			short: 'Ask Dana for the API key',
			long: 'The key blocks the launch email. Ask Dana today.'
		};
		mocks.getJSONResponse.mockResolvedValue({
			briefMarkdown: '## [Launch](/projects/project-1)\n\nFresh.',
			nextStepShort: current.short,
			nextStepLong: current.long
		});

		await generateOntologyProjectBrief(
			'daily-brief-1',
			projectOn(DAY_1, baseTasks(), current),
			TZ,
			'user-1',
			DAY_1,
			undefined,
			null
		);

		expect(mocks.getJSONResponse).toHaveBeenCalledOnce();
		expect(nextStepWrites()).toEqual([]);
		expect(savedWriteup().metadata).toMatchObject({
			nextStepKept: true,
			nextStepPersisted: false,
			inputHash: hashOn(DAY_1, baseTasks(), current)
		});
	});
});
