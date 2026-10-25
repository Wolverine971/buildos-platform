// apps/web/src/lib/tests/agentic-e2e/scenarios/workspace-chat/case-06-project-chat-stash.scenario.ts
//
// Workspace chat case 6 — a project chat asked to stash something in the Workspace
// saves it there, not in the open project. Project chats carry the Workspace id with
// the rule "save there only what the user says is not for this project" (tasker/146,
// F6). Scored on the write tool and the rows: one new note in the Workspace with the
// user's reference code, the project unchanged, no new project.
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
	assertProjectUntouched,
	assertSingleWorkspaceNote,
	bakeryProjectName,
	seedWorkspaceCase,
	teardownWorkspaceCase,
	type WorkspaceSeed
} from './fixture';

export const CASE_06_SENTINEL = 'DESK-317';

export const workspaceCase06ProjectChatStashScenario: Scenario = {
	id: 'workspace-06-project-chat-stash',
	title: 'Workspace 6 — a project chat stashes a note in the Workspace on request',
	category: 'workspace-chat',
	batteryCase: 6,
	requiredMutationTools: ['create_onto_document'],
	seed: (ctx) =>
		seedWorkspaceCase(ctx, {
			projectName: bakeryProjectName(),
			projectTasks: [{ slug: 'lease', title: 'Sign the bakery lease' }]
		}),
	teardown: teardownWorkspaceCase,
	turns: [
		{
			label: 'stash a note in the Workspace from project chat',
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			message:
				'Not for this project: stash a note in my Workspace to compare standing desks for ' +
				`the home office, budget about $400 (ref ${CASE_06_SENTINEL}).`,
			assert: async (turn, ctx, rawSeed) => {
				const seed = rawSeed as WorkspaceSeed;
				assertTurnSucceeded(turn);
				assertNonEmptyAssistantText(turn, 10);
				assertToolCalled(turn, 'create_onto_document');
				assertNoCardBypass(turn);
				assertTurnRunCompleted(
					await waitForTurnRun(ctx.db.admin, requireStreamRunId(turn))
				);

				await assertSingleWorkspaceNote(ctx, seed, CASE_06_SENTINEL);
				await assertProjectUntouched(ctx, seed, CASE_06_SENTINEL);
				await assertNoNewProjects(ctx, seed);
				await assertWorkerLaneOnly(turn, ctx);
			}
		}
	]
};
