// apps/web/src/lib/tests/agentic-e2e/scenarios/read-default-global-status.scenario.ts
//
// Exact replay of the read turn that motivated Tasker 65. This is intentionally
// global and unseeded: it measures the production workspace-status path without
// creating data, and it must never enter a disposition/reviewer write route.
import type { Scenario } from '../harness/types';
import {
	assertNoMutations,
	assertNonEmptyAssistantText,
	assertToolCalled,
	assertTurnRunCompleted,
	assertTurnSucceeded
} from '../harness/assertions';
import { waitForTurnRun } from '../harness/telemetry';

export const readDefaultGlobalStatusScenario: Scenario = {
	id: 'read-default-global-status',
	title: 'Answer the exact global task-status question without write review',
	category: 'project',
	turns: [
		{
			contextType: 'global',
			message: "What's going on with my projects on a task level?",
			assert: async (turn, ctx) => {
				assertTurnSucceeded(turn);
				assertToolCalled(turn, 'get_workspace_overview');
				assertNoMutations(turn, 'a global project/task status question is read-only');
				assertNonEmptyAssistantText(turn, 40);
				assertTurnRunCompleted(await waitForTurnRun(ctx.db.admin, turn.streamRunId!));
			}
		}
	]
};
