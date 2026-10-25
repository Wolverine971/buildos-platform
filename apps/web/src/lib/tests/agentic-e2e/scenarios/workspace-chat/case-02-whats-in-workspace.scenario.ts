// apps/web/src/lib/tests/agentic-e2e/scenarios/workspace-chat/case-02-whats-in-workspace.scenario.ts
//
// Workspace chat case 2 — "what's in my Workspace?" answers from the real shelf.
// The opening view carries the Workspace shelf (newest loose items with ids); a
// project with its own tasks sits beside it so the answer has to keep them apart.
// Deterministic gates: read-only (no writes, no cards, rows byte-identical). The
// judge, holding the seeded items, scores whether every loose item is named and
// nothing is invented: that is a question about the reply's content, not a keyword.
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
	DESK_NOTE,
	PASSPORT_TASK_TITLE,
	POTTERY_NOTE,
	assertNoCardBypass,
	assertNoNewProjects,
	assertNoWorkspaceCards,
	bakeryProjectName,
	harnessCivilDate,
	readWorkspace,
	seedWorkspaceCase,
	teardownWorkspaceCase,
	workspaceAndProjectFingerprint,
	type WorkspaceSeed
} from './fixture';
import { buildWorkspaceListingRubric } from './rubrics';

const PROJECT_TASKS = [
	{ slug: 'lease', title: 'Sign the bakery lease' },
	{ slug: 'oven', title: 'Order the deck oven' }
] as const;

export const workspaceCase02WhatsInWorkspaceScenario: Scenario = {
	id: 'workspace-02-whats-in-workspace',
	title: 'Workspace 2 — "what\'s in my Workspace?" lists the real loose items',
	category: 'workspace-chat',
	batteryCase: 2,
	seed: async (ctx) => {
		const seed = await seedWorkspaceCase(ctx, {
			projectName: bakeryProjectName(),
			projectTasks: PROJECT_TASKS,
			looseNotes: [
				{ slug: 'pottery', ...POTTERY_NOTE },
				{ slug: 'desk', ...DESK_NOTE }
			],
			looseTasks: [
				{ slug: 'passport', title: PASSPORT_TASK_TITLE, dueDate: harnessCivilDate(5) }
			]
		});
		seed.notes.fingerprintBefore = await workspaceAndProjectFingerprint(ctx, seed);
		return seed;
	},
	teardown: teardownWorkspaceCase,
	turns: [
		{
			label: 'list the Workspace',
			contextType: 'global',
			message: "what's in my Workspace right now?",
			assert: async (turn, ctx, rawSeed) => {
				const seed = rawSeed as WorkspaceSeed;
				assertTurnSucceeded(turn);
				assertNonEmptyAssistantText(turn);
				assertNoMutations(turn, 'listing the Workspace is read-only');
				assertNoCardBypass(turn);
				assertNoWorkspaceCards(turn, 'the user asked what is there, not to file anything');
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
			judge: async (turn, ctx, rawSeed) => {
				const seed = rawSeed as WorkspaceSeed;
				const after = await readWorkspace(ctx, seed.notes.workspaceId);
				return {
					rubric: buildWorkspaceListingRubric({
						looseItems: [
							{ kind: 'note', title: POTTERY_NOTE.title },
							{ kind: 'note', title: DESK_NOTE.title },
							{ kind: 'task', title: PASSPORT_TASK_TITLE, detail: 'due in 5 days' }
						],
						projectName: seed.notes.projectName,
						projectTasks: PROJECT_TASKS.map((task) => task.title)
					}),
					threshold: 3,
					transcript: buildTranscript(turn, {
						workspaceAfterTurn: [
							...after.docs.map((doc) => ({ kind: doc.type_key, title: doc.title })),
							...after.tasks.map((task) => ({ kind: 'task', title: task.title }))
						]
					})
				};
			}
		}
	]
};
