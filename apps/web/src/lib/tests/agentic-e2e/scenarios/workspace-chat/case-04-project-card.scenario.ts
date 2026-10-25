// apps/web/src/lib/tests/agentic-e2e/scenarios/workspace-chat/case-04-project-card.scenario.ts
//
// Workspace chat case 4 — "these notes look like one thing, make them a project"
// shows a workspace_project card and creates nothing. Standing rule: graduating loose
// items into a project is suggestion-only; the agent never calls create_onto_project
// for it. A fourth, unrelated loose note must stay off the card. Scored on the card
// envelope (kind, item ids), the absence of any new project, and the notes staying put.
import type { Scenario } from '../../harness/types';
import {
	assertNoMutations,
	assertToolCalled,
	assertTurnRunCompleted,
	assertTurnSucceeded
} from '../../harness/assertions';
import { getDocumentById, waitForTurnRun } from '../../harness/telemetry';
import { assertWorkerLaneOnly, requireStreamRunId } from '../cedar-house/guards';
import {
	DESK_NOTE,
	GARDEN_NOTES,
	WORKSPACE_PROJECT_TOOL,
	assertNoCardBypass,
	assertNoNewProjects,
	assertProjectUntouched,
	bakeryProjectName,
	describeToolResults,
	documentKey,
	readyCardsForTool,
	seedWorkspaceCase,
	teardownWorkspaceCase,
	type WorkspaceSeed
} from './fixture';

export const workspaceCase04ProjectCardScenario: Scenario = {
	id: 'workspace-04-project-card',
	title: 'Workspace 4 — "make these a project" shows a project card, creates nothing',
	category: 'workspace-chat',
	batteryCase: 4,
	seed: (ctx) =>
		seedWorkspaceCase(ctx, {
			projectName: bakeryProjectName(),
			looseNotes: [...GARDEN_NOTES, { slug: 'desk', ...DESK_NOTE }]
		}),
	teardown: teardownWorkspaceCase,
	turns: [
		{
			label: 'ask to make three loose notes a project',
			contextType: 'global',
			message:
				'These three community garden notes in my Workspace look like one thing. Make them a project.',
			assert: async (turn, ctx, rawSeed) => {
				const seed = rawSeed as WorkspaceSeed;
				assertTurnSucceeded(turn);
				assertToolCalled(turn, WORKSPACE_PROJECT_TOOL);
				assertNoCardBypass(turn);
				assertNoMutations(turn, 'a new project from loose items is proposed on a card');
				assertTurnRunCompleted(
					await waitForTurnRun(ctx.db.admin, requireStreamRunId(turn))
				);

				const cards = await readyCardsForTool(turn, ctx, WORKSPACE_PROJECT_TOOL);
				const card = cards.at(-1);
				if (!card || card.kind !== 'workspace_project') {
					throw new Error(
						`[assert] expected a ready workspace_project card; ${WORKSPACE_PROJECT_TOOL} ` +
							`returned: ${describeToolResults(turn, WORKSPACE_PROJECT_TOOL)}`
					);
				}
				const expected = GARDEN_NOTES.map((note) =>
					documentKey(seed.entityIds[note.slug]!)
				).sort();
				if (JSON.stringify(card.itemKeys) !== JSON.stringify(expected)) {
					throw new Error(
						`[assert] the card must carry exactly the three garden notes ${JSON.stringify(expected)}; ` +
							`it carries ${JSON.stringify(card.itemKeys)} (desk note ${documentKey(seed.entityIds.desk!)})`
					);
				}

				await assertNoNewProjects(ctx, seed);
				for (const note of GARDEN_NOTES) {
					const row = await getDocumentById(ctx.db.admin, seed.entityIds[note.slug]!);
					if (row?.project_id?.toLowerCase() !== seed.notes.workspaceId) {
						throw new Error(
							`[assert] "${note.title}" left the Workspace before any click ` +
								`(project_id=${row?.project_id ?? 'missing'})`
						);
					}
				}
				await assertProjectUntouched(ctx, seed);
				await assertWorkerLaneOnly(turn, ctx);
			}
		}
	]
};
