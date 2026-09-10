// apps/web/src/lib/tests/agentic-e2e/scenarios/cedar-house/case-11-dst-validation.scenario.ts
import type { Scenario } from '../../harness/types';
import { assertNoMutations, assertTurnSucceeded, buildTranscript } from '../../harness/assertions';
import { seedCedarHouse } from './fixture';
import { assertNoCalendarSideEffects, assertWorkerLaneOnly } from './guards';

export const cedarCase11DstValidationScenario: Scenario = {
	id: 'cedar-11-dst-validation',
	title: 'Case 11 — validate repeated and nonexistent local times',
	category: 'cedar-house',
	batteryCase: 11,
	seed: (ctx) => seedCedarHouse(ctx, { tasks: 'core', label: 'case-11' }),
	turns: [
		{
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			message:
				'Validate these calendar drafts only; do not save anything: A) Cedar House test block November 1, 2026 at 1:30 AM America/New_York for 30 minutes. B) Another test block March 14, 2027 at 2:30 AM America/New_York for 30 minutes. Are these local times unambiguous and valid? State the clarification or correction needed before scheduling, and show UTC equivalents only where the instant is determined.',
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertNoMutations(turn, 'the prompt explicitly forbids changes');
				await assertNoCalendarSideEffects(
					ctx,
					seed.projectId!,
					'draft validation must not schedule'
				);
				await assertWorkerLaneOnly(turn, ctx);
			},
			judge: async (turn) => ({
				threshold: 5,
				rubric: 'Exact independent oracle: November 1, 2026 01:30 America/New_York occurs twice, 05:30Z (EDT UTC-4) and 06:30Z (EST UTC-5). The 01:00 hour repeats, not 02:00. Ask which offset before scheduling. March 14, 2027 02:30 does not exist because 02:00 jumps to 03:00; request a valid replacement. Score 5 only if both cases and the required clarification are correct, no single instant is claimed for an unresolved draft, and no write occurs. Omission of UTC alternatives is acceptable. Any wrong hour, offset, or validity claim scores 1.',
				transcript: buildTranscript(turn)
			})
		}
	]
};
