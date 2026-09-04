// apps/web/src/lib/tests/agentic-e2e/scenarios/cedar-house/case-03-no-duplicate.scenario.ts
//
// Cedar House case 3 — repeat a task request without creating a duplicate.
// Audit score: 4/4. This is a regression guard for behavior that already works,
// and the cheapest signal in the battery that idempotency did not rot.
import type { Scenario } from '../../harness/types';
import {
	assertNonEmptyAssistantText,
	assertOnlyAllowedRowFieldsChanged,
	assertTurnRunCompleted,
	assertTurnSucceeded
} from '../../harness/assertions';
import { listTasks, waitForTurnRun, type TaskRow } from '../../harness/telemetry';
import { CEDAR_CORE_TASK_SLUGS, CEDAR_TASKS, seedCedarHouse } from './fixture';
import {
	assertNoCalendarSideEffects,
	assertWorkerLaneOnly,
	requireStreamRunId,
	taskByTitle
} from './guards';

const CABINETS = CEDAR_TASKS.cabinets!;

export const cedarCase03NoDuplicateScenario: Scenario = {
	id: 'cedar-03-no-duplicate',
	title: 'Case 3 — repeat a task request without creating a duplicate',
	category: 'cedar-house',
	batteryCase: 3,
	seed: (ctx) => seedCedarHouse(ctx, { tasks: 'core', label: 'case-03' }),
	turns: [
		{
			label: 're-request an existing task',
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			message:
				`Add "${CABINETS.title}" due September 18, 2026, high priority, with "Allow 90 minutes. ` +
				'Depends on QA — Confirm permit requirements." I may have already asked for this: check ' +
				'first, and if it already exists, leave the existing task unchanged and do not make a ' +
				'duplicate.',
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertNonEmptyAssistantText(turn);
				assertTurnRunCompleted(
					await waitForTurnRun(ctx.db.admin, requireStreamRunId(turn))
				);

				const tasks = await listTasks(ctx.db.admin, seed.projectId!);
				if (tasks.length !== CEDAR_CORE_TASK_SLUGS.length) {
					throw new Error(
						`[assert] the project should still hold exactly ${CEDAR_CORE_TASK_SLUGS.length} tasks; ` +
							`found ${tasks.length}: [${tasks.map((task) => task.title).join(', ')}]`
					);
				}
				// Exactly one row with the title, and it is byte-identical to the seed.
				taskByTitle(tasks, CABINETS.title);
				const before = seed.notes.seededTasks as TaskRow[];
				assertOnlyAllowedRowFieldsChanged(before, tasks, {}, 'the Cedar House task list');

				await assertNoCalendarSideEffects(
					ctx,
					seed.projectId!,
					'a de-duplication check must not schedule anything'
				);
				await assertWorkerLaneOnly(turn, ctx);
			}
		}
	]
};
