// apps/web/src/lib/tests/agentic-e2e/scenarios/cedar-house/case-13-cold-retrieval.scenario.ts
//
// Cedar House case 13 — retrieve persisted facts in a fresh conversation.
// Audit score: 0/4. After 15 read calls the turn ended with "BuildOS could not
// finish this response", while the browser Tools panel showed the very first
// Audience read had already returned the exact saved text (finding F6).
//
// `coldSession: true` is load-bearing: without it the answer could come from
// conversation history rather than from the saved records the case is about.
// The project is named, not addressed by id — resolving that name is half the
// case — so the fixture name is fixed at module scope and handed to the seed.
import type { Scenario } from '../../harness/types';
import {
	assertNoMutations,
	assertNonEmptyAssistantText,
	assertTurnRunCompleted,
	assertTurnSucceeded
} from '../../harness/assertions';
import { waitForTurnRun } from '../../harness/telemetry';
import {
	CEDAR_BRIEF_AUDIENCE,
	CEDAR_BRIEF_CTA,
	CEDAR_BRIEF_TITLE,
	cedarProjectName,
	seedCedarHouse
} from './fixture';
import {
	assertBudgetCapPresent,
	assertIncludesExactText,
	assertNoCalendarSideEffects,
	assertWorkerLaneOnly,
	requireStreamRunId
} from './guards';

const PROJECT_NAME = cedarProjectName();

export const cedarCase13ColdRetrievalScenario: Scenario = {
	id: 'cedar-13-cold-retrieval',
	title: 'Case 13 — retrieve saved facts verbatim in a fresh chat',
	category: 'cedar-house',
	batteryCase: 13,
	seed: (ctx) =>
		seedCedarHouse(ctx, { tasks: 'core', brief: true, name: PROJECT_NAME, label: 'case-13' }),
	turns: [
		{
			label: 'cold-session fact retrieval',
			contextType: 'project',
			coldSession: true,
			entityIdFromSeed: (seed) => seed.projectId,
			message:
				`Find the project "${PROJECT_NAME}". From saved records, tell me: its budget cap and ` +
				"contingency; how many tasks actually exist; the cabinet task's current due date and " +
				'estimated minutes; and the exact Audience and Call to action text currently saved in ' +
				`"${CEDAR_BRIEF_TITLE}". Give record links. Do not make changes, and do not assume a ` +
				'requested edit was successfully saved.',
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertNonEmptyAssistantText(turn);
				assertNoMutations(turn, 'the prompt said "do not make changes"');
				assertTurnRunCompleted(
					await waitForTurnRun(ctx.db.admin, requireStreamRunId(turn))
				);

				const text = turn.assistantText;
				assertBudgetCapPresent(text, 'the cold-session retrieval answer');
				// The exact quotations are the point: F7 showed the agent inventing
				// audience demographics and a consultation offer no record holds.
				assertIncludesExactText(
					text,
					CEDAR_BRIEF_AUDIENCE,
					'the cold-session retrieval answer (Audience)'
				);
				assertIncludesExactText(
					text,
					CEDAR_BRIEF_CTA,
					'the cold-session retrieval answer (Call to action)'
				);

				await assertNoCalendarSideEffects(
					ctx,
					seed.projectId!,
					'a read-only retrieval must not schedule anything'
				);
				await assertWorkerLaneOnly(turn, ctx);
			}
		}
	]
};
