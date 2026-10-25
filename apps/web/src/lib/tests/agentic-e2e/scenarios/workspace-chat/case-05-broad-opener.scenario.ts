// apps/web/src/lib/tests/agentic-e2e/scenarios/workspace-chat/case-05-broad-opener.scenario.ts
//
// Workspace chat case 5 — a broad opener ("where am I at with things?") answers from
// real context and does not recite a recap of past chats. The seed makes the opening
// view non-trivial: an overdue project task, one due tomorrow, a loose Workspace task
// due today, and a finished earlier Workspace chat on an unrelated topic (garage-sale
// flyer) that the opening view lists under recent conversations.
// Deterministic gates: read-only, no cards, rows byte-identical. The judge, holding
// the seeded facts, scores grounding and the recap rule.
import type { Scenario } from '../../harness/types';
import {
	assertNoMutations,
	assertNonEmptyAssistantText,
	assertRowsUnchanged,
	assertTurnRunCompleted,
	assertTurnSucceeded,
	buildTranscript
} from '../../harness/assertions';
import { waitForTurnRun } from '../../harness/telemetry';
import { assertWorkerLaneOnly, requireStreamRunId } from '../cedar-house/guards';
import {
	PASSPORT_TASK_TITLE,
	POTTERY_NOTE,
	assertNoCardBypass,
	assertNoNewProjects,
	assertNoWorkspaceCards,
	bakeryProjectName,
	harnessCivilDate,
	readableDate,
	seedPriorWorkspaceChat,
	seedWorkspaceCase,
	teardownWorkspaceCase,
	workspaceAndProjectFingerprint,
	type WorkspaceSeed
} from './fixture';
import { buildBroadOpenerRubric } from './rubrics';

const OVERDUE = 'Sign the bakery lease';
const DUE_TOMORROW = 'Order the deck oven';
const UNDATED = 'Draft the opening-week menu';
const PAST_TOPIC = 'wording a garage sale flyer headline';

export const workspaceCase05BroadOpenerScenario: Scenario = {
	id: 'workspace-05-broad-opener',
	title: 'Workspace 5 — a broad opener answers from real context without a recap',
	category: 'workspace-chat',
	batteryCase: 5,
	seed: async (ctx) => {
		const dates = {
			overdue: harnessCivilDate(-2),
			tomorrow: harnessCivilDate(1),
			today: harnessCivilDate(0)
		};
		const seed = await seedWorkspaceCase(ctx, {
			projectName: bakeryProjectName(),
			projectTasks: [
				{ slug: 'lease', title: OVERDUE, dueDate: dates.overdue },
				{ slug: 'oven', title: DUE_TOMORROW, dueDate: dates.tomorrow },
				{ slug: 'menu', title: UNDATED }
			],
			looseNotes: [{ slug: 'pottery', ...POTTERY_NOTE }],
			looseTasks: [{ slug: 'passport', title: PASSPORT_TASK_TITLE, dueDate: dates.today }]
		});
		seed.notes.seededSessionIds.push(
			await seedPriorWorkspaceChat(ctx, {
				userMessage:
					'Can you help me word a headline for a garage sale flyer? Two options is plenty.',
				assistantMessage:
					'Sure. 1) "Everything Must Go: Saturday, 8 to noon" 2) "Big Neighborhood Garage Sale: Bargains Galore"',
				hoursAgo: 20
			})
		);
		seed.notes.dates = dates;
		seed.notes.fingerprintBefore = await workspaceAndProjectFingerprint(ctx, seed);
		return seed;
	},
	teardown: teardownWorkspaceCase,
	turns: [
		{
			label: 'broad opener',
			contextType: 'global',
			message: 'where am I at with things?',
			assert: async (turn, ctx, rawSeed) => {
				const seed = rawSeed as WorkspaceSeed;
				assertTurnSucceeded(turn);
				assertNonEmptyAssistantText(turn);
				assertNoMutations(turn, 'a broad status question is read-only');
				assertNoCardBypass(turn);
				assertNoWorkspaceCards(
					turn,
					'a status question must not change the subject to a card'
				);
				assertTurnRunCompleted(
					await waitForTurnRun(ctx.db.admin, requireStreamRunId(turn))
				);
				assertRowsUnchanged(
					String(seed.notes.fingerprintBefore),
					await workspaceAndProjectFingerprint(ctx, seed),
					'the Workspace and the project'
				);
				await assertNoNewProjects(ctx, seed);
				await assertWorkerLaneOnly(turn, ctx);
			},
			judge: async (turn, _ctx, rawSeed) => {
				const seed = rawSeed as WorkspaceSeed;
				const dates = seed.notes.dates as {
					overdue: string;
					tomorrow: string;
					today: string;
				};
				return {
					rubric: buildBroadOpenerRubric({
						projectName: seed.notes.projectName,
						overdueTask: { title: OVERDUE, due: readableDate(dates.overdue) },
						dueTomorrowTask: { title: DUE_TOMORROW, due: readableDate(dates.tomorrow) },
						undatedTask: UNDATED,
						workspaceTaskDueToday: {
							title: PASSPORT_TASK_TITLE,
							due: readableDate(dates.today)
						},
						workspaceNote: POTTERY_NOTE.title,
						pastConversationTopic: PAST_TOPIC
					}),
					threshold: 3,
					transcript: buildTranscript(turn)
				};
			}
		}
	]
};
