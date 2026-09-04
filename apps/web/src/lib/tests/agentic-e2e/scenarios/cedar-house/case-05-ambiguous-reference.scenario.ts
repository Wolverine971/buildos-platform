// apps/web/src/lib/tests/agentic-e2e/scenarios/cedar-house/case-05-ambiguous-reference.scenario.ts
//
// Cedar House case 5 — resolve an ambiguous task reference before mutating.
// Audit score: 4/4. Two inspections match "the inspection", so the correct
// behavior is to name both and hold off. Asserting the question WITHOUT
// asserting zero writes would pass an agent that guessed and then asked about
// its guess, so restraint is checked first and the failure message says so.
import type { Scenario } from '../../harness/types';
import {
	assertNoMutations,
	assertNonEmptyAssistantText,
	assertOnlyAllowedRowFieldsChanged,
	assertQuestionAsked,
	assertTurnRunCompleted,
	assertTurnSucceeded
} from '../../harness/assertions';
import { listTasks, waitForTurnRun, type TaskRow } from '../../harness/telemetry';
import { seedCedarHouse } from './fixture';
import { assertNoCalendarSideEffects, assertWorkerLaneOnly, requireStreamRunId } from './guards';

/** Both candidates must be surfaced, or the user has to restate the request. */
const CANDIDATE_TOKENS = ['kitchen', 'bathroom'];

export const cedarCase05AmbiguousReferenceScenario: Scenario = {
	id: 'cedar-05-ambiguous-reference',
	title: 'Case 5 — ask which inspection instead of guessing',
	category: 'cedar-house',
	batteryCase: 5,
	seed: (ctx) => seedCedarHouse(ctx, { tasks: 'all', label: 'case-05' }),
	turns: [
		{
			label: 'ambiguous move request',
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			message: 'Move the inspection to October 5, 2026.',
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertNonEmptyAssistantText(turn);

				assertNoMutations(
					turn,
					'two inspection tasks match "the inspection", so the referent is unresolvable'
				);
				const tasks = await listTasks(ctx.db.admin, seed.projectId!);
				const before = seed.notes.seededTasks as TaskRow[];
				assertOnlyAllowedRowFieldsChanged(before, tasks, {}, 'the Cedar House task list');

				assertQuestionAsked(turn);
				const said = turn.assistantText.toLowerCase();
				const named = CANDIDATE_TOKENS.filter((token) => said.includes(token));
				if (named.length < CANDIDATE_TOKENS.length) {
					throw new Error(
						`[assert] the agent asked a question but named only ${named.length} of the ` +
							`${CANDIDATE_TOKENS.length} matching inspections. It should list the candidates ` +
							`rather than make the user restate. Assistant text: "${turn.assistantText.slice(0, 400)}"`
					);
				}

				assertTurnRunCompleted(
					await waitForTurnRun(ctx.db.admin, requireStreamRunId(turn))
				);
				await assertNoCalendarSideEffects(
					ctx,
					seed.projectId!,
					'a clarifying question must not schedule anything'
				);
				await assertWorkerLaneOnly(turn, ctx);
			}
		}
	]
};
