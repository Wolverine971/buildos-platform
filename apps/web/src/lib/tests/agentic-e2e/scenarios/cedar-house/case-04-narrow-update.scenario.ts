// apps/web/src/lib/tests/agentic-e2e/scenarios/cedar-house/case-04-narrow-update.scenario.ts
//
// Cedar House case 4 — change exactly two fields on one task.
// Audit score: 1/4. Three update attempts failed (scope mismatch, then a
// supervisor block, then scope mismatch again); the assistant honestly reported
// that nothing saved. The pass condition is narrow on purpose: the SAME row,
// with only due date and the recorded estimate different.
import type { Scenario } from '../../harness/types';
import {
	assertIsoDate,
	assertOnlyAllowedRowFieldsChanged,
	assertToolCalled,
	assertTurnRunCompleted,
	assertTurnSucceeded
} from '../../harness/assertions';
import { listTasks, waitForTurnRun, type TaskRow } from '../../harness/telemetry';
import { CEDAR_CORE_TASK_SLUGS, CEDAR_TASKS, cedarTaskId, seedCedarHouse } from './fixture';
import {
	assertMinutesRecorded,
	assertNoCalendarSideEffects,
	assertWorkerLaneOnly,
	requireStreamRunId,
	taskByTitle
} from './guards';

const CABINETS = CEDAR_TASKS.cabinets!;
const CORRECTED_DUE_DATE = '2026-09-22';
const CORRECTED_MINUTES = 120;

export const cedarCase04NarrowUpdateScenario: Scenario = {
	id: 'cedar-04-narrow-update',
	title: 'Case 4 — correct one task without touching its other fields',
	category: 'cedar-house',
	batteryCase: 4,
	requiredMutationTools: ['update_onto_task'],
	seed: (ctx) => seedCedarHouse(ctx, { tasks: 'core', label: 'case-04' }),
	turns: [
		{
			label: 'apply a two-field correction',
			contextType: 'project',
			entityIdFromSeed: (seed) => seed.projectId,
			message:
				`Change only the existing "${CABINETS.title}" task: due date September 22, 2026; ` +
				'estimate 120 minutes instead of 90. Keep its exact title, high priority, not-started ' +
				'state, and permit prerequisite unchanged. Do not create another task or a calendar event.',
			assert: async (turn, ctx, seed) => {
				assertTurnSucceeded(turn);
				assertToolCalled(turn, 'update_onto_task');
				assertTurnRunCompleted(
					await waitForTurnRun(ctx.db.admin, requireStreamRunId(turn))
				);

				const tasks = await listTasks(ctx.db.admin, seed.projectId!);
				if (tasks.length !== CEDAR_CORE_TASK_SLUGS.length) {
					throw new Error(
						`[assert] a narrow correction changed the task count to ${tasks.length}: ` +
							`[${tasks.map((task) => task.title).join(', ')}]`
					);
				}

				// Same identity: the corrected row is the row that was seeded.
				const cabinetsId = cedarTaskId(seed, 'cabinets');
				const cabinets = taskByTitle(tasks, CABINETS.title);
				if (cabinets.id !== cabinetsId) {
					throw new Error(
						`[assert] the correction landed on a different row (${cabinets.id}); ` +
							`the seeded cabinet task is ${cabinetsId}`
					);
				}

				assertIsoDate(cabinets.due_at, CORRECTED_DUE_DATE, 'corrected cabinet due');
				assertMinutesRecorded(cabinets, CORRECTED_MINUTES);
				if (/\b90\b/.test(cabinets.description ?? '')) {
					throw new Error(
						`[assert] the cabinet task still records the superseded 90-minute estimate: ` +
							`"${cabinets.description ?? ''}"`
					);
				}
				const prerequisite = CABINETS.prerequisite ?? '';
				if (
					!(cabinets.description ?? '').toLowerCase().includes(prerequisite.toLowerCase())
				) {
					throw new Error(
						`[assert] the correction dropped the "${prerequisite}" prerequisite: ` +
							`"${cabinets.description ?? ''}"`
					);
				}

				// Nothing else moved — on this row or the permit row.
				const before = seed.notes.seededTasks as TaskRow[];
				assertOnlyAllowedRowFieldsChanged(
					before,
					tasks,
					{ [cabinetsId]: ['due_at', 'description', 'updated_at', 'props'] },
					'the Cedar House task list'
				);

				await assertNoCalendarSideEffects(
					ctx,
					seed.projectId!,
					'the prompt said "do not create another task or a calendar event"'
				);
				await assertWorkerLaneOnly(turn, ctx);
			}
		}
	]
};
