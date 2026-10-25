// apps/web/src/lib/tests/agentic-e2e/scenarios/workspace-chat/case-01-save-note.scenario.ts
//
// Workspace chat case 1 — "save this as a note" lands in the Workspace.
// Rule (build-lite-prompt global rules): when no project clearly fits, save to the
// Workspace and say so, instead of asking for a project or creating one. The account
// has one unrelated project (Harbor Bakery Launch) so a misfile is possible.
// Scored on the stream's tool calls and the saved rows, never on the reply's wording.
import type { Scenario } from '../../harness/types';
import {
	assertNonEmptyAssistantText,
	assertToolCalled,
	assertTurnRunCompleted,
	assertTurnSucceeded
} from '../../harness/assertions';
import { waitForTurnRun } from '../../harness/telemetry';
import { assertWorkerLaneOnly, requireStreamRunId } from '../cedar-house/guards';
import {
	assertNoCardBypass,
	assertNoNewProjects,
	assertNoWorkspaceCards,
	assertProjectUntouched,
	assertSingleWorkspaceNote,
	bakeryProjectName,
	seedWorkspaceCase,
	teardownWorkspaceCase,
	type WorkspaceSeed
} from './fixture';

export const CASE_01_SENTINEL = 'KILN-482';

export const workspaceCase01SaveNoteScenario: Scenario = {
	id: 'workspace-01-save-note',
	title: 'Workspace 1 — "save this as a note" lands in the Workspace, not a project',
	category: 'workspace-chat',
	batteryCase: 1,
	requiredMutationTools: ['create_onto_document'],
	seed: (ctx) => seedWorkspaceCase(ctx, { projectName: bakeryProjectName() }),
	teardown: teardownWorkspaceCase,
	turns: [
		{
			label: 'save a loose note from Workspace chat',
			contextType: 'global',
			message:
				'save this as a note: weekend pottery class idea, beginners only, 6 seats at $45 ' +
				'each, ask the Elm Street community center about Saturday mornings first ' +
				`(ref ${CASE_01_SENTINEL})`,
			assert: async (turn, ctx, rawSeed) => {
				const seed = rawSeed as WorkspaceSeed;
				assertTurnSucceeded(turn);
				assertNonEmptyAssistantText(turn, 10);
				assertToolCalled(turn, 'create_onto_document');
				assertNoCardBypass(turn);
				assertNoWorkspaceCards(turn, 'a save request needs no card');
				assertTurnRunCompleted(
					await waitForTurnRun(ctx.db.admin, requireStreamRunId(turn))
				);

				await assertSingleWorkspaceNote(ctx, seed, CASE_01_SENTINEL);
				await assertProjectUntouched(ctx, seed, CASE_01_SENTINEL);
				await assertNoNewProjects(ctx, seed);
				await assertWorkerLaneOnly(turn, ctx);
			}
		}
	]
};
