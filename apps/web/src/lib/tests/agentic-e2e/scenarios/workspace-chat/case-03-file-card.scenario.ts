// apps/web/src/lib/tests/agentic-e2e/scenarios/workspace-chat/case-03-file-card.scenario.ts
//
// Workspace chat case 3 — "file <loose note> into <project>" shows a workspace_file
// card and moves nothing. Standing rule: loose items move only on the user's click
// (propose_workspace_filing → card; never move_* or a write). Scored on the card
// envelope (rail, status, kind, target id, item ids) and on the rows staying put.
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
	BAKERY_PROJECT_LABEL,
	DESK_NOTE,
	FLOUR_NOTE,
	WORKSPACE_FILE_TOOL,
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

export const workspaceCase03FileCardScenario: Scenario = {
	id: 'workspace-03-file-card',
	title: 'Workspace 3 — "file this into <project>" shows a filing card, moves nothing',
	category: 'workspace-chat',
	batteryCase: 3,
	seed: (ctx) =>
		seedWorkspaceCase(ctx, {
			projectName: bakeryProjectName(),
			projectTasks: [{ slug: 'lease', title: 'Sign the bakery lease' }],
			looseNotes: [
				{ slug: 'flour', ...FLOUR_NOTE },
				{ slug: 'desk', ...DESK_NOTE }
			]
		}),
	teardown: teardownWorkspaceCase,
	turns: [
		{
			label: 'ask to file one loose note',
			contextType: 'global',
			message: `File my flour supplier price list note into the ${BAKERY_PROJECT_LABEL} project.`,
			assert: async (turn, ctx, rawSeed) => {
				const seed = rawSeed as WorkspaceSeed;
				assertTurnSucceeded(turn);
				assertToolCalled(turn, WORKSPACE_FILE_TOOL);
				assertNoCardBypass(turn);
				assertNoMutations(turn, 'filing is proposed on a card; only the click moves it');
				assertTurnRunCompleted(
					await waitForTurnRun(ctx.db.admin, requireStreamRunId(turn))
				);

				const cards = await readyCardsForTool(turn, ctx, WORKSPACE_FILE_TOOL);
				const card = cards.at(-1);
				if (!card || card.kind !== 'workspace_file') {
					throw new Error(
						`[assert] expected a ready workspace_file card; ${WORKSPACE_FILE_TOOL} ` +
							`returned: ${describeToolResults(turn, WORKSPACE_FILE_TOOL)}`
					);
				}
				const target = card.payload.target as { id?: string } | undefined;
				if (target?.id?.toLowerCase() !== seed.projectId.toLowerCase()) {
					throw new Error(
						`[assert] the card files into ${target?.id ?? 'nothing'}, not ` +
							`${seed.notes.projectName} (${seed.projectId})`
					);
				}
				const expected = [documentKey(seed.entityIds.flour!)];
				if (JSON.stringify(card.itemKeys) !== JSON.stringify(expected)) {
					throw new Error(
						`[assert] the card must name only the flour note ${JSON.stringify(expected)}; ` +
							`it names ${JSON.stringify(card.itemKeys)}`
					);
				}

				// Nothing moved: the note is still loose, the project gained nothing.
				const flour = await getDocumentById(ctx.db.admin, seed.entityIds.flour!);
				if (flour?.project_id?.toLowerCase() !== seed.notes.workspaceId) {
					throw new Error(
						`[assert] the flour note left the Workspace before any click ` +
							`(project_id=${flour?.project_id ?? 'missing'})`
					);
				}
				await assertProjectUntouched(ctx, seed);
				await assertNoNewProjects(ctx, seed);
				await assertWorkerLaneOnly(turn, ctx);
			}
		}
	]
};
