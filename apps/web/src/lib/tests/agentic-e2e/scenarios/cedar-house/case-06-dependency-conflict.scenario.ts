// apps/web/src/lib/tests/agentic-e2e/scenarios/cedar-house/case-06-dependency-conflict.scenario.ts
//
// Cedar House case 6 — reason about a prerequisite/date conflict without
// silently rescheduling anything.
// Audit score: 3/4 (correct recommendation; sloppy date language and a checked
// status icon for an unfinished task). The graded behavior is: read the stored
// prerequisite, explain the contradiction, write nothing.
import type { Scenario } from '../../harness/types';
import {
	assertNoMutations,
	assertNonEmptyAssistantText,
	assertOnlyAllowedRowFieldsChanged,
	assertTurnRunCompleted,
	assertTurnSucceeded
} from '../../harness/assertions';
import { listTasks, waitForTurnRun, type TaskRow } from '../../harness/telemetry';
import { CEDAR_TASKS, seedCedarHouse } from './fixture';
import { assertNoCalendarSideEffects, assertWorkerLaneOnly, requireStreamRunId } from './guards';

const CABINETS = CEDAR_TASKS.cabinets!;
const PERMIT = CEDAR_TASKS.permit!;

export const cedarCase06DependencyConflictScenario: Scenario = {
	id: 'cedar-06-dependency-conflict',
	title: 'Case 6 — explain a prerequisite/date conflict without editing anything',
	category: 'cedar-house',
	batteryCase: 6,
	seed: (ctx) => seedCedarHouse(ctx, { tasks: 'core', label: 'case-06' }),
	turns: [
		{
			label: 'planning-only conflict question',
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			message:
				`Leave both dates unchanged. Planning question only: could we make "${CABINETS.title}" ` +
				`due September 14, 2026 while keeping its saved prerequisite and the permit task due ` +
				'September 15? Explain the conflict, if any, and recommend the smallest adjustment. ' +
				'Do not edit tasks or create anything.',
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertNonEmptyAssistantText(turn);
				assertNoMutations(turn, 'the prompt is explicitly a planning question only');

				const tasks = await listTasks(ctx.db.admin, seed.projectId!);
				const before = seed.notes.seededTasks as TaskRow[];
				assertOnlyAllowedRowFieldsChanged(before, tasks, {}, 'the Cedar House task list');

				// Grounded in the STORED prerequisite, not a generic scheduling homily.
				const said = turn.assistantText.toLowerCase();
				if (!said.includes('permit')) {
					throw new Error(
						'[assert] the answer never mentions the permit prerequisite that creates the ' +
							`conflict. Assistant text: "${turn.assistantText.slice(0, 400)}"`
					);
				}
				if (!/(conflict|before|prerequisite|depends|after|order)/.test(said)) {
					throw new Error(
						'[assert] the answer never names the ordering problem between the cabinet due ' +
							`date and ${PERMIT.title}. Assistant text: "${turn.assistantText.slice(0, 400)}"`
					);
				}

				assertTurnRunCompleted(
					await waitForTurnRun(ctx.db.admin, requireStreamRunId(turn))
				);
				await assertNoCalendarSideEffects(
					ctx,
					seed.projectId!,
					'a planning question must not schedule anything'
				);
				await assertWorkerLaneOnly(turn, ctx);
			}
		}
	]
};
